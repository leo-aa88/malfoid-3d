import * as THREE from 'three';
import type { Malfoid } from '../character/Malfoid';
import type { ReactionState } from '../character/AnimationController';
import type { CombatTarget, HitBounds, HitReport, HitRequest, Reflector } from './CombatTarget';
import type { Protego } from './Protego';
import type { Projectile } from './spells/Projectile';
import type { SpellDef } from './spells/SpellSystem';
import type { HitEffect } from './moves';

/** fraction of the damage that gets through a block */
const BLOCK_CHIP = 0.2;
/** a fighter's hurt volume */
const RADIUS = 0.2;
const HEIGHT = 1.62;
const AIM_Y = 1.15;
/** slide speed (m/s) of each reaction when the attack doesn't give one */
const PUSH: Record<HitEffect, number> = { flinch: 0.6, stagger: 1.2, knockback: 2.2, knockdown: 2.8 };
const REACTION: Record<HitEffect, ReactionState> = { flinch: 'hit', stagger: 'stagger', knockback: 'knockback', knockdown: 'knockback' };

/**
 * A character as something attacks can hit: health, blocking (the block pose stops high and
 * low strikes, chip damage gets through), hit reactions (flinch, stagger, knockback), a pained
 * face, disarming, and defeat at 0 health.
 */
export class FighterTarget implements CombatTarget {
  hp: number;
  onDefeated: (() => void) | null = null;
  /** a hit got through (not blocked): damage dealt and its effect (sounds, ...) */
  onHurt: ((damage: number, effect: HitEffect) => void) | null = null;
  /** seconds since the last hit (the AI uses it to tell when it is under pressure) */
  sinceHit = 99;
  /** hits taken in the last couple of seconds */
  recentHits = 0;
  /** a blocked strike leaves the attacker open for this much longer (s) */
  readonly blockRecoil = 0.35;
  /** her Protego, if she has one (Cho): spells reaching its front are stopped or reflected */
  shield: Protego | null = null;
  /** her own spell system: a reflected spell becomes hers */
  reflector: Reflector | null = null;
  /** the shield stopped or reflected a spell */
  onShield: ((result: 'reflect' | 'absorb', spell: SpellDef) => void) | null = null;

  constructor(readonly fighter: Malfoid, public maxHp = 100) {
    this.hp = maxHp;
  }

  get name(): string {
    return this.fighter.name;
  }

  get targetable(): boolean {
    return !this.fighter.defeated;
  }

  getBounds(out: HitBounds): HitBounds {
    const p = this.fighter.position;
    out.x = p.x;
    out.z = p.z;
    out.yMin = 0;
    out.yMax = HEIGHT;
    out.radius = RADIUS;
    return out;
  }

  intercept(spell: SpellDef, projectile: Projectile): 'reflect' | 'absorb' | null {
    if (!this.shield || this.fighter.defeated) return null;
    const r = this.shield.intercept(projectile.direction);
    if (r === 'reflect' && !this.reflector) return 'absorb';
    if (r) this.onShield?.(r, spell);
    return r;
  }

  getAimPoint(out: THREE.Vector3): THREE.Vector3 {
    const p = this.fighter.position;
    return out.set(p.x, AIM_Y, p.z);
  }

  takeHit(hit: HitRequest): HitReport {
    if (this.fighter.defeated) return { result: 'immune', damage: 0, ko: false };
    if (this.fighter.blocking) {
      const chip = Math.max(1, Math.round(hit.damage * BLOCK_CHIP));
      this.hp = Math.max(0, this.hp - chip);
      this.fighter.root.position.addScaledVector(hit.dir, 0.06);       // the guard gives a little
      const ko = this.hp === 0;
      if (ko) this.defeat();
      return { result: 'blocked', damage: chip, ko };
    }
    this.hp = Math.max(0, this.hp - hit.damage);
    this.onHurt?.(hit.damage, hit.effect);
    this.recentHits = this.sinceHit < 2.0 ? this.recentHits + 1 : 1;
    this.sinceHit = 0;
    const ko = this.hp === 0;
    if (ko) {
      this.defeat(hit.dir);
    } else {
      const push = hit.dir.clone().setY(0).normalize().multiplyScalar(hit.knockback ?? PUSH[hit.effect]);
      this.fighter.react(REACTION[hit.effect], push);
      this.fighter.setExpression('pain', 0.7);
    }
    return { result: 'hit', damage: hit.damage, ko };
  }

  disarm(dir: THREE.Vector3): boolean {
    if (this.fighter.defeated) return false;
    const ok = this.fighter.disarm(dir);
    if (ok) this.fighter.setExpression('surprised', 1.0);
    return ok;
  }

  update(dt: number): void {
    this.sinceHit += dt;
    if (this.sinceHit > 2.0) this.recentHits = 0;
  }

  /** back to full health and on her feet */
  reset(): void {
    this.hp = this.maxHp;
    this.sinceHit = 99;
    this.recentHits = 0;
    this.fighter.setDefeated(false);
  }

  private defeat(dir?: THREE.Vector3): void {
    this.fighter.setDefeated(true);
    if (dir) this.fighter.root.position.addScaledVector(dir, 0.2);
    this.onDefeated?.();
  }
}
