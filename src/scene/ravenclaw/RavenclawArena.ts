import * as THREE from 'three';
import type { Arena, CameraLimit } from '../arena';
import type { EnvironmentLook } from '../SceneManager';
import { RAVENCLAW_CONFIG, RavenclawConfig } from './config';
import { Kit, jitter } from '../pitch/kit';
import { clothAtlas, clothCell } from '../pitch/textures';
import { hang } from '../pitch/structures';
import { rng } from '../forest/random';
import { carpetTexture, domeTexture, floorTexture, nightTexture } from './textures';

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

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

/**
 * The Ravenclaw common room: a finite, round arena, built once from code (no model files). The
 * fighters stay on the round carpet; spells burst on the furniture and the walls round it. The
 * camera stays inside the furniture ring. Static apart from the floating candles.
 */
export class RavenclawArena implements Arena {
  readonly kind = 'ravenclaw' as const;
  readonly name = 'Ravenclaw Common Room';
  readonly spawn = new THREE.Vector3(0, 0, 0);
  readonly finite = true;
  readonly group = new THREE.Group();
  readonly cameraLimit: CameraLimit;
  private readonly solids: THREE.Box3[] = [];
  private readonly candles: THREE.InstancedMesh;
  private readonly flames: THREE.Points;
  private readonly candleBase: { x: number; y: number; z: number; k: number }[] = [];
  private readonly m = new THREE.Matrix4();
  private time = 0;

