/*
 * The battle music: an opponent's song starts with DUEL!, loops through the fight and fades out
 * when the winner is announced (each campaign round is a fight of its own). Streamed through
 * <audio> elements: decoding minutes of music up front would take ~80 MB a song. Fades run in
 * game time, so a pause holds them; the game's pause pauses the song.
 */
import type { VolumeTarget } from '../ui/VolumeControl';

export const MUSIC = {
  /** element volume at 100 % on the music slider: the songs are mastered far louder than the
   *  effects (mean about -8 dB against -13..-26 dB), so even full music sits under them */
  gain: 0.3,
  /** s of game time from the winner's announcement to silence */
  fadeOut: 1.0,
  /** public/music/<song>.ogg for an opponent without a song of her own */
  defaultSong: 'battle',
  /** the slider's sample: s of the song, from this point in it (s) */
  previewLength: 1.6,
  previewFrom: 30,
};

/** the part of HTMLAudioElement used here (tests pass fakes) */
export interface Track {
  loop: boolean;
  volume: number;
  currentTime: number;
  preload: string;
  play(): Promise<void> | void;
  pause(): void;
}

export class Music implements VolumeTarget {
  muted = false;
  /** the music slider, 0..1 */
  volume = 0.6;
  private readonly tracks = new Map<string, Track>();
  private current: Track | null = null;
  private song = MUSIC.defaultSong;
  private fade = 1;              // 1 while playing; falls to 0 over a fade-out
  private fadeLength = 0;        // s; 0 when not fading
  private paused = false;
  private sample: Track | null = null;
  private sampleTimer: ReturnType<typeof setTimeout> | null = null;
  private warned = false;

  /**
   * @param base the site's base URL (songs at <base>music/<song>.ogg)
   * @param supported false when the browser can't play Ogg Vorbis: the game runs without music
   */
  constructor(private readonly base: string, private readonly supported = true,
    private readonly make: (url: string) => Track = (url) => new Audio(url)) {}

  /** the song playing (or fading out), else null */
  get playing(): string | null {
    return this.current ? this.song : null;
  }

  /** a duel is about to start: buffer its song so DUEL! doesn't wait for it */
  prepare(song: string): void {
    this.song = song;
    if (this.supported) this.track(song);
  }

  /** DUEL!: the song from its beginning, looping */
  start(song: string): void {
    this.stop(0);
    this.song = song;
    if (!this.supported) return;
    const t = this.track(song);
    t.currentTime = 0;
    this.current = t;
    this.fade = 1;
    this.fadeLength = 0;
    this.apply();
    if (!this.paused) this.resume(t);
  }

  /** the fight is over: fade out over `fade` s of game time (0, or while paused: at once) */
  stop(fade = MUSIC.fadeOut): void {
    if (!this.current) return;
    if (fade <= 0 || this.paused) {
      this.current.pause();
      this.current = null;
      this.fadeLength = 0;
      return;
    }
    // already fading: never slower than the fade under way
    const left = this.fadeLength ? this.fade * this.fadeLength : Infinity;
    if (fade < left) {
      this.fadeLength = fade / this.fade;
    }
  }

  setPaused(on: boolean): void {
    this.paused = on;
    if (!this.current) return;
    if (on) this.current.pause();
    else this.resume(this.current);
  }

  /** game time (call only while the game runs) */
  update(dt: number): void {
    if (!this.current || !this.fadeLength) return;
    this.fade -= dt / this.fadeLength;
    if (this.fade <= 0) this.stop(0);
    else this.apply();
  }

  // --- the music slider (VolumeTarget) ---

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.apply();
  }

  setMuted(on: boolean): void {
    this.muted = on;
    this.apply();
  }

  /** a moment of the coming (or current) song at the new level, on an element of its own */
  preview(): void {
    if (!this.supported) return;
    this.sample ??= this.make(this.url(this.song));
    const s = this.sample;
    s.loop = false;
    s.volume = this.level(1);
    s.currentTime = MUSIC.previewFrom;
    this.resume(s);
    if (this.sampleTimer) clearTimeout(this.sampleTimer);
    this.sampleTimer = setTimeout(() => s.pause(), MUSIC.previewLength * 1000);
  }

  private level(fade: number): number {
    return this.muted ? 0 : Math.min(1, this.volume * MUSIC.gain * Math.max(0, fade));
  }

  private apply(): void {
    if (this.current) this.current.volume = this.level(this.fade);
  }

  private url(song: string): string {
    return `${this.base}music/${song}.ogg`;
  }

  private track(song: string): Track {
    let t = this.tracks.get(song);
    if (!t) {
      t = this.make(this.url(song));
      t.loop = true;
      t.preload = 'auto';
      this.tracks.set(song, t);
    }
    return t;
  }

  private resume(t: Track): void {
    const p = t.play();
    if (p) p.catch((e: unknown) => {
      if (!this.warned) console.warn('music: a song could not play (the game goes on without it)', e);
      this.warned = true;
    });
  }
}
