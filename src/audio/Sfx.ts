import * as THREE from 'three';
import { loudnessEnvelope } from './envelope';

/*
 * Sound effects (Web Audio). The files in public/sfx hold several sounds each; every sound is
 * a time slice of its file (measured from the files' waveforms: silence gaps, loudness, low-
 * frequency content). Sounds are placed in the scene: quieter with distance from the camera and
 * panned left / right by where they happen on screen. Missing files just mean silence.
 */

const BASE = import.meta.env.BASE_URL;

type FileId = 'punch_kick' | 'damage' | 'confringo' | 'expelliarmus' | 'protego' | 'walking'
  | 'malfoid_opening' | 'ginny_opening' | 'malfoid_win' | 'ginny_win'
  | 'malfoid_opening2' | 'cho_opening' | 'malfoid_win2' | 'cho_win' | 'stupefy' | 'ventus';
const FILES: FileId[] = ['punch_kick', 'damage', 'confringo', 'expelliarmus', 'protego', 'walking',
  'malfoid_opening', 'ginny_opening', 'malfoid_win', 'ginny_win',
  'malfoid_opening2', 'cho_opening', 'malfoid_win2', 'cho_win', 'stupefy', 'ventus'];
interface Slice {
  file: FileId;
  start: number;   // s
  end: number;     // s
  gain: number;    // evens out the loudness of a bank's slices
}

const slice = (file: FileId, start: number, end: number, gain = 1): Slice => ({ file, start, end, gain });

/** sound banks: one of the slices is picked at random each time */
export const BANKS = {
  // lighter, brighter impacts (less low end): fists
  punch: [slice('punch_kick', 0.41, 0.68), slice('punch_kick', 13.42, 13.80), slice('punch_kick', 16.32, 16.74),
    slice('punch_kick', 18.85, 19.20)],
  // heavier impacts (more low end): kicks and heavy finishers
  kick: [slice('punch_kick', 3.10, 3.47), slice('punch_kick', 5.81, 6.15), slice('punch_kick', 8.17, 8.50),
    slice('punch_kick', 10.62, 10.97)],
  // pained grunts; the first two are deeper and longer (heavy hits)
  gruntHeavy: [slice('damage', 0.63, 0.96), slice('damage', 2.14, 2.40)],
  grunt: [slice('damage', 3.63, 3.84), slice('damage', 5.10, 5.30), slice('damage', 6.49, 6.78), slice('damage', 7.97, 8.33),
    slice('damage', 9.37, 9.69), slice('damage', 10.94, 11.50), slice('damage', 12.43, 12.76), slice('damage', 13.89, 14.07),
    slice('damage', 15.05, 15.33)],
  // the whole spell sounds: Confringo builds over the wind-up, roars through release and blast
  confringo: [slice('confringo', 0.10, 2.40)],
  // Expelliarmus bursts at once: played at the release
  expelliarmus: [slice('expelliarmus', 0.0, 1.62)],
  // Stupefy: a bright crackle (the file's first burst), from the release while the bolt streaks
  // across (raised 1.8x it was too loud in game: now 40 % of that)
  stupefy: [slice('stupefy', 0.08, 1.30, 0.72)],
  // Ventus: a rush of air swelling to a bright gust (loudest ~1.25 s into the file); started
  // 0.55 s in, from the cast's start, its loud part meets the gust leaving the wand
  ventus: [slice('ventus', 0.55, 2.45)],
  // Protego's hum (steady for 2 s, longer than the shield ever stays up): played while it is up
  protego: [slice('protego', 0.0, 99)],
  // single clean footsteps (the file's double scuffs and faint ones left out), levelled to one loudness
  step: [slice('walking', 2.31, 2.59, 1.15), slice('walking', 6.97, 7.17, 0.8), slice('walking', 8.75, 9.02, 0.97),
    slice('walking', 10.52, 10.78, 1.05), slice('walking', 11.465, 11.70, 0.94), slice('walking', 14.135, 14.41, 1.35),
    slice('walking', 16.555, 16.78, 1.13), slice('walking', 18.16, 18.30, 0.66)],
  // voice lines: the whole file (an end past the file's length means "to the end")
  malfoidOpening: [slice('malfoid_opening', 0, 99)],
  ginnyOpening: [slice('ginny_opening', 0, 99)],
  malfoidWin: [slice('malfoid_win', 0, 99)],
  ginnyWin: [slice('ginny_win', 0, 99)],
  // the duel against Cho (she speaks first)
  choOpening: [slice('cho_opening', 0, 99)],
  malfoidOpening2: [slice('malfoid_opening2', 0, 99)],
  malfoidWin2: [slice('malfoid_win2', 0, 99)],
  choWin: [slice('cho_win', 0, 99)],
} as const;
export type SoundId = keyof typeof BANKS;

