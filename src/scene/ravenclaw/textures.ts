import * as THREE from 'three';
import { rng } from '../forest/random';
import type { RavenclawConfig } from './config';

/*
 * The common room's generated textures (canvas, no files): the round carpet, the floorboards,
 * the painted dome and the night outside the windows.
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

/** a star with n points (outer radius r, inner ri) */
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, ri: number, n: number, rot = -Math.PI / 2): void {
  g.beginPath();
  for (let i = 0; i < 2 * n; i++) {
    const a = rot + (i * Math.PI) / n;
    const rr = i % 2 ? ri : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** the round carpet: midnight blue, rings of bronze stars, a bronze border, a star rosette in the middle */
export function carpetTexture(cfg: RavenclawConfig): THREE.CanvasTexture {
  const S = 1024, C = S / 2;
  const [c, g] = canvas(S, S);
  const rand = rng(cfg.seed * 7 + 1);
  g.fillStyle = cfg.carpetColour;
  g.fillRect(0, 0, S, S);
  // a faint weave: light and dark flecks
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
    g.fillRect(rand() * S, rand() * S, 2, 2);
  }
  g.fillStyle = cfg.carpetBorder;
  g.strokeStyle = cfg.carpetBorder;
  // the border: a broad band and a thin ring inside it
  g.lineWidth = 18;
  g.beginPath();
  g.arc(C, C, C * 0.955, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.arc(C, C, C * 0.9, 0, Math.PI * 2);
  g.stroke();
  // rings of small stars, and a ring of larger ones
  g.fillStyle = cfg.carpetStar;
  for (const [rr, n, size] of [[0.8, 28, 9], [0.62, 20, 13], [0.42, 14, 9]] as [number, number, number][]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rr;
      star(g, C + Math.cos(a) * C * rr, C + Math.sin(a) * C * rr, size, size * 0.4, 5, a);
    }
  }
  // the rosette: an eight-pointed bronze star in two layers
  star(g, C, C, C * 0.2, C * 0.07, 8);
  g.fillStyle = cfg.carpetColour;
  star(g, C, C, C * 0.11, C * 0.045, 8, -Math.PI / 2 + Math.PI / 8);
  g.fillStyle = cfg.carpetStar;
  g.beginPath();
  g.arc(C, C, C * 0.03, 0, Math.PI * 2);
  g.fill();
  return done(c);
}

/** dark polished floorboards (repeated) */
export function floorTexture(cfg: RavenclawConfig): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  const rand = rng(cfg.seed * 3 + 5);
  const base = new THREE.Color(cfg.floorColour);
  const col = new THREE.Color();
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    let x = -rand() * S;
    while (x < S) {
      const len = S * (0.35 + rand() * 0.5);
      col.copy(base).multiplyScalar(0.85 + rand() * 0.3);
      g.fillStyle = `#${col.getHexString()}`;
      g.fillRect(x, (r * S) / rows, len, S / rows);
      // grain
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let k = 0; k < 6; k++) g.fillRect(x, (r * S) / rows + rand() * (S / rows), len, 1);
      g.fillStyle = 'rgba(20,10,5,0.6)';
      g.fillRect(x, (r * S) / rows, 2, S / rows);
      x += len;
    }
    g.fillStyle = 'rgba(15,8,4,0.7)';
    g.fillRect(0, (r * S) / rows, S, 2);
  }
  return done(c, true);
}

/** the painted dome (mapped onto a hemisphere: v = 1 at the top): deep blue to the crown, stars */
export function domeTexture(cfg: RavenclawConfig): THREE.CanvasTexture {
  const W = 2048, H = 512;
  const [c, g] = canvas(W, H);
  const rand = rng(cfg.seed * 11 + 3);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, cfg.domeTop);
  grad.addColorStop(1, cfg.domeBase);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // stars: many small, a few bright gold ones with rays
  for (let i = 0; i < cfg.domeStars; i++) {
    const x = rand() * W, y = rand() * H * 0.97;
    const b = rand();
    g.fillStyle = b > 0.92 ? '#f2d38a' : `rgba(240,240,255,${0.35 + 0.6 * b})`;
    const s = b > 0.92 ? 2.6 : 1 + b * 1.2;
    g.fillRect(x, y, s, s);
    if (b > 0.97) star(g, x + 1, y + 1, 9, 1.6, 4);
  }
  // a few constellations: faint lines between bright stars
  g.strokeStyle = 'rgba(210,180,120,0.25)';
  g.lineWidth = 1.5;
  for (let k = 0; k < 9; k++) {
    let x = rand() * W, y = H * (0.15 + rand() * 0.6);
    g.beginPath();
    g.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (rand() - 0.5) * 140;
      y += (rand() - 0.5) * 80;
      g.lineTo(x, y);
      g.fillStyle = '#f2d38a';
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    g.stroke();
  }
  return done(c);
}

/** the night outside, on a cylinder round the tower: stars, a moon, the mountains' silhouette */
export function nightTexture(cfg: RavenclawConfig): THREE.CanvasTexture {
  const W = 2048, H = 512;
  const [c, g] = canvas(W, H);
  const rand = rng(cfg.seed * 13 + 7);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, cfg.skyTop);
  grad.addColorStop(0.75, cfg.skyHorizon);
  grad.addColorStop(1, cfg.skyHorizon);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 700; i++) {
    const b = rand();
    g.fillStyle = `rgba(235,240,255,${0.3 + 0.7 * b})`;
    const s = 1 + b * 1.4;
    g.fillRect(rand() * W, rand() * H * 0.72, s, s);
  }
  // the moon, with a soft halo
  const mx = W * 0.62, my = H * 0.24;
  const halo = g.createRadialGradient(mx, my, 0, mx, my, 90);
  halo.addColorStop(0, 'rgba(244,240,220,0.5)');
  halo.addColorStop(1, 'rgba(244,240,220,0)');
  g.fillStyle = halo;
  g.fillRect(mx - 90, my - 90, 180, 180);
  g.fillStyle = cfg.moon;
  g.beginPath();
  g.arc(mx, my, 22, 0, Math.PI * 2);
  g.fill();
  // the mountains: two ranges, the nearer darker
  for (const [base, amp, colour, step] of [[0.72, 0.16, '#16204a', 0.012], [0.8, 0.13, cfg.mountainColour, 0.02]] as [number, number, string, number][]) {
    g.fillStyle = colour;
    g.beginPath();
    g.moveTo(0, H);
    let y = H * base;
    for (let x = 0; x <= W; x += W * step) {
      y = Math.min(H * 0.95, Math.max(H * (base - amp), y + (rand() - 0.5) * H * amp * 0.8));
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  }
  return done(c);
}
