/**
 * Dark Forest: a small firelit clearing with a primitive simulation.
 * Mount it on a canvas whose parent decides the available space; the canvas
 * is letterboxed to 16:9 and rendered at an integer multiple of 320x180.
 */
import { Renderer } from './renderer'
import { createWorld, dropStick, isRaining, step, toggleRain, type World } from './sim'
import { H, W, unproject } from './world'

export interface DarkForestOptions {
  glow?: boolean
  debug?: boolean
  rain?: boolean
  /** Called whenever a toggle changes, so the page can reflect it in its controls. */
  onChange?: (state: DarkForestState) => void
}

export interface DarkForestState {
  rain: boolean
  glow: boolean
  debug: boolean
  paused: boolean
}

export interface DarkForest {
  toggleRain(): void
  toggleGlow(): void
  toggleDebug(): void
  togglePause(): void
  state(): DarkForestState
  destroy(): void
}

const MAX_SCALE = 8

export function startDarkForest(canvas: HTMLCanvasElement, options: DarkForestOptions = {}): DarkForest {
  const world: World = createWorld()
  const renderer = new Renderer(canvas)
  const opts = { glow: options.glow ?? true, debug: options.debug ?? false }
  let paused = false
  if (options.rain) toggleRain(world)

  const state = (): DarkForestState => ({ rain: isRaining(world), glow: opts.glow, debug: opts.debug, paused })
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
  const toWorld = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    const q = unproject(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H)
    return q ? { x: q[0], z: q[1] } : null
  }
  const onMove = (e: PointerEvent) => (world.cursor = toWorld(e))
  const onLeave = () => (world.cursor = null)
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
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (!paused) step(world, dt, renderer.isOpenWater)
    renderer.render(world, opts)
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
