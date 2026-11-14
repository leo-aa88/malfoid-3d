/**
 * The Herbology greenhouse (Susan's arena): every tunable value in one place. Distances in
 * metres (Malfoid is ~1.6 m tall), colours as hex.
 *
 * A long Victorian glasshouse: a brick plinth, iron-framed glass walls and a barrel-vaulted
 * glass roof. The long axis runs along x, so the duel camera (looking across, along -z) sees the
 * far wall's potting bench and the grounds through the glass. Planting benches line both long
 * walls and big planters close the ends; the stone floor between them is the duelling ground,
 * kept clear. The Hogwarts grounds outside (hills, trees, the castle) reuse the pitch's
 * landscape code.
 */
export const GREENHOUSE_CONFIG = {
  seed: 11,

  // --- the house
  /** half length (x) and half width (z) inside the walls (m) */
  halfLength: 16,
  halfWidth: 10,
  /** brick plinth under the glass walls: height, thickness (m) */
  plinthHeight: 0.8,
  plinthThickness: 0.32,
  /** height of the walls' eaves (m), and how much higher the vault's crown is (m) */
  eaves: 3.8,
  roofRise: 3.6,
  /** m between the iron ribs along the house (a bay); glazing bars per bay */
  bay: 2.0,
  barsPerBay: 3,
  /** iron sections (m): ribs and posts, glazing bars */
  rib: 0.09,
  bar: 0.035,
  ironColour: '#2f4339',
  brickColour: '#8c4f3b',
  copingColour: '#b9ad97',
  /** glass: tint and opacity (low: the view outside stays clear); the lower panes, up to the
   *  transom, are frosted (they read as glass, and give the fighters a calm backdrop) */
  glassColour: '#d8efe6',
  glassOpacity: 0.1,
  frostedColour: '#e8f2ec',
  frostedOpacity: 0.55,
  transom: 2.35,

  // --- the floor
  floorTexelsPerMetre: 24,
  flagColour: '#6c6658',
  groutColour: '#423d34',
  /** size of the flagstones (m) */
  flagSize: [1.1, 0.75] as [number, number],
  /** moss and damp: how much of the floor (0..1) */
  moss: 0.18,

  // --- planting
  /** benches along both long walls: depth, height of the top (m) */
  benchDepth: 1.1,
  benchHeight: 0.85,
  benchColour: '#7a5a3a',
  /** pots on the benches: one every this many m (lower: more plants) */
  potSpacing: 0.38,
  /** a raised shelf (staging) along the back of each bench: height above the bench top (m) */
  stagingHeight: 0.42,
  potColour: '#b4643f',
  /** the big planters closing each end (m): depth along x */
  planterDepth: 2.2,
  /** hanging baskets under the vault (count along each side of the ridge) */
  baskets: 6,
  /** wall posts with climbing ivy (every nth post) */
  ivyEvery: 3,
  /** Hufflepuff banners (the pitch's banner cloth): on each gable, and this many along each long
   *  wall (high: above the fighters' heads from the duel camera) */
  wallBanners: 2,
  /** greens: dark, mid, light, yellow-green (random mixes per plant) */
  greens: ['#2f5a2e', '#3f7a39', '#5e9a48', '#86ad46'],
  /** flowers: Hufflepuff yellow first, then a few others */
  flowers: ['#f1c232', '#e8a838', '#d8649a', '#9a7ad8', '#f4f0e6'],

  // --- the duel
  /** fighters keep this far (m) from the bench fronts and the end planters */
  boundaryMargin: 0.45,
  /** the camera keeps this far (m) inside the bench fronts (never behind the plants) */
  cameraMargin: 0.25,
  /** spells burst on the benches' plants up to this height (m) */
  plantSolidHeight: 1.8,

  // --- atmosphere
  /** pollen and dust drifting in the sunlight */
  motes: 220,
  moteColour: '#fff3c4',

  // --- outside (the pitch's landscape, recentred: see GreenhouseArena)
  castleBearing: -22,
  castleDistance: 330,
  trees: 450,
  /** the hills round the grounds (m; lower than the pitch's: no stands hide them here) */
  hillHeight: 14,

  // --- light (warm daylight through glass, a humid haze)
  sunColour: '#fff0d4',
  sunIntensity: 1.3,
  /** where the sun is, relative to the fighters (high: the ribs' shadows fall across the floor) */
  sunOffset: [2.4, 7.5, 1.6] as [number, number, number],
  skyColour: '#e6f2e4',
  groundBounce: '#6c7550',
  ambientIntensity: 1.25,
  rimColour: '#f2ffe6',
  rimIntensity: 0.5,
  skyTop: '#6aa3d8',
  skyHorizon: '#d6e8ec',
  hazeColour: '#dbe8de',
  fogNear: 40,
  fogFar: 520,
  /** the sun's shadow over the house: half size (m), map size (texels), biases */
  shadowHalfSize: 22,
  shadowMapSize: 4096,
  shadowBias: -0.0005,
  shadowNormalBias: 0.03,
};

export type GreenhouseConfig = typeof GREENHOUSE_CONFIG;
