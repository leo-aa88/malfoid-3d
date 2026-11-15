import * as THREE from 'three';
import type { SpellDef } from './SpellSystem';
import type { SpellLook } from './ConfringoFx';

/*
 * Accio, the Summoning Charm (Hermione's): aimed at Malfoid's wand lying on the floor, it flies
 * into Hermione's free hand (Wand.summon) and she keeps it until a hit that gets through makes
 * her let go. The cast is a held reach (cast_accio): hit her before the release and nothing
 * comes; a cooldown keeps her from stealing it again at once. No bolt (summon).
 */
export const ACCIO_RELEASE = 0.5;                // s into cast_accio (combat.ACCIO_RELEASE)
export const ACCIO: SpellDef = {
  id: 'accio',
  name: 'Accio',
  key: '',
  clip: 'cast_accio',
  castDuration: 0.9,
  release: ACCIO_RELEASE,
  cooldown: 10.0,
  projectile: { speed: 1, radius: 0.1, maxRange: 1 },     // (no bolt)
  directDamage: 0,
  splashDamage: 0,
  explosionRadius: 0,
  directKnockback: 0,
  splashKnockback: 0,
  faceAngle: 0,                                   // she aims at the wand herself (not at Malfoid)
  aimAngle: 0,
  aimRange: 16.0,                                 // m: how far a wand can be summoned from
  summon: 'accio',
};

/** the charge at her wand while she reaches for it: a warm gold */
export const ACCIO_LOOK: SpellLook = {
  core: new THREE.Color(1.0, 0.97, 0.85),
  inner: new THREE.Color(1.0, 0.8, 0.4),
  halo: new THREE.Color(1.0, 0.75, 0.35),
  light: new THREE.Color(1.0, 0.8, 0.4),
  tint: (r, g, b) => [r, 0.75 + 0.2 * g, 0.4 + 0.3 * b],
  bolt: 0.03,
  explosion: {
    fireball: 0.15, ring: 0.5, duration: 0.25, sparks: 0.3,
    fire: [new THREE.Color(0.6, 0.4, 0.1), new THREE.Color(1.0, 0.8, 0.4), new THREE.Color(1.0, 0.97, 0.85)],
    flash: new THREE.Color(1.0, 0.95, 0.8), ringColour: new THREE.Color(1.0, 0.8, 0.4),
  },
  blastLight: 0,
  lights: false,
};
