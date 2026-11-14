import * as THREE from 'three';
import type { Episkey } from './Episkey';

/*
 * What Episkey looks like: the charm is instantaneous, so the heal is a flare: a column of soft
 * green-gold light rises round her and a glow blooms at her chest, then both fade. Two meshes,
 * additive, no lights; see-through so she stays readable. All tuning here.
 */
const LOOK = {
  colour: new THREE.Color(0.7, 1.0, 0.5),
  radius: 0.48,             // m: the column round her
  height: 1.9,              // m
  opacity: 0.45,            // the column at its brightest
  glow: 0.7,                // m: the chest glow's size at its brightest
  chest: 1.2,               // m: its height
  flash: 0.9,               // s: the flare lasts this long
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
  private flash = 0;            // 1 -> 0 after a heal
  private spin = 0;

  constructor(scene: THREE.Scene, charm: Episkey, private readonly owner: { position: THREE.Vector3 }) {
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
    this.flash = Math.max(0, this.flash - dt / LOOK.flash);
    const f = this.flash;
    const on = f > 0.005;
    this.column.visible = this.glow.visible = on;
    if (!on) return;
    const p = this.owner.position;
    this.spin += dt * 0.6;
    this.colMat.map!.offset.x = this.spin;
    this.column.position.set(p.x, LOOK.height / 2, p.z);
    // the column rises as it fades (quick in, slow out), the glow blooms and fades
    const rise = 1 - f;
    this.column.scale.set(1 + 0.15 * rise, 0.6 + 0.6 * Math.sqrt(rise), 1 + 0.15 * rise);
    this.column.position.y = LOOK.height / 2 * this.column.scale.y;
    this.colMat.opacity = LOOK.opacity * Math.min(1, f * 1.6);
    this.glow.position.set(p.x, LOOK.chest, p.z);
    this.glow.scale.setScalar(LOOK.glow * (0.5 + 0.5 * rise));
    this.glowMat.opacity = 0.7 * f;
  }

  reset(): void {
    this.flash = 0;
    this.column.visible = this.glow.visible = false;
  }
}
