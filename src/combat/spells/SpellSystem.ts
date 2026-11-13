import * as THREE from 'three';
import type { CombatTarget, HitReport } from '../CombatTarget';
import type { Height, HitEffect } from '../moves';
import type { SpellClip } from './clips';
import { distanceToBounds, splashDamage, sweepBox } from './collision';
import type { SpellEmitter } from './SpellEmitter';
import { CollisionWorld, Impact, Projectile, ProjectileSpec } from './Projectile';

/** everything that defines one projectile spell (see Confringo.ts) */
export interface SpellDef {
  id: string;
  name: string;
  /** key shown in the HUD */
  key: string;
  clip: SpellClip;
  castDuration: number;       // s, the whole clip
  release: number;            // s into the cast: the projectile leaves
  cooldown: number;           // s, from the release
  projectile: ProjectileSpec;
  directDamage: number;
  splashDamage: number;       // at the centre of the blast, falling off to its edge
  explosionRadius: number;    // m
  directKnockback: number;    // m/s slide given to the target
  splashKnockback: number;    // m/s at the centre of the blast
  /** turn towards a target within this angle when the cast starts (rad, either side) */
  faceAngle: number;
  /** aim assist at the release: targets within this angle of her facing (rad) and range (m) */
  aimAngle: number;
  aimRange: number;
  /** reaction of a directly hit target ('knockback' by default) */
  hitEffect?: HitEffect;
  /** a direct hit knocks the target's wand away (Expelliarmus) */
  disarms?: boolean;
}

/** the caster as the spell system sees it (Malfoid) */
export interface Caster {
  readonly position: THREE.Vector3;
  readonly facingAngle: number;
  /** free to start an attack (not jumping, crouching, blocking, already casting) */
  readonly canStrike: boolean;
  /** has a wand to cast with (true if omitted) */
  readonly hasWand?: boolean;
  /** set while a spell is being cast, until its release: no melee meanwhile */
  castLock: boolean;
  readonly currentStrike: string | null;
  playStrike(clip: SpellClip, startAt?: number, fade?: number): void;
  endStrike(): void;
  faceToward(angle: number): void;
  resetIdleTimer(): void;
}

/** visual (and audio) side of spells; NO_FX does nothing (logic tests) */
export interface SpellFx {
  castStart(def: SpellDef, emitter: SpellEmitter): void;
  /** every frame of the cast until the release; charge 0..1 */
  castUpdate(def: SpellDef, emitter: SpellEmitter, charge: number): void;
  castEnd(def: SpellDef, released: boolean): void;
  projectileStart(def: SpellDef, p: Projectile): void;
  projectileUpdate(def: SpellDef, p: Projectile): void;
  projectileEnd(def: SpellDef, p: Projectile, impact: Impact): void;
  update(dt: number): void;
}

export const NO_FX: SpellFx = {
  castStart() {}, castUpdate() {}, castEnd() {}, projectileStart() {}, projectileUpdate() {},
  projectileEnd() {}, update() {},
};

export type SpellSound = 'charge' | 'launch' | 'impact' | 'decay';

export type SpellEvent =
  | { type: 'cast'; spell: SpellDef }
  | { type: 'release'; spell: SpellDef }
  | { type: 'cancel'; spell: SpellDef }
  | { type: 'impact'; spell: SpellDef; kind: Impact['kind']; at: THREE.Vector3 }
  | { type: 'hit'; spell: SpellDef; target: CombatTarget; direct: boolean; report: HitReport; at: THREE.Vector3; disarmed?: boolean };

interface Casting {
  def: SpellDef;
  t: number;
  released: boolean;
}

interface Flying {
  def: SpellDef;
  projectile: Projectile;
}

/**
 * Casting, cooldowns, projectiles and damage for projectile spells.
 *
 * - cast(def): starts the cast clip if she is free, no melee strike is running, nothing is
 *   being cast and the spell is off cooldown. Otherwise the press is ignored (no buffering).
 * - At def.release the projectile leaves the emitter (her wand tip) and the cooldown starts; a
 *   cast cancelled before that costs no cooldown. Melee is locked until the release.
 * - Cooldowns and flight run on update(dt) only (game time): pausing the game pauses them.
 * - On impact: a target hit directly takes the direct damage and knockback; every other
 *   target in the blast takes splash damage falling off with distance; one explosion damages
 *   a target at most once. Ground, solids and max range end the projectile too.
 */
