import * as THREE from 'three';
import type { FighterTarget } from './FighterTarget';

/*
 * What a slow (Impedimenta) looks like on the fighter it caught: two cold blue rings turning
 * slowly round her legs, fading out as the slow wears off. Additive, no lights. All tuning here.
 */
const LOOK = {
  colour: new THREE.Color(0.35, 0.75, 1.0),
  rings: [{ y: 0.22, r: 0.3 }, { y: 0.62, r: 0.26 }],    // m: height and radius
  tube: 0.018,              // m
  opacity: 0.85,
  fadeIn: 0.12,             // s
};

export class SlowFx {
  private readonly group = new THREE.Group();
  private readonly mat: THREE.MeshBasicMaterial;
  private shown = 0;
  private t = 0;

  constructor(scene: THREE.Scene, private readonly target: FighterTarget) {
    this.mat = new THREE.MeshBasicMaterial({ color: LOOK.colour, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending });
    for (const r of LOOK.rings) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r.r, LOOK.tube, 6, 40), this.mat);
      m.rotation.x = Math.PI / 2;
      m.position.y = r.y;
      this.group.add(m);
    }
    this.group.name = 'slow_fx';
    this.group.visible = false;
    scene.add(this.group);
  }

  update(dt: number): void {
    const left = this.target.slowLeft;
    // in quickly, then out over the last second of the slow
    const goal = left > 0 ? Math.min(1, left) : 0;
    this.shown = goal > this.shown ? Math.min(goal, this.shown + dt / LOOK.fadeIn) : goal;
    this.group.visible = this.shown > 0.01;
    if (!this.group.visible) return;
    this.t += dt;
    const p = this.target.fighter.position;
    this.group.position.set(p.x, 0, p.z);
    this.group.children.forEach((c, i) => {
      c.rotation.z = this.t * (i ? -1.2 : 0.9);
      c.scale.setScalar(1 + 0.06 * Math.sin(this.t * 5 + i));
    });
    this.mat.opacity = LOOK.opacity * this.shown;
  }
}
