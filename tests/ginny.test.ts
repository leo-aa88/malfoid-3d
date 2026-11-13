// Logic tests for Ginny's combat pieces (no WebGL): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { CombatTarget, HitBounds, HitReport, HitRequest } from '../src/combat/CombatTarget';
import { Caster, SpellSystem } from '../src/combat/spells/SpellSystem';
import type { SpellEmitter } from '../src/combat/spells/SpellEmitter';
import { EXPELLIARMUS, EXPELLIARMUS_COOLDOWN, EXPELLIARMUS_DAMAGE } from '../src/combat/spells/Expelliarmus';
import { FighterTarget } from '../src/combat/FighterTarget';
import { FighterAI, GINNY_AI } from '../src/combat/ai/FighterAI';
import type { Malfoid } from '../src/character/Malfoid';
import type { ComboSystem } from '../src/combat/ComboSystem';

const DT = 1 / 60;

class Target implements CombatTarget {
  hits: HitRequest[] = [];
  disarms = 0;
  armed = true;
  targetable = true;
  constructor(readonly name: string, public x: number, public z: number) {}
  getBounds(o: HitBounds): HitBounds { return Object.assign(o, { x: this.x, z: this.z, yMin: 0, yMax: 1.62, radius: 0.2 }); }
  getAimPoint(o: THREE.Vector3): THREE.Vector3 { return o.set(this.x, 1.15, this.z); }
  takeHit(h: HitRequest): HitReport { this.hits.push(h); return { result: 'hit', damage: h.damage, ko: false }; }
  disarm(): boolean { if (!this.armed) return false; this.armed = false; this.disarms++; return true; }
}

