/**
 * Shadows, for any light.
 *
 * Casters: everything drawn between beginCaster/endCaster in the renderer is one caster, and
 * every pixel it draws (before the depth test, so hidden parts still cast) is recorded into
 * its silhouette, on a 2px grid. So the knight casts the knight, a hut casts a hut.
 *
 * Maps: a light that casts shadows gets a shadow map, a square of ground around it sized to
 * its reach. For each silhouette the light can see, the silhouette is turned to face the
 * light (right for trunks and stems, good enough for flat creatures), each sample's ray from
 * the light is followed to the ground, and a soft dab is laid there. Dabs widen with distance
 * from the caster (the penumbra). Parts of a caster near or above the light's height would
 * throw their shadow to the horizon from a point; the fire is a big soft light, so those
 * stretch and fade out instead.
 *
 * Cost: static silhouettes are baked into a light's map once, and again only when the light
 * moves or its reach changes step. Moving things are laid on top each frame. Only the
 * strongest few shadow lights in a frame get maps (BUDGET).
 */
import type { Light } from './lights'

/** One caster: its base on the ground, its scale (screen px per world unit), its silhouette. */
export interface Silhouette {
  x: number
  z: number
  s: number
  /** Where the base really is, in screen pixels right of the (rounded) pixel the runs are measured from. */
  ox: number
  /**
   * The silhouette as vertical runs, [dx, y0, y1] triples in screen pixels from the base:
   * a column dx px right of the base, filled from y0 up to y1 px above it.
   */
  runs: Int16Array
}

export interface ShadowMap {
  x0: number
  z0: number
  cell: number
  n: number
  occ: Float32Array
}

/** At most this many lights cast shadows in one frame (the strongest). */
export const BUDGET = 6
/** How dark a full shadow is (1 = no light at all). */
export const DARKNESS = 0.85

/** Collects one caster's pixels while it's drawn. */
export class SilhouetteRecorder {
  private cells = new Set<number>()
  /** Columns are `col` pixels wide (finer for static things, coarser for moving ones). */
  // runs are measured from the rounded base pixel, so a creature drifting by a fraction of a
  // pixel doesn't reshuffle its columns; the fraction is kept to place them exactly
  private bx: number
  private by: number
  private ox: number
  constructor(
    readonly x: number,
    readonly z: number,
    bx: number,
    by: number,
    readonly s: number,
    readonly col = 2,
  ) {
    this.bx = Math.round(bx)
    this.by = Math.round(by)
    this.ox = this.bx - bx
  }
  add(px: number, py: number) {
    const cx = Math.floor((px - this.bx) / this.col)
    const cy = (this.by - py) >> 1
    if (cx < -1000 || cx > 1000 || cy < -1000 || cy > 1000) return
    this.cells.add((cx + 1024) * 4096 + (cy + 1024))
  }
  done(): Silhouette | null {
    if (!this.cells.size) return null
    // sort by column, then height, and merge each column's cells into runs
    const cells = [...this.cells].sort((a, b) => a - b)
    const runs: number[] = []
    let cx = NaN
    let y0 = 0
    let y1 = 0
    const flush = () => Number.isFinite(cx) && runs.push(cx * this.col + this.col / 2, y0 * 2, y1 * 2 + 2)
    for (const c of cells) {
      const x = Math.floor(c / 4096) - 1024
      const y = (c % 4096) - 1024
      if (x === cx && y === y1 + 1) y1 = y
      else {
        flush()
        cx = x
        y0 = y1 = y
      }
    }
    flush()
    return { x: this.x, z: this.z, s: this.s, ox: this.ox, runs: Int16Array.from(runs) }
  }
}

/** Lay one silhouette's shadow from light `l` into a map. */
function splat(map: ShadowMap, l: Light, sil: Silhouette) {
  const dx = sil.x - l.x
  const dz = sil.z - l.z
  const d = Math.hypot(dx, dz)
  if (d < 0.5) return // the light is inside it
  // the silhouette turned to face the light: its width runs across the light's direction
  const px = -dz / d
  const pz = dx / d
  const ly = Math.max(0.5, l.shadowY ?? l.y)
  const half = (map.n * map.cell) / 2
  const runs = sil.runs
  const colR = 1 / sil.s // half a column's width, in world units
  for (let k = 0; k < runs.length; k += 3) {
    const u = (runs[k] + sil.ox) / sil.s
    const yBot = runs[k + 1] / sil.s
    const yTop = Math.min(runs[k + 2] / sil.s, ly * (1 - 1 / MAX_STRETCH)) // nothing past the stretch limit
    if (yBot >= yTop) continue
    // the run stands at (wx, wz); its shadow runs along the ground from where its foot's ray
    // lands (t0) to where its top's does (t1), t being the stretch past the run itself
    const wx = sil.x + px * u
    const wz = sil.z + pz * u
    const t0 = ly / (ly - yBot)
    const t1 = ly / (ly - yTop)
    let t = t0
    while (t <= t1) {
      const gx = l.x + (wx - l.x) * t
      const gz = l.z + (wz - l.z) * t
      if (Math.abs(gx - l.x) > half || Math.abs(gz - l.z) > half) break
      const spread = Math.hypot(gx - wx, gz - wz)
      // wider and fainter the further it stretches: a big soft light, not a point
      const rad = colR * t + spread * 0.07 + map.cell * 0.5
      const fade = Math.min(1, Math.max(0, 1 - (t - 1) / (MAX_STRETCH - 1)))
      dab(map, gx, gz, rad, fade)
      // the next dab, about half a dab further along the ground
      const step = Math.max(map.cell * 0.6, rad * 0.5)
      const dist = Math.hypot(wx - l.x, wz - l.z)
      t += step / Math.max(0.01, dist)
    }
  }
}

