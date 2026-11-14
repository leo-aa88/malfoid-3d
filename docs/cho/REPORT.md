# Cho Chang — implementation and validation report

Cho is the second opponent: an evasive Ravenclaw duellist built from the same purchased assets
and pipeline as Malfoid and Ginny. Every screenshot here is from the real Three.js viewer
(headless Chromium, SwiftShader), not a Blender render.

## Build

- `make cho` (`MF_CHAR=cho`) → `build/cho.blend`, `public/models/cho.glb` (18.2 MB) + `.json`,
  `build/textures/Cho_*`. Her values live in her profile in `tools/blender/malfoid/character.py`.
- **Malfoid and Ginny are untouched:** after every pipeline change their GLB and JSON rebuilt
  **byte-identical** to the committed files (sha256). Cho's own clips are added only to models
  whose profile lists them (`extra_clips`).
- Robe check (`tools/qa/robe_folds.py`, now finds any character's armature): **0 % folded area
  and 0 crossed vertices** for every movement clip, Cho's dodges and Ventus included.
- The reference images stay local (`/Cho/` in `.gitignore`).

## Appearance

![turnaround](compare_turnaround.png)

- **Face:** the base face as authored plus half of the existing cheek-slim key (a slightly
  tapered jaw; the Basis is untouched). Resting face: lids a touch lower, the lower lids up a
  little (a soft almond opening), a faint smile: calm and attentive, neither Malfoid's glare nor
  Ginny's wide eyes. No freckles.
- **Eyes:** dark brown (#5B3A28 target) from the pack's own brown iris art: gradient, pupil and
  highlights kept. Brows dark brown-black; lashes soft black (natural, not a sharp liner).
- **Skin:** the pack's fair and warm presets blended (#F8E2D6 target).
- **Hair:** the purchased Bell_Hair_01 cards, recoloured near-black with a cool blue sheen (the
  ramp sits more neutral than the #1A2436 swatch: rendered, the bluer ramp read navy and the blue
  bow vanished into it). Reshaped, not replaced:
  - half-up: the upper back hair gathered behind the head (the existing gather from Ginny);
  - side locks: front cards that swept across the cheeks are eased back beside them;
  - **no bangs:** the pack's own centre-parted hairline, the forehead open. A fringe built from
    added cards (after the atlas) was tried and removed on request: it read as weird.
- **The Ravenclaw bow** (`tools/blender/malfoid/ribbon.py`): real geometry at the gather point:
  a wrapped knot, two puffy teardrop loops with a fold, two V-cut tails. Kept clear of the hair
  surface. Knot and loops ride the head bone; the tails carry the hair's own skin weights, so
  they sway with it. #2E4878.
- **Star earrings** (`earrings.py`): a silver drop from each lobe with a four-point ridged star,
  bound to the head bone.
- **Uniform:** navy and silver tie, Ravenclaw-blue lining, a painted eagle crest
  (`tools/textures/make_crest_ravenclaw.py`: peaked gold shield, blue field, eagle facing right,
  laurel sprig, after the blueprint).

| | | |
|---|---|---|
| ![front](head_front.png) | ![3/4](head_three_quarter.png) | ![side](head_side.png) |
| ![back](head_back_bow.png) | ![bow](bow_close.png) | ![earring](earring_close.png) |
| ![hairline](hairline_close.png) | ![crown](crown.png) | ![crest](crest.png) |

### Three characters together

![full](trio_full.png)
![faces](trio_faces.png)
![back](trio_back.png)

## Expressions

![expressions](compare_expressions.png)

`CHO_FACES` in `src/character/faces.ts`: neutral, cheerful, thoughtful, worried, surprised,
amused, blushing, sad, teary, determined, pain, from the base mesh's own keys. Two face channels
were added that are not shape keys, so they follow every expression:
- `blush`: the cheeks tinted in the face shader, over the area where the base pack painted its
  blush (zero unless a face asks; Malfoid's and Ginny's faces never do).
- `tears`: the base mesh's tear cards, shown only by the teary face.

Sad, worried and teary are kept apart (`worried_sad_teary.png`): worried has raised brows and a
tense mouth, sad looks down with a downturned mouth and no tears, teary has watery eyes and tears.
`CHO_TALK` is her speaking mouth for the existing voice system.

## Animation

Shared with Malfoid and Ginny: walk, run, turn, jump, crouch, block, every strike and combo,
hits, stagger, knockback, disarmed, wand pickup, the cast. Hers (`combat.EXTRA_CLIPS`):

![clips](clips.png)

`cho_idle` (composed, wand held low, a slow weight shift), `dodge_left` / `dodge_right` /
`dodge_back` (in place: the game moves her), `protego` (held, wand raised), `cast_quick`
(Stupefy flick, release 0.20 s), `cast_ventus` (sweep and palm push, release 0.34 s).

**Moving while facing Malfoid** (circling, backing off): the clip follows where she goes.
Nearest forward or back: the walk (played reversed for back, so her legs step backwards);
nearest her left or right: `strafe`, a duelling side-step (lead foot out, trail foot closes, the
feet never cross; reversed for right; 0.64 m/s). The remaining angle, up to 45 degrees, turns her
hips into the travel direction while the spine turns back, so her chest and head keep facing
Malfoid. Measured in eight directions, the planted foot moves at 0-0.02 m/s (before: 0.9-1.2 m/s
when circling or backing off on a diagonal, legs stepping forwards while she slid sideways). Only
models with the `strafe` clip use this: Cho and, since, Ginny.

**Ginny** got the same `strafe` clip and Cho's three dodge clips (her model gains only these four
clips: her 28 existing animations, meshes, skin, textures and face are identical). Her
sidestep from a bolt used to be a sideways run (running legs while sliding sideways); it is now
a dodge clip, with the same chance and timing as before. Measured: the same 0-0.02 m/s planted
foot in eight directions; six Confringos cast at her drew three dodges, all clips, no sideways
running ([ginny_dodge_clip.png](ginny_dodge_clip.png)).

## In the game

- **Opponents as data** (`src/game/opponents.ts`): model, faces, spells, AI per difficulty,
  voice lines, start distance, HUD colour. `src/game/Opponent.ts` builds each one's character,
  health, combo system, spells, shield and AI; `main.ts` duels "the current opponent" and names
  none. Practice: pick Ginny or Cho. Campaign: Cho is stage 2, after Ginny (Malfoid now has
  Expelliarmus).
- **Stupefy:** a fast (24 m/s) thin bright-red bolt, 8 damage, a stagger, 4 s cooldown.
- **Ventus:** a short (3.6 m), wide gust through the spell system (trees stop it): 3 damage, a
  strong knockback, 7 s cooldown. A translucent cone with wind streaks; no point lights.
- **Protego:** up for at most 0.9 s, 5 s cooldown, a moment of slowness after lowering it. A
  spell reaching its front is stopped; one arriving within 0.2 s of raising it is **reflected**:
  the same projectile turns back at its caster as the shield owner's spell (`SpellSystem.adopt`,
  `Projectile.redirect`), so it can only hit Malfoid and costs Cho nothing. It guards melee like
  a block. A see-through dome shows it, flashing gold on a parry.
