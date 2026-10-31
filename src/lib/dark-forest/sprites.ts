/**
 * Character-grid sprites, drawn at the full 640x360 resolution. Each string is a row; '.'
 * is transparent and every other char indexes the sprite's palette. Sprites stand on their
 * bottom row. Parts (for normals) are flood-filled patches of the listed chars, so giving a
 * body part its own letters gives it its own shape.
 */
import { C } from './world'
import { hex, type Color } from './util'
import type { Part } from './normals'

export type Rows = readonly string[]
export type Palette = Record<string, Color>

/**
 * The last knight, in plate. Seated on the ground facing the fire (to his right), knee drawn
 * up, forearm resting on it: great helm with a visor slit and breathing holes, pauldrons, a
 * mail coat, a belt with a brass buckle, a cape behind.
 */
export const KNIGHT: Rows = [
  '............hhhhh...........',
  '..........hHHHHhhhd.........',
  '.........hHHHhhhhhhd........',
  '.........hHHhhhhhhhd........',
  '.........hHhhhhhhhhhd.......',
  '.........hHhhhddddddd.......',
  '.........hHhhhvvvvvvd.......',
  '.........hhhhhhhhhhhd.......',
  '.........dhhhhhhvhvhd.......',
  '..........dhhhhhhhhd........',
  '............ddhhdd..........',
  '......eccpPPpmmmmmppq.......',
  '.....eccpPPppqmnmnmppq......',
  '.....eCcPppppqmmmmmmpq......',
  '.....eCcpppqqqnmnmnmmn......',
  '.....eCcqqqqqmmmmmmmmn.KKk..',
  '.....eCcmmmmnmnmnmnmn.KKKkk.',
  '.....eCcmnmmmmmmAAAaagGKkkj.',
  '....eCccmmmmAAAAAaaaggGKkkj.',
  '....eCccnmmAaaaaaalllggIiij.',
  '....eCccmmmmlllllllllLIiiij.',
  '....eCccLLLyLLllllllLLIiiij.',
  '...eCCccllllllllllLLL.Iiiij.',
  '...eCcccllllllllLLL....Iiiij',
  '...eCcccllllllLLL......Iiiij',
  '..eCCcccLLLLLLL.......bbbbbB',
  '..eCccccc...........bbbbbbbB',
  '.eCCcccccC..........BBBBBBBB',
]
/** Same knight with his head bowed toward the fire: nodding off. */
export const KNIGHT_NOD: Rows = [
  '............................',
  '.............hhhhh..........',
  '...........hHHHHhhhd........',
  '..........hHHHhhhhhhd.......',
  '..........hHHhhhhhhhd.......',
  '..........hHhhhhhhhhhd......',
  '..........hHhhhddddddd......',
  '..........hHhhhvvvvvvd......',
  '..........hhhhhhhhhhhd......',
  '..........dhhhhhhvhvhd......',
  '...........dhhhhhhhhd.......',
  '......eccpPPpddhhddpq.......',
  '.....eccpPPppqmnmnmppq......',
  '.....eCcPppppqmmmmmmpq......',
  '.....eCcpppqqqnmnmnmmn......',
  '.....eCcqqqqqmmmmmmmmn.KKk..',
  '.....eCcmmmmnmnmnmnmn.KKKkk.',
  '.....eCcmnmmmmmmAAAaagGKkkj.',
  '....eCccmmmmAAAAAaaaggGKkkj.',
  '....eCccnmmAaaaaaalllggIiij.',
  '....eCccmmmmlllllllllLIiiij.',
  '....eCccLLLyLLllllllLLIiiij.',
  '...eCCccllllllllllLLL.Iiiij.',
  '...eCcccllllllllLLL....Iiiij',
  '...eCcccllllllLLL......Iiiij',
  '..eCCcccLLLLLLL.......bbbbbB',
  '..eCccccc...........bbbbbbbB',
  '.eCCcccccC..........BBBBBBBB',
]
/** Standing, sword held point-down at his side (two walking frames). */
export const KNIGHT_STAND: Rows[] = [
  [
    '.......hhhhh..........',
    '.....hHHHHhhhd........',
    '....hHHHhhhhhhd.......',
    '....hHHhhhhhhhd.......',
    '....hHhhhhhhhhhd......',
    '....hHhhhddddddd......',
    '....hHhhhvvvvvvd......',
    '....hhhhhhhhhhhd......',
    '....dhhhhhhvhvhd......',
    '.....dhhhhhhhhd.......',
    '.......ddhhdd.........',
    '.eccpPPpmmmmmppq......',
    'eccpPPppqmnmnmppq.....',
    'eCcPppppqmmmmmpppq....',
    'eCcpppqqqnmnmnmpqq....',
    'eCcqqqqqmmmmmmmAAa..t.',
    'eCcAAamnmnmnmnmAAa..r.',
    'eCcAaammmmmmmmmAaa..r.',
    'eCcAaanmnmnmnmmAaa.ggG',
    'eCcAaammmmmmmmmmmmgggG',
    'eCcAaaLLLLLLyLLLL.tggt',
    'eCcggGllllllllll...sS.',
    'eCcggGllllllllll...sS.',
    'eC..lllllllllll....sS.',
    'eC..lLlll.lllLl....sS.',
    '....lLll..llLl.....sS.',
    '.....IIij.IIij.....sS.',
    '.....Iiij.Iiij.....sS.',
    '.....KKkk.KKkk.....sS.',
    '.....Kkkj.Kkkj.....sS.',
    '.....Iiij.Iiij.....sS.',
    '.....Iiij.Iiij.....sS.',
    '.....Iiij.Iiij.....sS.',
    '.....Iiij.Iiij.....sS.',
    '.....Iiij.Iiij.....sS.',
    '.....Iiij.Iiij.....sS.',
    '....bbbbB.bbbbB....sS.',
    '....bbbbbBbbbbbB...sS.',
    '....BBBBBBBBBBBB....s.',
  ],
  [
    '.......hhhhh..........',
    '.....hHHHHhhhd........',
    '....hHHHhhhhhhd.......',
    '....hHHhhhhhhhd.......',
    '....hHhhhhhhhhhd......',
    '....hHhhhddddddd......',
    '....hHhhhvvvvvvd......',
    '....hhhhhhhhhhhd......',
    '....dhhhhhhvhvhd......',
    '.....dhhhhhhhhd.......',
    '.......ddhhdd.........',
    '.eccpPPpmmmmmppq......',
    'eccpPPppqmnmnmppq.....',
    'eCcPppppqmmmmmpppq....',
    'eCcpppqqqnmnmnmpqq....',
    'eCcqqqqqmmmmmmmAAa..t.',
    'eCcAAamnmnmnmnmAAa..r.',
    'eCcAaammmmmmmmmAaa..r.',
    'eCcAaanmnmnmnmmAaa.ggG',
    'eCcAaammmmmmmmmmmmgggG',
    'eCcAaaLLLLLLyLLLL.tggt',
    'eCcggGllllllllll...sS.',
    'eCcggGllllllllll...sS.',
    'eC..lllllllllll....sS.',
    'eC..lLlll.lllLl....sS.',
    '...lLll....llLl....sS.',
    '...IIij.....IIij...sS.',
    '...Iiij.....Iiij...sS.',
    '..KKkk.......KKkk..sS.',
    '..Kkkj.......Kkkj..sS.',
    '..Iiij........Iiij.sS.',
    '..Iiij........Iiij.sS.',
    '.Iiij.........Iiij.sS.',
    '.Iiij..........Iiijs..',
    '.Iiij..........Iiij...',
    '.Iiij..........Iiij...',
    'bbbbB..........bbbbB..',
    'bbbbbB.........bbbbbB.',
    'BBBBBB.........BBBBBB.',
  ],
]
/** Kneeling at the grove, both hands on the hilt, planting his sword. */
export const KNIGHT_KNEEL: Rows = [
  '...........hhhhh..........',
  '.........hHHHHhhhd........',
  '........hHHHhhhhhhd.......',
  '........hHHhhhhhhhd.......',
  '........hHhhhhhhhhhd......',
  '........hHhhhddddddd......',
  '........hHhhhvvvvvvd......',
  '........hhhhhhhhhhhd......',
  '........dhhhhhhvhvhd......',
  '.........dhhhhhhhhd.......',
  '...........ddhhdd.........',
  '.....eccpPPpmmmmmppq......',
  '....eccpPPppqmnmnmppq.....',
  '....eCcPppppqmmmmmmpq.t...',
  '....eCcpppqqqnmnmnmmn.r...',
  '....eCcqqqqqmmmmAAAaaggG..',
  '...eCccmmmnmnmAAAaaaagggG.',
  '...eCccmnmmmmmmmmmm.ttttt.',
  '...eCccLLLLLyLLLLL....sS..',
  '...eCccllllllllllll...sS..',
  '..eCCccllllllllllKKk..sS..',
  '..eCcccIiiillllllKkkj.sS..',
  '..eCcccIiiijLLLLIiiij.sS..',
  '.eCCcccIiiij....Iiiij.sS..',
  '.eCccccKKkkj....Iiiij.sS..',
  '.eCcccKKkkkj....Iiiij.sS..',
  'eCCcccKkkkkj...bbbbbbBsS..',
  'CCCCCCCBBBBBB..BBBBBBBBS..',
]
export const KNIGHT_PAL: Palette = {
  H: hex('#ecebe6'), // helm highlight
  h: hex('#aeada9'), // helm steel
  d: hex('#53575e'), // helm in shadow (cool)
  v: hex('#0e0d0d'), // visor slit, breathing holes
  P: hex('#e4e2dc'), // pauldron catching light
  p: hex('#bab8b2'), // pauldron
  q: hex('#77797c'), // pauldron in shadow
  m: hex('#73767b'), // mail
  n: hex('#55585e'), // mail rings
  e: hex('#7a3434'), // cape edge
  c: hex('#5c2323'), // cape
  C: hex('#431818'), // cape folds
  l: hex('#5a4532'), // leather
  L: hex('#3a2c22'), // leather in shadow
  y: hex('#c9a45a'), // brass buckle
  A: hex('#aeada9'), // vambrace
  a: hex('#7d7f84'), // vambrace in shadow
  g: hex('#b0aba2'), // gauntlet
  G: hex('#77736d'), // gauntlet in shadow
  K: hex('#d6d4cf'), // knee cop
  k: hex('#9c9b97'), // knee cop in shadow
  I: hex('#c9c7c2'), // greave highlight
  i: hex('#9a9995'), // greave
  j: hex('#53575e'), // greave in shadow
  b: hex('#2e2a29'), // boots
  B: hex('#1d1a19'), // soles
  s: hex('#d2cfc8'), // his sword
  S: hex('#8f8d88'), // the blade's far bevel
  t: hex('#8b8f96'), // guard and pommel
  r: hex('#5a4532'), // grip
}
/** How shiny each part of the knight is (specular strength): plate gleams, mail less, cloth not at all. */
export const KNIGHT_SHINE: Record<string, number> = {
  H: 1,
  h: 1,
  d: 0.7,
  P: 1,
  p: 1,
  q: 0.8,
  m: 0.45,
  n: 0.35,
  y: 0.8,
  A: 1,
  a: 0.8,
  g: 0.8,
  G: 0.6,
  K: 1,
  k: 0.9,
  I: 1,
  i: 0.9,
  j: 0.7,
  s: 1,
  S: 0.9,
  t: 0.9,
}