class Caster_ implements Caster {
  readonly position = new THREE.Vector3();
  facingAngle = 0;
  castLock = false;
  currentStrike: string | null = null;
  hasWand = true;
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

const run = (s: SpellSystem, t: number) => { for (let x = 0; x < t; x += DT) s.update(DT); };

test('Expelliarmus: a direct hit disarms once, small damage, stagger, no splash, 8 s cooldown', () => {
  const malfoid = new Target('Malfoid', 0, 5);
  const near = new Target('near', 0.6, 5);
  const c = new Caster_();
  const s = new SpellSystem(c, emitter(c), () => false, undefined, { targets: [malfoid, near], solids: [], groundY: 0 });
  let disarmed = 0;
  s.onEvent = (e) => { if (e.type === 'hit' && e.disarmed) disarmed++; };
  assert.equal(s.cast(EXPELLIARMUS), true);
  run(s, 1.5);
  assert.equal(malfoid.hits.length, 1);
  assert.equal(malfoid.hits[0].damage, EXPELLIARMUS_DAMAGE);
  assert.equal(malfoid.hits[0].effect, 'stagger');
  assert.equal(malfoid.disarms, 1);
  assert.equal(disarmed, 1);
  assert.equal(near.hits.length, 0);                                   // no blast
  assert.ok(Math.abs(s.cooldownLeft(EXPELLIARMUS) - (EXPELLIARMUS_COOLDOWN - (1.5 - 0.42))) < 0.1);
});

test('no wand, no spell; the cast works again once the wand is back', () => {
  const c = new Caster_();
  const s = new SpellSystem(c, emitter(c), () => false, undefined, { targets: [], solids: [], groundY: 0 });
  c.hasWand = false;
  assert.equal(s.cast(EXPELLIARMUS), false);
  c.hasWand = true;
  assert.equal(s.cast(EXPELLIARMUS), true);
});

/** the parts of a character FighterTarget uses */
function fakeFighter() {
  const f = {
    name: 'F', defeated: false, blocking: false, root: new THREE.Group(), reactions: [] as string[], faces: [] as string[],
    get position() { return f.root.position; },
    react(kind: string) { f.reactions.push(kind); },
    setExpression(n: string) { f.faces.push(n); },
    setDefeated(on: boolean) { f.defeated = on; },
    disarm() { return true; },
  };
  return f;
}

test('fighter: blocks take chip damage and no reaction; hits react by effect; defeat fires once', () => {
  const f = fakeFighter();
  const t = new FighterTarget(f as unknown as Malfoid, 30);
  let defeats = 0;
  t.onDefeated = () => defeats++;
  const dir = new THREE.Vector3(0, 0, 1);
  f.blocking = true;
  let r = t.takeHit({ damage: 10, height: 'high', effect: 'stagger', dir });
  assert.deepEqual([r.result, r.damage, t.hp, f.reactions.length], ['blocked', 2, 28, 0]);
  f.blocking = false;
  r = t.takeHit({ damage: 5, height: 'high', effect: 'flinch', dir });
  t.takeHit({ damage: 5, height: 'low', effect: 'knockback', dir });
  assert.deepEqual(f.reactions, ['hit', 'knockback']);
  assert.equal(f.faces[0], 'pain');
  r = t.takeHit({ damage: 50, height: 'low', effect: 'stagger', dir });
  assert.equal(r.ko, true);
  assert.equal(t.hp, 0);
  assert.equal(defeats, 1);
  assert.equal(t.takeHit({ damage: 5, height: 'low', effect: 'stagger', dir }).result, 'immune');
  assert.equal(defeats, 1);
});

function aiSetup(dist: number, opponentArmed: boolean) {
  const self = Object.assign(fakeFighter(), {
    reacting: null as string | null, canStrike: true, moves: [] as THREE.Vector3[], looked: null as number | null,
    move(d: THREE.Vector3) { self.moves.push(d.clone()); }, stop() {}, lookAt(a: number | null) { self.looked = a; },
    setHold() {},
  });
  const opp = Object.assign(fakeFighter(), { hasWand: opponentArmed });
  opp.root.position.set(0, 0, dist);
  const casts: string[] = [];
  // like the real one: after a cast the spell is on cooldown
  const spells = { isCasting: false, canCast: () => casts.length === 0, cast: (d: { id: string }) => { casts.push(d.id); return true; },
    cooldownLeft: () => (casts.length ? 8 : 0) };
  const presses: string[] = [];
  const combat = { busy: false, press: (b: string) => presses.push(b) };
  const oppCombat = { busy: false };
  const target = new FighterTarget(self as unknown as Malfoid);
  const ai = new FighterAI(self as unknown as Malfoid, target, combat as unknown as ComboSystem, spells as unknown as SpellSystem,
    EXPELLIARMUS, opp as unknown as Malfoid, oppCombat as unknown as ComboSystem, () => [],
    { ...GINNY_AI, castChance: 1, reaction: [0.1, 0.1] });
  ai.startDelay = 0;
  return { ai, self, casts, presses };
}

test('AI casts Expelliarmus at an armed opponent in range; at a disarmed one she closes in instead', () => {
  const armed = aiSetup(5, true);
  armed.ai.setActive(true);
  for (let i = 0; i < 30; i++) armed.ai.update(DT);
  assert.deepEqual(armed.casts, ['expelliarmus']);
  const unarmed = aiSetup(5, false);
  unarmed.ai.setActive(true);
  for (let i = 0; i < 30; i++) unarmed.ai.update(DT);
  assert.equal(unarmed.casts.length, 0);
  assert.equal(unarmed.ai.state, 'APPROACH');
  assert.ok(unarmed.self.moves.length > 0 && unarmed.self.moves[unarmed.self.moves.length - 1].z > 0.9);
});

test('AI strikes in reach, and does nothing while the duel is off', () => {
  const near = aiSetup(0.6, false);
  near.ai.setActive(true);
  for (let i = 0; i < 30; i++) near.ai.update(DT);
  assert.ok(near.presses.length >= 1);
  const off = aiSetup(0.6, true);
  for (let i = 0; i < 120; i++) off.ai.update(DT);
  assert.equal(off.presses.length + off.casts.length, 0);
  assert.equal(off.ai.state, 'IDLE');
});
