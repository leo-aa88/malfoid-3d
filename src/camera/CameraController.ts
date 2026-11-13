import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** what the camera follows each frame */
export interface FollowInfo {
  /** the player's facing (rad) and ground speed (m/s): the camera swings round behind her while she moves */
  heading: number;
  speed: number;
  /** a second fighter to keep in frame (duel): the camera looks at both from the side */
  other?: THREE.Vector3 | null;
}

/** after the last drag / wheel the camera leaves the view alone for this long (s) */
const MANUAL_HOLD = 1.6;
/** rad/s the orbit turns towards behind her at full running speed */
const FOLLOW_RATE = 1.4;
const RUN_SPEED = 2.9;
/** rad/s towards the side-on duel view */
const DUEL_RATE = 2.2;
/** the duel view is shifted so the pair sits right of the HUD panel (fraction of half the screen width) */
const HUD_SHIFT = 0.16;

/**
 * Orbit / pan / zoom camera that follows the player. It adjusts on its own as she moves:
 * it eases round behind her while she walks or runs, and in a duel it keeps both fighters in
 * frame from the side. Dragging (orbit), right-drag (pan) and the wheel (zoom) take over and
 * hold the view for a moment. Camera input never touches the character's idle timer.
 */
export class CameraController {
  readonly controls: OrbitControls;
  private readonly lastAnchor = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly initialOffset = new THREE.Vector3(0.0, 0.25, 3.6);
  private readonly initialTargetHeight = 0.95;
  private readonly offset = new THREE.Vector3();
  private readonly want = new THREE.Vector3();
  private dragging = false;
  private sinceUser = 99;
  private clock = performance.now();

  constructor(private readonly camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.3;      // close enough to inspect the face
    this.controls.maxDistance = 18.0;     // the duel view pulls back to keep both fighters in frame
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.5 - 0.02;   // never below the floor
    this.controls.zoomSpeed = 0.9;
    this.controls.zoomToCursor = true;     // wheel towards the face to inspect it
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.addEventListener('start', () => {
      this.dragging = true;
      this.sinceUser = 0;
    });
    this.controls.addEventListener('end', () => {
      this.dragging = false;
      this.sinceUser = 0;
    });
    dom.addEventListener('wheel', () => (this.sinceUser = 0), { passive: true });
  }

  /** the user is orbiting / panning / zooming, or did so a moment ago */
  get manual(): boolean {
    return this.dragging || this.sinceUser < MANUAL_HOLD;
  }

  /** place the camera in front of the character */
  reset(anchor: THREE.Vector3): void {
    this.controls.target.set(anchor.x, anchor.y + this.initialTargetHeight, anchor.z);
    this.camera.position.copy(this.controls.target).add(this.initialOffset);
    this.lastAnchor.copy(anchor);
    this.sinceUser = 99;
    this.controls.update();
  }

  /** the duel's look-at point: the pair's midpoint, moved left so they show right of the HUD */
  private duelTarget(mid: THREE.Vector3, yaw: number, dist: number, out: THREE.Vector3): THREE.Vector3 {
    const halfW = dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect;
    // the camera's right on the ground, for a camera at yaw looking back at the target
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    return out.set(mid.x - rx * halfW * HUD_SHIFT, mid.y, mid.z - rz * halfW * HUD_SHIFT);
  }

  /** cut straight to the side-on view of two fighters (a duel starts) */
  frame(a: THREE.Vector3, b: THREE.Vector3): void {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const sep = Math.hypot(dx, dz);
    const line = Math.atan2(dx, dz);
    const dist = THREE.MathUtils.clamp(sep * 1.15 + 2.6, 3.6, 16);
    const yaw = line - Math.PI / 2;          // a on the left, b on the right
    this.duelTarget(new THREE.Vector3(a.x + dx / 2, a.y + this.initialTargetHeight, a.z + dz / 2), yaw, dist, this.controls.target);
    const h = this.initialOffset.y / this.initialOffset.length();
    this.camera.position.set(Math.sin(yaw) * dist, h * dist, Math.cos(yaw) * dist).add(this.controls.target);
    this.lastAnchor.copy(a);
    this.sinceUser = 99;
    this.controls.update();
  }

  /** follow the character (keeps the user's orbit, pan and zoom) and adjust the view on its own */
  update(anchor: THREE.Vector3, follow?: FollowInfo): void {
    const now = performance.now();
    const dt = Math.min((now - this.clock) / 1000, 0.1);
    this.clock = now;
    this.sinceUser += dt;
    this.delta.subVectors(anchor, this.lastAnchor);
    if (this.delta.lengthSq() > 0) {
      this.controls.target.add(this.delta);
      this.camera.position.add(this.delta);
      this.lastAnchor.copy(anchor);
    }
    if (follow && !this.manual) this.adjust(anchor, follow, dt);
    this.controls.update();
  }

  private adjust(anchor: THREE.Vector3, f: FollowInfo, dt: number): void {
    const t = this.controls.target;
    this.offset.subVectors(this.camera.position, t);
    const horiz = Math.hypot(this.offset.x, this.offset.z);
    let yaw = Math.atan2(this.offset.x, this.offset.z);
    let wantYaw: number | null = null;
    let rate = 0;
    if (f.other) {
      // duel: from the side of the line between them, looking at the middle, both in frame
      const dx = f.other.x - anchor.x;
      const dz = f.other.z - anchor.z;
      const sep = Math.hypot(dx, dz);
      const line = Math.atan2(dx, dz);
      const a = line + Math.PI / 2;
      const b = line - Math.PI / 2;
      wantYaw = Math.abs(angDiff(a, yaw)) < Math.abs(angDiff(b, yaw)) ? a : b;
      rate = DUEL_RATE;
      const wantDist = THREE.MathUtils.clamp(sep * 1.15 + 2.6, 3.6, 16);
      this.duelTarget(this.want.set(anchor.x + dx / 2, anchor.y + this.initialTargetHeight, anchor.z + dz / 2), wantYaw, wantDist, this.want);
      const k = 1 - Math.exp(-3.0 * dt);
      t.lerp(this.want, k);
      const len = this.offset.length();
      this.offset.setLength(len + (wantDist - len) * k);
      yaw = Math.atan2(this.offset.x, this.offset.z);
    } else {
      // pans drift back onto her once she moves, so she stays centred
      if (f.speed > 0.2) {
        this.want.set(anchor.x, anchor.y + this.initialTargetHeight, anchor.z);
        t.lerp(this.want, 1 - Math.exp(-2.0 * dt));
      }
      if (f.speed > 0.3) {
        wantYaw = f.heading + Math.PI;                       // behind her
        rate = FOLLOW_RATE * Math.min(f.speed / RUN_SPEED, 1);
      }
    }
    if (wantYaw !== null) {
      const d = angDiff(wantYaw, yaw);
      const step = Math.sign(d) * Math.min(Math.abs(d), rate * dt * (0.35 + 0.65 * Math.min(Math.abs(d), 1)));
      yaw += step;
      const h = Math.hypot(this.offset.x, this.offset.z) || horiz;
      this.offset.x = Math.sin(yaw) * h;
      this.offset.z = Math.cos(yaw) * h;
    }
    this.camera.position.copy(t).add(this.offset);
  }

  /** horizontal direction from the target to the camera (rad): makes WASD camera-relative */
  getYaw(): number {
    return Math.atan2(
      this.camera.position.x - this.controls.target.x,
      this.camera.position.z - this.controls.target.z,
    );
  }
}

function angDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