export interface PlayOptions {
  at?: THREE.Vector3;   // where it happens (distance and stereo position)
  volume?: number;      // 0..1, before the master volume
  rate?: number;        // playback rate (pitch)
}

/** what was played (for tests / debugging) */
export interface SfxLogEntry {
  id: SoundId;
  t: number;
  gain: number;
  rate: number;
  pan: number;
  preview?: boolean;   // played by the volume control while paused
}

/** a playing sound */
export interface SoundHandle {
  /** fade it out now (a cancelled cast) */
  stop(): void;
  /** seconds of the sound played so far (audio time: it stops while the game is paused) */
  elapsed(): number;
  /** its length (s) */
  readonly duration: number;
}

const FADE_IN = 0.004;
const FADE_OUT = 0.03;
/** distance (m) at which a sound has half its volume */
const HALF_DISTANCE = 9;

export class Sfx {
  master = 0.8;
  muted = false;
  readonly log: SfxLogEntry[] = [];
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private readonly buffers = new Map<FileId, AudioBuffer>();
  private readonly last = new Map<SoundId, number>();
  private loading: Promise<void> | null = null;
  private warned = false;
  private paused = false;
  private previewCtx: AudioContext | null = null;
  private readonly envelopes = new Map<SoundId, Float32Array>();
  private previewToken = 0;
  private loadDone = false;
  private readonly v = new THREE.Vector3();

  constructor(private readonly camera: THREE.Camera) {
    // browsers only start audio after a user gesture
    const unlock = () => this.start();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
  }

