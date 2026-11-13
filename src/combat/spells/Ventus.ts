import * as THREE from 'three';
import type { SpellDef, SpellFx } from './SpellSystem';
import type { SpellEmitter } from './SpellEmitter';
import type { Impact, Projectile } from './Projectile';
import { ParticlePool } from './fx/ParticlePool';

/*
 * Ventus (Cho's wind blast): a short-range gust from a sweep of the wand that throws the
 * opponent back. It flies as a wide, short-lived projectile, so it uses the spell system's
 * swept collision (trees stop it), cooldowns and ownership like any bolt. Little damage, a
 * strong knockback: a tool for breaking close pressure, not an escape on demand.
 * All tuning here.
 */
export const VENTUS_COOLDOWN = 7.0;            // s, from the release
export const VENTUS_RANGE = 3.6;               // m: the gust dies out after this
export const VENTUS_SPEED = 12.0;              // m/s (0.3 s to its full range)
export const VENTUS_RADIUS = 0.55;             // m: a wide front (anyone within ~0.7 m of its line)
export const VENTUS_DAMAGE = 3;
export const VENTUS_KNOCKBACK = 4.6;           // m/s slide given to the target (a strong shove)
export const VENTUS_RELEASE = 0.34;            // s into the cast_ventus clip (combat.VENTUS_RELEASE)

export const VENTUS: SpellDef = {
  id: 'ventus',
  name: 'Ventus',
  key: '',
  clip: 'cast_ventus',
  castDuration: 0.70,
  release: VENTUS_RELEASE,
  cooldown: VENTUS_COOLDOWN,
  projectile: { speed: VENTUS_SPEED, radius: VENTUS_RADIUS, maxRange: VENTUS_RANGE },
  directDamage: VENTUS_DAMAGE,
  splashDamage: 0,
  explosionRadius: 0,
  directKnockback: VENTUS_KNOCKBACK,
  splashKnockback: 0,
  faceAngle: (100 * Math.PI) / 180,
  aimAngle: (70 * Math.PI) / 180,
  aimRange: VENTUS_RANGE,
  hitEffect: 'knockback',
};

/** the look of the gust (pale wind, readable but see-through: the fighters stay visible) */
const GUST = {
  colour: new THREE.Color(0.82, 0.92, 1.0),
  opacity: 0.32,               // the cone at its strongest
  startRadius: 0.18,           // m at the wand
  endRadius: 0.95,             // m at full range
  fade: 0.22,                  // s for the cone to fade after the gust ends
  streaksPerMetre: 9,          // wind-streak particles spawned along the path
  maxGusts: 2,
};

function streakTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  // streaks along the cone (u round it, v along it), brighter towards the open end
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * c.width;
    const w = 1 + Math.random() * 3;
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.6, `rgba(255,255,255,${0.35 + Math.random() * 0.5})`);
    grad.addColorStop(1, 'rgba(255,255,255,0.1)');
    g.fillStyle = grad;
    g.fillRect(x, 0, w, c.height);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** pooled visuals of the gust: a swirling translucent cone that opens along its path, wind streaks */
