import * as THREE from 'three';
import type { Malfoid } from '../character/Malfoid';
import type { CombatTarget, HitBounds, HitReport } from './CombatTarget';
import type { FighterTarget } from './FighterTarget';
import type { SpellDef } from './spells/SpellSystem';
import type { SpellLook } from './spells/ConfringoFx';
import type { SpellClip } from './spells/clips';
import { ParticlePool } from './spells/fx/ParticlePool';

/*
 * Illusio (Luna's; a made-up illusion charm): she conjures copies of herself that skip about,
 * circle and mimic her casting, but deal no damage. Any hit (a strike, a spell, a blast)
 * pops a copy in a puff of silver; walking into one pops it too. When she is hit herself, her
 * concentration breaks and they all vanish; otherwise they last ILLUSIO.life s.
 *
 * As they appear, she and her copies are shuffled (she may now stand in any of the places), so
 * the player has to find her again, but fairly. The tells:
 *  - her copies cast no shadow;
 *  - they mimic her casts a beat late, and no bolt leaves their wands (no glow at the tip);
 *  - only she ever blocks, gets hit, or acts on her own.
 * Counts and lengths per difficulty in LUNA_DIFFICULTY (illusio). All other tuning here.
 */
export const ILLUSIO_RELEASE = 0.55;     // s into cast_illusio (combat.ILLUSIO_RELEASE)
export const ILLUSIO = {
  copies: 2,                 // per cast (Normal)
  life: 9.0,                 // s
  spread: [1.6, 2.6] as [number, number],   // m sideways from her at the cast, either side
  minFromFoe: 2.4,           // m: no copy appears closer than this to her opponent
  ring: [3.2, 6.0] as [number, number],     // m from the opponent the copies keep moving within
  mimicDelay: [0.08, 0.3] as [number, number],   // s after her own cast starts
  contact: 0.55,             // m: her opponent walking into a copy pops it
  wander: [0.8, 2.0] as [number, number],   // s between a copy's changes of mind
};

export const ILLUSIO_SPELL: SpellDef = {
  id: 'illusio',
  name: 'Illusio',
  key: '',
  clip: 'cast_illusio',
  castDuration: 0.95,
  release: ILLUSIO_RELEASE,
  cooldown: 14.0,
  projectile: { speed: 1, radius: 0.1, maxRange: 1 },     // (no bolt: copies)
  directDamage: 0,
  splashDamage: 0,
  explosionRadius: 0,
  directKnockback: 0,
  splashKnockback: 0,
  faceAngle: Math.PI,
  aimAngle: Math.PI,
  aimRange: 30,
  summon: 'illusio',
};

/** the charge at her wand while she casts it: a silvery shimmer (no bolt ever leaves) */
export const ILLUSIO_LOOK: SpellLook = {
  core: new THREE.Color(1.0, 1.0, 1.0),
  inner: new THREE.Color(0.85, 0.85, 1.0),
  halo: new THREE.Color(0.6, 0.65, 0.95),
  light: new THREE.Color(0.8, 0.8, 1.0),
  tint: (r, g, b) => [0.75 + 0.25 * r, 0.75 + 0.25 * g, 0.9 + 0.1 * b],
  bolt: 0.05,
  explosion: {
    fireball: 0.2, ring: 0.6, duration: 0.35, sparks: 0.4,
    fire: [new THREE.Color(0.3, 0.3, 0.5), new THREE.Color(0.8, 0.8, 1.0), new THREE.Color(1, 1, 1)],
    flash: new THREE.Color(0.9, 0.9, 1.0), ringColour: new THREE.Color(0.8, 0.85, 1.0),
  },
  blastLight: 0,
  lights: false,
};

