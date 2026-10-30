/**
 * Character-grid sprites. Each string is a row; '.' is transparent and every
 * other char indexes the sprite's palette. Sprites stand on their bottom row.
 */
import { C } from './world'
import { hex, type Color } from './util'

export type Rows = readonly string[]
export type Palette = Record<string, Color>

export const KNIGHT: Rows = [
  '....hhh.....',
  '...hHHhh....',
  '...hhvvh....',
  '...hhhhh....',
  '....hhh.....',
  '...cbbbc....',
  '..ccbBbbc...',
  '..cbbBbbbb..',
  '..cbbbbbbbg.',
  '.ccbbbbbb...',
  '.cccbbbbb...',
  '.ccc.lllllll',
  '.cc..lllllLl',
  '......ll..ll',
  '......LL..LL',
]
/** Same knight with his head dropped forward: nodding off. */
export const KNIGHT_NOD: Rows = KNIGHT.map((r, i) => (i < 5 ? '.' + r.slice(0, 11) : r))
export const KNIGHT_PAL: Palette = {
  h: hex('#bdb6a6'),
  H: hex('#e2dccd'),
  v: hex('#141210'),
  b: hex('#55505c'),
  B: hex('#8a8492'),
  c: hex('#3d2c2c'),
  l: hex('#45414b'),
  L: hex('#2c2a30'),
  g: hex('#8a8492'),
}

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
