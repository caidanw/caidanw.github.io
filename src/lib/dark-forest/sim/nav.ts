/**
 * Walking around things. A coarse grid over the clearing marks what can't be
 * walked through (the fire and its stone ring, the hearthstones, hut stems,
 * graves, tree trunks, the woodpile and props, and the pool at its current
 * level). Paths are found with A* and smoothed with line-of-sight checks, so
 * creatures walk in straight lines when they can and around things when they
 * can't. moveTo() in helpers.ts follows these paths transparently.
 */
import { HEARTHSTONES, KNIGHT_GRAVE, PROPS, TREES, poolMetric } from '../world'

const CELL = 2
const X0 = -180
const Z0 = -95
const GW = 180
const GH = 106

let staticBlocked: Uint8Array | null = null
let poolM: Float32Array | null = null

/** Current pool level (the pool grows in rain) and the seated knight, set every tick. */
export const nav = { level: 1, knight: null as { x: number; z: number } | null, version: 0 }

function blockedStatic(x: number, z: number): boolean {
  if ((x / 9.5) ** 2 + (z / 6.8) ** 2 < 1) return true // the fire and its ring of stones
  for (const h of HEARTHSTONES) if (Math.hypot(x - h.x, z - h.z) < h.w + 2) return true
  for (const h of PROPS.huts) if (Math.hypot(x - h.x, (z - h.z) * 1.2) < 6) return true // the stem; the cap is overhead
  for (const g of [...PROPS.graves, KNIGHT_GRAVE]) if (Math.hypot(x - g.x, z - g.z) < 2.5) return true
  for (const t of TREES) if (Math.hypot(x - t.x, z - t.z) < 1.6 * t.w + 0.8) return true
  if (Math.hypot(x - PROPS.woodpile.x, (z - PROPS.woodpile.z) * 1.3) < 5) return true
  if (Math.hypot(x - PROPS.lantern.x, z - PROPS.lantern.z) < 1.8) return true
  if (Math.hypot(x - PROPS.pack.x, z - PROPS.pack.z) < 2.8) return true
  if (Math.hypot(x - PROPS.sword.x, z - PROPS.sword.z) < 1.5) return true
  if (Math.hypot(x - PROPS.trigon.x, (z - PROPS.trigon.z) * 1.5) < 7) return true
  return false
}

function init() {
  staticBlocked = new Uint8Array(GW * GH)
  poolM = new Float32Array(GW * GH)
  for (let cz = 0; cz < GH; cz++) {
    for (let cx = 0; cx < GW; cx++) {
      const x = X0 + (cx + 0.5) * CELL
      const z = Z0 + (cz + 0.5) * CELL
      staticBlocked[cz * GW + cx] = blockedStatic(x, z) ? 1 : 0
      poolM[cz * GW + cx] = poolMetric(x, z)
    }
  }
}

function blockedCell(cx: number, cz: number): boolean {
  if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return true
  if (!staticBlocked) init()
  const i = cz * GW + cx
  if (staticBlocked![i]) return true
  if (poolM![i] < (nav.level * 1.12) ** 2) return true
  const k = nav.knight
  if (k && Math.hypot(X0 + (cx + 0.5) * CELL - k.x, Z0 + (cz + 0.5) * CELL - k.z) < 3) return true
  return false
}

const cellOf = (x: number, z: number): [number, number] => [Math.floor((x - X0) / CELL), Math.floor((z - Z0) / CELL)]
const centre = (cx: number, cz: number): [number, number] => [X0 + (cx + 0.5) * CELL, Z0 + (cz + 0.5) * CELL]

/** Can you walk at world point (x, z)? */
export const walkable = (x: number, z: number): boolean => !blockedCell(...cellOf(x, z))

