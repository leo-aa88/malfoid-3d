// Forest generation tests (pure placement data, no WebGL): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOREST_CONFIG } from '../src/scene/forest/config';
import { clearingAt, generateChunk, SPAWN_CENTRE } from '../src/scene/forest/placement';

const cfg = FOREST_CONFIG;

test('deterministic: the same chunk is identical every time it is generated (revisiting a place)', () => {
  for (const [cx, cz] of [[0, 0], [5, -3], [-40, 27], [312, 1]]) {
    assert.deepEqual(generateChunk(cx, cz, cfg), generateChunk(cx, cz, cfg));
  }
  const other = { ...cfg, seed: cfg.seed + 1 };
  assert.notDeepEqual(generateChunk(3, 3, cfg).trees, generateChunk(3, 3, other).trees);
});

test('every object lies inside its own chunk (no overlaps or gaps at chunk borders)', () => {
  const S = cfg.chunkSize;
  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -3; cz <= 3; cz++) {
      const c = generateChunk(cx, cz, cfg);
      for (const t of c.trees) {
        assert.ok(t.x >= cx * S && t.x < (cx + 1) * S && t.z >= cz * S && t.z < (cz + 1) * S, `tree outside ${cx},${cz}`);
      }
    }
  }
});

test('the spawn clearing is free of trees and big props, and ringed by large trees', () => {
  const S = cfg.chunkSize;
  let ring = 0;
  for (let cx = -1; cx <= 0; cx++) {
    for (let cz = -1; cz <= 0; cz++) {
      const c = generateChunk(cx, cz, cfg);
      for (const t of c.trees) {
        const d = Math.hypot(t.x - SPAWN_CENTRE.x, t.z - SPAWN_CENTRE.z);
        assert.ok(d >= cfg.spawnClearing, `tree at ${d.toFixed(1)} m from spawn`);
        if (d < cfg.spawnClearing + 6) {
          ring++;
          assert.ok(t.scale >= 1.25);
        }
      }
      for (const p of c.props) {
        if (p.kind === 'rock' || p.kind === 'log' || p.kind === 'stump' || p.kind === 'bush') {
          assert.ok(Math.hypot(p.x - SPAWN_CENTRE.x, p.z - SPAWN_CENTRE.z) > cfg.spawnClearing * 0.5);
        }
      }
    }
  }
  assert.ok(ring >= 6, `ring trees: ${ring}`);
  void S;
});

test('the forest has natural clearings and uneven density far from the spawn', () => {
  let clear = 0;
  let n = 0;
  for (let x = 500; x < 2500; x += 8) {
    for (let z = -1000; z < 1000; z += 8) {
      n++;
      if (clearingAt(x, z, cfg) > 0.5) clear++;
    }
  }
  const share = clear / n;
  assert.ok(share > 0.02 && share < 0.25, `clearing share ${share.toFixed(3)}`);
  const counts: number[] = [];
  for (let cx = 20; cx < 40; cx++) counts.push(generateChunk(cx, 7, cfg).trees.length);
  assert.ok(Math.max(...counts) - Math.min(...counts) >= 6, `tree counts ${counts.join(',')}`);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  assert.ok(mean > 8 && mean < 25, `mean trees per chunk ${mean}`);
});