export class SpellSystem {
  readonly world: { targets: CombatTarget[]; solids: THREE.Box3[]; groundY: number };
  onEvent: ((e: SpellEvent) => void) | null = null;
  onSound: ((s: SpellSound, at: THREE.Vector3) => void) | null = null;

  private casting: Casting | null = null;
  private readonly flying: Flying[] = [];
  private readonly cooldowns = new Map<string, number>();
  private readonly v = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly bounds = { x: 0, z: 0, yMin: 0, yMax: 0, radius: 0 };

  constructor(
    private readonly caster: Caster,
    private readonly emitter: SpellEmitter,
    private readonly meleeBusy: () => boolean,
    private readonly fx: SpellFx = NO_FX,
    world?: Partial<CollisionWorld>,
  ) {
    this.world = { targets: [...(world?.targets ?? [])], solids: [...(world?.solids ?? [])], groundY: world?.groundY ?? 0 };
  }

  /** seconds left before the spell can be cast again (0 = ready) */
  cooldownLeft(def: SpellDef): number {
    return this.cooldowns.get(def.id) ?? 0;
  }

  get isCasting(): boolean {
    return this.casting !== null;
  }

  /** the spell being cast (null when not casting) */
  get castingSpell(): SpellDef | null {
    return this.casting ? this.casting.def : null;
  }

  /** seconds into the current cast (-1 when not casting) */
  get castTime(): number {
    return this.casting ? this.casting.t : -1;
  }

  get projectiles(): readonly Projectile[] {
    return this.flying.map((f) => f.projectile);
  }

  canCast(def: SpellDef): boolean {
    return !this.casting && this.cooldownLeft(def) <= 0 && this.caster.canStrike && this.caster.hasWand !== false
      && !this.meleeBusy();
  }

  /** returns true if the cast started */
  cast(def: SpellDef): boolean {
    if (!this.canCast(def)) return false;
    this.caster.resetIdleTimer();
    this.casting = { def, t: 0, released: false };
    this.caster.castLock = true;
    this.caster.playStrike(def.clip, 0, 0.1);
    const target = this.pickTarget(def, def.faceAngle);
    if (target) {
      target.getAimPoint(this.v);
      this.caster.faceToward(Math.atan2(this.v.x - this.caster.position.x, this.v.z - this.caster.position.z));
    }
    this.fx.castStart(def, this.emitter);
    this.onSound?.('charge', this.emitter.getWorldPosition(this.v));
    this.emit({ type: 'cast', spell: def });
    return true;
  }

  /** stop a cast before its release: no projectile, no cooldown */
  cancel(): void {
    const c = this.casting;
    if (!c || c.released) return;
    this.casting = null;
    this.caster.castLock = false;
    if (this.caster.currentStrike === c.def.clip) this.caster.endStrike();
    this.fx.castEnd(c.def, false);
    this.emit({ type: 'cancel', spell: c.def });
  }

  /** a new training session / match: no cooldowns, nothing in flight */
  reset(): void {
    this.cancel();
    if (this.casting) {                                         // released, still in its recovery
      if (this.caster.currentStrike === this.casting.def.clip) this.caster.endStrike();
      this.casting = null;
    }
    this.cooldowns.clear();
    for (const f of this.flying) {
      f.projectile.alive = false;
      this.fx.projectileEnd(f.def, f.projectile, { kind: 'range', point: f.projectile.position.clone(), target: null });
    }
    this.flying.length = 0;
  }

