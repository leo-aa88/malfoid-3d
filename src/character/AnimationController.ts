import * as THREE from 'three';

export type LocomotionState = 'idle' | 'walk' | 'run' | 'turn' | 'idle_annoyed';
/** one-shot moves: play once, then hand control back to locomotion */
export type ActionState = 'jump' | 'punch_high' | 'punch_low' | 'kick_high' | 'kick_low';
/** held poses: play once and stay in the last frame while the key is down */
export type HoldState = 'crouch' | 'block';
export type AnimationState = LocomotionState | ActionState | HoldState;

const FADE: Record<AnimationState, number> = {
  idle: 0.45,
  walk: 0.3,
  run: 0.25,
  turn: 0.25,
  idle_annoyed: 0.6,
  jump: 0.08,
  punch_high: 0.08,
  punch_low: 0.08,
  kick_high: 0.1,
  kick_low: 0.1,
  crouch: 0.12,
  block: 0.08,
};

const ONCE = new Set(['idle_annoyed_start', 'jump', 'punch_high', 'punch_low', 'kick_high', 'kick_low', 'crouch', 'block']);
const ACTIONS = new Set<string>(['jump', 'punch_high', 'punch_low', 'kick_high', 'kick_low']);

/**
 * Wraps the AnimationMixer: one action per clip, cross-fades between
 * states. The annoyed idle first plays its one-shot "settle" clip (shift
 * weight, cross arms) and then blends into the looping clip.
 */
export class AnimationController {
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private stateName: AnimationState = 'idle';
  /** called when a one-shot move (jump, punch, kick) has finished */
  onActionDone: ((state: ActionState) => void) | null = null;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      if (ONCE.has(clip.name)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(clip.name, action);
    }
    this.mixer.addEventListener('finished', (e) => {
      const ev = e as unknown as { action: THREE.AnimationAction };
      const name = ev.action.getClip().name;
      if (name === 'idle_annoyed_start' && this.stateName === 'idle_annoyed') {
        this.fadeTo(this.actions.get('idle_annoyed')!, 0.5);
      } else if (ACTIONS.has(name) && this.stateName === name) {
        this.onActionDone?.(name as ActionState);
      }
    });
    this.play('idle', 0);
  }

  get state(): AnimationState {
    return this.stateName;
  }

  has(clip: string): boolean {
    return this.actions.has(clip);
  }

  play(state: AnimationState, fade = FADE[state]): void {
    if (state === this.stateName && this.current) return;
    this.start(state, fade);
  }

  /** (re)start a state even if it is already the current one (repeated punches) */
  restart(state: AnimationState, fade = FADE[state]): void {
    this.start(state, fade);
  }

  private start(state: AnimationState, fade: number): void {
    const clip = state === 'idle_annoyed' ? 'idle_annoyed_start' : state;
    const action = this.actions.get(clip);
    if (!action) return;
    this.stateName = state;
    this.fadeTo(action, fade);
  }

  /** playback speed of the current locomotion clip (keeps feet planted) */
  setTimeScale(scale: number): void {
    if (this.current) this.current.timeScale = scale;
  }

  private fadeTo(next: THREE.AnimationAction, fade: number): void {
    const prev = this.current;
    if (prev === next) {
      // same clip again: cross-fade from a frozen copy is not possible, so restart in place
      next.reset().play();
      return;
    }
    next.reset();
    next.timeScale = 1;
    next.setEffectiveWeight(1);
    next.play();
    if (prev) {
      if (fade > 0) next.crossFadeFrom(prev, fade, true);
      else prev.stop();
    }
    this.current = next;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}
