import type { EnvironmentLook } from '../SceneManager';
import { FOREST_CONFIG } from './config';

export { FOREST_CONFIG } from './config';
export { ForestWorld } from './ForestWorld';
export { SPAWN_CENTRE } from './placement';

/** the forest's night lighting for SceneManager.setEnvironment */
export function forestLook(cfg = FOREST_CONFIG): EnvironmentLook {
  return {
    background: cfg.fogColor,
    fog: [cfg.fogColor, cfg.fogNear, cfg.fogFar],
    hemi: [cfg.ambientSky, cfg.ambientGround, cfg.ambientIntensity],
    key: [cfg.moonlightColor, cfg.moonlightIntensity],
    keyOffset: cfg.moonOffset,
    rim: [cfg.rimColor, cfg.rimIntensity],
    cameraFar: 230,
  };
}
