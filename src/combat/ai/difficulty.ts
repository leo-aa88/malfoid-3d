import { AIParams, GINNY_AI } from './FighterAI';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyLevel {
  label: string;
  /** Ginny's health (Malfoid has 100) */
  hp: number;
  ai: AIParams;
  /** her Episkey at this level (Susan): HP healed per cast, casts per duel */
  heal?: { amount: number; charges: number };
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

/*
 * Cho: an evasive duellist who keeps 4-7 m away, circles, reads wind-ups, shields or steps
 * aside and answers with Stupefy; Ventus when crowded. Never omniscient: reaction delays, a
 * shield that needs 5 s between uses, parries that are only sometimes timed right, and she
 * often just takes the hit. Levels change how sharply she does all that; her health only a
 * little (she is meant to be hard to hit, not hard to wear down).
 */
const CHO_EASY: AIParams = {
  // she always knows where Malfoid is on the pitch (the stadium is ~90 m long): she follows her
  detectRange: 120,
  meleeRange: 0.72,
  castRange: [3.0, 12.0],
  reaction: [0.24, 0.45],
  attackCooldown: [1.0, 1.8],
  comboChance: 0.3,
  blockChance: 0.3,
  blockTime: [0.4, 0.7],
  castChance: 0.4,
  retreatTime: [0.6, 1.0],
  retreatAfterHits: 2,
  recover: 0.35,
  runDistance: 7.5,
  punishChance: 0.3,
  counterChance: 0.2,
  dodgeChance: 0.3,
  smartCombos: false,
  pressure: 0,
  guardAfterHit: 0.2,
  evasive: {
    preferredRange: [4.0, 7.0],
    circleSwitch: [1.6, 3.2],
    dodgeClipChance: 0.3,
    counterChance: 0.35,
    counterDelay: [0.18, 0.4],
    shieldChance: 0.2,
    perfectChance: 0.06,
    timingError: 0.12,
    spamBonus: 0.03,
    pushChance: 0.3,
    pushRange: 2.4,
    backStepChance: 0.3,
  },
};

export const CHO_DIFFICULTY: Record<Difficulty, DifficultyLevel> = {
  easy: { label: 'Easy', hp: 100, ai: CHO_EASY },
  normal: {
    label: 'Normal',
    hp: 130,
    ai: {
      ...CHO_EASY,
      reaction: [0.15, 0.3],
      castChance: 0.55,
      punishChance: 0.5,
      dodgeChance: 0.45,
      evasive: { ...CHO_EASY.evasive!, dodgeClipChance: 0.5, counterChance: 0.55, counterDelay: [0.12, 0.3], shieldChance: 0.3,
        perfectChance: 0.14, timingError: 0.07, spamBonus: 0.04, pushChance: 0.5, backStepChance: 0.45 },
    },
  },
  hard: {
    label: 'Hard',
    hp: 170,
    ai: {
      ...CHO_EASY,
      reaction: [0.09, 0.2],
      castChance: 0.7,
      punishChance: 0.7,
      dodgeChance: 0.6,
      recover: 0.25,
      evasive: { ...CHO_EASY.evasive!, dodgeClipChance: 0.65, counterChance: 0.75, counterDelay: [0.08, 0.22], shieldChance: 0.4,
        perfectChance: 0.24, timingError: 0.04, spamBonus: 0.05, pushChance: 0.65, backStepChance: 0.6 },
    },
  },
};

/*
 * Susan: a defensive duellist who stands her ground, guards a lot (and holds her guard), meets
 * a rush with Impedimenta and a crowding with Depulso, strikes first at someone who rushes into
 * her reach, alternates Impedimenta with Expelliarmus at range, meets a spell she sees coming
 * with Protego (or her guard), and heals with Episkey when hurt (instantaneous). Slow,
 * deliberate strikes; no dodging. Her Hufflepuff Resolve (FighterTarget.resolve)
 * makes staggers mere flinches. Levels sharpen her reactions and guard, and her healing.
 */
const SUSAN_EASY: AIParams = {
  detectRange: 120,
  meleeRange: 0.72,
  castRange: [3.0, 12.0],
  reaction: [0.25, 0.45],
  attackCooldown: [1.1, 1.8],
  comboChance: 0.25,
  blockChance: 0.5,
  blockTime: [0.6, 1.0],
  castChance: 0.3,
  retreatTime: [0.8, 1.2],
  retreatAfterHits: 3,
  recover: 0.4,
  runDistance: 9.0,
  punishChance: 0.3,
  counterChance: 0.4,
  dodgeChance: 0,
  smartCombos: false,
  pressure: 0,
  guardAfterHit: 0.4,
  defensive: {
    holdRange: [2.0, 6.5],
    rushSpeed: 2.2,
    rushRange: [2.2, 7.0],
    rushChance: 0.4,
    pushChance: 0.4,
    pushRange: 2.6,
    healBelow: 0.6,
    healChance: 0.6,
    resolveBlock: 0.1,
    spellBlockChance: 0.35,
    shieldChance: 0.3,
    parryChance: 0.05,
    timingError: 0.12,
  },
};

export const SUSAN_DIFFICULTY: Record<Difficulty, DifficultyLevel> = {
  easy: { label: 'Easy', hp: 120, ai: SUSAN_EASY, heal: { amount: 20, charges: 2 } },
  normal: {
    label: 'Normal',
    hp: 150,
    ai: {
      ...SUSAN_EASY,
      reaction: [0.16, 0.3],
      blockChance: 0.65,
      castChance: 0.4,
      punishChance: 0.5,
      counterChance: 0.6,
      guardAfterHit: 0.6,
      defensive: { ...SUSAN_EASY.defensive!, rushChance: 0.6, pushChance: 0.55, healChance: 0.75, spellBlockChance: 0.55,
        shieldChance: 0.4, parryChance: 0.1, timingError: 0.08 },
    },
    heal: { amount: 25, charges: 2 },
  },
  hard: {
    label: 'Hard',
    hp: 190,
    ai: {
      ...SUSAN_EASY,
      reaction: [0.1, 0.2],
      attackCooldown: [0.8, 1.4],
      comboChance: 0.45,
      blockChance: 0.78,
      blockTime: [0.5, 0.9],
      castChance: 0.5,
      punishChance: 0.7,
      counterChance: 0.8,
      smartCombos: true,
      guardAfterHit: 0.8,
      recover: 0.3,
      defensive: { ...SUSAN_EASY.defensive!, rushChance: 0.75, pushChance: 0.7, healChance: 0.85, spellBlockChance: 0.7,
        shieldChance: 0.5, parryChance: 0.18, timingError: 0.05 },
    },
    heal: { amount: 30, charges: 3 },
  },
};
