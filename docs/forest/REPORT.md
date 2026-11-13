# Forbidden Woods — prototype report

The Forbidden Woods is an infinite, procedurally generated forest used for **Duel** mode. Training
keeps the original studio scene. Everything is built from code: there are no model files and no
texture packs.

## What was added (`src/scene/forest/`)

### `config.ts`: `FOREST_CONFIG`
Every tunable value lives here:
- seed, chunk size and active radius
- detail and prop radii
- tree density and clearing frequency
- fog near/far and colour
- moonlight, ambient and rim colours and intensities, and the moon direction
- particle counts and eyes
- switches for rocks, particles, collision, spells hitting trees, and fading trees that block
  the view

### `random.ts`
Hash, PRNG and value-noise functions. They are deterministic per seed and world position.

### `placement.ts`
A chunk's placement data: plain numbers, generated only from the chunk coordinates and the seed.
- **Trees:** placed on a jittered grid aligned to the world, so chunk borders don't show.
- **Variety:** tree density varies across the forest, natural clearings come from noise, and
  12% of trees are dead.
- **Spawn clearing:** 11 m across and ringed by large old trees.
- **Props:** rocks, logs, stumps, twig bushes, grass, leaf litter, and mushrooms around tree
  roots, some of them glowing.

### `geometry.ts`
The shapes, built once in code:
- **Trees:** 8 variants (6 living, 2 dead) with twisted, flared trunks, knobbly bark, exposed
  roots, angled branches with twigs, and sparse low-poly dark canopy clumps. Each has 3 levels
  of detail sharing one random stream, so a tree keeps its silhouette when its detail changes.
- **Other shapes:** rocks with moss on top, logs, a stump, a mushroom, grass tufts, a leaf and
  twig bushes.

### `ForestWorld.ts`
The streaming world.
- **Placement cache:** chunks are generated on demand and kept in an LRU cache of 400.
- **Rendering:** one `InstancedMesh` per shape for the whole visible forest, refilled when the
  player enters another chunk. Trees are drawn at 3 detail levels by distance, and small props
  only nearby.
- **Ground:** a single mesh follows the player chunk by chunk and is recoloured from world-space
  noise: soil, leaf litter, moss, damp patches, and moonlit dead grass in clearings. The repaint
  is spread over several frames.
- **Fading:** trees between the camera and either fighter are faded with an ordered dither,
  disappearing fully when close to the camera.
- **Collision:** trunks are simple circles. A body is pushed out and slides round them. Data is
  generated on demand wherever a fighter is, even far from the player.
- **Spells:** trunks within 26 m of the fighters become boxes for the spell system, so Confringo
  explodes on trees.
- **Sound hooks:** `onAmbience` fires 'wind', 'rustle', 'creature' and 'cue' events at random
  intervals. No audio is attached yet.
- **Debug:** `showChunkBorders()` draws the chunk borders on the ground.

### `atmosphere.ts`
Things that follow the player:
- a night-sky gradient dome and the moon with a halo
- two rings of canvas-painted distant tree silhouettes beyond the fog, so every direction looks
  deep
- dust motes, teal magical motes and blinking fireflies, wrapped round the player in the shader
  so they never run out
- pairs of eyes that open, blink and close 32–52 m away between the trees

### Changes outside the folder
- **`SceneManager`:** `setEnvironment('studio' | 'woods', look)` switches the lighting, fog,
  background and draw distance. The studio values are unchanged.
- **`main.ts`:** Duel mode switches to the woods and spawns the fighters in the clearing, then
  calls the trunk collision, spell solids and streaming each frame. Training switches back to
  the studio.
- **`CameraController`:** in a duel, the view shifts so the pair sits right of the HUD panel and
  can pull back to 16 m to keep two spread-out fighters in frame.
- **Tests:** `tests/forest.test.ts` covers determinism, objects staying inside their chunk, the
  spawn clearing, clearings existing, and density varying.

## Validation (real browser, SwiftShader software rendering)
- **Movement across chunk borders:**
  - the real controller ran Malfoid across a chunk border with Ginny's AI chasing
  - a fight on the x = −32 border landed 4 strikes, and Ginny went from 100 to 68 HP
- **Long trip:** a 400 m walk in 2 m steps crossed 18 chunks.
  - restreaming took a median of 4.5 ms per crossing (one spike of 39 ms)
  - geometries (96), textures (31) and JS heap (61 MB) stayed constant
  - the placement cache grew to 168 of its 400 limit
- **Revisit:** back at the spawn, the trees nearby have identical positions and variants. The
  screenshots differ by 0.38/255 on average, which is the moving fireflies and motes.
- **Rendering cost:** about 115 draw calls.
  - triangles: about 800k–850k in the woods, against 163k in the studio, which includes the
    characters' ~150k each
  - JavaScript per frame: render submission 2–7 ms, forest update about 1 ms, collision and
    spell solids under 0.1 ms
- **Frame rate:** not measurable here. The headless test browser renders in software on a
  loaded machine and ran at 3–5 fps, the same as the empty studio, so frame rate needs checking
  on a real GPU.
- **Regression:** Training still uses the studio, all 8 combos land with the same damage, and
  the 27 logic tests pass.

## Quick tweaks
| What | Where |
|---|---|
| Forest density | `treeDensity` |
| How open it is | `clearingFrequency`, `spawnClearing` |
| Darkness and mood | `fogNear` / `fogFar` / `fogColor`, `ambientIntensity`, `moonlightIntensity` / `moonlightColor`, `rimIntensity` |
| Atmosphere | `dustMotes`, `magicMotes`, `fireflies`, `eyes` |
| Cost | `activeRadius`, `detailRadius`, `propRadius` |
| Behaviour | `collisionEnabled`, `spellsHitTrees`, `fadeBlockingTrees` |
| A different forest | `seed` |

## Still rough
- **Ground:** perfectly flat; there's no terrain height yet. The leaf litter is tiny discs.
- **Trees:** low-poly and faceted, the canopy clumps are simple lumps, and the bark has no
  texture.
- **Fading:** fading trees show the dither pattern, and fading isn't applied to the
  mid- and far-distance trees.
- **Fixed rendering costs:** the eyes and the moon don't respond to fog, and every visible
  instance is drawn because there's no per-instance culling.
- **Popping:** when the player crosses a chunk, trees about 32 m away switch detail level
  abruptly, softened by the fog.
- **Hitches:** restreaming can cause an occasional 15–40 ms hitch. The ground repaint is spread
  out; the instance refill isn't.

## Next most valuable improvement
On a real GPU, measure frame rate, then add a light **vertex wind sway** to branches and canopy
and **soft moonbeam shafts** into the clearings. These are cheap and would add the most life
and mood. The biggest technical step after that is gentle **terrain height**, with the fighters
following the ground.
