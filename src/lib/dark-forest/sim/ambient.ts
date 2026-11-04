/**
 * Ambient systems: things that are just numbers and particles, with no
 * decisions to make. They read entity state but don't need a machine.
 */
import { clamp, rand, vnoise } from '../util'
import { H, HORIZON, PROPS, RES, W, inPool, project } from '../world'
import { burst, isRaining, lightRadius, rainAmount, stickSpot } from './helpers'
import type { World } from './types'

export function stepAmbient(w: World, dt: number, isOpenWater: (sx: number, sy: number) => boolean) {
  const raining = isRaining(w)
  const rain = rainAmount(w)

  // the trigon stone's rune wakes in the rain; the pool rises with it (faster the harder it rains) and sinks slowly after
  w.rune = clamp(w.rune + dt * (raining ? 0.25 : -0.03))
  w.poolLevel = Math.max(1, Math.min(1.28, w.poolLevel + dt * (rain > 0.05 ? 0.01 * rain : -0.0025)))

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

  // fireflies: dry nights only, just outside the firelight (they hide as the clouds come in)
  const R = lightRadius(w)
  for (const f of w.flies) {
    const a = vnoise(f.seed, w.t * 0.06) * Math.PI * 4
    const r = R * 0.85 + vnoise(f.seed + 9, w.t * 0.1) * 45
    f.x = Math.cos(a) * r
    f.z = Math.sin(a) * r * 0.7
    f.y = 6 + vnoise(f.seed + 50, w.t * 0.3) * 20
    f.a = (1 - Math.min(1, w.weather.cloud * 1.3)) * Math.max(0, Math.sin(w.t * 1.7 + f.seed)) ** 3
  }

  // a shooting star, now and then
  if ((w.nextShoot -= dt) <= 0 && w.weather.cloud < 0.2) {
    w.shooting = { x: rand(20, 260) * RES, y: rand(4, 30) * RES, age: 0 }
    w.nextShoot = rand(25, 60)
  }
  if (w.shooting && (w.shooting.age += dt) > 0.9) w.shooting = null

  // bats, now and then, across the sky on a clear night
  if ((w.nextBats -= dt) <= 0) {
    w.nextBats = rand(30, 90)
    if (w.weather.cloud < 0.5) {
      const dir = Math.random() < 0.5 ? 1 : -1
      const y = rand(10, 40) * RES
      for (let i = 0; i < 1 + ((Math.random() * 3) | 0); i++)
        w.bats.push({ x: dir > 0 ? -10 - i * rand(8, 20) : W + 10 + i * rand(8, 20), y: y + rand(-6, 6) * RES, vx: dir * rand(70, 110), ph: Math.random() * 6 })
    }
  }
  for (const b of w.bats) {
    b.x += b.vx * dt
    b.ph += dt * 14
    b.y += Math.sin(b.ph * 0.35) * 12 * dt // they flutter as they go
  }
  w.bats = w.bats.filter((b) => b.x > -40 && b.x < W + 40)

  // moths about the fire and the lantern (not in the rain)
  for (const m of w.moths) {
    const c = m.at === 'fire' ? { x: 0, y: 9, z: 0, r: 5 + w.fire.heat * 5 } : { x: PROPS.lantern.x + 3.3, y: 15, z: PROPS.lantern.z, r: 2.5 }
    const a = w.t * (1.6 + (m.seed % 1.3)) + m.seed
    m.x = c.x + Math.cos(a) * c.r * (0.6 + 0.4 * vnoise(m.seed, w.t * 0.8))
    m.z = c.z + Math.sin(a) * c.r * 0.6
    m.y = raining ? -100 : c.y + Math.sin(a * 1.7) * 3 + vnoise(m.seed + 3, w.t * 1.3) * 4
  }

  // firefly swarms deep in the trees (dry nights)
  for (const f of w.farFlies) {
    f.x = f.cx + (vnoise(f.seed, w.t * 0.05) - 0.5) * 30
    f.z = f.cz + (vnoise(f.seed + 4, w.t * 0.05) - 0.5) * 16
    f.y = 4 + vnoise(f.seed + 8, w.t * 0.2) * 18
    f.a = (1 - Math.min(1, w.weather.cloud * 1.3)) * Math.max(0, Math.sin(w.t * 1.3 + f.seed * 2)) ** 4
  }

  // the owl blinks, and now and then looks away
  if ((w.owl.blink -= dt) < -0.15) w.owl.blink = rand(2, 6)
  if (w.owl.away > 0) w.owl.away -= dt
  else if (Math.random() < dt / 25) w.owl.away = rand(2, 5)

  // a deer far off at the back of the wood, crossing now and then
  if (!w.farDeer && (w.nextFarDeer -= dt) <= 0 && !raining) {
    const dir = Math.random() < 0.5 ? 1 : -1
    w.farDeer = { x: dir > 0 ? -175 : 175, z: rand(-92, -84), dir, step: 0 }
  }
  if (w.farDeer) {
    const d = w.farDeer
    d.x += d.dir * 5 * dt
    d.step += dt
    if (Math.abs(d.x) > 180) {
      w.farDeer = null
      w.nextFarDeer = rand(120, 260)
    }
  }

  // rain falls straight down, rippling where it lands on open water
  if (rain > 0) {
    // only as many drops as the rain is heavy
    const n = Math.round(w.drops.length * rain)
    for (let k = 0; k < n; k++) {
      const r = w.drops[k]
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
