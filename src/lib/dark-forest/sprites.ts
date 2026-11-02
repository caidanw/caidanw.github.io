/**
 * Character-grid sprites, drawn at the full 640x360 resolution. Each string is a row; '.'
 * is transparent and every other char indexes the sprite's palette. Sprites stand on their
 * bottom row. Parts (for normals) are flood-filled patches of the listed chars, so giving a
 * body part its own letters gives it its own shape.
 *
 * The art itself is data (data/sprites.json, edited in the editor); these are the names the
 * renderer knows it by. They're the very objects in the live store (art.ts), so edits show.
 */
import { SPRITES } from './art'

export type { Palette, Rows } from './art'

const K = SPRITES.knight
/** The last knight: seated on the ground facing the fire, knee drawn up; nodding; standing (two walking frames); kneeling. */
export const KNIGHT = K.frames.seated
export const KNIGHT_NOD = K.frames.nod
export const KNIGHT_STAND = [K.frames.stand0, K.frames.stand1]
export const KNIGHT_KNEEL = K.frames.kneel
export const KNIGHT_PAL = K.palettes.default
/** How shiny each part of the knight is (specular strength): plate gleams, mail less, cloth not at all. */
export const KNIGHT_SHINE = K.shine
export const KNIGHT_PARTS = K.parts

const M = SPRITES.shroomfolk
/** The shroomfolk: a domed cap with pale spots (they glow), gills, a stout stem with two eyes. Faces right. */
export const MUSH = { walk: [M.frames.walk0, M.frames.walk1], sit: M.frames.sit, sitBlink: M.frames.sitBlink, mid: M.frames.mid, baby: M.frames.baby }
export const MUSH_PAL = M.palettes.default
/** Elders fade: a greyer cap, paler spots. */
export const MUSH_PAL_ELDER = M.palettes.elder
export const MUSH_PARTS = M.parts

const KP = SPRITES.keeper
/** The keeper wears the knight's cape over the shoulders and a steel crest on the cap. */
export const MUSH_KEEPER = { walk: [KP.frames.walk0, KP.frames.walk1], sit: KP.frames.sit, sitBlink: KP.frames.sitBlink }
export const KEEPER_PAL = KP.palettes.default
export const KEEPER_PAL_ELDER = KP.palettes.elder
export const KEEPER_SHINE = KP.shine

const D = SPRITES.deer
/** A stag: small antlers, white tail, thin legs. Faces right. */
export const DEER = { walk: [D.frames.walk0, D.frames.walk1], drink: D.frames.drink }
export const DEER_PAL = D.palettes.default
export const DEER_PARTS = D.parts

/** A glowcap: grows where one of the shroomfolk returned to the soil. Its cap glows. */
export const GLOWCAP = SPRITES.glowcap.frames.glowcap
export const GLOWCAP_PAL = SPRITES.glowcap.palettes.default
export const GLOWCAP_PARTS = SPRITES.glowcap.parts

/** The frog, sitting and mid-hop. Faces right. */
export const FROG = [SPRITES.frog.frames.sit, SPRITES.frog.frames.hop]
export const FROG_PAL = SPRITES.frog.palettes.default
export const FROG_PARTS = SPRITES.frog.parts

/** The crow: perched (facing right), wings up, wings down. 'b' is the beak. */
export const CROW = [SPRITES.crow.frames.perch, SPRITES.crow.frames.up, SPRITES.crow.frames.down]
export const CROW_PAL = SPRITES.crow.palettes.default
