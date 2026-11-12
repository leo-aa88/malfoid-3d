import * as THREE from 'three';
import type { Malfoid } from './Malfoid';

/** Keyboard input -> world-fixed movement commands. */
export class CharacterController {
  private readonly keys = new Set<string>();
  private readonly dir = new THREE.Vector3();

  constructor(private readonly character: Malfoid) {
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
    // world-fixed directions (as seen from the initial camera): W away from it,
    // S towards it, A left, D right. Orbiting the camera never changes where
    // she walks, so you can watch her walk or run from any side.
    this.dir.set(r, 0, -f);
    const running = k.has('ShiftLeft') || k.has('ShiftRight');
    this.character.move(this.dir, running);
  }
}