  update(dt: number): void {
    for (const [id, left] of this.cooldowns) {
      const l = left - dt;
      if (l <= 0) this.cooldowns.delete(id);
      else this.cooldowns.set(id, l);
    }
    this.updateCast(dt);
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      const impact = f.projectile.step(dt, this.world);
      if (impact) {
        this.flying.splice(i, 1);
        this.fx.projectileEnd(f.def, f.projectile, impact);
        this.resolve(f.def, f.projectile, impact);
      } else {
        this.fx.projectileUpdate(f.def, f.projectile);
      }
    }
    this.fx.update(dt);
  }

  private updateCast(dt: number): void {
    const c = this.casting;
    if (!c) return;
    // a melee strike took over after the release (melee is locked before it)
    if (this.caster.currentStrike !== c.def.clip) {
      if (!c.released) {
        this.cancel();
      } else {
        this.casting = null;
      }
      return;
    }
    c.t += dt;
    if (!c.released) {
      this.fx.castUpdate(c.def, this.emitter, Math.min(1, c.t / c.def.release));
      if (c.t >= c.def.release) this.release(c);
    }
    if (c.t >= c.def.castDuration) {
      this.casting = null;
      this.caster.endStrike();
    }
  }

  private release(c: Casting): void {
    c.released = true;
    this.caster.castLock = false;
    const def = c.def;
    const origin = this.emitter.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3();
    const target = this.pickTarget(def, def.aimAngle);
    if (target) {
      dir.subVectors(target.getAimPoint(this.v), origin);       // aim assist: at the torso
    } else {
      const f = this.caster.facingAngle;                        // straight ahead
      dir.set(Math.sin(f), 0, Math.cos(f));
    }
    const p = new Projectile(def.projectile, origin, dir.normalize());
    this.flying.push({ def, projectile: p });
    this.cooldowns.set(def.id, def.cooldown);
    this.fx.castEnd(def, true);
    this.fx.projectileStart(def, p);
    this.onSound?.('launch', origin);
    this.emit({ type: 'release', spell: def });
  }

  /** the target nearest to her facing direction within the angle and range, if any */
  private pickTarget(def: SpellDef, maxAngle: number): CombatTarget | null {
    const p = this.caster.position;
    const f = this.caster.facingAngle;
    let best: CombatTarget | null = null;
    let bestScore = Infinity;
    for (const t of this.world.targets) {
      if (!t.targetable) continue;
      t.getAimPoint(this.v2);
      const dx = this.v2.x - p.x;
      const dz = this.v2.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > def.aimRange) continue;
      const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - f), Math.cos(Math.atan2(dx, dz) - f)));
      if (dist > 0.05 && ang > maxAngle) continue;
      const score = ang * 2 + dist * 0.1;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  private resolve(def: SpellDef, p: Projectile, impact: Impact): void {
    const at = impact.point;
    this.emit({ type: 'impact', spell: def, kind: impact.kind, at: at.clone() });
    if (impact.kind === 'range') {
      this.onSound?.('decay', at);                              // fizzles out: no blast
      return;
    }
    this.onSound?.('impact', at);
    const hit = new Set<CombatTarget>();
    // direct hit
    if (impact.target) {
      const t = impact.target;
      hit.add(t);
      const dir = this.v.copy(p.direction).setY(0);
      if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
      dir.normalize();
      const report = t.takeHit({
        damage: def.directDamage, height: heightAt(at, t), effect: def.hitEffect ?? 'knockback', dir, knockback: def.directKnockback,
      });
      const disarmed = def.disarms && report.result === 'hit' && t.disarm ? t.disarm(dir) : false;
      this.emit({ type: 'hit', spell: def, target: t, direct: true, report, at: at.clone(), disarmed });
    }
    // splash: everyone else inside the blast and not shielded by a wall, once each
    for (const t of this.world.targets) {
      if (hit.has(t) || !t.targetable) continue;
      const b = t.getBounds(this.bounds);
      const d = distanceToBounds(at, b);
      const dmg = splashDamage(d, def.explosionRadius, def.splashDamage);
      if (dmg <= 0 || this.shielded(at, t)) continue;
      hit.add(t);
      const dir = this.v.set(b.x - at.x, 0, b.z - at.z);         // away from the blast
      if (dir.lengthSq() < 1e-8) dir.copy(p.direction).setY(0);
      if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
      dir.normalize();
      const falloff = 1 - d / def.explosionRadius;
      const report = t.takeHit({
        damage: dmg, height: heightAt(at, t), effect: 'knockback', dir, knockback: def.splashKnockback * falloff,
      });
      const where = new THREE.Vector3(b.x, Math.min(Math.max(at.y, b.yMin), b.yMax), b.z);
      this.emit({ type: 'hit', spell: def, target: t, direct: false, report, at: where });
    }
  }

  /** is there solid geometry between the blast and the target's torso? */
  private shielded(at: THREE.Vector3, t: CombatTarget): boolean {
    t.getAimPoint(this.v2);
    for (const box of this.world.solids) {
      if (sweepBox(at, this.v2, 0, box) >= 0) return true;
    }
    return false;
  }

  private emit(e: SpellEvent): void {
    this.onEvent?.(e);
  }
}

/** a blast at head height counts as high (a high guard blocks it), anything lower as low */
function heightAt(p: THREE.Vector3, t: CombatTarget): Height {
  const b = t.getBounds({ x: 0, z: 0, yMin: 0, yMax: 0, radius: 0 });
  return p.y >= b.yMin + 0.78 * (b.yMax - b.yMin) ? 'high' : 'low';
}
