// Visual regression shot of Malfoid's face in the real Three.js viewer.
// usage: node face_shot.mjs URL OUT.png [weights.json|-] [view]
//   weights.json: resting shape-key weights to apply ('-' = the model's own)
//   view: front (default) | q | side
import { chromium } from 'playwright';
import fs from 'fs';
const [url, out, wfile, view = 'front'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 876, height: 1096 } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 120000 });
await page.addStyleTag({ content: '#hud,#help{display:none!important}' });
const weights = wfile && wfile !== '-' ? JSON.parse(fs.readFileSync(wfile, 'utf8')) : null;
await page.evaluate((w) => { window.malfoid.debugFace(w, false); window.malfoid.resetIdleTimer(); }, weights);
const cams = { front: [0, 1.41, 1.95], q: [1.30, 1.43, 1.45], side: [1.95, 1.41, 0.02] };
await page.evaluate((c) => { const k = window.cam.controls.object; k.fov = 10; k.updateProjectionMatrix();
  k.position.set(...c); window.cam.controls.target.set(0, 1.41, 0); window.cam.controls.update(); }, cams[view]);
await page.waitForTimeout(1200);
await page.screenshot({ path: out });
await browser.close();
