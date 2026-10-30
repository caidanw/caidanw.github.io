/**
 * Software renderer. The scene is drawn into a 320x180 framebuffer that keeps,
 * per pixel: albedo, the world position it came from (so firelight falls on
 * the ground plane as a real circle), a depth for sorting, a normal (from the
 * sprite-normals port in normals.ts) and a planar reflection layer for the
 * pool. Emissives (fire, embers, glows) are depth-tested into a separate layer
 * that is composited on top and blurred into a soft bloom.
 *
 * Output is nearest-neighbour upscaled ("Sworcery" pixels). The ground gets
 * banded, noise-dithered firelight with shadows cast away from the fire;
 * objects get smooth light shaped by their normals.
 */
import { clamp, hash, hex, mix, rngFrom, vnoise, type Color } from './util'
import {
  C,
  EYES,
  H,
  HEARTHSTONES,
  HORIZON,
  KNIGHT_GRAVE,
  N,
  PADS,
  PROPS,
  REEDS,
  SHROOMS,
  STONE_RING,
  TREES,
  TUFTS,
  W,
  inPool,
  mistAt,
  project,
  unproject,
  type Point,
  type Relic,
  type Tree,
} from './world'
import {
  CROW,
  DEER,
  DEER_PAL,
  DEER_PARTS,
  FROG,
  FROG_PAL,
  FROG_PARTS,
  GLOWCAP,
  GLOWCAP_PAL,
  GLOWCAP_PARTS,
  KEEPER_TRIM,
  KNIGHT,
  KNIGHT_KNEEL,
  KNIGHT_NOD,
  KNIGHT_PAL,
  KNIGHT_PARTS,
  KNIGHT_SHINE,
  KNIGHT_STAND,
  MUSH,
  MUSH_KEEPER,
  MUSH_PAL,
  MUSH_PAL_ELDER,
  MUSH_PARTS,
  type Palette,
  type Rows,
} from './sprites'
import { lightness, partNormals, reliefNormals, spriteNormals, type Part } from './normals'
import { WEIGHT, micro, shape, type Normal } from './materials'
import { gatherLight, groundGrain, prepareLights, type Caster, type Light } from './lights'
import { WALKING, doorOpen, hutOccupancy, isElder, isMoving, isRaining, lightRadius, perchPos, type Mush, type World } from './sim'

const FONT = "ServerMono, 'Server Mono', ui-monospace, monospace"
const FLAME = ['#a3311b', '#e0612a', '#ffb347', '#fff1c1'].map(hex)
const GLOW = {
  cap: hex('#9ff5e4'),
  window: hex('#ffcf7a'),
  inside: hex('#b8743a'),
  lantern: [hex('#ffd27a'), hex('#ffb347'), hex('#ff9a3c')],
  rune: hex('#8ff0e0'),
  foxfire: hex('#b9a2f5'),
  foxfireD: hex('#8a70d8'),
  memorial: hex('#b8fff0'),
  candle: hex('#ffd27a'),
  eye: hex('#e8d78a'),
  firefly: hex('#d8f27a'),
  zzz: hex('#c9d6e8'),
  croak: hex('#e8e0b8'),
  star: hex('#e9e3d4'),
  ripple: hex('#aabed8'),
  ember: hex('#ff8a3a'),
  smoke: hex('#8a8a92'),
  dust: hex('#9c8a6a'),
  glint: hex('#e8c89a'),
  carving: hex('#ff9a4a'),
}

/** Fire light comes from a little above the logs. */
const FIRE_Y = 6
/** Toward the viewer: the camera sits low, looking a little down into the clearing. */
const VIEW = [0, 0.3, 0.95]
/** Moonlight direction (toward the moon: up, and behind the clearing). Gives rims in the dark. */
const MOON = (() => {
  const v = [0.15, 0.75, -0.65]
  const l = Math.hypot(...v)
  return v.map((c) => c / l)
})()
/** Half-vector between the moon and the viewer, for metal's cool highlight. */
const MOON_H = (() => {
  const v = [MOON[0] + VIEW[0], MOON[1] + VIEW[1], MOON[2] + VIEW[2]]
  const l = Math.hypot(...v)
  return v.map((c) => c / l)
})()

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
    // surface normal, screen space (x right, y up, z toward viewer); nz = 0 means none
    nx: f(),
    ny: f(),
    nz: f(),
    // static object region (for normal generation), material micro height and its weight
    id: new Int32Array(N),
    mh: f(),
    mw: f(),
    // specular strength (metal gleams)
    sp: f(),
    // which hoverable thing this pixel belongs to (0 = nothing)
    hv: new Int32Array(N),
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

/** The face inside the carved triangle (for a slight recess and an inner glow). */
const TRIGON_INSIDE = (() => {
  const out: [number, number][] = []
  for (let r = 1; r < 4; r++) for (let k = -r + 1; k <= r - 1; k++) out.push([k, r - 2])
  return out
})()

/** Pixels just outside the cut (its lip), for a faint halo. */
const TRIGON_LIP = (() => {
  const taken = new Set([...trigonPx, ...TRIGON_INSIDE].map(([x, y]) => `${x},${y}`))
  const out: [number, number][] = []
  for (const [x, y] of trigonPx) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const key = `${x + dx},${y + dy}`
      if (taken.has(key)) continue
      taken.add(key)
      out.push([x + dx, y + dy])
    }
  }
  return out
})()

/**
 * Bake material micro height into the normals: Sobel slopes of the micro height (plus a
 * little painted lightness), within each object region, tilt its shape normal.
 */
function bakeMicroDetail(B: Buf) {
  const STRENGTH = 1.6
  const h = new Float32Array(N)
  for (let i = 0; i < N; i++) if (B.id[i]) h[i] = B.mh[i] + 0.6 * (lightness(B.r[i], B.g[i], B.b[i]) - 0.35)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      const wgt = B.mw[i]
      if (!B.id[i] || wgt <= 0 || B.nz[i] <= 0) continue
      const at = (dx: number, dy: number) => {
        const j = (y + dy) * W + x + dx
        return B.id[j] === B.id[i] ? h[j] : h[i]
      }
      const sx = (at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1)) * 0.125
      const sy = (at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1)) * 0.125
      const nx = B.nx[i] - sx * STRENGTH * wgt
      const ny = B.ny[i] + sy * STRENGTH * wgt
      const nz = B.nz[i]
      const l = Math.hypot(nx, ny, nz) || 1
      B.nx[i] = nx / l
      B.ny[i] = ny / l
      B.nz[i] = nz / l
    }
  }
}

/** A stick in four poses as it tumbles: flat, rising, upright, falling. The second pixel is the cut end. */
const STICK_POSES: [number, number][][] = [
  [
    [-3, 0],
    [-2, 0],
    [-1, 0],
    [0, 0],
    [1, 0],
    [2, -1],
    [3, -1],
  ],
  [
    [-2, 1],
    [-1, 0],
    [0, -1],
    [1, -2],
    [2, -3],
  ],
  [
    [0, 1],
    [0, 0],
    [0, -1],
    [0, -2],
    [0, -3],
  ],
  [
    [-2, -3],
    [-1, -2],
    [0, -1],
    [1, 0],
    [2, 1],
  ],
]

/** States in which shroomfolk sit down once they've arrived. */
const SITTING: string[] = ['visit', 'keep', 'farewell', 'tend']

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

/** A small carved spiral on the middle hearthstone (relative to its centre). */
const SPIRAL_PX: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [2, -1],
]

/**
 * The relic planted in the ashes, the bonfire's coiled sword reimagined.
 * 'g' pixels are metal that warms with the fire and glows.
 */
const RELICS: Record<Relic, { rows: Rows; pal: Palette; name: string; sub: string }> = {
  // a staff whose head curls into a spiral, bound with iron; the heart of the coil glows
  crook: {
    rows: [
      '..wwww..',
      '.w....w.',
      'w..ww..w',
      'w.g..w.w',
      'w.g.gw.w',
      'w..g...w',
      '.w.....w',
      '..ww..ww',
      '......ww',
      '......ii',
      '......ww',
      '......ww',
      '.....ww.',
      '.....ww.',
      '.....ii.',
      '.....ww.',
      '.....ww.',
      '......ww',
      '......ww',
      '......ww',
    ],
    pal: { w: C.relicWood, i: C.relicIronHi, g: C.relicIron },
    name: 'the kindling crook',
    sub: 'its coil is warm to the touch',
  },
  // a great key planted bit-down; the ring of its bow glows like forge iron
  key: {
    rows: [
      '..ggg..',
      '.g...g.',
      'g.....g',
      'g.....g',
      'g.....g',
      '.g...g.',
      '..ggg..',
      '...kk..',
      '...kk..',
      '...kk..',
      '...kk..',
      '...kk..',
      '...kkkk',
      '...kk.k',
      '...kkkk',
      '...kk..',
      '...kk..',
    ],
    pal: { g: C.relicIron, k: C.relicIronHi },
    name: 'the ember key',
    sub: 'nobody remembers the door',
  },
  // a shed antler crown, its tips glowing like coals
  antler: {
    rows: [
      'g...g...g',
      'b..b.b..b',
      '.b.b..b.b',
      '.b.b..bb.',
      '..bb..b..',
      'g..b.b...',
      '.b.bb....',
      '..bb.....',
      '...bb....',
      '...bb....',
      '...bb....',
      '...bb....',
      '...bb....',
    ],
    pal: { b: C.bone, g: C.bone },
    name: 'the old crown',
    sub: "the forest's gift to the first fire",
  },
}

