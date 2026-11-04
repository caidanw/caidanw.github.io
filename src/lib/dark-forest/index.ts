/**
 * Dark Forest: a small firelit clearing with a primitive simulation.
 * Mount it on a canvas whose parent decides the available space; the canvas
 * is letterboxed to 16:9 and rendered at an integer multiple of 640x360.
 */
import { Renderer, type PixelInfo, type Timings } from './renderer'
import { onArtChange } from './art'
import { Soundscape } from './audio'
import { forgetNormals } from './normals'
import { resetSettings, settings } from './settings'
import { createWorld, dropStick, isRaining, step, toggleRain, type World } from './sim'
import { rebuildNav } from './sim/nav'
import { createMush } from './sim/shroomfolk'
import { H, RES, W, unproject, RELICS, type Relic } from './world'

export interface DarkForestOptions {
  glow?: boolean
  debug?: boolean
  rain?: boolean
  /** Time multiplier for the sim (handy for watching slow behaviour). */
  speed?: number
  /** Light objects with generated normal maps (default on). */
  normals?: boolean
  /** Seconds of vigil before the knight goes to rest in the grove (default: a random 4 to 8 minutes). */
  vigil?: number
  /** What stands planted in the fire. */
  relic?: Relic
  /** Called with each line of the village's story as it happens. */
  onStory?: (line: string) => void
  /** Called whenever a toggle changes, so the page can reflect it in its controls. */
  onChange?: (state: DarkForestState) => void
  /** Called when a pixel is picked with the inspect tool. */
  onInspect?: () => void
}

export interface DarkForestState {
  sound: boolean
  rain: boolean
  glow: boolean
  debug: boolean
  normals: boolean
  paused: boolean
}

export interface DarkForestStats {
  fps: number
  timings: Timings
  lights: number
  /** Which path drew the last frame, and (in the CPU vs GPU view) how far apart they are. */
  path: 'cpu' | 'gpu'
  gpuDiff: { mean: number; max: number; over: number } | null
}

export interface DarkForest {
  toggleRain(): void
  /** Sound on or off (call from a click or a key: browsers require it). */
  toggleSound(): void
  setVolume(v: number): void
  /** How loud it is right now (0..1). */
  soundLevel(): number
  toggleGlow(): void
  toggleDebug(): void
  toggleNormals(): void
  togglePause(): void
  state(): DarkForestState
  /** The live world, for debugging and tests. */
  inspect(): World
  /** What the pointer is over right now: [name, lore], or null. */
  hovering(): [string, string] | null
  // ---- for the editor
  /** Advance one frame (while paused). */
  stepFrame(): void
  stats(): DarkForestStats
  /** Everything about the inspected pixel, or null. */
  pixel(): PixelInfo | null
  relic(): Relic
  setRelic(r: Relic): void
  /** Someone new walks in, at the edge of the clearing. */
  spawnShroomfolk(): void
  /** The knight's vigil ends now (he rises on the next good night). */
  endVigil(): void
  /** The hover tag key of the thing at this framebuffer pixel. */
  tagAt(x: number, y: number): string | null
  /** The lights of the last frame. */
  lights(): Renderer['lastLights']
  destroy(): void
}

const MAX_SCALE = 8

