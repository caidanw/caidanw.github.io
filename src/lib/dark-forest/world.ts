/**
 * The fixed world: camera, palette, and the hand-placed (or seeded) layout.
 * World space is a ground plane (x right, z toward the camera, y up) with the
 * brazier at the origin.
 */
import { clamp, hex, rngFrom, vnoise, type Color } from './util'

// ---------- framebuffer + camera (low 3/4 "stage" view) ----------
export const W = 320
export const H = 180
export const N = W * H
export const HORIZON = 71
const ZOOM = 1.35
const CY = 124

/** World (x, y, z) -> screen (sx, sy) plus the perspective scale at that depth. */
export function project(x: number, y: number, z: number): [number, number, number] {
  const s = (1 + z * 0.0028) * ZOOM
  return [160 + x * s, CY + z * 0.45 * ZOOM - y * s, s]
}

/** Screen pixel -> point on the ground plane, or null above the horizon. */
export function unproject(sx: number, sy: number): [number, number] | null {
  if (sy <= HORIZON) return null
  const z = (sy - CY) / (0.45 * ZOOM)
  const s = (1 + z * 0.0028) * ZOOM
  return [(sx - 160) / s, z]
}

/** How much distance mist covers a world point at depth z. */
export const mistAt = (z: number): number => clamp((-z - 28) / 58) * 0.88

// ---------- palette ----------
export const C = {
  grassA: hex('#283830'),
  grassB: hex('#334438'),
  moss: hex('#3c4e3a'),
  dirt: hex('#4d4236'),
  path: hex('#43392e'),
  shore: hex('#3b3a31'),
  water: hex('#0a1520'),
  mist: hex('#1c2737'),
  trunk: hex('#25221e'),
  trunkRim: hex('#4c4d44'),
  canopy: hex('#1c2a2a'),
  canopyD: hex('#141f20'),
  canopyHi: hex('#36504b'),
  canopyRim: hex('#5f817a'),
  tuft: hex('#3e5a3e'),
  reed: hex('#2f4a34'),
  reedHi: hex('#4f6e4a'),
  cattail: hex('#5a3a22'),
  pad: hex('#3d6a42'),
  flower: hex('#c9c6a0'),
  iron: hex('#4b433d'),
  ironHi: hex('#8a7c70'),
  ironRim: hex('#b8a896'),
  ironD: hex('#2a2522'),
  blade: hex('#b9b6b0'),
  bladeD: hex('#6f6c68'),
  guard: hex('#7a6a4a'),
  grip: hex('#3b2a1e'),
  pommel: hex('#c9a24a'),
  stick: hex('#6b4f33'),
  stickD: hex('#4a3624'),
  log: hex('#7a5a3a'),
  logEnd: hex('#c9a070'),
  stone: hex('#6a655a'),
  stoneD: hex('#4a463e'),
  stoneHi: hex('#8a8476'),
  hutCap: hex('#8f4b3c'),
  hutCapHi: hex('#b2705a'),
  hutGill: hex('#5a3028'),
  hutStemHi: hex('#e2d8c0'),
  hutFrame: hex('#7a5f45'),
  hutInside: hex('#140d08'),
  hutDoor: hex('#4a3424'),
  hutDoorD: hex('#33241a'),
  hutCapD: hex('#6e382d'),
  hutSpot: hex('#d9c7b0'),
  hutStem: hex('#cfc2a6'),
  hutStemD: hex('#a89c84'),
  door: hex('#1a1410'),
  helm: hex('#8d887c'),
  rust: hex('#6b4a32'),
  wood: hex('#4a3a2a'),
  sign: hex('#5a4630'),
  signD: hex('#3a2c20'),
  packHi: hex('#5a4a3a'),
  pack: hex('#3e3226'),
  bedroll: hex('#2a2a2a'),
  candle: hex('#d9d0bd'),
  frog: hex('#5f8a4a'),
  frogD: hex('#3e5e30'),
  crow: hex('#0b0b0e'),
  outline: hex('#0c0a09'),
} satisfies Record<string, Color>

// ---------- layout ----------
export interface Point {
  x: number
  z: number
}

export const POOL = { x: 12, z: 31, rx: 30, rz: 12 }
const poolMetric = (x: number, z: number) => {
  const a = (x - POOL.x) / POOL.rx
  const b = (z - POOL.z) / POOL.rz
  return a * a + b * b - (vnoise(x * 0.15, z * 0.15) - 0.5) * 0.35
}
/** Is (x, z) under water when the pool is at `level` (1 = normal, grows in rain)? */
export const inPool = (x: number, z: number, level: number): boolean => poolMetric(x, z) < level * level

export const PROPS = {
  knight: { x: -17, z: 2 },
  sword: { x: -25, z: -1 },
  pack: { x: -27, z: 5 },
  woodpile: { x: 15, z: -7 },
  huts: [
    { x: -66, z: -14 },
    { x: -40, z: -40 },
  ],
  graves: [
    { x: 74, z: -24, helm: true },
    { x: 84, z: -18 },
    { x: 92, z: -28 },
  ] as (Point & { helm?: boolean })[],
  lantern: { x: -96, z: 16 },
  trigon: { x: -4, z: -76 },
}