/** Break text into lines no wider than maxWidth (in the context's current font). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxWidth) {
      out.push(line)
      line = word
    } else line = next
  }
  if (line) out.push(line)
  return out
}

/** Stable ids for hover tags, by key ('knight', 'hut0', 'mush42'...). */
const TAGS = new Map<string, number>()
function tagId(key: string): number {
  let id = TAGS.get(key)
  if (!id) TAGS.set(key, (id = TAGS.size + 1))
  return id
}

const STARS = Array.from({ length: 120 }, (_, i) => {
  const r = rngFrom(i * 77 + 5)
  return { x: (r() * W) | 0, y: (r() * (HORIZON - 6)) | 0, b: 0.3 + r() * 0.7, ph: r() * 6 }
})

const STATE_WORDS: Record<string, string> = {
  arriving: 'new here, still finding their way',
  idle: 'pottering about',
  wander: 'pottering about',
  fetch: 'off to fetch a stick',
  haul: 'hauling a stick to the pile',
  feed: 'fetching a log for the fire',
  stoke: 'feeding the fire',
  toHut: 'heading home to rest',
  entering: 'going home to rest',
  exiting: 'up and about again',
  farewell: 'saying goodbye to the knight',
  departing: 'setting off down the road',
  wilting: 'going to rest in the quiet grove',
  tend: 'relighting the grove candles',
  visit: 'sitting with an old friend',
  keep: "keeping the fire, in the knight's place",
}

