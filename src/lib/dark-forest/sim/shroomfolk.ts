/**
 * Shroomfolk. Needs: warmth (stay near the fire) and energy (rest in a hut).
 * Jobs: keep the fire fed, keep the woodpile stocked, keep the grove candles
 * lit. They age, and every life ends one of two ways, both told in the story
 * feed. The quiet grove is where the knight's companions lie; the shroomfolk
 * learned from him to honour the dead there.
 *
 *   sprouting | arriving -> idle
 *   idle -> feed -> stoke -> idle                          (fire low, logs in the pile)
 *   idle -> toHut -> entering -> asleep -> exiting -> idle (tired, and there's room)
 *   idle -> fetch -> haul -> idle                          (pile running short, a stick lying about)
 *   idle -> wander -> idle                                 (otherwise)
 *   idle -> farewell -> departing -> (gone)                (old: a last moment by the knight, then the road)
 *   idle -> wilting -> (gone, leaves a glowcap)            (old: back to the soil in the quiet grove)
 *   idle -> tend -> idle                                   (the grove candles are out or burning low)
 *   idle -> visit -> idle                                  (now and then, sit by a friend's glowcap)
 *   idle -> keep -> idle                                   (the keeper, once the knight has gone)
 *
 * Reacts to: fire:low (drop what you're doing and feed it), stick:dropped
 * (someone go get it), rain:start (wake up and come out, they love the rain).
 */
import { clamp, rand } from '../util'
import { GROVE, GROVE_SPOTS, HUT, PROPS } from '../world'
import { fsm } from './fsm'
import { ROAD, candlesNeedTending, countIn, freeGroveSpot, freeSpotNear, freshName, isElder, isRaining, lightRadius, moveTo, tell } from './helpers'
import type { Ctx, Def, Mush, MushState, Stick, World } from './types'

export interface MushOptions {
  size?: number
  home?: number
  /** Fraction of the lifespan already lived. */
  aged?: number
  state?: MushState
}

export function createMush(w: World, x: number, z: number, o: MushOptions = {}): Mush {
  const size = o.size ?? 1
  const lifespan = rand(260, 420)
  return {
    fsm: fsm<MushState>(o.state ?? (size < 1 ? 'sprouting' : 'idle')),
    id: Math.random(),
    name: freshName(w),
    age: (o.aged ?? 0) * lifespan,
    lifespan,
    route: [],
    sink: 0,
    gone: false,
    spot: null,
    lastVisit: -999,
    x,
    z,
    tx: x,
    tz: z,
    flip: false,
    wait: rand(0, 2),
    warmth: 0.8,
    energy: rand(0.45, 1),
    home: o.home ?? (Math.random() * PROPS.huts.length) | 0,
    size,
    carrying: false,
    claim: null,
    hut: null,
  }
}

/** A traveler walks up the road from off-screen and joins the village. */
export function createTraveler(w: World): Mush {
  const [sx, sz] = ROAD[ROAD.length - 1]
  const m = createMush(w, sx, sz, { aged: rand(0.1, 0.4), state: 'arriving' })
  m.route = [...ROAD]
    .reverse()
    .slice(1)
    .concat([freeSpotNear(w, 16, 30)])
  ;[m.tx, m.tz] = m.route[0]
  return m
}

const PILE_SPOT = [PROPS.woodpile.x - 3, PROPS.woodpile.z + 3] as const
const MAX_FETCHERS = 2
const WORKING: MushState[] = ['fetch', 'haul', 'feed', 'stoke']
const doorX = (hut: number) => PROPS.huts[hut].x + HUT.doorDx

/** A hut with a free bed (counting those already on their way), preferring home. */
function hutWithRoom(m: Mush, ctx: Ctx): number | null {
  const taken = (i: number) => ctx.w.mush.filter((o) => o !== m && o.hut === i).length
  const order = [m.home, ...PROPS.huts.map((_, i) => i).filter((i) => i !== m.home)]
  return order.find((i) => taken(i) < HUT.capacity) ?? null
}

