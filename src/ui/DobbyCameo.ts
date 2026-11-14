/*
 * The Dobby cameo, a classic fighting-game easter egg: now and then, when a duellist is
 * stunned (a stagger: Stupefy, Expelliarmus, a combo's stunning blow), Dobby pops up in the
 * bottom-right corner with a "Toasty!" and is gone again. Rare by design: a small chance per
 * stun and a long cooldown. Timed in game time, so a pause freezes him mid-pop.
 */

export const CAMEO = {
  /** chance (0..1) that a stun brings him on */
  chance: 0.10,
  /** s of game time after an appearance before he can come again */
  cooldown: 60,
  /** s: rising into the corner, staying (the voice says its line meanwhile), dropping away */
  rise: 0.18,
  hold: 0.95,
  drop: 0.22,
  /** how tall he shows (fraction of the window's height) */
  height: 0.3,
  /** the "Toasty!" volume (0..1, before the master volume; not placed in the scene, so at full
   *  gain where the fighters' sounds are ~0.4 from the duel camera's distance) */
  volume: 0.55,
};

export type CameoConfig = typeof CAMEO;

/** when he appears (no DOM: tested in Node) */
export class CameoTrigger {
  private since = Infinity;                   // s since his last appearance

  constructor(private readonly cfg: Pick<CameoConfig, 'chance' | 'cooldown'> = CAMEO, private readonly random: () => number = Math.random) {}

  /** a duellist was stunned: true if he appears now */
  stunned(): boolean {
    if (this.since < this.cfg.cooldown) return false;
    if (this.random() >= this.cfg.chance) return false;
    this.since = 0;
    return true;
  }

  /** game time (call only while the game runs) */
  update(dt: number): void {
    this.since += dt;
  }
}

/** how far up (0 hidden .. 1 fully in the corner) he is t s after appearing; null when done */
export function cameoRise(t: number, cfg: Pick<CameoConfig, 'rise' | 'hold' | 'drop'> = CAMEO): number | null {
  if (t < 0) return null;
  if (t < cfg.rise) {
    const u = t / cfg.rise;
    return 1 - (1 - u) * (1 - u) * (1 - u);                          // quick, easing into place
  }
  if (t < cfg.rise + cfg.hold) return 1;
  const u = (t - cfg.rise - cfg.hold) / cfg.drop;
  return u >= 1 ? null : 1 - u * u;                                  // drops away, quicker at the end
}

/** the picture in the corner */
export class DobbyCameo {
  readonly el: HTMLImageElement;
  private t = -1;

  constructor(parent: Element, src: string, private readonly cfg: CameoConfig = CAMEO) {
    this.el = document.createElement('img');
    this.el.id = 'dobby-cameo';
    this.el.src = src;
    this.el.alt = '';
    this.el.hidden = true;
    this.el.style.height = `${cfg.height * 100}vh`;
    parent.append(this.el);
  }

  get showing(): boolean {
    return this.t >= 0;
  }

  show(): void {
    this.t = 0;
    this.apply();
  }

  hide(): void {
    this.t = -1;
    this.el.hidden = true;
  }

  /** game time: paused, he stays where he is */
  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    this.apply();
  }

  private apply(): void {
    const k = cameoRise(this.t, this.cfg);
    if (k === null) {
      this.hide();
      return;
    }
    this.el.hidden = false;
    // from below the bottom-right corner, up and a little in from the side, as if peeking round it
    this.el.style.transform = `translate(${(1 - k) * 35}%, ${(1 - k) * 100}%) rotate(${(1 - k) * 12 - 6}deg)`;
  }
}
