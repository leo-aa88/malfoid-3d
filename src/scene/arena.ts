import type * as THREE from 'three';
import type { EnvironmentKind, EnvironmentLook } from './SceneManager';

/**
 * Where a duel is fought: the Forbidden Woods, the Quidditch Pitch. The duel code talks only to
 * this: where the fighters start, the light, what stops a fighter (resolve), what stops a spell
 * (fillSolids), where the camera may go, and a per-frame update.
 */
export interface Arena {
  readonly kind: EnvironmentKind;
  readonly name: string;
  /** the duel starts here (the fighters stand either side of it) */
  readonly spawn: THREE.Vector3;
  /** bounded (the pitch): every duel, a restart too, starts at the spawn; the endless woods
   *  restart where Malfoid stands */
  readonly finite: boolean;
  look(): EnvironmentLook;
  setActive(on: boolean): void;
  /** push a fighter (a circle of radius r at pos) out of anything solid / back inside the arena */
  resolve(pos: THREE.Vector3, r: number): void;
  /** the solid boxes near these points that spells explode on (out is refilled) */
  fillSolids(out: THREE.Box3[], centres: THREE.Vector3[]): void;
  update(dt: number, player: THREE.Vector3, fighters: THREE.Vector3[], camera: THREE.PerspectiveCamera, viewportHeight: number): void;
  /** keep the camera somewhere it can see the fight from (null: anywhere) */
  readonly cameraLimit: CameraLimit | null;
}

export interface CameraLimit {
  /** can the camera stand at (x, z)? */
  inside(x: number, z: number): boolean;
  /** move the camera (towards the target) until it can */
  clamp(camera: THREE.Vector3, target: THREE.Vector3): void;
}
