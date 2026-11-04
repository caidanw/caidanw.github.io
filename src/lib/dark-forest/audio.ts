/**
 * The sound of the clearing, synthesized (WebAudio, no recordings): the fire's roar and its
 * crackle, a log landing, rain, thunder after the lightning, wind in the trees, the frog, the
 * crickets, the owl, the crow, a hut door. Everything listens to the world each frame and
 * changes with it; one-shots are triggered by what changed since the last frame. Sounds are
 * panned by where they are on screen and quieter the further off they are.
 *
 * Browsers only allow sound after a click or a key, so it starts off (see start()).
 */
import { doorOpen, isRaining, perchPos, type World } from './sim'
import { PADS, PROPS, TREES, W, project } from './world'

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))

export class Soundscape {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private white!: AudioBuffer
  private brown!: AudioBuffer
  private fireRoar!: GainNode
  private rainHush!: GainNode
  private rainTone!: BiquadFilterNode
  private wind!: GainNode
  private windTone!: BiquadFilterNode
  private volume = 0.7
  // what the world looked like last frame, to hear what changed
  private last = { fuel: -1, croak: 0, crow: '', doors: [] as boolean[], t: 0 }
  private heard = new Set<number>()
  private nextCrackle = 0
  private nextDrip = 0
  private nextCricket = [0, 0.4, 0.9]
  private nextOwl = 20

  get running() {
    return !!this.ctx && this.ctx.state === 'running'
  }

  /** Start (from a click or a key). */
  start() {
    if (!this.ctx) this.build()
    void this.ctx!.resume()
  }

  stop() {
    void this.ctx?.suspend()
  }

