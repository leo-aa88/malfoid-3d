import './styles/main.css';
import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager';
import { CameraController } from './camera/CameraController';
import { Malfoid } from './character/Malfoid';
import { GINNY_FACES } from './character/faces';
import { CharacterController } from './character/CharacterController';
import { TrainingDummy, DUMMY_RADIUS, Guard } from './combat/TrainingDummy';
import { ComboSystem } from './combat/ComboSystem';
import { FighterTarget } from './combat/FighterTarget';
import { FighterAI } from './combat/ai/FighterAI';
import { CombatHud } from './ui/CombatHud';
import { SpellSystem } from './combat/spells/SpellSystem';
import { ConfringoFx } from './combat/spells/ConfringoFx';
import { CONFRINGO } from './combat/spells/Confringo';
import { EXPELLIARMUS, EXPELLIARMUS_LOOK } from './combat/spells/Expelliarmus';
import { DIFFICULTY, Difficulty } from './combat/ai/difficulty';

const BASE = import.meta.env.BASE_URL;
const DUMMY_DISTANCE = 0.56;                  // m, centre to centre: in reach of every strike
// at the start it stands at her front-right (screen left as she faces the camera), off the
// path she takes to the right and still inside the auto-facing angle
const DUMMY_START_ANGLE = -1.0;               // rad (+ is her left)
const DUMMY_START_DISTANCE = 0.9;
// Ginny waits at her other side, a few steps away, until a duel starts
const GINNY_START = new THREE.Vector3(1.8, 0, -0.4);
const DUEL_DISTANCE = 3.6;                    // m between them when a duel starts
const FIGHTER_GAP = 0.45;                     // m centre to centre: fighters can't walk through each other

/** push two bodies apart (centre to centre at least gap); share decides who moves (0: only a, 1: only b) */
function keepApart(a: THREE.Vector3, b: THREE.Vector3, gap: number, share = 0): void {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const d = Math.hypot(dx, dz);
  if (d >= gap || d < 1e-6) return;
  const push = gap - d;
  a.x += (dx / d) * push * (1 - share);
  a.z += (dz / d) * push * (1 - share);
  b.x -= (dx / d) * push * share;
  b.z -= (dz / d) * push * share;
}

