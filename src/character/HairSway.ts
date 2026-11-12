import * as THREE from 'three';

/**
 * Secondary motion for the hair's strand chains (the purchased hair's own
 * hair_* bones).
 *
 * Each bone's tail is a damped spring particle that follows where the tail
 * would be with the bone at rest. When the head moves (walking, running,
 * turning, the walk bob) the particle lags behind and the bone rotates
 * towards it, so strands trail and swing naturally and settle when she stops.
 *
 * Every frame each bone starts again from its stored rest rotation (the
 * mixer does not rewrite these constant tracks), and the bend is clamped, so
 * nothing can accumulate or blow up.
 */
interface Strand {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  tail: THREE.Vector3;          // tail in bone-local space
  pos: THREE.Vector3;           // particle (world)
  vel: THREE.Vector3;
  maxAngle: number;
}

export class HairSway {
  static STIFFNESS = 90;        // spring back to the rest shape (1/s^2)
  static DAMPING = 6.5;         // damping of the strand's own oscillation (1/s)
  static DRAG = 4.0;            // air drag: how far strands trail at speed (1/s)
  static MAX_ROOT = 0.42;       // max bend of a chain root (rad)
  static MAX_CHILD = 0.30;      // max extra bend of deeper bones (rad)

  private static readonly IDENTITY = new THREE.Quaternion();
  private readonly strands: Strand[] = [];
  private initialised = false;
  private readonly target = new THREE.Vector3();
  private readonly lastTarget = new Map<Strand, THREE.Vector3>();
  private readonly origin = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly acc = new THREE.Vector3();
  private readonly tv = new THREE.Vector3();
  private readonly qd = new THREE.Quaternion();
  private readonly W = new THREE.Quaternion();
  private readonly Winv = new THREE.Quaternion();

  constructor(root: THREE.Object3D) {
    root.traverse((o) => {                                   // pre-order: parents before children
      const bone = o as THREE.Bone;
      if (!bone.isBone || !bone.name.startsWith('hair_')) return;
      const child = bone.children.find((c) => (c as THREE.Bone).isBone) as THREE.Bone | undefined;
      const len = child ? child.position.length() : Math.max(bone.position.length(), 0.04);
      const depth = bone.name.split('_').length - 2;       // hair_07 -> 0, hair_07_01 -> 1 ...
      this.strands.push({
        bone,
        rest: bone.quaternion.clone(),
        tail: child ? child.position.clone() : new THREE.Vector3(0, len, 0),
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        maxAngle: depth === 0 ? HairSway.MAX_ROOT : HairSway.MAX_CHILD,
      });
    });
  }

  /** call after the animation mixer has posed the skeleton */
  update(dt: number): void {
    if (!this.strands.length || dt <= 0) return;
    const reset = !this.initialised || dt > 0.25;            // first frame / tab was in background
    this.initialised = true;
    // sub-step for stability at low frame rates
    const steps = Math.min(4, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (const s of this.strands) {
      const bone = s.bone;
      bone.quaternion.copy(s.rest);
      bone.updateWorldMatrix(true, false);
      this.target.copy(s.tail).applyMatrix4(bone.matrixWorld);   // where the tail is at rest
      let last = this.lastTarget.get(s);
      if (!last) {
        last = this.target.clone();
        this.lastTarget.set(s, last);
      }
      if (reset) {
        s.pos.copy(this.target);
        s.vel.set(0, 0, 0);
        last.copy(this.target);
        continue;
      }
      // velocity of the rest target (the head moving through space)
      this.tv.subVectors(this.target, last).divideScalar(dt);
      last.copy(this.target);
      for (let i = 0; i < steps; i++) {
        this.acc.subVectors(this.target, s.pos).multiplyScalar(HairSway.STIFFNESS);
        this.a.subVectors(s.vel, this.tv).multiplyScalar(HairSway.DAMPING);
        this.acc.sub(this.a);
        this.acc.addScaledVector(s.vel, -HairSway.DRAG);
        s.vel.addScaledVector(this.acc, h);
        s.pos.addScaledVector(s.vel, h);
      }
      // rotate the bone so its tail points at the particle (clamped)
      bone.getWorldPosition(this.origin);
      this.a.subVectors(this.target, this.origin);
      this.b.subVectors(s.pos, this.origin);
      const la = this.a.length();
      if (la < 1e-6 || this.b.lengthSq() < 1e-12) continue;
      this.a.divideScalar(la);
      this.b.normalize();
      const ang = Math.acos(THREE.MathUtils.clamp(this.a.dot(this.b), -1, 1));
      if (ang < 1e-4) continue;
      this.qd.setFromUnitVectors(this.a, this.b);
      if (ang > s.maxAngle) {
        this.qd.slerp(HairSway.IDENTITY, 1 - s.maxAngle / ang);
        // keep the particle within reach so it doesn't drift away
        this.b.copy(this.a).applyQuaternion(this.qd);
        s.pos.copy(this.origin).addScaledVector(this.b, la);
      }
      // world delta -> local: local = W^-1 * qd * W
      bone.getWorldQuaternion(this.W);
      this.Winv.copy(this.W).invert();
      this.qd.premultiply(this.Winv).multiply(this.W);
      bone.quaternion.multiply(this.qd).normalize();
      bone.updateWorldMatrix(false, true);
    }
  }
}
