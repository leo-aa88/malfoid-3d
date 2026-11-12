import type * as THREE from 'three';
import type { HitBounds } from '../CombatTarget';

/*
 * Swept-sphere tests for projectiles. Every test takes the segment the sphere's centre travels
 * this frame (p0 -> p1) and returns the fraction t in [0, 1] at which the sphere first touches
 * the obstacle, or -1. Because the whole segment is tested, a fast projectile can't tunnel
 * through a thin target between two frames.
 */

/** upright cylinder (a fighter's or the dummy's hurt volume) */
export function sweepCylinder(p0: THREE.Vector3, p1: THREE.Vector3, r: number, b: HitBounds): number {
  const R = b.radius + r;
  const y0 = b.yMin - r;
  const y1 = b.yMax + r;
  const ox = p0.x - b.x;
  const oz = p0.z - b.z;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = p1.z - p0.z;
  const insideXZ = ox * ox + oz * oz <= R * R;
  if (insideXZ && p0.y >= y0 && p0.y <= y1) return 0;           // already touching
  let best = -1;
  // side wall
  const a = dx * dx + dz * dz;
  if (a > 1e-12) {
    const bq = 2 * (ox * dx + oz * dz);
    const c = ox * ox + oz * oz - R * R;
    const disc = bq * bq - 4 * a * c;
    if (disc >= 0) {
      const t = (-bq - Math.sqrt(disc)) / (2 * a);              // entering
      if (t >= 0 && t <= 1) {
        const y = p0.y + dy * t;
        if (y >= y0 && y <= y1) best = t;
      }
    }
  }
  // top and bottom caps
  if (Math.abs(dy) > 1e-12) {
    for (const yc of [y0, y1]) {
      const t = (yc - p0.y) / dy;
      if (t < 0 || t > 1 || (best >= 0 && t >= best)) continue;
      const x = ox + dx * t;
      const z = oz + dz * t;
      if (x * x + z * z <= R * R) best = t;
    }
  }
  return best;
}

/** axis-aligned box (walls and other solid arena geometry) */
export function sweepBox(p0: THREE.Vector3, p1: THREE.Vector3, r: number, box: THREE.Box3): number {
  let tMin = 0;
  let tMax = 1;
  const o = [p0.x, p0.y, p0.z];
  const d = [p1.x - p0.x, p1.y - p0.y, p1.z - p0.z];
  const lo = [box.min.x - r, box.min.y - r, box.min.z - r];
  const hi = [box.max.x + r, box.max.y + r, box.max.z + r];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (o[i] < lo[i] || o[i] > hi[i]) return -1;
      continue;
    }
    let t0 = (lo[i] - o[i]) / d[i];
    let t1 = (hi[i] - o[i]) / d[i];
    if (t0 > t1) [t0, t1] = [t1, t0];
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) return -1;
  }
  return tMin;
}

/** the floor plane y = groundY */
export function sweepGround(p0: THREE.Vector3, p1: THREE.Vector3, r: number, groundY: number): number {
  const a = p0.y - r - groundY;
  if (a <= 0) return 0;
  const b = p1.y - r - groundY;
  if (b > 0) return -1;
  return a / (a - b);
}

/** distance from a point to a hurt volume (0 inside it) */
export function distanceToBounds(p: THREE.Vector3, b: HitBounds): number {
  const dxz = Math.max(0, Math.hypot(p.x - b.x, p.z - b.z) - b.radius);
  const dy = p.y < b.yMin ? b.yMin - p.y : p.y > b.yMax ? p.y - b.yMax : 0;
  return Math.hypot(dxz, dy);
}

/** splash damage: full at the centre, falling linearly to the edge of the blast, at least 1 inside it */
export function splashDamage(distance: number, radius: number, max: number): number {
  if (distance >= radius) return 0;
  return Math.max(1, Math.round(max * (1 - distance / radius)));
}
