import * as THREE from 'three';

/*
 * Protego, the Shield Charm (Cho): she raises her wand and a shield stands before her. A
 * spell that reaches its front is stopped; one that reaches it within the first moments
 * after it went up (a well-timed parry) is sent back at its caster. The shield lasts a short
 * moment, then needs time before it can be raised again, and lowering it leaves her briefly
 * slower to act (an opening). Melee strikes are blocked like a guard (chip damage).
 * Everything runs in game time (update(dt)), so pausing freezes it. All tuning here.
 */
export const PROTEGO = {
  /** s after raising: a spell arriving within this is reflected (the perfect parry) */
  perfectWindow: 0.2,
  /** s the shield stays up at most */
  maxHold: 0.9,
  /** s before it can be raised again, from lowering it */
  cooldown: 5.0,
  /** s after lowering it in which she is slower to act (the AI waits this long) */
  recover: 0.35,
  /** a spell must come at her front: the cosine between its path and her facing is below this */
  frontCos: -0.25,
};

export type ShieldResult = 'reflect' | 'absorb';

/** what the shield needs from its fighter */
export interface Shielded {
  readonly facingAngle: number;
  setHold(name: 'protego', on: boolean): void;
}

export class Protego {
  up = false;
  /** s since it went up (while up) */
  age = 0;
  /** s until it can be raised again */
  cooldownLeft = 0;
  /** s of the recovery after lowering it */
  recoverLeft = 0;
  /** last thing it did, for the visuals: 0..1 flash, and whether it was a parry */
  flash = 0;
  parried = false;
  private readonly f = new THREE.Vector3();

  constructor(private readonly fighter: Shielded) {}

  get ready(): boolean {
    return !this.up && this.cooldownLeft <= 0;
  }

  /** raise the shield (false: still cooling down, or already up) */
  raise(): boolean {
    if (!this.ready) return false;
    this.up = true;
    this.age = 0;
    this.fighter.setHold('protego', true);
    return true;
  }

  lower(): void {
    if (!this.up) return;
    this.up = false;
    this.cooldownLeft = PROTEGO.cooldown;
    this.recoverLeft = PROTEGO.recover;
    this.fighter.setHold('protego', false);
  }

  /** a new fight: down and ready */
  reset(): void {
    if (this.up) this.fighter.setHold('protego', false);
    this.up = false;
    this.age = 0;
    this.cooldownLeft = 0;
    this.recoverLeft = 0;
    this.flash = 0;
  }

  update(dt: number): void {
    if (this.up) {
      this.age += dt;
      if (this.age >= PROTEGO.maxHold) this.lower();
    } else {
      this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
      this.recoverLeft = Math.max(0, this.recoverLeft - dt);
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  /**
   * a spell travelling along dir (unit) reaches her: reflected (a parry inside the perfect
   * window), absorbed, or null (the shield is down or the spell comes from the side / behind)
   */
  intercept(dir: THREE.Vector3): ShieldResult | null {
    if (!this.up) return null;
    const a = this.fighter.facingAngle;
    this.f.set(Math.sin(a), 0, Math.cos(a));
    const flat = Math.hypot(dir.x, dir.z) || 1;
    if ((dir.x * this.f.x + dir.z * this.f.z) / flat > PROTEGO.frontCos) return null;
    const r: ShieldResult = this.age <= PROTEGO.perfectWindow ? 'reflect' : 'absorb';
    this.flash = 1;
    this.parried = r === 'reflect';
    return r;
  }
}
