import * as THREE from 'three';
import type { CombatTarget, HitReport } from '../CombatTarget';
import type { Projectile } from './Projectile';
import type { SpellDef, SpellEvent } from './SpellSystem';
import { sweepBox } from './collision';
import { ParticlePool } from './fx/ParticlePool';

/*
 * Oppugno (Luna's): a small flock of conjured yellow birds that chase the target and strike one
 * after another. Mechanically unlike a bolt: each bird homes in with a limited turn rate, so a
 * late sidestep makes them overshoot and swing round again while they last; each hit is small
 * (a flinch), the threat is the string of them. A guard takes each as chip damage, a wall stops
 * them, Protego pops them (and a perfectly timed one sends a bird back at its caster). Cast like
 * a spell (the cast_oppugno clip, a cooldown); the flock is summoned at the release. All tuning
 * here; the number of birds per difficulty is in LUNA_DIFFICULTY.
 */
export const OPPUGNO_RELEASE = 0.42;     // s into cast_oppugno (combat.OPPUGNO_RELEASE)
export const OPPUGNO = {
  birds: 5,              // per cast (Normal)
  launchGap: 0.09,       // s between birds leaving the wand
  speed: 7.0,            // m/s
  turnRate: 2.6,         // rad/s at first: how sharply a bird can turn (a late sidestep beats it) ...
  turnGrowth: 1.2,       // ... growing by this much per s of steering, so it closes in after an
                         // overshoot (at a fixed rate a bird circles its target for ever); a dive
                         // starts it over (a bird that missed swings round slowly)
  dive: 1.3,             // m from the target: the bird commits to a straight dive ...
  diveTime: 0.45,        // ... for this long (s): step aside then and it shoots past
  scatterTime: 0.32,     // s: leaving the wand they fan out before turning on the target
  life: 3.4,             // s before a bird fades away (time to come back once after a miss)
  damage: 3,             // per bird
  radius: 0.12,          // m: a bird's own size for hits and walls
  minY: 0.35,            // m: they keep above the floor
};

export const OPPUGNO_SPELL: SpellDef = {
  id: 'oppugno',
  name: 'Oppugno',
  key: '',
  clip: 'cast_oppugno',
  castDuration: 0.75,
  release: OPPUGNO_RELEASE,
  cooldown: 10.0,
  projectile: { speed: OPPUGNO.speed, radius: OPPUGNO.radius, maxRange: 20 },   // (no bolt: birds)
  directDamage: OPPUGNO.damage,
  splashDamage: 0,
  explosionRadius: 0,
  directKnockback: 0.2,
  splashKnockback: 0,
  faceAngle: (80 * Math.PI) / 180,
  aimAngle: (70 * Math.PI) / 180,
  aimRange: 12.0,
  hitEffect: 'flinch',
  summon: 'oppugno',
};

export interface Bird {
  alive: boolean;
  readonly pos: THREE.Vector3;
  readonly prev: THREE.Vector3;
  /** unit flight direction */
  readonly dir: THREE.Vector3;
  age: number;
  /** s before it leaves the wand */
  delay: number;
  target: CombatTarget | null;
  /** who sent it (a reflected bird turns on her) */
  owner: CombatTarget | null;
  /** 0..1 per bird: its own approach offset and wing beat */
  seed: number;
  /** sent back by a shield (it can't be sent back again) */
  reflected: boolean;
  /** s left of its committed dive (no steering) */
  dive: number;
  /** s it has been steering since leaving the wand or its last dive */
  steer: number;
}

export type BirdEnd = 'hit' | 'shielded' | 'wall' | 'faded';

/**
 * The flock's logic (no drawing: Node-testable). launch() sends `count` birds from the wand at
 * a target; update() flies them in game time and resolves their hits.
 */
