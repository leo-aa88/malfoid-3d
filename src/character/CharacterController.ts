import * as THREE from 'three';
import type { Malfoid } from './Malfoid';
import type { CameraController } from '../camera/CameraController';

/** Keyboard input -> camera-relative movement commands. */
export class CharacterController {
  private readonly keys = new Set<string>();
  private readonly dir = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();

  constructor(private readonly character: Malfoid, private readonly camera: CameraController) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  update(): void {
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (f === 0 && r === 0) {
      this.character.stop();
      return;
    }
    // forward = away from the camera, on the ground plane
    const yaw = this.camera.getYaw();
    this.fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.right.set(-this.fwd.z, 0, this.fwd.x);
    this.dir.copy(this.fwd).multiplyScalar(f).addScaledVector(this.right, r);
    const running = k.has('ShiftLeft') || k.has('ShiftRight');
    this.character.move(this.dir, running);
  }
}
