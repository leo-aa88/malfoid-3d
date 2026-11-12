import './styles/main.css';
import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager';
import { CameraController } from './camera/CameraController';
import { Malfoid } from './character/Malfoid';
import { CharacterController } from './character/CharacterController';
import { TrainingDummy, DUMMY_RADIUS, Guard } from './combat/TrainingDummy';
import { ComboSystem } from './combat/ComboSystem';
import { CombatHud } from './ui/CombatHud';
import { SpellSystem } from './combat/spells/SpellSystem';
import { ConfringoFx } from './combat/spells/ConfringoFx';
import { CONFRINGO } from './combat/spells/Confringo';

const BASE = import.meta.env.BASE_URL;
const DUMMY_DISTANCE = 0.56;                  // m, centre to centre: in reach of every strike
// at the start it stands at her front-right (screen left as she faces the camera), off the
// path she takes to the right and still inside the auto-facing angle
const DUMMY_START_ANGLE = -1.0;               // rad (+ is her left)
const DUMMY_START_DISTANCE = 0.9;
const MIN_GAP = DUMMY_RADIUS + 0.22;          // she can't walk through it

/** push her out of the dummy (it is fixed to the floor) */
function keepApart(p: THREE.Vector3, dummy: TrainingDummy): void {
  if (dummy.down) return;
  const dx = p.x - dummy.position.x;
  const dz = p.z - dummy.position.z;
  const d = Math.hypot(dx, dz);
  if (d >= MIN_GAP || d < 1e-6) return;
  p.x = dummy.position.x + (dx / d) * MIN_GAP;
  p.z = dummy.position.z + (dz / d) * MIN_GAP;
}

async function start(): Promise<void> {
  const sm = new SceneManager(document.getElementById('app')!);
  const cam = new CameraController(sm.camera, sm.renderer.domElement);
  const malfoid = await Malfoid.load(`${BASE}models/malfoid.glb`, `${BASE}models/malfoid.json`);
  sm.scene.add(malfoid.root);

  // training dummy
  const dummy = new TrainingDummy();
  sm.scene.add(dummy.root);
  const placeDummy = (angle: number, dist: number) => {
    const f = malfoid.facingAngle + angle;
    const p = malfoid.position.clone().add(new THREE.Vector3(Math.sin(f), 0, Math.cos(f)).multiplyScalar(dist));
    dummy.placeAt(p, malfoid.position);
  };
  placeDummy(DUMMY_START_ANGLE, DUMMY_START_DISTANCE);
  const combat = new ComboSystem(malfoid, dummy);
  const hud = new CombatHud(sm.camera, document.getElementById('hud')!);
  combat.onEvent = (e) => hud.handle(e);

  // spells: cast from her right palm at any combat target (the dummy for now)
  const spellFx = new ConfringoFx(sm.scene);
  const spells = new SpellSystem(malfoid, malfoid.rightHand, () => combat.busy, spellFx, { targets: [dummy], groundY: 0 });
  spells.onEvent = (e) => hud.handleSpell(e);

  const input = new CharacterController(malfoid, combat);
  input.onSpell = () => spells.cast(CONFRINGO);
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
    pausedEl.hidden = !p;
  };
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
      combat.update(dt);
      malfoid.update(dt);
      spells.update(dt);                    // after the pose update: the palm is where it is drawn
      keepApart(malfoid.position, dummy);
      dummy.update(dt, malfoid.position);
      hud.update(dt);
    }
    hud.setDummy(dummy.hp, dummy.guard);
    hud.setSpell(CONFRINGO.name, CONFRINGO.key, spells.cooldownLeft(CONFRINGO), CONFRINGO.cooldown);
    spellFx.setView(sm.camera, sm.renderer.domElement.height);
    cam.update(malfoid.position);
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
  Object.assign(window, { malfoid, cam, combat, dummy, spells, spellFx, renderer: sm.renderer, scene: sm.scene, input });
}

start().catch((err) => {
  console.error(err);
  document.getElementById('loading')!.textContent = 'Failed to load Malfoid: ' + String(err);
});
