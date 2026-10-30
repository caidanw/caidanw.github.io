import { rand } from '../util'
import { PROPS, inPool, nearProp, project } from '../world'
import type { Fsm } from './fsm'
import type { MushState, Stick, Walker, World } from './types'

export const isRaining = (w: World): boolean => w.weather.fsm.state === 'raining'
export const lightRadius = (w: World): number => 50 + 55 * w.brazier.fuel
export const countIn = <S extends string>(list: { fsm: Fsm<S> }[], ...states: S[]): number => list.filter((e) => states.includes(e.fsm.state)).length
export const hutOccupancy = (w: World, hut: number): number => w.mush.filter((m) => m.fsm.state === 'asleep' && m.hut === hut).length
export const isMoving = (e: Walker): boolean => Math.hypot(e.tx - e.x, e.tz - e.z) > 0.6

/** Shroomfolk states where they are walking somewhere. */
export const WALKING: MushState[] = ['wander', 'fetch', 'haul', 'feed', 'stoke', 'toHut']

/** Step toward (tx, tz); returns true on arrival. */
export function moveTo(e: Walker, speed: number, dt: number): boolean {
  const dx = e.tx - e.x
  const dz = e.tz - e.z
  const d = Math.hypot(dx, dz)
  if (d < 0.6) return true
  const k = Math.min(d, speed * dt) / d
  e.x += dx * k
  e.z += dz * k
  if (Math.abs(dx) > 0.1) e.flip = dx < 0
  return false
}

/** A random open spot in a ring around the brazier, away from water and props. */
export function freeSpotNear(w: World, r0: number, r1: number): [number, number] {
  for (let k = 0; k < 40; k++) {
    const a = Math.random() * Math.PI * 2
    const r = rand(r0, r1)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r * 0.85
    if (inPool(x, z, w.poolLevel * 1.35) || nearProp(x, z, 9)) continue
    if (Math.hypot(x - PROPS.knight.x, z - PROPS.knight.z) < 8 || Math.hypot(x - PROPS.woodpile.x, z - PROPS.woodpile.z) < 6) continue
    return [x, z]
  }
  return [r0, 0]
}

/** Somewhere at the forest edge for a stick to fall. */
export function stickSpot(w: World): Stick {
  for (let k = 0; k < 40; k++) {
    const a = Math.random() * Math.PI * 2
    const r = rand(40, 66)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r * 0.8
    if (!inPool(x, z, w.poolLevel * 1.3) && z > -48 && Math.abs(x) < 120 && !nearProp(x, z, 10)) return { x, z, claimed: false }
  }
  return { x: -50, z: 10, claimed: false }
}

export function burst(w: World, n: number, power: number) {
  for (let i = 0; i < n; i++)
    w.embers.push({ ox: rand(-4, 4), oy: 12, vy: rand(14, 30) * power, vx: rand(-8, 8), life: rand(0.8, 2.2), age: 0, ph: rand(0, 6) })
}

/** Where the crow sits: on top of the trigon stone (screen space). */
export function perchPos(): [number, number] {
  const [bx, by, s] = project(PROPS.trigon.x, 0, PROPS.trigon.z)
  return [bx + 2, by - Math.round(40 * s)]
}
