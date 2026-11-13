/*
 * The SFX volume control (start menu and pause screen): − / slider / + and the percentage.
 * Every copy of the control shows the same value; the setting is remembered in this browser.
 * Changing it plays a short sound at the new level (even while paused) so it can be judged.
 */

/** steps of the − / + buttons and the slider (percent) */
export const VOLUME_STEP = 10;
/** the volume before the player has chosen one (percent) */
export const DEFAULT_VOLUME = 80;
const STORAGE_KEY = 'malfoid.sfxVolume';

/** a stored setting back to a percentage (0..100, whole steps of 1); anything unreadable is the default */
export function parseVolume(stored: string | null): number {
  if (stored === null || stored.trim() === '') return DEFAULT_VOLUME;
  const v = Number(stored);
  return Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) : DEFAULT_VOLUME;
}

/** one − / + press from `v`, kept inside 0..100 and snapped to the step */
export function stepVolume(v: number, dir: 1 | -1): number {
  const n = dir > 0 ? Math.floor(v / VOLUME_STEP) + 1 : Math.ceil(v / VOLUME_STEP) - 1;   // the next step that way
  return Math.min(100, Math.max(0, n * VOLUME_STEP));
}

export interface VolumeTarget {
  readonly muted: boolean;
  setVolume(v: number): void;     // 0..1
  setMuted(on: boolean): void;
  preview(): void;
}

export class VolumeControl {
  private value: number;
  private readonly views: { slider: HTMLInputElement; label: HTMLElement }[] = [];

  constructor(private readonly sfx: VolumeTarget, roots: Iterable<HTMLElement>) {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage blocked: use the default */
    }
    this.value = parseVolume(stored);
    sfx.setVolume(this.value / 100);
    for (const root of roots) this.bind(root);
    this.refresh();
  }

  private bind(root: HTMLElement): void {
    const slider = root.querySelector<HTMLInputElement>('input[type="range"]')!;
    const label = root.querySelector<HTMLElement>('.vol-value')!;
    slider.min = '0';
    slider.max = '100';
    slider.step = String(VOLUME_STEP);
    this.views.push({ slider, label });
    slider.addEventListener('input', () => this.set(Number(slider.value)));
    // hand the keys back to the game (the controller ignores keys aimed at an input)
    slider.addEventListener('change', () => slider.blur());
    slider.addEventListener('pointerup', () => slider.blur());
    for (const b of root.querySelectorAll<HTMLButtonElement>('button[data-vol]')) {
      b.addEventListener('click', () => {
        this.set(stepVolume(this.value, b.dataset.vol === '+' ? 1 : -1));
        b.blur();
      });
    }
    // clicks here are not "click to resume" on the pause screen
    root.addEventListener('click', (e) => e.stopPropagation());
  }

  private set(v: number): void {
    this.value = v;
    if (this.sfx.muted) this.sfx.setMuted(false);     // choosing a volume means wanting sound
    this.sfx.setVolume(v / 100);
    try {
      localStorage.setItem(STORAGE_KEY, String(v));
    } catch {
      /* not remembered: fine */
    }
    this.refresh();
    this.sfx.preview();
  }

  /** redraw every copy (also after M toggles mute) */
  refresh(): void {
    for (const { slider, label } of this.views) {
      slider.value = String(this.value);
      label.textContent = this.sfx.muted ? 'muted' : `${this.value}%`;
    }
  }
}
