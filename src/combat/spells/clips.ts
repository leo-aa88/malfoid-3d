/** animation clips of spells (authored with the other moves in tools/blender/malfoid/combat.py) */
export const SPELL_CLIPS = ['cast_confringo'] as const;
export type SpellClip = (typeof SPELL_CLIPS)[number];