/**
 * The shroomfolk: a domed cap with pale spots (they glow), gills underneath, a stout stem
 * with two dark eyes and little nub arms. Drawn facing right; flipped to walk left.
 */
export const MUSH = {
  walk: [
    [
      '.....rrrr.....',
      '...rrwwrrrr...',
      '..rrrwwrrrrr..',
      '.rrrrrrrrwwrr.',
      '.rwwrrrrrwwrrr',
      'rrwwrrrrrrrrrr',
      'rrrrrrrrrrrrrr',
      '.rrrrrrrrrrrr.',
      '..uuuuuuuuuu..',
      '....ssssss....',
      '....sseses....',
      '....sseses....',
      '...ssssssss...',
      '...ssssssss...',
      '....ssssss....',
      '....ssssss....',
      '.....ss.ss....',
      '....sss.sss...',
    ],
    [
      '.....rrrr.....',
      '...rrwwrrrr...',
      '..rrrwwrrrrr..',
      '.rrrrrrrrwwrr.',
      '.rwwrrrrrwwrrr',
      'rrwwrrrrrrrrrr',
      'rrrrrrrrrrrrrr',
      '.rrrrrrrrrrrr.',
      '..uuuuuuuuuu..',
      '....ssssss....',
      '....sseses....',
      '....sseses....',
      '...ssssssss...',
      '...ssssssss...',
      '....ssssss....',
      '....ssssss....',
      '....ss...ss...',
      '...sss...sss..',
    ],
  ] as Rows[],
  /** Sitting: squat, little feet out to the sides. */
  sit: [
    '.....rrrr.....',
    '...rrwwrrrr...',
    '..rrrwwrrrrr..',
    '.rrrrrrrrwwrr.',
    '.rwwrrrrrwwrrr',
    'rrwwrrrrrrrrrr',
    'rrrrrrrrrrrrrr',
    '.rrrrrrrrrrrr.',
    '..uuuuuuuuuu..',
    '....ssssss....',
    '....sseses....',
    '....sseses....',
    '...ssssssss...',
    '..ssssssssss..',
    '.sss......sss.',
  ] as Rows,
  sitBlink: [
    '.....rrrr.....',
    '...rrwwrrrr...',
    '..rrrwwrrrrr..',
    '.rrrrrrrrwwrr.',
    '.rwwrrrrrwwrrr',
    'rrwwrrrrrrrrrr',
    'rrrrrrrrrrrrrr',
    '.rrrrrrrrrrrr.',
    '..uuuuuuuuuu..',
    '....ssssss....',
    '....ssssss....',
    '....sseses....',
    '...ssssssss...',
    '..ssssssssss..',
    '.sss......sss.',
  ] as Rows,
  mid: [
    '...rrrr...',
    '.rrwwrrrr.',
    'rrrrrrrwwr',
    'rwwrrrrrrr',
    '.rrrrrrrr.',
    '..uuuuuu..',
    '...ssss...',
    '...sese...',
    '...sese...',
    '...ssss...',
    '...s..s...',
    '..ss..ss..',
  ] as Rows,
  baby: ['.rrrr.', 'rrwrrr', 'rrrrrr', '.uuuu.', '..ss..', '..ss..'] as Rows,
}
/**
 * The keeper wears the knight's cape (a scrap of it, red, over the shoulders and trailing
 * behind) and a steel crest on the cap, easy to pick out from the rest of the village.
 */
