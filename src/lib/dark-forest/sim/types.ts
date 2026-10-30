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
  /** Waypoints toward (tx, tz) and the target they were found for (see nav.ts). */
  path?: [number, number][]
  pathKey?: string
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

export type KnightState = 'resting' | 'nodding' | 'rising' | 'walking' | 'kneeling' | 'gone'
export interface Knight extends Walker {
  fsm: Fsm<KnightState>
  headDown: boolean
  /** Where he sits by the fire (the keeper sits here after him). */
  home: Point
  /** Seconds of vigil kept, and how long it lasts before he goes to rest. */
  vigil: number
  vigilLength: number
  route: [number, number][]
  sword: 'planted' | 'carried' | 'laid'
  step: number
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
  | 'wilting' // or: walk to the quiet grove and return to the soil
  | 'tend' // relight the candles at the grove
  | 'visit' // sit a while by a friend's glowcap
  | 'keep' // the keeper sits in the knight's place by the fire
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
  /** Grove spot they're heading to (wilting), or the glowcap they're visiting. */
  spot: number | null
  /** When they last visited the grove (sim seconds). */
  lastVisit: number
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
  /** Height above the ground while falling, vertical speed, and tumble. */
  y: number
  vy: number
  angle: number
  spin: number
  landed: boolean
  /** 1 when freshly dropped by the visitor, fading to 0 after it lands (so you can see where it went). */
  glint: number
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
  /** Glowcaps that grew where shroomfolk returned to the soil, each on a grove spot. */
  memorials: (Point & { name: string; ph: number; spot: number })[]
  /** One candle per grave: wax left (1 = fresh) and whether it's lit. */
  candles: { wax: number; lit: boolean }[]
  /** The shroomfolk who took up the knight's place, once he's gone. */
  keeperId: number | null
  /** Countdown to the next traveler, if the village is small. */
  arrivalTimer: number
  /** Story lines waiting to be shown by the page. */
  story: string[]
  // ambient particles (no state machines; just systems)
  embers: { ox: number; oy: number; vx: number; vy: number; life: number; age: number; ph: number }[]
  drops: { x: number; y: number; v: number; stop: number }[]
  ripples: { x: number; y: number; age: number }[]
  zs: { hut: number; age: number }[]
  /** Dust kicked up where something lands. */
  puffs: { x: number; z: number; age: number; seed: number }[]
  flies: { seed: number; x: number; y: number; z: number; a: number }[]
  shooting: { x: number; y: number; age: number } | null
  nextShoot: number
  cursor: Point | null
  /** Events emitted this tick, delivered to every agent at the end of the tick. */
  queue: SimEvent[]
}
