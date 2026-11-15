import * as THREE from 'three';
import type { SpellDef } from './SpellSystem';
import type { SpellLook } from './ConfringoFx';

/*
 * Petrificus Totalus, the Full Body-Bind (Hermione's): a pale blue-white bolt from a quick flick.
 * Little damage of its own; a direct hit that gets through binds the target: she goes rigid,
 * topples backwards like a plank, lies bound (PETRIFY_TIME s, per level in HERMIONE_DIFFICULTY)
 * and gets up. While she is down only one hit lands (FighterTarget.BOUND_HITS). A guard or
 * Protego stops it, and it can be dodged. All tuning here.
 */
export const PETRIFY_TIME = 2.0;                 // s bound (Normal), the fall included
export const PETRIFICUS: SpellDef = {
  id: 'petrificus',
  name: 'Petrificus Totalus',
  key: '',
  clip: 'cast_quick',
  castDuration: 0.45,
  release: 0.20,                                  // combat.QUICK_RELEASE
  cooldown: 9.0,
  projectile: { speed: 17.0, radius: 0.12, maxRange: 22.0 },
  directDamage: 4,
  splashDamage: 0,
  explosionRadius: 0,
  directKnockback: 0.2,
  splashKnockback: 0,
  faceAngle: (80 * Math.PI) / 180,
  aimAngle: (60 * Math.PI) / 180,
  aimRange: 18.0,
  hitEffect: 'flinch',
  petrify: { duration: PETRIFY_TIME },
};

/** an icy white core in a pale blue glow: cold and still, unlike the warm bolts. No point lights */
export const PETRIFICUS_LOOK: SpellLook = {
  core: new THREE.Color(0.96, 0.99, 1.0),
  inner: new THREE.Color(0.55, 0.78, 1.0),
  halo: new THREE.Color(0.45, 0.68, 1.0),
  light: new THREE.Color(0.5, 0.7, 1.0),
  tint: (r, g, b) => [0.45 + 0.4 * r * r, 0.65 + 0.3 * g, 0.95 + 0.05 * b],
  bolt: 0.04,
  explosion: {
    // (small: a big white burst hid the very moment she is bound)
    fireball: 0.13, ring: 0.5, duration: 0.25, sparks: 0.35,
    fire: [new THREE.Color(0.2, 0.35, 0.7), new THREE.Color(0.55, 0.78, 1.0), new THREE.Color(0.95, 0.98, 1.0)],
    flash: new THREE.Color(0.45, 0.55, 0.7), ringColour: new THREE.Color(0.6, 0.8, 1.0),
  },
  blastLight: 0,
  lights: false,
};
