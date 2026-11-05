/**
 * Night wind in the trees around the clearing, after Farnell (Designing Sound, Practical 18,
 * wind4.pd) and measured against recordings (docs/research/wind-sound.md). One wind speed w (0..1)
 * drives everything: a base that follows the weather and drifts over minutes, Farnell's gust
 * (noise lowpassed twice at 0.5 Hz, deeper the stronger the base) and squall (3 Hz, only in
 * strong wind). Each layer reads w through its own delay (0-3 s), so a gust travels through
 * the trees instead of every tree moving at once:
 *
 * - the treetops: a soft roar that brightens as w rises (Farnell's rzero~ tilt), three of them
 *   panned wide around the clearing;
 * - leaf rustle: Farnell's thresholded noise, the spikes above a threshold that falls (so they
 *   get denser) as a smoothed w rises; two in the trees and a quieter, quicker one in the ferns
 *   and bushes close by.
 *
 * Levels, density and texture are tuned against recordings of night wind in trees, so the wind
 * sits under the fire, crickets and rain.
 *
 * w is computed in JS at a fixed control rate and the audio params follow it smoothly.
 */
import type { SoundTune } from './settings'

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
/** Control ticks per second for w and its history. */
const RATE = 50
/** History kept for the delayed reads (s); the longest delay is 3 s. */
const HISTORY = 4
/** w during an audition (a breezy night), so the ▶ example always has something to show. */
const AUDITION_WIND = 0.42

/** A unit Gaussian (Box-Muller). */
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())

/**
 * Noise lowpassed twice (two one-poles, a time constant `tau` each), scaled to unit standard
 * deviation. Stepped at RATE; the first stage is an exact Ornstein-Uhlenbeck step, so its
 * statistics don't depend on the tick.
 */
class SmoothNoise {
  private a: number
  private x = gauss()
  private y = this.x
  constructor(tau: number) {
    this.a = Math.exp(-1 / (RATE * tau))
  }
  step() {
    this.x = this.a * this.x + Math.sqrt(1 - this.a * this.a) * gauss()
    this.y = this.a * this.y + (1 - this.a) * this.x
    // a one-pole after a unit OU process keeps 1/(1+a)-ish of the variance: about 1/2 when slow
    return this.y * Math.SQRT2
  }
}

interface Treetop {
  delay: number
  gain: GainNode
  shelf: BiquadFilterNode
  tone: BiquadFilterNode
  level: number
}

interface Rustle {
  delay: number
  /** Time constant of the w that sets the spike density (s); Farnell's lop~ 0.07 is ~2.3 s. */
  settle: number
  /** Spike density (fraction of samples) at w = 0 and at w = 1, log-interpolated. */
  density: [number, number]
  level: number
  /** Top of the band (Hz) before the brightness control. */
  top: number
  offset: ConstantSourceNode
  gain: GainNode
  tone: BiquadFilterNode
  ws: number
}

export class WindInTrees {
  private ctx: BaseAudioContext
  private history = new Float32Array(HISTORY * RATE)
  private head = 0
  /** Time of the last control tick (s), -1 before the first update. */
  private clock = -1
  /** Time of the last update (s). */
  private last = 0
  /** The brightness the rustle bands were last set for. */
  private bright = 0
  private drift = new SmoothNoise(12)
  private sway = new SmoothNoise(3)
  private gust = new SmoothNoise(1 / (2 * Math.PI * 0.5))
  private squall = new SmoothNoise(1 / (2 * Math.PI * 3))
  private treetops: Treetop[] = []
  private rustles: Rustle[] = []
  /** Rustle noise thresholds by spike density, and the spikes' RMS there (for constant loudness). */
  private thresholds: { p: number; t: number; rms: number }[] = []

