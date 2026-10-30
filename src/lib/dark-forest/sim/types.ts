import type { Point } from '../world'
import type { Fsm, MachineDef } from './fsm'

/** Everything entities can tell each other. Add an event here, then handle it in any machine. */
export interface SimEvents {
  'weather:toggle': undefined
  'rain:start': undefined
  'rain:end': undefined
  'fire:low': undefined
  'fire:fed': { amount: number }
  'stick:dropped': Stick
  /** The cursor is over the ground (sent every tick while it is). */
  cursor: Point
}
export type SimEvent = { [K in keyof SimEvents]: { type: K; payload: SimEvents[K] } }[keyof SimEvents]

export interface Ctx {
  w: World
  emit<K extends keyof SimEvents>(type: K, ...payload: SimEvents[K] extends undefined ? [] : [SimEvents[K]]): void
}

/** Shorthand for a machine definition in this sim. */
export type Def<E extends { fsm: Fsm<S> }, S extends string> = MachineDef<E, Ctx, S, SimEvents>

export interface Walker extends Point {
  tx: number
  tz: number
  flip: boolean
}

// ---------- entities (each owns an fsm) ----------
export type WeatherState = 'dry' | 'raining'
export interface Weather {
  fsm: Fsm<WeatherState>
  timer: number
  /** Once the visitor toggles rain by hand, the automatic cycle stops. */
  manual: boolean
}

export type FireState = 'roaring' | 'steady' | 'low'
export interface Fire {
  fsm: Fsm<FireState>
  fuel: number
  /** What the fire looks like right now: chases fuel with lag, so a new log catches gradually. */
  heat: number
  /** A short-lived kick added on top of fuel (a fresh log roars, rain makes it hiss and sink). */
  flare: number
}

export type KnightState = 'resting' | 'nodding'
export interface Knight extends Point {
  fsm: Fsm<KnightState>
  headDown: boolean
}

export type MushState =
  | 'arriving' // a traveler coming up the road
  | 'sprouting'
  | 'idle'
  | 'wander'
  | 'fetch'
  | 'haul'
  | 'feed'
  | 'stoke'
  | 'toHut'
  | 'entering'
  | 'asleep'
  | 'exiting'
  | 'farewell' // end of life: one last moment by the knight...
  | 'departing' // ...then off down the road with a lantern
  | 'wilting' // or: walk to the forest edge and return to the soil
export interface Mush extends Walker {
  fsm: Fsm<MushState>
  id: number
  name: string
  /** Seconds lived, and how long this one gets. Past ~75% they're an elder. */
  age: number
  lifespan: number
  /** Route for arriving / departing (consumed front to back). */
  route: [number, number][]
  /** 0..1 while sinking back into the soil. */
  sink: number
  /** Set when they've left the scene for good; removed at the end of the tick. */
  gone: boolean
  wait: number
  warmth: number
  /** Rest need: drains while awake (faster while working), refills asleep in a hut. */
  energy: number
  /** The hut this one prefers to sleep in. */
  home: number
  size: number
  carrying: boolean
  claim: Stick | null
  hut: number | null
}

export type DeerState = 'graze' | 'walk' | 'toPool' | 'drink' | 'flee'
export interface Deer extends Walker {
  fsm: Fsm<DeerState>
  wait: number
  thirst: number
  step: number
}

export type FrogState = 'sit' | 'hop'
export interface Frog {
  fsm: Fsm<FrogState>
  pad: number
  from: number
  progress: number
  next: number
  croak: number
}

export type CrowState = 'perch' | 'flying' | 'away' | 'returning'
export interface Crow {
  fsm: Fsm<CrowState>
  x: number
  y: number
  vx: number
  vy: number
}

export interface Stick extends Point {
  claimed: boolean
}

export interface World {
  t: number
  pile: number
  poolLevel: number
  rune: number
  weather: Weather
  fire: Fire
  knight: Knight
  deer: Deer
  frog: Frog
  crow: Crow
  mush: Mush[]
  sticks: Stick[]
  stickTimer: number
  /** Glowcaps that grew where shroomfolk returned to the soil. */
  memorials: (Point & { name: string; ph: number })[]
  /** Countdown to the next traveler, if the village is small. */
  arrivalTimer: number
  /** Story lines waiting to be shown by the page. */
  story: string[]
  // ambient particles (no state machines; just systems)
  embers: { ox: number; oy: number; vx: number; vy: number; life: number; age: number; ph: number }[]
  drops: { x: number; y: number; v: number; stop: number }[]
  ripples: { x: number; y: number; age: number }[]
  zs: { hut: number; age: number }[]
  flies: { seed: number; x: number; y: number; z: number; a: number }[]
  shooting: { x: number; y: number; age: number } | null
  nextShoot: number
  cursor: Point | null
  /** Events emitted this tick, delivered to every agent at the end of the tick. */
  queue: SimEvent[]
}
