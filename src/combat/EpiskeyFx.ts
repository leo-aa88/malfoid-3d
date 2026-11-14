import * as THREE from 'three';
import type { Episkey } from './Episkey';

/*
 * What Episkey looks like: while she casts, a column of soft green-gold light rises round her
 * and a glow gathers at her chest; when the charm takes, both flare and fade; a broken cast
 * just fades. Two meshes, additive, no lights; see-through so she stays readable (and a
 * player can see the heal coming in time to break it). All tuning here.
 */
const LOOK = {
  colour: new THREE.Color(0.7, 1.0, 0.5),
  radius: 0.48,             // m: the column round her
  height: 1.9,              // m
  opacity: 0.4,             // the column at the end of the cast
  glow: 0.5,                // m: the chest glow's size at the end of the cast
  chest: 1.2,               // m: its height
  flash: 0.6,               // s: the flare when it heals
  fade: 0.25,               // s: a broken cast fades this fast
};

/** a vertical gradient: bright at the bottom, gone at the top, with faint streaks */
function columnTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 128);
  g.globalCompositeOperation = 'destination-out';
  for (let x = 0; x < 64; x += 8) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x + 4, 0, 3, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class EpiskeyFx {
  private readonly column: THREE.Mesh;
  private readonly glow: THREE.Sprite;
  private readonly colMat: THREE.MeshBasicMaterial;
  private readonly glowMat: THREE.SpriteMaterial;
  private shown = 0;            // 0..1 how much of the cast's light is up
  private flash = 0;            // 1 -> 0 after a heal
  private spin = 0;

  constructor(scene: THREE.Scene, private readonly charm: Episkey, private readonly owner: { position: THREE.Vector3 }) {
    this.colMat = new THREE.MeshBasicMaterial({ color: LOOK.colour, map: columnTexture(), transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.column = new THREE.Mesh(new THREE.CylinderGeometry(LOOK.radius, LOOK.radius * 1.15, LOOK.height, 24, 1, true), this.colMat);
    this.column.name = 'episkey_fx';
    this.glowMat = new THREE.SpriteMaterial({ color: LOOK.colour, map: glowTexture(), transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending });
    this.glow = new THREE.Sprite(this.glowMat);
    for (const o of [this.column, this.glow]) {
      o.visible = false;
      o.frustumCulled = false;
      scene.add(o);
    }
    const prev = charm.onHealed;
    charm.onHealed = (n) => {
      prev?.(n);
      this.flash = 1;
    };
  }

  update(dt: number): void {
    const c = this.charm;
    if (c.casting) this.shown = c.progress;
    else this.shown = Math.max(0, this.shown - dt / LOOK.fade);
    this.flash = Math.max(0, this.flash - dt / LOOK.flash);
    const k = Math.max(this.shown, this.flash);
    const on = k > 0.005;
    this.column.visible = this.glow.visible = on;
    if (!on) return;
    const p = this.owner.position;
    this.spin += dt * 0.6;
    this.colMat.map!.offset.x = this.spin;
    this.column.position.set(p.x, LOOK.height / 2, p.z);
    this.column.scale.set(1 + 0.25 * this.flash, 0.6 + 0.4 * this.shown + 0.2 * this.flash, 1 + 0.25 * this.flash);
    this.colMat.opacity = LOOK.opacity * this.shown + 0.35 * this.flash;
    this.glow.position.set(p.x, LOOK.chest, p.z);
    this.glow.scale.setScalar(LOOK.glow * (0.4 + 0.6 * this.shown) + 0.5 * this.flash);
    this.glowMat.opacity = 0.8 * this.shown + 0.6 * this.flash;
  }

  reset(): void {
    this.shown = 0;
    this.flash = 0;
    this.column.visible = this.glow.visible = false;
  }
}
