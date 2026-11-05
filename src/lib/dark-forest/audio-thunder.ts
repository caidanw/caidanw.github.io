/**
 * The crack of a close lightning strike, as a train of sharp pressure shocks rather than
 * band-passed noise (docs/research/thunder-crackle.md). Each kink of the tortuous channel sends
 * out one N-wave of about a millisecond; the nearest parts arrive first and pile up into the
 * clap, then the arrivals thin out into a ripping, tearing sequence, and the flash's repeat
 * strokes down the same channel repeat it 20–150 ms apart. The shocks are added over a quiet,
 * continuous tear bed (never gated out of one), so the band never empties.
 *
 * Two models, picked at random per strike (the operator liked both; B more):
 * - 'pattern': Farnell's strike pattern (Designing Sound, Practical 17): ~20 events in ~1 s whose
 *   gaps grow from ~1 to ~100 ms; each event fires a few N-waves, early ones short, bright and
 *   clustered, later ones longer and weaker;
 * - 'channel': a random lightning channel (5–70 m steps, ~16° kinks, 3 m pieces), its
 *   arrival times, kink-weighted amplitudes, pulse lengths and pans from the geometry.
 *
 * Rendered into one stereo buffer per strike (a few ms of work), at the moment of the flash.
 */
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const TAU = Math.PI * 2
/** Speed of sound (m/s). */
const C = 343

export type CrackModel = 'pattern' | 'channel'

interface Shock {
  /** Arrival (s from the first). */
  at: number
  /** Length of the N-wave's linear fall (s). */
  len: number
  amp: number
  pan: number
}

/** A close strike's crack at `distance` km, its pan centred on `pan`; returns a stereo buffer starting at the first arrival. */
export function thunderCrack(
  ctx: BaseAudioContext,
  distance: number,
  pan: number,
  model: CrackModel = Math.random() < 2 / 3 ? 'channel' : 'pattern',
): AudioBuffer {
  const sr = ctx.sampleRate
  const seconds = 1.8
  const buf = ctx.createBuffer(2, Math.ceil(seconds * sr), sr)
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)
  const n = L.length
  const shocks = model === 'pattern' ? pattern(pan) : channel(distance * 1000, pan)
  // the flash's repeat strokes down the same channel: the same shocks again, a little shuffled
  const strokes = 1 + ((Math.random() * 4) | 0)
  const all: Shock[] = [...shocks]
  for (let s = 1, delay = 0, gain = 1; s < strokes; s++) {
    delay += rnd(0.02, 0.15)
    gain *= rnd(0.5, 1)
    for (const k of shocks) all.push({ ...k, at: k.at + delay + (Math.random() < 0.25 ? rnd(-0.004, 0.004) : 0), amp: k.amp * gain * rnd(0.8, 1.2) })
  }
  let peak = 0
  for (const k of all) peak = Math.max(peak, k.amp)
  for (const k of all) nwave(L, R, sr, k.at + 0.002, k.len, k.amp / peak, k.pan)
  // the tear bed: band-passed noise, continuous for about a second, well under the shocks
  const bed = bandpass(rnd(700, 1400), 1.2, sr)
  const tau = rnd(0.3, 0.5)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const v = bed(Math.random() * 2 - 1) * 0.2 * Math.min(1, t / 0.01) * Math.exp(-t / tau)
    L[i] += v * Math.sqrt(0.5 - 0.5 * pan)
    R[i] += v * Math.sqrt(0.5 + 0.5 * pan)
  }
  // a little asymmetric soft clipping for weight (Brookes' waveshaper), then a fade at the end
  let top = 0
  for (let i = 0; i < n; i++) top = Math.max(top, Math.abs(L[i]), Math.abs(R[i]))
  const drive = 2
  // the pattern fires many strong shocks; bring it to about the same crack energy as the channel
  const level = model === 'pattern' ? 0.5 : 0.55
  const fade = Math.round(sr * 0.3)
  for (const d of [L, R]) for (let i = 0; i < n; i++) d[i] = ((level * shape((d[i] / top) * drive)) / shape(drive)) * Math.min(1, (n - 1 - i) / fade)
  return buf
}

/** Farnell's strike pattern: gaps growing ~1 → 100 ms; early events short and bright, later long and dark. */
function pattern(pan: number): Shock[] {
  const out: Shock[] = []
  for (let x = 1, t = 0; x < 100; x += rnd(0, 9.9)) {
    const a = (100 - x) / 100
    t += x / 1000
    // early: a cluster of sharp shocks; later: fewer, longer, weaker ones
    for (let j = 0, m = 1 + Math.round(3 * a * Math.random()); j < m; j++)
      out.push({ at: t + rnd(0, 0.006), len: (0.5 + 2.5 * (1 - a)) * rnd(0.7, 1.3) * 0.001, amp: (0.2 + a) * heavy(), pan: clamp(pan + rnd(-0.3, 0.3), -1, 1) })
  }
  return out
}

