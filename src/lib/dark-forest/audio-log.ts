/**
 * A log landing on the campfire (docs/research/log-sound.md, wood-knock.md). The operator chose a
 * hollow woodblock "tok" over beam-mode and diffuse-resonance wood, which sounded comical. One landing:
 *
 *   contact  a few micro-impacts within ~12 ms (then one or two softer settles) ringing one
 *            dominant low-mid mode, a matched "cavity" mode beside it, a weaker upper mode and
 *            the log it lands on; band-limited raised-cosine strikes, no dry noise
 *   bed      a soft unpitched thud from the embers, ~20 dB down
 *   crunch   a handful of soft, heavy-tailed cracks of charcoal (SDT crumpling style), ~20 dB down
 *   puff     a soft breath of ash
 *   flare    a swell of hiss as the flames lick round the new wood
 *   catch    crackling that starts a second or so later, builds for several seconds, then fades
 *
 * Every layer is mixed at its real level against the wood (none normalised on its own: that,
 * a loud raw-noise knock and a dense click crunch made the first version sound bit-crushed).
 * Contact, bed, crunch and puff are rendered into one short buffer per landing; the flare and
 * the catch (the fire's own accepted crackle grains, at a rising and falling rate) are nodes.
 */
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const TAU = Math.PI * 2
/** Time to the next event of a Poisson process with this rate (per second). */
const wait = (rate: number) => (rate > 0 ? -Math.log(1 - Math.random()) / rate : 1e9)

export interface LogLanding {
  /** Fuel it added (one log is about 0.2): a bigger log is lower, longer, crunchier and catches harder. */
  fuel: number
  /** Shifts the wood modes, the crunch and the hiss (the source's pitch setting). */
  pitch: number
  /** Scales how hard it catches (the source's rate setting). */
  rate: number
  /** The fire's crackle grains, quietest to loudest. */
  crackles: AudioBuffer[]
  out: AudioNode
}

/** Schedule a log landing at `at`; returns how long it sounds (s). */
export function logLanding(ctx: BaseAudioContext, at: number, o: LogLanding): number {
  const size = clamp(o.fuel / 0.2, 0.5, 1.6)
  const pan = rnd(-0.12, 0.12)
  const hit = ctx.createBufferSource()
  hit.buffer = contact(ctx, size, o.pitch)
  const g = ctx.createGain()
  g.gain.value = 0.95 * size ** 0.5
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  hit.connect(g).connect(p).connect(o.out)
  hit.start(at)
  const hiss = flare(ctx, at, size, o.pitch, pan, o.out)
  return Math.max(hit.buffer.duration, hiss, catching(ctx, at, size, o))
}

/** A strike: a unit-area raised cosine of width `T` (s) at `at`, scaled by `g`. */
interface Strike {
  at: number
  T: number
  g: number
}

/** The landing: a main contact, 2–4 micro-impacts within ~12 ms, then one or two softer settles. */
function strikes(): Strike[] {
  const out: Strike[] = [{ at: 0.002, T: rnd(0.35, 1) * 0.001, g: 1 }]
  for (let i = 0, m = 2 + ((Math.random() * 3) | 0); i < m; i++)
    out.push({ at: 0.002 + rnd(0.001, 0.012), T: rnd(0.2, 0.7) * 0.001, g: 10 ** (-rnd(6, 18) / 20) })
  for (let t = rnd(0.06, 0.22), g = rnd(0.2, 0.45), i = 0; i < (Math.random() < 0.5 ? 1 : 2); i++) {
    out.push({ at: t, T: rnd(1.4, 4) * 0.001, g })
    t += rnd(0.03, 0.12)
    g *= rnd(0.4, 0.8)
  }
  return out
}

/** Add a band-limited strike (at least 8 samples wide) into `x`. */
function strike(x: Float32Array, sr: number, at: number, T: number, g: number) {
  const w = Math.max(8, Math.round(T * sr))
  const s = Math.round(at * sr)
  for (let i = 0; i < w && s + i < x.length; i++) x[s + i] += (g / w) * (1 - Math.cos((TAU * i) / w))
}

