import * as THREE from 'three';
import type { CombatTarget, HitReport } from '../CombatTarget';
import type { Projectile } from './Projectile';
import type { SpellDef, SpellEvent } from './SpellSystem';
import { sweepBox } from './collision';
import { ParticlePool } from './fx/ParticlePool';

/*
 * Hermione's Plate Barrage (Oppugno on the Great Hall's dinner service). Her strongest attack,
 * and it needs preparation:
 * - the wind-up (the cast_plates clip, up to its release): the plates rise off the house
 *   tables into a fan round her. Hit her now and the whole barrage drops and shatters;
 * - at the release she fires them one after another, fast and straight (no homing after
 *   launch), each aimed where Malfoid will be (the aim comes from her AI, which leads Malfoid's
 *   movement and learns which way she likes to dodge).
 * A guard takes each plate as chip damage, a wall or the floor stops it, Protego stops it, and a
 * perfect Protego sends one plate of the volley back at her (only one: the rest keep coming).
 * Each plate shatters into a few light shards. Plates come from the tables (limited ammunition,
 * restocked between rounds: the arena's job). All tuning here; the number per level is in
 * HERMIONE_DIFFICULTY.
 */
export const PLATES_RELEASE = 1.1;       // s into cast_plates: the wind-up ends, the first plate flies (combat.PLATES_RELEASE)
export const PLATES = {
  plates: 10,            // per barrage (Normal)
  riseTime: 0.7,         // s from a table to its place in the fan
  riseStagger: 0.035,    // s between plates starting to rise
  launchGap: 0.13,       // s between plates leaving the fan
  speed: 15.0,           // m/s, straight
  life: 2.2,             // s of flight at most (33 m)
  damage: 4,             // per plate
  radius: 0.13,          // m: a dinner plate's own size for hits and walls
  reflectsPerVolley: 1,  // a perfect Protego sends back only this many of one barrage
  gravity: 9.8,          // m/s^2: an interrupted barrage falls
  /** the fan round her: plates either side of her, a little behind her shoulders, rising in ranks */
  fan: { radius: 0.85, radiusStep: 0.06, height: 1.45, heightStep: 0.16, angle: 0.75, angleStep: 0.24 },
};

export const PLATES_SPELL: SpellDef = {
  id: 'plates',
  name: 'Oppugno',
  key: '',
  clip: 'cast_plates',
  castDuration: 2.75,
  release: PLATES_RELEASE,
  cooldown: 11.0,
  projectile: { speed: PLATES.speed, radius: PLATES.radius, maxRange: 33 },   // (no bolt: plates)
  directDamage: PLATES.damage,
  splashDamage: 0,
  explosionRadius: 0,
  directKnockback: 0.3,
  splashKnockback: 0,
  faceAngle: Math.PI,
  aimAngle: Math.PI,
  aimRange: 30.0,
  hitEffect: 'flinch',
  summon: 'plates',
};

export type PlateState = 'idle' | 'rising' | 'hover' | 'flying' | 'falling';
export type PlateEnd = 'hit' | 'shielded' | 'wall' | 'floor' | 'faded';

export interface Plate {
  state: PlateState;
  readonly pos: THREE.Vector3;
  readonly prev: THREE.Vector3;
  /** where it rose from (a table), and its place in the fan */
  readonly from: THREE.Vector3;
  slot: number;
  /** unit flight direction; velocity while falling */
  readonly dir: THREE.Vector3;
  readonly vel: THREE.Vector3;
  /** s in its current state; s before it starts rising / is launched */
  t: number;
  delay: number;
  /** 0..1 per plate: its own bob and spin */
  seed: number;
  target: CombatTarget | null;
  owner: CombatTarget | null;
  reflected: boolean;
  /** conjured where it hovers (no table to rise from): it grows in */
  conjured: boolean;
}

/** where the barrage's caster is (her position and facing) */
export interface PlateCaster {
  readonly position: THREE.Vector3;
  readonly facingAngle: number;
}

