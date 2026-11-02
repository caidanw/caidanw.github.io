/**
 * The art, live. Sprite and prop art, palettes, parts and light defaults live as JSON in
 * data/ (so the editor saves data, never code). This module loads them, resolves palettes
 * into colours, and keeps every object the renderer uses *the same object* the editor edits:
 * changing a row, a colour or a part shows on the next frame.
 *
 * Palettes are hex strings; "$name" means the world palette's colour `name`, and stays linked
 * to it (edit the world colour and every palette using it follows).
 */
import lightsData from './data/lights.json'
import paletteData from './data/palette.json'
import propsData from './data/props.json'
import spritesData from './data/sprites.json'
import type { Part, PartKind } from './normals'
import { hex, type Color } from './util'

export type Rows = readonly string[]
export type Palette = Record<string, Color>
export type HexPalette = Record<string, string>

export interface PartData {
  chars: string
  kind: string
}
export interface SpriteData {
  frames: Record<string, string[]>
  palettes: Record<string, HexPalette>
  parts: PartData[]
  shine: Record<string, number>
}
export interface PropData {
  rows: string[]
  anchor: number
  palette: HexPalette
  parts: PartData[]
  shine: Record<string, number>
}
export interface RelicData {
  rows: string[]
  palette: HexPalette
}

/** The raw data, exactly what's in data/*.json. The editor edits this and saves it. */
export const DATA = {
  sprites: spritesData as unknown as Record<string, SpriteData>,
  props: propsData as unknown as Record<string, PropData> & { relics: Record<string, RelicData> },
  palette: paletteData as Record<keyof typeof paletteData, string>,
  lights: lightsData as Record<string, Record<string, unknown>>,
}

const MISSING: Color = [1, 0, 1]

/** The world palette, resolved. Colours are updated in place when edited. */
export const WORLD = Object.fromEntries(Object.entries(DATA.palette).map(([k, v]) => [k, hex(v)])) as Record<keyof typeof paletteData, Color>

/** Resolve one palette entry: a hex colour, or "$name" for a world colour (the same object, so it stays linked). */
export const resolveColor = (v: string): Color => (v.startsWith('$') ? ((WORLD as Record<string, Color>)[v.slice(1)] ?? MISSING) : hex(v))

/** Resolve a palette into `into` (in place, so whoever holds it sees the change). */
export function resolvePalette(p: HexPalette, into: Palette = {}): Palette {
  for (const k of Object.keys(into)) if (!(k in p)) delete into[k]
  for (const [ch, v] of Object.entries(p)) into[ch] = resolveColor(v)
  return into
}

const asParts = (p: PartData[]) => p as Part[] & { kind?: PartKind }[]

/** A sprite, ready to draw: frames (the data's own arrays), resolved palettes, parts, shine. */
export interface SpriteAsset {
  frames: Record<string, Rows>
  palettes: Record<string, Palette>
  parts: Part[]
  shine: Record<string, number>
}
export const SPRITES: Record<string, SpriteAsset> = Object.fromEntries(
  Object.entries(DATA.sprites).map(([name, d]) => [
    name,
    {
      frames: d.frames,
      palettes: Object.fromEntries(Object.entries(d.palettes).map(([k, p]) => [k, resolvePalette(p)])),
      parts: asParts(d.parts),
      shine: d.shine,
    },
  ]),
)

/** A prop's art: rows, the column its anchor sits on, palette, parts, and per-char shine. */
export interface PropArt {
  rows: Rows
  anchor: number
  pal: Palette
  parts: Part[]
  shine?: Record<string, number>
}

/** Every prop's art, by name: the objects the renderer draws, kept in step with the data. */
export const PROP_ART: Record<string, PropArt> = {}
/** The relics' art. */
export const RELIC_ART = {} as Record<'antler' | 'crook' | 'key', { rows: Rows; pal: Palette }>

function syncProps() {
  for (const [k, d] of Object.entries(DATA.props)) {
    if (k === 'relics') continue
    const p = d as PropData
    const a = (PROP_ART[k] ??= { rows: p.rows, anchor: p.anchor, pal: {}, parts: p.parts as Part[], shine: p.shine })
    a.rows = p.rows
    a.anchor = p.anchor
    a.parts = p.parts as Part[]
    a.shine = p.shine
    resolvePalette(p.palette, a.pal)
  }
  for (const [k, r] of Object.entries(DATA.props.relics)) {
    const a = (RELIC_ART[k as keyof typeof RELIC_ART] ??= { rows: r.rows, pal: {} })
    a.rows = r.rows
    resolvePalette(r.palette, a.pal)
  }
}
syncProps()

// ---------------------------------------------------------------- editing

/** The data files the editor can edit and save (data/<file>.json). */
export const FILES = ['sprites', 'props', 'palette', 'lights'] as const
export type DataFile = (typeof FILES)[number]

const listeners = new Set<(file: DataFile) => void>()
/** Be told when a data file changes (to rebuild what's derived from it). */
export function onArtChange(fn: (file: DataFile) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** A deep copy of one data file as it is now. */
export const snapshot = (file: DataFile): unknown => structuredClone(DATA[file])

/** Replace the contents of `into` with `from`, keeping `into` (and its arrays) the same objects. */
function replaceInPlace(into: Record<string, unknown>, from: Record<string, unknown>) {
  for (const k of Object.keys(into)) if (!(k in from)) delete into[k]
  for (const [k, v] of Object.entries(from)) {
    const cur = into[k]
    if (Array.isArray(v) && Array.isArray(cur)) cur.splice(0, cur.length, ...structuredClone(v))
    else if (v && typeof v === 'object' && cur && typeof cur === 'object' && !Array.isArray(cur))
      replaceInPlace(cur as Record<string, unknown>, v as Record<string, unknown>)
    else into[k] = structuredClone(v)
  }
}

/**
 * Put new contents into a data file, live: everything holding its objects sees the change.
 * World colours change in place, so palettes linked to them follow.
 */
export function applyData(file: DataFile, data: unknown) {
  replaceInPlace(DATA[file] as Record<string, unknown>, data as Record<string, unknown>)
  changed(file)
}

/** Re-derive everything from the data after it was edited in place, and tell listeners. */
export function changed(file: DataFile) {
  if (file === 'palette') {
    for (const [k, v] of Object.entries(DATA.palette)) {
      const c = hex(v)
      const w = ((WORLD as Record<string, Color>)[k] ??= c)
      w[0] = c[0]
      w[1] = c[1]
      w[2] = c[2]
    }
  }
  // palettes and prop views (also after a world colour changed, for any new "$" links)
  for (const [name, d] of Object.entries(DATA.sprites)) {
    const a = SPRITES[name]
    if (!a) continue
    a.frames = d.frames
    a.parts = asParts(d.parts)
    a.shine = d.shine
    for (const [k, p] of Object.entries(d.palettes)) resolvePalette(p, (a.palettes[k] ??= {}))
  }
  syncProps()
  for (const fn of listeners) fn(file)
}
