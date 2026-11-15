// Crouching ducks high strikes, jumping clears low kicks: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CombatEvent, ComboSystem } from '../src/combat/ComboSystem';
import { FighterTarget } from '../src/combat/FighterTarget';
import { MOVES } from '../src/combat/moves';
import type { Malfoid } from '../src/character/Malfoid';

const DT = 1 / 60;

/** an attacker at the origin facing +z, a defender at the move's range */
function duel(defence: { crouching?: boolean; airborne?: boolean }) {
  const a = {
    position: new THREE.Vector3(0, 0, 0), facingAngle: 0, canStrike: true, currentStrike: null as string | null,
    playStrike(c: string) { a.currentStrike = c; }, endStrike() { a.currentStrike = null; }, faceToward() {}, resetIdleTimer() {},
    setStrikeRate() {},
  };
  const d = {
    name: 'Ginny', defeated: false, blocking: false, petrified: false, lying: false, reacting: null as string | null,
    crouching: !!defence.crouching, airborne: !!defence.airborne, root: new THREE.Group(), facingAngle: Math.PI,
    get position() { return d.root.position; }, react() {}, setExpression() {}, setDefeated() {},
  };
  d.root.position.set(0, 0, 0.6);
  const t = new FighterTarget(d as unknown as Malfoid, 100);
  const c = new ComboSystem(a as unknown as Malfoid, () => [t]);
  const events: CombatEvent[] = [];
  c.onEvent = (e) => events.push(e);
  return { c, t, events };
}

/** one strike (the opener for a key, or a finisher started directly) played to its end */
function strike(defence: { crouching?: boolean; airborne?: boolean }, id: keyof typeof MOVES) {
  const s = duel(defence);
  (s.c as unknown as { start(m: unknown, b: string, c: null, o: boolean): void }).start(MOVES[id], 'J', null, false);
  for (let i = 0; i < 120; i++) s.c.update(DT);
  return { hp: s.t.hp, types: s.events.map((e) => e.type) };
}

test('crouching ducks under the high strikes (jab, cross, roundhouse, spinning kick); the uppercut still catches her', () => {
  for (const id of ['jab', 'cross', 'kick_high', 'spin_kick'] as const) {
    const r = strike({ crouching: true }, id);
    assert.equal(r.hp, 100, `${id} ducked`);
    assert.ok(r.types.includes('evaded') && r.types.includes('whiff'), `${id}: DODGED! and a whiff`);
    assert.equal(strike({}, id).hp < 100, true, `${id} hits a standing fighter`);
  }
  assert.ok(strike({ crouching: true }, 'uppercut').hp < 100, 'an uppercut punishes a crouch');
  assert.ok(strike({ crouching: true }, 'body_jab').hp < 100, 'a body punch still lands (block it low)');
});

test('in the air, she clears the low kicks (shin kick, leg sweep); body punches still land', () => {
  for (const id of ['kick_low', 'leg_sweep'] as const) {
    const r = strike({ airborne: true }, id);
    assert.equal(r.hp, 100, `${id} jumped`);
    assert.ok(r.types.includes('evaded'));
  }
  assert.ok(strike({ airborne: true }, 'body_hook').hp < 100);
  assert.ok(strike({ airborne: true }, 'jab').hp < 100, 'a jab still hits her in the air');
});
