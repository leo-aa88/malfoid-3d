# Working on malfoid-3d

How features are built in this repo: the workflow, the tools, the checks, and the mistakes
already made once that must not be repeated. Read it before starting any task.

## The project in one paragraph

This is an anime Hogwarts duelling game in **Three.js + TypeScript + Vite** (`src/`).

- **Characters:** Malfoid and Ginny are built by a **Blender 4.5 pipeline** (`tools/blender/`)
  from purchased assets that stay out of git. The outputs are `public/models/*.glb` + `.json`,
  which are committed.
- **Modes:** Training puts Malfoid against a dummy in the studio scene. Duel puts her against
  AI-controlled Ginny in the procedural Forbidden Woods.
- **Docs:** `README.md` lists the code layout. `docs/*/REPORT.md` has the per-feature reports.

## Ground rules from the user

1. **The design references are the specification.** These are `blueprint.png`,
   `facial_atlas.png`, `facial_atlas2.png` and `Ginny/*.png` (local, not committed). Compare
   against them; never against your own idea of the character.
2. **Never damage the purchased base mesh.** Face and body changes are **shape keys** on top of
   the untouched Basis, or texture/colour changes. No reshaping, no "landmark percentage"
   tuning at the cost of quality.
3. **Don't change one character while working on another.** After any pipeline change,
   Malfoid's model must be byte-identical, or differ only by added clips (see Regression
   checks).
4. **The purchased assets are licensed.** Don't comment on rights. Don't commit them, or the
   reference images, `public/sfx/`, or `build/` (all in `.gitignore`).
5. **No premade environment assets.** Environments and props are generated in code.
6. **Never claim something works without checking it in the real viewer.** List the visible
   defects in your own screenshots before saying anything is fixed. This was the user's
   biggest frustration in this project.
7. **Gameplay readability beats atmosphere.** The characters and spell effects must stay
   readable.

## Workflow for a feature

### 1. Branch

```bash
git checkout main && git pull --ff-only && git checkout -b feature/<name>
```

- Use one branch per feature or fix.
- Never commit to `main`. The user reviews and merges PRs themselves.
- After the user says "merged":

  ```bash
  git checkout main && git pull --ff-only && git branch -d feature/<name>
  ```

### 2. Inspect first

- Read the code you will hook into: `main.ts`, the relevant system, and its tests.
- Reuse the existing systems; don't build parallel ones:
  - `CombatTarget` and `FighterTarget`
  - `ComboSystem`, `SpellSystem` and `SpellEmitter`
  - the `ConfringoFx` / `SpellLook` effect pools
  - `CharacterOptions`, `AnimationController`
  - `character.py` profiles, `SceneManager.setEnvironment`
- Put tunable values in one config object or file, with comments and units (metres, seconds,
  m/s).

### 3. Build in small steps, checking each

- **TypeScript:** run `npx tsc --noEmit` after every change.
- **Logic:** write `node:test` tests in `tests/*.test.ts` for anything that doesn't need WebGL,
  using fakes for characters. Run them with `npm test`.
- **Character or animation changes:** go through the Blender pipeline (see Blender).
- **Visuals:** check in the browser (see Browser validation). Look at the screenshot, list what
  is wrong, fix it, and look again.
- **Checkpoints:** commit at each working stage, so a regression can be rolled back to the last
  good state.

### 4. Validate like a player

- Use the **real gameplay camera** (the duel framing, the follow camera), not only beauty shots.
- Exercise the actual feature end to end:
  - press the real keys and let the AI act
  - cross the boundaries the feature introduces
  - pause and resume
  - repeat the action to catch leaks
- Measure, don't assume:
  - damage numbers, cooldowns, hit counts
  - `renderer.info` (draw calls, triangles, geometries, textures, programs) staying flat
  - JS cost per frame
- For behaviour or AI, playtest with a scripted player and report the outcomes.
- If something can't be measured here (real GPU frame rate), say so plainly.

### 5. Regression checks (every feature)

- **Tests:** `npm test` passes.
- **Training:** all 8 combos chain with the expected damage. This is the
  `combos` Playwright check.
- **Confringo:**
  - a direct hit deals 20
  - the cooldown freezes while paused
  - holding L casts once
  - walls block it, and a miss ends at 25 m
  - effects clean up and GPU resources stay flat
- **Malfoid's model, after any change under `tools/`:**
  - Rebuild with `make model`.
  - If no clips were added, `sha256sum public/models/malfoid.glb` must match the committed file.
  - If clips were added, compare every existing clip's keyframe data against
    `git show HEAD:public/models/malfoid.glb`: all must be identical, with only additions.
- **Duel:** still starts, and Ginny's AI acts at the chosen difficulty.

### 6. Commit and report

- **Run `git status` before every commit** and stage everything the feature touched:
  `index.html`, CSS, `README.md`, `docs/`. A difficulty PR once merged without its
  `index.html` change.
- **Commit messages:** a short summary line, then what and why, then the validation done. End
  with the attribution line given by the harness.
- **Docs:** update the README (controls, modes, layout) and add `docs/<feature>/` screenshots
  and a `REPORT.md` for bigger features.
- **Report to the user:**
  - lead with whether it works and what was verified
  - list what still looks rough or is untested
  - include the tunables and the next most valuable step
  - only then offer to push and open the PR
- **PR description:** summary, design, validation results (tables are fine) and known
  limitations.

## Tools and how to use them

### Blender (character pipeline)

