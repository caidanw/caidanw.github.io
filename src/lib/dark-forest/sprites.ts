/**
 * Character-grid sprites. Each string is a row; '.' is transparent and every
 * other char indexes the sprite's palette. Sprites stand on their bottom row.
 */
import { C } from './world'
import { hex, type Color } from './util'

export type Rows = readonly string[]
export type Palette = Record<string, Color>

/**
 * The last knight, in plate. Seated facing the fire (to his right): great helm
 * with a visor slit, pauldrons, mail, a cape behind, knees drawn up.
 */
export const KNIGHT: Rows = [
  '.....hhh......',
  '....hHHhh.....',
  '....hHhhhd....',
  '....hhvvvd....',
  '....dhhhhd....',
  '.....dhhd.....',
  '...cpHhhpd....',
  '..ccpHmmmpd...',
  '..ccdmmdmmhh..',
  '..ccmdmmdhhg..',
  '..cclmmmmll...',
  '.ccclllllllll.',
  '.cccLlllllllh.',
  '.ccc.....dhhd.',
  '.cc......dhhd.',
  '.........bbbb.',
  '........bbbbbb',
]
/** Same knight with his head bowed toward the fire: nodding off. */
export const KNIGHT_NOD: Rows = KNIGHT.map((r, i) => (i < 6 ? '.' + r.slice(0, 13) : r))
/** Standing, sword in hand (two walking frames). */
export const KNIGHT_STAND: Rows[] = [
  [
    '...hhh....',
    '..hHHhh...',
    '..hHhhhd..',
    '..hhvvvd..',
    '..dhhhhd..',
    '...dhhd...',
    '.cpHhhpd..',
    'ccpHmmmpd.',
    'ccdmmdmmhs',
    'ccmdmmdmhs',
    'cclmmmmlgs',
    'ccllllll.s',
    'cc.ll.ll.s',
    'c..ll.ll.s',
    '...dh.dh..',
    '...dh.dh..',
    '...dh.dh..',
    '...dh.dh..',
    '..bbb.bbb.',
    '..bbb.bbb.',
  ],
  [
    '...hhh....',
    '..hHHhh...',
    '..hHhhhd..',
    '..hhvvvd..',
    '..dhhhhd..',
    '...dhhd...',
    '.cpHhhpd..',
    'ccpHmmmpd.',
    'ccdmmdmmhs',
    'ccmdmmdmhs',
    'cclmmmmlgs',
    'ccllllll.s',
    'cc.ll..ll.',
    'c.ll...ll.',
    '..dh...dh.',
    '..dh...dh.',
    '.dh.....dh',
    '.dh.....dh',
    'bbb....bbb',
    'bbb....bbb',
  ],
]
/** Kneeling at the grove, planting his sword. */
export const KNIGHT_KNEEL: Rows = [
  '....hhh.....',
  '...hHHhh....',
  '...hHhhhd...',
  '...hhvvvd.s.',
  '...dhhhhd.s.',
  '....dhhd..s.',
  '..cpHhhpd.s.',
  '.ccpHmmmphg.',
  '.ccdmmdmm.s.',
  '.ccmdmmdm.s.',
  '.cclllll..s.',
  '.cc.lllll.s.',
  '.cc..dhhd.s.',
  '....bbbbbbs.',
]
export const KNIGHT_PAL: Palette = {
  H: hex('#ecebe6'), // helm and plate highlight
  h: hex('#aeada9'), // steel
  d: hex('#53575e'), // steel in shadow (cool)
  v: hex('#0e0d0d'), // visor slit
  p: hex('#bab8b2'), // pauldrons
  m: hex('#73767b'), // mail
  c: hex('#5c2323'), // cape
  l: hex('#5a4532'), // leather
  L: hex('#3a2c22'), // leather in shadow
  g: hex('#b0aba2'), // gauntlet
  b: hex('#2e2a29'), // boots
  s: hex('#d2cfc8'), // his sword
}
/** How shiny each part of the knight is (specular strength): plate gleams, mail less, cloth not at all. */
export const KNIGHT_SHINE: Record<string, number> = { H: 1, h: 1, p: 1, g: 1, s: 1, d: 0.7, m: 0.45 }

export const MUSH = {
  walk: [
    ['..rrr..', '.rrwrr.', 'rwrrrrw', 'rrrrrrr', '.uuuuu.', '..ese..', '..sss..', '..sss..', '..s.s..'],
    ['..rrr..', '.rrwrr.', 'rwrrrrw', 'rrrrrrr', '.uuuuu.', '..ese..', '..sss..', '..sss..', '.s...s.'],
  ] as Rows[],
  mid: ['.rrr.', 'rwrrr', 'rrrrr', '.ese.', '.sss.', '.s.s.'] as Rows,
  baby: ['.r.', 'rrr', '.s.'] as Rows,
}
export const MUSH_PAL: Palette = { r: hex('#8f4b3c'), w: hex('#e0b896'), u: hex('#5a3028'), s: hex('#d8ccb4'), e: hex('#1a1410') }
/** Elders fade: a greyer cap, paler spots. */
export const MUSH_PAL_ELDER: Palette = { r: hex('#7d655c'), w: hex('#ece2d2'), u: hex('#4a3a34'), s: hex('#c9c2b4'), e: hex('#1a1410') }

export const DEER = {
  walk: [
    [
      '.........t.t.',
      '.........ttt.',
      '..........hh.',
      '..........hhn',
      '.bbbbbbbbbh..',
      'bbbbbbbbbbb..',
      'bbbbbbbbbb...',
      '.bbbbbbbb....',
      '.l.l....l.l..',
      '.l.l....l.l..',
      '.l.l....l.l..',
    ],
    [
      '.........t.t.',
      '.........ttt.',
      '..........hh.',
      '..........hhn',
      '.bbbbbbbbbh..',
      'bbbbbbbbbbb..',
      'bbbbbbbbbb...',
      '.bbbbbbbb....',
      '.l..l..l..l..',
      'l...l.l...l..',
      'l....l.....l.',
    ],
  ] as Rows[],
  drink: [
    '.............',
    '.............',
    '.............',
    '.............',
    '.bbbbbbbbb...',
    'bbbbbbbbbbbt.',
    'bbbbbbbbbbhtt',
    '.bbbbbbbb.hh.',
    '.l.l....l.lhn',
    '.l.l....l.l..',
    '.l.l....l.l..',
  ] as Rows,
}
export const DEER_PAL: Palette = { b: hex('#9a7a5c'), h: hex('#a8876a'), t: hex('#c9b9a0'), n: hex('#2a2018'), l: hex('#7a5f47') }

/** A glowcap: grows where one of the shroomfolk returned to the soil. Its cap glows. */
export const GLOWCAP: Rows = ['.ccc.', 'ccccc', '..s..', '..s..']
export const GLOWCAP_PAL: Palette = { c: hex('#9ff5e4'), s: hex('#d8ccb4') }

export const FROG: Rows[] = [
  ['.e.e', 'gggg'],
  ['e.e.', '.gg.', 'gggg'],
]
export const FROG_PAL: Palette = { e: hex('#c9d67a'), g: C.frog }

export const CROW: Rows[] = [
  ['.c..', 'cccc', '.c.c'], // perched
  ['c..c', '.cc.', '....'], // wings up
  ['....', '.cc.', 'c..c'], // wings down
]
