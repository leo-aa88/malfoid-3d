// Logic tests for Hermione: the plate barrage, Petrificus Totalus, Accio, her AI's aim: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Caster, SpellSystem } from '../src/combat/spells/SpellSystem';
import type { SpellEmitter } from '../src/combat/spells/SpellEmitter';
import { PLATES, PLATES_SPELL, PlateBarrage } from '../src/combat/spells/Plates';
import { PETRIFICUS } from '../src/combat/spells/Petrificus';
import { ACCIO } from '../src/combat/spells/Accio';
import { EXPELLIARMUS } from '../src/combat/spells/Expelliarmus';
import { BOUND_HITS, FighterTarget } from '../src/combat/FighterTarget';
import { HERMIONE_DIFFICULTY } from '../src/combat/ai/difficulty';
import { OPPONENTS } from '../src/game/opponents';
import type { CombatTarget, HitBounds, HitReport, HitRequest } from '../src/combat/CombatTarget';
import type { Malfoid } from '../src/character/Malfoid';

const DT = 1 / 60;

/** a fighter as FighterTarget sees it, with the body-bind (petrify / lying) */
function fighter(name: string, x: number, z: number, facing: number) {
  const f = {
    name, defeated: false, blocking: false, root: new THREE.Group(), facingAngle: facing,
    reactions: [] as string[], hasWand: true, castLock: false, currentStrike: null as string | null,
    reacting: null as string | null, petrified: false, boundFor: 0,
    get lying() { return f.petrified; },
    get position() { return f.root.position; },
    get canStrike() { return !f.castLock && !f.currentStrike && !f.reacting; },
    react(kind: string) { if (!f.petrified) f.reactions.push(kind); },
    petrify(s: number) { if (f.defeated || f.petrified) return false; f.petrified = true; f.boundFor = s; f.reacting = 'petrified'; return true; },
    setExpression() {},
    setDefeated(on: boolean) { f.defeated = on; },
    disarm() { return true; },
    setHold() {},
    playStrike(c: string) { f.currentStrike = c; },
    endStrike() { f.currentStrike = null; },
    resetIdleTimer() {},
  };
  f.root.position.set(x, 0, z);
  return f;
}

class Caster_ implements Caster {
  castLock = false;
  currentStrike: string | null = null;
  hasWand = true;
  constructor(public readonly position: THREE.Vector3, public facingAngle: number) {}
  get canStrike() { return !this.castLock; }
  playStrike(c: string) { this.currentStrike = c; }
  endStrike() { this.currentStrike = null; }
  faceToward(a: number) { this.facingAngle = a; }
  resetIdleTimer() {}
}

const emitter = (c: Caster_): SpellEmitter => ({
  getWorldPosition: (o) => o.set(c.position.x + Math.sin(c.facingAngle) * 0.45, 1.3, c.position.z + Math.cos(c.facingAngle) * 0.45),
  getWorldDirection: (o) => o.set(Math.sin(c.facingAngle), 0, Math.cos(c.facingAngle)),
});

/** a plain target at (x, z) that records its hits; `shield` answers a plate reaching it */
function dummy(x: number, z: number, shield: 'reflect' | 'absorb' | null = null) {
  const pos = new THREE.Vector3(x, 0, z);
  const hits: HitRequest[] = [];
  const t: CombatTarget & { pos: THREE.Vector3; hits: HitRequest[]; blocks: number } = {
    name: 'dummy', targetable: true, pos, hits, blocks: 0,
    getBounds: (o: HitBounds) => Object.assign(o, { x: pos.x, z: pos.z, yMin: 0, yMax: 1.62, radius: 0.2 }),
    getAimPoint: (o: THREE.Vector3) => o.set(pos.x, 1.15, pos.z),
    takeHit: (h: HitRequest): HitReport => { hits.push(h); return { result: 'hit', damage: h.damage, ko: false }; },
    intercept: shield ? () => shield : undefined,
  };
  return t;
}

/** Hermione at (0, 0, dist) facing the origin */
const hermione = (dist: number) => ({ position: new THREE.Vector3(0, 0, dist), facingAngle: Math.PI });

function fly(b: PlateBarrage, t: number, solids: THREE.Box3[] = [], each?: () => void) {
  for (let x = 0; x < t; x += DT) {
    each?.();
    b.update(DT, solids);
  }
}

