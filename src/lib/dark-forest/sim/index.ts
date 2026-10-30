/**
 * The sim loop: tick every agent's state machine, run the ambient systems,
 * then deliver this tick's events to every agent.
 *
 * To add an entity: give it an `fsm`, write a `Def` for it, and register it in
 * `agents()`. To add an interaction: add an event to `SimEvents`, emit it
 * from one machine, handle it in another.
 */
import { H, HORIZON, W, inPool, type Point } from '../world'
import { rand } from '../util'
import { send, tick, type Fsm, type MachineDef } from './fsm'
import { stepAmbient } from './ambient'
import { brazierMachine, createBrazier } from './brazier'
import { createCrow, createFrog, crowMachine, frogMachine } from './critters'
import { createDeer, deerMachine } from './deer'
import { stickSpot, freeSpotNear } from './helpers'
import { createKnight, knightMachine } from './knight'
import { createMush, mushMachine } from './shroomfolk'
import type { Ctx, SimEvents, World } from './types'
import { createWeather, weatherMachine } from './weather'

export * from './types'
export { hutOccupancy, isMoving, isRaining, lightRadius, perchPos, WALKING } from './helpers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Agent = [MachineDef<any, Ctx, string, SimEvents>, { fsm: Fsm<string> }]

/** Every entity with a state machine, in update order. */
function agents(w: World): Agent[] {
  return [
    [weatherMachine, w.weather],
    [brazierMachine, w.brazier],
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
    brazier: createBrazier(),
    knight: createKnight(),
    deer: createDeer(),
    frog: createFrog(),
    crow: createCrow(),
    mush: [createMush(-26, -10), createMush(20, -14), createMush(-6, 16), createMush(30, 6), createMush(-40, -20)],
    sticks: [],
    stickTimer: 3,
    embers: [],
    drops: Array.from({ length: 180 }, () => ({ x: Math.random() * (W + 60), y: Math.random() * H, v: rand(150, 220), stop: rand(HORIZON, H) })),
    ripples: [],
    zs: [],
    flies: Array.from({ length: 12 }, (_, i) => ({ seed: i * 13.7, x: 0, y: 0, z: 0, a: 0 })),
    shooting: null,
    nextShoot: 20,
    cursor: null,
    queue: [],
  }
  for (let i = 0; i < 3; i++) w.sticks.push(stickSpot(w))
  return w
}

/**
 * Advance the world by dt seconds. `isOpenWater(sx, sy)` reports whether a
 * screen pixel is visible pool surface (so raindrops know where to ripple).
 */
export function step(w: World, dt: number, isOpenWater: (sx: number, sy: number) => boolean) {
  const ctx = ctxFor(w)
  w.t += dt
  if (w.cursor) ctx.emit('cursor', w.cursor)

  for (const [def, e] of agents(w)) tick(def, e, ctx, dt)
  stepAmbient(w, dt, isOpenWater)
  if (w.queue.length) dispatch(w, ctx)
}

/** Deliver queued events to every agent. Events raised while handling are delivered in the next round. */
function dispatch(w: World, ctx: Ctx) {
  for (let round = 0; round < 4 && w.queue.length; round++) {
    const events = w.queue
    w.queue = []
    for (const ev of events) {
      if (ev.type === 'rain:end') sproutAfterRain(w)
      for (const [def, e] of agents(w)) send(def, e, ctx, ev.type, ev.payload)
    }
  }
}

/** World-level reaction: every shower leaves a new sprout behind. */
function sproutAfterRain(w: World) {
  if (w.mush.length >= 9) return
  const [x, z] = freeSpotNear(w, 30, 44)
  w.mush.push(createMush(x, z, 0.1))
}

// ---------- input from the page ----------
export function toggleRain(w: World) {
  ctxFor(w).emit('weather:toggle')
}

export function dropStick(w: World, p: Point) {
  if (inPool(p.x, p.z, w.poolLevel * 1.1) || w.sticks.length >= 10) return
  const stick = { x: p.x, z: p.z, claimed: false }
  w.sticks.push(stick)
  ctxFor(w).emit('stick:dropped', stick)
}
