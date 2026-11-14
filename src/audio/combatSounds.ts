import * as THREE from 'three';
import type { Malfoid } from '../character/Malfoid';
import type { ComboSystem } from '../combat/ComboSystem';
import type { FighterTarget } from '../combat/FighterTarget';
import type { MoveId } from '../combat/moves';
import type { SpellSystem } from '../combat/spells/SpellSystem';
import type { Sfx, SoundId } from './Sfx';

/*
 * Which sound goes with which game event. Chains onto the systems' existing event handlers
 * (the HUD keeps its own). All tuning is here.
 */

/** strikes that use the heavy impact sounds */
const HEAVY_MOVES = new Set<MoveId>(['kick_low', 'kick_high', 'leg_sweep', 'spin_kick', 'rising_kick', 'uppercut', 'heavy_body']);
/** the same voice, pitched a touch apart for each fighter */
const VOICE_RATE: Record<string, number> = { Malfoid: 0.97, Ginny: 1.06, Cho: 1.02, Susan: 1.0 };
/**
 * an opponent's spell sounds (by spell id): played at the release (the bolt leaves the wand) or
 * from the cast's start (it builds over the wind-up; a cast cancelled before its release cuts it)
 */
const SPELL_SOUND: Record<string, { id: SoundId; at: 'cast' | 'release'; volume: number }> = {
  expelliarmus: { id: 'expelliarmus', at: 'release', volume: 0.85 },
  stupefy: { id: 'stupefy', at: 'release', volume: 0.85 },
  ventus: { id: 'ventus', at: 'cast', volume: 0.8 },
  // Susan's spells borrow these until they have their own sounds
  impedimenta: { id: 'expelliarmus', at: 'release', volume: 0.75 },
  depulso: { id: 'ventus', at: 'cast', volume: 0.85 },
};
/** Protego's hum while the shield is up (a steady, loud sound: quieter than the one-shot spells) */
const SHIELD = { volume: 0.5, rate: 1.0 };
/** at most one grunt per fighter in this long (s); fast combos don't stack them */
const GRUNT_GAP = 0.35;
/** light hits grunt this often; heavy ones always */
const LIGHT_GRUNT_CHANCE = 0.7;
/** footsteps: volume and pitch for walking and running (running lands harder) */
const STEP = {
  walk: { volume: 0.32, rate: 1.0 },
  run: { volume: 0.5, rate: 1.08 },
  /** each step's pitch varies by up to this much either way */
  rateJitter: 0.05,
};

function chain<E>(get: () => ((e: E) => void) | null, set: (f: (e: E) => void) => void, add: (e: E) => void): void {
  const prev = get();
  set((e: E) => {
    prev?.(e);
    add(e);
  });
}

/** an opponent as the sounds see her */
export interface SoundFighter {
  char: Malfoid;
  combat: ComboSystem;
  spells: SpellSystem;
  /** her Protego, if she has one: it hums while it is up */
  protego?: { readonly up: boolean } | null;
}

export interface CombatSoundRefs {
  malfoid: Malfoid;
  combat: ComboSystem;
  spells: SpellSystem;
  /** every opponent (a hidden one makes no footsteps) */
  opponents: SoundFighter[];
  fighters: FighterTarget[];
}

export interface CombatSounds {
  /** call once per game frame (dt in s of game time): footsteps and the sound clock */
  update(dt: number): void;
}

