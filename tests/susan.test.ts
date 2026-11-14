// Logic tests for Susan's combat (no WebGL): Impedimenta's slow, Depulso, Hufflepuff Resolve,
// Episkey, her defensive AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Caster, SpellSystem } from '../src/combat/spells/SpellSystem';
import type { SpellEmitter } from '../src/combat/spells/SpellEmitter';
import { IMPEDIMENTA, IMPEDIMENTA_DAMAGE, IMPEDIMENTA_SLOW } from '../src/combat/spells/Impedimenta';
import { CONFRINGO } from '../src/combat/spells/Confringo';
import { DEPULSO, DEPULSO_DAMAGE, DEPULSO_KNOCKBACK, DEPULSO_MAX_RANGE } from '../src/combat/spells/Depulso';
import { FighterTarget, HUFFLEPUFF_RESOLVE } from '../src/combat/FighterTarget';
import { EPISKEY, Episkey } from '../src/combat/Episkey';
import { FighterAI } from '../src/combat/ai/FighterAI';
import { SUSAN_DIFFICULTY } from '../src/combat/ai/difficulty';
import { OPPONENTS } from '../src/game/opponents';
import type { Malfoid } from '../src/character/Malfoid';
import type { ComboSystem } from '../src/combat/ComboSystem';
import type { SpellClip } from '../src/combat/spells/clips';

const DT = 1 / 60;

