import * as THREE from 'three';
import type { ForestConfig } from './config';
import { Atmosphere } from './atmosphere';
import {
  bushGeometry, grassGeometry, leafGeometry, logGeometry, mushroomGeometry, rockGeometry, stumpGeometry, treeGeometry,
} from './geometry';
import { ChunkData, clearingAt, generateChunk, PropKind, PROP_VARIANTS, TREE_VARIANTS, TreeInst } from './placement';
import { fbm, smoothstep } from './random';
import { chunkColliders, Collider, pushOut } from './colliders';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/*
 * The streaming forest. Chunks are plain placement data (placement.ts), cached and generated
 * on demand from world coordinates. Rendering uses one InstancedMesh per shape for the whole
 * visible forest, refilled whenever the player enters another chunk; one ground mesh follows
 * the player and is recoloured in world space. Nothing is created or destroyed per frame.
 */

export type AmbienceCue = 'wind' | 'creature' | 'rustle' | 'cue';

const CACHE_LIMIT = 400;          // chunk placements kept for revisiting (small plain objects)
const FADE_NEAR = 1.0;            // blocking trees close to the camera vanish
const FADE_FAR = 0.65;            // further ones are thinned out (ordered dither)
const FADE_NEAR_DIST = 10;        // m from the camera

const LEAF_TINTS = ['#3b2a1c', '#4a3220', '#2f2a1d', '#553724', '#3a3a24', '#4b2622'].map((c) => new THREE.Color(c));

