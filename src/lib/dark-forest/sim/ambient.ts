/**
 * Ambient systems: things that are just numbers and particles, with no
 * decisions to make. They read entity state but don't need a machine.
 */
import { clamp, rand, vnoise } from '../util'
import { H, HORIZON, W, inPool, project } from '../world'
import { burst, isRaining, lightRadius, stickSpot } from './helpers'
import type { World } from './types'

export function stepAmbient(w: World, dt: number, isOpenWater: (sx: number, sy: number) => boolean) {
  const raining = isRaining(w)

  // the trigon stone's rune wakes in the rain; the pool rises with it and sinks slowly after
  w.rune = clamp(w.rune + dt * (raining ? 0.25 : -0.03))
  w.poolLevel = Math.max(1, Math.min(1.28, w.poolLevel + dt * (raining ? 0.008 : -0.0025)))

  // the grove candles burn down
  for (const c of w.candles) {
    if (!c.lit) continue
    if ((c.wax -= dt / 240) <= 0) {
      c.wax = 0
      c.lit = false
    }
  }

  // sticks fall at the forest edge
  if ((w.stickTimer -= dt) <= 0) {
    w.stickTimer = rand(6, 12)
    if (w.sticks.length < 6) w.sticks.push(stickSpot(w))
  }

  // embers and sleepy z's
  if (Math.random() < dt * (8 + 20 * w.fire.fuel) * (raining ? 0.5 : 1)) burst(w, 1, 1)
  w.embers = w.embers.filter((e) => {
    e.age += dt
    e.oy += e.vy * dt
    e.ox += (Math.sin(w.t * 3 + e.ph) * 5 + e.vx) * dt
    return e.age < e.life
  })
  w.zs = w.zs.filter((z) => (z.age += dt) < 1.8)
  w.puffs = w.puffs.filter((p) => (p.age += dt) < 0.9)
  stepFallingSticks(w, dt)

  // fireflies: dry nights only, just outside the firelight
  const R = lightRadius(w)
  for (const f of w.flies) {
    const a = vnoise(f.seed, w.t * 0.06) * Math.PI * 4
    const r = R * 0.85 + vnoise(f.seed + 9, w.t * 0.1) * 45
    f.x = Math.cos(a) * r
    f.z = Math.sin(a) * r * 0.7
    f.y = 6 + vnoise(f.seed + 50, w.t * 0.3) * 20
    f.a = raining ? 0 : Math.max(0, Math.sin(w.t * 1.7 + f.seed)) ** 3
  }

  // a shooting star, now and then
  if ((w.nextShoot -= dt) <= 0 && !raining) {
    w.shooting = { x: rand(20, 260), y: rand(4, 30), age: 0 }
    w.nextShoot = rand(25, 60)
  }
  if (w.shooting && (w.shooting.age += dt) > 0.9) w.shooting = null

  // rain falls straight down, rippling where it lands on open water
  if (raining) {
    for (const r of w.drops) {
      r.y += r.v * dt
      if (r.y <= r.stop) continue
      if (isOpenWater(r.x | 0, r.stop | 0)) w.ripples.push({ x: r.x, y: r.stop, age: 0 })
      r.y = -5 - Math.random() * 40
      r.x = Math.random() * W
      r.stop = rand(HORIZON, H)
    }
  }
  w.ripples = w.ripples.filter((r) => (r.age += dt) < 0.7)
}

const GRAVITY = 150

/** Dropped sticks fall, tumble, bounce once or twice, kick up dust, and settle (or splash). */
function stepFallingSticks(w: World, dt: number) {
  for (const s of [...w.sticks]) {
    if (s.landed) {
      s.glint = Math.max(0, s.glint - dt / 2.5)
      continue
    }
    s.vy -= GRAVITY * dt
    s.y += s.vy * dt
    s.angle += s.spin * dt
    if (s.y > 0) continue
    if (inPool(s.x, s.z, w.poolLevel)) {
      // it lands in the pool: a splash of rings, and it's gone
      const [sx, sy] = project(s.x, 0, s.z)
      for (let i = 0; i < 3; i++) w.ripples.push({ x: sx + (Math.random() - 0.5) * 3, y: sy + (Math.random() - 0.5), age: -i * 0.15 })
      w.sticks.splice(w.sticks.indexOf(s), 1)
      continue
    }
    s.y = 0
    for (let i = 0; i < 5; i++) w.puffs.push({ x: s.x, z: s.z, age: -i * 0.04, seed: Math.random() * 100 })
    if (s.vy < -35) {
      s.vy = -s.vy * 0.32 // bounce
      s.spin *= 0.5
      continue
    }
    s.landed = true
    s.vy = 0
    s.angle = Math.cos(s.angle) > 0 ? 0 : Math.PI // settle flat
    w.queue.push({ type: 'stick:dropped', payload: s })
  }
}