/** Oppugno's charge at her wand: warm gold (the birds' colour) */
export const OPPUGNO_LOOK: SpellLook = {
  core: new THREE.Color(1.0, 0.98, 0.85),
  inner: new THREE.Color(1.0, 0.82, 0.3),
  halo: new THREE.Color(0.95, 0.65, 0.15),
  light: new THREE.Color(1.0, 0.8, 0.3),
  tint: (r, g, b) => [0.95 + 0.05 * r, 0.7 + 0.25 * g, 0.25 + 0.3 * b],
  bolt: 0.05,
  explosion: {
    fireball: 0.2, ring: 0.6, duration: 0.35, sparks: 0.4,
    fire: [new THREE.Color(0.4, 0.25, 0.02), new THREE.Color(1.0, 0.75, 0.25), new THREE.Color(1, 0.97, 0.85)],
    flash: new THREE.Color(1.0, 0.9, 0.6), ringColour: new THREE.Color(1.0, 0.8, 0.35),
  },
  blastLight: 0,
  lights: false,
};

const RADIUS = 0.2;      // m, as a fighter's (FighterTarget)
const HEIGHT = 1.62;
const AIM_Y = 1.15;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** one copy as a target: anything that hits it pops it */
export class IllusionTarget implements CombatTarget {
  readonly name = 'Illusion';
  active = false;
  /** popped by a hit (the set makes the puff) */
  onPop: (() => void) | null = null;

  constructor(readonly copy: Malfoid) {}

  get targetable(): boolean {
    return this.active;
  }

  getBounds(out: HitBounds): HitBounds {
    const p = this.copy.position;
    out.x = p.x;
    out.z = p.z;
    out.yMin = 0;
    out.yMax = HEIGHT;
    out.radius = RADIUS;
    return out;
  }

  getAimPoint(out: THREE.Vector3): THREE.Vector3 {
    const p = this.copy.position;
    return out.set(p.x, AIM_Y, p.z);
  }

  takeHit(): HitReport {
    if (this.active) this.onPop?.();
    return { result: 'immune', damage: 0, ko: false };
  }
}

interface Copy {
  target: IllusionTarget;
  char: Malfoid;
  /** s until it changes its mind (stand, skip somewhere, circle) */
  think: number;
  mode: 'stand' | 'skip' | 'circle';
  readonly goal: THREE.Vector3;
  side: 1 | -1;
  /** a mimicked cast: s until it starts, and the clip; s left of the clip playing */
  mimicIn: number;
  mimicClip: SpellClip | null;
  mimicLeft: number;
}

/** what the copies need of the arena: keep them out of walls and furniture */
export interface IllusionWorld {
  resolve(p: THREE.Vector3, radius: number): void;
}

/**
 * Luna's copies: made once (her model's twins, hidden), shown by cast(), driven here.
 */
export class Illusions {
  readonly targets: IllusionTarget[];
  cfg = { ...ILLUSIO };
  /** her copies appeared / one popped / all vanished (sounds, the HUD) */
  onEvent: ((e: 'appear' | 'pop' | 'vanish', at: THREE.Vector3) => void) | null = null;
  world: IllusionWorld | null = null;
  private readonly copies: Copy[];
  private life = 0;
  private lastHp = -1;
  private realStrike: string | null = null;
  private readonly sparkle = new ParticlePool(400);
  private readonly v = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();

  constructor(scene: THREE.Scene, twins: Malfoid[], private readonly real: Malfoid, private readonly realTarget: FighterTarget,
    private readonly foe: Malfoid) {
    this.copies = twins.map((char) => {
      char.scene = scene;
      char.root.visible = false;
      // no shadow: the subtle tell that this one isn't her
      char.root.traverse((o) => { o.castShadow = false; });
      scene.add(char.root);
      const target = new IllusionTarget(char);
      const c: Copy = { target, char, think: 0, mode: 'stand', goal: new THREE.Vector3(), side: 1, mimicIn: -1, mimicClip: null,
        mimicLeft: 0 };
      target.onPop = () => this.pop(c, true);
      return c;
    });
    this.targets = this.copies.map((c) => c.target);
    this.sparkle.points.name = 'illusio_sparkle';
    scene.add(this.sparkle.points);
  }

  /** copies showing now */
  get count(): number {
    return this.copies.filter((c) => c.target.active).length;
  }

