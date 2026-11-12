// Logic tests for the spell system (no WebGL): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { CombatTarget, HitBounds, HitReport, HitRequest } from '../src/combat/CombatTarget';
import { Caster, SpellEvent, SpellSystem } from '../src/combat/spells/SpellSystem';
import type { SpellEmitter } from '../src/combat/spells/SpellEmitter';
import { CONFRINGO, CONFRINGO_COOLDOWN, CONFRINGO_RELEASE, CONFRINGO_CAST_DURATION } from '../src/combat/spells/Confringo';
import { sweepCylinder, sweepBox, splashDamage, distanceToBounds } from '../src/combat/spells/collision';

const DT = 1 / 60;

class FakeTarget implements CombatTarget {
  readonly hits: HitRequest[] = [];
  targetable = true;
  constructor(readonly name: string, public x: number, public z: number, public radius = 0.16) {}
  getBounds(out: HitBounds): HitBounds {
    Object.assign(out, { x: this.x, z: this.z, yMin: 0, yMax: 1.63, radius: this.radius });
    return out;
  }
  getAimPoint(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.x, 1.1, this.z);
  }
  takeHit(hit: HitRequest): HitReport {
    this.hits.push({ ...hit, dir: hit.dir.clone() });
    return { result: 'hit', damage: hit.damage, ko: false };
  }
  get total(): number {
    return this.hits.reduce((s, h) => s + h.damage, 0);
  }
}

class FakeCaster implements Caster {
  readonly position = new THREE.Vector3();
  facingAngle = 0;                 // +z
  free = true;
  castLock = false;
  currentStrike: string | null = null;
  faced: number | null = null;
  get canStrike(): boolean {
    return this.free && !this.castLock;
  }
  playStrike(clip: string): void {
    this.currentStrike = clip;
  }
  endStrike(): void {
    this.currentStrike = null;
  }
  faceToward(a: number): void {
    this.faced = a;
    this.facingAngle = a;          // turns instantly in tests
  }
  resetIdleTimer(): void {}
}

/** palm 0.45 m in front of her at chest height, follows her position and facing */
class FakeEmitter implements SpellEmitter {
  constructor(private readonly c: FakeCaster) {}
  getWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    const f = this.c.facingAngle;
    return out.set(this.c.position.x + Math.sin(f) * 0.45, 1.3, this.c.position.z + Math.cos(f) * 0.45);
  }
  getWorldDirection(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.c.facingAngle), 0, Math.cos(this.c.facingAngle));
  }
}

function setup(targets: FakeTarget[], opts: { meleeBusy?: boolean; solids?: THREE.Box3[] } = {}) {
  const caster = new FakeCaster();
  const sys = new SpellSystem(caster, new FakeEmitter(caster), () => opts.meleeBusy ?? false, undefined,
    { targets, solids: opts.solids ?? [], groundY: 0 });
  const events: SpellEvent[] = [];
  sys.onEvent = (e) => events.push(e);
  return { caster, sys, events };
}

function run(sys: SpellSystem, seconds: number, dt = DT): void {
  for (let t = 0; t < seconds - 1e-9; t += dt) sys.update(dt);
}

test('one press casts once; presses during the cast and the cooldown are ignored', () => {
  const dummy = new FakeTarget('dummy', 0, 6);
  const { sys, events } = setup([dummy]);
  assert.equal(sys.cast(CONFRINGO), true);
  assert.equal(sys.cast(CONFRINGO), false);                  // during the cast
  run(sys, CONFRINGO_RELEASE + 0.02);
  assert.equal(events.filter((e) => e.type === 'release').length, 1);
  assert.equal(sys.cast(CONFRINGO), false);                  // cooldown running
  run(sys, 2);
  assert.equal(sys.cast(CONFRINGO), false);
  assert.equal(events.filter((e) => e.type === 'cast').length, 1);
});

test('cooldown starts at the release, lasts 5 s of game time, then the spell is ready again', () => {
  const { sys } = setup([new FakeTarget('dummy', 0, 6)]);
  sys.cast(CONFRINGO);
  run(sys, CONFRINGO_RELEASE - 0.05);
  assert.equal(sys.cooldownLeft(CONFRINGO), 0);             // not released yet: no cooldown
  run(sys, 0.1);
  const left = sys.cooldownLeft(CONFRINGO);
  assert.ok(left > CONFRINGO_COOLDOWN - 0.1 && left <= CONFRINGO_COOLDOWN, `cooldown ${left}`);
  // no update() = paused: the cooldown doesn't move
  assert.equal(sys.cooldownLeft(CONFRINGO), left);
  run(sys, CONFRINGO_COOLDOWN - 0.2);
  assert.ok(sys.cooldownLeft(CONFRINGO) > 0);
  run(sys, 0.3);
  assert.equal(sys.cooldownLeft(CONFRINGO), 0);
  assert.equal(sys.cast(CONFRINGO), true);
});

