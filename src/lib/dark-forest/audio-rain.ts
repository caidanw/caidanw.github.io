/**
 * Rain materials, generated once (no recordings). References and measurement caveats:
 * docs/research/dark-forest-audio.md. A wash of many unresolved impacts, with a few close
 * leaf/pool drops on top. Rounded contacts and damp noise tails, not fire-like clicks.
 */
const rnd = (a: number, b: number) => a + Math.random() * (b - a)

/** A diffuse wash: near-Gaussian white noise, lightly coloured by foliage, with granular variance. */
export function rainWash(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate
  const buf = ctx.createBuffer(1, Math.round(seconds * sr), sr)
  const d = buf.getChannelData(0)
  const decay = Math.exp(-1 / (sr * 0.003))
  const low = Math.exp((-2 * Math.PI * 650) / sr)
  let activity = 0.9
  let body = 0
  for (let i = 0; i < d.length; i++) {
    // Many distant impacts overlap: their short envelopes roughen the wash, without any
    // regular flutter or audible pitched pulse train. Four uniforms approximate a Gaussian.
    if (Math.random() < 650 / sr) activity += rnd(0.1, 0.8)
    activity *= decay
    const white = (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 0.866
    body = low * body + (1 - low) * white
    d[i] = (white * 0.95 + body * 0.15) * (0.35 + activity * 0.65)
  }
  return buf
}

export interface RainDrops {
  leaves: AudioBuffer[]
  water: AudioBuffer[]
}

/** Nearby drops: soft leaf taps with splash tails; a small minority on the pool. */
export function rainDrops(ctx: BaseAudioContext): RainDrops {
  return {
    leaves: Array.from({ length: 64 }, () => drop(ctx, false)),
    water: Array.from({ length: 16 }, () => drop(ctx, true)),
  }
}

function drop(ctx: BaseAudioContext, water: boolean): AudioBuffer {
  const sr = ctx.sampleRate
  const contact = rnd(0.0005, 0.0025)
  const tail = water ? rnd(0.006, 0.02) : rnd(0.006, 0.025)
  const len = Math.round((tail * 6 + 0.008) * sr)
  const buf = ctx.createBuffer(1, len, sr)
  const d = buf.getChannelData(0)
  const body = bandpass(rnd(350, 1400), rnd(0.65, 1.5), sr)
  const spray = bandpass(rnd(1200, 4200), rnd(0.8, 1.6), sr)
  const bodyGain = water ? 0.12 : rnd(0.08, 0.25)
  const splashGain = rnd(0.25, 0.65)
  const bubbleHz = rnd(1100, 2600)
  const bubbleTau = rnd(0.004, 0.012)
  let phase = 0
  let peak = 0
  for (let i = 0; i < len; i++) {
    const t = i / sr
    // A parabolic pressure pulse for the contact (Farnell's pulse model), exciting a
    // broad leaf/body band. Fade the noise in too, rather than starting with a digital click.
    const u = Math.min(1, t / contact)
    const hit = 4 * u * (1 - u)
    const w = Math.random() * 2 - 1
    const attack = 1 - Math.exp(-t / 0.0007)
    const splash = spray(w) * splashGain * attack * Math.exp(-t / tail)
    const leaf = body(hit * 1.5 + w * 0.3 * attack * Math.exp(-t / (tail * 0.5))) * bodyGain
    // A little entrained-bubble tail on pool drops, not on every drop (no glassy chimes).
    let bubble = 0
    if (water && t > 0.003) {
      const age = t - 0.003
      phase += (2 * Math.PI * bubbleHz * (1 + 0.18 * (1 - Math.exp(-age / 0.008)))) / sr
      bubble = Math.sin(phase) * 0.09 * (1 - Math.exp(-age / 0.001)) * Math.exp(-age / bubbleTau)
    }
    d[i] = (leaf + splash + bubble) * Math.min(1, (len - 1 - i) / (sr * 0.002))
    peak = Math.max(peak, Math.abs(d[i]))
  }
  // Comparable peak scale across materials; variation in distance/size comes at playback.
  for (let i = 0; i < len; i++) d[i] /= Math.max(peak, 0.01)
  return buf
}

/** RBJ constant-peak bandpass: wide, damp material bands, never ringing resonators. */
function bandpass(hz: number, q: number, sr: number) {
  const w = (2 * Math.PI * hz) / sr
  const alpha = Math.sin(w) / (2 * q)
  const a0 = 1 + alpha
  const a1 = -2 * Math.cos(w)
  const a2 = 1 - alpha
  let x2 = 0
  let x1 = 0
  let y2 = 0
  let y1 = 0
  return (x: number) => {
    const y = (alpha * (x - x2) - a1 * y1 - a2 * y2) / a0
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    return y
  }
}