/** Parts of a caster whose shadow would stretch further than this (times its own distance) cast none. */
const MAX_STRETCH = 6

/** A soft round dab of shadow: a flat core with a soft rim. Keeps the darkest. */
function dab(map: ShadowMap, gx: number, gz: number, rad: number, v: number) {
  if (v <= 0) return
  const inv = 1 / map.cell
  // at least a cell wide, with a soft rim a cell wide: thin strokes slide smoothly across the
  // grid instead of popping from cell to cell
  rad = Math.max(rad, map.cell * 0.9)
  const soft = Math.max(map.cell, rad * 0.45)
  const core = rad - soft
  const r2 = rad * rad
  const cx = (gx - map.x0) * inv
  const cz = (gz - map.z0) * inv
  const rc = rad * inv
  const i0 = Math.max(0, Math.floor(cx - rc))
  const i1 = Math.min(map.n - 1, Math.ceil(cx + rc))
  const j0 = Math.max(0, Math.floor(cz - rc))
  const j1 = Math.min(map.n - 1, Math.ceil(cz + rc))
  for (let j = j0; j <= j1; j++) {
    const ez = (j + 0.5) * map.cell + map.z0 - gz
    for (let i = i0; i <= i1; i++) {
      const ex = (i + 0.5) * map.cell + map.x0 - gx
      const e2 = ex * ex + ez * ez
      if (e2 >= r2) continue
      const o = j * map.n + i
      const a = v * Math.min(1, (rad - Math.sqrt(e2)) / (rad - core))
      if (a > map.occ[o]) map.occ[o] = a
    }
  }
}

/** How much of light reaches ground point (x, z) through this map: 0 lit .. 1 in full shadow. */
export function shadowAt(map: ShadowMap, x: number, z: number): number {
  const fx = (x - map.x0) / map.cell - 0.5
  const fz = (z - map.z0) / map.cell - 0.5
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  if (i < 0 || j < 0 || i >= map.n - 1 || j >= map.n - 1) return 0
  const tx = fx - i
  const tz = fz - j
  const o = j * map.n + i
  const a = map.occ[o] + (map.occ[o + 1] - map.occ[o]) * tx
  const b = map.occ[o + map.n] + (map.occ[o + map.n + 1] - map.occ[o + map.n]) * tx
  return a + (b - a) * tz
}

/** The shadow maps of every light, baked and cached. */
export class ShadowMaps {
  statics: Silhouette[] = []
  dynamics: Silhouette[] = []
  /** Bumped when the static silhouettes change (the static layer was rebuilt). */
  version = 0
  private cache = new Map<string, { key: string; base: Float32Array; map: ShadowMap }>()

  /** The map for light `l` this frame (static bake from the cache, moving things laid on top). */
  mapFor(l: Light): ShadowMap {
    // the map's size steps with the light's reach, so a flickering fire doesn't rebake
    const half = Math.min(120, Math.ceil((l.radius * 1.2) / 16) * 16)
    const cell = Math.max(0.5, (2 * half) / 220)
    const n = Math.ceil((2 * half) / cell)
    const key = `${this.version}|${l.x.toFixed(1)}|${(l.shadowY ?? l.y).toFixed(1)}|${l.z.toFixed(1)}|${half}`
    const name = l.name ?? `${l.x},${l.z}`
    let c = this.cache.get(name)
    if (!c || c.key !== key) {
      const map: ShadowMap = { x0: l.x - (n * cell) / 2, z0: l.z - (n * cell) / 2, cell, n, occ: new Float32Array(n * n) }
      for (const s of this.statics) if (near(l, s, half)) splat(map, l, s)
      c = { key, base: map.occ.slice(), map }
      this.cache.set(name, c)
    } else c.map.occ.set(c.base)
    for (const s of this.dynamics) if (near(l, s, half)) splat(c.map, l, s)
    return c.map
  }
}

const near = (l: Light, s: Silhouette, half: number) => Math.abs(s.x - l.x) < half && Math.abs(s.z - l.z) < half
