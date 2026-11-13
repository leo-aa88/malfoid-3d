/** animation clips of spells (authored with the other moves in tools/blender/malfoid/combat.py) */
// cast_quick (Stupefy) and cast_ventus are Cho's (built into her model only)
export const SPELL_CLIPS = ['cast_confringo', 'cast_quick', 'cast_ventus'] as const;
export type SpellClip = (typeof SPELL_CLIPS)[number];