const adult = (m: Mush) => m.size >= 1
const someoneFeeding = (ctx: Ctx) => countIn(ctx.w.mush, 'feed', 'stoke') > 0
const fetchers = (ctx: Ctx) => countIn(ctx.w.mush, 'fetch', 'haul')

const wantsToFeed = (m: Mush, ctx: Ctx) => adult(m) && ctx.w.fire.fsm.state === 'low' && ctx.w.pile > 0 && !someoneFeeding(ctx)

function claim(m: Mush, s: Stick): MushState {
  s.claimed = true
  m.claim = s
  return 'fetch'
}

/** Walk a route; true once the last waypoint is reached. */
function followRoute(m: Mush, speed: number, dt: number): boolean {
  if (!moveTo(m, speed, dt)) return false
  m.route.shift()
  if (!m.route.length) return true
  ;[m.tx, m.tz] = m.route[0]
  return false
}

const pace = (m: Mush) => (isElder(m) ? 0.7 : 1)

/** What to do next, in priority order. */
function decide(m: Mush, ctx: Ctx): MushState {
  const w = ctx.w
  // the end of a life: half set off down the road, half go back to the soil
  if (m.age > m.lifespan) return Math.random() < 0.5 ? 'farewell' : 'wilting'
  if (wantsToFeed(m, ctx)) return 'feed'
  // tired: go home to rest (in the rain they'd rather stay out, unless exhausted)
  if (adult(m) && m.energy < 0.3 && (!isRaining(w) || m.energy < 0.1)) {
    const hut = hutWithRoom(m, ctx)
    if (hut !== null) {
      m.hut = hut
      return 'toHut'
    }
  }
  // the grove candles: someone goes to relight them once the rain has passed
  if (adult(m) && !isRaining(w) && candlesNeedTending(w) && countIn(w.mush, 'tend') === 0) return 'tend'
  const free = w.sticks.filter((s) => !s.claimed && s.landed)
  if (adult(m) && w.pile < 5 && free.length && fetchers(ctx) < MAX_FETCHERS) {
    const nearest = free.reduce((a, b) => (Math.hypot(a.x - m.x, a.z - m.z) < Math.hypot(b.x - m.x, b.z - m.z) ? a : b))
    return claim(m, nearest)
  }
  // the keeper sits in the knight's place by the fire
  if (w.keeperId === m.id && Math.random() < 0.6) return 'keep'
  // now and then, sit a while by a friend's glowcap
  if (adult(m) && w.memorials.length && !isRaining(w) && w.t - m.lastVisit > 90 && Math.random() < 0.12) {
    m.spot = (Math.random() * w.memorials.length) | 0
    return 'visit'
  }
  return 'wander'
}

/** Interrupt light work (idling, wandering) to answer the fire. */
const answerFire = (m: Mush, ctx: Ctx) => (wantsToFeed(m, ctx) ? 'feed' : undefined)

const answerStick = (m: Mush, ctx: Ctx, s: Stick) => (adult(m) && !s.claimed && ctx.w.pile < 9 && fetchers(ctx) < MAX_FETCHERS ? claim(m, s) : undefined)