/** The nearest walkable cell to a point (searching outward ring by ring). */
function nearestFree(cx: number, cz: number): [number, number] | null {
  if (!blockedCell(cx, cz)) return [cx, cz]
  for (let r = 1; r < 25; r++) {
    let best: [number, number] | null = null
    let bd = Infinity
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || blockedCell(cx + dx, cz + dz)) continue
        const d = dx * dx + dz * dz
        if (d < bd) {
          bd = d
          best = [cx + dx, cz + dz]
        }
      }
    }
    if (best) return best
  }
  return null
}

/** Is the straight line between two points walkable? */
function clear(ax: number, az: number, bx: number, bz: number): boolean {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.4))
  for (let i = 1; i < steps; i++) if (!walkable(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps)) return false
  return true
}

/**
 * Waypoints from (fx, fz) toward (tx, tz), ending at the target, or at the nearest walkable
 * point to it if the target itself is inside something (e.g. the fire you're feeding).
 */
export function findPath(fx: number, fz: number, tx: number, tz: number): [number, number][] {
  const start = nearestFree(...cellOf(fx, fz))
  const goalCell = cellOf(tx, tz)
  const goal = nearestFree(...goalCell)
  if (!start || !goal) return [[tx, tz]]
  const end: [number, number] = goal[0] === goalCell[0] && goal[1] === goalCell[1] ? [tx, tz] : centre(...goal)
  if (clear(fx, fz, end[0], end[1])) return [end]

  // A* over the grid (8-way, no cutting corners)
  const si = start[1] * GW + start[0]
  const gi = goal[1] * GW + goal[0]
  const g = new Float32Array(GW * GH).fill(Infinity)
  const came = new Int32Array(GW * GH).fill(-1)
  const closed = new Uint8Array(GW * GH)
  const heap: [number, number][] = [] // [f, index]
  const push = (f: number, i: number) => {
    heap.push([f, i])
    let c = heap.length - 1
    while (c > 0) {
      const p = (c - 1) >> 1
      if (heap[p][0] <= heap[c][0]) break
      ;[heap[p], heap[c]] = [heap[c], heap[p]]
      c = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let c = 0
      for (;;) {
        const l = c * 2 + 1
        const r = l + 1
        let m = c
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === c) break
        ;[heap[m], heap[c]] = [heap[c], heap[m]]
        c = m
      }
    }
    return top
  }
  const h = (i: number) => {
    const dx = Math.abs((i % GW) - goal[0])
    const dz = Math.abs(((i / GW) | 0) - goal[1])
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)
  }
  g[si] = 0
  push(h(si), si)
  let found = false
  while (heap.length) {
    const [, i] = pop()
    if (closed[i]) continue
    if (i === gi) {
      found = true
      break
    }
    closed[i] = 1
    const cx = i % GW
    const cz = (i / GW) | 0
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue
        const nx = cx + dx
        const nz = cz + dz
        if (blockedCell(nx, nz)) continue
        if (dx && dz && (blockedCell(cx + dx, cz) || blockedCell(cx, cz + dz))) continue
        const ni = nz * GW + nx
        const ng = g[i] + (dx && dz ? Math.SQRT2 : 1)
        if (ng >= g[ni]) continue
        g[ni] = ng
        came[ni] = i
        push(ng + h(ni), ni)
      }
    }
  }
  if (!found) return [end]

  // walk back, then smooth: from each point, jump to the farthest point still in sight
  const cells: [number, number][] = []
  for (let i = gi; i !== -1; i = came[i]) cells.unshift(centre(i % GW, (i / GW) | 0))
  cells[cells.length - 1] = end
  const out: [number, number][] = []
  let from: [number, number] = [fx, fz]
  let k = 0
  while (k < cells.length - 1) {
    let far = k + 1
    for (let j = cells.length - 1; j > k + 1; j--) {
      if (clear(from[0], from[1], cells[j][0], cells[j][1])) {
        far = j
        break
      }
    }
    out.push(cells[far])
    from = cells[far]
    k = far
  }
  return out.length ? out : [end]
}