test('a cast cancelled before the release costs no cooldown and fires nothing', () => {
  const { sys, caster } = setup([new FakeTarget('dummy', 0, 6)]);
  sys.cast(CONFRINGO);
  assert.equal(caster.castLock, true);
  run(sys, 0.2);
  sys.cancel();
  assert.equal(caster.castLock, false);
  assert.equal(caster.currentStrike, null);
  run(sys, 1);
  assert.equal(sys.projectiles.length, 0);
  assert.equal(sys.cooldownLeft(CONFRINGO), 0);
});

test('no cast while a melee strike runs or she is not free; melee is locked until the release only', () => {
  const busy = setup([new FakeTarget('dummy', 0, 6)], { meleeBusy: true });
  assert.equal(busy.sys.cast(CONFRINGO), false);
  const notFree = setup([new FakeTarget('dummy', 0, 6)]);
  notFree.caster.free = false;                              // jumping, crouching, blocking
  assert.equal(notFree.sys.cast(CONFRINGO), false);
  const ok = setup([new FakeTarget('dummy', 0, 6)]);
  ok.sys.cast(CONFRINGO);
  assert.equal(ok.caster.canStrike, false);                 // cast lock
  run(ok.sys, CONFRINGO_RELEASE + 0.02);
  assert.equal(ok.caster.canStrike, true);                  // released: melee allowed again
  run(ok.sys, CONFRINGO_CAST_DURATION);
  assert.equal(ok.caster.currentStrike, null);              // the clip ended, nothing left locked
  assert.equal(ok.sys.isCasting, false);
});

test('direct hit: exactly 20 damage, once, with knockback away from her; no splash on top', () => {
  const dummy = new FakeTarget('dummy', 0, 6);
  const { sys, events } = setup([dummy]);
  sys.cast(CONFRINGO);
  run(sys, 2);
  assert.equal(dummy.hits.length, 1);
  assert.equal(dummy.total, 20);
  assert.equal(dummy.hits[0].effect, 'knockback');
  assert.ok(dummy.hits[0].dir.z > 0.99);                    // pushed away from the caster
  const impacts = events.filter((e) => e.type === 'impact');
  assert.equal(impacts.length, 1);
  assert.equal(impacts[0].type === 'impact' && impacts[0].kind, 'target');
});

test('the projectile really travels (18 m/s) and does not hit instantly', () => {
  const dummy = new FakeTarget('dummy', 0, 10);
  const { sys } = setup([dummy]);
  sys.cast(CONFRINGO);
  run(sys, CONFRINGO_RELEASE + 0.1);
  assert.equal(sys.projectiles.length, 1);
  const p = sys.projectiles[0];
  assert.ok(p.travelled > 1.0 && p.travelled < 2.6, `travelled ${p.travelled}`);
  assert.equal(dummy.hits.length, 0);
  run(sys, 1);
  assert.equal(dummy.total, 20);
});

test('splash: falls off with distance, each target once, nothing outside the radius', () => {
  const dummy = new FakeTarget('dummy', 0, 6);
  const near = new FakeTarget('near', 0.9, 6);              // 0.9 m beside the impact
  const far = new FakeTarget('far', 4.0, 6);                // outside 2.5 m
  const { sys } = setup([dummy, near, far]);
  sys.cast(CONFRINGO);
  run(sys, 2);
  assert.equal(dummy.total, 20);
  assert.equal(dummy.hits.length, 1);
  assert.equal(near.hits.length, 1);
  assert.ok(near.total > 0 && near.total < 10, `splash ${near.total}`);
  assert.equal(far.hits.length, 0);
  assert.ok(near.hits[0].dir.x > 0.5);                      // pushed away from the blast centre
  assert.equal(splashDamage(0, 2.5, 10), 10);
  assert.equal(splashDamage(1.25, 2.5, 10), 5);
  assert.equal(splashDamage(2.5, 2.5, 10), 0);
});

test('aim assist only inside the cone; otherwise straight ahead', () => {
  const behind = new FakeTarget('behind', 0, -6);
  const { sys, caster } = setup([behind]);
  sys.cast(CONFRINGO);
  assert.equal(caster.faced, null);                         // not turned towards a target behind her
  run(sys, CONFRINGO_RELEASE + 0.02);
  const p = sys.projectiles[0];
  assert.ok(p.direction.z > 0.99 && Math.abs(p.direction.y) < 1e-6);
  run(sys, 3);
  assert.equal(behind.hits.length, 0);
});

test('missed projectile ends at max range without damage', () => {
  const side = new FakeTarget('side', 30, 0);
  const { sys, events } = setup([side]);
  sys.cast(CONFRINGO);
  run(sys, 4);
  const impact = events.find((e) => e.type === 'impact');
  assert.ok(impact && impact.type === 'impact' && impact.kind === 'range');
  assert.ok(impact && impact.type === 'impact' && Math.abs(impact.at.z - (0.45 + 25)) < 0.05);
  assert.equal(sys.projectiles.length, 0);
  assert.equal(side.hits.length, 0);
});

