import * as THREE from 'three';

/**
 * Where a spell leaves from: the tip of Malfoid's wand (character/Wand.ts), or in front of
 * a palm (palmEmitter, for wandless casting). Nothing that fires spells depends on which.
 */
export interface SpellEmitter {
  getWorldPosition(out: THREE.Vector3): THREE.Vector3;
  /** the way the emitter points (along the wand, or the palm normal) */
  getWorldDirection(out: THREE.Vector3): THREE.Vector3;
}

/**
 * Emitter riding on a bone (or any Object3D): an anchor child at a local offset, so it
 * follows the skeleton as it animates and the character moves or turns.
 */
export class BoneEmitter implements SpellEmitter {
  readonly anchor = new THREE.Object3D();
  private readonly localDir = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();

  constructor(parent: THREE.Object3D, localOffset: THREE.Vector3, localDirection: THREE.Vector3) {
    this.anchor.name = 'spell_emitter';
    this.anchor.position.copy(localOffset);
    this.localDir.copy(localDirection).normalize();
    parent.add(this.anchor);
  }

  getWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    this.anchor.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.anchor.matrixWorld);
  }

  getWorldDirection(out: THREE.Vector3): THREE.Vector3 {
    this.anchor.updateWorldMatrix(true, false);
    this.anchor.getWorldQuaternion(this.q);
    return out.copy(this.localDir).applyQuaternion(this.q).normalize();
  }
}

/** a hand bone's own axes in its local space, read from the bind pose */
export interface HandFrame {
  /** wrist -> fingertips */
  fingers: THREE.Vector3;
  /** out of the palm */
  palm: THREE.Vector3;
  /** bone-local units per metre (the armature's scale) */
  unit: number;
}

/**
 * The rig's rest is a T-pose: fingers point straight out to the side, palms down. Reading
 * the hand's axes from it avoids assuming any bone-axis convention.
 */
export function handFrame(hand: THREE.Bone, side: 'L' | 'R'): HandFrame {
  hand.updateWorldMatrix(true, false);
  const inv = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
  const s = new THREE.Vector3();
  hand.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
  return {
    fingers: new THREE.Vector3(side === 'R' ? -1 : 1, 0, 0).applyQuaternion(inv).normalize(),
    palm: new THREE.Vector3(0, -1, 0).applyQuaternion(inv).normalize(),
    unit: 1 / (s.x || 1),
  };
}

/** emitter in front of a hand's palm (casting without a wand) */
export function palmEmitter(hand: THREE.Bone, side: 'L' | 'R', out = 0.07, along = 0.05): BoneEmitter {
  const f = handFrame(hand, side);
  const offset = f.palm.clone().multiplyScalar(out * f.unit).addScaledVector(f.fingers, along * f.unit);
  return new BoneEmitter(hand, offset, f.palm);
}