/**
 * A random channel: ground up to ~1.5 km in 5–70 m steps with ~16° kinks, cut into ~3 m pieces
 * that wiggle slightly. Each vertex sends an N-wave weighted by how sharply the channel turns there
 * and how long its pieces are, falling with distance (Saksela's A ∝ length/r; Glassner: straight
 * runs cancel, kinks radiate); pulses stretch with distance (Ribner–Roy). Listener `d` m away.
 */
function channel(d: number, pan: number): Shock[] {
  const azimuth = rnd(0, TAU)
  const lx = d * Math.cos(azimuth)
  const ly = d * Math.sin(azimuth)
  // the step directions: mostly up, wandering by ~16° per step
  const pts: number[][] = [[0, 0, 0]]
  /** Whether each point ends a step (a real kink) rather than a piece of one. */
  const step: boolean[] = [true]
  let dir = [0, 0, 1]
  for (let z = 0; z < 1500;) {
    const len = rnd(5, 70)
    const turn = (rnd(8, 24) * Math.PI) / 180
    const spin = rnd(0, TAU)
    // tilt the direction by `turn`, keeping it pointing upward
    const ux = dir[0] + Math.sin(turn) * Math.cos(spin)
    const uy = dir[1] + Math.sin(turn) * Math.sin(spin)
    const uz = Math.max(0.3, dir[2] * Math.cos(turn))
    const m = Math.hypot(ux, uy, uz)
    dir = [ux / m, uy / m, uz / m]
    const [px, py, pz] = pts[pts.length - 1]
    const pieces = Math.max(1, Math.round(len / 3))
    for (let i = 1; i <= pieces; i++) {
      const f = i / pieces
      const j = i < pieces ? 0.08 : 0 // a slight wiggle: the strong shocks come from the steps' kinks
      pts.push([px + dir[0] * len * f + rnd(-j, j), py + dir[1] * len * f + rnd(-j, j), pz + dir[2] * len * f + rnd(-j, j)])
      step.push(i === pieces)
    }
    z = pts[pts.length - 1][2]
  }
  const out: Shock[] = []
  let first = Infinity
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
    const lu = Math.hypot(u[0], u[1], u[2])
    const lv = Math.hypot(v[0], v[1], v[2])
    const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv)
    const kink = Math.sqrt(Math.max(0, 1 - cos * cos)) // sin of the turn
    const r = Math.hypot(b[0] - lx, b[1] - ly, b[2])
    first = Math.min(first, r / C)
    const k = Math.log(100) / Math.log(Math.max(20, r) / 10) // Ribner–Roy stretch (1 at 1 km)
    // across the listener's view: where this bit of channel is, left or right
    const across = (-(b[0] - lx) * Math.sin(azimuth) + (b[1] - ly) * Math.cos(azimuth)) / r
    out.push({
      at: r / C,
      len: 0.0012 * Math.sqrt(k) * rnd(0.7, 1.3),
      amp: step[i] ? ((kink * (lu + lv)) / r) * heavy() : (0.01 * (lu + lv)) / r,
      pan: clamp(pan + 1.5 * across + rnd(-0.1, 0.1), -1, 1),
    })
  }
  return out.map((s) => ({ ...s, at: s.at - first })).filter((s) => s.at < 1.4)
}

/** Add an N-wave: a quick rise to +1, a linear fall to −1 over `len`, a quick return; equal-power pan. */
function nwave(L: Float32Array, R: Float32Array, sr: number, at: number, len: number, amp: number, pan: number) {
  const rise = Math.max(2, Math.round(sr * rnd(0.0001, 0.0003)))
  const fall = Math.max(2, Math.round(sr * len))
  const back = Math.max(2, Math.round(sr * rnd(0.0003, 0.0008)))
  const s = Math.round(at * sr)
  const gl = amp * Math.sqrt(0.5 - 0.5 * pan)
  const gr = amp * Math.sqrt(0.5 + 0.5 * pan)
  for (let i = 0; i < rise + fall + back; i++) {
    const v = i < rise ? i / rise : i < rise + fall ? 1 - (2 * (i - rise)) / fall : -1 + (i - rise - fall) / back
    if (s + i >= L.length) break
    L[s + i] += v * gl
    R[s + i] += v * gr
  }
}

/** Heavy-tailed loudness: mostly small, now and then a big one (log-normal, σ ≈ 8 dB). */
function heavy() {
  return 10 ** ((8 * Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random())) / 20)
}

/** Brookes' asymmetric soft clip (Gloubi-boulga). */
function shape(x: number) {
  const a = 1 + Math.exp(-0.75 * Math.sqrt(Math.abs(x)))
  return (Math.exp(x) - Math.exp(-a * x)) / (Math.exp(x) + Math.exp(-x))
}

/** Constant-peak RBJ bandpass. */
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
