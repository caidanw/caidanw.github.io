/**
 * The GPU compositor (WebGL2): the same lighting as the renderer's CPU compose pass, run as a
 * fragment shader. Drawing stays on the CPU (sprites, props and silhouettes into the buffers);
 * what's here is everything after: every light with its banded grain and flicker, shadow maps
 * and the heights they cover, normals and shine, moonlight, reflections, the glow layer, mist,
 * leaf glints and stars; then bloom, and the upscale to the output size.
 *
 * Inputs are the renderer's own planar buffers, uploaded each frame as layers of a texture
 * array (no repacking): one float array, one byte array, one integer array. The CPU compose
 * stays as the reference and fallback; the editor's CPU vs GPU view compares the two.
 *
 * Keep this in step with renderer.ts compose() and lights.ts gatherLight(): the noise, hash
 * and grain are ported exactly so the two agree pixel for pixel.
 */
import type { Prepared } from './lights'
import type { Color } from './util'

/** Float channels, in layer order. */
export const FLOAT_LAYERS = [
  'r',
  'g',
  'b',
  'kx',
  'ky',
  'kz',
  'nx',
  'ny',
  'nz',
  'sp',
  'gl',
  'rr',
  'rg',
  'rb',
  'rkx',
  'rky',
  'rkz',
  'rnx',
  'rny',
  'rnz',
  'rsp',
  'fx.r',
  'fx.g',
  'fx.b',
  'fx.a',
  'fx.bw',
  'fx.rr',
  'fx.rg',
  'fx.rb',
  'fx.ra',
  'fx.rbw',
  'bgr',
  'bgg',
  'bgb',
  'starB',
  'starPh',
] as const
const BYTE_LAYERS = ['a', 'obj', 'pool', 'ra', 'sky'] as const
const INT_LAYERS = ['hv', 'rhv'] as const
const STATIC_FROM = FLOAT_LAYERS.indexOf('bgr') // these change only when the static layer is rebuilt
const MAX_LIGHTS = 128
const MAX_MAPS = 6
const MAP_SIZE = 256

export interface GpuFrame {
  /** Channel arrays by name (see FLOAT_LAYERS / BYTE_LAYERS / INT_LAYERS). */
  channels: Record<string, Float32Array | Uint8Array | Int32Array>
  /** Bumped when the static channels (sky, stars) changed. */
  staticVersion: number
  lights: Prepared[]
  t: number
  amb: number
  /** Cloud cover and a lightning flash (the weather). */
  cloud: number
  flash: number
  moonK: number
  mistK: number
  mistColor: Color
  layers: { normals: boolean; reflections: boolean; emissives: boolean; mist: boolean; glints: boolean; stars: boolean; bloom: boolean }
  raining: boolean
  heat: number
  bloomK: number
  width: number
  height: number
  res: number
  /** Output size (the canvas), a whole multiple of width x height. */
  outW: number
  outH: number
}

const COMMON = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
precision highp isampler2DArray;
`

const LIGHT_FS =
  COMMON +
  /* glsl */ `
uniform sampler2DArray uF;
uniform mediump sampler2DArray uB;
uniform isampler2DArray uI;
uniform sampler2D uLights;
uniform sampler2DArray uSh;
uniform isampler2DArray uShO;
uniform vec4 uShP[${MAX_MAPS}];
uniform int uNL;
uniform float uT, uAmb, uMoonK, uMistK, uRes, uRain, uCloud, uFlash;
uniform vec3 uMistC;
uniform int uW, uH;
uniform bool uNormals, uRefl, uEmis, uMist, uGlints, uStars;
out vec4 o;

const float PI = 3.141592653589793;
const float BANDS = 6.0;
const float TAIL_REACH = 2.4;
const float DARKNESS = 0.85;
const float OBJECT_DARKNESS = 0.6;
const vec3 VIEW = vec3(0.0, 0.3, 0.95);
const vec3 MOON = normalize(vec3(0.15, 0.75, -0.65));

float F(int l, ivec2 p) { return texelFetch(uF, ivec3(p, l), 0).r; }
float Bt(int l, ivec2 p) { return texelFetch(uB, ivec3(p, l), 0).r; }
int It(int l, ivec2 p) { return texelFetch(uI, ivec3(p, l), 0).r; }

