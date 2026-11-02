/**
 * The art editor: every creature frame, prop and relic, editable pixel by pixel, with its
 * palette, parts (the shapes its normals are built from) and shine. A flat canvas to paint
 * on, and previews: shaded under a light you can move, normals, and parts. Edits are live
 * (the scene shows them on the next frame) and staged as you go (see staging.ts).
 */
import { DATA, changed, type DataFile, type HexPalette, type PartData } from '../art'
import { forgetNormals, partNormals, type Part } from '../normals'
import { hex } from '../util'

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

/** One editable piece of art: where its rows, palettes, parts and shine live in the data. */
interface Target {
  id: string
  group: string
  label: string
  file: DataFile
  rows: () => string[]
  palettes: () => Record<string, HexPalette>
  parts: () => PartData[] | null
  shine: () => Record<string, number> | null
  anchor?: { get: () => number; set: (v: number) => void }
}

function targets(): Target[] {
  const out: Target[] = []
  for (const [name, s] of Object.entries(DATA.sprites))
    for (const frame of Object.keys(s.frames))
      out.push({
        id: `sprite:${name}:${frame}`,
        group: name,
        label: frame,
        file: 'sprites',
        rows: () => DATA.sprites[name].frames[frame],
        palettes: () => DATA.sprites[name].palettes,
        parts: () => DATA.sprites[name].parts,
        shine: () => DATA.sprites[name].shine,
      })
  for (const name of Object.keys(DATA.props)) {
    if (name === 'relics') continue
    const p = () => DATA.props[name]
    out.push({
      id: `prop:${name}`,
      group: 'props',
      label: name,
      file: 'props',
      rows: () => p().rows,
      palettes: () => ({ default: p().palette }),
      parts: () => p().parts,
      shine: () => p().shine,
      anchor: { get: () => p().anchor, set: (v) => (p().anchor = v) },
    })
  }
  for (const name of Object.keys(DATA.props.relics)) {
    const r = () => DATA.props.relics[name]
    out.push({
      id: `relic:${name}`,
      group: 'relics',
      label: name,
      file: 'props',
      rows: () => r().rows,
      palettes: () => ({ default: r().palette }),
      parts: () => null,
      shine: () => null,
    })
  }
  return out
}

const KINDS = ['dome', 'cylinder', 'cap', 'under', 'flat']
const PART_TINTS = ['#e0674a', '#4aa3e0', '#e0c04a', '#5fd08a', '#b36ae0', '#e07fb8', '#7fe0d6', '#a0a0ff', '#ffb070', '#9fd060', '#d0d0d0']
type Tool = 'pencil' | 'erase' | 'pick' | 'fill' | 'anchor'

export interface ArtEditor {
  /** The workspace (goes in the middle). */
  center: HTMLElement
  /** The asset list (goes on the left). */
  left: HTMLElement
  /** Palette and parts (go on the right). */
  right: HTMLElement
  /** Where the live scene sits while editing art. */
  pip: HTMLElement
  /** Redraw (after something outside changed the data, e.g. discarding staged edits). */
  refresh(): void
}