export const MUSH_KEEPER = {
  walk: [
    [
      '......hh......',
      '.....hhhh.....',
      '.....rrrr.....',
      '...rrwwrrrr...',
      '..rrrwwrrrrr..',
      '.rrrrrrrrwwrr.',
      '.rwwrrrrrwwrrr',
      'rrwwrrrrrrrrrr',
      'rrrrrrrrrrrrrr',
      '.rrrrrrrrrrrr.',
      '..uuuuuuuuuu..',
      '..kkssssss....',
      '..kksseses....',
      '.kkksseses....',
      '.kkssssssss...',
      'kkkssssssss...',
      'kk..ssssss....',
      'k...ssssss....',
      '.....ss.ss....',
      '....sss.sss...',
    ],
    [
      '......hh......',
      '.....hhhh.....',
      '.....rrrr.....',
      '...rrwwrrrr...',
      '..rrrwwrrrrr..',
      '.rrrrrrrrwwrr.',
      '.rwwrrrrrwwrrr',
      'rrwwrrrrrrrrrr',
      'rrrrrrrrrrrrrr',
      '.rrrrrrrrrrrr.',
      '..uuuuuuuuuu..',
      '..kkssssss....',
      '..kksseses....',
      '.kkksseses....',
      '.kkssssssss...',
      'kkkssssssss...',
      'kk..ssssss....',
      'k...ssssss....',
      '....ss...ss...',
      '...sss...sss..',
    ],
  ] as Rows[],
  sit: [
    '......hh......',
    '.....hhhh.....',
    '.....rrrr.....',
    '...rrwwrrrr...',
    '..rrrwwrrrrr..',
    '.rrrrrrrrwwrr.',
    '.rwwrrrrrwwrrr',
    'rrwwrrrrrrrrrr',
    'rrrrrrrrrrrrrr',
    '.rrrrrrrrrrrr.',
    '..uuuuuuuuuu..',
    '..kkssssss....',
    '..kksseses....',
    '.kkksseses....',
    'kkkssssssss...',
    'kkssssssssss..',
    '.sss......sss.',
  ] as Rows,
  sitBlink: [
    '......hh......',
    '.....hhhh.....',
    '.....rrrr.....',
    '...rrwwrrrr...',
    '..rrrwwrrrrr..',
    '.rrrrrrrrwwrr.',
    '.rwwrrrrrwwrrr',
    'rrwwrrrrrrrrrr',
    'rrrrrrrrrrrrrr',
    '.rrrrrrrrrrrr.',
    '..uuuuuuuuuu..',
    '..kkssssss....',
    '..kkssssss....',
    '.kkksseses....',
    'kkkssssssss...',
    'kkssssssssss..',
    '.sss......sss.',
  ] as Rows,
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
  { chars: 'hHvd', kind: 'dome' }, // helm
  { chars: 'pPq', kind: 'dome' }, // pauldrons
  { chars: 'mn', kind: 'cylinder' }, // mail coat
  { chars: 'ceC', kind: 'cylinder' }, // cape
  { chars: 'lLy', kind: 'cylinder' }, // belt, skirt, thighs
  { chars: 'Aa', kind: 'cylinder' }, // vambraces
  { chars: 'gG', kind: 'dome' }, // gauntlets
  { chars: 'Kk', kind: 'dome' }, // knee cops
  { chars: 'Iij', kind: 'cylinder' }, // greaves
  { chars: 'bB', kind: 'dome' }, // boots
  { chars: 'sStr', kind: 'flat' }, // sword
]
export const DEER_PARTS: Part[] = [
  { chars: 'bu', kind: 'dome' },
  { chars: 'hne', kind: 'dome' },
  { chars: 't', kind: 'flat' },
  { chars: 'l', kind: 'cylinder' },
]
export const FROG_PARTS: Part[] = [{ chars: 'geG', kind: 'dome' }]
export const GLOWCAP_PARTS: Part[] = [
  { chars: 'c', kind: 'cap' },
  { chars: 's', kind: 'cylinder' },
]

