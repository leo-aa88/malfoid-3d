import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AnimationController, AnimationState, ActionState, HoldState, StrikeState } from './AnimationController';
import { ToonMaterials } from './ToonMaterials';
import { HairSway } from './HairSway';
import type { SpellEmitter } from '../combat/spells/SpellEmitter';
import { Wand, WandGrip } from './Wand';
import { SPELL_CLIPS } from '../combat/spells/clips';

/** Seconds without movement before she gets annoyed. */
export const IDLE_ANNOYED_TIMEOUT = 10;

export const WALK_SPEED = 1.15;   // m/s
export const RUN_SPEED = 2.9;     // m/s
const TURN_RATE = 9.0;            // rad/s response of the facing direction
const ACCEL = 8.0;                // 1/s speed smoothing
const TURN_IN_PLACE = 1.6;        // rad: larger direction changes play the turn clip
const STRIKE_TURN_RATE = 28.0;    // rad/s response when a strike turns her towards the opponent

type Weights = Record<string, number>;

/** Her face while annoyed (existing shape keys of the base mesh). */
const ANNOYED_FACE: Weights = {
  // stronger than her (already haughty) resting face: brows pulled down hard,
  // narrowed eyes, pout
  'vrc.blink_Straight': 0.4,
  browDownLeft: 1.3,                // above ~1.4 (with the squint) the brow cards kink
  browDownRight: 1.3,
  '怒り': 0.5,
  'ｷﾘｯ': 0.2,
  eyeSquintLeft: 0.35,
  eyeSquintRight: 0.35,
  '口角下げ': 0.3,
  mouthPressLeft: 0.0,
  mouthPressRight: 0.0,
  Sulk: 0.7,
  mouthPucker: 0.25,
  mouthFrownLeft: 0.3,
  mouthFrownRight: 0.3,
};

interface ModelMeta {
  walk_speed: number;
  run_speed: number;
  rest_expression: Weights;
}

export class Malfoid {
  readonly root = new THREE.Group();
  private animation!: AnimationController;
  private faceMeshes: THREE.Mesh[] = [];
  private meta!: ModelMeta;
  private hair!: HairSway;

  // locomotion
  private readonly desiredDir = new THREE.Vector3();
  private wantRunning = false;
  private moving = false;
  private speed = 0;
  private facing = 0;
  private idleSince = performance.now();
  private pausedAt = 0;

  // combat / movement moves
  private action: ActionState | null = null;   // jump in progress
  private hold: HoldState | null = null;       // crouch / block while the key is held
  private strike: StrikeState | null = null;   // strike played by the combo or spell system
  /** set by the spell system from the start of a cast to its release: no melee meanwhile */
  castLock = false;
  /** her wand: up her right sleeve until she casts, put away again when she punches or kicks */
  wand!: Wand;
  private wandGrip!: WandGrip;
  private strikeFacing: number | null = null;  // auto-facing target during a strike

  // face
  private blinkTimer = 2.5;
  private blinkEnabled = true;
  private frozen = false;
  private blinkPhase = -1;
  private annoyedBlend = 0;
  private readonly restFace: Weights = {};
  private readonly faceKeys: string[] = [];

