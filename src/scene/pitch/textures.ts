import * as THREE from 'three';
import { HOUSES, HOUSE_ORDER, House, PitchConfig } from './config';
import { fbm, hash3 } from '../forest/random';

/*
 * The pitch's generated textures: the house cloth atlas, a cloud, and the ground (mown grass,
 * worn apron, chalk lines). Nothing is loaded from files.
 */

/** where each house's cloth lives in the atlas (uv rectangle: u0, v0, u1, v1) */
export type ClothKind = 'banner' | 'stripes' | 'canopy';
export function clothCell(house: House, kind: ClothKind): [number, number, number, number] {
  const h = HOUSE_ORDER.indexOf(house);
  const v = kind === 'banner' ? [0.5, 1.0] : kind === 'stripes' ? [0.25, 0.5] : [0.0, 0.25];
  return [h / 4 + 0.004, v[0] + 0.004, (h + 1) / 4 - 0.004, v[1] - 0.004];
}

const INITIAL: Record<House, string> = { gryffindor: 'G', ravenclaw: 'R', hufflepuff: 'H', slytherin: 'S' };

/**
 * 1024 x 1024: one column per house. Top half: a swallowtail banner (main colour, accent border,
 * a shield with the house initial). Then striped drapery (main / accent) and canopy cloth
 * (main colour, an accent band and scalloped hem). The banner's notch is transparent.
 */
