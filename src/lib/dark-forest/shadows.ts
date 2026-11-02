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
 * Things standing in a shadow: besides darkening the ground, each map keeps, per cell, the band
 * of heights the shadow passes through there (between the rays over a caster's top and under
 * its foot), so a creature behind the knight darkens from its feet up to where his shadow
 * reaches. Every caster's shadow knows who cast it, and nothing is shadowed by itself.
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
  /** Column width in screen pixels (each run covers one column). */
  col: number
  /** The caster's hover tag (it isn't shadowed by itself) and half-width in world units. */
  tag: number
  r: number
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
  /** How shadowed the ground is. */
  occ: Float32Array
  /** For things standing in it: how strong, the band of heights it covers, and who cast it. */
  oa: Float32Array
  lo: Float32Array
  hi: Float32Array
  owner: Int32Array
}

const newMap = (x0: number, z0: number, cell: number, n: number): ShadowMap => ({
  x0,
  z0,
  cell,
  n,
  occ: new Float32Array(n * n),
  oa: new Float32Array(n * n),
  lo: new Float32Array(n * n),
  hi: new Float32Array(n * n),
  owner: new Int32Array(n * n),
})
const copyMap = (to: ShadowMap, from: ShadowMap) => {
  to.occ.set(from.occ)
  to.oa.set(from.oa)
  to.lo.set(from.lo)
  to.hi.set(from.hi)
  to.owner.set(from.owner)
}

/** How much less dark a shadow is on things standing in it than on the ground. */
export const OBJECT_DARKNESS = 0.6

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
    readonly tag = 0,
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
    let r = 0
    for (let k = 0; k < runs.length; k += 3) r = Math.max(r, Math.abs(runs[k] + this.ox) + this.col / 2)
    return { x: this.x, z: this.z, s: this.s, col: this.col, ox: this.ox, tag: this.tag, r: r / this.s, runs: Int16Array.from(runs) }
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
  const colR = sil.col / 2 / sil.s // half a column's width, in world units: neighbouring strokes meet
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
      const core = colR * t + spread * 0.04
      const soft = map.cell * 0.75 + spread * 0.06
      const fade = Math.min(1, Math.max(0, 1 - (t - 1) / (MAX_STRETCH - 1)))
      dab(map, gx, gz, core, soft, fade)
      // the next dab, about half a dab further along the ground
      const step = Math.max(map.cell * 0.5, (core + soft) * 0.4)
      const dist = Math.hypot(wx - l.x, wz - l.z)
      t += step / Math.max(0.01, dist)
    }
    // things standing behind it: from just behind the caster out to where its top's ray lands,
    // the shadow covers the heights between the rays over its top and under its foot
    const dist = Math.max(0.01, Math.hypot(wx - l.x, wz - l.z))
    t = 1 + (sil.r + colR) / dist
    while (t <= t1) {
      const hi = ly + (yTop - ly) * t
      if (hi <= 0.3) break
      const lo = Math.max(0, ly + (yBot - ly) * t)
      const gx = l.x + (wx - l.x) * t
      const gz = l.z + (wz - l.z) * t
      if (Math.abs(gx - l.x) > half || Math.abs(gz - l.z) > half) break
      const core = colR * t
      const soft = map.cell * 0.75
      const fade = Math.min(1, Math.max(0, 1 - (t - 1) / (MAX_STRETCH - 1)))
      band(map, gx, gz, core, soft, fade, lo, hi, sil.tag)
      t += Math.max(map.cell * 0.5, (core + soft) * 0.4) / dist
    }
  }
}

/** Like dab(), for the heights a shadow covers: keeps the union of the bands, and the strongest caster. */
function band(map: ShadowMap, gx: number, gz: number, core: number, soft: number, v: number, lo: number, hi: number, tag: number) {
  if (v <= 0) return
  const inv = 1 / map.cell
  const rad = core + soft
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
      const a = v * Math.min(1, (rad - Math.sqrt(e2)) / soft)
      if (map.oa[o] <= 0.01) {
        map.lo[o] = lo
        map.hi[o] = hi
        map.owner[o] = tag
        map.oa[o] = a
        continue
      }
      if (lo < map.lo[o]) map.lo[o] = lo
      if (hi > map.hi[o]) map.hi[o] = hi
      if (a > map.oa[o]) {
        map.oa[o] = a
        map.owner[o] = tag
      }
    }
  }
}

/** Parts of a caster whose shadow would stretch further than this (times its own distance) cast none. */
const MAX_STRETCH = 6

/**
 * A soft round dab of shadow: solid out to `core`, then fading over `soft` more (at least about
 * a map cell, so thin strokes slide across the map instead of popping cell to cell). Keeps the
 * darkest.
 */
function dab(map: ShadowMap, gx: number, gz: number, core: number, soft: number, v: number) {
  if (v <= 0) return
  const inv = 1 / map.cell
  const rad = core + soft
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
      const a = v * Math.min(1, (rad - Math.sqrt(e2)) / soft)
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

/**
 * How shadowed a thing standing at (x, z), at height y, is through this map: 0 lit .. 1 in full
 * shadow. `tag` is the thing's own (its own shadow doesn't count).
 */
export function shadowOnObject(map: ShadowMap, x: number, z: number, y: number, tag: number): number {
  const fx = (x - map.x0) / map.cell - 0.5
  const fz = (z - map.z0) / map.cell - 0.5
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  if (i < 0 || j < 0 || i >= map.n - 1 || j >= map.n - 1) return 0
  const at = (o: number) => {
    const a = map.oa[o]
    if (a <= 0.01 || (tag && map.owner[o] === tag)) return 0
    // soft at the top and bottom of the band (a unit or so)
    return a * Math.min(1, Math.max(0, (map.hi[o] - y) / 1.2 + 0.5)) * Math.min(1, Math.max(0, (y - map.lo[o]) / 1.2 + 0.5))
  }
  const tx = fx - i
  const tz = fz - j
  const o = j * map.n + i
  const a = at(o) + (at(o + 1) - at(o)) * tx
  const b = at(o + map.n) + (at(o + map.n + 1) - at(o + map.n)) * tx
  return a + (b - a) * tz
}

/** The shadow maps of every light, baked and cached. */
export class ShadowMaps {
  statics: Silhouette[] = []
  dynamics: Silhouette[] = []
  /** Bumped when the static silhouettes change (the static layer was rebuilt). */
  version = 0
  private cache = new Map<string, { key: string; base: ShadowMap; map: ShadowMap }>()

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
      const base = newMap(l.x - (n * cell) / 2, l.z - (n * cell) / 2, cell, n)
      for (const s of this.statics) if (near(l, s, half)) splat(base, l, s)
      const map = newMap(base.x0, base.z0, cell, n)
      copyMap(map, base)
      c = { key, base, map }
      this.cache.set(name, c)
    } else copyMap(c.map, c.base)
    for (const s of this.dynamics) if (near(l, s, half)) splat(c.map, l, s)
    return c.map
  }
}

const near = (l: Light, s: Silhouette, half: number) => Math.abs(s.x - l.x) < half && Math.abs(s.z - l.z) < half