/** where a plate leaving `from` should fly at (the AI's prediction of Malfoid) */
export type PlateAim = (from: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3;

/**
 * The barrage's logic (no drawing: Node-testable). levitate() starts the wind-up, fire() the
 * launches, interrupt() drops what hasn't flown; update() moves the plates in game time and
 * resolves their hits.
 */
export class PlateBarrage {
  readonly plates: Plate[] = [];
  /** the same events a spell sends (the HUD shows the damage, Protego's feedback, sounds) */
  onEvent: ((e: SpellEvent) => void) | null = null;
  /** a plate is gone: shattered (for its shards and its crash) */
  onEnd: ((p: Plate, how: PlateEnd) => void) | null = null;
  cfg = { ...PLATES, fan: { ...PLATES.fan } };
  private caster: PlateCaster | null = null;
  private aim: PlateAim | null = null;
  /** other things a plate in flight strikes when it meets them (Malfoid's Illusio copies: popped) */
  extraTargets: readonly CombatTarget[] = [];
  private reflected = 0;
  /** how many plates this volley has (the fan is laid out for all of them) */
  private volley = 1;
  /** plates still to launch, in launch order */
  private queue: Plate[] = [];
  private readonly v = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly bounds = { x: 0, z: 0, yMin: 0, yMax: 0, radius: 0 };
  private readonly fake = { direction: new THREE.Vector3() } as unknown as Projectile;

  constructor(capacity = 12) {
    for (let i = 0; i < capacity; i++) {
      this.plates.push({ state: 'idle', pos: new THREE.Vector3(), prev: new THREE.Vector3(), from: new THREE.Vector3(), slot: 0,
        dir: new THREE.Vector3(0, 0, 1), vel: new THREE.Vector3(), t: 0, delay: 0, seed: 0, target: null, owner: null,
        reflected: false, conjured: false });
    }
  }

  /** plates in the air (rising, hovering, flying or falling) */
  get active(): number {
    return this.plates.filter((p) => p.state !== 'idle').length;
  }

  /** plates waiting in the fan (risen, not yet launched) */
  get ready(): number {
    return this.plates.filter((p) => p.state === 'rising' || p.state === 'hover').length;
  }

  /**
   * the wind-up: `count` plates rise from `sources` (table places, world; fewer sources than
   * plates: the rest are conjured in the fan) to the fan round the caster
   */
  levitate(caster: PlateCaster, sources: readonly THREE.Vector3[], count = this.cfg.plates): number {
    this.caster = caster;
    this.queue = [];
    this.reflected = 0;
    let n = 0;
    for (const p of this.plates) {
      if (p.state !== 'idle') continue;
      if (n >= count) break;
      p.slot = n;
      p.seed = (n * 0.618 + 0.31) % 1;
      p.reflected = false;
      p.target = p.owner = null;
      p.t = 0;
      p.delay = n * this.cfg.riseStagger;
      p.conjured = n >= sources.length;
      if (p.conjured) this.slotPosition(n, count, p.from, caster);
      else p.from.copy(sources[n]);
      p.pos.copy(p.from);
      p.prev.copy(p.from);
      p.state = 'rising';
      this.queue.push(p);
      n++;
    }
    // launch order: the front ranks first, alternating sides (the fan's slots alternate already)
    this.volley = Math.max(1, n);
    return n;
  }

  /** the release: the plates in the fan fly at `target` one after another, each aimed by `aim` */
  fire(target: CombatTarget, owner: CombatTarget | null, aim: PlateAim): void {
    this.aim = aim;
    let i = 0;
    for (const p of this.queue) {
      if (p.state !== 'rising' && p.state !== 'hover') continue;
      p.target = target;
      p.owner = owner;
      p.delay = i * this.cfg.launchGap;
      i++;
    }
    this.queue = this.queue.filter((p) => p.target);
  }

  /** the caster was hit during the wind-up (or before every plate flew): what hasn't flown falls */
  interrupt(): number {
    let n = 0;
    for (const p of this.plates) {
      if (p.state !== 'rising' && p.state !== 'hover') continue;
      p.state = 'falling';
      p.t = 0;
      const a = p.seed * 6.28;
      p.vel.set(Math.cos(a) * 0.6, 0.4, Math.sin(a) * 0.6);
      n++;
    }
    this.queue = [];
    return n;
  }

  reset(): void {
    for (const p of this.plates) p.state = 'idle';
    this.queue = [];
    this.caster = null;
  }

  update(dt: number, solids: readonly THREE.Box3[]): void {
    const c = this.cfg;
    const count = this.volley;
    for (const p of this.plates) {
      if (p.state === 'idle') continue;
      p.prev.copy(p.pos);
      if (p.state === 'rising' || p.state === 'hover') {
        if (!this.caster) {
          this.interruptOne(p);
          continue;
        }
        // launched? (fire() set its target and its launch delay)
        if (p.target) {
          p.delay -= dt;
          if (p.delay <= 0) {
            this.launch(p);
            continue;
          }
        } else if (p.state === 'rising' && p.delay > 0) {
          p.delay -= dt;
          continue;
        }
        p.t += dt;
        const slot = this.slotPosition(p.slot, count, this.v);
        if (p.state === 'rising') {
          const k = Math.min(1, p.t / c.riseTime);
          const s = k * k * (3 - 2 * k);
          p.pos.lerpVectors(p.from, slot, s);
          if (!p.conjured) p.pos.y += Math.sin(Math.PI * k) * 0.35;         // an arc up off the table
          if (k >= 1) {
            p.state = 'hover';
            p.t = 0;
          }
        } else {
          // hovering: following her, bobbing
          p.pos.copy(slot);
          p.pos.y += 0.04 * Math.sin(p.t * 3.1 + p.seed * 9);
        }
        continue;
      }
      if (p.state === 'falling') {
        p.t += dt;
        p.vel.y -= c.gravity * dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.pos.y <= 0.03) {
          p.pos.y = 0.03;
          this.end(p, 'floor');
        }
        continue;
      }
      // flying: straight
      p.t += dt;
      p.pos.addScaledVector(p.dir, c.speed * dt);
      if (p.t >= c.life || !p.target?.targetable) {
        this.end(p, 'faded');
        continue;
      }
      if (p.pos.y <= 0.04) {
        p.pos.y = 0.04;
        this.end(p, 'floor');
        continue;
      }
      let wall = false;
      for (const box of solids) {
        if (sweepBox(p.prev, p.pos, c.radius, box) >= 0) {
          wall = true;
          break;
        }
      }
      if (wall) {
        this.end(p, 'wall');
        continue;
      }
      const t = p.target;
      const bb = t.getBounds(this.bounds);
      if (this.crosses(p, bb)) {
        this.strike(p, t);
        continue;
      }
      // (a plate sent back at her strikes only her)
      if (p.reflected) continue;
      for (const x of this.extraTargets) {
        if (x === t || !x.targetable || !this.crosses(p, x.getBounds(this.bounds))) continue;
        this.strike(p, x);
        break;
      }
    }
  }

  /** world position of slot i of n in the fan round the caster: alternately either side of her,
   *  the front ranks lowest, the later ones further round behind her and higher */
  slotPosition(i: number, n: number, out: THREE.Vector3, caster: PlateCaster | null = this.caster): THREE.Vector3 {
    const f = this.cfg.fan;
    const c = caster;
    const side = i % 2 === 0 ? -1 : 1;
    const rank = Math.floor(i / 2);
    const ranks = Math.max(1, Math.ceil(n / 2));
    const face = c ? c.facingAngle : 0;
    // (more ranks squeeze closer so the last stays beside her, not right behind her)
    const a = face + side * (f.angle + rank * f.angleStep * Math.min(1, 5 / Math.max(1, ranks - 1)));
    const r = f.radius + rank * f.radiusStep;
    const y = f.height + rank * f.heightStep;
    const o = c ? c.position : this.v2.set(0, 0, 0);
    return out.set(o.x + Math.sin(a) * r, y, o.z + Math.cos(a) * r);
  }

  /** has the plate's last step passed through the hurt volume (a fast plate can't skip it) */
  private crosses(p: Plate, bb: { x: number; z: number; yMin: number; yMax: number; radius: number }): boolean {
    const steps = 4;
    for (let k = 1; k <= steps; k++) {
      const x = p.prev.x + ((p.pos.x - p.prev.x) * k) / steps;
      const y = p.prev.y + ((p.pos.y - p.prev.y) * k) / steps;
      const z = p.prev.z + ((p.pos.z - p.prev.z) * k) / steps;
      if (Math.hypot(x - bb.x, z - bb.z) < bb.radius + this.cfg.radius && y >= bb.yMin && y <= bb.yMax) return true;
    }
    return false;
  }

  private launch(p: Plate): void {
    const aim = this.aim ? this.aim(p.pos, this.v) : p.target!.getAimPoint(this.v);
    p.dir.subVectors(aim, p.pos);
    if (p.dir.lengthSq() < 1e-6) p.dir.set(0, 0, 1);
    p.dir.normalize();
    p.state = 'flying';
    p.t = 0;
    p.prev.copy(p.pos);
    this.onEvent?.({ type: 'release', spell: PLATES_SPELL });
  }

  private interruptOne(p: Plate): void {
    p.state = 'falling';
    p.t = 0;
    p.vel.set(0, 0, 0);
  }

  private strike(p: Plate, t: CombatTarget): void {
    // a shield in front of her: it stops the plate, or (a parry, once a volley) sends it back
    (this.fake.direction as THREE.Vector3).copy(p.dir);
    let shield = t.intercept ? t.intercept(PLATES_SPELL, this.fake) : null;
    const at = p.pos.clone();
    if (shield === 'reflect' && (!p.owner || p.reflected || this.reflected >= this.cfg.reflectsPerVolley)) shield = 'absorb';
    if (shield === 'reflect' && p.owner) {
      this.reflected++;
      p.reflected = true;
      p.target = p.owner;
      p.owner = null;
      p.target.getAimPoint(this.v);
      p.dir.subVectors(this.v, p.pos).normalize();
      p.t = 0;
      this.onEvent?.({ type: 'reflected', spell: PLATES_SPELL, target: t, at });
      return;
    }
    if (shield) {
      this.onEvent?.({ type: 'shielded', spell: PLATES_SPELL, target: t, at });
      this.end(p, 'shielded');
      return;
    }
    const dir = this.v2.copy(p.dir).setY(0);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
    dir.normalize();
    const bb = t.getBounds(this.bounds);
    const height = p.pos.y >= bb.yMin + 0.78 * (bb.yMax - bb.yMin) ? 'high' : 'low';
    const report: HitReport = t.takeHit({ damage: this.cfg.damage, height, effect: 'flinch', dir,
      knockback: PLATES_SPELL.directKnockback });
    if (report.result !== 'immune') this.onEvent?.({ type: 'hit', spell: PLATES_SPELL, target: t, direct: true, report, at });
    this.end(p, 'hit');
  }

  private end(p: Plate, how: PlateEnd): void {
    p.state = 'idle';
    this.onEnd?.(p, how);
  }
}

