/**
 * Software renderer. The scene is drawn into a 640x360 framebuffer that keeps,
 * per pixel: albedo, the world position it came from (so firelight falls on
 * the ground plane as a real circle), a depth for sorting, a normal (from the
 * sprite-normals port in normals.ts) and a planar reflection layer for the
 * pool. Emissives (fire, embers, glows) are depth-tested into a separate layer
 * that is composited on top and blurred into a soft bloom.
 *
 * Output is nearest-neighbour upscaled ("Sworcery" pixels). The ground gets
 * banded, noise-dithered firelight with shadows cast away from the fire;
 * objects get smooth light shaped by their normals.
 *
 * Depth and layering. Every pixel has a depth: the world z of the thing it belongs
 * to (where it stands on the ground; larger is nearer the camera), plus small
 * offsets to order the parts of one thing (a hut's cap +0.01 over its stem). The
 * sky is SKY_DEPTH and the bare ground GROUND_DEPTH.
 * The rules, so things never show through what stands in front of them:
 *
 *   1. Everything a pixel knows (colour, world position, normal, material,
 *      hover tag, glint...) is a channel of the Buf, and only put() writes
 *      objects and only putFx() writes emissives. Nothing keeps per-pixel
 *      state on the side.
 *   2. put() and putFx() depth-test first. A pixel that wins takes over the
 *      whole pixel: put() resets every channel the caller didn't give.
 *   3. putFx() always takes a depth: an ember says how far off it is, a ripple
 *      says GROUND_DEPTH, a shooting star SKY_DEPTH (so any object hides it).
 *      Only rain and labels draw over everything, and they do it after
 *      compositing, outside the buffer.
 *   4. Reflections in the pool are depth-tested the same way (rdep), so the
 *      nearest thing's reflection wins, not the last one drawn. They carry a
 *      normal, specular and tag too, so they are lit like what they mirror.
 *   5. Emissives have their own depth (fx.dep), and whether one shows is
 *      decided after everything is drawn (resolveFx), not when it's drawn: an
 *      ember drawn with the campfire is still hidden by someone who walks in
 *      front of the fire later. Their hover tags are resolved the same way.
 *   6. Objects are opaque. Emissives may be translucent (smoke, glows); a
 *      translucent emissive composites "over" by depth with what's already
 *      in its pixel (in front: over it; behind: under it), never replacing it.
 *      Light that should pile up (the front sheet of the flame) adds instead.
 *
 * Static scenery is also drawn back to front, which only decides ties.
 */
