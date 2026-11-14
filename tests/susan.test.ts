// Logic tests for Susan's combat (no WebGL): Impedimenta's slow, Depulso, Hufflepuff Resolve,
// Episkey, her defensive AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Caster, SpellSystem } from '../src/combat/spells/SpellSystem';
import type { SpellEmitter } from '../src/combat/spells/SpellEmitter';
import { IMPEDIMENTA, IMPEDIMENTA_DAMAGE, IMPEDIMENTA_SLOW } from '../src/combat/spells/Impedimenta';
import { CONFRINGO } from '../src/combat/spells/Confringo';
import { EXPELLIARMUS } from '../src/combat/spells/Expelliarmus';
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

test('Episkey: instantaneous (no cast, nothing to break), never past full; a cooldown and charges stop spamming', () => {
  const f = fighter('Susan', 0, 0, 0);
  const t = new FighterTarget(f as unknown as Malfoid, 150);
  const h = new Episkey(f, t, 25, 2);
  assert.ok(!h.ready, 'not hurt: nothing to heal');
  t.hp = 100;
  assert.ok(h.start());
  assert.equal(t.hp, 125, 'healed at once');
  assert.equal(h.charges, 1);
  assert.ok(!f.castLock && !f.currentStrike, 'no cast: she is free to act (no opening)');
  const step = () => { h.update(DT); t.update(DT); };
  // the cooldown: no second heal until it has passed (frozen while paused: game time)
  t.hp = 60;
  assert.ok(!h.start(), 'cooling down');
  for (let x = 0; x < EPISKEY.cooldown - 0.1; x += DT) step();
  assert.ok(!h.start(), 'still cooling down');
  assert.equal(t.hp, 60);
  for (let x = 0; x < 0.15; x += DT) step();
  t.hp = 140;
  assert.ok(h.start());
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

test('hurt, she heals with Episkey where she stands, close or far, and keeps fighting; never twice within the cooldown', () => {
  const random = Math.random;
  Math.random = () => 0.01;
  try {
    for (const d of [6, 1.2]) {
      const s = aiSetup(d, { castChance: 0 });
      s.target.hp = 60;
      s.ai.setActive(true);
      until(s, () => s.target.hp > 60);
      assert.equal(s.target.hp, 90, `healed 30 (Hard) at ${d} m`);
      assert.ok(s.self.moves.every((m) => m.z >= 0), 'no running away to heal');
      s.target.hp = 50;
      const states = new Set<string>();
      until(s, () => false, Math.round((EPISKEY.cooldown - 0.5) / DT), () => states.add(s.ai.state));
      assert.equal(s.target.hp, 50, 'not again within the cooldown');
      assert.ok(!states.has('RETREAT') || d < 2, 'she does not back off to heal');
      until(s, () => s.target.hp > 50, 120);
      assert.equal(s.target.hp, 80, 'again once the cooldown is over');
    }
  } finally {
    Math.random = random;
  }
});

test("Susan's definition: her spells, Episkey per level, Resolve, the pitch", () => {
  const s = OPPONENTS.susan;
  assert.equal(s.spell.id, 'impedimenta');
  assert.equal(s.push?.id, 'depulso');
  assert.ok(s.episkey && s.resolve);
  assert.equal(s.altSpell?.id, 'expelliarmus', 'she alternates Impedimenta with Expelliarmus');
  assert.ok(s.protego, 'and meets spells with Protego');
  assert.deepEqual(Object.values(s.difficulty).map((l) => l.heal?.amount), [20, 25, 30]);
  assert.ok(s.difficulty.easy.hp < s.difficulty.normal.hp && s.difficulty.normal.hp < s.difficulty.hard.hp);
});

test('she reads a Confringo wind-up and has her guard up when the bolt arrives (no Protego ready, no dodge)', () => {
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

test('with Protego ready she meets a read spell with the shield, up before the bolt arrives', async () => {
  const { Protego } = await import('../src/combat/Protego');
  const random = Math.random;
  Math.random = () => 0.4;                               // shield yes (< 0.5 at Hard), parry no (0.4 > 0.18)
  try {
    const s = aiSetup(6, { castChance: 0 });
    const shield = new Protego(s.self);
    s.ai.shield = shield;
    s.ai.setActive(true);
    s.ai.update(DT);
    s.opp.facingAngle = Math.PI;
    s.oppSpells.isCasting = true;
    s.oppSpells.castingSpell = CONFRINGO;
    s.oppSpells.castTime = CONFRINGO.release - 0.1;
    const arrive = 0.1 + 5.5 / CONFRINGO.projectile.speed;
    let upAt = -1;
    for (let t = 0; t < arrive + 0.02; t += DT) {
      s.oppSpells.castTime += DT;
      if (s.oppSpells.castTime > CONFRINGO.castDuration) s.oppSpells.isCasting = false;
      s.ai.update(DT);
      shield.update(DT);
      if (shield.up && upAt < 0) upAt = t;
    }
    assert.ok(upAt >= 0 && shield.up, 'the shield is up as the bolt arrives');
    assert.ok(shield.age > 0.2, 'raised well ahead (a block, not a parry)');
    assert.equal(s.ai.state, 'PROTEGO');
  } finally {
    Math.random = random;
  }
});

test('her ranged spells alternate: Impedimenta, Expelliarmus, Impedimenta...; no Expelliarmus at a disarmed Malfoid', () => {
  const random = Math.random;
  Math.random = () => 0.01;
  try {
    const s = aiSetup(6, { castChance: 1 });
    s.ai.altSpell = EXPELLIARMUS;
    s.ai.setActive(true);
    until(s, () => s.casts.length >= 4, 600);
    assert.deepEqual(s.casts.slice(0, 4), ['expelliarmus', 'impedimenta', 'expelliarmus', 'impedimenta']);
    // only the one that is ready
    s.spells.canCast = (d: { id: string }) => d.id === 'expelliarmus';
    s.casts.length = 0;
    until(s, () => s.casts.length >= 2, 600);
    assert.deepEqual(s.casts.slice(0, 2), ['expelliarmus', 'expelliarmus']);
    // Malfoid disarmed: Impedimenta only
    s.spells.canCast = () => true;
    s.opp.hasWand = false;
    s.casts.length = 0;
    until(s, () => s.casts.length >= 2, 600);
    assert.deepEqual(s.casts.slice(0, 2), ['impedimenta', 'impedimenta']);
  } finally {
    Math.random = random;
  }
});
