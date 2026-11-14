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
}

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
    this.keyLight.shadow.mapSize.set(2048, 2048);
    const c = this.keyLight.shadow.camera;
    c.left = -1.6; c.right = 1.6; c.top = 2.2; c.bottom = -0.4; c.near = 0.5; c.far = 12;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.02;
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
  }

  /** keep the shadow frustum (and the rim light) centred on the character */
  followShadow(target: THREE.Vector3): void {
    this.keyLight.target.position.copy(target);
    this.keyLight.position.copy(target).add(this.keyOffset);
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
