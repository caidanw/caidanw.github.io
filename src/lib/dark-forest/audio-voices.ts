/**
 * Procedural calls and wood friction, compared with identified recordings rather than
 * generic pitch glides. No recording data is embedded. See docs/research/dark-forest-audio.md.
 * Short variant banks are generated once; the soundscape places them in the scene.
 */
export type VoiceKey = 'frog' | 'owl' | 'crow' | 'door'
export type VoiceBank = Record<VoiceKey, AudioBuffer[]>
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const TAU = Math.PI * 2

export function buildVoices(ctx: BaseAudioContext): VoiceBank {
  return {
    frog: Array.from({ length: 12 }, () => frog(ctx)),
    owl: Array.from({ length: 6 }, () => owl(ctx)),
    crow: Array.from({ length: 12 }, () => crow(ctx)),
    door: Array.from({ length: 10 }, () => door(ctx)),
  }
}

/** Smooth onset, sustained middle and rounded release (not a plucked, exponential beep). */
function envelope(t: number, duration: number, attack: number, release: number) {
  if (t <= 0 || t >= duration) return 0
  return Math.sin(Math.min(1, t / attack) * Math.PI * 0.5) ** 2 * Math.sin(Math.min(1, (duration - t) / release) * Math.PI * 0.5) ** 2
}

/** Render at native sample rate, remove DC, normalise the whole call, taper both boundaries. */
function render(ctx: BaseAudioContext, seconds: number, sample: (t: number) => number): AudioBuffer {
  const sr = ctx.sampleRate
  const buf = ctx.createBuffer(1, Math.ceil(seconds * sr), sr)
  const d = buf.getChannelData(0)
  const dc = Math.exp((-TAU * 30) / sr)
  let mean = 0
  let peak = 0
  for (let i = 0; i < d.length; i++) {
    const x = sample(i / sr)
    mean = dc * mean + (1 - dc) * x
    const fade = Math.min(1, i / (sr * 0.003), (d.length - 1 - i) / (sr * 0.008))
    d[i] = (x - mean) * fade
    peak = Math.max(peak, Math.abs(d[i]))
  }
  for (let i = 0; i < d.length; i++) d[i] /= Math.max(peak, 0.001)
  return buf
}

/**
 * Solo Pacific chorus-frog reference: ~0.2–0.3 s croaks, pulse structure around 60–70 Hz,
 * strong bands near 1.1 and 2.4 kHz. Separate damp throat modes give it a croak, rather
 * than square-gating a low sawtooth. The tiny scene frog is not assigned a biological ID.
 */
function frog(ctx: BaseAudioContext) {
  const duration = rnd(0.23, 0.29)
  const rate = rnd(59, 68)
  const low = rnd(1050, 1180)
  const high = rnd(2280, 2460)
  const phase = rnd(0, TAU)
  let next = 0.012
  const pulses: { at: number; gain: number }[] = []
  while (next < duration - 0.012) {
    pulses.push({ at: next, gain: rnd(0.7, 1) })
    next += rnd(0.92, 1.08) / rate
  }
  return render(ctx, duration + 0.045, (t) => {
    let call = 0
    for (const p of pulses) {
      const age = t - p.at
      if (age <= 0 || age > 0.04) continue
      const attack = 1 - Math.exp(-age / 0.00045)
      const bend = 1 + 0.025 * Math.sin(TAU * 4 * t + phase)
      const throat = Math.sin(TAU * low * bend * age) * Math.exp(-age / 0.006)
      const sac = Math.sin(TAU * high * bend * age + 0.2) * Math.exp(-age / 0.0045)
      call += (0.55 * throat + sac) * attack * p.gain
    }
    // A short swelling syllable with a slightly weaker second half.
    return (
      call * envelope(t, duration, 0.025, 0.045) * (0.85 + 0.15 * Math.cos((TAU * t) / duration)) +
      (Math.random() * 2 - 1) * 0.006 * envelope(t, duration, 0.03, 0.04)
    )
  })
}

/**
 * Male tawny-style phrase from the reference: one rounded hoot, several seconds' pause,
 * a short pickup, then the longer quavering response. Breath and a weak second harmonic
 * keep it from sounding like three pure descending whistles.
 */