export class OppugnoFlock {
  readonly birds: Bird[] = [];
  /** the same events a spell sends (the HUD shows the damage, Protego's feedback, sounds) */
  onEvent: ((e: SpellEvent) => void) | null = null;
  /** a bird is gone (for its puff of feathers) */
  onEnd: ((b: Bird, how: BirdEnd) => void) | null = null;
  cfg = { ...OPPUGNO };
  private readonly v = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly bounds = { x: 0, z: 0, yMin: 0, yMax: 0, radius: 0 };
  private readonly fake = { direction: new THREE.Vector3() } as unknown as Projectile;

  constructor(capacity = 8) {
    for (let i = 0; i < capacity; i++) {
      this.birds.push({ alive: false, pos: new THREE.Vector3(), prev: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1),
        age: 0, delay: 0, target: null, owner: null, seed: 0, reflected: false, dive: 0, steer: 0 });
    }
  }

  get alive(): number {
    return this.birds.filter((b) => b.alive).length;
  }

  /** count birds from `origin`, heading out along `dir` (her facing) at `target` */
  launch(origin: THREE.Vector3, dir: THREE.Vector3, target: CombatTarget, owner: CombatTarget | null, count = this.cfg.birds): void {
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    let n = 0;
    for (const b of this.birds) {
      if (b.alive) continue;
      if (n >= count) break;
      // fanned out: alternately left and right of her line, rising
      const k = count > 1 ? n / (count - 1) - 0.5 : 0;
      b.alive = true;
      b.pos.copy(origin);
      b.prev.copy(origin);
      b.dir.copy(dir).setY(0).normalize().addScaledVector(side, k * 1.1).setY(0.3 + 0.15 * Math.abs(k)).normalize();
      b.age = 0;
      b.delay = n * this.cfg.launchGap;
      b.target = target;
      b.owner = owner;
      b.seed = (n * 0.618 + 0.17) % 1;
      b.reflected = false;
      b.dive = 0;
      b.steer = 0;
      n++;
    }
  }

  reset(): void {
    for (const b of this.birds) b.alive = false;
  }

  update(dt: number, solids: readonly THREE.Box3[]): void {
    const c = this.cfg;
    for (const b of this.birds) {
      if (!b.alive) continue;
      if (b.delay > 0) {
        b.delay -= dt;
        continue;
      }
      b.age += dt;
      if (b.age >= c.life || !b.target?.targetable) {
        this.end(b, 'faded');
        continue;
      }
      // steer: after the scatter, turn (at most turnRate) towards the target's chest, each bird
      // from its own side, fluttering a little; close in, it commits to a straight dive
      if (b.dive > 0) {
        b.dive -= dt;
        b.steer = 0;
      } else if (b.age > c.scatterTime) {
        b.steer += dt;
        const aim = b.target.getAimPoint(this.v);
        const off = (b.seed - 0.5) * 0.5;
        aim.x += Math.cos(b.seed * 6.28) * off;
        aim.z += Math.sin(b.seed * 6.28) * off;
        aim.y += 0.15 * Math.sin(b.age * 7 + b.seed * 9);
        const want = aim.sub(b.pos);
        if (want.length() < c.dive) b.dive = c.diveTime;
        want.normalize();
        const ang = b.dir.angleTo(want);
        if (ang > 1e-4) {
          const step = Math.min(1, (c.turnRate * (1 + c.turnGrowth * b.steer) * dt) / ang);
          b.dir.lerp(want, step).normalize();
        }
      }
      b.prev.copy(b.pos);
      b.pos.addScaledVector(b.dir, c.speed * dt);
      if (b.pos.y < c.minY) {
        b.pos.y = c.minY;
        b.dir.y = Math.max(b.dir.y, 0.1);
        b.dir.normalize();
      }
      // a wall in the way
      let wall = false;
      for (const box of solids) {
        if (sweepBox(b.prev, b.pos, c.radius, box) >= 0) {
          wall = true;
          break;
        }
      }
      if (wall) {
        this.end(b, 'wall');
        continue;
      }
      // reached its target
      const t = b.target;
      const bb = t.getBounds(this.bounds);
      if (Math.hypot(b.pos.x - bb.x, b.pos.z - bb.z) < bb.radius + c.radius && b.pos.y >= bb.yMin && b.pos.y <= bb.yMax) {
        this.strike(b, t);
      }
    }
  }

  private strike(b: Bird, t: CombatTarget): void {
    // a shield in front of her: it stops the bird, or (a parry) sends it back at its caster
    (this.fake.direction as THREE.Vector3).copy(b.dir);
    const shield = t.intercept ? t.intercept(OPPUGNO_SPELL, this.fake) : null;
    const at = b.pos.clone();
    if (shield === 'reflect' && b.owner && !b.reflected) {
      b.reflected = true;
      b.target = b.owner;
      b.owner = null;
      b.dir.multiplyScalar(-1);
      b.dive = 0;
      b.age = Math.min(b.age, this.cfg.life - 2.5);         // time enough to get back to her
      this.onEvent?.({ type: 'reflected', spell: OPPUGNO_SPELL, target: t, at });
      return;
    }
    if (shield) {
      this.onEvent?.({ type: 'shielded', spell: OPPUGNO_SPELL, target: t, at });
      this.end(b, 'shielded');
      return;
    }
    const dir = this.v2.copy(b.dir).setY(0);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
    dir.normalize();
    const bb = t.getBounds(this.bounds);
    const height = b.pos.y >= bb.yMin + 0.78 * (bb.yMax - bb.yMin) ? 'high' : 'low';
    const report: HitReport = t.takeHit({ damage: this.cfg.damage, height, effect: 'flinch', dir,
      knockback: OPPUGNO_SPELL.directKnockback });
    this.onEvent?.({ type: 'hit', spell: OPPUGNO_SPELL, target: t, direct: true, report, at });
    this.end(b, 'hit');
  }

  private end(b: Bird, how: BirdEnd): void {
    b.alive = false;
    this.onEnd?.(b, how);
  }
}