test('a wall stops the projectile; a target behind it far from the blast is untouched', () => {
  const dummy = new FakeTarget('dummy', 0, 8);
  const wall = new THREE.Box3(new THREE.Vector3(-2, 0, 4), new THREE.Vector3(2, 3, 4.2));
  const { sys, events } = setup([dummy], { solids: [wall] });
  sys.cast(CONFRINGO);
  run(sys, 2);
  const impact = events.find((e) => e.type === 'impact');
  assert.ok(impact && impact.type === 'impact' && impact.kind === 'solid');
  assert.ok(impact && impact.type === 'impact' && impact.at.z <= 4.0);
  assert.equal(dummy.hits.length, 0);
});

test('splash does not go through a wall; the same target without the wall is hit', () => {
  // the bolt is stopped by a wall 1.0 m in front of the dummy: inside the blast radius
  const wall = () => new THREE.Box3(new THREE.Vector3(-2, 0, 4.9), new THREE.Vector3(2, 3, 5.0));
  const behind = new FakeTarget('behind', 0, 6);
  const beside = new FakeTarget('beside', 1.6, 4.4);      // same side of the wall as the blast
  const a = setup([behind, beside], { solids: [wall()] });
  a.sys.cast(CONFRINGO);
  run(a.sys, 2);
  assert.equal(behind.hits.length, 0);                     // shielded
  assert.equal(beside.hits.length, 1);                     // in the open: splash
  // control: no wall, the same position takes the direct hit
  const open = new FakeTarget('open', 0, 6);
  const b = setup([open]);
  b.sys.cast(CONFRINGO);
  run(b.sys, 2);
  assert.equal(open.total, 20);
});

test('aimed down into the floor it explodes on the ground', () => {
  const low = new FakeTarget('low', 0, 3);
  low.getAimPoint = (out) => out.set(0, -1, 3);            // aim point below the floor
  low.targetable = true;
  const { sys, events } = setup([low]);
  low.getBounds = (out) => Object.assign(out, { x: 0, z: 3, yMin: -5, yMax: -4, radius: 0.1 });
  sys.cast(CONFRINGO);
  run(sys, 2);
  const impact = events.find((e) => e.type === 'impact');
  assert.ok(impact && impact.type === 'impact' && impact.kind === 'ground');
  assert.ok(impact && impact.type === 'impact' && Math.abs(impact.at.y - CONFRINGO.projectile.radius) < 1e-6);
});

test('no tunnelling: a huge time step still hits a thin target', () => {
  const thin = new FakeTarget('thin', 0, 6, 0.02);
  const { sys } = setup([thin]);
  sys.cast(CONFRINGO);
  run(sys, CONFRINGO_RELEASE + 0.02);
  sys.update(1.0);                                          // 18 m in one step
  assert.equal(thin.total, 20);
  const seg0 = new THREE.Vector3(0, 1, -10);
  const seg1 = new THREE.Vector3(0, 1, 10);
  const t = sweepCylinder(seg0, seg1, 0.18, { x: 0, z: 0, yMin: 0, yMax: 2, radius: 0.02 });
  assert.ok(Math.abs(t - (10 - 0.2) / 20) < 1e-9);
  const box = new THREE.Box3(new THREE.Vector3(-1, 0, 2), new THREE.Vector3(1, 2, 2.01));
  assert.ok(sweepBox(seg0, seg1, 0.18, box) > 0);
  assert.equal(distanceToBounds(new THREE.Vector3(1, 1, 0), { x: 0, z: 0, yMin: 0, yMax: 2, radius: 0.5 }), 0.5);
});

test('a projectile reports one impact only; turning before the cast changes where it goes', () => {
  const left = new FakeTarget('left', 6, 0);
  const { sys, caster, events } = setup([left]);
  caster.facingAngle = Math.PI / 2;                         // turned to her left (+x)
  caster.position.set(0, 0, 0);
  sys.cast(CONFRINGO);
  run(sys, 3);
  assert.equal(events.filter((e) => e.type === 'impact').length, 1);
  assert.equal(left.total, 20);
});

test('reset clears cooldowns and projectiles', () => {
  const { sys } = setup([new FakeTarget('dummy', 0, 20)]);
  sys.cast(CONFRINGO);
  run(sys, CONFRINGO_RELEASE + 0.05);
  assert.ok(sys.cooldownLeft(CONFRINGO) > 0);
  assert.equal(sys.projectiles.length, 1);
  sys.reset();
  assert.equal(sys.cooldownLeft(CONFRINGO), 0);
  assert.equal(sys.projectiles.length, 0);
});
