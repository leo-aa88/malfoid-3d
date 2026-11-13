# Ginny Weasley — implementation and validation report

Ginny is an AI-controlled duelling opponent, built from the same purchased assets and pipeline as
Malfoid. Every screenshot here is from the real Three.js viewer.

## Assets and build

There are no new purchased assets. Ginny is built from the same packs: the anime base mesh, Bell
Hair 01, and the Hogwarts uniform. The uniform pack's own file is the Gryffindor version.

- **Command:** `make ginny`, which runs `MF_CHAR=ginny`.
- **Outputs, separate from Malfoid's:**
  - `build/ginny.blend`
  - `public/models/ginny.glb` and `.json`
  - `build/textures/Ginny_*`
- **Where the differences live:** `tools/blender/malfoid/character.py`.
- **Malfoid unchanged:** after the refactor, Malfoid's rebuilt GLB was byte-identical to the
  committed one. The animation stage added seven clips; her 21 existing clips are byte-identical
  (`animcmp`).

## Appearance

**Face:** the base face as authored, with no Malfoid slimming keys, so it reads softer and rounder.
- **Skin:** the pack's NeutralFair and WarmHoney presets blended, about #F9E2DC.
- **Eyes:** the pack's own brown iris art, keeping its gradient, pupil and highlights.
- **Brows and lashes:** reddish-brown brows and natural brown lashes, instead of Malfoid's black
  liner.
- **Freckles:** about 150, painted over the nose bridge and upper cheeks. They are texture, not
  geometry, so they follow every expression.
- **Ears:** no earrings.

**Hair:** the purchased hair, recoloured copper (#C7492A range). Its topology and UVs are
preserved; nothing was swapped in.
- **Parting:** moved off-centre at the hairline.
- **Half-up:** the outer half of the long back strands is gathered behind the head into a tail
  over the loose lower hair. The hair-tie prop was removed on request.
- **Sway:** the strand bones are kept, so the hair's spring sway works.

**Uniform:**
- red and gold tie
- burgundy robe lining (#7A1F2B)
- near-black robe (#1C1C1C)
- painted lion-rampant crest (`tools/textures/make_crest_gryffindor.py`)

**Comparisons:**
- `compare_turnaround.png`: reference against model, front to back.
- `compare_expressions.png`: the atlas faces against the model.
- `ginny_and_malfoid.png`: both characters together.

## Expressions

All are made from the base mesh's own shape keys, with no new geometry. They are listed in
`src/character/faces.ts`:
- neutral, cheerful, happy (wink), confident, teasing, determined
- frustrated, angry, surprised, embarrassed, pain

**In play:** she shows determined when attacking or casting, frustrated when retreating, pain when
hit, surprised when disarmed, teasing after disarming Malfoid, and happy when she wins.

## Animation

**New clips:** `hit`, `stagger`, `knockback`, `disarmed`, `pickup`, `wand_ready`, `confident`
(her idle: hand on hip). They are built into both models.

**Shared clips:** the rest are shared with Malfoid: walk, run, turn, jump, crouch, block, all
strikes and combos, and the wand cast.

**Shared by both characters:** the character class (`Malfoid.ts`) now takes per-character
options and handles:
- reactions, sliding back with the hit
- strafing, so a fighter keeps facing her opponent and the walk plays backwards when retreating
- disarm and wand pickup
- named expressions

## NPC AI (`src/combat/ai/FighterAI.ts`)

**States:** IDLE → OBSERVE → APPROACH / RETREAT / BLOCK / MELEE_ATTACK / CAST, plus STAGGER →
RECOVER.

**Imperfect by design:**
- She reacts after 0.2–0.45 s.
- She blocks only 35% of the attacks she notices.
- Her strikes are 0.9–1.6 s apart, and she adds a second press for a combo 45% of the time.
- She backs off after two quick hits.

**Spell use:** she casts Expelliarmus only when all of these hold:
- Malfoid has her wand
- Malfoid is 2–9 m away
- the line of sight is clear
- the spell is off cooldown

Otherwise she closes in and fights hand to hand.

**Integration:** she uses the same combo system, hitboxes and damage as Malfoid, through a
`CombatTarget` interface that the dummy and both fighters implement. Her parameters are in
`GINNY_AI`.

## Expelliarmus and disarming

**The spell:** it reuses the Confringo spell system and its effects, with a red look.
- 4 damage, a stagger, no blast
- 8 s cooldown
- 16 m/s
- the same wand raise and thrust as Confringo

**The disarm:** on a hit, Malfoid's wand becomes a real scene object.
- It flies off with a lift and a spin, then lies flat on the floor.
- A pulsing ring marks the 0.6 m pickup radius.
- Confringo is unavailable: the HUD shows NO WAND and L does nothing. Melee still works.
- Walking within the radius plays the pickup clip, and the wand goes back into her hand.
- There is no timer: the wand comes back only when she picks it up.

## Modes

The start screen offers **Training** (the dummy only) and **Duel** (Ginny only).
- **Duel start:** Ginny waits 1.2 s before acting.
- **Restart:** G restarts the duel.
- **Change mode:** a HUD button brings the start screen back.
- **End:** the duel ends when either fighter reaches 0 HP and shows the winner.

## Validation

**Logic tests:** `npm test` passes 20 tests: 15 for spells and 5 for Ginny (Expelliarmus, fighter
blocking and defeat, AI decisions).

**Duel run in the viewer (`duel_*.png`):**
1. DUEL! — they face each other 3.6 m apart.
2. Ginny raises her wand and casts.
3. The red bolt flies.
4. It hits Malfoid for 4: disarmed, and the wand flies off.
5. The wand lies on the floor 2.3 m away inside its ring. The HUD shows NO WAND, and L does
   nothing.
6. Ginny closes in and punches and kicks Malfoid, who flinches.
7. Malfoid walks to the wand and picks it up. The HUD shows READY again.
8. Confringo hits Ginny for 20, and she staggers back.

**Regression checks:**
- All 8 combos chain with the same damage.
- Every Confringo check passed: hit for 20, cooldown frozen while paused, held L casts once, wall,
  miss at 25 m, after moving, melee lock, cleanup.
- GPU resources stay flat over repeated casts.
- Malfoid's model and clips are unchanged.

## Known limitations

- **Hair:** the purchased cards have straight-cut tops, which leave small notches at the very top
  of the crown in profile. The half-up is softer than the drawn one, with no visible tie.
- **Expressions:** the base mesh has no wide-open shouting mouth or bared-teeth grin. Angry and
  frustrated rely mainly on the brows; cheerful has the biggest open mouth.
- **Blush:** there is no blush key, so embarrassed is shown by a lowered gaze and brows only.
- **Ginny's wand:** it is the same model as Malfoid's. She can't be disarmed yet, because Malfoid
  has no disarming spell.
- **Animation:** the reactions and stances are built on Malfoid's animation, with no separate
  personality animation for Ginny beyond her confident idle and faces.
- **Not in scope:** the arena has no walls; walls are supported if added. There is no sound.
