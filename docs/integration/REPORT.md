# Malfoid: purchased asset integration

## Assets reused

| Asset | Contents found | How it is used |
|---|---|---|
| `base_character.blend` (+ `Gumroad_Anime_Female_BaseMesh/`) | head with 143 shape keys, body, Auto-Rig Pro rig, textures and presets | Head is **unmodified** (geometry, normals, UVs, shape keys). Pale skin preset, base iris art recoloured green, blonde brows, blush removed. Resting smirk from existing shape-key values. |
| `Bell_Hair_01/` (Blender 2.80, FBX, 24 colour PNGs, alpha PNGs, PSDs, Unity prefab) | 1 mesh, 8,551 verts / 4,259 faces, 1 material, 29-bone rig (4 head bones, 7 physics chains) | Mesh imported as authored (topology, UVs, card layout). Uniform scale 0.932 and an offset are found by measuring the gap between her skull and the hair's inner surface (head is never changed). Recoloured platinum from the pack's neutral grey texture (its shading and strand detail kept) with the pack's alpha map. Its 25 physics bones are kept as secondary `hair_*` bones on her skeleton with the original weights; the viewer adds damped sway on them. |
| `Girls+Hogwarts+Uniform...BLEND/` (Blender 3.6, one `.blend`) | One mesh, 43,891 verts / 34,070 faces, 438 loose parts, no textures, no rig, no robe/shoes/crest, centimetre units, A-pose | Split into garments by part: shirt (body, sleeves, collar, placket, buttons), sweater vest + ribbing, tie, pleated skirt + waistband, knee socks. Fitted to her body (see below), skinned from her body's weights. |

No licence or readme files are included in either pack. The hair's listing (BOOTH, LYN) gives VN3-based terms; the uniform's CGTrader page could not be read automatically. The packs are kept out of git (`.gitignore`), and the viewer only loads the compiled GLB.

## Fitting (garments adapted to her, never her to the garments)

- **Heights** map by landmarks (waist, shoulder line, collar, ankle).
- **Torso**: each 1 cm slice of the uniform is scaled to her body's cross-section plus a clearance (shirt ~4 mm at the collar, vest ~10 mm).
- **Sleeves**: rotated from the pack's A-pose to her T-pose along the arm axis, radius scaled to her arm.
- **Skirt**: the waistband fits her waist; below that the pack's pleats and flare are kept and never narrower than her hips.
- **Socks**: per-leg slice fit.
- **Clearance pass**: a final push-out moves any vertex closer to the skin than its layer's clearance, spread smoothly to keep shell thickness.
- **Robe**: built for this project because the pack has none. It is offset over the outermost uniform layer, with green lining and facings, plus a Slytherin crest. Loafers are also built (the pack has no shoes).

## Rig

A 77-bone humanoid skeleton:
- 52 bones at the base rig's joints, carrying the base's own skin weights, remapped from the Auto-Rig Pro deform bones;
- 25 hair bones from the hair pack.

Uniform weights are interpolated from the nearest body surface; the skirt uses hips/thigh weights for a stable pleat block. Checked in raised-arm, walk, run and crossed-arm poses (renders 9–11).

## Validation renders

`docs/integration/`:
- `1`–`5`: front, three-quarter front, side, three-quarter back, back;
- `6`–`7`: head close-ups;
- `8`: crest and uniform close-up;
- `9`: arms raised;
- `10`–`11`: walk;
- `0`: the untouched source assets, rendered independently.

## Later fixes

- **Hair motion**: per-strand damped springs on the hair pack's own chain bones. They are reset to rest every frame and bend at most 24° per bone. A browser test measured about 11° while walking and 17° while running, settling within about 2.5 s with no accumulation.
- **Hair fit**: the crown and the fringe in front of the face are shrink-wrapped onto her skull, so the hair no longer sits like a helmet. The locks beside the ears are left free so both hoops stay visible.
- **Cheeks**: added a `mf_cheek_slim` shape key and switched it on in her resting expression. The head's base geometry and authored keys are untouched.
- **Robe**: the torso is now a smooth surface built around her clothes, with a clean V lapel and green facing. Separate pieces cover the sleeves and shoulder tops.
- **Crest**: painted texture with an ornate frame, crown, shield and a serpent with scales, eye and forked tongue.
- **Skirt**: each part is weighted to the leg it covers, so the walking leg no longer passes through it.
- **Stray fragments**: hem pieces that were misclassified as shirt are fixed, which removes the floating dashes.
- **Crossed arms**: retargeted so her left forearm goes over the right and each hand reaches the opposite elbow.
- **Controls**: WASD is fixed to the world (as seen from the initial camera), so you can orbit to watch her walk or run from any side.

## Body proportions (shape keys; the base mesh's Basis is untouched)

- **Diagnosis**:
  - Bust projection over the underbust was about 32 mm on the base body itself.
  - The shirt, vest and robe copied it outward: about 27 mm on the shirt, about 25 mm on the vest, and the robe a further 23 mm out from the body.
  - The base pack's own `Chest` key only collapses the chest for clothing, so it couldn't be used.
- **`mf_bust_small`**: inside the base mesh's breast weight groups, the projection in front of the chest wall is kept at 45%. Every garment is fitted to the body with the key applied, so the bust over the underbust is now about 7 mm on the shirt, 5 mm on the vest and 11 mm on the robe.
- **`mf_hands_small`**: hands are 10% smaller about the wrist. The finger joints are scaled to match, so finger bending stays aligned.
- **`mf_legs_thin`**: thighs and shins are 10% thinner towards the leg axis, fading out at the hips. Socks and shoes follow.
- **Unchanged**: head, hair, earrings and animations are byte-identical. The skeleton's names and hierarchy are unchanged; only the finger joints moved.
- **Renders**: before/after comparisons are `14_bust_before_after.png`, `15_hands_smaller.png` and `16_legs_thinner.png`.

## Remaining limitations

- **Robe**: built for this project and plainer than the reference: no hood, simple folds.
- **Hair fringe**: one lock falls across her right eye in three-quarter view; this is part of the asset's design.
- **Hair sway**: driven procedurally, not cloth simulation.
- **Shoes and crest**: simple, built for this project.
- **Hand shading**: hands read slightly grey under the viewer's toon lighting.
- **Testing**: the viewer was tested in headless software rendering (≈10–19 FPS there), not on a GPU.