/** a fighter as the target / spells / charm see her */
function fighter(name: string, x: number, z: number, facing: number) {
  const f = {
    name, defeated: false, blocking: false, root: new THREE.Group(), facingAngle: facing,
    reactions: [] as string[], pushes: [] as number[], hasWand: true, castLock: false,
    currentStrike: null as string | null, reacting: null as string | null,
    get position() { return f.root.position; },
    get canStrike() { return !f.castLock && !f.currentStrike && !f.reacting; },
    react(kind: string, push?: THREE.Vector3) {
      f.reactions.push(kind);
      f.pushes.push(push ? push.length() : 0);
      f.currentStrike = null;                              // a reaction cuts any clip
      f.castLock = false;
    },
    setExpression() {},
    setDefeated(on: boolean) { f.defeated = on; },
    disarm() { return true; },
    setHold() {},
    playStrike(c: SpellClip) { f.currentStrike = c; },
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

const run = (s: SpellSystem, t: number, each?: () => void) => {
  for (let x = 0; x < t; x += DT) {
    s.update(DT);
    each?.();
  }
};

/** Susan at z = dist facing Malfoid (at the origin); her spell system */
function cast(dist: number) {
  const malfoid = fighter('Malfoid', 0, 0, 0);
  const mT = new FighterTarget(malfoid as unknown as Malfoid);
  const sC = new Caster_(new THREE.Vector3(0, 0, dist), Math.PI);
  const sS = new SpellSystem(sC, emitter(sC), () => false, undefined, { targets: [mT], solids: [], groundY: 0 });
  return { malfoid, mT, sS };
}

test('Impedimenta: a little damage, a flinch, and Malfoid slowed for its duration (frozen while paused)', () => {
  const s = cast(6);
  assert.ok(s.sS.cast(IMPEDIMENTA));
  run(s.sS, IMPEDIMENTA.release + 6 / IMPEDIMENTA.projectile.speed + 0.1);
  assert.equal(s.mT.hp, 100 - IMPEDIMENTA_DAMAGE);
  assert.deepEqual(s.malfoid.reactions, ['hit']);
  assert.equal(s.mT.timeScale, IMPEDIMENTA_SLOW.factor, 'slowed');
  // paused: no update, so the slow doesn't wear off
  const left = s.mT.slowLeft;
  assert.ok(left > IMPEDIMENTA_SLOW.duration - 0.2);
  for (let t = 0; t < left - 0.05; t += DT) s.mT.update(DT);
  assert.equal(s.mT.timeScale, IMPEDIMENTA_SLOW.factor, 'still slowed just before the end');
  for (let t = 0; t < 0.1; t += DT) s.mT.update(DT);
  assert.equal(s.mT.timeScale, 1, 'back to normal speed');
  // blocked: chip damage, no slow
  const b = cast(6);
  b.malfoid.blocking = true;
  b.sS.cast(IMPEDIMENTA);
  run(b.sS, 1.0);
  assert.equal(b.mT.timeScale, 1, 'a block stops the jinx');
  // a fresh duel clears it
  s.mT.slow(0.5, 3);
  s.mT.reset();
  assert.equal(s.mT.timeScale, 1);
});

test('Depulso: throws Malfoid back hard from close, never reaches past its range', () => {
  const near = cast(1.8);
  near.sS.cast(DEPULSO);
  run(near.sS, 1.0);
  assert.equal(near.mT.hp, 100 - DEPULSO_DAMAGE);
  assert.deepEqual(near.malfoid.reactions, ['knockback']);
  assert.ok(Math.abs(near.malfoid.pushes[0] - DEPULSO_KNOCKBACK) < 1e-6);
  const far = cast(DEPULSO_MAX_RANGE + 1.5);
  far.sS.cast(DEPULSO);
  run(far.sS, 1.5);
  assert.equal(far.mT.hp, 100, 'out of range');
});

test('Hufflepuff Resolve: a stagger is only a flinch, a knockback pushes her less; damage unchanged', () => {
  const f = fighter('Susan', 0, 0, 0);
  const t = new FighterTarget(f as unknown as Malfoid, 150);
  t.resolve = HUFFLEPUFF_RESOLVE;
  const dir = new THREE.Vector3(0, 0, 1);
  t.takeHit({ damage: 8, height: 'high', effect: 'stagger', dir });
  t.takeHit({ damage: 9, height: 'high', effect: 'knockback', dir, knockback: 6 });
  t.takeHit({ damage: 10, height: 'low', effect: 'knockdown', dir });
  assert.deepEqual(f.reactions, ['hit', 'knockback', 'knockback']);
  assert.ok(Math.abs(f.pushes[1] - 6 * HUFFLEPUFF_RESOLVE.push) < 1e-6);
  assert.equal(t.hp, 150 - 27);
  // without it (Ginny, Cho): unchanged
  const g = fighter('Ginny', 0, 0, 0);
  new FighterTarget(g as unknown as Malfoid).takeHit({ damage: 8, height: 'high', effect: 'stagger', dir });
  assert.deepEqual(g.reactions, ['stagger']);
});

test('Episkey: heals after the whole cast, never past full; a hit breaks it and keeps the charge', () => {
  const f = fighter('Susan', 0, 0, 0);
  const t = new FighterTarget(f as unknown as Malfoid, 150);
  const h = new Episkey(f, t, 25, 2);
  assert.ok(!h.ready, 'not hurt: nothing to heal');
  t.hp = 100;
  assert.ok(h.start());
  assert.equal(f.currentStrike, 'episkey');
  assert.ok(f.castLock, 'no strikes while casting');
  const step = () => { h.update(DT); t.update(DT); };
  for (let x = 0; x < EPISKEY.castTime - 0.1; x += DT) step();
  assert.equal(t.hp, 100, 'not yet');
  for (let x = 0; x < 0.2; x += DT) step();
  assert.equal(t.hp, 125);
  assert.equal(h.charges, 1);
  assert.ok(!f.castLock && !f.currentStrike);
  assert.ok(!h.ready, 'waits before the next');
  for (let x = 0; x < EPISKEY.cooldown + 0.05; x += DT) step();
  // interrupted: hit halfway
  assert.ok(h.start());
  for (let x = 0; x < 0.7; x += DT) step();
  t.takeHit({ damage: 5, height: 'high', effect: 'flinch', dir: new THREE.Vector3(0, 0, 1) });
  step();
  assert.ok(!h.casting, 'broken');
  for (let x = 0; x < EPISKEY.castTime; x += DT) step();
  assert.equal(t.hp, 120, 'no heal');
  assert.equal(h.charges, 1, 'the charge is kept');
  // the last charge, then none; and never past full
  for (let x = 0; x < EPISKEY.retry + 0.05; x += DT) step();
  t.hp = 140;
  assert.ok(h.start());
  for (let x = 0; x < EPISKEY.castTime + 0.05; x += DT) step();
  assert.equal(t.hp, 150, 'capped at full health');
  assert.equal(h.charges, 0);
  t.hp = 50;
  for (let x = 0; x < EPISKEY.cooldown + 0.05; x += DT) step();
  assert.ok(!h.ready, 'no charges left');
  // disarmed: no charm; a new duel: charges back
  h.reset();
  f.hasWand = false;
  assert.ok(!h.ready);
  f.hasWand = true;
  assert.ok(h.ready);
});

// --- her AI -----------------------------------------------------------------------

function aiSetup(dist: number, over: Record<string, unknown> = {}) {
  const base = SUSAN_DIFFICULTY.hard.ai;
  const params = { ...base, reaction: [0.05, 0.05] as [number, number], ...over,
    defensive: { ...base.defensive!, ...(over.defensive as object | undefined) } };
  const self = Object.assign(fighter('Susan', 0, 0, 0), {
    dodging: null as string | null, moves: [] as THREE.Vector3[],
    move(d: THREE.Vector3) { self.moves.push(d.clone()); }, stop() {}, lookAt() {},
    wand: { state: 'hand' },
    dodge() { return false; },
  });
  const opp = fighter('Malfoid', 0, dist, Math.PI);
  const casts: string[] = [];
  const spells = { isCasting: false, canCast: () => true, cast: (d: { id: string }) => { casts.push(d.id); return true; }, cooldownLeft: () => 0 };
  const combat = { busy: false, press() {} };
  const oppCombat = { busy: false, vulnerable: false };
  const oppSpells = { isCasting: false, castTime: -1, castingSpell: null as unknown, projectiles: [] as unknown[] };
  const target = new FighterTarget(self as unknown as Malfoid, 190);
  const holds: string[] = [];
  self.setHold = (name: string, on: boolean) => { holds.push(`${name}:${on}`); self.blocking = name === 'block' && on; };
  const ai = new FighterAI(self as unknown as Malfoid, target, combat as unknown as ComboSystem, spells as unknown as SpellSystem,
    IMPEDIMENTA, opp as unknown as Malfoid, oppCombat as unknown as ComboSystem, () => [], params);
  ai.startDelay = 0;
  ai.opponentSpells = oppSpells as unknown as SpellSystem;
  ai.pushSpell = DEPULSO;
  const heal = new Episkey(self, target, 30, 3);
  ai.heal = heal;
  return { ai, self, opp, casts, oppCombat, oppSpells, target, heal, holds, spells };
}

const until = (s: ReturnType<typeof aiSetup>, cond: () => boolean, n = 40, each?: () => void) => {
  for (let i = 0; i < n && !cond(); i++) {
    each?.();
    s.ai.update(DT);
    s.heal.update(DT);
  }
};

test('Susan holds her ground: she waits at mid range, walks in only when Malfoid is far', () => {
  const mid = aiSetup(4.5, { castChance: 0 });
  const random = Math.random;
  Math.random = () => 0.9;                               // no optional step in
  try {
    mid.ai.setActive(true);
    until(mid, () => false, 30);
    assert.equal(mid.ai.state, 'OBSERVE');
    assert.equal(mid.self.moves.length, 0, 'she does not chase');
  } finally {
    Math.random = random;
  }
  const far = aiSetup(9, { castChance: 0 });
  far.ai.setActive(true);
  until(far, () => far.ai.state === 'APPROACH');
  assert.equal(far.ai.state, 'APPROACH');
});

test('a rush is met with Impedimenta; crowded and attacked, Depulso', () => {
  const random = Math.random;
  Math.random = () => 0.01;                              // every chance succeeds: the decision order is what's tested
  try {
    const r = aiSetup(6, { castChance: 0 });
    r.ai.setActive(true);
    // Malfoid runs at her at 4 m/s
    until(r, () => r.casts.length > 0, 60, () => r.opp.root.position.z -= 4 * DT);
    assert.deepEqual(r.casts, ['impedimenta']);
    const p = aiSetup(1.4, { castChance: 0 });
    p.oppCombat.busy = true;
    p.ai.setActive(true);
    until(p, () => p.casts.length > 0);
    assert.deepEqual(p.casts, ['depulso']);
  } finally {
    Math.random = random;
  }
});

test('hurt, she backs off and heals with Episkey; a hit breaks the charm', () => {
  const random = Math.random;
  Math.random = () => 0.01;
  try {
    // far enough: she heals where she stands
    const far = aiSetup(6, { castChance: 0 });
    far.target.hp = 60;
    far.ai.setActive(true);
    until(far, () => far.ai.state === 'HEAL');
    assert.equal(far.ai.state, 'HEAL');
    assert.ok(far.heal.casting);
    until(far, () => !far.heal.casting, 200);
    assert.equal(far.target.hp, 90, 'healed 30 (Hard)');
    // close: she makes room first, with Depulso if she can ...
    const close = aiSetup(2.0, { castChance: 0, defensive: { pushChance: 0 } });
    close.target.hp = 60;
    close.ai.setActive(true);
    until(close, () => close.casts.length > 0);
    assert.deepEqual(close.casts, ['depulso']);
    // ... or by running a short way off (her back to Malfoid), not a slow back-step
    const run = aiSetup(2.0, { castChance: 0, defensive: { pushChance: 0 } });
    run.spells.canCast = (d: { id: string }) => d.id !== 'depulso';
    run.target.hp = 60;
    run.ai.setActive(true);
    until(run, () => run.ai.state === 'RETREAT');
    assert.equal(run.ai.state, 'RETREAT');
    for (let i = 0; i < 20; i++) run.ai.update(DT);
    assert.equal(run.ai.state, 'RETREAT', 'she keeps running (a decision in between does not cut it short)');
    assert.ok(run.self.moves.at(-1)!.z < 0, 'away from Malfoid');
    // a hit while she heals: broken, the AI moves on
    const hit = aiSetup(6, { castChance: 0 });
    hit.target.hp = 60;
    hit.ai.setActive(true);
    until(hit, () => hit.ai.state === 'HEAL');
    hit.target.takeHit({ damage: 5, height: 'high', effect: 'flinch', dir: new THREE.Vector3(0, 0, -1) });
    hit.self.reacting = 'hit';
    until(hit, () => hit.ai.state !== 'HEAL', 5);
    assert.ok(!hit.heal.casting, 'the charm is broken');
    assert.equal(hit.heal.charges, 3, 'charge kept');
    assert.equal(hit.ai.state, 'STAGGER');
  } finally {
    Math.random = random;
  }
});

test("Susan's definition: her spells, Episkey per level, Resolve, the pitch", () => {
  const s = OPPONENTS.susan;
  assert.equal(s.spell.id, 'impedimenta');
  assert.equal(s.push?.id, 'depulso');
  assert.ok(s.episkey && s.resolve);
  assert.ok(!s.protego, 'no parry: that is Cho\'s');
  assert.deepEqual(Object.values(s.difficulty).map((l) => l.heal?.amount), [20, 25, 30]);
  assert.ok(s.difficulty.easy.hp < s.difficulty.normal.hp && s.difficulty.normal.hp < s.difficulty.hard.hp);
});

test('she reads a Confringo wind-up and has her guard up when the bolt arrives (no parry, no dodge)', () => {
  const random = Math.random;
  Math.random = () => 0.01;
  try {
    const s = aiSetup(6, { castChance: 0 });
    s.ai.setActive(true);
    s.ai.update(DT);
    s.opp.facingAngle = Math.PI;                         // aimed at her
    s.oppSpells.isCasting = true;
    s.oppSpells.castingSpell = CONFRINGO;
    s.oppSpells.castTime = CONFRINGO.release - 0.1;
    const arrive = 0.1 + 5.5 / CONFRINGO.projectile.speed;
    let upAt = -1;
    for (let t = 0; t < arrive + 0.02; t += DT) {
      s.oppSpells.castTime += DT;
      if (s.oppSpells.castTime > CONFRINGO.castDuration) s.oppSpells.isCasting = false;
      s.ai.update(DT);
      if (s.self.blocking && upAt < 0) upAt = t;
    }
    assert.ok(upAt > 0, 'not straight away: she waits for the bolt');
    assert.ok(s.self.blocking, 'guard up as it arrives');
    assert.equal(s.ai.state, 'BLOCK');
  } finally {
    Math.random = random;
  }
});