// ------------------------------------------------------------------ drawing

/** a dinner plate (lathe): white porcelain, a gold band on the rim; ~26 cm across, lying flat (normal +y) */
export function plateGeometry(segments = 20): THREE.BufferGeometry {
  const prof: [number, number][] = [
    [0.0, 0.004], [0.06, 0.004], [0.075, 0.0], [0.082, 0.003], [0.09, 0.009], [0.118, 0.016], [0.13, 0.019],
    [0.131, 0.022], [0.124, 0.021], [0.1, 0.014], [0.085, 0.011], [0.0, 0.009],
  ];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const white = new THREE.Color('#f4f1ea');
  const gold = new THREE.Color('#c9a24a');
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    (r > 0.112 && r < 0.127 ? gold : white).toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const SHARDS = 140;
const SHARD_LIFE = 1.1;

/**
 * The plates as drawn: one instanced mesh (risen plates face their target, flying ones spin
 * flat like a thrown dish), and the shards of shattered ones (an instanced pool with a little
 * physics: they bounce once and settle). A gold shimmer trails the rising plates. No lights.
 */
export class PlateFx {
  private readonly mesh: THREE.InstancedMesh;
  private readonly shards: THREE.InstancedMesh;
  private readonly shimmer = new ParticlePool(120);
  private readonly shard: { alive: boolean; pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; t: number; s: number }[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly v = new THREE.Vector3();
  private clock = 0;
  private sparkle = 0;

  constructor(scene: THREE.Scene, private readonly barrage: PlateBarrage) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(plateGeometry(), mat, barrage.plates.length);
    this.mesh.castShadow = true;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.03, 0.025, 0, -0.015, -0.02, 0, -0.02]), 3));
    sg.computeVertexNormals();
    this.shards = new THREE.InstancedMesh(sg, new THREE.MeshLambertMaterial({ color: '#f1ede4', side: THREE.DoubleSide }), SHARDS);
    for (const im of [this.mesh, this.shards]) {
      im.frustumCulled = false;                    // (instanced: culled all or nothing)
      im.count = 0;
      im.name = im === this.mesh ? 'plates' : 'plate_shards';
      scene.add(im);
    }
    for (let i = 0; i < SHARDS; i++) {
      this.shard.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(),
        spin: new THREE.Vector3(), t: 0, s: 1 });
    }
    this.shimmer.points.name = 'plate_shimmer';
    scene.add(this.shimmer.points);
    const prev = barrage.onEnd;
    barrage.onEnd = (p, how) => {
      prev?.(p, how);
      if (how !== 'faded') this.shatter(p.pos, p.dir, how === 'floor' ? 5 : 7);
    };
  }

  setView(camera: THREE.PerspectiveCamera, viewportHeightPx: number): void {
    this.shimmer.setScale(viewportHeightPx, camera.fov);
  }

  private shatter(at: THREE.Vector3, dir: THREE.Vector3, count: number): void {
    let n = 0;
    for (const s of this.shard) {
      if (s.alive) continue;
      if (n >= count) break;
      const a = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 1.8;
      s.alive = true;
      s.t = 0;
      s.s = 0.7 + Math.random() * 0.8;
      s.pos.copy(at);
      s.vel.set(Math.cos(a) * sp - dir.x * 1.2, 1.2 + Math.random() * 1.6, Math.sin(a) * sp - dir.z * 1.2);
      s.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.spin.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
      n++;
    }
  }

  update(dt: number): void {
    this.clock += dt;
    this.sparkle += dt;
    const spark = this.sparkle > 0.05;
    if (spark) this.sparkle = 0;
    let i = 0;
    for (const p of this.barrage.plates) {
      if (p.state === 'idle') continue;
      if (p.state === 'rising' && p.delay > 0 && !p.target) continue;
      let k = 1;
      if (p.state === 'flying') {
        // thrown flat, spinning about its own axis, tipped a little towards its flight
        this.v.copy(p.dir).setY(0);
        const tilt = this.v.lengthSq() > 1e-6 ? 0.25 : 0;
        this.q.setFromAxisAngle(this.v.set(-p.dir.z, 0, p.dir.x).normalize(), tilt);
        this.q2.setFromAxisAngle(this.up, this.clock * 22 + p.seed * 6);
        this.q.multiply(this.q2);
      } else if (p.state === 'falling') {
        this.q.setFromEuler(new THREE.Euler(p.t * 7 + p.seed * 3, 0, p.t * 4));
      } else {
        // risen: stood on edge, its face towards where it will fly, wobbling
        const c = p.state === 'rising' ? Math.min(1, p.t / this.barrage.cfg.riseTime) : 1;
        this.q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (Math.PI / 2) * c);
        this.q2.setFromAxisAngle(this.up, this.clock * 0.8 + p.seed * 6);
        this.q.premultiply(this.q2);
        if (p.conjured) k = Math.min(1, p.t / 0.25);
        if (spark && Math.random() < 0.6) {
          this.shimmer.spawn({ x: p.pos.x + (Math.random() - 0.5) * 0.2, y: p.pos.y - 0.05, z: p.pos.z + (Math.random() - 0.5) * 0.2,
            vx: 0, vy: -0.25, vz: 0, r: 1.0, g: 0.86, b: 0.5, size: 0.035, sizeEnd: 0.0, life: 0.5, drag: 1.0, gravity: 0, alpha: 0.8 });
        }
      }
      this.s.setScalar(Math.max(0.001, k));
      this.m.compose(p.pos, this.q, this.s);
      this.mesh.setMatrixAt(i++, this.m);
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    // the shards: fly, bounce once off the floor, settle and shrink away
    let j = 0;
    for (const s of this.shard) {
      if (!s.alive) continue;
      s.t += dt;
      if (s.t >= SHARD_LIFE) {
        s.alive = false;
        continue;
      }
      s.vel.y -= 9.8 * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y < 0.01) {
        s.pos.y = 0.01;
        s.vel.multiplyScalar(0.35);
        s.vel.y = Math.abs(s.vel.y) * 0.3;
        s.spin.multiplyScalar(0.3);
      }
      s.rot.x += s.spin.x * dt;
      s.rot.y += s.spin.y * dt;
      s.rot.z += s.spin.z * dt;
      this.q.setFromEuler(s.rot);
      this.s.setScalar(s.s * Math.min(1, (SHARD_LIFE - s.t) / 0.3));
      this.m.compose(s.pos, this.q, this.s);
      this.shards.setMatrixAt(j++, this.m);
    }
    this.shards.count = j;
    this.shards.instanceMatrix.needsUpdate = true;
    this.shimmer.update(dt);
  }

  /** nothing in the air (a new round) */
  reset(): void {
    this.barrage.reset();
    for (const s of this.shard) s.alive = false;
    this.mesh.count = 0;
    this.shards.count = 0;
  }
}
