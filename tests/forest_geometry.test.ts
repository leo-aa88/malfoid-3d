// Forest meshes must face outwards: an inside-out mesh shows its far inner wall through the
// near side (trunks looked transparent). `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { logGeometry, rockGeometry, stumpGeometry, taperedTube } from '../src/scene/forest/geometry';

/** share of triangles whose winding (front face) points away from the shape's axis */
function outwardShare(g: THREE.BufferGeometry, axisPoint: (c: THREE.Vector3) => THREE.Vector3): number {
  const p = g.getAttribute('position');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let out = 0;
  let n = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    if (normal.lengthSq() < 1e-12) continue;
    const centre = a.clone().add(b).add(c).divideScalar(3);
    if (normal.dot(centre.clone().sub(axisPoint(centre))) > 0) out++;
    n++;
  }
  return out / n;
}

test('the tube builder (trunks, branches, roots, logs, stumps) faces outwards', () => {
  const r = () => 0.5;
  // straight, and bent like a trunk
  for (const path of [
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, 6, 0)],
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.6, 3, 0.2), new THREE.Vector3(-0.4, 6, 0.5), new THREE.Vector3(0.3, 9, 0)],
  ]) {
    const g = taperedTube(path, 0.5, 0.1, 8, 10, r, 0, () => [1, 1, 1]);
    const curve = new THREE.CatmullRomCurve3(path);
    const pts = curve.getSpacedPoints(200);
    // compare each face with the nearest point of the centre line
    const share = outwardShare(g, (c) => pts.reduce((best, p) => (p.distanceTo(c) < best.distanceTo(c) ? p : best), pts[0]));
    assert.ok(share > 0.95, `tube: ${(share * 100).toFixed(0)}% outward`);
    g.dispose();
  }
});

test('stumps, logs and rocks face outwards', () => {
  assert.ok(outwardShare(stumpGeometry(), (c) => new THREE.Vector3(0, c.y, 0)) > 0.8, 'stump');
  for (let v = 0; v < 2; v++) assert.ok(outwardShare(logGeometry(v), (c) => new THREE.Vector3(c.x, 0.22, 0)) > 0.75, `log ${v}`);
  for (let v = 0; v < 3; v++) assert.ok(outwardShare(rockGeometry(v), () => new THREE.Vector3(0, 0.18, 0)) > 0.95, `rock ${v}`);
});
