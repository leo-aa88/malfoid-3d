# malfoid-3d

An anime-style 3D fighting game in the browser: **Malfoid**, a Slytherin student, duels Harry
Potter's potential romantic interests one by one, with fists, kicks and spells, then Harry
himself, and finally faces Bellatrix Lestrange. Built with Three.js + TypeScript + Vite.

Like Mega Man, every opponent Malfoid beats in the campaign teaches her a spell: beating Ginny
teaches her **Expelliarmus**. **Ginny Weasley** and **Cho Chang**, the first two opponents, are
playable; the rest of the campaign is planned. The built characters
(`public/models/*.glb`) and sound effects (`public/sfx/`) are included, so the game runs straight
from a clone.

## Run

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173). `npm run build` produces a static
site in `dist/`.

## Modes

The start screen offers three modes:

- **Training:** Malfoid against a training dummy in the studio scene, no opponent, with every
  spell, to practise strikes, combos and spells.
- **Practice:** pick an opponent and a difficulty and fight straight away, with every spell and
  no opening lines. **G** restarts the fight. Ginny or Cho; a Malfoid mirror match is listed as
  coming soon.
- **Campaign:** choose the difficulty once, at the start, and fight the opponents in order
  (Ginny, then Cho, ...) with **3 lives** for the whole run:
  - a win teaches Malfoid the opponent's spell and moves on to the next opponent;
  - a loss costs a life and the same opponent is fought again;
  - with no lives left it's **game over**: the run starts again from Ginny, at the difficulty
    chosen again, and the spells learned are forgotten.

  A campaign fight can't be restarted with G. The run (difficulty, lives, the next opponent,
  the spells learned) is remembered in the browser, so the start screen offers to continue
  it; starting a new run while one is in progress takes a second click. Rules and lives are in
  `src/game/campaign.ts`.

Practice and the campaign are fought in the **Forbidden Woods**, an infinite procedural forest
that streams in chunks around the player, with no walls. See `src/scene/forest/` and
`docs/forest/REPORT.md`; all values are in `src/scene/forest/config.ts`.

## Opponents

The campaign, in order:

| Order | Opponent | Gameplay focus | Story purpose | Malfoid learns | Status |
|---|---|---|---|---|---|
| 1 | Ginny Weasley | Melee, Expelliarmus | Establish the romantic rivalry | Expelliarmus | playable |
| 2 | Cho Chang | Evasion, fast counterattacks | Another romantic rival | – | playable |
| 3 | Luna Lovegood | Chaotic, unpredictable magic | Comic relief before the darker story | – | planned |
| 4 | Hermione Granger | Tactical spells, crowd control | Final challenging school duel | – | planned |
| 5 | Harry Potter | Defensive mastery, Sectumsempra | Scripted defeat; major turning point | – | planned |
| 6 | Bellatrix Lestrange | Crucio, Imperio, multiple opponents | First genuinely terrifying boss | – | planned |

Each opponent is built by the same character pipeline as Malfoid (their own profile in
`tools/blender/malfoid/character.py`), with their own expressions, voice lines, signature
spells and AI tuning.

### Ginny Weasley

The duel against Ginny has three difficulties:

| Level | Ginny's HP | How she fights |
|---|---|---|
| Easy | 100 | the original Ginny: slow to react, rarely blocks, random strikes |
| Normal | 160 | faster reactions; guards up when you're close and after taking a hit; counters blocked strikes; punishes openings; reads your wand wind-up to dodge Confringo; real combos; stays close while you have your wand |
| Hard | 240 | all of the above, quicker and more often |

When she moves while facing Malfoid (backing off, stepping round her) her legs follow the way she
goes: a reversed walk backwards, a side-step sideways; her dodge is a quick sidestep.

Ginny's signature spell is Expelliarmus. It knocks Malfoid's wand out of her hand, and the wand
lands on the floor inside a ring. Until Malfoid walks over and picks it up, she can only fight
with her fists. See `docs/ginny/REPORT.md` for details.

### Cho Chang

The Ravenclaw seeker: an evasive duellist who fights from range and punishes predictable attacks,
above all repeated Confringos. See `docs/cho/REPORT.md`.

- **Spacing:** she keeps 4–7 m away and circles round you (trunks turn her back), steps back
  when you crowd her, closes in when you are far.
- **Stupefy:** a fast bright-red bolt (8 damage, a stagger, 4 s), her counterattack after a
  dodge, a stopped spell, or an opening (a whiffed heavy strike, a cast, a stagger).
- **Ventus:** a short, wide gust that throws you back (3 damage, 7 s) when you crowd her.
- **Protego:** a shield before her for up to 0.9 s, then 5 s before she can raise it again.
  It stops spells from the front; raised just as a spell arrives (within 0.2 s) it **sends it
  back** at you. Lowering it leaves her slow for a moment. Melee hits it like a guard.
