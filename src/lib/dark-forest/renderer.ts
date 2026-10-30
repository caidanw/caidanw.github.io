/**
 * Software renderer. The scene is drawn into a 320x180 framebuffer that keeps,
 * per pixel: albedo, the world position it came from (so firelight can fall on
 * the ground plane as a real circle), a depth for sorting, and a planar
 * reflection layer for the pool. Emissives (fire, embers, glows) go in a
 * separate layer that is composited on top and also blurred into a soft bloom.
 * Output is nearest-neighbour upscaled ("Sworcery" pixels) with banded light.
 */
import { BAYER4, clamp, hash, hex, mix, rngFrom, vnoise, type Color } from './util'
import {
  C,
  EYES,
  H,
  HEARTH,
  HORIZON,
  N,
  PADS,
  PROPS,
  POOL,
  REEDS,
  SHROOMS,
  TREES,
  TUFTS,
  W,
  inPool,
  mistAt,
  project,
  unproject,
  type Point,
  type Tree,
} from './world'
import { CROW, DEER, DEER_PAL, FROG, FROG_PAL, KNIGHT, KNIGHT_NOD, KNIGHT_PAL, MUSH, MUSH_PAL, type Palette, type Rows } from './sprites'
import { WALKING, doorOpen, hutOccupancy, isMoving, isRaining, lightRadius, perchPos, type World } from './sim'

const FONT = "ServerMono, 'Server Mono', ui-monospace, monospace"
const FLAME = ['#a3311b', '#e0612a', '#ffb347', '#fff1c1'].map(hex)
const GLOW = {
  cap: hex('#9ff5e4'),
  window: hex('#ffcf7a'),
  inside: hex('#b8743a'),
  lantern: [hex('#ffd27a'), hex('#ffb347'), hex('#ff9a3c')],
  rune: hex('#8ff0e0'),
  shroom: hex('#7fe6d6'),
  shroomD: hex('#5bc2b4'),
  candle: hex('#ffd27a'),
  eye: hex('#e8d78a'),
  firefly: hex('#d8f27a'),
  zzz: hex('#c9d6e8'),
  croak: hex('#e8e0b8'),
  star: hex('#e9e3d4'),
  ripple: hex('#aabed8'),
}

type Buf = ReturnType<typeof makeBuf>
function makeBuf() {
  const f = () => new Float32Array(N)
  const u = () => new Uint8Array(N)
  return {
    // albedo + coverage; obj = covered by an object (not bare ground)
    r: f(),
    g: f(),
    b: f(),
    a: u(),
    obj: u(),
    // world position the pixel came from, and its depth
    kx: f(),
    kz: f(),
    ky: f(),
    dep: f(),
    // planar reflection (what the pool mirrors at this pixel)
    rr: f(),
    rg: f(),
    rb: f(),
    ra: u(),
    rkx: f(),
    rkz: f(),
    rky: f(),
    // unlit background (sky)
    bgr: f(),
    bgg: f(),
    bgb: f(),
    pool: u(),
  }
}
function copyBuf(d: Buf, s: Buf) {
  for (const k in s) (d[k as keyof Buf] as Float32Array).set(s[k as keyof Buf] as Float32Array)
}

/** Rasterise a filled ellipse; fn gets the pixel and normalised offsets (u, w) in [-1, 1]. */
function disc(fn: (px: number, py: number, u: number, w: number) => void, cx: number, cy: number, rx: number, ry: number) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)))
    for (let dx = -half; dx <= half; dx++) fn(cx + dx, cy + dy, dx / (rx || 1), dy / (ry || 1))
  }
}

const trigonPx = (() => {
  const out: [number, number][] = []
  for (let r = 0; r < 5; r++) for (let k = -r; k <= r; k++) if (r === 4 || Math.abs(k) === r) out.push([k, r - 2])
  return out
})()

/** Hut pixel geometry, relative to the hut's base (k = columns from centre, r = rows up). */
const HUT_PX = { stemH: 16, capY: 20, inside: -3.5, chimney: [9.5, 31] as const }
const isDoor = (k: number, r: number) => (k >= -4 && k <= -1 && r <= 7) || (r === 8 && (k === -3 || k === -2))
const isDoorFrame = (k: number, r: number) => ((k === -5 || k === 0) && r <= 8) || (r === 9 && k >= -4 && k <= -1) || (r === 8 && (k === -4 || k === -1))
const isWindow = (k: number, r: number) => k >= 1 && k <= 4 && r >= 9 && r <= 11 && !((k === 1 || k === 4) && (r === 9 || r === 11))
const DOOR_PX: [number, number][] = []
const WINDOW_PX: [number, number][] = []
for (let r = 0; r < 12; r++) {
  for (let k = -5; k <= 5; k++) {
    if (isDoor(k, r)) DOOR_PX.push([k, r])
    if (isWindow(k, r)) WINDOW_PX.push([k, r])
  }
}

const STARS = Array.from({ length: 120 }, (_, i) => {
  const r = rngFrom(i * 77 + 5)
  return { x: (r() * W) | 0, y: (r() * (HORIZON - 6)) | 0, b: 0.3 + r() * 0.7, ph: r() * 6 }
})

const STATE_WORDS: Record<string, string> = {
  entering: 'going home to rest',
  exiting: 'up and about again',
  idle: 'pottering about',
  wander: 'pottering about',
  fetch: 'off to fetch a stick',
  haul: 'hauling a stick to the pile',
  feed: 'fetching a log for the fire',
  stoke: 'feeding the brazier',
  toHut: 'heading home to nap',
}

