/**
 * The fire burns fuel, and the bigger it is the hungrier it is: a blaze eats wood several
 * times faster than a low fire, so it only stays big if it's fed again and again. Rain eats
 * at it too. Its state is a reading of the fuel:
 *
 *   embers < low < steady < roaring < blazing        (fuel 0 .. 1.3)
 *
 * Nobody is told to feed it any more: each shroomfolk notices for themselves (see
 * shroomfolk.ts), and the knight leans over and adds a log during his vigil. So how big it
 * burns comes from who's awake, close, cold or merry, and whether there's wood.
 *
 * What you *see* is `heat`, which chases fuel with lag like a real fire: a new log takes a
 * couple of seconds to catch (with a short flare as it does), and rain makes it hiss and sink.
 * Light, flame and bloom all follow heat.
 */
import { fsm } from './fsm'
import { burst, isRaining, tell } from './helpers'
import type { Fire, FireState, Ctx, Def } from './types'

export const createFire = (): Fire => ({ fsm: fsm<FireState>('steady'), fuel: 0.7, heat: 0.7, flare: 0, lastBlaze: -999 })

export const MAX_FUEL = 1.3
const reading = (fuel: number): FireState => (fuel > 1.0 ? 'blazing' : fuel > 0.72 ? 'roaring' : fuel > 0.42 ? 'steady' : fuel > 0.15 ? 'low' : 'embers')

const CATCH_RATE = 0.9 // how quickly heat rises toward fuel (per second)
const COOL_RATE = 2.2 // how quickly it falls

const burn = (e: Fire, ctx: Ctx, dt: number) => {
  // a little all the time, and much more the bigger it burns; rain eats at it
  const rate = (1 / 170 + 0.012 * e.fuel * e.fuel) * (isRaining(ctx.w) ? 2.6 : 1)
  e.fuel = Math.max(0.02, e.fuel - dt * rate)
  e.flare *= Math.exp(-dt / 1.4)
  const target = Math.min(MAX_FUEL, e.fuel + e.flare)
  e.heat += (target - e.heat) * (1 - Math.exp(-(target > e.heat ? CATCH_RATE : COOL_RATE) * dt))
  // a blaze spits sparks
  if (e.heat > 1 && Math.random() < dt * 2) burst(ctx.w, 3, 1.3)
  return reading(e.fuel)
}

export const fireMachine: Def<Fire, FireState> = {
  name: 'fire',
  always: burn,
  states: {
    embers: { enter: (_e, ctx) => ctx.emit('fire:low') },
    low: { enter: (_e, ctx) => ctx.emit('fire:low') },
    steady: {},
    roaring: {},
    blazing: {
      enter: (e, ctx) => {
        if (ctx.w.t - e.lastBlaze > 240) tell(ctx.w, 'The fire roared up high, and the whole clearing glowed.')
        e.lastBlaze = ctx.w.t
      },
    },
  },
  on: {
    'fire:fed': (e, ctx, { amount }) => {
      e.fuel = Math.min(MAX_FUEL, e.fuel + amount)
      e.flare = 0.16
      burst(ctx.w, 28, 1.4)
      return reading(e.fuel)
    },
    'rain:start': (e) => {
      e.flare -= 0.12
    },
  },
}
