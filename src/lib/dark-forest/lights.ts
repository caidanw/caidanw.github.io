/**
 * One light model for every source in the scene: the campfire, the lantern,
 * candles, hut windows, glowing caps, fireflies.
 *
 * A light is a point in world space with a reach (radius) and a colour that
 * already includes its brightness. How it lands depends on what it hits:
 *
 *   ground   quadratic falloff in 6 bands, dithered with world-anchored grain
 *            (texture, not a grid) and blended with the smooth falloff;
 *            optionally darkened by soft shadows cast away from the light
 *   objects  smooth falloff shaped by the surface normal (wrap lambert)
 *
 * On top of the core, `wobble` makes the edge breathe and wander (flames),
 * and `tail` adds a long faint spill past the radius (light bleeding into
 * the surroundings). Ambient moonlight is separate (see renderer).
 */
import { vnoise, type Color } from './util'

export interface Light {
  x: number
  y: number
  z: number
  radius: number
  /** Colour times brightness. The campfire is around [1.7, 0.95, 0.42]. */
  color: Color
  /** 0..1: how much the edge breathes and wanders (flames ~1, steady lamps 0). */
  wobble: number
  /** Strength of the faint spill beyond the radius (0 = none). */
  tail: number
  /** Cast soft ground shadows from casters standing in this light. */
  shadows: boolean
  /** Varies the wobble pattern between lights. */
  seed: number
}

/** Something standing on the ground that can cast a shadow: base, half-width, height. */
export interface Caster {
  x: number
  z: number
  r: number
  h: number
}

interface Prepared extends Light {
  reach2: number
  blockers: { x: number; z: number; ux: number; uz: number; d: number; L: number; r: number }[]
}

const BANDS = 6
const TAIL_REACH = 2.4 // the spill fades out at this many radii

/** Prepare a frame's lights: bounds, and shadow casters relative to each shadowing light. */
export function prepareLights(lights: Light[], casters: Caster[]): Prepared[] {
  return lights.map((l) => {
    const reach = l.radius * (l.tail > 0 ? TAIL_REACH : 1.2)
    const blockers = l.shadows
      ? casters.flatMap((c) => {
          const dx = c.x - l.x
          const dz = c.z - l.z
          const d = Math.hypot(dx, dz)
          if (d < 2.5 || d > l.radius * 1.15) return []
          // a caster of height h, lit from height y, throws a shadow roughly h * d / y long
          return [{ x: c.x, z: c.z, ux: dx / d, uz: dz / d, d, L: Math.min(70, (c.h * d) / Math.max(1, l.y)), r: c.r }]
        })
      : []
    return { ...l, reach2: reach * reach, blockers }
  })
}

/** How much of light `l` reaches ground point (x, z): 1 = fully lit. */
function shadowAt(l: Prepared, x: number, z: number): number {
  let s = 0
  for (const c of l.blockers) {
    const vx = x - c.x
    const vz = z - c.z
    const along = vx * c.ux + vz * c.uz
    if (along < -c.r || along > c.L) continue
    const perp = Math.abs(vx * c.uz - vz * c.ux)
    const rr = c.r * (1 + (Math.max(0, along) / c.d) * 0.9) // the penumbra widens with distance
    if (perp > rr + 1.5) continue
    const edge = 1 - Math.min(1, Math.max(0, (perp - rr + 0.6) / 2.1))
    const fade = Math.pow(1 - Math.max(0, along) / c.L, 0.6)
    s = Math.max(s, edge * fade * 0.85)
  }
  return 1 - s
}

/**
 * Add the light from every source arriving at world point (x, y, z) to `out`.
 * `grain` is the ground's dither threshold (0..1); normal is screen space
 * (x right, y up, z toward the viewer), or null for none.
 */
export function gatherLight(
  lights: Prepared[],
  t: number,
  x: number,
  y: number,
  z: number,
  ground: boolean,
  grain: number,
  normal: [number, number, number] | null,
  out: Color,
) {
  for (const l of lights) {
    const dx = x - l.x
    const dz = z - l.z
    const dy = y - l.y
    const dd = dx * dx + dz * dz + dy * dy * 0.2
    if (dd >= l.reach2) continue
    const d = Math.sqrt(dd)
    let R = l.radius
    if (l.wobble > 0 && d < R * 1.3) {
      R *= 1 + l.wobble * (0.16 * (vnoise(Math.atan2(dz, dx) * 2.4 + l.seed, t * 0.7) - 0.5) + 0.08 * (vnoise(x * 0.06 + l.seed, z * 0.06) - 0.5))
    }
    let f = 1 - d / R
    f = f > 0 ? f * f : 0
    let tail = l.tail > 0 ? (l.tail * Math.max(0, 1 - d / (l.radius * TAIL_REACH))) / (1 + (d / l.radius) ** 2 * 5) : 0
    if (ground) {
      if (f > 0) {
        const banded = Math.floor(f * BANDS + grain) / BANDS
        f = 0.55 * banded + 0.45 * f
        if (l.blockers.length) f *= shadowAt(l, x, z)
      }
    } else if (normal) {
      const ln = Math.hypot(dx, dy, dz) || 1
      const ndl = -(normal[0] * dx + normal[1] * dy + normal[2] * dz) / ln
      const lam = Math.min(1, Math.max(0, (ndl + 0.15) / 1.15))
      f *= 0.2 + 1.15 * lam
      tail *= 0.4 + 0.9 * lam
    }
    const k = f + tail
    if (k <= 0) continue
    out[0] += k * l.color[0]
    out[1] += k * l.color[1]
    out[2] += k * l.color[2]
  }
}

/** World-anchored grain for ground dithering: a stable noise value per ground pixel. */
export const groundGrain = (x: number, z: number): number => {
  const h = Math.imul(Math.floor(x * 1.35) + 999, 374761393) + Math.imul(Math.floor(z * 0.6), 668265263)
  const v = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296
}