export interface RenderOptions {
  glow: boolean
  debug: boolean
}

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private scale = 4
  private st = makeBuf() // static layer (ground, trees, props), rebuilt only when the pool level moves
  private fb = makeBuf() // per-frame layer
  private fx = {
    r: new Float32Array(N),
    g: new Float32Array(N),
    b: new Float32Array(N),
    a: new Float32Array(N),
    rr: new Float32Array(N),
    rg: new Float32Array(N),
    rb: new Float32Array(N),
    ra: new Float32Array(N),
  }
  private out = { r: new Float32Array(N), g: new Float32Array(N), b: new Float32Array(N) }
  private outC = document.createElement('canvas')
  private outX: CanvasRenderingContext2D
  private outImg: ImageData
  private fxC = document.createElement('canvas')
  private fxX: CanvasRenderingContext2D
  private fxImg: ImageData
  private bakedLevel = -1
  private hits: { x0: number; y0: number; x1: number; y1: number; depth: number; name: string; sub: string }[] = []
  /** Pointer position in framebuffer pixels, or null when it's off the canvas. */
  pointer: { x: number; y: number } | null = null

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    for (const c of [this.outC, this.fxC]) {
      c.width = W
      c.height = H
    }
    this.outX = this.outC.getContext('2d')!
    this.fxX = this.fxC.getContext('2d')!
    this.outImg = this.outX.createImageData(W, H)
    this.fxImg = this.fxX.createImageData(W, H)
    this.setScale(4)
  }

  /** Output resolution is W*scale x H*scale. */
  setScale(scale: number) {
    this.scale = scale
    this.canvas.width = W * scale
    this.canvas.height = H * scale
  }

  /** Is this screen pixel visible pool surface? */
  isOpenWater = (sx: number, sy: number): boolean => {
    const i = sy * W + sx
    return this.fb.pool[i] === 1 && this.fb.obj[i] === 0
  }

  render(w: World, opts: RenderOptions) {
    if (Math.abs(w.poolLevel - this.bakedLevel) > 0.035) this.buildStatic(w.poolLevel)
    this.drawDynamic(w)
    this.compose(w)
    this.present(w, opts)
  }

  // ---------------------------------------------------------------- drawing primitives

  /** Write an object pixel if it is nearer than what's there. Returns whether it won the depth test. */
  private put(B: Buf, px: number, py: number, c: Color, wx: number, wz: number, wy: number, baseY: number, depth: number, noRefl = false): boolean {
    px = Math.round(px)
    py = Math.round(py)
    if (px < 0 || px >= W || py < 0 || py >= H) return false
    const i = py * W + px
    if (depth < B.dep[i]) return false
    B.r[i] = c[0]
    B.g[i] = c[1]
    B.b[i] = c[2]
    B.a[i] = 1
    B.obj[i] = 1
    B.kx[i] = wx
    B.kz[i] = wz
    B.ky[i] = wy
    B.dep[i] = depth
    if (noRefl) return true
    // mirror the pixel about its base line into the pool
    const ry = Math.round(2 * baseY - py)
    if (ry < 0 || ry >= H) return true
    const j = ry * W + px
    if (B.pool[j] && !B.obj[j]) {
      B.rr[j] = c[0]
      B.rg[j] = c[1]
      B.rb[j] = c[2]
      B.ra[j] = 1
      B.rkx[j] = wx
      B.rkz[j] = wz
      B.rky[j] = wy
    }
    return true
  }

  /**
   * Write an emissive pixel. Emissives that belong to something in the world
   * pass its `depth`, so whatever stands in front hides them (and their bloom).
   * `baseY` is the screen line to mirror about for pool reflections.
   */
  private putFx(px: number, py: number, c: Color, a: number, baseY?: number, depth?: number) {
    const fx = this.fx
    px = Math.round(px)
    py = Math.round(py)
    if (px < 0 || px >= W || py < 0 || py >= H) return
    const i = py * W + px
    if (depth !== undefined && depth < this.fb.dep[i]) return
    fx.r[i] = c[0]
    fx.g[i] = c[1]
    fx.b[i] = c[2]
    fx.a[i] = a
    if (baseY === undefined) return
    const ry = Math.round(2 * baseY - py)
    if (ry < 0 || ry >= H) return
    const j = ry * W + px
    if (this.fb.pool[j] && !this.fb.obj[j]) {
      fx.rr[j] = c[0]
      fx.rg[j] = c[1]
      fx.rb[j] = c[2]
      fx.ra[j] = a
    }
  }

  /** Draw a char-grid sprite standing at world (wx, wz), with an automatic dark outline. */
  private sprite(
    B: Buf,
    rows: Rows,
    wx: number,
    wz: number,
    pal: Palette,
    flip: boolean,
    opts: { lift?: number; dep?: number; glowChar?: string; hover?: [string, string] } = {},
  ) {
    const [bx, by] = project(wx, 0, wz)
    const dep = opts.dep ?? wz + 0.5
    const lift = opts.lift ?? 0
    const h = rows.length
    const w = rows[0].length
    const glow: [number, number][] = []
    const at = (r: number, c: number) => rows[r][flip ? w - 1 - c : c]
    const filled = (r: number, c: number) => r >= 0 && r < h && c >= 0 && c < w && at(r, c) !== '.'
    for (let r = -1; r <= h; r++) {
      for (let c = -1; c <= w; c++) {
        if (filled(r, c) || (r === h && lift === 0)) continue
        if (filled(r - 1, c) || filled(r + 1, c) || filled(r, c - 1) || filled(r, c + 1)) {
          this.put(B, bx - (w >> 1) + c, by - h + r + 1 - lift, C.outline, wx, wz, h - r + lift, by, dep - 0.01)
        }
      }
    }
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const ch = at(r, c)
        if (ch === '.') continue
        const px = bx - (w >> 1) + c
        const py = by - h + r + 1 - lift
        if (this.put(B, px, py, pal[ch], wx, wz, h - r + lift, by, dep) && ch === opts.glowChar) glow.push([px, py])
      }
    }
    if (opts.hover) this.hit(bx - (w >> 1) - 1, by - h - lift, bx - (w >> 1) + w, by + 1, dep, ...opts.hover)
    return { bx, by, h, glow, dep }
  }

  // ---------------------------------------------------------------- static layer

  private groundCol(x: number, z: number, lvl: number): Color {
    const d = Math.hypot(x, z)
    if (inPool(x, z, lvl)) return C.water
    if (inPool(x, z, lvl * 1.16)) return C.shore
    const n = vnoise(x * 0.07, z * 0.09)
    const n2 = vnoise(x * 0.4 + 9, z * 0.4)
    let c = mix(C.grassA, C.grassB, n)
    if (n2 > 0.72) c = C.moss
    // worn paths: out to the road (lantern), and over to the hollow (huts)
    const toRoad = x < -14 && Math.abs(z - (6 + (x + 14) * -0.12 + Math.sin(x * 0.08) * 3)) < 3.2 + n2 * 1.5
    const toHollow = x < -10 && x > -56 && Math.abs(z - (-4 + (x + 10) * 0.42)) < 2.4 + n2
    if (toRoad || toHollow) c = mix(C.path, c, 0.25)
    if (d < 28) c = mix(C.dirt, c, clamp((d - 17) / 11 + (n2 - 0.5) * 0.6))
    return c
  }

  private drawTree(B: Buf, t: Tree) {
    const [bx, by, s] = project(t.x, 0, t.z)
    const dep = t.z
    const ys = by - project(t.x, 1, t.z)[1]
    const h = 95 * t.h
    const tw = Math.max(1, Math.round(1.8 * t.w * s))
    const rng = rngFrom(t.seed)
    for (let r = 0; r <= h * 1.25 * ys; r++) {
      for (let k = 0; k < tw; k++) this.put(B, bx - (tw >> 1) + k, by - r, k === 0 && tw > 1 ? C.trunkRim : C.trunk, t.x, t.z, r / ys, by, dep)
    }
    if (tw >= 2) {
      this.put(B, bx - (tw >> 1) - 1, by, C.trunk, t.x, t.z, 0, by, dep)
      this.put(B, bx + tw - (tw >> 1), by, C.trunk, t.x, t.z, 0, by, dep)
    }
    // a column of stacked clumps, narrowing toward the top, moonlit on the upper left
    const n = 4 + ((rng() * 4) | 0)
    const y0 = h * (0.32 + rng() * 0.15)
    const y1 = h * 1.2
    for (let k = 0; k < n; k++) {
      const f = k / (n - 1)
      const wy = y0 + (y1 - y0) * f
      const rad = Math.max(2, Math.round((4 + rng() * 3.5) * t.w * s * (1 - 0.45 * f)))
      const cx = Math.round(bx + (rng() - 0.5) * rad * 0.9)
      const cy = Math.round(by - wy * ys)
      disc(
        (px, py, u, v) => {
          const tex = hash(px * 3 + t.seed, py * 7)
          let c = t.tone > 0.5 ? C.canopy : C.canopyD
          if (u > 0.45) c = C.canopyD
          if ((u < -0.55 && v < 0.3) || (v < -0.7 && u < 0.3)) c = tex < 0.7 ? C.canopyRim : C.canopyHi
          else if (tex < 0.07) c = C.canopyHi
          this.put(B, px, py, c, t.x, t.z, wy - ((v * rad) / ys) * 0.5, by, dep + 0.001 * k)
        },
        cx,
        cy,
        rad,
        Math.round(rad * 1.15),
      )
    }
  }

  /**
   * A big mushroom house. The doorway is drawn as interior *behind* the walls
   * (depth hut.z + HUT_PX.inside), so shroomfolk walking in are hidden by the
   * walls but stay visible through the open door. The door itself, the lit
   * window and the interior glow are dynamic (see drawHutDynamic).
   */
  private drawHut(B: Buf, hut: Point) {
    const [bx, by, s] = project(hut.x, 0, hut.z)
    const dep = hut.z
    // light each column at its own world x, so the side facing the fire is the lit one
    const put = (k: number, r: number, c: Color, d = dep) => this.put(B, bx + k, by - r, c, hut.x + k / s, hut.z, r, by, d)
    for (let r = 0; r < HUT_PX.stemH; r++) {
      const flare = r < 2 ? 1 : 0
      for (let k = -7 - flare; k <= 6 + flare; k++) {
        if (isDoor(k, r)) {
          put(k, r, C.hutInside, dep + HUT_PX.inside)
          continue
        }
        let c = k >= 4 ? C.hutStemD : k <= -6 ? C.hutStemHi : C.hutStem
        if (hash(k * 13, r * 5 + hut.x) < 0.12) c = C.hutStemD // fibres
        if (isDoorFrame(k, r)) c = C.hutFrame
        if (isWindow(k, r)) c = C.door
        put(k, r, c)
      }
    }
    // the cap: big pale spots, gills underneath, moonlit rim on the upper left
    const spots: [number, number, number][] = [
      [-0.5, -0.3, 0.17],
      [0.12, -0.6, 0.15],
      [0.58, -0.15, 0.14],
      [-0.12, 0.05, 0.12],
      [0.35, 0.25, 0.1],
    ]
    disc(
      (px, py, u, v) => {
        let c = C.hutCap
        if (v > 0.55) c = (px & 1) === 0 ? C.hutGill : C.hutCapD
        else if (spots.some(([su, sv, sr]) => (u - su) ** 2 + ((v - sv) * 0.7) ** 2 < sr * sr)) c = C.hutSpot
        else if (u < -0.6 && v < 0.1) c = C.hutCapHi
        else if (u > 0.6 || v > 0.35) c = C.hutCapD
        this.put(B, px, py, c, hut.x + (px - bx) / s, hut.z, HUT_PX.capY - v * 4, by, dep + 0.01)
      },
      bx,
      by - HUT_PX.capY,
      16,
      8,
    )
    for (let r = 25; r < 31; r++) for (let k = 9; k <= 10; k++) put(k, r, r === 30 ? C.stoneD : k === 9 ? C.stone : C.stoneD, dep + 0.02) // chimney
  }

  private drawSword(B: Buf, p: Point) {
    const [bx, by] = project(p.x, 0, p.z)
    const dep = p.z
    // planted point-down, leaning a touch toward the fire
    for (let r = 0; r < 13; r++) {
      const lean = r > 8 ? 1 : 0
      this.put(B, bx + lean, by - r, C.blade, p.x, p.z, r, by, dep)
      this.put(B, bx + 1 + lean, by - r, C.bladeD, p.x, p.z, r, by, dep)
    }
    for (let k = -2; k <= 3; k++) this.put(B, bx + 1 + k, by - 13, C.guard, p.x, p.z, 13, by, dep)
    for (let r = 14; r < 17; r++) this.put(B, bx + 1, by - r, C.grip, p.x, p.z, r, by, dep)
    this.put(B, bx + 1, by - 17, C.pommel, p.x, p.z, 17, by, dep)
  }

  private drawPack(B: Buf, p: Point) {
    const [bx, by] = project(p.x, 0, p.z)
    disc((px, py, _u, v) => this.put(B, px, py, v < -0.3 ? C.packHi : C.pack, p.x, p.z, 2 - v * 2, by, p.z), bx, by - 2, 3, 2)
    this.put(B, bx - 3, by - 1, C.bedroll, p.x, p.z, 1, by, p.z)
    this.put(B, bx + 3, by - 1, C.bedroll, p.x, p.z, 1, by, p.z)
  }

  private drawGrave(B: Buf, g: Point & { helm?: boolean }, i: number) {
    const [bx, by] = project(g.x, 0, g.z)
    const dep = g.z
    disc((px, py, u, v) => this.put(B, px, py, v < -0.2 && u < 0 ? C.stoneHi : hash(px, py) < 0.4 ? C.stoneD : C.stone, g.x, g.z, 1 - v, by, dep), bx, by, 3, 1)
    // a rusted sword, tilted differently on each grave
    const tilt = [-1, 0, 1][i % 3]
    for (let r = 1; r < 11; r++) this.put(B, bx + Math.round((tilt * r) / 8), by - r, r % 4 === 0 ? C.rust : C.bladeD, g.x, g.z, r, by, dep + 0.1)
    const tx = bx + Math.round((tilt * 11) / 8)
    for (let k = -2; k <= 2; k++) this.put(B, tx + k, by - 11, C.rust, g.x, g.z, 11, by, dep + 0.1)
    this.put(B, tx, by - 12, C.grip, g.x, g.z, 12, by, dep + 0.1)
    this.put(B, tx, by - 13, C.grip, g.x, g.z, 13, by, dep + 0.1)
    if (g.helm) {
      disc((px, py, u, v) => this.put(B, px, py, v < 0 && u < 0 ? C.stoneHi : C.helm, g.x, g.z, 14 - v, by, dep + 0.2), tx, by - 15, 2, 2)
      this.put(B, tx + 1, by - 15, C.door, g.x, g.z, 15, by, dep + 0.3)
    }
  }

  private drawLanternPost(B: Buf, p: Point) {
    const [bx, by] = project(p.x, 0, p.z)
    const put = (dx: number, r: number, c: Color) => this.put(B, bx + dx, by - r, c, p.x, p.z, r, by, p.z)
    for (let r = 0; r < 22; r++) put(0, r, C.wood)
    for (let k = 0; k < 6; k++) put(k, 21, C.wood)
    put(5, 20, C.iron)
    for (let r = 15; r < 19; r++) {
      put(4, r, C.iron)
      put(6, r, C.iron)
    }
    put(5, 19, C.iron)
    put(5, 14, C.iron)
    for (let k = -5; k <= -1; k++) for (let r = 12; r < 15; r++) put(k, r, k === -5 ? C.signD : C.sign) // signboard pointing out of frame
  }

  private drawTrigon(B: Buf, p: Point) {
    const [bx, by, s] = project(p.x, 0, p.z)
    const hgt = Math.round(40 * s)
    const wid = Math.round(7 * s)
    for (let r = 0; r < hgt; r++) {
      const taper = r > hgt - 4 ? 1 : 0
      for (let k = -wid + taper; k <= wid - taper; k++) {
        let c = k < -wid + 2 ? C.stoneHi : k > wid - 2 ? C.stoneD : C.stone
        if (hash(k * 7, r * 3) < 0.08) c = C.stoneD
        if (hash(k, r) < 0.05 && r < hgt * 0.4) c = C.moss
        this.put(B, bx + k, by - r, c, p.x, p.z, r / s, by, p.z)
      }
    }
    const hy = by - Math.round(hgt * 0.6)
    for (const [dx, dy] of trigonPx) this.put(B, bx + dx, hy + dy, C.stoneD, p.x, p.z, (hgt * 0.6) / s, by, p.z + 0.1)
  }

  private buildStatic(lvl: number) {
    const B = this.st
    this.bakedLevel = lvl
    for (const k in B) (B[k as keyof Buf] as Float32Array).fill(0)
    B.dep.fill(-1e9)
    const setBg = (x: number, y: number, c: Color) => {
      if (x < 0 || x >= W || y < 0 || y >= H) return
      const i = y * W + x
      B.bgr[i] = c[0]
      B.bgg[i] = c[1]
      B.bgb[i] = c[2]
    }
    // sky, crescent moon, far ridge, distant tree silhouettes standing on the horizon
    for (let y = 0; y < H; y++) {
      const t = clamp(y / 72)
      const c = mix(hex('#04050a'), hex('#1b2535'), t * t)
      for (let x = 0; x < W; x++) setBg(x, y, c)
    }
    disc((x, y) => setBg(x, y, hex('#e9e3d4')), 170, 16, 7, 7)
    disc((x, y) => setBg(x, y, hex('#05070c')), 173, 14, 7, 7)
    for (let x = 0; x < W; x++) {
      const top = HORIZON - 6 - vnoise(x * 0.03, 4) * 16
      for (let y = top | 0; y <= HORIZON; y++) setBg(x, y, mix(hex('#121a27'), hex('#1b2535'), (y - top) / 22))
    }
    const r = rngFrom(3)
    for (let i = 0; i < 40; i++) {
      const x = (r() * W) | 0
      const top = (r() * 40) | 0
      const w = 1 + ((r() * 2) | 0)
      const col = hex('#0e1522')
      if (x > 126 && x < 194) continue
      for (let y = top; y <= HORIZON; y++) for (let k = 0; k < w; k++) setBg(x + k, y, col)
      for (let j = 0; j < 4; j++) {
        const cy = top + j * 7 + r() * 4
        const rad = (2 + r() * 3) | 0
        disc((px, py) => setBg(px, py, col), x, cy | 0, rad, rad + 1)
      }
    }
    // ground
    for (let y = HORIZON + 1; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        const [gx, gz] = unproject(x, y)!
        const c = this.groundCol(gx, gz, lvl)
        B.r[i] = c[0]
        B.g[i] = c[1]
        B.b[i] = c[2]
        B.a[i] = 1
        B.kx[i] = gx
        B.kz[i] = gz
        B.ky[i] = 0
        if (inPool(gx, gz, lvl)) B.pool[i] = 1
      }
    }
    // lily pads lie flat on the water: they block reflections and cast none
    for (const [x, z] of PADS) {
      if (!inPool(x, z, lvl)) continue
      const [sx, sy] = project(x, 0, z)
      for (let k = -2; k <= 2; k++) this.put(B, sx + k, sy, k === 2 ? C.frogD : C.pad, x, z, 0.2, sy, z - 0.3, true)
      this.put(B, sx - 1, sy - 1, C.pad, x, z, 0.3, sy, z - 0.3, true)
      this.put(B, sx, sy - 1, C.pad, x, z, 0.3, sy, z - 0.3, true)
    }
    // everything that stands up, back to front
    const statics: { z: number; draw: () => void }[] = [
      ...TREES.map((t) => ({ z: t.z, draw: () => this.drawTree(B, t) })),
      ...PROPS.huts.map((h) => ({ z: h.z, draw: () => this.drawHut(B, h) })),
      ...PROPS.graves.map((g, i) => ({ z: g.z, draw: () => this.drawGrave(B, g, i) })),
      { z: PROPS.lantern.z, draw: () => this.drawLanternPost(B, PROPS.lantern) },
      { z: PROPS.trigon.z, draw: () => this.drawTrigon(B, PROPS.trigon) },
      { z: PROPS.sword.z, draw: () => this.drawSword(B, PROPS.sword) },
      { z: PROPS.pack.z, draw: () => this.drawPack(B, PROPS.pack) },
    ]
    for (const s of statics.sort((a, b) => a.z - b.z)) s.draw()
    for (const [x, z] of HEARTH) {
      const [sx, sy] = project(x, 0, z)
      for (let k = -1; k <= 1; k++) this.put(B, sx + k, sy, C.stoneD, x, z, 0.5, sy, z)
      this.put(B, sx - 1, sy - 1, C.stoneHi, x, z, 1.5, sy, z)
      this.put(B, sx, sy - 1, C.stone, x, z, 1.5, sy, z)
    }
    for (const t of TUFTS) {
      if (inPool(t.x, t.z, lvl * 1.2)) continue
      const [sx, sy] = project(t.x, 0, t.z)
      for (let k = 0; k < t.n; k++) {
        const hgt = 1 + (((t.s * 7 + k) % 3) | 0)
        for (let j = 0; j < hgt; j++) this.put(B, sx + k * 2 - t.n, sy - j, C.tuft, t.x, t.z, j, sy, t.z)
      }
      if (t.flower) this.put(B, sx, sy - 3, C.flower, t.x, t.z, 3, sy, t.z)
    }
    for (const rd of REEDS) {
      if (inPool(rd.x, rd.z, lvl * 0.98)) continue
      const [sx, sy] = project(rd.x, 0, rd.z)
      for (let j = 0; j < rd.h; j++) this.put(B, sx, sy - j, j === rd.h - 1 ? C.reedHi : C.reed, rd.x, rd.z, j, sy, rd.z)
      if (rd.s < 0.4) {
        this.put(B, sx + 1, sy - rd.h + 1, C.cattail, rd.x, rd.z, rd.h, sy, rd.z)
        this.put(B, sx + 1, sy - rd.h + 2, C.cattail, rd.x, rd.z, rd.h, sy, rd.z)
      }
    }
  }

  // ---------------------------------------------------------------- dynamic layer

  /** Iron brazier on three splayed legs; returns the screen point the flame sits on. */
  private drawBrazier(B: Buf): [number, number] {
    const [fsx, fsy] = project(0, 0, 0)
    for (let r = 0; r < 8; r++) {
      const o = Math.floor((7 - r) / 3)
      this.put(B, fsx - 5 - o, fsy - r, r < 1 ? C.ironD : C.iron, -3, 0, r, fsy, 0)
      this.put(B, fsx + 5 + o, fsy - r, C.ironD, 3, 0, r, fsy, 0)
      this.put(B, fsx, fsy - r + 1, C.ironD, 0, 0, r, fsy, -0.05)
    }
    this.put(B, fsx - 8, fsy, C.ironD, -4, 0, 0, fsy, 0)
    this.put(B, fsx + 8, fsy, C.ironD, 4, 0, 0, fsy, 0)
    const rows = [
      [4, 8],
      [6, 9],
      [7, 10],
      [8, 11],
      [8, 12],
      [9, 13],
    ] // [half width, height]: rounded belly up to a wide rim, with a band of rivets
    for (const [hw, r] of rows) {
      for (let k = -hw; k <= hw; k++) {
        let c = k > hw - 3 ? C.ironD : C.iron
        if (k < -hw + 2) c = C.ironHi
        if (r === 13) c = k < 0 ? C.ironRim : C.ironHi
        if (r === 11 && k % 3 === 0 && Math.abs(k) < hw) c = C.ironRim
        this.put(B, fsx + k, fsy - r, c, k * 0.5, 0, r, fsy, 0.1)
      }
    }
    return [fsx, fsy - 13]
  }

  private drawWoodpile(B: Buf, n: number) {
    const p = PROPS.woodpile
    const [bx, by] = project(p.x, 0, p.z)
    const slots = [
      [-4, 0],
      [0, 0],
      [4, 0],
      [-2, 2],
      [2, 2],
      [0, 4],
      [-6, 0],
      [6, 0],
      [4, 2],
    ]
    for (let i = 0; i < n; i++) {
      const [ox, oy] = slots[i]
      for (let row = 0; row < 2; row++) {
        for (let k = -2; k <= 1; k++) this.put(B, bx + ox + k, by - oy - row, C.log, p.x, p.z, oy + row, by, p.z)
        this.put(B, bx + ox + 2, by - oy - row, C.logEnd, p.x, p.z, oy + row, by, p.z + 0.01)
      }
    }
  }

  private drawStick(B: Buf, wx: number, wz: number, lift: number) {
    const [bx, by] = project(wx, 0, wz)
    for (let k = -2; k <= 2; k++) this.put(B, bx + k, by - lift, k === 2 ? C.stickD : C.stick, wx, wz, lift, by, wz + 0.6)
    this.put(B, bx + 1, by - lift - 1, C.stick, wx, wz, lift + 1, by, wz + 0.6)
  }

  private drawDynamic(w: World) {
    const t = w.t
    const B = this.fb
    copyBuf(B, this.st)
    for (const k in this.fx) this.fx[k as keyof typeof this.fx].fill(0)
    this.hits = []

    // ---- objects first (they fill the depth buffer that emissives test against)
    const [fireX, fireY] = this.drawBrazier(B)
    const [, groundY] = project(0, 0, 0)
    this.drawWoodpile(B, w.pile)
    const nodding = w.knight.fsm.state === 'nodding' && w.knight.headDown
    this.sprite(B, nodding ? KNIGHT_NOD : KNIGHT, w.knight.x, w.knight.z, KNIGHT_PAL, false, {
      hover: ['the last knight', w.knight.fsm.state === 'nodding' ? 'nodding off' : 'resting, as always'],
    })
    for (const s of w.sticks) this.drawStick(B, s.x, s.z, 0)
    PROPS.huts.forEach((hut, i) => this.drawHutDoor(B, hut, doorOpen(w, i)))
    for (const g of PROPS.graves) {
      const [gx, gy] = project(g.x + 3, 0, g.z + 1)
      this.put(B, gx, gy, C.candle, g.x + 3, g.z + 1, 1, gy, g.z + 2)
      this.put(B, gx, gy - 1, C.candle, g.x + 3, g.z + 1, 2, gy, g.z + 2)
    }

    // shroomfolk (asleep ones are inside their hut)
    const caps: { glow: [number, number][]; by: number; dep: number }[] = []
    for (const m of w.mush) {
      const st = m.fsm.state
      if (st === 'asleep') continue
      if (st === 'sprouting') {
        this.sprite(B, m.size < 0.5 ? MUSH.baby : MUSH.mid, m.x, m.z, MUSH_PAL, m.flip, { hover: ['a sprout', 'new since the rain'] })
        continue
      }
      const moving = WALKING.includes(st) && isMoving(m)
      const hop = isRaining(w) && moving && Math.sin(t * 12 + m.id * 10) > 0.6 ? 1 : 0
      const sp = this.sprite(B, MUSH.walk[moving ? ((t * 7) % 2) | 0 : 0], m.x, m.z, MUSH_PAL, m.flip, {
        glowChar: 'w',
        lift: hop,
        hover: ['shroomfolk', STATE_WORDS[st] ?? ''],
      })
      caps.push(sp)
      if (m.carrying) this.drawStick(B, m.x, m.z, sp.h + 1 + hop)
    }

    // deer
    const D = w.deer
    const ds = D.fsm.state
    const drows = ds === 'drink' ? DEER.drink : ds === 'graze' ? DEER.walk[0] : DEER.walk[((D.step * 5) % 2) | 0]
    const deerSub = ds === 'flee' ? 'startled' : ds === 'drink' ? 'drinking' : D.thirst > 1 ? 'thirsty' : 'grazing'
    this.sprite(B, drows, D.x, D.z, DEER_PAL, D.flip, { hover: ['a deer', deerSub] })

    // frog, mid-hop or sitting on its pad
    const F = w.frog
    const [ax, az] = PADS[F.from]
    const [bx2, bz2] = PADS[F.pad]
    const hopping = F.fsm.state === 'hop'
    const k = hopping ? F.progress : 1
    const frogX = ax + (bx2 - ax) * k
    const frogZ = az + (bz2 - az) * k
    const arc = hopping ? Math.round(Math.sin(k * Math.PI) * 4) : 0
    const frog = this.sprite(B, FROG[hopping ? 1 : 0], frogX, frogZ, FROG_PAL, bx2 < ax, { lift: arc + 1, dep: frogZ + 1, hover: ['the frog', 'unimpressed'] })

    // crow on the trigon stone (in flight it's drawn with the emissives, over the sky)
    const K = w.crow
    if (K.fsm.state === 'perch') {
      const [px, py] = perchPos()
      const lookLeft = t % 6 < 3
      CROW[0].forEach((row, r) =>
        [...row].forEach((ch, c) => {
          if (ch !== '.') this.put(B, px + (lookLeft ? 3 - c : c) - 2, py - 3 + r, C.crow, PROPS.trigon.x, PROPS.trigon.z, 40, py, PROPS.trigon.z + 1)
        }),
      )
      this.hit(px - 3, py - 4, px + 2, py, PROPS.trigon.z + 1, 'a crow', 'it watches the fire too')
    }

    // ---- emissives, depth-tested against everything above
    const R = lightRadius(w)
    const heat = w.brazier.heat
    for (const cap of caps) for (const [gx, gy] of cap.glow) this.putFx(gx, gy, GLOW.cap, 0.85, cap.by, cap.dep + 0.01)
    if (F.croak > 0) this.putFx(frog.bx + 1, frog.by - 1, GLOW.croak, 0.8, undefined, frog.dep + 0.01)
    if (K.fsm.state === 'flying' || K.fsm.state === 'returning') {
      CROW[1 + (((t * 8) % 2) | 0)].forEach((row, r) =>
        [...row].forEach((ch, c) => {
          if (ch !== '.') this.putFx(K.x + c - 2, K.y + r - 1, C.crow, 1)
        }),
      )
      this.hit(K.x - 3, K.y - 2, K.x + 2, K.y + 2, 100, 'a crow', 'off somewhere drier')
    }
    PROPS.huts.forEach((hut, i) => {
      const [hx, hy] = project(hut.x, 0, hut.z)
      const asleep = hutOccupancy(w, i)
      const open = doorOpen(w, i)
      if (asleep || open)
        for (const [dk, dr] of DOOR_PX) this.putFx(hx + dk, hy - dr, GLOW.inside, asleep ? 0.45 : 0.25, undefined, hut.z + HUT_PX.inside + 0.1)
      if (asleep) for (const [dk, dr] of WINDOW_PX) this.putFx(hx + dk, hy - dr, GLOW.window, 0.95, undefined, hut.z + 0.05)
      const sub = asleep ? `${asleep} asleep inside` : open ? 'someone is stepping through the door' : 'empty for now'
      this.hit(hx - 16, hy - HUT_PX.capY - 8, hx + 16, hy + 1, hut.z, 'shroomfolk hollow', sub)
    })
    {
      const p = PROPS.lantern
      const [lx, ly] = project(p.x, 0, p.z)
      const fl = 0.75 + 0.25 * vnoise(t * 6, 7)
      GLOW.lantern.forEach((c, i) => this.putFx(lx + 5, ly - 16 - i, c, fl * (i === 2 ? 0.8 : 1), ly, p.z + 0.05))
      this.hit(lx - 6, ly - 22, lx + 7, ly + 1, p.z, 'the road out', 'someone keeps the lantern lit')
    }
    {
      const p = PROPS.trigon
      const [bx, by, sc] = project(p.x, 0, p.z)
      const hgt = Math.round(40 * sc)
      const wid = Math.round(7 * sc)
      if (w.rune > 0.02) {
        const hy = by - Math.round(hgt * 0.6)
        for (const [dx, dy] of trigonPx) this.putFx(bx + dx, hy + dy, GLOW.rune, w.rune * (0.7 + 0.3 * Math.sin(t * 2)), undefined, p.z + 0.2)
      }
      this.hit(bx - wid, by - hgt, bx + wid, by + 1, p.z, 'the trigon stone', w.rune > 0.1 ? 'it hums in the rain' : 'cold and quiet')
    }
    {
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const g of PROPS.graves) {
        const [gx, gy] = project(g.x + 3, 0, g.z + 1)
        this.putFx(gx, gy - 2, GLOW.candle, 0.7 + 0.3 * vnoise(t * 7 + g.x, 2), gy, g.z + 2.05)
        const [bx, by] = project(g.x, 0, g.z)
        x0 = Math.min(x0, bx - 4)
        x1 = Math.max(x1, gx + 1)
        y0 = Math.min(y0, by - 17)
        y1 = Math.max(y1, by + 2)
      }
      this.hit(x0, y0, x1, y1, PROPS.graves[0].z, 'three who went on', 'someone still leaves candles')
    }
    for (const s of SHROOMS) {
      const [sx, sy] = project(s.x, 0, s.z)
      const a = 0.55 + 0.35 * Math.sin(t * 0.8 + s.ph)
      this.putFx(sx, sy, GLOW.shroom, a, sy, s.z + 0.05)
      this.putFx(sx + 1, sy - 1, GLOW.shroomD, a * 0.7, sy, s.z + 0.05)
    }
    for (const e of EYES) {
      const d = Math.hypot(e.x, e.z)
      if (d < R * 1.05) continue // they keep to the dark
      const [sx, sy] = project(e.x, e.y, e.z)
      if ((t * 0.7 + e.ph) % 4 >= 0.12) {
        const a = 0.8 * clamp((d - R * 1.05) / 15)
        this.putFx(sx, sy, GLOW.eye, a, undefined, e.z)
        this.putFx(sx + 2, sy, GLOW.eye, a, undefined, e.z)
      }
      this.hit(sx - 3, sy - 3, sx + 5, sy + 3, e.z, 'something in the trees', 'watching the fire')
    }

    // the flame: its size follows the fire's heat, so a fresh log swells it gradually
    const coals = Math.round(4 + 3 * Math.min(1, heat))
    for (let kk = -coals; kk <= coals; kk++) this.putFx(fireX + kk, fireY, FLAME[hash(kk, (t * 8) | 0) < 0.5 ? 1 : 2], 1, groundY, 0.2)
    const fh = 5 + 24 * heat
    const half0 = 2.5 + 5 * heat
    for (let y = Math.floor(fireY - fh - 2); y < fireY; y++) {
      const dy = (fireY - y) / fh
      if (dy > 1 || dy < 0) continue
      const sway = Math.sin(t * 3 + dy * 4) * dy * 2.5
      const half = half0 * Math.pow(1 - dy, 0.7) + 0.5
      for (let x = fireX - 10; x <= fireX + 10; x++) {
        const n = vnoise(x * 0.42, y * 0.38 + t * 7)
        const v = (1 - Math.abs(x - fireX - sway) / half) * (1 - dy * 0.6) + (n - 0.5) * 0.9 - dy * 0.35
        if (v < 0.12) continue
        this.putFx(x, y, FLAME[v > 0.8 ? 3 : v > 0.52 ? 2 : v > 0.3 ? 1 : 0], 1, groundY, 0.2)
      }
    }
    for (const e of w.embers) {
      const life = 1 - e.age / e.life
      this.putFx(fireX + e.ox, groundY - e.oy, [1, (120 + life * 100) / 255, 60 / 255], life, groundY, 0.2)
    }
    this.hit(
      fireX - 9,
      fireY - fh,
      fireX + 9,
      groundY + 1,
      0.1,
      'the brazier',
      w.brazier.fsm.state === 'roaring' ? 'roaring' : w.brazier.fsm.state === 'steady' ? 'burning steady' : 'burning low',
    )

    for (const z of w.zs) {
      const hut = PROPS.huts[z.hut]
      const [hx, hy] = project(hut.x, 0, hut.z)
      const [cx, cy] = HUT_PX.chimney
      this.putFx(hx + cx + z.age * 3, hy - cy - z.age * 6, GLOW.zzz, 0.7 * (1 - z.age / 1.8), undefined, hut.z + 0.05)
    }
    for (const f of w.flies) {
      if (f.a <= 0.02) continue
      const [px, py] = project(f.x, f.y, f.z)
      this.putFx(px, py, GLOW.firefly, f.a, project(f.x, 0, f.z)[1], f.z)
    }
    if (w.shooting) {
      const s = w.shooting
      for (let i = 0; i < 8; i++) {
        const x = s.x + s.age * 120 - i * 2
        const y = s.y + s.age * 40 - i * 0.66
        if (x > 0 && x < W && y > 0 && y < HORIZON && !B.a[(y | 0) * W + (x | 0)]) this.putFx(x, y, GLOW.star, (1 - i / 8) * (1 - s.age / 0.9))
      }
    }
    for (const r of w.ripples) {
      const a = r.age / 0.7
      const hw = (1 + a * 4) | 0
      for (let dx = -hw; dx <= hw; dx++) this.putFx(r.x + dx, r.y, GLOW.ripple, 0.55 * (1 - a))
    }

    // ---- hover boxes for the remaining static props
    {
      const p = PROPS.sword
      const [bx, by] = project(p.x, 0, p.z)
      this.hit(bx - 2, by - 18, bx + 5, by + 1, p.z, 'his sword', 'he has not drawn it in a long time')
    }
    {
      const p = PROPS.pack
      const [bx, by] = project(p.x, 0, p.z)
      this.hit(bx - 4, by - 5, bx + 4, by + 1, p.z, 'his pack', 'everything he still owns')
    }
    {
      const p = PROPS.woodpile
      const [bx, by] = project(p.x, 0, p.z)
      this.hit(bx - 9, by - 7, bx + 9, by + 1, p.z, 'woodpile', `${w.pile} log${w.pile === 1 ? '' : 's'}, stacked by small hands`)
    }
    {
      const lvl = w.poolLevel
      const [x0, y0] = project(POOL.x - POOL.rx * lvl, 0, POOL.z - POOL.rz * lvl)
      const [x1, y1] = project(POOL.x + POOL.rx * lvl, 0, POOL.z + POOL.rz * lvl)
      this.hit(x0, y0, x1, y1, -1000, 'rain pool', lvl > 1.08 ? 'swollen with rain' : 'still and dark')
    }
  }

  /** Closed: planks over the doorway. Open: nothing, so the dark interior (and anyone passing through) shows. */
  private drawHutDoor(B: Buf, hut: Point, open: boolean) {
    if (open) return
    const [bx, by] = project(hut.x, 0, hut.z)
    for (const [k, r] of DOOR_PX) {
      const c = k === -3 && r === 4 ? C.pommel : k === -3 || r === 8 ? C.hutDoorD : C.hutDoor
      this.put(B, bx + k, by - r, c, hut.x, hut.z, r, by, hut.z + 0.005)
    }
  }

  /** Register a hover box (screen space, base pixels). The nearest box under the pointer wins. */
  private hit(x0: number, y0: number, x1: number, y1: number, depth: number, name: string, sub: string) {
    this.hits.push({ x0, y0, x1, y1, depth, name, sub })
  }

  // ---------------------------------------------------------------- lighting

  private compose(w: World) {
    const t = w.t
    const B = this.fb
    const fx = this.fx
    const out = this.out
    const flick = 0.84 + 0.16 * vnoise(t * 9, 3.3)
    const FI = (0.3 + 0.7 * w.brazier.heat) * flick // brightness follows heat, like the radius does
    const FR = lightRadius(w)
    const amb = isRaining(w) ? 0.8 : 1
    // small point lights: [x, z, y, radius, r, g, b]
    const lamps: number[][] = []
    for (const m of w.mush) if (m.size >= 0.5 && m.fsm.state !== 'asleep') lamps.push([m.x, m.z, 6, 7, 0.08, 0.3, 0.28])
    for (const s of SHROOMS) lamps.push([s.x, s.z, 1, 7, 0.1, 0.45, 0.4])
    for (const f of w.flies) if (f.a > 0.05) lamps.push([f.x, f.z, f.y, 8, 0.5 * f.a, 0.6 * f.a, 0.2 * f.a])
    PROPS.huts.forEach((h, i) => hutOccupancy(w, i) && lamps.push([h.x + 3, h.z + 3, 10, 14, 0.9, 0.6, 0.25]))
    for (const g of PROPS.graves) lamps.push([g.x + 3, g.z + 1, 4, 16, 0.75, 0.52, 0.2])
    lamps.push([PROPS.lantern.x + 3, PROPS.lantern.z, 16, 22, 0.9, 0.6, 0.25])
    if (w.rune > 0.02) lamps.push([PROPS.trigon.x, PROPS.trigon.z + 2, 20, 26, 0.15 * w.rune, 0.8 * w.rune, 0.75 * w.rune])

    const Lc = [0, 0, 0]
    // Bare ground gets banded light with ordered dithering between bands. Objects get smooth
    // light: bands across a sprite read as a checkerboard or split it in two.
    const light = (x: number, z: number, y: number, bx: number, by: number, ground: boolean) => {
      const dith = ground ? BAYER4[(by & 3) * 4 + (bx & 3)] : 0.5
      let f = 1 - Math.hypot(x, z) / FR
      f = f > 0 ? f * f * FI * Math.exp(-Math.max(0, y - 10) / 70) : 0
      if (ground) f = Math.floor(f * 5 + dith) / 5 // dithered bands on the ground; objects get smooth light (bands split them in two)
      let lr = 0.15 * amb + f * 1.7
      let lg = 0.18 * amb + f * 0.95
      let lb = 0.27 * amb + f * 0.42
      for (const L of lamps) {
        const ex = x - L[0]
        const ez = z - L[1]
        const ey = y - L[2]
        const dd = ex * ex + ez * ez + ey * ey * 0.5
        if (dd >= L[3] * L[3]) continue
        let k = 1 - Math.sqrt(dd) / L[3]
        k = ground ? Math.floor(k * k * 4 + dith) / 4 : k * k
        lr += k * L[4]
        lg += k * L[5]
        lb += k * L[6]
      }
      Lc[0] = lr
      Lc[1] = lg
      Lc[2] = lb
    }

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        let r: number, g: number, b: number
        if (B.a[i]) {
          light(B.kx[i], B.kz[i], B.ky[i], x, y, B.obj[i] === 0)
          r = B.r[i] * Lc[0]
          g = B.g[i] * Lc[1]
          b = B.b[i] * Lc[2]
          if (B.pool[i] && !B.obj[i]) {
            // open water: dark surface + the mirrored world + mirrored emissives, gently rippled
            const ox = Math.round(Math.sin(y * 1.7 + t * 2.4) * 0.7)
            const j = y * W + Math.max(0, Math.min(W - 1, x + ox))
            if (B.ra[j]) {
              light(B.rkx[j], B.rkz[j], B.rky[j], x, y, false)
              r += B.rr[j] * Lc[0] * 0.55
              g += B.rg[j] * Lc[1] * 0.55
              b += B.rb[j] * Lc[2] * 0.55
            } else {
              r += 0.03 * amb
              g += 0.045 * amb
              b += 0.075 * amb
            }
            const fa = fx.ra[j] * 0.75
            if (fa > 0) {
              r = r * (1 - fa) + fx.rr[j] * fa
              g = g * (1 - fa) + fx.rg[j] * fa
              b = b * (1 - fa) + fx.rb[j] * fa
            }
          }
          let m = mistAt(B.kz[i])
          if (m > 0) {
            m = Math.min(0.95, m * (0.75 + 0.35 * vnoise(x * 0.025 + t * 0.06, y * 0.06)))
            r = r * (1 - m) + C.mist[0] * m
            g = g * (1 - m) + C.mist[1] * m
            b = b * (1 - m) + C.mist[2] * m
          }
        } else {
          r = B.bgr[i] * amb
          g = B.bgg[i] * amb
          b = B.bgb[i] * amb
        }
        const fa = fx.a[i]
        if (fa > 0) {
          r = r * (1 - fa) + fx.r[i] * fa
          g = g * (1 - fa) + fx.g[i] * fa
          b = b * (1 - fa) + fx.b[i] * fa
        }
        out.r[i] = r
        out.g[i] = g
        out.b[i] = b
      }
    }
    for (const s of STARS) {
      const i = s.y * W + s.x
      if (B.a[i]) continue
      const a = s.b * (0.55 + 0.45 * Math.sin(t * 1.3 + s.ph)) * (isRaining(w) ? 0.2 : 1)
      out.r[i] += 0.86 * a
      out.g[i] += 0.88 * a
      out.b[i] += 0.94 * a
    }
  }

  // ---------------------------------------------------------------- output

  private present(w: World, opts: RenderOptions) {
    const { ctx, scale: S, fx, out } = this
    const DW = W * S
    const DH = H * S
    const d = this.outImg.data
    const e = this.fxImg.data
    for (let i = 0; i < N; i++) {
      const o = i * 4
      d[o] = clamp(out.r[i]) * 255
      d[o + 1] = clamp(out.g[i]) * 255
      d[o + 2] = clamp(out.b[i]) * 255
      d[o + 3] = 255
      const ra = fx.ra[i] * 0.6
      const useR = ra > fx.a[i]
      e[o] = (useR ? fx.rr[i] : fx.r[i]) * 255
      e[o + 1] = (useR ? fx.rg[i] : fx.g[i]) * 255
      e[o + 2] = (useR ? fx.rb[i] : fx.b[i]) * 255
      e[o + 3] = Math.max(fx.a[i], ra) * 255
    }
    this.outX.putImageData(this.outImg, 0, 0)
    this.fxX.putImageData(this.fxImg, 0, 0)

    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(this.outC, 0, 0, DW, DH)
    if (opts.glow) {
      // soft bloom from the emissive layer, plus a warm wash around the brazier
      ctx.globalCompositeOperation = 'lighter'
      ctx.imageSmoothingEnabled = true
      ctx.filter = `blur(${3 * S}px)`
      const heat = Math.min(1.2, w.brazier.heat)
      ctx.globalAlpha = 0.85 * (0.45 + 0.55 * heat)
      ctx.drawImage(this.fxC, 0, 0, DW, DH)
      ctx.filter = `blur(${9 * S}px)`
      ctx.globalAlpha = 0.55 * (0.3 + 0.7 * heat)
      ctx.drawImage(this.fxC, 0, 0, DW, DH)
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      const [fsx, fsy] = project(0, 12, 0)
      const fl = heat * (0.85 + 0.15 * vnoise(w.t * 9, 1))
      ctx.translate(fsx * S, fsy * S)
      ctx.scale(1, 0.6)
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, lightRadius(w) * 1.35 * S * 1.05)
      gr.addColorStop(0, `rgba(255,140,60,${0.22 * fl})`)
      gr.addColorStop(0.5, `rgba(255,110,40,${0.07 * fl})`)
      gr.addColorStop(1, 'rgba(255,100,30,0)')
      ctx.fillStyle = gr
      ctx.fillRect(-DW, -DH * 2, DW * 2, DH * 4)
    }
    ctx.restore()
    if (isRaining(w)) this.drawRain(w)
    this.drawHover()
    if (opts.debug) this.drawDebug(w)
  }

  // ---------------------------------------------------------------- names on hover (the lore lives here)

  /** Rain as straight, thin streaks at full output resolution, over the pixel art. */
  private drawRain(w: World) {
    const { ctx, scale: S } = this
    const thin = Math.max(1, Math.round(S / 4))
    ctx.save()
    ctx.fillStyle = 'rgba(165,185,215,0.3)'
    for (const r of w.drops) {
      const len = (r.v / 240) * 7 * S // faster drops streak longer
      ctx.fillRect(Math.round(r.x * S), Math.round(r.y * S - len), thin, len)
    }
    ctx.restore()
  }

  /** Name whatever is under the pointer: the nearest hover box that contains it. */
  private drawHover() {
    const p = this.pointer
    if (!p) return
    let best: (typeof this.hits)[number] | null = null
    for (const h of this.hits) {
      if (p.x < h.x0 - 1 || p.x > h.x1 + 1 || p.y < h.y0 - 1 || p.y > h.y1 + 1) continue
      const area = (h.x1 - h.x0) * (h.y1 - h.y0)
      if (!best || h.depth > best.depth || (h.depth === best.depth && area < (best.x1 - best.x0) * (best.y1 - best.y0))) best = h
    }
    if (!best) return
    const { ctx, scale: S } = this
    const x = Math.max(24, Math.min(W - 24, (best.x0 + best.x1) / 2)) * S
    const below = best.y1 + 6.5 < H - 6
    const y = (below ? best.y1 + 6.5 : best.y0 - 7) * S
    ctx.save()
    ctx.textAlign = 'center'
    ctx.font = `${3.25 * S}px ${FONT}`
    ctx.fillStyle = 'rgba(233,227,212,0.95)'
    ctx.fillText(best.name, x, y)
    ctx.font = `${2.75 * S}px ${FONT}`
    ctx.fillStyle = 'rgba(154,151,140,0.95)'
    ctx.fillText(best.sub, x, y + 4 * S)
    ctx.restore()
  }

  private drawDebug(w: World) {
    const { ctx, scale: S } = this
    ctx.save()
    ctx.font = `${3 * S}px ${FONT}`
    ctx.textAlign = 'center'
    const tag = (txt: string, x: number, y: number, col: string) => {
      const m = ctx.measureText(txt).width
      const left = ctx.textAlign === 'left' ? x : x - m / 2
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(left - S, y - 2.75 * S, m + 2 * S, 3.75 * S)
      ctx.fillStyle = col
      ctx.fillText(txt, x, y)
    }
    for (const m of w.mush) {
      if (m.fsm.state === 'asleep') continue
      const [sx, sy] = project(m.x, 0, m.z)
      tag(`${m.fsm.state} · warm ${m.warmth.toFixed(2)} · energy ${m.energy.toFixed(2)}`, sx * S, (sy - 11) * S, '#9ff5e4')
    }
    const D = w.deer
    const [dx, dy] = project(D.x, 0, D.z)
    tag(`${D.fsm.state} · thirst ${D.thirst.toFixed(2)}`, dx * S, (dy - 14) * S, '#e8c29a')
    ctx.textAlign = 'left'
    const wx = w.weather
    const asleep = PROPS.huts.map((_, i) => hutOccupancy(w, i)).reduce((a, b) => a + b, 0)
    const lines = [
      `weather ${wx.fsm.state} ${wx.manual ? '(manual)' : Math.ceil(wx.timer) + 's'}   pool ${w.poolLevel.toFixed(2)}`,
      `brazier ${w.brazier.fsm.state} · fuel ${w.brazier.fuel.toFixed(2)} · heat ${w.brazier.heat.toFixed(2)}   pile ${w.pile}   sticks ${w.sticks.length}`,
      `knight ${w.knight.fsm.state}   frog ${w.frog.fsm.state}   crow ${w.crow.fsm.state}   asleep ${asleep}`,
    ]
    lines.forEach((l, i) => tag(l, 4 * S, (6 + i * 4.5) * S, '#f08a3c'))
    ctx.restore()
  }
}
