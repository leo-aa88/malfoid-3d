import * as THREE from 'three';
import type { CameraLimit } from '../scene/arena';
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
/** speaker close-ups: camera distance (m) and height above the face (m), angle off her front (rad) */
const CLOSE_UP = { distance: 0.85, height: 0.02, angle: 0.28 };
/** the duel view is shifted so the pair sits right of the HUD panel (fraction of half the screen width) */
const HUD_SHIFT = 0.16;
/**
 * a duel view an arena's walls keep from backing off far enough widens its field of view instead
 * (the camera never climbs to get the distance): up to this vertical fov (deg), eased at FOV_RATE
 * (1/s). The scene's own fov (32 deg) is the normal one.
 */
const MAX_FOV = 60;
/** the HUD panel on the left: the fighter nearer it is kept this much (fraction of half the
 *  screen width) clear of its edge, counting her body's half width (m) beyond her centre */
const HUD_CLEAR = 0.06;
const BODY_HALF = 0.3;
const FOV_RATE = 3.0;

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
  /** the scene's normal vertical fov (deg) */
  private readonly baseFov: number;
  /** the distance the duel view wants this frame (m) */
  private duelDist = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.baseFov = camera.fov;
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
    this.setFov(this.baseFov);
    this.controls.update();
  }

  private setFov(fov: number): void {
    if (Math.abs(fov - this.camera.fov) < 1e-4) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * keep the camera inside the arena's limit, at the same pitch: the limit pulls it in towards
   * the target, and its height comes down in proportion (keeping it put let the duel view's
   * distance push climb it above the greenhouse roof)
   */
  private clampToLimit(t: THREE.Vector3): void {
    if (!this.limit) return;
    const p = this.camera.position;
    const h0 = Math.hypot(p.x - t.x, p.z - t.z), y0 = p.y - t.y;
    this.limit.clamp(p, t);
    const h1 = Math.hypot(p.x - t.x, p.z - t.z);
    if (h0 > 1e-6 && h1 < h0 - 1e-6) p.y = Math.max(t.y, t.y + (y0 * h1) / h0);
    const floor = this.limit.minY?.(p.x, p.z) ?? 0;
    if (p.y < floor) p.y = floor;
  }

  /** the fov that shows at the camera's distance what the normal fov would at `want` (m) */
  private fovFor(want: number): number {
    const have = this.camera.position.distanceTo(this.controls.target);
    if (have >= want - 1e-3 || have < 1e-3) return this.baseFov;
    const half = Math.atan((Math.tan(THREE.MathUtils.degToRad(this.baseFov) / 2) * want) / have);
    return Math.min(MAX_FOV, THREE.MathUtils.radToDeg(2 * half));
  }

  /** the fraction of the screen's width the HUD panel covers on the left (the page sets it) */
  leftCover = 0;

  /**
   * the duel's look-at point: the pair's midpoint, moved left so they show right of the HUD: at
   * least HUD_SHIFT, more when the fighter nearer the panel (a, b: the fighters) would be under
   * it (a small window, a long range), as far as the other still fits on the right
   */
  private duelTarget(mid: THREE.Vector3, yaw: number, dist: number, out: THREE.Vector3,
    a?: THREE.Vector3, b?: THREE.Vector3): THREE.Vector3 {
    const halfW = dist * Math.tan(THREE.MathUtils.degToRad(this.baseFov) / 2) * this.camera.aspect;
    // the camera's right on the ground, for a camera at yaw looking back at the target
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    let shift = halfW * HUD_SHIFT;
    if (a && b && this.leftCover > 0) {
      const ua = (a.x - mid.x) * rx + (a.z - mid.z) * rz;
      const ub = (b.x - mid.x) * rx + (b.z - mid.z) * rz;
      const edge = (-1 + 2 * this.leftCover + HUD_CLEAR) * halfW;
      const need = edge - Math.min(ua, ub) + BODY_HALF;
      const room = 0.95 * halfW - Math.max(ua, ub) - BODY_HALF;
      shift = Math.max(shift, Math.min(need, room));
    }
    return out.set(mid.x - rx * shift, mid.y, mid.z - rz * shift);
  }

  /** an arena's limit on where the camera may stand (the pitch's stands); null: anywhere */
  limit: CameraLimit | null = null;

  /** cut straight to the side-on view of two fighters (a duel starts) */
  frame(a: THREE.Vector3, b: THREE.Vector3): void {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const sep = Math.hypot(dx, dz);
    const line = Math.atan2(dx, dz);
    const dist = THREE.MathUtils.clamp(sep * 1.15 + 2.6, 3.6, 16);
    let yaw = line - Math.PI / 2;            // a on the left, b on the right
    // ...unless that side is in an arena's stands: watch from the open side
    const mx = a.x + dx / 2, mz = a.z + dz / 2;
    if (this.limit && !this.limit.inside(mx + Math.sin(yaw) * dist * 0.9, mz + Math.cos(yaw) * dist * 0.9)
        && this.limit.inside(mx - Math.sin(yaw) * dist * 0.9, mz - Math.cos(yaw) * dist * 0.9)) yaw += Math.PI;
    this.duelTarget(new THREE.Vector3(a.x + dx / 2, a.y + this.initialTargetHeight, a.z + dz / 2), yaw, dist, this.controls.target, a, b);
    const h = this.initialOffset.y / this.initialOffset.length();
    this.camera.position.set(Math.sin(yaw) * dist, h * dist, Math.cos(yaw) * dist).add(this.controls.target);
    this.clampToLimit(this.controls.target);
    this.setFov(this.fovFor(dist));
    this.lastAnchor.copy(a);
    this.sinceUser = 99;
    this.controls.update();
  }

  /**
   * cut to a close-up of a speaker: head and shoulders from 3/4 front, on the side the camera
   * is already on (the duel's voice lines; follow nothing while it is held)
   */
  closeUp(face: THREE.Vector3, facing: number): void {
    const cur = this.getYaw();
    const a = facing + CLOSE_UP.angle;
    const b = facing - CLOSE_UP.angle;
    const yaw = Math.abs(angDiff(a, cur)) < Math.abs(angDiff(b, cur)) ? a : b;
    this.controls.target.copy(face);
    this.camera.position.set(Math.sin(yaw) * CLOSE_UP.distance, CLOSE_UP.height, Math.cos(yaw) * CLOSE_UP.distance).add(face);
    this.sinceUser = 99;
    this.setFov(this.baseFov);
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
    this.duelDist = 0;
    if (follow && !this.manual) this.adjust(anchor, follow, dt);
    // the field of view: widened while walls hold the duel view in, normal otherwise (paused or
    // held by the user: left as it is)
    if (follow && !this.manual) {
      const want = this.duelDist > 0 ? this.fovFor(this.duelDist) : this.baseFov;
      this.setFov(this.camera.fov + (want - this.camera.fov) * (1 - Math.exp(-FOV_RATE * dt)));
    }
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
      this.duelDist = wantDist;
      // near the edge of an arena: watch from the side that has room (not from inside the stands)
      if (this.limit) {
        const mx = (anchor.x + f.other.x) / 2, mz = (anchor.z + f.other.z) / 2;
        const room = (w: number) => this.limit!.inside(mx + Math.sin(w) * wantDist * 0.9, mz + Math.cos(w) * wantDist * 0.9);
        const other = wantYaw === a ? b : a;
        if (!room(wantYaw) && room(other)) wantYaw = other;
      }
      this.duelTarget(this.want.set(anchor.x + dx / 2, anchor.y + this.initialTargetHeight, anchor.z + dz / 2), wantYaw, wantDist, this.want,
        anchor, f.other);
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
    this.clampToLimit(t);
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