export const MUSH_PAL: Palette = { r: hex('#8f4b3c'), w: hex('#e0b896'), u: hex('#5a3028'), s: hex('#d8ccb4'), e: hex('#1a1410') }
/** Elders fade: a greyer cap, paler spots. */
export const MUSH_PAL_ELDER: Palette = { r: hex('#7d655c'), w: hex('#ece2d2'), u: hex('#4a3a34'), s: hex('#c9c2b4'), e: hex('#1a1410') }

/** A stag: small antlers, white tail, thin legs. Faces right. */
export const DEER = {
  walk: [
    [
      '................t.t..t.t..',
      '.................t....t...',
      '.................tt..tt...',
      '..................hhhh....',
      '.................hhhhhh...',
      '.................hhhehhh..',
      '..................hhhhhhn.',
      '..................hhh.....',
      '.................bbb......',
      '................bbbb......',
      '....bbbbbbbbbbbbbbbb......',
      '.tbbbbbbbbbbbbbbbbbb......',
      '.tbbbbbbbbbbbbbbbbbb......',
      '..bbbbbbbbbbbbbbbbbb......',
      '...ubbbbbbbbbbbbbbu.......',
      '..uuuu.........uuuu.......',
      '...l.l..........l.l.......',
      '...l.l..........l.l.......',
      '...l.l..........l.l.......',
      '...l.l..........l.l.......',
      '...l.l..........l.l.......',
      '...n.n..........n.n.......',
    ],
    [
      '................t.t..t.t..',
      '.................t....t...',
      '.................tt..tt...',
      '..................hhhh....',
      '.................hhhhhh...',
      '.................hhhehhh..',
      '..................hhhhhhn.',
      '..................hhh.....',
      '.................bbb......',
      '................bbbb......',
      '....bbbbbbbbbbbbbbbb......',
      '.tbbbbbbbbbbbbbbbbbb......',
      '.tbbbbbbbbbbbbbbbbbb......',
      '..bbbbbbbbbbbbbbbbbb......',
      '...ubbbbbbbbbbbbbbu.......',
      '..uuuu.........uuuu.......',
      '...l..l........l..l.......',
      '..l...l........l...l......',
      '..l....l......l....l......',
      '.l.....l......l.....l.....',
      '.l......l....l......l.....',
      '.n......n....n......n.....',
    ],
  ] as Rows[],
  /** Head down to the water. */
  drink: [
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '..........................',
    '....bbbbbbbbbbbbbbbbb.....',
    '.tbbbbbbbbbbbbbbbbbbbb....',
    '.tbbbbbbbbbbbbbbbbbbbbb.t.',
    '..bbbbbbbbbbbbbbbbbbbbbbt.',
    '..ubbbbbbbbbbbbbbbbu.hhht.',
    '..uuuu.........uuuuhhhhtt.',
    '...l.l..........l.lhehhh..',
    '...l.l..........l.l.hhhh..',
    '...l.l..........l.l..hhhn.',
    '...l.l..........l.l...hn..',
    '...l.l..........l.l.......',
    '...n.n..........n.n.......',
  ] as Rows,
}
export const DEER_PAL: Palette = {
  b: hex('#9a7a5c'), // coat
  u: hex('#7d6249'), // belly and haunch in shadow
  h: hex('#a8876a'), // head
  e: hex('#1a1410'), // eye
  t: hex('#c9b9a0'), // antlers, tail
  n: hex('#2a2018'), // nose, hooves
  l: hex('#7a5f47'), // legs
}

