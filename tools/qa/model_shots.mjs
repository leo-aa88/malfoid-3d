// Face shots of a given model build in the real viewer (pose frozen, no blink).
// usage: node model_shots.mjs URL OUTPREFIX [model.glb model.json]
import { chromium } from 'playwright';
const [url, prefix, glb, meta] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 876, height: 1096 } });
if (glb) await page.route('**/models/malfoid.glb', (r) => r.fulfill({ path: glb }));
if (meta) await page.route('**/models/malfoid.json', (r) => r.fulfill({ path: meta }));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 120000 });
await page.addStyleTag({ content: '#hud,#help{display:none!important}' });
await page.evaluate(() => { window.malfoid.debugFreeze(true); window.malfoid.debugFace(null, false); });
const views = { _warm: [[0, 1.39, 1.95], 10], front: [[0, 1.39, 1.95], 10], q: [[1.10, 1.41, 1.62], 10],
  side: [[1.95, 1.39, 0.02], 10] };
for (const [name, [pos, fov]] of Object.entries(views)) {
  await page.evaluate(([p, f]) => { const k = window.cam.controls.object; k.fov = f; k.updateProjectionMatrix();
    k.position.set(...p); window.cam.controls.target.set(0, 1.39, 0); window.cam.controls.update(); }, [pos, fov]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${prefix}_${name}.png` });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${prefix}_${name}.png` });
}
await browser.close();
