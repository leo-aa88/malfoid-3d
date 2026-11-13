// Forest collision: the shapes match the meshes, bodies can't pass through them (`npm test`)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FOREST_CONFIG } from '../src/scene/forest/config';
import { generateChunk, TRUNK_RADIUS } from '../src/scene/forest/placement';
import { chunkColliders, logLength, pushOut, TRUNK_FOOT, Collider } from '../src/scene/forest/colliders';
import { logGeometry, treeGeometry } from '../src/scene/forest/geometry';

test('the tree collider covers the trunk as built at body height (flare included)', () => {
  for (let v = 0; v < 8; v++) {
    const g = treeGeometry(v, 2);                // same trunk and flare, but no roots to confuse the measure
    const pos = g.getAttribute('position');
    // trunk vertices at 0.3-0.9 m: the ring nearest the axis per height band (roots stick out further)
    let trunk = 0;
    const R = TRUNK_RADIUS[v];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const d = Math.hypot(pos.getX(i), pos.getZ(i));
      if (y > 0.3 && y < 0.9 && d < R * 2.6) trunk = Math.max(trunk, d);
    }
    // the collider matches the trunk within its bark bumps (never much smaller)
    assert.ok(R * TRUNK_FOOT >= trunk * 0.9, `variant ${v}: collider ${(R * TRUNK_FOOT).toFixed(2)} vs trunk ${trunk.toFixed(2)}`);
    g.dispose();
  }
});

test('the log capsule spans the log mesh', () => {
  for (let v = 0; v < 2; v++) {
    const g = logGeometry(v);
    g.computeBoundingBox();
    const len = g.boundingBox!.max.x - g.boundingBox!.min.x;
    assert.ok(Math.abs(len - logLength(v)) < 0.6, `variant ${v}: mesh ${len.toFixed(2)} vs collider ${logLength(v).toFixed(2)}`);
    g.dispose();
  }
});

test('walking straight into a trunk, a rock or a log stops at its surface; sideways it slides past', () => {
  const r = 0.28;
  const shapes: Collider[] = [
    { kind: 'circle', x: 0, z: 0, r: 1.0 },
    { kind: 'capsule', ax: 5, az: -2, bx: 5, bz: 2, r: 0.3 },
  ];
  // straight at the trunk from the left: never closer than r + 1
  let x = -3;
  let z = 0;
  for (let i = 0; i < 200; i++) {
    [x, z] = pushOut(x + 0.05, z, r, shapes);
    assert.ok(Math.hypot(x, z) >= 1 + r - 1e-9);
  }
  // a little off-centre: slides round the trunk and carries on
  x = -3;
  z = 0.2;
  for (let i = 0; i < 200; i++) [x, z] = pushOut(x + 0.05, z, r, shapes);
  assert.ok(x > 1, `slid past: x ${x.toFixed(2)}`);
  // straight at the log: stops at its side
  x = 3;
  z = 0;
  for (let i = 0; i < 200; i++) [x, z] = pushOut(x + 0.05, z, r, shapes);
  assert.ok(x <= 5 - 0.3 - r + 1e-9, `log: x ${x.toFixed(3)}`);
});

test('every chunk has solid trees, and big rocks, stumps and logs are solid; small rocks are not', () => {
  for (const [cx, cz] of [[0, 0], [3, -2], [-11, 7]]) {
    const c = generateChunk(cx, cz, FOREST_CONFIG);
    const cols = chunkColliders(c);
    const circles = cols.filter((k) => k.kind === 'circle').length;
    const caps = cols.filter((k) => k.kind === 'capsule').length;
    const big = c.props.filter((p) => (p.kind === 'rock' && p.scale >= 0.55) || p.kind === 'stump').length;
    assert.equal(circles, c.trees.length + big);
    assert.equal(caps, c.props.filter((p) => p.kind === 'log').length);
  }
  void THREE;
});
