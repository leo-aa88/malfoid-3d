import * as THREE from 'three';
import type { Protego } from './Protego';
import { PROTEGO } from './Protego';

/** a filled shield: faint across the middle, brightening to a rim */
function shieldTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = 128;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0.0, 'rgba(255,255,255,0.22)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.32)');
  grad.addColorStop(0.82, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.92, 'rgba(255,255,255,1)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  // faint concentric bands: it reads as a charm, not a pane of glass
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 3;
  for (const k of [0.3, 0.5, 0.68]) {
    g.beginPath();
    g.arc(r, r, r * k, 0, Math.PI * 2);
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}

/*
 * What Protego looks like: a translucent pale-blue dome before her chest while the shield is
 * up, flaring when it stops a spell and flashing gold on a perfect parry. One mesh per
 * shield, no lights; see-through so both fighters stay readable. All tuning here.
 */
const LOOK = {
  radius: 0.62,                 // m
  forward: 0.42,                // m in front of her
  height: 1.18,                 // m: chest height
  opacity: 0.45,                // while up
  flashOpacity: 0.75,
  colour: new THREE.Color(0.62, 0.82, 1.0),
  parryColour: new THREE.Color(1.0, 0.88, 0.45),
  /** the dome fades in this fast as it is raised (s) */
  rise: 0.08,
};

export class ProtegoFx {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private shown = 0;

  constructor(scene: THREE.Scene, private readonly shield: Protego, private readonly owner: { position: THREE.Vector3; facingAngle: number }) {
    // a shallow spherical cap facing +z; the texture maps on it as a disc seen from the front
    const geo = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.32).rotateX(Math.PI / 2);
    const uv = geo.getAttribute('uv');
    const pos = geo.getAttribute('position');
    const span = Math.sin(Math.PI * 0.32);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / span / 2, 0.5 + pos.getY(i) / span / 2);
    this.mat = new THREE.MeshBasicMaterial({ color: LOOK.colour.clone(), map: shieldTexture(), transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'protego_fx';
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** once per frame, after the fighters moved */
  update(dt: number): void {
    const s = this.shield;
    const goal = s.up ? 1 : 0;
    this.shown += (goal - this.shown) * (1 - Math.exp(-dt / LOOK.rise));
    if (this.shown < 0.01 && s.flash <= 0) {
      this.mesh.visible = false;
      return;
    }
    const a = this.owner.facingAngle;
    const p = this.owner.position;
    this.mesh.visible = true;
    this.mesh.position.set(p.x + Math.sin(a) * LOOK.forward, LOOK.height, p.z + Math.cos(a) * LOOK.forward);
    this.mesh.rotation.set(0, a, 0);
    // the perfect window shows as a brighter, tighter dome; a stopped spell flares it
    const fresh = s.up && s.age <= PROTEGO.perfectWindow ? 1 : 0;
    const k = 1 + 0.12 * s.flash;
    this.mesh.scale.setScalar(LOOK.radius * k * (0.9 + 0.1 * this.shown));
    this.mat.color.copy(LOOK.colour).lerp(LOOK.parryColour, s.parried ? s.flash : 0.25 * fresh);
    this.mat.opacity = LOOK.opacity * this.shown * (1 + 0.4 * fresh) + LOOK.flashOpacity * s.flash;
  }
}
