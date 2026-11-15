// The duel camera against an arena's floor (CameraLimit.minY): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// a fake clock (the controller times itself with performance.now) and a fake canvas for OrbitControls
let now = 0;
performance.now = () => now;
const dom = {
  style: {}, clientWidth: 960, clientHeight: 540,
  addEventListener() {}, removeEventListener() {}, getRootNode() { return dom; },
  ownerDocument: { addEventListener() {}, removeEventListener() {} },
} as unknown as HTMLElement;

const { CameraController } = await import('../src/camera/CameraController');

test('a floor under the duel camera lifts it for the frame only: a moment pulled in close doesn\'t leave the view looking straight down (between the Great Hall\'s tables it did, for good)', () => {
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);
  const cam = new CameraController(camera, dom);
  const a = new THREE.Vector3(-2, 0, 0), b = new THREE.Vector3(2, 0, 0);
  let tight = false;
  cam.limit = {
    inside: () => true,
    // a moment with no room: pulled in to 0.2 m from the target (the old hall clamp did this)
    clamp: (c, t) => {
      if (!tight) return;
      const h = Math.hypot(c.x - t.x, c.z - t.z);
      if (h > 0.2) { c.x = t.x + ((c.x - t.x) * 0.2) / h; c.z = t.z + ((c.z - t.z) * 0.2) / h; }
    },
    minY: () => 1.9,
  };
  const pitch = () => {
    const t = cam.controls.target;
    return Math.atan2(camera.position.y - t.y, Math.hypot(camera.position.x - t.x, camera.position.z - t.z));
  };
  const run = (frames: number) => {
    for (let i = 0; i < frames; i++) {
      now += 1000 / 60;
      cam.update(a, { heading: 0, speed: 0, other: b });
    }
  };
  cam.frame(a, b);
  run(120);
  const before = pitch(), y = camera.position.y;
  assert.ok(Math.abs(y - 1.9) < 0.05, `held up by the floor: y ${y.toFixed(2)}`);
  tight = true;
  run(30);
  assert.ok(pitch() > 1.2, 'pulled in, it looks steeply down');
  tight = false;
  run(300);
  assert.ok(Math.abs(pitch() - before) < 0.05, `back to its view: ${before.toFixed(2)} -> ${pitch().toFixed(2)} rad`);
  assert.ok(Math.abs(camera.position.y - y) < 0.1, `back down: y ${camera.position.y.toFixed(2)}`);
});
