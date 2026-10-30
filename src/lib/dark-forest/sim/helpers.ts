import { rand } from '../util'
import { GROVE_SPOTS, PROPS, inPool, nearProp, project } from '../world'
import type { Fsm } from './fsm'
import { findPath, nav, walkable } from './nav'
import type { MushState, Stick, Walker, World } from './types'

export const isRaining = (w: World): boolean => w.weather.fsm.state === 'raining'
export const tell = (w: World, line: string) => w.story.push(line)
/** A grove spot with no glowcap and nobody already heading to it. */
export function freeGroveSpot(w: World): number | null {
  const taken = new Set([...w.memorials.map((m) => m.spot), ...w.mush.filter((m) => m.fsm.state === 'wilting' && m.spot !== null).map((m) => m.spot)])
  const free = GROVE_SPOTS.map((_, i) => i).filter((i) => !taken.has(i))
  return free.length ? free[(Math.random() * free.length) | 0] : null
}
export const candlesNeedTending = (w: World): boolean => w.candles.some((c) => !c.lit || c.wax < 0.2)

export const isElder = (m: { age: number; lifespan: number }): boolean => m.age > m.lifespan * 0.75

const NAMES =
  'Morel Puffball Sorrel Bracken Tuft Fen Wick Pip Bram Chanterelle Truffle Lichen Bolete Spore Inkcap Russet Moss Thimble Cobb Fennel Nettle Burr Hazel Oakmoss Bilberry Cap Gill Tansy Woodruff Clover Marrow Brindle Dusk Ember Peat Rook Wren Sedge'.split(
    ' ',
  )
/** A name nobody in the village currently has. */
export function freshName(w: World): string {
  const taken = new Set(w.mush.map((m) => m.name))
  const free = NAMES.filter((n) => !taken.has(n))
  return free.length ? free[(Math.random() * free.length) | 0] : NAMES[(Math.random() * NAMES.length) | 0]
}

/** The road out: past the lantern and off the left edge. */
export const ROAD: [number, number][] = [
  [-60, 12],
  [-92, 19],
  [-160, 25],
]
/** How far the firelight reaches; follows the fire's heat, not its fuel, so it swells and fades naturally. */
export const lightRadius = (w: World): number => 32 + 78 * w.fire.heat
export const countIn = <S extends string>(list: { fsm: Fsm<S> }[], ...states: S[]): number => list.filter((e) => states.includes(e.fsm.state)).length
export const hutOccupancy = (w: World, hut: number): number => w.mush.filter((m) => m.fsm.state === 'asleep' && m.hut === hut).length
export const isMoving = (e: Walker): boolean => Math.hypot(e.tx - e.x, e.tz - e.z) > 0.6

/** Shroomfolk states where they are walking somewhere. */
export const WALKING: MushState[] = ['arriving', 'wander', 'fetch', 'haul', 'feed', 'stoke', 'toHut', 'entering', 'exiting', 'farewell', 'departing', 'wilting']

/** Is someone stepping through this hut's door right now? */
export const doorOpen = (w: World, hut: number): boolean => w.mush.some((m) => m.hut === hut && (m.fsm.state === 'entering' || m.fsm.state === 'exiting'))

/**
 * Walk toward (tx, tz), around obstacles; returns true on arrival. A path is found whenever the
 * target changes (nav.ts). `direct` walks a straight line instead, for stepping through doorways.
 */
export function moveTo(e: Walker, speed: number, dt: number, direct = false): boolean {
  if (!direct) {
    const key = `${e.tx.toFixed(1)},${e.tz.toFixed(1)},${nav.version}`
    if (e.pathKey !== key || !e.path) {
      e.path = findPath(e.x, e.z, e.tx, e.tz)
      e.pathKey = key
    }
    while (e.path.length && Math.hypot(e.path[0][0] - e.x, e.path[0][1] - e.z) < 0.6) e.path.shift()
    if (!e.path.length) {
      // arrived (or as close as the obstacles allow): settle here
      e.tx = e.x
      e.tz = e.z
      e.pathKey = `${e.tx.toFixed(1)},${e.tz.toFixed(1)},${nav.version}`
      return true
    }
    const [wx, wz] = e.path[0]
    const dx = wx - e.x
    const dz = wz - e.z
    const d = Math.hypot(dx, dz)
    const k = Math.min(d, speed * dt) / d
    e.x += dx * k
    e.z += dz * k
    if (Math.abs(dx) > 0.1) e.flip = dx < 0
    return false
  }
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

/** A random open spot in a ring around the fire, away from water and props. */
export function freeSpotNear(w: World, r0: number, r1: number): [number, number] {
  for (let k = 0; k < 40; k++) {
    const a = Math.random() * Math.PI * 2
    const r = rand(r0, r1)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r * 0.85
    if (inPool(x, z, w.poolLevel * 1.35) || nearProp(x, z, 9) || !walkable(x, z)) continue
    if (Math.hypot(x - PROPS.knight.x, z - PROPS.knight.z) < 8 || Math.hypot(x - PROPS.woodpile.x, z - PROPS.woodpile.z) < 6) continue
    return [x, z]
  }
  return [r0, 0]
}

/** A stick lying on the ground. */
export const restingStick = (x: number, z: number): Stick => ({
  x,
  z,
  claimed: false,
  y: 0,
  vy: 0,
  angle: Math.random() < 0.5 ? 0 : Math.PI,
  spin: 0,
  landed: true,
  glint: 0,
})

/** Somewhere at the forest edge for a stick to fall. */
export function stickSpot(w: World): Stick {
  for (let k = 0; k < 40; k++) {
    const a = Math.random() * Math.PI * 2
    const r = rand(40, 66)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r * 0.8
    if (!inPool(x, z, w.poolLevel * 1.3) && z > -48 && Math.abs(x) < 120 && !nearProp(x, z, 10) && walkable(x, z)) return restingStick(x, z)
  }
  return restingStick(-50, 10)
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
