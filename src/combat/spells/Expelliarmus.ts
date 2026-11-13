import * as THREE from 'three';
import type { SpellDef } from './SpellSystem';
import type { SpellLook } from './ConfringoFx';

/*
 * Expelliarmus, the Disarming Charm (Ginny's signature spell): a red bolt that knocks the
 * wand out of the target's hand. Little damage, a stagger, no blast. All tuning here.
 */
export const EXPELLIARMUS_COOLDOWN = 8.0;            // s, from the release
export const EXPELLIARMUS_SPEED = 16.0;              // m/s
export const EXPELLIARMUS_MAX_RANGE = 20.0;          // m
export const EXPELLIARMUS_PROJECTILE_RADIUS = 0.15;  // m
export const EXPELLIARMUS_DAMAGE = 4;
export const EXPELLIARMUS_KNOCKBACK = 1.2;           // m/s slide given to the target

export const EXPELLIARMUS: SpellDef = {
  id: 'expelliarmus',
  name: 'Expelliarmus',
  key: '',
  clip: 'cast_confringo',                            // same wand raise and thrust
  castDuration: 0.65,
  release: 0.42,
  cooldown: EXPELLIARMUS_COOLDOWN,
  projectile: { speed: EXPELLIARMUS_SPEED, radius: EXPELLIARMUS_PROJECTILE_RADIUS, maxRange: EXPELLIARMUS_MAX_RANGE },
  directDamage: EXPELLIARMUS_DAMAGE,
  splashDamage: 0,
  explosionRadius: 0,
  directKnockback: EXPELLIARMUS_KNOCKBACK,
  splashKnockback: 0,
  faceAngle: (75 * Math.PI) / 180,
  aimAngle: (60 * Math.PI) / 180,
  aimRange: 15.0,
  hitEffect: 'stagger',
  disarms: true,
};

/** bright red core, red sparks, a short red-white flash on impact */
export const EXPELLIARMUS_LOOK: SpellLook = {
  core: new THREE.Color(1.0, 0.62, 0.58),
  inner: new THREE.Color(1.0, 0.12, 0.10),
  halo: new THREE.Color(0.85, 0.02, 0.06),
  light: new THREE.Color(1.0, 0.15, 0.12),
  // the fire palette's yellow/orange range becomes crimson to pink-white
  tint: (r, g, b) => [r, 0.08 + 0.42 * g * g, 0.06 + 0.35 * g * g + 0.3 * b],
  bolt: 0.055,
  explosion: {
    fireball: 0.32, ring: 1.0, duration: 0.40, sparks: 0.45,
    fire: [new THREE.Color(0.5, 0.0, 0.03), new THREE.Color(1.0, 0.12, 0.1), new THREE.Color(1.0, 0.75, 0.72)],
    flash: new THREE.Color(1.0, 0.6, 0.6), ringColour: new THREE.Color(1.0, 0.18, 0.15),
  },
  blastLight: 6,
};
