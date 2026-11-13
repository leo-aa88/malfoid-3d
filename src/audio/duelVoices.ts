import { ENVELOPE_RATE } from './envelope';
import type { SoundHandle, SoundId } from './Sfx';

/*
 * The duel's voice lines: Malfoid's opening line, then Ginny's, before the fight starts, and
 * the winner's line at the end. While a fighter speaks her mouth follows the loudness of her
 * line, read from the playing sound (so it pauses with the game). All tuning is here.
 */

export const VOICE = {
  /** game time (s) from the duel start to Malfoid's opening line */
  introDelay: 0.35,
  /** game time (s) between Malfoid's line ending and Ginny's starting */
  replyGap: 0.25,
  /** game time (s) from the KO to the winner's line (after the hit and the grunt) */
  winDelay: 0.7,
  /** while the files are still loading, wait at most this long (s) before skipping the lines */
  loadWait: 3,
  volume: 0.95,
  /** loudness (envelope, ~0..1) below which the mouth is shut, and the span that opens it fully */
  mouthFloor: 0.14,
  mouthSpan: 0.6,
  /** mouth smoothing (s): opens quickly on a syllable, closes a little slower */
  mouthAttack: 0.025,
  mouthRelease: 0.06,
};

/** what a speaker needs: a mouth */
export interface Speaker {
  setTalk(level: number): void;
}

/** the parts of the sound player the voices use */
export interface VoicePlayer {
  readonly pending: boolean;
  play(id: SoundId, opts: { volume?: number }): SoundHandle | null;
  envelope(id: SoundId): Float32Array | null;
}

interface Line {
  who: Speaker;
  id: SoundId;
  delay: number;   // game time (s) after the previous line ends
}

/** how open the mouth is for a loudness value */
export function mouthOpen(loudness: number): number {
  return Math.min(1, Math.max(0, (loudness - VOICE.mouthFloor) / VOICE.mouthSpan));
}

export class DuelVoices {
  /** the opening lines are over (or were skipped): the fight can start */
  onIntroDone: (() => void) | null = null;
  private queue: Line[] = [];
  private wait = 0;
  private loadWaited = 0;
  private current: { line: Line; handle: SoundHandle; env: Float32Array | null } | null = null;
  private intro = false;
  private readonly mouth = new Map<Speaker, number>();

  constructor(private readonly sfx: VoicePlayer, private readonly malfoid: Speaker, private readonly ginny: Speaker) {}

  /** a duel starts: both opening lines, then onIntroDone */
  startIntro(): void {
    this.stop();
    this.intro = true;
    this.queue = [
      { who: this.malfoid, id: 'malfoidOpening', delay: VOICE.introDelay },
      { who: this.ginny, id: 'ginnyOpening', delay: VOICE.replyGap },
    ];
    this.wait = this.queue[0].delay;
  }

  /** the duel is won: the winner's line (cuts anything still being said) */
  win(winner: Speaker): void {
    this.stop();
    const id: SoundId = winner === this.malfoid ? 'malfoidWin' : 'ginnyWin';
    this.queue = [{ who: winner, id, delay: VOICE.winDelay }];
    this.wait = VOICE.winDelay;
  }

  /** silence (menu, mode change); an intro in progress just ends without onIntroDone */
  stop(): void {
    this.current?.handle.stop();
    this.current = null;
    this.queue = [];
    this.intro = false;
    this.loadWaited = 0;
  }

  /** the opening lines are still playing (or about to) */
  get introRunning(): boolean {
    return this.intro;
  }

  /** who is speaking right now (null: nobody) */
  get speaking(): Speaker | null {
    return this.current?.line.who ?? null;
  }

  /** once per game frame (dt: game time, s) */
  update(dt: number): void {
    if (this.current) {
      const { handle, env, line } = this.current;
      const t = handle.elapsed();
      if (t >= handle.duration) {
        this.current = null;
        this.wait = this.queue[0]?.delay ?? 0;
      } else {
        this.drive(line.who, env ? env[Math.min(env.length - 1, Math.floor(t * ENVELOPE_RATE))] : 0, dt);
      }
    }
    if (!this.current && this.queue.length) {
      this.wait -= dt;
      if (this.wait <= 0) {
        if (this.sfx.pending && this.loadWaited < VOICE.loadWait) {
          this.loadWaited += dt;                     // the very first duel: the files are still decoding
        } else {
          const line = this.queue.shift()!;
          const handle = this.sfx.play(line.id, { volume: VOICE.volume });
          if (handle) this.current = { line, handle, env: this.sfx.envelope(line.id) };
          this.wait = 0;                             // a line that couldn't play: straight on to the next
        }
      }
    }
    if (this.intro && !this.current && !this.queue.length) {
      this.intro = false;
      this.onIntroDone?.();
    }
    // mouths of whoever isn't speaking close
    for (const who of [this.malfoid, this.ginny]) if (who !== this.current?.line.who) this.drive(who, 0, dt);
  }

  private drive(who: Speaker, loudness: number, dt: number): void {
    const goal = mouthOpen(loudness);
    const prev = this.mouth.get(who) ?? 0;
    if (prev === 0 && goal === 0) return;            // shut and staying shut: leave the face alone
    const tau = goal > prev ? VOICE.mouthAttack : VOICE.mouthRelease;
    const v = prev + (goal - prev) * (1 - Math.exp(-dt / tau));
    this.mouth.set(who, v < 1e-3 ? 0 : v);
    who.setTalk(v < 1e-3 ? 0 : v);
  }
}