export function startDarkForest(canvas: HTMLCanvasElement, options: DarkForestOptions = {}): DarkForest {
  const world: World = createWorld()
  const renderer = new Renderer(canvas, options.relic && RELICS.includes(options.relic) ? options.relic : 'antler')
  if (options.glow === false) settings.layers.bloom = false
  if (options.normals === false) settings.layers.normals = false
  if (options.debug) settings.overlays.states = true
  if (options.speed) settings.speed = options.speed
  if (options.rain) toggleRain(world)
  if (options.vigil) world.knight.vigilLength = options.vigil

  const sound = new Soundscape()
  sound.setVolume(settings.sound.volume)
  const state = (): DarkForestState => ({
    sound: settings.sound.on,
    rain: isRaining(world),
    glow: settings.layers.bloom,
    debug: settings.overlays.states,
    normals: settings.layers.normals,
    paused: settings.paused,
  })
  const changed = () => options.onChange?.(state())

  // ---------- sizing: fit 16:9 in the parent, render at an integer scale for crisp pixels
  const fit = () => {
    const parent = canvas.parentElement!
    const box = parent.getBoundingClientRect()
    let cssW = Math.min(box.width, (box.height * W) / H)
    // a parent marked data-crisp (the editor) gets a whole number of device pixels per pixel,
    // as long as that still fills most of the space
    if ('crisp' in parent.dataset) {
      const k = Math.floor((cssW * devicePixelRatio) / W)
      if (k >= 1 && (k * W) / devicePixelRatio >= cssW * 0.75) cssW = (k * W) / devicePixelRatio
    }
    const cssH = (cssW * H) / W
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    const scale = Math.max(1, Math.min(MAX_SCALE, Math.ceil((cssW * devicePixelRatio) / W)))
    if (canvas.width !== W * scale) renderer.setScale(scale)
  }
  // the art changed (the editor): forget cached normals and rebuild the static layer
  const offArt = onArtChange((file) => {
    forgetNormals()
    renderer.rebuildStatic()
    if (file === 'lights') resetSettings('lights')
    if (file === 'layout') rebuildNav()
  })

  const ro = new ResizeObserver(fit)
  ro.observe(canvas.parentElement!)
  fit()

  // ---------- input: hover names things and spooks the deer; click drops a stick (or inspects)
  const toScreen = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }
  const toWorld = (e: PointerEvent) => {
    const { x, y } = toScreen(e)
    const q = unproject(x, y)
    return q ? { x: q[0], z: q[1] } : null
  }
  const onMove = (e: PointerEvent) => {
    renderer.pointer = toScreen(e) // hover works anywhere, including over the sky
    world.cursor = toWorld(e) // the deer only cares about the ground
  }
  const onLeave = () => {
    renderer.pointer = null
    world.cursor = null
  }
  // a dropped stick starts at the cursor and falls to the ground beneath it
  const DROP_HEIGHT = 22
  const onDown = (e: PointerEvent) => {
    const { x, y } = toScreen(e)
    if (settings.tool === 'move') return // the editor handles it
    if (settings.tool === 'inspect') {
      settings.inspect = { x: Math.floor(x), y: Math.floor(y) }
      options.onInspect?.()
      return
    }
    let q = unproject(x, y + DROP_HEIGHT * 1.35 * RES)
    for (let i = 0; i < 3 && q; i++) q = unproject(x, y + DROP_HEIGHT * (1 + q[1] * 0.0028) * 1.35 * RES) // refine for depth
    if (q) dropStick(world, { x: q[0], z: q[1] }, DROP_HEIGHT)
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('pointerdown', onDown)

  // ---------- loop
  let raf = 0
  let last = performance.now()
  let wasRaining = isRaining(world)
  let stepOnce = false
  let fps = 60
  const frame = (now: number) => {
    const real = now - last
    fps = fps * 0.95 + (1000 / Math.max(1, real)) * 0.05
    const dt = Math.min(0.05, real / 1000) * settings.speed
    last = now
    if (!settings.paused || stepOnce) step(world, stepOnce ? 1 / 60 : dt, renderer.isOpenWater)
    stepOnce = false
    if (settings.fireHeat !== null) world.fire.heat = settings.fireHeat
    renderer.render(world)
    if (settings.sound.on) sound.update(world)
    while (world.story.length) options.onStory?.(world.story.shift()!)
    // weather changes on its own timer (and toggles land a tick later), so report it when it happens
    if (isRaining(world) !== wasRaining) {
      wasRaining = !wasRaining
      changed()
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  const toggle = (f: () => void) => () => {
    f()
    changed()
  }
  return {
    toggleRain() {
      toggleRain(world) // takes effect on the next tick; the loop reports the change
    },
    toggleSound: toggle(() => {
      settings.sound.on = !settings.sound.on
      if (settings.sound.on) sound.start()
      else sound.stop()
    }),
    setVolume(v) {
      settings.sound.volume = v
      sound.setVolume(v)
    },
    soundLevel: () => sound.level(),
    toggleGlow: toggle(() => (settings.layers.bloom = !settings.layers.bloom)),
    toggleDebug: toggle(() => (settings.overlays.states = !settings.overlays.states)),
    toggleNormals: toggle(() => (settings.layers.normals = !settings.layers.normals)),
    togglePause: toggle(() => (settings.paused = !settings.paused)),
    state,
    inspect: () => world,
    hovering: () => renderer.hovered,
    stepFrame: () => (stepOnce = true),
    stats: () => ({ fps, timings: renderer.timings, lights: renderer.lastLights.length, path: renderer.path, gpuDiff: renderer.gpuDiff }),
    pixel: () => (settings.inspect ? renderer.inspectPixel(settings.inspect.x, settings.inspect.y) : null),
    relic: () => renderer.relic,
    setRelic: (r) => (renderer.relic = r),
    spawnShroomfolk() {
      const a = Math.random() * Math.PI * 2
      world.mush.push(createMush(world, Math.cos(a) * 30, Math.sin(a) * 22))
    },
    endVigil: () => (world.knight.vigilLength = Math.min(world.knight.vigilLength, world.knight.vigil)),
    lights: () => renderer.lastLights,
    tagAt: (x, y) => renderer.tagAt(x, y),
    destroy() {
      cancelAnimationFrame(raf)
      offArt()
      sound.stop()
      ro.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointerdown', onDown)
    },
  }
}
