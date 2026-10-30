/** The last knight rests by the fire, and nods off when it burns low. Feeding the fire wakes him. */
import { PROPS } from '../world'
import { fsm } from './fsm'
import type { Def, Knight, KnightState } from './types'

export const createKnight = (): Knight => ({ ...PROPS.knight, fsm: fsm<KnightState>('resting'), headDown: false })

export const knightMachine: Def<Knight, KnightState> = {
  name: 'knight',
  states: {
    resting: {
      enter: (e) => (e.headDown = false),
      update: (e, ctx) => (ctx.w.brazier.fsm.state === 'low' && e.fsm.time > 3 ? 'nodding' : undefined),
    },
    nodding: {
      update: (e, ctx) => {
        e.headDown = Math.sin(e.fsm.time * 0.7) > -0.3
        return ctx.w.brazier.fsm.state !== 'low' ? 'resting' : undefined
      },
      on: { 'fire:fed': () => 'resting' },
    },
  },
}
