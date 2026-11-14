/*
 * Episkey, the healing charm (Susan's): instantaneous. She heals the moment she casts it, with
 * no wind-up, nothing to interrupt and no opening: she keeps fighting. What keeps it from being
 * spammed is the wait between casts and a few charges per duel; it never heals past full
 * health. Everything runs in game time (update(dt)), so pausing freezes it. Tuning here; the
 * amount healed and the charges are per opponent level.
 */
export const EPISKEY = {
  /** s before the next cast, from a heal */
  cooldown: 6.0,
};

/** what the charm needs from its fighter */
export interface Healer {
  /** the charm is cast with the wand (disarmed, no healing) */
  readonly hasWand: boolean;
}

/** what it heals */
export interface Healable {
  hp: number;
  readonly maxHp: number;
}

export class Episkey {
  charges: number;
  cooldownLeft = 0;
  onHealed: ((amount: number) => void) | null = null;

  /** heals `amount` HP per cast, `maxCharges` casts per duel */
  constructor(private readonly fighter: Healer, private readonly target: Healable, public amount = 25, public maxCharges = 2) {
    this.charges = maxCharges;
  }

  /** can she heal now (a charge left, waited, wand in hand, and hurt)? */
  get ready(): boolean {
    return this.charges > 0 && this.cooldownLeft <= 0 && this.fighter.hasWand && this.target.hp < this.target.maxHp;
  }

  /** heal now (false: not ready) */
  start(): boolean {
    if (!this.ready) return false;
    const healed = Math.min(this.amount, this.target.maxHp - this.target.hp);
    this.target.hp += healed;
    this.charges--;
    this.cooldownLeft = EPISKEY.cooldown;
    this.onHealed?.(healed);
    return true;
  }

  update(dt: number): void {
    this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
  }

  /** a new duel: every charge back, nothing cooling down */
  reset(): void {
    this.charges = this.maxCharges;
    this.cooldownLeft = 0;
  }
}
