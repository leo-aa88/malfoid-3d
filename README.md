# malfoid-3d

An anime-style 3D fighting game in the browser: **Malfoid**, a Slytherin student, duels Harry
Potter's potential romantic interests one by one, with fists, kicks and spells. Built with
Three.js + TypeScript + Vite.

**Ginny Weasley** is the first rival; more are planned. The built characters
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

The start screen offers two modes:

- **Training:** Malfoid against a training dummy in the studio scene, to practise strikes,
  combos and Confringo.
- **Duel:** Malfoid against an AI-controlled rival in the **Forbidden Woods**, an infinite
  procedural forest that streams in chunks around the player, with no walls. See
  `src/scene/forest/` and `docs/forest/REPORT.md`; all values are in
  `src/scene/forest/config.ts`.

## Rivals

| Rival | House | Signature spell | Status |
|---|---|---|---|
| Ginny Weasley | Gryffindor | Expelliarmus (disarms Malfoid) | playable |
| more of Harry's love interests | | | planned |

Each rival is built by the same character pipeline as Malfoid (her own profile in
`tools/blender/malfoid/character.py`), with her own expressions, voice lines, signature spell
and AI tuning.

### Ginny Weasley

The duel against Ginny has three difficulties:

| Level | Ginny's HP | How she fights |
|---|---|---|
| Easy | 100 | the original Ginny: slow to react, rarely blocks, random strikes |
| Normal | 160 | faster reactions; guards up when you're close and after taking a hit; counters blocked strikes; punishes openings; reads your wand wind-up to dodge Confringo; real combos; stays close while you have your wand |
| Hard | 240 | all of the above, quicker and more often |

Ginny's signature spell is Expelliarmus. It knocks Malfoid's wand out of her hand, and the wand
lands on the floor inside a ring. Until Malfoid walks over and picks it up, she can only fight
with her fists. See `docs/ginny/REPORT.md` for details.

## How a duel runs

- **Opening lines:** Malfoid speaks, then her rival replies, each in a close-up. Nobody can
  move or attack until **DUEL!** appears.
- **The fight:** first to 0 HP loses. A strike blocked by a fighter leaves the attacker slow
  to recover, an opening for either side. **G** (or the HUD button) restarts the duel.
- **The last word:** the winner says her line after the KO.
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
| G | restart the duel (duel mode) |
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

She turns towards her target (the dummy or her rival) if it is within 60°, raises the wand while fire gathers at its tip,
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
- `combat/ai/FighterAI.ts` – the rival's behaviour (observe, approach, retreat, block, strike,
  cast); `combat/ai/difficulty.ts` – the Easy / Normal / Hard tuning.
- `combat/spells/Expelliarmus.ts` – Ginny's disarming spell.
- `character/faces.ts` – Ginny's expressions and speaking mouth.
- `combat/spells/` – `SpellSystem.ts` (casting, cooldowns, aim assist, projectiles, damage),
  `Confringo.ts` (tuning), `Projectile.ts` + `collision.ts` (swept collision: no tunnelling),
  `SpellEmitter.ts` (where spells leave from: the wand tip),
  `ConfringoFx.ts` + `ExplosionEffect.ts` + `fx/` (pooled particles, glows, explosion).
- `ui/CombatHud.ts` – combo banner, damage numbers, dummy HP, spell cooldown.
- `ui/VolumeControl.ts` – the sound volume control (− / slider / +) on the start menu and the
  pause screen; remembered in the browser, with a short sample at the new level.
- `audio/duelVoices.ts` – the duel's opening and win lines and the speakers' lip movement
  (driven by `audio/envelope.ts`, the lines' loudness over time).
- `audio/Sfx.ts` – sound effects (Web Audio): each sound is a time slice of a file in
  `public/sfx/`, placed by distance and screen side; `audio/combatSounds.ts` – which sound plays
  for which event (punches, kicks, grunts on damage, Confringo, Expelliarmus, footsteps timed to
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
AI and combat, the forest (generation, collision, geometry), sound triggers and the voice lines.
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
