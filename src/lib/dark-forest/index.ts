/**
 * Dark Forest: a small firelit clearing with a primitive simulation.
 * Mount it on a canvas whose parent decides the available space; the canvas
 * is letterboxed to 16:9 and rendered at an integer multiple of 320x180.
 */
import { Renderer } from './renderer'
import { createWorld, dropStick, isRaining, step, toggleRain, type World } from './sim'
import { H, W, unproject, RELICS, type Relic } from './world'

export interface DarkForestOptions {
  glow?: boolean
  debug?: boolean
  rain?: boolean
  /** Time multiplier for the sim (handy for watching slow behaviour). */
  speed?: number
  /** Light objects with generated normal maps (default on). */
  normals?: boolean
  /** What stands planted in the fire. */
  relic?: Relic
  /** Called with each line of the village's story as it happens. */
  onStory?: (line: string) => void
  /** Called whenever a toggle changes, so the page can reflect it in its controls. */
  onChange?: (state: DarkForestState) => void
}

export interface DarkForestState {
  rain: boolean
  glow: boolean
  debug: boolean
  normals: boolean
  paused: boolean
}

export interface DarkForest {
  toggleRain(): void
  toggleGlow(): void
  toggleDebug(): void
  toggleNormals(): void
  togglePause(): void
  state(): DarkForestState
  destroy(): void
}

const MAX_SCALE = 8

export function startDarkForest(canvas: HTMLCanvasElement, options: DarkForestOptions = {}): DarkForest {
  const world: World = createWorld()
  const relic = options.relic && RELICS.includes(options.relic) ? options.relic : 'crook'
  const renderer = new Renderer(canvas, relic)
  const opts = { glow: options.glow ?? true, debug: options.debug ?? false, normals: options.normals ?? true }
  let paused = false
  if (options.rain) toggleRain(world)

  const state = (): DarkForestState => ({ rain: isRaining(world), glow: opts.glow, debug: opts.debug, normals: opts.normals, paused })
  const changed = () => options.onChange?.(state())

  // ---------- sizing: fit 16:9 in the parent, render at an integer scale for crisp pixels
  const fit = () => {
    const box = canvas.parentElement!.getBoundingClientRect()
    const cssW = Math.min(box.width, (box.height * W) / H)
    const cssH = (cssW * H) / W
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    const scale = Math.max(1, Math.min(MAX_SCALE, Math.ceil((cssW * devicePixelRatio) / W)))
    if (canvas.width !== W * scale) renderer.setScale(scale)
  }
  const ro = new ResizeObserver(fit)
  ro.observe(canvas.parentElement!)
  fit()

  // ---------- input: hover names things and spooks the deer; click drops a stick
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
  const onDown = (e: PointerEvent) => {
    const p = toWorld(e)
    if (p) dropStick(world, p)
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('pointerdown', onDown)

  // ---------- loop
  let raf = 0
  let last = performance.now()
  let wasRaining = isRaining(world)
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000) * (options.speed ?? 1)
    last = now
    if (!paused) step(world, dt, renderer.isOpenWater)
    renderer.render(world, opts)
    while (world.story.length) options.onStory?.(world.story.shift()!)
    // weather changes on its own timer (and toggles land a tick later), so report it when it happens
    if (isRaining(world) !== wasRaining) {
      wasRaining = !wasRaining
      changed()
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return {
    toggleRain() {
      toggleRain(world) // takes effect on the next tick; the loop reports the change
    },
    toggleGlow() {
      opts.glow = !opts.glow
      changed()
    },
    toggleDebug() {
      opts.debug = !opts.debug
      changed()
    },
    toggleNormals() {
      opts.normals = !opts.normals
      changed()
    },
    togglePause() {
      paused = !paused
      changed()
    },
    state,
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointerdown', onDown)
    },
  }
}
