import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Orbit / pan / zoom camera that travels with the character without ever
 * rotating it. Camera interaction never touches the character's idle timer.
 */
export class CameraController {
  readonly controls: OrbitControls;
  private readonly lastAnchor = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly initialOffset = new THREE.Vector3(0.0, 0.25, 3.6);
  private readonly initialTargetHeight = 0.95;

  constructor(private readonly camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.3;      // close enough to inspect the face
    this.controls.maxDistance = 7.0;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.5 - 0.02;   // never below the floor
    this.controls.zoomSpeed = 0.9;
    this.controls.zoomToCursor = true;     // wheel towards the face to inspect it
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
  }

  /** place the camera in front of the character */
  reset(anchor: THREE.Vector3): void {
    this.controls.target.set(anchor.x, anchor.y + this.initialTargetHeight, anchor.z);
    this.camera.position.copy(this.controls.target).add(this.initialOffset);
    this.lastAnchor.copy(anchor);
    this.controls.update();
  }

  /** move camera and target along with the character (keeps orbit and pan) */
  update(anchor: THREE.Vector3): void {
    this.delta.subVectors(anchor, this.lastAnchor);
    if (this.delta.lengthSq() > 0) {
      this.controls.target.add(this.delta);
      this.camera.position.add(this.delta);
      this.lastAnchor.copy(anchor);
    }
    this.controls.update();
  }

  /** horizontal view direction, used to make WASD camera-relative */
  getYaw(): number {
    return Math.atan2(
      this.camera.position.x - this.controls.target.x,
      this.camera.position.z - this.controls.target.z,
    );
  }
}
