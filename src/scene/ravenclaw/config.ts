/**
 * The Ravenclaw common room (Luna's arena): every tunable value in one place. Distances in metres
 * (Malfoid is ~1.6 m tall), colours as hex, angles in degrees.
 *
 * A wide, circular tower room, airy and calm: graceful arched windows round the wall onto a
 * starry night and the mountains, blue and bronze silks hung between them, a domed ceiling
 * painted with stars, echoed by the midnight-blue carpet. Bookcases, tables and armchairs keep
 * to the wall; Rowena Ravenclaw's white marble statue stands in a niche opposite the camera.
 * The carpet in the middle is the duelling floor, kept clear. Candles float under the dome.
 */
export const RAVENCLAW_CONFIG = {
  seed: 23,

  // --- the room
  /** inner radius of the wall (m), its height to the cornice (m), the dome's rise above it (m) */
  radius: 13.0,
  wallHeight: 6.4,
  domeRise: 5.2,
  /** bays round the wall: windows alternate with bays of silks / the statue's niche */
  bays: 16,
  wallColour: '#b3aa9b',          // (a lighter stone read near white and flat under the candlelight)
  trimColour: '#a87b45',          // bronze
  /** arched windows: width, sill height, height of the arch's top (m) */
  window: { width: 1.9, sill: 0.95, top: 5.3 },
  glassColour: '#2a3f78',
  glassOpacity: 0.22,             // (at 0.55 the night outside didn't show: flat blue panels)
  /** the statue's niche, in the far wall (bearing 180 deg: straight ahead of the duel camera) */
  statueBearing: 180,

  // --- floor and carpet
  floorColour: '#5a3d28',        // dark polished boards
  boardWidth: 0.22,
  /** the round carpet: radius (m), midnight blue with bronze stars and a bronze border */
  carpetRadius: 8.6,
  carpetColour: '#141d3c',
  carpetStar: '#c9964e',
  carpetBorder: '#b08049',

  // --- the dome: painted midnight blue with stars, bronze ribs
  domeTop: '#0b1230',
  domeBase: '#1d2b5c',
  domeStars: 900,
  ribs: 8,

  // --- silks between the windows
  silkBlue: '#24418c',
  silkBronze: '#b98a4e',

  // --- furniture round the wall
  bookcaseHeight: 2.2,
  bookcaseDepth: 0.45,
  woodColour: '#5b3a24',
  upholstery: '#2c4a8e',
  /** tables (with chairs) and armchairs, at this distance from the centre (m) */
  furnitureRing: [10.2, 11.6] as [number, number],
  tables: 4,
  armchairs: 4,
  marble: '#eceae4',

  // --- the duel
  /** fighters keep inside this circle (m) */
  floorRadius: 8.4,
  /** the camera keeps inside this circle (m): in front of the furniture */
  cameraRadius: 9.4,

  // --- floating candles under the dome
  candles: 28,
  candleHeight: [4.0, 7.2] as [number, number],

  // --- outside the windows: a starry night over the mountains
  skyTop: '#060a1c',
  skyHorizon: '#1f2d58',
  mountainColour: '#0e1530',
  moon: '#f4f0dc',

  // --- light: candlelight inside, cool moonlight through the windows (the fighters stay readable)
  keyColour: '#ffe4c2',
  keyIntensity: 1.25,
  keyOffset: [2.0, 7.0, 3.2] as [number, number, number],
  hemiSky: '#8c9ccc',
  hemiGround: '#5a4436',
  hemiIntensity: 1.35,
  rimColour: '#a8bfff',
  rimIntensity: 0.65,
  background: '#0a1024',
  fogNear: 60,
  fogFar: 400,
  shadowHalfSize: 15,
  shadowMapSize: 4096,
  shadowBias: -0.0005,
  shadowNormalBias: 0.03,
};

export type RavenclawConfig = typeof RAVENCLAW_CONFIG;
