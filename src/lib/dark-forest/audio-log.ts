/**
 * A log landing on the campfire, after Recipe A in docs/research/log-and-wind-synthesis.md and
 * measured against recordings (docs/research/log-sound.md). Wood does not thump like a kick
 * drum: a log's bending modes ring in the hundreds of Hz to a few kHz and die within a few
 * hundred ms, and the low end is a small, unpitched knock of the bed. One landing is:
 *
 *   contact  damped inharmonic beam modes (1 : 2.76 : 5.40 : 8.93) of the log and of the log it
 *            strikes, set ringing by a raised-cosine contact pulse, over a small thud of the bed,
 *            then a softer clonk or two as it settles
 *   crunch   charcoal and embers giving way under it (PhISEM, after Cook's STK Shakers)
 *   puff     a soft breath of ash
 *   flare    a swell of hiss as the flames lick round the new wood
 *   catch    crackling that starts a second or so later, builds for several seconds, then fades
 *
 * Contact, crunch and puff are rendered into one short buffer per landing (well under a
 * millisecond of work per 1000 samples); the flare and the catch (the fire's own accepted
 * crackle grains, at a rising and falling rate) are scheduled as nodes.
 */
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const TAU = Math.PI * 2
/** Time to the next event of a Poisson process with this rate (per second). */
const wait = (rate: number) => (rate > 0 ? -Math.log(1 - Math.random()) / rate : 1e9)
/** Beam bending modes, free-free (Irvine): f_n / f_1. */
const BEAM = [1, 2.757, 5.404, 8.933]

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
  g.gain.value = 0.68 * size ** 0.5
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  hit.connect(g).connect(p).connect(o.out)
  hit.start(at)
  const hiss = flare(ctx, at, size, o.pitch, pan, o.out)
  return Math.max(hit.buffer.duration, hiss, catching(ctx, at, size, o))
}

/** A resonator (two poles) that rings at `f` Hz for `t60` s with unit amplitude per unit of input area. */
function mode(f: number, t60: number, sr: number) {
  const r = Math.exp(-Math.log(1000) / (t60 * sr))
  const th = (TAU * Math.min(f, sr * 0.45)) / sr
  const a1 = 2 * r * Math.cos(th)
  const a2 = -r * r
  const g = Math.sin(th)
  let y1 = 0,
    y2 = 0
  return (x: number) => {
    const y = a1 * y1 + a2 * y2 + g * x
    y2 = y1
    y1 = y
    return y
  }
}

/** The landing itself: wood modes, bed thud, settling clonks, ember crunch and ash puff, in one buffer. */
function contact(ctx: BaseAudioContext, size: number, pitch: number): AudioBuffer {
  const sr = ctx.sampleRate
  const buf = ctx.createBuffer(1, Math.ceil(sr * 1.1), sr)
  const d = buf.getChannelData(0)
  const n = d.length

  // ---- the wood: the falling log's modes, and those of the log it lands on (shorter, charred: higher)
  const f1 = rnd(380, 800) * size ** -0.3 * pitch
  // damping: wood's tan φ ≈ 0.02 gives T60 ≈ 110/f, but the recorded logs' modes (0.3–1.7 kHz) all
  // die in 70–500 ms, nearly whatever their frequency: T60 = ring·√(600/f)
  const ring = rnd(0.06, 0.16)
  const modes: { f: number; t60: number; a: number }[] = []
  const add = (f: number, ratios: number[], gains: number[]) =>
    ratios.forEach((r, i) => {
      const fm = f * r * rnd(0.97, 1.03)
      if (fm < sr * 0.45) modes.push({ f: fm, t60: Math.min(0.6, ring * Math.sqrt(600 / fm) * rnd(0.8, 1.2)), a: gains[i] * rnd(0.5, 1.5) })
    })
  add(f1, BEAM, [0.7, 1, 0.8, 0.5])
  add(f1 * rnd(1.2, 1.9), BEAM.slice(0, 3), [0.7, 0.6, 0.4])
  // strikes: the landing, then (dropper-like) one or two softer settling knocks, closer and closer together
  const hits = [{ at: 0, width: rnd(0.00015, 0.0005), gain: 1 }]
  for (let t = rnd(0.06, 0.22), gain = rnd(0.2, 0.45), i = 0; i < (Math.random() < 0.5 ? 1 : 2); i++) {
    hits.push({ at: t, width: rnd(0.0005, 0.0015), gain }) // softer: rolling onto embers
    t += rnd(0.03, 0.12)
    gain *= rnd(0.4, 0.8)
  }
  const wood = new Float32Array(n)
  const x = new Float32Array(n)
  for (const m of modes) {
    x.fill(0)
    for (const h of hits) {
      // raised cosine force F(t) = 1 − cos(2πt/T), unit area; each strike lands somewhere else on the log
      const w = Math.max(2, Math.round(h.width * sr))
      const s = Math.round(h.at * sr)
      const a = (h.gain * m.a * (h.at === 0 ? 1 : rnd(0.3, 1.5))) / w
      for (let i = 0; i < w && s + i < n; i++) x[s + i] += a * (1 - Math.cos((TAU * i) / w))
    }
    const res = mode(m.f, m.t60, sr)
    const end = Math.min(n, Math.round((hits[hits.length - 1].at + m.t60 * 1.5) * sr)) // to −90 dB
    for (let i = 0; i < end; i++) wood[i] += res(x[i])
  }
  // the knock: the many dense high modes and the bark and char breaking at the contact, heard as a
  // few ms of noise (bright for the landing, duller for the settling) before the low modes ring on
  for (const h of hits) {
    const s = Math.round(h.at * sr)
    const tau = sr * rnd(0.003, 0.007)
    const lp = lowpass((h.at === 0 ? rnd(2500, 5000) : rnd(1200, 2500)) * pitch, 0.7, sr)
    for (let i = 0; i < tau * 7 && s + i < n; i++) wood[s + i] += 12 * h.gain * lp(Math.random() * 2 - 1) * Math.exp(-i / tau) * Math.min(1, i / (sr * 0.0003))
  }
  normalise(wood)

  // ---- the bed: unpitched, a lowpassed noise knock (no sweep), for the main landing and the settle
  const thud = new Float32Array(n)
  for (const h of hits) {
    const lp = lowpass(rnd(150, 280) * pitch, 0.7, sr)
    const tau = rnd(0.015, 0.03) * size ** 0.5 * (h.at === 0 ? 1 : 0.6)
    const s = Math.round(h.at * sr)
    for (let i = 0; s + i < n && i < tau * sr * 7; i++)
      thud[s + i] += h.gain * lp(Math.random() * 2 - 1) * Math.min(1, i / (sr * 0.002)) * Math.exp(-i / sr / tau)
  }
  normalise(thud)

  // ---- embers and charcoal crunching under it (PhISEM): energy injected as it lands and settles
  const crunch = new Float32Array(n)
  const shakes = [{ at: 0.003, e: 1 }]
  for (let i = 0, m = 1 + Math.round(size * rnd(1, 2.5)); i < m; i++) shakes.push({ at: rnd(0.03, 0.5), e: rnd(0.3, 0.8) })
  for (const h of hits.slice(1)) shakes.push({ at: h.at, e: h.gain })
  phisem(crunch, sr, shakes, size, pitch)
  normalise(crunch)

  // ---- a soft breath of ash
  const puff = new Float32Array(n)
  {
    const fc = rnd(800, 1500) * pitch
    const c = Math.exp((-TAU * fc) / sr)
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
    normalise(puff)
  }

  const crunchGain = 10 ** (-5 / 20) * size ** 0.5
  for (let i = 0; i < n; i++) {
    const fade = Math.min(1, (n - 1 - i) / (sr * 0.05))
    d[i] = (wood[i] + 0.15 * thud[i] + crunchGain * crunch[i] + 0.12 * puff[i]) * fade
  }
  return buf
}

