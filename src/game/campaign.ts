import type { Difficulty } from '../combat/ai/difficulty';

/*
 * The campaign: Malfoid's opponents in order, fought at one difficulty chosen at the start,
 * with a few lives for the whole run. Beating an opponent teaches Malfoid her spell (Mega Man
 * style); losing costs a life and the same opponent is fought again; with no lives left it is
 * game over and the run starts again from the first opponent, spells forgotten. The run is
 * remembered in this browser.
 */

export type OpponentId = 'ginny' | 'cho' | 'susan' | 'luna' | 'hermione' | 'harry' | 'bellatrix' | 'voldemort';
/** Malfoid's spells; Confringo she always has, the rest are learned in the campaign */
export type SpellId = 'confringo' | 'expelliarmus';
/** the spells learned from opponents */
export type LearnedSpell = Exclude<SpellId, 'confringo'>;

export interface Opponent {
  id: OpponentId;
  name: string;
  /** the spell Malfoid learns by beating this opponent */
  reward?: LearnedSpell;
  /** can be fought in this build */
  playable: boolean;
}

export const CAMPAIGN: readonly Opponent[] = [
  { id: 'ginny', name: 'Ginny Weasley', reward: 'expelliarmus', playable: true },
  { id: 'cho', name: 'Cho Chang', playable: true },
  { id: 'susan', name: 'Susan Bones', playable: true },
  { id: 'luna', name: 'Luna Lovegood', playable: false },
  { id: 'hermione', name: 'Hermione Granger', playable: false },
  { id: 'harry', name: 'Harry Potter', playable: false },
  { id: 'bellatrix', name: 'Bellatrix Lestrange', playable: false },
  { id: 'voldemort', name: 'Lord Voldemort', playable: false },
];

/** fights the whole run may be lost before it is game over */
export const CAMPAIGN_LIVES = 3;

/** every spell (training and practice) */
export const ALL_SPELLS: ReadonlySet<SpellId> = new Set<SpellId>(['confringo', 'expelliarmus']);

/** what the game says about a learned spell (key: the key that casts it) */
export const SPELL_INFO: Record<LearnedSpell, { name: string; key: string; how: string }> = {
  expelliarmus: { name: 'Expelliarmus', key: 'P', how: 'disarm your opponent' },
};

export interface Run {
  level: Difficulty;
  lives: number;
  /** index into CAMPAIGN of the opponent to beat next */
  stage: number;
  learned: LearnedSpell[];
}

export type WinResult = { learned: LearnedSpell | null; beaten: Opponent; next: Opponent | null };
export type LossResult = { lives: number; gameOver: boolean; opponent: Opponent };

const STORAGE_KEY = 'malfoid.campaign';
const LEVELS: readonly Difficulty[] = ['easy', 'normal', 'hard'];

/** where the run is kept (localStorage in the game, a fake in tests) */
export interface RunStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** a stored run back to a run; anything unreadable or out of range is no run */
export function parseRun(stored: string | null): Run | null {
  let d: Partial<Run> | null = null;
  try {
    d = JSON.parse(stored ?? '');
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object') return null;
  const { level, lives, stage, learned } = d;
  if (!LEVELS.includes(level as Difficulty)) return null;
  if (!Number.isInteger(lives) || lives! < 1 || lives! > CAMPAIGN_LIVES) return null;
  if (!Number.isInteger(stage) || stage! < 0 || stage! > CAMPAIGN.length) return null;
  const rewards = new Set<unknown>(CAMPAIGN.map((o) => o.reward).filter(Boolean));
  const spells = Array.isArray(learned) ? learned.filter((s) => rewards.has(s)) : [];
  return { level: level as Difficulty, lives: lives!, stage: stage!, learned: [...new Set(spells)] };
}

export class Campaign {
  private current: Run | null;

  constructor(private readonly store: RunStore | null) {
    let stored: string | null = null;
    try {
      stored = store?.getItem(STORAGE_KEY) ?? null;
    } catch {
      /* storage blocked: no run to continue */
    }
    this.current = parseRun(stored);
  }

  /** the run in progress (null: none) */
  get run(): Readonly<Run> | null {
    return this.current;
  }

  /** a new run at this difficulty: the first opponent, all lives, nothing learned */
  start(level: Difficulty): void {
    this.current = { level, lives: CAMPAIGN_LIVES, stage: 0, learned: [] };
    this.save();
  }

  /** the opponent to beat next (null: no run, or all beaten) */
  get opponent(): Opponent | null {
    return this.current ? CAMPAIGN[this.current.stage] ?? null : null;
  }

  /** Malfoid's spells in this run: Confringo and what she has learned so far */
  get spells(): Set<SpellId> {
    return new Set<SpellId>(['confringo', ...(this.current?.learned ?? [])]);
  }

  /** Malfoid beat the current opponent: she learns the reward, and the next one is up */
  win(): WinResult {
    const run = this.current!;
    const beaten = CAMPAIGN[run.stage];
    const learned = beaten.reward && !run.learned.includes(beaten.reward) ? beaten.reward : null;
    if (learned) run.learned.push(learned);
    run.stage++;
    this.save();
    return { learned, beaten, next: CAMPAIGN[run.stage] ?? null };
  }

  /** Malfoid lost: a life gone; with none left the run is over */
  lose(): LossResult {
    const run = this.current!;
    const opponent = CAMPAIGN[run.stage];
    run.lives--;
    if (run.lives > 0) {
      this.save();
      return { lives: run.lives, gameOver: false, opponent };
    }
    this.clear();
    return { lives: 0, gameOver: true, opponent };
  }

  /** forget the run */
  clear(): void {
    this.current = null;
    try {
      this.store?.removeItem(STORAGE_KEY);
    } catch {
      /* nothing stored: fine */
    }
  }

  private save(): void {
    try {
      this.store?.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      /* not remembered: this session still has it */
    }
  }
}