  get active(): boolean {
    return this.count > 0;
  }

  /** the copies showing (for the camera, collisions) */
  *shown(): Iterable<Malfoid> {
    for (const c of this.copies) if (c.target.active) yield c.char;
  }

  setView(camera: THREE.PerspectiveCamera, viewportHeightPx: number): void {
    this.sparkle.setScale(viewportHeightPx, camera.fov);
  }

  /**
   * the charm released: `count` copies appear beside her, then she and they are shuffled (she
   * may take any of the places), each place marked by the same puff
   */
  cast(count = this.cfg.copies): void {
    this.reset();
    const me = this.real.position;
    const foe = this.foe.position;
    const toMe = this.v.set(me.x - foe.x, 0, me.z - foe.z);
    const d = toMe.length() || 1;
    toMe.divideScalar(d);
    const side = new THREE.Vector3(-toMe.z, 0, toMe.x);
    const places: THREE.Vector3[] = [me.clone()];
    const n = Math.min(count, this.copies.length);
    for (let i = 0; i < n; i++) {
      // alternately either side of her, the third one a little behind her
      const s = i % 2 === 0 ? 1 : -1;
      const out = i < 2 ? rand(this.cfg.spread[0], this.cfg.spread[1]) : rand(0.4, 0.9) * s;
      const back = i < 2 ? rand(-0.6, 0.8) : rand(1.4, 2.0);
      const p = me.clone().addScaledVector(side, out * s).addScaledVector(toMe, back);
      // never on top of her opponent
      const fd = Math.hypot(p.x - foe.x, p.z - foe.z);
      if (fd < this.cfg.minFromFoe) p.addScaledVector(toMe, this.cfg.minFromFoe - fd);
      this.world?.resolve(p, 0.28);
      places.push(p);
    }
    // the shuffle: she takes one of the places at random, a copy takes hers
    const mine = Math.floor(Math.random() * places.length);
    let k = 0;
    for (let i = 0; i < places.length; i++) {
      this.puff(places[i], 34);
      if (i === mine) continue;
      const c = this.copies[k++];
      c.char.root.position.copy(places[i]);
      c.char.setFacing(Math.atan2(foe.x - places[i].x, foe.z - places[i].z));
      c.char.root.visible = true;
      c.target.active = true;
      c.think = rand(0.2, 0.7);
      c.mode = 'stand';
      c.side = Math.random() < 0.5 ? -1 : 1;
      c.mimicIn = -1;
      c.mimicClip = null;
      c.mimicLeft = 0;
    }
    this.real.root.position.copy(places[mine]);
    this.real.setFacing(Math.atan2(foe.x - places[mine].x, foe.z - places[mine].z));
    this.life = this.cfg.life;
    this.lastHp = this.realTarget.hp;
    this.onEvent?.('appear', this.real.position);
  }

  /** all gone at once, each in a puff (she was hit, or their time ran out) */
  dispel(): void {
    let any = false;
    for (const c of this.copies) if (c.target.active) {
      this.pop(c, false);
      any = true;
    }
    if (any) this.onEvent?.('vanish', this.real.position);
  }

  /** gone without a trace (a new round, the duel over) */
  reset(): void {
    for (const c of this.copies) {
      c.target.active = false;
      c.char.root.visible = false;
      c.char.stop();
      if (c.char.currentStrike) c.char.endStrike();
    }
    this.life = 0;
  }

