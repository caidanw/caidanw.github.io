/** Weather: dry <-> raining on a timer, or by hand. Announces rain:start / rain:end. */
import { rand } from '../util'
import { fsm } from './fsm'
import type { Def, Weather, WeatherState } from './types'

export const createWeather = (): Weather => ({ fsm: fsm<WeatherState>('dry'), timer: 55, manual: false })

const toggle = (e: Weather, other: WeatherState) => {
  e.manual = true
  return other
}

export const weatherMachine: Def<Weather, WeatherState> = {
  name: 'weather',
  states: {
    dry: {
      enter: (e, ctx) => {
        e.timer = rand(60, 110)
        ctx.emit('rain:end')
      },
      update: (e, _ctx, dt) => (!e.manual && (e.timer -= dt) <= 0 ? 'raining' : undefined),
      on: { 'weather:toggle': (e) => toggle(e, 'raining') },
    },
    raining: {
      enter: (e, ctx) => {
        e.timer = rand(30, 50)
        ctx.emit('rain:start')
      },
      update: (e, _ctx, dt) => (!e.manual && (e.timer -= dt) <= 0 ? 'dry' : undefined),
      on: { 'weather:toggle': (e) => toggle(e, 'dry') },
    },
  },
}
