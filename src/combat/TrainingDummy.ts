import * as THREE from 'three';
import type { Height, HitEffect } from './moves';
import type { CombatTarget, HitBounds, HitReport, HitRequest, HitResult } from './CombatTarget';

export type { HitResult } from './CombatTarget';
export type Guard = 'none' | 'high' | 'low';

export const DUMMY_MAX_HP = 150;
/** collision / hurtbox radius (m) */
export const DUMMY_RADIUS = 0.16;

/** fraction of the damage that still gets through a block */
const CHIP = 0.2;
const DOWN_FALL = 0.35;          // s to topple over
const DOWN_LIE = 1.0;            // s lying down
const DOWN_RISE = 0.7;           // s to stand back up
const KNOCKBACK = 2.6;           // default slide speed of a 'knockback' hit (m/s)
const MAX_SLIDE = 1.0;           // the weighted base never slides further than this from its spot (m)
const HEIGHT = 1.63;             // top of the head (m)
const AIM_Y = 1.1;               // torso centre (m)

/**
 * A padded training dummy on a weighted base. It has hit points, an
 * optional guard (high or low) and reacts to clean hits: flinch, stagger,
 * knockback (rocks and slides back, then returns to its spot) and knockdown
 * (topples over, lies down, rights itself; can't be hit meanwhile).
 */
export class TrainingDummy implements CombatTarget {
  readonly name = 'Training Dummy';
  readonly root = new THREE.Group();
  hp = DUMMY_MAX_HP;
  guard: Guard = 'none';

  private readonly anchor = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();     // knockback slide
  private readonly offsetVel = new THREE.Vector3();
  private readonly body = new THREE.Group();         // pivots at the base
  private readonly pad: THREE.Mesh;
  private readonly torsoMat: THREE.MeshToonMaterial;
  private readonly padMat: THREE.MeshToonMaterial;
  private readonly tiltAxis = new THREE.Vector3(1, 0, 0);
  private tilt = 0;
  private tiltVel = 0;
  private wobble = 0;               // side-to-side sway (stagger)
  private wobbleVel = 0;
  private downTime = -1;            // >= 0 while knocked down
  private hitFlash = 0;
  private blockFlash = 0;
  private yaw = 0;

