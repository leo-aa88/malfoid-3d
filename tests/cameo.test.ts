// Logic tests for Dobby's cameo: when he appears, his rise and fall, what counts as a stun: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAMEO, CameoTrigger, cameoRise } from '../src/ui/DobbyCameo';
import { FighterTarget, HUFFLEPUFF_RESOLVE } from '../src/combat/FighterTarget';
import type { Malfoid } from '../src/character/Malfoid';
import type { HitEffect } from '../src/combat/moves';

/** a random source returning these values in turn */
const rolls = (...v: number[]) => () => v.shift() ?? 0.99;

test('rare: a small chance per stun, then a long cooldown in game time', () => {
  assert.ok(CAMEO.chance > 0 && CAMEO.chance <= 0.1, 'a small chance');
  assert.ok(CAMEO.cooldown >= 30, 'not twice in a short while');
  const t = new CameoTrigger({ chance: 0.05, cooldown: 60 }, rolls(0.5, 0.2, 0.049, 0.0, 0.0));
  assert.equal(t.stunned(), false, 'roll 0.5: no');
  assert.equal(t.stunned(), false, 'roll 0.2: no');
  assert.equal(t.stunned(), true, 'roll 0.049 < 0.05: Dobby');
  t.update(59.9);
  assert.equal(t.stunned(), false, 'within the cooldown, whatever the roll');
  t.update(0.2);
  assert.equal(t.stunned(), true, 'after it');
});

test('the cooldown counts game time only (a pause, with no updates, does not run it down)', () => {
  const t = new CameoTrigger({ chance: 1, cooldown: 60 }, () => 0);
  assert.equal(t.stunned(), true);
  for (let i = 0; i < 100; i++) t.stunned();            // stuns while it cools down: never
  t.update(30);
  assert.equal(t.stunned(), false);
  t.update(30);
  assert.equal(t.stunned(), true);
});

test('his rise into the corner, the hold while the voice speaks, the drop; then gone', () => {
  const c = { rise: 0.2, hold: 1.0, drop: 0.25 };
  assert.equal(cameoRise(-1, c), null);
  assert.equal(cameoRise(0, c), 0);
  assert.ok(cameoRise(0.1, c)! > 0.8, 'eases quickly into place');
  assert.equal(cameoRise(0.2, c), 1);
  assert.equal(cameoRise(1.1, c), 1);
  const dropping = cameoRise(1.3, c)!;
  assert.ok(dropping > 0 && dropping < 1);
  assert.equal(cameoRise(1.46, c), null, 'gone after rise + hold + drop');
  // a quick peek: fully in before the voice's line starts (0.2 s into the sound), gone as it ends
  assert.ok(CAMEO.rise <= 0.2);
  assert.ok(Math.abs(CAMEO.rise + CAMEO.hold + CAMEO.drop - 1.0) < 1e-9, 'on screen 1 s');
  assert.ok(CAMEO.rise + CAMEO.hold >= 0.8, 'up until the line ends');
});

function fakeFighter() {
  const f = {
    name: 'F', defeated: false, blocking: false, root: new THREE.Group(), facingAngle: 0,
    get position() { return f.root.position; },
    react() {}, setExpression() {}, setDefeated(on: boolean) { f.defeated = on; }, disarm() { return true; },
  };
  return f;
}

test('a stun is the reaction she takes: a stagger; not a blocked hit, not a knockout, not Susan\'s Resolve flinch', () => {
  const dir = new THREE.Vector3(1, 0, 0);
  const seen: HitEffect[] = [];
  const t = new FighterTarget(fakeFighter() as unknown as Malfoid, 100);
  t.onReaction = (e) => seen.push(e);
  t.takeHit({ damage: 10, height: 'high', effect: 'stagger', dir });
  t.takeHit({ damage: 5, height: 'high', effect: 'flinch', dir });
  t.takeHit({ damage: 999, height: 'high', effect: 'stagger', dir });    // a knockout: no reaction
  assert.deepEqual(seen, ['stagger', 'flinch']);
  // blocked: no reaction
  const b = fakeFighter();
  const bt = new FighterTarget(b as unknown as Malfoid, 100);
  const bSeen: HitEffect[] = [];
  bt.onReaction = (e) => bSeen.push(e);
  b.blocking = true;
  bt.takeHit({ damage: 10, height: 'high', effect: 'stagger', dir });
  assert.deepEqual(bSeen, []);
  // Susan's Resolve: a stagger only makes her flinch, so she isn't stunned
  const s = new FighterTarget(fakeFighter() as unknown as Malfoid, 150);
  s.resolve = HUFFLEPUFF_RESOLVE;
  const sSeen: HitEffect[] = [];
  s.onReaction = (e) => sSeen.push(e);
  s.takeHit({ damage: 10, height: 'high', effect: 'stagger', dir });
  assert.deepEqual(sSeen, ['flinch']);
});
