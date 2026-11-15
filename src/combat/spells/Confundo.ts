import * as THREE from 'three';
import type { SpellDef } from './SpellSystem';
import type { SpellLook } from './ConfringoFx';

/*
 * Confundo, the Confundus Charm (Luna's): a lilac bolt from a quick flick. Little damage and a
 * flinch; the point is the confusion: for a moment the fighter it catches has her directions
 * reversed (forward is back, left is right; attacks, guard and spells are unaffected), shown by
 * stars circling her head and a CONFUNDED! call. All tuning here.
 */
export const CONFUNDO_COOLDOWN = 8.0;              // s, from the release
export const CONFUNDO_SPEED = 15.0;                // m/s (a touch slower than Impedimenta: readable)
export const CONFUNDO_MAX_RANGE = 16.0;            // m
export const CONFUNDO_PROJECTILE_RADIUS = 0.15;    // m
export const CONFUNDO_DAMAGE = 3;
export const CONFUNDO_RELEASE = 0.20;              // s into the cast_quick clip (combat.QUICK_RELEASE)
/** how long her directions stay reversed (s); per difficulty in LUNA_DIFFICULTY (confuse) */
export const CONFUNDO_TIME = 2.5;

export const CONFUNDO: SpellDef = {
  id: 'confundo',
  name: 'Confundo',
  key: '',
  clip: 'cast_quick',
  castDuration: 0.45,
  release: CONFUNDO_RELEASE,
  cooldown: CONFUNDO_COOLDOWN,
  projectile: { speed: CONFUNDO_SPEED, radius: CONFUNDO_PROJECTILE_RADIUS, maxRange: CONFUNDO_MAX_RANGE },
  directDamage: CONFUNDO_DAMAGE,
  splashDamage: 0,
  explosionRadius: 0,
  directKnockback: 0.3,
  splashKnockback: 0,
  faceAngle: (80 * Math.PI) / 180,
  aimAngle: (60 * Math.PI) / 180,
  aimRange: 14.0,
  hitEffect: 'flinch',
  confuse: { duration: CONFUNDO_TIME },
};

/** a swirling lilac-magenta: a pale pink-white core in a violet glow (Expelliarmus is crimson,
 *  Depulso a bluer violet, so the three never read alike) */
export const CONFUNDO_LOOK: SpellLook = {
  core: new THREE.Color(1.0, 0.9, 1.0),
  inner: new THREE.Color(0.85, 0.42, 1.0),
  halo: new THREE.Color(0.62, 0.25, 0.95),
  light: new THREE.Color(0.8, 0.4, 1.0),
  tint: (r, g, b) => [0.55 + 0.4 * r, 0.25 + 0.45 * g * g, 0.85 + 0.15 * b],
  bolt: 0.06,
  explosion: {
    fireball: 0.28, ring: 0.85, duration: 0.4, sparks: 0.55,
    fire: [new THREE.Color(0.3, 0.05, 0.45), new THREE.Color(0.8, 0.35, 1.0), new THREE.Color(1.0, 0.88, 1.0)],
    flash: new THREE.Color(0.95, 0.8, 1.0), ringColour: new THREE.Color(0.8, 0.45, 1.0),
  },
  blastLight: 0,
  lights: false,
};
