# malfoid-3d

Interactive anime-style 3D viewer of **Malfoid**, a Slytherin student, built with Three.js +
TypeScript + Vite. The built character (`public/models/malfoid.glb`) is included, so the viewer runs
straight from a clone.

## Run

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173). `npm run build` produces a static
site in `dist/`.

## Controls

| Input | Action |
|---|---|
| W / A / S / D | walk away / towards / left / right (fixed to the starting view, so orbiting the camera doesn't steer her) |
| Shift + WASD | run |
| Space | jump |
| Left Ctrl | crouch (hold) |
| J / U | high / low punch (jab / body jab) |
| K / I | high / low kick (roundhouse / shin kick) |
| two strike keys quickly | combo (see below) |
| O | block (hold) |
| L | cast Confringo (5 s cooldown) |
| B | training dummy guard: none / high / low |
| N | bring the training dummy in front of her |
| Esc | pause (click or Esc to resume) |
| Left drag | orbit |
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

She turns towards the dummy if it is within 60°, raises the wand while fire gathers at its tip,
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

## Viewer (`src/`)

- `character/Malfoid.ts` – loads the model, locomotion, idle → annoyed state machine, blinking and
  facial expression weights.
- `character/AnimationController.ts` – clip cross-fades: locomotion (`idle`, `walk`, `run`,
  `turn`, `idle_annoyed`), `jump`, strikes and held poses (`crouch`, `block`).
- `character/CharacterController.ts` – key bindings and pause.
- `combat/moves.ts` – strikes (timing, damage, hitbox, effect) and the combo table.
- `combat/ComboSystem.ts` – input buffer, cancel windows, hit / block / miss, auto-facing.
- `combat/TrainingDummy.ts` – the opponent: HP, guard, flinch / stagger / knockback / knockdown.
- `combat/CombatTarget.ts` – what any attack hits (the dummy now, opponents later).
- `combat/spells/` – `SpellSystem.ts` (casting, cooldowns, aim assist, projectiles, damage),
  `Confringo.ts` (tuning), `Projectile.ts` + `collision.ts` (swept collision: no tunnelling),
  `SpellEmitter.ts` (where spells leave from: the wand tip),
  `ConfringoFx.ts` + `ExplosionEffect.ts` + `fx/` (pooled particles, glows, explosion).
- `ui/CombatHud.ts` – combo banner, damage numbers, dummy HP, spell cooldown.

`npm test` runs the spell logic tests in `tests/` (Node's test runner on an esbuild bundle).
- `character/HairSway.ts` – damped-spring secondary motion on the hair's strand bones.
- `character/Wand.ts` – her wand (built at runtime), drawn from the sleeve to cast, the hand's
  grip, and the tip emitter.
- `character/ToonMaterials.ts` – cel shading and outlines (the hair is shaded as one smooth volume).
- `camera/CameraController.ts`, `scene/SceneManager.ts` – orbit camera, lights, shadows.

## Rebuilding the model

The model is generated from purchased assets that are **not** in this repository. To rebuild it you
need, in the repo root: `base_character.blend` and `Gumroad_Anime_Female_BaseMesh/` (anime base
mesh), `Bell_Hair_01/` (hair) and `Girls+Hogwarts+Uniform+Harry+Potter+Uniform+Slytherin+BLEND/`
(uniform), plus Blender 4.5 (default path `~/.local/opt/blender-4.5.16-linux-x64/blender`,
override with `BLENDER=...`).

```bash
make model        # textures + build/malfoid.blend + public/models/malfoid.glb
make help         # all targets (renders, dev, build, clean, ...)
```

Blender runs with 4 threads (`-t 4`).

### Pipeline (`tools/`)

- `textures/make_textures.py` – skin and face texture from the base mesh: pale skin preset, green
  irises, blonde brows, black lashes, blush and nose mark removed, scalp painted the hair's root tone.
- `textures/make_crest.py` – the Slytherin crest painted for the robe.
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
