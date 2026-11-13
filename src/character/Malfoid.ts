import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AnimationController, AnimationState, ActionState, HoldState, ReactionState, StrikeState } from './AnimationController';
import { ToonMaterials } from './ToonMaterials';
import { HairSway } from './HairSway';
import type { SpellEmitter } from '../combat/spells/SpellEmitter';
import { Wand, WandGrip, WAND_PICKUP_RADIUS } from './Wand';
import { SPELL_CLIPS } from '../combat/spells/clips';

/** Seconds without movement before she gets annoyed. */
export const IDLE_ANNOYED_TIMEOUT = 10;

export const WALK_SPEED = 1.15;   // m/s
export const RUN_SPEED = 2.9;     // m/s
const TURN_RATE = 9.0;            // rad/s response of the facing direction
const ACCEL = 8.0;                // 1/s speed smoothing
const TURN_IN_PLACE = 1.6;        // rad: larger direction changes play the turn clip
const STRIKE_TURN_RATE = 28.0;    // rad/s response when a strike turns her towards the opponent

export type Weights = Record<string, number>;

/** what differs between the characters at runtime (the model and its clips are their own) */
export interface CharacterOptions {
  name: string;
  /** standing-still clip */
  idleClip?: 'idle' | 'confident';
  /** after IDLE_ANNOYED_TIMEOUT s without input: cross the arms, annoyed face (Malfoid) */
  annoyedIdle?: boolean;
  /** named faces (shape-key weights) for setExpression(); 'annoyed' is used by the annoyed idle */
  expressions?: Record<string, Weights>;
  /** the face with the mouth fully open while speaking (setTalk(1)); 0 keeps the rest face */
  talk?: Weights;
}

/**
 * Malfoid's open mouth while she speaks (setTalk scales it): the base mesh's "a" viseme, a
 * little jaw, and her resting lip press let go so the lips can part. Fully open it is the
 * atlas's "Slightly Open (speaking)": a small oval, not a shout.
 */
export const MALFOID_TALK: Weights = { 'あ': 0.42, jawOpen: 0.08, mouthPressLeft: 0, mouthPressRight: 0 };

