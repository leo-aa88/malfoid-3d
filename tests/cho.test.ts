// Logic tests for Cho's combat (no WebGL): Protego and reflection, Stupefy, Ventus, her AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Caster, SpellSystem } from '../src/combat/spells/SpellSystem';
import type { SpellEmitter } from '../src/combat/spells/SpellEmitter';
import { CONFRINGO } from '../src/combat/spells/Confringo';
import { STUPEFY, STUPEFY_DAMAGE } from '../src/combat/spells/Stupefy';
import { VENTUS, VENTUS_RANGE } from '../src/combat/spells/Ventus';
import { PROTEGO, Protego } from '../src/combat/Protego';
import { FighterTarget } from '../src/combat/FighterTarget';
import { FighterAI } from '../src/combat/ai/FighterAI';
import { CHO_DIFFICULTY } from '../src/combat/ai/difficulty';
import type { Malfoid } from '../src/character/Malfoid';
import type { ComboSystem } from '../src/combat/ComboSystem';

const DT = 1 / 60;

/** a fighter as the target / shield / spell system see her */
function fighter(name: string, x: number, z: number, facing: number) {
  const f = {
    name, defeated: false, blocking: false, root: new THREE.Group(), facingAngle: facing, reactions: [] as string[],
    holds: [] as string[], hasWand: true,
    get position() { return f.root.position; },
    react(kind: string) { f.reactions.push(kind); },
    setExpression() {},
    setDefeated(on: boolean) { f.defeated = on; },
    disarm() { return true; },
    setHold(name: string, on: boolean) { f.holds.push(`${name}:${on}`); },
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

const run = (systems: SpellSystem[], t: number, each?: () => void) => {
  for (let x = 0; x < t; x += DT) {
    for (const s of systems) s.update(DT);
    each?.();
  }
};

/** Malfoid at z = 0 facing +z, Cho 5 m ahead facing her; each with her spell system */
function duel() {
  const malfoid = fighter('Malfoid', 0, 0, 0);
  const cho = fighter('Cho', 0, 5, Math.PI);
  const mT = new FighterTarget(malfoid as unknown as Malfoid);
  const cT = new FighterTarget(cho as unknown as Malfoid);
  const mC = new Caster_(malfoid.position, 0);
  const cC = new Caster_(cho.position, Math.PI);
  const mS = new SpellSystem(mC, emitter(mC), () => false, undefined, { targets: [cT], solids: [], groundY: 0 });
  const cS = new SpellSystem(cC, emitter(cC), () => false, undefined, { targets: [mT], solids: [], groundY: 0 });
  const shield = new Protego(cho);
  cT.shield = shield;
  cT.reflector = cS;
  const events: string[] = [];
  mS.onEvent = (e) => events.push('malfoid:' + e.type);
  cS.onEvent = (e) => events.push('cho:' + e.type);
  return { malfoid, cho, mT, cT, mS, cS, shield, events, mC };
}

test('Protego: up for a moment, then a 5 s cooldown; the perfect window reflects, later absorbs, the back is open', () => {
  const f = fighter('Cho', 0, 0, 0);
  const p = new Protego(f);
  const front = new THREE.Vector3(0, 0, -1);           // a spell flying at her face (she faces +z)
  const back = new THREE.Vector3(0, 0, 1);
  assert.equal(p.intercept(front), null, 'down: nothing');
  assert.ok(p.raise());
  assert.deepEqual(f.holds, ['protego:true']);
  assert.equal(p.intercept(back), null, 'from behind: not covered');
  assert.equal(p.intercept(front), 'reflect', 'inside the perfect window');
  for (let t = 0; t < PROTEGO.perfectWindow + 0.05; t += DT) p.update(DT);
  assert.equal(p.intercept(front), 'absorb', 'after the window');
  for (let t = 0; t < PROTEGO.maxHold; t += DT) p.update(DT);
  assert.ok(!p.up, 'lowered after maxHold');
  assert.equal(f.holds.at(-1), 'protego:false');
  assert.ok(!p.raise(), 'cooling down');
  for (let t = 0; t < PROTEGO.cooldown + 0.05; t += DT) p.update(DT);
  assert.ok(p.raise(), 'ready again');
});

test('a parried Confringo flies back as Cho\'s: it hits Malfoid, never Cho, and costs Cho nothing', () => {
  const { mT, cT, mS, cS, shield, events } = duel();
  assert.ok(mS.cast(CONFRINGO));
  // raise the shield just before the bolt arrives (release 0.42 s, ~4.5 m at 18 m/s)
  run([mS, cS], 0.42 + 4.0 / CONFRINGO.projectile.speed - 0.08);
  assert.ok(shield.raise());
  run([mS, cS], 1.5);
  assert.equal(cT.hp, 100, 'Cho untouched');
  assert.equal(mT.hp, 100 - CONFRINGO.directDamage, 'Malfoid takes her own spell');
  assert.ok(events.includes('malfoid:reflected'));
  assert.ok(events.includes('cho:hit'), 'the hit is reported by its new owner');
  assert.equal(cS.cooldownLeft(CONFRINGO), 0);
  assert.equal(mS.projectiles.length + cS.projectiles.length, 0, 'nothing left in flight');
});

test('a shield raised early only stops the spell (no damage, nothing reflected); without it Cho is hit', () => {
  const a = duel();
  a.shield.raise();
  a.mS.cast(CONFRINGO);
  run([a.mS, a.cS], 1.5, () => a.shield.update(DT));
  assert.equal(a.cT.hp, 100);
  assert.equal(a.mT.hp, 100);
  assert.ok(a.events.includes('malfoid:shielded'));
  const b = duel();
  b.mS.cast(CONFRINGO);
  run([b.mS, b.cS], 1.5);
  assert.equal(b.cT.hp, 100 - CONFRINGO.directDamage);
});

test('Stupefy: fast, moderate damage, a stagger; Ventus: a short-range shove that dies out', () => {
  const s = duel();
  assert.ok(s.cS.cast(STUPEFY));
  run([s.cS], STUPEFY.release + 5 / STUPEFY.projectile.speed + 0.1);
  assert.equal(s.mT.hp, 100 - STUPEFY_DAMAGE, 'hits in under half a second');
  assert.deepEqual(s.malfoid.reactions, ['stagger']);
  // Ventus: from 5 m away it never arrives; from 1.5 m it throws her back hard
  const far = duel();
  far.cS.cast(VENTUS);
  run([far.cS], 1.5);
  assert.equal(far.mT.hp, 100, `nothing beyond ${VENTUS_RANGE} m`);
  const near = duel();
  near.cho.root.position.set(0.3, 0, 1.5);                // a little off her line: the gust is wide
  near.cS.cast(VENTUS);
  run([near.cS], 1.2);
  assert.equal(near.mT.hp, 100 - VENTUS.directDamage);
  assert.deepEqual(near.malfoid.reactions, ['knockback']);
});

// --- her AI -----------------------------------------------------------------------

function aiSetup(dist: number, over: Record<string, unknown> = {}) {
  const base = CHO_DIFFICULTY.hard.ai;
  const params = { ...base, reaction: [0.05, 0.05] as [number, number], ...over,
    evasive: { ...base.evasive!, ...(over.evasive as object | undefined) } };
  const self = Object.assign(fighter('Cho', 0, 0, 0), {
    reacting: null as string | null, canStrike: true, dodging: null as string | null, dodges: [] as string[], moves: [] as THREE.Vector3[],
    move(d: THREE.Vector3) { self.moves.push(d.clone()); }, stop() {}, lookAt() {},
    wand: { state: 'hand' },
    dodge(kind: string) { self.dodges.push(kind); self.dodging = kind; return true; },
  });
  const opp = fighter('Malfoid', 0, dist, Math.PI);
  const casts: string[] = [];
  const spells = { isCasting: false, canCast: () => true, cast: (d: { id: string }) => { casts.push(d.id); return true; }, cooldownLeft: () => 0 };
  const combat = { busy: false, press() {} };
  const oppCombat = { busy: false, vulnerable: false };
  const oppSpells = { isCasting: false, castTime: -1, castingSpell: null as unknown, projectiles: [] as unknown[] };
  const target = new FighterTarget(self as unknown as Malfoid);
  const ai = new FighterAI(self as unknown as Malfoid, target, combat as unknown as ComboSystem, spells as unknown as SpellSystem,
    STUPEFY, opp as unknown as Malfoid, oppCombat as unknown as ComboSystem, () => [], params);
  ai.startDelay = 0;
  ai.opponentSpells = oppSpells as unknown as SpellSystem;
  const shield = new Protego(self);
  ai.shield = shield;
  ai.pushSpell = VENTUS;
  return { ai, self, opp, casts, oppSpells, oppCombat, shield, spells };
}

test('Cho keeps her distance: circles at 4-7 m, backs off when crowded, closes in when far', () => {
  const mid = aiSetup(5.5, { castChance: 0 });
  mid.ai.setActive(true);
  for (let i = 0; i < 20 && mid.ai.state !== 'CIRCLE'; i++) mid.ai.update(DT);
  assert.equal(mid.ai.state, 'CIRCLE');
  mid.ai.update(DT);
  const step = mid.self.moves.at(-1)!;
  assert.ok(Math.abs(step.x) > Math.abs(step.z), 'sideways round the opponent');
  const close = aiSetup(2.6, { castChance: 0, evasive: { backStepChance: 0, pushChance: 0 } });
  close.ai.setActive(true);
  for (let i = 0; i < 20 && close.ai.state !== 'RETREAT'; i++) close.ai.update(DT);
  assert.equal(close.ai.state, 'RETREAT');
  const far = aiSetup(9.5, { castChance: 0 });
  far.ai.setActive(true);
  for (let i = 0; i < 20 && far.ai.state !== 'APPROACH'; i++) far.ai.update(DT);
  assert.equal(far.ai.state, 'APPROACH');
});

test('she reads a Confringo wind-up and raises Protego to meet the bolt (a parry when timed for it)', () => {
  const s = aiSetup(5, { castChance: 0, evasive: { shieldChance: 1, perfectChance: 1, timingError: 0, spamBonus: 0 } });
  s.ai.setActive(true);
  s.ai.update(DT);
  // Malfoid aims at her and is about to release
  s.opp.facingAngle = Math.PI;                            // Malfoid at z = 5 facing -z: at Cho
  s.oppSpells.isCasting = true;
  s.oppSpells.castingSpell = CONFRINGO;
  s.oppSpells.castTime = CONFRINGO.release - 0.1;
  s.ai.update(DT);
  assert.equal(s.ai.state, 'PROTEGO');
  assert.ok(!s.shield.up, 'not yet: she waits for the bolt');
  // the bolt reaches her (5 - 0.5) / 18 = 0.25 s after the release, which is 0.1 s away
  const arrive = 0.1 + 4.5 / CONFRINGO.projectile.speed;
  let upAt = -1;
  for (let t = 0; t < arrive; t += DT) {
    s.oppSpells.castTime += DT;
    s.ai.update(DT);
    s.shield.update(DT);
    if (s.shield.up && upAt < 0) upAt = t;
  }
  assert.ok(s.shield.up, 'up when the bolt arrives');
  assert.ok(s.shield.age <= PROTEGO.perfectWindow, `inside the perfect window (age ${s.shield.age.toFixed(3)} s)`);
});

test('repeated Confringos make her expect the next one; a stopped spell is answered with Stupefy', () => {
  const s = aiSetup(5, { castChance: 0, dodgeChance: 0, evasive: { shieldChance: 0, counterChance: 1, counterDelay: [0.05, 0.05] } });
  s.ai.setActive(true);
  s.opp.facingAngle = Math.PI;
  for (let k = 0; k < 3; k++) {
    s.oppSpells.isCasting = true;
    s.oppSpells.castingSpell = CONFRINGO;
    s.oppSpells.castTime = CONFRINGO.release - 0.1;
    s.ai.update(DT);
    s.oppSpells.isCasting = false;
    s.ai.update(DT);
  }
  assert.equal(s.ai.recentConfringos, 3);
  s.ai.shieldResult('absorb');
  for (let i = 0; i < 10; i++) s.ai.update(DT);
  assert.ok(s.casts.includes('stupefy'), 'Stupefy straight back');
});

test('crowded and under attack: Ventus; an attack she sees coming in reach: a dodge clip', () => {
  const v = aiSetup(1.5, { castChance: 0, evasive: { pushChance: 1 } });
  v.oppCombat.busy = true;
  v.ai.setActive(true);
  for (let i = 0; i < 20 && !v.casts.length; i++) v.ai.update(DT);
  assert.deepEqual(v.casts, ['ventus']);
  const d = aiSetup(1.2, { castChance: 0, evasive: { pushChance: 0, dodgeClipChance: 1 } });
  d.oppCombat.busy = true;
  d.ai.setActive(true);
  for (let i = 0; i < 30 && !d.self.dodges.length; i++) d.ai.update(DT);
  assert.equal(d.self.dodges.length, 1);
  assert.equal(d.ai.state, 'DODGE');
});
