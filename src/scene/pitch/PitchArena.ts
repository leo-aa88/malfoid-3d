import * as THREE from 'three';
import type { Arena, CameraLimit } from '../arena';
import type { EnvironmentLook } from '../SceneManager';
import { PITCH_CONFIG, PitchConfig } from './config';
import { Kit } from './kit';
import { buildStadium } from './structures';
import { clothAtlas, groundExtent, groundTexture } from './textures';
import { buildClouds, buildSky, buildTerrain } from './landscape';
import { buildCastle } from './castle';
import { buildTrees } from './trees';

/** two-step toon ramp, softer than the characters' (a lot of daylight on wood) */
function gradient(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 210, 210, 210, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * The Hogwarts Quidditch Pitch: a finite arena, built once from code (no model files). The
 * fighters stay inside the oval at the foot of the stands (a low barrier marks it); the hoop
 * posts are solid; spells burst on the barrier and the posts. The camera stays inside the
 * stands. Everything is static: a handful of merged meshes and one sun shadow over the stadium,
 * nothing rebuilt per frame.
 */
export class PitchArena implements Arena {
  readonly kind = 'pitch' as const;
  readonly name = 'Quidditch Pitch';
  readonly spawn = new THREE.Vector3(0, 0, 0);
  readonly finite = true;
  readonly group = new THREE.Group();
  readonly cameraLimit: CameraLimit;
  /** the fighters' boundary: an ellipse (half axes, m) */
  readonly boundA: number;
  readonly boundB: number;
  private readonly posts: { x: number; z: number; r: number; h: number }[];
  private readonly walls: THREE.Box3[] = [];
  private readonly postBoxes: THREE.Box3[] = [];

  constructor(scene: THREE.Scene, readonly cfg: PitchConfig = PITCH_CONFIG) {
    this.group.name = 'quidditch_pitch';
    this.group.visible = false;
    scene.add(this.group);
    const grad = gradient();
    const wood = new Kit();
    const cloth = new Kit(true);
    const built = buildStadium(cfg, wood, cloth);
    this.posts = built.posts;
    const solidMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
    const woodMesh = new THREE.Mesh(wood.build()!, solidMat);
    woodMesh.name = 'pitch_structures';
    // the stands and towers shade the grass, each other and the fighters (the sun's shadow
    // covers the stadium here); the cloth too (its alpha cut-outs included)
    woodMesh.castShadow = woodMesh.receiveShadow = true;
    const clothMesh = new THREE.Mesh(cloth.build()!, new THREE.MeshToonMaterial({ map: clothAtlas(), gradientMap: grad,
      alphaTest: 0.5, side: THREE.DoubleSide }));
    clothMesh.name = 'pitch_cloth';
    clothMesh.castShadow = clothMesh.receiveShadow = true;
    // ground: the generated texture over the stadium (shaded by the sun's real shadow)
    const { halfX, halfZ } = groundExtent(cfg);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2 * halfX, 2 * halfZ),
      new THREE.MeshLambertMaterial({ map: groundTexture(cfg) }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'pitch_ground';
    const terrain = new THREE.Mesh(buildTerrain(cfg), new THREE.MeshLambertMaterial({ vertexColors: true }));
    terrain.name = 'pitch_land';
    // the castle: its own mesh (same material), out of the stadium's shadow, so no shadow pass
    const castleKit = new Kit();
    buildCastle(cfg, castleKit);
    const castle = new THREE.Mesh(castleKit.build()!, solidMat);
    castle.name = 'pitch_castle';
    this.group.add(buildSky(cfg), buildClouds(cfg), terrain, ground, woodMesh, clothMesh, castle, buildTrees(cfg, grad));
    // the fighters' oval (inside the barrier), the camera's (inside the stands' foot)
    this.boundA = cfg.fieldHalfLength + cfg.apron - cfg.boundaryMargin;
    this.boundB = cfg.fieldHalfWidth + cfg.apron - cfg.boundaryMargin;
    const camA = this.boundA + 0.4, camB = this.boundB + 0.4;
    this.cameraLimit = {
      inside: (x, z) => (x / camA) ** 2 + (z / camB) ** 2 <= 1,
      clamp: (c, t) => {
        if ((c.x / camA) ** 2 + (c.z / camB) ** 2 <= 1) return;
        // slide the camera in along its line to the target until it is inside (bisection)
        let lo = 0, hi = 1;
        const x0 = c.x, z0 = c.z;
        for (let i = 0; i < 18; i++) {
          const m = (lo + hi) / 2;
          const x = x0 + (t.x - x0) * m, z = z0 + (t.z - z0) * m;
          if ((x / camA) ** 2 + (z / camB) ** 2 <= 1) hi = m;
          else lo = m;
        }
        c.x = x0 + (t.x - x0) * hi;
        c.z = z0 + (t.z - z0) * hi;
        c.y = Math.max(c.y, t.y);
      },
    };
    // spells: thin boxes along the barrier (each a short wall segment) and the hoop posts
    const segs = 96;
    const wa = this.boundA + 0.9, wb = this.boundB + 0.9;           // just outside the fighters' oval
    for (let k = 0; k < segs; k++) {
      const a0 = (k / segs) * Math.PI * 2, a1 = ((k + 1) / segs) * Math.PI * 2;
      const p = new THREE.Vector3(wa * Math.cos(a0), 0, wb * Math.sin(a0));
      const q = new THREE.Vector3(wa * Math.cos(a1), 25, wb * Math.sin(a1));
      this.walls.push(new THREE.Box3().setFromPoints([p, q]));
    }
    for (const p of this.posts) {
      this.postBoxes.push(new THREE.Box3(new THREE.Vector3(p.x - 0.14, 0, p.z - 0.14), new THREE.Vector3(p.x + 0.14, p.h, p.z + 0.14)));
    }
  }

  look(): EnvironmentLook {
    const c = this.cfg;
    return {
      background: c.skyHorizon,
      fog: [c.skyHorizon, c.fogNear, c.fogFar],
      hemi: [c.skyColour, c.groundBounce, c.ambientIntensity],
      key: [c.sunColour, c.sunIntensity],
      keyOffset: c.sunOffset,
      rim: [c.rimColour, c.rimIntensity],
      cameraFar: c.landRadius * 1.1,
      shadow: { centre: [0, 0, 0], halfSize: c.shadowHalfSize, mapSize: c.shadowMapSize, bias: c.shadowBias, normalBias: c.shadowNormalBias },
    };
  }

  setActive(on: boolean): void {
    this.group.visible = on;
  }

  /** keep a fighter inside the oval, and out of the hoop posts */
  resolve(pos: THREE.Vector3, r: number): void {
    const a = this.boundA - r, b = this.boundB - r;
    const e = (pos.x / a) ** 2 + (pos.z / b) ** 2;
    if (e > 1) {
      // back onto the oval (radially: she slides along it)
      const k = 1 / Math.sqrt(e);
      pos.x *= k;
      pos.z *= k;
    }
    for (const p of this.posts) {
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const d = Math.hypot(dx, dz), min = p.r + r;
      if (d < min && d > 1e-6) {
        pos.x = p.x + (dx / d) * min;
        pos.z = p.z + (dz / d) * min;
      }
    }
  }

  fillSolids(out: THREE.Box3[], centres: THREE.Vector3[], range = 30): void {
    out.length = 0;
    const near = (b: THREE.Box3) => centres.some((c) => b.distanceToPoint(c) < range);
    for (const b of this.walls) if (near(b)) out.push(b);
    for (const b of this.postBoxes) if (near(b)) out.push(b);
  }

  update(): void {
    // static: nothing moves
  }

  /** how many triangles and draw calls the pitch costs (debugging) */
  stats(): { meshes: number; triangles: number } {
    let meshes = 0, triangles = 0;
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes++;
      const g = m.geometry;
      triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    });
    return { meshes, triangles: Math.round(triangles) };
  }
}
