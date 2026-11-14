/** animation clips of spells (authored with the other moves in tools/blender/malfoid/combat.py) */
// cast_quick (Stupefy, Impedimenta) and cast_ventus (Ventus, Depulso) are Cho's and Susan's;
// episkey (healing herself) is Susan's (built into their models only)
export const SPELL_CLIPS = ['cast_confringo', 'cast_quick', 'cast_ventus', 'episkey'] as const;
export type SpellClip = (typeof SPELL_CLIPS)[number];