- **Seeker's reflex:** quick sidesteps and back-steps (real movement, no teleport).
- **Not omniscient:** she reacts after a delay, often just takes the hit, and her parries are
  only sometimes timed right; the more Confringos you throw in quick succession, the readier
  she is for the next.

| Level | Cho's HP | How she fights |
|---|---|---|
| Easy | 100 | slow reactions, rarely shields, seldom parries, few counters |
| Normal | 130 | quicker; shields and counters more, parries now and then |
| Hard | 170 | sharp reactions, frequent dodges and counters, the best-timed parries |

## Expelliarmus (P)

Malfoid learns Ginny's Disarming Charm by beating her in the campaign (in training and practice
she always has it; in the campaign, never against Ginny herself). A red bolt: 4 damage, a
stagger, and the target's wand knocked out of her hand. It has its own 8 s cooldown, separate
from Confringo's, and its own slot in the HUD. A disarmed opponent runs back to her wand and
picks it up before casting again. Tuning is in `src/combat/spells/Expelliarmus.ts`.

## How a duel runs

- **Opening lines (campaign):** the two exchange a line each in close-ups: against Ginny Malfoid
  speaks first, against Cho, Cho does.
  Nobody can move or attack until **DUEL!** appears. Practice goes straight to the fight.
- **The fight:** first to 0 HP loses. A strike blocked by a fighter leaves the attacker slow
  to recover, an opening for either side. In practice, **G** (or the HUD button) restarts it.
- **The last word (campaign):** the winner says her line after the KO, then the result follows:
  the spell learned and the next opponent, the lives left, or game over.
- **Lip movement:** the speakers' mouths open and close with the loudness of their lines
  (`audio/duelVoices.ts`).
- **Leaving:** **Change mode** in the HUD returns to the start screen.

## Controls

| Input | Action |
|---|---|
| W / A / S / D | walk away from / towards the camera, left / right on screen |
| Shift + WASD | run |
| Space | jump |
| Left Ctrl | crouch (hold) |
| J / U | high / low punch (jab / body jab) |
| K / I | high / low kick (roundhouse / shin kick) |
| two strike keys quickly | combo (see below) |
| O | block (hold) |
| L | cast Confringo (5 s cooldown; needs the wand) |
| P | cast Expelliarmus (8 s cooldown; needs the wand; learned from Ginny in the campaign) |
| G | restart the fight (practice) |
| B | training dummy guard: none / high / low |
| N | bring the training dummy in front of her |
| M | mute / unmute sound (the volume is set on the start menu and the pause screen) |
| Esc | pause (click or Esc to resume) |
| Left drag | orbit (the camera follows on its own: behind her as she moves, side-on to both fighters in a duel; a drag holds the view for a moment) |
| Right drag | pan |
| Wheel | zoom (towards the cursor) |
| Reset Camera | restore the initial view |

After `IDLE_ANNOYED_TIMEOUT` seconds (10, in `src/character/Malfoid.ts`) without movement she
shifts her weight, crosses her arms and makes an annoyed face. Camera input does not reset the
timer; moving blends her back into walking.

## Combos

Two strikes in quick succession chain into a finisher:

| Input | Combo | Opener → finisher | Finisher effect |
|---|---|---|---|
| J → J | Double High Punch | jab → cross | stagger |
| U → U | Double Low Punch | body jab → body hook | stagger |
| I → I | Double Low Kick | low shin kick → leg sweep | knockdown |
| K → K | Double High Kick | roundhouse → spinning high kick | knockback |
| U → J | Rising Strike | body jab → uppercut | knockback |
| J → U | High-Low Breaker | jab → heavy body punch | knockback |
| K → I | High-Low Sweep | roundhouse → leg sweep | knockdown |
| I → K | Rising Kick | low kick → rising roundhouse | knockdown |

- **Input buffer:** the second key is accepted from the start of the opener until 350 ms after
  its active (hitting) frames, so it can be pressed before the opener finishes.
- **Cancel point:** at the end of the opener's active frames she cancels straight into the
  finisher (skipping its wind-up).
- **Hit confirmation:** the finisher only comes out if the opener hit. A blocked or missed opener
  drops the combo; a blocked finisher only does chip damage, with no effect.
- **Recovery:** whiffing a heavy finisher (uppercut, heavy body punch, sweeps, spinning or rising
  kick) slows the rest of the move: she is shown as VULNERABLE until it ends.
- **2 HIT COMBO** appears when both strikes connect.
- **Facing and spacing:** a strike turns her towards the opponent if it is within 60° either side
  (and 1.6 m), and she steps in or back (up to 35 cm) to that strike's range during the wind-up.
- Hitboxes are relative to her position and facing, with a high/low height that a matching guard
  blocks. Damage, active frames and ranges are in `src/combat/moves.ts`.