  /** create / resume the audio context and load the files (safe to call repeatedly) */
  start(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.out = this.ctx.createGain();
      this.out.gain.value = this.muted ? 0 : this.master;
      this.out.connect(this.ctx.destination);
      if (this.paused) void this.ctx.suspend();       // created during a pause (the start menu)
    }
    if (this.ctx.state === 'suspended' && !this.paused) void this.ctx.resume();
    if (!this.loading) this.loading = this.load();
  }

  /** resolves when every file that exists has been decoded */
  ready(): Promise<void> {
    this.start();
    return this.loading ?? Promise.resolve();
  }

  private async load(): Promise<void> {
    await Promise.all(FILES.map(async (f) => {
      try {
        const res = await fetch(`${BASE}sfx/${f}.mp3`);
        if (!res.ok) throw new Error(`${res.status}`);
        this.buffers.set(f, await this.ctx!.decodeAudioData(await res.arrayBuffer()));
      } catch (e) {
        if (!this.warned) console.warn('sfx: some sound files are missing (the game runs silent without them)', e);
        this.warned = true;
      }
    }));
    this.loadDone = true;
  }

  get loaded(): number {
    return this.buffers.size;
  }

  /** the game is paused: silence everything (and resume with the game) */
  setPaused(on: boolean): void {
    this.paused = on;
    if (!this.ctx) return;
    if (on) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  setMuted(on: boolean): void {
    this.muted = on;
    this.applyGain();
  }

  /** the master volume (0..1, the menu / pause screen setting) */
  setVolume(v: number): void {
    this.master = Math.min(1, Math.max(0, v));
    this.applyGain();
  }

  private applyGain(): void {
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.muted ? 0 : this.master, this.ctx.currentTime, 0.02);
  }

  /**
   * a short sample at the current volume (the volume control). While paused the game's audio
   * stays suspended (waking it would replay sounds frozen mid-play), so the sample plays on a
   * small context of its own.
   */
  preview(): void {
    this.start();
    if (this.loading && !this.loadDone) {
      // the first press can come before the files are decoded: play it once they are
      const token = ++this.previewToken;
      void this.loading.then(() => token === this.previewToken && this.preview());
      return;
    }
    if (!this.paused) {
      this.play('punch', { volume: 0.85 });
      return;
    }
    const s = BANKS.punch[0];
    const buffer = this.buffers.get(s.file);
    if (!buffer || this.muted) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.previewCtx ??= new Ctx());
    void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = 0.85 * s.gain * this.master;
    src.connect(g).connect(ctx.destination);
    src.start(ctx.currentTime, s.start, s.end - s.start);
    this.log.push({ id: 'punch', t: +ctx.currentTime.toFixed(3), gain: +g.gain.value.toFixed(3), rate: 1, pan: 0, preview: true });
  }


  /** play a random sound of a bank; returns a handle to stop it early (a cancelled cast) */
  play(id: SoundId, opts: PlayOptions = {}): SoundHandle | null {
    if (!this.ctx || !this.out) return null;
    const bank = BANKS[id];
    // random, but never the same slice twice in a row (repeated footsteps sound mechanical)
    let i = Math.floor(Math.random() * bank.length);
    if (bank.length > 1 && i === this.last.get(id)) i = (i + 1 + Math.floor(Math.random() * (bank.length - 1))) % bank.length;
    this.last.set(id, i);
    const s = bank[i];
    const buffer = this.buffers.get(s.file);
    if (!buffer) return null;
    const ctx = this.ctx;
    let gain = (opts.volume ?? 1) * s.gain;
    let pan = 0;
    if (opts.at) {
      // quieter with distance from the camera, panned by where it is on screen
      const d = this.v.copy(opts.at).sub(this.camera.position).length();
      gain *= HALF_DISTANCE / (HALF_DISTANCE + d);
      const p = this.v.copy(opts.at).project(this.camera);
      pan = THREE.MathUtils.clamp(p.x * 0.7, -0.8, 0.8);
    }
    const rate = opts.rate ?? 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    const len = Math.min(s.end, buffer.duration) - s.start;
    const dur = len / rate;
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + FADE_IN);
    g.gain.setValueAtTime(gain, t0 + Math.max(FADE_IN, dur - FADE_OUT));
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    let node: AudioNode = g;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      node = p;
    }
    src.connect(g);
    node.connect(this.out);
    src.start(t0, s.start, len);
    this.log.push({ id, t: +t0.toFixed(3), gain: +gain.toFixed(3), rate, pan: +pan.toFixed(2) });
    if (this.log.length > 200) this.log.shift();
    return {
      stop: () => {
        const now = ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setTargetAtTime(0, now, 0.03);
        src.stop(now + 0.15);
      },
      elapsed: () => Math.max(0, ctx.currentTime - t0) * rate,
      duration: len,
    };
  }

  /** the files are still being fetched / decoded */
  get pending(): boolean {
    return !!this.loading && !this.loadDone;
  }

  /**
   * the loudness of a one-slice sound over time (ENVELOPE_RATE values a second, 0..1,
   * normalised so its loud syllables reach about 1): what drives a speaker's mouth.
   * null until the file is loaded.
   */
  envelope(id: SoundId): Float32Array | null {
    const cached = this.envelopes.get(id);
    if (cached) return cached;
    const s = BANKS[id][0];
    const buffer = this.buffers.get(s.file);
    if (!buffer) return null;
    const env = loudnessEnvelope(buffer, s.start, Math.min(s.end, buffer.duration));
    this.envelopes.set(id, env);
    return env;
  }
}