// util.ts hash() and vnoise(), exactly (uint wraps like Math.imul)
float hash2(int x, int y) {
  uint h = uint(x) * 374761393u + uint(y) * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h ^ (h >> 16u)) / 4294967296.0;
}
float vnoise(float x, float y) {
  float xi = floor(x), yi = floor(y);
  float xf = x - xi, yf = y - yi;
  float u = xf * xf * (3.0 - 2.0 * xf), v = yf * yf * (3.0 - 2.0 * yf);
  int X = int(xi), Y = int(yi);
  float a = hash2(X, Y), b = hash2(X + 1, Y), c = hash2(X, Y + 1), d = hash2(X + 1, Y + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
float jsRound(float v) { return floor(v + 0.5); }
// lights.ts groundGrain()
float grain(float x, float z) {
  uint h = uint(int(floor(x * 1.35 * uRes)) + 999) * 374761393u + uint(int(floor(z * 0.6 * uRes))) * 668265263u;
  uint v = (h ^ (h >> 13u)) * 1274126177u;
  return float(v ^ (v >> 16u)) / 4294967296.0;
}
// lights.ts wanderAt(wander(seed), x, z): the slow part of the flicker, on a 2-unit grid
float wander(float seed, float x, float z) {
  float i = clamp(jsRound((x + 220.0) / 2.0), 0.0, 219.0);
  float j = clamp(jsRound((z + 140.0) / 2.0), 0.0, 139.0);
  return vnoise((-220.0 + i * 2.0) * 0.06 + seed, (-140.0 + j * 2.0) * 0.06);
}
// shadows.ts shadowAt / shadowOnObject
float shadowAt(int m, float x, float z) {
  vec4 P = uShP[m];
  float fx = (x - P.x) / P.z - 0.5, fz = (z - P.y) / P.z - 0.5;
  int i = int(floor(fx)), j = int(floor(fz)), n = int(P.w);
  if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) return 0.0;
  float tx = fx - float(i), tz = fz - float(j);
  int L = m * 4;
  float a00 = texelFetch(uSh, ivec3(i, j, L), 0).r, a10 = texelFetch(uSh, ivec3(i + 1, j, L), 0).r;
  float a01 = texelFetch(uSh, ivec3(i, j + 1, L), 0).r, a11 = texelFetch(uSh, ivec3(i + 1, j + 1, L), 0).r;
  float a = a00 + (a10 - a00) * tx, b = a01 + (a11 - a01) * tx;
  return a + (b - a) * tz;
}
float bandAt(int m, int i, int j, float y, int tag) {
  int L = m * 4;
  float a = texelFetch(uSh, ivec3(i, j, L + 1), 0).r;
  if (a <= 0.01) return 0.0;
  if (tag != 0 && texelFetch(uShO, ivec3(i, j, m), 0).r == tag) return 0.0;
  float lo = texelFetch(uSh, ivec3(i, j, L + 2), 0).r, hi = texelFetch(uSh, ivec3(i, j, L + 3), 0).r;
  return a * clamp((hi - y) / 1.2 + 0.5, 0.0, 1.0) * clamp((y - lo) / 1.2 + 0.5, 0.0, 1.0);
}
float shadowOnObject(int m, float x, float z, float y, int tag) {
  vec4 P = uShP[m];
  float fx = (x - P.x) / P.z - 0.5, fz = (z - P.y) / P.z - 0.5;
  int i = int(floor(fx)), j = int(floor(fz)), n = int(P.w);
  if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) return 0.0;
  float tx = fx - float(i), tz = fz - float(j);
  float a00 = bandAt(m, i, j, y, tag), a10 = bandAt(m, i + 1, j, y, tag);
  float a01 = bandAt(m, i, j + 1, y, tag), a11 = bandAt(m, i + 1, j + 1, y, tag);
  float a = a00 + (a10 - a00) * tx, b = a01 + (a11 - a01) * tx;
  return a + (b - a) * tz;
}

