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
| J / U | high / low punch |
| K / I | high / low kick |
| O | block (hold) |
| Esc | pause (click or Esc to resume) |
| Left drag | orbit |
| Right drag | pan |
| Wheel | zoom (towards the cursor) |
| Reset Camera | restore the initial view |

After `IDLE_ANNOYED_TIMEOUT` seconds (10, in `src/character/Malfoid.ts`) without movement she
shifts her weight, crosses her arms and makes an annoyed face. Camera input does not reset the
timer; moving blends her back into walking.

## Viewer (`src/`)

- `character/Malfoid.ts` – loads the model, locomotion, idle → annoyed state machine, blinking and
  facial expression weights.
- `character/AnimationController.ts` – clip cross-fades: locomotion (`idle`, `walk`, `run`,
  `turn`, `idle_annoyed`), one-shot moves (`jump`, `punch_high`, `punch_low`, `kick_high`,
  `kick_low`) and held poses (`crouch`, `block`).
- `character/CharacterController.ts` – key bindings and pause.
- `character/HairSway.ts` – damped-spring secondary motion on the hair's strand bones.
- `character/ToonMaterials.ts` – cel shading and outlines.
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
- `blender/malfoid/assets.py` – the purchased hair (fitted to her head, recoloured platinum, strand
  bones kept) and uniform (shirt, vest, tie, skirt, socks fitted to her body).
- `blender/malfoid/outfit2.py` – robe (black outside, green lining), loafers and crest.
- `blender/malfoid/rig2.py` – standard humanoid skeleton with the base mesh's weights remapped.
- `blender/malfoid/anim2.py` – locomotion and idle clips; `combat.py` – jump, crouch, punches,
  kicks and block.
- `qa/` – screenshot tools that capture the face in the real viewer for side-by-side comparison
  with the design references.

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
