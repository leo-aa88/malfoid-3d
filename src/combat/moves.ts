/**
 * Strikes and two-hit combos.
 *
 * Times are seconds from the start of the clip and match the poses authored
 * in tools/blender/malfoid/combat.py (fist / foot fully out = active frames).
 */

export type AttackButton = 'J' | 'U' | 'K' | 'I';
export type Height = 'high' | 'low';
/** what a clean hit does to the opponent */
export type HitEffect = 'flinch' | 'stagger' | 'knockback' | 'knockdown';

export type MoveId =
  | 'jab' | 'body_jab' | 'kick_low' | 'kick_high'                                  // openers
  | 'cross' | 'body_hook' | 'uppercut' | 'heavy_body' | 'leg_sweep' | 'spin_kick' | 'rising_kick';

export interface Move {
  id: MoveId;
  label: string;
  duration: number;            // clip length
  active: [number, number];    // the strike can connect between these times
  height: Height;              // a guard at this height blocks it
  /** hitbox in front of her, relative to her position and facing (m) */
  reach: number;               // furthest forward distance to the opponent's surface
  /** distance (centre to centre) she steps to during the wind-up so the fist / foot lands on the
   * opponent's surface instead of passing through it */
  range: number;
  width: number;               // half width either side of her facing direction
  damage: number;
  effect: HitEffect;
  heavy: boolean;              // whiffing it leaves her open (slow recovery)
  /** extra seconds of recovery after a whiffed heavy finisher */
  missRecovery: number;
  /** finishers skip their wind-up when chained: clip start time */
  chainStart: number;
}

const M = (m: Move): Move => m;

export const MOVES: Record<MoveId, Move> = {
  // --- openers: quick, light, flinch only
  jab: M({ id: 'jab', label: 'Jab', duration: 0.40, active: [0.07, 0.16], height: 'high', reach: 0.50, range: 0.59, width: 0.22,
    damage: 5, effect: 'flinch', heavy: false, missRecovery: 0, chainStart: 0 }),
  body_jab: M({ id: 'body_jab', label: 'Body Jab', duration: 0.42, active: [0.08, 0.18], height: 'low', reach: 0.47, range: 0.61,
    width: 0.22, damage: 5, effect: 'flinch', heavy: false, missRecovery: 0, chainStart: 0 }),
  kick_low: M({ id: 'kick_low', label: 'Low Shin Kick', duration: 0.75, active: [0.22, 0.40], height: 'low',
    reach: 0.62, range: 0.72, width: 0.25, damage: 7, effect: 'flinch', heavy: false, missRecovery: 0, chainStart: 0 }),
  kick_high: M({ id: 'kick_high', label: 'Roundhouse', duration: 0.90, active: [0.28, 0.48], height: 'high',
    reach: 0.72, range: 0.83, width: 0.30, damage: 9, effect: 'flinch', heavy: false, missRecovery: 0, chainStart: 0 }),

  // --- finishers: each one hits differently
  cross: M({ id: 'cross', label: 'Cross', duration: 0.55, active: [0.12, 0.25], height: 'high', reach: 0.52, range: 0.62,
    width: 0.22, damage: 11, effect: 'stagger', heavy: false, missRecovery: 0, chainStart: 0.05 }),
  body_hook: M({ id: 'body_hook', label: 'Body Hook', duration: 0.60, active: [0.14, 0.28], height: 'low', reach: 0.45, range: 0.53,
    width: 0.32, damage: 12, effect: 'stagger', heavy: false, missRecovery: 0, chainStart: 0.05 }),
  uppercut: M({ id: 'uppercut', label: 'Uppercut', duration: 0.65, active: [0.19, 0.33], height: 'high', reach: 0.45, range: 0.47,
    width: 0.22, damage: 16, effect: 'knockback', heavy: true, missRecovery: 0.45, chainStart: 0.05 }),
  heavy_body: M({ id: 'heavy_body', label: 'Heavy Body Punch', duration: 0.70, active: [0.18, 0.34], height: 'low',
    reach: 0.58, range: 0.65, width: 0.24, damage: 17, effect: 'knockback', heavy: true, missRecovery: 0.5, chainStart: 0.05 }),
  leg_sweep: M({ id: 'leg_sweep', label: 'Leg Sweep', duration: 0.85, active: [0.30, 0.48], height: 'low', reach: 0.62, range: 0.70,
    width: 0.45, damage: 14, effect: 'knockdown', heavy: true, missRecovery: 0.5, chainStart: 0.04 }),
  spin_kick: M({ id: 'spin_kick', label: 'Spinning High Kick', duration: 0.95, active: [0.40, 0.60], height: 'high',
    reach: 0.75, range: 0.72, width: 0.40, damage: 21, effect: 'knockback', heavy: true, missRecovery: 0.6, chainStart: 0.06 }),
  rising_kick: M({ id: 'rising_kick', label: 'Rising Roundhouse', duration: 0.85, active: [0.26, 0.46],
    height: 'high', reach: 0.68, range: 0.75, width: 0.30, damage: 18, effect: 'knockdown', heavy: true, missRecovery: 0.55,
    chainStart: 0.06 }),
};

/** single press */
export const OPENERS: Record<AttackButton, MoveId> = {
  J: 'jab',
  U: 'body_jab',
  I: 'kick_low',
  K: 'kick_high',
};

export interface Combo {
  name: string;
  finisher: MoveId;
}

/** first button + second button -> combo */
export const COMBOS: Record<string, Combo> = {
  JJ: { name: 'Double High Punch', finisher: 'cross' },
  UU: { name: 'Double Low Punch', finisher: 'body_hook' },
  II: { name: 'Double Low Kick', finisher: 'leg_sweep' },
  KK: { name: 'Double High Kick', finisher: 'spin_kick' },
  UJ: { name: 'Rising Strike', finisher: 'uppercut' },
  JU: { name: 'High-Low Breaker', finisher: 'heavy_body' },
  KI: { name: 'High-Low Sweep', finisher: 'leg_sweep' },
  IK: { name: 'Rising Kick', finisher: 'rising_kick' },
};

/** the second press must come within this long after the opener's active frames */
export const COMBO_WINDOW = 0.35;
/** furthest she steps in or back to reach a strike's range (m) */
export const MAX_SPACING_STEP = 0.35;
/** strikes turn her towards an opponent within this angle (either side) */
export const AUTO_FACE_ANGLE = (60 * Math.PI) / 180;
/** ... and this distance (m, centre to centre) */
export const AUTO_FACE_RANGE = 1.6;

export const MOVE_CLIPS = Object.keys(MOVES) as MoveId[];
