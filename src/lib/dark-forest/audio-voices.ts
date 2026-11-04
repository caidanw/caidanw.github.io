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
 * Crow: a rough harmonic voice, strongest around the throat bands at ~1.1/1.8/2.6 kHz.
 * Pressure rises into a held, ragged caw, then falls. Frequency jitter, breath and changing
 * harmonic balance are deliberate; this is not a clean sawtooth swept through one filter.
 */
function crow(ctx: BaseAudioContext) {
  const sr = ctx.sampleRate
  const duration = rnd(0.46, 0.7)
  const base = rnd(335, 365)
  const roughRate = rnd(65, 85)
  const air = bandpass(1900, 0.8, sr)
  const jitterDecay = Math.exp((-TAU * 100) / sr)
  let jitter = 0
  let phase = 0
  return render(ctx, duration + 0.035, (t) => {
    const u = Math.min(1, t / duration)
    jitter = jitterDecay * jitter + (1 - jitterDecay) * (Math.random() * 2 - 1)
    const hz = base * (0.88 + 0.21 * Math.sin(Math.PI * u) - 0.12 * u ** 4 + jitter * 0.7)
    phase += (TAU * hz) / sr
    let voice = 0
    for (let h = 1; h <= 12; h++) {
      const f = hz * h
      const throat = Math.exp(-0.5 * ((f - 1850) / 370) ** 2)
      const lower = 0.3 * Math.exp(-0.5 * ((f - 1050) / 240) ** 2)
      const upper = 0.18 * Math.exp(-0.5 * ((f - 2650) / 380) ** 2)
      voice += (Math.sin(h * phase + h * 0.14) * (throat + lower + upper)) / Math.sqrt(h)
    }
    const rasp = 0.7 + 0.3 * Math.sin(TAU * roughRate * t + 0.4 * Math.sin(TAU * 11 * t)) ** 2
    return (voice * rasp + air(Math.random() * 2 - 1) * 0.11) * envelope(t, duration, 0.055, 0.14)
  })
}

/**
 * A small wooden door: irregular stick-slip impulses excite damp wood modes; a short,
 * noisy hinge rub rides above them. Inspired by Farnell's force → stick-slip → panel
 * model, not by bending a triangle oscillator into a beep. No horror-door reverb or slam.
 */
function door(ctx: BaseAudioContext) {
  const sr = ctx.sampleRate
  const duration = rnd(0.85, 1.25)
  const wood = [125, 250, 395, 560, 790].map((f) => bandpass(f * rnd(0.95, 1.05), 3, sr))
  const hinge = bandpass(rnd(3200, 4600), rnd(8, 14), sr)
  let nextSlip = 0.025
  let slipAge = 1
  let slipLength = 0.002
  let slipGain = 0
  let force = 0
  const forceDecay = Math.exp(-1 / (sr * 0.007))
  return render(ctx, duration + 0.12, (t) => {
    const u = Math.min(1, t / duration)
    const speed = Math.sin(Math.PI * u) ** 0.7
    if (t < duration && t >= nextSlip) {
      slipAge = 0
      slipLength = rnd(0.001, 0.004)
      slipGain = rnd(0.4, 1) * (0.3 + 0.7 * speed)
      // It sticks briefly then slips again; the uneven gaps are the friction cue.
      nextSlip = t + rnd(0.003, 0.012) + (1 - speed) * rnd(0.012, 0.045)
    }
    const pulse = slipAge < slipLength ? (1 - slipAge / slipLength) ** 2 * slipGain : 0
    slipAge += 1 / sr
    force = forceDecay * force + (1 - forceDecay) * pulse
    let panel = 0
    for (const mode of wood) panel += mode(pulse)
    const rub = hinge((Math.random() * 2 - 1) * Math.min(1, force * 8))
    const roughEnvelope = 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, u * 2.4)) ** 2
    return (panel * 0.16 + rub * 3 * roughEnvelope) * envelope(t, duration + 0.1, 0.035, 0.18)
  })
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