// lights.ts gatherLight()
vec3 gather(vec3 P, bool ground, float gr, vec3 N, bool hasN, int tag) {
  vec3 acc = vec3(0.0);
  for (int k = 0; k < ${MAX_LIGHTS}; k++) {
    if (k >= uNL) break;
    vec4 A = texelFetch(uLights, ivec2(0, k), 0); // x, y, z, radius
    vec4 Cc = texelFetch(uLights, ivec2(1, k), 0); // colour, wobble
    vec4 E = texelFetch(uLights, ivec2(2, k), 0); // tail, reach2, owner, seed
    vec4 S = texelFetch(uLights, ivec2(3, k), 0); // shadow map (-1: none)
    if (tag != 0 && int(E.z) == tag) continue;
    vec3 dv = P - A.xyz;
    float dd = dot(dv, dv);
    if (dd >= E.y) continue;
    float d = sqrt(dd);
    float R = A.w;
    if (Cc.w > 0.0 && d < R * 1.3) {
      int bin = min(95, int(((atan(dv.z, dv.x) / PI + 1.0) / 2.0) * 96.0));
      float wob = vnoise((float(bin) / 96.0 * 2.0 - 1.0) * PI * 2.4 + E.w, uT * 0.7);
      R *= 1.0 + Cc.w * (0.16 * (wob - 0.5) + 0.08 * (wander(E.w, P.x, P.z) - 0.5));
    }
    float f = 1.0 - d / R;
    f = f > 0.0 ? f * f : 0.0;
    float tail = E.x > 0.0 ? (E.x * max(0.0, 1.0 - d / (A.w * TAIL_REACH))) / (1.0 + (d / A.w) * (d / A.w) * 5.0) : 0.0;
    int m = int(S.x);
    if (ground) {
      float occ = m >= 0 ? shadowAt(m, P.x, P.z) * DARKNESS : 0.0;
      tail *= 1.0 - occ * 0.7;
      if (f > 0.0) {
        f *= 1.0 - occ;
        float banded = floor(f * BANDS + gr) / BANDS;
        f = 0.55 * banded + 0.45 * f;
      }
    } else if (m >= 0) {
      float so = shadowOnObject(m, P.x, P.z, P.y, tag) * DARKNESS * OBJECT_DARKNESS;
      f *= 1.0 - so;
      tail *= 1.0 - so * 0.7;
    }
    if (!ground && hasN) {
      float ln = length(dv);
      if (ln == 0.0) ln = 1.0;
      float ndl = -dot(N, dv) / ln;
      float lam = clamp((ndl + 0.15) / 1.15, 0.0, 1.0);
      f *= 0.2 + 1.15 * lam;
      tail *= 0.4 + 0.9 * lam;
    }
    float kk = f + tail;
    if (kk <= 0.0) continue;
    acc += kk * Cc.rgb;
  }
  return acc;
}

// renderer.ts cloudAt()
float cloudAt(float x, float y) {
  if (uCloud <= 0.0) return 0.0;
  float n = 0.6 * vnoise(x * 0.012 + uT * 0.02, y * 0.035) + 0.4 * vnoise(x * 0.031 - uT * 0.013, y * 0.08 + 3.0);
  float d = clamp((n - (1.0 - uCloud) * 0.75 - 0.2) * 3.2, 0.0, 1.0);
  return floor(d * 4.0) / 4.0;
}
const vec3 CLOUD = vec3(0.065, 0.075, 0.095);
const vec3 CLOUD_RIM = vec3(0.17, 0.19, 0.24);
const vec3 FLASH = vec3(0.5, 0.55, 0.7);

