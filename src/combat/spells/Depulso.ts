import * as THREE from 'three';
import type { SpellDef } from './SpellSystem';
import type { SpellLook } from './ConfringoFx';

/*
 * Depulso, the Banishing Charm (Susan's): a heavy violet bolt from a sweep of the wand that
 * throws whoever it hits well back, breaking a combo and making room. Medium range, moderate
 * damage, a long cooldown. All tuning here.
 */
export const DEPULSO_COOLDOWN = 8.0;              // s, from the release
export const DEPULSO_SPEED = 14.0;                // m/s: slower than the bolts, but she uses it close
export const DEPULSO_MAX_RANGE = 7.0;             // m
export const DEPULSO_PROJECTILE_RADIUS = 0.3;     // m: a broad push
export const DEPULSO_DAMAGE = 9;
export const DEPULSO_KNOCKBACK = 6.0;             // m/s slide: stronger than Ventus (4.6)
export const DEPULSO_RELEASE = 0.34;              // s into the cast_ventus clip (combat.VENTUS_RELEASE)

export const DEPULSO: SpellDef = {
  id: 'depulso',
  name: 'Depulso',
  key: '',
  clip: 'cast_ventus',
  castDuration: 0.70,
  release: DEPULSO_RELEASE,
  cooldown: DEPULSO_COOLDOWN,
  projectile: { speed: DEPULSO_SPEED, radius: DEPULSO_PROJECTILE_RADIUS, maxRange: DEPULSO_MAX_RANGE },
  directDamage: DEPULSO_DAMAGE,
  splashDamage: 0,
  explosionRadius: 0,
  directKnockback: DEPULSO_KNOCKBACK,
  splashKnockback: 0,
  faceAngle: (100 * Math.PI) / 180,
  aimAngle: (70 * Math.PI) / 180,
  aimRange: DEPULSO_MAX_RANGE,
  hitEffect: 'knockback',
};

/**
 * a violet force: pale lavender core, blue-violet glow, a wide ring on impact (no fire); bluer
 * than Expelliarmus's crimson-pink so the two never read alike, and a small burst so the
 * fighter it hits stays visible
 */
export const DEPULSO_LOOK: SpellLook = {
  core: new THREE.Color(0.86, 0.84, 1.0),
  inner: new THREE.Color(0.45, 0.3, 1.0),
  halo: new THREE.Color(0.32, 0.18, 0.9),
  light: new THREE.Color(0.5, 0.35, 1.0),
  tint: (r, g, b) => [0.3 + 0.35 * g, 0.18 + 0.4 * g * g, 0.8 * r + 0.2 * b],
  bolt: 0.08,
  explosion: {
    fireball: 0.18, ring: 1.3, duration: 0.32, sparks: 0.45,
    fire: [new THREE.Color(0.1, 0.04, 0.35), new THREE.Color(0.42, 0.28, 0.95), new THREE.Color(0.8, 0.78, 1.0)],
    flash: new THREE.Color(0.6, 0.55, 1.0), ringColour: new THREE.Color(0.5, 0.35, 1.0),
  },
  blastLight: 0,
  lights: false,
};