function toonGradient(): THREE.DataTexture {
  const tones = new Uint8Array([135, 135, 135, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(tones, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** dithered see-through for trees between the camera and the fighters (per-instance aFade) */
function addFade(mat: THREE.Material): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      if (vFade > 0.0) {
        // 4 x 4 ordered dither: an even screen-door pattern, no sparkle
        const float B[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
        ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
        if ((B[q.x + q.y * 4] + 0.5) / 16.0 < vFade) discard;
      }`);
  };
  mat.customProgramCacheKey = () => 'forest-fade';
}

interface Slot {
  mesh: THREE.InstancedMesh;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  fade?: THREE.InstancedBufferAttribute;
  /** near trees: the tree behind each instance (for fading) */
  trees?: TreeInst[];
  fadeNow?: Float32Array;
}

export class ForestWorld {
  readonly group = new THREE.Group();
  readonly atmosphere: Atmosphere;
  onAmbience: ((cue: AmbienceCue, at: THREE.Vector3) => void) | null = null;
  /** stats for the HUD / tests */
  readonly stats = { chunks: 0, trees: 0, props: 0, rebuildMs: 0, groundMs: 0, rebuilds: 0, cached: 0 };

  private readonly cache = new Map<string, ChunkData>();
  private readonly colliderCache = new Map<ChunkData, Collider[]>();
  private readonly near: Collider[] = [];
  private readonly slots = new Map<string, Slot>();
  private readonly ground: THREE.Mesh;
  private readonly groundGeo: THREE.PlaneGeometry;
  private centreKey = '';
  private groundKey = '';
  /** ground repaint spread over frames: the next colours are built here, then swapped in */
  private paint: { row: number; cx: number; cz: number; col: Float32Array; t: number } | null = null;
  private borders: THREE.Mesh | null = null;
  private readonly mats: THREE.Material[] = [];
  private readonly envMat: THREE.MeshToonMaterial;
  private readonly treeNearMat: THREE.MeshToonMaterial;
  private readonly gradient = toonGradient();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private ambienceIn = 6;
  private readonly boxPool: THREE.Box3[] = [];
  active = false;

  constructor(readonly cfg: ForestConfig) {
    this.group.name = 'forbidden_woods';
    this.envMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: this.gradient });
    this.treeNearMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: this.gradient });
    if (cfg.fadeBlockingTrees) addFade(this.treeNearMat);
    const leafMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const glowMat = new THREE.MeshBasicMaterial({ color: '#6ff0d2', vertexColors: true });
    this.mats.push(this.envMat, this.treeNearMat, leafMat, glowMat);

    // one slot (shared geometry + InstancedMesh) per shape
    for (let v = 0; v < TREE_VARIANTS; v++) {
      this.addSlot(`tree:${v}:0`, treeGeometry(v, 0), this.treeNearMat, true);
      this.addSlot(`tree:${v}:1`, treeGeometry(v, 1), this.envMat);
      this.addSlot(`tree:${v}:2`, treeGeometry(v, 2), this.envMat);
    }
    const propGeo: Record<PropKind, (v: number) => THREE.BufferGeometry> = {
      rock: rockGeometry, log: logGeometry, stump: () => stumpGeometry(), mushroom: () => mushroomGeometry(),
      glowshroom: () => mushroomGeometry(), grass: grassGeometry, leaf: () => leafGeometry(), bush: bushGeometry,
    };
    for (const kind of Object.keys(PROP_VARIANTS) as PropKind[]) {
      for (let v = 0; v < PROP_VARIANTS[kind]; v++) {
        const mat = kind === 'leaf' ? leafMat : kind === 'glowshroom' ? glowMat : this.envMat;
        this.addSlot(`prop:${kind}:${v}`, propGeo[kind](v), mat);
      }
    }

    // ground: one mesh as big as the streamed area, following the player chunk by chunk
    const span = (cfg.activeRadius * 2 + 1) * cfg.chunkSize;
    const res = Math.round(span / 2);
    this.groundGeo = new THREE.PlaneGeometry(span, span, res, res);
    this.groundGeo.rotateX(-Math.PI / 2);
    this.groundGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.groundGeo.getAttribute('position').count * 3), 3));
    const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mats.push(groundMat);
    this.ground = new THREE.Mesh(this.groundGeo, groundMat);
    this.ground.receiveShadow = true;
    this.ground.frustumCulled = false;
    this.ground.name = 'forest_ground';
    this.group.add(this.ground);

    this.atmosphere = new Atmosphere(cfg);
    this.group.add(this.atmosphere.group);
    this.group.visible = false;
  }

  private addSlot(key: string, geometry: THREE.BufferGeometry, material: THREE.Material, fadeable = false): void {
    const slot: Slot = { mesh: null as unknown as THREE.InstancedMesh, geometry, material };
    if (fadeable) slot.trees = [];
    this.slots.set(key, slot);
    this.allocate(slot, 16);
  }

  /** (re)create a slot's InstancedMesh with room for n instances */
  private allocate(slot: Slot, n: number): void {
    if (slot.mesh) {
      this.group.remove(slot.mesh);
      slot.mesh.dispose();
    }
    const mesh = new THREE.InstancedMesh(slot.geometry, slot.material, n);
    mesh.count = 0;
    mesh.frustumCulled = false;        // instances surround the player: always partly in view
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (slot.trees) {
      slot.fade = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      slot.fade.setUsage(THREE.DynamicDrawUsage);
      slot.geometry.setAttribute('aFade', slot.fade);
      slot.fadeNow = new Float32Array(n);
    }
    slot.mesh = mesh;
    this.group.add(mesh);
  }

  setActive(on: boolean): void {
    this.active = on;
    this.group.visible = on;
    if (on) this.centreKey = this.groundKey = '';       // rebuild for wherever the player is now
  }

  /** a chunk's placements (generated once, then cached; the same every time) */
  chunk(cx: number, cz: number): ChunkData {
    const key = `${cx},${cz}`;
    let c = this.cache.get(key);
    if (c) {
      this.cache.delete(key);                        // most recently used last
      this.cache.set(key, c);
      return c;
    }
    c = generateChunk(cx, cz, this.cfg);
    this.cache.set(key, c);
    if (this.cache.size > CACHE_LIMIT) {
      const old = this.cache.keys().next().value!;
      this.colliderCache.delete(this.cache.get(old)!);
      this.cache.delete(old);
    }
    this.stats.cached = this.cache.size;
    return c;
  }

  /**
   * player: the controlled character (the forest is streamed round her); camera for fading
   * trees that block the view of the fighters.
   */
  update(dt: number, player: THREE.Vector3, fighters: THREE.Vector3[], camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    if (!this.active) return;
    const S = this.cfg.chunkSize;
    const pcx = Math.floor(player.x / S);
    const pcz = Math.floor(player.z / S);
    const key = `${pcx},${pcz}`;
    if (key !== this.centreKey) {
      this.centreKey = key;
      this.rebuild(pcx, pcz);
    }
    if (key !== this.groundKey) {
      this.groundKey = key;
      this.startPaint(pcx, pcz);
    }
    this.stepPaint();
    if (this.cfg.fadeBlockingTrees) this.fade(dt, camera, fighters);
    this.atmosphere.update(dt, player, camera, viewportHeight);
    // ambience hooks (no audio yet): wind, distant creatures, rustling, eerie cues
    this.ambienceIn -= dt;
    if (this.ambienceIn <= 0 && this.onAmbience) {
      const cues: AmbienceCue[] = ['wind', 'wind', 'rustle', 'creature', 'cue'];
      const cue = cues[Math.floor(Math.random() * cues.length)];
      const a = Math.random() * Math.PI * 2;
      this.onAmbience(cue, new THREE.Vector3(player.x + Math.cos(a) * 25, 1, player.z + Math.sin(a) * 25));
      this.ambienceIn = 6 + Math.random() * 14;
    } else if (this.ambienceIn <= 0) {
      this.ambienceIn = 10;
    }
  }

  /** refill every instanced mesh for the chunks round (pcx, pcz) */
  private rebuild(pcx: number, pcz: number): void {
    const t0 = performance.now();
    const R = this.cfg.activeRadius;
    const lists = new Map<string, { inst: TreeInst | ChunkData['props'][number]; tree: boolean }[]>();
    for (const k of this.slots.keys()) lists.set(k, []);
    let trees = 0;
    let props = 0;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        const c = this.chunk(pcx + dx, pcz + dz);
        const lod = ring <= this.cfg.detailRadius ? 0 : ring <= this.cfg.detailRadius + 1 ? 1 : 2;
        for (const t of c.trees) {
          lists.get(`tree:${t.variant}:${lod}`)!.push({ inst: t, tree: true });
          trees++;
        }
        if (ring > this.cfg.propRadius) continue;
        for (const p of c.props) {
          // small props (leaves, grass, plain mushrooms) only in the nearer chunks: in the fog
          // they would cost without showing
          if (ring > this.cfg.propRadius - 1 && (p.kind === 'leaf' || p.kind === 'grass' || p.kind === 'mushroom')) continue;
          lists.get(`prop:${p.kind}:${p.variant}`)!.push({ inst: p, tree: false });
          props++;
        }
      }
    }
    for (const [k, list] of lists) {
      const slot = this.slots.get(k)!;
      if (list.length > slot.mesh.instanceMatrix.count) this.allocate(slot, Math.ceil(list.length * 1.4));
      const mesh = slot.mesh;
      if (slot.trees) slot.trees.length = 0;
      list.forEach(({ inst }, i) => {
        this.p.set(inst.x, 0, inst.z);
        this.q.setFromAxisAngle(this.up, inst.rot);
        this.s.setScalar(inst.scale);
        this.m.compose(this.p, this.q, this.s);
        mesh.setMatrixAt(i, this.m);
        if (slot.trees) {
          slot.trees.push(inst as TreeInst);
          slot.fade!.setX(i, 0);
          slot.fadeNow![i] = 0;
        }
        const tint = (inst as ChunkData['props'][number]).tint;
        if (k.startsWith('prop:leaf')) mesh.setColorAt(i, LEAF_TINTS[Math.floor((tint ?? 0) * LEAF_TINTS.length)]);
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (slot.fade) slot.fade.needsUpdate = true;
    }
    this.stats.chunks = (2 * R + 1) ** 2;
    this.stats.trees = trees;
    this.stats.props = props;
    this.stats.rebuilds++;
    this.stats.rebuildMs = +(performance.now() - t0).toFixed(1);
  }

  /**
   * The ground round the player's chunk is recoloured from world-space noise (no seams). The
   * work is spread over several frames: the old ground still covers 2.5+ chunks round the
   * player meanwhile, then the new one is moved and swapped in at once.
   */
  private startPaint(pcx: number, pcz: number): void {
    const S = this.cfg.chunkSize;
    const n = this.groundGeo.getAttribute('position').count;
    this.paint = { row: 0, cx: (pcx + 0.5) * S, cz: (pcz + 0.5) * S, col: this.paint?.col ?? new Float32Array(n * 3), t: 0 };
    // first ground, or a jump of more than a chunk (entering the woods, a teleport): no old
    // ground under her to show meanwhile, so it is painted at once
    const far = Math.hypot(this.paint.cx - this.ground.position.x, this.paint.cz - this.ground.position.z) > S * 1.5;
    if (!this.ground.userData.painted || far) this.stepPaint(Infinity);
  }

  private stepPaint(budgetRows = 14): void {
    const job = this.paint;
    if (!job) return;
    const t0 = performance.now();
    const pos = this.groundGeo.getAttribute('position');
    const res = Math.round(Math.sqrt(pos.count));            // vertices per row
    const end = Math.min(res, job.row + budgetRows);
    this.paintRows(job.row, end, res, job.cx, job.cz, job.col);
    job.row = end;
    job.t += performance.now() - t0;
    if (job.row >= res) {
      const col = this.groundGeo.getAttribute('color') as THREE.BufferAttribute;
      (col.array as Float32Array).set(job.col);
      col.needsUpdate = true;
      this.ground.position.set(job.cx, 0, job.cz);
      this.ground.userData.painted = true;
      this.stats.groundMs = +job.t.toFixed(1);
      this.paint = null;
    }
  }

  private paintRows(r0: number, r1: number, res: number, cx: number, cz: number, out: Float32Array): void {
    const pos = this.groundGeo.getAttribute('position');
    const seed = this.cfg.seed;
    const soil = new THREE.Color('#29241f');
    const soilLight = new THREE.Color('#3a332b');
    const litter = new THREE.Color('#4d3a28');
    const deadGrass = new THREE.Color('#4a4a38');
    const moss = new THREE.Color('#26331f');
    const damp = new THREE.Color('#1a1816');
    const moonlit = new THREE.Color('#5a6470');
    const c = new THREE.Color();
    for (let i = r0 * res; i < r1 * res; i++) {
      const x = pos.getX(i) + cx;
      const z = pos.getZ(i) + cz;
      c.copy(soil).lerp(soilLight, fbm(x, z, 9, seed + 31, 2));
      c.lerp(litter, smoothstep(0.45, 0.75, fbm(x, z, 5, seed + 37, 3)) * 0.7);
      c.lerp(moss, smoothstep(0.55, 0.8, fbm(x, z, 14, seed + 41, 2)) * 0.8);
      c.lerp(damp, smoothstep(0.62, 0.85, fbm(x, z, 7, seed + 43, 2)) * 0.6);
      // clearings: moonlit, with dead grass and leaf drifts so the open ground isn't flat
      const open = clearingAt(x, z, this.cfg);
      c.lerp(moonlit, open * 0.3);
      c.lerp(deadGrass, open * smoothstep(0.35, 0.7, fbm(x, z, 2.5, seed + 47, 3)) * 0.7);
      c.lerp(litter, open * smoothstep(0.55, 0.8, fbm(x, z, 1.6, seed + 53, 2)) * 0.6);
      out[i * 3] = c.r;
      out[i * 3 + 1] = c.g;
      out[i * 3 + 2] = c.b;
    }
  }

  /** debug: chunk borders drawn on the ground (to check that nothing shows at the seams) */
  showChunkBorders(on: boolean): void {
    if (on && !this.borders) {
      const S = this.cfg.chunkSize;
      const R = this.cfg.activeRadius + 1;
      const pts: number[] = [];
      for (let i = -R; i <= R + 1; i++) {
        pts.push(i * S, 0.03, -R * S, i * S, 0.03, (R + 1) * S, -R * S, 0.03, i * S, (R + 1) * S, 0.03, i * S);
      }
      // thin strips on the ground (1-pixel lines vanish at a distance)
      const strips: THREE.BufferGeometry[] = [];
      for (let i = 0; i < pts.length; i += 6) {
        const [x0, , z0, x1, , z1] = pts.slice(i, i + 6);
        const len = Math.hypot(x1 - x0, z1 - z0);
        const g = new THREE.PlaneGeometry(len, 0.18);
        g.rotateX(-Math.PI / 2);
        if (Math.abs(x1 - x0) < 1e-6) g.rotateY(Math.PI / 2);
        g.translate((x0 + x1) / 2, 0.04, (z0 + z1) / 2);
        strips.push(g);
      }
      const merged = mergeGeometries(strips, false)!;
      strips.forEach((g) => g.dispose());
      this.borders = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: '#ff3a2a', fog: false }));
      this.group.add(this.borders);
    }
    if (this.borders) {
      this.borders.visible = on;
      const S = this.cfg.chunkSize;
      const [cx, cz] = this.centreKey.split(',').map(Number);
      this.borders.position.set((cx || 0) * S, 0, (cz || 0) * S);
    }
  }

  /** trees between the camera and either fighter (or right in front of the lens) dither away */
  private fade(dt: number, camera: THREE.Camera, fighters: THREE.Vector3[]): void {
    const cam = camera.position;
    const k = 1 - Math.exp(-8 * dt);
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const slot = this.slots.get(`tree:${v}:0`)!;
      const trees = slot.trees!;
      let changed = false;
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        const dc = Math.hypot(t.x - cam.x, t.z - cam.z);
        let target = 0;
        if (dc < 22) {
          if (dc < t.radius + 1.6) target = FADE_NEAR;
          for (const f of fighters) {
            // closest point of the camera->fighter segment (on the ground plane) to the trunk
            const sx = f.x - cam.x;
            const sz = f.z - cam.z;
            const len2 = sx * sx + sz * sz;
            if (len2 < 1e-6) continue;
            const u = ((t.x - cam.x) * sx + (t.z - cam.z) * sz) / len2;
            if (u <= 0 || u >= 0.97) continue;
            const d = Math.hypot(cam.x + sx * u - t.x, cam.z + sz * u - t.z);
            if (d < t.radius + 1.2) target = Math.max(target, dc < FADE_NEAR_DIST ? FADE_NEAR : FADE_FAR);
          }
        }
        const now = slot.fadeNow![i];
        const next = Math.abs(target - now) < 0.01 ? target : now + (target - now) * k;
        if (next !== now) {
          slot.fadeNow![i] = next;
          slot.fade!.setX(i, next);
          changed = true;
        }
      }
      if (changed) slot.fade!.needsUpdate = true;
    }
  }

  /** a chunk's solid shapes: tree feet, big rocks, stumps, logs (cached with the chunk) */
  colliders(cx: number, cz: number): Collider[] {
    const c = this.chunk(cx, cz);
    let list = this.colliderCache.get(c);
    if (!list) {
      list = chunkColliders(c);
      this.colliderCache.set(c, list);
    }
    return list;
  }

  /**
   * Push a body (feet at pos, radius r) out of trunks, big rocks, stumps and logs; it slides
   * round them. Chunks are generated on demand, so a fighter far from the player still collides.
   */
  resolve(pos: THREE.Vector3, r: number): void {
    if (!this.active || !this.cfg.collisionEnabled) return;
    const S = this.cfg.chunkSize;
    const cx = Math.floor(pos.x / S);
    const cz = Math.floor(pos.z / S);
    const near = this.near;
    near.length = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const c of this.colliders(cx + dx, cz + dz)) {
          // only shapes within reach of this body
          const px = c.kind === 'circle' ? c.x : (c.ax + c.bx) / 2;
          const pz = c.kind === 'circle' ? c.z : (c.az + c.bz) / 2;
          const reach = c.kind === 'circle' ? c.r : Math.hypot(c.bx - c.ax, c.bz - c.az) / 2 + c.r;
          if (Math.abs(px - pos.x) < reach + r + 0.5 && Math.abs(pz - pos.z) < reach + r + 0.5) near.push(c);
        }
      }
    }
    const [x, z] = pushOut(pos.x, pos.z, r, near);
    pos.x = x;
    pos.z = z;
  }

  /** trunks near the fighters as boxes the spells can hit (filled into out, reused) */
  fillSolids(out: THREE.Box3[], centres: THREE.Vector3[], range = 26): void {
    out.length = 0;
    if (!this.active || !this.cfg.spellsHitTrees) return;
    const S = this.cfg.chunkSize;
    const seen = new Set<TreeInst>();
    for (const c of centres) {
      const cx = Math.floor(c.x / S);
      const cz = Math.floor(c.z / S);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          for (const t of this.chunk(cx + dx, cz + dz).trees) {
            if (seen.has(t) || Math.hypot(t.x - c.x, t.z - c.z) > range) continue;
            seen.add(t);
            const b = this.boxPool[out.length] ?? (this.boxPool[out.length] = new THREE.Box3());
            const r = t.radius * 1.5;                  // the trunk at chest height (flare included)
            b.min.set(t.x - r, 0, t.z - r);
            b.max.set(t.x + r, 7, t.z + r);
            out.push(b);
          }
        }
      }
    }
  }

  /** no trunk within clear m of (x, z) (for placing fighters) */
  isClear(x: number, z: number, clear: number): boolean {
    const S = this.cfg.chunkSize;
    const cx = Math.floor(x / S);
    const cz = Math.floor(z / S);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const c of this.colliders(cx + dx, cz + dz)) {
          const [px, pz] = pushOut(x, z, clear, [c]);
          if (px !== x || pz !== z) return false;
        }
      }
    }
    return true;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const s of this.slots.values()) {
      s.mesh.dispose();
      s.geometry.dispose();
    }
    this.groundGeo.dispose();
    for (const m of this.mats) m.dispose();
    this.gradient.dispose();
    this.atmosphere.dispose();
  }
}