// renderer.ts compose(): light()
vec3 lightAt(vec3 P, bool ground, vec3 N, float spec, int tag) {
  float moon = 1.0;
  bool hasN = !ground && uNormals && N.z > 0.0;
  if (hasN) moon = 0.5 + 1.3 * max(0.0, dot(N, MOON));
  vec3 Lc = (vec3(0.15, 0.18, 0.27) * uAmb * uMoonK + uFlash * vec3(0.35, 0.38, 0.5)) * moon;
  Lc += gather(P, ground, ground ? grain(P.x, P.z) : 0.5, N, hasN, tag);
  if (hasN && spec > 0.0 && uNL > 0) {
    // metal: a tight warm glint where the surface faces the fire, a cool rim toward the moon
    vec4 A = texelFetch(uLights, ivec2(0, 0), 0);
    vec4 Cc = texelFetch(uLights, ivec2(1, 0), 0);
    vec3 l = A.xyz - P;
    float d = length(l);
    if (d == 0.0) d = 1.0;
    l /= d;
    float reach = max(0.0, 1.0 - d / (A.w * 1.2));
    vec3 hv = vec3(l.x, l.y + VIEW.y, l.z + VIEW.z);
    float hl = length(hv);
    if (hl == 0.0) hl = 1.0;
    float fs = pow(max(0.0, dot(N, hv) / hl), 9.0) * reach * 2.2 * spec;
    vec3 MH = normalize(MOON + VIEW);
    float ms = pow(max(0.0, dot(N, MH)), 7.0) * 0.45 * uAmb * spec;
    Lc += fs * Cc.rgb + ms * vec3(0.55, 0.65, 0.85);
  }
  return Lc;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float x = float(p.x), y = float(p.y);
  vec3 col;
  bool a = Bt(0, p) > 0.0;
  if (a) {
    bool obj = Bt(1, p) > 0.0, pool = Bt(2, p) > 0.0;
    vec3 P = vec3(F(3, p), F(4, p), F(5, p));
    vec3 Lc = lightAt(P, !obj, vec3(F(6, p), F(7, p), F(8, p)), F(9, p), It(0, p));
    col = vec3(F(0, p), F(1, p), F(2, p)) * Lc;
    if (pool && !obj && !uRefl) col += vec3(0.03, 0.045, 0.075) * uAmb;
    else if (pool && !obj) {
      // open water: dark surface + the mirrored world + mirrored emissives, gently rippled
      int ox = int(jsRound(sin((y / uRes) * 1.7 + uT * 2.4) * 0.7 * uRes));
      ivec2 j = ivec2(clamp(p.x + ox, 0, uW - 1), p.y);
      if (Bt(3, j) > 0.0) {
        vec3 L2 = lightAt(vec3(F(14, j), F(15, j), F(16, j)), false, vec3(F(17, j), F(18, j), F(19, j)), F(20, j), It(1, j));
        col += vec3(F(11, j), F(12, j), F(13, j)) * L2 * 0.55;
      } else col += vec3(0.03, 0.045, 0.075) * uAmb;
      float fa = uEmis ? F(29, j) * 0.75 : 0.0;
      if (fa > 0.0) col = col * (1.0 - fa) + vec3(F(26, j), F(27, j), F(28, j)) * fa;
    }
    float m = uMist ? clamp((-P.z - 28.0) / 58.0, 0.0, 1.0) * 0.88 * uMistK : 0.0;
    if (m > 0.0) {
      m = min(0.95, m * (0.75 + 0.35 * vnoise((x / uRes) * 0.025 + uT * 0.06, (y / uRes) * 0.06)));
      col = col * (1.0 - m) + uMistC * m;
    }
    float gl = uGlints ? F(10, p) : 0.0;
    if (gl > 0.0) {
      float k = gl * 0.26 * uAmb * (1.0 - m) * (0.55 + 0.45 * sin(uT * 0.8 + x * 0.37 + y * 0.71));
      col += vec3(0.5, 0.68, 0.75) * k;
    }
  } else {
    // the sky, behind the clouds (a flash lights their undersides)
    col = vec3(F(31, p), F(32, p), F(33, p)) * uAmb;
    float cd = Bt(4, p) > 0.0 ? cloudAt(x, y) : 0.0;
    if (cd > 0.0) {
      bool edge = cd <= 0.25;
      col = mix(col, (edge ? CLOUD_RIM : CLOUD) * uAmb + uFlash * FLASH * (edge ? 0.9 : 0.6), edge ? 0.55 : 0.8 + 0.15 * cd);
    }
    col += uFlash * 0.18 * FLASH;
  }
  float fa = uEmis ? F(24, p) : 0.0;
  if (fa > 0.0) col = col * (1.0 - fa) + vec3(F(21, p), F(22, p), F(23, p)) * fa;
  if (!a && uStars) {
    float sb = F(34, p);
    if (sb > 0.0) col += vec3(0.86, 0.88, 0.94) * sb * (0.55 + 0.45 * sin(uT * 1.3 + F(35, p))) * (1.0 - cloudAt(x, y));
  }
  o = vec4(col, 1.0);
}
`

// what blooms: the emissive layer (or its reflection, where that's stronger), premultiplied
const BLOOM_SRC_FS =
  COMMON +
  /* glsl */ `
