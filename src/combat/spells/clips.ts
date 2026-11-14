/** animation clips of spells (authored with the other moves in tools/blender/malfoid/combat.py) */
// cast_quick (Stupefy, Impedimenta, Confundo) and cast_ventus (Ventus, Depulso) are Cho's, Susan's
// and Luna's; episkey (healing herself) is Susan's; cast_illusio and cast_oppugno are Luna's (built
// into their models only)
export const SPELL_CLIPS = ['cast_confringo', 'cast_quick', 'cast_ventus', 'episkey', 'cast_illusio', 'cast_oppugno'] as const;
export type SpellClip = (typeof SPELL_CLIPS)[number];
