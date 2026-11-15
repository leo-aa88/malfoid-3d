// Logic tests for Luna: Confundo, Oppugno's birds, Illusio's copies as targets, her AI: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Caster, SpellSystem } from '../src/combat/spells/SpellSystem';
import type { SpellEmitter } from '../src/combat/spells/SpellEmitter';
import { CONFUNDO, CONFUNDO_DAMAGE, CONFUNDO_TIME } from '../src/combat/spells/Confundo';
import { OPPUGNO, OPPUGNO_SPELL, OppugnoFlock } from '../src/combat/spells/Oppugno';
import { ILLUSIO_SPELL, IllusionTarget } from '../src/combat/Illusio';
import { EXPELLIARMUS } from '../src/combat/spells/Expelliarmus';
import { CONFRINGO } from '../src/combat/spells/Confringo';
import { Protego } from '../src/combat/Protego';
import { FighterTarget } from '../src/combat/FighterTarget';
import { FighterAI } from '../src/combat/ai/FighterAI';
import { LUNA_DIFFICULTY } from '../src/combat/ai/difficulty';
import { OPPONENTS } from '../src/game/opponents';
import { spellsBefore } from '../src/game/campaign';
import type { Malfoid } from '../src/character/Malfoid';
import type { ComboSystem } from '../src/combat/ComboSystem';
import type { SpellClip } from '../src/combat/spells/clips';

const DT = 1 / 60;