## Confringo (L)

The Blasting Curse, cast with her wand. She keeps the wand up her right sleeve. When she casts,
it slides out into her hand. It stays there afterwards, while she walks, runs, jumps or idles,
and goes back up the sleeve as soon as she punches or kicks.

She turns towards her target (the dummy or her opponent) if it is within 60°, raises the wand while fire gathers at its tip,
and thrusts it at the target. At 0.42 s a fiery bolt leaves the tip, flies at 18 m/s with a
flame trail and sparks, and explodes on the first thing it touches: a target, a solid, or the
ground. If it touches nothing, it fizzles out at 25 m.

- **Damage:** a direct hit does 20 damage and a strong knockback. Anyone else within 2.5 m of
  the blast takes splash damage, up to 10 and less with distance, with a weaker knockback away
  from the blast. Walls shield from splash, and one explosion damages a target only once.
- **Cooldown:** 5 s, starting when the bolt is released and counted in game time, so pausing
  pauses it. A cast cancelled before the release costs nothing. The HUD shows
  `CONFRINGO [L]` with READY or the seconds left.
- **Rules:** casting isn't possible while jumping, crouching, blocking, or during a punch or
  kick. Melee is locked from the start of the cast until the release. Holding L or key repeat
  never casts twice.
- **Aim assist:** the bolt aims at the torso of the target nearest her facing within 45° and
  20 m. Without one, it flies straight ahead.
- **Tuning:** all values are in `src/combat/spells/Confringo.ts`.

Screenshots from the viewer are in `docs/confringo/`.

## Code (`src/`)

- `character/Malfoid.ts` – loads the model, locomotion, idle → annoyed state machine, blinking and
  facial expression weights.
- `character/AnimationController.ts` – clip cross-fades: locomotion (`idle`, `walk`, `run`,
  `turn`, `idle_annoyed`), `jump`, strikes and held poses (`crouch`, `block`).
- `character/CharacterController.ts` – key bindings and pause.
- `combat/moves.ts` – strikes (timing, damage, hitbox, effect) and the combo table.
- `combat/ComboSystem.ts` – input buffer, cancel windows, hit / block / miss, auto-facing.
- `combat/TrainingDummy.ts` – the training opponent: HP, guard, flinch / stagger / knockback / knockdown.
- `combat/CombatTarget.ts` – what any attack hits; `FighterTarget.ts` – a character as a target
  (health, blocking, reactions, disarm, defeat).
- `combat/ai/FighterAI.ts` – the opponent's behaviour (observe, approach, retreat, block, strike,
  cast, retrieve her wand; with an evasive style also circle, shield, dodge, counter, push);
  `combat/ai/difficulty.ts` – the Easy / Normal / Hard tuning of each opponent.
- `combat/spells/Expelliarmus.ts` – the disarming spell (Ginny's, and Malfoid's once learned);
  `Stupefy.ts`, `Ventus.ts` (+ its gust effect) – Cho's spells.
- `combat/Protego.ts` – the shield (timing, perfect window, cooldown); `ProtegoFx.ts` – its look.
  A shield's owner takes over a reflected spell (`SpellSystem.adopt`).
- `game/opponents.ts` – the opponents as definitions (model, faces, spells, AI per difficulty,
  voice lines); `game/Opponent.ts` builds one in the game. The duel code names no opponent.
- `game/campaign.ts` – the campaign: the opponents in order, lives, the spells each one
  teaches, the saved run.