export const mushMachine: Def<Mush, MushState> = {
  name: 'shroomfolk',
  always: (m, ctx, dt) => {
    const near = Math.hypot(m.x, m.z) < lightRadius(ctx.w) * 0.55
    m.warmth = clamp(m.warmth + dt * (near ? 0.08 : -0.05) * (isRaining(ctx.w) ? 0.6 : 1))
    if (m.fsm.state === 'asleep') m.energy = clamp(m.energy + dt / 10)
    else if (adult(m)) m.energy = clamp(m.energy - dt / (WORKING.includes(m.fsm.state) ? 60 : 100))
    m.age += dt
  },
  states: {
    sprouting: {
      update: (m, _ctx, dt) => ((m.size = Math.min(1, m.size + dt / 25)) >= 1 ? 'idle' : undefined),
    },
    arriving: {
      update: (m, _ctx, dt) => (followRoute(m, 5, dt) ? 'idle' : undefined),
    },
    idle: {
      enter: (m) => (m.wait = rand(0.5, 3)),
      update: (m, ctx, dt) => ((m.wait -= dt) <= 0 ? decide(m, ctx) : undefined),
      on: { 'fire:low': answerFire, 'stick:dropped': answerStick },
    },
    wander: {
      enter: (m, ctx) => {
        const range = m.warmth < 0.35 ? 26 : isRaining(ctx.w) ? 70 : 40 // cold ones stay close
        ;[m.tx, m.tz] = freeSpotNear(ctx.w, 16, range)
      },
      update: (m, ctx, dt) => (moveTo(m, (isRaining(ctx.w) ? 7 : 5) * pace(m), dt) ? 'idle' : undefined),
      on: { 'fire:low': answerFire, 'stick:dropped': answerStick },
    },
    fetch: {
      enter: (m) => {
        m.tx = m.claim!.x
        m.tz = m.claim!.z
      },
      update: (m, ctx, dt) => {
        const s = m.claim
        if (!s || !ctx.w.sticks.includes(s)) return 'idle'
        if (!moveTo(m, 9, dt)) return
        ctx.w.sticks.splice(ctx.w.sticks.indexOf(s), 1)
        return 'haul'
      },
      exit: (m) => {
        if (m.claim) m.claim.claimed = false
        m.claim = null
      },
    },
    haul: {
      enter: (m) => {
        m.carrying = true
        ;[m.tx, m.tz] = PILE_SPOT
      },
      update: (m, ctx, dt) => {
        if (!moveTo(m, 7, dt)) return
        ctx.w.pile = Math.min(9, ctx.w.pile + 1)
        return 'idle'
      },
      exit: (m) => (m.carrying = false),
    },
    feed: {
      enter: (m) => ([m.tx, m.tz] = PILE_SPOT),
      update: (m, ctx, dt) => {
        if (!moveTo(m, 7, dt)) return
        if (ctx.w.pile <= 0) return 'idle'
        ctx.w.pile--
        return 'stoke'
      },
    },
    stoke: {
      enter: (m) => {
        m.carrying = true
        m.tx = 6
        m.tz = 4
      },
      update: (m, ctx, dt) => {
        if (!moveTo(m, 6, dt)) return
        ctx.emit('fire:fed', { amount: 0.22 })
        return 'idle'
      },
      exit: (m) => (m.carrying = false),
    },
    toHut: {
      // walk up to the door
      enter: (m) => {
        m.tx = doorX(m.hut!)
        m.tz = PROPS.huts[m.hut!].z + HUT.front
      },
      update: (m, _ctx, dt) => (moveTo(m, 6, dt) ? 'entering' : undefined),
    },
    entering: {
      // step through the open door; the hut's walls hide them as they pass inside
      enter: (m) => (m.tz = PROPS.huts[m.hut!].z + HUT.inside),
      update: (m, _ctx, dt) => (moveTo(m, 3, dt) ? 'asleep' : undefined),
    },
    asleep: {
      update: (m, ctx, dt) => {
        if (Math.random() < dt * 0.5) ctx.w.zs.push({ hut: m.hut!, age: 0 })
        return m.energy >= 1 ? 'exiting' : undefined
      },
      on: { 'rain:start': () => 'exiting' },
    },
    farewell: {
      // one last moment beside the knight
      enter: (m, ctx) => {
        m.tx = ctx.w.knight.x + 6
        m.tz = ctx.w.knight.z + 3
        m.wait = 3
      },
      update: (m, _ctx, dt) => {
        if (!moveTo(m, 4 * pace(m), dt)) return
        m.flip = true // face the knight
        return (m.wait -= dt) <= 0 ? 'departing' : undefined
      },
    },
    departing: {
      enter: (m, ctx) => {
        m.route = ROAD.map((p) => [...p] as [number, number])
        ;[m.tx, m.tz] = m.route[0]
        tell(ctx.w, `${m.name} said goodbye to the knight and set off down the road, lantern in hand.`)
      },
      update: (m, _ctx, dt) => {
        if (followRoute(m, 4 * pace(m), dt)) m.gone = true
      },
    },
    wilting: {
      // walk to the quiet grove, settle among the others, and sink back into the soil
      enter: (m, ctx) => {
        let spot = freeGroveSpot(ctx.w)
        if (spot === null) {
          // the grove is full: the oldest glowcap has faded, and its place is free again
          const old = ctx.w.memorials.shift()!
          tell(ctx.w, `${old.name}'s glowcap has faded. The grove still remembers.`)
          spot = old.spot
        }
        m.spot = spot
        ;[m.tx, m.tz] = GROVE_SPOTS[spot]
        m.sink = 0
      },
      update: (m, ctx, dt) => {
        if (!moveTo(m, 3.5 * pace(m), dt)) return
        if ((m.sink += dt / 6) < 1) return
        ctx.w.memorials.push({ x: m.x, z: m.z, name: m.name, ph: Math.random() * 6, spot: m.spot! })
        tell(ctx.w, `Old ${m.name} returned to the soil in the quiet grove. A glowcap grows there now.`)
        m.gone = true
      },
    },
    tend: {
      // walk to the grove and relight every candle
      enter: (m) => {
        m.tx = GROVE.x - 2
        m.tz = GROVE.z + 7
        m.wait = 3
      },
      update: (m, ctx, dt) => {
        if (!moveTo(m, 5 * pace(m), dt)) return
        m.flip = true
        if ((m.wait -= dt) > 0) return
        const wasOut = ctx.w.candles.some((c) => !c.lit)
        for (const c of ctx.w.candles) {
          c.wax = 1
          c.lit = true
        }
        if (wasOut && Math.random() < 0.6) tell(ctx.w, `${m.name} relit the candles in the quiet grove.`)
        return 'idle'
      },
      on: { 'rain:start': () => 'idle' },
    },
    visit: {
      // sit a while by a friend's glowcap
      enter: (m, ctx) => {
        const g = ctx.w.memorials[m.spot ?? 0]
        if (!g) return
        m.tx = g.x + 2.5
        m.tz = g.z + 1.5
        m.wait = rand(6, 10)
        m.lastVisit = ctx.w.t
        if (Math.random() < 0.5) tell(ctx.w, `${m.name} sat by ${g.name}'s glowcap for a while.`)
      },
      update: (m, ctx, dt) => {
        if (!ctx.w.memorials[m.spot ?? 0]) return 'idle'
        if (!moveTo(m, 4 * pace(m), dt)) return
        m.flip = true // face the glowcap
        return (m.wait -= dt) <= 0 ? 'idle' : undefined
      },
      exit: (m) => (m.spot = null),
      on: { 'fire:low': answerFire, 'rain:start': () => 'idle' },
    },
    keep: {
      // the keeper sits where the knight sat, facing the fire
      enter: (m, ctx) => {
        m.tx = ctx.w.knight.home.x
        m.tz = ctx.w.knight.home.z
        m.wait = rand(12, 25)
      },
      update: (m, _ctx, dt) => {
        if (!moveTo(m, 4 * pace(m), dt)) return
        m.flip = false
        return (m.wait -= dt) <= 0 ? 'idle' : undefined
      },
      on: { 'fire:low': answerFire },
    },
    exiting: {
      enter: (m) => {
        m.x = m.tx = doorX(m.hut!)
        m.z = PROPS.huts[m.hut!].z + HUT.inside
        m.tz = PROPS.huts[m.hut!].z + HUT.front + 1
      },
      update: (m, _ctx, dt) => (moveTo(m, 3, dt) ? 'idle' : undefined),
      exit: (m) => (m.hut = null),
    },
  },
}
