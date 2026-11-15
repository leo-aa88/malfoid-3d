import * as THREE from 'three';
import type { Arena, CameraLimit } from '../arena';
import type { EnvironmentLook } from '../SceneManager';
import { GREENHOUSE_CONFIG, GreenhouseConfig } from './config';
import { Kit } from '../pitch/kit';
import { PITCH_CONFIG, PitchConfig } from '../pitch/config';
import { buildClouds, buildSky, buildTerrain } from '../pitch/landscape';
import { buildCastle } from '../pitch/castle';
import { buildTrees } from '../pitch/trees';
import { clothAtlas, clothCell, groundExtent, outerGrass } from '../pitch/textures';
import { hang } from '../pitch/structures';
import { fbm, rng } from '../forest/random';
import { buildFrame, buildGlass, floorTexture } from './structure';
import { Planting } from './plants';

/** two-step toon ramp, soft (diffuse daylight under glass) */
function gradient(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([160, 160, 160, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** the lawn: grass colour with a little mottling, repeated */
function lawnTexture(base: THREE.Color): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const col = new THREE.Color();
  for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 4) {
    col.copy(base).multiplyScalar(0.9 + 0.2 * fbm(x, y, 24, 5, 2));
    g.fillStyle = `#${col.getHexString()}`;
    g.fillRect(x, y, 4, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(20, 14);
  return t;
}

/** a soft round dot for the motes */
function dot(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/**
 * The Herbology greenhouse: a finite arena, built once from code (no model files). The
 * fighters stay on the stone floor between the potting benches and the end planters; spells
 * burst on the plants (and the glass beyond). The camera stays on the floor too, never behind
 * the plants. Outside, the Hogwarts grounds (the pitch's landscape code, recentred on the
 * greenhouse). Static apart from motes drifting in the sunlight.
 */
export class GreenhouseArena implements Arena {
  readonly kind = 'greenhouse' as const;
  readonly name = 'Herbology Greenhouse';
  readonly spawn = new THREE.Vector3(0, 0, 0);
  readonly finite = true;
  readonly group = new THREE.Group();
  readonly cameraLimit: CameraLimit;
  /** the fighters' floor: |x| <= boundX, |z| <= boundZ (m), and the path to the door:
   *  boundX <= x <= doorX, |z| <= doorZ */
  readonly boundX: number;
  readonly boundZ: number;
  readonly doorX: number;
  readonly doorZ: number;
  private readonly solids: THREE.Box3[] = [];
  private readonly motes: THREE.Points;
  private readonly moteBase: Float32Array;
  private readonly moteSeed: Float32Array;
  private time = 0;

  constructor(scene: THREE.Scene, readonly cfg: GreenhouseConfig = GREENHOUSE_CONFIG) {
    this.group.name = 'greenhouse';
    this.group.visible = false;
    scene.add(this.group);
    const L = cfg.halfLength, W = cfg.halfWidth;
    const grad = gradient();

    // --- the house: frame and plinth, benches and pots (one mesh), leaves (one mesh), glass
    const solid = new Kit();
    const fine = new Kit();
    const leafKit = new Kit();
    buildFrame(cfg, solid, fine);
    const plants = new Planting(cfg, solid, leafKit);
    const front = W - cfg.benchDepth;
    const px = L - cfg.planterDepth;                              // the planters' inner face
    const bays = Math.round((2 * L) / cfg.bay), step = (2 * L) / bays;
    for (const s of [-1, 1]) plants.bench(-px + 0.1, px - 0.1, s * front, s * (W - 0.05));
    // the planters: the west one across the gable, the east one in two beds either side of the
    // path to the doorway
    const D = cfg.doorPath;
    plants.planter(-(L - 0.02), -px, -(W - 0.05), W - 0.05);
    plants.planter(L - 0.02, px, -(W - 0.05), -D, 'z1');
    plants.planter(L - 0.02, px, D, W - 0.05, 'z0');
    const v = { n: cfg.baskets };
    for (const s of [-1, 1]) for (let i = 0; i < v.n; i++) {
      const x = -px + 1.5 + ((2 * px - 3) * (i + 0.5 * (s > 0 ? 1 : 0))) / v.n;
      plants.basket(x, s * W * 0.5, 2.75 + (i % 2) * 0.25);
    }
    for (let i = 1; i < bays; i += cfg.ivyEvery) {
      const x = -L + (i * 2 * L) / bays;
      for (const s of [-1, 1]) plants.ivy(x, s * (W - 0.08), cfg.benchHeight + 0.1, cfg.eaves - 0.2 - (i % 2) * 0.8, s > 0 ? Math.PI : 0);
    }
    // Hufflepuff banners: one on each gable (the east one above the doorway), a few along the walls
    const cloth = new Kit(true);
    const cell = clothCell('hufflepuff', 'banner');
    for (const s of [-1, 1]) hang(cloth, new THREE.Vector3(s * (L - 0.12), cfg.eaves + 2.2, 0), 1.7, 3.6, new THREE.Vector3(-s, 0, 0), cell);
    for (const s of [-1, 1]) for (let i = 0; i < cfg.wallBanners; i++) {
      const x = (i - (cfg.wallBanners - 1) / 2) * ((2 * px) / cfg.wallBanners) + step / 2;
      hang(cloth, new THREE.Vector3(x, cfg.eaves - 0.1, s * (W - 0.1)), 1.0, 1.7, new THREE.Vector3(0, 0, -s), cell);
    }
    const solidMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
    const house = new THREE.Mesh(solid.build()!, solidMat);
    house.name = 'greenhouse_structure';
    house.castShadow = house.receiveShadow = true;
    const leaves = new THREE.Mesh(leafKit.build()!, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad, side: THREE.DoubleSide }));
    leaves.name = 'greenhouse_plants';
    leaves.castShadow = leaves.receiveShadow = true;
    const banners = new THREE.Mesh(cloth.build()!, new THREE.MeshToonMaterial({ map: clothAtlas(), gradientMap: grad, alphaTest: 0.5,
      side: THREE.DoubleSide }));
    banners.name = 'greenhouse_banners';
    banners.castShadow = banners.receiveShadow = true;
    const bars = new THREE.Mesh(fine.build()!, solidMat);
    bars.name = 'greenhouse_glazing_bars';
    bars.receiveShadow = true;
    const glass = buildGlass(cfg);

    // --- the floor, a gravel path round the house, the lawn up to the land
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * L, 2 * W), new THREE.MeshLambertMaterial({ map: floorTexture(cfg) }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    floor.receiveShadow = true;
    floor.name = 'greenhouse_floor';
    // the grounds outside: the pitch's landscape (its flat middle, where the stadium would be, is
    // a lawn round the greenhouse; the hills, trees and castle beyond)
    const land: PitchConfig = { ...PITCH_CONFIG, seed: cfg.seed, castleBearing: cfg.castleBearing, castleDistance: cfg.castleDistance,
      trees: cfg.trees, hillHeight: cfg.hillHeight, skyTop: cfg.skyTop, skyHorizon: cfg.skyHorizon };
    const { halfX, halfZ } = groundExtent(land);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(2 * halfX + 2, 2 * halfZ + 2), new THREE.MeshLambertMaterial({ map: lawnTexture(outerGrass(land)) }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.02;
    lawn.receiveShadow = true;
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2 * L + 3.2, 2 * W + 3.2), new THREE.MeshLambertMaterial({ color: '#9d937d' }));
    path.rotation.x = -Math.PI / 2;
    path.position.y = -0.01;
    path.receiveShadow = true;
    const terrain = new THREE.Mesh(buildTerrain(land), new THREE.MeshLambertMaterial({ vertexColors: true }));
    terrain.name = 'greenhouse_land';
    const castleKit = new Kit();
    buildCastle(land, castleKit);
    const castle = new THREE.Mesh(castleKit.build()!, solidMat);
    castle.name = 'greenhouse_castle';

    // --- motes: pollen and dust drifting in the light (a few hundred points)
    const rand = rng(cfg.seed * 5 + 9);
    this.moteBase = new Float32Array(cfg.motes * 3);
    this.moteSeed = new Float32Array(cfg.motes);
    for (let i = 0; i < cfg.motes; i++) {
      this.moteBase.set([(rand() * 2 - 1) * (L - 1), 0.3 + rand() * (cfg.eaves + 1), (rand() * 2 - 1) * (W - 1)], i * 3);
      this.moteSeed[i] = rand() * 100;
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(this.moteBase.slice(), 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: cfg.moteColour, map: dot(), size: 0.045, transparent: true,
      opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes.name = 'greenhouse_motes';
    this.motes.frustumCulled = false;

    this.group.add(buildSky(land), buildClouds(land), terrain, lawn, path, castle, buildTrees(land, grad), floor, house, bars, leaves, banners, ...glass, this.motes);

    // --- the fighters' floor and the camera's (inside the benches and the planters)
    this.boundX = px - cfg.boundaryMargin;
    this.boundZ = front - cfg.boundaryMargin;
    this.doorX = L - cfg.boundaryMargin;
    this.doorZ = cfg.doorPath - cfg.boundaryMargin;
    const cx = px - cfg.cameraMargin, cz = front - cfg.cameraMargin;
    const inside = (x: number, z: number) => Math.abs(x) <= cx && Math.abs(z) <= cz;
    this.cameraLimit = {
      inside,
      clamp: (c, t) => {
        if (inside(c.x, c.z)) return;
        let lo = 0, hi = 1;
        const x0 = c.x, z0 = c.z;
        for (let i = 0; i < 18; i++) {
          const m = (lo + hi) / 2;
          if (inside(x0 + (t.x - x0) * m, z0 + (t.z - z0) * m)) hi = m;
          else lo = m;
        }
        c.x = x0 + (t.x - x0) * hi;
        c.z = z0 + (t.z - z0) * hi;
        c.y = Math.max(c.y, t.y);
      },
    };
    // spells: the plants on the benches and in the planters, and the glass beyond
    const H = cfg.plantSolidHeight;
    for (const s of [-1, 1]) {
      for (let x = -px; x < px - 1e-6; x += 4) {
        this.solids.push(new THREE.Box3(new THREE.Vector3(x, 0, Math.min(s * front, s * W)), new THREE.Vector3(Math.min(px, x + 4), H, Math.max(s * front, s * W))));
      }
      this.solids.push(new THREE.Box3(new THREE.Vector3(-L, 0, s > 0 ? W : -W - 0.3), new THREE.Vector3(L, 8, s > 0 ? W + 0.3 : -W)));
    }
    // the planters (the east one in two beds either side of the path to the door) and the gables
    this.solids.push(new THREE.Box3(new THREE.Vector3(-L, 0, -W), new THREE.Vector3(-px, 4, W)));
    for (const s of [-1, 1]) {
      this.solids.push(new THREE.Box3(new THREE.Vector3(px, 0, Math.min(s * D, s * W)), new THREE.Vector3(L, 4, Math.max(s * D, s * W))));
      this.solids.push(new THREE.Box3(new THREE.Vector3(s > 0 ? L : -L - 0.3, 0, -W), new THREE.Vector3(s > 0 ? L + 0.3 : -L, 8, W)));
    }
  }

  look(): EnvironmentLook {
    const c = this.cfg;
    return {
      background: c.skyHorizon,
      fog: [c.hazeColour, c.fogNear, c.fogFar],
      hemi: [c.skyColour, c.groundBounce, c.ambientIntensity],
      key: [c.sunColour, c.sunIntensity],
      keyOffset: c.sunOffset,
      rim: [c.rimColour, c.rimIntensity],
      cameraFar: PITCH_CONFIG.landRadius * 1.1,
      shadow: { centre: [0, 0, 0], halfSize: c.shadowHalfSize, mapSize: c.shadowMapSize, bias: c.shadowBias, normalBias: c.shadowNormalBias },
    };
  }

  setActive(on: boolean): void {
    this.group.visible = on;
  }

  /** keep a fighter on the floor between the benches and the planters, or on the path to the
   *  door (whichever is nearer when outside both) */
  resolve(pos: THREE.Vector3, r: number): void {
    const bx = this.boundX - r, bz = this.boundZ - r;
    const fx = Math.max(-bx, Math.min(bx, pos.x)), fz = Math.max(-bz, Math.min(bz, pos.z));
    const dz = Math.max(0, this.doorZ - r);
    const px = Math.max(bx, Math.min(this.doorX - r, pos.x)), pz = Math.max(-dz, Math.min(dz, pos.z));
    if ((fx - pos.x) ** 2 + (fz - pos.z) ** 2 <= (px - pos.x) ** 2 + (pz - pos.z) ** 2) pos.set(fx, pos.y, fz);
    else pos.set(px, pos.y, pz);
  }

  fillSolids(out: THREE.Box3[], centres: THREE.Vector3[], range = 30): void {
    out.length = 0;
    for (const b of this.solids) if (centres.some((c) => b.distanceToPoint(c) < range)) out.push(b);
  }

  /** the motes drift (a slow wander round where each started) */
  update(dt: number): void {
    if (!this.group.visible) return;
    this.time += dt;
    const p = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = p.array as Float32Array, b = this.moteBase, s = this.moteSeed, t = this.time;
    for (let i = 0; i < s.length; i++) {
      const k = s[i];
      a[i * 3] = b[i * 3] + Math.sin(t * 0.13 + k) * 0.6;
      a[i * 3 + 1] = b[i * 3 + 1] + Math.sin(t * 0.21 + k * 1.7) * 0.35;
      a[i * 3 + 2] = b[i * 3 + 2] + Math.cos(t * 0.11 + k * 0.6) * 0.6;
    }
    p.needsUpdate = true;
  }
}
