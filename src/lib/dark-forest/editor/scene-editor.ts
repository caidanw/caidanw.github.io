/**
 * Scene editing: move things around the clearing (the move tool), tweak what's selected
 * (the object tab), add and remove trees and bushes, and recolour the world palette (the
 * world tab). Everything edits data/layout.json or data/palette.json, live and staged.
 */
import { DATA, changed, type DataFile } from '../art'
import { settings } from '../settings'
import { BUSHES, H, HEARTHSTONES, PROPS, TREES, W, project, unproject } from '../world'

type Child = Node | string | null | undefined | false
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v as EventListener)
    else if (k === 'class') el.className = String(v)
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of kids) if (c) el.append(c)
  return el
}

type Spot = { x: number; z: number } & Record<string, unknown>
/** What's selected: what kind of thing, which, and the live object in the layout. */
interface Selection {
  kind: 'hut' | 'tree' | 'bush' | 'hearthstone' | 'grave' | 'prop'
  label: string
  obj: Spot
  /** Remove it from the layout (trees and bushes only). */
  remove?: () => void
}

/** The thing a hover tag belongs to, if it can be moved. `at` picks among the graves (they share a tag). */
function resolve(key: string, at: { x: number; z: number } | null): Selection | null {
  let m: RegExpMatchArray | null
  if ((m = key.match(/^hut(\d+)$/))) return { kind: 'hut', label: `hut ${m[1]}`, obj: PROPS.huts[+m[1]] as Spot }
  if ((m = key.match(/^tree(\d+)$/))) {
    const t = TREES[+m[1]]
    return t && { kind: 'tree', label: `tree ${m[1]}`, obj: t as unknown as Spot, remove: () => TREES.splice(TREES.indexOf(t), 1) }
  }
  if ((m = key.match(/^bush(\d+)$/))) {
    const b = BUSHES[+m[1]]
    return b && { kind: 'bush', label: `bush ${m[1]}`, obj: b as unknown as Spot, remove: () => BUSHES.splice(BUSHES.indexOf(b), 1) }
  }
  if ((m = key.match(/^hearth(\d+)$/))) return { kind: 'hearthstone', label: `hearthstone ${m[1]}`, obj: HEARTHSTONES[+m[1]] as unknown as Spot }
  if (key === 'grove' && at) {
    const g = [...PROPS.graves].sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z))[0]
    return { kind: 'grave', label: `grave ${PROPS.graves.indexOf(g)}`, obj: g as Spot }
  }
  if (key in PROPS && key !== 'huts' && key !== 'graves' && key !== 'knight')
    return { kind: 'prop', label: key, obj: (PROPS as unknown as Record<string, Spot>)[key] }
  return null
}

export interface SceneEditor {
  /** The object tab. */
  object: HTMLElement
  /** The world palette tab. */
  world: HTMLElement
  refresh(): void
}

