import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AnimationController, AnimationState } from './AnimationController';
import { ToonMaterials } from './ToonMaterials';
import { HairSway } from './HairSway';

/** Seconds without movement before she gets annoyed. */
export const IDLE_ANNOYED_TIMEOUT = 10;

export const WALK_SPEED = 1.15;   // m/s
export const RUN_SPEED = 2.9;     // m/s
const TURN_RATE = 9.0;            // rad/s response of the facing direction
const ACCEL = 8.0;                // 1/s speed smoothing
const TURN_IN_PLACE = 1.6;        // rad: larger direction changes play the turn clip

type Weights = Record<string, number>;

/** Her face while annoyed (existing shape keys of the base mesh). */
const ANNOYED_FACE: Weights = {
  'vrc.blink_Straight': 0.45,
  browDownLeft: 0.8,
  browDownRight: 0.8,
  browOuterUpLeft: 0.0,
  eyeSquintLeft: 0.3,
  eyeSquintRight: 0.3,
  mouthSmileLeft: 0.0,
  mouthPressRight: 0.0,
  mouthDimpleLeft: 0.0,
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

  // face
  private blinkTimer = 2.5;
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
    m.faceKeys.push(...keys);
    m.animation = new AnimationController(gltf.scene, gltf.animations);
    m.hair = new HairSway(gltf.scene);
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

  resetIdleTimer(): void {
    this.idleSince = performance.now();
  }

  /** seconds since the last movement input (wall-clock, independent of frame rate) */
  get idleSeconds(): number {
    return (performance.now() - this.idleSince) / 1000;
  }

  update(dt: number): void {
    // --- facing and speed
    let target = this.moving ? (this.wantRunning ? RUN_SPEED : WALK_SPEED) : 0;
    let turnDiff = 0;
    if (this.moving) {
      const want = Math.atan2(this.desiredDir.x, this.desiredDir.z);
      turnDiff = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing));
      this.facing += turnDiff * (1 - Math.exp(-TURN_RATE * dt));
      if (Math.abs(turnDiff) > TURN_IN_PLACE && this.speed < WALK_SPEED * 0.6) target = 0;   // turn first
    }
    this.speed += (target - this.speed) * (1 - Math.exp(-ACCEL * dt));
    if (this.speed < 1e-3) this.speed = 0;
    this.root.rotation.y = this.facing;
    this.root.position.x += Math.sin(this.facing) * this.speed * dt;
    this.root.position.z += Math.cos(this.facing) * this.speed * dt;

    // --- state machine
    let state: AnimationState;
    if (this.moving && Math.abs(turnDiff) > TURN_IN_PLACE * 0.5 && this.speed < WALK_SPEED * 0.6) {
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
    this.animation.update(dt);
    this.root.updateMatrixWorld();
    this.hair.update(dt);

    this.updateFace(dt, state === 'idle_annoyed');
  }

  private updateFace(dt: number, annoyed: boolean): void {
    // annoyed expression eases in after she starts crossing her arms
    const goal = annoyed ? 1 : 0;
    this.annoyedBlend += (goal - this.annoyedBlend) * (1 - Math.exp(-(annoyed ? 2.2 : 5) * dt));

    // blinking
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkPhase < 0) {
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
