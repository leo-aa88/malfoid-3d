import { AIParams, GINNY_AI } from './FighterAI';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyLevel {
  label: string;
  /** Ginny's health (Malfoid has 100) */
  hp: number;
  ai: AIParams;
}

/*
 * Easy is the original Ginny. Normal and Hard read the fight better (faster reactions, more
 * blocks, a guard straight after taking a hit, counters, punishing openings, reading the wand
 * wind-up to dodge Confringo, real combos, pressure) and last longer. All values are tunable here.
 */
export const DIFFICULTY: Record<Difficulty, DifficultyLevel> = {
  easy: { label: 'Easy', hp: 100, ai: GINNY_AI },
  normal: {
    label: 'Normal',
    hp: 160,
    ai: {
      ...GINNY_AI,
      reaction: [0.14, 0.3],
      attackCooldown: [0.6, 1.1],
      comboChance: 0.65,
      blockChance: 0.55,
      blockTime: [0.4, 0.7],
      castChance: 0.75,
      retreatAfterHits: 3,
      recover: 0.25,
      punishChance: 0.6,
      counterChance: 0.5,
      dodgeChance: 0.45,
      smartCombos: true,
      pressure: 0.5,
      guardAfterHit: 0.45,
    },
  },
  hard: {
    label: 'Hard',
    hp: 240,
    ai: {
      ...GINNY_AI,
      reaction: [0.08, 0.18],
      attackCooldown: [0.35, 0.75],
      comboChance: 0.85,
      blockChance: 0.75,
      blockTime: [0.35, 0.6],
      castChance: 0.9,
      retreatAfterHits: 3,
      recover: 0.15,
      runDistance: 2.5,
      punishChance: 0.9,
      counterChance: 0.8,
      dodgeChance: 0.75,
      smartCombos: true,
      pressure: 0.85,
      guardAfterHit: 0.8,
    },
  },
};
