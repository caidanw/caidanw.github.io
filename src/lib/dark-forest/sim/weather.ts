/**
 * Weather, as a sequence rather than a switch:
 *
 *   dry -> gathering -> raining -> easing -> clearing -> dry
 *
 * Clouds drift in (gathering), lightning flickers in the distance with thunder after it,
 * then the rain starts light and gets heavier (raining), thins away (easing), and the clouds
 * drift off (clearing). Everything else reads `rain` (0..1) and `cloud`; above 0.3 counts as
 * raining, and crossing it announces rain:start / rain:end, so creatures react when the rain
 * gets real rather than at the first drop. The visitor can turn it on or off by hand; it
 * still eases in and out, just sooner.
 */
import { rand } from '../util'
import { W } from '../world'
import { fsm } from './fsm'
import type { Ctx, Def, Weather, WeatherState } from './types'

export const createWeather = (): Weather => ({
  fsm: fsm<WeatherState>('dry'),
  timer: 55,
  manual: false,
  cloud: 0,
  rain: 0,
  peak: 0.8,
  flash: 0,
  bolt: null,
  nextStrike: 8,
  thunder: [],
  raining: false,
})

/** Move v toward `to` at `rate` per second, without overshooting. */
const toward = (v: number, to: number, rate: number) => (v < to ? Math.min(to, v + rate) : Math.max(to, v - rate))

/** Lightning, now and then, while the clouds are thick. */
function strikes(e: Weather, ctx: Ctx, dt: number, often: number) {
  if ((e.nextStrike -= dt) > 0 || e.cloud < 0.45) return
  const power = rand(0.5, 1) * e.cloud
  e.flash = Math.max(e.flash, power)
  e.bolt = Math.random() < 0.7 ? { x: rand(30, W - 30), seed: (Math.random() * 1e6) | 0, age: 0 } : null // sometimes just sheet lightning
  e.thunder.push({ at: ctx.w.t + rand(0.8, 3.5), power })
  e.nextStrike = rand(6, 20) / often
}

const manual = (e: Weather, to: WeatherState) => {
  e.manual = true
  return to
}

export const weatherMachine: Def<Weather, WeatherState> = {
  name: 'weather',
  always: (e, ctx, dt) => {
    e.flash *= Math.exp(-dt * 7)
    if (e.bolt && (e.bolt.age += dt) > 0.4) e.bolt = null
    e.thunder = e.thunder.filter((t) => t.at > ctx.w.t - 2)
    // the old events, at the moment the rain gets real (or stops being)
    const now = e.rain > 0.3
    if (now !== e.raining) {
      e.raining = now
      ctx.emit(now ? 'rain:start' : 'rain:end')
    }
  },
  states: {
    dry: {
      enter: (e) => (e.timer = rand(60, 110)),
      update: (e, _ctx, dt) => {
        e.cloud = toward(e.cloud, 0, dt / 20)
        e.rain = toward(e.rain, 0, dt / 10)
        return !e.manual && (e.timer -= dt) <= 0 ? 'gathering' : undefined
      },
      on: { 'weather:toggle': (e) => manual(e, 'gathering') },
    },
    gathering: {
      // the clouds roll in; lightning in the distance
      enter: (e) => {
        e.timer = e.manual ? 7 : rand(20, 32)
        e.peak = rand(0.55, 1)
        e.nextStrike = rand(3, 8)
      },
      update: (e, ctx, dt) => {
        e.cloud = toward(e.cloud, 1, dt / (e.manual ? 6 : 18))
        strikes(e, ctx, dt, 1)
        return (e.timer -= dt) <= 0 ? 'raining' : undefined
      },
      on: { 'weather:toggle': (e) => manual(e, 'clearing') },
    },
    raining: {
      // it starts light and gets heavier
      enter: (e) => (e.timer = rand(30, 55)),
      update: (e, ctx, dt) => {
        e.cloud = toward(e.cloud, 1, dt / 6)
        e.rain = toward(e.rain, e.peak, dt / 16)
        strikes(e, ctx, dt, 1.4)
        return !e.manual && (e.timer -= dt) <= 0 ? 'easing' : undefined
      },
      on: { 'weather:toggle': (e) => manual(e, 'easing') },
    },
    easing: {
      // it thins away
      update: (e, ctx, dt) => {
        e.rain = toward(e.rain, 0, dt / 14)
        strikes(e, ctx, dt, 0.5)
        return e.rain <= 0 ? 'clearing' : undefined
      },
      on: { 'weather:toggle': (e) => manual(e, 'raining') },
    },
    clearing: {
      // and the clouds drift off
      update: (e, _ctx, dt) => ((e.cloud = toward(e.cloud, 0, dt / 22)) <= 0 ? 'dry' : undefined),
      on: { 'weather:toggle': (e) => manual(e, 'gathering') },
    },
  },
}