import { clamp, hash, hex, mix, rngFrom, vnoise, type Color } from './util'
import {
  C,
  EYES,
  H,
  HEARTHSTONES,
  HORIZON,
  RES,
  KNIGHT_GRAVE,
  N,
  PADS,
  PROPS,
  REEDS,
  SHROOMS,
  STONE_RING,
  TREES,
  BUSHES,
  type Bush,
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
  KEEPER_PAL,
  KEEPER_PAL_ELDER,
  KEEPER_SHINE,
  CROW_PAL,
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
import { LANTERN_POST, LOG, PACK, RELIC_ART, SKULL, SWORD, type PropArt } from './props'
import { WEIGHT, micro, shape, type Normal } from './materials'
import { settings, type View } from './settings'
import { walkable } from './sim/nav'
import { cullLights, gatherLight, groundGrain, prepareLights, type Light, type Prepared } from './lights'
import { BUDGET, ShadowMaps, SilhouetteRecorder, shadowAt } from './shadows'
import { WALKING, doorOpen, hutOccupancy, isElder, isMoving, isRaining, lightRadius, perchPos, type Mush, type World } from './sim'

/** What the bushes are called on hover. */
const BUSH_NAMES: [string, string][] = [
  ['a bramble', 'thorny, and full of small sounds'],
  ['a holly bush', 'its leaves catch the firelight'],
  ['a thicket', 'something is asleep in there'],
  ['a juniper', 'it smells of rain'],
]

/** A round lobe of foliage, in screen pixels. */
interface Lobe {
  cx: number
  cy: number
  rx: number
  ry: number
}
interface Foliage {
  x: number
  z: number
  bx: number
  by: number
  s: number
  dep: number
  base: Color
  speck: Color
  dim: Color
  seed: number
  arcs: boolean
  clipY?: number
  heightAt: (py: number) => number
}
/** The little glyphs scattered through foliage: hollow squares, corners, a pair of dots. */
const GLYPHS: [number, number][][] = [
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [0, 1],
    [3, 1],
    [0, 2],
    [3, 2],
    [0, 3],
    [1, 3],
    [2, 3],
    [3, 3],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ],
  [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  [
    [0, 0],
    [2, 0],
  ],
]
/** Screen spots the tree crowns keep clear of: the moon, and the top of the trigon stone. */
const MOON_AT = [170 * RES, 16 * RES]
const trigonAt = () => {
  const [x, y, s] = project(PROPS.trigon.x, 0, PROPS.trigon.z)
  return [x, y - Math.round(40 * s)]
}

/**
 * Composite an emissive into one pixel of a layer (straight alpha), over or under what's
 * there by depth, or (`add`, for light like flames) added to it. The pixel keeps the nearer
 * depth. Colours may go above 1 where light piles up; the output clamps.
 */
function over(
  R: Float32Array,
  G: Float32Array,
  Bl: Float32Array,
  A: Float32Array,
  BW: Float32Array,
  D: Float32Array,
  i: number,
  c: Color,
  a: number,
  bloom: number,
  depth: number,
  add = false,
) {
  const ea = A[i]
  if (add && ea > 0) {
    // light adds up: overlapping flames get hotter, whatever order they're drawn in
    const oa = Math.min(1, ea + a * (1 - ea))
    R[i] = (R[i] * ea + c[0] * a) / oa
    G[i] = (G[i] * ea + c[1] * a) / oa
    Bl[i] = (Bl[i] * ea + c[2] * a) / oa
    BW[i] = Math.max(BW[i], bloom)
    A[i] = oa
    if (depth > D[i]) D[i] = depth
    return
  }
  if (ea <= 0) {
    R[i] = c[0]
    G[i] = c[1]
    Bl[i] = c[2]
    A[i] = a
    BW[i] = bloom
    D[i] = depth
    return
  }
  const front = depth >= D[i]
  const ta = front ? a : ea
  const ba = front ? ea : a
  const out = ta + ba * (1 - ta)
  if (out <= 0) return
  const wt = ta / out
  const wb = 1 - wt
  R[i] = front ? c[0] * wt + R[i] * wb : R[i] * wt + c[0] * wb
  G[i] = front ? c[1] * wt + G[i] * wb : G[i] * wt + c[1] * wb
  Bl[i] = front ? c[2] * wt + Bl[i] * wb : Bl[i] * wt + c[2] * wb
  BW[i] = front ? bloom * wt + BW[i] * wb : BW[i] * wt + bloom * wb
  A[i] = out
  if (front) D[i] = depth
}

/** Depth of the empty sky: behind everything. */
const SKY_DEPTH = -1e9
/** Depth of the bare ground: anything standing on it is in front. */
const GROUND_DEPTH = -1e8

/** Light-culling tiles: 32x32 pixels. */
const TILE_BITS = 5
const TILES_X = Math.ceil(W / (1 << TILE_BITS))
const TILES = TILES_X * Math.ceil(H / (1 << TILE_BITS))

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
    // how much the pixel glints in the moonlight (foliage speckles)
    gl: f(),
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
    rdep: f(), // depth of whatever the reflection shows
    rnx: f(),
    rny: f(),
    rnz: f(),
    rsp: f(),
    rhv: new Int32Array(N),
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

/**
 * The triangle cut into the trigon stone, in screen pixels from its centre: a cut two pixels
 * wide whose sides step one pixel per row, and a thick base.
 */
const trigonPx = (() => {
  const out: [number, number][] = []
  for (let r = 0; r < 10; r++) for (let k = -r; k <= r; k++) if (r >= 8 || Math.abs(k) >= r - 1) out.push([k, r - 5])
  return out
})()

/** The face inside the carved triangle (for a slight recess and an inner glow). */
const TRIGON_INSIDE = (() => {
  const out: [number, number][] = []
  for (let r = 2; r < 8; r++) for (let k = -r + 2; k <= r - 2; k++) out.push([k, r - 5])
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

/**
 * A stick 11 pixels long and two thick, turned to any angle: [dx, dy, shade] where shade is
 * 0 bark, 1 the cut end, 2 the far end or underside.
 */
function stickPixels(angle: number): [number, number, number][] {
  const seen = new Set<string>()
  const ca = Math.cos(angle)
  const sa = -Math.sin(angle)
  const thick: [number, number] = Math.abs(ca) >= Math.abs(sa) ? [0, 1] : [1, 0]
  const out: [number, number, number][] = []
  for (let i = -5; i <= 5; i++) {
    const x = Math.round(ca * i)
    const y = Math.round(sa * i)
    for (const [dx, dy, under] of [
      [0, 0, 0],
      [thick[0], thick[1], 1],
    ]) {
      const key = `${x + dx},${y + dy}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push([x + dx, y + dy, i === 5 ? 1 : i === -5 || under ? 2 : 0])
    }
  }
  return out
}

/** The lantern's glass (and the flame in it), as [k, rows up, char] from the post's anchor. */
const LANTERN_PANES: [number, number, string][] = LANTERN_POST.rows.flatMap((row, r) =>
  [...row].flatMap((ch, c): [number, number, string][] => (ch === 'G' || ch === 'g' ? [[c - LANTERN_POST.anchor, LANTERN_POST.rows.length - 1 - r, ch]] : [])),
)

/** A tiny z, drifting up from a sleeping hut's chimney. */
const ZED: [number, number][] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [1, 1],
  [0, 2],
  [1, 2],
  [2, 2],
]

/** States in which shroomfolk sit down once they've arrived. */
const SITTING: string[] = ['visit', 'keep', 'farewell', 'tend']

/** Hut layout (layout pixels, relative to the hut's base): stem height, cap height, interior depth, chimney top. */
const HUT_PX = { stemH: 16, capY: 20, inside: -3.5, chimney: [9.5, 31] as const }
/** The doorway, in screen pixels (k columns from the hut's centre, r rows up): arched at the top. */
const isDoor = (k: number, r: number) => (k >= -9 && k <= -2 && r <= 15) || (r === 16 && k >= -8 && k <= -3) || (r === 17 && k >= -7 && k <= -4)
/** A round window with a cross of mullions. */
const inWindow = (k: number, r: number) => (k - 5.5) ** 2 + (r - 21) ** 2 <= 11
const isWindow = (k: number, r: number) => inWindow(k, r) && k !== 5 && r !== 21
const near = (f: (k: number, r: number) => boolean, k: number, r: number) =>
  !f(k, r) && r >= 0 && [-1, 0, 1].some((dk) => [-1, 0, 1].some((dr) => f(k + dk, r + dr)))
const isDoorFrame = (k: number, r: number) => near(isDoor, k, r) || (inWindow(k, r) && !isWindow(k, r)) || near(inWindow, k, r)
const DOOR_PX: [number, number][] = []
const WINDOW_PX: [number, number][] = []
for (let r = 0; r < 30; r++) {
  for (let k = -12; k <= 12; k++) {
    if (isDoor(k, r)) DOOR_PX.push([k, r])
    if (isWindow(k, r)) WINDOW_PX.push([k, r])
  }
}

/**
 * The antler crown carved into the tall hearthstone: the same shape as the relic in the fire,
 * three tines over a band and a stem. Screen-pixel offsets from the carving's centre.
 */
const CROWN_PX: [number, number][] = (() => {
  const rows = [
    'xx...xx...xx',
    'xx...xx...xx',
    'xx...xx...xx',
    '.xx..xx..xx.',
    '..xxxxxxxx..',
    '...xxxxxx...',
    '.....xx.....',
    '.....xx.....',
    '.....xx.....',
    '.....xx.....',
  ]
  const out: [number, number][] = []
  rows.forEach((row, r) => [...row].forEach((ch, c) => ch === 'x' && out.push([c - 6, r - 5])))
  return out
})()

/** The relic planted in the ashes (art in props.ts), and what the hover says about it. */
const RELICS: Record<Relic, { rows: Rows; pal: Palette; name: string; sub: string }> = {
  crook: { ...RELIC_ART.crook, name: 'the kindling crook', sub: 'its coil is warm to the touch' },
  key: { ...RELIC_ART.key, name: 'the ember key', sub: 'nobody remembers the door' },
  antler: { ...RELIC_ART.antler, name: 'the old crown', sub: "the forest's gift to the first fire" },
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

/** How long each stage of the last frame took, in ms. */
export interface Timings {
  draw: number
  compose: number
  present: number
}

/** Everything known about one pixel of the last frame (the editor's inspector). */
export interface PixelInfo {
  x: number
  y: number
  what: 'sky' | 'ground' | 'object'
  owner: string | null
  depth: number
  world: [number, number, number]
  normal: [number, number, number] | null
  albedo: Color
  material: { micro: number; weight: number; spec: number; glint: number }
  emissive: { a: number; color: Color; depth: number; bloom: number } | null
  pool: boolean
  out: Color
  lights: { name: string; kind: string; amount: number; color: Color }[]
}

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private scale = 4
  private tileBoxes = new Float32Array(TILES * 6)
  /** Every shadow caster's silhouette, and each light's shadow map (shadows.ts). */
  readonly shadows = new ShadowMaps()
  /** The caster being drawn right now: put() records its pixels. */
  private recorder: SilhouetteRecorder | null = null
  private prepared: Prepared[] = []
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
    dep: new Float32Array(N),
    rdep: new Float32Array(N),
    hv: new Int32Array(N),
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
    public relic: Relic = 'antler',
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

  /** Stage timings of the last frame. */
  timings: Timings = { draw: 0, compose: 0, present: 0 }
  /** The lights of the last frame, as gathered (after tuning). */
  lastLights: Light[] = []

  render(w: World) {
    const t0 = performance.now()
    if (Math.abs(w.poolLevel - this.bakedLevel) > 0.035) this.buildStatic(w.poolLevel)
    this.drawDynamic(w)
    this.resolveFx()
    const t1 = performance.now()
    this.compose(w)
    const t2 = performance.now()
    this.present(w)
    const t3 = performance.now()
    this.timings = { draw: t1 - t0, compose: t2 - t1, present: t3 - t2 }
  }

  /** Rebuild the static layer (after editing what's in it). */
  rebuildStatic() {
    this.bakedLevel = -1
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
    glint = 0,
  ): boolean {
    px = Math.round(px)
    py = Math.round(py)
    if (this.recorder) this.recorder.add(px, py)
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
    B.gl[i] = glint
    B.hv[i] = this.tag
    if (noRefl) return true
    // mirror the pixel about its base line into the pool
    const ry = Math.round(2 * baseY - py)
    if (ry < 0 || ry >= H) return true
    const j = ry * W + px
    if (B.pool[j] && !B.obj[j] && depth >= B.rdep[j]) {
      B.rdep[j] = depth
      B.rr[j] = c[0]
      B.rg[j] = c[1]
      B.rb[j] = c[2]
      B.ra[j] = 1
      B.rkx[j] = wx
      B.rkz[j] = wz
      B.rky[j] = wy
      // the mirror flips the normal's vertical component
      B.rnx[j] = nrm ? nrm[0] : 0
      B.rny[j] = nrm ? -nrm[1] : 0
      B.rnz[j] = nrm ? nrm[2] : 0
      B.rsp[j] = spec
      B.rhv[j] = this.tag
    }
    return true
  }

  /**
   * Write an emissive pixel (rules 3, 5, 6 at the top of the file). It's dropped if an
   * object already drawn is nearer; otherwise it composites over or under what's in the
   * emissive layer by depth. Whether it finally shows is settled in resolveFx().
   */
  private putFx(px: number, py: number, c: Color, a: number, baseY: number | undefined, depth: number, bloom = 1, add = false) {
    const fx = this.fx
    px = Math.round(px)
    py = Math.round(py)
    if (px < 0 || px >= W || py < 0 || py >= H) return
    const i = py * W + px
    if (depth < this.fb.dep[i]) return
    if (depth >= fx.dep[i] && this.tag) fx.hv[i] = this.tag
    over(fx.r, fx.g, fx.b, fx.a, fx.bw, fx.dep, i, c, a, bloom, depth, add)
    if (baseY === undefined) return
    const ry = Math.round(2 * baseY - py)
    if (ry < 0 || ry >= H) return
    const j = ry * W + px
    if (this.fb.pool[j] && !this.fb.obj[j]) over(fx.rr, fx.rg, fx.rb, fx.ra, fx.rbw, fx.rdep, j, c, a, bloom, depth, add)
  }

  /**
   * Settle the emissive layer once everything is drawn (rule 5): an emissive behind the
   * object in its pixel is hidden, and so is a reflected one behind the reflected object
   * (or under something standing in the water). Visible emissives own the pixel's hover tag.
   */
  private resolveFx() {
    const B = this.fb
    const fx = this.fx
    for (let i = 0; i < N; i++) {
      if (fx.a[i] > 0) {
        if (fx.dep[i] < B.dep[i]) fx.a[i] = 0
        else if (fx.hv[i]) B.hv[i] = fx.hv[i]
      }
      if (fx.ra[i] > 0 && (B.obj[i] || (B.ra[i] && fx.rdep[i] < B.rdep[i]))) fx.ra[i] = 0
    }
  }

  /** Draw a char-grid sprite standing at world (wx, wz), with an automatic dark outline and generated normals. */
  /**
   * Draw prop art (props.ts) standing at world (wx, wz), or with its anchor at screen `at`.
   * Each column is lit at its own world x; normals come from the art's parts.
   */
  private drawArt(B: Buf, art: PropArt, wx: number, wz: number, opts: { dep?: number; at?: [number, number]; noRefl?: boolean } = {}) {
    this.casting(B, wx, wz, () => this.drawArtNow(B, art, wx, wz, opts))
  }

  private drawArtNow(B: Buf, art: PropArt, wx: number, wz: number, opts: { dep?: number; at?: [number, number]; noRefl?: boolean }) {
    const [px0, py0, s] = project(wx, 0, wz)
    const [bx, by] = opts.at ?? [px0, py0]
    const h = art.rows.length
    const nm = partNormals(art.rows, art.parts)
    const dep = opts.dep ?? wz
    this.region++
    art.rows.forEach((row, r) =>
      [...row].forEach((ch, c) => {
        if (ch === '.') return
        const k = c - art.anchor
        const src = (r + 2) * nm.w + c + 2
        const nrm: Normal = [nm.nx[src], nm.ny[src], nm.nz[src]]
        this.put(B, bx + k, by - (h - 1 - r), art.pal[ch], wx + k / s, wz, (h - 1 - r) / RES, by, dep, opts.noRefl ?? false, nrm, 0, 0, art.shine?.[ch] ?? 0)
      }),
    )
  }

  /**
   * Everything `fn` draws is one shadow caster standing at world (x, z): its pixels become the
   * caster's silhouette (shadows.ts). Nested calls join the outer caster.
   */
  private casting<T>(B: Buf, x: number, z: number, fn: () => T): T {
    if (this.recorder) return fn()
    const [bx, by, s] = project(x, 0, z)
    this.recorder = new SilhouetteRecorder(x, z, bx, by, s, B === this.st ? 2 : 4)
    try {
      return fn()
    } finally {
      const sil = this.recorder.done()
      this.recorder = null
      if (sil) (B === this.st ? this.shadows.statics : this.shadows.dynamics).push(sil)
    }
  }

  private sprite(...args: Parameters<Renderer['spriteNow']>) {
    const [B, , wx, wz] = args
    return this.casting(B, wx, wz, () => this.spriteNow(...args))
  }

  private spriteNow(
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
    const lift = (opts.lift ?? 0) * RES
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
          this.put(B, bx - (w >> 1) + c, py, C.outline, wx, wz, (h - r + lift) / RES, by, dep - 0.01)
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
        if (this.put(B, px, py, pal[ch], wx, wz, (h - r + lift) / RES, by, dep, false, nrm, 0, 0, opts.shine?.[ch] ?? 0) && ch === opts.glowChar)
          glow.push([px, py])
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

  /**
   * Foliage in the Sword & Sworcery manner: one flat silhouette (the union of round lobes),
   * pale speckles that gather toward the top of each lobe, dotted arcs tracing the lobes'
   * upper rims (bushes), and a few tiny square glyphs. Later lobes sit in front of earlier
   * ones. Normals are soft domes, so firelight still finds the form.
   */
  private foliage(B: Buf, lobes: Lobe[], f: Foliage) {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const l of lobes) {
      x0 = Math.min(x0, Math.floor(l.cx - l.rx))
      x1 = Math.max(x1, Math.ceil(l.cx + l.rx))
      y0 = Math.min(y0, Math.floor(l.cy - l.ry))
      y1 = Math.min(f.clipY ?? Infinity, Math.max(y1, Math.ceil(l.cy + l.ry)))
    }
    if (x1 < 0 || x0 >= W || y1 < 0 || y0 >= H) return
    const bw = x1 - x0 + 1
    const bh = y1 - y0 + 1
    const owner = new Int16Array(bw * bh).fill(-1)
    // each lobe's rim is scalloped: little bumps a couple of pixels deep, like clumps of leaves
    const bumps = lobes.map((l, li) => ({ k: Math.max(6, Math.min(16, Math.round(l.rx / 3))), ph: hash(f.seed, li) * 6.28, amp: Math.min(0.09, 2.2 / l.rx) }))
    const rim = (li: number, u: number, v: number) => 1 - bumps[li].amp + bumps[li].amp * Math.sin(Math.atan2(v, u) * bumps[li].k + bumps[li].ph)
    lobes.forEach((l, li) => {
      for (let py = Math.max(y0, Math.floor(l.cy - l.ry)); py <= Math.min(y1, l.cy + l.ry); py++) {
        for (let px = Math.max(x0, Math.floor(l.cx - l.rx)); px <= Math.min(x1, l.cx + l.rx); px++) {
          const u = (px - l.cx) / l.rx
          const v = (py - l.cy) / l.ry
          if (Math.hypot(u, v) <= rim(li, u, v)) owner[(py - y0) * bw + px - x0] = li
        }
      }
    })
    const at = (px: number, py: number) => (px < x0 || px > x1 || py < y0 || py > y1 ? -1 : owner[(py - y0) * bw + px - x0])
    // where each pixel sits within its lobe: u, v in -1..1 and how many pixels in from the rim
    const place = (li: number, px: number, py: number) => {
      const l = lobes[li]
      const u = (px - l.cx) / l.rx
      const v = (py - l.cy) / l.ry
      return { u, v, edge: (rim(li, u, v) - Math.hypot(u, v)) * Math.min(l.rx, l.ry) }
    }
    const col = new Map<number, Color>()
    // a few glyphs: tiny hollow squares and corners, high in the lobes
    const rng = rngFrom(f.seed)
    const area = bw * bh
    for (let g = 0; g < Math.round(area / 420); g++) {
      const px = x0 + Math.floor(rng() * bw)
      const py = y0 + Math.floor(rng() * bh)
      const li = at(px, py)
      if (li < 0) continue
      const { v, edge } = place(li, px, py)
      if (edge < 4 || v > 0.2) continue
      for (const [dx, dy] of GLYPHS[Math.floor(rng() * GLYPHS.length)]) if (at(px + dx, py + dy) === li) col.set((py + dy) * W + px + dx, f.speck)
    }
    this.region++
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const li = at(px, py)
        if (li < 0) continue
        const { u, v, edge } = place(li, px, py)
        let c = col.get(py * W + px) ?? f.base
        if (c === f.base) {
          const top = clamp(0.15 - v * 0.85)
          const n = hash(px * 7 + f.seed, py * 13)
          if (f.arcs && v < 0.2 && edge >= 1.5 && edge < 2.5 && ((px + py) & 1) === 0)
            c = f.speck // the dotted rim
          else if (f.arcs && v < 0 && edge >= 4.5 && edge < 5.5 && n < 0.45) c = f.dim
          else if (edge > 1 && n < 0.012 + 0.11 * top) c = hash(py, px * 3 + f.seed) < 0.4 ? f.speck : f.dim
        }
        const d = shape.dome(u, v)
        const l = Math.hypot(d[0] * 0.45, d[1] * 0.45 + 0.12, 1)
        const nrm: Normal = [(d[0] * 0.45) / l, (d[1] * 0.45 + 0.12) / l, 1 / l]
        this.put(
          B,
          px,
          py,
          c,
          f.x + (px - f.bx) / f.s,
          f.z,
          f.heightAt(py),
          f.by,
          f.dep + li * 0.0004,
          false,
          nrm,
          0,
          0,
          0,
          c === f.speck ? 1 : c === f.dim ? 0.4 : 0,
        )
      }
    }
  }

  /**
   * A tree: a straight flat trunk with a thin moonlit edge, and a crown of a few big lobes
   * (sometimes a lower clump on a side branch). Crowns keep clear of the moon and, for trees
   * standing in front of it, the trigon stone.
   */
  private drawTree(B: Buf, t: Tree) {
    const [bx, by, s] = project(t.x, 0, t.z)
    const ys = by - project(t.x, 1, t.z)[1]
    const h = 95 * t.h
    const tw = Math.max(2, Math.round(1.8 * t.w * s))
    const rng = rngFrom(t.seed)
    const R = Math.max(6, (7 + rng() * 5) * t.w * s)
    const cx = bx + (rng() - 0.5) * R * 0.3
    const cy = by - h * (0.48 + rng() * 0.22) * ys
    const lobes: Lobe[] = []
    const side = rng() < 0.5 ? -1 : 1
    let branch: Lobe | null = null
    if (rng() < 0.45) {
      // a lower clump on a branch
      const br = R * (0.45 + rng() * 0.15)
      branch = { cx: bx + side * (R * 0.7 + br * 0.4), cy: cy + R * (1.3 + rng() * 0.6), rx: br, ry: br * 1.05 }
      lobes.push(branch)
    }
    for (const k of [-1, 1]) {
      const r = R * (0.5 + rng() * 0.2)
      lobes.push({ cx: cx + k * R * (0.55 + rng() * 0.25), cy: cy + R * (0.15 + rng() * 0.35), rx: r, ry: r * 1.05 })
    }
    lobes.push({ cx, cy, rx: R, ry: R * 1.08 })
    lobes.push({ cx: cx + (rng() - 0.5) * R * 0.5, cy: cy - R * (0.55 + rng() * 0.2), rx: R * 0.62, ry: R * 0.62 })
    // keep the moon and the trigon in view
    const TRIGON_AT = trigonAt()
    const clearOf = (l: Lobe) => {
      const moon = Math.hypot(l.cx - MOON_AT[0], l.cy - MOON_AT[1]) - l.rx < 20
      const trig = t.z > PROPS.trigon.z && Math.abs(l.cx - TRIGON_AT[0]) < l.rx + 20 && l.cy + l.ry > TRIGON_AT[1] - 6
      return !moon && !trig
    }
    for (const l of lobes) for (let k = 0; k < 6 && !clearOf(l); k++) ((l.rx *= 0.75), (l.ry *= 0.75))
    const crown = lobes.filter((l) => clearOf(l) && l.rx >= 3)
    // the trunk, up into the crown
    const trunkTop = Math.round(cy)
    this.region++
    for (let py = by; py >= trunkTop; py--) {
      for (let k = 0; k < tw; k++) {
        const u = tw > 1 ? ((k + 0.5) / tw) * 2 - 1 : 0
        const px = bx - (tw >> 1) + k
        this.put(B, px, py, k === 0 && tw > 2 ? C.trunkRim : C.trunk, t.x + u, t.z, (by - py) / ys, by, t.z, false, shape.cylinder(u * 0.6))
      }
    }
    if (tw >= 2) {
      this.put(B, bx - (tw >> 1) - 1, by, C.trunk, t.x, t.z, 0, by, t.z, false, shape.cylinder(-0.9))
      this.put(B, bx + tw - (tw >> 1), by, C.trunk, t.x, t.z, 0, by, t.z, false, shape.cylinder(0.9))
    }
    if (branch && crown.includes(branch)) {
      // the branch: from the trunk out to its clump
      const y0 = Math.round(branch.cy + branch.ry * 0.3)
      const x1 = Math.round(branch.cx)
      const steps = Math.abs(x1 - bx)
      for (let i = 0; i <= steps; i++) {
        const px = bx + Math.sign(x1 - bx) * i
        const py = Math.round(y0 + (i / (steps || 1)) * -branch.ry * 0.3 + (1 - i / (steps || 1)) * R * 0.25)
        for (let j = 0; j < Math.max(1, tw >> 2); j++) this.put(B, px, py + j, C.trunk, t.x, t.z, (by - py) / ys, by, t.z, false, shape.flat)
      }
    }
    this.foliage(B, crown, {
      x: t.x,
      z: t.z,
      bx,
      by,
      s,
      dep: t.z + 0.002,
      base: t.tone > 0.5 ? C.canopy : C.canopyD,
      speck: C.canopyRim,
      dim: C.canopyHi,
      seed: t.seed,
      arcs: false,
      heightAt: (py) => (by - py) / ys,
    })
  }

  /** A bush: a mound of overlapping lobes sitting on the ground, dotted along their rims. */
  private drawBush(B: Buf, b: Bush) {
    const [bx, by, s] = project(b.x, 0, b.z)
    const rng = rngFrom(b.seed)
    const wd = b.w * s
    const ht = b.h * s
    const lobes: Lobe[] = []
    // the top of the mound first (behind), then the lower lobes in front of it
    lobes.push({ cx: bx + (rng() - 0.5) * wd * 0.3, cy: by - ht * 0.95, rx: wd * 0.5, ry: ht * 0.62 })
    for (let k = 0; k < b.lobes; k++) {
      const f = b.lobes > 1 ? k / (b.lobes - 1) - 0.5 : 0
      const r = wd * (0.42 + rng() * 0.16) * (1 - Math.abs(f) * 0.5)
      lobes.push({ cx: bx + f * wd * 1.15 + (rng() - 0.5) * wd * 0.12, cy: by - r * (0.55 + rng() * 0.2), rx: r, ry: r * 0.85 })
    }
    this.foliage(B, lobes, {
      x: b.x,
      z: b.z,
      bx,
      by,
      s,
      dep: b.z,
      base: C.bush,
      speck: C.canopyRim,
      dim: C.canopyHi,
      seed: b.seed,
      arcs: true,
      clipY: by,
      heightAt: (py) => (by - py) / s,
    })
  }

  /**
   * A big mushroom house: a fibrous cylindrical stem and a cap with a domed top,
   * a lip and a gilled underside. The doorway is drawn as interior *behind* the
   * walls (depth hut.z + HUT_PX.inside), so shroomfolk walking in are hidden by
   * the walls but stay visible through the open door. The door itself, the lit
   * window and the interior glow are dynamic. The stem and cap are laid out in
   * layout pixels; the door, window, shading and texture are full resolution.
   */
  private drawHut(B: Buf, hut: Point) {
    const [bx, by, s] = project(hut.x, 0, hut.z)
    const dep = hut.z
    // light each column at its own world x, so the side facing the fire is the lit one
    const put = (px: number, py: number, c: Color, d: number, n: Normal, mh: number, mw: number) =>
      this.put(B, px, py, c, hut.x + (px - bx) / s, hut.z, (by - py) / RES, by, d, false, n, mh, mw)
    this.region++
    for (let r = 0; r < HUT_PX.stemH * RES; r++) {
      const flare = r < 2 * RES ? 1 : 0
      for (let k = (-7 - flare) * RES; k < (7 + flare) * RES; k++) {
        const u = (k + 0.5) / ((7 + flare) * RES)
        const px = bx + k
        const py = by - r
        if (isDoor(k, r)) {
          put(px, py, C.hutInside, dep + HUT_PX.inside, shape.flat, 0, 0)
          continue
        }
        let c = k >= 4 * RES ? C.hutStemD : k < -5 * RES ? C.hutStemHi : C.hutStem
        if (hash(k * 13, r * 5 + hut.x) < 0.12) c = C.hutStemD // fibres
        if (isDoorFrame(k, r)) c = C.hutFrame
        if (isWindow(k, r)) c = C.door
        // the frame stands proud of the wall; the window is set in
        const mh = isDoorFrame(k, r) ? 0.8 : isWindow(k, r) ? -0.8 : micro.fibre(px, py, hut.x)
        put(px, py, c, dep, shape.cylinder(u), mh, isDoorFrame(k, r) || isWindow(k, r) ? 0.8 : WEIGHT.stem)
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
      by - HUT_PX.capY * RES,
      16 * RES,
      8 * RES,
    )
    this.region++
    for (let r = 25 * RES; r < 31 * RES; r++) {
      for (let k = 9 * RES; k < 11 * RES; k++) {
        const left = k < 10 * RES
        put(
          bx + k,
          by - r,
          r >= 30 * RES ? C.stoneD : left ? C.stone : C.stoneD,
          dep + 0.02,
          shape.cylinder(left ? -0.5 : 0.5),
          micro.stone(bx + k, by - r, 3),
          WEIGHT.stone,
        )
      }
    }
  }

  /** The knight's own sword, planted point-down beside him. */
  private drawSword(B: Buf, p: Point) {
    this.drawArt(B, SWORD, p.x, p.z)
  }

  private drawPack(B: Buf, p: Point) {
    this.drawArt(B, PACK, p.x, p.z)
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
      3 * RES,
      RES,
    )
    // a rusted sword, tilted differently on each grave: a two-pixel blade, crossguard, grip, pommel
    const tilt = [-1, 0, 1][i % 3]
    const lean = (r: number) => Math.round((tilt * r) / 8)
    const put = (x: number, r: number, c: Color, n: Normal, mh = 0, mw = 0) =>
      this.put(B, bx + x, by - r, c, g.x, g.z, r / RES, by, dep + 0.1, false, n, mh, mw)
    this.region++
    for (let r = 2; r < 22; r++) {
      const rusty = hash(r * 3, i * 7) < 0.22
      put(lean(r), r, rusty ? C.rust : C.blade, [-0.5, 0, 0.87], rusty ? -0.5 : 0, 0.5)
      put(lean(r) + 1, r, rusty || hash(r, i) < 0.3 ? C.rust : C.bladeD, [0.5, 0, 0.87], 0, 0.5)
    }
    const tk = lean(22)
    for (let k = -4; k <= 5; k++) put(tk + k, 22, C.rust, [0, 0.5, 0.87])
    for (let k = -3; k <= 4; k++) put(tk + k, 23, k === -3 || k === 4 ? C.rust : C.grip, [0, -0.3, 0.95])
    for (let r = 24; r < 27; r++) put(tk + (r === 25 ? 1 : 0), r, C.grip, shape.cylinder(0))
    put(tk, 27, C.rust, [0, 0.7, 0.7])
    put(tk + 1, 27, C.rust, [0, 0.7, 0.7])
    if (g.helm) {
      this.region++
      disc(
        (px, py, u, v) => this.put(B, px, py, v < 0 && u < 0 ? C.stoneHi : C.helm, g.x, g.z, 14 - v, by, dep + 0.2, false, shape.dome(u, v), 0, WEIGHT.metal),
        bx + tk,
        by - 30,
        2 * RES,
        2 * RES,
      )
      for (let k = 1; k <= 3; k++) this.put(B, bx + tk + k, by - 30, C.door, g.x, g.z, 15, by, dep + 0.3, false, shape.flat) // visor slit
      this.put(B, bx + tk + 2, by - 28, C.door, g.x, g.z, 14, by, dep + 0.3, false, shape.flat)
    }
  }

  private drawLanternPost(B: Buf, p: Point) {
    this.drawArt(B, LANTERN_POST, p.x, p.z)
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
    const carved = new Set(trigonPx.map(([dx, dy]) => `${dx},${dy}`))
    const inside = new Set(TRIGON_INSIDE.map(([dx, dy]) => `${dx},${dy}`))
    this.region++
    for (let r = 0; r < hgt; r++) {
      const taper = r > hgt - 4 * RES ? RES : 0
      for (let k = -wid + taper; k <= wid - taper; k++) {
        const px = bx + k
        const py = by - r
        let c = k < -wid + 2 * RES ? C.stoneHi : k > wid - 2 * RES ? C.stoneD : C.stone
        if (hash(k * 7, r * 3) < 0.08) c = C.stoneD
        if (hash(k, r) < 0.05 && r < hgt * 0.4) c = C.moss
        let mh = micro.stone(px, py, 17)
        const cell = `${px - bx},${py - hy}`
        if (carved.has(cell)) {
          c = C.stoneD
          mh = -2.2 // the cut
        } else if (inside.has(cell)) mh -= 0.5 // the face inside the triangle sits a little lower
        this.put(B, px, py, c, p.x + k / s, p.z, r / s, by, p.z, false, shape.slab(k, wid, r, hgt), mh, WEIGHT.carving)
      }
    }
  }

  /** A ring of stones around the fire: grainy domes. */
  private drawStoneRing(B: Buf) {
    for (const st of STONE_RING)
      this.casting(B, st.x, st.z, () => {
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
          sy - Math.floor((st.h * RES) / 2),
          st.w * RES,
          Math.max(1, st.h) * RES,
        )
      })
  }

  /** Three old standing stones behind the fire: bevelled, pitted, mossy at the foot. */
  private drawHearthstones(B: Buf) {
    HEARTHSTONES.forEach((hs, idx) => this.casting(B, hs.x, hs.z, () => this.drawHearthstone(B, hs, idx)))
  }

  private drawHearthstone(B: Buf, hs: (typeof HEARTHSTONES)[number], idx: number) {
    {
      const prevTag = this.tag
      this.tag = tagId(`hearth${idx}`)
      const [bx, by, s] = project(hs.x, 0, hs.z)
      const hgt = Math.round(hs.h * s * 0.75)
      const cy = by - Math.round(hgt * 0.55)
      const carving = new Set(CROWN_PX.map(([dx, dy]) => `${dx},${dy}`))
      this.region++
      for (let r = 0; r < hgt; r++) {
        const lean = Math.round((hs.lean * RES * r) / hgt)
        const half = (r > hgt - 3 * RES ? hs.w - 1 : hs.w) * RES
        for (let k = -half; k <= half - 1; k++) {
          const px = bx + k + lean
          const py = by - r
          let c = k < -half + RES ? C.menhirHi : k >= half - RES ? C.menhirD : C.menhir
          if (hash(k * 5 + hs.x, r * 3) < 0.1) c = C.menhirD
          let mh = micro.stone(px, py, hs.x)
          if (r < 3 * RES && hash(k, r + hs.z) < 0.5) {
            c = C.moss2
            mh += 0.6 // moss sits proud
          }
          if (hs.carved && carving.has(`${px - bx},${py - cy}`)) {
            c = C.menhirD
            mh = -2 // the carved crown
          }
          this.put(B, px, py, c, hs.x + k / s, hs.z, r / s, by, hs.z, false, shape.slab(k, half, r, hgt), mh, WEIGHT.stone)
        }
      }
      this.tag = prevTag
    }
  }

  private buildStatic(lvl: number) {
    const B = this.st
    this.bakedLevel = lvl
    for (const k in B) (B[k as keyof Buf] as Float32Array).fill(0)
    B.dep.fill(SKY_DEPTH)
    B.rdep.fill(SKY_DEPTH)
    this.shadows.statics = []
    this.shadows.version++
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
      const t = clamp(y / (72 * RES))
      const c = mix(hex('#04050a'), hex('#1b2535'), t * t)
      for (let x = 0; x < W; x++) setBg(x, y, c)
    }
    disc((x, y) => setBg(x, y, hex('#e9e3d4')), 170 * RES, 16 * RES, 7 * RES, 7 * RES)
    disc((x, y) => setBg(x, y, hex('#05070c')), 173 * RES, 14 * RES, 7 * RES, 7 * RES)
    for (let x = 0; x < W; x++) {
      const top = HORIZON - (6 + vnoise((x / RES) * 0.03, 4) * 16) * RES
      for (let y = top | 0; y <= HORIZON; y++) setBg(x, y, mix(hex('#121a27'), hex('#1b2535'), (y - top) / (22 * RES)))
    }
    const r = rngFrom(3)
    for (let i = 0; i < 40; i++) {
      const x = (r() * W) | 0
      const top = ((r() * 40) | 0) * RES
      const w = (1 + ((r() * 2) | 0)) * RES
      const col = hex('#0e1522')
      if (x > 126 * RES && x < 194 * RES) continue
      for (let y = top; y <= HORIZON; y++) for (let k = 0; k < w; k++) setBg(x + k, y, col)
      for (let j = 0; j < 4; j++) {
        const cy = top + (j * 7 + r() * 4) * RES
        const rad = ((2 + r() * 3) | 0) * RES
        disc((px, py) => setBg(px, py, col), x, cy | 0, rad, rad + RES)
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
        B.dep[i] = GROUND_DEPTH
        if (inPool(gx, gz, lvl)) B.pool[i] = 1
      }
    }
    // lily pads lie flat on the water: they block reflections and cast none
    for (const [x, z] of PADS) {
      if (!inPool(x, z, lvl)) continue
      const [sx, sy] = project(x, 0, z)
      disc(
        (px, py, u, v) => {
          if (u > 0.25 && Math.abs(v) < 0.5) return // the notch
          this.put(B, px, py, v > 0.5 || u > 0.8 ? C.frogD : C.pad, x, z, 0.2, sy, z - 0.3, true)
        },
        sx,
        sy - 1,
        5,
        2,
      )
    }
    // everything that stands up, back to front
    const statics: { z: number; draw: () => void }[] = [
      ...TREES.map((t, i) => ({ z: t.z, draw: () => this.tagged(`tree${i}`, () => this.casting(B, t.x, t.z, () => this.drawTree(B, t))) })),
      ...BUSHES.map((b, i) => ({ z: b.z, draw: () => this.tagged(`bush${i}`, () => this.casting(B, b.x, b.z, () => this.drawBush(B, b))) })),
      ...PROPS.huts.map((h, i) => ({ z: h.z, draw: () => this.tagged(`hut${i}`, () => this.casting(B, h.x, h.z, () => this.drawHut(B, h))) })),
      ...PROPS.graves.map((g, i) => ({ z: g.z, draw: () => this.tagged('grove', () => this.casting(B, g.x, g.z, () => this.drawGrave(B, g, i))) })),
      { z: PROPS.lantern.z, draw: () => this.tagged('lantern', () => this.drawLanternPost(B, PROPS.lantern)) },
      { z: PROPS.trigon.z, draw: () => this.tagged('trigon', () => this.casting(B, PROPS.trigon.x, PROPS.trigon.z, () => this.drawTrigon(B, PROPS.trigon))) },
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
        for (let j = 0; j < hgt * RES; j++) this.put(B, sx + (k * 2 - t.n) * RES, sy - j, C.tuft, t.x, t.z, j / RES, sy, t.z)
      }
      if (t.flower) {
        for (let j = 0; j < 5; j++) this.put(B, sx, sy - j, C.tuft, t.x, t.z, j / RES, sy, t.z)
        for (const [dx, dy] of [
          [0, -7],
          [-1, -6],
          [1, -6],
          [0, -5],
        ])
          this.put(B, sx + dx, sy + dy, C.flower, t.x, t.z, 3, sy, t.z)
      }
    }
    for (const rd of REEDS) {
      if (inPool(rd.x, rd.z, lvl * 0.98)) continue
      const [sx, sy] = project(rd.x, 0, rd.z)
      for (let j = 0; j < rd.h * RES; j++) this.put(B, sx, sy - j, j >= (rd.h - 1) * RES ? C.reedHi : C.reed, rd.x, rd.z, j / RES, sy, rd.z)
      if (rd.s < 0.4) {
        for (let j = 1; j <= 5; j++) for (let k = 0; k < 2; k++) this.put(B, sx + k, sy - rd.h * RES + j, C.cattail, rd.x, rd.z, rd.h, sy, rd.z)
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
    disc(
      (px, py) => this.put(B, px, py, hash(px * 7, py * 3) < 0.35 ? C.ashD : C.ash, (px - fx) / (1.35 * RES), (py - fy) / (0.6 * RES), 0.1, fy, -0.6, true),
      fx,
      fy,
      7 * RES,
      2 * RES,
    )
    // a few bones scattered in the ash, and a little skull at its edge
    for (const [dx, dy] of [
      [-12, 0],
      [9, 2],
      [-6, 2],
      [11, -2],
    ]) {
      for (let k = 0; k < 4; k++) this.put(B, fx + dx + k, fy + dy, k === 0 || k === 3 ? C.boneD : C.bone, (dx + k) / 2.7, dy, 0.3, fy, -0.5, true)
      this.put(B, fx + dx, fy + dy - 1, C.bone, dx / 2.7, dy, 0.4, fy, -0.5, true)
      this.put(B, fx + dx + 3, fy + dy + 1, C.boneD, (dx + 3) / 2.7, dy, 0.2, fy, -0.5, true)
    }
    this.drawArt(B, SKULL, -3.5, 0, { at: [fx - 9, fy + 1], dep: -0.4 })
    // logs leaning into the middle, charred toward the heart of the fire
    const logs: [number, number, number, number][] = [
      [-14, 2, -2, -6],
      [14, 2, 2, -6],
      [-8, 4, 2, -4],
      [8, 4, -2, -4],
    ]
    for (const [x0, y0, x1, y1] of logs) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const px = Math.round(x0 + (x1 - x0) * t)
        const py = Math.round(y0 + (y1 - y0) * t)
        for (let j = 0; j < 2; j++) {
          const c = t > 0.6 ? C.char : t > 0.3 || j === 1 ? C.log : C.logLit
          this.put(B, fx + px, fy + py + j, c, px / 2.7, 0.2, (-py - j) / RES + 1, fy, 0.05)
          if (t > 0.55 && hash(px * 3 + j, py + ((w.t * 3) | 0)) < 0.5) this.putFx(fx + px, fy + py + j, GLOW.ember, 0.4 + 0.6 * heat, fy, 0.06, 0.4)
        }
      }
    }
    return [fx, fy - 3 * RES]
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
      this.drawArt(B, LOG, p.x + ox / 1.35, p.z, { at: [bx + ox * RES, by - oy * RES], dep: p.z + 0.001 * oy })
    }
  }

  /** A stick: lying flat, carried, or tumbling through the air (`height` above the ground, `angle` of its spin). */
  private drawStick(B: Buf, wx: number, wz: number, lift: number, angle = 0, height = 0) {
    const [bx, by] = project(wx, height, wz)
    const [, gy] = project(wx, 0, wz)
    const cy = by - Math.round(lift * RES) - 1
    for (const [dx, dy, shade] of stickPixels(angle)) {
      const c = shade === 1 ? C.logEnd : shade === 2 ? C.stickD : C.stick
      this.put(B, bx + dx, cy + dy, c, wx, wz, height + lift - dy / RES, gy, wz + 0.6, false, shape.cylinder(0))
    }
  }

  /** Closed: a plank door with iron bands and a brass ring. Open: nothing, so the dark interior (and anyone passing through) shows. */
  private drawHutDoor(B: Buf, hut: Point, open: boolean) {
    if (open) return
    const [bx, by] = project(hut.x, 0, hut.z)
    for (const [k, r] of DOOR_PX) {
      let c = (k + 9) % 3 === 2 ? C.hutDoorD : C.hutDoor // plank seams
      if (r === 4 || r === 12) c = C.iron
      if (k === -3 && (r === 8 || r === 9)) c = C.pommel
      this.put(B, bx + k, by - r, c, hut.x, hut.z, r / RES, by, hut.z + 0.005)
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
    this.shadows.dynamics = []
    for (const k in this.fx) this.fx[k as keyof typeof this.fx].fill(0)
    this.fx.dep.fill(SKY_DEPTH)
    this.fx.rdep.fill(SKY_DEPTH)
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
    this.say(
      'hearth1',
      'the carved hearthstone',
      w.fire.heat > 0.55 ? 'its crown glows when the fire is high' : 'an antler crown, cut deep, like the one in the fire',
      true,
    )
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
    BUSHES.forEach((b, i) => this.say(`bush${i}`, ...BUSH_NAMES[b.seed % BUSH_NAMES.length]))

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
        const tall = 2 + Math.round(w.candles[i].wax * 4)
        for (let r = 0; r < tall; r++) for (let k = 0; k < 2; k++) this.put(B, gx + k, gy - r, k ? C.ash : C.candle, g.x + 3, g.z + 1, r / RES, gy, g.z + 2)
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
      const pal = keeper ? (elder ? KEEPER_PAL_ELDER : KEEPER_PAL) : elder ? MUSH_PAL_ELDER : MUSH_PAL
      const sp = this.sprite(B, this.mushFrame(m, w, keeper), m.x, m.z, pal, m.flip, {
        glowChar: 'w',
        lift: hop - sink,
        sinkTo: sink ? by : undefined,
        hover,
        parts: MUSH_PARTS,
        shine: keeper ? KEEPER_SHINE : undefined,
      })
      caps.push({ ...sp, elder, key })
      if (m.carrying) this.tagged(key, () => this.drawStick(B, m.x, m.z, sp.h / RES + 1 + hop))
      if (st === 'departing') lanterns.push({ x: sp.bx + (m.flip ? -4 : 4) * RES, y: sp.by - 4 * RES, dep: sp.dep + 0.02, key })
      // the keeper carries an ember from the fire, so you can always find them, even in the dark
      if (keeper) keeperEmber = { x: sp.bx + (m.flip ? -4 : 4) * RES, y: sp.by - 3 * RES, dep: sp.dep + 0.02, key }
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
            if (ch !== '.')
              this.put(B, px + (lookLeft ? 7 - c : c) - 4, py - 7 + r, CROW_PAL[ch] ?? C.crow, PROPS.trigon.x, PROPS.trigon.z, 40, py, PROPS.trigon.z + 1)
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
        for (let dy = 0; dy < 3; dy++)
          for (let dx = 0; dx < 2; dx++) this.putFx(l.x + dx, l.y + dy, GLOW.lantern[dy < 2 ? 0 : 1], dy < 2 ? 0.95 : 0.8, undefined, l.dep)
      })
    if (keeperEmber) {
      const e: { x: number; y: number; dep: number; key: string } = keeperEmber
      const pulse = 0.75 + 0.25 * Math.sin(t * 3)
      this.tagged(e.key, () => {
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) this.putFx(e.x + dx, e.y + dy, GLOW.ember, pulse, undefined, e.dep)
        this.putFx(e.x + (Math.sin(t * 9) > 0 ? 1 : 0), e.y - 1, FLAME[2], 0.6 * pulse, undefined, e.dep, 0.6)
      })
    }
    if (F.croak > 0)
      this.tagged('frog', () => {
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) this.putFx(frog.bx + (bx2 < ax ? -4 : 2) + dx, frog.by - 5 + dy, GLOW.croak, 0.8, undefined, frog.dep + 0.01)
      })
    if (K.fsm.state === 'flying' || K.fsm.state === 'returning') {
      this.say('crow', 'a crow', 'off somewhere drier')
      this.tagged('crow', () =>
        CROW[1 + (((t * 8) % 2) | 0)].forEach((row, r) =>
          [...row].forEach((ch, c) => {
            if (ch !== '.') this.putFx(K.x + c - 5, K.y + r - 2, CROW_PAL[ch] ?? C.crow, 1, undefined, PROPS.trigon.z + 1, 0) // it flies about as far off as the trigon
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
      for (const [k, r, ch] of LANTERN_PANES)
        this.putFx(lx + k, ly - r, GLOW.lantern[ch === 'g' ? 0 : r > 37 ? 2 : 1], fl * (ch === 'g' ? 1 : 0.85), ly, p.z + 0.05)
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
        if (c.lit) {
          const top = gy - 2 - Math.round(c.wax * 4)
          const a = (0.7 + 0.3 * vnoise(t * 7 + g.x, 2)) * (0.6 + 0.4 * c.wax)
          this.putFx(gx, top, GLOW.candle, a, gy, g.z + 2.05)
          this.putFx(gx + (vnoise(t * 5 + g.z, 3) > 0.5 ? 1 : 0), top - 1, GLOW.candle, a * 0.8, gy, g.z + 2.05)
        }
      }),
    )
    // the crown carved into the tall hearthstone warms with the fire
    this.tagged('hearth1', () => {
      const hs = HEARTHSTONES.find((h) => h.carved)!
      const [bx, by, s] = project(hs.x, 0, hs.z)
      const cy = by - Math.round(Math.round(hs.h * s * 0.75) * 0.55)
      const warm = clamp((heat - 0.35) * 1.6)
      if (warm > 0.02)
        for (const [dx, dy] of CROWN_PX) this.putFx(bx + dx, cy + dy, GLOW.carving, warm * (0.6 + 0.2 * Math.sin(t * 1.5)), undefined, hs.z + 0.1)
    })
    // foxfire: faint violet specks on rotten wood (ambient, just pretty)
    this.tagged('foxfire', () => {
      for (const s of SHROOMS) {
        const [sx, sy] = project(s.x, 0, s.z)
        const a = 0.4 + 0.25 * Math.sin(t * 0.8 + s.ph)
        for (const [dx, dy, d] of [
          [0, 0, 0],
          [1, 0, 0],
          [3, -1, 1],
          [-2, 1, 1],
          [2, 1, 1],
        ])
          this.putFx(sx + dx, sy + dy, d ? GLOW.foxfireD : GLOW.foxfire, a * (d ? 0.7 : 1), sy, s.z + 0.05, 0.6)
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
        for (const dx of [0, 1, 4, 5]) this.putFx(sx + dx, sy, GLOW.eye, a, undefined, e.z)
        for (const dx of [2, 3]) this.putFx(sx + dx, sy, GLOW.eye, 0.01, undefined, e.z, 0) // invisible bridge, so the gap between them hovers too
      })
    })

    // The flame is a volume: two translucent sheets curved around the middle of the fire, like
    // a cylinder. The back sheet (deep reds, slower) curves away from the camera, the front
    // one (golds, faster, more see-through) bulges toward it, its base dipping into the near
    // side of the stone ring. Each pixel's depth follows the curve, so the relic stands inside
    // the fire, the logs show through it, and anyone in front of the ring still covers it.
    // The front sheet is light added on top: where the sheets overlap the fire burns hotter.
    // Size follows the fire's heat, so a fresh log swells it gradually.
    const flame = (front: boolean) => {
      const side = front ? 1 : -1
      const half0 = (front ? 3 + 5 * heat : 2.6 + 4.4 * heat) * RES
      const fh = (front ? 4 + 18 * heat : 5 + 23 * heat) * RES
      const dip = front ? 5 : 3 // how far the base curves toward (or away from) the camera, in pixels
      const seed = front ? 31 : 0
      const xr = Math.ceil(half0 + 4 * RES)
      for (let x = fireX - xr; x <= fireX + xr; x++) {
        const ub = (x - fireX) / half0
        const baseY = fireY + Math.round(side * dip * Math.sqrt(Math.max(0, 1 - ub * ub)))
        for (let y = Math.floor(baseY - fh - 2); y <= baseY; y++) {
          const dy = (baseY - y) / fh
          if (dy > 1 || dy < 0) continue
          const sway = Math.sin(t * (front ? 3.6 : 2.6) + dy * 4 + seed) * dy * 2.5 * RES
          const half = half0 * Math.pow(1 - dy, 0.7) + 0.5
          const n = front ? vnoise((x / RES) * 0.5 + seed, (y / RES) * 0.45 + t * 8.5) : vnoise((x / RES) * 0.36, (y / RES) * 0.32 + t * 6)
          const v = (1 - Math.abs(x - fireX - sway) / half) * (1 - dy * 0.6) + (n - 0.5) * 0.9 - dy * 0.35
          if (v < 0.12) continue
          const u = Math.max(-1, Math.min(1, (x - fireX - sway) / half))
          const depth = side * (0.3 + 4 * Math.sqrt(1 - u * u) * (1 - dy))
          const k = front ? (v > 0.7 ? 3 : v > 0.45 ? 2 : 1) : v > 0.75 ? 2 : v > 0.4 ? 1 : 0
          const a = front ? 0.22 + 0.45 * clamp(v) : 0.55 + 0.4 * clamp(v)
          this.putFx(x, y, FLAME[k], a, groundY, depth, front ? 0.22 : 0.18, front)
        }
      }
    }
    this.tagged('fire', () => {
      // a bed of coals in the middle of the ring, flickering pixel by pixel
      const coals = (3 + 3 * Math.min(1, heat)) * RES
      disc(
        (px, py) => this.putFx(px, py, FLAME[hash(px, py * 3 + ((t * 8) | 0)) < 0.5 ? 1 : 2], 1, groundY, (py - fireY) * 0.8, 0.3),
        fireX,
        fireY + 2,
        coals,
        3,
      )
      flame(false)
    })
    // The relic stands in the middle of the fire, between the two sheets. Like the bonfire's
    // sword it is a dark silhouette where the back flame is behind it, lit warm by the fire
    // where it rises above, its metal glows with heat, and the front flame licks over it.
    this.tagged('relic', () => {
      const art = RELICS[this.relic]
      const h = art.rows.length
      const wd = art.rows[0].length
      const warm = clamp(heat * 1.1 - 0.15)
      art.rows.forEach((row, r) =>
        [...row].forEach((ch, c) => {
          if (ch === '.') return
          const px = fireX + c - (wd >> 1)
          const py = groundY + r - h
          const inFlame = this.fx.a[py * W + px] > 0.5
          const lit: Color = [art.pal[ch][0] * (0.5 + 1.3 * heat), art.pal[ch][1] * (0.4 + 0.8 * heat), art.pal[ch][2] * (0.35 + 0.45 * heat)]
          const base = inFlame ? mix(art.pal[ch], C.char, 0.8) : lit
          const col = ch === 'g' ? mix(base, GLOW.carving, warm * (0.6 + 0.3 * vnoise(t * 3, c + r))) : base
          this.putFx(px, py, col, 1, groundY, 0, ch === 'g' ? 0.5 * warm : 0) // the bone/wood itself doesn't glow
        }),
      )
    })
    this.tagged('fire', () => flame(true))
    // smoke when the fire is low or it's raining (steam)
    const smoky = clamp((0.5 - heat) * 1.4) + (isRaining(w) ? 0.35 : 0)
    if (smoky > 0.02) {
      for (let i = 0; i < 10; i++) {
        const age = (t * 0.35 + i / 10) % 1
        const sx = fireX + ((vnoise(i * 3.1, t * 0.4) - 0.5) * 8 * age + Math.sin(t + i) * age * 3) * RES
        const sy = fireY - (6 + age * 34) * RES
        const rad = 1 + Math.round(age * 2)
        disc((px, py) => this.putFx(px, py, GLOW.smoke, smoky * 0.12 * (1 - age), undefined, 0.3, 0), Math.round(sx), Math.round(sy), rad, rad)
      }
    }
    for (const e of w.embers) {
      const life = 1 - e.age / e.life
      this.putFx(fireX + e.ox * RES, groundY - e.oy * RES, [1, (120 + life * 100) / 255, 60 / 255], life, groundY, 0.2, 0.6)
    }
    for (const z of w.zs) {
      const hut = PROPS.huts[z.hut]
      const [hx, hy] = project(hut.x, 0, hut.z)
      const [cx, cy] = HUT_PX.chimney
      const zx = Math.round(hx + (cx + z.age * 3) * RES)
      const zy = Math.round(hy - (cy + z.age * 6) * RES)
      for (const [dx, dy] of ZED) this.putFx(zx + dx, zy + dy, GLOW.zzz, 0.7 * (1 - z.age / 1.8), undefined, hut.z + 0.05, 0.4)
    }
    for (const f of w.flies) {
      if (f.a <= 0.02) continue
      const [px, py] = project(f.x, f.y, f.z)
      this.putFx(px, py, GLOW.firefly, f.a, project(f.x, 0, f.z)[1], f.z)
    }
    if (w.shooting) {
      const s = w.shooting
      for (let i = 0; i < 8; i++) {
        const x = s.x + (s.age * 120 - i * 2) * RES
        const y = s.y + (s.age * 40 - i * 0.66) * RES
        if (y < HORIZON) this.putFx(x, y, GLOW.star, (1 - i / 8) * (1 - s.age / 0.9), undefined, SKY_DEPTH)
      }
    }
    // a stick you just dropped carries a soft highlight, so you can see where it went
    w.sticks.forEach((s, i) => {
      if (s.glint <= 0.02) return
      const [bx, by] = project(s.x, s.y, s.z)
      this.tagged(`stick${i}`, () => {
        for (const [dx, dy] of stickPixels(s.angle)) this.putFx(bx + dx, by - 1 + dy, GLOW.glint, 0.55 * s.glint, undefined, s.z + 0.65, 0.25)
      })
    })
    // falling sticks cast a small shadow that tightens as they near the ground; landings kick up dust
    for (const s of w.sticks) {
      if (s.landed) continue
      const [gx, gy] = project(s.x, 0, s.z)
      const spread = Math.max(1, Math.round(3 - s.y / 10)) * RES
      for (let dx = -spread; dx <= spread; dx++) this.putFx(gx + dx, gy, C.char, 0.45 * (1 - s.y / 30), undefined, s.z - 0.1, 0)
    }
    for (const p of w.puffs) {
      if (p.age < 0) continue
      const k = p.age / 0.9
      const [gx, gy] = project(p.x, 0, p.z)
      for (let i = 0; i < 4; i++) {
        const ox = (hash(p.seed, i) - 0.5) * 9 * (0.3 + k) * RES
        const oy = (-k * 4 - hash(i, p.seed) * 2) * RES
        for (let dx = 0; dx < 2; dx++) this.putFx(gx + ox + dx, gy + oy, GLOW.dust, 0.55 * (1 - k), undefined, p.z + 1, 0)
      }
    }
    for (const r of w.ripples) {
      if (r.age < 0) continue
      const a = r.age / 0.7
      const hw = ((1 + a * 4) | 0) * RES
      for (let dx = -hw; dx <= hw; dx++) this.putFx(r.x + dx, r.y, GLOW.ripple, 0.55 * (1 - a), undefined, GROUND_DEPTH, 0.2)
    }
  }

  // ---------------------------------------------------------------- lighting

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
    out.push({
      kind: 'fire',
      name: 'campfire',
      x: 0,
      y: FIRE_Y,
      shadowY: FIRE_Y + 8,
      z: 0,
      radius: lightRadius(w),
      color: [1.7 * fi, 0.95 * fi, 0.42 * fi],
      wobble: 1,
      tail: 0.11,
      shadows: true,
      seed: 7,
    })
    {
      const fl = 0.85 + 0.15 * vnoise(t * 6, 7)
      out.push({
        kind: 'lantern',
        name: 'road lantern',
        x: PROPS.lantern.x + 3.3,
        y: 14,
        z: PROPS.lantern.z,
        radius: 32,
        color: warm(1.4 * fl),
        wobble: 0.5,
        tail: 0.06,
        shadows: true,
        seed: 3,
      })
    }
    PROPS.graves.forEach((g, i) => {
      const c = w.candles[i]
      if (!c.lit) return
      const fl = (0.8 + 0.2 * vnoise(t * 7 + g.x, 2)) * (0.6 + 0.4 * c.wax)
      out.push({
        kind: 'candle',
        name: `candle ${i}`,
        x: g.x + 3,
        y: 3,
        z: g.z + 1,
        radius: 22,
        color: warm(1.2 * fl),
        wobble: 0.7,
        tail: 0.04,
        shadows: true,
        seed: g.x,
      })
    })
    PROPS.huts.forEach((h, i) => {
      if (hutOccupancy(w, i))
        out.push({
          kind: 'window',
          name: `hut ${i} window`,
          x: h.x + 3,
          y: 10,
          z: h.z + 3,
          radius: 18,
          color: warm(0.95),
          wobble: 0,
          tail: 0.04,
          shadows: false,
          seed: i,
        })
    })
    if (w.rune > 0.02) {
      const k = w.rune
      // the rune glows from inside the carving: a tight light at the cut, with a soft spill around it
      out.push({
        kind: 'rune',
        name: 'trigon rune',
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
      out.push({
        kind: 'cap',
        name: `${m.name}'s cap`,
        x: m.x,
        y: 6,
        z: m.z,
        radius: 8,
        color: [0.08, 0.3, 0.28],
        wobble: 0,
        tail: 0,
        shadows: false,
        seed: m.id,
        owner: tagId(`mush${m.id}`),
      })
      if (m.id === w.keeperId)
        out.push({
          kind: 'ember',
          name: `${m.name}'s ember`,
          x: m.x + (m.flip ? -3 : 3),
          y: 4,
          z: m.z,
          radius: 10,
          color: [0.75, 0.38, 0.12],
          wobble: 0.5,
          tail: 0,
          shadows: false,
          seed: m.id,
        })
      if (m.fsm.state === 'departing')
        out.push({
          kind: 'carried',
          name: `${m.name}'s lantern`,
          x: m.x + (m.flip ? -3 : 3),
          y: 5,
          z: m.z,
          radius: 15,
          color: warm(0.8),
          wobble: 0.6,
          tail: 0.03,
          shadows: false,
          seed: m.id,
        })
    }
    for (const s of SHROOMS)
      out.push({ kind: 'foxfire', name: 'foxfire', x: s.x, y: 1, z: s.z, radius: 7, color: [0.16, 0.1, 0.3], wobble: 0, tail: 0, shadows: false, seed: s.ph })
    for (const m of w.memorials)
      out.push({
        kind: 'glowcap',
        name: `${m.name}'s glowcap`,
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
        out.push({
          kind: 'firefly',
          name: 'firefly',
          x: f.x,
          y: f.y,
          z: f.z,
          radius: 8,
          color: [0.5 * f.a, 0.6 * f.a, 0.2 * f.a],
          wobble: 0,
          tail: 0,
          shadows: false,
          seed: f.seed,
        })
    // the editor's tuning, per kind of light
    return out.flatMap((l) => {
      const k = settings.lights[l.kind!]
      if (!k) return [l]
      if (!k.on) return []
      return [
        {
          ...l,
          y: l.y + k.height,
          shadowY: l.shadowY === undefined ? undefined : l.shadowY + k.height,
          radius: l.radius * k.radius,
          color: [l.color[0] * k.gain, l.color[1] * k.gain, l.color[2] * k.gain] as Color,
          wobble: l.wobble * k.wobble,
          tail: l.tail * k.tail,
          shadows: k.shadows === 'default' ? l.shadows : k.shadows === 'on',
        },
      ]
    })
  }

  private compose(w: World) {
    const t = w.t
    const B = this.fb
    const fx = this.fx
    const out = this.out
    const amb = isRaining(w) ? 0.8 : 1
    const L = settings.layers
    const useNormals = L.normals
    const moonK = settings.ambient.moon
    const view = settings.view
    const raw = this.lights(w)
    this.lastLights = raw
    // the strongest few shadow-casting lights get shadow maps this frame
    const strength = (l: Light) => (l.color[0] + l.color[1] + l.color[2]) * l.radius
    const casting = new Set(
      raw
        .filter((l) => l.shadows && settings.layers.shadows)
        .sort((a, b) => strength(b) - strength(a))
        .slice(0, BUDGET),
    )
    const lights = prepareLights(raw, t, (l) => (casting.has(l) ? this.shadows.mapFor(l) : null))
    this.prepared = lights
    const nrm: [number, number, number] = [0, 0, 0]
    // Light culling: most lights (caps, candles, fireflies) only reach a small patch, so each
    // 32x32 tile of the screen gathers only the lights that can reach what it shows.
    const boxes = this.tileBoxes
    boxes.fill(Infinity)
    for (let k = 0; k < TILES; k++) for (let a = 3; a < 6; a++) boxes[k * 6 + a] = -Infinity
    const grow = (k: number, x: number, y: number, z: number) => {
      const o = k * 6
      if (x < boxes[o]) boxes[o] = x
      if (y < boxes[o + 1]) boxes[o + 1] = y
      if (z < boxes[o + 2]) boxes[o + 2] = z
      if (x > boxes[o + 3]) boxes[o + 3] = x
      if (y > boxes[o + 4]) boxes[o + 4] = y
      if (z > boxes[o + 5]) boxes[o + 5] = z
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        if (!B.a[i]) continue
        const k = (y >> TILE_BITS) * TILES_X + (x >> TILE_BITS)
        grow(k, B.kx[i], B.ky[i], B.kz[i])
        if (B.pool[i] && !B.obj[i]) {
          // the reflection shown here (rippled up to a pixel or two sideways)
          for (const j of [i - 2, i, i + 2]) if (j >= 0 && j < N && B.ra[j]) grow(k, B.rkx[j], B.rky[j], B.rkz[j])
        }
      }
    }
    const tileLights = cullLights(lights, boxes, TILES)
    let here: Prepared[] = lights

    // Ambient moonlight (with a rim on surfaces that face the moon), plus every light source.
    const Lc: Color = [0, 0, 0]
    const light = (x: number, z: number, y: number, ground: boolean, nx: number, ny: number, nz: number, spec: number, tag: number) => {
      let moon = 1
      let normal: [number, number, number] | null = null
      if (!ground && useNormals && nz > 0) {
        nrm[0] = nx
        nrm[1] = ny
        nrm[2] = nz
        normal = nrm
        moon = 0.5 + 1.3 * Math.max(0, nrm[0] * MOON[0] + nrm[1] * MOON[1] + nrm[2] * MOON[2])
      }
      Lc[0] = 0.15 * amb * moon * moonK
      Lc[1] = 0.18 * amb * moon * moonK
      Lc[2] = 0.27 * amb * moon * moonK
      gatherLight(here, x, y, z, ground, ground ? groundGrain(x, z) : 0.5, normal, Lc, tag)
      if (normal && spec > 0) {
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
        const fs = Math.pow(Math.max(0, (normal[0] * lx + normal[1] * (ly + VIEW[1]) + normal[2] * (lz + VIEW[2])) / hl), 9) * reach * 2.2 * spec
        const ms = Math.pow(Math.max(0, normal[0] * MOON_H[0] + normal[1] * MOON_H[1] + normal[2] * MOON_H[2]), 7) * 0.45 * amb * spec
        Lc[0] += fs * fire.color[0] + ms * 0.55
        Lc[1] += fs * fire.color[1] + ms * 0.65
        Lc[2] += fs * fire.color[2] + ms * 0.85
      }
    }

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        here = tileLights[(y >> TILE_BITS) * TILES_X + (x >> TILE_BITS)]
        let r: number, g: number, b: number
        if (B.a[i]) {
          light(B.kx[i], B.kz[i], B.ky[i], B.obj[i] === 0, B.nx[i], B.ny[i], B.nz[i], B.sp[i], B.hv[i])
          r = B.r[i] * Lc[0]
          g = B.g[i] * Lc[1]
          b = B.b[i] * Lc[2]
          if (B.pool[i] && !B.obj[i] && !L.reflections) {
            r += 0.03 * amb
            g += 0.045 * amb
            b += 0.075 * amb
          } else if (B.pool[i] && !B.obj[i]) {
            // open water: dark surface + the mirrored world + mirrored emissives, gently rippled
            const ox = Math.round(Math.sin((y / RES) * 1.7 + t * 2.4) * 0.7 * RES)
            const j = y * W + Math.max(0, Math.min(W - 1, x + ox))
            if (B.ra[j]) {
              light(B.rkx[j], B.rkz[j], B.rky[j], false, B.rnx[j], B.rny[j], B.rnz[j], B.rsp[j], B.rhv[j])
              r += B.rr[j] * Lc[0] * 0.55
              g += B.rg[j] * Lc[1] * 0.55
              b += B.rb[j] * Lc[2] * 0.55
            } else {
              r += 0.03 * amb
              g += 0.045 * amb
              b += 0.075 * amb
            }
            const fa = L.emissives ? fx.ra[j] * 0.75 : 0
            if (fa > 0) {
              r = r * (1 - fa) + fx.rr[j] * fa
              g = g * (1 - fa) + fx.rg[j] * fa
              b = b * (1 - fa) + fx.rb[j] * fa
            }
          }
          let m = L.mist ? mistAt(B.kz[i]) * settings.ambient.mist : 0
          if (m > 0) {
            m = Math.min(0.95, m * (0.75 + 0.35 * vnoise((x / RES) * 0.025 + t * 0.06, (y / RES) * 0.06)))
            r = r * (1 - m) + C.mist[0] * m
            g = g * (1 - m) + C.mist[1] * m
            b = b * (1 - m) + C.mist[2] * m
          }
          // moonlit speckles on the leaves, twinkling slowly
          const gl = L.glints ? B.gl[i] : 0
          if (gl > 0) {
            const k = gl * 0.26 * amb * (1 - m) * (0.55 + 0.45 * Math.sin(t * 0.8 + x * 0.37 + y * 0.71))
            r += 0.5 * k
            g += 0.68 * k
            b += 0.75 * k
          }
        } else {
          r = B.bgr[i] * amb
          g = B.bgg[i] * amb
          b = B.bgb[i] * amb
        }
        if (view === 'light') {
          // the light arriving here, without the surface's own colour
          const lit = B.a[i] ? 1 : 0
          r = Lc[0] * 0.5 * lit
          g = Lc[1] * 0.5 * lit
          b = Lc[2] * 0.5 * lit
        }
        const fa = L.emissives && view === 'final' ? fx.a[i] : 0
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
    if (view !== 'final') this.showBuffer(view, tileLights)
    else if (L.stars)
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

  /** Replace the frame with one of the buffers behind it (the editor's views). */
  private showBuffer(view: View, tileLights: Prepared[][]) {
    const B = this.fb
    const fx = this.fx
    const out = this.out
    for (let i = 0; i < N; i++) {
      let r = 0
      let g = 0
      let b = 0
      const obj = B.a[i] && B.obj[i]
      switch (view) {
        case 'albedo':
          ;[r, g, b] = B.a[i] ? [B.r[i], B.g[i], B.b[i]] : [B.bgr[i], B.bgg[i], B.bgb[i]]
          break
        case 'normals':
          if (obj && B.nz[i] > 0) [r, g, b] = [B.nx[i] * 0.5 + 0.5, B.ny[i] * 0.5 + 0.5, B.nz[i]]
          else if (B.a[i]) [r, g, b] = [0.5, 0.75, 0.6] // the ground faces up
          break
        case 'depth': {
          if (obj) r = g = b = clamp((B.dep[i] + 100) / 180)
          else if (B.a[i]) [r, g, b] = [0.05, 0.08, 0.2]
          break
        }
        case 'shadows': {
          // how shadowed the ground is, from every light that casts shadows (darker = more)
          if (B.a[i] && !B.obj[i]) {
            let occ = 0
            for (const l of this.prepared) if (l.shadow) occ = Math.max(occ, shadowAt(l.shadow, B.kx[i], B.kz[i]))
            r = g = b = 0.85 - occ * 0.75
          } else if (B.a[i]) [r, g, b] = [0.25, 0.18, 0.12]
          break
        }
        case 'emissive':
          ;[r, g, b] = [fx.r[i] * fx.a[i], fx.g[i] * fx.a[i], fx.b[i] * fx.a[i]]
          break
        case 'hover': {
          const h = B.hv[i]
          if (h) [r, g, b] = [hash(h, 1) * 0.8 + 0.2, hash(h, 2) * 0.8 + 0.2, hash(h, 3) * 0.8 + 0.2]
          break
        }
        case 'tiles': {
          const x = i % W
          const y = (i / W) | 0
          const n = tileLights[(y >> TILE_BITS) * TILES_X + (x >> TILE_BITS)].length
          const k = clamp(n / 12)
          const edge = (x & 31) === 0 || (y & 31) === 0 ? 0.25 : 0
          r = out.r[i] * 0.35 + k + edge
          g = out.g[i] * 0.35 + (1 - k) * 0.25 * (n > 0 ? 1 : 0) + edge
          b = out.b[i] * 0.35 + edge
          break
        }
        default:
          continue // 'light' is written while composing
      }
      out.r[i] = r
      out.g[i] = g
      out.b[i] = b
    }
  }

  /** The hover tag key of the thing at this pixel ('hut0', 'tree12', ...), or null. */
  tagAt(x: number, y: number): string | null {
    if (x < 0 || x >= W || y < 0 || y >= H) return null
    const id = this.fb.hv[y * W + x]
    if (!id) return null
    for (const [k, v] of TAGS) if (v === id) return k
    return null
  }

  /** Everything about one pixel of the last frame, and how much each light gives it. */
  inspectPixel(x: number, y: number): PixelInfo | null {
    if (x < 0 || x >= W || y < 0 || y >= H) return null
    const B = this.fb
    const fx = this.fx
    const i = y * W + x
    const what = !B.a[i] ? 'sky' : B.obj[i] ? 'object' : 'ground'
    const tag = B.hv[i]
    const ground = what === 'ground'
    const normal: [number, number, number] | null = what === 'object' && B.nz[i] > 0 ? [B.nx[i], B.ny[i], B.nz[i]] : null
    const lights =
      what === 'sky'
        ? []
        : this.prepared
            .map((l) => {
              const c: Color = [0, 0, 0]
              gatherLight([l], B.kx[i], B.ky[i], B.kz[i], ground, ground ? groundGrain(B.kx[i], B.kz[i]) : 0.5, settings.layers.normals ? normal : null, c, tag)
              return { name: l.name ?? '?', kind: l.kind ?? '?', amount: 0.3 * c[0] + 0.55 * c[1] + 0.15 * c[2], color: c }
            })
            .filter((l) => l.amount > 0.002)
            .sort((a, b) => b.amount - a.amount)
    return {
      x,
      y,
      what,
      owner: this.labels.get(tag)?.[0] ?? null,
      depth: B.dep[i],
      world: [B.kx[i], B.ky[i], B.kz[i]],
      normal,
      albedo: B.a[i] ? [B.r[i], B.g[i], B.b[i]] : [B.bgr[i], B.bgg[i], B.bgb[i]],
      material: { micro: B.mh[i], weight: B.mw[i], spec: B.sp[i], glint: B.gl[i] },
      emissive: fx.a[i] > 0 ? { a: fx.a[i], color: [fx.r[i], fx.g[i], fx.b[i]], depth: fx.dep[i], bloom: fx.bw[i] } : null,
      pool: !!B.pool[i],
      out: [this.out.r[i], this.out.g[i], this.out.b[i]],
      lights,
    }
  }

  /** The editor's overlays, drawn over the finished frame at output resolution. */
  private drawOverlays(w: World) {
    const O = settings.overlays
    const sel = settings.selectedLight
    const insp = settings.inspect
    const pick = settings.selection
    if (!O.lights && !O.casters && !O.nav && !O.paths && !sel && !insp && !pick) return
    const { ctx, scale: S } = this
    ctx.save()
    ctx.lineWidth = Math.max(1, S / 2)
    const ellipse = (x: number, z: number, r: number, stroke: string, fill?: string) => {
      const [cx, cy, s] = project(x, 0, z)
      ctx.beginPath()
      ctx.ellipse(cx * S, cy * S, Math.max(1, r * s * S), Math.max(1, r * 1.215 * S), 0, 0, Math.PI * 2)
      if (fill) {
        ctx.fillStyle = fill
        ctx.fill()
      }
      ctx.strokeStyle = stroke
      ctx.stroke()
    }
    if (O.nav) {
      ctx.fillStyle = 'rgba(255,70,70,0.28)'
      for (let z = -100; z < 90; z += 2)
        for (let x = -170; x < 170; x += 2) {
          if (walkable(x, z)) continue
          const [sx, sy] = project(x, 0, z)
          if (sx < 0 || sx >= W || sy < HORIZON || sy >= H) continue
          ctx.fillRect(sx * S - S, sy * S - S, 2 * S, 2 * S)
        }
    }
    if (O.paths) {
      ctx.strokeStyle = 'rgba(159,245,228,0.8)'
      for (const m of w.mush) {
        const pts = [[m.x, m.z], ...(m.path ?? []), ...(m.route ?? [])]
        if (pts.length < 2) continue
        ctx.beginPath()
        pts.forEach(([x, z], k) => {
          const [sx, sy] = project(x, 0, z)
          if (k) ctx.lineTo(sx * S, sy * S)
          else ctx.moveTo(sx * S, sy * S)
        })
        ctx.stroke()
      }
    }
    if (O.casters) {
      // every caster's silhouette, as recorded when it was drawn, and its foot
      for (const sil of [...this.shadows.statics, ...this.shadows.dynamics]) {
        const [bx, by] = project(sil.x, 0, sil.z)
        ctx.fillStyle = 'rgba(255,200,80,0.35)'
        for (let k = 0; k < sil.runs.length; k += 3)
          ctx.fillRect((bx + sil.runs[k]) * S, (by - sil.runs[k + 2]) * S, S, (sil.runs[k + 2] - sil.runs[k + 1]) * S)
        ellipse(sil.x, sil.z, 0.6, 'rgba(255,120,60,0.9)')
      }
    }
    if (O.lights || sel) {
      for (const l of this.lastLights) {
        const on = l.kind === sel
        if (!O.lights && !on) continue
        const [lx, ly] = project(l.x, l.y, l.z)
        const [gx, gy] = project(l.x, 0, l.z)
        const col = on ? 'rgba(255,220,120,0.95)' : 'rgba(255,220,120,0.35)'
        ellipse(l.x, l.z, l.radius, col)
        ctx.strokeStyle = col
        ctx.beginPath()
        ctx.moveTo(gx * S, gy * S)
        ctx.lineTo(lx * S, ly * S)
        ctx.stroke()
        ctx.fillStyle = `rgb(${Math.min(255, l.color[0] * 200)},${Math.min(255, l.color[1] * 200)},${Math.min(255, l.color[2] * 200)})`
        ctx.fillRect(lx * S - 2 * S, ly * S - 2 * S, 4 * S, 4 * S)
      }
    }
    if (pick) {
      // what the move tool has selected
      ctx.setLineDash([3 * S, 2 * S])
      ellipse(pick.x, pick.z, 4, 'rgba(240,138,60,0.95)')
      ctx.setLineDash([])
    }
    if (insp) {
      const x = (insp.x + 0.5) * S
      const y = (insp.y + 0.5) * S
      ctx.strokeStyle = '#fff'
      ctx.strokeRect(insp.x * S - 0.5, insp.y * S - 0.5, S + 1, S + 1)
      ctx.beginPath()
      ctx.moveTo(x - 8 * S, y)
      ctx.lineTo(x - 2 * S, y)
      ctx.moveTo(x + 2 * S, y)
      ctx.lineTo(x + 8 * S, y)
      ctx.moveTo(x, y - 8 * S)
      ctx.lineTo(x, y - 2 * S)
      ctx.moveTo(x, y + 2 * S)
      ctx.lineTo(x, y + 8 * S)
      ctx.stroke()
    }
    ctx.restore()
  }

  private present(w: World) {
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
    if (settings.layers.bloom && settings.layers.emissives && settings.view === 'final') {
      // soft bloom from the emissive layer, plus a faint warm wash around the fire
      const heat = Math.min(1.2, w.fire.heat)
      ctx.globalCompositeOperation = 'lighter'
      ctx.imageSmoothingEnabled = true
      ctx.filter = `blur(${3 * S * RES}px)`
      ctx.globalAlpha = Math.min(1, 0.85 * (0.45 + 0.55 * heat) * settings.ambient.bloom)
      ctx.drawImage(this.fxC, 0, 0, DW, DH)
      ctx.filter = `blur(${9 * S * RES}px)`
      ctx.globalAlpha = Math.min(1, 0.55 * (0.3 + 0.7 * heat) * settings.ambient.bloom)
      ctx.drawImage(this.fxC, 0, 0, DW, DH)
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      const [fsx, fsy] = project(0, 8, 0)
      const fl = heat * (0.85 + 0.15 * vnoise(w.t * 9, 1))
      ctx.translate(fsx * S, fsy * S)
      ctx.scale(1, 0.6)
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, lightRadius(w) * 1.5 * S * RES)
      gr.addColorStop(0, `rgba(255,140,60,${0.07 * fl})`)
      gr.addColorStop(0.4, `rgba(255,110,40,${0.025 * fl})`)
      gr.addColorStop(1, 'rgba(255,100,30,0)')
      ctx.fillStyle = gr
      ctx.fillRect(-DW, -DH * 2, DW * 2, DH * 4)
    }
    ctx.restore()
    if (isRaining(w) && settings.layers.rain) this.drawRain(w)
    if (settings.layers.labels) this.drawHover()
    else this.hovered = null
    if (settings.overlays.states) this.drawDebug(w)
    this.drawOverlays(w)
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
    const near = 28 * RES
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
    const U = S * RES // output pixels per base pixel: text keeps its size at any resolution
    ctx.save()
    ctx.textAlign = 'center'
    const nameFont = `${3.25 * U}px ${FONT}`
    const subFont = `${2.75 * U}px ${FONT}`
    ctx.font = subFont
    const lines = wrapText(ctx, label[1], 84 * U)
    ctx.font = nameFont
    const widest = Math.max(ctx.measureText(label[0]).width, ...lines.map((l) => ((ctx.font = subFont), ctx.measureText(l).width)))
    const half = widest / 2 + 3 * U
    const x = Math.max(half, Math.min(W * S - half, ((x0 + x1) / 2) * S))
    const height = (4 + lines.length * 4) * U
    const below = !label[2] && y1 * S + 6.5 * U + height < H * S - 2 * U
    const y = below ? y1 * S + 6.5 * U : y0 * S - 3 * U - height + 3.25 * U
    ctx.font = nameFont
    ctx.fillStyle = 'rgba(233,227,212,0.95)'
    ctx.fillText(label[0], x, y)
    ctx.font = subFont
    ctx.fillStyle = 'rgba(154,151,140,0.95)'
    lines.forEach((l, k) => ctx.fillText(l, x, y + (4 + k * 3.6) * U))
    ctx.restore()
  }

  private drawDebug(w: World) {
    const { ctx, scale: S } = this
    ctx.save()
    const U = S * RES
    ctx.font = `${3 * U}px ${FONT}`
    ctx.textAlign = 'center'
    const tag = (txt: string, x: number, y: number, col: string) => {
      const m = ctx.measureText(txt).width
      const left = ctx.textAlign === 'left' ? x : x - m / 2
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(left - U, y - 2.75 * U, m + 2 * U, 3.75 * U)
      ctx.fillStyle = col
      ctx.fillText(txt, x, y)
    }
    for (const m of w.mush) {
      if (m.fsm.state === 'asleep') continue
      const [sx, sy] = project(m.x, 0, m.z)
      tag(`${m.name} · ${m.fsm.state} · e ${m.energy.toFixed(2)} · age ${Math.round((m.age / m.lifespan) * 100)}%`, sx * S, sy * S - 11 * U, '#9ff5e4')
    }
    const D = w.deer
    const [dx, dy] = project(D.x, 0, D.z)
    tag(`${D.fsm.state} · thirst ${D.thirst.toFixed(2)}`, dx * S, dy * S - 14 * U, '#e8c29a')
    ctx.textAlign = 'left'
    const wx = w.weather
    const asleep = PROPS.huts.map((_, i) => hutOccupancy(w, i)).reduce((a, b) => a + b, 0)
    const lines = [
      `weather ${wx.fsm.state} ${wx.manual ? '(manual)' : Math.ceil(wx.timer) + 's'}   pool ${w.poolLevel.toFixed(2)}`,
      `fire ${w.fire.fsm.state} · fuel ${w.fire.fuel.toFixed(2)} · heat ${w.fire.heat.toFixed(2)}   pile ${w.pile}   sticks ${w.sticks.length}`,
      `knight ${w.knight.fsm.state} · vigil ${Math.round((w.knight.vigil / w.knight.vigilLength) * 100)}%   frog ${w.frog.fsm.state}   crow ${w.crow.fsm.state}   village ${w.mush.length}   asleep ${asleep}   glowcaps ${w.memorials.length}`,
    ]
    lines.forEach((l, i) => tag(l, 4 * U, (6 + i * 4.5) * U, '#f08a3c'))
    ctx.restore()
  }
}