/** Ring `x` through an impulse-invariant damped sine at `f` Hz for `t60` s, adding `gain` × it into `y`. */
function resonate(x: Float32Array, y: Float32Array, sr: number, f: number, t60: number, gain: number) {
  if (f > sr * 0.45) return
  const th = (TAU * f) / sr
  const r = Math.exp(-Math.log(1000) / (t60 * sr))
  const a1 = 2 * r * Math.cos(th)
  const a2 = r * r
  const b = Math.sin(th) * gain
  const end = Math.min(x.length, Math.round(t60 * 1.5 * sr) + lastInput(x)) // to −90 dB after the last strike
  let y1 = 0,
    y2 = 0
  for (let i = 0; i < end; i++) {
    const v = a1 * y1 - a2 * y2 + b * x[i]
    y2 = y1
    y1 = v
    y[i] += v
  }
}

function lastInput(x: Float32Array) {
  for (let i = x.length - 1; i >= 0; i--) if (x[i] !== 0) return i
  return 0
}

/** The landing itself: wood tok, bed thud, charcoal crunch and ash puff, in one buffer. */
function contact(ctx: BaseAudioContext, size: number, pitch: number): AudioBuffer {
  const sr = ctx.sampleRate
  const buf = ctx.createBuffer(1, Math.ceil(sr * 1.1), sr)
  const d = buf.getChannelData(0)
  const n = d.length
  const hits = strikes()

  // ---- the wood: a hollow tok (woodblock: one dominant mode, a matched "cavity" beside it, a
  // weaker upper mode at 2.3–3.3×) and the log it lands on, all ringing from the same strikes
  const x = new Float32Array(n)
  for (const h of hits) strike(x, sr, h.at, Math.max(0.0003, h.T * 0.6), h.g)
  const wood = new Float32Array(n)
  const f0 = rnd(650, 1300) * size ** -0.3 * pitch
  const t60 = Math.min(0.2, (2.2 * rnd(15, 40)) / f0 / Math.PI)
  resonate(x, wood, sr, f0, t60, 1)
  resonate(x, wood, sr, f0 * rnd(2.3, 3.3), t60 * 0.5, 0.25)
  resonate(x, wood, sr, f0 * rnd(0.95, 1.05), t60 * 1.3, 0.5)
  resonate(x, wood, sr, f0 * rnd(1.2, 1.9), t60 * 0.7, 0.4)
  const top = peak(wood)

  // ---- the bed: a soft raised cosine into two broad low resonators
  const bx = new Float32Array(n)
  strike(bx, sr, hits[0].at, rnd(6, 15) * 0.001, 1)
  for (const h of hits.slice(-2)) if (h.T > 0.0012) strike(bx, sr, h.at, rnd(6, 12) * 0.001, h.g)
  const bed = new Float32Array(n)
  resonate(bx, bed, sr, rnd(90, 140) * size ** -0.2 * pitch, rnd(0.05, 0.1), 1)
  resonate(bx, bed, sr, rnd(150, 210) * size ** -0.2 * pitch, rnd(0.04, 0.08), 0.7)

  // ---- charcoal giving way: a handful of soft, heavy-tailed cracks, denser early (SDT crumpling)
  const crunch = new Float32Array(n)
  const cx = new Float32Array(n)
  for (let i = 0, m = Math.round((4 + Math.random() * 8) * size ** 0.5); i < m; i++) {
    cx.fill(0)
    strike(cx, sr, 0.015 + 0.8 * Math.random() ** 1.7, rnd(0.3, 0.8) * 0.001, clamp(-Math.log(1 - Math.random()) / 1.45, 0.1, 10))
    for (let k = 0, modes = 2 + (Math.random() < 0.5 ? 1 : 0); k < modes; k++) resonate(cx, crunch, sr, rnd(900, 3000) * pitch, rnd(0.008, 0.025), 1 / (k + 1))
  }

  // ---- a soft breath of ash
  const puff = new Float32Array(n)
  {
    const c = Math.exp((-TAU * rnd(800, 1500) * pitch) / sr)
    let a = 0,
      b = 0
    const rise = rnd(0.02, 0.04)
    const tau = rnd(0.05, 0.08)
    for (let i = 0; i < Math.min(n, (rise + tau * 8) * sr); i++) {
      const t = i / sr
      a = c * a + (1 - c) * (Math.random() * 2 - 1)
      b = c * b + (1 - c) * a
      puff[i] = b * (t < rise ? Math.sin((t / rise) * Math.PI * 0.5) ** 2 : Math.exp(-(t - rise) / tau))
    }
  }

  // mixed at real levels against the wood's peak
  const level = (layer: Float32Array, db: number) => (top * 10 ** (db / 20)) / peak(layer)
  const kb = level(bed, -20)
  const kc = level(crunch, -20 + 3 * Math.log2(size))
  const kp = level(puff, -20)
  for (let i = 0; i < n; i++) d[i] = (wood[i] + kb * bed[i] + kc * crunch[i] + kp * puff[i]) / top
  const fade = Math.round(sr * 0.05)
  for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade
  return buf
}