  constructor(ctx: BaseAudioContext, out: AudioNode) {
    this.ctx = ctx
    const pink = pinkBuffer(ctx, 8.3)
    const rustle = rustleBuffer(ctx, 9.7)
    this.thresholds = thresholdTable(rustle.getChannelData(0))
    // the treetops, around the clearing; the gust reaches the left side first
    for (const [delay, pan, rate, level] of [
      [0, -0.8, 1, 1],
      [1.2, 0.1, 0.985, 0.8],
      [3, 0.85, 1.013, 0.95],
    ]) {
      const hp = this.filter('highpass', 160, 0.6)
      const shelf = this.filter('lowshelf', 500, 0.7)
      const tone = this.filter('lowpass', 1000, 0.5)
      const gain = ctx.createGain()
      gain.gain.value = 0
      this.play(pink, rate, [hp, shelf, tone, gain, this.panner(pan)], out)
      this.treetops.push({ delay, gain, shelf, tone, level })
    }
    // leaf rustle: two in the trees, one in the undergrowth close by (quieter, quicker, brighter)
    for (const [delay, pan, rate, settle, lo, hi, level, hp, lp] of [
      [0.4, -0.55, 1, 2.3, 0.42, 0.75, 1, 200, 4000],
      [2.3, 0.6, 1.021, 2.3, 0.42, 0.75, 0.9, 200, 4000],
      [1.6, 0.25, 0.977, 0.6, 0.5, 0.85, 0.4, 600, 6500],
    ]) {
      const offset = ctx.createConstantSource()
      offset.offset.value = -1
      const relu = ctx.createWaveShaper()
      relu.curve = reluCurve()
      const gain = ctx.createGain()
      gain.gain.value = 0
      const tone = this.filter('lowpass', lp, 0.7)
      offset.connect(relu)
      offset.start()
      this.play(rustle, rate, [relu, gain, this.filter('highpass', hp, 0.7), tone, this.panner(pan)], out)
      this.rustles.push({ delay, settle, density: [lo, hi], level, top: lp, offset, gain, tone, ws: 0 })
    }
  }

  /** Follow the weather (call every frame). `held` > 0 while the editor auditions the wind. */
  update(now: number, cloud: number, rain: number, tune: SoundTune, held: number) {
    // calm on a clear night, stronger with cloud and rain
    const weather = Math.max(0.12 + 0.3 * cloud + 0.15 * rain, AUDITION_WIND * held)
    if (this.clock < 0 || now - this.clock > 1) {
      this.clock = now
      this.history.fill(this.speed(weather, tune.rate))
      this.rustles.forEach((r) => (r.ws = this.read(r.delay)))
      this.last = now
    }
    const dt = now - this.last
    this.last = now
    for (; this.clock + 1 / RATE <= now; this.clock += 1 / RATE) {
      this.head = (this.head + 1) % this.history.length
      this.history[this.head] = this.speed(weather, tune.rate)
    }
    // an audition brings every layer up at once, without waiting for the delays
    const floor = AUDITION_WIND * held * 0.85
    const bright = tune.pitch
    for (const t of this.treetops) {
      const w = Math.max(this.read(t.delay), floor)
      // amplitude ~ u^1.5 with u = w + 0.1 (Heutschi's vegetation noise); brighter as it blows
      // harder: the lows drop away (a shelf with the gain of Farnell's rzero~, at a gentler
      // coefficient 0.4(w+0.2) than his 0.6) and the top opens up
      const a = clamp(0.4 * (w + 0.2), 0, 0.99)
      t.gain.gain.setTargetAtTime(0.155 * t.level * ((w + 0.1) / 0.6) ** 1.5, now, 0.1)
      t.shelf.gain.setTargetAtTime(20 * Math.log10((1 - a) / (1 + a)), now, 0.1)
      t.tone.frequency.setTargetAtTime(clamp((600 + 1500 * w) * bright, 200, 16000), now, 0.1)
    }
    for (const r of this.rustles) {
      const w = Math.max(this.read(r.delay), floor)
      r.ws += (w - r.ws) * (1 - Math.exp(-dt / r.settle))
      const ws = Math.max(r.ws, floor)
      const [lo, hi] = r.density
      const { t, rms } = this.threshold(lo * (hi / lo) ** ws)
      r.offset.offset.setTargetAtTime(-t, now, 0.1)
      r.gain.gain.setTargetAtTime((0.0225 * r.level * ((w + 0.1) / 0.6) ** 2) / rms, now, 0.1)
      if (bright !== this.bright) r.tone.frequency.setTargetAtTime(clamp(r.top * bright, 200, 16000), now, 0.3)
    }
    this.bright = bright
  }

  /** One control tick: base (weather and a drift over minutes) + gust + squall, after Farnell. */
  private speed(weather: number, gustiness: number) {
    // the drift is relative to the speed the layers hear (w + 0.1): turbulence grows with the mean
    // wind, so a calm night stays calm and a storm isn't a gale
    const base = (weather + 0.1) * Math.exp(gustiness * (0.14 * this.drift.step() + 0.14 * this.sway.step())) - 0.1
    const gust = 0.13 * gustiness * ((base + 0.5) ** 2 - 0.125) * this.gust.step()
    const squall = 0.03 * gustiness * (8 * clamp(base - 0.4, 0, 0.2)) ** 2 * this.squall.step()
    return clamp(base + gust + squall)
  }

