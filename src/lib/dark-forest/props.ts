/**
 * Prop art (see sprites.ts for the format), drawn at the full resolution without an outline.
 * The art is data (data/props.json); these are live views onto it (art.ts).
 */
import { PROP_ART, RELIC_ART, type PropArt } from './art'

export type { PropArt }
export { PROP_ART, RELIC_ART }

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