export class VentusFx implements SpellFx {
  readonly particles = new ParticlePool(400);
  private readonly root = new THREE.Group();
  private readonly cones: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; id: number; from: THREE.Vector3; fade: number }[] = [];
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly z = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene) {
    this.root.name = 'ventus_fx';
    scene.add(this.root);
    this.root.add(this.particles.points);
    // an open cone, apex at the origin, opening along +z, one unit long and one unit wide
    const geo = new THREE.CylinderGeometry(1, 0.0, 1, 28, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const tex = streakTexture();
    for (let i = 0; i < GUST.maxGusts; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: GUST.colour, map: tex, transparent: true, opacity: 0, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.cones.push({ mesh, mat, id: -1, from: new THREE.Vector3(), fade: 0 });
    }
  }

  setView(camera: THREE.PerspectiveCamera, viewportHeightPx: number): void {
    this.particles.setScale(viewportHeightPx, camera.fov);
  }

  /** debugging / tests: how much is alive */
  stats(): { particles: number; gusts: number } {
    return { particles: this.particles.count, gusts: this.cones.filter((c) => c.mesh.visible).length };
  }

  castStart(): void {}

  castUpdate(_def: SpellDef, emitter: SpellEmitter, k: number): void {
    // air gathering round the wand tip, swirling in
    emitter.getWorldPosition(this.p);
    if (Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.12 + 0.1 * Math.random();
      this.particles.spawn({
        x: this.p.x + Math.cos(a) * r, y: this.p.y + Math.sin(a) * r * 0.6, z: this.p.z + Math.sin(a) * r,
        vx: -Math.cos(a) * r * 3, vy: 0.1, vz: -Math.sin(a) * r * 3,
        r: GUST.colour.r, g: GUST.colour.g, b: GUST.colour.b, size: 0.03 + 0.03 * k, sizeEnd: 0.01, life: 0.2, drag: 1, alpha: 0.6,
      });
    }
  }

  castEnd(): void {}

  projectileStart(_def: SpellDef, p: Projectile): void {
    const c = this.cones.find((x) => x.id < 0 && x.fade <= 0) ?? this.cones[0];
    c.id = p.id;
    c.from.copy(p.position);
    c.fade = 0;
    c.mesh.visible = true;
    c.mat.opacity = GUST.opacity;
    this.place(c, p.position, p.direction);
  }

  projectileUpdate(_def: SpellDef, p: Projectile): void {
    const c = this.cones.find((x) => x.id === p.id);
    if (!c) return;
    this.place(c, p.position, p.direction);
    c.mat.opacity = GUST.opacity * (1 - 0.5 * Math.min(1, p.travelled / VENTUS_RANGE));
    // wind streaks across the front of the gust, rushing on ahead
    const n = Math.max(2, Math.round(p.previous.distanceTo(p.position) * GUST.streaksPerMetre));
    const w = GUST.startRadius + (GUST.endRadius - GUST.startRadius) * Math.min(1, p.travelled / VENTUS_RANGE);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = w * Math.sqrt(Math.random());
      const side = this.p.set(-p.direction.z, 0, p.direction.x).multiplyScalar(Math.cos(a) * r);
      this.particles.spawn({
        x: p.position.x + side.x, y: p.position.y + Math.sin(a) * r * 0.7, z: p.position.z + side.z,
        vx: p.direction.x * 7, vy: 0.2, vz: p.direction.z * 7,
        r: GUST.colour.r, g: GUST.colour.g, b: GUST.colour.b, size: 0.05, sizeEnd: 0.012, life: 0.24, drag: 3, alpha: 0.55,
      });
    }
  }

  projectileEnd(_def: SpellDef, p: Projectile, impact: Impact): void {
    const c = this.cones.find((x) => x.id === p.id);
    if (c) {
      c.id = -1;
      c.fade = GUST.fade;
    }
    // the gust breaks on what it hit (a fighter, a trunk) or simply dies out
    for (let i = 0; i < (impact.kind === 'range' ? 8 : 18); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1 + Math.random() * 2;
      this.particles.spawn({
        x: impact.point.x, y: impact.point.y, z: impact.point.z,
        vx: Math.cos(a) * v + p.direction.x * 2, vy: Math.random() * 0.8, vz: Math.sin(a) * v + p.direction.z * 2,
        r: GUST.colour.r, g: GUST.colour.g, b: GUST.colour.b, size: 0.06, sizeEnd: 0.01, life: 0.3, drag: 3, alpha: 0.5,
      });
    }
  }

  update(dt: number): void {
    this.particles.update(dt);
    for (const c of this.cones) {
      if (c.id >= 0 || c.fade <= 0) continue;
      c.fade -= dt;
      c.mat.opacity = GUST.opacity * 0.5 * Math.max(0, c.fade / GUST.fade);
      if (c.fade <= 0) c.mesh.visible = false;
    }
  }

  /** the cone from where the gust left to where its front is now, opening as it goes */
  private place(c: { mesh: THREE.Mesh; from: THREE.Vector3 }, front: THREE.Vector3, dir: THREE.Vector3): void {
    const len = Math.max(0.05, c.from.distanceTo(front));
    const w = GUST.startRadius + (GUST.endRadius - GUST.startRadius) * Math.min(1, len / VENTUS_RANGE);
    c.mesh.position.copy(c.from);
    c.mesh.quaternion.copy(this.q.setFromUnitVectors(this.z, dir));
    c.mesh.scale.set(w, w * 0.75, len);
    c.mesh.rotateZ(len * 2.0);                 // a slow twist as it travels (the streaks swirl)
  }
}
