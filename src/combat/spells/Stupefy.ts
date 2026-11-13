import * as THREE from 'three';
import type { SpellDef } from './SpellSystem';
import type { SpellLook } from './ConfringoFx';

/*
 * Stupefy, the Stunning Spell (Cho's counterattack): a fast, bright red bolt from a quick
 * flick of the wand. Moderate damage and a brief stagger, no blast. All tuning here.
 */
export const STUPEFY_COOLDOWN = 4.0;             // s, from the release
export const STUPEFY_SPEED = 24.0;               // m/s: faster than Confringo (18) and Expelliarmus (16)
export const STUPEFY_MAX_RANGE = 22.0;           // m
export const STUPEFY_PROJECTILE_RADIUS = 0.13;   // m
export const STUPEFY_DAMAGE = 8;
export const STUPEFY_KNOCKBACK = 0.8;            // m/s slide given to the target
export const STUPEFY_RELEASE = 0.20;             // s into the cast_quick clip (combat.QUICK_RELEASE)

export const STUPEFY: SpellDef = {
  id: 'stupefy',
  name: 'Stupefy',
  key: '',
  clip: 'cast_quick',
  castDuration: 0.45,
  release: STUPEFY_RELEASE,
  cooldown: STUPEFY_COOLDOWN,
  projectile: { speed: STUPEFY_SPEED, radius: STUPEFY_PROJECTILE_RADIUS, maxRange: STUPEFY_MAX_RANGE },
  directDamage: STUPEFY_DAMAGE,
  splashDamage: 0,
  explosionRadius: 0,
  directKnockback: STUPEFY_KNOCKBACK,
  splashKnockback: 0,
  faceAngle: (80 * Math.PI) / 180,
  aimAngle: (60 * Math.PI) / 180,
  aimRange: 18.0,
  hitEffect: 'stagger',
};

/**
 * a white-hot core in a bright scarlet glow, a thin fast streak (Expelliarmus is a softer
 * crimson-pink with a fatter bolt, so the two stay apart). No point lights.
 */
export const STUPEFY_LOOK: SpellLook = {
  core: new THREE.Color(1.0, 0.94, 0.88),
  inner: new THREE.Color(1.0, 0.10, 0.04),
  halo: new THREE.Color(1.0, 0.22, 0.06),
  light: new THREE.Color(1.0, 0.2, 0.08),
  tint: (r, g, b) => [r, 0.10 + 0.35 * g * g, 0.04 + 0.25 * g * g + 0.25 * b],
  bolt: 0.045,
  explosion: {
    fireball: 0.26, ring: 0.8, duration: 0.32, sparks: 0.5,
    fire: [new THREE.Color(0.55, 0.02, 0.0), new THREE.Color(1.0, 0.16, 0.05), new THREE.Color(1.0, 0.85, 0.75)],
    flash: new THREE.Color(1.0, 0.7, 0.6), ringColour: new THREE.Color(1.0, 0.25, 0.1),
  },
  blastLight: 0,
  lights: false,
};
