// Batch of face shots in one viewer session.
// usage: node face_batch.mjs URL OUTPREFIX sets.json [view]
//   sets.json: [{"name": "...", "weights": {...}}]  ('weights': null = the model's own)
import { chromium } from 'playwright';
import fs from 'fs';
const [url, prefix, setsFile, view = 'front'] = process.argv.slice(2);
const sets = JSON.parse(fs.readFileSync(setsFile, 'utf8'));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: view === 'eyes' ? { width: 1000, height: 420 } : { width: 876, height: 1096 } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 120000 });
await page.addStyleTag({ content: '#hud,#help{display:none!important}' });
// camera centred on the eye line, framed like the atlas front view
const cams = { front: [0, 1.39, 1.95], eyes: [0, 1.385, 1.95], q: [1.30, 1.41, 1.45], side: [1.95, 1.39, 0.02] };
const fovs = { front: 10, eyes: 4.2, q: 10, side: 10 };
const tgtY = { front: 1.39, eyes: 1.385, q: 1.39, side: 1.39 };
await page.evaluate(([c, f, y]) => { const k = window.cam.controls.object; k.fov = f; k.updateProjectionMatrix();
  k.position.set(...c); window.cam.controls.target.set(0, y, 0); window.cam.controls.update(); }, [cams[view], fovs[view], tgtY[view]]);
await page.evaluate(() => window.malfoid.debugFreeze(true));
// warm-up: let shaders compile and a few frames render before the first shot
await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n > 30 ? r() : requestAnimationFrame(f)); f(); }));
// the very first shot of a session is stale in the headless compositor: take one and discard it
sets.unshift({ name: '_warmup', weights: sets[0].weights });
for (const s of sets) {
  if (s.view) {                          // per-shot camera (one browser session for all views)
    await page.evaluate(([c, f, y]) => { const k = window.cam.controls.object; k.fov = f; k.updateProjectionMatrix();
      k.position.set(...c); window.cam.controls.target.set(0, y, 0); window.cam.controls.update(); },
      [cams[s.view], fovs[s.view], tgtY[s.view]]);
  }
  await page.evaluate((w) => { window.malfoid.debugFace(w, false); window.malfoid.resetIdleTimer(); }, s.weights);
  // wait until at least 3 frames have been drawn with the new weights
  // the headless compositor lags: wait, take a throw-away shot, wait, then the real one
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${prefix}_${s.name}.png` });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${prefix}_${s.name}.png` });
}
await browser.close();
