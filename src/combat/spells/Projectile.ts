import * as THREE from 'three';
import type { CombatTarget, HitBounds } from '../CombatTarget';
import { emptyBounds } from '../CombatTarget';
import { sweepBox, sweepCylinder, sweepGround } from './collision';

export interface ProjectileSpec {
  speed: number;        // m/s
  radius: number;       // m (collision)
  maxRange: number;     // m
}

/** what a projectile can run into */
export interface CollisionWorld {
  /** opponents (never the caster) */
  targets: readonly CombatTarget[];
  /** walls and other solid arena geometry */
  solids: readonly THREE.Box3[];
  groundY: number;
}

export type ImpactKind = 'target' | 'solid' | 'ground' | 'range';

export interface Impact {
  kind: ImpactKind;
  point: THREE.Vector3;
  target: CombatTarget | null;
}

let nextId = 1;

/**
 * A straight-flying spell projectile. step() moves it and sweeps its sphere along the
 * segment it travelled (no tunnelling); the first contact ends it. At maxRange it stops
 * with a 'range' impact. After any impact it is dead and never reports again.
 */
export class Projectile {
  readonly id = nextId++;
  readonly position = new THREE.Vector3();
  readonly previous = new THREE.Vector3();
  readonly direction = new THREE.Vector3();
  travelled = 0;
  alive = true;
  age = 0;

  private readonly next = new THREE.Vector3();
  private readonly bounds: HitBounds = emptyBounds();

  constructor(readonly spec: ProjectileSpec, origin: THREE.Vector3, direction: THREE.Vector3) {
    this.position.copy(origin);
    this.previous.copy(origin);
    this.direction.copy(direction).normalize();
  }

  step(dt: number, world: CollisionWorld): Impact | null {
    if (!this.alive) return null;
    this.age += dt;
    const left = this.spec.maxRange - this.travelled;
    const dist = Math.min(this.spec.speed * dt, left);
    this.next.copy(this.position).addScaledVector(this.direction, dist);
    const r = this.spec.radius;

    let best = 2;
    let kind: ImpactKind = 'range';
    let hitTarget: CombatTarget | null = null;
    for (const t of world.targets) {
      if (!t.targetable) continue;
      const s = sweepCylinder(this.position, this.next, r, t.getBounds(this.bounds));
      if (s >= 0 && s < best) {
        best = s;
        kind = 'target';
        hitTarget = t;
      }
    }
    for (const box of world.solids) {
      const s = sweepBox(this.position, this.next, r, box);
      if (s >= 0 && s < best) {
        best = s;
        kind = 'solid';
        hitTarget = null;
      }
    }
    const g = sweepGround(this.position, this.next, r, world.groundY);
    if (g >= 0 && g < best) {
      best = g;
      kind = 'ground';
      hitTarget = null;
    }

    this.previous.copy(this.position);
    if (best <= 1) {
      this.position.lerp(this.next, best);
      this.travelled += dist * best;
      this.alive = false;
      return { kind, point: this.position.clone(), target: hitTarget };
    }
    this.position.copy(this.next);
    this.travelled += dist;
    if (this.travelled >= this.spec.maxRange - 1e-6) {
      this.alive = false;
      return { kind: 'range', point: this.position.clone(), target: null };
    }
    return null;
  }
}