/** A glowcap: grows where one of the shroomfolk returned to the soil. Its cap glows. */
export const GLOWCAP: Rows = ['...cccc...', '.cccccccc.', 'cccccccccc', '.cccccccc.', '....ss....', '....ss....', '....ss....', '...ssss...']
export const GLOWCAP_PAL: Palette = { c: hex('#9ff5e4'), s: hex('#d8ccb4') }

/** The frog, sitting (eyes up, feet tucked) and mid-hop (stretched out). Faces right. */
export const FROG: Rows[] = [
  ['.....e.e.', '...gggggg', '..ggggggg', '.gGgggggg', 'GG.G..GG.'],
  ['.......e.e', '....gggggg', 'gggggggggG', 'G........G'],
]
export const FROG_PAL: Palette = { e: hex('#c9d67a'), g: C.frog, G: C.frogD }

/** The crow: perched (facing right), wings up, wings down. 'b' is the beak. */
export const CROW: Rows[] = [
  ['....ccc.', '...ccccb', '.ccccccc', 'cccccccc', '.cccccc.', '..c..c..'], // perched
  ['c........c', 'cc......cc', '.ccc..ccc.', '..cccccc..', '....ccb...'], // wings up
  ['..........', '....ccb...', '..cccccc..', '.ccc..ccc.', 'cc......cc'], // wings down
]
