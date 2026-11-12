import './styles/main.css';
import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager';
import { CameraController } from './camera/CameraController';
import { Malfoid } from './character/Malfoid';
import { CharacterController } from './character/CharacterController';

const BASE = import.meta.env.BASE_URL;

async function start(): Promise<void> {
  const sm = new SceneManager(document.getElementById('app')!);
  const cam = new CameraController(sm.camera, sm.renderer.domElement);
  const malfoid = await Malfoid.load(`${BASE}models/malfoid.glb`, `${BASE}models/malfoid.json`);
  sm.scene.add(malfoid.root);
  const input = new CharacterController(malfoid);
  cam.reset(malfoid.position);
  malfoid.resetIdleTimer();          // the countdown starts when she appears
  document.getElementById('reset-camera')!.addEventListener('click', (e) => {
    cam.reset(malfoid.position);
    (e.currentTarget as HTMLButtonElement).blur();     // keep WASD working
  });
  document.getElementById('loading')!.remove();

  const stateEl = document.getElementById('state')!;
  const fpsEl = document.getElementById('fps')!;
  const clock = new THREE.Clock();
  let frames = 0;
  let fpsTime = 0;
  let lastState = '';

  sm.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    input.update();
    malfoid.update(dt);
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
  (window as unknown as { malfoid: Malfoid }).malfoid = malfoid;
}

start().catch((err) => {
  console.error(err);
  document.getElementById('loading')!.textContent = 'Failed to load Malfoid: ' + String(err);
});
