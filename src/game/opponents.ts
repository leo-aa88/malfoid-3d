import type { CharacterOptions } from '../character/Malfoid';
import { CHO_FACES, CHO_TALK, GINNY_FACES, GINNY_TALK, SUSAN_FACES, SUSAN_TALK } from '../character/faces';
import { CHO_DIFFICULTY, DIFFICULTY, Difficulty, DifficultyLevel, SUSAN_DIFFICULTY } from '../combat/ai/difficulty';
import type { SpellDef } from '../combat/spells/SpellSystem';
import type { SpellLook } from '../combat/spells/ConfringoFx';
import { EXPELLIARMUS, EXPELLIARMUS_LOOK } from '../combat/spells/Expelliarmus';
import { STUPEFY, STUPEFY_LOOK } from '../combat/spells/Stupefy';
import { VENTUS } from '../combat/spells/Ventus';
import { IMPEDIMENTA, IMPEDIMENTA_LOOK } from '../combat/spells/Impedimenta';
import { DEPULSO, DEPULSO_LOOK } from '../combat/spells/Depulso';
import { HUFFLEPUFF_RESOLVE, Resolve } from '../combat/FighterTarget';
import { CHO_LINES, DuelLines, GINNY_LINES, SUSAN_LINES } from '../audio/duelVoices';

/*
 * The opponents Malfoid can duel, and everything that differs between them: model, faces,
 * spells, AI tuning per difficulty, voice lines, how far apart a duel starts. The duel code
 * reads these; nothing in it names an opponent.
 */
export type OpponentId = 'ginny' | 'cho' | 'susan';

/** which of her faces the duel shows when */
export interface OpponentFaces {
  /** as the duel starts (held through the opening lines) */
  start: string;
  /** casting or striking */
  attack: string;
  /** backing off */
  retreat: string;
  /** her spell just disarmed Malfoid */
  disarmedFoe: string;
  /** her shield stopped a spell / reflected one (Protego) */
  shielded?: string;
  parried?: string;
  /** healing herself (Episkey) */
  heal?: string;
  /** below half health: her attack face becomes this (Susan grows more determined) */
  lowHp?: string;
  /** she won / lost */
  win: string;
  lose?: string;
}

export interface OpponentDef {
  id: OpponentId;
  name: string;
  /** public/models/<model>.glb and .json */
  model: string;
  character: CharacterOptions;
  difficulty: Record<Difficulty, DifficultyLevel>;
  /** her ranged spell (the one the AI fights with) and its look */
  spell: SpellDef;
  look: SpellLook;
  /** a short-range push spell (Ventus, Depulso) and, for a bolt (Depulso), its look; without a
   * look it is Ventus's gust */
  push?: SpellDef;
  pushLook?: SpellLook;
  /** a second ranged spell her AI alternates with the first (Susan's Expelliarmus); its look is
   * the shared pool's (Malfoid has the spell too) */
  altSpell?: SpellDef;
  /** she has Protego */
  protego?: boolean;
  /** she heals herself with Episkey (amount and charges per level: difficulty[level].heal) */
  episkey?: boolean;
  /** her resistance to staggers and knockdowns (Hufflepuff Resolve) */
  resolve?: Resolve;
  /** m between the fighters when a duel starts */
  startDistance: number;
  /** where she is fought */
  arena: 'woods' | 'pitch';
  lines: DuelLines;
  faces: OpponentFaces;
  /** her health bar in the HUD */
  hudColour: string;
}

export const OPPONENTS: Record<OpponentId, OpponentDef> = {
  ginny: {
    id: 'ginny',
    name: 'Ginny',
    model: 'ginny',
    character: { name: 'Ginny', idleClip: 'confident', expressions: GINNY_FACES, talk: GINNY_TALK },
    difficulty: DIFFICULTY,
    spell: EXPELLIARMUS,
    look: EXPELLIARMUS_LOOK,
    startDistance: 3.6,
    arena: 'woods',
    lines: GINNY_LINES,
    faces: { start: 'confident', attack: 'determined', retreat: 'frustrated', disarmedFoe: 'teasing', win: 'happy' },
    hudColour: '#c7492a',
  },
  cho: {
    id: 'cho',
    name: 'Cho',
    model: 'cho',
    character: { name: 'Cho', idleClip: 'cho_idle', expressions: CHO_FACES, talk: CHO_TALK },
    difficulty: CHO_DIFFICULTY,
    spell: STUPEFY,
    look: STUPEFY_LOOK,
    push: VENTUS,
    protego: true,
    // she fights from range: the duel starts inside her preferred distance
    startDistance: 5.0,
    // the Ravenclaw seeker on the Quidditch Pitch: room for her to circle and dodge
    arena: 'pitch',
    // she opens the exchange, Malfoid answers (campaign; practice goes straight to the fight)
    lines: CHO_LINES,
    faces: { start: 'determined', attack: 'determined', retreat: 'worried', disarmedFoe: 'amused', shielded: 'determined',
      parried: 'amused', win: 'cheerful', lose: 'sad' },
    hudColour: '#3d64b0',
  },
  susan: {
    id: 'susan',
    name: 'Susan',
    model: 'susan',
    character: { name: 'Susan', idleClip: 'susan_idle', expressions: SUSAN_FACES, talk: SUSAN_TALK },
    difficulty: SUSAN_DIFFICULTY,
    spell: IMPEDIMENTA,
    look: IMPEDIMENTA_LOOK,
    push: DEPULSO,
    pushLook: DEPULSO_LOOK,
    // she alternates Impedimenta with Expelliarmus, and meets spells with Protego
    altSpell: EXPELLIARMUS,
    protego: true,
    episkey: true,
    resolve: HUFFLEPUFF_RESOLVE,
    // she holds her ground: the duel starts at a middle distance, Malfoid must come to her
    startDistance: 4.5,
    // open ground for her spells (no trunks in the way of Impedimenta)
    arena: 'pitch',
    lines: SUSAN_LINES,
    faces: { start: 'determined', attack: 'neutral', retreat: 'worried', disarmedFoe: 'determined', heal: 'comforted',
      lowHp: 'determined', shielded: 'determined', parried: 'amused', win: 'comforted', lose: 'sad' },
    hudColour: '#e1b241',
  },
};