/** Malfoid's face while annoyed (existing shape keys of the base mesh). */
export const ANNOYED_FACE: Weights = {
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

/**
 * A playable or AI character: model, locomotion, moves, reactions, face and wand. Malfoid and
 * Ginny are both instances (CharacterOptions holds what differs); input or an AI drives it.
 */
export class Malfoid {
  readonly root = new THREE.Group();
  name = 'Malfoid';
  private opts: Required<CharacterOptions> = { name: 'Malfoid', idleClip: 'idle', annoyedIdle: true, expressions: { annoyed: ANNOYED_FACE }, talk: MALFOID_TALK };
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
  // reactions (hit, stagger, knockback, disarmed, pickup): timed here, push her back
  private reaction: { kind: ReactionState; t: number; dur: number } | null = null;
  private readonly slide = new THREE.Vector3();
  private lookTarget: number | null = null;     // turn towards this when standing (AI)
  private pickupSpot: THREE.Vector3 | null = null;   // steps to the wand while bending down for it
  private strafeFace: number | null = null;     // keep facing this while moving (AI)
  /** a defeated fighter stays down until reset */
  defeated = false;
  /** scene the wand falls into when it is knocked away */
  scene: THREE.Scene | null = null;

  // face
  private blinkTimer = 2.5;
  private blinkEnabled = true;
  private frozen = false;
  private blinkPhase = -1;
  private annoyedBlend = 0;
  private expression: string | null = null;     // a named face held for a while
  private expressionUntil = 0;
  private expressionBlend = 0;
  private readonly exprFace: Weights = {};
  private faceClock = 0;
  private readonly restFace: Weights = {};
  private readonly faceKeys: string[] = [];
  private talk = 0;
  private headBone: THREE.Object3D | null = null;

  static async load(url: string, metaUrl: string, options?: CharacterOptions): Promise<Malfoid> {
    const [gltf, meta] = await Promise.all([
      new GLTFLoader().loadAsync(url),
      fetch(metaUrl).then((r) => r.json() as Promise<ModelMeta>),
    ]);
    const m = new Malfoid();
    if (options) {
      m.opts = { idleClip: 'idle', annoyedIdle: false, expressions: {}, talk: {}, ...options };
      m.name = options.name;
    }
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
    const keys = new Set([...Object.keys(meta.rest_expression), 'vrc.blink']);
    for (const w of [...Object.values(m.opts.expressions), m.opts.talk]) Object.keys(w).forEach((k) => keys.add(k));
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

  /** walk / run cycle position (0..1, a foot lands at 0 and 0.5), null when not walking or running */
  get stridePhase(): number | null {
    return this.animation.stridePhase;
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /**
   * direction: world-space (y ignored), any length > 0. face (rad): keep facing that way
   * while moving (an AI stepping back from its opponent); she turns to the movement otherwise.
   */
  move(direction: THREE.Vector3, running: boolean, face: number | null = null): void {
    this.strafeFace = face;
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
    this.strafeFace = null;
  }

  /** turn to this facing at once (placing a fighter for a duel) */
  setFacing(angle: number): void {
    this.facing = angle;
    this.root.rotation.y = angle;
  }

  /** turn towards this facing while standing (AI); null: leave it */
  lookAt(angle: number | null): void {
    this.lookTarget = angle;
  }

  /** in a reaction (hit, stagger, knockback, disarmed, picking the wand up) */
  get reacting(): ReactionState | null {
    return this.reaction ? this.reaction.kind : null;
  }

  /** has her wand (in her hand or up her sleeve); false while it lies on the floor */
  get hasWand(): boolean {
    return this.wand.state === 'hand';
  }

  /** blocking right now (the block pose is held) */
  get blocking(): boolean {
    return this.hold === 'block';
  }

  /**
   * React to a hit: plays the reaction clip, interrupts what she was doing and slides her
   * along push (m/s, decays). A defeated character ignores further hits.
   */
  react(kind: ReactionState, push?: THREE.Vector3): void {
    if (this.defeated && kind !== 'knockback') return;
    if (!this.animation.has(kind)) return;
    if (kind !== 'pickup') this.pickupSpot = null;
    if (this.strike) this.endStrike();
    this.castLock = false;
    this.action = null;
    this.hold = null;
    this.reaction = { kind, t: 0, dur: this.animation.duration(kind) };
    this.animation.restart(kind, 0.06);
    if (push) this.slide.copy(push).setY(0);
    this.resetIdleTimer();
  }

  /** Expelliarmus: the wand is knocked out of her hand along dir; true if she had it */
  disarm(dir: THREE.Vector3): boolean {
    if (!this.hasWand || !this.scene) return false;
    this.wand.knockAway(this.scene, dir);
    this.react('disarmed', dir.clone().multiplyScalar(0.8));
    return true;
  }

  /** how far her mouth is open while speaking (0..1, set every frame by whoever plays her voice) */
  setTalk(level: number): void {
    this.talk = Math.min(1, Math.max(0, level));
  }

  get talking(): number {
    return this.talk;
  }

  /** show a named face (from CharacterOptions.expressions) for a while; null: back to rest */
  setExpression(name: string | null, seconds = 1.2): void {
    if (name && !this.opts.expressions[name]) return;
    this.expression = name;
    this.expressionUntil = this.faceClock + seconds;
    if (name) {
      for (const k of Object.keys(this.exprFace)) delete this.exprFace[k];
      Object.assign(this.exprFace, this.opts.expressions[name]);
    }
  }

  /** knocked out / back on her feet (duel end / reset) */
  setDefeated(on: boolean): void {
    this.defeated = on;
    if (on) {
      this.react('knockback');
      this.setExpression('pain', 99);
    } else {
      this.reaction = null;
      this.hold = null;
      this.setExpression(null);
    }
  }

  /** where her spells leave from: the tip of her wand */
  get spellEmitter(): SpellEmitter {
    return this.wand.tip;
  }

  /** ground speed (m/s) */
  get moveSpeed(): number {
    return this.speed;
  }

  /** where her face is (world space): the head bone, a little above it (close-ups) */
  facePosition(out: THREE.Vector3): THREE.Vector3 {
    this.headBone ??= this.root.getObjectByName('head') ?? this.root;
    this.headBone.getWorldPosition(out);
    if (this.headBone === this.root) out.y += 1.4;
    else out.y += 0.06;
    return out;
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

  /** free to start a strike (not jumping, crouching, blocking, casting, reacting or down) */
  get canStrike(): boolean {
    return !this.action && !this.hold && !this.castLock && !this.reaction && !this.defeated;
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
      if (!this.hold && !this.action && !this.strike && !this.reaction && !this.defeated) this.hold = hold;
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
    // --- reactions: timed here, she slides with the hit
    if (this.reaction) {
      this.reaction.t += dt;
      // picking the wand up: it is in her hand once her fingers close on it
      if (this.reaction.kind === 'pickup' && this.pickupSpot && this.reaction.t < this.reaction.dur * 0.35) {
        this.root.position.lerp(this.pickupSpot, 1 - Math.exp(-12 * dt));
      }
      if (this.reaction.kind === 'pickup' && this.wand.state === 'dropped' && this.reaction.t >= this.reaction.dur * 0.5) {
        this.wand.retrieve();
        this.pickupSpot = null;
      }
      if (this.reaction.t >= this.reaction.dur) this.reaction = null;     // a defeated fighter then kneels
    }
    if (this.slide.lengthSq() > 1e-6) {
      this.root.position.addScaledVector(this.slide, dt);
      this.slide.multiplyScalar(Math.exp(-5.0 * dt));
    }
    // walking onto her dropped wand picks it up
    if (this.wand.state === 'dropped' && !this.reaction && !this.strike && !this.action && !this.defeated) {
      const w = this.wand.getWorldPosition(new THREE.Vector3());
      const d = Math.hypot(w.x - this.root.position.x, w.z - this.root.position.z);
      if (d <= WAND_PICKUP_RADIUS) {
        this.facing = Math.atan2(w.x - this.root.position.x, w.z - this.root.position.z);
        this.speed = 0;
        this.react('pickup');
        // the clip reaches ~0.3 m in front of her right foot: step in to there
        const back = Math.min(d, 0.3) / Math.max(d, 1e-6);
        this.pickupSpot = new THREE.Vector3(w.x - (w.x - this.root.position.x) * back, this.root.position.y,
          w.z - (w.z - this.root.position.z) * back);
      }
    }

    // --- facing and speed
    // strikes, crouch, block and reactions plant her feet; a jump keeps its momentum
    const busy = this.action !== null || this.hold !== null || this.strike !== null || this.reaction !== null || this.defeated;
    const steer = this.moving && !busy;
    let target = steer ? (this.wantRunning ? RUN_SPEED : WALK_SPEED) : 0;
    if (this.action === 'jump') target = this.speed;
    let turnDiff = 0;
    let moveAngle = this.facing;
    let backwards = false;
    if (steer && this.strafeFace !== null) {
      // keeps facing her opponent: steps towards, away or round them
      const want = this.strafeFace;
      const d = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing));
      this.facing += d * (1 - Math.exp(-TURN_RATE * dt));
      moveAngle = Math.atan2(this.desiredDir.x, this.desiredDir.z);
      backwards = Math.cos(moveAngle - this.facing) < -0.2;
    } else if (steer) {
      const want = Math.atan2(this.desiredDir.x, this.desiredDir.z);
      turnDiff = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing));
      this.facing += turnDiff * (1 - Math.exp(-TURN_RATE * dt));
      if (Math.abs(turnDiff) > TURN_IN_PLACE && this.speed < WALK_SPEED * 0.6) target = 0;   // turn first
    } else if (!busy && this.lookTarget !== null) {
      const d = Math.atan2(Math.sin(this.lookTarget - this.facing), Math.cos(this.lookTarget - this.facing));
      this.facing += d * (1 - Math.exp(-5.0 * dt));
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
    const va = this.strafeFace !== null && steer ? moveAngle : this.facing;   // strafing: along the step
    this.root.position.x += Math.sin(va) * this.speed * dt;
    this.root.position.z += Math.cos(va) * this.speed * dt;

    // --- state machine
    let state: AnimationState;
    if (this.reaction) {
      state = this.reaction.kind;                // timed above
    } else if (this.defeated) {
      state = 'crouch';
    } else if (this.strike) {
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
    } else if (this.opts.annoyedIdle && this.idleSeconds >= IDLE_ANNOYED_TIMEOUT) {
      state = 'idle_annoyed';
    } else {
      state = this.opts.idleClip;
    }
    this.animation.play(state);
    // stepping back while facing her opponent: the walk plays backwards
    if (state === 'walk') this.animation.setTimeScale((backwards ? -1 : 1) * Math.max(this.speed, 0.35) / this.meta.walk_speed);
    if (state === 'run') this.animation.setTimeScale(Math.max(this.speed, 1.2) / this.meta.run_speed);
    if (this.frozen) {
      this.resetIdleTimer();
      this.animation.mixer.setTime(0);      // fixed reference pose for visual comparisons
    } else {
      this.animation.update(dt);
    }
    // the wand comes out of her sleeve for a spell and stays in her hand afterwards; she puts
    // it away as soon as she fights with her fists (any punch or kick)
    if (this.strike && this.wand.state === 'hand') {
      if ((SPELL_CLIPS as readonly string[]).includes(this.strike)) this.wand.draw();
      else this.wand.stow();
    }
    this.wand.update(dt);
    this.wandGrip.apply(this.wand.state === 'hand' ? this.wand.drawn : 0);
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
    this.faceClock += dt;
    // annoyed expression eases in after she starts crossing her arms
    const goal = annoyed ? 1 : 0;
    this.annoyedBlend += (goal - this.annoyedBlend) * (1 - Math.exp(-(annoyed ? 2.2 : 5) * dt));
    // a named expression (hit -> pain, casting -> determined, ...) eases in and out
    if (this.expression && this.faceClock >= this.expressionUntil) this.expression = null;
    const eg = this.expression ? 1 : 0;
    this.expressionBlend += (eg - this.expressionBlend) * (1 - Math.exp(-(eg ? 12 : 4) * dt));
    const annoyedFace = this.opts.expressions.annoyed ?? {};
    const talk = this.opts.talk;

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
        let v = rest + ((annoyedFace[k] ?? rest) - rest) * a;
        if (this.expressionBlend > 1e-3) v += ((this.exprFace[k] ?? rest) - v) * this.expressionBlend;
        if (this.talk > 1e-3 && talk[k] !== undefined) v += (talk[k] - v) * this.talk;   // speaking: the mouth on top
        if (k === 'vrc.blink') v = blink;
        if (k === 'vrc.blink_Straight') v *= 1 - blink;   // the blink key closes fully on its own
        inf[i] = v;
      }
    }
  }
}