  constructor(scene: THREE.Scene, readonly cfg: RavenclawConfig = RAVENCLAW_CONFIG) {
    this.group.name = 'ravenclaw';
    this.group.visible = false;
    scene.add(this.group);
    const grad = gradient();
    const R = cfg.radius, H = cfg.wallHeight;
    const rand = rng(cfg.seed);
    const solid = new Kit();          // walls, trim, furniture, statue: one mesh
    const books = new Kit();          // the books' spines (no shadow)
    const cloth = new Kit(true);      // banners (the pitch's cloth atlas)
    const bayAngle = (2 * Math.PI) / cfg.bays;
    const apothem = R * Math.cos(bayAngle / 2);
    const bayWidth = 2 * R * Math.sin(bayAngle / 2);
    const statueBay = Math.round((cfg.statueBearing * DEG) / bayAngle) % cfg.bays;
    const glassShapes: THREE.Shape[] = [];
    const glassFrames: THREE.Matrix4[] = [];

    // --- the wall: one flat bay per segment of the 16-gon; windows in alternate bays
    for (let i = 0; i < cfg.bays; i++) {
      const a = i * bayAngle;                                     // bearing of the bay's centre
      const out = V(Math.sin(a), 0, Math.cos(a));
      const frame = new THREE.Matrix4().makeRotationY(a + Math.PI).setPosition(out.x * apothem, 0, out.z * apothem);
      // (local frame: +x along the bay, +y up, +z into the room)
      const isWindow = i % 2 === 0 && i !== statueBay;
      const isNiche = i === statueBay;
      const panel = new THREE.Shape();
      panel.moveTo(-bayWidth / 2 - 0.02, 0);
      panel.lineTo(bayWidth / 2 + 0.02, 0);
      panel.lineTo(bayWidth / 2 + 0.02, H);
      panel.lineTo(-bayWidth / 2 - 0.02, H);
      panel.closePath();
      if (isWindow || isNiche) {
        const w = isNiche ? 2.2 : cfg.window.width;
        const sill = isNiche ? 0.0 : cfg.window.sill;
        const top = isNiche ? 4.6 : cfg.window.top;
        const hole = new THREE.Path();
        hole.moveTo(-w / 2, sill);
        hole.lineTo(w / 2, sill);
        hole.lineTo(w / 2, top - w / 2);
        hole.absarc(0, top - w / 2, w / 2, 0, Math.PI, false);
        hole.lineTo(-w / 2, sill);
        panel.holes.push(hole);
        if (isWindow) {
          const g = new THREE.Shape();
          g.moveTo(-w / 2, sill);
          g.lineTo(w / 2, sill);
          g.lineTo(w / 2, top - w / 2);
          g.absarc(0, top - w / 2, w / 2, 0, Math.PI, false);
          g.lineTo(-w / 2, sill);
          glassShapes.push(g);
          glassFrames.push(frame.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.18)));
          // bronze frame: the jambs, the arch, mullions and transoms
          const fr = (p: THREE.Vector3) => p.clone().applyMatrix4(frame);
          for (const sx of [-1, 1]) solid.beam(fr(V(sx * w / 2, sill, 0.02)), fr(V(sx * w / 2, top - w / 2, 0.02)), 0.08, 0.1, cfg.trimColour);
          for (let k = 0; k < 10; k++) {
            const t0 = (k / 10) * Math.PI, t1 = ((k + 1) / 10) * Math.PI;
            solid.beam(fr(V(Math.cos(t0) * w / 2, top - w / 2 + Math.sin(t0) * w / 2, 0.02)),
              fr(V(Math.cos(t1) * w / 2, top - w / 2 + Math.sin(t1) * w / 2, 0.02)), 0.08, 0.1, cfg.trimColour);
          }
          solid.beam(fr(V(0, sill, -0.1)), fr(V(0, top, -0.1)), 0.04, 0.05, cfg.trimColour);
          for (const y of [sill + 1.2, sill + 2.4, top - w / 2]) solid.beam(fr(V(-w / 2, y, -0.1)), fr(V(w / 2, y, -0.1)), 0.04, 0.05, cfg.trimColour);
          // the sill
          const sillM = new THREE.Matrix4().makeTranslation(0, sill - 0.05, 0.12).multiply(new THREE.Matrix4().makeScale(w + 0.3, 0.1, 0.36));
          solid.add(new THREE.BoxGeometry(1, 1, 1), frame.clone().multiply(sillM), cfg.trimColour);
        } else {
          // the niche: a recess with a darker back and an arched hood
          const back = new THREE.Matrix4().makeTranslation(0, 2.3, -0.75).multiply(new THREE.Matrix4().makeScale(w, 4.6, 0.1));
          solid.add(new THREE.BoxGeometry(1, 1, 1), frame.clone().multiply(back), '#3a4566');
          for (const sx of [-1, 1]) {
            const side = new THREE.Matrix4().makeTranslation(sx * w / 2, 2.3, -0.38).multiply(new THREE.Matrix4().makeScale(0.06, 4.6, 0.75));
            solid.add(new THREE.BoxGeometry(1, 1, 1), frame.clone().multiply(side), cfg.wallColour);
          }
        }
      }
      const panelGeo = new THREE.ExtrudeGeometry(panel, { depth: 0.36, bevelEnabled: false, curveSegments: 10 });
      solid.add(panelGeo, frame.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.36)), cfg.wallColour,
        (y) => 0.86 + 0.14 * Math.min(1, y / H));
      // skirting and the cornice (bronze), round the room
      const bottom = new THREE.Matrix4().makeTranslation(0, 0.09, 0.03).multiply(new THREE.Matrix4().makeScale(bayWidth + 0.06, 0.18, 0.08));
      solid.add(new THREE.BoxGeometry(1, 1, 1), frame.clone().multiply(bottom), '#3b2a1c');
      const cornice = new THREE.Matrix4().makeTranslation(0, H - 0.12, 0.08).multiply(new THREE.Matrix4().makeScale(bayWidth + 0.1, 0.24, 0.22));
      solid.add(new THREE.BoxGeometry(1, 1, 1), frame.clone().multiply(cornice), cfg.trimColour);
      // spells burst on the wall: a box along the bay (inside its face)
      const c0 = V(out.x * (apothem + 0.2), 0, out.z * (apothem + 0.2));
      const along = V(Math.cos(a), 0, -Math.sin(a));
      for (const s of [-0.33, 0, 0.33]) {
        const p = c0.clone().addScaledVector(along, s * bayWidth);
        this.solids.push(new THREE.Box3(V(p.x - 0.9, 0, p.z - 0.9), V(p.x + 0.9, H + 2, p.z + 0.9)));
      }
      if (isWindow || isNiche) continue;
      // --- a silk bay: a bookcase against the wall, blue silks hung above it, a bronze rod
      const bw = bayWidth - 1.0;
      const bc = new THREE.Matrix4().makeTranslation(0, cfg.bookcaseHeight / 2, cfg.bookcaseDepth / 2)
        .multiply(new THREE.Matrix4().makeScale(bw, cfg.bookcaseHeight, cfg.bookcaseDepth));
      solid.add(new THREE.BoxGeometry(1, 1, 1), frame.clone().multiply(bc), cfg.woodColour);
      const shelves = 4;
      for (let k = 0; k < shelves; k++) {
        const y0 = 0.15 + k * ((cfg.bookcaseHeight - 0.3) / shelves);
        let x = -bw / 2 + 0.08;
        while (x < bw / 2 - 0.12) {
          const bwid = 0.035 + rand() * 0.05, bh = 0.24 + rand() * 0.16;
          const col = jitter(['#6b1f24', '#22406e', '#2f5a35', '#7a5a2a', '#4b2d55', '#8a7a5c'][Math.floor(rand() * 6)], rand, 0.15);
          const m = new THREE.Matrix4().makeTranslation(x + bwid / 2, y0 + bh / 2, cfg.bookcaseDepth + 0.005)
            .multiply(new THREE.Matrix4().makeScale(bwid, bh, 0.06));
          books.add(new THREE.BoxGeometry(1, 1, 1), frame.clone().multiply(m), col);
          x += bwid + (rand() < 0.08 ? 0.12 : 0.004);
        }
      }
      const bcP = c0.clone().addScaledVector(out, -0.2 - cfg.bookcaseDepth);
      this.solids.push(new THREE.Box3(V(bcP.x - 1.3, 0, bcP.z - 1.3), V(bcP.x + 1.3, cfg.bookcaseHeight, bcP.z + 1.3)));
      // silks: two folded drapes either side, a banner with the eagle between them (every other bay)
      const fr = (p: THREE.Vector3) => p.clone().applyMatrix4(frame);
      solid.beam(fr(V(-bw / 2, H - 0.45, 0.25)), fr(V(bw / 2, H - 0.45, 0.25)), 0.05, 0.05, cfg.trimColour);
      for (const sx of [-1, 1]) {
        const drape = new THREE.PlaneGeometry(0.9, H - 0.55 - cfg.bookcaseHeight - 0.25, 12, 1);
        const p = drape.getAttribute('position') as THREE.BufferAttribute;
        for (let k = 0; k < p.count; k++) p.setZ(k, 0.06 * Math.sin(p.getX(k) * 22));
        const m = new THREE.Matrix4().makeTranslation(sx * (bw / 2 - 0.45), cfg.bookcaseHeight + 0.25 + (H - 0.55 - cfg.bookcaseHeight - 0.25) / 2, 0.22);
        solid.add(drape, frame.clone().multiply(m), cfg.silkBlue, (y) => 0.8 + 0.2 * (y / H));
        const edge = new THREE.Matrix4().makeTranslation(sx * (bw / 2 - 0.45) - sx * 0.45, cfg.bookcaseHeight + 0.25 + (H - 0.55 - cfg.bookcaseHeight - 0.25) / 2, 0.24)
          .multiply(new THREE.Matrix4().makeScale(0.06, H - 0.55 - cfg.bookcaseHeight - 0.25, 0.02));
        solid.add(new THREE.BoxGeometry(1, 1, 1), frame.clone().multiply(edge), cfg.silkBronze);
      }
      if (i % 4 === 1) hang(cloth, fr(V(0, H - 0.5, 0.3)), 1.2, 2.6, out.clone().negate(), clothCell('ravenclaw', 'banner'));
    }

    // --- the statue of Rowena Ravenclaw, in the niche: white marble, robed, a diadem
    {
      const a = statueBay * bayAngle;
      const out = V(Math.sin(a), 0, Math.cos(a));
      const base = out.clone().multiplyScalar(apothem - 0.55);
      const yaw = a + Math.PI;
      solid.setFrame(base, yaw);
      const mb = cfg.marble;
      solid.box(0, 0.45, 0, 1.2, 0.9, 1.0, '#cfcac0');
      solid.box(0, 0.93, 0, 1.3, 0.08, 1.1, '#cfcac0');
      const V2 = (x: number, y: number) => new THREE.Vector2(x, y);
      const robe = new THREE.LatheGeometry([V2(0.5, 0), V2(0.46, 0.4), V2(0.36, 1.0), V2(0.27, 1.5), V2(0.24, 1.85), V2(0.0, 1.9)], 16);
      solid.add(robe, new THREE.Matrix4().makeTranslation(0, 0.97, 0), mb, (y) => 0.85 + 0.15 * Math.min(1, (y - 0.97) / 2));
      solid.box(0, 2.7, 0, 0.62, 0.16, 0.3, mb);                                   // shoulders
      solid.pole(V(0, 2.82, 0), V(0, 2.95, 0), 0.07, 0.06, mb);                     // neck
      const head = new THREE.SphereGeometry(0.15, 12, 10);
      solid.add(head, new THREE.Matrix4().makeTranslation(0, 3.08, 0.01).multiply(new THREE.Matrix4().makeScale(0.9, 1.1, 1)), mb);
      const hair = new THREE.SphereGeometry(0.17, 12, 10);
      solid.add(hair, new THREE.Matrix4().makeTranslation(0, 3.1, -0.04).multiply(new THREE.Matrix4().makeScale(0.95, 1.1, 1)), '#dedad2');
      const diadem = new THREE.TorusGeometry(0.15, 0.015, 6, 20);
      solid.add(diadem, new THREE.Matrix4().makeTranslation(0, 3.2, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.15)), mb);
      solid.roof(0, 3.24, 0.13, 0.03, 0.09, 4, mb);
      for (const sx of [-1, 1]) {                                                    // arms, hands folded before her
        solid.pole(V(sx * 0.3, 2.68, 0), V(sx * 0.22, 2.25, 0.12), 0.07, 0.065, mb);
        solid.pole(V(sx * 0.22, 2.25, 0.12), V(sx * 0.05, 2.1, 0.2), 0.06, 0.055, mb);
      }
      solid.add(new THREE.SphereGeometry(0.09, 10, 8), new THREE.Matrix4().makeTranslation(0, 2.08, 0.22), mb);
      solid.resetFrame();
      this.solids.push(new THREE.Box3(V(base.x - 0.8, 0, base.z - 0.8), V(base.x + 0.8, 3.4, base.z + 0.8)));
    }

    // --- tables and chairs, armchairs: round the room between the carpet and the wall
    const used: number[] = [];
    const free = (a: number) => used.every((u) => Math.abs(Math.atan2(Math.sin(a - u), Math.cos(a - u))) > 0.42)
      && Math.abs(Math.atan2(Math.sin(a - statueBay * bayAngle), Math.cos(a - statueBay * bayAngle))) > 0.5;
    const place = (n: number, r: number, f: (x: number, z: number, yaw: number) => void, offset: number) => {
      for (let k = 0; k < n; k++) {
        let a = offset + (k / n) * Math.PI * 2;
        for (let t = 0; t < 8 && !free(a); t++) a += 0.21;
        if (!free(a)) continue;
        used.push(a);
        f(Math.sin(a) * r, Math.cos(a) * r, a);
      }
    };
    place(cfg.tables, cfg.furnitureRing[0] + 0.4, (x, z, yaw) => {
      solid.setFrame(V(x, 0, z), yaw);
      const top = new THREE.CylinderGeometry(0.62, 0.62, 0.06, 20);
      solid.add(top, new THREE.Matrix4().makeTranslation(0, 0.76, 0), cfg.woodColour);
      solid.pole(V(0, 0.05, 0), V(0, 0.74, 0), 0.08, 0.06, cfg.woodColour);
      solid.box(0, 0.03, 0, 0.6, 0.06, 0.6, cfg.woodColour);
      // a stack of books and a candlestick on it
      solid.box(-0.18, 0.83, 0.1, 0.24, 0.08, 0.18, '#22406e');
      solid.box(-0.16, 0.9, 0.08, 0.2, 0.06, 0.16, '#6b1f24');
      solid.pole(V(0.2, 0.79, -0.1), V(0.2, 0.98, -0.1), 0.025, 0.02, cfg.trimColour);
      for (const ca of [0.6, 2.4, 4.3]) {
        const cx = Math.sin(ca) * 0.95, cz = Math.cos(ca) * 0.95;
        solid.box(cx, 0.45, cz, 0.44, 0.07, 0.44, cfg.upholstery, ca);
        solid.box(cx + Math.sin(ca) * 0.2, 0.75, cz + Math.cos(ca) * 0.2, 0.44, 0.6, 0.06, cfg.woodColour, ca);
        for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
          const px = cx + lx * Math.cos(ca) + lz * Math.sin(ca), pz = cz - lx * Math.sin(ca) + lz * Math.cos(ca);
          solid.box(px, 0.21, pz, 0.05, 0.42, 0.05, cfg.woodColour);
        }
      }
      solid.resetFrame();
      this.solids.push(new THREE.Box3(V(x - 1.3, 0, z - 1.3), V(x + 1.3, 1.1, z + 1.3)));
    }, 0.6);
    place(cfg.armchairs, cfg.furnitureRing[1] - 0.2, (x, z, yaw) => {
      solid.setFrame(V(x, 0, z), yaw + Math.PI);
      solid.box(0, 0.25, 0, 0.9, 0.5, 0.85, cfg.upholstery);
      solid.box(0, 0.7, -0.35, 0.9, 0.9, 0.18, cfg.upholstery);
      for (const sx of [-1, 1]) solid.box(sx * 0.4, 0.6, 0.02, 0.14, 0.35, 0.8, cfg.upholstery);
      solid.box(0, 0.52, 0.05, 0.62, 0.1, 0.6, '#3a5aa0');
      solid.resetFrame();
      this.solids.push(new THREE.Box3(V(x - 0.7, 0, z - 0.7), V(x + 0.7, 1.15, z + 0.7)));
    }, 1.5);

    // --- the dome: painted stars inside, bronze ribs from the cornice to the crown
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: domeTexture(cfg), side: THREE.BackSide }));
    dome.scale.y = cfg.domeRise / R;
    dome.position.y = H;
    dome.name = 'ravenclaw_dome';
    for (let k = 0; k < cfg.ribs; k++) {
      const a = (k / cfg.ribs) * Math.PI * 2 + bayAngle / 2;
      let prev: THREE.Vector3 | null = null;
      for (let s = 0; s <= 12; s++) {
        const t = (s / 12) * (Math.PI / 2);
        const r = R * Math.cos(t) * 0.985, y = H + cfg.domeRise * Math.sin(t) * 0.985;
        const p = V(Math.sin(a) * r, y, Math.cos(a) * r);
        if (prev) solid.beam(prev, p, 0.14, 0.14, cfg.trimColour);
        prev = p;
      }
    }

    // --- the floor and the carpet
    const floorTex = floorTexture(cfg);
    floorTex.repeat.set(R / 1.8, R / 1.8);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 0.1, 64), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'ravenclaw_floor';
    const carpet = new THREE.Mesh(new THREE.CircleGeometry(cfg.carpetRadius, 72), new THREE.MeshLambertMaterial({ map: carpetTexture(cfg) }));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = 0.006;
    carpet.receiveShadow = true;
    carpet.name = 'ravenclaw_carpet';

    // --- the windows' glass, and the night outside
    const glassGeo = new THREE.ShapeGeometry(glassShapes[0], 12);
    const glassMat = new THREE.MeshBasicMaterial({ color: cfg.glassColour, transparent: true, opacity: cfg.glassOpacity, depthWrite: false,
      side: THREE.DoubleSide });
    const glass = new THREE.InstancedMesh(glassGeo, glassMat, glassFrames.length);
    glassFrames.forEach((f, k) => glass.setMatrixAt(k, f));
    glass.frustumCulled = false;
    glass.name = 'ravenclaw_glass';
    const night = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 60, 48, 1, true), new THREE.MeshBasicMaterial({ map: nightTexture(cfg),
      side: THREE.BackSide, fog: false }));
    night.position.y = 22;
    night.name = 'ravenclaw_night';

    const solidMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
    const room = new THREE.Mesh(solid.build()!, solidMat);
    room.name = 'ravenclaw_room';
    room.castShadow = room.receiveShadow = true;
    const bookMesh = new THREE.Mesh(books.build()!, solidMat);
    bookMesh.name = 'ravenclaw_books';
    bookMesh.receiveShadow = true;
    const banners = new THREE.Mesh(cloth.build()!, new THREE.MeshToonMaterial({ map: clothAtlas(), gradientMap: grad, alphaTest: 0.5,
      side: THREE.DoubleSide }));
    banners.name = 'ravenclaw_banners';

    // --- floating candles under the dome (one instanced mesh, their flames one set of points)
    for (let k = 0; k < cfg.candles; k++) {
      const a = rand() * Math.PI * 2, r = 2.5 + rand() * (R - 4.5);
      this.candleBase.push({ x: Math.sin(a) * r, y: cfg.candleHeight[0] + rand() * (cfg.candleHeight[1] - cfg.candleHeight[0]),
        z: Math.cos(a) * r, k: rand() * 100 });
    }
    this.candles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.04, 0.26, 8),
      new THREE.MeshToonMaterial({ color: '#f3ead8', gradientMap: grad }), cfg.candles);
    this.candles.frustumCulled = false;
    this.candles.name = 'ravenclaw_candles';
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cfg.candles * 3), 3));
    this.flames = new THREE.Points(fg, new THREE.PointsMaterial({ color: '#ffcf7a', map: glow(), size: 0.42, transparent: true,
      opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flames.frustumCulled = false;
    this.flames.name = 'ravenclaw_flames';
    this.placeCandles();

    this.group.add(night, floor, carpet, room, bookMesh, banners, dome, glass, this.candles, this.flames);

    // --- the camera keeps inside the furniture ring
    const cr = cfg.cameraRadius;
    const inside = (x: number, z: number) => x * x + z * z <= cr * cr;
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

  /** keep a fighter on the carpet */
  resolve(pos: THREE.Vector3, r: number): void {
    const max = this.cfg.floorRadius - r;
    const d = Math.hypot(pos.x, pos.z);
    if (d > max) {
      pos.x *= max / d;
      pos.z *= max / d;
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
