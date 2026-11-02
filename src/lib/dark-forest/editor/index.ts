/**
 * The Dark Forest editor (localhost, #edit). Chrome around a smaller live scene: sim controls
 * in the header, layers / views / overlays / ambient on the left, the pixel inspector and
 * light tuning on the right, stats, the village and the story in the footer. Every control
 * writes to the live settings, so changes show on the next frame.
 */
import type { DarkForest } from '../index'
import { LIGHT_KINDS, VIEWS, defaultLightTune, resetSettings, settings, type LightTune, type View } from '../settings'
import { RELICS, type Relic } from '../world'
import { CSS } from './style'

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

const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—')
const rgb = (c: ArrayLike<number>) => `rgb(${[0, 1, 2].map((i) => Math.round(Math.min(1, Math.max(0, c[i])) * 255)).join(',')})`
const swatch = (c: ArrayLike<number>) => h('span', { class: 'sw', style: `background:${rgb(c)}` })

/** A labelled range input bound to a getter/setter. */
function slider(label: string, get: () => number, set: (v: number) => void, min: number, max: number, step = 0.01) {
  const out = h('output', {}, fmt(get()))
  const input = h('input', { type: 'range', min, max, step, value: get() }) as HTMLInputElement
  input.addEventListener('input', () => {
    set(Number(input.value))
    out.textContent = fmt(Number(input.value))
  })
  const row = h('label', { class: 'row slider' }, h('span', {}, label), input, out)
  return Object.assign(row, {
    refresh() {
      if (document.activeElement === input) return
      input.value = String(get())
      out.textContent = fmt(get())
    },
  })
}

function check(label: string, get: () => boolean, set: (v: boolean) => void, hint?: string) {
  const input = h('input', { type: 'checkbox' }) as HTMLInputElement
  input.checked = get()
  input.addEventListener('change', () => set(input.checked))
  const row = h('label', { class: 'row check', title: hint }, input, h('span', {}, label))
  return Object.assign(row, { refresh: () => (input.checked = get()) })
}

function section(title: string, ...kids: Child[]) {
  return h('section', {}, h('h3', {}, title), ...kids)
}

export interface Editor {
  /** Where the scene's canvas goes. */
  stage: HTMLElement
  attach(forest: DarkForest): void
  story(line: string): void
  refresh(): void
}

