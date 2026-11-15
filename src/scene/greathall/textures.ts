import * as THREE from 'three';
import { rng } from '../forest/random';
import type { GreatHallConfig } from './config';

/*
 * The Great Hall's generated textures (canvas, no files): the stone floor and the enchanted
 * ceiling's night sky.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function done(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** worn stone flags in running courses (repeated: one tile is 4 x 4 flags' worth) */
export function floorTexture(cfg: GreatHallConfig): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rand = rng(cfg.seed * 3 + 1);
  g.fillStyle = cfg.groutColour;
  g.fillRect(0, 0, S, S);
  const base = new THREE.Color(cfg.flagColour);
  const col = new THREE.Color();
  const rows = 6;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rand() * 120;
    while (x < S) {
      const w = 70 + rand() * 80;
      col.copy(base).multiplyScalar(0.86 + rand() * 0.24);
      g.fillStyle = `#${col.getHexString()}`;
      g.fillRect(x + 2, r * rh + 2, w - 4, rh - 4);
      // wear: a few darker and lighter blotches
      for (let k = 0; k < 4; k++) {
        g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
        g.beginPath();
        g.ellipse(x + rand() * w, r * rh + rand() * rh, 6 + rand() * 18, 4 + rand() * 10, rand() * 3, 0, Math.PI * 2);
        g.fill();
      }
      // the same row continues past the right edge: wrap it so the tile repeats seamlessly
      if (x + w > S) {
        g.fillStyle = `#${col.getHexString()}`;
        g.fillRect(x + 2 - S, r * rh + 2, w - 4, rh - 4);
      }
      x += w;
    }
  }
  return done(c, true);
}

/**
 * the enchanted ceiling: the night sky outside, deep blue to the middle, paler towards the
 * walls, stars (a few bright, some in a band), thin drifting clouds; mapped onto a plane
 * stretched over the whole hall
 */
export function skyTexture(cfg: GreatHallConfig): THREE.CanvasTexture {
  const W = 2048, H = 1024;
  const [c, g] = canvas(W, H);
  const rand = rng(cfg.seed * 11 + 5);
  const grad = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.6);
  grad.addColorStop(0, cfg.skyTop);
  grad.addColorStop(1, cfg.skyLow);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // a faint band of the Milky Way across it
  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(-0.35);
  const band = g.createLinearGradient(0, -160, 0, 160);
  band.addColorStop(0, 'rgba(160,170,230,0)');
  band.addColorStop(0.5, 'rgba(160,170,230,0.12)');
  band.addColorStop(1, 'rgba(160,170,230,0)');
  g.fillStyle = band;
  g.fillRect(-W, -160, 2 * W, 320);
  g.restore();
  for (let i = 0; i < cfg.stars; i++) {
    const b = rand();
    const x = rand() * W, y = rand() * H;
    g.fillStyle = b > 0.96 ? '#fff4d6' : `rgba(235,240,255,${0.3 + 0.65 * b})`;
    const s = b > 0.96 ? 3 : 1 + b * 1.5;
    g.fillRect(x, y, s, s);
    if (b > 0.985) {
      g.fillStyle = 'rgba(255,244,214,0.35)';
      g.fillRect(x - 5, y + 1, 13, 1);
      g.fillRect(x + 1, y - 5, 1, 13);
    }
  }
  // thin clouds drifting across
  for (let i = 0; i < cfg.clouds; i++) {
    const x = rand() * W, y = rand() * H, w = 160 + rand() * 360, h = 30 + rand() * 50;
    const cg = g.createRadialGradient(x, y, 0, x, y, w / 2);
    cg.addColorStop(0, 'rgba(120,130,175,0.22)');
    cg.addColorStop(1, 'rgba(120,130,175,0)');
    g.fillStyle = cg;
    g.save();
    g.translate(x, y);
    g.scale(1, h / w);
    g.translate(-x, -y);
    g.beginPath();
    g.arc(x, y, w / 2, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  return done(c);
}
