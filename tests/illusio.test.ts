// Malfoid's Illusio (learned from Luna, key 4): her copies, and how an opponent's spells treat them: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ILLUSIO, ILLUSIO_SPELL, Illusions, MALFOID_ILLUSIO, MALFOID_ILLUSIO_CFG } from '../src/combat/Illusio';
import { Caster, SpellSystem } from '../src/combat/spells/SpellSystem';
import type { SpellEmitter } from '../src/combat/spells/SpellEmitter';
import { EXPELLIARMUS } from '../src/combat/spells/Expelliarmus';
import { FighterTarget } from '../src/combat/FighterTarget';
import { CAMPAIGN, SPELL_INFO, spellsBefore } from '../src/game/campaign';
import type { Malfoid } from '../src/character/Malfoid';

const DT = 1 / 60;

/** a fighter (or a copy of one) as the copies, targets and spells see her */
function fighter(name: string, x: number, z: number) {
  const f = {
    name, defeated: false, blocking: false, petrified: false, lying: false, root: new THREE.Group(), facingAngle: 0,
    reactions: [] as string[], hasWand: true, currentStrike: null as string | null, reacting: null as string | null,
    scene: null as unknown,
    get position() { return f.root.position; },
    react(kind: string) { f.reactions.push(kind); },
    setExpression() {}, setDefeated(on: boolean) { f.defeated = on; }, disarm() { return true; }, setHold() {}, resetIdleTimer() {},
    setFacing(a: number) { f.facingAngle = a; }, faceToward(a: number) { f.facingAngle = a; }, lookAt() {},
    move(dir: THREE.Vector3) { f.root.position.addScaledVector(dir.clone().setY(0).normalize(), 1.5 * DT); },
    stop() {}, update() {},
    playStrike(c: string) { f.currentStrike = c; }, endStrike() { f.currentStrike = null; }, clipDuration: () => 0.9,
  };
  f.root.position.set(x, 0, z);
  return f;
}

function setup() {
  const scene = new THREE.Scene();
  const malfoid = fighter('Malfoid', 0, 0);
  const mT = new FighterTarget(malfoid as unknown as Malfoid);
  const foe = fighter('Hermione', 0, 6);
  const twins = [fighter('Malfoid', 0, 0), fighter('Malfoid', 0, 0)];
  const ill = new Illusions(scene, twins as unknown as Malfoid[], malfoid as unknown as Malfoid, mT, foe);
  ill.cfg = { ...MALFOID_ILLUSIO_CFG };
  return { scene, malfoid, mT, foe, twins, ill };
}

test('Malfoid\'s Illusio: Luna\'s charm with her own gesture (a clip her model has), two copies, a longer cooldown, key 4', () => {
  assert.equal(MALFOID_ILLUSIO.summon, 'illusio');
  assert.equal(MALFOID_ILLUSIO.clip, 'cast_illusio');
  assert.ok(readFileSync('public/models/malfoid.json', 'utf8').includes('"cast_illusio"'), 'Malfoid\'s model has cast_illusio');
  assert.ok(MALFOID_ILLUSIO.cooldown > ILLUSIO_SPELL.cooldown);
  assert.equal(MALFOID_ILLUSIO_CFG.copies, 2);
  assert.equal(MALFOID_ILLUSIO_CFG.shuffle, false);
  assert.ok(ILLUSIO.shuffle, 'Luna\'s still shuffle');
});

test('cast: two copies appear beside her, facing her opponent; she stays where she is (the player steers her)', () => {
  const s = setup();
  s.ill.cast(s.ill.cfg.copies);
  assert.equal(s.ill.count, 2);
  assert.deepEqual(s.malfoid.position.toArray(), [0, 0, 0], 'no shuffle');
  for (const t of s.twins) {
    const p = t.position;
    assert.ok(Math.hypot(p.x, p.z) > 1.0, 'beside her, not on top of her');
    assert.ok(Math.hypot(p.x - s.foe.position.x, p.z - s.foe.position.z) >= MALFOID_ILLUSIO_CFG.minFromFoe - 1e-6);
    assert.ok(Math.abs(t.facingAngle - Math.atan2(s.foe.position.x - p.x, s.foe.position.z - p.z)) < 1e-6, 'facing her opponent');
    assert.ok(t.root.visible);
  }
});

test('a hit pops one copy; Malfoid hit, they all vanish; otherwise they last their life', () => {
  const s = setup();
  s.ill.cast(2);
  s.ill.targets[0].takeHit();
  assert.equal(s.ill.count, 1, 'popped');
  s.mT.hp -= 5;
  s.ill.update(DT);
  assert.equal(s.ill.count, 0, 'her concentration broke');
  const t = setup();
  t.ill.cast(2);
  for (let x = 0; x < MALFOID_ILLUSIO_CFG.life - 0.2; x += DT) t.ill.update(DT);
  assert.ok(t.ill.count > 0, 'still there just before the end');
  for (let x = 0; x < 0.4; x += DT) t.ill.update(DT);
  assert.equal(t.ill.count, 0, 'gone after their life');
});