test('plates: the wind-up raises them from the tables into a fan round her; at the release they fly one after another and all hit a still target', () => {
  const b = new PlateBarrage();
  const h = hermione(6);
  const tables = [new THREE.Vector3(3, 0.8, 4), new THREE.Vector3(3, 0.8, 5), new THREE.Vector3(-3, 0.8, 5)];
  assert.equal(b.levitate(h, tables, 10), 10);
  assert.equal(b.plates.filter((p) => p.conjured).length, 7);         // 3 from the tables, the rest conjured
  fly(b, PLATES.riseTime + 0.4);
  assert.equal(b.plates.filter((p) => p.state === 'hover').length, 10);
  // the fan: beside and above her, never in front of her
  for (const p of b.plates.filter((q) => q.state === 'hover')) {
    assert.ok(p.pos.y > 1.3 && Math.hypot(p.pos.x, p.pos.z - 6) < 1.4, `slot at ${p.pos.toArray()}`);
  }
  const t = dummy(0, 0);
  b.fire(t, null, (from, out) => t.getAimPoint(out));
  fly(b, 0.05);
  assert.equal(b.plates.filter((p) => p.state === 'flying').length, 1);     // one at a time
  fly(b, 10 * PLATES.launchGap + 1.0);
  assert.equal(t.hits.length, 10);
  assert.ok(t.hits.every((h) => h.damage === PLATES.damage && h.effect === 'flinch'));
  assert.equal(b.active, 0);
});

test('plates fly straight: no homing after launch (a step aside once they are on their way beats them)', () => {
  const b = new PlateBarrage();
  const h = hermione(8);
  b.levitate(h, [], 4);
  fly(b, PLATES.riseTime + 0.3);
  const t = dummy(0, 0);
  b.fire(t, null, (from, out) => t.getAimPoint(out));
  fly(b, 0.05);                                    // the first is on its way
  t.pos.x = 1.2;                                   // she steps aside
  fly(b, 1.4);
  assert.equal(t.hits.length, 3, 'the first misses; the later ones are aimed at where she is now');
});

test('interrupting the wind-up drops every plate: they shatter on the floor, nobody is hit', () => {
  const b = new PlateBarrage();
  const ends: string[] = [];
  b.onEnd = (_p, how) => ends.push(how);
  b.levitate(hermione(6), [], 10);
  fly(b, 0.5);
  assert.equal(b.interrupt(), 10);
  const t = dummy(0, 0);
  b.fire(t, null, (from, out) => t.getAimPoint(out));       // (too late: nothing left to fire)
  fly(b, 2);
  assert.equal(t.hits.length, 0);
  assert.equal(ends.filter((e) => e === 'floor').length, 10);
});

test('a perfect Protego sends back only one plate of a volley; the rest are stopped', () => {
  const b = new PlateBarrage();
  const events: string[] = [];
  b.onEvent = (e) => events.push(e.type);
  const h = hermione(6);
  const owner = dummy(0, 6);
  b.levitate(h, [], 6);
  fly(b, PLATES.riseTime + 0.3);
  const t = dummy(0, 0, 'reflect');
  b.fire(t, owner, (from, out) => t.getAimPoint(out));
  fly(b, 6 * PLATES.launchGap + 1.5);
  assert.equal(events.filter((e) => e === 'reflected').length, PLATES.reflectsPerVolley);
  assert.equal(events.filter((e) => e === 'shielded').length, 6 - PLATES.reflectsPerVolley);
  assert.equal(owner.hits.length, 1, 'the reflected plate hits Hermione');
  assert.equal(t.hits.length, 0);
});

test('a wall stops a plate; the floor too', () => {
  const b = new PlateBarrage();
  const ends: string[] = [];
  b.onEnd = (_p, how) => ends.push(how);
  b.levitate(hermione(8), [], 2);
  fly(b, PLATES.riseTime + 0.3);
  const t = dummy(0, 0);
  b.fire(t, null, (from, out) => t.getAimPoint(out));
  fly(b, 1.5, [new THREE.Box3(new THREE.Vector3(-3, 0, 3.8), new THREE.Vector3(3, 3, 4.2))]);
  assert.deepEqual(ends, ['wall', 'wall']);
  assert.equal(t.hits.length, 0);
});

test('Petrificus Totalus: a hit binds Malfoid; while she is down only one more hit lands', () => {
  const m = fighter('Malfoid', 0, 0, 0);
  const mT = new FighterTarget(m as unknown as Malfoid);
  const hC = new Caster_(new THREE.Vector3(0, 0, 6), Math.PI);
  const hS = new SpellSystem(hC, emitter(hC), () => false, undefined, { targets: [mT], solids: [], groundY: 0 });
  assert.ok(hS.cast(PETRIFICUS));
  for (let x = 0; x < PETRIFICUS.release + 6 / PETRIFICUS.projectile.speed + 0.2; x += DT) hS.update(DT);
  assert.ok(m.petrified, 'bound');
  assert.equal(m.boundFor, PETRIFICUS.petrify!.duration);
  assert.equal(mT.hp, 100 - PETRIFICUS.directDamage);
  const hit = { damage: 4, height: 'high' as const, effect: 'flinch' as const, dir: new THREE.Vector3(0, 0, -1) };
  const results = Array.from({ length: 5 }, () => mT.takeHit(hit).result);
  assert.equal(results.filter((r) => r === 'hit').length, BOUND_HITS);
  assert.equal(mT.hp, 100 - PETRIFICUS.directDamage - 4 * BOUND_HITS, 'a barrage on her while she is down: one plate counts');
  assert.deepEqual(m.reactions, ['hit'], 'no reaction moves her while bound (the bolt\'s own flinch came first)');
});