- **Dodges:** real movement over the clip (trees still stop her), no invulnerability.
- **Disarm:** Malfoid's Expelliarmus knocks Cho's wand away like anyone's; she runs back for it.

| | | |
|---|---|---|
| ![start](duel_campaign_start.png) | ![stupefy](duel_stupefy.png) | ![ventus](duel_ventus.png) |
| ![protego](duel_protego.png) | ![parry](duel_parry_reflected.png) | ![dodge](duel_dodge.png) |

### Her AI

The shared `FighterAI` gains an optional evasive style (Ginny has none, so her AI is unchanged):
- keeps 4–7 m, circles (a trunk ahead turns her back), backs off when crowded (badly crowded:
  turns and sprints away on a diagonal), closes in when far;
- reads a wind-up: Protego (raised just before the bolt for a parry, with timing error, or well
  ahead to block), or a sidestep to the free side; a bolt already in flight is judged once;
- a stopped spell, a dodge or an opening is answered with Stupefy; Ventus when crowded;
- repeated Confringos make her readier, up to caps (she never parries everything).

| Level | HP | Reactions (s) | Shield | Parry | Counter | Timing error |
|---|---|---|---|---|---|---|
| Easy | 100 | 0.24–0.45 | 20 % | 6 % | 35 % | ±0.12 s |
| Normal | 130 | 0.15–0.30 | 30 % | 14 % | 55 % | ±0.07 s |
| Hard | 170 | 0.09–0.20 | 40 % | 24 % | 75 % | ±0.04 s |

## Validation