async function start(): Promise<void> {
  const sm = new SceneManager(document.getElementById('app')!);
  const cam = new CameraController(sm.camera, sm.renderer.domElement);
  // ?char=ginny shows Ginny's model in the player's place (inspection)
  const char = new URLSearchParams(location.search).get('char') === 'ginny' ? 'ginny' : 'malfoid';
  const [malfoid, ginny] = await Promise.all([
    Malfoid.load(`${BASE}models/${char}.glb`, `${BASE}models/${char}.json`,
      char === 'ginny' ? { name: 'Ginny', idleClip: 'confident', expressions: GINNY_FACES } : undefined),
    Malfoid.load(`${BASE}models/ginny.glb`, `${BASE}models/ginny.json`,
      { name: 'Ginny', idleClip: 'confident', expressions: GINNY_FACES }),
  ]);
  malfoid.scene = ginny.scene = sm.scene;
  sm.scene.add(malfoid.root, ginny.root);
  ginny.root.position.copy(GINNY_START);
  ginny.lookAt(Math.atan2(-GINNY_START.x, -GINNY_START.z));
  ginny.root.visible = false;                         // shown in duel mode
  malfoid.update(1 / 60);                             // posed (not in the bind pose) behind the mode select
  ginny.update(1 / 60);

  // training dummy
  const dummy = new TrainingDummy();
  sm.scene.add(dummy.root);
  const placeDummy = (angle: number, dist: number) => {
    const f = malfoid.facingAngle + angle;
    const p = malfoid.position.clone().add(new THREE.Vector3(Math.sin(f), 0, Math.cos(f)).multiplyScalar(dist));
    dummy.placeAt(p, malfoid.position);
  };
  placeDummy(DUMMY_START_ANGLE, DUMMY_START_DISTANCE);

  // who can be hit: the dummy and the fighters
  const malfoidTarget = new FighterTarget(malfoid);
  const ginnyTarget = new FighterTarget(ginny);
  const solids: THREE.Box3[] = [];
  // training: only the dummy; duel: only Ginny
  let mode: 'training' | 'duel' = 'training';
  const malfoidTargets = () => (mode === 'duel' ? [ginnyTarget] : [dummy]);
  const combat = new ComboSystem(malfoid, malfoidTargets);
  const ginnyCombat = new ComboSystem(ginny, () => [malfoidTarget]);
  const hud = new CombatHud(sm.camera, document.getElementById('hud')!);
  combat.onEvent = (e) => hud.handle(e);
  ginnyCombat.onEvent = (e) => hud.handle(e);

  // spells: each caster casts from her own wand tip; Malfoid's Confringo hits the dummy and
  // Ginny, Ginny's Expelliarmus hits Malfoid
  const spellFx = new ConfringoFx(sm.scene);
  const spells = new SpellSystem(malfoid, malfoid.spellEmitter, () => combat.busy, spellFx, { solids, groundY: 0 });
  const ginnyFx = new ConfringoFx(sm.scene, EXPELLIARMUS_LOOK, 'expelliarmus_fx');
  const ginnySpells = new SpellSystem(ginny, ginny.spellEmitter, () => ginnyCombat.busy, ginnyFx, { targets: [malfoidTarget], solids, groundY: 0 });
  spells.onEvent = (e) => hud.handleSpell(e);
  ginnySpells.onEvent = (e) => {
    hud.handleSpell(e);
    if (e.type === 'hit' && e.disarmed) {
      hud.announce('DISARMED!', 'disarm');
      ginny.setExpression('teasing', 1.6);
    }
  };

  // Ginny's AI: only fights once a duel has been started (G or the HUD button)
  const ai = new FighterAI(ginny, ginnyTarget, ginnyCombat, ginnySpells, EXPELLIARMUS, malfoid, combat, () => solids);
  ai.opponentSpells = spells;                         // she sees Malfoid's casts and bolts
  let level: Difficulty = 'easy';
  const setLevel = (l: Difficulty) => {
    level = l;
    ai.params = DIFFICULTY[l].ai;
    ginnyTarget.maxHp = DIFFICULTY[l].hp;
    hud.setLevel(DIFFICULTY[l].label);
  };
  ai.onState = (s) => {
    if (s === 'CAST' || s === 'MELEE_ATTACK') ginny.setExpression('determined', 0.9);
    else if (s === 'RETREAT') ginny.setExpression('frustrated', 1.0);
  };
  let duel = false;
  let duelOver = 0;
  const setDuel = (on: boolean) => {
    duel = on;
    duelOver = 0;
    if (on) {
      // a fresh start: full health, wands back, facing each other a few steps apart
      malfoidTarget.reset();
      ginnyTarget.reset();
      if (!malfoid.hasWand) malfoid.wand.retrieve();
      if (!ginny.hasWand) ginny.wand.retrieve();
      spells.reset();
      ginnySpells.reset();
      // side by side across the screen (the camera looks along -z): Malfoid on the left
      // facing right, Ginny on the right facing left
      ginny.root.position.copy(malfoid.position).add(new THREE.Vector3(DUEL_DISTANCE, 0, 0));
      malfoid.setFacing(Math.PI / 2);
      ginny.setFacing(-Math.PI / 2);
      cam.frame(malfoid.position, ginny.position);
      ginny.setExpression('confident', 1.5);
      hud.announce('DUEL!', 'duel');
    }
    ai.setActive(on);
    hud.setDuel(on);
  };
  const finish = (winner: Malfoid) => {
    if (!duel || duelOver) return;
    duelOver = 1;
    ai.setActive(false);
    hud.announce(`${winner.name.toUpperCase()} WINS`, 'win');
    if (winner === ginny) ginny.setExpression('happy', 4);
  };
  malfoidTarget.onDefeated = () => finish(ginny);
  ginnyTarget.onDefeated = () => finish(malfoid);

  const input = new CharacterController(malfoid, combat);
  input.viewYaw = () => cam.getYaw();
  input.onSpell = () => {
    if (!malfoid.hasWand) hud.flashStatusText('NO WAND', 'miss');
    else spells.cast(CONFRINGO);
  };
  // mode select (start screen; "Change mode" in the HUD brings it back)
  const modeEl = document.getElementById('mode')!;
  let menuOpen = true;
  const enterMode = (m: 'training' | 'duel', l?: Difficulty) => {
    mode = m;
    if (l) setLevel(l);
    menuOpen = false;
    modeEl.hidden = true;
    spells.world.targets = malfoidTargets();
    dummy.root.visible = m === 'training';
    ginny.root.visible = m === 'duel';
    hud.setMode(m);
    if (m === 'training') {
      setDuel(false);
      placeDummy(DUMMY_START_ANGLE, DUMMY_START_DISTANCE);
      if (!malfoid.hasWand) malfoid.wand.retrieve();
      malfoidTarget.reset();
    } else {
      setDuel(true);
    }
    input.setPaused(false);
  };
  for (const b of modeEl.querySelectorAll<HTMLButtonElement>('button[data-mode]')) {
    b.addEventListener('click', () => enterMode(b.dataset.mode as 'training' | 'duel', b.dataset.level as Difficulty | undefined));
  }
  const openMenu = () => {
    menuOpen = true;
    setDuel(false);
    input.setPaused(true);
    modeEl.hidden = false;
  };
  hud.onModeButton = openMenu;
  // G / the HUD button: a fresh duel (duel mode only)
  input.onDuel = () => { if (mode === 'duel') setDuel(true); };
  hud.onDuelButton = () => { if (mode === 'duel') setDuel(true); };
  const guards: Guard[] = ['none', 'high', 'low'];
  input.onDummyGuard = () => dummy.setGuard(guards[(guards.indexOf(dummy.guard) + 1) % guards.length]);
  input.onDummyReset = () => placeDummy(0, DUMMY_DISTANCE);
  cam.reset(malfoid.position);
  malfoid.resetIdleTimer();          // the countdown starts when she appears
  document.getElementById('reset-camera')!.addEventListener('click', (e) => {
    cam.reset(malfoid.position);
    (e.currentTarget as HTMLButtonElement).blur();     // keep WASD working
  });
  document.getElementById('loading')!.remove();

  const pausedEl = document.getElementById('paused')!;
  input.onPauseChange = (p) => {
    pausedEl.hidden = !p || menuOpen;
    if (!p && menuOpen) input.setPaused(true);          // Esc doesn't skip the mode select
  };
  input.setPaused(true);                                // the mode select comes first
  modeEl.hidden = false;
  hud.setMode('training');
  pausedEl.addEventListener('click', () => input.setPaused(false));
  const stateEl = document.getElementById('state')!;
  const fpsEl = document.getElementById('fps')!;
  const clock = new THREE.Clock();
  let frames = 0;
  let fpsTime = 0;
  let lastState = '';

  sm.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!input.paused) {
      input.update();
      const duelMode = mode === 'duel';
      if (duelMode) ai.update(dt);
      combat.update(dt);
      if (duelMode) ginnyCombat.update(dt);
      malfoid.update(dt);
      if (duelMode) ginny.update(dt);
      spells.update(dt);                    // after the pose update: the wand tip is where it is drawn
      if (duelMode) ginnySpells.update(dt);
      malfoidTarget.update(dt);
      ginnyTarget.update(dt);
      if (duelMode) keepApart(malfoid.position, ginny.position, FIGHTER_GAP, 0.5);
      else if (!dummy.down) keepApart(malfoid.position, dummy.position, DUMMY_RADIUS + 0.22);
      if (!duelMode) dummy.update(dt, malfoid.position);
      hud.update(dt);
      if (duelOver) {
        duelOver += dt;
        if (duelOver > 4 && duel) {
          setDuel(false);
          hud.announce('G: FIGHT AGAIN', 'duel');
        }
      }
    }
    hud.setDummy(dummy.hp, dummy.guard);
    hud.setSpell(CONFRINGO.name, CONFRINGO.key, spells.cooldownLeft(CONFRINGO), CONFRINGO.cooldown, malfoid.hasWand);
    hud.setFighters(malfoidTarget, ginnyTarget, duel ? ai.state : null);
    spellFx.setView(sm.camera, sm.renderer.domElement.height);
    ginnyFx.setView(sm.camera, sm.renderer.domElement.height);
    cam.update(malfoid.position, input.paused ? undefined : {
      heading: malfoid.facingAngle, speed: malfoid.moveSpeed,
      other: mode === 'duel' && !menuOpen ? ginny.position : null,
    });
    sm.followShadow(malfoid.position);
    sm.render();

    if (malfoid.state !== lastState) {
      lastState = malfoid.state;
      stateEl.textContent = lastState;
    }
    frames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      fpsEl.textContent = String(Math.round(frames / fpsTime));
      frames = 0;
      fpsTime = 0;
    }
  });
  // expose for debugging / automated checks
  Object.assign(window, { malfoid, ginny, cam, combat, ginnyCombat, dummy, spells, ginnySpells, spellFx, ginnyFx, ai,
    malfoidTarget, ginnyTarget, setDuel, enterMode, openMenu, setLevel, getLevel: () => level, CONFRINGO, renderer: sm.renderer, scene: sm.scene, input, solids });
}

start().catch((err) => {
  console.error(err);
  document.getElementById('loading')!.textContent = 'Failed to load Malfoid: ' + String(err);
});