function owl(ctx: BaseAudioContext) {
  const sr = ctx.sampleRate
  const size = rnd(0.96, 1.04)
  const gap = rnd(4.55, 4.9)
  const notes = [
    { at: 0.02, len: rnd(0.8, 0.94), gain: 0.85, answer: false },
    { at: gap, len: rnd(0.11, 0.16), gain: 0.3, answer: false },
    { at: gap + rnd(0.65, 0.83), len: rnd(1.05, 1.22), gain: 1, answer: true },
  ].map((n) => ({ ...n, phase: 0 }))
  const noise = bandpass(900 * size, 0.8, sr)
  const wobble = rnd(8, 11)
  return render(ctx, 7.2, (t) => {
    let sum = 0
    for (const n of notes) {
      const age = t - n.at
      if (age <= 0 || age >= n.len) continue
      const u = age / n.len
      let hz = n.answer ? 760 + 110 * Math.sin(Math.PI * u) - 120 * u ** 5 : 740 + 175 * (1 - Math.exp(-u * 18)) - 300 * u ** 5
      hz += (n.answer ? 22 : 6) * Math.sin(TAU * wobble * age + 0.6 * Math.sin(TAU * 2.3 * age))
      n.phase += (TAU * hz * size) / sr
      const quaver = n.answer ? 0.78 + 0.22 * Math.sin(TAU * wobble * age) : 0.94 + 0.06 * Math.sin(TAU * 7 * age)
      const tone = Math.sin(n.phase) + 0.055 * Math.sin(2 * n.phase + 0.2)
      const breath = noise(Math.random() * 2 - 1) * 0.04
      sum += (tone * quaver + breath) * envelope(age, n.len, Math.min(0.09, n.len * 0.3), Math.min(0.19, n.len * 0.4)) * n.gain
    }
    return sum
  })
}

/**
 * Crow pulse register: short pressure openings in groups of two or three, with longer
 * closures between groups, exciting a damp tract resonance. This creates the rattling
 * interior of a caw at the source, rather than adding vibrato to a smooth sung vowel.
 * Physically informed, not a full syrinx simulation (research notes cite the observations).
 */
function crow(ctx: BaseAudioContext) {
  const sr = ctx.sampleRate
  const duration = rnd(0.46, 0.59)
  const interval = 1 / rnd(300, 340)
  const pulses: { at: number; width: number; gain: number }[] = []
  let at = 0.008
  while (at < duration - 0.02) {
    const count = Math.random() < 0.7 ? 3 : 2
    const groupGain = rnd(0.8, 1)
    for (let i = 0; i < count; i++) {
      pulses.push({ at, width: rnd(0.0005, 0.0008), gain: groupGain * (i === 1 ? rnd(0.6, 0.8) : rnd(0.85, 1)) })
      at += interval * rnd(0.94, 1.06)
    }
    at += rnd(0.003, 0.005) // a missing opening: the longer closure makes the group audible
  }
  const chest = bandpass(rnd(700, 950), 1.3, sr)
  const tract = bandpass(rnd(1550, 1750), rnd(9, 12), sr)
  const upper = bandpass(rnd(2600, 2900), 4, sr)
  const burst = bandpass(rnd(2800, 3600), 0.85, sr)
  const air = bandpass(2300, 0.7, sr)
  const rounding = Math.exp((-TAU * 3900) / sr)
  let rounded = 0
  let index = 0
  return render(ctx, duration + 0.045, (t) => {
    while (index + 1 < pulses.length && pulses[index + 1].at <= t) index++
    const p = pulses[index]
    const age = t - p.at
    // Smooth both edges of each opening; the previous hard truncation sounded crushed.
    const close = Math.min(1, Math.max(0, (p.width - age) / 0.00015))
    const pressure = age > 0 && age < p.width ? (1 - Math.exp(-age / 0.0001)) * Math.exp(-age / (p.width * 0.32)) * close * p.gain : 0
    const voice = chest(pressure) * 0.8 + tract(pressure) * 3.2 + upper(pressure) * 1.5 + pressure * 0.025
    const breath = air(Math.random() * 2 - 1) * 0.015
    rounded = rounding * rounded + (1 - rounding) * (voice + breath)
    const body = rounded * envelope(t - 0.006, duration - 0.006, 0.045, 0.018)
    const ka = burst(Math.random() * 2 - 1) * 0.17 * envelope(t, 0.048, 0.014, 0.025)
    return ka + body
  })
}

/**
 * Force → near-periodic stick/slip releases → material modes → panel reflections.
 * The source becomes a pitched creak as releases bunch together, not random gravel
 * and not a drawn audio-frequency whistle. Motion rate is separate from pressure: a
 * slow, continuous pull can speed up and strain without becoming two gated bass blips.
 * This event model is lighter than an elasto-plastic contact solver.
 */
