import * as THREE from 'three';
import { BoneEmitter, handFrame, SpellEmitter } from '../combat/spells/SpellEmitter';

/*
 * Malfoid's wand, after the blueprint's example: dark wood, a carved handle with rings and a
 * knob, a slim tapering shaft. Built at runtime (a small lathe-turned prop, no asset file).
 * She keeps it up her right sleeve, draws it to cast and keeps it in hand until she fights with
 * her fists: held along the fingers, spells leave from its tip.
 */
export const WAND_LENGTH = 0.30;      // m, knob to tip (about 12 inches)
const BUTT = 0.065;                   // m of handle behind the grip point (out past the little finger)
const OUTLINE = 0.0011;               // m, the cel outline around it

const WOOD_DARK = new THREE.Color('#3d2717');
const WOOD = new THREE.Color('#6e4a2e');
const WOOD_LIGHT = new THREE.Color('#9a6d45');

/** radius along the wand (y from the knob, m) and the wood tone there */
const PROFILE: [number, number, THREE.Color][] = [
  [0.000, 0.0000, WOOD_DARK],
  [0.003, 0.0080, WOOD_DARK],
  [0.009, 0.0108, WOOD_DARK],       // knob
  [0.015, 0.0092, WOOD_DARK],
  [0.020, 0.0085, WOOD_DARK],
  [0.024, 0.0098, WOOD_LIGHT],      // ring
  [0.028, 0.0086, WOOD_DARK],
  [0.050, 0.0082, WOOD_DARK],
  [0.054, 0.0095, WOOD_LIGHT],      // ring
  [0.058, 0.0082, WOOD_DARK],
  [0.080, 0.0080, WOOD_DARK],
  [0.085, 0.0096, WOOD_LIGHT],      // collar
  [0.092, 0.0094, WOOD_LIGHT],
  [0.097, 0.0068, WOOD],
  [0.180, 0.0052, WOOD],
  [0.270, 0.0036, WOOD],
  [0.296, 0.0026, WOOD],
  [0.300, 0.0000, WOOD],
];

function lathe(grow: number): THREE.LatheGeometry {
  const pts = PROFILE.map(([y, r]) => new THREE.Vector2(r > 0 ? r + grow : 0, y + (y === 0 ? -grow : y >= WAND_LENGTH ? grow : 0)));
  const geo = new THREE.LatheGeometry(pts, 14);
  // wood tone per ring of vertices (the lathe repeats the profile around the axis)
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    let best = PROFILE[0];
    for (const p of PROFILE) if (Math.abs(p[0] - y) < Math.abs(best[0] - y)) best = p;
    best[2].toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function gradient(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 255, 255, 255, 255]), 2, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const DRAW_TIME = 0.12;                // s: out of the sleeve into the hand
const STOW_TIME = 0.1;                 // s: back up the sleeve (gone as the fists come up)
const SLEEVE = 0.3;                    // m: how far up the forearm it rests when stowed

/**
 * The wand, carried up her right sleeve. draw() slides it out into her hand (a cast starts),
 * stow() slides it back (she switches to her fists); hidden while stowed. Spells leave from
 * its tip.
 */
export class Wand {
  readonly group = new THREE.Group();
  /** spells leave from here (rides on the wand, so it follows it as it is drawn) */
  readonly tip: SpellEmitter;
  private readonly model = new THREE.Group();
  private out = 0;                      // 0 stowed .. 1 in the hand
  private want = 0;

  constructor(hand: THREE.Bone) {
    const f = handFrame(hand, 'R');
    const body = new THREE.Mesh(lathe(0), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient() }));
    const outline = new THREE.Mesh(lathe(OUTLINE), new THREE.MeshBasicMaterial({ color: '#1a0f08', side: THREE.BackSide }));
    body.castShadow = true;
    body.name = 'wand';
    outline.name = 'wand_outline';
    // model space: +y from the knob to the tip; the grip point at BUTT
    this.model.add(body, outline);
    this.group.add(this.model);
    this.group.name = 'wand_mount';
    // in the hand: along the fingers, through the middle of the fist (a little towards the palm)
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.fingers);
    this.group.position.copy(f.fingers).multiplyScalar(0.05 * f.unit).addScaledVector(f.palm, 0.022 * f.unit);
    this.group.scale.setScalar(f.unit);
    hand.add(this.group);
    this.tip = new BoneEmitter(this.model, new THREE.Vector3(0, WAND_LENGTH + 0.012, 0), new THREE.Vector3(0, 1, 0));
    this.apply();
  }

  /** 0 stowed .. 1 fully in the hand (drives the grip too) */
  get drawn(): number {
    return this.out;
  }

  draw(): void {
    this.want = 1;
  }

  stow(): void {
    this.want = 0;
  }

  update(dt: number): void {
    if (this.out === this.want) return;
    const step = dt / (this.want > this.out ? DRAW_TIME : STOW_TIME);
    this.out = this.want > this.out ? Math.min(this.want, this.out + step) : Math.max(this.want, this.out - step);
    this.apply();
  }

  private apply(): void {
    const k = this.out * this.out * (3 - 2 * this.out);
    // slides along the forearm: from inside the sleeve (behind the wrist) to the grip
    this.model.position.y = -BUTT - SLEEVE * (1 - k);
    this.group.visible = this.out > 0.001;
  }
}

/**
 * Right hand closed round the wand in every animation: the finger bones take the fist of
 * the model's block clip (its last frame), applied after the mixer each frame.
 */
export class WandGrip {
  private readonly bones: { bone: THREE.Bone; q: THREE.Quaternion }[] = [];

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[], clipName = 'block') {
    const clip = clips.find((c) => c.name === clipName);
    if (!clip) return;
    const pose = new Map<string, THREE.Quaternion>();
    for (const track of clip.tracks) {
      const m = /^((?:index|middle|ring|pinky|thumb)\d_R)\.quaternion$/.exec(track.name);
      if (!m) continue;
      const v = track.values;
      const n = v.length;
      pose.set(m[1], new THREE.Quaternion(v[n - 4], v[n - 3], v[n - 2], v[n - 1]));
    }
    root.traverse((o) => {
      const q = pose.get(o.name);
      if (q && (o as THREE.Bone).isBone) this.bones.push({ bone: o as THREE.Bone, q });
    });
  }

  get boneCount(): number {
    return this.bones.length;
  }

  /** weight 0: the animated hand, 1: closed round the wand */
  apply(weight = 1): void {
    if (weight <= 0) return;
    for (const b of this.bones) {
      if (weight >= 1) b.bone.quaternion.copy(b.q);
      else b.bone.quaternion.slerp(b.q, weight);
    }
  }
}
