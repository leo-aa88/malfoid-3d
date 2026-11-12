import * as THREE from 'three';

export type AnimationState = 'idle' | 'walk' | 'run' | 'turn' | 'idle_annoyed';

const FADE: Record<AnimationState, number> = {
  idle: 0.45,
  walk: 0.3,
  run: 0.25,
  turn: 0.25,
  idle_annoyed: 0.6,
};

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

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      if (clip.name === 'idle_annoyed_start') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(clip.name, action);
    }
    this.mixer.addEventListener('finished', (e) => {
      const ev = e as unknown as { action: THREE.AnimationAction };
      if (ev.action === this.actions.get('idle_annoyed_start') && this.stateName === 'idle_annoyed') {
        this.fadeTo(this.actions.get('idle_annoyed')!, 0.5);
      }
    });
    this.play('idle', 0);
  }

  get state(): AnimationState {
    return this.stateName;
  }

  play(state: AnimationState, fade = FADE[state]): void {
    if (state === this.stateName && this.current) return;
    this.stateName = state;
    const clip = state === 'idle_annoyed' ? 'idle_annoyed_start' : state;
    const action = this.actions.get(clip);
    if (!action) return;
    this.fadeTo(action, fade);
  }

  /** playback speed of the current locomotion clip (keeps feet planted) */
  setTimeScale(scale: number): void {
    if (this.current) this.current.timeScale = scale;
  }

  private fadeTo(next: THREE.AnimationAction, fade: number): void {
    const prev = this.current;
    next.reset();
    next.timeScale = 1;
    next.setEffectiveWeight(1);
    next.play();
    if (prev && prev !== next) {
      if (fade > 0) next.crossFadeFrom(prev, fade, true);
      else prev.stop();
    }
    this.current = next;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}
