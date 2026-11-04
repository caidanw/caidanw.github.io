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
 * Tending the fire is attention, not an alarm: each notices for themselves when the fire is
 * smaller than they'd like (if they're awake, close and not busy), sooner the more diligent
 * they are. What size they'd like depends on who they are (likes, hardy), how cold they are,
 * and how merry: a festive mood spreads between those gathered by the fire, and merry
 * shroomfolk feed it again and again until it blazes. When the pile runs low, someone goes
 * to the forest's edge for wood.
 *
 * Reacts to: stick:dropped (someone go get it), rain:start (wake up and come out, they love
 * the rain), rain:end (merry, if they're by the fire).
 */
import { clamp, rand } from '../util'
import { GROVE, GROVE_SPOTS, HUT, PROPS } from '../world'
import { fsm } from './fsm'
import {
  ROAD,
  candlesNeedTending,
  countIn,
  freeGroveSpot,
  freeSpotNear,
  freshName,
  isElder,
  isRaining,
  face,
  lightRadius,
  moveTo,
  restingStick,
  tell,
} from './helpers'
import { inPool } from '../world'
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
    diligence: rand(0.15, 1),
    hardy: rand(0, 1),
    likes: rand(0.25, 0.9),
    merry: 0,
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
const MAX_FETCHERS = 3
const WORKING: MushState[] = ['fetch', 'haul', 'feed', 'stoke']
const doorX = (hut: number) => PROPS.huts[hut].x + HUT.doorDx

/** A hut with a free bed (counting those already on their way), preferring home. */
function hutWithRoom(m: Mush, ctx: Ctx): number | null {
  const taken = (i: number) => ctx.w.mush.filter((o) => o !== m && o.hut === i).length
  const order = [m.home, ...PROPS.huts.map((_, i) => i).filter((i) => i !== m.home)]
  return order.find((i) => taken(i) < HUT.capacity) ?? null
}

const adult = (m: Mush) => m.size >= 1
const fetchers = (ctx: Ctx) => countIn(ctx.w.mush, 'fetch', 'haul')

const feeders = (ctx: Ctx) => countIn(ctx.w.mush, 'feed', 'stoke')

/** States in which they'd notice the fire (awake, not busy with a job). */
const ATTENTIVE: MushState[] = ['idle', 'wander', 'keep', 'visit']

/** The fire they'd like right now: their taste, more when cold (unless hardy) or in the rain, much more when merry. */
export const fireWanted = (m: Mush, w: World) => Math.min(1.25, m.likes + (1 - m.warmth) * (1 - m.hardy) * 0.35 + (isRaining(w) ? 0.12 : 0) + m.merry * 0.75)

/** Would they go and feed the fire? (Close enough to see it, wood in the pile, not too many already at it.) */
const wantsToFeed = (m: Mush, ctx: Ctx) => {
  const w = ctx.w
  if (!adult(m) || w.pile <= 0 || feeders(ctx) >= (m.merry > 0.4 ? 2 : 1)) return false
  if (Math.hypot(m.x, m.z) > 26 + 18 * w.fire.heat) return false // only those near enough to see it's dwindling
  return w.fire.fuel < fireWanted(m, w) - 0.08
}

/** How likely (per second) they are to notice: the diligent sooner, and the further the fire is from what they'd like. */
const urge = (m: Mush, ctx: Ctx) =>
  (0.005 + 0.2 * m.diligence + 0.4 * m.merry) * (m.warmth > 0.7 && m.merry < 0.2 ? 0.5 : 1) * clamp((fireWanted(m, ctx.w) - ctx.w.fire.fuel) / 0.4) // warm and content: in no hurry

/** Somewhere at the forest's edge to look for wood. */
function forestEdge(w: World): [number, number] {
  for (let k = 0; k < 20; k++) {
    const a = Math.random() * Math.PI * 2
    const x = Math.cos(a) * rand(62, 85) * 1.2
    const z = Math.sin(a) * rand(45, 60) - 10
    if (z < 30 && !inPool(x, z, w.poolLevel * 1.3)) return [x, z]
  }
  return [-60, -30]
}

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
  if (wantsToFeed(m, ctx) && Math.random() < 0.3 + m.diligence + m.merry) return 'feed'
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
  // the pile is running low and nothing's lying about: go to the forest's edge for wood
  if (adult(m) && w.pile < 6 && !free.length && fetchers(ctx) < MAX_FETCHERS && Math.random() < 0.15 + 0.45 * m.diligence + 0.3 * m.merry) {
    const s = { ...restingStick(...forestEdge(w)), bundle: true }
    w.sticks.push(s)
    return claim(m, s)
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

const answerStick = (m: Mush, ctx: Ctx, s: Stick) => (adult(m) && !s.claimed && ctx.w.pile < 9 && fetchers(ctx) < MAX_FETCHERS ? claim(m, s) : undefined)

export const mushMachine: Def<Mush, MushState> = {
  name: 'shroomfolk',
  always: (m, ctx, dt) => {
    const w = ctx.w
    const d = Math.hypot(m.x, m.z)
    const near = d < lightRadius(w) * 0.55
    m.warmth = clamp(m.warmth + dt * (near ? 0.08 : -0.05) * (isRaining(w) ? 0.6 : 1))
    if (m.fsm.state === 'asleep')
      m.energy = clamp(m.energy + dt / 28) // a proper sleep: often several are asleep at once, and the fire is left alone
    else if (adult(m)) m.energy = clamp(m.energy - dt / (WORKING.includes(m.fsm.state) ? 60 : 100))
    m.age += dt
    // a festive mood fades slowly, and spreads between those gathered by the fire
    m.merry = Math.max(0, m.merry - dt / 110)
    if (d < 34 && m.fsm.state !== 'asleep') {
      // it passes on weaker than it is (catching up toward 80% of the merriest nearby), so it fades unless renewed
      let around = 0
      let merriest = 0
      for (const o of w.mush) {
        if (o === m || o.fsm.state === 'asleep' || Math.hypot(o.x - m.x, o.z - m.z) > 14) continue
        around++
        merriest = Math.max(merriest, o.merry)
      }
      if (merriest * 0.8 > m.merry) m.merry += (merriest * 0.8 - m.merry) * dt * 0.25
      // now and then, with enough of them gathered, someone starts a song
      if (around >= 2 && Math.random() < dt / 170) {
        m.merry = Math.min(1, m.merry + 0.6)
        if (Math.random() < 0.5) tell(w, `${m.name} started a song by the fire, and the others joined in.`)
      }
    }
    // noticing the fire: awake, not busy, close enough, and it's smaller than they'd like
    if (ATTENTIVE.includes(m.fsm.state) && m.fsm.time > 1 && wantsToFeed(m, ctx) && Math.random() < dt * urge(m, ctx)) return 'feed'
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
      on: { 'stick:dropped': answerStick },
    },
    wander: {
      enter: (m, ctx) => {
        const range = m.warmth < 0.35 ? 26 : isRaining(ctx.w) ? 70 : 40 // cold ones stay close
        const back = 16 + Math.max(0, ctx.w.fire.heat - 0.7) * 16 // and everyone sits further back from a blaze
        ;[m.tx, m.tz] = freeSpotNear(ctx.w, back, Math.max(back + 8, range))
      },
      update: (m, ctx, dt) => (moveTo(m, (isRaining(ctx.w) ? 7 : 5) * pace(m), dt) ? 'idle' : undefined),
      on: { 'stick:dropped': answerStick },
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
        m.bundle = !!s.bundle
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
        ctx.w.pile = Math.min(9, ctx.w.pile + (m.bundle ? 2 : 1))
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
        // merry: straight back for another one
        return m.merry > 0.4 && wantsToFeed(m, ctx) ? 'feed' : 'idle'
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
      update: (m, _ctx, dt) => (moveTo(m, 3, dt, true) ? 'asleep' : undefined),
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
      update: (m, ctx, dt) => {
        if (!moveTo(m, 4 * pace(m), dt)) return
        face(m, ctx.w.knight.x)
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
        face(m, GROVE.x) // toward the candles
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
        face(m, ctx.w.memorials[m.spot ?? 0].x)
        return (m.wait -= dt) <= 0 ? 'idle' : undefined
      },
      exit: (m) => (m.spot = null),
      on: { 'rain:start': () => 'idle' },
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
        face(m, 0) // the fire
        return (m.wait -= dt) <= 0 ? 'idle' : undefined
      },
    },
    exiting: {
      enter: (m) => {
        m.x = m.tx = doorX(m.hut!)
        m.z = PROPS.huts[m.hut!].z + HUT.inside
        m.tz = PROPS.huts[m.hut!].z + HUT.front + 1
      },
      update: (m, _ctx, dt) => (moveTo(m, 3, dt, true) ? 'idle' : undefined),
      exit: (m) => (m.hut = null),
    },
  },
  on: {
    // the rain's over: those by the fire are glad of it
    'rain:end': (m) => {
      if (Math.hypot(m.x, m.z) < 34) m.merry = Math.min(1, m.merry + 0.4)
    },
  },
}