function fighter(name: string, x: number, z: number, facing: number) {
  const f = {
    name, defeated: false, blocking: false, root: new THREE.Group(), facingAngle: facing,
    reactions: [] as string[], hasWand: true, castLock: false, currentStrike: null as string | null,
    reacting: null as string | null, standClip: null as string | null,
    get position() { return f.root.position; },
    get canStrike() { return !f.castLock && !f.currentStrike && !f.reacting; },
    react(kind: string) { f.reactions.push(kind); },
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

/** Luna at z = dist facing Malfoid (at the origin); her spell system */
function cast(dist: number) {
  const malfoid = fighter('Malfoid', 0, 0, 0);
  const mT = new FighterTarget(malfoid as unknown as Malfoid);
  const lC = new Caster_(new THREE.Vector3(0, 0, dist), Math.PI);
  const lS = new SpellSystem(lC, emitter(lC), () => false, undefined, { targets: [mT], solids: [], groundY: 0 });
  return { malfoid, mT, lC, lS };
}

const run = (s: SpellSystem, t: number) => {
  for (let x = 0; x < t; x += DT) s.update(DT);
};

test('Confundo: a little damage, a flinch, and Malfoid confused (directions reversed) for its duration', () => {
  const s = cast(6);
  assert.ok(s.lS.cast(CONFUNDO));
  run(s.lS, CONFUNDO.release + 6 / CONFUNDO.projectile.speed + 0.1);
  assert.equal(s.mT.hp, 100 - CONFUNDO_DAMAGE);
  assert.deepEqual(s.malfoid.reactions, ['hit']);
  assert.ok(s.mT.confused);
  assert.ok(CONFUNDO_TIME >= 2 && CONFUNDO_TIME <= 3, 'about 2-3 s');
  const left = s.mT.confusedLeft;
  for (let t = 0; t < left - 0.05; t += DT) s.mT.update(DT);
  assert.ok(s.mT.confused, 'still confused just before the end (game time: a pause freezes it)');
  for (let t = 0; t < 0.1; t += DT) s.mT.update(DT);
  assert.ok(!s.mT.confused);
  // blocked: chip damage, no confusion; a fresh duel clears it
  const b = cast(6);
  b.malfoid.blocking = true;
  b.lS.cast(CONFUNDO);
  run(b.lS, 1.0);
  assert.ok(!b.mT.confused, 'a block stops the charm');
  s.mT.confuse(3);
  s.mT.reset();
  assert.ok(!s.mT.confused);
});

test('Luna\'s levels: the confusion lengthens, more birds and copies, less distracted', () => {
  const [e, n, h] = (['easy', 'normal', 'hard'] as const).map((l) => LUNA_DIFFICULTY[l]);
  assert.ok(e.luna!.confuse < n.luna!.confuse && n.luna!.confuse < h.luna!.confuse);
  assert.ok(e.luna!.confuse >= 2 && h.luna!.confuse <= 3);
  assert.ok(e.luna!.birds <= n.luna!.birds && n.luna!.birds <= h.luna!.birds);
  assert.ok(e.luna!.copies >= 2 && h.luna!.copies <= 3);
  assert.ok(e.ai.chaotic!.distractChance > n.ai.chaotic!.distractChance && n.ai.chaotic!.distractChance > h.ai.chaotic!.distractChance);
  assert.ok(e.hp < n.hp && n.hp < h.hp);
});

test('Luna\'s definition: Confundo first, Expelliarmus second, her summons, Protego; no healing', () => {
  const d = OPPONENTS.luna;
  assert.equal(d.spell.id, 'confundo');
  assert.equal(d.altSpell?.id, 'expelliarmus');
  assert.ok(d.oppugno && d.illusio);
  assert.ok(d.protego, 'Protego (added on request)');
  assert.ok(!d.episkey && !d.push);
  assert.equal(d.character.run?.clip, 'luna_skip');
  assert.ok(d.character.twins);
  // in practice against her, Malfoid has what she'd have reaching her in the campaign
  assert.deepEqual([...spellsBefore('luna')].sort(), ['confringo', 'expelliarmus', 'protego']);
});

test('summoning spells: no bolt; at the release the caster summons, and the cooldown starts', () => {
  const s = cast(6);
  const summoned: string[] = [];
  s.lS.onSummon = (def) => summoned.push(def.id);
  assert.ok(s.lS.cast(OPPUGNO_SPELL));
  run(s.lS, OPPUGNO_SPELL.release + 0.02);
  assert.deepEqual(summoned, ['oppugno']);
  assert.equal(s.lS.projectiles.length, 0);
  assert.ok(s.lS.cooldownLeft(OPPUGNO_SPELL) > 0);
  run(s.lS, OPPUGNO_SPELL.castDuration);
  assert.ok(s.lS.cast(ILLUSIO_SPELL));
  run(s.lS, ILLUSIO_SPELL.release + 0.02);
  assert.deepEqual(summoned, ['oppugno', 'illusio']);
});

/** a flock launched by Luna (at z = dist) at Malfoid (the origin) */
function flock(dist: number) {
  const malfoid = fighter('Malfoid', 0, 0, 0);
  const mT = new FighterTarget(malfoid as unknown as Malfoid);
  const luna = fighter('Luna', 0, dist, Math.PI);
  const lT = new FighterTarget(luna as unknown as Malfoid, 135);
  const f = new OppugnoFlock();
  const hits: { t: number; dmg: number; result: string }[] = [];
  let clock = 0;
  f.onEvent = (e) => { if (e.type === 'hit') hits.push({ t: clock, dmg: e.report.damage, result: e.report.result }); };
  const step = (secs: number, solids: THREE.Box3[] = [], each?: () => void) => {
    for (let x = 0; x < secs; x += DT) {
      clock += DT;
      each?.();
      f.update(DT, solids);
    }
  };
  f.launch(new THREE.Vector3(0, 1.3, dist - 0.45), new THREE.Vector3(0, 0, -1), mT, lT, 5);
  return { malfoid, mT, luna, lT, f, hits, step };
}

test('Oppugno: five birds chase Malfoid and strike one after another (a string of small hits)', () => {
  const s = flock(6);
  s.step(3.0);
  assert.equal(s.hits.length, 5);
  assert.equal(s.mT.hp, 100 - 5 * OPPUGNO.damage);
  assert.ok(s.malfoid.reactions.every((r) => r === 'hit'), 'each only a flinch');
  const ts = s.hits.map((h) => h.t);
  assert.ok(ts[ts.length - 1] - ts[0] > 0.2, 'successive, not one blow');
  assert.equal(s.f.alive, 0);
});

test('Oppugno: a guard takes each bird as chip damage; a wall stops them', () => {
  const g = flock(6);
  g.malfoid.blocking = true;
  g.step(3.0);
  assert.ok(g.hits.every((h) => h.result === 'blocked'));
  assert.ok(100 - g.mT.hp <= 5, 'chip only');
  const w = flock(6);
  const wall = new THREE.Box3(new THREE.Vector3(-3, 0, 2.9), new THREE.Vector3(3, 3, 3.1));
  w.step(3.0, [wall]);
  assert.equal(w.hits.length, 0);
  assert.equal(w.mT.hp, 100);
});

test('Oppugno: close in, the birds commit to a dive: a sidestep timed to it makes them shoot past', () => {
  // she steps 1.6 m aside as the first bird dives; most miss, swing round slowly and fade
  const s = flock(6);
  let moved = false;
  s.step(3.5, [], () => {
    if (!moved && s.f.birds.some((b) => b.alive && b.dive > 0)) {
      moved = true;
      s.malfoid.root.position.x = 1.6;
    }
  });
  assert.ok(moved);
  assert.ok(s.hits.length <= 2, `most missed (${s.hits.length} hit)`);
  // too early (before they commit): they follow her
  const e = flock(6);
  e.step(0.3);
  e.malfoid.root.position.x = 1.6;
  e.step(3.2);
  assert.equal(e.hits.length, 5);
});

test('Oppugno: Protego pops them; a perfect parry sends a bird back at Luna', () => {
  const s = flock(6);
  (s.mT as unknown as { intercept: () => string }).intercept = () => 'absorb';
  s.step(3.0);
  assert.equal(s.mT.hp, 100);
  const r = flock(6);
  let first = true;
  (r.mT as unknown as { intercept: () => string | null }).intercept = () => {
    if (!first) return null;
    first = false;
    return 'reflect';
  };
  r.step(4.0);
  assert.ok(r.lT.hp < 135, 'the reflected bird hit Luna');
  assert.equal(r.mT.hp, 100 - 4 * OPPUGNO.damage, 'the other four reached Malfoid');
});

test('Illusio: a copy is a target only while showing; any hit pops it and does nothing else', () => {
  const copy = { position: new THREE.Vector3(1, 0, 4) } as unknown as Malfoid;
  const t = new IllusionTarget(copy);
  assert.ok(!t.targetable);
  t.active = true;
  let pops = 0;
  t.onPop = () => pops++;
  const r = t.takeHit();
  assert.equal(pops, 1);
  assert.equal(r.result, 'immune');
  assert.equal(r.damage, 0);
  const b = t.getBounds({ x: 0, z: 0, yMin: 0, yMax: 0, radius: 0 });
  assert.deepEqual([b.x, b.z], [1, 4]);
  t.active = false;
  t.takeHit();
  assert.equal(pops, 1, 'a hidden copy can\'t be popped again');
});

// --- her AI -------------------------------------------------------------------------------

function aiSetup(dist: number, over: Record<string, unknown> = {}, chaotic: Record<string, unknown> = {}) {
  const base = LUNA_DIFFICULTY.normal.ai;
  const params = { ...base, reaction: [0.05, 0.05] as [number, number], ...over, chaotic: { ...base.chaotic!, whim: [1, 1], ...chaotic } };
  const self = Object.assign(fighter('Luna', 0, 0, 0), {
    dodging: null as string | null, moves: [] as THREE.Vector3[], runs: 0,
    move(d: THREE.Vector3, running = false) { self.moves.push(d.clone()); if (running) self.runs++; }, stop() {}, lookAt() {},
    wand: { state: 'hand' },
    dodge() { return false; },
  });
  const opp = fighter('Malfoid', 0, dist, Math.PI);
  const casts: string[] = [];
  const ready = new Set(['confundo', 'expelliarmus', 'oppugno', 'illusio']);
  const spells = { isCasting: false, canCast: (d: { id: string }) => ready.has(d.id),
    cast: (d: { id: string }) => { casts.push(d.id); return true; }, cooldownLeft: () => 0 };
  const combat = { busy: false, press() {} };
  const oppCombat = { busy: false, vulnerable: false };
  const oppSpells = { isCasting: false, castTime: -1, castingSpell: null as unknown, projectiles: [] as unknown[] };
  const target = new FighterTarget(self as unknown as Malfoid, 135);
  const ai = new FighterAI(self as unknown as Malfoid, target, combat as unknown as ComboSystem, spells as unknown as SpellSystem,
    CONFUNDO, opp as unknown as Malfoid, oppCombat as unknown as ComboSystem, () => [], params);
  ai.startDelay = 0;
  ai.opponentSpells = oppSpells as unknown as SpellSystem;
  ai.altSpell = EXPELLIARMUS;
  ai.oppugno = OPPUGNO_SPELL;
  ai.illusio = ILLUSIO_SPELL;
  const illusions = { active: false };
  ai.illusions = illusions;
  return { ai, self, opp, casts, oppCombat, oppSpells, target, ready, illusions };
}

const until = (s: ReturnType<typeof aiSetup>, cond: () => boolean, n = 60, each?: () => void) => {
  for (let i = 0; i < n && !cond(); i++) {
    each?.();
    s.ai.update(DT);
  }
};

test('distracted: when nothing presses her she drifts off (a fair opening): no reading, no guard, back after a while', () => {
  const random = Math.random;
  Math.random = () => 0.01;
  try {
    const s = aiSetup(5, { castChance: 0 });
    s.ai.setActive(true);
    until(s, () => s.ai.state === 'DISTRACTED');
    assert.equal(s.ai.state, 'DISTRACTED');
    assert.equal(s.self.standClip, 'distracted');
    // Malfoid casts at her: she doesn't see it (no dodge, no state change)
    s.oppSpells.isCasting = true;
    s.oppSpells.castTime = 0.3;
    s.oppSpells.castingSpell = { id: 'confringo', release: 0.42, projectile: { speed: 20 } };
    until(s, () => false, 20);
    assert.equal(s.ai.state, 'DISTRACTED');
    // it ends on its own
    s.oppSpells.isCasting = false;
    until(s, () => s.ai.state !== 'DISTRACTED', 400);
    assert.notEqual(s.ai.state, 'DISTRACTED');
    assert.equal(s.self.standClip, null);
  } finally {
    Math.random = random;
  }
  // pressed (Malfoid attacking, or close): never distracted
  Math.random = () => 0.01;
  try {
    const p = aiSetup(1.8, { castChance: 0 }, { illusioChance: 0, burstChance: 0 });
    p.oppCombat.busy = true;
    const states = new Set<string>();
    p.ai.setActive(true);
    until(p, () => false, 120, () => states.add(p.ai.state));
    assert.ok(!states.has('DISTRACTED'));
  } finally {
    Math.random = random;
  }
});

test('a hit snaps her out of it', () => {
  const random = Math.random;
  Math.random = () => 0.01;
  try {
    const s = aiSetup(5, { castChance: 0 });
    s.ai.setActive(true);
    until(s, () => s.ai.state === 'DISTRACTED');
    s.self.reacting = 'hit';
    s.ai.update(DT);
    assert.equal(s.ai.state, 'STAGGER');
    assert.equal(s.self.standClip, null);
  } finally {
    Math.random = random;
  }
});

test('her spells: Illusio when none of her copies are out; Oppugno at mid range; Expelliarmus into a cast', () => {
  const random = Math.random;
  Math.random = () => 0.01;
  try {
    const s = aiSetup(5, {}, { distractChance: 0 });
    s.ai.setActive(true);
    until(s, () => s.casts.length > 0);
    assert.deepEqual(s.casts, ['illusio']);
    // copies out: no second Illusio; at mid range the birds
    const o = aiSetup(5, {}, { distractChance: 0 });
    o.illusions.active = true;
    o.ai.setActive(true);
    until(o, () => o.casts.length > 0);
    assert.deepEqual(o.casts, ['oppugno']);
    // Malfoid starts a cast: Expelliarmus into it
    const e = aiSetup(5, {}, { distractChance: 0, illusioChance: 0 });
    e.oppSpells.isCasting = true;
    e.oppSpells.castTime = 0.1;
    e.oppSpells.castingSpell = { id: 'confringo', release: 0.42, projectile: { speed: 20 } };
    e.ai.setActive(true);
    until(e, () => e.casts.length > 0);
    assert.deepEqual(e.casts, ['expelliarmus']);
  } finally {
    Math.random = random;
  }
});

test('she roams: skipping about her ring, circling; bursts, then an inexplicable pause', () => {
  const random = Math.random;
  Math.random = () => 0.3;
  try {
    const s = aiSetup(4.5, { castChance: 0 }, { distractChance: 0, illusioChance: 0, oppugnoChance: 0, confundoRush: 0, burstChance: 0 });
    const states = new Set<string>();
    s.ai.setActive(true);
    until(s, () => false, 300, () => states.add(s.ai.state));
    assert.ok(states.has('SKIP'), 'skips');
    assert.ok(s.self.runs > 0, 'at her skipping gait');
  } finally {
    Math.random = random;
  }
});

test('crowded, she gets away (skips off across the room), and never heads for a spot beyond the arena', () => {
  const random = Math.random;
  Math.random = () => 0.01;
  try {
    const s = aiSetup(1.5, { castChance: 0 }, { illusioChance: 0, distractChance: 0 });
    const goals: THREE.Vector3[] = [];
    s.ai.keepIn = (p) => {
      const d = Math.hypot(p.x, p.z);
      if (d > 3) p.multiplyScalar(3 / d);                // a small round room, radius 3 m
      goals.push(p.clone());
    };
    s.ai.setActive(true);
    until(s, () => s.ai.state === 'SKIP');
    assert.equal(s.ai.state, 'SKIP');
    assert.ok(goals.length > 0 && goals.every((g) => Math.hypot(g.x, g.z) <= 3 + 1e-9), 'inside the room');
    const away = s.self.moves[s.self.moves.length - 1] ?? null;
    until(s, () => s.self.moves.length > 0, 10);
    const m = s.self.moves[0] ?? away;
    assert.ok(m && m.z < 0, 'away from Malfoid (she is at +z)');
  } finally {
    Math.random = random;
  }
});

test('a spell that strikes one of her copies only pops it: its blast never harms Luna beside it', () => {
  // Malfoid (at z = 6, facing -z) casts Confringo at a copy at the origin; Luna stands 0.8 m from it
  const mC = new Caster_(new THREE.Vector3(0, 0, 6), Math.PI);
  const copy = { position: new THREE.Vector3(0, 0, 0) } as unknown as Malfoid;
  const copyT = new IllusionTarget(copy);
  copyT.active = true;
  let pops = 0;
  copyT.onPop = () => { pops++; copyT.active = false; };
  const luna = fighter('Luna', 0.8, 0, 0);
  const lunaT = new FighterTarget(luna as unknown as Malfoid, 150);
  const mS = new SpellSystem(mC, emitter(mC), () => false, undefined, { targets: [lunaT, copyT], solids: [], groundY: 0 });
  assert.ok(mS.cast(CONFRINGO));
  run(mS, CONFRINGO.release + 6 / CONFRINGO.projectile.speed + 0.2);
  assert.equal(pops, 1, 'the copy popped');
  assert.equal(lunaT.hp, 150, 'no splash on Luna');
  // the same blast on Luna herself still hurts (Confringo is unchanged)
  const l2 = fighter('Luna', 0, 0, 0);
  const l2T = new FighterTarget(l2 as unknown as Malfoid, 150);
  const m2C = new Caster_(new THREE.Vector3(0, 0, 6), Math.PI);
  const m2S = new SpellSystem(m2C, emitter(m2C), () => false, undefined, { targets: [l2T], solids: [], groundY: 0 });
  m2S.cast(CONFRINGO);
  run(m2S, CONFRINGO.release + 6 / CONFRINGO.projectile.speed + 0.2);
  assert.ok(l2T.hp < 150);
});

test('she meets a spell she sees cast at her with Protego (when it is ready)', () => {
  const random = Math.random;
  Math.random = () => 0.01;
  try {
    const s = aiSetup(6, { castChance: 0 }, { distractChance: 0, illusioChance: 0, oppugnoChance: 0, burstChance: 0, escapeChance: 0 });
    const shield = new Protego(s.self as unknown as Malfoid);
    s.ai.shield = shield;
    s.ai.setActive(true);
    until(s, () => false, 5);
    s.oppSpells.isCasting = true;
    s.oppSpells.castTime = 0.3;
    s.oppSpells.castingSpell = { id: 'confringo', release: 0.42, projectile: { speed: 20 } };
    until(s, () => s.ai.state === 'PROTEGO', 30, () => { s.oppSpells.castTime += DT; });
    assert.equal(s.ai.state, 'PROTEGO');
  } finally {
    Math.random = random;
  }
});
