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
// PALETTE DEFINITION
// ============================================================================

// --- Unified Gray Scale ---
// Single source of truth for all gray levels
const gray = {
  0: '#0a0a0a', // Background
  1: '#1a1a1a', // Elevated surfaces
  2: '#2a2a2a', // Selection/highlights
  3: '#454545', // Comments
  4: '#606060', // Punctuation, operators
  5: '#888888', // Support functions, built-ins
  6: '#a8a8a8', // Types, classes
  7: '#c8c8c8', // Object keys, attributes
  8: '#e0e0e0', // Primary text, variables
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
    'editor.background': gray[0],
    'editor.foreground': gray[8],
  },
  tokenColors: [
    // === Default ===
    {
      settings: {
        foreground: gray[8],
      },
    },

    // === Comments (gray 3) ===
    {
      scope: ['comment', 'comment.line', 'comment.block', 'comment.block.documentation', 'punctuation.definition.comment'],
      settings: {
        foreground: gray[3],
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
    {
      scope: ['storage', 'storage.type', 'storage.modifier', 'support.type.builtin'],
      settings: {
        foreground: aurora.red,
      },
    },

    // === Import/Export (Aurora - RED) ===
    {
      scope: ['keyword.control.import', 'keyword.control.export', 'keyword.control.from', 'keyword.control.default'],
      settings: {
        foreground: aurora.red,
      },
    },

    // === Control Flow Keywords (Aurora - purple) ===
    {
      scope: ['keyword.control', 'keyword.control.conditional', 'keyword.control.loop', 'keyword.control.flow'],
      settings: {
        foreground: aurora.purple,
      },
    },

    // === Other Keywords (Aurora - purple) ===
    {
      scope: 'keyword',
      settings: {
        foreground: aurora.purple,
      },
    },

    // === Function definitions (Aurora - yellow) ===
    {
      scope: 'entity.name.function',
      settings: {
        foreground: aurora.yellow,
      },
    },

    // === Support functions (gray 5) ===
    // console.log, Math.floor, etc.
    {
      scope: 'support.function',
      settings: {
        foreground: gray[5],
      },
    },

    // === Types, Classes (gray 6) ===
    {
      scope: ['entity.name.type', 'entity.name.class', 'support.type'],
      settings: {
        foreground: gray[6],
      },
    },

    // === Variables (gray 8) ===
    {
      scope: 'variable',
      settings: {
        foreground: gray[8],
      },
    },

    // === Constants, Numbers (Aurora - orange) ===
    {
      scope: ['constant', 'constant.numeric', 'constant.language'],
      settings: {
        foreground: aurora.orange,
      },
    },

    // === Operators (gray 4) ===
    {
      scope: 'keyword.operator',
      settings: {
        foreground: gray[4],
      },
    },

    // === Punctuation (gray 4) ===
    {
      scope: 'punctuation',
      settings: {
        foreground: gray[4],
      },
    },

    // === HTML/JSX Tags (Aurora - redMuted) ===
    {
      scope: 'entity.name.tag',
      settings: {
        foreground: aurora.redMuted,
      },
    },

    // === Attributes (gray 7) ===
    {
      scope: 'entity.other.attribute-name',
      settings: {
        foreground: gray[7],
      },
    },

    // === CSS Properties (gray 7) ===
    {
      scope: 'support.type.property-name',
      settings: {
        foreground: gray[7],
      },
    },

    // === Object Keys (gray 7) ===
    {
      scope: 'meta.object-literal.key',
      settings: {
        foreground: gray[7],
      },
    },

    // === Regex (gray 5) ===
    {
      scope: 'string.regexp',
      settings: {
        foreground: gray[5],
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
