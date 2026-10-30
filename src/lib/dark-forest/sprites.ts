/**
 * Character-grid sprites. Each string is a row; '.' is transparent and every
 * other char indexes the sprite's palette. Sprites stand on their bottom row.
 */
import { C } from './world'
import { hex, type Color } from './util'
import type { Part } from './normals'

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
  /** Sitting: lower, little feet out in front. */
  sit: ['..rrr..', '.rrwrr.', 'rwrrrrw', 'rrrrrrr', '.uuuuu.', '..ese..', '.sssss.', 's.....s'] as Rows,
  sitBlink: ['..rrr..', '.rrwrr.', 'rwrrrrw', 'rrrrrrr', '.uuuuu.', '..sss..', '.sssss.', 's.....s'] as Rows,
  mid: ['.rrr.', 'rwrrr', 'rrrrr', '.ese.', '.sss.', '.s.s.'] as Rows,
  baby: ['.r.', 'rrr', '.s.'] as Rows,
}
/**
 * The keeper wears the knight's cape (a scrap of it, red, draped behind) and a steel crest
 * on the cap, easy to pick out from the rest of the village.
 */
export const MUSH_KEEPER = {
  walk: [
    ['...h...', '..rrr..', '.rrwrr.', 'rwrrrrw', 'rrrrrrr', '.uuuuu.', '.kesek.', '.ksssk.', 'kksssk.', '..s.s..'],
    ['...h...', '..rrr..', '.rrwrr.', 'rwrrrrw', 'rrrrrrr', '.uuuuu.', '.kesek.', '.ksssk.', 'kksssk.', '.s...s.'],
  ] as Rows[],
  sit: ['...h...', '..rrr..', '.rrwrr.', 'rwrrrrw', 'rrrrrrr', '.uuuuu.', '.kesek.', 'ksssssk', 's.....s'] as Rows,
  sitBlink: ['...h...', '..rrr..', '.rrwrr.', 'rwrrrrw', 'rrrrrrr', '.uuuuu.', '.ksssk.', 'ksssssk', 's.....s'] as Rows,
}
export const KEEPER_TRIM: Palette = { k: hex('#a32c2c'), h: hex('#dedad2') }

/** Which parts each creature is made of, for their normals (see normals.ts partNormals). */
export const MUSH_PARTS: Part[] = [
  { chars: 'rw', kind: 'cap' },
  { chars: 'u', kind: 'under' },
  { chars: 'se', kind: 'cylinder' },
  { chars: 'k', kind: 'cylinder' },
  { chars: 'h', kind: 'dome' },
]
export const KNIGHT_PARTS: Part[] = [
  { chars: 'hHv', kind: 'dome' },
  { chars: 'pg', kind: 'dome' },
  { chars: 'm', kind: 'cylinder' },
  { chars: 'c', kind: 'cylinder' },
  { chars: 'lL', kind: 'cylinder' },
  { chars: 'd', kind: 'cylinder' },
  { chars: 'b', kind: 'dome' },
  { chars: 's', kind: 'flat' },
]
export const DEER_PARTS: Part[] = [
  { chars: 'b', kind: 'dome' },
  { chars: 'hn', kind: 'dome' },
  { chars: 't', kind: 'flat' },
  { chars: 'l', kind: 'cylinder' },
]
export const FROG_PARTS: Part[] = [{ chars: 'ge', kind: 'dome' }]
export const GLOWCAP_PARTS: Part[] = [
  { chars: 'c', kind: 'cap' },
  { chars: 's', kind: 'cylinder' },
]

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