  constructor() {
    const toon = (color: string) => new THREE.MeshToonMaterial({ color });
    const wood = toon('#6b4a32');
    this.torsoMat = toon('#d8c7a0');
    this.padMat = toon('#1f5a3c');
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, parent: THREE.Object3D = this.body) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    // weighted base stays on the floor; everything else tips over
    add(new THREE.CylinderGeometry(0.22, 0.26, 0.1, 32), toon('#3b3f48'), 0.05, this.root);
    add(new THREE.CylinderGeometry(0.05, 0.06, 0.56, 16), wood, 0.28);              // post: base top -> into the body
    add(new THREE.CylinderGeometry(0.15, 0.13, 0.42, 28), this.torsoMat, 0.72);       // hips / legs
    add(new THREE.CylinderGeometry(0.16, 0.15, 0.4, 28), this.torsoMat, 1.14);         // chest
    for (const y of [0.93, 1.34]) add(new THREE.CylinderGeometry(0.165, 0.165, 0.03, 28), wood, y);   // straps
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 12), wood, 1.38);                 // neck
    add(new THREE.SphereGeometry(0.11, 24, 16), this.torsoMat, 1.52);                 // head
    // guard pad, moved in front of the head or the body
    this.pad = add(new THREE.BoxGeometry(0.28, 0.2, 0.05), this.padMat, 1.4);
    this.pad.position.z = 0.2;
    this.pad.visible = false;
    this.root.add(this.body);
    this.body.position.y = 0.1;
  }

  /** where it stands (moves back during knockback) */
  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /** can a strike connect right now? (not while knocked down / getting up) */
  get vulnerable(): boolean {
    return this.downTime < 0;
  }

  get down(): boolean {
    return this.downTime >= 0;
  }

  // --- CombatTarget

  get targetable(): boolean {
    return this.vulnerable;
  }

  getBounds(out: HitBounds): HitBounds {
    out.x = this.root.position.x;
    out.z = this.root.position.z;
    out.yMin = 0;
    out.yMax = HEIGHT;
    out.radius = DUMMY_RADIUS;
    return out;
  }

  getAimPoint(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.root.position.x, AIM_Y, this.root.position.z);
  }

  takeHit(hit: HitRequest): HitReport {
    return this.receive(hit.damage, hit.height, hit.effect, hit.dir, hit.knockback);
  }

  placeAt(p: THREE.Vector3, faceTowards: THREE.Vector3): void {
    this.anchor.set(p.x, 0, p.z);
    this.offset.set(0, 0, 0);
    this.offsetVel.set(0, 0, 0);
    this.root.position.copy(this.anchor);
    this.yaw = Math.atan2(faceTowards.x - p.x, faceTowards.z - p.z);
    this.root.rotation.y = this.yaw;
    this.tilt = this.tiltVel = this.wobble = this.wobbleVel = 0;
    this.downTime = -1;
    this.hp = DUMMY_MAX_HP;
  }

  setGuard(g: Guard): void {
    this.guard = g;
    this.pad.visible = g !== 'none';
    this.pad.position.y = g === 'high' ? 1.38 : 0.82;
  }

  /**
   * Resolve a strike. dir: unit vector from the attacker to the dummy.
   * A guard at the strike's height blocks it (chip damage, no reaction).
   * knockback: slide speed of a 'knockback' hit (m/s), KNOCKBACK by default.
   */
  receive(damage: number, height: Height, effect: HitEffect, dir: THREE.Vector3, knockback = KNOCKBACK): { result: HitResult; damage: number; ko: boolean } {
    if (!this.vulnerable) return { result: 'immune', damage: 0, ko: false };
    this.tiltAxis.set(dir.z, 0, -dir.x).normalize();          // tip away from the attacker
    this.tiltAxis.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -this.yaw);   // into the dummy's local frame
    if (this.guard === height) {
      const chip = Math.max(1, Math.round(damage * CHIP));
      this.hp = Math.max(0, this.hp - chip);
      this.tiltVel += 0.6;
      this.blockFlash = 1;
      const ko = this.hp === 0;
      if (ko) this.knockDown();
      return { result: 'blocked', damage: chip, ko };
    }
    this.hp = Math.max(0, this.hp - damage);
    this.hitFlash = 1;
    const ko = this.hp === 0;
    if (ko || effect === 'knockdown') {
      this.knockDown();
    } else if (effect === 'knockback') {
      // rocks back and slides; harder hits rock it further and set it wobbling (stagger)
      this.tiltVel += 4.2 * (knockback / KNOCKBACK);
      this.offsetVel.addScaledVector(dir, knockback);
      if (knockback > KNOCKBACK) this.wobbleVel += 2.0 * (Math.random() < 0.5 ? -1 : 1);
    } else if (effect === 'stagger') {
      this.tiltVel += 2.6;
      this.wobbleVel += 3.0 * (Math.random() < 0.5 ? -1 : 1);
    } else {
      this.tiltVel += 1.4;
    }
    return { result: 'hit', damage, ko };
  }

  private knockDown(): void {
    this.downTime = 0;
    this.tiltVel = 0;
    this.wobble = this.wobbleVel = 0;
  }

  update(dt: number, attacker: THREE.Vector3): void {
    if (this.downTime >= 0) {
      this.downTime += dt;
      const t = this.downTime;
      const lying = 1.45;
      if (t < DOWN_FALL) {
        const k = t / DOWN_FALL;
        this.tilt = lying * k * k;                            // accelerates as it falls
      } else if (t < DOWN_FALL + DOWN_LIE) {
        this.tilt = lying + 0.06 * Math.sin((t - DOWN_FALL) * 18) * Math.exp(-(t - DOWN_FALL) * 6);   // bounce
      } else if (t < DOWN_FALL + DOWN_LIE + DOWN_RISE) {
        const k = (t - DOWN_FALL - DOWN_LIE) / DOWN_RISE;
        this.tilt = lying * (1 - k * k * (3 - 2 * k));
      } else {
        this.downTime = -1;
        this.tilt = 0;
        this.tiltVel = -0.8;                                  // settles with a small rock
        if (this.hp === 0) this.hp = DUMMY_MAX_HP;           // back on its feet, fully repaired
      }
    } else {
      // weighted base: damped springs pull it upright
      this.tiltVel += (-60 * this.tilt - 7 * this.tiltVel) * dt;
      this.tilt += this.tiltVel * dt;
      this.wobbleVel += (-45 * this.wobble - 5 * this.wobbleVel) * dt;
      this.wobble += this.wobbleVel * dt;
      // turn to face the attacker slowly (it's on a swivel)
      const want = Math.atan2(attacker.x - this.root.position.x, attacker.z - this.root.position.z);
      const d = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
      this.yaw += d * (1 - Math.exp(-2.5 * dt));
      this.root.rotation.y = this.yaw;
    }
    // knockback slide, then the base drifts back to its spot
    this.offsetVel.addScaledVector(this.offset, -18 * dt).multiplyScalar(Math.exp(-6 * dt));
    this.offset.addScaledVector(this.offsetVel, dt);
    if (this.offset.length() > MAX_SLIDE) {
      this.offset.setLength(MAX_SLIDE);                     // the base drags on the floor
      this.offsetVel.multiplyScalar(0.3);
    }
    this.root.position.copy(this.anchor).add(this.offset);

    const q = new THREE.Quaternion().setFromAxisAngle(this.tiltAxis, this.tilt);
    this.body.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.wobble * 0.25));

    // flashes: red on a clean hit, white on the pad when blocked
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.blockFlash = Math.max(0, this.blockFlash - dt * 5);
    this.torsoMat.emissive.setRGB(0.8 * this.hitFlash, 0.1 * this.hitFlash, 0.08 * this.hitFlash);
    this.padMat.emissive.setRGB(0.7 * this.blockFlash, 0.8 * this.blockFlash, 0.75 * this.blockFlash);
  }
}
