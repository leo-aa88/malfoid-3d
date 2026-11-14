import * as THREE from 'three';

export type EnvironmentKind = 'studio' | 'woods' | 'pitch';

/** light, fog and sky settings of one environment */
export interface EnvironmentLook {
  background: string;
  fog: [string, number, number];          // colour, near, far
  hemi: [string, string, number];         // sky, ground, intensity
  key: [string, number];                  // colour, intensity
  keyOffset: [number, number, number];    // key light (sun / moon) direction from the player
  rim: [string, number];
  cameraFar: number;
  /**
   * the sun's shadow over a fixed area (a finite arena): its centre (m), the half size of the
   * square it covers (m) and the shadow map's size (texels). Omitted: the default small,
   * sharp shadow that follows the character.
   */
  shadow?: { centre: [number, number, number]; halfSize: number; mapSize: number; bias: number; normalBias: number };
}

/** the key light's own shadow: small and sharp, following the character (studio, woods) */
const DEFAULT_SHADOW = { mapSize: 2048, frustum: [-1.6, 1.6, 2.2, -0.4, 0.5, 12] as [number, number, number, number, number, number],
  bias: -0.0004, normalBias: 0.02 };

/** the original test scene */
export const STUDIO_LOOK: EnvironmentLook = {
  background: '#4f5766',
  fog: ['#4f5766', 9, 22],
  hemi: ['#fbf6ff', '#a89c99', 1.3],
  key: ['#fff6ee', 1.5],
  keyOffset: [2.2, 4.0, 3.0],
  rim: ['#cfe8ff', 0.8],
  cameraFar: 60,
};

/** Renderer, scene, lights and floor; switches between the studio and the forest's lighting. */
export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly keyLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly rimLight: THREE.DirectionalLight;
  /** the studio's floor and grid (hidden in the forest) */
  readonly studio = new THREE.Group();
  environment: EnvironmentKind = 'studio';
  private readonly keyOffset = new THREE.Vector3(2.2, 4.0, 3.0);
  /** a fixed shadow area (an arena's look), or null: the shadow follows the character */
  private shadowCentre: THREE.Vector3 | null = null;
  private readonly v = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // neutral slate background: contrasts with the platinum hair and pale skin
    this.scene.background = new THREE.Color('#4f5766');
    this.scene.fog = new THREE.Fog('#4f5766', 9, 22);

    this.camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.05, 60);

    this.hemiLight = new THREE.HemisphereLight('#fbf6ff', '#a89c99', 1.3);
    this.scene.add(this.hemiLight);
    this.keyLight = new THREE.DirectionalLight('#fff6ee', 1.5);
    this.keyLight.position.set(2.2, 4.0, 3.0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(DEFAULT_SHADOW.mapSize, DEFAULT_SHADOW.mapSize);
    const c = this.keyLight.shadow.camera;
    [c.left, c.right, c.top, c.bottom, c.near, c.far] = DEFAULT_SHADOW.frustum;
    this.keyLight.shadow.bias = DEFAULT_SHADOW.bias;
    this.keyLight.shadow.normalBias = DEFAULT_SHADOW.normalBias;
    this.scene.add(this.keyLight, this.keyLight.target);
    this.rimLight = new THREE.DirectionalLight('#cfe8ff', 0.8);
    this.rimLight.position.set(-2.5, 2.5, -3);
    this.scene.add(this.rimLight, this.rimLight.target);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.MeshToonMaterial({ color: '#5d6676' }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.studio.add(floor);
    const grid = new THREE.GridHelper(30, 60, '#6b7486', '#646d7e');
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.position.y = 0.001;
    this.studio.add(grid);
    this.scene.add(this.studio);

    window.addEventListener('resize', () => this.resize());
  }

  /** switch lighting, fog, background and draw distance (the forest itself is its own module) */
  setEnvironment(kind: EnvironmentKind, look: EnvironmentLook): void {
    this.environment = kind;
    this.studio.visible = kind === 'studio';
    this.scene.background = new THREE.Color(look.background);
    this.scene.fog = new THREE.Fog(look.fog[0], look.fog[1], look.fog[2]);
    this.hemiLight.color.set(look.hemi[0]);
    this.hemiLight.groundColor.set(look.hemi[1]);
    this.hemiLight.intensity = look.hemi[2];
    this.keyLight.color.set(look.key[0]);
    this.keyLight.intensity = look.key[1];
    this.keyOffset.set(...look.keyOffset);
    this.rimLight.color.set(look.rim[0]);
    this.rimLight.intensity = look.rim[1];
    this.camera.far = look.cameraFar;
    this.camera.updateProjectionMatrix();
    this.setShadow(look.shadow ?? null);
  }

  /** the key light's shadow: a fixed area (an arena), or the default that follows the character */
  private setShadow(s: EnvironmentLook['shadow'] | null): void {
    const sh = this.keyLight.shadow;
    const c = sh.camera;
    const size = s ? s.mapSize : DEFAULT_SHADOW.mapSize;
    if (sh.mapSize.x !== size) {
      sh.mapSize.set(size, size);
      sh.map?.dispose();
      sh.map = null;                                     // reallocated at the new size on the next render
    }
    if (s) {
      c.left = -s.halfSize; c.right = s.halfSize; c.top = s.halfSize; c.bottom = -s.halfSize;
      c.near = 1; c.far = s.halfSize * 4;
      sh.bias = s.bias;
      sh.normalBias = s.normalBias;
      this.shadowCentre = new THREE.Vector3(...s.centre);
    } else {
      [c.left, c.right, c.top, c.bottom, c.near, c.far] = DEFAULT_SHADOW.frustum;
      sh.bias = DEFAULT_SHADOW.bias;
      sh.normalBias = DEFAULT_SHADOW.normalBias;
      this.shadowCentre = null;
    }
    c.updateProjectionMatrix();
  }

  /** keep the shadow frustum (and the rim light) centred on the character (or on its fixed area) */
  followShadow(target: THREE.Vector3): void {
    const at = this.shadowCentre ?? target;
    this.keyLight.target.position.copy(at);
    // (a fixed area: the light stands far back along the sun's direction, so the whole arena fits)
    this.keyLight.position.copy(at).add(this.shadowCentre ? this.v.copy(this.keyOffset).setLength(this.keyLight.shadow.camera.far / 2) : this.keyOffset);
    this.rimLight.target.position.copy(target);
    this.rimLight.position.set(target.x - 2.5, target.y + 2.5, target.z - 3);
  }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
