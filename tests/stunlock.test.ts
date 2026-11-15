// No stun-lock: a held-down jab-cross (or jab-cross / body-jab-hook) can't keep a fighter reeling: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHAIN, FighterTarget } from '../src/combat/FighterTarget';
import { MOVES } from '../src/combat/moves';
import type { Malfoid } from '../src/character/Malfoid';

const DT = 1 / 60;
const DUR: Record<string, number> = { hit: 0.4, stagger: 0.75, knockback: 0.95 };

/** a fighter whose reactions last their clip's length */
function fighter() {
  const f = {
    name: 'Ginny', defeated: false, blocking: false, petrified: false, lying: false, root: new THREE.Group(), facingAngle: 0,
    reacting: null as string | null, left: 0, reactions: [] as string[],
    get position() { return f.root.position; },
    react(kind: string) { f.reacting = kind; f.left = DUR[kind] ?? 0.4; f.reactions.push(kind); },
    setExpression() {}, setDefeated(on: boolean) { f.defeated = on; },
    step(dt: number) { if (f.reacting && (f.left -= dt) <= 0) f.reacting = null; },
  };
  return f;
}

/** strikes landing at these times (s): how long she spent reeling, and whether she ever had a free moment */
function barrage(hits: [number, keyof typeof MOVES][], total: number) {
  const f = fighter();
  const t = new FighterTarget(f as unknown as Malfoid, 10000);
  let clock = 0, reeling = 0, freeStretch = 0, longestFree = 0, k = 0;
  while (clock < total) {
    while (k < hits.length && hits[k][0] <= clock) {
      const m = MOVES[hits[k][1]];
      t.takeHit({ damage: m.damage, height: m.height, effect: m.effect, dir: new THREE.Vector3(0, 0, 1) });
      k++;
    }
    f.step(DT);
    t.update(DT);
    if (f.reacting) {
      reeling += DT;
      freeStretch = 0;
    } else {
      freeStretch += DT;
      longestFree = Math.max(longestFree, freeStretch);
    }
    clock += DT;
  }
  return { f, t, reeling, longestFree };
}

/** a jab-cross every `every` s (the jab lands ~0.12 s in, the cross ~0.55 s in) for `n` combos */
const jabCross = (every: number, n: number, low = false) => Array.from({ length: n }, (_, i) =>
  [[i * every + 0.12, low && i % 2 ? 'body_jab' : 'jab'], [i * every + 0.55, low && i % 2 ? 'body_hook' : 'cross']] as [number, keyof typeof MOVES][]).flat();

test('a held-down jab-cross no longer stun-locks: the third chained reaction knocks her back, then a moment of armour', () => {
  const r = barrage(jabCross(0.95, 10), 10);
  assert.ok(r.f.reactions.includes('knockback'), 'the chain is broken with a knockback');
  assert.ok(r.longestFree >= CHAIN.armour * 0.9, `she gets a free moment (${r.longestFree.toFixed(2)} s)`);
  assert.ok(r.reeling < 0.8 * 10, `not reeling the whole time (${r.reeling.toFixed(1)} of 10 s)`);
  // alternating high and low combos: the same
  const m = barrage(jabCross(0.95, 10, true), 10);
  assert.ok(m.longestFree >= CHAIN.armour * 0.9, `mixed high / low: a free moment (${m.longestFree.toFixed(2)} s)`);
});

test('armour: hits still hurt, but don\'t stun', () => {
  const r = barrage(jabCross(0.95, 2), 2.0);         // 4 hits: the chain breaks on the 3rd
  const hp = r.t.hp;
  // straight after the knockback, during the armour
  let guard = 0;
  while (r.f.reacting && guard++ < 200) {
    r.f.step(DT);
    r.t.update(DT);
  }
  r.f.step(DT);
  r.t.update(DT);
  assert.ok(r.t.armourLeft > 0, 'armoured once she is up');
  const before = r.f.reactions.length;
  r.t.takeHit({ damage: 5, height: 'high', effect: 'flinch', dir: new THREE.Vector3(0, 0, 1) });
  assert.equal(r.f.reactions.length, before, 'no reaction');
  assert.equal(r.t.hp, hp - 5, 'but the damage counts');
});

test('hits landing during the knockback that broke the chain don\'t restart it', () => {
  // a perfect spammer: the next combo the instant the last one ends (jab-cross every 0.6 s)
  const r = barrage(jabCross(0.6, 20), 12);
  assert.ok(r.longestFree >= CHAIN.armour * 0.9, `she gets a free moment (${r.longestFree.toFixed(2)} s)`);
  assert.ok(r.reeling < 0.8 * 12, `not reeling the whole time (${r.reeling.toFixed(1)} of 12 s)`);
});

test('separate hits with time between them are never chained', () => {
  const r = barrage([[0, 'jab'], [1.2, 'jab'], [2.4, 'jab'], [3.6, 'jab']], 4.5);
  assert.deepEqual(r.f.reactions, ['hit', 'hit', 'hit', 'hit']);
});