/*
 * The birds as drawn: canary yellow, a rounded body with an orange beak, two wings beating fast.
 * Three instanced meshes (bodies, left wings, right wings) for the whole flock, plus a few
 * feathers puffing out when a bird is gone. Generated geometry, no lights.
 */
const BIRD_LOOK = {
  body: '#f2c53a',
  wing: '#ffe17a',
  beak: '#e8792a',
  scale: 1.0,            // the bird is ~16 cm from beak to tail
  flap: 18,              // rad/s wing beat
  flapAngle: 0.9,        // rad either way
};

function birdBody(): THREE.BufferGeometry {
  // a teardrop body along +z (beak forward), a small beak cone
  const body = new THREE.SphereGeometry(0.045, 10, 8);
  body.scale(0.85, 0.8, 1.6);
  const head = new THREE.SphereGeometry(0.032, 8, 6);
  head.translate(0, 0.025, 0.06);
  const beak = new THREE.ConeGeometry(0.012, 0.03, 6);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.022, 0.098);
  const tail = new THREE.ConeGeometry(0.025, 0.06, 4);
  tail.rotateX(-Math.PI / 2);
  tail.scale(1.4, 0.35, 1);
  tail.translate(0, 0.005, -0.085);
  const col = new THREE.Color(BIRD_LOOK.body);
  const beakCol = new THREE.Color(BIRD_LOOK.beak);
  const parts: [THREE.BufferGeometry, THREE.Color][] = [[body, col], [head, col], [beak, beakCol], [tail, col]];
  const geos = parts.map(([g, c]) => {
    const n = g.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g.index ? g.toNonIndexed() : g;
  });
  return mergeGeos(geos);
}

function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const total = geos.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    g.computeVertexNormals();
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    col.set(g.getAttribute('color').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return m;
}

