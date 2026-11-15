import * as THREE from 'three';
import { GETUP_SHIFT, type Malfoid } from '../character/Malfoid';
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
/** lying on the floor (Petrificus Totalus): the hurt volume lies along her body behind her feet */
const LYING = { back: 0.75, height: 0.42, radius: 0.38, aimY: 0.22 };
/** while bound, this many hits land (the rest find her immune until she is up): the bind opens
 *  the way to a follow-up, not to a whole barrage */
export const BOUND_HITS = 1;
/**
 * no stun-lock: a reaction that starts while she is still reacting (or within `gap` s of it
 * ending) is chained. The `max`-th in a row knocks her back out of reach instead, and once she is
 * up again she has `armour` s in which hits still hurt but don't stun her: time to block, counter
 * or step away. (Held down, a jab-cross restarted the cross's stagger before it ended: the target
 * never acted again.)
 */
export const CHAIN = { gap: 0.3, max: 3, armour: 0.7 };
/** slide speed (m/s) of each reaction when the attack doesn't give one */
const PUSH: Record<HitEffect, number> = { flinch: 0.6, stagger: 1.2, knockback: 2.2, knockdown: 2.8 };
const REACTION: Record<HitEffect, ReactionState> = { flinch: 'hit', stagger: 'stagger', knockback: 'knockback', knockdown: 'knockback' };

/**
 * Resistance to being thrown about (Susan's Hufflepuff Resolve): what a hit's effect becomes
 * (a stagger only makes her flinch, a knockdown only knocks her back) and how much of its
 * push she takes. Damage is unchanged.
 */