/**
 * Cook's PhISEM (STK Shakers): grains collide at random (probability N/1024 per 44.1 kHz sample),
 * each collision adding the current shake energy to a sound level that dies within a fraction of a
 * millisecond; the level rings a resonator and a first difference. Two of STK's presets share the
 * collisions: "crunch" (800 Hz) and "big rocks" (6.46 kHz, ±11 % per collision), each normalised
 * as its own instrument, big rocks 10 dB down. Constants are converted from STK's 44.1 kHz.
 */
function phisem(out: Float32Array, sr: number, shakes: { at: number; e: number }[], size: number, pitch: number) {
  const per = 44100 / sr
  const chance = (rnd(8, 16) * size ** 0.5 * per) / 1024
  const soundDecay = 0.95 ** per
  const systemDecay = Math.exp(-1 / (rnd(0.04, 0.08) * sr)) // ~40–80 ms per shake
  const coefs = (f: number, r: number) => [-2 * r * Math.cos((TAU * Math.min(sr * 0.45, f)) / sr), r * r]
  const [a1, a2] = coefs(800 * pitch, 0.95 ** per) // crunch
  const rocks = 0.932 ** per
  let [b1, b2] = coefs(6460 * pitch, rocks) // big rocks, retuned ±11 % at each collision
  const crunch = new Float32Array(out.length)
  const big = new Float32Array(out.length)
  const starts = shakes.map((s) => ({ i: Math.round(s.at * sr), e: s.e })).sort((a, b) => a.i - b.i)
  const end = Math.min(out.length, starts[starts.length - 1].i + Math.round(sr * 0.5))
  let energy = 0,
    level = 0,
    next = 0
  let y1 = 0,
    y2 = 0,
    z1 = 0,
    z2 = 0
  for (let i = 0; i < end; i++) {
    while (next < starts.length && starts[next].i <= i) energy += starts[next++].e
    energy *= systemDecay
    if (Math.random() < chance) {
      level += energy
      ;[b1, b2] = coefs(6460 * pitch * rnd(0.89, 1.11), rocks)
    }
    level *= soundDecay
    const y = level - a1 * y1 - a2 * y2
    crunch[i] = y - y1
    y2 = y1
    y1 = y
    const z = level - b1 * z1 - b2 * z2
    big[i] = z - z1
    z2 = z1
    z1 = z
  }
  normalise(crunch)
  normalise(big)
  for (let i = 0; i < end; i++) out[i] = crunch[i] + 0.3 * big[i]
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

function normalise(d: Float32Array) {
  let peak = 0
  for (const v of d) peak = Math.max(peak, Math.abs(v))
  if (peak > 0) for (let i = 0; i < d.length; i++) d[i] /= peak
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

/** RBJ lowpass biquad in plain JS. */
function lowpass(f: number, q: number, sr: number) {
  const w0 = (TAU * Math.min(f, sr * 0.45)) / sr
  const al = Math.sin(w0) / (2 * q)
  const cw = Math.cos(w0)
  const a0 = 1 + al
  const b0 = (1 - cw) / 2 / a0
  const b1 = (1 - cw) / a0
  const a1 = (-2 * cw) / a0
  const a2 = (1 - al) / a0
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0
  return (x: number) => {
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    return y
  }
}
