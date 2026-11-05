/**
 * The fixed world: camera, palette, and the hand-placed (or seeded) layout.
 * World space is a ground plane (x right, z toward the camera, y up) with the
 * campfire at the origin.
 */
import { DATA, WORLD } from './art'
import { clamp, rngFrom, vnoise } from './util'

// ---------- framebuffer + camera (low 3/4 "stage" view) ----------
/**
 * Screen pixels per layout pixel. Positions and sizes in the code are laid out on a 320x180
 * grid; the framebuffer and all art are drawn at twice that (640x360).
 */
export const RES = 2
export const W = 320 * RES
export const H = 180 * RES
export const N = W * H
export const HORIZON = 71 * RES
const ZOOM = 1.35 * RES
const CY = 124 * RES
const CX = 160 * RES

/** World (x, y, z) -> screen (sx, sy) plus the perspective scale at that depth (screen px per world unit). */
export function project(x: number, y: number, z: number): [number, number, number] {
  const s = (1 + z * 0.0028) * ZOOM
  return [CX + x * s, CY + z * 0.45 * ZOOM - y * s, s]
}

/** Screen pixel -> point on the ground plane, or null above the horizon. */
export function unproject(sx: number, sy: number): [number, number] | null {
  if (sy <= HORIZON) return null
  const z = (sy - CY) / (0.45 * ZOOM)
  const s = (1 + z * 0.0028) * ZOOM
  return [(sx - CX) / s, z]
}

/** How much distance mist covers a world point at depth z. */
export const mistAt = (z: number): number => clamp((-z - 28) / 58) * 0.88

// ---------- palette ----------
/** The world palette (data/palette.json, edited in the editor): every named colour in the scene. */
export const C = WORLD

// ---------- layout ----------
export interface Point {
  x: number
  z: number
}

export const POOL = { x: 12, z: 31, rx: 30, rz: 12 }
export const poolMetric = (x: number, z: number): number => {
  const a = (x - POOL.x) / POOL.rx
  const b = (z - POOL.z) / POOL.rz
  return a * a + b * b - (vnoise(x * 0.15, z * 0.15) - 0.5) * 0.35
}
/** How high the pool can rise in rain (its level is 1 when dry). */
export const POOL_MAX = 1.28
/** Is (x, z) under water when the pool is at `level` (1 = normal, grows in rain)? */
export const inPool = (x: number, z: number, level: number): boolean => poolMetric(x, z) < level * level

/** Where everything stands (data/layout.json, edited in the editor's move tool). Live objects. */
export const PROPS = DATA.layout.props

/** Lily pads, as world points inside the pool. */
export const PADS: [number, number][] = [
  [2, 30],
  [18, 35],
  [28, 27],
  [-6, 34],
  [34, 33],
]
/** A ring of stones around the campfire, each a little different. */
export const STONE_RING = Array.from({ length: 13 }, (_, i) => {
  const r = rngFrom(40 + i)
  const a = (i / 13) * Math.PI * 2 + r() * 0.2
  return { x: Math.cos(a) * 9.5, z: Math.sin(a) * 6.5, w: 2 + ((r() * 2) | 0), h: 1 + ((r() * 2) | 0), seed: (r() * 1e6) | 0 }
})

/** Three old standing stones behind the fire; the tall one carries a carved antler crown that warms with the flames. */
export const HEARTHSTONES = DATA.layout.hearthstones

/**
 * What stands planted in the ashes: the bonfire's coiled sword, reimagined.
 * The antler crown by default; the others with #relic=crook|key.
 */
export type Relic = 'antler' | 'crook' | 'key'
export const RELICS: Relic[] = ['antler', 'crook', 'key']

/** The quiet grove: the knight's companions lie here, and the shroomfolk return to the soil around them. */
export const GROVE = { x: 83, z: -22 }
/** Where the knight will one day rest, beside them. */
export const KNIGHT_GRAVE = { x: 67, z: -16 }
/** Spots in the grove where glowcaps can grow: a loose ring around the graves. */
export const GROVE_SPOTS: [number, number][] = (() => {
  const rng = rngFrom(31)
  const out: [number, number][] = []
  const graves = [...PROPS.graves, KNIGHT_GRAVE]
  for (let i = 0; i < 400 && out.length < 14; i++) {
    const a = rng() * Math.PI * 2
    const r = 7 + rng() * 11
    const x = GROVE.x + Math.cos(a) * r
    const z = GROVE.z + Math.sin(a) * r * 0.7
    if (graves.some((g) => Math.hypot(g.x - x, g.z - z) < 4.5) || out.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 3.5)) continue
    out.push([x, z])
  }
  return out
})()

/** Hut geometry in world units: the door sits left of centre; shroomfolk step from the front point to the inside point. */
export const HUT = { doorDx: -1.9, front: 6.5, inside: -3, capacity: 2 }

/** Keep-clear zones around props (read live, so moved props move them). */
const avoid = (): (Point & { pad: number })[] => [
  ...PROPS.huts.map((p) => ({ ...p, pad: 8 })),
  ...PROPS.graves.map((p) => ({ ...p, pad: 0 })),
  { ...PROPS.lantern, pad: 0 },
  { ...PROPS.trigon, pad: 0 },
]
export const nearProp = (x: number, z: number, r: number): boolean => avoid().some((p) => Math.hypot(p.x - x, p.z - z) < r + p.pad)

export interface Tree extends Point {
  h: number
  w: number
  seed: number
  tone: number
}

/** The forest (data/layout.json). Live objects: the editor moves, adds and removes them. */
export const TREES: Tree[] = DATA.layout.trees

export interface Bush extends Point {
  /** Half-width and height, in world units. */
  w: number
  h: number
  seed: number
  lobes: number
}

/**
 * Bushes: mounds at the edge of the clearing and at the feet of the trees, and a few big
 * dark ones in the near corners, framing the stage. The road out stays open.
 */
export const BUSHES: Bush[] = DATA.layout.bushes

/** Small things about the wood: ferns, grass, foxgloves, rocks, stumps, fallen logs, mushroom clusters. */
export type DetailKind = 'fern' | 'grass' | 'foxglove' | 'rock' | 'stump' | 'log' | 'mushrooms'
export type Detail = Point & { kind: DetailKind; size: number; seed: number }
export const DETAILS = DATA.layout.details as Detail[]

/** The undergrowth at the back of the wood: small bushes in the mist along the horizon (a backdrop, seeded). */
export const UNDERGROWTH: Bush[] = (() => {
  const rng = rngFrom(77)
  const out: Bush[] = []
  for (const row of [-93, -86, -80]) {
    for (let x = -215; x < 215; x += 7 + rng() * 8) {
      const z = row + (rng() - 0.5) * 4
      if (Math.abs(x - PROPS.trigon.x) < 9 && z > PROPS.trigon.z - 2) continue // keep the trigon's foot clear
      const w = 3 + rng() * 4.5
      out.push({ x: x + (rng() - 0.5) * 4, z, w, h: w * (0.5 + rng() * 0.3), seed: (rng() * 1e6) | 0, lobes: 2 + ((rng() * 2) | 0) })
    }
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

/** Foxfire: a faint violet fungus glowing on rotten wood at the forest edge (not to be confused with glowcaps). */
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
