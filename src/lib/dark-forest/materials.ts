/**
 * The shape layer and the material layer that normals are built from.
 *
 * Shape: props are made of primitives (cylinders, domes, slabs, a mushroom
 * cap), and each primitive knows its true surface normal. That's what makes
 * a trunk read as round and a cap have a top, a lip and an underside, instead
 * of every silhouette becoming the same soft pillow.
 *
 * Material: a per-pixel micro height (stone grain and pits, bark grooves,
 * leaf bumps, carved grooves) with a weight, baked on top of the shape normal
 * in the static pass (see Renderer.buildStatic).
 *
 * Normals are screen space: x right, y up, z toward the viewer.
 */
import { hash, vnoise } from './util'

export type Normal = [number, number, number]

const norm = (x: number, y: number, z: number): Normal => {
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}

export const shape = {
  /** A vertical cylinder; u = -1 at the left edge, 1 at the right. */
  cylinder(u: number): Normal {
    const c = Math.max(-0.98, Math.min(0.98, u))
    return [c, 0, Math.sqrt(1 - c * c)]
  },
  /** A dome/sphere seen from the front; u, v in -1..1, v down. */
  dome(u: number, v: number): Normal {
    return norm(u, -v, Math.sqrt(Math.max(0.05, 1 - u * u - v * v)))
  },
  /** A standing slab with bevelled edges: faces the viewer, edges turn away, the top faces up. */
  slab(k: number, half: number, r: number, height: number): Normal {
    if (r >= height - 2) return norm((k / half) * 0.3, 0.75, 0.6)
    if (k <= -half) return norm(-0.75, 0, 0.65)
    if (k >= half - 1) return norm(0.75, 0, 0.65)
    return norm((k / half) * 0.25, 0.05, 1)
  },
  /**
   * A mushroom cap (an ellipse, u, v in -1..1, v down): the domed top faces up
   * and out, a lip runs round the rim, and the gilled underside faces down.
   */
  cap(u: number, v: number): Normal {
    if (v > 0.6) return norm(u * 0.4, -0.85, 0.35) // underside
    if (v > 0.42) return norm(u * 0.95, -0.05, 0.55) // the lip
    return norm(u * 0.75, 0.75 - v * 0.6, 0.55) // the top
  },
  flat: [0, 0, 1] as Normal,
}

/** Material micro heights (roughly -1..1) and how strongly each bakes into the normals. */
export const micro = {
  stone(px: number, py: number, seed: number): number {
    let h = 0.55 * (vnoise(px * 0.7 + seed, py * 0.7) - 0.5) * 2 // granular lumps
    h += 0.35 * (hash(px * 7 + seed, py * 13) - 0.5) // grit
    if (hash(px * 3 + seed, py * 5) < 0.06) h -= 1.2 // pits
    h -= 1.4 * Math.max(0, vnoise(px * 0.35 + seed, py * 0.06) - 0.68) * 3 // erosion streaks running down
    return h
  },
  bark(px: number, py: number, seed: number): number {
    return 0.6 * Math.sin(px * 2.2 + vnoise(py * 0.15, seed) * 4) + 0.3 * (hash(px + seed, py) - 0.5)
  },
  leaves(px: number, py: number, seed: number): number {
    return 0.6 * (vnoise(px * 0.9 + seed, py * 0.9) - 0.5) * 2 + 0.5 * (hash(px * 5 + seed, py * 3) - 0.5)
  },
  fibre(px: number, py: number, seed: number): number {
    return 0.35 * Math.sin(px * 3.1 + seed) + 0.2 * (hash(px, py + seed) - 0.5)
  },
  wood(px: number, py: number, seed: number): number {
    return 0.4 * Math.sin(py * 2.6 + vnoise(px * 0.3, seed) * 3) + 0.2 * (hash(px * 3, py + seed) - 0.5)
  },
}

export const WEIGHT = { stone: 1, bark: 0.55, leaves: 0.7, cap: 0.35, stem: 0.35, wood: 0.5, metal: 0.12, carving: 1 }