test('Petrificus: a guard (or Protego) stops it; a blocked bolt binds nobody', () => {
  const m = fighter('Malfoid', 0, 0, 0);
  m.blocking = true;
  const mT = new FighterTarget(m as unknown as Malfoid);
  const hC = new Caster_(new THREE.Vector3(0, 0, 6), Math.PI);
  const hS = new SpellSystem(hC, emitter(hC), () => false, undefined, { targets: [mT], solids: [], groundY: 0 });
  hS.cast(PETRIFICUS);
  for (let x = 0; x < 1.2; x += DT) hS.update(DT);
  assert.ok(!m.petrified);
});

test('bound, she lies along her body: the hurt volume and the aim point move down behind her feet', () => {
  const m = fighter('Malfoid', 0, 0, 0);            // facing +z: she falls towards -z
  const mT = new FighterTarget(m as unknown as Malfoid);
  m.petrify(2);
  const b = mT.getBounds({ x: 0, z: 0, yMin: 0, yMax: 0, radius: 0 });
  assert.ok(b.z < -0.5 && b.yMax < 0.6);
  assert.ok(mT.getAimPoint(new THREE.Vector3()).y < 0.4);
});

test('Accio: a summon (no bolt) she aims at the wand herself; it has its cooldown', () => {
  assert.equal(ACCIO.summon, 'accio');
  assert.equal(ACCIO.faceAngle, 0, 'the cast never turns her to Malfoid: she turns to the wand');
  assert.ok(ACCIO.cooldown >= 8);
  const c = new Caster_(new THREE.Vector3(0, 0, 6), Math.PI);
  const s = new SpellSystem(c, emitter(c), () => false, undefined, { targets: [], solids: [], groundY: 0 });
  let summoned = 0;
  s.onSummon = (d) => { if (d.summon === 'accio') summoned++; };
  assert.ok(s.cast(ACCIO));
  for (let x = 0; x < ACCIO.castDuration + 0.1; x += DT) s.update(DT);
  assert.equal(summoned, 1);
  assert.ok(s.cooldownLeft(ACCIO) > 0);
});

test('the plates\' wind-up is a cast: cut short before its release (a hit), the cast-cancel hook drops them', () => {
  const c = new Caster_(new THREE.Vector3(0, 0, 6), Math.PI);
  const s = new SpellSystem(c, emitter(c), () => false, undefined, { targets: [], solids: [], groundY: 0 });
  const phases: string[] = [];
  s.onCast = (d, ph) => phases.push(`${d.id}:${ph}`);
  s.cast(PLATES_SPELL);
  for (let x = 0; x < 0.5; x += DT) s.update(DT);
  c.currentStrike = 'hit';                          // a hit reaction takes over
  s.update(DT);
  assert.deepEqual(phases, ['plates:start', 'plates:cancel']);
  assert.equal(s.cooldownLeft(PLATES_SPELL), 0, 'an interrupted barrage costs no cooldown');
});

test('Hermione\'s definition and levels: Petrificus and Expelliarmus, Protego, the plates and Accio; harder, more plates and a longer bind', () => {
  const d = OPPONENTS.hermione;
  assert.equal(d.spell.id, 'petrificus');
  assert.equal(d.altSpell, EXPELLIARMUS);
  assert.ok(d.protego && d.plates && d.accio);
  assert.ok(!d.episkey && !d.oppugno && !d.illusio);
  assert.equal(d.arena, 'greathall');
  const [e, n, h] = (['easy', 'normal', 'hard'] as const).map((l) => HERMIONE_DIFFICULTY[l]);
  assert.deepEqual([e.hermione!.plates, n.hermione!.plates, h.hermione!.plates], [8, 10, 12]);
  assert.ok(e.hermione!.petrify < n.hermione!.petrify && n.hermione!.petrify < h.hermione!.petrify);
  assert.ok(e.hp < n.hp && n.hp < h.hp);
  // the hardest student: more health than Luna at every level
  assert.ok(n.hp > OPPONENTS.luna.difficulty.normal.hp);
  assert.ok(e.ai.prodigy!.parryChance < h.ai.prodigy!.parryChance);
});