uniform sampler2DArray uF;
out vec4 o;
float F(int l, ivec2 p) { return texelFetch(uF, ivec3(p, l), 0).r; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float ra = F(29, p) * 0.6 * F(30, p);
  float fa = F(24, p) * F(25, p);
  bool useR = ra > F(24, p);
  vec3 c = useR ? vec3(F(26, p), F(27, p), F(28, p)) : vec3(F(21, p), F(22, p), F(23, p));
  float a = clamp(max(fa, ra), 0.0, 1.0);
  o = vec4(clamp(c, 0.0, 1.0) * a, a);
}
`

// a separable gaussian
const BLUR_FS =
  COMMON +
  /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uDir;
uniform float uSigma;
uniform vec2 uSize;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  int r = int(ceil(uSigma * 3.0));
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -60; i <= 60; i++) {
    if (i < -r || i > r) continue;
    float w = exp(-float(i * i) / (2.0 * uSigma * uSigma));
    acc += texture(uSrc, uv + uDir * float(i) / uSize) * w;
    wsum += w;
  }
  o = acc / wsum;
}
`

// to the canvas: the lit image crisp, the bloom soft
const FINAL_FS =
  COMMON +
  /* glsl */ `
uniform sampler2D uLit, uB1, uB2;
uniform vec2 uOut;
uniform ivec2 uFb;
uniform float uK1, uK2;
out vec4 o;
void main() {
  vec2 f = gl_FragCoord.xy;
  float s = uOut.x / float(uFb.x);
  ivec2 p = ivec2(int(f.x / s), uFb.y - 1 - int(f.y / s));
  vec3 c = clamp(texelFetch(uLit, p, 0).rgb, 0.0, 1.0);
  vec2 uv = vec2(f.x / uOut.x, 1.0 - f.y / uOut.y);
  c += texture(uB1, uv).rgb * uK1 + texture(uB2, uv).rgb * uK2;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`

const VS = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

interface Target {
  tex: WebGLTexture
  fbo: WebGLFramebuffer
  w: number
  h: number
}

export class GpuCompositor {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private progs: Record<'light' | 'bloomSrc' | 'blur' | 'final', WebGLProgram>
  private texF: WebGLTexture
  private texB: WebGLTexture
  private texI: WebGLTexture
  private texLights: WebGLTexture
  private texSh: WebGLTexture
  private texShO: WebGLTexture
  private lit: Target
  private bloomSrc: Target
  private b1: [Target, Target]
  private b2: [Target, Target]
  private lightData = new Float32Array(MAX_LIGHTS * 4 * 4)
  private staticVersion = -1
  private w: number
  private h: number
  private uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>()

