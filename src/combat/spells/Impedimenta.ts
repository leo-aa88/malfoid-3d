import * as THREE from 'three';
import type { SpellDef } from './SpellSystem';
import type { SpellLook } from './ConfringoFx';

/*
 * Impedimenta, the Impediment Jinx (Susan's): a cold blue bolt from a quick flick that slows
 * whoever it hits. Little damage and a flinch; the slow is the point: a fighter rushing in is
 * caught moving and striking at a fraction of her speed for a moment. All tuning here.
 */
export const IMPEDIMENTA_COOLDOWN = 6.0;            // s, from the release
export const IMPEDIMENTA_SPEED = 17.0;              // m/s
export const IMPEDIMENTA_MAX_RANGE = 18.0;          // m
export const IMPEDIMENTA_PROJECTILE_RADIUS = 0.16;  // m: a fat bolt (easier to land on a rush)
export const IMPEDIMENTA_DAMAGE = 4;
export const IMPEDIMENTA_RELEASE = 0.20;            // s into the cast_quick clip (combat.QUICK_RELEASE)
/** the slow: her movement, strikes and casts run at this fraction of their speed, for this long (s) */
export const IMPEDIMENTA_SLOW = { factor: 0.55, duration: 2.5 };

export const IMPEDIMENTA: SpellDef = {
  id: 'impedimenta',
  name: 'Impedimenta',
  key: '',
  clip: 'cast_quick',
  castDuration: 0.45,
  release: IMPEDIMENTA_RELEASE,
  cooldown: IMPEDIMENTA_COOLDOWN,
  projectile: { speed: IMPEDIMENTA_SPEED, radius: IMPEDIMENTA_PROJECTILE_RADIUS, maxRange: IMPEDIMENTA_MAX_RANGE },
  directDamage: IMPEDIMENTA_DAMAGE,
  splashDamage: 0,
  explosionRadius: 0,
  directKnockback: 0.3,
  splashKnockback: 0,
  faceAngle: (80 * Math.PI) / 180,
  aimAngle: (60 * Math.PI) / 180,
  aimRange: 15.0,
  hitEffect: 'flinch',
  slow: IMPEDIMENTA_SLOW,
};

/** an icy pale blue: a white core in a cold cyan glow (Ventus's wind is paler and has no bolt) */
export const IMPEDIMENTA_LOOK: SpellLook = {
  core: new THREE.Color(0.9, 0.97, 1.0),
  inner: new THREE.Color(0.25, 0.7, 1.0),
  halo: new THREE.Color(0.15, 0.5, 1.0),
  light: new THREE.Color(0.3, 0.7, 1.0),
  tint: (r, g, b) => [0.12 + 0.3 * g * g, 0.45 + 0.4 * g, 0.8 * r + 0.2 * b],
  bolt: 0.06,
  explosion: {
    fireball: 0.3, ring: 0.9, duration: 0.4, sparks: 0.5,
    fire: [new THREE.Color(0.02, 0.12, 0.45), new THREE.Color(0.2, 0.6, 1.0), new THREE.Color(0.85, 0.96, 1.0)],
    flash: new THREE.Color(0.75, 0.9, 1.0), ringColour: new THREE.Color(0.35, 0.75, 1.0),
  },
  blastLight: 0,
  lights: false,
};