export function createArtEditor(edited: (file: DataFile) => void): ArtEditor {
  const all = targets()
  let target = all[0]
  let paletteName = 'default'
  let brush = ''
  let tool: Tool = 'pencil'
  let zoom = 12
  let grid = true
  const light = { x: 0.55, y: 0.35 }
  const undo = new Map<string, string[][]>()
  const redo = new Map<string, string[][]>()

  // ---------------------------------------------------------------- the live data
  const rows = () => target.rows()
  const width = () => Math.max(1, ...rows().map((r) => r.length))
  const palette = (): HexPalette => target.palettes()[paletteName] ?? Object.values(target.palettes())[0]
  const colorOf = (ch: string): string | null => {
    const v = palette()[ch]
    if (!v) return null
    if (!v.startsWith('$')) return v
    return (DATA.palette as Record<string, string>)[v.slice(1)] ?? '#ff00ff'
  }
  /** Live while painting (the scene follows), staged when the stroke ends. */
  let liveTimer = 0
  const touch = (final: boolean) => {
    forgetNormals()
    if (final) {
      window.clearTimeout(liveTimer)
      edited(target.file)
    } else if (!liveTimer)
      liveTimer = window.setTimeout(() => {
        liveTimer = 0
        changed(target.file)
      }, 120)
    draw()
  }
  const remember = () => {
    const stack = undo.get(target.id) ?? []
    stack.push([...rows()])
    if (stack.length > 100) stack.shift()
    undo.set(target.id, stack)
    redo.delete(target.id)
  }
  const restore = (from: Map<string, string[][]>, to: Map<string, string[][]>) => {
    const snap = from.get(target.id)?.pop()
    if (!snap) return
    const r = rows()
    to.set(target.id, [...(to.get(target.id) ?? []), [...r]])
    r.splice(0, r.length, ...snap)
    touch(true)
  }
  const setPixel = (r: number, c: number, ch: string) => {
    const R = rows()
    if (r < 0 || r >= R.length || c < 0) return
    const row = R[r].padEnd(width(), '.')
    if (row[c] === ch) return
    R[r] = row.slice(0, c) + ch + row.slice(c + 1)
  }
  const flood = (r0: number, c0: number, ch: string) => {
    const R = rows()
    const from = R[r0]?.[c0]
    if (from === undefined || from === ch) return
    const stack: [number, number][] = [[r0, c0]]
    while (stack.length) {
      const [r, c] = stack.pop()!
      if (R[r]?.[c] !== from) continue
      setPixel(r, c, ch)
      stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1])
    }
  }
  /** Grow or shrink the art at one edge. Sprites stand on their bottom row; props keep their anchor. */
  const resize = (edge: 'top' | 'bottom' | 'left' | 'right', grow: boolean) => {
    remember()
    const R = rows()
    const w = width()
    if (edge === 'top') grow ? R.unshift('.'.repeat(w)) : R.length > 1 && R.shift()
    if (edge === 'bottom') grow ? R.push('.'.repeat(w)) : R.length > 1 && R.pop()
    if (edge === 'left' && (grow || w > 1)) {
      for (let i = 0; i < R.length; i++) R[i] = grow ? '.' + R[i].padEnd(w, '.') : R[i].slice(1)
      if (target.anchor) target.anchor.set(Math.max(0, target.anchor.get() + (grow ? 1 : -1)))
    }
    if (edge === 'right' && (grow || w > 1)) for (let i = 0; i < R.length; i++) R[i] = grow ? R[i].padEnd(w, '.') + '.' : R[i].padEnd(w, '.').slice(0, w - 1)
    touch(true)
  }

  // ---------------------------------------------------------------- the canvas
  const canvas = h('canvas', { class: 'art-canvas' })
  const ctx = canvas.getContext('2d')!
  const previews = { shaded: h('canvas', {}), normals: h('canvas', {}), parts: h('canvas', {}) }
  const status = h('span', { class: 'dim' })

  const cellAt = (e: PointerEvent) => {
    const b = canvas.getBoundingClientRect()
    return { r: Math.floor(((e.clientY - b.top) / b.height) * rows().length), c: Math.floor(((e.clientX - b.left) / b.width) * width()) }
  }
  let painting = false
  let last: { r: number; c: number } | null = null
  const act = (e: PointerEvent, first: boolean) => {
    const { r, c } = cellAt(e)
    const from = first ? null : last
    last = { r, c }
    const ch = e.buttons === 2 || tool === 'erase' ? '.' : brush || '.'
    if (tool === 'pick') {
      const got = rows()[r]?.[c]
      if (got && got !== '.') setBrush(got)
      return
    }
    if (tool === 'anchor' && target.anchor) {
      if (first) remember()
      target.anchor.set(Math.max(0, Math.min(width() - 1, c)))
      touch(false)
      return
    }
    if (first) remember()
    if (tool === 'fill') flood(r, c, ch)
    else if (from) {
      // a fast drag skips cells: fill in the line between where it was and where it is
      const n = Math.max(Math.abs(r - from.r), Math.abs(c - from.c), 1)
      for (let i = 1; i <= n; i++) setPixel(Math.round(from.r + ((r - from.r) * i) / n), Math.round(from.c + ((c - from.c) * i) / n), ch)
    } else setPixel(r, c, ch)
    touch(false)
  }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  canvas.addEventListener('pointerdown', (e) => {
    painting = true
    canvas.setPointerCapture(e.pointerId)
    act(e, true)
  })
  canvas.addEventListener('pointermove', (e) => {
    const { r, c } = cellAt(e)
    const ch = rows()[r]?.[c]
    status.textContent = ch === undefined ? '' : `row ${r} · col ${c} · ${ch === '.' ? 'empty' : `'${ch}'`}`
    if (painting && tool !== 'fill') act(e, false)
  })
  canvas.addEventListener('pointerup', () => {
    if (!painting) return
    painting = false
    touch(true)
  })

  /** Paint the art flat at `z` pixels per pixel, with a checkerboard behind. */
  function drawFlat(c: HTMLCanvasElement, z: number, shade?: (r: number, col: number, rgb: number[]) => number[] | null) {
    const R = rows()
    const w = width()
    c.width = w * z
    c.height = R.length * z
    const x = c.getContext('2d')!
    for (let r = 0; r < R.length; r++)
      for (let col = 0; col < w; col++) {
        const ch = R[r][col] ?? '.'
        const checker = (r + col) % 2 ? '#1b1d21' : '#16181b'
        let fill = checker
        if (ch !== '.') {
          const hx = colorOf(ch)
          const rgb = hx ? hex(hx) : [1, 0, 1]
          const s = shade ? shade(r, col, rgb) : rgb
          fill = s ? `rgb(${s.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',')})` : checker
        }
        x.fillStyle = fill
        x.fillRect(col * z, r * z, z, z)
      }
  }

  function draw() {
    const R = rows()
    const w = width()
    const room = canvas.parentElement?.getBoundingClientRect()
    zoom = room ? Math.max(2, Math.min(28, Math.floor(Math.min((room.width - 24) / w, (room.height - 24) / R.length)))) : 12
    drawFlat(canvas, zoom)
    if (grid && zoom >= 6) {
      ctx.strokeStyle = '#ffffff12'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let c = 1; c < w; c++) (ctx.moveTo(c * zoom + 0.5, 0), ctx.lineTo(c * zoom + 0.5, R.length * zoom))
      for (let r = 1; r < R.length; r++) (ctx.moveTo(0, r * zoom + 0.5), ctx.lineTo(w * zoom, r * zoom + 0.5))
      ctx.stroke()
    }
    // the ground line (sprites stand on their bottom row) and a prop's anchor column
    ctx.strokeStyle = '#f08a3c88'
    ctx.beginPath()
    ctx.moveTo(0, R.length * zoom - 0.5)
    ctx.lineTo(w * zoom, R.length * zoom - 0.5)
    ctx.stroke()
    if (target.anchor) {
      ctx.fillStyle = '#f08a3c33'
      ctx.fillRect(target.anchor.get() * zoom, 0, zoom, R.length * zoom)
    }
    // previews: shaded under the light, normals, parts
    const parts = (target.parts() ?? []) as Part[]
    const nm = parts.length ? partNormals(R, parts) : null
    const pz = Math.max(2, Math.min(6, Math.floor(160 / Math.max(w, R.length))))
    const L = [light.x, light.y, Math.sqrt(Math.max(0, 1 - light.x ** 2 - light.y ** 2))]
    const n = (r: number, c: number) => {
      if (!nm) return [0, 0, 1]
      const i = (r + 2) * nm.w + c + 2
      return [nm.nx[i], nm.ny[i], nm.nz[i]]
    }
    drawFlat(previews.shaded, pz, (r, c, rgb) => {
      const N = n(r, c)
      const s = 0.22 + Math.max(0, N[0] * L[0] + N[1] * L[1] + N[2] * L[2])
      return [rgb[0] * s * 1.08, rgb[1] * s, rgb[2] * s * 0.9]
    })
    drawFlat(previews.normals, pz, (r, c) => {
      const N = n(r, c)
      return [N[0] * 0.5 + 0.5, N[1] * 0.5 + 0.5, N[2]]
    })
    drawFlat(previews.parts, pz, (r, c) => {
      const ch = R[r][c]
      const k = parts.findIndex((p) => p.chars.includes(ch))
      return k < 0 ? [0.4, 0.4, 0.4] : hex(PART_TINTS[k % PART_TINTS.length])
    })
    renderPalette()
    renderParts()
    sizeLabel.textContent = `${w} × ${R.length}`
  }

  // ---------------------------------------------------------------- the light pad
  const pad = h('canvas', { class: 'light-pad', width: 64, height: 64, title: 'drag to move the light' })
  const drawPad = () => {
    const x = pad.getContext('2d')!
    x.clearRect(0, 0, 64, 64)
    x.strokeStyle = '#3a3e45'
    x.beginPath()
    x.arc(32, 32, 30, 0, Math.PI * 2)
    x.stroke()
    x.fillStyle = '#f08a3c'
    x.beginPath()
    x.arc(32 + light.x * 30, 32 - light.y * 30, 4, 0, Math.PI * 2)
    x.fill()
  }
  const movePad = (e: PointerEvent) => {
    const b = pad.getBoundingClientRect()
    let x = ((e.clientX - b.left) / b.width) * 2 - 1
    let y = -(((e.clientY - b.top) / b.height) * 2 - 1)
    const l = Math.hypot(x, y)
    if (l > 0.98) ((x *= 0.98 / l), (y *= 0.98 / l))
    light.x = x
    light.y = y
    drawPad()
    draw()
  }
  pad.addEventListener('pointerdown', (e) => {
    pad.setPointerCapture(e.pointerId)
    movePad(e)
  })
  pad.addEventListener('pointermove', (e) => e.buttons && movePad(e))
  drawPad()

  // ---------------------------------------------------------------- toolbar
  const toolBtns = (
    [
      ['pencil', 'B', 'paint with the brush (right-click erases)'],
      ['erase', 'E', 'erase to transparent'],
      ['pick', 'I', 'pick a colour from the art'],
      ['fill', 'F', 'fill an area'],
      ['anchor', 'A', "set a prop's anchor column (where it stands)"],
    ] as const
  ).map(([t, key, hint]) => h('button', { 'data-tool': t, title: `${hint} (${key})`, onclick: () => setTool(t) }, t))
  const setTool = (t: Tool) => {
    tool = t
    for (const b of toolBtns) b.setAttribute('aria-pressed', String(b.dataset.tool === t))
  }
  const sizeLabel = h('span', { class: 'dim' })
  const edgeBtns = (['top', 'bottom', 'left', 'right'] as const).map((edge) =>
    h(
      'span',
      { class: 'edge' },
      h('span', { class: 'dim' }, edge),
      h('button', { title: `add a ${edge === 'top' || edge === 'bottom' ? 'row' : 'column'} at the ${edge}`, onclick: () => resize(edge, true) }, '+'),
      h('button', { title: `remove the ${edge} ${edge === 'top' || edge === 'bottom' ? 'row' : 'column'}`, onclick: () => resize(edge, false) }, '−'),
    ),
  )
  const toolbar = h(
    'div',
    { class: 'art-tools' },
    h('div', { class: 'seg' }, ...toolBtns),
    h('button', { title: 'undo (⌘Z)', onclick: () => restore(undo, redo) }, 'undo'),
    h('button', { title: 'redo (⇧⌘Z)', onclick: () => restore(redo, undo) }, 'redo'),
    h(
      'label',
      { class: 'row check' },
      h('input', { type: 'checkbox', checked: true, onchange: (e: Event) => ((grid = (e.target as HTMLInputElement).checked), draw()) }),
      h('span', {}, 'grid'),
    ),
    sizeLabel,
    ...edgeBtns,
    status,
  )
  window.addEventListener('keydown', (e) => {
    if (!center.isConnected || center.hidden || (e.target as HTMLElement).closest('input, select, textarea')) return
    const k = e.key.toLowerCase()
    if ((e.metaKey || e.ctrlKey) && k === 'z') {
      e.preventDefault()
      return e.shiftKey ? restore(redo, undo) : restore(undo, redo)
    }
    const t = ({ b: 'pencil', e: 'erase', i: 'pick', f: 'fill', a: 'anchor' } as Record<string, Tool>)[k]
    if (t && !e.metaKey && !e.ctrlKey) setTool(t)
  })

  // ---------------------------------------------------------------- palette and parts
  const paletteSelect = h('select', { onchange: (e: Event) => ((paletteName = (e.target as HTMLSelectElement).value), draw()) })
  const paletteList = h('div', { class: 'pal' })
  const setBrush = (ch: string) => {
    brush = ch
    if (tool === 'erase' || tool === 'pick') setTool('pencil')
    renderPalette()
  }
  const worldNames = Object.keys(DATA.palette)
  function renderPalette() {
    const pals = target.palettes()
    paletteSelect.replaceChildren(...Object.keys(pals).map((k) => h('option', { value: k, selected: k === paletteName }, k)))
    const pal = palette()
    const used = new Set(rows().join('').replace(/\./g, ''))
    const shine = target.shine()
    const chars = [...new Set([...Object.keys(pal), ...used])].sort()
    paletteList.replaceChildren(
      ...chars.map((ch) => {
        const v = pal[ch]
        const missing = v === undefined
        const color = h('input', { type: 'color', value: colorOf(ch) ?? '#ff00ff', title: 'colour' }) as HTMLInputElement
        color.addEventListener('input', () => {
          pal[ch] = color.value
          touch(false)
        })
        color.addEventListener('change', () => touch(true))
        const link = h('select', { title: 'link to a world colour (it follows when the world colour changes)' })
        link.append(h('option', { value: '' }, 'own colour'), ...worldNames.map((n) => h('option', { value: n, selected: v === `$${n}` }, `$${n}`)))
        link.addEventListener('change', () => {
          pal[ch] = link.value ? `$${link.value}` : (colorOf(ch) ?? '#ff00ff')
          touch(true)
        })
        const shineIn =
          shine &&
          (h('input', {
            type: 'number',
            min: 0,
            max: 1,
            step: 0.05,
            value: shine[ch] ?? 0,
            title: 'shine (how much it gleams)',
            class: 'num',
          }) as HTMLInputElement)
        shineIn?.addEventListener('change', () => {
          const s = Number(shineIn.value)
          if (s > 0) shine![ch] = s
          else delete shine![ch]
          touch(true)
        })
        return h(
          'div',
          { class: `pal-row${ch === brush ? ' on' : ''}${missing ? ' missing' : ''}`, title: missing ? 'used in the art but not in the palette' : '' },
          h('button', { class: 'ch', title: 'paint with this', onclick: () => setBrush(ch) }, ch),
          color,
          link,
          shineIn,
          h(
            'button',
            {
              title: used.has(ch) ? 'still used in this frame' : 'remove from the palette',
              disabled: used.has(ch),
              onclick: () => {
                delete pal[ch]
                touch(true)
              },
            },
            '×',
          ),
        )
      }),
      h(
        'button',
        {
          onclick: () => {
            const free = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').find((c) => !(c in pal) && !used.has(c))
            if (!free) return
            pal[free] = '#888888'
            setBrush(free)
            touch(true)
          },
        },
        '+ colour',
      ),
    )
  }
  const partsList = h('div', { class: 'parts' })
  function renderParts() {
    const parts = target.parts()
    if (!parts) {
      partsList.replaceChildren(h('p', { class: 'dim' }, 'This art is flat (no parts, no normals).'))
      return
    }
    const used = new Set(rows().join('').replace(/\./g, ''))
    const assigned = new Set(parts.flatMap((p) => [...p.chars]))
    const loose = [...used].filter((c) => !assigned.has(c))
    partsList.replaceChildren(
      h('p', { class: 'dim' }, 'Each part is a patch of these chars, shaped as one form. Its normals follow that shape.'),
      ...parts.map((p, i) => {
        const chars = h('input', { type: 'text', value: p.chars, title: 'the chars in this part', class: 'chars' }) as HTMLInputElement
        chars.addEventListener('change', () => {
          p.chars = chars.value.replace(/[\s.]/g, '')
          touch(true)
        })
        const kind = h('select', { title: 'its shape' })
        kind.append(...KINDS.map((k) => h('option', { value: k, selected: k === p.kind }, k)))
        kind.addEventListener('change', () => {
          p.kind = kind.value
          touch(true)
        })
        return h(
          'div',
          { class: 'part-row' },
          h('span', { class: 'sw', style: `background:${PART_TINTS[i % PART_TINTS.length]}` }),
          chars,
          kind,
          h(
            'button',
            {
              title: 'remove this part',
              onclick: () => {
                parts.splice(i, 1)
                touch(true)
              },
            },
            '×',
          ),
        )
      }),
      ...(loose.length ? [h('p', { class: 'warn' }, `not in any part (shaded as one dome): ${loose.join(' ')}`)] : []),
      h(
        'button',
        {
          onclick: () => {
            parts.push({ chars: loose.join(''), kind: 'dome' })
            touch(true)
          },
        },
        '+ part',
      ),
    )
  }

  // ---------------------------------------------------------------- assets
  const left = h('div', { class: 'assets' })
  const groups = [...new Set(all.map((t) => t.group))]
  for (const g of groups)
    left.append(
      h(
        'section',
        {},
        h('h3', {}, g),
        ...all
          .filter((t) => t.group === g)
          .map((t) =>
            h(
              'button',
              {
                class: 'asset',
                'data-id': t.id,
                onclick: () => {
                  target = t
                  if (!(paletteName in t.palettes())) paletteName = 'default'
                  brush = rows().join('').replace(/\./g, '')[0] ?? Object.keys(palette())[0] ?? ''
                  for (const b of left.querySelectorAll<HTMLButtonElement>('.asset')) b.setAttribute('aria-pressed', String(b.dataset.id === t.id))
                  draw()
                },
              },
              t.label,
            ),
          ),
      ),
    )
  left.querySelector('.asset')?.setAttribute('aria-pressed', 'true')

  const right = h(
    'div',
    { class: 'art-side' },
    h('section', {}, h('h3', {}, 'palette'), h('div', { class: 'row' }, h('span', { class: 'dim' }, 'variant'), paletteSelect), paletteList),
    h('section', {}, h('h3', {}, 'parts'), partsList),
  )

  const pip = h('div', { class: 'pip' })
  const center = h(
    'div',
    { class: 'art' },
    toolbar,
    h('div', { class: 'art-main' }, h('div', { class: 'art-board' }, canvas)),
    h(
      'div',
      { class: 'art-previews' },
      h('figure', {}, previews.shaded, h('figcaption', {}, 'shaded')),
      h('figure', {}, pad, h('figcaption', {}, 'light')),
      h('figure', {}, previews.normals, h('figcaption', {}, 'normals')),
      h('figure', {}, previews.parts, h('figcaption', {}, 'parts')),
      pip,
    ),
  )
  setTool('pencil')
  brush = rows().join('').replace(/\./g, '')[0] ?? ''
  new ResizeObserver(() => center.isConnected && draw()).observe(center)
  return { center, left, right, pip, refresh: draw }
}