  setVolume(v: number) {
    this.volume = v
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05)
  }

  /** The level coming out now (0..1), for the editor's meter. */
  level(): number {
    if (!this.analyser) return 0
    const buf = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(buf)
    let s = 0
    for (const v of buf) s += v * v
    return Math.sqrt(s / buf.length)
  }
  private analyser: AnalyserNode | null = null

  private build() {
    const ctx = new AudioContext()
    this.ctx = ctx
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 3
    this.master = ctx.createGain()
    this.master.gain.value = this.volume
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.master.connect(comp).connect(ctx.destination)
    comp.connect(this.analyser)
    // noise: white, and brown (white integrated: deep and soft)
    const n = ctx.sampleRate * 3
    this.white = ctx.createBuffer(1, n, ctx.sampleRate)
    this.brown = ctx.createBuffer(1, n, ctx.sampleRate)
    const wd = this.white.getChannelData(0)
    const bd = this.brown.getChannelData(0)
    let b = 0
    for (let i = 0; i < n; i++) {
      wd[i] = Math.random() * 2 - 1
      b = (b + 0.02 * wd[i]) / 1.02
      bd[i] = b * 3.5
    }
    // the fire's roar: deep noise, low-passed, as loud as the fire is big
    this.fireRoar = this.loop(this.brown, [this.filter('lowpass', 420, 0.7)], 0)
    // rain: a hush of filtered noise
    this.rainTone = this.filter('lowpass', 2600, 0.5)
    this.rainHush = this.loop(this.white, [this.filter('highpass', 380, 0.5), this.rainTone], 0)
    // wind in the trees: noise through a slowly wandering band
    this.windTone = this.filter('bandpass', 420, 0.8)
    this.wind = this.loop(this.brown, [this.windTone], 0)
  }

  private filter(type: BiquadFilterType, f: number, q: number) {
    const n = this.ctx!.createBiquadFilter()
    n.type = type
    n.frequency.value = f
    n.Q.value = q
    return n
  }

  /** A looping noise bed through filters, into a gain (returned) into the master. */
  private loop(buf: AudioBuffer, chain: AudioNode[], gain: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.loopStart = Math.random()
    const g = ctx.createGain()
    g.gain.value = gain
    let node: AudioNode = src
    for (const c of chain) node = node.connect(c)
    node.connect(g).connect(this.master)
    src.start()
    return g
  }

  /** A short burst of noise through a filter: a crackle, a tick, a crack. */
  private burst(at: number, len: number, freq: number, q: number, gain: number, pan: number, type: BiquadFilterType = 'bandpass', buf = this.white) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = buf
    const f = this.filter(type, freq, q)
    const g = ctx.createGain()
    const p = ctx.createStereoPanner()
    p.pan.value = clamp(pan, -1, 1)
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(gain, at + Math.min(0.004, len / 4))
    g.gain.exponentialRampToValueAtTime(0.0001, at + len)
    src.connect(f).connect(g).connect(p).connect(this.master)
    src.start(at, Math.random() * 2, len + 0.05)
  }

  /** A pitched voice: an oscillator with an envelope and a pitch glide, through a filter. */
  private voice(
    at: number,
    len: number,
    type: OscillatorType,
    f0: number,
    f1: number,
    gain: number,
    pan: number,
    filt?: [BiquadFilterType, number, number],
    trem = 0,
  ) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, at)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + len)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(gain, at + Math.min(0.03, len / 4))
    g.gain.exponentialRampToValueAtTime(0.0001, at + len)
    let node: AudioNode = o
    if (filt) node = node.connect(this.filter(...filt))
    if (trem) {
      // a buzzy flutter (the frog's throat)
      const am = ctx.createGain()
      const lfo = ctx.createOscillator()
      lfo.type = 'square'
      lfo.frequency.value = trem
      const depth = ctx.createGain()
      depth.gain.value = 0.5
      am.gain.value = 0.5
      lfo.connect(depth).connect(am.gain)
      lfo.start(at)
      lfo.stop(at + len + 0.05)
      node = node.connect(am)
    }
    const p = ctx.createStereoPanner()
    p.pan.value = clamp(pan, -1, 1)
    node.connect(g).connect(p).connect(this.master)
    o.start(at)
    o.stop(at + len + 0.05)
  }

  /** Where something is, for the ears: pan from its screen x, and a gain falling off with distance from the fire. */
  private place(x: number, y: number, z: number): [number, number] {
    const [sx] = project(x, y, z)
    return [clamp((sx / W) * 2 - 1, -0.9, 0.9), 1 / (1 + Math.hypot(x, z) / 70)]
  }

  /** Listen to the world: call every frame while running. */
  update(w: World) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const now = ctx.currentTime
    const heat = w.fire.heat
    const rain = w.weather.rain
    const cloud = w.weather.cloud
    // ---- the beds
    this.fireRoar.gain.setTargetAtTime(0.05 + 0.32 * heat * heat, now, 0.3)
    this.rainHush.gain.setTargetAtTime(0.32 * rain, now, 0.5)
    this.rainTone.frequency.setTargetAtTime(1800 + 2200 * rain, now, 0.5)
    const gust = 0.5 + 0.5 * Math.sin(w.t * 0.13) * Math.sin(w.t * 0.071 + 1)
    this.wind.gain.setTargetAtTime((0.04 + 0.12 * cloud + 0.1 * rain) * (0.5 + gust), now, 1.2)
    this.windTone.frequency.setTargetAtTime(300 + 260 * gust + 200 * rain, now, 1.5)

    // ---- the fire: crackles and pops, faster the bigger it burns (rain makes it hiss and spit less)
    if (now >= this.nextCrackle) {
      const big = Math.random() < 0.12
      this.burst(
        now + Math.random() * 0.02,
        big ? 0.06 : 0.012 + Math.random() * 0.02,
        big ? 700 + Math.random() * 500 : 1600 + Math.random() * 3500,
        big ? 2 : 3,
        (big ? 0.35 : 0.18) * (0.4 + heat),
        (Math.random() - 0.5) * 0.3,
      )
      this.nextCrackle = now + -Math.log(1 - Math.random()) / (1.5 + 11 * heat * (1 - 0.5 * rain))
    }
    // a log lands on the fire: a thump, a whoosh, a burst of crackling
    if (this.last.fuel >= 0 && w.fire.fuel > this.last.fuel + 0.05) {
      this.voice(now, 0.3, 'sine', 90, 42, 0.5, 0.05, ['lowpass', 200, 1])
      this.burst(now, 0.5, 500, 0.6, 0.18, 0, 'lowpass', this.brown)
      for (let i = 0; i < 8; i++) this.burst(now + 0.1 + Math.random() * 1.2, 0.015, 1800 + Math.random() * 3000, 3, 0.22, (Math.random() - 0.5) * 0.3)
    }
    this.last.fuel = w.fire.fuel

    // ---- rain: drops ticking on the pool and the leaves
    if (rain > 0.05 && now >= this.nextDrip) {
      this.burst(now, 0.008, 3000 + Math.random() * 4000, 4, 0.06 + 0.06 * Math.random(), Math.random() * 2 - 1, 'bandpass')
      this.nextDrip = now + -Math.log(1 - Math.random()) / (45 * rain)
    }
    // ---- thunder, when it arrives: a long low rumble (a crack first, if it's close)
    for (const th of w.weather.thunder) {
      if (th.at > w.t || this.heard.has(th.at)) continue
      this.heard.add(th.at)
      const at = now + 0.02
      const len = 3 + th.power * 3
      if (th.power > 0.75) this.burst(at, 0.25, 1400, 0.7, 0.5 * th.power, (Math.random() - 0.5) * 1.2, 'bandpass')
      for (let k = 0; k < 3; k++)
        this.burst(
          at + k * (0.25 + Math.random() * 0.5),
          len - k * 0.6,
          90 + Math.random() * 70,
          0.7,
          0.9 * th.power,
          (Math.random() - 0.5) * 0.6,
          'lowpass',
          this.brown,
        )
    }
    if (this.heard.size > 50) this.heard = new Set([...this.heard].slice(-20))

    // ---- the frog: a buzzy ribbit, twice
    if (w.frog.croak > 0 && this.last.croak <= 0) {
      const [pan, g] = this.place(...frogAt(w))
      for (const k of [0, 0.16]) this.voice(now + k, 0.11, 'sawtooth', 460, 400, 0.22 * g, pan, ['bandpass', 900, 2], 38)
    }
    this.last.croak = w.frog.croak

    // ---- crickets, on a clear dry night (quiet when it rains)
    const quiet = clamp(1 - cloud * 1.5) * (isRaining(w) ? 0 : 1)
    this.nextCricket.forEach((at, i) => {
      if (now < at) return
      if (quiet > 0.05) {
        const f = [4600, 5100, 4300][i]
        const pan = [-0.7, 0.5, 0.85][i]
        for (let k = 0; k < 3; k++) this.voice(now + k * 0.055, 0.035, 'sine', f, f * 0.98, 0.03 * quiet, pan)
      }
      this.nextCricket[i] = now + 0.7 + Math.random() * 0.9
    })
    // ---- the owl, now and then: hoo... hoo-hoo
    if (now >= this.nextOwl) {
      if (quiet > 0.3) {
        const t = owlAt()
        const [pan, g] = t ? this.place(t[0], t[1], t[2]) : [-0.6, 0.4]
        this.voice(now, 0.45, 'sine', 400, 370, 0.16 * g, pan, ['lowpass', 900, 0.7])
        this.voice(now + 0.7, 0.25, 'sine', 410, 385, 0.13 * g, pan, ['lowpass', 900, 0.7])
        this.voice(now + 1.0, 0.5, 'sine', 400, 360, 0.15 * g, pan, ['lowpass', 900, 0.7])
      }
      this.nextOwl = now + 25 + Math.random() * 45
    }
    // ---- the crow takes off: a rough caw
    if (w.crow.fsm.state === 'flying' && this.last.crow !== 'flying') {
      const [px] = perchPos()
      const pan = clamp((px / W) * 2 - 1, -0.9, 0.9)
      for (const k of [0, 0.32]) {
        this.voice(now + k, 0.24, 'sawtooth', 720, 560, 0.12, pan, ['bandpass', 1300, 1.5])
        this.burst(now + k, 0.2, 1500, 1, 0.05, pan)
      }
    }
    this.last.crow = w.crow.fsm.state
    // ---- a hut door opening: a little creak
    PROPS.huts.forEach((h, i) => {
      const open = doorOpen(w, i)
      if (open && this.last.doors[i] === false) {
        const [pan, g] = this.place(h.x, 4, h.z)
        this.voice(now, 0.35, 'triangle', 340 + Math.random() * 120, 520, 0.05 * g, pan, ['bandpass', 700, 4], 22)
      }
      this.last.doors[i] = open
    })
  }
}

const frogAt = (w: World): [number, number, number] => {
  const p = PADS[w.frog.pad]
  return p ? [p[0], 0, p[1]] : [12, 0, 31]
}
/** The owl's tree (the same one the renderer perches it in). */
const owlAt = (): [number, number, number] | null => {
  let best: (typeof TREES)[number] | null = null
  for (const t of TREES) if (!best || Math.hypot(t.x + 78, t.z + 42) < Math.hypot(best.x + 78, best.z + 42)) best = t
  return best ? [best.x, 24, best.z] : null
}