- **Binary:** `~/.local/opt/blender-4.5.16-linux-x64/blender`. Use `BLENDER=...` to override.
  Never use the apt 3.0.1 build, which crashes on the files.
- **Build:**
  - `make model` builds Malfoid.
  - `make ginny` builds Ginny (`MF_CHAR=ginny`).
  - `make models` builds both.
  - The entry point is `tools/blender/build_head.py --stage 5 --save ... --glb ...`.
- **Per-character values:** in `tools/blender/malfoid/character.py`. Malfoid's profile must
  reproduce her model bit for bit.
- **Animations:** authored in `anim2.py` (locomotion) and `combat.py` (moves, reactions,
  stances, spells) as poses plus two-bone IK. A new clip needs an entry in `combat.CLIPS` and a
  function with the same name. Add looping clips to `LOOPING`.
- **Resource limits (strict; the user's machine must stay usable):**
  - **One** Blender job at a time, always `-t 4`, run under `nice -n 10`.
  - Use low-resolution, low-sample renders for debugging, and only Cycles CPU headless (Workbench
    and EEVEE fail without EGL).
  - Save full-quality renders for validation milestones.
- **Blender's Python has no PIL.** Do image I/O through `bpy.data.images`, or in system
  Python (`tools/textures/*.py`).
- **Garment regression:** `tools/qa/robe_folds.py` (run in Blender on `build/malfoid.blend`)
  must report 0 folded area for every clip after robe or rig changes.

### Browser validation (Playwright, headless)

- **Setup:** keep Playwright out of the repo, in a scratch directory
  (`npm i playwright && npx playwright install chromium`). Launch with:

  ```js
  chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  ```

- **Serving:**
  - Run `npx vite build`, then `npx vite preview --port 4173 --strictPort` in the background,
    under `nice -n 10`.
  - `vite preview` serves `dist/`, so **rebuild after every model or code change**, or you will
    test the old version.
- **Resource limits:**
  - Run each test under `nice -n 19 taskset -c 0-3`, with one browser session for all
    screenshots of a test.
  - Kill the preview server and every browser when done:
    `pkill -f "vite preview --port 4173"`, then confirm with `ps`.
- **Debug handles on `window`:**
  - `malfoid`, `ginny`, `cam`
  - `combat`, `ginnyCombat`, `spells`, `ginnySpells`, `spellFx`, `ginnyFx`
  - `ai`, `dummy`, `malfoidTarget`, `ginnyTarget`
  - `enterMode(mode, level)`, `openMenu()`, `setDuel()`
  - `forest`, `renderer`, `scene`, `input`, `CONFRINGO`
- **Freezing a moment:** pause with an Escape keydown in the exact `requestAnimationFrame` where
  a condition holds. Pause CSS animations too (`document.getAnimations()`) so pop-ups show.
  Hide `#paused` with injected CSS.
- **The first screenshot of a session can be stale.** Take a throwaway shot or wait about
  1.5 s.
- **Software rendering is slow (1–20 fps)** and the game caps each frame at 0.1 s of game time,
  so it runs in slow motion. Don't judge speed from wall-clock movement. For long trips, step
  positions and keep real-controller runs short. Never report headless fps as real performance.
- **Small viewports** (under about 640 px) hide the start menu buttons. Call `enterMode`
  instead of clicking.
- **Face comparisons:** `tools/qa/face_batch.mjs` with `debugFreeze` / `debugFace` and the
  atlas-matched cameras. Put the sheets side by side with `tools/qa/compare.py`.
- **Writing up results:** tile screenshots into one image to look at them. Then write down every
  defect you see before deciding anything is done.

### Logic tests

```bash
npm test
```

This bundles `tests/*.test.ts` with esbuild and runs Node's test runner. There's no extra
dependency. Keep game logic testable with fakes: `Caster`, `SpellEmitter`, `CombatTarget`, and
fake fighters for `FighterTarget` and `FighterAI`.

## Pitfalls already hit (don't repeat)

- **Pausing:** the game's pause must also freeze timers. Use game time (`update(dt)`), never
  `performance.now()`, for cooldowns.
- **Cross-fades:** time-warping cross-fades raced short one-shot clips. Only walk and run warp.
- **Stun-lock:** hit reactions locked the AI out of acting. Any new reaction or AI state needs a
  playtest for this.
- **Blocking:** strikes land faster than a reaction time, so blocking must be anticipatory.
- **Profile names:** a profile variable named `P` was shadowed by a local `P` in `assets.py`.
  Profiles are imported as `PROFILE` there.
- **Hair props:** a hair-tie prop was rejected ("a nightmare to fix"). Prefer reshaping the
  purchased hair over adding props, and look at the back and side views for holes.
- **Instanced meshes:** `InstancedMesh` frustum culling is all-or-nothing, so set
  `frustumCulled = false` and keep counts and LODs in check instead.
- **Random fades:** a random dither for fades sparkles. Use an ordered (Bayer) dither.
- **HUD overlap:** the HUD panel covers the left of small windows. The duel camera shifts its
  framing to compensate. Check the left fighter in screenshots.

## Communication

- **Mid-task messages:** the user often sends short instructions while you work. Apply them
  immediately, and mention it.
- **Answers:** keep them direct. Admit mistakes plainly (for example "I left the file out of
  the commit"), then fix them.
- **Ambiguity:** when a request is ambiguous but has a sensible default, pick it, say so, and
  offer the alternative in one line.