function door(ctx: BaseAudioContext) {
  const sr = ctx.sampleRate
  const duration = rnd(2.8, 3.3)
  const size = rnd(0.94, 1.06)
  const wood = [175, 370, 620, 910, 1350].map((f, i) => bandpass(f * size, 2 + i * 0.5, sr))
  const woodGains = [0.08, 0.14, 0.2, 0.3, 0.38]
  const hinge = [bandpass(1850 * size, 9, sr), bandpass(3400 * size, 11, sr)]
  const panel = [4.7, 6.4, 8.3, 11.7].map((ms) => reflection(ms, sr))
  const force: [number, number][] = [
    [0, 0],
    [0.06, 0.22],
    [0.16, 0.72],
    [0.3, 0.66],
    [0.39, 0.35],
    [0.5, 0.58],
    [0.67, 0.63],
    [0.83, 0.46],
    [0.94, 0.2],
    [1, 0],
  ]
  const rate: [number, number][] = [
    [0, 70],
    [0.09, 160],
    [0.23, 620],
    [0.34, 470],
    [0.42, 210],
    [0.56, 560],
    [0.7, 410],
    [0.84, 240],
    [0.96, 85],
    [1, 45],
  ]
  const smoothing = Math.exp(-1 / (sr * 0.025))
  let pressure = 0
  let clock = 0
  let lastSlip = 0
  let slipAge = 1
  let slipLife = 0.003
  let slipGain = 0
  let irregularity = 1
  let target = 1
  let nextTarget = 0
  const wobbleSmoothing = Math.exp(-1 / (sr * 0.012))
  return render(ctx, duration + 0.12, (t) => {
    const u = Math.min(1, t / duration)
    pressure = smoothing * pressure + (1 - smoothing) * contour(u, force)
    if (t >= nextTarget) {
      target = rnd(0.94, 1.06)
      nextTarget = t + rnd(0.035, 0.07)
    }
    irregularity = wobbleSmoothing * irregularity + (1 - wobbleSmoothing) * target
    const slipRate = contour(u, rate) * irregularity
    if (pressure > 0.08) {
      clock += slipRate / sr
      if (clock >= 1) {
        clock -= 1
        // Force accumulated while stuck: longer waits produce larger, longer releases.
        slipGain = Math.min(0.4, Math.sqrt(Math.min(1, (t - lastSlip) / 0.08))) * Math.sqrt(pressure)
        slipLife = Math.min(0.001 + 0.003 * Math.sqrt(slipGain), 0.72 / slipRate)
        lastSlip = t
        slipAge = 0
      }
    } else clock = 0
    const pulse = slipAge < slipLife ? slipGain * (1 - slipAge / slipLife) ** 2 * Math.min(1, (slipAge * sr) / 3) : 0
    slipAge += 1 / sr
    let body = 0
    for (let i = 0; i < wood.length; i++) body += wood[i](pulse) * woodGains[i]
    const edge = hinge[0](pulse) * 2.4 + hinge[1](pulse) * 1.5
    const material = body + edge + pulse * 0.04
    let reflected = 0
    for (const delay of panel) reflected += delay(material)
    return (material * 0.7 + reflected * 0.16) * envelope(t, duration + 0.1, 0.02, 0.15)
  })
}

/** Short, damp panel reflection, not a room/cave reverb. */
function reflection(ms: number, sr: number) {
  const samples = new Float32Array(Math.round((ms * sr) / 1000))
  let at = 0
  return (x: number) => {
    const y = samples[at]
    samples[at] = x + y * 0.08
    at = (at + 1) % samples.length
    return y
  }
}

/** Piecewise motion/pressure: a catch is a real pause, not a smooth singing vibrato. */
function contour(u: number, points: readonly [number, number][]) {
  for (let i = 1; i < points.length; i++) {
    const [end, value] = points[i]
    if (u > end) continue
    const [start, previous] = points[i - 1]
    const t = Math.max(0, (u - start) / (end - start))
    return previous + (value - previous) * t
  }
  return points[points.length - 1][1]
}

/** Constant-peak RBJ bandpass, used as a material/throat band rather than a pitched voice. */
function bandpass(hz: number, q: number, sr: number) {
  const w = (TAU * hz) / sr
  const a = Math.sin(w) / (2 * q)
  const a0 = 1 + a
  const a1 = -2 * Math.cos(w)
  const a2 = 1 - a
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0
  return (x: number) => {
    const y = (a * (x - x2) - a1 * y1 - a2 * y2) / a0
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    return y
  }
}
