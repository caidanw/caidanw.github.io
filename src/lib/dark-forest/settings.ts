import { DATA } from './art'

/**
 * Everything the renderer can be told, in one live object. The page's toggles and the editor
 * write here; the renderer reads it every frame, so changes show on the next frame.
 */

/** What the scene shows: the final image, or one of the buffers behind it. */
export type View = 'final' | 'albedo' | 'normals' | 'depth' | 'light' | 'shadows' | 'emissive' | 'hover' | 'tiles'

export const VIEWS: { view: View; label: string; hint: string }[] = [
  { view: 'final', label: 'final', hint: 'the finished frame' },
  { view: 'albedo', label: 'albedo', hint: 'colour before any lighting' },
  { view: 'normals', label: 'normals', hint: 'surface direction: red right, green up, blue toward you' },
  { view: 'depth', label: 'depth', hint: 'nearer is brighter; ground blue, sky black' },
  { view: 'light', label: 'light only', hint: 'the light arriving at each pixel, shadows included' },
  { view: 'shadows', label: 'shadow maps', hint: 'how shadowed the ground is from every shadow-casting light; objects brown' },
  { view: 'emissive', label: 'emissive', hint: 'the glow layer: fire, caps, embers, glints' },
  { view: 'hover', label: 'hover tags', hint: 'which named thing each pixel belongs to' },
  { view: 'tiles', label: 'light tiles', hint: 'how many lights each 32px tile gathers' },
]

/** Every source of light, by kind. Tuning applies to all lights of a kind. */
export type LightKind = 'fire' | 'lantern' | 'candle' | 'window' | 'rune' | 'cap' | 'ember' | 'carried' | 'foxfire' | 'glowcap' | 'firefly'

export const LIGHT_KINDS: { kind: LightKind; label: string }[] = [
  { kind: 'fire', label: 'campfire' },
  { kind: 'lantern', label: 'road lantern' },
  { kind: 'candle', label: 'grove candles' },
  { kind: 'window', label: 'hut windows' },
  { kind: 'rune', label: 'trigon rune' },
  { kind: 'cap', label: 'shroomfolk caps' },
  { kind: 'ember', label: "keeper's ember" },
  { kind: 'carried', label: 'carried lanterns' },
  { kind: 'foxfire', label: 'foxfire' },
  { kind: 'glowcap', label: 'glowcaps' },
  { kind: 'firefly', label: 'fireflies' },
]

export interface LightTune {
  on: boolean
  /** Brightness multiplier. */
  gain: number
  /** Reach multiplier. */
  radius: number
  /** Added to the light's height, in world units. */
  height: number
  /** Flicker multiplier. */
  wobble: number
  /** Spill-past-the-radius multiplier. */
  tail: number
  shadows: 'default' | 'on' | 'off'
}

/** A kind's tuning as saved in data/lights.json (the editor's 'save as defaults'). */
const tune = (kind: LightKind): LightTune => ({
  on: true,
  gain: 1,
  radius: 1,
  height: 0,
  wobble: 1,
  tail: 1,
  shadows: 'default',
  ...(DATA.lights[kind] as Partial<LightTune>),
})

function defaults() {
  return {
    layers: {
      bloom: true,
      normals: true,
      emissives: true,
      reflections: true,
      mist: true,
      glints: true,
      stars: true,
      rain: true,
      labels: true,
      shadows: true,
    },
    view: 'final' as View,
    overlays: {
      /** Where each light is and how far it reaches. */
      lights: false,
      /** Shadow casters' footprints. */
      casters: false,
      /** The walkable grid. */
      nav: false,
      /** Where everyone is walking. */
      paths: false,
      /** The old on-canvas debug text (states, needs). */
      states: false,
    },
    ambient: {
      /** Moonlight multiplier. */
      moon: 1,
      /** Mist multiplier. */
      mist: 1,
      /** Bloom multiplier. */
      bloom: 1,
    },
    lights: Object.fromEntries(LIGHT_KINDS.map(({ kind }) => [kind, tune(kind)])) as Record<LightKind, LightTune>,
    /** Highlight this kind of light in the overlay. */
    selectedLight: null as LightKind | null,
    /** Clicking the scene: play (drop a stick), inspect a pixel, or move things. */
    tool: 'play' as 'play' | 'inspect' | 'move',
    /** What the move tool has selected (a live layout object), ringed in the scene. */
    selection: null as { x: number; z: number } | null,
    /** The pixel being inspected (framebuffer coordinates). */
    inspect: null as { x: number; y: number } | null,
    /** Hold the fire at this heat (null: let it burn). */
    fireHeat: null as number | null,
    speed: 1,
    paused: false,
  }
}

export type Settings = ReturnType<typeof defaults>
export const settings: Settings = defaults()

/** Put one part of the settings back to its defaults. */
export function resetSettings<K extends keyof Settings>(key: K) {
  settings[key] = defaults()[key]
}
export const defaultLightTune = tune