export function clothAtlas(): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  HOUSE_ORDER.forEach((house, i) => {
    const [main, accent, dark] = HOUSES[house];
    const x0 = i * 256;
    // --- banner (y 0..512): pole sleeve, field, border, swallowtail notch
    g.fillStyle = main;
    g.beginPath();
    g.moveTo(x0 + 8, 0);
    g.lineTo(x0 + 248, 0);
    g.lineTo(x0 + 248, 506);
    g.lineTo(x0 + 128, 420);
    g.lineTo(x0 + 8, 506);
    g.closePath();
    g.fill();
    g.strokeStyle = accent;
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(x0 + 20, 26);
    g.lineTo(x0 + 236, 26);
    g.lineTo(x0 + 236, 484);
    g.lineTo(x0 + 128, 404);
    g.lineTo(x0 + 20, 484);
    g.closePath();
    g.stroke();
    g.fillStyle = dark;
    g.fillRect(x0 + 8, 0, 240, 20);                               // the sleeve round the rod
    // shield with the initial
    g.fillStyle = dark;
    g.strokeStyle = accent;
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(x0 + 68, 110);
    g.lineTo(x0 + 188, 110);
    g.lineTo(x0 + 188, 210);
    g.quadraticCurveTo(x0 + 188, 290, x0 + 128, 322);
    g.quadraticCurveTo(x0 + 68, 290, x0 + 68, 210);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = accent;
    g.font = 'bold 128px Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(INITIAL[house], x0 + 128, 212);
    // --- drapery stripes (y 512..768): vertical bands
    for (let k = 0; k < 8; k++) {
      g.fillStyle = k % 2 ? accent : main;
      g.fillRect(x0 + k * 32, 512, 32, 256);
    }
    g.fillStyle = dark;
    g.fillRect(x0, 512, 256, 16);
    // --- canopy cloth (y 768..1024): main colour, an accent band, a scalloped hem
    g.fillStyle = main;
    g.fillRect(x0, 768, 256, 220);
    g.fillStyle = accent;
    g.fillRect(x0, 940, 256, 18);
    g.fillStyle = main;
    for (let k = 0; k < 8; k++) {
      g.beginPath();
      g.arc(x0 + 16 + k * 32, 988, 16, 0, Math.PI);
      g.fill();
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** a soft white cloud (a few overlapping puffs), transparent */
export function cloudTexture(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const x = 50 + r() * 156, y = 70 + (r() - 0.5) * 30, rad = 22 + r() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** the ground texture's extent (m): it covers the stadium and a margin round it */
export function groundExtent(cfg: PitchConfig): { halfX: number; halfZ: number } {
  return { halfX: cfg.fieldHalfLength + cfg.apron + 16, halfZ: cfg.fieldHalfWidth + cfg.apron + 16 };
}

/** the land's colour just outside the stadium (the ground texture fades into it) */
export function outerGrass(cfg: PitchConfig): THREE.Color {
  return new THREE.Color(cfg.grass).multiplyScalar(0.86);
}

/**
 * The ground under the stadium: mown stripes on the field, worn earth under the stands, chalk
 * lines (the field's edge, the centre circle, the scoring areas round the hoops), and the
 * (The stadium's shadows are the sun's real shadow, not baked in: SceneManager / the arena's look.)
 */
export function groundTexture(cfg: PitchConfig): THREE.CanvasTexture {
  const { halfX, halfZ } = groundExtent(cfg);
  const W = Math.round(2 * halfX * cfg.groundTexelsPerMetre);
  const H = Math.round(2 * halfZ * cfg.groundTexelsPerMetre);
  // coarse colour variation (0.5 m cells), sampled bilinearly
  const vc = 0.5;
  const VW = Math.ceil((2 * halfX) / vc) + 2;
  const VH = Math.ceil((2 * halfZ) / vc) + 2;
  const vary = new Float32Array(VW * VH);
  for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) {
    vary[j * VW + i] = fbm(i * vc - halfX, j * vc - halfZ, 9, cfg.seed, 3) - 0.5;
  }
  const grass = new THREE.Color(cfg.grass);
  const apron = new THREE.Color(cfg.apronColour);
  const outer = outerGrass(cfg);
  const line = new THREE.Color(cfg.lineColour);
  const a = cfg.fieldHalfLength, b = cfg.fieldHalfWidth;
  const A = a + cfg.apron, B = b + cfg.apron;
  const lw = 0.05;                                               // chalk half width (m)
  const img = new ImageData(W, H);
  const d = img.data;
  const col = new THREE.Color();
  const tmp = new THREE.Color();
  for (let py = 0; py < H; py++) {
    // canvas row 0 is the top of the texture = +z edge when the plane faces up (see buildGround)
    const z = halfZ - ((py + 0.5) / H) * 2 * halfZ;
    for (let px = 0; px < W; px++) {
      const x = -halfX + ((px + 0.5) / W) * 2 * halfX;
      const fx = (x + halfX) / vc, fz = (z + halfZ) / vc;
      const ix = Math.floor(fx), iz = Math.floor(fz);
      const tx = fx - ix, tz = fz - iz;
      const v00 = vary[iz * VW + ix], v10 = vary[iz * VW + ix + 1], v01 = vary[(iz + 1) * VW + ix], v11 = vary[(iz + 1) * VW + ix + 1];
      const n = (v00 + (v10 - v00) * tx) + ((v01 + (v11 - v01) * tx) - (v00 + (v10 - v00) * tx)) * tz;
      const grain = (hash3(px, py, 3, cfg.seed) / 4294967296 - 0.5) * 0.06;
      const e = Math.sqrt((x / a) ** 2 + (z / b) ** 2);          // 1 at the field's edge
      const E = Math.sqrt((x / A) ** 2 + (z / B) ** 2);          // 1 at the foot of the stands
      if (e < 1) {
        // the field: mowing stripes across the length, a little noise
        const stripe = Math.floor((x + 1000) / cfg.grassStripe) % 2 ? 1 : -1;
        col.copy(grass).multiplyScalar(1 + stripe * cfg.grassStripeContrast + n * cfg.grassVariation * 2 + grain);
      } else if (E < 1.04) {
        // worn ground under the stands: earth showing through trampled grass
        const k = Math.min(1, (e - 1) * Math.min(a, b) / 1.6);  // grass fades out over 1.6 m
        col.copy(grass).multiplyScalar(0.9).lerp(apron, Math.min(1, k * (0.75 + n * 1.5)));
        col.multiplyScalar(1 + n * 0.25 + grain);
      } else {
        col.copy(outer).multiplyScalar(1 + n * cfg.grassVariation * 2 + grain);
      }
      // the edge of the texture fades into the land around it
      const edge = Math.min(halfX - Math.abs(x), halfZ - Math.abs(z));
      if (edge < 8) col.lerp(tmp.copy(outer), 1 - edge / 8);
      // chalk lines
      const dl = Math.min(
        Math.abs(e - 1) * Math.min(a, b),                                        // field edge
        Math.abs(Math.hypot(x, z) - cfg.centreCircle),                          // centre circle
        Math.abs(Math.hypot((Math.abs(x) - cfg.hoopDistance) / 7, z / 10) - 1) * 7,   // scoring areas
      );
      if (dl < lw * 1.6 && e < 1.002) col.lerp(line, Math.min(1, (lw * 1.6 - dl) / (lw * 0.6)) * 0.85);
      const o = (py * W + px) * 4;
      d[o] = Math.min(255, col.r * 255);
      d[o + 1] = Math.min(255, col.g * 255);
      d[o + 2] = Math.min(255, col.b * 255);
      d[o + 3] = 255;
    }
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  c.getContext('2d')!.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.LinearSRGBColorSpace;       // colours were written as linear values
  t.anisotropy = 8;
  return t;
}
