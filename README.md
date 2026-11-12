# malfoid-3d

Interactive anime-style 3D viewer of **Malfoid**, built with Three.js + TypeScript + Vite.

## Run

```bash
npm install
npm run dev
```

The viewer loads `public/models/malfoid.glb`. Rebuild it from the purchased assets in the repo
root (not in git): `base_character.blend`, `Gumroad_Anime_Female_BaseMesh/`, `Bell_Hair_01/` and
`Girls+Hogwarts+Uniform+Harry+Potter+Uniform+Slytherin+BLEND/` (Blender 4.5):

```bash
npm run model
```

## Controls

| Input | Action |
|---|---|
| W / A / S / D | move (camera-relative) |
| Shift + WASD | run |
| Left drag / right drag / wheel | orbit / pan / zoom (zooms toward the cursor) |
| Reset Camera | restore the initial view |

After `IDLE_ANNOYED_TIMEOUT` seconds (10, in `src/character/Malfoid.ts`) without movement she
shifts her weight, crosses her arms and pouts. Camera input does not reset the timer.

## Pipeline (`tools/`)

- `textures/make_textures.py` – her texture set from the base mesh's textures: pale skin preset,
  green irises (the base iris art recoloured), blonde brows, cheek blush removed.
- `blender/build_head.py` – stages: 1 face (shape-key expression only, geometry untouched),
  2 hair + earrings, 3 humanoid skeleton (weights remapped from the Auto-Rig Pro rig),
  4 uniform, 5 animations; `--glb` exports.
- `blender/malfoid/assets.py` – purchased Bell_Hair_01 hair (fitted to her head, recoloured
  platinum, physics bones kept) and the purchased uniform (shirt, vest, tie, skirt, socks fitted to her body).
- `blender/malfoid/outfit2.py` – loafers, robe with green lining and Slytherin crest (not in the packs).
- See `docs/integration/REPORT.md` for the integration details and validation renders.
- `blender/malfoid/anim2.py` – idle, walk, run, turn, idle_annoyed(_start) clips.