/** Lily pads, as world points inside the pool. */
export const PADS: [number, number][] = [
  [2, 30],
  [18, 35],
  [28, 27],
  [-6, 34],
  [34, 33],
]
export const HEARTH: [number, number][] = [
  [-13, -4],
  [-8, -9],
  [9, -9],
  [13, -2],
  [11, 6],
  [-4, 8],
]

/** Hut geometry in world units: the door sits left of centre; shroomfolk step from the front point to the inside point. */
export const HUT = { doorDx: -1.9, front: 3.5, inside: -3, capacity: 2 }

const avoid: (Point & { pad: number })[] = [
  ...PROPS.huts.map((p) => ({ ...p, pad: 8 })),
  ...PROPS.graves.map((p) => ({ ...p, pad: 0 })),
  { ...PROPS.lantern, pad: 0 },
  { ...PROPS.trigon, pad: 0 },
]
export const nearProp = (x: number, z: number, r: number): boolean => avoid.some((p) => Math.hypot(p.x - x, p.z - z) < r + p.pad)

/** Landmarks that must stay visible: no tree may stand between them and the camera. [point, half-width in world units] */
const landmarks: [Point, number][] = [
  ...PROPS.huts.map((p): [Point, number] => [p, 15]),
  ...PROPS.graves.map((p): [Point, number] => [p, 10]),
  [PROPS.lantern, 9],
  [PROPS.trigon, 9],
]
/** Would something at (x, z) stand in front of a landmark from the camera's point of view? */
export const blocksLandmark = (x: number, z: number): boolean => landmarks.some(([p, hw]) => z > p.z && Math.abs(x - p.x) < hw)

export interface Tree extends Point {
  h: number
  w: number
  seed: number
  tone: number
}

export const TREES: Tree[] = (() => {
  const rng = rngFrom(5)
  const out: Tree[] = []
  const ok = (x: number, z: number, gap: number) => !out.some((t) => Math.abs(t.x - x) < gap && Math.abs(t.z - z) < gap * 0.7)
  const add = (x: number, z: number, h: number, w: number) => out.push({ x, z, h, w, seed: (rng() * 1e6) | 0, tone: rng() })
  // back band, lost in mist; keep an avenue open behind the fire for the moon
  for (let i = 0; i < 500 && out.length < 54; i++) {
    const x = (rng() * 2 - 1) * 200
    const z = -86 + rng() * 40
    if (Math.abs(x) < 22 + -z * 0.12 || !ok(x, z, 8) || nearProp(x, z, 12) || blocksLandmark(x, z)) continue
    add(x, z, 0.9 + rng() * 0.5, 0.6 + rng() * 0.5)
  }
  // mid band, the edge of the clearing
  for (let i = 0; i < 500 && out.length < 84; i++) {
    const x = (rng() * 2 - 1) * 170
    const z = -50 + rng() * 60
    if (Math.hypot(x * 0.8, z) < 52 || Math.abs(x) < 40 || !ok(x, z, 11) || nearProp(x, z, 14) || blocksLandmark(x, z)) continue
    add(x, z, 0.85 + rng() * 0.4, 0.8 + rng() * 0.5)
  }
  // near framing trunks
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1
    add(side * (100 + rng() * 25), 30 + i * 12 + rng() * 6, 1.3, 1.1 + rng() * 0.4)
  }
  return out
})()

export const TUFTS = (() => {
  const rng = rngFrom(9)
  const out: (Point & { n: number; flower: boolean; s: number })[] = []
  for (let i = 0; i < 300; i++) {
    const x = (rng() * 2 - 1) * 130
    const z = -45 + rng() * 135
    if (Math.hypot(x, z) < 18 || inPool(x, z, 1.35) || nearProp(x, z, 8)) continue
    out.push({ x, z, n: 1 + ((rng() * 3) | 0), flower: rng() < 0.08, s: rng() })
  }
  return out
})()

export const REEDS = (() => {
  const rng = rngFrom(17)
  const out: (Point & { h: number; s: number })[] = []
  for (let i = 0; i < 30; i++) {
    const a = rng() * Math.PI * 2
    const m = 1.05 + rng() * 0.15
    const x = POOL.x + Math.cos(a) * POOL.rx * m
    const z = POOL.z + Math.sin(a) * POOL.rz * m
    if (Math.sin(a) > 0.3 && rng() < 0.7) continue // keep the near shore mostly clear
    out.push({ x, z, h: 3 + ((rng() * 4) | 0), s: rng() })
  }
  return out
})()

/** Bioluminescent mushrooms at the forest edge. */
export const SHROOMS = (() => {
  const rng = rngFrom(13)
  const out: (Point & { ph: number })[] = []
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2
    const r = 50 + rng() * 22
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r * 0.9
    if (inPool(x, z, 1.4)) continue
    out.push({ x, z, ph: rng() * 6 })
  }
  return out
})()

/** Something watching from the trees. */
export const EYES = (
  [
    [-118, -30, 6],
    [-84, -48, 10],
    [112, -38, 8],
    [132, -6, 5],
    [56, -54, 12],
    [-136, 4, 7],
  ] as const
).map(([x, z, y], i) => ({ x, z, y, ph: i * 1.7 }))
