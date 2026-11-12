import * as THREE from 'three';

/**
 * Lightweight secondary motion for the hair's physics chains (the purchased
 * hair's own hair_* bones). A damped spring drives a world-space tilt from the
 * character's speed and turning; deeper bones in a chain bend a little more.
 */
export class HairSway {
  private readonly bones: { bone: THREE.Bone; depth: number }[] = [];
  private pitch = 0;
  private pitchVel = 0;
  private roll = 0;
  private rollVel = 0;
  private time = 0;
  private readonly qw = new THREE.Quaternion();
  private readonly qInv = new THREE.Quaternion();
  private readonly qOff = new THREE.Quaternion();
  private readonly right = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();

  constructor(root: THREE.Object3D) {
    root.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone || !b.name.startsWith('hair_')) return;
      const depth = b.name.split('_').length - 2;          // hair_07 -> 0, hair_07_01 -> 1 ...
      this.bones.push({ bone: b, depth });
    });
  }

  update(dt: number, speed: number, turnRate: number, facing: THREE.Quaternion): void {
    if (!this.bones.length || dt <= 0) return;
    this.time += dt;
    // targets: trail back with speed, bounce with the stride, swing out when turning
    const targetPitch = -Math.min(speed, 3) * 0.045 - Math.sin(this.time * 2 * Math.PI * 1.8) * 0.012 * Math.min(speed, 3);
    const targetRoll = THREE.MathUtils.clamp(-turnRate * 0.04, -0.12, 0.12);
    const k = 40, c = 7;
    this.pitchVel += (k * (targetPitch - this.pitch) - c * this.pitchVel) * dt;
    this.pitch += this.pitchVel * dt;
    this.rollVel += (k * (targetRoll - this.roll) - c * this.rollVel) * dt;
    this.roll += this.rollVel * dt;

    this.right.set(1, 0, 0).applyQuaternion(facing);
    this.fwd.set(0, 0, 1).applyQuaternion(facing);
    for (const { bone, depth } of this.bones) {
      const f = depth === 0 ? 0.5 : 0.15;
      // world rotation for this bone: pitch about her right axis, roll about her forward axis
      this.qw.setFromAxisAngle(this.axis.copy(this.right), -this.pitch * f);
      this.qOff.setFromAxisAngle(this.axis.copy(this.fwd), this.roll * f);
      this.qw.multiply(this.qOff);
      // express it in the bone's local frame: local = W^-1 * qw * W
      bone.updateWorldMatrix(true, false);
      bone.getWorldQuaternion(this.qInv);
      const W = this.qInv.clone();
      this.qInv.invert();
      this.qOff.copy(this.qInv).multiply(this.qw).multiply(W);
      bone.quaternion.multiply(this.qOff);
    }
  }
}
