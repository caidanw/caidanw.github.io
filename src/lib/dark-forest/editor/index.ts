/**
 * The Dark Forest editor (localhost, #edit). Chrome around a smaller live scene: sim controls
 * in the header, layers / views / overlays / ambient on the left, the pixel inspector and
 * light tuning on the right, stats, the village and the story in the footer. Every control
 * writes to the live settings, so changes show on the next frame.
 */
import type { DarkForest } from '../index'
import {
  LIGHT_KINDS,
  SOUND_SOURCES,
  VIEWS,
  defaultLightTune,
  defaultSoundTune,
  resetSettings,
  settings,
  soundDefaults,
  type LightTune,
  type View,
} from '../settings'
import { DATA, FILES, applyData, changed, snapshot, type DataFile } from '../art'
import { RELICS, type Relic } from '../world'
import { createArtEditor } from './art-editor'
import { createSceneEditor } from './scene-editor'
import { applyStaged, changedPaths, discardStaged, loadStaged, stage as stageFile, stagingAvailable } from './staging'
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
  /** A data file was edited live: re-derive, stage and list it. */
  edited(file: DataFile): void
}

export function mountEditor(): Editor {
  document.head.append(h('style', {}, CSS))
  document.documentElement.classList.add('dfe-on')

  let forest: DarkForest | null = null
  const refreshers: (() => void)[] = []
  const live = <T extends { refresh(): void }>(x: T) => (refreshers.push(() => x.refresh()), x)

  // ---------------------------------------------------------------- modes: the scene, or the art
  const modeBtns = (['scene', 'art'] as const).map((m) =>
    h(
      'button',
      { 'data-mode': m, title: m === 'scene' ? 'the live scene, its layers and lights' : 'edit sprites and props pixel by pixel', onclick: () => setMode(m) },
      m,
    ),
  )
  const modeSeg = h('div', { class: 'group seg' }, ...modeBtns)

  // ---------------------------------------------------------------- header: the sim
  const pauseBtn = h('button', { onclick: () => forest?.togglePause() }, 'pause')
  const stepBtn = h('button', { title: 'advance one frame', onclick: () => forest?.stepFrame() }, 'step')
  const speed = h('select', { onchange: (e: Event) => (settings.speed = Number((e.target as HTMLSelectElement).value)) })
  for (const s of [0.25, 0.5, 1, 2, 4, 8, 16]) speed.append(h('option', { value: s, selected: s === settings.speed }, `${s}×`))
  const toolBtns = (['play', 'inspect', 'move'] as const).map((tool) =>
    h(
      'button',
      {
        'data-tool': tool,
        title: { play: 'clicks drop sticks', inspect: 'clicks inspect a pixel', move: 'drag things around the clearing' }[tool],
        onclick: () => setTool(tool),
      },
      tool,
    ),
  )
  const setTool = (tool: 'play' | 'inspect' | 'move') => {
    settings.tool = tool
    for (const b of toolBtns) b.setAttribute('aria-pressed', String(b.dataset.tool === tool))
    if (tool === 'inspect') showTab('inspect')
    if (tool === 'move') showTab('object')
    if (tool !== 'move') settings.selection = null
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
  const soundBtn = h('button', { title: 'the soundscape (S)', onclick: () => forest?.toggleSound() }, 'sound')
  const volume = live(
    slider(
      'volume',
      () => settings.sound.volume,
      (v) => forest?.setVolume(v),
      0,
      1.5,
    ),
  )
  const meter = h('span', { class: 'meter', title: 'how loud it is right now' }, h('i', {}))
  const gpuToggle = live(
    check(
      'gpu',
      () => settings.gpu,
      (v) => (settings.gpu = v),
      'light the frame on the GPU (WebGL2); off: the CPU reference',
    ),
  )
  const relic = h('select', { onchange: (e: Event) => forest?.setRelic((e.target as HTMLSelectElement).value as Relic) })
  for (const r of RELICS) relic.append(h('option', { value: r }, r))
  const head = h(
    'header',
    { class: 'dfe-head' },
    h('strong', {}, 'dark forest'),
    modeSeg,
    h('span', { class: 'dim' }, 'editor'),
    h('div', { class: 'group' }, pauseBtn, stepBtn, speed),
    h('div', { class: 'group' }, gpuToggle),
    h('div', { class: 'group' }, soundBtn, volume, meter),
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
  const tabs = {
    inspect: h('div', { class: 'tab' }),
    lights: h('div', { class: 'tab' }),
    sound: h('div', { class: 'tab' }),
    object: h('div', { class: 'tab' }),
    world: h('div', { class: 'tab' }),
    art: h('div', { class: 'tab' }),
    changes: h('div', { class: 'tab' }),
  }
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
            settings.lights[kind] = defaultLightTune(kind)
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
  tabs.lights.append(
    h('p', { class: 'dim' }, 'Tuning applies to every light of a kind. Open one to highlight it in the scene.'),
    h(
      'button',
      {
        title: 'stage the current tuning as the defaults (data/lights.json)',
        onclick: () => {
          DATA.lights = structuredClone(settings.lights) as unknown as typeof DATA.lights
          edited('lights')
        },
      },
      'save tuning as defaults',
    ),
    ...lightRows.map((r) => r.el),
  )

  // ---------------------------------------------------------------- sound: every source on its own bus
  const soundRows = SOUND_SOURCES.map(({ key, label, hint, rate, pitch }) => {
    const T = () => settings.sound.sources[key]
    const on = check(
      '',
      () => T().on,
      (v) => (T().on = v),
      'on / off',
    )
    const meter = h('span', { class: 'meter', title: 'how loud it is right now' }, h('i', {}))
    const solo = h(
      'button',
      {
        title: 'hear only this',
        onclick: () => {
          settings.sound.solo = settings.sound.solo === key ? null : key
          refreshSound()
        },
      },
      'solo',
    )
    const play = h('button', { title: 'play an example now', onclick: () => forest?.audition(key) }, '▶')
    const sliders = [
      slider(
        'level',
        () => T().gain,
        (v) => (T().gain = v),
        0,
        3,
      ),
      rate &&
        slider(
          rate,
          () => T().rate,
          (v) => (T().rate = v),
          0.1,
          4,
        ),
      slider(
        pitch,
        () => T().pitch,
        (v) => (T().pitch = v),
        0.4,
        2.5,
      ),
    ].filter((s): s is ReturnType<typeof slider> => !!s)
    const body = h(
      'div',
      { class: 'body', hidden: true },
      h('p', { class: 'dim' }, hint),
      ...sliders,
      h(
        'button',
        {
          onclick: () => {
            settings.sound.sources[key] = defaultSoundTune(key)
            refreshSound()
          },
        },
        'reset',
      ),
    )
    const title = h(
      'div',
      {
        class: 'title',
        onclick: (e: Event) => {
          const t = e.target as HTMLElement
          if (t.tagName === 'INPUT' || t.tagName === 'BUTTON') return
          body.hidden = !body.hidden
          el.classList.toggle('open', !body.hidden)
        },
      },
      on,
      h('span', {}, label),
      meter,
      solo,
      play,
    )
    const el = h('div', { class: 'light sound' }, title, body)
    return {
      el,
      refresh() {
        on.refresh()
        solo.setAttribute('aria-pressed', String(settings.sound.solo === key))
        el.classList.toggle('muted', !!settings.sound.solo && settings.sound.solo !== key)
        ;(meter.firstChild as HTMLElement).style.width = `${Math.min(100, (forest?.soundLevel(key) ?? 0) * 600)}%`
        if (!body.hidden) for (const s of sliders) s.refresh()
      },
    }
  })
  const refreshSound = () => soundRows.forEach((r) => r.refresh())
  tabs.sound.append(
    h('p', { class: 'dim' }, 'Every source on its own bus. ▶ plays an example; solo hears only that one.'),
    h(
      'div',
      { class: 'row' },
      h('button', { onclick: () => forest?.toggleSound() }, 'sound on / off'),
      h(
        'button',
        {
          onclick: () => {
            settings.sound.solo = null
            refreshSound()
          },
        },
        'unsolo',
      ),
      h(
        'button',
        {
          title: 'stage the current sound tuning as the defaults (data/sound.json)',
          onclick: () => {
            DATA.sound = structuredClone(settings.sound.sources) as unknown as typeof DATA.sound
            edited('sound')
          },
        },
        'save as defaults',
      ),
    ),
    ...soundRows.map((r) => r.el),
  )

  // ---------------------------------------------------------------- changes: staged edits
  // what's on disk, from when the editor opened: what staged edits are compared against
  const baseline = Object.fromEntries(FILES.map((f) => [f, snapshot(f)])) as Record<DataFile, unknown>
  let canSave = false
  const changesBody = h('div', {})
  const changedFiles = () => FILES.filter((f) => changedPaths(baseline[f], DATA[f]).length)
  const renderChanges = () => {
    const files = changedFiles()
    const tab = tabBtns.find((b) => b.dataset.tab === 'changes')!
    tab.textContent = files.length ? `changes (${files.length})` : 'changes'
    if (!canSave) {
      changesBody.replaceChildren(h('p', { class: 'dim' }, "Saving needs the dev server (npm run dev). Edits still show live; they just can't be kept."))
      return
    }
    if (!files.length) {
      changesBody.replaceChildren(
        h('p', { class: 'dim' }, 'Nothing staged. Edits you make are staged here first; nothing is written to the data files until you apply it.'),
      )
      return
    }
    changesBody.replaceChildren(
      ...files.map((f) => {
        const paths = changedPaths(baseline[f], DATA[f])
        return h(
          'div',
          { class: 'change' },
          h('div', { class: 'title' }, h('b', {}, `data/${f}.json`), h('span', { class: 'dim' }, ` ${paths.length} change${paths.length === 1 ? '' : 's'}`)),
          h('ul', {}, ...paths.slice(0, 14).map((p) => h('li', {}, p)), paths.length > 14 && h('li', { class: 'dim' }, `and ${paths.length - 14} more`)),
          h(
            'div',
            { class: 'group' },
            h(
              'button',
              { title: 'write this file into data/ (the page reloads with it)', onclick: () => applyStaged(f).then(() => location.reload()) },
              'apply',
            ),
            h(
              'button',
              {
                title: 'drop these edits and go back to what is on disk',
                onclick: () =>
                  discardStaged(f, baseline[f]).then(() => {
                    if (f === 'lights') resetSettings('lights')
                    if (f === 'sound') settings.sound.sources = soundDefaults()
                    art.refresh()
                    scene.refresh()
                    renderChanges()
                    refreshAll()
                  }),
              },
              'discard',
            ),
          ),
        )
      }),
    )
  }
  /** Something in a data file was edited live: re-derive it, stage it, list it. */
  const edited = (file: DataFile) => {
    changed(file)
    if (canSave) stageFile(file, renderChanges)
    renderChanges()
  }
  tabs.changes.append(changesBody)
  const right = h(
    'aside',
    { class: 'dfe-right' },
    h('nav', { class: 'tabs seg' }, ...tabBtns),
    tabs.inspect,
    tabs.lights,
    tabs.sound,
    tabs.object,
    tabs.world,
    tabs.art,
    tabs.changes,
  )

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
  const centerArea = h('div', { class: 'dfe-center' }, stage)
  // the art editor: assets on the left, the board in the middle (the scene shrinks to a corner)
  const art = createArtEditor((file) => edited(file))
  const leftArt = h('aside', { class: 'dfe-left', hidden: true }, art.left)
  tabs.art.append(art.right)
  // scene editing: the move tool, the selected object, the world palette
  const scene = createSceneEditor({
    canvas: () => stage.querySelector('canvas'),
    tagAt: (x, y) => forest?.tagAt(x, y) ?? null,
    edited: (file) => edited(file),
    showObject: () => showTab('object'),
  })
  tabs.object.append(scene.object)
  tabs.world.append(scene.world)
  const setMode = (m: 'scene' | 'art') => {
    for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === m))
    const isArt = m === 'art'
    left.hidden = isArt
    leftArt.hidden = !isArt
    if (isArt) {
      art.pip.append(stage)
      centerArea.replaceChildren(art.center)
      art.refresh()
    } else centerArea.replaceChildren(stage)
    for (const b of tabBtns) b.hidden = isArt ? ['inspect', 'lights', 'sound', 'object', 'world'].includes(b.dataset.tab!) : b.dataset.tab === 'art'
    showTab(isArt ? 'art' : 'inspect')
  }
  const root = h('div', { class: 'dfe' }, head, left, leftArt, centerArea, right, foot)
  document.body.append(root)
  setTool(settings.tool)
  setMode('scene')

  const refreshAll = () => {
    if (!forest) return
    for (const r of refreshers) r()
    const s = forest.state()
    pauseBtn.textContent = s.paused ? 'play' : 'pause'
    pauseBtn.setAttribute('aria-pressed', String(s.paused))
    stepBtn.toggleAttribute('disabled', !s.paused)
    rainBtn.setAttribute('aria-pressed', String(s.rain))
    soundBtn.setAttribute('aria-pressed', String(s.sound))
    ;(meter.firstChild as HTMLElement).style.width = `${Math.min(100, forest.soundLevel() * 400)}%`
    relic.value = forest.relic()
    const all = forest.lights()
    for (const r of lightRows) r.refresh(all)
    if (!tabs.sound.hidden) refreshSound()
    const st = forest.stats()
    const t = st.timings
    stats.replaceChildren(
      h('div', {}, h('b', {}, `${fmt(st.fps, 0)} fps`), h('span', { class: 'dim' }, ` · ${fmt(t.draw + t.compose + t.present, 1)} ms`)),
      h('div', { class: 'dim' }, `draw ${fmt(t.draw, 1)} · light ${fmt(t.compose, 1)} · present ${fmt(t.present, 1)} ms`),
      h('div', { class: 'dim' }, `${st.lights} lights · drawn on the ${st.path.toUpperCase()}`),
      ...(st.gpuDiff
        ? [
            h(
              'div',
              { class: st.gpuDiff!.max > 4 / 255 ? 'warn' : 'dim' },
              `CPU vs GPU: mean ${(st.gpuDiff.mean * 255).toFixed(2)} · max ${(st.gpuDiff.max * 255).toFixed(1)} · ${(st.gpuDiff.over * 100).toFixed(2)}% of pixels off (of 255)`,
            ),
          ]
        : []),
    )
    const w = forest.inspect()
    village.replaceChildren(
      h('li', {}, 'knight ', h('span', { class: 'dim' }, `${w.knight.fsm.state} · vigil ${Math.round((w.knight.vigil / w.knight.vigilLength) * 100)}%`)),
      h('li', {}, 'fire ', h('span', { class: 'dim' }, `${w.fire.fsm.state} · heat ${fmt(w.fire.heat)} · fuel ${fmt(w.fire.fuel)} · pile ${w.pile}`)),
      h('li', {}, 'deer ', h('span', { class: 'dim' }, `${w.deer.fsm.state} · thirst ${fmt(w.deer.thirst)}`)),
      ...w.mush.map((m) =>
        h(
          'li',
          { title: 'diligence: how soon they notice the fire · likes: the fire they want · hardy: cold tolerance · merry: festive mood' },
          `${m.name}${m.id === w.keeperId ? ' (keeper)' : ''} `,
          h(
            'span',
            { class: 'dim' },
            `${m.fsm.state} · warmth ${fmt(m.warmth)} · diligence ${fmt(m.diligence)} · likes ${fmt(m.likes)} · hardy ${fmt(m.hardy)} · `,
          ),
          h('span', { class: m.merry > 0.4 ? 'warn' : 'dim' }, `merry ${fmt(m.merry)}`),
        ),
      ),
    )
    if (settings.inspect) renderInspector()
  }

  return {
    stage,
    attach(f) {
      forest = f
      scene.refresh()
      refreshAll()
      window.setInterval(refreshAll, 250)
      // pick up edits staged in an earlier session
      stagingAvailable().then(async (ok) => {
        canSave = ok
        if (ok) for (const [file, st] of Object.entries(await loadStaged())) applyData(file as DataFile, st.staged)
        renderChanges()
      })
    },
    edited,
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