export interface RenderOptions {
  glow: boolean
  debug: boolean
  normals: boolean
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
    // how much each emissive pixel feeds the bloom (0 = none)
    bw: new Float32Array(N),
    rbw: new Float32Array(N),
  }
  private out = { r: new Float32Array(N), g: new Float32Array(N), b: new Float32Array(N) }
  private outC = document.createElement('canvas')
  private outX: CanvasRenderingContext2D
  private outImg: ImageData
  private fxC = document.createElement('canvas')
  private fxX: CanvasRenderingContext2D
  private fxImg: ImageData
  private bakedLevel = -1
  /** Region id stamped on static pixels while building (0 = none). */
  private region = 0
  /** Hover tag stamped on everything drawn while it's set (see tagged()). */
  private tag = 0
  /** What each hover tag is called this frame: [name, line of lore]. */
  private labels = new Map<number, [string, string, boolean]>()
  /** Pointer position in framebuffer pixels, or null when it's off the canvas. */
  pointer: { x: number; y: number } | null = null
  /** What the pointer is over, as of the last frame (for tests and debugging). */
  hovered: [string, string] | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    private relic: Relic = 'antler',
  ) {
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
    if (sx < 0 || sx >= W || sy < 0 || sy >= H) return false
    const i = sy * W + sx
    return this.fb.pool[i] === 1 && this.fb.obj[i] === 0
  }

  render(w: World, opts: RenderOptions) {
    if (Math.abs(w.poolLevel - this.bakedLevel) > 0.035) this.buildStatic(w.poolLevel)
    this.drawDynamic(w)
    this.compose(w, opts)
    this.present(w, opts)
  }

  // ---------------------------------------------------------------- drawing primitives

  /** Write an object pixel if it is nearer than what's there. Returns whether it won the depth test. */
  private put(
    B: Buf,
    px: number,
    py: number,
    c: Color,
    wx: number,
    wz: number,
    wy: number,
    baseY: number,
    depth: number,
    noRefl = false,
    nrm?: [number, number, number],
    mh = 0,
    mw = 0,
    spec = 0,
  ): boolean {
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
    B.id[i] = this.region
    B.nx[i] = nrm ? nrm[0] : 0
    B.ny[i] = nrm ? nrm[1] : 0
    B.nz[i] = nrm ? nrm[2] : 0
    B.mh[i] = mh
    B.mw[i] = mw
    B.sp[i] = spec
    B.hv[i] = this.tag
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
   * `baseY` is the screen line to mirror about for pool reflections. `bloom` is how much the
   * pixel feeds the glow: 1 for small lights, less for big bright areas, 0 for things that
   * merely sit in the emissive layer (smoke, silhouettes, rain ripples...).
   */
  private putFx(px: number, py: number, c: Color, a: number, baseY?: number, depth?: number, bloom = 1) {
    const fx = this.fx
    px = Math.round(px)
    py = Math.round(py)
    if (px < 0 || px >= W || py < 0 || py >= H) return
    const i = py * W + px
    if (depth !== undefined && depth < this.fb.dep[i]) return
    if (this.tag) this.fb.hv[i] = this.tag
    fx.r[i] = c[0]
    fx.g[i] = c[1]
    fx.b[i] = c[2]
    fx.a[i] = a
    fx.bw[i] = bloom
    if (baseY === undefined) return
    const ry = Math.round(2 * baseY - py)
    if (ry < 0 || ry >= H) return
    const j = ry * W + px
    if (this.fb.pool[j] && !this.fb.obj[j]) {
      fx.rr[j] = c[0]
      fx.rg[j] = c[1]
      fx.rb[j] = c[2]
      fx.ra[j] = a
      fx.rbw[j] = bloom
    }
  }

  /** Draw a char-grid sprite standing at world (wx, wz), with an automatic dark outline and generated normals. */
  private sprite(
    B: Buf,
    rows: Rows,
    wx: number,
    wz: number,
    pal: Palette,
    flip: boolean,
    opts: {
      lift?: number
      dep?: number
      glowChar?: string
      /** Hover key and label: these pixels name this thing. */
      hover?: { key: string; name: string; sub: string }
      sinkTo?: number
      shine?: Record<string, number>
      parts?: Part[]
    } = {},
  ) {
    const [bx, by] = project(wx, 0, wz)
    const dep = opts.dep ?? wz + 0.5
    const lift = opts.lift ?? 0
    const h = rows.length
    const w = rows[0].length
    const glow: [number, number][] = []
    const at = (r: number, c: number) => rows[r][flip ? w - 1 - c : c]
    const filled = (r: number, c: number) => r >= 0 && r < h && c >= 0 && c < w && at(r, c) !== '.'
    const clip = opts.sinkTo ?? Infinity // rows below this screen line are under the soil
    const nm = opts.parts ? partNormals(rows, opts.parts) : spriteNormals(rows, (ch) => pal[ch])
    const prevTag = this.tag
    if (opts.hover) {
      this.say(opts.hover.key, opts.hover.name, opts.hover.sub)
      this.tag = tagId(opts.hover.key)
    }
    for (let r = -1; r <= h; r++) {
      for (let c = -1; c <= w; c++) {
        if (filled(r, c) || (r === h && lift === 0)) continue
        if (filled(r - 1, c) || filled(r + 1, c) || filled(r, c - 1) || filled(r, c + 1)) {
          const py = by - h + r + 1 - lift
          if (py > clip) continue
          this.put(B, bx - (w >> 1) + c, py, C.outline, wx, wz, h - r + lift, by, dep - 0.01)
        }
      }
    }
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const ch = at(r, c)
        if (ch === '.') continue
        const px = bx - (w >> 1) + c
        const py = by - h + r + 1 - lift
        if (py > clip) continue
        const src = (r + 2) * nm.w + (flip ? w - 1 - c : c) + 2
        const nrm: [number, number, number] = [flip ? -nm.nx[src] : nm.nx[src], nm.ny[src], nm.nz[src]]
        if (this.put(B, px, py, pal[ch], wx, wz, h - r + lift, by, dep, false, nrm, 0, 0, opts.shine?.[ch] ?? 0) && ch === opts.glowChar) glow.push([px, py])
      }
    }
    this.tag = prevTag
    return { bx, by, h, glow, dep }
  }

  /** Name a hoverable thing for this frame. `above` puts the name over it (for things behind the fire). */
  private say(key: string, name: string, sub: string, above = false) {
    this.labels.set(tagId(key), [name, sub, above])
  }

  /** Draw with every pixel stamped as belonging to `key`, so hovering exactly those pixels names it. */
  private tagged<T>(key: string, fn: () => T): T {
    const prev = this.tag
    this.tag = tagId(key)
    const out = fn()
    this.tag = prev
    return out
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
    if (d < 24) c = mix(C.dirt, c, clamp((d - 13) / 11 + (n2 - 0.5) * 0.6))
    return c
  }

  private drawTree(B: Buf, t: Tree) {
    const [bx, by, s] = project(t.x, 0, t.z)
    const dep = t.z
    const ys = by - project(t.x, 1, t.z)[1]
    const h = 95 * t.h
    const tw = Math.max(1, Math.round(1.8 * t.w * s))
    const rng = rngFrom(t.seed)
    // the trunk is a cylinder with grooved bark
    this.region++
    for (let r = 0; r <= h * 1.25 * ys; r++) {
      for (let k = 0; k < tw; k++) {
        const u = tw > 1 ? ((k + 0.5) / tw) * 2 - 1 : 0
        const px = bx - (tw >> 1) + k
        const py = by - r
        this.put(
          B,
          px,
          py,
          k === 0 && tw > 1 ? C.trunkRim : C.trunk,
          t.x + u,
          t.z,
          r / ys,
          by,
          dep,
          false,
          shape.cylinder(u),
          micro.bark(px, py, t.seed),
          WEIGHT.bark,
        )
      }
    }
    if (tw >= 2) {
      this.put(B, bx - (tw >> 1) - 1, by, C.trunk, t.x, t.z, 0, by, dep, false, shape.cylinder(-0.9))
      this.put(B, bx + tw - (tw >> 1), by, C.trunk, t.x, t.z, 0, by, dep, false, shape.cylinder(0.9))
    }
    // a column of stacked leafy clumps, each its own dome, narrowing toward the top
    const n = 4 + ((rng() * 4) | 0)
    const y0 = h * (0.32 + rng() * 0.15)
    const y1 = h * 1.2
    for (let k = 0; k < n; k++) {
      const f = k / (n - 1)
      const wy = y0 + (y1 - y0) * f
      const rad = Math.max(2, Math.round((4 + rng() * 3.5) * t.w * s * (1 - 0.45 * f)))
      const cx = Math.round(bx + (rng() - 0.5) * rad * 0.9)
      const cy = Math.round(by - wy * ys)
      this.region++
      disc(
        (px, py, u, v) => {
          const tex = hash(px * 3 + t.seed, py * 7)
          let c = t.tone > 0.5 ? C.canopy : C.canopyD
          if (u > 0.45) c = C.canopyD
          if ((u < -0.55 && v < 0.3) || (v < -0.7 && u < 0.3)) c = tex < 0.7 ? C.canopyRim : C.canopyHi
          else if (tex < 0.07) c = C.canopyHi
          this.put(
            B,
            px,
            py,
            c,
            t.x + (px - bx) / s,
            t.z,
            wy - ((v * rad) / ys) * 0.5,
            by,
            dep + 0.001 * k,
            false,
            shape.dome(u, v),
            micro.leaves(px, py, t.seed),
            WEIGHT.leaves,
          )
        },
        cx,
        cy,
        rad,
        Math.round(rad * 1.15),
      )
    }
  }

  /**
   * A big mushroom house: a fibrous cylindrical stem and a cap with a domed top,
   * a lip and a gilled underside. The doorway is drawn as interior *behind* the
   * walls (depth hut.z + HUT_PX.inside), so shroomfolk walking in are hidden by
   * the walls but stay visible through the open door. The door itself, the lit
   * window and the interior glow are dynamic.
   */
  private drawHut(B: Buf, hut: Point) {
    const [bx, by, s] = project(hut.x, 0, hut.z)
    const dep = hut.z
    // light each column at its own world x, so the side facing the fire is the lit one
    const put = (k: number, r: number, c: Color, d: number, n: Normal, mh: number, mw: number) =>
      this.put(B, bx + k, by - r, c, hut.x + k / s, hut.z, r, by, d, false, n, mh, mw)
    this.region++
    for (let r = 0; r < HUT_PX.stemH; r++) {
      const flare = r < 2 ? 1 : 0
      for (let k = -7 - flare; k <= 6 + flare; k++) {
        const u = (k + 0.5) / (7 + flare)
        if (isDoor(k, r)) {
          put(k, r, C.hutInside, dep + HUT_PX.inside, shape.flat, 0, 0)
          continue
        }
        let c = k >= 4 ? C.hutStemD : k <= -6 ? C.hutStemHi : C.hutStem
        if (hash(k * 13, r * 5 + hut.x) < 0.12) c = C.hutStemD // fibres
        if (isDoorFrame(k, r)) c = C.hutFrame
        if (isWindow(k, r)) c = C.door
        // the frame stands proud of the wall; the window is set in
        const mh = isDoorFrame(k, r) ? 0.8 : isWindow(k, r) ? -0.8 : micro.fibre(bx + k, by - r, hut.x)
        put(k, r, c, dep, shape.cylinder(u), mh, isDoorFrame(k, r) || isWindow(k, r) ? 0.8 : WEIGHT.stem)
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
    this.region++
    disc(
      (px, py, u, v) => {
        let c = C.hutCap
        let mh = 0
        const spot = spots.some(([su, sv, sr]) => (u - su) ** 2 + ((v - sv) * 0.7) ** 2 < sr * sr)
        if (v > 0.6) {
          c = (px & 1) === 0 ? C.hutGill : C.hutCapD
          mh = (px & 1) === 0 ? -0.6 : 0.4 // gills
        } else if (spot) {
          c = C.hutSpot
          mh = 0.6 // spots are raised
        } else if (u < -0.6 && v < 0.1) c = C.hutCapHi
        else if (u > 0.6 || v > 0.35) c = C.hutCapD
        this.put(B, px, py, c, hut.x + (px - bx) / s, hut.z, HUT_PX.capY - v * 4, by, dep + 0.01, false, shape.cap(u, v), mh, WEIGHT.cap)
      },
      bx,
      by - HUT_PX.capY,
      16,
      8,
    )
    this.region++
    for (let r = 25; r < 31; r++) {
      for (let k = 9; k <= 10; k++) {
        put(
          k,
          r,
          r === 30 ? C.stoneD : k === 9 ? C.stone : C.stoneD,
          dep + 0.02,
          shape.cylinder(k === 9 ? -0.5 : 0.5),
          micro.stone(bx + k, by - r, 3),
          WEIGHT.stone,
        )
      }
    }
  }

  /** The knight's own sword, planted point-down beside him: a bevelled blade. */
  private drawSword(B: Buf, p: Point) {
    const [bx, by] = project(p.x, 0, p.z)
    const dep = p.z
    this.region++
    for (let r = 0; r < 13; r++) {
      const lean = r > 8 ? 1 : 0
      this.put(B, bx + lean, by - r, C.blade, p.x, p.z, r, by, dep, false, [-0.5, 0, 0.87], 0, WEIGHT.metal)
      this.put(B, bx + 1 + lean, by - r, C.bladeD, p.x, p.z, r, by, dep, false, [0.5, 0, 0.87], 0, WEIGHT.metal)
    }
    for (let k = -2; k <= 3; k++) this.put(B, bx + 1 + k, by - 13, C.guard, p.x, p.z, 13, by, dep, false, [0, 0.5, 0.87])
    for (let r = 14; r < 17; r++) this.put(B, bx + 1, by - r, C.grip, p.x, p.z, r, by, dep, false, shape.flat)
    this.put(B, bx + 1, by - 17, C.pommel, p.x, p.z, 17, by, dep, false, [0, 0.7, 0.7])
  }

  private drawPack(B: Buf, p: Point) {
    const [bx, by] = project(p.x, 0, p.z)
    this.region++
    disc((px, py, u, v) => this.put(B, px, py, v < -0.3 ? C.packHi : C.pack, p.x, p.z, 2 - v * 2, by, p.z, false, shape.dome(u, v)), bx, by - 2, 3, 2)
    this.put(B, bx - 3, by - 1, C.bedroll, p.x, p.z, 1, by, p.z, false, shape.cylinder(-0.6))
    this.put(B, bx + 3, by - 1, C.bedroll, p.x, p.z, 1, by, p.z, false, shape.cylinder(0.6))
  }

  private drawGrave(B: Buf, g: Point & { helm?: boolean }, i: number) {
    const [bx, by] = project(g.x, 0, g.z)
    const dep = g.z
    this.region++
    disc(
      (px, py, u, v) =>
        this.put(
          B,
          px,
          py,
          v < -0.2 && u < 0 ? C.stoneHi : hash(px, py) < 0.4 ? C.stoneD : C.stone,
          g.x,
          g.z,
          1 - v,
          by,
          dep,
          false,
          shape.dome(u, v),
          micro.stone(px, py, i),
          WEIGHT.stone,
        ),
      bx,
      by,
      3,
      1,
    )
    // a rusted sword, tilted differently on each grave
    const tilt = [-1, 0, 1][i % 3]
    this.region++
    for (let r = 1; r < 11; r++) {
      const px = bx + Math.round((tilt * r) / 8)
      this.put(B, px, by - r, r % 4 === 0 ? C.rust : C.bladeD, g.x, g.z, r, by, dep + 0.1, false, shape.flat, r % 4 === 0 ? -0.5 : 0, 0.5)
    }
    const tx = bx + Math.round((tilt * 11) / 8)
    for (let k = -2; k <= 2; k++) this.put(B, tx + k, by - 11, C.rust, g.x, g.z, 11, by, dep + 0.1, false, [0, 0.5, 0.87])
    this.put(B, tx, by - 12, C.grip, g.x, g.z, 12, by, dep + 0.1, false, shape.flat)
    this.put(B, tx, by - 13, C.grip, g.x, g.z, 13, by, dep + 0.1, false, shape.flat)
    if (g.helm) {
      this.region++
      disc(
        (px, py, u, v) => this.put(B, px, py, v < 0 && u < 0 ? C.stoneHi : C.helm, g.x, g.z, 14 - v, by, dep + 0.2, false, shape.dome(u, v), 0, WEIGHT.metal),
        tx,
        by - 15,
        2,
        2,
      )
      this.put(B, tx + 1, by - 15, C.door, g.x, g.z, 15, by, dep + 0.3, false, shape.flat)
    }
  }

  private drawLanternPost(B: Buf, p: Point) {
    const [bx, by] = project(p.x, 0, p.z)
    const put = (dx: number, r: number, c: Color, n: Normal = shape.flat, mh = 0, mw = 0) =>
      this.put(B, bx + dx, by - r, c, p.x, p.z, r, by, p.z, false, n, mh, mw)
    this.region++
    for (let r = 0; r < 22; r++) put(0, r, C.wood, shape.cylinder(0), micro.wood(bx, by - r, 1), WEIGHT.wood)
    for (let k = 0; k < 6; k++) put(k, 21, C.wood, [0, 0.6, 0.8], micro.wood(bx + k, by - 21, 2), WEIGHT.wood)
    put(5, 20, C.iron, [0, 0.5, 0.87])
    for (let r = 15; r < 19; r++) {
      put(4, r, C.iron, shape.cylinder(-0.7))
      put(6, r, C.iron, shape.cylinder(0.7))
    }
    put(5, 19, C.iron, [0, 0.7, 0.7])
    put(5, 14, C.iron, [0, -0.7, 0.7])
    this.region++
    for (let k = -5; k <= -1; k++)
      for (let r = 12; r < 15; r++) put(k, r, k === -5 ? C.signD : C.sign, k === -5 ? [-0.7, 0, 0.7] : shape.flat, micro.wood(bx + k, by - r, 5), WEIGHT.wood) // signboard
  }

  /**
   * The trigon stone: a bevelled slab of grainy, pitted, rain-streaked stone with a triangle
   * cut into it. The cut is a groove (low micro height) so its lips catch the rune's light.
   */
  private drawTrigon(B: Buf, p: Point) {
    const [bx, by, s] = project(p.x, 0, p.z)
    const hgt = Math.round(40 * s)
    const wid = Math.round(7 * s)
    const hy = by - Math.round(hgt * 0.6)
    const carved = new Set(trigonPx.map(([dx, dy]) => `${bx + dx},${hy + dy}`))
    const inside = new Set(TRIGON_INSIDE.map(([dx, dy]) => `${bx + dx},${hy + dy}`))
    this.region++
    for (let r = 0; r < hgt; r++) {
      const taper = r > hgt - 4 ? 1 : 0
      for (let k = -wid + taper; k <= wid - taper; k++) {
        const px = bx + k
        const py = by - r
        let c = k < -wid + 2 ? C.stoneHi : k > wid - 2 ? C.stoneD : C.stone
        if (hash(k * 7, r * 3) < 0.08) c = C.stoneD
        if (hash(k, r) < 0.05 && r < hgt * 0.4) c = C.moss
        let mh = micro.stone(px, py, 17)
        if (carved.has(`${px},${py}`)) {
          c = C.stoneD
          mh = -2.2 // the cut
        } else if (inside.has(`${px},${py}`)) mh -= 0.5 // the face inside the triangle sits a little lower
        this.put(B, px, py, c, p.x + k / s, p.z, r / s, by, p.z, false, shape.slab(k, wid, r, hgt), mh, WEIGHT.carving)
      }
    }
  }

  /** A ring of stones around the fire: grainy domes. */
  private drawStoneRing(B: Buf) {
    for (const st of STONE_RING) {
      const [sx, sy, s] = project(st.x, 0, st.z)
      this.region++
      disc(
        (px, py, u, v) => {
          let c = hash(px * 3 + st.seed, py) < 0.3 ? C.stoneD : C.stone
          if (v < -0.2 && u < 0.2) c = C.stoneHi
          if (v > 0.5) c = C.stoneD
          this.put(
            B,
            px,
            py,
            c,
            st.x + (px - sx) / s,
            st.z,
            (sy - py) / s + 0.5,
            sy,
            st.z,
            false,
            shape.dome(u, v),
            micro.stone(px, py, st.seed),
            WEIGHT.stone * 0.7,
          )
        },
        sx,
        sy - Math.floor(st.h / 2),
        st.w,
        Math.max(1, st.h),
      )
    }
  }

  /** Three old standing stones behind the fire: bevelled, pitted, mossy at the foot. */
  private drawHearthstones(B: Buf) {
    HEARTHSTONES.forEach((hs, idx) => {
      const prevTag = this.tag
      this.tag = tagId(`hearth${idx}`)
      const [bx, by, s] = project(hs.x, 0, hs.z)
      const hgt = Math.round(hs.h * s * 0.75)
      const cy = by - Math.round(hgt * 0.55)
      const spiral = new Set(SPIRAL_PX.map(([dx, dy]) => `${bx + dx},${cy + dy}`))
      this.region++
      for (let r = 0; r < hgt; r++) {
        const lean = Math.round((hs.lean * r) / hgt)
        const half = r > hgt - 3 ? hs.w - 1 : hs.w
        for (let k = -half; k <= half - 1; k++) {
          const px = bx + k + lean
          const py = by - r
          let c = k === -half ? C.menhirHi : k >= half - 1 ? C.menhirD : C.menhir
          if (hash(k * 5 + hs.x, r * 3) < 0.1) c = C.menhirD
          let mh = micro.stone(px, py, hs.x)
          if (r < 3 && hash(k, r + hs.z) < 0.5) {
            c = C.moss2
            mh += 0.6 // moss sits proud
          }
          if (hs.carved && spiral.has(`${px},${py}`)) {
            c = C.menhirD
            mh = -2 // the carved spiral
          }
          this.put(B, px, py, c, hs.x + k / s, hs.z, r / s, by, hs.z, false, shape.slab(k, half, r, hgt), mh, WEIGHT.stone)
        }
      }
      this.tag = prevTag
    })
  }

  private buildStatic(lvl: number) {
    const B = this.st
    this.bakedLevel = lvl
    for (const k in B) (B[k as keyof Buf] as Float32Array).fill(0)
    B.dep.fill(-1e9)
    this.region = 0
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
      ...PROPS.huts.map((h, i) => ({ z: h.z, draw: () => this.tagged(`hut${i}`, () => this.drawHut(B, h)) })),
      ...PROPS.graves.map((g, i) => ({ z: g.z, draw: () => this.tagged('grove', () => this.drawGrave(B, g, i)) })),
      { z: PROPS.lantern.z, draw: () => this.tagged('lantern', () => this.drawLanternPost(B, PROPS.lantern)) },
      { z: PROPS.trigon.z, draw: () => this.tagged('trigon', () => this.drawTrigon(B, PROPS.trigon)) },
      { z: PROPS.pack.z, draw: () => this.tagged('pack', () => this.drawPack(B, PROPS.pack)) },
      { z: -13, draw: () => this.drawHearthstones(B) },
      { z: 0, draw: () => this.tagged('fire', () => this.drawStoneRing(B)) },
    ]
    for (const s of statics.sort((a, b) => a.z - b.z)) s.draw()
    // small things without normals of their own
    this.region = 0
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
    // Normals for every static object. Most props were drawn from primitives that know their
    // own shape normal; anything that wasn't gets one from the relief generator (normals.ts).
    // Then the material layer bakes micro detail (grain, pits, grooves, carvings) on top.
    const light = new Float32Array(N)
    const reliefRegion = new Int32Array(N)
    for (let i = 0; i < N; i++) {
      if (!B.id[i]) continue
      light[i] = lightness(B.r[i], B.g[i], B.b[i])
      if (B.nz[i] === 0) reliefRegion[i] = B.id[i]
    }
    const rx = new Float32Array(N)
    const ry = new Float32Array(N)
    const rz = new Float32Array(N)
    reliefNormals(W, H, reliefRegion, light, rx, ry, rz)
    for (let i = 0; i < N; i++) {
      if (!reliefRegion[i]) continue
      B.nx[i] = rx[i]
      B.ny[i] = ry[i]
      B.nz[i] = rz[i]
    }
    bakeMicroDetail(B)
  }

  // ---------------------------------------------------------------- dynamic layer

  /** A campfire on the ground: an ash bed with a few bones, logs leaning in. Returns the flame's base. */
  private drawCampfire(B: Buf, w: World): [number, number] {
    const [fx, fy] = project(0, 0, 0)
    const heat = w.fire.heat
    // the ash bed lies flat (no reflection, no normals)
    disc((px, py) => this.put(B, px, py, hash(px * 7, py * 3) < 0.35 ? C.ashD : C.ash, (px - fx) / 1.35, (py - fy) / 0.6, 0.1, fy, -0.6, true), fx, fy, 7, 2)
    for (const [dx, dy] of [
      [-6, 0],
      [5, 1],
      [-3, 1],
      [6, -1],
    ])
      this.put(B, fx + dx, fy + dy, C.bone, dx * 0.6, dy, 0.3, fy, -0.5, true)
    // a little skull at the edge of the ashes
    this.put(B, fx - 5, fy - 1, C.bone, -3.5, 0, 1, fy, -0.4)
    this.put(B, fx - 4, fy - 1, C.bone, -3, 0, 1, fy, -0.4)
    this.put(B, fx - 5, fy, C.boneD, -3.5, 0, 0.5, fy, -0.4)
    this.put(B, fx - 4, fy, C.char, -3, 0, 0.5, fy, -0.4)
    // logs leaning into the middle, charred toward the heart of the fire
    const logs: [number, number, number, number][] = [
      [-7, 1, -1, -3],
      [7, 1, 1, -3],
      [-4, 2, 1, -2],
      [4, 2, -1, -2],
    ]
    for (const [x0, y0, x1, y1] of logs) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const px = Math.round(x0 + (x1 - x0) * t)
        const py = Math.round(y0 + (y1 - y0) * t)
        this.put(B, fx + px, fy + py, t > 0.6 ? C.char : t > 0.3 ? C.log : C.logLit, px * 0.6, 0.2, -py + 1, fy, 0.05)
        if (t > 0.55 && hash(px, py + ((w.t * 3) | 0)) < 0.6) this.putFx(fx + px, fy + py, GLOW.ember, 0.4 + 0.6 * heat, fy, 0.06, 0.4)
      }
    }
    return [fx, fy - 3]
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

  /** A stick: lying flat, carried, or tumbling through the air (`height` above the ground, `angle` of its spin). */
  private drawStick(B: Buf, wx: number, wz: number, lift: number, angle = 0, height = 0) {
    const [bx, by] = project(wx, height, wz)
    const [, gy] = project(wx, 0, wz)
    const a = ((angle % Math.PI) + Math.PI) % Math.PI
    const pts = STICK_POSES[Math.round(a / (Math.PI / 4)) % 4]
    pts.forEach(([dx, dy], i) => {
      const c = i === pts.length - 1 ? C.stickD : i === 1 ? C.logEnd : C.stick
      this.put(B, bx + dx, by - lift + dy, c, wx, wz, height + lift - dy, gy, wz + 0.6, false, shape.cylinder(0))
    })
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

  private mushHover(m: Mush, w: World): [string, string] {
    const st = m.fsm.state
    if (st === 'sprouting') return [m.name, 'a sprout, new since the rain']
    let words = STATE_WORDS[st] ?? ''
    if (st === 'visit' && m.spot !== null && w.memorials[m.spot]) words = `sitting by ${w.memorials[m.spot].name}'s glowcap`
    const name = w.keeperId === m.id ? `${m.name}, the keeper` : isElder(m) && st !== 'departing' && st !== 'wilting' ? `old ${m.name}` : m.name
    return [name, words]
  }

  /** The knight, as far along his story as he is. */
  private drawKnight(B: Buf, w: World) {
    const k = w.knight
    const st = k.fsm.state
    if (k.sword === 'planted') {
      this.tagged('sword', () => this.drawSword(B, PROPS.sword))
      this.say('sword', 'his sword', 'he has not drawn it in a long time')
    }
    if (k.sword === 'laid') {
      // his grave, beside his companions': a cairn, his sword planted, his helm on the hilt
      this.tagged('knightgrave', () => this.drawGrave(B, { ...KNIGHT_GRAVE, helm: true }, 1))
      this.say('knightgrave', 'the last knight', 'he rests with them now')
    }
    if (st === 'gone') return
    const sub: Record<string, string> = {
      resting: 'keeping his vigil',
      nodding: 'nodding off',
      rising: 'rising, slowly',
      walking: 'walking to the quiet grove',
      kneeling: 'laying down his sword',
    }
    const opts = { hover: { key: 'knight', name: 'the last knight', sub: sub[st] }, shine: KNIGHT_SHINE, parts: KNIGHT_PARTS }
    if (st === 'resting' || st === 'nodding') this.sprite(B, st === 'nodding' && k.headDown ? KNIGHT_NOD : KNIGHT, k.x, k.z, KNIGHT_PAL, false, opts)
    else if (st === 'kneeling') this.sprite(B, KNIGHT_KNEEL, k.x, k.z, KNIGHT_PAL, false, opts)
    else this.sprite(B, st === 'walking' ? KNIGHT_STAND[((k.step * 3) % 2) | 0] : KNIGHT_STAND[0], k.x, k.z, KNIGHT_PAL, k.flip, opts)
  }

  /** Which frame a shroomfolk shows: walking, standing, or sitting (with the occasional blink). */
  private mushFrame(m: Mush, w: World, keeper: boolean): Rows {
    const set = keeper ? MUSH_KEEPER : MUSH
    const st = m.fsm.state
    const moving = WALKING.includes(st) && isMoving(m)
    if (moving) return set.walk[((w.t * (isElder(m) ? 5 : 7)) % 2) | 0]
    if (SITTING.includes(st)) return (w.t * 0.8 + m.id * 7) % 3.5 < 0.15 ? set.sitBlink : set.sit
    return set.walk[0]
  }

  private drawDynamic(w: World) {
    const t = w.t
    const B = this.fb
    copyBuf(B, this.st)
    for (const k in this.fx) this.fx[k as keyof typeof this.fx].fill(0)
    this.labels.clear()
    this.tag = 0
    this.region = 0

    // names for the static props (their pixels were tagged when the static layer was built)
    PROPS.huts.forEach((_, i) => {
      const sleepers = w.mush.filter((m) => m.fsm.state === 'asleep' && m.hut === i).map((m) => m.name)
      const sub = sleepers.length ? `${sleepers.join(' and ')} asleep inside` : doorOpen(w, i) ? 'someone is stepping through the door' : 'empty for now'
      this.say(`hut${i}`, 'shroomfolk hollow', sub)
    })
    this.say('lantern', 'the road out', 'someone keeps the lantern lit')
    this.say('trigon', 'the trigon stone', w.rune > 0.1 ? 'it hums in the rain' : 'cold and quiet')
    this.say('pack', 'his pack', w.knight.fsm.state === 'gone' ? 'left by the fire; nobody has moved it' : 'everything he still owns')
    this.say('hearth0', 'a hearthstone', 'older than the village', true)
    this.say('hearth1', 'the carved hearthstone', w.fire.heat > 0.55 ? 'its spiral glows when the fire is high' : 'a spiral, worn smooth by hands', true)
    this.say('hearth2', 'a hearthstone', 'it leans, as if listening', true)
    {
      const companions = w.knight.fsm.state === 'gone' ? 'the knight and his companions' : "the knight's companions"
      const village = w.memorials.length ? `, and ${w.memorials.length} of the village` : ''
      const candles = w.candles.some((c) => c.lit) ? '' : ' · the candles are out'
      this.say('grove', 'the quiet grove', `${companions}${village}${candles}`)
    }
    this.say('fire', 'the campfire', w.fire.fsm.state === 'roaring' ? 'roaring' : w.fire.fsm.state === 'steady' ? 'burning steady' : 'burning low')
    this.say('woodpile', 'woodpile', `${w.pile} log${w.pile === 1 ? '' : 's'}, stacked by small hands`)
    this.say('pool', 'rain pool', w.poolLevel > 1.08 ? 'swollen with rain' : 'still and dark')
    this.say('foxfire', 'foxfire', 'a fungus that glows on rotting wood')
    this.say('relic', RELICS[this.relic].name, RELICS[this.relic].sub)

    // ---- objects first (they fill the depth buffer that emissives test against)
    const [fireX, fireY] = this.tagged('fire', () => this.drawCampfire(B, w))
    const [, groundY] = project(0, 0, 0)
    this.tagged('woodpile', () => this.drawWoodpile(B, w.pile))
    this.drawKnight(B, w)
    w.sticks.forEach((s, i) => {
      this.say(`stick${i}`, 'a stick', s.landed ? (s.claimed ? 'someone is coming for it' : 'waiting to be fetched') : 'falling')
      this.tagged(`stick${i}`, () => this.drawStick(B, s.x, s.z, 0, s.angle, s.y))
    })
    PROPS.huts.forEach((hut, i) => this.tagged(`hut${i}`, () => this.drawHutDoor(B, hut, doorOpen(w, i))))
    this.tagged('grove', () =>
      PROPS.graves.forEach((g, i) => {
        const [gx, gy] = project(g.x + 3, 0, g.z + 1)
        this.put(B, gx, gy, C.candle, g.x + 3, g.z + 1, 1, gy, g.z + 2)
        if (w.candles[i].wax > 0.4) this.put(B, gx, gy - 1, C.candle, g.x + 3, g.z + 1, 2, gy, g.z + 2)
      }),
    )

    // glowcaps: where shroomfolk returned to the soil
    const glowcaps = w.memorials.map((m) => ({
      ...this.sprite(B, GLOWCAP, m.x, m.z, GLOWCAP_PAL, false, {
        glowChar: 'c',
        parts: GLOWCAP_PARTS,
        hover: { key: `glowcap${m.spot}`, name: 'a glowcap', sub: `${m.name} rests here` },
      }),
      ph: m.ph,
      key: `glowcap${m.spot}`,
    }))

    // shroomfolk (asleep ones are inside their hut)
    const caps: { glow: [number, number][]; by: number; dep: number; elder: boolean; key: string }[] = []
    const lanterns: { x: number; y: number; dep: number; key: string }[] = []
    let keeperEmber: { x: number; y: number; dep: number; key: string } | null = null
    for (const m of w.mush) {
      const st = m.fsm.state
      if (st === 'asleep') continue
      const key = `mush${m.id}`
      const [name, sub] = this.mushHover(m, w)
      const hover = { key, name, sub }
      if (st === 'sprouting') {
        this.sprite(B, m.size < 0.5 ? MUSH.baby : MUSH.mid, m.x, m.z, MUSH_PAL, m.flip, { hover, parts: MUSH_PARTS })
        continue
      }
      const keeper = w.keeperId === m.id
      const moving = WALKING.includes(st) && isMoving(m)
      const hop = isRaining(w) && moving && Math.sin(t * 12 + m.id * 10) > 0.6 ? 1 : 0
      const elder = isElder(m)
      const [, by] = project(m.x, 0, m.z)
      const sink = st === 'wilting' ? Math.round(m.sink * 9) : 0
      const pal = keeper ? { ...(elder ? MUSH_PAL_ELDER : MUSH_PAL), ...KEEPER_TRIM } : elder ? MUSH_PAL_ELDER : MUSH_PAL
      const sp = this.sprite(B, this.mushFrame(m, w, keeper), m.x, m.z, pal, m.flip, {
        glowChar: 'w',
        lift: hop - sink,
        sinkTo: sink ? by : undefined,
        hover,
        parts: MUSH_PARTS,
        shine: keeper ? { h: 1 } : undefined,
      })
      caps.push({ ...sp, elder, key })
      if (m.carrying) this.tagged(key, () => this.drawStick(B, m.x, m.z, sp.h + 1 + hop))
      if (st === 'departing') lanterns.push({ x: sp.bx + (m.flip ? -4 : 4), y: sp.by - 4, dep: sp.dep + 0.02, key })
      // the keeper carries an ember from the fire, so you can always find them, even in the dark
      if (keeper) keeperEmber = { x: sp.bx + (m.flip ? -4 : 4), y: sp.by - 3, dep: sp.dep + 0.02, key }
    }

    // deer
    const D = w.deer
    const ds = D.fsm.state
    const drows = ds === 'drink' ? DEER.drink : ds === 'graze' ? DEER.walk[0] : DEER.walk[((D.step * 5) % 2) | 0]
    const deerSub = ds === 'flee' ? 'startled' : ds === 'drink' ? 'drinking' : D.thirst > 1 ? 'thirsty' : 'grazing'
    this.sprite(B, drows, D.x, D.z, DEER_PAL, D.flip, { hover: { key: 'deer', name: 'a deer', sub: deerSub }, parts: DEER_PARTS })

    // frog, mid-hop or sitting on its pad
    const F = w.frog
    const [ax, az] = PADS[F.from]
    const [bx2, bz2] = PADS[F.pad]
    const hopping = F.fsm.state === 'hop'
    const k = hopping ? F.progress : 1
    const frogX = ax + (bx2 - ax) * k
    const frogZ = az + (bz2 - az) * k
    const arc = hopping ? Math.round(Math.sin(k * Math.PI) * 4) : 0
    const frog = this.sprite(B, FROG[hopping ? 1 : 0], frogX, frogZ, FROG_PAL, bx2 < ax, {
      lift: arc + 1,
      dep: frogZ + 1,
      hover: { key: 'frog', name: 'the frog', sub: 'unimpressed' },
      parts: FROG_PARTS,
    })

    // crow on the trigon stone (in flight it's drawn with the emissives, over the sky)
    const K = w.crow
    if (K.fsm.state === 'perch') {
      const [px, py] = perchPos()
      const lookLeft = t % 6 < 3
      this.say('crow', 'a crow', 'it watches the fire too')
      this.tagged('crow', () =>
        CROW[0].forEach((row, r) =>
          [...row].forEach((ch, c) => {
            if (ch !== '.') this.put(B, px + (lookLeft ? 3 - c : c) - 2, py - 3 + r, C.crow, PROPS.trigon.x, PROPS.trigon.z, 40, py, PROPS.trigon.z + 1)
          }),
        ),
      )
    }

    // ---- emissives, depth-tested against everything above
    const R = lightRadius(w)
    const heat = w.fire.heat
    for (const cap of caps)
      this.tagged(cap.key, () => {
        for (const [gx, gy] of cap.glow) this.putFx(gx, gy, GLOW.cap, cap.elder ? 0.45 : 0.85, cap.by, cap.dep + 0.01)
      })
    for (const l of lanterns)
      this.tagged(l.key, () => {
        this.putFx(l.x, l.y, GLOW.lantern[0], 0.95, undefined, l.dep)
        this.putFx(l.x, l.y + 1, GLOW.lantern[1], 0.8, undefined, l.dep)
      })
    if (keeperEmber) {
      const e: { x: number; y: number; dep: number; key: string } = keeperEmber
      const pulse = 0.75 + 0.25 * Math.sin(t * 3)
      this.tagged(e.key, () => {
        this.putFx(e.x, e.y, GLOW.ember, pulse, undefined, e.dep)
        this.putFx(e.x, e.y - 1, FLAME[2], 0.6 * pulse, undefined, e.dep, 0.6)
      })
    }
    if (F.croak > 0) this.tagged('frog', () => this.putFx(frog.bx + 1, frog.by - 1, GLOW.croak, 0.8, undefined, frog.dep + 0.01))
    if (K.fsm.state === 'flying' || K.fsm.state === 'returning') {
      this.say('crow', 'a crow', 'off somewhere drier')
      this.tagged('crow', () =>
        CROW[1 + (((t * 8) % 2) | 0)].forEach((row, r) =>
          [...row].forEach((ch, c) => {
            if (ch !== '.') this.putFx(K.x + c - 2, K.y + r - 1, C.crow, 1, undefined, undefined, 0)
          }),
        ),
      )
    }
    PROPS.huts.forEach((hut, i) =>
      this.tagged(`hut${i}`, () => {
        const [hx, hy] = project(hut.x, 0, hut.z)
        const asleep = hutOccupancy(w, i)
        if (asleep || doorOpen(w, i))
          for (const [dk, dr] of DOOR_PX) this.putFx(hx + dk, hy - dr, GLOW.inside, asleep ? 0.45 : 0.25, undefined, hut.z + HUT_PX.inside + 0.1, 0.3)
        if (asleep) for (const [dk, dr] of WINDOW_PX) this.putFx(hx + dk, hy - dr, GLOW.window, 0.95, undefined, hut.z + 0.05)
      }),
    )
    this.tagged('lantern', () => {
      const p = PROPS.lantern
      const [lx, ly] = project(p.x, 0, p.z)
      const fl = 0.75 + 0.25 * vnoise(t * 6, 7)
      GLOW.lantern.forEach((c, i) => this.putFx(lx + 5, ly - 16 - i, c, fl * (i === 2 ? 0.8 : 1), ly, p.z + 0.05))
    })
    if (w.rune > 0.02)
      this.tagged('trigon', () => {
        const p = PROPS.trigon
        const [bx, by, sc] = project(p.x, 0, p.z)
        const hy = by - Math.round(Math.round(40 * sc) * 0.6)
        const pulse = w.rune * (0.7 + 0.3 * Math.sin(t * 2))
        // light sits in the cut, radiates faintly from the face inside it, and haloes the lip around it
        for (const [dx, dy] of TRIGON_INSIDE) this.putFx(bx + dx, hy + dy, GLOW.rune, 0.22 * pulse, undefined, p.z + 0.2, 0.4)
        for (const [dx, dy] of TRIGON_LIP) this.putFx(bx + dx, hy + dy, GLOW.rune, 0.18 * pulse, undefined, p.z + 0.2, 0.6)
        for (const [dx, dy] of trigonPx) this.putFx(bx + dx, hy + dy, GLOW.rune, pulse, undefined, p.z + 0.2)
      })
    this.tagged('grove', () =>
      PROPS.graves.forEach((g, i) => {
        const [gx, gy] = project(g.x + 3, 0, g.z + 1)
        const c = w.candles[i]
        if (c.lit) this.putFx(gx, gy - (c.wax > 0.4 ? 2 : 1), GLOW.candle, (0.7 + 0.3 * vnoise(t * 7 + g.x, 2)) * (0.6 + 0.4 * c.wax), gy, g.z + 2.05)
      }),
    )
    // the carved spiral on the middle hearthstone warms with the fire
    this.tagged('hearth1', () => {
      const hs = HEARTHSTONES.find((h) => h.carved)!
      const [bx, by, s] = project(hs.x, 0, hs.z)
      const cy = by - Math.round(Math.round(hs.h * s * 0.75) * 0.55)
      const warm = clamp((heat - 0.35) * 1.6)
      if (warm > 0.02)
        for (const [dx, dy] of SPIRAL_PX) this.putFx(bx + dx, cy + dy, GLOW.carving, warm * (0.6 + 0.2 * Math.sin(t * 1.5)), undefined, hs.z + 0.1)
    })
    // foxfire: faint violet specks on rotten wood (ambient, just pretty)
    this.tagged('foxfire', () => {
      for (const s of SHROOMS) {
        const [sx, sy] = project(s.x, 0, s.z)
        const a = 0.4 + 0.25 * Math.sin(t * 0.8 + s.ph)
        this.putFx(sx, sy, GLOW.foxfire, a, sy, s.z + 0.05, 0.6)
        this.putFx(sx + 1, sy, GLOW.foxfireD, a * 0.7, sy, s.z + 0.05, 0.6)
      }
    })
    // glowcap caps (the mushrooms themselves are drawn with the objects)
    for (const g of glowcaps)
      this.tagged(g.key, () => {
        const pulse = 0.75 + 0.25 * Math.sin(t * 0.6 + g.ph)
        for (const [gx, gy] of g.glow) this.putFx(gx, gy, GLOW.memorial, pulse, g.by, g.dep + 0.01)
      })
    EYES.forEach((e, i) => {
      const d = Math.hypot(e.x, e.z)
      if (d < R * 1.05 || (t * 0.7 + e.ph) % 4 < 0.12) return // they keep to the dark, and blink
      const [sx, sy] = project(e.x, e.y, e.z)
      const a = 0.8 * clamp((d - R * 1.05) / 15)
      this.say(`eyes${i}`, 'something in the trees', 'watching the fire')
      this.tagged(`eyes${i}`, () => {
        this.putFx(sx, sy, GLOW.eye, a, undefined, e.z)
        this.putFx(sx + 2, sy, GLOW.eye, a, undefined, e.z)
        this.putFx(sx + 1, sy, GLOW.eye, 0.01, undefined, e.z, 0) // invisible bridge, so the gap between them hovers too
      })
    })

    // the flame: its size follows the fire's heat, so a fresh log swells it gradually
    const fh = 4 + 20 * heat
    this.tagged('fire', () => {
      const coals = Math.round(3 + 3 * Math.min(1, heat))
      for (let kk = -coals; kk <= coals; kk++) this.putFx(fireX + kk, fireY + 1, FLAME[hash(kk, (t * 8) | 0) < 0.5 ? 1 : 2], 1, groundY, 0.2, 0.3)
      const half0 = 2.5 + 4.5 * heat
      for (let y = Math.floor(fireY - fh - 2); y <= fireY; y++) {
        const dy = (fireY - y) / fh
        if (dy > 1 || dy < 0) continue
        const sway = Math.sin(t * 3 + dy * 4) * dy * 2.5
        const half = half0 * Math.pow(1 - dy, 0.7) + 0.5
        for (let x = fireX - 10; x <= fireX + 10; x++) {
          const n = vnoise(x * 0.42, y * 0.38 + t * 7)
          const v = (1 - Math.abs(x - fireX - sway) / half) * (1 - dy * 0.6) + (n - 0.5) * 0.9 - dy * 0.35
          if (v < 0.12) continue
          this.putFx(x, y, FLAME[v > 0.8 ? 3 : v > 0.52 ? 2 : v > 0.3 ? 1 : 0], 1, groundY, 0.2, 0.22)
        }
      }
    })
    // The relic stands in the flames. Like the bonfire's sword it is a dark silhouette where the
    // flame is behind it, lit warm by the fire where it rises above, and its metal glows with heat.
    this.tagged('relic', () => {
      const art = RELICS[this.relic]
      const h = art.rows.length
      const wd = art.rows[0].length
      const warm = clamp(heat * 1.1 - 0.15)
      art.rows.forEach((row, r) =>
        [...row].forEach((ch, c) => {
          if (ch === '.') return
          const px = fireX - (wd >> 1) + c
          const py = groundY - h + r
          const inFlame = this.fx.a[py * W + px] > 0.5
          const lit: Color = [art.pal[ch][0] * (0.5 + 1.3 * heat), art.pal[ch][1] * (0.4 + 0.8 * heat), art.pal[ch][2] * (0.35 + 0.45 * heat)]
          const base = inFlame ? mix(art.pal[ch], C.char, 0.8) : lit
          const col = ch === 'g' ? mix(base, GLOW.carving, warm * (0.6 + 0.3 * vnoise(t * 3, c + r))) : base
          this.putFx(px, py, col, 1, groundY, 0.31, ch === 'g' ? 0.5 * warm : 0) // the bone/wood itself doesn't glow
        }),
      )
    })
    // smoke when the fire is low or it's raining (steam)
    const smoky = clamp((0.5 - heat) * 1.4) + (isRaining(w) ? 0.35 : 0)
    if (smoky > 0.02) {
      for (let i = 0; i < 10; i++) {
        const age = (t * 0.35 + i / 10) % 1
        const sx = fireX + (vnoise(i * 3.1, t * 0.4) - 0.5) * 8 * age + Math.sin(t + i) * age * 3
        const sy = fireY - 6 - age * 34
        this.putFx(sx, sy, GLOW.smoke, smoky * 0.22 * (1 - age), undefined, undefined, 0)
      }
    }
    for (const e of w.embers) {
      const life = 1 - e.age / e.life
      this.putFx(fireX + e.ox, groundY - e.oy, [1, (120 + life * 100) / 255, 60 / 255], life, groundY, 0.2, 0.6)
    }
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
    // a stick you just dropped carries a soft highlight, so you can see where it went
    w.sticks.forEach((s, i) => {
      if (s.glint <= 0.02) return
      const [bx, by] = project(s.x, s.y, s.z)
      const a = ((s.angle % Math.PI) + Math.PI) % Math.PI
      this.tagged(`stick${i}`, () => {
        for (const [dx, dy] of STICK_POSES[Math.round(a / (Math.PI / 4)) % 4])
          this.putFx(bx + dx, by + dy, GLOW.glint, 0.55 * s.glint, undefined, s.z + 0.65, 0.25)
      })
    })
    // falling sticks cast a small shadow that tightens as they near the ground; landings kick up dust
    for (const s of w.sticks) {
      if (s.landed) continue
      const [gx, gy] = project(s.x, 0, s.z)
      const spread = Math.max(1, Math.round(3 - s.y / 10))
      for (let dx = -spread; dx <= spread; dx++) this.putFx(gx + dx, gy, C.char, 0.45 * (1 - s.y / 30), undefined, s.z - 0.1, 0)
    }
    for (const p of w.puffs) {
      if (p.age < 0) continue
      const k = p.age / 0.9
      const [gx, gy] = project(p.x, 0, p.z)
      for (let i = 0; i < 4; i++) {
        const ox = (hash(p.seed, i) - 0.5) * 9 * (0.3 + k)
        const oy = -k * 4 - hash(i, p.seed) * 2
        this.putFx(gx + ox, gy + oy, GLOW.dust, 0.55 * (1 - k), undefined, p.z + 1, 0)
      }
    }
    for (const r of w.ripples) {
      if (r.age < 0) continue
      const a = r.age / 0.7
      const hw = (1 + a * 4) | 0
      for (let dx = -hw; dx <= hw; dx++) this.putFx(r.x + dx, r.y, GLOW.ripple, 0.55 * (1 - a), undefined, undefined, 0.2)
    }
  }

  // ---------------------------------------------------------------- lighting

  /** Things standing on the ground that can cast shadows from a light. */
  private casters(w: World): Caster[] {
    const out: Caster[] = [
      ...(w.knight.fsm.state === 'gone' ? [] : [{ x: w.knight.x, z: w.knight.z, r: 3, h: w.knight.fsm.state === 'walking' ? 15 : 11 }]),
      { x: w.deer.x, z: w.deer.z, r: 3.5, h: 8 },
      { x: PROPS.woodpile.x, z: PROPS.woodpile.z, r: 4, h: 3 },
      ...(w.knight.sword === 'planted' ? [{ x: PROPS.sword.x, z: PROPS.sword.z, r: 0.7, h: 13 }] : []),
      ...(w.knight.sword === 'laid' ? [{ x: KNIGHT_GRAVE.x, z: KNIGHT_GRAVE.z, r: 1, h: 10 }] : []),
      { x: PROPS.pack.x, z: PROPS.pack.z, r: 2.5, h: 3 },
      ...PROPS.huts.map((h) => ({ x: h.x, z: h.z, r: 5.5, h: 16 })),
      ...PROPS.graves.map((g) => ({ x: g.x, z: g.z, r: 1, h: 9 })),
      { x: PROPS.lantern.x, z: PROPS.lantern.z, r: 0.6, h: 16 },
      ...HEARTHSTONES.map((h) => ({ x: h.x, z: h.z, r: h.w * 0.7, h: h.h * 0.8 })),
      ...STONE_RING.map((s) => ({ x: s.x, z: s.z, r: s.w * 0.6, h: 1.5 })),
      ...TREES.map((t) => ({ x: t.x, z: t.z, r: 1.1 * t.w, h: 60 })),
    ]
    for (const m of w.mush) if (m.fsm.state !== 'asleep') out.push({ x: m.x, z: m.z, r: 2.2 * Math.max(0.4, m.size), h: 6 * Math.max(0.3, m.size) })
    return out
  }

  /**
   * Every light in the scene this frame, all in the same model (see lights.ts).
   * Colours include brightness; flames wobble and spill, steady glows don't.
   */
  private lights(w: World): Light[] {
    const t = w.t
    const heat = w.fire.heat
    const warm = (k: number): Color => [0.9 * k, 0.6 * k, 0.25 * k]
    const out: Light[] = []
    const fi = (0.3 + 0.7 * heat) * (0.84 + 0.16 * vnoise(t * 9, 3.3))
    out.push({ x: 0, y: FIRE_Y, z: 0, radius: lightRadius(w), color: [1.7 * fi, 0.95 * fi, 0.42 * fi], wobble: 1, tail: 0.11, shadows: true, seed: 7 })
    {
      const fl = 0.85 + 0.15 * vnoise(t * 6, 7)
      out.push({ x: PROPS.lantern.x + 3, y: 16, z: PROPS.lantern.z, radius: 32, color: warm(1.4 * fl), wobble: 0.5, tail: 0.06, shadows: true, seed: 3 })
    }
    PROPS.graves.forEach((g, i) => {
      const c = w.candles[i]
      if (!c.lit) return
      const fl = (0.8 + 0.2 * vnoise(t * 7 + g.x, 2)) * (0.6 + 0.4 * c.wax)
      out.push({ x: g.x + 3, y: 3, z: g.z + 1, radius: 22, color: warm(1.2 * fl), wobble: 0.7, tail: 0.04, shadows: true, seed: g.x })
    })
    PROPS.huts.forEach((h, i) => {
      if (hutOccupancy(w, i)) out.push({ x: h.x + 3, y: 10, z: h.z + 3, radius: 18, color: warm(0.95), wobble: 0, tail: 0.04, shadows: false, seed: i })
    })
    if (w.rune > 0.02) {
      const k = w.rune
      // the rune glows from inside the carving: a tight light at the cut, with a soft spill around it
      out.push({
        x: PROPS.trigon.x,
        y: 24,
        z: PROPS.trigon.z + 1.2,
        radius: 13,
        color: [0.2 * k, 1.0 * k, 0.95 * k],
        wobble: 0.1,
        tail: 0.09,
        shadows: false,
        seed: 11,
      })
    }
    for (const m of w.mush) {
      if (m.size < 0.5 || m.fsm.state === 'asleep') continue
      out.push({ x: m.x, y: 6, z: m.z, radius: 8, color: [0.08, 0.3, 0.28], wobble: 0, tail: 0, shadows: false, seed: m.id, owner: tagId(`mush${m.id}`) })
      if (m.id === w.keeperId)
        out.push({ x: m.x + (m.flip ? -3 : 3), y: 4, z: m.z, radius: 10, color: [0.75, 0.38, 0.12], wobble: 0.5, tail: 0, shadows: false, seed: m.id })
      if (m.fsm.state === 'departing')
        out.push({ x: m.x + (m.flip ? -3 : 3), y: 5, z: m.z, radius: 15, color: warm(0.8), wobble: 0.6, tail: 0.03, shadows: false, seed: m.id })
    }
    for (const s of SHROOMS) out.push({ x: s.x, y: 1, z: s.z, radius: 7, color: [0.16, 0.1, 0.3], wobble: 0, tail: 0, shadows: false, seed: s.ph })
    for (const m of w.memorials)
      out.push({
        x: m.x,
        y: 3,
        z: m.z,
        radius: 13,
        color: [0.15, 0.6, 0.55],
        wobble: 0,
        tail: 0.03,
        shadows: false,
        seed: m.ph,
        owner: tagId(`glowcap${m.spot}`),
      })
    for (const f of w.flies)
      if (f.a > 0.05)
        out.push({ x: f.x, y: f.y, z: f.z, radius: 8, color: [0.5 * f.a, 0.6 * f.a, 0.2 * f.a], wobble: 0, tail: 0, shadows: false, seed: f.seed })
    return out
  }

  private compose(w: World, opts: RenderOptions) {
    const t = w.t
    const B = this.fb
    const fx = this.fx
    const out = this.out
    const amb = isRaining(w) ? 0.8 : 1
    const useNormals = opts.normals
    const lights = prepareLights(this.lights(w), this.casters(w))
    const nrm: [number, number, number] = [0, 0, 0]

    // Ambient moonlight (with a rim on surfaces that face the moon), plus every light source.
    const Lc: Color = [0, 0, 0]
    const light = (i: number, x: number, z: number, y: number, ground: boolean) => {
      let moon = 1
      let normal: [number, number, number] | null = null
      if (!ground && useNormals && i >= 0 && B.nz[i] > 0) {
        nrm[0] = B.nx[i]
        nrm[1] = B.ny[i]
        nrm[2] = B.nz[i]
        normal = nrm
        moon = 0.5 + 1.3 * Math.max(0, nrm[0] * MOON[0] + nrm[1] * MOON[1] + nrm[2] * MOON[2])
      }
      Lc[0] = 0.15 * amb * moon
      Lc[1] = 0.18 * amb * moon
      Lc[2] = 0.27 * amb * moon
      gatherLight(lights, t, x, y, z, ground, ground ? groundGrain(x, z) : 0.5, normal, Lc, i >= 0 ? B.hv[i] : 0)
      if (normal && B.sp[i] > 0) {
        // metal: a tight warm glint where the surface faces the fire, a cool rim toward the moon
        const fire = lights[0]
        let lx = fire.x - x
        let ly = fire.y - y
        let lz = fire.z - z
        const d = Math.hypot(lx, ly, lz) || 1
        lx /= d
        ly /= d
        lz /= d
        const reach = Math.max(0, 1 - d / (fire.radius * 1.2))
        const hl = Math.hypot(lx, ly + VIEW[1], lz + VIEW[2]) || 1
        const fs = Math.pow(Math.max(0, (normal[0] * lx + normal[1] * (ly + VIEW[1]) + normal[2] * (lz + VIEW[2])) / hl), 9) * reach * 2.2 * B.sp[i]
        const ms = Math.pow(Math.max(0, normal[0] * MOON_H[0] + normal[1] * MOON_H[1] + normal[2] * MOON_H[2]), 7) * 0.45 * amb * B.sp[i]
        Lc[0] += fs * fire.color[0] + ms * 0.55
        Lc[1] += fs * fire.color[1] + ms * 0.65
        Lc[2] += fs * fire.color[2] + ms * 0.85
      }
    }

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        let r: number, g: number, b: number
        if (B.a[i]) {
          light(i, B.kx[i], B.kz[i], B.ky[i], B.obj[i] === 0)
          r = B.r[i] * Lc[0]
          g = B.g[i] * Lc[1]
          b = B.b[i] * Lc[2]
          if (B.pool[i] && !B.obj[i]) {
            // open water: dark surface + the mirrored world + mirrored emissives, gently rippled
            const ox = Math.round(Math.sin(y * 1.7 + t * 2.4) * 0.7)
            const j = y * W + Math.max(0, Math.min(W - 1, x + ox))
            if (B.ra[j]) {
              light(-1, B.rkx[j], B.rkz[j], B.rky[j], false)
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
      const ra = fx.ra[i] * 0.6 * fx.rbw[i]
      const useR = ra > fx.a[i]
      e[o] = (useR ? fx.rr[i] : fx.r[i]) * 255
      e[o + 1] = (useR ? fx.rg[i] : fx.g[i]) * 255
      e[o + 2] = (useR ? fx.rb[i] : fx.b[i]) * 255
      e[o + 3] = Math.max(fx.a[i] * fx.bw[i], ra) * 255
    }
    this.outX.putImageData(this.outImg, 0, 0)
    this.fxX.putImageData(this.fxImg, 0, 0)

    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(this.outC, 0, 0, DW, DH)
    if (opts.glow) {
      // soft bloom from the emissive layer, plus a faint warm wash around the fire
      const heat = Math.min(1.2, w.fire.heat)
      ctx.globalCompositeOperation = 'lighter'
      ctx.imageSmoothingEnabled = true
      ctx.filter = `blur(${3 * S}px)`
      ctx.globalAlpha = 0.85 * (0.45 + 0.55 * heat)
      ctx.drawImage(this.fxC, 0, 0, DW, DH)
      ctx.filter = `blur(${9 * S}px)`
      ctx.globalAlpha = 0.55 * (0.3 + 0.7 * heat)
      ctx.drawImage(this.fxC, 0, 0, DW, DH)
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      const [fsx, fsy] = project(0, 8, 0)
      const fl = heat * (0.85 + 0.15 * vnoise(w.t * 9, 1))
      ctx.translate(fsx * S, fsy * S)
      ctx.scale(1, 0.6)
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, lightRadius(w) * 1.5 * S)
      gr.addColorStop(0, `rgba(255,140,60,${0.07 * fl})`)
      gr.addColorStop(0.4, `rgba(255,110,40,${0.025 * fl})`)
      gr.addColorStop(1, 'rgba(255,100,30,0)')
      ctx.fillStyle = gr
      ctx.fillRect(-DW, -DH * 2, DW * 2, DH * 4)
    }
    ctx.restore()
    if (isRaining(w)) this.drawRain(w)
    this.drawHover()
    if (opts.debug) this.drawDebug(w)
  }

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

  /**
   * Name whatever is under the pointer. Every drawn pixel knows what it belongs to, so this is
   * exact: the glowcap behind the grave answers for its own pixels. A pixel or two of slack
   * makes small things easy to catch.
   */
  private drawHover() {
    const p = this.pointer
    this.hovered = null
    if (!p) return
    const B = this.fb
    const px = Math.floor(p.x)
    const py = Math.floor(p.y)
    let id = 0
    for (let ring = 0; ring <= 2 && !id; ring++) {
      for (let dy = -ring; dy <= ring && !id; dy++) {
        for (let dx = -ring; dx <= ring && !id; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
          const x = px + dx
          const y = py + dy
          if (x < 0 || x >= W || y < 0 || y >= H) continue
          const t = B.hv[y * W + x]
          if (t && this.labels.has(t)) id = t
        }
      }
    }
    const inside = px >= 0 && px < W && py >= 0 && py < H
    if (!id && inside && B.pool[py * W + px] && !B.obj[py * W + px]) id = tagId('pool')
    const label = this.labels.get(id)
    if (!label) return
    this.hovered = [label[0], label[1]]
    // place the name under the part of the thing near the pointer (wide things like the grove
    // spread across the screen), wrapped, and kept inside the frame
    let x0 = W
    let x1 = 0
    let y0 = H
    let y1 = 0
    const pool = id === tagId('pool')
    const near = 28
    for (let y = 0; y < H; y++) {
      for (let x = Math.max(0, px - near); x < Math.min(W, px + near); x++) {
        const i = y * W + x
        if (pool ? !(B.pool[i] && !B.obj[i]) : B.hv[i] !== id) continue
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
    if (x1 < x0) return
    const { ctx, scale: S } = this
    ctx.save()
    ctx.textAlign = 'center'
    const nameFont = `${3.25 * S}px ${FONT}`
    const subFont = `${2.75 * S}px ${FONT}`
    ctx.font = subFont
    const lines = wrapText(ctx, label[1], 84 * S)
    ctx.font = nameFont
    const widest = Math.max(ctx.measureText(label[0]).width, ...lines.map((l) => ((ctx.font = subFont), ctx.measureText(l).width)))
    const half = widest / 2 + 3 * S
    const x = Math.max(half, Math.min(W * S - half, ((x0 + x1) / 2) * S))
    const height = (4 + lines.length * 4) * S
    const below = !label[2] && (y1 + 6.5) * S + height < H * S - 2 * S
    const y = below ? (y1 + 6.5) * S : (y0 - 3) * S - height + 3.25 * S
    ctx.font = nameFont
    ctx.fillStyle = 'rgba(233,227,212,0.95)'
    ctx.fillText(label[0], x, y)
    ctx.font = subFont
    ctx.fillStyle = 'rgba(154,151,140,0.95)'
    lines.forEach((l, k) => ctx.fillText(l, x, y + (4 + k * 3.6) * S))
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
      tag(`${m.name} · ${m.fsm.state} · e ${m.energy.toFixed(2)} · age ${Math.round((m.age / m.lifespan) * 100)}%`, sx * S, (sy - 11) * S, '#9ff5e4')
    }
    const D = w.deer
    const [dx, dy] = project(D.x, 0, D.z)
    tag(`${D.fsm.state} · thirst ${D.thirst.toFixed(2)}`, dx * S, (dy - 14) * S, '#e8c29a')
    ctx.textAlign = 'left'
    const wx = w.weather
    const asleep = PROPS.huts.map((_, i) => hutOccupancy(w, i)).reduce((a, b) => a + b, 0)
    const lines = [
      `weather ${wx.fsm.state} ${wx.manual ? '(manual)' : Math.ceil(wx.timer) + 's'}   pool ${w.poolLevel.toFixed(2)}`,
      `fire ${w.fire.fsm.state} · fuel ${w.fire.fuel.toFixed(2)} · heat ${w.fire.heat.toFixed(2)}   pile ${w.pile}   sticks ${w.sticks.length}`,
      `knight ${w.knight.fsm.state} · vigil ${Math.round((w.knight.vigil / w.knight.vigilLength) * 100)}%   frog ${w.frog.fsm.state}   crow ${w.crow.fsm.state}   village ${w.mush.length}   asleep ${asleep}   glowcaps ${w.memorials.length}`,
    ]
    lines.forEach((l, i) => tag(l, 4 * S, (6 + i * 4.5) * S, '#f08a3c'))
    ctx.restore()
  }
}