function peak(d: Float32Array) {
  let p = 0
  for (const v of d) p = Math.max(p, Math.abs(v))
  return p || 1
}

/** The flames licking round the new wood: highpassed noise swelling in under a second and dying over a few. Returns its length (s). */
function flare(ctx: BaseAudioContext, at: number, size: number, pitch: number, pan: number, out: AudioNode) {
  const rise = rnd(0.4, 0.9)
  const hold = rnd(0.6, 1.4)
  const tau = rnd(1.4, 2.2) * size ** 0.5
  const len = rise + hold + tau * 5
  const src = ctx.createBufferSource()
  src.buffer = noise(ctx)
  src.loop = true
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 1000 * pitch
  hp.Q.value = 0.7
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = Math.min(9000 * pitch, ctx.sampleRate * 0.45)
  lp.Q.value = 0.5
  const g = ctx.createGain()
  const top = 0.0012 * size ** 0.5
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(top, at + rise)
  g.gain.setValueAtTime(top, at + rise + hold)
  g.gain.setTargetAtTime(0, at + rise + hold, tau)
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  src.connect(hp).connect(lp).connect(g).connect(p).connect(out)
  src.start(at, Math.random() * 2, len)
  return len
}

/**
 * The new wood catching: on top of the fire's own crackling (which already grows with its heat),
 * extra crackles start a second or so after the landing, grow to a peak several seconds later
 * and fade over the next ten or twenty. Returns when the last one is due (s after `at`).
 */
function catching(ctx: BaseAudioContext, at: number, size: number, o: LogLanding) {
  const start = rnd(0.8, 1.6)
  const peak = rnd(5, 8) * size ** 0.3
  const tau = rnd(7, 11) * size ** 0.5
  const end = peak + tau * Math.log(1 / 0.12)
  const top = 3.5 * size * o.rate // extra crackle starts per second at the peak
  const busy = (t: number) => (t < start ? 0 : t < peak ? smoothstep((t - start) / (peak - start)) : Math.exp(-(t - peak) / tau))
  const crackle = (t: number, amp: number, pan: number) => {
    const N = o.crackles.length
    const k = Math.min(N - 1, Math.floor((amp ** 2.5 * 0.9 + Math.random() * 0.1) * N))
    play(ctx, o.crackles[k], at + t, 0.48 * amp, o.pitch * rnd(0.9, 1.1), pan, o.out)
  }
  // a Poisson process at the peak rate, thinned by how busy it is: heavy-tailed loudness and
  // follow-ups, like the fire's own crackling (Soundscape.crackleAt)
  for (let t = start + wait(top); t < end; t += wait(top)) {
    if (Math.random() >= busy(t)) continue
    const amp = 10 ** (-Math.min(40, -Math.log(1 - Math.random()) * 12) / 20)
    const pan = rnd(-0.25, 0.25)
    crackle(t, amp, pan)
    for (let i = 0, kids = poisson(0.45); i < kids; i++) crackle(t + 0.01 - Math.log(1 - Math.random()) * 0.045, amp * rnd(0.25, 0.9), pan + rnd(-0.08, 0.08))
  }
  return end
}

function play(ctx: BaseAudioContext, buf: AudioBuffer, at: number, gain: number, rate: number, pan: number, out: AudioNode) {
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = rate
  const g = ctx.createGain()
  g.gain.value = gain
  const p = ctx.createStereoPanner()
  p.pan.value = clamp(pan, -1, 1)
  src.connect(g).connect(p).connect(out)
  src.start(at)
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>()
/** Two seconds of white noise, made once per context. */
function noise(ctx: BaseAudioContext) {
  let buf = noiseBuffers.get(ctx)
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    noiseBuffers.set(ctx, buf)
  }
  return buf
}

function smoothstep(u: number) {
  const v = clamp(u, 0, 1)
  return v * v * (3 - 2 * v)
}

/** Poisson-distributed count with this mean. */
function poisson(mean: number) {
  const L = Math.exp(-mean)
  let k = 0
  for (let p = Math.random(); p > L; p *= Math.random()) k++
  return k
}
