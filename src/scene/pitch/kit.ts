import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Collects the pitch's static geometry into one mesh per material: every part is transformed
 * into place, coloured (vertex colours) and merged once at build time. Parts are drawn in a
 * module's local frame (setFrame): +x along the module, +y up, +z away from the pitch.
 */
export class Kit {
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly frame = new THREE.Matrix4();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private static readonly Y = new THREE.Vector3(0, 1, 0);

  /** keep texture coordinates (cloth: an atlas) instead of dropping them */
  constructor(private readonly keepUv = false) {}

  /** following parts are in this frame: origin (world), turned yaw (rad) about +y */
  setFrame(origin: THREE.Vector3, yaw: number): void {
    this.frame.makeRotationY(yaw).setPosition(origin);
  }

  resetFrame(): void {
    this.frame.identity();
  }

  /** a geometry placed with matrix m (local to the frame), every vertex coloured c */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, colour: THREE.ColorRepresentation, shade?: (y: number) => number): void {
    const geo = g.index ? g : g.setIndex([...Array(g.getAttribute('position').count).keys()]);
    if (!this.keepUv) geo.deleteAttribute('uv');
    geo.applyMatrix4(this.m.multiplyMatrices(this.frame, m));
    const n = geo.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    this.c.set(colour);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < n; i++) {
      const k = shade ? shade(pos.getY(i)) : 1;
      col[i * 3] = this.c.r * k;
      col[i * 3 + 1] = this.c.g * k;
      col[i * 3 + 2] = this.c.b * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(geo);
  }

  /** a box centred at (x, y, z) of size (w, h, d), turned yaw (rad) about its centre */
  box(x: number, y: number, z: number, w: number, h: number, d: number, colour: THREE.ColorRepresentation, yaw = 0): void {
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z).multiply(new THREE.Matrix4().makeScale(w, h, d));
    this.add(new THREE.BoxGeometry(1, 1, 1), m, colour);
  }

  /** a squared timber from a to b, w x d in section */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, colour: THREE.ColorRepresentation): void {
    const dir = this.s.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-4) return;
    this.q.setFromUnitVectors(Kit.Y, dir.divideScalar(len));
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), this.q, new THREE.Vector3(w, len, d));
    this.add(new THREE.BoxGeometry(1, 1, 1), m, colour);
  }

  /** a round pole from a to b, radius r0 at a and r1 at b */
  pole(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, colour: THREE.ColorRepresentation, radial = 8): void {
    const dir = this.s.subVectors(b, a);
    const len = dir.length();
    this.q.setFromUnitVectors(Kit.Y, dir.divideScalar(len));
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), this.q, new THREE.Vector3(1, 1, 1));
    this.add(new THREE.CylinderGeometry(r1, r0, len, radial, 1), m, colour);
  }

  /** a pointed roof: radial sides (4: a pyramid), base centred at (x, y, z) */
  roof(x: number, y: number, z: number, radius: number, height: number, radial: number, colour: THREE.ColorRepresentation, yaw = 0): void {
    const m = new THREE.Matrix4().makeRotationY(yaw + (radial === 4 ? Math.PI / 4 : 0)).setPosition(x, y + height / 2, z);
    this.add(new THREE.ConeGeometry(radius, height, radial, 1), m, colour);
  }

  /** everything collected, merged (null when empty) */
  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    g.computeBoundingSphere();
    return g;
  }
}

/** small deterministic colour jitter: c scaled by 1 +- amount */
export function jitter(base: string, rand: () => number, amount = 0.12): THREE.Color {
  return new THREE.Color(base).multiplyScalar(1 - amount + 2 * amount * rand());
}
