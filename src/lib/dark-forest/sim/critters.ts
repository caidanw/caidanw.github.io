/** Small critters with tiny machines: the frog in the pool and the crow on the trigon stone. */
import { rand } from '../util'
import { PADS, W, inPool, project } from '../world'
import { fsm } from './fsm'
import { isRaining, perchPos } from './helpers'
import type { Crow, CrowState, Def, Frog, FrogState } from './types'

// ---------- frog: sits on a lily pad, croaks, hops to another pad (livelier in rain)
export const createFrog = (): Frog => ({ fsm: fsm<FrogState>('sit'), pad: 0, from: 0, progress: 0, next: 4, croak: 0 })

export const frogMachine: Def<Frog, FrogState> = {
  name: 'frog',
  states: {
    sit: {
      enter: (f) => (f.next = rand(4, 10)),
      update: (f, ctx, dt) => {
        f.croak = Math.max(0, f.croak - dt)
        if (Math.random() < dt * 0.15) f.croak = 0.6
        return (f.next -= dt * (isRaining(ctx.w) ? 2.5 : 1)) <= 0 ? 'hop' : undefined
      },
      on: { 'rain:start': () => 'hop' },
    },
    hop: {
      enter: (f, ctx) => {
        const options = PADS.map((_, i) => i).filter((i) => i !== f.pad && inPool(PADS[i][0], PADS[i][1], ctx.w.poolLevel))
        f.from = f.pad
        if (options.length) f.pad = options[(Math.random() * options.length) | 0]
        f.progress = 0
        f.croak = 0
      },
      update: (f, ctx, dt) => {
        if ((f.progress += dt * 2.2) < 1) return
        f.progress = 1
        const [x, z] = PADS[f.pad]
        const [sx, sy] = project(x, 0, z)
        ctx.w.ripples.push({ x: sx, y: sy + 1, age: 0 })
        return 'sit'
      },
    },
  },
}

// ---------- crow: perches on the stone, leaves when it rains, comes back after
export const createCrow = (): Crow => ({ fsm: fsm<CrowState>('perch'), x: 0, y: 0, vx: 0, vy: 0 })

export const crowMachine: Def<Crow, CrowState> = {
  name: 'crow',
  states: {
    perch: {
      enter: (c) => ([c.x, c.y] = perchPos()),
      on: { 'rain:start': () => 'flying' },
    },
    flying: {
      enter: (c) => {
        ;[c.x, c.y] = perchPos()
        c.vx = 60
        c.vy = -30
      },
      update: (c, _ctx, dt) => {
        c.x += c.vx * dt
        c.y += c.vy * dt
        return c.x > W + 10 || c.y < -10 ? 'away' : undefined
      },
      on: { 'rain:end': () => 'returning' },
    },
    away: {
      on: { 'rain:end': () => 'returning' },
    },
    returning: {
      enter: (c) => {
        c.x = W + 5
        c.y = 10
      },
      update: (c, _ctx, dt) => {
        const [px, py] = perchPos()
        c.x += (px - c.x) * dt * 0.8
        c.y += (py - c.y) * dt * 0.8
        return Math.hypot(px - c.x, py - c.y) < 1 ? 'perch' : undefined
      },
      on: { 'rain:start': () => 'flying' },
    },
  },
}
