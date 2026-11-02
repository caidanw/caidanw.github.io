/**
 * Prop art (see sprites.ts for the format), drawn at the full resolution without an outline.
 * The art is data (data/props.json); these are live views onto it (art.ts).
 */
import { DATA, resolvePalette, type Palette, type Rows } from './art'
import type { Part } from './normals'

/** A prop's art: rows, the column its anchor sits on, palette, parts, and per-char shine. */
export interface PropArt {
  rows: Rows
  anchor: number
  pal: Palette
  parts: Part[]
  shine?: Record<string, number>
}

/** Every prop's art, by name: the same objects the renderer draws, kept in step with the data. */
export const PROP_ART: Record<string, PropArt> = Object.fromEntries(
  Object.entries(DATA.props)
    .filter(([k]) => k !== 'relics')
    .map(([k, d]) => {
      const p = d as (typeof DATA.props)[string]
      return [k, { rows: p.rows, anchor: p.anchor, pal: resolvePalette(p.palette), parts: p.parts as Part[], shine: p.shine }]
    }),
)

/** The knight's own sword, planted point-down: round pommel, wrapped grip, a bevelled blade. */
export const SWORD = PROP_ART.sword
/** His pack: a leather knapsack with a flap and a brass buckle, a bedroll strapped on top. */
export const PACK = PROP_ART.pack
/** One split log, end grain to the right. */
export const LOG = PROP_ART.log
/** A little skull at the edge of the ashes. */
export const SKULL = PROP_ART.skull
/** The road out: a post with a lantern hung from its arm and an arrow sign pointing away. */
export const LANTERN_POST = PROP_ART.lanternPost

/**
 * The relic planted in the ashes, the bonfire's coiled sword reimagined. Bottom row is the
 * ash line; 'g' pixels are metal (or bone tips) that warm with the fire and glow.
 */
export const RELIC_ART = Object.fromEntries(
  Object.entries(DATA.props.relics).map(([k, r]) => [k, { rows: r.rows as Rows, pal: resolvePalette(r.palette) }]),
) as Record<'antler' | 'crook' | 'key', { rows: Rows; pal: Palette }>