  /** A compositor for a width x height framebuffer, or null if WebGL2 (with float targets) isn't there. */
  static create(width: number, height: number): GpuCompositor | null {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, premultipliedAlpha: false })
      if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null
      return new GpuCompositor(canvas, gl, width, height)
    } catch {
      return null
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, w: number, h: number) {
    this.canvas = canvas
    this.gl = gl
    this.w = w
    this.h = h
    const prog = (fs: string) => {
      const p = gl.createProgram()!
      for (const [type, src] of [
        [gl.VERTEX_SHADER, VS],
        [gl.FRAGMENT_SHADER, fs],
      ] as const) {
        const s = gl.createShader(type)!
        gl.shaderSource(s, src)
        gl.compileShader(s)
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)}`)
        gl.attachShader(p, s)
      }
      gl.linkProgram(p)
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(p)}`)
      return p
    }
    this.progs = { light: prog(LIGHT_FS), bloomSrc: prog(BLOOM_SRC_FS), blur: prog(BLUR_FS), final: prog(FINAL_FS) }
    const array = (internal: number, layers: number, size: [number, number] = [w, h]) => {
      const t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t)
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, internal, size[0], size[1], layers)
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, k, gl.NEAREST)
      return t
    }
    this.texF = array(gl.R32F, FLOAT_LAYERS.length)
    this.texB = array(gl.R8, BYTE_LAYERS.length)
    this.texI = array(gl.R32I, INT_LAYERS.length)
    this.texSh = array(gl.R32F, MAX_MAPS * 4, [MAP_SIZE, MAP_SIZE])
    this.texShO = array(gl.R32I, MAX_MAPS, [MAP_SIZE, MAP_SIZE])
    this.texLights = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.texLights)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 4, MAX_LIGHTS)
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST)
    const target = (tw: number, th: number, internal: number, filter: number): Target => {
      const tex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texStorage2D(gl.TEXTURE_2D, 1, internal, tw, th)
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, filter)
      for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE)
      const fbo = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      return { tex, fbo, w: tw, h: th }
    }
    this.lit = target(w, h, gl.RGBA32F, gl.NEAREST)
    this.bloomSrc = target(w, h, gl.RGBA16F, gl.LINEAR)
    this.b1 = [target(w, h, gl.RGBA16F, gl.LINEAR), target(w, h, gl.RGBA16F, gl.LINEAR)]
    this.b2 = [target(w >> 1, h >> 1, gl.RGBA16F, gl.LINEAR), target(w >> 1, h >> 1, gl.RGBA16F, gl.LINEAR)]
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private u(p: WebGLProgram, name: string) {
    let m = this.uniforms.get(p)
    if (!m) this.uniforms.set(p, (m = new Map()))
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(p, name))
    return m.get(name)!
  }

  private upload(f: GpuFrame) {
    const gl = this.gl
    const { w, h } = this
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texF)
    const fresh = f.staticVersion !== this.staticVersion
    FLOAT_LAYERS.forEach((name, k) => {
      if (k >= STATIC_FROM && !fresh) return
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, k, w, h, 1, gl.RED, gl.FLOAT, f.channels[name] as Float32Array)
    })
    this.staticVersion = f.staticVersion
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texB)
    BYTE_LAYERS.forEach((name, k) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, k, w, h, 1, gl.RED, gl.UNSIGNED_BYTE, f.channels[name] as Uint8Array))
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texI)
    INT_LAYERS.forEach((name, k) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, k, w, h, 1, gl.RED_INTEGER, gl.INT, f.channels[name] as Int32Array))
    // lights, and the shadow maps of those that have one
    const L = this.lightData
    L.fill(0)
    const maps: Prepared['shadow'][] = []
    const n = Math.min(MAX_LIGHTS, f.lights.length)
    for (let k = 0; k < n; k++) {
      const l = f.lights[k]
      let m = -1
      if (l.shadow && maps.length < MAX_MAPS && l.shadow.n <= MAP_SIZE) {
        m = maps.length
        maps.push(l.shadow)
      }
      const o = k * 16
      L.set([l.x, l.y, l.z, l.radius, l.color[0], l.color[1], l.color[2], l.wob ? l.wobble : 0, l.tail, l.reach2, l.owner ?? 0, l.seed, m, 0, 0, 0], o)
    }
    gl.bindTexture(gl.TEXTURE_2D, this.texLights)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 4, MAX_LIGHTS, gl.RGBA, gl.FLOAT, L)
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texSh)
    const params = new Float32Array(MAX_MAPS * 4)
    maps.forEach((s, m) => {
      if (!s) return
      for (const [k, arr] of [s.occ, s.oa, s.lo, s.hi].entries()) gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, m * 4 + k, s.n, s.n, 1, gl.RED, gl.FLOAT, arr)
      params.set([s.x0, s.z0, s.cell, s.n], m * 4)
    })
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texShO)
    maps.forEach((s, m) => s && gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, m, s.n, s.n, 1, gl.RED_INTEGER, gl.INT, s.owner))
    return { n, params }
  }

  /** Light the frame into the lit target (fb resolution). */
  private light(f: GpuFrame, n: number, params: Float32Array) {
    const gl = this.gl
    const p = this.progs.light
    gl.useProgram(p)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lit.fbo)
    gl.viewport(0, 0, this.w, this.h)
    const bind = (unit: number, target: number, tex: WebGLTexture, name: string) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(target, tex)
      gl.uniform1i(this.u(p, name), unit)
    }
    bind(0, gl.TEXTURE_2D_ARRAY, this.texF, 'uF')
    bind(1, gl.TEXTURE_2D_ARRAY, this.texB, 'uB')
    bind(2, gl.TEXTURE_2D_ARRAY, this.texI, 'uI')
    bind(3, gl.TEXTURE_2D, this.texLights, 'uLights')
    bind(4, gl.TEXTURE_2D_ARRAY, this.texSh, 'uSh')
    bind(5, gl.TEXTURE_2D_ARRAY, this.texShO, 'uShO')
    gl.uniform4fv(this.u(p, 'uShP'), params)
    gl.uniform1i(this.u(p, 'uNL'), n)
    gl.uniform1f(this.u(p, 'uT'), f.t)
    gl.uniform1f(this.u(p, 'uAmb'), f.amb)
    gl.uniform1f(this.u(p, 'uMoonK'), f.moonK)
    gl.uniform1f(this.u(p, 'uMistK'), f.mistK)
    gl.uniform1f(this.u(p, 'uRes'), f.res)
    gl.uniform1f(this.u(p, 'uRain'), f.raining ? 1 : 0)
    gl.uniform1f(this.u(p, 'uCloud'), f.cloud)
    gl.uniform1f(this.u(p, 'uFlash'), f.flash)
    gl.uniform3fv(this.u(p, 'uMistC'), f.mistColor)
    gl.uniform1i(this.u(p, 'uW'), this.w)
    gl.uniform1i(this.u(p, 'uH'), this.h)
    const L = f.layers
    gl.uniform1i(this.u(p, 'uNormals'), L.normals ? 1 : 0)
    gl.uniform1i(this.u(p, 'uRefl'), L.reflections ? 1 : 0)
    gl.uniform1i(this.u(p, 'uEmis'), L.emissives ? 1 : 0)
    gl.uniform1i(this.u(p, 'uMist'), L.mist ? 1 : 0)
    gl.uniform1i(this.u(p, 'uGlints'), L.glints ? 1 : 0)
    gl.uniform1i(this.u(p, 'uStars'), L.stars ? 1 : 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private pass(prog: WebGLProgram, to: Target | null, setup: () => void) {
    const gl = this.gl
    gl.useProgram(prog)
    gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.fbo : null)
    gl.viewport(0, 0, to ? to.w : this.canvas.width, to ? to.h : this.canvas.height)
    setup()
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private blur(src: Target, [a, b]: [Target, Target], sigma: number) {
    const gl = this.gl
    const p = this.progs.blur
    for (const [from, to, dir] of [
      [src, a, [1, 0]],
      [a, b, [0, 1]],
    ] as const)
      this.pass(p, to, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, from.tex)
        gl.uniform1i(this.u(p, 'uSrc'), 0)
        gl.uniform2f(this.u(p, 'uDir'), dir[0], dir[1])
        gl.uniform1f(this.u(p, 'uSigma'), sigma)
        gl.uniform2f(this.u(p, 'uSize'), to.w, to.h)
      })
    return b
  }

  /** Light, bloom and upscale one frame onto this.canvas (outW x outH). */
  render(f: GpuFrame) {
    const gl = this.gl
    if (this.canvas.width !== f.outW || this.canvas.height !== f.outH) {
      this.canvas.width = f.outW
      this.canvas.height = f.outH
    }
    const { n, params } = this.upload(f)
    this.light(f, n, params)
    let k1 = 0
    let k2 = 0
    const bloom = f.layers.bloom && f.layers.emissives
    if (bloom) {
      this.pass(this.progs.bloomSrc, this.bloomSrc, () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texF)
        gl.uniform1i(this.u(this.progs.bloomSrc, 'uF'), 0)
      })
      // the CPU path blurs at output scale by 3 and 9 framebuffer pixels (times RES)
      this.blur(this.bloomSrc, this.b1, 3 * f.res)
      this.blur(this.bloomSrc, this.b2, (9 * f.res) / 2)
      const heat = Math.min(1.2, f.heat)
      k1 = Math.min(1, 0.85 * (0.45 + 0.55 * heat) * f.bloomK)
      k2 = Math.min(1, 0.55 * (0.3 + 0.7 * heat) * f.bloomK)
    }
    const p = this.progs.final
    this.pass(p, null, () => {
      const tex: [string, WebGLTexture][] = [
        ['uLit', this.lit.tex],
        ['uB1', this.b1[1].tex],
        ['uB2', this.b2[1].tex],
      ]
      tex.forEach(([name, t], i) => {
        gl.activeTexture(gl.TEXTURE0 + i)
        gl.bindTexture(gl.TEXTURE_2D, t)
        gl.uniform1i(this.u(p, name), i)
      })
      gl.uniform2f(this.u(p, 'uOut'), f.outW, f.outH)
      gl.uniform2i(this.u(p, 'uFb'), this.w, this.h)
      gl.uniform1f(this.u(p, 'uK1'), k1)
      gl.uniform1f(this.u(p, 'uK2'), k2)
    })
  }

  /** The lit frame (before bloom) read back, RGBA floats, row 0 at the top: for the CPU vs GPU view. */
  readLit(): Float32Array {
    const gl = this.gl
    const out = new Float32Array(this.w * this.h * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lit.fbo)
    gl.readPixels(0, 0, this.w, this.h, gl.RGBA, gl.FLOAT, out)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return out
  }
}