export function mountEditor(): Editor {
  document.head.append(h('style', {}, CSS))
  document.documentElement.classList.add('dfe-on')

  let forest: DarkForest | null = null
  const refreshers: (() => void)[] = []
  const live = <T extends { refresh(): void }>(x: T) => (refreshers.push(() => x.refresh()), x)

  // ---------------------------------------------------------------- header: the sim
  const pauseBtn = h('button', { onclick: () => forest?.togglePause() }, 'pause')
  const stepBtn = h('button', { title: 'advance one frame', onclick: () => forest?.stepFrame() }, 'step')
  const speed = h('select', { onchange: (e: Event) => (settings.speed = Number((e.target as HTMLSelectElement).value)) })
  for (const s of [0.25, 0.5, 1, 2, 4, 8, 16]) speed.append(h('option', { value: s, selected: s === settings.speed }, `${s}×`))
  const toolBtns = (['play', 'inspect'] as const).map((tool) =>
    h('button', { 'data-tool': tool, title: tool === 'play' ? 'clicks drop sticks' : 'clicks inspect a pixel', onclick: () => setTool(tool) }, tool),
  )
  const setTool = (tool: 'play' | 'inspect') => {
    settings.tool = tool
    for (const b of toolBtns) b.setAttribute('aria-pressed', String(b.dataset.tool === tool))
    if (tool === 'inspect') showTab('inspect')
  }
  const heatAuto = check(
    'auto',
    () => settings.fireHeat === null,
    (v) => (settings.fireHeat = v ? null : (forest?.inspect().fire.heat ?? 0.7)),
    'let the fire burn on its own',
  )
  const heat = live(
    slider(
      'heat',
      () => settings.fireHeat ?? forest?.inspect().fire.heat ?? 0,
      (v) => (settings.fireHeat = v),
      0,
      1.2,
    ),
  )
  refreshers.push(() => heatAuto.refresh())
  const rainBtn = h('button', { onclick: () => forest?.toggleRain() }, 'rain')
  const relic = h('select', { onchange: (e: Event) => forest?.setRelic((e.target as HTMLSelectElement).value as Relic) })
  for (const r of RELICS) relic.append(h('option', { value: r }, r))
  const head = h(
    'header',
    { class: 'dfe-head' },
    h('strong', {}, 'dark forest'),
    h('span', { class: 'dim' }, 'editor'),
    h('div', { class: 'group' }, pauseBtn, stepBtn, speed),
    h('div', { class: 'group seg' }, ...toolBtns),
    h('div', { class: 'group' }, h('span', { class: 'dim' }, 'fire'), heatAuto, heat),
    h('div', { class: 'group' }, rainBtn, h('span', { class: 'dim' }, 'relic'), relic),
    h(
      'div',
      { class: 'group' },
      h('button', { title: 'someone new walks into the clearing', onclick: () => forest?.spawnShroomfolk() }, '+ shroomfolk'),
      h('button', { title: "end the knight's vigil (he rises on the next dry night with a good fire)", onclick: () => forest?.endVigil() }, 'end vigil'),
    ),
    h('a', { class: 'exit', href: location.pathname }, 'exit editor'),
  )

  // ---------------------------------------------------------------- left: what's drawn
  const L = settings.layers
  const layerRows: [keyof typeof L, string, string][] = [
    ['bloom', 'bloom', 'the soft glow around bright things'],
    ['normals', 'normals', 'objects shaded by their surface direction'],
    ['emissives', 'emissives', 'fire, caps, embers, glints'],
    ['reflections', 'reflections', 'the pool mirrors the world'],
    ['mist', 'mist', 'the far trees fade into mist'],
    ['glints', 'leaf glints', 'moonlit speckles on the foliage'],
    ['stars', 'stars', 'twinkling stars'],
    ['rain', 'rain streaks', 'drawn rain (the weather still happens)'],
    ['labels', 'hover labels', 'names under the pointer'],
    ['shadows', 'shadows', 'lights cast shadows from everything standing in them'],
  ]
  const layers = layerRows.map(([k, label, hint]) =>
    live(
      check(
        label,
        () => L[k],
        (v) => (L[k] = v),
        hint,
      ),
    ),
  )
  const views = h('div', { class: 'views' })
  for (const v of VIEWS) {
    const input = h('input', { type: 'radio', name: 'dfe-view', value: v.view, checked: settings.view === v.view }) as HTMLInputElement
    input.addEventListener('change', () => (settings.view = v.view as View))
    views.append(h('label', { class: 'row check', title: v.hint }, input, h('span', {}, v.label)))
  }
  const O = settings.overlays
  const overlayRows: [keyof typeof O, string, string][] = [
    ['lights', 'lights', 'where each light is and how far it reaches'],
    ['casters', 'shadow casters', 'every silhouette that casts a shadow, and its foot'],
    ['nav', 'walkable grid', 'cells nobody can walk through'],
    ['paths', 'paths', 'where the shroomfolk are walking'],
    ['states', 'state labels', 'states and needs over everyone'],
  ]
  const overlays = overlayRows.map(([k, label, hint]) =>
    live(
      check(
        label,
        () => O[k],
        (v) => (O[k] = v),
        hint,
      ),
    ),
  )
  const A = settings.ambient
  const ambient = [
    live(
      slider(
        'moonlight',
        () => A.moon,
        (v) => (A.moon = v),
        0,
        3,
      ),
    ),
    live(
      slider(
        'mist',
        () => A.mist,
        (v) => (A.mist = v),
        0,
        2,
      ),
    ),
    live(
      slider(
        'bloom',
        () => A.bloom,
        (v) => (A.bloom = v),
        0,
        3,
      ),
    ),
  ]
  const left = h(
    'aside',
    { class: 'dfe-left' },
    section('layers', ...layers),
    section('view', views),
    section('overlays', ...overlays),
    section('ambient', ...ambient, h('button', { onclick: () => (resetSettings('ambient'), refreshAll()) }, 'reset')),
  )

  // ---------------------------------------------------------------- right: inspect, lights
  const tabs = { inspect: h('div', { class: 'tab' }), lights: h('div', { class: 'tab' }) }
  const tabBtns = (Object.keys(tabs) as (keyof typeof tabs)[]).map((k) => h('button', { 'data-tab': k, onclick: () => showTab(k) }, k))
  const showTab = (k: keyof typeof tabs) => {
    for (const [name, el] of Object.entries(tabs)) el.hidden = name !== k
    for (const b of tabBtns) b.setAttribute('aria-pressed', String(b.dataset.tab === k))
  }

  // the pixel inspector
  const inspectBody = h('div', {})
  tabs.inspect.append(
    h('p', { class: 'dim' }, 'Choose ', h('b', {}, 'inspect'), ' in the header, then click the scene. Values update live.'),
    inspectBody,
    h('button', { onclick: () => ((settings.inspect = null), renderInspector()) }, 'clear'),
  )
  const renderInspector = () => {
    const p = forest?.pixel()
    inspectBody.replaceChildren()
    if (!p) return
    const row = (k: string, ...v: Child[]) => h('tr', {}, h('th', {}, k), h('td', {}, ...v))
    const v3 = (v: number[]) => v.map((n) => fmt(n, 2)).join(', ')
    const table = h(
      'table',
      { class: 'kv' },
      row('pixel', `${p.x}, ${p.y}`),
      row('what', p.what + (p.pool ? ' · pool' : '')),
      row('owner', p.owner ?? '—'),
      row('depth', p.what === 'sky' ? 'sky' : p.what === 'ground' ? 'ground' : fmt(p.depth)),
      p.what !== 'sky' && row('world', v3(p.world)),
      p.normal && row('normal', swatch(p.normal.map((n, i) => (i < 2 ? n * 0.5 + 0.5 : n))), v3(p.normal)),
      row('albedo', swatch(p.albedo), v3(p.albedo)),
      p.what === 'object' &&
        row('material', `micro ${fmt(p.material.micro)} × ${fmt(p.material.weight)} · spec ${fmt(p.material.spec)} · glint ${fmt(p.material.glint)}`),
      p.emissive && row('emissive', swatch(p.emissive.color), `a ${fmt(p.emissive.a)} · depth ${fmt(p.emissive.depth)} · bloom ${fmt(p.emissive.bloom)}`),
      row('final', swatch(p.out), v3(p.out)),
    )
    const max = Math.max(0.001, ...p.lights.map((l) => l.amount))
    const lights = h('table', { class: 'lights' })
    for (const l of p.lights.slice(0, 12))
      lights.append(
        h(
          'tr',
          { title: l.kind },
          h('td', {}, swatch(l.color.map((c) => c / Math.max(...l.color, 0.001)))),
          h('td', {}, l.name),
          h('td', { class: 'bar' }, h('i', { style: `width:${(l.amount / max) * 100}%` })),
          h('td', {}, fmt(l.amount, 3)),
        ),
      )
    inspectBody.append(table, h('h4', {}, `light arriving (${p.lights.length})`), p.lights.length ? lights : h('p', { class: 'dim' }, 'none'))
  }

  // light tuning, per kind
  const lightRows = LIGHT_KINDS.map(({ kind, label }) => {
    const T = () => settings.lights[kind]
    const count = h('span', { class: 'dim count' })
    const sw = h('span', { class: 'sw' })
    const on = check(
      '',
      () => T().on,
      (v) => (T().on = v),
      'on / off',
    )
    const shadows = h('select', { onchange: (e: Event) => (T().shadows = (e.target as HTMLSelectElement).value as LightTune['shadows']) })
    for (const s of ['default', 'on', 'off']) shadows.append(h('option', { value: s }, `shadows: ${s}`))
    const sliders = [
      slider(
        'gain',
        () => T().gain,
        (v) => (T().gain = v),
        0,
        4,
      ),
      slider(
        'radius',
        () => T().radius,
        (v) => (T().radius = v),
        0.1,
        3,
      ),
      slider(
        'height',
        () => T().height,
        (v) => (T().height = v),
        -10,
        30,
        0.5,
      ),
      slider(
        'flicker',
        () => T().wobble,
        (v) => (T().wobble = v),
        0,
        3,
      ),
      slider(
        'spill',
        () => T().tail,
        (v) => (T().tail = v),
        0,
        5,
      ),
    ]
    const instances = h('ul', { class: 'instances' })
    const body = h(
      'div',
      { class: 'body', hidden: true },
      ...sliders,
      shadows,
      h(
        'button',
        {
          onclick: () => {
            settings.lights[kind] = defaultLightTune()
            refreshAll()
          },
        },
        'reset',
      ),
      instances,
    )
    const title = h(
      'div',
      {
        class: 'title',
        onclick: (e: Event) => {
          if ((e.target as HTMLElement).tagName === 'INPUT') return
          const open = body.hidden
          for (const r of lightRows) r.close()
          body.hidden = !open
          el.classList.toggle('open', open)
          settings.selectedLight = open ? kind : null
        },
      },
      on,
      sw,
      h('span', {}, label),
      count,
    )
    const el = h('div', { class: 'light' }, title, body)
    return {
      el,
      close() {
        body.hidden = true
        el.classList.remove('open')
      },
      refresh(all: ReturnType<DarkForest['lights']>) {
        const mine = all.filter((l) => l.kind === kind)
        count.textContent = mine.length ? `${mine.length}` : '—'
        if (mine[0]) {
          const c = mine[0].color
          const m = Math.max(...c, 0.001)
          sw.style.background = rgb(c.map((x) => x / m))
        }
        on.refresh()
        shadows.value = T().shadows
        if (body.hidden) return
        for (const s of sliders) s.refresh()
        instances.replaceChildren(
          ...mine
            .slice(0, 10)
            .map((l) =>
              h('li', {}, l.name ?? kind, h('span', { class: 'dim' }, ` r ${fmt(l.radius, 0)} · y ${fmt(l.y, 1)} · ${l.shadows ? 'shadows' : 'no shadows'}`)),
            ),
        )
      },
    }
  })
  tabs.lights.append(h('p', { class: 'dim' }, 'Tuning applies to every light of a kind. Open one to highlight it in the scene.'), ...lightRows.map((r) => r.el))
  const right = h('aside', { class: 'dfe-right' }, h('nav', { class: 'tabs seg' }, ...tabBtns), tabs.inspect, tabs.lights)

  // ---------------------------------------------------------------- footer: stats, village, story
  const stats = h('div', { class: 'stats' })
  const village = h('ul', { class: 'village' })
  const storyLog = h('ol', { class: 'story' })
  const foot = h(
    'footer',
    { class: 'dfe-foot' },
    h('div', {}, h('h3', {}, 'frame'), stats),
    h('div', {}, h('h3', {}, 'village'), village),
    h('div', {}, h('h3', {}, 'story'), storyLog),
  )

  const stage = h('div', { class: 'dfe-stage', 'data-crisp': true })
  const root = h('div', { class: 'dfe' }, head, left, stage, right, foot)
  document.body.append(root)
  setTool(settings.tool)
  showTab('inspect')

  const refreshAll = () => {
    if (!forest) return
    for (const r of refreshers) r()
    const s = forest.state()
    pauseBtn.textContent = s.paused ? 'play' : 'pause'
    pauseBtn.setAttribute('aria-pressed', String(s.paused))
    stepBtn.toggleAttribute('disabled', !s.paused)
    rainBtn.setAttribute('aria-pressed', String(s.rain))
    relic.value = forest.relic()
    const all = forest.lights()
    for (const r of lightRows) r.refresh(all)
    const st = forest.stats()
    const t = st.timings
    stats.replaceChildren(
      h('div', {}, h('b', {}, `${fmt(st.fps, 0)} fps`), h('span', { class: 'dim' }, ` · ${fmt(t.draw + t.compose + t.present, 1)} ms`)),
      h('div', { class: 'dim' }, `draw ${fmt(t.draw, 1)} · light ${fmt(t.compose, 1)} · present ${fmt(t.present, 1)} ms`),
      h('div', { class: 'dim' }, `${st.lights} lights`),
    )
    const w = forest.inspect()
    village.replaceChildren(
      h('li', {}, 'knight ', h('span', { class: 'dim' }, `${w.knight.fsm.state} · vigil ${Math.round((w.knight.vigil / w.knight.vigilLength) * 100)}%`)),
      h('li', {}, 'fire ', h('span', { class: 'dim' }, `${w.fire.fsm.state} · heat ${fmt(w.fire.heat)} · fuel ${fmt(w.fire.fuel)} · pile ${w.pile}`)),
      h('li', {}, 'deer ', h('span', { class: 'dim' }, `${w.deer.fsm.state} · thirst ${fmt(w.deer.thirst)}`)),
      ...w.mush.map((m) =>
        h(
          'li',
          {},
          `${m.name}${m.id === w.keeperId ? ' (keeper)' : ''} `,
          h('span', { class: 'dim' }, `${m.fsm.state} · energy ${fmt(m.energy)} · warmth ${fmt(m.warmth)}`),
        ),
      ),
    )
    if (settings.inspect) renderInspector()
  }

  return {
    stage,
    attach(f) {
      forest = f
      refreshAll()
      window.setInterval(refreshAll, 250)
    },
    story(line) {
      storyLog.prepend(h('li', {}, line))
      while (storyLog.children.length > 40) storyLog.lastElementChild!.remove()
    },
    refresh: () => {
      renderInspector()
      refreshAll()
    },
  }
}