  /** w `delay` seconds ago. */
  private read(delay: number) {
    const n = this.history.length
    const back = delay * RATE
    const i = Math.floor(back)
    const f = back - i
    const a = this.history[(this.head - i + n) % n]
    const b = this.history[(this.head - i - 1 + n) % n]
    return a + (b - a) * f
  }

  /** The threshold giving this spike density, interpolated from the table. */
  private threshold(p: number) {
    const T = this.thresholds
    let i = 0
    while (i < T.length - 2 && T[i + 1].p < p) i++
    const f = clamp(Math.log(p / T[i].p) / Math.log(T[i + 1].p / T[i].p))
    return { t: T[i].t + (T[i + 1].t - T[i].t) * f, rms: T[i].rms + (T[i + 1].rms - T[i].rms) * f }
  }

  private filter(type: BiquadFilterType, f: number, q: number) {
    const n = this.ctx.createBiquadFilter()
    n.type = type
    n.frequency.value = f
    n.Q.value = q
    return n
  }

  private panner(pan: number) {
    const p = this.ctx.createStereoPanner()
    p.pan.value = pan
    return p
  }

  /**
   * Loop `buf` into a chain as two sources at half amplitude: the whole buffer, and its first 71 %
   * a little faster. Their sum only repeats after minutes, so the texture never audibly loops.
   */
  private play(buf: AudioBuffer, rate: number, chain: AudioNode[], out: AudioNode) {
    const mix = this.ctx.createGain()
    mix.gain.value = 0.5
    for (const [end, r] of [
      [buf.duration, rate],
      [buf.duration * 0.71, rate * 1.007],
    ]) {
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.loopEnd = end
      src.playbackRate.value = r
      src.connect(mix)
      src.start(0, Math.random() * end)
    }
    let node: AudioNode = mix
    for (const c of chain) node = node.connect(c)
    node.connect(out)
  }
}

/** y = max(x, 0), for Farnell's (max(n, t) - t) spikes: noise plus a -t offset, rectified. */
function reluCurve() {
  const n = 1025
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) c[i] = Math.max(0, (i / (n - 1)) * 2 - 1)
  return c
}

/** Pink noise (Paul Kellet's filter) for the treetops. */
function pinkBuffer(ctx: BaseAudioContext, seconds: number) {
  const buf = ctx.createBuffer(1, Math.round(seconds * ctx.sampleRate), ctx.sampleRate)
  const d = buf.getChannelData(0)
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
  return buf
}

/**
 * The noise the leaves are cut from: white noise whose level wanders every few ms (log-normal),
 * so the spikes above a threshold come in little clusters, like leaves ticking against each
 * other, not as an even hiss. Peak-normalised to the WaveShaper's ±1.
 */
function rustleBuffer(ctx: BaseAudioContext, seconds: number) {
  const sr = ctx.sampleRate
  const buf = ctx.createBuffer(1, Math.round(seconds * sr), sr)
  const d = buf.getChannelData(0)
  const a = Math.exp(-1 / (sr * 0.008))
  const k = Math.sqrt(1 - a * a)
  let z = 0
  let peak = 0
  for (let i = 0; i < d.length; i++) {
    z = a * z + k * gauss()
    d[i] = (Math.random() * 2 - 1) * Math.exp(0.35 * z)
    peak = Math.max(peak, Math.abs(d[i]))
  }
  for (let i = 0; i < d.length; i++) d[i] /= peak
  return buf
}

/**
 * For spike densities from 1 in 50 samples to 9 in 10: the threshold, and the spikes' RMS, for
 * the noise play() makes of the buffer (two unrelated points of it, at half amplitude each).
 */
function thresholdTable(d: Float32Array) {
  const s: number[] = []
  for (let i = 0; i < 100000; i++) s.push(0.5 * (d[(Math.random() * d.length) | 0] + d[(Math.random() * d.length) | 0]))
  s.sort((a, b) => b - a)
  const out: { p: number; t: number; rms: number }[] = []
  for (let p = 0.02; p < 0.9; p *= 1.25) {
    const t = s[Math.floor(p * s.length)]
    let e = 0
    for (let i = 0; s[i] > t; i++) e += (s[i] - t) ** 2
    out.push({ p, t, rms: Math.sqrt(e / s.length) })
  }
  return out
}