export function connectCombatSounds(sfx: Sfx, r: CombatSoundRefs): CombatSounds {
  let clock = 0;   // game time (s): stops while paused
  // punches and kicks landing (on the dummy or a fighter); blocked ones are muffled
  for (const combat of [r.combat, ...r.opponents.map((o) => o.combat)]) {
    chain(() => combat.onEvent, (f) => (combat.onEvent = f), (e) => {
      if (e.type !== 'strike' || e.result === 'immune') return;
      const heavy = HEAVY_MOVES.has(e.move.id);
      const blocked = e.result === 'blocked';
      sfx.play(heavy ? 'kick' : 'punch', {
        at: e.at,
        volume: blocked ? 0.45 : heavy ? 1.0 : 0.85,
        rate: (blocked ? 1.2 : heavy && e.move.heavy ? 0.9 : 1.0) * (0.96 + Math.random() * 0.08),
      });
    });
  }

  // grunts when a fighter takes damage (not when she blocks)
  const lastGrunt = new Map<FighterTarget, number>();
  for (const t of r.fighters) {
    t.onHurt = (damage, effect) => {
      const now = clock;
      if (now - (lastGrunt.get(t) ?? -99) < GRUNT_GAP) return;
      const heavy = effect === 'knockback' || effect === 'knockdown' || damage >= 14;
      if (!heavy && Math.random() > LIGHT_GRUNT_CHANCE) return;
      lastGrunt.set(t, now);
      const at = t.fighter.position.clone().setY(1.5);
      sfx.play(heavy ? 'gruntHeavy' : 'grunt', { at, volume: 0.75, rate: (VOICE_RATE[t.name] ?? 1) * (0.98 + Math.random() * 0.04) });
    };
  }

  // Malfoid's Confringo: the sound starts with the cast (it builds over the wind-up and roars
  // through the release and the blast); a cast cancelled before the release cuts it.
  // Expelliarmus (Ginny's, and Malfoid's once learned) bursts at the release
  let confringo: { stop(): void } | null = null;
  chain(() => r.spells.onEvent, (f) => (r.spells.onEvent = f), (e) => {
    if (e.spell.id === 'expelliarmus') {
      if (e.type === 'release') sfx.play('expelliarmus', { at: r.malfoid.position.clone().setY(1.3), volume: 0.85 });
    } else if (e.type === 'cast') {
      confringo = sfx.play('confringo', { at: r.malfoid.position.clone().setY(1.3), volume: 0.85 });
    } else if (e.type === 'cancel') {
      confringo?.stop();
      confringo = null;
    }
  });
  for (const o of r.opponents) {
    let building: { stop(): void } | null = null;            // a sound started with the cast
    chain(() => o.spells.onEvent, (f) => (o.spells.onEvent = f), (e) => {
      if (e.type === 'cancel') {
        building?.stop();
        building = null;
        return;
      }
      const s = SPELL_SOUND[e.spell.id];
      if (!s || (e.type !== 'cast' && e.type !== 'release') || s.at !== e.type) return;
      const h = sfx.play(s.id, { at: o.char.position.clone().setY(1.3), volume: s.volume });
      building = s.at === 'cast' ? h : null;
    });
  }

  // footsteps: a foot lands at phase 0 and 0.5 of the walk and run cycles (anim2.py), so a step
  // plays each time the cycle crosses into a new half (forwards or, stepping back, backwards)
  const half = new Map<Malfoid, number | null>();
  const at = new THREE.Vector3();
  const steps = (m: Malfoid) => {
    const ph = m.root.visible ? m.stridePhase : null;
    const prev = half.get(m) ?? null;
    const h = ph === null ? null : Math.floor(ph * 2);
    half.set(m, h);
    if (h === null || prev === null || h === prev) return;      // just started: the first foot is already down
    const s = m.state === 'run' ? STEP.run : STEP.walk;
    sfx.play('step', { at: at.copy(m.position).setY(0.1), volume: s.volume, rate: s.rate * (1 + (Math.random() * 2 - 1) * STEP.rateJitter) });
  };

  // Protego: the hum starts as the shield goes up and fades out as it comes down (a reset or
  // the end of the duel lowers it too)
  const hums = new Map<SoundFighter, { stop(): void } | null>();
  const shields = () => {
    for (const o of r.opponents) {
      const up = !!o.protego?.up && o.char.root.visible;
      const hum = hums.get(o) ?? null;
      if (up && !hum) hums.set(o, sfx.play('protego', { at: o.char.position.clone().setY(1.2), volume: SHIELD.volume, rate: SHIELD.rate }) ?? { stop() {} });
      else if (!up && hum) {
        hum.stop();
        hums.set(o, null);
      }
    }
  };

  return {
    update(dt) {
      clock += dt;
      steps(r.malfoid);
      for (const o of r.opponents) steps(o.char);
      shields();
    },
  };
}
