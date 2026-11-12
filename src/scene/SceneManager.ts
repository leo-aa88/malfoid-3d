import * as THREE from 'three';

/** Renderer, scene, lights and floor. */
export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly keyLight: THREE.DirectionalLight;

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

    this.scene.add(new THREE.HemisphereLight('#fbf6ff', '#a89c99', 1.3));
    this.keyLight = new THREE.DirectionalLight('#fff6ee', 1.5);
    this.keyLight.position.set(2.2, 4.0, 3.0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    const c = this.keyLight.shadow.camera;
    c.left = -1.6; c.right = 1.6; c.top = 2.2; c.bottom = -0.4; c.near = 0.5; c.far = 12;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight, this.keyLight.target);
    const rim = new THREE.DirectionalLight('#cfe8ff', 0.8);
    rim.position.set(-2.5, 2.5, -3);
    this.scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.MeshToonMaterial({ color: '#5d6676' }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(30, 60, '#6b7486', '#646d7e');
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.position.y = 0.001;
    this.scene.add(grid);

    window.addEventListener('resize', () => this.resize());
  }

  /** keep the shadow frustum centred on the character */
  followShadow(target: THREE.Vector3): void {
    this.keyLight.target.position.copy(target);
    this.keyLight.position.set(target.x + 2.2, target.y + 4.0, target.z + 3.0);
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
