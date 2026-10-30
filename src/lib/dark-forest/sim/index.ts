/**
 * The sim loop: tick every agent's state machine, run the ambient systems,
 * then deliver this tick's events to every agent.
 *
 * To add an entity: give it an `fsm`, write a `Def` for it, and register it in
 * `agents()`. To add an interaction: add an event to `SimEvents`, emit it
 * from one machine, handle it in another.
 */
import { H, HORIZON, PROPS, W, type Point } from '../world'
import { rand } from '../util'
import { send, tick, type Fsm, type MachineDef } from './fsm'
import { stepAmbient } from './ambient'
import { nav } from './nav'
import { fireMachine, createFire } from './fire'
import { createCrow, createFrog, crowMachine, frogMachine } from './critters'
import { createDeer, deerMachine } from './deer'
import { freeSpotNear, stickSpot, tell } from './helpers'
import { createKnight, knightMachine } from './knight'
import { createMush, createTraveler, mushMachine } from './shroomfolk'
import type { Ctx, SimEvents, World } from './types'
import { createWeather, weatherMachine } from './weather'

export * from './types'
export { doorOpen, hutOccupancy, isElder, isMoving, isRaining, lightRadius, perchPos, WALKING } from './helpers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Agent = [MachineDef<any, Ctx, string, SimEvents>, { fsm: Fsm<string> }]

/** Every entity with a state machine, in update order. */
function agents(w: World): Agent[] {
  return [
    [weatherMachine, w.weather],
    [fireMachine, w.fire],
    [knightMachine, w.knight],
    [deerMachine, w.deer],
    [frogMachine, w.frog],
    [crowMachine, w.crow],
    ...w.mush.map((m): Agent => [mushMachine, m]),
  ]
}

const ctxFor = (w: World): Ctx => ({
  w,
  emit: (type, ...payload) => w.queue.push({ type, payload: payload[0] } as World['queue'][number]),
})

export function createWorld(): World {
  const w: World = {
    t: 0,
    pile: 2,
    poolLevel: 1,
    rune: 0,
    weather: createWeather(),
    fire: createFire(),
    knight: createKnight(),
    deer: createDeer(),
    frog: createFrog(),
    crow: createCrow(),
    mush: [],
    sticks: [],
    stickTimer: 3,
    memorials: [],
    candles: PROPS.graves.map(() => ({ wax: rand(0.5, 1), lit: true })),
    keeperId: null,
    arrivalTimer: 90,
    story: [],
    embers: [],
    drops: Array.from({ length: 220 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: rand(170, 240), stop: rand(HORIZON, H) })),
    ripples: [],
    zs: [],
    puffs: [],
    flies: Array.from({ length: 12 }, (_, i) => ({ seed: i * 13.7, x: 0, y: 0, z: 0, a: 0 })),
    shooting: null,
    nextShoot: 20,
    cursor: null,
    queue: [],
  }
  for (let i = 0; i < 3; i++) w.sticks.push(stickSpot(w))
  // a village of five, at different points in their lives
  const start: [number, number][] = [
    [-26, -10],
    [20, -14],
    [-6, 16],
    [30, 6],
    [-40, -20],
  ]
  start.forEach(([x, z], i) => w.mush.push(createMush(w, x, z, { home: i % 2, aged: Math.random() * 0.8 })))
  return w
}

/**
 * Advance the world by dt seconds. `isOpenWater(sx, sy)` reports whether a
 * screen pixel is visible pool surface (so raindrops know where to ripple).
 */
export function step(w: World, dt: number, isOpenWater: (sx: number, sy: number) => boolean) {
  const ctx = ctxFor(w)
  w.t += dt
  // keep the walking grid current: the pool's level (paths are re-found when it moves) and the seated knight
  if (Math.abs(nav.level - w.poolLevel) > 0.03) {
    nav.level = w.poolLevel
    nav.version++
  }
  const seated = w.knight.fsm.state === 'resting' || w.knight.fsm.state === 'nodding'
  nav.knight = seated ? { x: w.knight.x, z: w.knight.z } : null
  if (w.cursor) ctx.emit('cursor', w.cursor)

  for (const [def, e] of agents(w)) tick(def, e, ctx, dt)
  stepAmbient(w, dt, isOpenWater)
  if (w.queue.length) dispatch(w, ctx)
  w.mush = w.mush.filter((m) => !m.gone)
  welcomeTravelers(w, dt)
  chooseKeeper(w)
}

/** Once the knight has gone to rest, the oldest of the village takes his place by the fire. */
function chooseKeeper(w: World) {
  if (w.knight.fsm.state !== 'gone') return
  if (w.keeperId !== null && w.mush.some((m) => m.id === w.keeperId)) return
  const ending = ['farewell', 'departing', 'wilting']
  const candidates = w.mush.filter((m) => m.size >= 1 && !ending.includes(m.fsm.state))
  if (!candidates.length) return
  const keeper = candidates.reduce((a, b) => (a.age > b.age ? a : b))
  const first = w.keeperId === null
  w.keeperId = keeper.id
  tell(
    w,
    first ? `${keeper.name} took up the knight's place by the fire. The village calls them the keeper now.` : `${keeper.name} is the keeper of the fire now.`,
  )
}

const MAX_VILLAGE = 7

/** When the village gets small, now and then someone new comes up the road. */
function welcomeTravelers(w: World, dt: number) {
  if (w.mush.length >= 4 || (w.arrivalTimer -= dt) > 0) return
  w.arrivalTimer = rand(60, 120)
  const m = createTraveler(w)
  w.mush.push(m)
  tell(w, `A traveler came up the road. The village took them in and called them ${m.name}.`)
}

/** Deliver queued events to every agent. Events raised while handling are delivered in the next round. */
function dispatch(w: World, ctx: Ctx) {
  for (let round = 0; round < 4 && w.queue.length; round++) {
    const events = w.queue
    w.queue = []
    for (const ev of events) {
      if (ev.type === 'rain:end') sproutAfterRain(w)
      if (ev.type === 'rain:start') snuffCandles(w)
      for (const [def, e] of agents(w)) send(def, e, ctx, ev.type, ev.payload)
    }
  }
}

/** World-level reaction: rain puts out the grove candles (someone relights them after). */
function snuffCandles(w: World) {
  if (!w.candles.some((c) => c.lit)) return
  for (const c of w.candles) c.lit = false
  if (Math.random() < 0.5) tell(w, 'The rain put out the candles in the quiet grove.')
}

/** World-level reaction: every shower leaves a new sprout behind. */
function sproutAfterRain(w: World) {
  if (w.mush.length >= MAX_VILLAGE) return
  const [x, z] = freeSpotNear(w, 30, 44)
  const m = createMush(w, x, z, { size: 0.1 })
  w.mush.push(m)
  tell(w, `A sprout pushed up through the wet earth after the rain. They named it ${m.name}.`)
}

// ---------- input from the page ----------
export function toggleRain(w: World) {
  ctxFor(w).emit('weather:toggle')
}

/** Drop a stick from `height` above ground point p. It falls, tumbles and lands (see ambient.ts). */
export function dropStick(w: World, p: Point, height: number) {
  if (w.sticks.length >= 10) return
  w.sticks.push({ x: p.x, z: p.z, claimed: false, y: height, vy: 0, angle: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 16, landed: false, glint: 1 })
}
