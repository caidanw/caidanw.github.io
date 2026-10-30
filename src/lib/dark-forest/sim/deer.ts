/**
 * The deer. Needs: water (thirst rises over time) and safety.
 *
 *   graze -> walk -> graze      (wander the edge of the light)
 *   graze -> toPool -> drink    (when thirsty)
 *   any   -> flee               (cursor gets close)
 *
 * Reacts to: cursor (bolt), rain:start (head for the tree line).
 */
import { rand } from '../util'
import { POOL } from '../world'
import { fsm } from './fsm'
import { moveTo } from './helpers'
import type { Deer, DeerState, Def } from './types'

export const createDeer = (): Deer => ({ fsm: fsm<DeerState>('graze'), x: 110, z: -6, tx: 110, tz: -6, flip: true, wait: 2, thirst: 0.6, step: 0 })

const SPOOK_RADIUS = 22

export const deerMachine: Def<Deer, DeerState> = {
  name: 'deer',
  always: (d, _ctx, dt) => {
    d.thirst = Math.min(1.5, d.thirst + dt / 45)
  },
  states: {
    graze: {
      enter: (d) => (d.wait = d.fsm.prev === 'flee' ? rand(3, 6) : rand(3, 7)),
      update: (d, _ctx, dt) => ((d.wait -= dt) > 0 ? undefined : d.thirst > 1 ? 'toPool' : 'walk'),
    },
    walk: {
      enter: (d) => {
        d.tx = rand(55, 125) * (Math.random() < 0.75 ? 1 : -1)
        d.tz = rand(-30, 45)
      },
      update: (d, _ctx, dt) => {
        d.step += dt
        return moveTo(d, 6, dt) ? 'graze' : undefined
      },
    },
    toPool: {
      enter: (d, ctx) => {
        const a = rand(-0.5, 0.5) + (Math.random() < 0.5 ? 0 : Math.PI) // approach from the left or right shore
        d.tx = POOL.x + Math.cos(a) * POOL.rx * ctx.w.poolLevel * 1.25
        d.tz = POOL.z + Math.sin(a) * POOL.rz * ctx.w.poolLevel * 1.25
      },
      update: (d, _ctx, dt) => {
        d.step += dt
        return moveTo(d, 7, dt) ? 'drink' : undefined
      },
    },
    drink: {
      enter: (d) => {
        d.wait = rand(4, 8)
        d.flip = d.x > POOL.x
      },
      update: (d, _ctx, dt) => {
        d.thirst = Math.max(0, d.thirst - dt / 4)
        return (d.wait -= dt) <= 0 ? 'graze' : undefined
      },
    },
    flee: {
      update: (d, _ctx, dt) => {
        d.step += dt * 3
        return moveTo(d, 32, dt) ? 'graze' : undefined
      },
      on: { cursor: () => undefined }, // already running
    },
  },
  on: {
    cursor: (d, _ctx, c) => {
      const dx = d.x - c.x
      const dz = d.z - c.z
      const dist = Math.hypot(dx, dz)
      if (dist >= SPOOK_RADIUS) return
      d.tx = Math.max(-140, Math.min(140, d.x + (dx / (dist || 1)) * 70))
      d.tz = Math.max(-45, Math.min(70, d.z + (dz / (dist || 1)) * 40))
      return 'flee'
    },
    'rain:start': (d) => {
      if (d.fsm.state === 'flee') return
      d.tx = rand(92, 108) * Math.sign(d.x || 1) // the tree line, still on screen
      d.tz = rand(-30, 0)
      return 'flee'
    },
  },
}
