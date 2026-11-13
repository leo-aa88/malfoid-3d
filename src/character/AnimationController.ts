import * as THREE from 'three';
import { MOVE_CLIPS, MoveId } from '../combat/moves';
import { SPELL_CLIPS, SpellClip } from '../combat/spells/clips';

export type LocomotionState = 'idle' | 'walk' | 'run' | 'turn' | 'idle_annoyed' | 'confident' | 'cho_idle' | 'strafe';
/** quick evasive steps (Cho): in place clips, the character moves her through the world */
export type DodgeState = 'dodge_left' | 'dodge_right' | 'dodge_back';
export const DODGE_CLIPS: DodgeState[] = ['dodge_left', 'dodge_right', 'dodge_back'];
/** one-shot movement: plays once, then hands control back to locomotion */
export type ActionState = 'jump' | DodgeState;
/** held poses: play once and stay in the last frame while the key is down */
export type HoldState = 'crouch' | 'block' | 'wand_ready' | 'protego';
/** reactions: one-shot, timed by the character (hit, disarmed, picking the wand up) */
export type ReactionState = 'hit' | 'stagger' | 'knockback' | 'disarmed' | 'pickup';
export const REACTION_CLIPS: ReactionState[] = ['hit', 'stagger', 'knockback', 'disarmed', 'pickup'];
/** strikes (driven by the combo system) */
export type StrikeState = MoveId | SpellClip;
export type AnimationState = LocomotionState | ActionState | HoldState | StrikeState | ReactionState;

const FADE: Record<LocomotionState | ActionState | HoldState, number> = {
  idle: 0.45,
  walk: 0.3,
  run: 0.25,
  turn: 0.25,
  idle_annoyed: 0.6,
  confident: 0.45,
  cho_idle: 0.45,
  strafe: 0.2,
  jump: 0.08,
  dodge_left: 0.05,
  dodge_right: 0.05,
  dodge_back: 0.05,
  protego: 0.06,
  crouch: 0.12,
  block: 0.08,
  wand_ready: 0.12,
};

const STRIKE_FADE = 0.08;
const LOOPS_WARP = new Set(['walk', 'run']);
const ONCE = new Set<string>(['idle_annoyed_start', 'jump', 'crouch', 'block', 'wand_ready', 'protego', ...MOVE_CLIPS,
  ...SPELL_CLIPS, ...REACTION_CLIPS, ...DODGE_CLIPS]);
const ACTIONS = new Set<string>(['jump', ...DODGE_CLIPS]);

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
  /** called when a one-shot move (jump) has finished; strikes are timed by the combo system */
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

  /** clip length in seconds (0 if the model has no such clip) */
  duration(clip: string): number {
    return this.actions.get(clip)?.getClip().duration ?? 0;
  }

  play(state: AnimationState, fade = fadeOf(state)): void {
    if (state === this.stateName && this.current) return;
    this.start(state, fade);
  }

  /**
   * (re)start a state even if it is already the current one (repeated
   * strikes); startAt skips into the clip (chained combo finishers)
   */
  restart(state: AnimationState, fade = fadeOf(state), startAt = 0): void {
    this.start(state, fade, startAt);
  }

  private start(state: AnimationState, fade: number, startAt = 0): void {
    const clip = state === 'idle_annoyed' ? 'idle_annoyed_start' : state;
    const action = this.actions.get(clip);
    if (!action) return;
    this.stateName = state;
    this.fadeTo(action, fade, startAt);
  }

  /** where the walk / run loop is in its cycle (0..1; the feet land at 0 and 0.5), or null */
  get stridePhase(): number | null {
    // (the side-step lands its feet at phase 0 and 0.5 like the walk)
    if ((this.stateName !== 'walk' && this.stateName !== 'run' && this.stateName !== 'strafe') || !this.current) return null;
    const d = this.current.getClip().duration;
    return d > 0 ? (((this.current.time / d) % 1) + 1) % 1 : null;
  }

  /** playback speed of the current locomotion clip (keeps feet planted) */
  setTimeScale(scale: number): void {
    if (this.current) this.current.timeScale = scale;
  }

  private fadeTo(next: THREE.AnimationAction, fade: number, startAt = 0): void {
    const prev = this.current;
    if (prev === next) {
      // same clip again: cross-fade from a frozen copy is not possible, so restart in place
      next.reset().play();
      next.timeScale = 1;
      next.time = startAt;
      return;
    }
    next.reset();
    next.time = startAt;
    next.timeScale = 1;
    next.setEffectiveWeight(1);
    next.play();
    if (prev) {
      // time-warp only between the walk and run loops (it keeps their steps in
      // phase); anything else would race a short clip through its start
      const loops = LOOPS_WARP.has(prev.getClip().name) && LOOPS_WARP.has(next.getClip().name);
      if (fade > 0) next.crossFadeFrom(prev, fade, loops);
      else prev.stop();
    }
    this.current = next;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}

function fadeOf(state: AnimationState): number {
  return (FADE as Record<string, number>)[state] ?? STRIKE_FADE;
}
