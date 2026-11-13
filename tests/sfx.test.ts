// Logic tests for which sounds play when (no Web Audio): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { connectCombatSounds } from '../src/audio/combatSounds';
import type { Sfx, SoundId, PlayOptions } from '../src/audio/Sfx';
import type { Malfoid } from '../src/character/Malfoid';
import type { ComboSystem } from '../src/combat/ComboSystem';
import type { SpellSystem } from '../src/combat/spells/SpellSystem';
import type { FighterTarget } from '../src/combat/FighterTarget';
import type { HitEffect } from '../src/combat/CombatTarget';

const DT = 1 / 60;

class FakeSfx {
  played: { id: SoundId; opts: PlayOptions }[] = [];
  play(id: SoundId, opts: PlayOptions = {}) {
    this.played.push({ id, opts });
    return { stop() {} };
  }
  count(id: SoundId) {
    return this.played.filter((p) => p.id === id).length;
  }
}

/** a fighter walking (or running) a loop of `period` seconds; speed < 0 steps backwards */
class FakeFighter {
  root = { visible: true };
  position = new THREE.Vector3();
  state = 'idle';
  t = 0;
  period = 1;
  speed = 0;
  get stridePhase(): number | null {
    if (this.state !== 'walk' && this.state !== 'run') return null;
    return (((this.t / this.period) % 1) + 1) % 1;
  }
  step(dt: number) {
    if (this.stridePhase !== null) this.t += dt * this.speed;
  }
}

function setup() {
  const sfx = new FakeSfx();
  const malfoid = new FakeFighter();
  const ginny = new FakeFighter();
  const sys = () => ({ onEvent: null as ((e: unknown) => void) | null });
  const spells = sys();
  const hurt = (name: string) => ({ name, fighter: { position: new THREE.Vector3() }, onHurt: null as ((d: number, e: HitEffect) => void) | null });
  const targets = [hurt('Malfoid'), hurt('Ginny')];
  const sounds = connectCombatSounds(sfx as unknown as Sfx, {
    malfoid: malfoid as unknown as Malfoid,
    ginny: ginny as unknown as Malfoid,
    combat: sys() as unknown as ComboSystem,
    ginnyCombat: sys() as unknown as ComboSystem,
    spells: spells as unknown as SpellSystem,
    ginnySpells: sys() as unknown as SpellSystem,
    fighters: targets as unknown as FighterTarget[],
  });
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      malfoid.step(DT);
      ginny.step(DT);
      sounds.update(DT);
    }
  };
  return { sfx, malfoid, ginny, targets, run, sounds, spells };
}

test('footsteps: two per walk cycle, none when standing or hidden', () => {
  const { sfx, malfoid, ginny, run } = setup();
  ginny.root.visible = false;                 // training: Ginny is hidden
  ginny.state = 'walk';
  ginny.speed = 1;
  run(1);
  assert.equal(sfx.count('step'), 0, 'idle Malfoid and hidden Ginny make no steps');
  malfoid.state = 'walk';
  malfoid.speed = 1;
  run(3.01);                                   // 3 cycles = 6 foot landings (the first foot is already down)
  assert.equal(sfx.count('step'), 6);
  malfoid.state = 'idle';
  run(1);
  assert.equal(sfx.count('step'), 6, 'stopping stops the steps');
});

test('footsteps: running is quicker and louder; stepping back still steps', () => {
  const { sfx, malfoid, run } = setup();
  malfoid.state = 'run';
  malfoid.period = 0.62;
  malfoid.speed = 1;
  run(0.62 * 4 + 0.01);
  assert.equal(sfx.count('step'), 8);
  const runVol = sfx.played[0].opts.volume!;
  sfx.played.length = 0;
  malfoid.state = 'walk';
  malfoid.period = 1;
  malfoid.speed = -1;                          // backwards
  run(2.01);
  assert.equal(sfx.count('step'), 4);
  assert.ok(sfx.played[0].opts.volume! < runVol);
});

test('grunts are spaced in game time, so a pause does not reset the gap', () => {
  const { sfx, targets, run } = setup();
  const malfoidT = targets[0];
  malfoidT.onHurt!(20, 'knockback');          // heavy: always grunts
  malfoidT.onHurt!(20, 'knockback');          // same moment: suppressed
  assert.equal(sfx.count('gruntHeavy'), 1);
  // (a pause would stop update(); no game time passes, so the gap still holds)
  malfoidT.onHurt!(20, 'knockback');
  assert.equal(sfx.count('gruntHeavy'), 1);
  run(0.4);
  malfoidT.onHurt!(20, 'knockback');
  assert.equal(sfx.count('gruntHeavy'), 2);
});

test('volume setting: stored values are read safely, − / + snap to 10 % steps inside 0..100', async () => {
  const { parseVolume, stepVolume, DEFAULT_VOLUME } = await import('../src/ui/VolumeControl');
  assert.equal(parseVolume(null), DEFAULT_VOLUME);
  assert.equal(parseVolume(''), DEFAULT_VOLUME);
  assert.equal(parseVolume('abc'), DEFAULT_VOLUME);
  assert.equal(parseVolume('35'), 35);
  assert.equal(parseVolume('140'), 100);
  assert.equal(parseVolume('-5'), 0);
  assert.equal(stepVolume(80, 1), 90);
  assert.equal(stepVolume(100, 1), 100);
  assert.equal(stepVolume(0, -1), 0);
  assert.equal(stepVolume(35, 1), 40);   // off-step values go to the next step that way
  assert.equal(stepVolume(35, -1), 30);
});

test("spell sounds: Malfoid's Confringo roars from the cast, her Expelliarmus bursts at the release", () => {
  const { sfx, spells } = setup();
  const ev = (type: string, id: string) => spells.onEvent!({ type, spell: { id } });
  ev('cast', 'expelliarmus');
  assert.equal(sfx.played.length, 0, 'no Confringo roar for an Expelliarmus wind-up');
  ev('release', 'expelliarmus');
  assert.deepEqual(sfx.played.map((p) => p.id), ['expelliarmus']);
  ev('cast', 'confringo');
  ev('release', 'confringo');
  assert.deepEqual(sfx.played.map((p) => p.id), ['expelliarmus', 'confringo']);
});
