import type { SpellDef } from './SpellSystem';

/*
 * Confringo, the Blasting Curse: a fiery bolt from the tip of her wand that
 * explodes on impact. All tuning lives here.
 *
 * World scale: metres (Malfoid is ~1.6 m tall, she runs at 2.9 m/s). The suggested values
 * fit that scale as they are, except the knockback: the dummy is a weighted base whose
 * heaviest melee hit slides it at 2.6 m/s, so the blast's 6 / 3 are mapped to 4 / 2 m/s
 * (still clearly stronger than any punch or kick; the slide is capped at 1 m).
 */
export const CONFRINGO_COOLDOWN = 5.0;              // s, from the release
export const CONFRINGO_CAST_DURATION = 0.65;        // s (the cast_confringo clip)
export const CONFRINGO_RELEASE = 0.42;              // s into the cast (combat.py CAST_RELEASE)
export const CONFRINGO_SPEED = 18.0;                // m/s
export const CONFRINGO_MAX_RANGE = 25.0;            // m
export const CONFRINGO_PROJECTILE_RADIUS = 0.18;    // m
export const CONFRINGO_DIRECT_DAMAGE = 20;
export const CONFRINGO_SPLASH_DAMAGE = 10;          // at the centre of the blast
export const CONFRINGO_EXPLOSION_RADIUS = 2.5;      // m
export const CONFRINGO_EXPLOSION_DURATION = 0.65;   // s (visual)
export const CONFRINGO_DIRECT_KNOCKBACK = 4.0;      // m/s
export const CONFRINGO_SPLASH_KNOCKBACK = 2.0;      // m/s at the centre, falling off with distance
export const CONFRINGO_FACE_ANGLE = (60 * Math.PI) / 180;   // turns towards a target within this
export const CONFRINGO_AIM_ANGLE = (45 * Math.PI) / 180;    // aim assist cone (either side)
export const CONFRINGO_AIM_RANGE = 20.0;            // m

export const CONFRINGO: SpellDef = {
  id: 'confringo',
  name: 'Confringo',
  key: 'L',
  clip: 'cast_confringo',
  castDuration: CONFRINGO_CAST_DURATION,
  release: CONFRINGO_RELEASE,
  cooldown: CONFRINGO_COOLDOWN,
  projectile: { speed: CONFRINGO_SPEED, radius: CONFRINGO_PROJECTILE_RADIUS, maxRange: CONFRINGO_MAX_RANGE },
  directDamage: CONFRINGO_DIRECT_DAMAGE,
  splashDamage: CONFRINGO_SPLASH_DAMAGE,
  explosionRadius: CONFRINGO_EXPLOSION_RADIUS,
  directKnockback: CONFRINGO_DIRECT_KNOCKBACK,
  splashKnockback: CONFRINGO_SPLASH_KNOCKBACK,
  faceAngle: CONFRINGO_FACE_ANGLE,
  aimAngle: CONFRINGO_AIM_ANGLE,
  aimRange: CONFRINGO_AIM_RANGE,
};