  update(dt: number): void {
    this.sparkle.update(dt);
    if (!this.active) {
      this.realStrike = this.real.currentStrike;
      return;
    }
    this.life -= dt;
    // her concentration breaks when she is hit (a guarded hit too), or the charm runs out
    if (this.realTarget.hp < this.lastHp || this.real.defeated || this.life <= 0) {
      this.dispel();
      return;
    }
    this.lastHp = this.realTarget.hp;
    // her casts, mimicked a beat late (no bolt leaves a copy's wand)
    const strike = this.real.currentStrike;
    const newCast = strike && strike !== this.realStrike && strike.startsWith('cast_');
    this.realStrike = strike;
    const foe = this.foe.position;
    for (const c of this.copies) {
      if (!c.target.active) continue;
      const me = c.char;
      const p = me.position;
      const dist = Math.hypot(foe.x - p.x, foe.z - p.z);
      const angle = Math.atan2(foe.x - p.x, foe.z - p.z);
      // walked into: popped
      if (dist < this.cfg.contact) {
        this.pop(c, true);
        continue;
      }
      if (newCast) {
        c.mimicIn = rand(this.cfg.mimicDelay[0], this.cfg.mimicDelay[1]);
        c.mimicClip = strike as SpellClip;
      }
      if (c.mimicIn >= 0) {
        c.mimicIn -= dt;
        if (c.mimicIn < 0 && c.mimicClip && !me.currentStrike) {
          me.stop();
          me.faceToward(angle);
          me.playStrike(c.mimicClip, 0, 0.1);
          c.mimicLeft = me.clipDuration(c.mimicClip);
        }
      }
      if (c.mimicLeft > 0) {
        c.mimicLeft -= dt;
        if (c.mimicLeft <= 0) me.endStrike();
        me.update(dt);
        continue;
      }
      // her erratic movement: stand and watch, skip somewhere on the ring, or circle
      c.think -= dt;
      if (c.think <= 0) {
        c.think = rand(this.cfg.wander[0], this.cfg.wander[1]);
        const r = Math.random();
        c.mode = r < 0.3 ? 'stand' : r < 0.65 ? 'skip' : 'circle';
        if (Math.random() < 0.35) c.side = c.side > 0 ? -1 : 1;
        if (c.mode === 'skip') {
          const a = angle + Math.PI + rand(-1.3, 1.3);
          const rr = rand(this.cfg.ring[0], this.cfg.ring[1]);
          c.goal.set(foe.x + Math.sin(a) * rr, 0, foe.z + Math.cos(a) * rr);
          this.world?.resolve(c.goal, 0.8);
        }
      }
      if (c.mode === 'skip') {
        const to = this.v2.set(c.goal.x - p.x, 0, c.goal.z - p.z);
        if (to.length() < 0.4) {
          c.mode = 'stand';
          me.stop();
        } else {
          me.move(to, true);
        }
      } else if (c.mode === 'circle') {
        const tx = (foe.x - p.x) / Math.max(dist, 1e-6);
        const tz = (foe.z - p.z) / Math.max(dist, 1e-6);
        const mid = (this.cfg.ring[0] + this.cfg.ring[1]) / 2;
        const radial = Math.max(-0.7, Math.min(0.7, (dist - mid) * 0.5));
        me.move(this.v2.set(-tz * c.side + tx * radial, 0, tx * c.side + tz * radial), false, angle);
      } else {
        me.stop();
        me.lookAt(angle);
      }
      me.update(dt);
      this.world?.resolve(p, 0.28);
    }
  }

  private pop(c: Copy, announce: boolean): void {
    if (!c.target.active) return;
    c.target.active = false;
    c.char.root.visible = false;
    c.char.stop();
    if (c.char.currentStrike) c.char.endStrike();
    this.puff(c.char.position, 46);
    if (announce) this.onEvent?.('pop', c.char.position);
  }

  /** a burst of silver-lilac sparkles where a copy appears or vanishes */
  private puff(at: THREE.Vector3, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(0.05, 0.35);
      const up = rand(0.1, 1.6);
      this.sparkle.spawn({ x: at.x + Math.cos(a) * r, y: up, z: at.z + Math.sin(a) * r,
        vx: Math.cos(a) * rand(0.4, 1.4), vy: rand(0.2, 1.2), vz: Math.sin(a) * rand(0.4, 1.4),
        r: rand(0.8, 1.0), g: rand(0.78, 0.95), b: 1.0, size: rand(0.06, 0.12), sizeEnd: 0.01, life: rand(0.45, 0.8),
        drag: 2.5, gravity: 0.4, alpha: 0.9 });
    }
  }
}