  static async load(url: string, metaUrl: string): Promise<Malfoid> {
    const [gltf, meta] = await Promise.all([
      new GLTFLoader().loadAsync(url),
      fetch(metaUrl).then((r) => r.json() as Promise<ModelMeta>),
    ]);
    const m = new Malfoid();
    m.meta = meta;
    m.root.add(gltf.scene);
    new ToonMaterials().apply(gltf.scene);
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && 'vrc.blink' in mesh.morphTargetDictionary) {
        m.faceMeshes.push(mesh);
      }
    });
    Object.assign(m.restFace, meta.rest_expression);
    const keys = new Set([...Object.keys(meta.rest_expression), ...Object.keys(ANNOYED_FACE), 'vrc.blink']);
    for (const fm of m.faceMeshes) Object.keys(fm.morphTargetDictionary ?? {}).forEach((k) => keys.add(k));
    m.faceKeys.push(...keys);
    m.animation = new AnimationController(gltf.scene, gltf.animations);
    m.animation.onActionDone = () => {
      m.action = null;
    };
    m.hair = new HairSway(gltf.scene);
    // the bones are still in their rest pose here (nothing has been animated yet)
    let hand: THREE.Bone | null = null;
    gltf.scene.traverse((o) => {
      if ((o as THREE.Bone).isBone && o.name === 'hand_R') hand = o as THREE.Bone;
    });
    if (!hand) throw new Error('model has no hand_R bone');
    m.wand = new Wand(hand);
    m.wandGrip = new WandGrip(gltf.scene, gltf.animations);
    return m;
  }

  get state(): AnimationState {
    return this.animation.state;
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /** direction: world-space (y ignored), any length > 0 */
  move(direction: THREE.Vector3, running: boolean): void {
    this.desiredDir.set(direction.x, 0, direction.z);
    if (this.desiredDir.lengthSq() < 1e-8) {
      this.stop();
      return;
    }
    this.desiredDir.normalize();
    this.wantRunning = running;
    this.moving = true;
    this.resetIdleTimer();
  }

  stop(): void {
    this.moving = false;
  }

  /** where her spells leave from: the tip of her wand */
  get spellEmitter(): SpellEmitter {
    return this.wand.tip;
  }

  /** facing direction (rad, 0 = +z) */
  get facingAngle(): number {
    return this.facing;
  }

  /**
   * Start a one-shot move (jump). Ignored while another move is playing or
   * while crouching / blocking. Counts as activity.
   */
  trigger(action: ActionState): void {
    this.resetIdleTimer();
    if (this.action || this.hold || this.strike || !this.animation.has(action)) return;
    this.action = action;
    this.animation.restart(action);
  }

  /** free to start a strike (not jumping, crouching, blocking or casting) */
  get canStrike(): boolean {
    return !this.action && !this.hold && !this.castLock;
  }

  /** clip of the strike or spell being played (null when none) */
  get currentStrike(): StrikeState | null {
    return this.strike;
  }

  // --- strikes: started, sped up / slowed and ended by the combo system

  playStrike(clip: StrikeState, startAt = 0, fade = 0.08): void {
    this.strike = clip;
    this.strikeFacing = null;
    this.animation.restart(clip, fade, startAt);
  }

  setStrikeRate(rate: number): void {
    if (this.strike) this.animation.setTimeScale(rate);
  }

  endStrike(): void {
    this.strike = null;
    this.strikeFacing = null;
  }

  /** turn quickly to this facing during the current strike */
  faceToward(angle: number): void {
    this.strikeFacing = angle;
  }

  /** crouch / block while the key is held */
  setHold(hold: HoldState, on: boolean): void {
    if (on) {
      this.resetIdleTimer();
      if (!this.hold && !this.action && !this.strike) this.hold = hold;
    } else if (this.hold === hold) {
      this.hold = null;
    }
  }

  /** pausing must not count towards the inactivity timer */
  pause(): void {
    this.pausedAt = performance.now();
  }

  resume(): void {
    if (this.pausedAt) this.idleSince += performance.now() - this.pausedAt;
    this.pausedAt = 0;
  }

  resetIdleTimer(): void {
    this.idleSince = performance.now();
  }

  /** seconds since the last movement input (wall-clock, independent of frame rate) */
  get idleSeconds(): number {
    return (performance.now() - this.idleSince) / 1000;
  }

  update(dt: number): void {
    // --- facing and speed
    // strikes, crouch and block plant her feet; a jump keeps its momentum
    const busy = this.action !== null || this.hold !== null || this.strike !== null;
    const steer = this.moving && !busy;
    let target = steer ? (this.wantRunning ? RUN_SPEED : WALK_SPEED) : 0;
    if (this.action === 'jump') target = this.speed;
    let turnDiff = 0;
    if (steer) {
      const want = Math.atan2(this.desiredDir.x, this.desiredDir.z);
      turnDiff = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing));
      this.facing += turnDiff * (1 - Math.exp(-TURN_RATE * dt));
      if (Math.abs(turnDiff) > TURN_IN_PLACE && this.speed < WALK_SPEED * 0.6) target = 0;   // turn first
    }
    if (this.strike && this.strikeFacing !== null) {
      const d = Math.atan2(Math.sin(this.strikeFacing - this.facing), Math.cos(this.strikeFacing - this.facing));
      this.facing += d * (1 - Math.exp(-STRIKE_TURN_RATE * dt));
    }
    // strikes stop her quickly so the hitbox stays where she plants her feet
    const accel = this.strike ? ACCEL * 2.5 : ACCEL;
    this.speed += (target - this.speed) * (1 - Math.exp(-accel * dt));
    if (this.speed < 1e-3) this.speed = 0;
    this.root.rotation.y = this.facing;
    this.root.position.x += Math.sin(this.facing) * this.speed * dt;
    this.root.position.z += Math.cos(this.facing) * this.speed * dt;

    // --- state machine
    let state: AnimationState;
    if (this.strike) {
      state = this.strike;                       // timed by the combo system
    } else if (this.action) {
      state = this.action;                       // started by trigger(); ends via onActionDone
    } else if (this.hold) {
      state = this.hold;
    } else if (this.moving && Math.abs(turnDiff) > TURN_IN_PLACE * 0.5 && this.speed < WALK_SPEED * 0.6) {
      state = 'turn';
    } else if (this.speed > (WALK_SPEED + RUN_SPEED) * 0.5 || (this.moving && this.wantRunning && this.speed > 0.4)) {
      state = 'run';
    } else if (this.speed > 0.15 || this.moving) {
      state = 'walk';
    } else if (this.idleSeconds >= IDLE_ANNOYED_TIMEOUT) {
      state = 'idle_annoyed';
    } else {
      state = 'idle';
    }
    this.animation.play(state);
    if (state === 'walk') this.animation.setTimeScale(Math.max(this.speed, 0.35) / this.meta.walk_speed);
    if (state === 'run') this.animation.setTimeScale(Math.max(this.speed, 1.2) / this.meta.run_speed);
    if (this.frozen) {
      this.resetIdleTimer();
      this.animation.mixer.setTime(0);      // fixed reference pose for visual comparisons
    } else {
      this.animation.update(dt);
    }
    // the wand comes out of her sleeve for a spell and stays in her hand afterwards; she puts
    // it away as soon as she fights with her fists (any punch or kick)
    if (this.strike) {
      if ((SPELL_CLIPS as readonly string[]).includes(this.strike)) this.wand.draw();
      else this.wand.stow();
    }
    this.wand.update(dt);
    this.wandGrip.apply(this.wand.drawn);
    this.root.updateMatrixWorld();
    this.hair.update(dt);

    this.updateFace(dt, state === 'idle_annoyed');
  }

  /**
   * Development hook for the visual comparison tool: replace the resting
   * expression (shape-key weights) and switch blinking on/off.
   */
  /** Development hook: hold her still in idle frame 0 (no breathing / head motion). */
  debugFreeze(on: boolean): void {
    this.frozen = on;
  }

  debugFace(weights: Weights | null, blink = true): string[] {
    if (weights) {
      for (const k of Object.keys(this.restFace)) delete this.restFace[k];
      Object.assign(this.restFace, weights);
    }
    this.blinkEnabled = blink;
    if (!blink) this.blinkPhase = -1;
    return [...this.faceKeys];
  }

  private updateFace(dt: number, annoyed: boolean): void {
    // annoyed expression eases in after she starts crossing her arms
    const goal = annoyed ? 1 : 0;
    this.annoyedBlend += (goal - this.annoyedBlend) * (1 - Math.exp(-(annoyed ? 2.2 : 5) * dt));

    // blinking
    this.blinkTimer -= dt;
    if (this.blinkEnabled && this.blinkTimer <= 0 && this.blinkPhase < 0) {
      this.blinkPhase = 0;
      this.blinkTimer = 2.2 + Math.random() * 3.5;
    }
    let blink = 0;
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt / 0.16;
      blink = Math.sin(Math.min(this.blinkPhase, 1) * Math.PI);
      if (this.blinkPhase >= 1) this.blinkPhase = -1;
    }

    const a = this.annoyedBlend;
    for (const mesh of this.faceMeshes) {
      const dict = mesh.morphTargetDictionary!;
      const inf = mesh.morphTargetInfluences!;
      for (const k of this.faceKeys) {
        const i = dict[k];
        if (i === undefined) continue;
        const rest = this.restFace[k] ?? 0;
        let v = rest + ((ANNOYED_FACE[k] ?? rest) - rest) * a;
        if (k === 'vrc.blink') v = blink;
        if (k === 'vrc.blink_Straight') v *= 1 - blink;   // the blink key closes fully on its own
        inf[i] = v;
      }
    }
  }
}
