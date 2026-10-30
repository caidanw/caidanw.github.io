/**
 * The brazier burns fuel (faster in rain). Its state is a reading of the fuel
 * level; entering `low` announces fire:low so someone can come and feed it.
 *
 * What you *see* is `heat`, which chases fuel with lag like a real fire: a new
 * log takes a couple of seconds to catch (with a short flare as it does), and
 * rain makes it hiss and sink. Light, flame and bloom all follow heat.
 */
import { fsm } from './fsm'
import { burst, isRaining } from './helpers'
import type { Brazier, BrazierState, Ctx, Def } from './types'

export const createBrazier = (): Brazier => ({ fsm: fsm<BrazierState>('steady'), fuel: 0.7, heat: 0.7, flare: 0 })

const reading = (fuel: number): BrazierState => (fuel > 0.7 ? 'roaring' : fuel > 0.4 ? 'steady' : 'low')

const CATCH_RATE = 0.9 // how quickly heat rises toward fuel (per second)
const COOL_RATE = 2.2 // how quickly it falls

const burn = (e: Brazier, ctx: Ctx, dt: number) => {
  e.fuel = Math.max(0.12, e.fuel - dt * (1 / 150 + (isRaining(ctx.w) ? 1 / 65 : 0)))
  e.flare *= Math.exp(-dt / 1.4)
  const target = e.fuel + e.flare
  e.heat += (target - e.heat) * (1 - Math.exp(-(target > e.heat ? CATCH_RATE : COOL_RATE) * dt))
  return reading(e.fuel)
}

export const brazierMachine: Def<Brazier, BrazierState> = {
  name: 'brazier',
  always: burn,
  states: {
    roaring: {},
    steady: {},
    low: { enter: (_e, ctx) => ctx.emit('fire:low') },
  },
  on: {
    'fire:fed': (e, ctx, { amount }) => {
      e.fuel = Math.min(1, e.fuel + amount)
      e.flare = 0.16
      burst(ctx.w, 28, 1.4)
      return reading(e.fuel)
    },
    'rain:start': (e) => {
      e.flare -= 0.12
    },
  },
}
