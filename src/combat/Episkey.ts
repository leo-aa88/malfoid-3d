import type { SpellClip } from './spells/clips';

/*
 * Episkey, the healing charm (Susan's): she touches her wand to her chest and, if nothing
 * hits her for the whole cast, heals. A hit (any hit that gets through: the reaction cuts the
 * clip) interrupts it without using a charge. A few charges per duel, a short wait between
 * casts, no healing beyond full health. Everything runs in game time (update(dt)), so
 * pausing freezes it. Tuning here; the amount healed and the charges are per opponent level.
 */
export const EPISKEY = {
  /** s from the start of the cast to the heal (the episkey clip: combat.EPISKEY_TIME) */
  castTime: 1.5,
  /** s before the next cast, from a heal */
  cooldown: 6.0,
  /** s before the next try, from an interrupted cast */
  retry: 2.0,
};

/** what the charm needs from its fighter */
export interface Healer {
  readonly hasWand: boolean;
  readonly canStrike: boolean;
  readonly currentStrike: string | null;
  castLock: boolean;
  playStrike(clip: SpellClip, startAt?: number, fade?: number): void;
  endStrike(): void;
  resetIdleTimer(): void;
}

/** what it heals */
export interface Healable {
  hp: number;
  readonly maxHp: number;
  /** s since a hit last got through */
  readonly sinceHit: number;
}

export class Episkey {
  casting = false;
  /** s into the current cast */
  t = 0;
  charges: number;
  cooldownLeft = 0;
  onHealed: ((amount: number) => void) | null = null;
  onInterrupted: (() => void) | null = null;

  /** heals `amount` HP per cast, `maxCharges` casts per duel */
  constructor(private readonly fighter: Healer, private readonly target: Healable, public amount = 25, public maxCharges = 2) {
    this.charges = maxCharges;
  }

  /** can she start a cast now (a charge left, waited, wand in hand, free, and hurt)? */
  get ready(): boolean {
    return !this.casting && this.charges > 0 && this.cooldownLeft <= 0 && this.fighter.hasWand && this.fighter.canStrike
      && this.target.hp < this.target.maxHp;
  }

  /** 0..1 through the cast (for the visuals) */
  get progress(): number {
    return this.casting ? Math.min(1, this.t / EPISKEY.castTime) : 0;
  }

  start(): boolean {
    if (!this.ready) return false;
    this.casting = true;
    this.t = 0;
    this.fighter.castLock = true;
    this.fighter.resetIdleTimer();
    this.fighter.playStrike('episkey', 0, 0.15);
    return true;
  }

  /** stop the cast: no heal, the charge kept */
  interrupt(): void {
    if (!this.casting) return;
    this.casting = false;
    this.fighter.castLock = false;
    if (this.fighter.currentStrike === 'episkey') this.fighter.endStrike();
    this.cooldownLeft = EPISKEY.retry;
    this.onInterrupted?.();
  }

  update(dt: number): void {
    if (!this.casting) {
      this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
      return;
    }
    // a hit got through since the cast began, or something else cut the clip (a reaction,
    // losing the wand): interrupted
    if (this.fighter.currentStrike !== 'episkey' || this.target.sinceHit < this.t || !this.fighter.hasWand) {
      this.interrupt();
      return;
    }
    this.t += dt;
    if (this.t < EPISKEY.castTime) return;
    const healed = Math.min(this.amount, this.target.maxHp - this.target.hp);
    this.target.hp += healed;
    this.charges--;
    this.casting = false;
    this.fighter.castLock = false;
    this.fighter.endStrike();
    this.cooldownLeft = EPISKEY.cooldown;
    this.onHealed?.(healed);
  }

  /** a new duel: every charge back, nothing cooling down */
  reset(): void {
    if (this.casting && this.fighter.currentStrike === 'episkey') this.fighter.endStrike();
    if (this.casting) this.fighter.castLock = false;
    this.casting = false;
    this.t = 0;
    this.charges = this.maxCharges;
    this.cooldownLeft = 0;
  }
}
