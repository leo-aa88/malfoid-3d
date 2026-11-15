/**
 * The Great Hall (Hermione's arena): every tunable value in one place. Distances in metres
 * (Malfoid is ~1.6 m tall), colours as hex.
 *
 * A long, tall stone hall at night. Its long axis runs along x: the four house tables (and
 * their benches) run down it, set with plates and goblets, with a wide central aisle between
 * the middle two where the duel is fought. The staff's high table stands on a dais at the +x end,
 * the entrance doors at the -x end. Tall arched windows down both long walls, house banners
 * between them, hundreds of candles floating overhead, and the enchanted ceiling: the night sky.
 */
export const GREATHALL_CONFIG = {
  seed: 31,

  // --- the hall
  /** half length (x) and half width (z) inside the walls (m), the walls' height (m) */
  halfLength: 22,
  halfWidth: 12,
  wallHeight: 13,
  /** the enchanted ceiling (the night sky) this high (m) */
  ceiling: 15,
  wallColour: '#8d8273',
  wallDark: '#6e6457',
  /** pillars (buttresses) down the long walls, this far apart (m); windows between them */
  bay: 4.4,
  pillar: 0.9,
  /** arched windows: width, sill, top of the arch (m) */
  window: { width: 2.0, sill: 3.2, top: 10.5 },
  glassColour: '#22305a',
  leadColour: '#2a2a2e',

  // --- the floor
  flagColour: '#7c7366',
  groutColour: '#4a443c',
  flagSize: [1.2, 0.8] as [number, number],

  // --- the house tables (along x), their benches either side
  /** the tables' centre lines (z, m): the middle two either side of the central aisle */
  tables: [-8.5, -4.3, 4.3, 8.5],
  /** each table runs from x0 to x1 (m) */
  tableX: [-17.0, 11.0] as [number, number],
  tableWidth: 1.0,
  tableHeight: 0.76,
  benchWidth: 0.36,
  benchHeight: 0.46,
  /** a bench's centre this far from its table's centre line (m) */
  benchOffset: 0.78,
  woodColour: '#6a4528',
  woodDark: '#4a2e1a',
  /** a place set every this many m along each side of a table: a plate (Hermione's ammunition)
   *  and a goblet */
  placeSpacing: 0.8,
  goldColour: '#d0a64a',

  // --- the staff's high table on its dais (+x end), the doors (-x end)
  dais: { x0: 15.0, height: 0.5 },
  staffTable: { x: 17.2, halfZ: 7.0 },
  doors: { width: 4.4, height: 7.5 },

  // --- house banners (the pitch's cloth): between the windows, over each house's table
  bannerSize: [1.5, 4.2] as [number, number],

  // --- floating candles over the tables
  candles: 140,
  candleHeight: [5.5, 9.5] as [number, number],

  // --- the enchanted ceiling: the night sky
  skyTop: '#070b1f',
  skyLow: '#1b2650',
  stars: 1400,
  clouds: 22,

  // --- the duel
  /** fighters keep this far (m) from the walls, the tables, the benches and the dais */
  margin: 0.15,
  /** the camera stays inside the walls this far (m), and over the tables at least this high (m)
   *  (lower, a table's edge hid the fighters' feet) */
  cameraMargin: 0.6,
  cameraOverTables: 1.9,

  // --- light: warm candlelight from above, a cool night rim (the fighters stay readable)
  keyColour: '#ffe2bb',
  keyIntensity: 1.3,
  keyOffset: [3.0, 9.0, 2.0] as [number, number, number],
  hemiSky: '#a8a4c8',
  hemiGround: '#5e4a38',
  hemiIntensity: 1.35,
  rimColour: '#9fb8ff',
  rimIntensity: 0.55,
  background: '#0a0e22',
  fogNear: 70,
  fogFar: 300,
  shadowHalfSize: 16,
  shadowMapSize: 4096,
  shadowBias: -0.0005,
  shadowNormalBias: 0.03,
};

export type GreatHallConfig = typeof GREATHALL_CONFIG;
