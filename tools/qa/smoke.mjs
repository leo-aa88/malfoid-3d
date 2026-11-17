// Boot check for CI: the built game loads, every mode starts and renders, with no page error,
// console error or failed request. Run against `vite preview` (it serves dist/).
// usage: node tools/qa/smoke.mjs [URL] [SCREENSHOT_DIR]
// PW_CHROMIUM=/path/to/chrome overrides the browser Playwright would launch.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const shots = process.argv[3];
const BOOT_TIMEOUT = 180_000;   // ms: six ~19 MB models under software WebGL
const FRAMES_PER_MODE = 20;     // frames each mode must render after it starts
const FRAME_TIMEOUT = 120_000;  // ms to render them (an arena's first frame compiles its shaders)

if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const problems = [];
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });

let step = 'boot';
const fail = async (why) => {
  console.error(`FAIL at ${step}: ${why}`);
  for (const p of problems) console.error(`  ${p}`);
  if (shots) await page.screenshot({ path: `${shots}/fail-${step}.png` }).catch(() => {});
  await browser.close();
  process.exit(1);
};
const check = async () => { if (problems.length) await fail(`${problems.length} problem(s)`); };
let stepStart = Date.now();
const secs = () => `${((Date.now() - stepStart) / 1000).toFixed(1)} s`;
const renders = async () => {
  const from = await page.evaluate(() => window.renderer.info.render.frame);
  await page.waitForFunction((n) => window.renderer.info.render.frame >= n, from + FRAMES_PER_MODE,
    { timeout: FRAME_TIMEOUT, polling: 250 }).catch(() => fail(`fewer than ${FRAMES_PER_MODE} frames rendered`));
  if (shots) await page.screenshot({ path: `${shots}/${step}.png` });
  await check();
};

const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !document.getElementById('loading') || /^Failed/.test(document.getElementById('loading').textContent),
  null, { timeout: BOOT_TIMEOUT, polling: 500 }).catch(() => fail('still loading'));
const loadError = await page.evaluate(() => document.getElementById('loading')?.textContent);
if (loadError) await fail(loadError);
if (!(await page.locator('#mode').isVisible())) await fail('start menu not shown');
console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await renders();

step = 'training';
stepStart = Date.now();
await page.evaluate(() => window.enterMode('training'));
await renders();
if (!(await page.evaluate(() => window.dummy.root.visible))) await fail('dummy not shown');
console.log(`ok training (${secs()})`);

const ids = await page.evaluate(() => Object.keys(window.opponents));
for (const id of ids) {
  step = `practice-${id}`;
  stepStart = Date.now();
  await page.evaluate((who) => window.enterMode('practice', 'normal', who), id);
  await renders();
  const shown = await page.evaluate(() => !!window.arena() && window.opp().char.root.visible);
  if (!shown) await fail(`${id} or her arena not shown`);
  console.log(`ok practice vs ${id} (${secs()})`);
}

step = 'campaign';
stepStart = Date.now();
await page.evaluate(() => window.enterMode('campaign', 'normal'));
await renders();
if (!(await page.evaluate(() => !!window.campaign.run && !!window.arena()))) await fail('campaign run not started');
console.log(`ok campaign (${secs()})`);

step = 'menu';
stepStart = Date.now();
await page.evaluate(() => window.openMenu());
await renders();
if (!(await page.locator('#mode').isVisible())) await fail('menu did not reopen');
console.log(`ok menu (${secs()})`);

await browser.close();
console.log(`smoke passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