| Check | Result |
|---|---|
| `npm test` | **58 / 58** (`tests/cho.test.ts`: shield timing and cooldown, reflection ownership, block, Stupefy, Ventus range and shove, spacing, shield timed into the window, spam memory, counters, Ventus, dodges) |
| Malfoid / Ginny GLB + JSON | byte-identical |
| Robe folds (all clips) | 0 |
| 8 combos | 8 / 8 with the expected damage |
| Confringo | 20 direct, holding L casts once, cooldown frozen while paused, a miss ends at 25 m, effects clean up |
| GPU (geometries / textures / programs) over repeated Stupefy, Ventus, shielded Confringo | 108/37/40 after warm-up, then 109/38/40 for three rounds |
| Campaign | Ginny → "New spell: Expelliarmus" → Cho (P available, 3 lives, Cho's AI acts) |
| Practice Ginny | duel starts, her AI acts |
| Disarming Cho | STAGGER → RECOVER → RETRIEVE → wand back → CIRCLE |

**Duels with a scripted Malfoid** (Ginny's Normal AI in the player's place; single runs, so
indicative only):

| Cho level / player style | Winner | Notes |
|---|---|---|
| Easy, mixed | Malfoid (68 HP left) | Cho never shielded |
| Normal, mixed | Malfoid (76 HP left) | 5 dodges, Ventus once |
| Normal, Confringo spam | **Cho** (70 / 130 left) | 1 block, 2 reflects, 14 dodges |
| Hard, mixed | Cho (150 / 170 left) | 2 reflects |

The same player that beats Normal Cho with mixed play loses when it spams Confringo: the
intended lesson. One bug found this way and fixed: a shield meant only to block could go up late
enough (with Easy's timing error and the headless 0.1 s frames) to land in the parry window, so
Easy reflected 3 of 7 Confringos; plain blocks now go up well ahead and the error only affects
parries.

## Malfoid's Protego (the reward)

Beating Cho in the campaign teaches Malfoid **Protego** (key **H**, held). It uses the same
`Protego` class and look as Cho's, on Malfoid's `FighterTarget`, with her spell system as the
reflector:

- **Timing:** up for at most 0.9 s, then a 5 s cooldown. A spell reaching its front is stopped.
- **Parry:** raised within 0.2 s of a spell arriving, it sends the spell back at its caster, as
  Malfoid's own. A sent-back Impedimenta slows Susan.
- **Guard:** it guards strikes like a block.
- **Input:** it is raised over a held block or crouch, but not while striking, casting, reacting
  or disarmed. The wand comes out of the sleeve for it.
- **Model:** the `protego` clip was added to Malfoid's model. Her 28 existing clips are
  keyframe-identical, and nothing else changed.
- **HUD:** a pale-blue slot with its cooldown, and the controls line.
- **Campaign:** the reward screen says "New spell acquired: Protego". A run saved past Cho
  before this change gets it on load.
- **Practice:** against Cho it isn't available, as Expelliarmus isn't against Ginny.

![malfoid protego](malfoid_protego.png)

Top: the held pose; a parried Impedimenta flying back at Susan. Bottom: Susan's Impedimenta
stopped (no damage, no slow); the campaign reward.

## Known limitations

- **No fringe:** the reference has airy bangs; Cho has the pack's open centre-parted hairline
  (a fringe of added cards was removed on request). The pack's straight-cut card ends show as a
  dark patch near her left temple in close-ups.
- **Half-up:** as for Ginny, softer than drawn; the reference's braided crown sections are not
  modelled.
- **Spacing:** against an opponent who keeps chasing her, Cho's average distance was 2.8–3.9 m
  (below her 4–7 m); she retreats a lot. A human player who keeps distance sees more circling.
- **Hard** may be too hard against the scripted player (won with 150 / 170); needs human play.
- **Sound:** Stupefy and Ventus borrow the Expelliarmus sound (pitched up and down). Her voice
  lines (Cho opens, Malfoid replies; a win line each) and Protego's hum were added afterwards.
- **Phase 2** at 40 % HP (from the brainstorm) is not implemented.
- **Headless only:** real frame rate and how the sounds land are untested; headless runs at
  1–20 fps, so the AI's timing is exercised at 0.1 s frames.
- **Hair secondary motion** uses the existing spring sway unchanged; not tuned specifically for
  her length, and not inspected in motion beyond the duel screenshots.
