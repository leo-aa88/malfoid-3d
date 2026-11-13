import * as THREE from 'three';
import type { Malfoid } from './Malfoid';
import type { ComboSystem } from '../combat/ComboSystem';
import type { AttackButton } from '../combat/moves';

/** Strike buttons; pressed twice in quick succession they form combos. */
const ATTACK_KEYS: Record<string, AttackButton> = {
  KeyJ: 'J',
  KeyU: 'U',
  KeyK: 'K',
  KeyI: 'I',
};

/**
 * Keyboard input -> character commands.
 *
 * | Key          | Action                     |
 * |--------------|----------------------------|
 * | W A S D      | walk (camera-relative)     |
 * | Shift + WASD | run                        |
 * | Space        | jump                       |
 * | Left Ctrl    | crouch (held)              |
 * | J / U        | high / low punch           |
 * | K / I        | high / low kick            |
 * | O            | block (held)               |
 * | L            | cast Confringo             |
 * | P            | cast Expelliarmus (learned)|
 * | G            | start / stop a duel        |
 * | B            | dummy guard none/high/low  |
 * | N            | dummy in front of her      |
 * | Esc          | pause                      |
 */
export class CharacterController {
  private readonly keys = new Set<string>();
  private readonly dir = new THREE.Vector3();
  paused = false;
  /** the fighter can't act (the duel's opening lines): keys are tracked but move / attack nothing; G still restarts */
  locked = false;
  onPauseChange: ((paused: boolean) => void) | null = null;
  /** training dummy: cycle its guard / bring it in front of her */
  onDummyGuard: (() => void) | null = null;
  onDummyReset: (() => void) | null = null;
  /** spell keys (L: Confringo, P: Expelliarmus); called once per key press, never for auto-repeat */
  onSpell: ((spell: 'confringo' | 'expelliarmus') => void) | null = null;
  /** start / stop a duel with Ginny */
  onDuel: (() => void) | null = null;
  /** the camera's view direction (rad, target -> camera): W walks away from the camera */
  viewYaw: (() => number) | null = null;
  private heldKeys = '';                 // the movement keys held when the direction was taken
  private moveYaw = 0;

  constructor(private readonly character: Malfoid, private readonly combat: ComboSystem) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Escape') {
        if (!e.repeat) this.setPaused(!this.paused);
        return;
      }
      if (e.code === 'Space' || e.code === 'ControlLeft') e.preventDefault();   // no page scroll
      if (this.paused) return;
      const wasDown = this.keys.has(e.code);
      this.keys.add(e.code);
      if (e.repeat || wasDown) return;          // edge only: holding a key never repeats an action
      if (this.locked && e.code !== 'KeyG') return;
      const attack = ATTACK_KEYS[e.code];
      if (attack) this.combat.press(attack);
      else if (e.code === 'Space') this.character.trigger('jump');
      else if (e.code === 'KeyL') this.onSpell?.('confringo');
      else if (e.code === 'KeyP') this.onSpell?.('expelliarmus');
      else if (e.code === 'KeyG') this.onDuel?.();
      else if (e.code === 'KeyB') this.onDummyGuard?.();
      else if (e.code === 'KeyN') this.onDummyReset?.();
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
    if (this.locked) {
      this.character.setHold('crouch', false);
      this.character.setHold('block', false);
      this.character.stop();
      this.heldKeys = '';
      return;
    }
    this.character.setHold('crouch', k.has('ControlLeft'));
    this.character.setHold('block', k.has('KeyO'));
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (f === 0 && r === 0) {
      this.character.stop();
      this.heldKeys = '';
      return;
    }
    // camera-relative: W away from the camera, S towards it, A / D left / right on screen.
    // The camera's direction is taken when the movement keys change and kept while they are
    // held, so the camera turning to follow her (or being orbited) never bends her path.
    const held = `${f},${r}`;
    if (held !== this.heldKeys) {
      this.heldKeys = held;
      this.moveYaw = this.viewYaw ? this.viewYaw() : 0;
    }
    const y = this.moveYaw;
    const fx = -Math.sin(y);
    const fz = -Math.cos(y);
    this.dir.set(fx * f + Math.cos(y) * r, 0, fz * f - Math.sin(y) * r);
    const running = k.has('ShiftLeft') || k.has('ShiftRight');
    this.character.move(this.dir, running);
  }
}
