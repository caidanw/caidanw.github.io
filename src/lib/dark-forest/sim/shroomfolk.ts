/**
 * Shroomfolk. Needs: warmth (stay near the fire) and rest (nap in the hollow).
 * Jobs: keep the woodpile stocked and keep the brazier fed.
 *
 *   sprouting -> idle
 *   idle -> feed -> stoke -> idle          (fire low, logs in the pile)
 *   idle -> fetch -> haul -> idle          (pile running short, a stick lying about)
 *   idle -> toHut -> asleep -> idle        (warm, dry, sleepy)
 *   idle -> wander -> idle                 (otherwise)
 *
 * Reacts to: fire:low (drop what you're doing and feed it), stick:dropped
 * (someone go get it), rain:start (wake up, they love the rain).
 */
import { clamp, rand } from '../util'
import { PROPS } from '../world'
import { fsm } from './fsm'
import { countIn, freeSpotNear, isRaining, lightRadius, moveTo } from './helpers'
import type { Ctx, Def, Mush, MushState, Stick } from './types'

export const createMush = (x: number, z: number, size = 1): Mush => ({
  fsm: fsm<MushState>(size < 1 ? 'sprouting' : 'idle'),
  id: Math.random(),
  x,
  z,
  tx: x,
  tz: z,
  flip: false,
  wait: rand(0, 2),
  warmth: 0.8,
  size,
  carrying: false,
  claim: null,
  hut: null,
  sleepT: 0,
})

const PILE_SPOT = [PROPS.woodpile.x - 3, PROPS.woodpile.z + 3] as const
const MAX_FETCHERS = 2
const MAX_SLEEPERS = 3

const adult = (m: Mush) => m.size >= 1
const someoneFeeding = (ctx: Ctx) => countIn(ctx.w.mush, 'feed', 'stoke') > 0
const fetchers = (ctx: Ctx) => countIn(ctx.w.mush, 'fetch', 'haul')

const wantsToFeed = (m: Mush, ctx: Ctx) => adult(m) && ctx.w.brazier.fsm.state === 'low' && ctx.w.pile > 0 && !someoneFeeding(ctx)

function claim(m: Mush, s: Stick): MushState {
  s.claimed = true
  m.claim = s
  return 'fetch'
}

/** What to do next, in priority order. */
function decide(m: Mush, ctx: Ctx): MushState {
  const w = ctx.w
  if (wantsToFeed(m, ctx)) return 'feed'
  const free = w.sticks.filter((s) => !s.claimed)
  if (adult(m) && w.pile < 5 && free.length && fetchers(ctx) < MAX_FETCHERS) {
    const nearest = free.reduce((a, b) => (Math.hypot(a.x - m.x, a.z - m.z) < Math.hypot(b.x - m.x, b.z - m.z) ? a : b))
    return claim(m, nearest)
  }
  if (!isRaining(w) && m.warmth > 0.7 && Math.random() < 0.15 && countIn(w.mush, 'toHut', 'asleep') < MAX_SLEEPERS) return 'toHut'
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
  },
  states: {
    sprouting: {
      update: (m, _ctx, dt) => ((m.size = Math.min(1, m.size + dt / 25)) >= 1 ? 'idle' : undefined),
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
      update: (m, ctx, dt) => (moveTo(m, isRaining(ctx.w) ? 7 : 5, dt) ? 'idle' : undefined),
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
      enter: (m) => {
        m.hut = (Math.random() * PROPS.huts.length) | 0
        const hut = PROPS.huts[m.hut]
        m.tx = hut.x - 0.5
        m.tz = hut.z + 1.5
        m.sleepT = rand(8, 18)
      },
      update: (m, _ctx, dt) => (moveTo(m, 6, dt) ? 'asleep' : undefined),
    },
    asleep: {
      update: (m, ctx, dt) => {
        if (Math.random() < dt * 0.5) ctx.w.zs.push({ hut: m.hut!, age: 0 })
        return (m.sleepT -= dt) <= 0 ? 'idle' : undefined
      },
      exit: (m) => (m.hut = null),
      on: { 'rain:start': () => 'idle' },
    },
  },
}
