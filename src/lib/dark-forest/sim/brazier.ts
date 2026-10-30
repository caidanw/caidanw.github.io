/**
 * The brazier burns fuel (faster in rain). Its state is just a reading of the
 * fuel level, but entering `low` announces fire:low so someone can come and
 * feed it; fire:fed tops it up with a burst of embers.
 */
import { fsm } from './fsm'
import { burst, isRaining } from './helpers'
import type { Brazier, BrazierState, Ctx, Def } from './types'

export const createBrazier = (): Brazier => ({ fsm: fsm<BrazierState>('steady'), fuel: 0.7 })

const reading = (fuel: number): BrazierState => (fuel > 0.7 ? 'roaring' : fuel > 0.4 ? 'steady' : 'low')

const burn = (e: Brazier, ctx: Ctx, dt: number) => {
  e.fuel = Math.max(0.12, e.fuel - dt * (1 / 150 + (isRaining(ctx.w) ? 1 / 65 : 0)))
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
      burst(ctx.w, 28, 1.4)
      return reading(e.fuel)
    },
  },
}
