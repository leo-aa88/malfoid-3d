import * as THREE from 'three';
import type { FighterTarget } from './FighterTarget';

/*
 * What Confundo looks like on the fighter it caught: little stars circling above her head (the
 * classic dizzy sign), alternately lilac and gold, bobbing as they go round, fading out as the
 * confusion wears off. Additive sprites, no lights. All tuning here.
 */
const LOOK = {
  stars: 4,
  colours: [new THREE.Color(0.85, 0.55, 1.0), new THREE.Color(1.0, 0.85, 0.4)],
  size: 0.085,              // m
  radius: 0.17,             // m round the head
  above: 0.16,              // m above the face's centre
  spin: 3.2,                // rad/s
  bob: 0.025,               // m
  opacity: 0.95,
  fadeIn: 0.1,              // s
};

/** a soft four-point star (generated: no texture files) */
function starTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const glow = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,255,255,1)';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 ? s * 0.09 : s * 0.46;
    g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ConfusionFx {
  private readonly group = new THREE.Group();
  private readonly mats: THREE.SpriteMaterial[] = [];
  private readonly sprites: THREE.Sprite[] = [];
  private readonly head = new THREE.Vector3();
  private shown = 0;
  private t = 0;

  constructor(scene: THREE.Scene, private readonly target: FighterTarget) {
    const map = starTexture();
    for (const colour of LOOK.colours) {
      this.mats.push(new THREE.SpriteMaterial({ map, color: colour, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending }));
    }
    for (let i = 0; i < LOOK.stars; i++) {
      const sp = new THREE.Sprite(this.mats[i % this.mats.length]);
      sp.scale.setScalar(LOOK.size);
      sp.renderOrder = 6;
      this.sprites.push(sp);
      this.group.add(sp);
    }
    this.group.name = 'confusion_fx';
    this.group.visible = false;
    scene.add(this.group);
  }

  update(dt: number): void {
    const left = this.target.confusedLeft;
    const goal = left > 0 ? Math.min(1, left) : 0;
    this.shown = goal > this.shown ? Math.min(goal, this.shown + dt / LOOK.fadeIn) : goal;
    this.group.visible = this.shown > 0.01;
    if (!this.group.visible) return;
    this.t += dt;
    this.target.fighter.facePosition(this.head);
    this.group.position.set(this.head.x, this.head.y + LOOK.above, this.head.z);
    this.sprites.forEach((sp, i) => {
      const a = this.t * LOOK.spin + (i * 2 * Math.PI) / LOOK.stars;
      sp.position.set(Math.cos(a) * LOOK.radius, Math.sin(this.t * 6 + i * 1.7) * LOOK.bob, Math.sin(a) * LOOK.radius);
      sp.scale.setScalar(LOOK.size * (0.85 + 0.15 * Math.sin(this.t * 9 + i)));
    });
    for (const m of this.mats) m.opacity = LOOK.opacity * this.shown;
  }
}
