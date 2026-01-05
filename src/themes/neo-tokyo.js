// Neo-Tokyo theme for Shiki
// Nord-style palette structure adapted for Akira aesthetic
// Based on Nord's concept: Polar Night (backgrounds), Snow Storm (foregrounds),
// Frost (structural blues), Aurora (semantic accents)

// --- Color utilities ---

function hexToRgb(hex) {
  const num = parseInt(hex.slice(1), 16)
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  }
}

function rgbToHex({ r, g, b }) {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

function adjustLightness(hex, amount) {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHex({
    r: Math.min(255, Math.max(0, r + amount)),
    g: Math.min(255, Math.max(0, g + amount)),
    b: Math.min(255, Math.max(0, b + amount)),
  })
}

function desaturate(hex, amount = 0.3) {
  const { r, g, b } = hexToRgb(hex)
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  return rgbToHex({
    r: Math.round(r + (gray - r) * amount),
    g: Math.round(g + (gray - g) * amount),
    b: Math.round(b + (gray - b) * amount),
  })
}

function mute(hex, darken = -20, desat = 0.2) {
  return desaturate(adjustLightness(hex, darken), desat)
}

// ============================================================================
// PALETTE DEFINITION (Nord-style structure)
// ============================================================================

// --- Polar Night (Dark backgrounds) ---
// Warm-tinted darks to match the Akira aesthetic
const polarNight = {
  nord0: '#0a0a0a', // Deepest background
  nord1: '#1a1a1a', // Elevated surfaces
  nord2: '#252525', // Selection, highlights
  nord3: '#404040', // Comments, subtle UI
}

// --- Snow Storm (Light foregrounds) ---
// Slightly warm whites
const snowStorm = {
  nord4: '#a0a0a0', // Muted text, inactive
  nord5: '#c0c0c0', // Secondary text
  nord6: '#d8d8d8', // Primary foreground
}

// --- Frost (Structural colors) ---
// Instead of Nord's blues, use warm grays with subtle red undertone
// These are for functions, keywords, structural elements
// Increased contrast between levels
const frost = {
  frost0: '#a08080', // Lightest mauve - for types, classes
  frost1: '#b09595', // Brighter - for function calls
  frost2: '#6a5555', // Darker - for support, built-ins
  frost3: '#504040', // Deepest - for operators, punctuation
}

// --- Aurora (Semantic accent colors) ---
// Based on Akira red, with carefully chosen companions
// Following Nord: red=errors, orange=constants, yellow=functions,
//                 green=strings, purple=keywords
const aurora = {
  // Red - The signature Akira color, slightly muted for comfort
  red: mute('#e12120', 0, 0.2),
  redMuted: mute('#e12120', -20, 0.4),

  // Orange - Warm, for numbers and constants
  // Derived: red shifted toward yellow
  orange: mute('#d4694a', 0, 0),

  // Yellow/Gold - For function names (high visibility, frequently called)
  // Muted gold that complements the red
  yellow: mute('#c9a848', 0, 0),

  // Green - For strings (the "content" color)
  // Warmer, less minty - more sage/olive tone
  green: mute('#7a9a6a', 0, 0),

  // Purple - More blue-leaning purple for control flow
  // Shifted toward indigo/periwinkle
  purple: mute('#7a7aaa', 0, 0),
}

// ============================================================================
// THEME EXPORT
// ============================================================================

export default {
  name: 'neo-tokyo',
  type: 'dark',
  colors: {
    'editor.background': polarNight.nord0,
    'editor.foreground': snowStorm.nord6,
  },
  tokenColors: [
    // === Default ===
    {
      settings: {
        foreground: snowStorm.nord6,
      },
    },

    // === Comments (Polar Night - nord3) ===
    {
      scope: ['comment', 'comment.line', 'comment.block', 'comment.block.documentation', 'punctuation.definition.comment'],
      settings: {
        foreground: polarNight.nord3,
        fontStyle: 'italic',
      },
    },

    // === Strings (Aurora - green) ===
    {
      scope: 'string',
      settings: {
        foreground: aurora.green,
      },
    },

    // === Storage (Aurora - RED) ===
    // const, let, var, function, class, interface, async, type
    // This is the "structure definition" color - making declarations stand out
    {
      scope: ['storage', 'storage.type', 'storage.modifier', 'support.type.builtin'],
      settings: {
        foreground: aurora.red,
      },
    },

    // === Import/Export (Aurora - RED) ===
    // import, export, from - module boundaries are important
    {
      scope: ['keyword.control.import', 'keyword.control.export', 'keyword.control.from', 'keyword.control.default'],
      settings: {
        foreground: aurora.red,
      },
    },

    // === Control Flow Keywords (Aurora - purple) ===
    // if, else, return, for, while, switch, etc.
    {
      scope: ['keyword.control', 'keyword.control.conditional', 'keyword.control.loop', 'keyword.control.flow'],
      settings: {
        foreground: aurora.purple,
      },
    },

    // === Other Keywords (Aurora - purple) ===
    // Fallback for other keyword types
    {
      scope: 'keyword',
      settings: {
        foreground: aurora.purple,
      },
    },

    // === Functions (Aurora - yellow) ===
    {
      scope: 'entity.name.function',
      settings: {
        foreground: aurora.yellow,
      },
    },

    // === Support functions (Frost - frost1) ===
    // console.log, Math.floor, etc.
    {
      scope: 'support.function',
      settings: {
        foreground: frost.frost1,
      },
    },

    // === Types, Classes (Frost - frost0) ===
    {
      scope: ['entity.name.type', 'entity.name.class', 'support.type'],
      settings: {
        foreground: frost.frost0,
      },
    },

    // === Variables (Snow Storm - nord6) ===
    {
      scope: 'variable',
      settings: {
        foreground: snowStorm.nord6,
      },
    },

    // === Constants, Numbers (Aurora - orange) ===
    {
      scope: ['constant', 'constant.numeric', 'constant.language'],
      settings: {
        foreground: aurora.orange,
      },
    },

    // === Operators (Frost - frost3) ===
    {
      scope: 'keyword.operator',
      settings: {
        foreground: frost.frost3,
      },
    },

    // === Punctuation (Frost - frost3) ===
    {
      scope: 'punctuation',
      settings: {
        foreground: frost.frost3,
      },
    },

    // === HTML/JSX Tags (Aurora - redMuted) ===
    {
      scope: 'entity.name.tag',
      settings: {
        foreground: aurora.redMuted,
      },
    },

    // === Attributes (Aurora - yellow muted) ===
    {
      scope: 'entity.other.attribute-name',
      settings: {
        foreground: mute(aurora.yellow, -20, 0.2),
      },
    },

    // === CSS Properties (Frost - frost1) ===
    {
      scope: 'support.type.property-name',
      settings: {
        foreground: frost.frost1,
      },
    },

    // === Object Keys (Snow Storm - nord5) ===
    {
      scope: 'meta.object-literal.key',
      settings: {
        foreground: snowStorm.nord5,
      },
    },

    // === Regex (Frost - frost2) ===
    {
      scope: 'string.regexp',
      settings: {
        foreground: frost.frost2,
      },
    },

    // === Escape characters (Aurora - orange) ===
    {
      scope: 'constant.character.escape',
      settings: {
        foreground: aurora.orange,
      },
    },
  ],
}
