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
