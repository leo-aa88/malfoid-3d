import * as THREE from 'three';
import type { Malfoid } from './Malfoid';
import type { ActionState } from './AnimationController';

/** One-shot moves, triggered on key press. */
const ACTION_KEYS: Record<string, ActionState> = {
  Space: 'jump',
  KeyJ: 'punch_high',
  KeyU: 'punch_low',
  KeyK: 'kick_high',
  KeyI: 'kick_low',
};

/**
 * Keyboard input -> character commands.
 *
 * | Key          | Action                     |
 * |--------------|----------------------------|
 * | W A S D      | walk (world-fixed)         |
 * | Shift + WASD | run                        |
 * | Space        | jump                       |
 * | Left Ctrl    | crouch (held)              |
 * | J / U        | high / low punch           |
 * | K / I        | high / low kick            |
 * | O            | block (held)               |
 * | Esc          | pause                      |
 */
export class CharacterController {
  private readonly keys = new Set<string>();
  private readonly dir = new THREE.Vector3();
  paused = false;
  onPauseChange: ((paused: boolean) => void) | null = null;

  constructor(private readonly character: Malfoid) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Escape') {
        if (!e.repeat) this.setPaused(!this.paused);
        return;
      }
      if (e.code === 'Space' || e.code === 'ControlLeft') e.preventDefault();   // no page scroll
      if (this.paused) return;
      this.keys.add(e.code);
      const action = ACTION_KEYS[e.code];
      if (action && !e.repeat) this.character.trigger(action);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.keys.clear();
    if (paused) this.character.pause();
    else this.character.resume();
    this.onPauseChange?.(paused);
  }

  update(): void {
    const k = this.keys;
    this.character.setHold('crouch', k.has('ControlLeft'));
    this.character.setHold('block', k.has('KeyO'));
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