test('her copies follow whoever she faces (the dummy, then an opponent)', () => {
  const s = setup();
  const other = fighter('Luna', 8, 0);
  s.ill.foe = other;
  s.ill.cast(2);
  for (const t of s.twins) {
    const p = t.position;
    assert.ok(Math.abs(t.facingAngle - Math.atan2(other.position.x - p.x, other.position.z - p.z)) < 1e-6);
  }
});

test('an opponent\'s aim never picks a copy (her AI decides), but her bolt still pops one in its way', () => {
  const s = setup();
  s.ill.cast(2);
  // a copy straight ahead of her, Malfoid off to the side within the aim
  const copy = s.twins[0];
  copy.root.position.set(0, 0, 0);
  s.malfoid.root.position.set(2.2, 0, 0.5);
  const c = new (class implements Caster {
    castLock = false; currentStrike: string | null = null; hasWand = true; facingAngle = Math.PI;
    readonly position = new THREE.Vector3(0, 0, 6);
    get canStrike() { return !this.castLock; }
    playStrike(x: string) { this.currentStrike = x; } endStrike() { this.currentStrike = null; }
    faceToward(a: number) { this.facingAngle = a; } resetIdleTimer() {}
  })();
  const emitter: SpellEmitter = {
    getWorldPosition: (o) => o.set(c.position.x + Math.sin(c.facingAngle) * 0.45, 1.3, c.position.z + Math.cos(c.facingAngle) * 0.45),
    getWorldDirection: (o) => o.set(Math.sin(c.facingAngle), 0, Math.cos(c.facingAngle)),
  };
  const spells = new SpellSystem(c, emitter, () => false, undefined, { targets: [s.mT, ...s.ill.targets], solids: [], groundY: 0 });
  spells.aimAtIllusions = false;
  assert.ok(spells.cast(EXPELLIARMUS));
  const want = Math.atan2(2.2 - 0, 0.5 - 6);
  assert.ok(Math.abs(c.facingAngle - want) < 0.05, `turned to Malfoid, not the copy ahead (${c.facingAngle.toFixed(2)} vs ${want.toFixed(2)})`);
  // facing straight at a copy instead (her AI chose it), with no other target in reach: the bolt pops it
  const t = setup();
  t.ill.cast(2);
  t.twins[0].root.position.set(0, 0, 0);
  t.malfoid.root.position.set(9, 0, -9);
  c.facingAngle = Math.PI;
  c.castLock = false;                                  // (a fresh caster for this one)
  c.currentStrike = null;
  const s2 = new SpellSystem(c, emitter, () => false, undefined, { targets: [t.mT, ...t.ill.targets], solids: [], groundY: 0 });
  s2.aimAtIllusions = false;
  assert.ok(s2.cast(EXPELLIARMUS));
  for (let x = 0; x < 1.5; x += DT) s2.update(DT);
  assert.ok(!t.ill.targets[0].active, 'the copy in its way popped');
  assert.equal(t.mT.hp, 100, 'Malfoid untouched');
});

test('learned from Luna: in practice from Hermione on; key 4', () => {
  assert.equal(CAMPAIGN.find((o) => o.id === 'luna')?.reward, 'illusio');
  assert.ok(!spellsBefore('luna').has('illusio'));
  assert.ok(spellsBefore('hermione').has('illusio'));
  assert.equal(SPELL_INFO.illusio.key, '4');
});

test('her copies feint casts of their own now and then (no bolt; Luna\'s only mimic)', () => {
  const s = setup();
  const feints: string[] = [];
  for (const t of s.twins) {
    const p = t.playStrike.bind(t);
    t.playStrike = (c: string) => { feints.push(c); p(c); };
  }
  s.ill.cast(2);
  for (let x = 0; x < 4.0; x += DT) s.ill.update(DT);
  assert.ok(feints.length >= 2, `both copies feinted (${feints.length})`);
  assert.ok(feints.every((c) => c === 'cast_confringo'));
  assert.equal(s.malfoid.currentStrike, null, 'she did nothing');
  const l = setup();
  l.ill.cfg = { ...ILLUSIO, life: 10 };
  const none: string[] = [];
  for (const t of l.twins) t.playStrike = (c: string) => { none.push(c); };
  l.ill.cast(2);
  for (let x = 0; x < 6.0; x += DT) l.ill.update(DT);
  assert.equal(none.length, 0, 'Luna\'s copies never feint');
});