- `character/faces.ts` – Ginny's and Cho's expressions and speaking mouths. Besides shape keys a
  face may set `blush` (a cheek tint in the face shader) and `tears` (the base mesh's tear cards).
- `combat/spells/` – `SpellSystem.ts` (casting, cooldowns, aim assist, projectiles, damage),
  `Confringo.ts` (tuning), `Projectile.ts` + `collision.ts` (swept collision: no tunnelling),
  `SpellEmitter.ts` (where spells leave from: the wand tip),
  `ConfringoFx.ts` + `ExplosionEffect.ts` + `fx/` (pooled particles, glows, explosion; one pool
  per look, shared by every caster of that spell), `SpellFxSet.ts` (a caster's spells to their pools).
- `ui/CombatHud.ts` – combo banner, damage numbers, dummy HP, a cooldown slot per spell, lives.
- `ui/VolumeControl.ts` – the sound volume control (− / slider / +) on the start menu and the
  pause screen; remembered in the browser, with a short sample at the new level.
- `audio/duelVoices.ts` – the duel's opening and win lines and the speakers' lip movement
  (driven by `audio/envelope.ts`, the lines' loudness over time).
- `audio/Sfx.ts` – sound effects (Web Audio): each sound is a time slice of a file in
  `public/sfx/`, placed by distance and screen side; `audio/combatSounds.ts` – which sound plays
  for which event (punches, kicks, grunts on damage, Confringo, Expelliarmus, Protego's hum while
  Cho's shield is up, footsteps timed to
  the walk / run cycles' foot landings). The sound files are in `public/sfx/`; if one is missing
  the game just runs without it.
- `character/HairSway.ts` – damped-spring secondary motion on the hair's strand bones.
- `character/Wand.ts` – her wand (built at runtime), drawn from the sleeve to cast, the hand's
  grip, and the tip emitter.
- `character/ToonMaterials.ts` – cel shading and outlines (the hair is shaded as one smooth volume).
- `camera/CameraController.ts` – the follow camera (behind her, side-on in a duel, speaker
  close-ups); `scene/SceneManager.ts` – lights, shadows, the studio / woods environments;
  `scene/forest/` – the Forbidden Woods.

## Tests

```bash
npm test
```

Runs the logic tests in `tests/` with Node's test runner on an esbuild bundle: spells, Ginny's
AI and combat, the forest (generation, collision, geometry), sound triggers, the voice lines and
the campaign (lives, order, spells learned).
No browser or WebGL needed.

## Rebuilding the models

The characters are generated from purchased assets that are **not** in this repository. To rebuild it you
need, in the repo root: `base_character.blend` and `Gumroad_Anime_Female_BaseMesh/` (anime base
mesh), `Bell_Hair_01/` (hair) and `Girls+Hogwarts+Uniform+Harry+Potter+Uniform+Slytherin+BLEND/`
(uniform), plus Blender 4.5 (default path `~/.local/opt/blender-4.5.16-linux-x64/blender`,
override with `BLENDER=...`).

```bash
make model        # textures + build/malfoid.blend + public/models/malfoid.glb
make ginny        # Ginny: build/ginny.blend + public/models/ginny.glb (MF_CHAR=ginny)
make cho          # Cho: build/cho.blend + public/models/cho.glb (MF_CHAR=cho)
make help         # all targets (renders, dev, build, clean, ...)
```

Blender runs with 4 threads (`-t 4`).

### Pipeline (`tools/`)

- `textures/make_textures.py` – skin and face texture from the base mesh: pale skin preset, green
  irises, blonde brows, black lashes, blush and nose mark removed, scalp painted the hair's root tone.
- `textures/make_crest.py` – the Slytherin crest painted for the robe.
- `blender/malfoid/character.py` – everything that differs between Malfoid and Ginny (textures,
  face, hair, uniform colours, crest). Malfoid's profile reproduces her model bit for bit.
- `textures/make_crest_gryffindor.py` – Ginny's Gryffindor crest.
- `blender/build_head.py` – the build, in stages: face expression → hair + earrings → humanoid
  skeleton → uniform → animations → GLB export.
- `blender/malfoid/face.py` – resting expression (shape-key values) and the added face shape keys.
- `blender/malfoid/bust.py`, `hands.py`, `legs.py` – smaller bust, 10% smaller hands, 10% thinner
  legs.
- `blender/malfoid/assets.py` – the purchased hair (fitted to her head, crown flattened onto the
  skull and the sides slimmed towards the face to match the atlas, recoloured platinum, strand
  bones kept) and uniform (shirt, vest, tie, skirt, socks fitted to her body).
- `blender/malfoid/outfit2.py` – robe (black outside, green lining) with its hood, loafers and crest.
- `blender/malfoid/rig2.py` – standard humanoid skeleton with the base mesh's weights remapped,
  plus robe helper bones at the hips that the lower robe follows instead of the hips and thighs
  (they copy the thigh's swing up to 40° and ease off towards 70°, so high kicks don't fold the
  robe, and squash the robe when the hips drop so the hem stays above the floor).
- `blender/malfoid/anim2.py` – locomotion and idle clips; `combat.py` – combo openers and
  finishers, jump, crouch and block.
- `qa/` – screenshot tools that capture the face in the real viewer for side-by-side comparison
  with the design references.
  `qa/robe_folds.py` (run in Blender on `build/malfoid.blend`) measures how much of the lower
  robe folds over in each clip that moves the legs; all zeros is clean.

All body and face changes are **shape keys** on top of the original base mesh: its own geometry,
normals and authored shape keys are never modified.

| Shape key | Effect |
|---|---|
| `mf_bust_small` | bust projection reduced to 45% |
| `mf_hands_small` | hands 10% smaller (finger joints scaled to match) |
| `mf_legs_thin` | thighs and shins 10% thinner |
| `mf_cheek_slim` | slimmer cheeks |
| `mf_eyes_up` | eyes and brows ~5% higher |
| `mf_eyes_in` | eyes and brows 5% closer together |

`docs/integration/REPORT.md` describes how the purchased assets were fitted, with validation renders;
`docs/expression/` has the face comparisons against the design reference.

## License

Code: MIT (see `LICENSE`).