function wing(side: 1 | -1): THREE.BufferGeometry {
  // a rounded triangle hinged at the body's side (x = 0), reaching out along +x * side
  const g = new THREE.BufferGeometry();
  const s = side;
  const v = [0, 0, 0.035, 0.11 * s, 0, -0.005, 0.075 * s, 0, -0.045, 0, 0, -0.035];
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  g.setIndex(s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  g.computeVertexNormals();
  return g;
}

export class OppugnoFx {
  private readonly bodies: THREE.InstancedMesh;
  private readonly wingsL: THREE.InstancedMesh;
  private readonly wingsR: THREE.InstancedMesh;
  private readonly feathers = new ParticlePool(160);
  private readonly m = new THREE.Matrix4();
  private readonly mw = new THREE.Matrix4();
  private readonly mt = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly fwd = new THREE.Vector3(0, 0, 1);
  private clock = 0;

  constructor(scene: THREE.Scene, private readonly flock: OppugnoFlock) {
    const n = flock.birds.length;
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const wingMat = new THREE.MeshLambertMaterial({ color: BIRD_LOOK.wing, side: THREE.DoubleSide });
    this.bodies = new THREE.InstancedMesh(birdBody(), bodyMat, n);
    this.wingsL = new THREE.InstancedMesh(wing(1), wingMat, n);
    this.wingsR = new THREE.InstancedMesh(wing(-1), wingMat, n);
    for (const im of [this.bodies, this.wingsL, this.wingsR]) {
      im.frustumCulled = false;                    // (instanced: culled all or nothing)
      im.count = 0;
      im.name = 'oppugno_birds';
      scene.add(im);
    }
    this.feathers.points.name = 'oppugno_feathers';
    scene.add(this.feathers.points);
    const prev = flock.onEnd;
    flock.onEnd = (b, how) => {
      prev?.(b, how);
      this.puff(b.pos, how === 'faded' ? 5 : 10);
    };
  }

  setView(camera: THREE.PerspectiveCamera, viewportHeightPx: number): void {
    this.feathers.setScale(viewportHeightPx, camera.fov);
  }

  private puff(at: THREE.Vector3, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const sp = 0.8 + Math.random() * 1.2;
      const yellow = Math.random() < 0.7;
      this.feathers.spawn({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * r * sp, vy: u * sp + 0.4, vz: Math.sin(a) * r * sp,
        r: 1.0, g: yellow ? 0.85 : 1.0, b: yellow ? 0.35 : 0.95, size: 0.05, sizeEnd: 0.02, life: 0.5 + Math.random() * 0.3,
        drag: 3.0, gravity: -2.5, alpha: 0.9 });
    }
  }

  update(dt: number): void {
    this.clock += dt;
    let i = 0;
    for (const b of this.flock.birds) {
      if (!b.alive || b.delay > 0) continue;
      this.q.setFromUnitVectors(this.fwd, b.dir);
      // fading in as it leaves the wand, out at the end of its life
      const k = BIRD_LOOK.scale * Math.min(1, b.age / 0.12) * Math.min(1, (this.flock.cfg.life - b.age) / 0.25);
      this.s.setScalar(Math.max(0.001, k));
      this.m.compose(b.pos, this.q, this.s);
      this.bodies.setMatrixAt(i, this.m);
      const flap = Math.sin(this.clock * BIRD_LOOK.flap + b.seed * 20) * BIRD_LOOK.flapAngle;
      this.wingsL.setMatrixAt(i, this.mt.multiplyMatrices(this.m, this.mw.makeRotationZ(flap)));
      this.wingsR.setMatrixAt(i, this.mt.multiplyMatrices(this.m, this.mw.makeRotationZ(-flap)));
      i++;
    }
    for (const im of [this.bodies, this.wingsL, this.wingsR]) {
      im.count = i;
      im.instanceMatrix.needsUpdate = true;
    }
    this.feathers.update(dt);
  }

  /** nothing left flying (a new round) */
  reset(): void {
    this.flock.reset();
    for (const im of [this.bodies, this.wingsL, this.wingsR]) im.count = 0;
  }
}
