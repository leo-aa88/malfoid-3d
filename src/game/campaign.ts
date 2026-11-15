import type { Difficulty } from '../combat/ai/difficulty';

/*
 * The campaign: Malfoid's opponents in order, fought at one difficulty chosen at the start.
 * Each duel is a best-of-three match (game/match.ts). Beating an opponent teaches Malfoid her
 * spell (Mega Man style) and the next one is up; losing a match is game over: the run starts
 * again from the first opponent, spells forgotten. The run is remembered in this browser.
 */

export type OpponentId = 'ginny' | 'cho' | 'susan' | 'luna' | 'hermione' | 'harry' | 'bellatrix' | 'voldemort';
/** Malfoid's spells; Confringo she always has, the rest are learned in the campaign */
export type SpellId = 'confringo' | 'expelliarmus' | 'protego';
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
  { id: 'cho', name: 'Cho Chang', reward: 'protego', playable: true },
  { id: 'susan', name: 'Susan Bones', playable: true },
  // (her reward, Illusio, comes with Malfoid's own copies; Susan's Episkey with Malfoid's healing)
  { id: 'luna', name: 'Luna Lovegood', playable: true },
  // (her reward, Petrificus Totalus, comes with Malfoid's own body-bind)
  { id: 'hermione', name: 'Hermione Granger', playable: true },
  { id: 'harry', name: 'Harry Potter', playable: false },
  { id: 'bellatrix', name: 'Bellatrix Lestrange', playable: false },
  { id: 'voldemort', name: 'Lord Voldemort', playable: false },
];

/** every spell (training and practice) */
export const ALL_SPELLS: ReadonlySet<SpellId> = new Set<SpellId>(['confringo', 'expelliarmus', 'protego']);

/**
 * Malfoid's spells when she reaches this opponent in the campaign: Confringo and what every
 * opponent before her teaches (practice uses this: against Ginny only Confringo, against Cho
 * Expelliarmus too, against Susan Protego as well). An opponent not in the campaign: all.
 */
export function spellsBefore(id: string): Set<SpellId> {
  const at = CAMPAIGN.findIndex((o) => o.id === id);
  if (at < 0) return new Set(ALL_SPELLS);
  const learned = CAMPAIGN.slice(0, at).map((o) => o.reward).filter((r): r is LearnedSpell => !!r);
  return new Set<SpellId>(['confringo', ...learned]);
}

/** what the game says about a learned spell (key: the key that casts it) */
export const SPELL_INFO: Record<LearnedSpell, { name: string; key: string; how: string }> = {
  expelliarmus: { name: 'Expelliarmus', key: 'P', how: 'disarm your opponent' },
  protego: { name: 'Protego', key: 'H', how: 'raise a shield (raised just as a spell arrives, it sends the spell back)' },
};

export interface Run {
  level: Difficulty;
  /** index into CAMPAIGN of the opponent to beat next */
  stage: number;
  learned: LearnedSpell[];
}

export type WinResult = { learned: LearnedSpell | null; beaten: Opponent; next: Opponent | null };
/** a lost match ends the run (game over): who beat her */
export type LossResult = { opponent: Opponent };

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
  // (a run saved while the campaign had lives may still carry them: ignored)
  const { level, stage, learned } = d;
  if (!LEVELS.includes(level as Difficulty)) return null;
  if (!Number.isInteger(stage) || stage! < 0 || stage! > CAMPAIGN.length) return null;
  const rewards = new Set<unknown>(CAMPAIGN.map((o) => o.reward).filter(Boolean));
  const spells = Array.isArray(learned) ? learned.filter((s) => rewards.has(s)) : [];
  // every opponent already beaten has taught her spell (a run saved before that opponent had a
  // reward to teach, Cho's Protego, gets it now)
  for (const o of CAMPAIGN.slice(0, stage!)) if (o.reward) spells.push(o.reward);
  return { level: level as Difficulty, stage: stage!, learned: [...new Set(spells)] };
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

  /** a new run at this difficulty: the first opponent, nothing learned */
  start(level: Difficulty): void {
    this.current = { level, stage: 0, learned: [] };
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

  /** Malfoid lost the match: game over, the run is forgotten */
  lose(): LossResult {
    const opponent = CAMPAIGN[this.current!.stage];
    this.clear();
    return { opponent };
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
