import { DATA } from './art'

/**
 * Everything the renderer can be told, in one live object. The page's toggles and the editor
 * write here; the renderer reads it every frame, so changes show on the next frame.
 */

/** What the scene shows: the final image, or one of the buffers behind it. */
export type View = 'final' | 'albedo' | 'normals' | 'depth' | 'light' | 'shadows' | 'emissive' | 'hover' | 'tiles' | 'gpudiff'

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
  { view: 'gpudiff', label: 'CPU vs GPU', hint: 'the CPU frame, with every pixel where the GPU disagrees in red (x8)' },
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

/** Every sound source, each on its own bus: on/off, solo, level, how often, pitch or tone. */
export type SoundKey = 'crackle' | 'flames' | 'log' | 'rain' | 'drips' | 'thunder' | 'wind' | 'frog' | 'crickets' | 'owl' | 'crow' | 'door'

export const SOUND_SOURCES: { key: SoundKey; label: string; hint: string; rate?: string; pitch: string }[] = [
  { key: 'crackle', label: 'fire crackle', hint: 'clicks and pops, busier the bigger the fire', rate: 'busyness', pitch: 'pitch' },
  { key: 'flames', label: 'flames', hint: 'the soft broadband breath under the crackling', pitch: 'brightness' },
  { key: 'log', label: 'log landing', hint: 'a thump and a burst of crackling when wood goes on', pitch: 'pitch' },
  { key: 'rain', label: 'rain', hint: 'a broad wash of distant rain, denser as the shower builds', pitch: 'brightness' },
  { key: 'drips', label: 'leaf & pool drops', hint: 'soft nearby leaf taps and splashes; a few drops on the pool', rate: 'how many', pitch: 'pitch' },
  { key: 'thunder', label: 'thunder', hint: 'a rumble arriving after each flash', pitch: 'depth' },
  { key: 'wind', label: 'wind', hint: 'in the trees; stronger with cloud and rain', rate: 'gustiness', pitch: 'tone' },
  { key: 'frog', label: 'frog', hint: 'a ribbit when the frog croaks', pitch: 'pitch' },
  { key: 'crickets', label: 'crickets', hint: 'on clear dry nights', rate: 'how often', pitch: 'pitch' },
  { key: 'owl', label: 'owl', hint: 'hoo… hoo-hoo, now and then on clear nights', rate: 'how often', pitch: 'pitch' },
  { key: 'crow', label: 'crow', hint: 'a caw as it takes off', pitch: 'pitch' },
  { key: 'door', label: 'hut doors', hint: 'a creak as a door opens', pitch: 'pitch' },
]

export interface SoundTune {
  on: boolean
  gain: number
  /** How often (one-shots) or how restless (beds): a multiplier. */
  rate: number
  /** Pitch, or tone for the beds: a multiplier. */
  pitch: number
}

/** A source's tuning as saved in data/sound.json. */
export const defaultSoundTune = (key: SoundKey): SoundTune => ({ on: true, gain: 1, rate: 1, pitch: 1, ...(DATA.sound[key] as Partial<SoundTune>) })
export const soundDefaults = () => Object.fromEntries(SOUND_SOURCES.map(({ key }) => [key, defaultSoundTune(key)])) as Record<SoundKey, SoundTune>

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
    /** Light the frame on the GPU (WebGL2) when it can; the CPU path is the reference. */
    gpu: true,
    /** The soundscape (browsers only allow it after a click or a key). */
    sound: { on: false, volume: 0.7, sources: soundDefaults(), solo: null as SoundKey | null },
  }
}

export type Settings = ReturnType<typeof defaults>
export const settings: Settings = defaults()

/** Put one part of the settings back to its defaults. */
export function resetSettings<K extends keyof Settings>(key: K) {
  settings[key] = defaults()[key]
}
export const defaultLightTune = tune
