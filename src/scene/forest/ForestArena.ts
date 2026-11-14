import * as THREE from 'three';
import type { Arena } from '../arena';
import type { EnvironmentLook } from '../SceneManager';
import { FOREST_CONFIG } from './config';
import { ForestWorld } from './ForestWorld';
import { SPAWN_CENTRE } from './placement';
import { forestLook } from './index';

/** the Forbidden Woods as a duel arena (the forest itself is unchanged) */
export class ForestArena implements Arena {
  readonly kind = 'woods' as const;
  readonly name = 'Forbidden Woods';
  readonly spawn = new THREE.Vector3(SPAWN_CENTRE.x, 0, SPAWN_CENTRE.z);
  readonly cameraLimit = null;
  readonly finite = false;
  readonly world: ForestWorld;

  constructor(scene: THREE.Scene) {
    this.world = new ForestWorld(FOREST_CONFIG);
    scene.add(this.world.group);
    this.world.atmosphere.setMoon(new THREE.Vector3(...FOREST_CONFIG.moonOffset));
  }

  look(): EnvironmentLook {
    return forestLook();
  }

  setActive(on: boolean): void {
    this.world.setActive(on);
  }

  resolve(pos: THREE.Vector3, r: number): void {
    this.world.resolve(pos, r);
  }

  fillSolids(out: THREE.Box3[], centres: THREE.Vector3[]): void {
    this.world.fillSolids(out, centres);
  }

  update(dt: number, player: THREE.Vector3, fighters: THREE.Vector3[], camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    this.world.update(dt, player, fighters, camera, viewportHeight);
  }
}
