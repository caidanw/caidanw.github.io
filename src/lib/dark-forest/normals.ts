/**
 * Normal maps for pixel art, generated from the pixels themselves.
 *
 * A TypeScript port of the relief step in Sprite Fusion's sprite-normals
 * (https://github.com/Hugo-Dz/spritefusion-sprite-normals, MIT, Hugo Duprez):
 *
 *   height = log-compressed distance from the silhouette edge   (volume)
 *          + painted lightness, lightly blurred                  (surface detail)
 *   normal = normalize(-dx * strength, dy * strength, 1) from Sobel slopes
 *
 * The one addition is a region map: many objects can share one buffer (the
 * whole static scene), and each region is treated as its own silhouette, so
 * edges between touching objects still read as edges.
 *
 * Output normals are screen space: x right, y up, z toward the viewer.
 */

export interface ReliefSettings {
  shapeRadius: number
  shapeStrength: number
  shapeSoftness: number
  detailStrength: number
  detailScale: number
  normalStrength: number
}

/** The upstream defaults, with detail turned down: our art has a lot of painted texture. */
export const RELIEF_DEFAULTS: ReliefSettings = {
  shapeRadius: 4,
  shapeStrength: 1.15,
  shapeSoftness: 1.15,
  detailStrength: 3,
  detailScale: 0.6,
  normalStrength: 2,
}

/** Perceptual lightness (OKLab L) of a linear-ish 0..1 colour. */
export function lightness(r: number, g: number, b: number): number {
  const l = Math.cbrt(0.41222146 * r + 0.53633255 * g + 0.051445995 * b)
  const m = Math.cbrt(0.2119035 * r + 0.6806995 * g + 0.10739696 * b)
  const s = Math.cbrt(0.08830246 * r + 0.28171885 * g + 0.6299787 * b)
  return 0.21045426 * l + 0.7936178 * m - 0.004072047 * s
}

/**
 * Fill nx/ny/nz for every pixel with region > 0. `light` is per-pixel lightness.
 * Pixels with region 0 get nz = 0, meaning "no normal".
 */
export function reliefNormals(
  w: number,
  h: number,
  region: Int32Array,
  light: Float32Array,
  nx: Float32Array,
  ny: Float32Array,
  nz: Float32Array,
  s: ReliefSettings = RELIEF_DEFAULTS,
) {
  const n = w * h
  const same = (i: number, j: number) => region[j] === region[i]

  // 1. distance to the region edge (two-pass chamfer; an approximation of the upstream EDT)
  const dist = new Float32Array(n)
  for (let i = 0; i < n; i++) dist[i] = region[i] ? 1e9 : 0
  const relax = (i: number, x: number, y: number, dx: number, dy: number, cost: number) => {
    const xx = x + dx
    const yy = y + dy
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) return Math.min(dist[i], cost)
    const j = yy * w + xx
    return same(i, j) ? Math.min(dist[i], dist[j] + cost) : Math.min(dist[i], cost)
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!region[i]) continue
      dist[i] = relax(i, x, y, -1, 0, 1)
      dist[i] = relax(i, x, y, 0, -1, 1)
      dist[i] = relax(i, x, y, -1, -1, Math.SQRT2)
      dist[i] = relax(i, x, y, 1, -1, Math.SQRT2)
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (!region[i]) continue
      dist[i] = relax(i, x, y, 1, 0, 1)
      dist[i] = relax(i, x, y, 0, 1, 1)
      dist[i] = relax(i, x, y, 1, 1, Math.SQRT2)
      dist[i] = relax(i, x, y, -1, 1, Math.SQRT2)
    }
  }

  // 2. volume: log-compressed inset, so wide shapes dome without becoming towers
  const shape = new Float32Array(n)
  const R = s.shapeRadius
  for (let i = 0; i < n; i++) {
    if (!region[i]) continue
    shape[i] = s.shapeStrength * R * Math.log1p(Math.max(0, dist[i] - 0.5) / R)
  }

  // 3. lightness centred on the scene's range (a constant offset has no normal)
  let lo = 1
  let hi = 0
  for (let i = 0; i < n; i++) {
    if (!region[i]) continue
    lo = Math.min(lo, light[i])
    hi = Math.max(hi, light[i])
  }
  const centred = new Float32Array(n)
  for (let i = 0; i < n; i++) if (region[i]) centred[i] = light[i] - (lo + hi) / 2

  // 4. combine: blurred volume + fine and broad detail, each blurred within its region
  const height = maskedGaussian(shape, region, w, h, s.shapeSoftness)
  const fine = maskedGaussian(centred, region, w, h, s.detailScale)
  const broad = maskedGaussian(centred, region, w, h, s.detailScale * 2)
  for (let i = 0; i < n; i++) if (region[i]) height[i] += s.detailStrength * (0.7 * fine[i] + 0.3 * broad[i])

  // 5. Sobel slopes -> normals (neighbours outside the region read as the centre)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!region[i]) {
        nz[i] = 0
        continue
      }
      const at = (dx: number, dy: number) => {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) return height[i]
        const j = yy * w + xx
        return same(i, j) ? height[j] : height[i]
      }
      const dx = (at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1)) * 0.125
      const dy = (at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1)) * 0.125
      const ox = -dx * s.normalStrength
      const oy = dy * s.normalStrength
      const len = Math.sqrt(ox * ox + oy * oy + 1)
      nx[i] = ox / len
      ny[i] = oy / len
      nz[i] = 1 / len
    }
  }
}

/** Separable gaussian that only mixes pixels of the same region. */
function maskedGaussian(src: Float32Array, region: Int32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3))
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)))
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const pass = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (!region[i]) continue
        let sum = 0
        let wt = 0
        for (let t = -r; t <= r; t++) {
          const xx = horizontal ? x + t : x
          const yy = horizontal ? y : y + t
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          const j = yy * w + xx
          if (region[j] !== region[i]) continue
          sum += from[j] * k[t + r]
          wt += k[t + r]
        }
        to[i] = sum / wt
      }
    }
  }
  pass(src, tmp, true)
  pass(tmp, out, false)
  return out
}

/** Normals for a char-grid sprite, cached per sprite + palette. */
export interface SpriteNormals {
  w: number
  h: number
  nx: Float32Array
  ny: Float32Array
  nz: Float32Array
}
const spriteCache = new WeakMap<readonly string[], SpriteNormals>()

export function spriteNormals(rows: readonly string[], colorOf: (ch: string) => [number, number, number]): SpriteNormals {
  const hit = spriteCache.get(rows)
  if (hit) return hit
  const pad = 2
  const w = rows[0].length + pad * 2
  const h = rows.length + pad * 2
  const region = new Int32Array(w * h)
  const light = new Float32Array(w * h)
  rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === '.') return
      const i = (r + pad) * w + c + pad
      region[i] = 1
      light[i] = lightness(...colorOf(ch))
    }),
  )
  const out = { w, h, nx: new Float32Array(w * h), ny: new Float32Array(w * h), nz: new Float32Array(w * h) }
  reliefNormals(w, h, region, light, out.nx, out.ny, out.nz, { ...RELIEF_DEFAULTS, shapeRadius: 3, detailStrength: 4 })
  spriteCache.set(rows, out)
  return out
}