export interface Resolve {
  effect: Partial<Record<HitEffect, HitEffect>>;
  push: number;
}
export const HUFFLEPUFF_RESOLVE: Resolve = { effect: { stagger: 'flinch', knockdown: 'knockback' }, push: 0.6 };

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
  /** a hit she reacts to (not a knockout): the reaction she takes, after her Resolve (Susan's
   *  stagger is a flinch); 'stagger' means stunned */
  onReaction: ((effect: HitEffect) => void) | null = null;
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
  /** her resistance to staggers and knockdowns (Susan), if any */
  resolve: Resolve | null = null;
  /** slowed (Impedimenta): her own time runs at slowFactor for slowLeft more seconds */
  slowLeft = 0;
  slowFactor = 1;
  /** confused (Confundo): her directions are reversed for confusedLeft more seconds */
  confusedLeft = 0;
  /** hits that have landed since she was last bound (Petrificus Totalus) */
  boundHits = 0;
  /** reactions in the current chain, s since her last one ended, and her armour after a chain */
  private chain = 0;
  private sinceReacted = 99;
  private wasReacting = false;
  private armourPending = false;
  armourLeft = 0;

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
    if (this.fighter.lying) {
      const f = this.fighter.facingAngle;
      const back = this.lyingBack();
      out.x = p.x - Math.sin(f) * back;
      out.z = p.z - Math.cos(f) * back;
      out.yMin = 0;
      out.yMax = LYING.height;
      out.radius = LYING.radius;
      return out;
    }
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
    if (this.fighter.lying) {
      const f = this.fighter.facingAngle;
      const back = this.lyingBack();
      return out.set(p.x - Math.sin(f) * back, LYING.aimY, p.z - Math.cos(f) * back);
    }
    return out.set(p.x, AIM_Y, p.z);
  }

  takeHit(hit: HitRequest): HitReport {
    if (this.fighter.defeated) return { result: 'immune', damage: 0, ko: false };
    if (this.fighter.petrified || this.fighter.reacting === 'get_up') {
      // rigid on the floor, or getting up: the first hit lands (no reaction: nothing moves her),
      // the rest don't (the bind opens the way to a follow-up, not a whole barrage)
      if (this.boundHits >= BOUND_HITS) return { result: 'immune', damage: 0, ko: false };
      this.boundHits++;
      this.hp = Math.max(0, this.hp - hit.damage);
      this.onHurt?.(hit.damage, hit.effect);
      this.sinceHit = 0;
      const ko = this.hp === 0;
      if (ko) this.defeat();
      return { result: 'hit', damage: hit.damage, ko };
    }
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
    } else if (this.armourLeft > 0 || this.armourPending) {
      // it hurt, but she isn't stunned (nor is the knockback that broke the chain restarted:
      // hits landing in it kept her down for good)
      this.fighter.setExpression('pain', 0.5);
    } else {
      let effect = this.resolve?.effect[hit.effect] ?? hit.effect;
      let knock = hit.knockback ?? PUSH[hit.effect];
      const chained = this.stunned || this.sinceReacted < CHAIN.gap;
      this.chain = chained ? this.chain + 1 : 1;
      if (this.chain >= CHAIN.max) {
        // the chain is broken: knocked back out of reach, then a moment's armour
        effect = 'knockback';
        knock = Math.max(knock, PUSH.knockback);
        this.chain = 0;
        this.armourPending = true;
      }
      const push = hit.dir.clone().setY(0).normalize().multiplyScalar(knock * (this.resolve?.push ?? 1));
      this.fighter.react(REACTION[effect], push);
      this.fighter.setExpression('pain', 0.7);
      this.onReaction?.(effect);
    }
    return { result: 'hit', damage: hit.damage, ko };
  }

  disarm(dir: THREE.Vector3): boolean {
    if (this.fighter.defeated) return false;
    const ok = this.fighter.disarm(dir);
    if (ok) this.fighter.setExpression('surprised', 1.0);
    return ok;
  }

  /** in a hit reaction (picking her wand up is not one) */
  private get stunned(): boolean {
    const r = this.fighter.reacting;
    return !!r && r !== 'pickup';
  }

  /** how far behind her feet the middle of her lying body is (getting up, her root has moved back) */
  private lyingBack(): number {
    return this.fighter.petrified ? LYING.back : Math.max(0, LYING.back - GETUP_SHIFT);
  }

  /** Petrificus Totalus: she falls rigid and lies bound for `duration` s, then gets up */
  petrify(duration: number): boolean {
    if (this.fighter.defeated) return false;
    const ok = this.fighter.petrify(duration);
    if (ok) {
      this.boundHits = 0;
      this.fighter.setExpression('surprised', duration);
    }
    return ok;
  }

  /** bound (Petrificus Totalus) */
  get petrified(): boolean {
    return this.fighter.petrified;
  }

  /** slowed: her own time runs at `factor` for `duration` s (a new slow replaces a weaker or shorter one) */
  slow(factor: number, duration: number): void {
    if (this.fighter.defeated) return;
    this.slowFactor = this.slowLeft > 0 ? Math.min(this.slowFactor, factor) : factor;
    this.slowLeft = Math.max(this.slowLeft, duration);
  }

  /** confused: her directions reversed for `duration` s (a new one never shortens the current one) */
  confuse(duration: number): void {
    if (this.fighter.defeated) return;
    this.confusedLeft = Math.max(this.confusedLeft, duration);
  }

  get confused(): boolean {
    return this.confusedLeft > 0;
  }

  /** how fast her own time runs now (1: normal; < 1 while slowed) */
  get timeScale(): number {
    return this.slowLeft > 0 ? this.slowFactor : 1;
  }

  update(dt: number): void {
    this.sinceHit += dt;
    if (this.sinceHit > 2.0) this.recentHits = 0;
    if (this.slowLeft > 0) {
      this.slowLeft = Math.max(0, this.slowLeft - dt);
      if (this.slowLeft === 0) this.slowFactor = 1;
    }
    if (this.confusedLeft > 0) this.confusedLeft = Math.max(0, this.confusedLeft - dt);
    // the chain: when her reaction ends, the gap starts; after a broken chain, her armour
    const reacting = this.stunned;
    if (reacting) this.sinceReacted = 0;
    else this.sinceReacted += dt;
    if (this.wasReacting && !reacting && this.armourPending) {
      this.armourPending = false;
      this.armourLeft = CHAIN.armour;
    }
    this.wasReacting = reacting;
    if (this.armourLeft > 0) this.armourLeft = Math.max(0, this.armourLeft - dt);
  }

  /** back to full health and on her feet */
  reset(): void {
    this.hp = this.maxHp;
    this.sinceHit = 99;
    this.recentHits = 0;
    this.slowLeft = 0;
    this.slowFactor = 1;
    this.confusedLeft = 0;
    this.boundHits = 0;
    this.chain = 0;
    this.sinceReacted = 99;
    this.armourPending = false;
    this.armourLeft = 0;
    this.fighter.setDefeated(false);
  }

  private defeat(dir?: THREE.Vector3): void {
    this.fighter.setDefeated(true);
    if (dir) this.fighter.root.position.addScaledVector(dir, 0.2);
    this.onDefeated?.();
  }
}
