/** fade out on start, in ms (matches #title.leaving in main.css) */
const FADE_MS = 400;
// keys that never start the game: modifiers on their own, and browser shortcuts (F5, F12, ...)
const IGNORED = /^(Shift|Control|Alt|Meta|CapsLock|Tab|F\d+)/;

/**
 * The key art over everything from the first paint, while the game loads. Once it is ready, a
 * click or a key opens the mode select behind it. The key that starts the game goes no further
 * (an M would mute, a 0 would cast).
 */
export class TitleScreen {
  /** the player started: a user gesture (audio may start) */
  onStart: (() => void) | null = null;
  private readonly el = document.getElementById('title')!;
  private ready = false;

  constructor() {
    window.addEventListener('keydown', this.onKey, true);
    this.el.addEventListener('pointerdown', () => { if (this.ready) this.start(); });
  }

  /** loading is done: ask for a key */
  setReady(): void {
    this.ready = true;
    this.el.classList.add('ready');
  }

  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.ready || e.repeat || e.ctrlKey || e.metaKey || e.altKey || IGNORED.test(e.code)) return;
    e.stopImmediatePropagation();
    this.start();
  };

  private start(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.ready = false;
    this.el.classList.add('leaving');
    this.onStart?.();
    window.setTimeout(() => (this.el.hidden = true), FADE_MS);
  }
}
