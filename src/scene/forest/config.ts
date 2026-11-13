/**
 * Forbidden Woods: every tunable value in one place. Distances are metres (Malfoid is
 * ~1.6 m tall). The forest is infinite: it is generated in square chunks around the fighters
 * from world coordinates and the seed, so the same place always looks the same.
 */
export const FOREST_CONFIG = {
  seed: 1337,
  /** chunk edge (m) and how many chunks around each fighter are kept (3 -> 7 x 7) */
  chunkSize: 32,
  activeRadius: 3,
  /** trees within this many chunks of the player use the detailed meshes (can fade when they block the view) */
  detailRadius: 1,
  /** small ground props (grass, leaves, mushrooms, twigs) only within this many chunks */
  propRadius: 2,
  /** trees per square metre on average (before clearings and density variation) */
  treeDensity: 0.02,
  /** share of the forest floor that opens into natural clearings */
  clearingFrequency: 0.08,
  /** clearing at the spawn point, ringed by big old trees (m) */
  spawnClearing: 11,
  /** linear fog: none up to fogNear, opaque at fogFar (hides the edge of the streamed forest) */
  fogNear: 22,
  fogFar: 88,
  fogColor: '#253041',
  rocksEnabled: true,
  particlesEnabled: true,
  /** trees (the flared trunk), big rocks, stumps and fallen logs are solid; roots, grass, bushes,
   *  leaves and mushrooms stay walk-through (shapes in colliders.ts) */
  collisionEnabled: true,
  /** spells explode on trunks near the fighters */
  spellsHitTrees: true,
  // --- light
  moonlightIntensity: 1.9,
  moonlightColor: '#c2d2f2',
  /** where the moon is, relative to the player (also the shadow direction) */
  moonOffset: [-3.0, 6.0, 2.4] as [number, number, number],
  ambientSky: '#6a7da3',
  ambientGround: '#1a1d1b',
  ambientIntensity: 1.35,
  /** cold rim from behind so the characters' silhouettes stay readable */
  rimColor: '#8fb2ff',
  rimIntensity: 1.3,
  // --- atmosphere
  dustMotes: 260,
  magicMotes: 40,
  fireflies: 46,
  /** pairs of faint eyes watching from the dark */
  eyes: 5,
  /** fade trees that stand between the camera and the fighters */
  fadeBlockingTrees: true,
};

export type ForestConfig = typeof FOREST_CONFIG;
