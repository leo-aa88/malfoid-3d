import * as THREE from 'three';
import type { Arena, CameraLimit } from '../arena';
import type { EnvironmentLook } from '../SceneManager';
import { GREATHALL_CONFIG, GreatHallConfig } from './config';
import { Kit, jitter } from '../pitch/kit';
import { clothAtlas, clothCell } from '../pitch/textures';
import { hang } from '../pitch/structures';
import { rng } from '../forest/random';
import { floorTexture, skyTexture } from './textures';
import { plateGeometry } from '../../combat/spells/Plates';

/** two-step toon ramp, soft (candlelight) */
function gradient(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 210, 210, 210, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** a soft round glow (the candle flames) */
function glow(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** a goblet (lathe): foot, stem, bowl; ~17 cm tall */
function gobletGeometry(): THREE.LatheGeometry {
  const prof: [number, number][] = [[0, 0], [0.035, 0], [0.036, 0.006], [0.012, 0.014], [0.009, 0.06], [0.016, 0.075],
    [0.036, 0.11], [0.04, 0.165], [0.036, 0.168], [0.0, 0.14]];
  return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 8);
}

/** a jug (lathe) ~30 cm tall */
function jugGeometry(): THREE.LatheGeometry {
  const prof: [number, number][] = [[0, 0], [0.06, 0], [0.08, 0.06], [0.085, 0.14], [0.06, 0.22], [0.045, 0.27], [0.055, 0.3], [0, 0.29]];
  return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 10);
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type Rect = { x0: number; x1: number; z0: number; z1: number };

/**
 * The Great Hall: a finite arena, built once from code (no model files). The fighters walk the
 * whole floor, round the house tables and their benches (the duel starts in the wide central
 * aisle); spells fly over the tables and burst on the walls, the benches, the dais and the
 * staff table. The tables are set with plates: Hermione's ammunition (takePlates / restock).
 * Static apart from the floating candles.
 */
export class GreatHallArena implements Arena {
  readonly kind = 'greathall' as const;
  readonly name = 'The Great Hall';
  readonly spawn = new THREE.Vector3(0, 0, 0);
  readonly finite = true;
  readonly group = new THREE.Group();
  readonly cameraLimit: CameraLimit;
  private readonly solids: THREE.Box3[] = [];
  /** what the fighters walk round: tables with their benches, the dais (x/z rectangles) */
  private readonly blockers: Rect[] = [];
  private readonly candles: THREE.InstancedMesh;
  private readonly flames: THREE.Points;
  private readonly candleBase: { x: number; y: number; z: number; k: number }[] = [];
  /** the plates on the tables: one instanced mesh; a plate Hermione took is hidden until restock() */
  private readonly plates: THREE.InstancedMesh;
  private readonly placeAt: THREE.Vector3[] = [];
  private readonly taken: boolean[] = [];
  private readonly m = new THREE.Matrix4();
  private time = 0;

  constructor(scene: THREE.Scene, readonly cfg: GreatHallConfig = GREATHALL_CONFIG) {
    this.group.name = 'greathall';
    this.group.visible = false;
    scene.add(this.group);
    const grad = gradient();
    const L = cfg.halfLength, W = cfg.halfWidth, H = cfg.wallHeight;
    const rand = rng(cfg.seed);
    const solid = new Kit();              // walls, pillars, furniture, gold: one mesh
    const fine = new Kit();               // window leading, small things (no shadow)
    const cloth = new Kit(true);          // banners (the pitch's cloth atlas)

    // --- the floor
    const ft = floorTexture(cfg);
    ft.repeat.set((2 * L) / 4.8, (2 * W) / 4.8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * L, 2 * W), new THREE.MeshLambertMaterial({ map: ft }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'greathall_floor';

    // --- the long walls: pillars every bay, a tall pointed window in each bay between them
    const glassGeos: THREE.BufferGeometry[] = [];
    const bays = Math.round((2 * L) / cfg.bay);
    const step = (2 * L) / bays;
    const win = cfg.window;
    const wallT = 0.6;
    for (const s of [-1, 1]) {
      const z = s * (W + wallT / 2);
      solid.box(0, win.sill / 2, z, 2 * L, win.sill, wallT, cfg.wallColour);                     // below the sills
      solid.box(0, (win.top + H) / 2 + 0.3, z, 2 * L, H - win.top + 0.6, wallT, cfg.wallColour);  // above the arches
      for (let i = 0; i < bays; i++) {
        const xc = -L + (i + 0.5) * step;
        // the wall either side of the window, up to the arch
        const side = (step - win.width) / 2;
        for (const k of [-1, 1]) solid.box(xc + k * (win.width / 2 + side / 2), (win.sill + win.top) / 2, z, side, win.top - win.sill, wallT, cfg.wallColour);
        // the window: a pointed arch of dark glass with lead lines
        const spring = win.top - win.width * 0.55;
        const shape = new THREE.Shape();
        shape.moveTo(-win.width / 2, win.sill);
        shape.lineTo(win.width / 2, win.sill);
        shape.lineTo(win.width / 2, spring);
        shape.quadraticCurveTo(win.width / 2, win.top - 0.25, 0, win.top);
        shape.quadraticCurveTo(-win.width / 2, win.top - 0.25, -win.width / 2, spring);
        shape.lineTo(-win.width / 2, win.sill);
        const g = new THREE.ShapeGeometry(shape, 6);
        g.applyMatrix4(new THREE.Matrix4().makeRotationY(s > 0 ? Math.PI : 0).setPosition(xc, 0, s * (W + 0.05)));
        glassGeos.push(g);
        const zf = s * (W - 0.02);
        for (let k = 1; k < 3; k++) fine.beam(V(xc - win.width / 2 + (k * win.width) / 3, win.sill, zf), V(xc - win.width / 2 + (k * win.width) / 3, spring, zf), 0.04, 0.04, cfg.leadColour);
        for (let y = win.sill + 1.1; y < spring; y += 1.1) fine.beam(V(xc - win.width / 2, y, zf), V(xc + win.width / 2, y, zf), 0.04, 0.04, cfg.leadColour);
        solid.box(xc, win.sill - 0.05, s * (W - 0.12), win.width + 0.2, 0.12, 0.3, cfg.wallDark);    // the sill
      }
      // the pillars (and the wall's top moulding)
      for (let i = 0; i <= bays; i++) {
        const x = -L + i * step;
        solid.box(x, H / 2, s * (W - 0.2), cfg.pillar, H, 0.5, jitter(cfg.wallDark, rand, 0.05));
        solid.box(x, 0.3, s * (W - 0.25), cfg.pillar + 0.2, 0.6, 0.6, cfg.wallDark);                    // its base
      }
      solid.box(0, H - 0.4, s * (W - 0.15), 2 * L, 0.5, 0.4, cfg.wallDark);
      this.solids.push(new THREE.Box3(V(-L - 1, 0, s > 0 ? W - 0.45 : -W - 1), V(L + 1, 20, s > 0 ? W + 1 : -W + 0.45)));
    }
    // --- the end walls: the doors (-x), a great window behind the high table (+x)
    const D = cfg.doors;
    solid.box(-L - wallT / 2, H / 2, -(W + D.width / 2) / 2 - D.width / 4, wallT, H, W - D.width / 2, cfg.wallColour);
    solid.box(-L - wallT / 2, H / 2, (W + D.width / 2) / 2 + D.width / 4, wallT, H, W - D.width / 2, cfg.wallColour);
    solid.box(-L - wallT / 2, (D.height + H) / 2, 0, wallT, H - D.height, D.width, cfg.wallColour);
    for (const k of [-1, 1]) {
      solid.box(-L + 0.02, D.height / 2, (k * D.width) / 4, 0.12, D.height, D.width / 2 - 0.04, cfg.woodDark);    // a door leaf
      for (const y of [1.2, 3.6, 6.0]) solid.box(-L + 0.1, y, (k * D.width) / 4, 0.04, 0.12, D.width / 2 - 0.2, '#2c2c30');
      solid.box(-L + 0.14, 3.6, k * 0.35, 0.08, 0.3, 0.08, cfg.goldColour);     // the handles
    }
    solid.box(-L + 0.05, D.height + 0.2, 0, 0.3, 0.4, D.width + 0.6, cfg.wallDark);                // the lintel
    solid.box(L + wallT / 2, H / 2, 0, wallT, H, 2 * W, cfg.wallColour);
    {
      const gw = 5.0, gs = 4.0, gt = 12.0;
      const shape = new THREE.Shape();
      shape.moveTo(-gw / 2, gs);
      shape.lineTo(gw / 2, gs);
      shape.lineTo(gw / 2, gt - 2.2);
      shape.quadraticCurveTo(gw / 2, gt - 0.6, 0, gt);
      shape.quadraticCurveTo(-gw / 2, gt - 0.6, -gw / 2, gt - 2.2);
      shape.lineTo(-gw / 2, gs);
      const g = new THREE.ShapeGeometry(shape, 8);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(L - 0.05, 0, 0));
      glassGeos.push(g);
      for (let k = -2; k <= 2; k++) fine.beam(V(L - 0.08, gs, k * 0.9), V(L - 0.08, gt - 1.6 + Math.cos(k * 0.6) * 1.2, k * 0.9), 0.05, 0.05, cfg.leadColour);
      for (let y = gs + 1.2; y < gt - 1.5; y += 1.2) fine.beam(V(L - 0.08, y, -gw / 2), V(L - 0.08, y, gw / 2), 0.05, 0.05, cfg.leadColour);
    }
    this.solids.push(new THREE.Box3(V(-L - 1, 0, -W - 1), V(-L + 0.2, 20, W + 1)), new THREE.Box3(V(L - 0.1, 0, -W - 1), V(L + 1, 20, W + 1)));

    // --- the four house tables, their benches, and their places (a plate and a goblet each)
    const [tx0, tx1] = cfg.tableX;
    const tl = tx1 - tx0, txc = (tx0 + tx1) / 2;
    const top = cfg.tableHeight;
    const goblets = gobletGeometry();
    const jug = jugGeometry();
    for (const zc of cfg.tables) {
      solid.box(txc, top - 0.03, zc, tl, 0.06, cfg.tableWidth, jitter(cfg.woodColour, rand, 0.04));
      solid.box(txc, top - 0.1, zc, tl - 0.3, 0.08, cfg.tableWidth - 0.15, cfg.woodDark);           // the apron
      for (let x = tx0 + 0.6; x <= tx1 - 0.5; x += 2.4) {
        for (const k of [-1, 1]) solid.box(x, (top - 0.1) / 2, zc + k * 0.32, 0.1, top - 0.1, 0.1, cfg.woodDark);     // trestle legs
      }
      for (const k of [-1, 1]) {
        const bz = zc + k * cfg.benchOffset;
        solid.box(txc, cfg.benchHeight - 0.03, bz, tl, 0.06, cfg.benchWidth, jitter(cfg.woodColour, rand, 0.05));
        for (let x = tx0 + 0.6; x <= tx1 - 0.5; x += 2.4) solid.box(x, (cfg.benchHeight - 0.06) / 2, bz, 0.08, cfg.benchHeight - 0.06, cfg.benchWidth - 0.08, cfg.woodDark);
        // the places along this side
        for (let x = tx0 + 0.45; x <= tx1 - 0.4; x += cfg.placeSpacing) {
          const pz = zc + k * 0.3;
          this.placeAt.push(V(x, top + 0.004, pz));
          this.taken.push(false);
          solid.add(goblets.clone(), new THREE.Matrix4().makeTranslation(x + 0.22, top, zc + k * 0.4), cfg.goldColour);
        }
      }
      // jugs and dishes down the middle
      for (let x = tx0 + 1.4; x < tx1 - 1; x += 3.1) {
        solid.add(jug.clone(), new THREE.Matrix4().makeTranslation(x, top, zc), cfg.goldColour);
        solid.add(new THREE.CylinderGeometry(0.2, 0.14, 0.07, 14), new THREE.Matrix4().makeTranslation(x + 1.2, top + 0.035, zc), cfg.goldColour);
        solid.add(new THREE.SphereGeometry(0.11, 10, 7), new THREE.Matrix4().makeScale(1, 0.6, 1).setPosition(x + 1.2, top + 0.09, zc),
          ['#c0502c', '#d9a441', '#8a3a1c', '#e0c06a'][Math.floor(rand() * 4)]);        // a pie, bread, a roast...
      }
      const half = cfg.benchOffset + cfg.benchWidth / 2;
      this.blockers.push({ x0: tx0, x1: tx1, z0: zc - half, z1: zc + half });
      this.solids.push(new THREE.Box3(V(tx0, 0, zc - cfg.tableWidth / 2), V(tx1, top + 0.2, zc + cfg.tableWidth / 2)));
      for (const k of [-1, 1]) {
        const bz = zc + k * cfg.benchOffset;
        this.solids.push(new THREE.Box3(V(tx0, 0, bz - cfg.benchWidth / 2), V(tx1, cfg.benchHeight, bz + cfg.benchWidth / 2)));
      }
    }
    // the plates (Hermione's ammunition): one instanced mesh, fewer segments than a thrown one
    const pg = plateGeometry(12);
    this.plates = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ vertexColors: true }), this.placeAt.length);
    this.plates.name = 'greathall_plates';
    this.plates.frustumCulled = false;                 // (instanced: culled all or nothing)
    this.plates.receiveShadow = true;
    this.restock();

    // --- the staff's high table on its dais, the golden owl lectern before it
    const dz = cfg.dais;
    solid.box((dz.x0 + L) / 2, dz.height / 2, 0, L - dz.x0, dz.height, 2 * W - 1.0, jitter(cfg.wallDark, rand, 0.03));
    for (let z = -2; z <= 2; z += 1) solid.box(dz.x0 - 0.25, 0.12, z * 0.6, 0.5, 0.24, 0.55, cfg.wallDark);    // a step
    const st = cfg.staffTable;
    const sy = dz.height + top;
    solid.box(st.x, sy - 0.03, 0, 1.1, 0.06, 2 * st.halfZ, cfg.woodColour);
    solid.box(st.x - 0.5, (dz.height + sy) / 2 - 0.05, 0, 0.06, top - 0.1, 2 * st.halfZ - 0.1, cfg.woodDark);     // its front panel
    for (let z = -st.halfZ + 0.6; z <= st.halfZ - 0.5; z += 1.1) {
      // the staff's chairs: high carved backs (the middle one taller: the headmaster's)
      const tall = Math.abs(z) < 0.4 ? 2.6 : 1.7;
      solid.box(st.x + 0.85, dz.height + 0.25, z, 0.45, 0.06, 0.45, cfg.woodColour);
      solid.box(st.x + 1.08, dz.height + tall / 2, z, 0.06, tall, 0.5, cfg.woodDark);
      solid.add(goblets.clone(), new THREE.Matrix4().makeTranslation(st.x, sy, z + 0.2), cfg.goldColour);
    }
    // the owl lectern: a gold column, the owl with its wings spread
    const lx = dz.x0 - 0.9;
    solid.pole(V(lx, 0, 0), V(lx, 1.05, 0), 0.08, 0.06, cfg.goldColour, 10);
    solid.add(new THREE.CylinderGeometry(0.22, 0.28, 0.08, 12), new THREE.Matrix4().makeTranslation(lx, 0.04, 0), cfg.goldColour);
    solid.add(new THREE.SphereGeometry(0.14, 12, 8), new THREE.Matrix4().makeScale(1, 1.25, 0.9).setPosition(lx, 1.2, 0), cfg.goldColour);
    solid.add(new THREE.SphereGeometry(0.09, 10, 8), new THREE.Matrix4().setPosition(lx, 1.42, 0), cfg.goldColour);
    for (const k of [-1, 1]) {
      const wing = new THREE.BufferGeometry();
      wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1.32, 0, 0, 1.08, 0, -0.05, 1.18, 0.55 * k,
        -0.04, 1.42, 0.42 * k]), 3));
      wing.setIndex(k > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
      wing.computeVertexNormals();                   // (the merged mesh needs every part's normals)
      wing.translate(lx, 0, 0);
      solid.add(wing, new THREE.Matrix4(), cfg.goldColour);
    }
    this.blockers.push({ x0: dz.x0 - 1.25, x1: L + 1, z0: -W - 1, z1: W + 1 });
    this.solids.push(new THREE.Box3(V(dz.x0 - 0.5, 0, -W), V(L, dz.height + 0.05, W)),
      new THREE.Box3(V(st.x - 0.55, dz.height, -st.halfZ), V(st.x + 0.55, sy + 0.2, st.halfZ)),
      new THREE.Box3(V(lx - 0.25, 0, -0.6), V(lx + 0.25, 1.5, 0.6)));

    // --- house banners: one in each bay above the windows' arches, the house of the table below
    // it; the four behind the high table
    // (each long wall alternates between the two houses whose tables are on its side)
    const cellOf = (s: number, i: number) => clothCell(s < 0 ? (i % 2 ? 'ravenclaw' : 'slytherin') : (i % 2 ? 'hufflepuff' : 'gryffindor'), 'banner');
    const [bw, bh] = cfg.bannerSize;
    for (const s of [-1, 1]) {
      for (let i = 0; i <= bays; i++) {
        const x = -L + i * step;
        if (x < -L + 1 || x > dz.x0 - 1) continue;
        hang(cloth, V(x, H - 0.9, s * (W - 0.5)), bw, bh, V(0, 0, -s), cellOf(s, i));
      }
    }
    for (const [i, z] of [-4.5, -1.5, 1.5, 4.5].entries()) {
      hang(cloth, V(L - 0.35, H - 0.6, z), 2.0, 5.5, V(-1, 0, 0), clothCell((['slytherin', 'ravenclaw', 'hufflepuff', 'gryffindor'] as const)[i], 'banner'));
    }

    // --- the meshes
    const solidMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
    const hall = new THREE.Mesh(solid.build()!, solidMat);
    hall.name = 'greathall_hall';
    hall.castShadow = hall.receiveShadow = true;
    const leads = new THREE.Mesh(fine.build()!, solidMat);
    leads.name = 'greathall_leading';
    const banners = new THREE.Mesh(cloth.build()!, new THREE.MeshToonMaterial({ map: clothAtlas(), gradientMap: grad, alphaTest: 0.5,
      side: THREE.DoubleSide }));
    banners.name = 'greathall_banners';
    banners.castShadow = true;
    const glass = new THREE.Mesh(mergeGeos(glassGeos), new THREE.MeshBasicMaterial({ color: cfg.glassColour, side: THREE.DoubleSide, fog: false }));
    glass.name = 'greathall_windows';
    // the enchanted ceiling: the night sky over the whole hall (unlit: it is the sky)
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2 * L + 2, 2 * W + 2), new THREE.MeshBasicMaterial({ map: skyTexture(cfg), fog: false }));
    sky.rotation.x = Math.PI / 2;
    sky.position.y = cfg.ceiling;
    sky.name = 'greathall_ceiling';
    // the walls run on up to it, dark (in shadow under the sky)
    const upper = new Kit();
    for (const s of [-1, 1]) upper.box(0, (H + cfg.ceiling) / 2, s * (W + 0.3), 2 * L + 1.2, cfg.ceiling - H + 0.2, 0.6, '#3c3730');
    for (const s of [-1, 1]) upper.box(s * (L + 0.3), (H + cfg.ceiling) / 2, 0, 0.6, cfg.ceiling - H + 0.2, 2 * W, '#3c3730');
    const upperMesh = new THREE.Mesh(upper.build()!, solidMat);
    upperMesh.name = 'greathall_upper';

    // --- floating candles over the tables (one instanced mesh, their flames one set of points)
    for (let k = 0; k < cfg.candles; k++) {
      this.candleBase.push({ x: tx0 - 1 + rand() * (tl + 2), y: cfg.candleHeight[0] + rand() * (cfg.candleHeight[1] - cfg.candleHeight[0]),
        z: (rand() * 2 - 1) * (W - 1.5), k: rand() * 100 });
    }
    this.candles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.04, 0.26, 8),
      new THREE.MeshToonMaterial({ color: '#f3ead8', gradientMap: grad }), cfg.candles);
    this.candles.frustumCulled = false;
    this.candles.name = 'greathall_candles';
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cfg.candles * 3), 3));
    this.flames = new THREE.Points(fg, new THREE.PointsMaterial({ color: '#ffcf7a', map: glow(), size: 0.42, transparent: true,
      opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flames.frustumCulled = false;
    this.flames.name = 'greathall_flames';
    this.placeCandles();

    this.group.add(floor, hall, leads, banners, glass, sky, upperMesh, this.plates, this.candles, this.flames);

    // --- the camera: inside the walls, in an aisle (never right over a table: its plates and
    // goblets filled the frame), and outside the central aisle high enough to see the fighters'
    // feet past the tables
    const cx = L - cfg.cameraMargin, cz = W - cfg.cameraMargin;
    const band = cfg.benchOffset + cfg.benchWidth / 2 + 0.15;
    // (the duel camera picks the side it watches from with inside(): only the walls count there;
    // with the tables counted too it kept finding no room and swung round to the other side)
    const inside = (x: number, z: number) => Math.abs(x) <= cx && Math.abs(z) <= cz;
    const allowed = (x: number, z: number) => inside(x, z)
      && !(x > tx0 - 0.4 && x < tx1 + 0.4 && cfg.tables.some((t) => Math.abs(z - t) < band));
    const aisle = cfg.tables[2] - cfg.benchOffset - cfg.benchWidth / 2;
    this.cameraLimit = {
      inside,
      clamp: (c, t) => {
        if (allowed(c.x, c.z)) return;
        // the first allowed spot on the way in towards the target (the aisle beside the table
        // it stood over: bisecting jumped to the central aisle, far too close)
        const x0 = c.x, z0 = c.z;
        const at = (m: number) => allowed(x0 + (t.x - x0) * m, z0 + (t.z - z0) * m);
        let lo = 0, hi = 1;
        for (let i = 1; i <= 64; i++) {
          if (at(i / 64)) {
            hi = i / 64;
            lo = (i - 1) / 64;
            break;
          }
        }
        for (let i = 0; i < 10; i++) {
          const m = (lo + hi) / 2;
          if (at(m)) hi = m;
          else lo = m;
        }
        c.x = x0 + (t.x - x0) * hi;
        c.z = z0 + (t.z - z0) * hi;
        c.y = Math.max(c.y, t.y);
      },
      minY: (x, z) => (Math.abs(z) > aisle && x > tx0 - 0.5 && x < tx1 + 0.5 ? cfg.cameraOverTables : 0),
    };
  }

  /**
   * the plates nearest `near` still on the tables (up to `count`, within 10 m): taken off the
   * tables (hidden until restock) and returned where they lay (world)
   */
  takePlates(near: THREE.Vector3, count: number): THREE.Vector3[] {
    const free = this.placeAt.map((p, i) => ({ p, i, d: Math.hypot(p.x - near.x, p.z - near.z) }))
      .filter((o) => !this.taken[o.i] && o.d < 10).sort((a, b) => a.d - b.d).slice(0, count);
    for (const o of free) {
      this.taken[o.i] = true;
      this.plates.setMatrixAt(o.i, this.m.makeScale(0, 0, 0));
    }
    this.plates.instanceMatrix.needsUpdate = true;
    return free.map((o) => o.p.clone());
  }

  /** plates left on the tables */
  get platesLeft(): number {
    return this.taken.filter((t) => !t).length;
  }

  /** every plate back on the tables (a new round) */
  restock(): void {
    this.placeAt.forEach((p, i) => {
      this.taken[i] = false;
      this.plates.setMatrixAt(i, this.m.makeRotationY(i * 0.7).setPosition(p));
    });
    this.plates.instanceMatrix.needsUpdate = true;
  }

  look(): EnvironmentLook {
    const c = this.cfg;
    return {
      background: c.background,
      fog: [c.background, c.fogNear, c.fogFar],
      hemi: [c.hemiSky, c.hemiGround, c.hemiIntensity],
      key: [c.keyColour, c.keyIntensity],
      keyOffset: c.keyOffset,
      rim: [c.rimColour, c.rimIntensity],
      cameraFar: 140,
      shadow: { centre: [0, 0, 0], halfSize: c.shadowHalfSize, mapSize: c.shadowMapSize, bias: c.shadowBias, normalBias: c.shadowNormalBias },
    };
  }

  setActive(on: boolean): void {
    this.group.visible = on;
  }

  /** keep a fighter on the floor: inside the walls, round the tables, benches and the dais */
  resolve(pos: THREE.Vector3, r: number): void {
    const c = this.cfg;
    const bx = c.halfLength - 0.3 - r - c.margin, bz = c.halfWidth - 0.5 - r - c.margin;
    pos.x = Math.max(-bx, Math.min(bx, pos.x));
    pos.z = Math.max(-bz, Math.min(bz, pos.z));
    for (const b of this.blockers) {
      const x0 = b.x0 - r - c.margin, x1 = b.x1 + r + c.margin, z0 = b.z0 - r - c.margin, z1 = b.z1 + r + c.margin;
      if (pos.x <= x0 || pos.x >= x1 || pos.z <= z0 || pos.z >= z1) continue;
      // out the nearest side
      const out = [pos.x - x0, x1 - pos.x, pos.z - z0, z1 - pos.z];
      const k = out.indexOf(Math.min(...out));
      if (k === 0) pos.x = x0;
      else if (k === 1) pos.x = x1;
      else if (k === 2) pos.z = z0;
      else pos.z = z1;
    }
  }

  fillSolids(out: THREE.Box3[], centres: THREE.Vector3[], range = 30): void {
    out.length = 0;
    for (const b of this.solids) if (centres.some((c) => b.distanceToPoint(c) < range)) out.push(b);
  }

  /** the candles drift and bob, their flames flicker */
  update(dt: number): void {
    if (!this.group.visible) return;
    this.time += dt;
    this.placeCandles();
  }

  private placeCandles(): void {
    const t = this.time;
    const fp = this.flames.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.candleBase.forEach((c, i) => {
      const y = c.y + Math.sin(t * 0.7 + c.k) * 0.12;
      const x = c.x + Math.sin(t * 0.13 + c.k * 2) * 0.15;
      const z = c.z + Math.cos(t * 0.11 + c.k) * 0.15;
      this.m.makeTranslation(x, y, z);
      this.candles.setMatrixAt(i, this.m);
      fp.setXYZ(i, x, y + 0.2 + Math.sin(t * 13 + c.k * 7) * 0.012, z);
    });
    this.candles.instanceMatrix.needsUpdate = true;
    fp.needsUpdate = true;
  }
}

function mergeGeos(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const non = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  let n = 0;
  for (const p of non) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const p of non) {
    pos.set(p.getAttribute('position').array as Float32Array, o);
    o += p.getAttribute('position').count * 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
