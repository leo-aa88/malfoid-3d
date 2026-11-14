/**
 * Hogwarts Quidditch Pitch: every tunable value in one place. Distances in metres (Malfoid is
 * ~1.6 m tall), angles in degrees. The pitch is finite: an oval field ringed by timber stands
 * and house towers, a strip of worn ground between the field and the stands, and a landscape
 * beyond (hills, trees, the castle) that is only scenery.
 *
 * The long axis runs along x: the duel camera looks across the width (along -z), so the long
 * stands and their towers fill the background of a fight, the hoops sit at the left and right.
 */
export const PITCH_CONFIG = {
  seed: 7,
  // --- the field
  /** half length and half width of the oval grass field (m) */
  fieldHalfLength: 40,
  fieldHalfWidth: 24,
  /** worn ground between the field's edge and the foot of the stands (m) */
  apron: 4,
  /** how far inside the stands' foot the fighters can go (m): the low barrier stands here */
  boundaryMargin: 0.8,
  /** grass: base colour, lighter / darker mowing stripes (m wide), how much they differ */
  grass: '#5f8f3d',
  grassStripe: 4.0,
  grassStripeContrast: 0.07,
  /** random colour variation of the grass (0..1) */
  grassVariation: 0.10,
  apronColour: '#7b6a49',
  /** chalk lines: field edge, centre circle (radius), scoring areas round the hoops */
  lineColour: '#e9ecdc',
  centreCircle: 3.0,
  /** texels per metre of the generated ground texture (higher: crisper stripes and lines) */
  groundTexelsPerMetre: 14,

  // --- stands and towers (round the oval)
  /** house towers round the stadium (cycled Gryffindor, Ravenclaw, Hufflepuff, Slytherin) */
  towerCount: 12,
  /** tower footprint (m), height of the spectator box floor (m) and its random variation */
  towerWidth: 5.2,
  towerBoxHeight: 19,
  towerHeightJitter: 3.5,
  /** grandstands between the towers: tier count, tier depth and rise (m), height of the first tier */
  standTiers: 6,
  standTierDepth: 1.0,
  standTierRise: 0.72,
  standBaseHeight: 2.6,
  /** posts of the stands' timber frame every this many metres (lower: denser frame) */
  standPostSpacing: 3.0,
  /** a canopy over each grandstand (house-coloured cloth) */
  standCanopy: true,
  /** banners hanging from each grandstand's front rail, and down each tower's front */
  bannersPerStand: 3,
  towerBanners: true,

  // --- goal hoops (three at each end)
  /** distance of each hoop set from the centre along x (m) */
  hoopDistance: 33,
  /** spacing between the three posts (m), their heights (m), hoop radius and tube (m) */
  hoopSpacing: 5.5,
  hoopHeights: [12.5, 15.5, 12.5] as [number, number, number],
  hoopRadius: 1.35,
  hoopTube: 0.1,
  hoopColour: '#c9a043',

  // --- landscape (scenery only, no collision)
  /** radius of the surrounding land (m) */
  landRadius: 640,
  hillHeight: 38,
  trees: 420,
  /** the castle: direction from the pitch (deg, 0 = -z, 90 = +x), distance and size (m) */
  castleBearing: -28,
  castleDistance: 280,
  castleScale: 1.25,
  clouds: 14,

  // --- light (daylight)
  sunColour: '#fff2dc',
  sunIntensity: 1.75,
  /** where the sun is, relative to the fighters (also the direction of every shadow) */
  sunOffset: [3.2, 6.4, 2.2] as [number, number, number],
  skyColour: '#dbe9f7',
  groundBounce: '#5d6a43',
  ambientIntensity: 1.15,
  rimColour: '#fff8ec',
  rimIntensity: 0.55,
  skyTop: '#5f9bd8',
  skyHorizon: '#cfe2f1',
  /** haze: none up to fogNear, full at fogFar (softens the distant land) */
  fogNear: 180,
  fogFar: 760,
  /** baked shadows of the stands on the ground: how dark (0 none .. 1 black) and the map's cell (m) */
  bakedShadow: 0.38,
  bakedShadowCell: 0.25,
};

export type PitchConfig = typeof PITCH_CONFIG;

/** the four houses' colours: [main, accent, dark] */
export const HOUSES = {
  gryffindor: ['#8a1f22', '#d4a23a', '#4e1012'],
  ravenclaw: ['#24407a', '#b9c0cc', '#14244a'],
  hufflepuff: ['#d8a92a', '#24201c', '#7a5e14'],
  slytherin: ['#1f5a3c', '#b9bec4', '#0f3020'],
} as const;
export type House = keyof typeof HOUSES;
export const HOUSE_ORDER: House[] = ['gryffindor', 'ravenclaw', 'hufflepuff', 'slytherin'];
