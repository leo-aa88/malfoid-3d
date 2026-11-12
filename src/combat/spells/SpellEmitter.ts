import * as THREE from 'three';

/**
 * Where a spell leaves from. Today: in front of Malfoid's right palm. With a wand
 * later, a BoneEmitter on the wand-tip bone (or object) replaces it; nothing that
 * fires spells has to change.
 */
export interface SpellEmitter {
  getWorldPosition(out: THREE.Vector3): THREE.Vector3;
  /** the way the emitter points (palm normal, wand tip forward) */
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

/**
 * Emitter in front of a hand's palm. The palm normal and the finger direction are read from
 * the bind pose (the rig's rest is a T-pose: fingers point straight out to the side, palms
 * down), so no bone-axis convention is assumed.
 */
export function palmEmitter(hand: THREE.Bone, side: 'L' | 'R', out = 0.07, along = 0.05): BoneEmitter {
  hand.updateWorldMatrix(true, false);
  const inv = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
  const palm = new THREE.Vector3(0, -1, 0).applyQuaternion(inv);                  // palm normal, bone space
  const fingers = new THREE.Vector3(side === 'R' ? -1 : 1, 0, 0).applyQuaternion(inv);
  // the bone's local units can carry the armature's scale: express metres in bone space
  const s = new THREE.Vector3();
  hand.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
  const k = 1 / (s.x || 1);
  const offset = palm.clone().multiplyScalar(out * k).addScaledVector(fingers, along * k);
  return new BoneEmitter(hand, offset, palm);
}