export function createSceneEditor(opts: {
  canvas: () => HTMLCanvasElement | null
  tagAt: (x: number, y: number) => string | null
  edited: (file: DataFile) => void
  showObject: () => void
}): SceneEditor {
  let sel: Selection | null = null
  const select = (s: Selection | null) => {
    sel = s
    settings.selection = s ? s.obj : null
    renderObject()
  }

  // live while dragging or typing, staged when done
  let liveTimer = 0
  const touch = (file: DataFile, final: boolean) => {
    if (final) {
      window.clearTimeout(liveTimer)
      liveTimer = 0
      opts.edited(file)
    } else if (!liveTimer)
      liveTimer = window.setTimeout(() => {
        liveTimer = 0
        changed(file)
      }, 90)
  }

  // ---------------------------------------------------------------- the move tool
  const toFb = (e: PointerEvent, c: HTMLCanvasElement) => {
    const b = c.getBoundingClientRect()
    return { x: ((e.clientX - b.left) / b.width) * W, y: ((e.clientY - b.top) / b.height) * H }
  }
  let drag: { off: { x: number; y: number } } | null = null
  const down = (e: PointerEvent) => {
    const c = opts.canvas()
    if (!c || settings.tool !== 'move') return
    const p = toFb(e, c)
    const key = opts.tagAt(Math.floor(p.x), Math.floor(p.y))
    const g = unproject(p.x, p.y)
    const s = key ? resolve(key, g ? { x: g[0], z: g[1] } : null) : null
    select(s)
    opts.showObject()
    if (!s) return
    const [bx, by] = project(s.obj.x, 0, s.obj.z)
    drag = { off: { x: p.x - bx, y: p.y - by } }
    c.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent) => {
    const c = opts.canvas()
    if (!c || !drag || !sel) return
    const p = toFb(e, c)
    const g = unproject(p.x - drag.off.x, p.y - drag.off.y)
    if (!g) return
    sel.obj.x = Math.round(g[0] * 2) / 2
    sel.obj.z = Math.round(g[1] * 2) / 2
    renderObject()
    touch('layout', false)
  }
  const up = () => {
    if (!drag) return
    drag = null
    touch('layout', true)
  }
  let bound: HTMLCanvasElement | null = null
  const bind = () => {
    const c = opts.canvas()
    if (!c || c === bound) return
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
    bound = c
  }

  // ---------------------------------------------------------------- the object tab
  const object = h('div', {})
  const num = (label: string, get: () => number, set: (v: number) => void, step = 0.5, min?: number, max?: number) => {
    const input = h('input', { type: 'number', step, min, max, value: get(), class: 'num' }) as HTMLInputElement
    input.addEventListener('input', () => {
      if (input.value === '' || Number.isNaN(Number(input.value))) return
      set(Number(input.value))
      touch('layout', false)
    })
    input.addEventListener('change', () => touch('layout', true))
    return h('label', { class: 'row' }, h('span', { class: 'dim field' }, label), input)
  }
  const flag = (label: string, get: () => boolean, set: (v: boolean) => void) => {
    const input = h('input', { type: 'checkbox' }) as HTMLInputElement
    input.checked = get()
    input.addEventListener('change', () => {
      set(input.checked)
      touch('layout', true)
    })
    return h('label', { class: 'row check' }, input, h('span', {}, label))
  }
  const addTree = () => {
    const near = sel?.obj ?? { x: 0, z: -45 }
    const t = { x: near.x + 8, z: near.z - 4, h: 1, w: 0.9, seed: (Math.random() * 1e6) | 0, tone: Math.random() }
    TREES.push(t)
    touch('layout', true)
    select({ kind: 'tree', label: `tree ${TREES.length - 1}`, obj: t as unknown as Spot, remove: () => TREES.splice(TREES.indexOf(t), 1) })
  }
  const addBush = () => {
    const near = sel?.obj ?? { x: 0, z: -40 }
    const b = { x: near.x + 6, z: near.z + 2, w: 7, h: 4.5, seed: (Math.random() * 1e6) | 0, lobes: 3 }
    BUSHES.push(b)
    touch('layout', true)
    select({ kind: 'bush', label: `bush ${BUSHES.length - 1}`, obj: b as unknown as Spot, remove: () => BUSHES.splice(BUSHES.indexOf(b), 1) })
  }
  function renderObject() {
    const o = sel?.obj
    const field = (k: string) => ({ get: () => Number(o![k]), set: (v: number) => (o![k] = v) })
    const rows: Child[] = []
    if (sel && o) {
      rows.push(h('h3', {}, sel.label), num('x', field('x').get, field('x').set), num('z', field('z').get, field('z').set))
      if (sel.kind === 'tree') {
        const f = (k: string, step: number, min: number, max: number) => num(k, field(k).get, field(k).set, step, min, max)
        rows.push(f('h', 0.05, 0.3, 2.5), f('w', 0.05, 0.2, 2.5), f('tone', 0.05, 0, 1), f('seed', 1, 0, 1e6))
      }
      if (sel.kind === 'bush') {
        const f = (k: string, step: number, min: number, max: number) => num(k, field(k).get, field(k).set, step, min, max)
        rows.push(f('w', 0.5, 2, 24), f('h', 0.5, 1, 16), f('lobes', 1, 1, 7), f('seed', 1, 0, 1e6))
      }
      if (sel.kind === 'hearthstone') {
        const f = (k: string, step: number, min: number, max: number) => num(k, field(k).get, field(k).set, step, min, max)
        rows.push(
          f('h', 1, 4, 40),
          f('w', 1, 1, 8),
          f('lean', 1, -3, 3),
          flag(
            'carved',
            () => !!o.carved,
            (v) => (o.carved = v),
          ),
        )
      }
      if (sel.kind === 'grave')
        rows.push(
          flag(
            "the knight's helm",
            () => !!o.helm,
            (v) => {
              if (v) o.helm = true
              else delete o.helm
            },
          ),
        )
      const btns: Child[] = []
      if (sel.kind === 'tree' || sel.kind === 'bush')
        btns.push(
          h(
            'button',
            {
              title: 'a new shape, same place',
              onclick: () => {
                o.seed = (Math.random() * 1e6) | 0
                touch('layout', true)
                renderObject()
              },
            },
            'reroll',
          ),
        )
      if (sel.remove)
        btns.push(
          h(
            'button',
            {
              onclick: () => {
                sel!.remove!()
                select(null)
                touch('layout', true)
              },
            },
            'remove',
          ),
        )
      rows.push(h('div', { class: 'group' }, ...btns))
    } else
      rows.push(h('p', { class: 'dim' }, 'Choose ', h('b', {}, 'move'), ' in the header, then press on a hut, tree, bush, stone, grave or prop and drag it.'))
    rows.push(h('h3', {}, 'add'), h('div', { class: 'group' }, h('button', { onclick: addTree }, '+ tree'), h('button', { onclick: addBush }, '+ bush')))
    object.replaceChildren(...rows.filter((r): r is Node | string => !!r))
  }

  // ---------------------------------------------------------------- the world palette
  const world = h('div', {})
  const renderWorld = () => {
    const pal = DATA.palette as Record<string, string>
    world.replaceChildren(
      h('p', { class: 'dim' }, 'Every named colour in the scene. Sprite palettes that link to one ($name) follow it.'),
      ...Object.keys(pal).map((k) => {
        const input = h('input', { type: 'color', value: pal[k] }) as HTMLInputElement
        input.addEventListener('input', () => {
          pal[k] = input.value
          touch('palette', false)
        })
        input.addEventListener('change', () => touch('palette', true))
        return h('label', { class: 'row world-col' }, input, h('span', {}, k))
      }),
    )
  }

  renderObject()
  renderWorld()
  return {
    object,
    world,
    refresh() {
      bind()
      if (sel && !drag) renderObject()
      renderWorld()
    },
  }
}
