// Malfoid's Impedimenta (learned from Susan, key 3): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Caster, SpellSystem } from '../src/combat/spells/SpellSystem';
import type { SpellEmitter } from '../src/combat/spells/SpellEmitter';
import { IMPEDIMENTA, IMPEDIMENTA_SLOW, MALFOID_IMPEDIMENTA } from '../src/combat/spells/Impedimenta';
import { CONFRINGO } from '../src/combat/spells/Confringo';
import { FighterTarget } from '../src/combat/FighterTarget';
import { ALL_SPELLS, CAMPAIGN, SPELL_INFO, spellsBefore } from '../src/game/campaign';
import type { Malfoid } from '../src/character/Malfoid';

const DT = 1 / 60;

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

function opponent(z: number) {
  const f = {
    name: 'Hermione', defeated: false, blocking: false, petrified: false, lying: false, root: new THREE.Group(), facingAngle: Math.PI,
    reactions: [] as string[], hasWand: true, currentStrike: null as string | null, reacting: null as string | null,
    get position() { return f.root.position; },
    react(kind: string) { f.reactions.push(kind); },
    setExpression() {}, setDefeated(on: boolean) { f.defeated = on; }, disarm() { return true; }, setHold() {}, resetIdleTimer() {},
  };
  f.root.position.set(0, 0, z);
  return f;
}

test('Malfoid\'s Impedimenta: Susan\'s bolt and slow, her own wand thrust (a clip her model has), a longer cooldown', () => {
  assert.equal(MALFOID_IMPEDIMENTA.id, 'impedimenta');
  assert.deepEqual(MALFOID_IMPEDIMENTA.slow, IMPEDIMENTA_SLOW);
  assert.equal(MALFOID_IMPEDIMENTA.directDamage, IMPEDIMENTA.directDamage);
  assert.ok(MALFOID_IMPEDIMENTA.cooldown > IMPEDIMENTA.cooldown, 'a slow every 6 s would trivialise a fight');
  const clips = readFileSync('public/models/malfoid.json', 'utf8');
  assert.ok(clips.includes(`"${MALFOID_IMPEDIMENTA.clip}"`), `Malfoid's model has ${MALFOID_IMPEDIMENTA.clip}`);
});

test('cast at an opponent: it slows her (her own time runs at the slow\'s factor), then the cooldown holds it', () => {
  const foe = opponent(6);
  const fT = new FighterTarget(foe as unknown as Malfoid, 220);
  const c = new Caster_(new THREE.Vector3(0, 0, 0), 0);
  const emitter: SpellEmitter = {
    getWorldPosition: (o) => o.set(0, 1.3, 0.45),
    getWorldDirection: (o) => o.set(0, 0, 1),
  };
  const s = new SpellSystem(c, emitter, () => false, undefined, { targets: [fT], solids: [], groundY: 0 });
  assert.ok(s.cast(MALFOID_IMPEDIMENTA));
  for (let t = 0; t < MALFOID_IMPEDIMENTA.castDuration + 6 / MALFOID_IMPEDIMENTA.projectile!.speed + 0.1; t += DT) s.update(DT);
  assert.equal(fT.hp, 220 - MALFOID_IMPEDIMENTA.directDamage);
  assert.equal(fT.timeScale, IMPEDIMENTA_SLOW.factor, 'slowed');
  assert.ok(!s.cast(MALFOID_IMPEDIMENTA), 'cooling down');
  assert.ok(s.cooldownLeft(MALFOID_IMPEDIMENTA) > MALFOID_IMPEDIMENTA.cooldown - 1);
  assert.ok(s.cast(CONFRINGO), 'its own cooldown: Confringo is still ready');
});

test('learned from Susan: the campaign\'s third reward, in practice from Luna on; every spell on its own number key', () => {
  assert.equal(CAMPAIGN.find((o) => o.id === 'susan')?.reward, 'impedimenta');
  assert.ok(ALL_SPELLS.has('impedimenta'));
  assert.ok(!spellsBefore('susan').has('impedimenta'), 'not against Susan herself');
  assert.ok(spellsBefore('luna').has('impedimenta') && spellsBefore('hermione').has('impedimenta'));
  const keys = [CONFRINGO.key, SPELL_INFO.expelliarmus.key, SPELL_INFO.protego.key, SPELL_INFO.impedimenta.key];
  assert.deepEqual(keys, ['0', '1', '2', '3']);
});
