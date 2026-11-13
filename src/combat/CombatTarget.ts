import type * as THREE from 'three';
import type { Height, HitEffect } from './moves';

export type HitResult = 'hit' | 'blocked' | 'immune';

/** hurt volume of a fighter or dummy: an upright cylinder (m, world space) */
export interface HitBounds {
  x: number;
  z: number;
  yMin: number;
  yMax: number;
  radius: number;
}

/** one hit as the attacker describes it */
export interface HitRequest {
  damage: number;
  /** a guard at this height blocks it */
  height: Height;
  effect: HitEffect;
  /** unit vector, horizontal: the direction the hit pushes the target */
  dir: THREE.Vector3;
  /** slide speed for 'knockback' (m/s); the target's own default otherwise */
  knockback?: number;
}

export interface HitReport {
  result: HitResult;
  damage: number;
  ko: boolean;
}

/**
 * Anything that can be hit: the training dummy now, opponents later. Attacks
 * (melee or spells) only talk to this interface.
 */
export interface CombatTarget {
  readonly name: string;
  /** can it be hit right now (e.g. not while knocked down) */
  readonly targetable: boolean;
  getBounds(out: HitBounds): HitBounds;
  /** where ranged attacks aim: the torso */
  getAimPoint(out: THREE.Vector3): THREE.Vector3;
  takeHit(hit: HitRequest): HitReport;
  /** knock its wand away (fighters only); true if it had one */
  disarm?(dir: THREE.Vector3): boolean;
}

export function emptyBounds(): HitBounds {
  return { x: 0, z: 0, yMin: 0, yMax: 0, radius: 0 };
}
