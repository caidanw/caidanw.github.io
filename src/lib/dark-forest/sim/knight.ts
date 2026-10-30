/**
 * The last knight keeps a vigil by the fire for the three companions who lie
 * in the quiet grove. He nods off when the fire burns low, and feeding it
 * wakes him.
 *
 * The long arc: after a long vigil (vigilLength), on a dry night with the fire
 * burning well, he rises, takes up his sword, walks to the grove, kneels, and
 * lays his sword beside theirs. Then he rests with them. The village chooses a
 * keeper to sit in his place (see sim/index.ts).
 *
 *   resting <-> nodding
 *   resting -> rising -> walking -> kneeling -> gone
 */
import { KNIGHT_GRAVE, PROPS } from '../world'
import { rand } from '../util'
import { fsm } from './fsm'
import { isRaining, moveTo, tell } from './helpers'
import type { Def, Knight, KnightState, World } from './types'

export const createKnight = (): Knight => ({
  ...PROPS.knight,
  tx: PROPS.knight.x,
  tz: PROPS.knight.z,
  flip: false,
  home: { ...PROPS.knight },
  fsm: fsm<KnightState>('resting'),
  headDown: false,
  vigil: 0,
  vigilLength: rand(4, 8) * 60, // most visitors watch for a few minutes; the end of his story should be there to find
  route: [],
  sword: 'planted',
  step: 0,
})

/** The long vigil is over, and tonight is a good night for it. */
const ready = (e: Knight, w: World) => e.vigil >= e.vigilLength && !isRaining(w) && w.fire.fsm.state !== 'low'

export const knightMachine: Def<Knight, KnightState> = {
  name: 'knight',
  always: (e, _ctx, dt) => {
    if (e.fsm.state === 'resting' || e.fsm.state === 'nodding') e.vigil += dt
  },
  states: {
    resting: {
      enter: (e) => (e.headDown = false),
      update: (e, ctx) => {
        if (ready(e, ctx.w)) return 'rising'
        return ctx.w.fire.fsm.state === 'low' && e.fsm.time > 3 ? 'nodding' : undefined
      },
    },
    nodding: {
      update: (e, ctx) => {
        e.headDown = Math.sin(e.fsm.time * 0.7) > -0.3
        return ctx.w.fire.fsm.state !== 'low' ? 'resting' : undefined
      },
      on: { 'fire:fed': () => 'resting' },
    },
    rising: {
      enter: (e, ctx) => {
        e.sword = 'carried'
        tell(ctx.w, 'After a long vigil, the last knight rose from the fire and took up his sword.')
      },
      update: (e) => (e.fsm.time > 2.5 ? 'walking' : undefined),
    },
    walking: {
      // around the fire and the pool, to the quiet grove
      enter: (e) => {
        e.route = [
          [-12, 14],
          [28, 15],
          [56, -4],
          [KNIGHT_GRAVE.x - 3, KNIGHT_GRAVE.z + 2],
        ]
        ;[e.tx, e.tz] = e.route[0]
      },
      update: (e, _ctx, dt) => {
        e.step += dt
        if (!moveTo(e, 3, dt)) return
        e.route.shift()
        if (!e.route.length) return 'kneeling'
        ;[e.tx, e.tz] = e.route[0]
      },
    },
    kneeling: {
      enter: (e) => (e.flip = false),
      update: (e, ctx) => {
        if (e.fsm.time < 5) return
        e.sword = 'laid'
        tell(ctx.w, 'He laid his sword beside theirs, and rested at last. Four went on.')
        return 'gone'
      },
    },
    gone: {},
  },
}
