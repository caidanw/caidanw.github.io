/**
 * The sound of the clearing, synthesized (WebAudio, no recordings). Every source has its own
 * bus (on/off, solo, level, rate, pitch from settings.sound.sources, metered for the editor),
 * and listens to the world each frame: beds follow it smoothly (rain, wind), one-shots are
 * triggered by what changed since the last frame (a log landing, a croak, thunder arriving)
 * or by chance at a rate the world sets (crackles, drops, crickets, the owl).
 *
 * Sounds are panned by where they are on screen and quieter the further they are from the
 * fire. Browsers only allow sound after a click or a key, so it starts off (see start()).
 */
import { doorOpen, isRaining, perchPos, type World } from './sim'
import { SOUND_SOURCES, settings, type SoundKey } from './settings'
import { PADS, PROPS, TREES, W, project } from './world'

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
/** Time to the next event of a Poisson process with this rate (per second). */
const wait = (rate: number) => (rate > 0 ? -Math.log(1 - Math.random()) / rate : 1e9)

export class Soundscape {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private masterMeter!: AnalyserNode
  private bus = {} as Record<SoundKey, GainNode>
  private meters = {} as Record<SoundKey, AnalyserNode>
  private white!: AudioBuffer
  private brown!: AudioBuffer
  /** Short crackle grains: sharp clicks, and ringing pops. */
  private clicks: AudioBuffer[] = []
  private pops: AudioBuffer[] = []
  private rainBed!: GainNode
  private rainTone: BiquadFilterNode[] = []
  private windBed!: GainNode
  private windTone!: BiquadFilterNode
  private volume = 0.7
  /** Auditioning: a source plays (even if off or not soloed) until this time, beds at this level. */
  private hold = {} as Partial<Record<SoundKey, { until: number; level: number }>>
  // what the world looked like last frame, to hear what changed
  private last = { fuel: -1, croak: 0, crow: '', doors: [] as boolean[] }
  private heard = new Set<number>()
  private nextCrackle = 0
  private nextDrip = 0
  private nextCricket = [0, 0.4, 0.9]
  private nextOwl = 20
  private scratch = new Float32Array(512)

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

  /** How loud it is right now (0..1): all of it, or one source. */
  level(key?: SoundKey): number {
    const a = key ? this.meters[key] : this.masterMeter
    if (!a || !this.running) return 0
    a.getFloatTimeDomainData(this.scratch)
    let s = 0
    for (const v of this.scratch) s += v * v
    return Math.sqrt(s / this.scratch.length)
  }

  /** Play an example of one source now (the editor's ▶), whether or not it's on. */
  audition(key: SoundKey) {
    this.start()
    const ctx = this.ctx!
    const now = ctx.currentTime + 0.03
    const T = settings.sound.sources[key]
    const hold = (s: number, level = 1) => (this.hold[key] = { until: now + s, level })
    switch (key) {
      case 'crackle': {
        hold(3)
        for (let at = now; at < now + 2.8; at += wait((0.6 + 9 * 0.8) * T.rate)) this.crackle(at, 0.8, 0)
        break
      }
      case 'log':
        hold(2.5)
        this.logLands(now)
        break
      case 'rain':
        hold(4, 0.7)
        break
      case 'drips':
        hold(2.5)
        for (let at = now; at < now + 2.2; at += wait(40 * 0.6 * T.rate)) this.drip(at)
        break
      case 'thunder':
        hold(7)
        this.thunder(now, 1)
        break
      case 'wind':
        hold(5, 1)
        break
      case 'frog':
        hold(1)
        this.frog(now, 0, 1)
        break
      case 'crickets':
        hold(3)
        for (let i = 0; i < 3; i++) this.cricket(now + i * 0.8, i, 1)
        break
      case 'owl':
        hold(2.5)
        this.owl(now, -0.5, 1)
        break
      case 'crow':
        hold(1.5)
        this.crow(now, 0.4)
        break
      case 'door':
        hold(1)
        this.door(now, 0, 1)
        break
    }
  }

  private build() {
    const ctx = new AudioContext()
    this.ctx = ctx
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 2.5
    this.master = ctx.createGain()
    this.master.gain.value = this.volume
    this.masterMeter = ctx.createAnalyser()
    this.masterMeter.fftSize = 512
    this.master.connect(comp).connect(ctx.destination)
    comp.connect(this.masterMeter)
    for (const { key } of SOUND_SOURCES) {
      const g = ctx.createGain()
      g.gain.value = 0
      const m = ctx.createAnalyser()
      m.fftSize = 512
      g.connect(m)
      g.connect(this.master)
      this.bus[key] = g
      this.meters[key] = m
    }
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
    this.buildGrains()
    // rain: white noise, two decorrelated loops spread left and right, gently rounded off
    this.rainBed = ctx.createGain()
    this.rainBed.gain.value = 0
    this.rainBed.connect(this.bus.rain)
    for (const pan of [-0.55, 0.55]) {
      const lp = this.filter('lowpass', 9000, 0.5)
      this.rainTone.push(lp)
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      this.loop(this.white, [this.filter('highpass', 180, 0.5), lp, p], this.rainBed)
    }
    // wind in the trees: deep noise through a slowly wandering band
    this.windTone = this.filter('bandpass', 420, 0.8)
    this.windBed = ctx.createGain()
    this.windBed.gain.value = 0
    this.windBed.connect(this.bus.wind)
    this.loop(this.brown, [this.windTone], this.windBed)
  }

  /**
   * Crackle grains, made once: clicks are a few milliseconds of noise dying away fast (the
   * snap of sap and splitting wood); pops ring a little, a tone inside the noise.
   */
  private buildGrains() {
    const sr = this.ctx!.sampleRate
    for (let k = 0; k < 32; k++) {
      const len = Math.round(sr * rnd(0.0015, 0.007))
      const buf = this.ctx!.createBuffer(1, len, sr)
      const d = buf.getChannelData(0)
      const tau = len / rnd(3, 6)
      let prev = 0
      for (let i = 0; i < len; i++) {
        const x = (Math.random() * 2 - 1) * Math.exp(-i / tau)
        d[i] = x - 0.7 * prev // a touch of high-pass: crisp, not thuddy
        prev = x
      }
      this.clicks.push(buf)
    }
    for (let k = 0; k < 12; k++) {
      const len = Math.round(sr * rnd(0.02, 0.05))
      const buf = this.ctx!.createBuffer(1, len, sr)
      const d = buf.getChannelData(0)
      const f = rnd(500, 1500)
      const tau = len / 5
      const ph = Math.random() * 6
      for (let i = 0; i < len; i++) {
        const env = Math.exp(-i / tau)
        const snap = i < sr * 0.001 ? 1.5 : 0.35
        d[i] = env * ((Math.random() * 2 - 1) * snap + 0.6 * Math.sin((2 * Math.PI * f * i) / sr + ph))
      }
      this.pops.push(buf)
    }
  }

  private filter(type: BiquadFilterType, f: number, q: number) {
    const n = this.ctx!.createBiquadFilter()
    n.type = type
    n.frequency.value = f
    n.Q.value = q
    return n
  }

  /** A looping noise bed through a chain into `out`. */
  private loop(buf: AudioBuffer, chain: AudioNode[], out: AudioNode) {
    const src = this.ctx!.createBufferSource()
    src.buffer = buf
    src.loop = true
    let node: AudioNode = src
    for (const c of chain) node = node.connect(c)
    node.connect(out)
    src.start(0, Math.random() * 2.5)
  }

  /** Play a grain buffer at `rate` (pitch), through a gain and a panner, into a bus. */
  private grain(buf: AudioBuffer, at: number, gain: number, rate: number, pan: number, out: AudioNode) {
    const ctx = this.ctx!
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

  /** A burst of filtered noise with a fast attack and a long tail (thunder). */
  private burst(at: number, len: number, freq: number, q: number, gain: number, pan: number, type: BiquadFilterType, buf: AudioBuffer, out: AudioNode) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    const p = ctx.createStereoPanner()
    p.pan.value = clamp(pan, -1, 1)
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(gain, at + Math.min(0.03, len / 4))
    g.gain.exponentialRampToValueAtTime(0.0001, at + len)
    src
      .connect(this.filter(type, freq, q))
      .connect(g)
      .connect(p)
      .connect(out)
    src.start(at, Math.random() * 2, len + 0.05)
  }

  /** A pitched voice: an oscillator with an envelope and a glide, through a filter; `trem` adds a buzzy flutter. */
  private voice(
    at: number,
    len: number,
    type: OscillatorType,
    f0: number,
    f1: number,
    gain: number,
    pan: number,
    out: AudioNode,
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
      const am = ctx.createGain()
      am.gain.value = 0.5
      const lfo = ctx.createOscillator()
      lfo.type = 'square'
      lfo.frequency.value = trem
      const depth = ctx.createGain()
      depth.gain.value = 0.5
      lfo.connect(depth).connect(am.gain)
      lfo.start(at)
      lfo.stop(at + len + 0.05)
      node = node.connect(am)
    }
    const p = ctx.createStereoPanner()
    p.pan.value = clamp(pan, -1, 1)
    node.connect(g).connect(p).connect(out)
    o.start(at)
    o.stop(at + len + 0.05)
  }

  // ---------------------------------------------------------------- the sources

  private pitch = (key: SoundKey) => settings.sound.sources[key].pitch

  /** One crackle: a little cluster of clicks (sometimes a pop), louder for a bigger fire. */
  private crackle(at: number, heat: number, rain: number) {
    const out = this.bus.crackle
    const pitch = this.pitch('crackle')
    const base = 0.55 * (0.35 + 0.65 * heat) * (1 - 0.4 * rain)
    const pan = rnd(-0.15, 0.15)
    let t = at
    const n = 1 + Math.min(5, Math.floor(-Math.log(1 - Math.random()) / 0.8))
    for (let i = 0; i < n; i++) {
      const g = base * (0.2 + 0.8 * Math.random() ** 2)
      this.grain(this.clicks[(Math.random() * this.clicks.length) | 0], t, g, pitch * rnd(0.8, 1.25), pan + rnd(-0.05, 0.05), out)
      t += rnd(0.006, 0.05)
    }
    if (Math.random() < 0.06 + 0.1 * heat)
      this.grain(this.pops[(Math.random() * this.pops.length) | 0], t, base * rnd(0.5, 0.9), pitch * rnd(0.85, 1.2), pan, out)
  }

  /** A log lands on the fire: a soft thump, then a scatter of crackling as it catches. */
  private logLands(at: number) {
    const out = this.bus.log
    const pitch = this.pitch('log')
    this.voice(at, 0.32, 'sine', 85 * pitch, 40 * pitch, 0.5, 0.05, out, ['lowpass', 220 * pitch, 1])
    this.burst(at, 0.12, 900 * pitch, 0.8, 0.12, 0, 'lowpass', this.brown, out)
    for (let i = 0; i < 14; i++) {
      const t = at + 0.08 + Math.random() ** 1.5 * 1.6
      const pool = Math.random() < 0.25 ? this.pops : this.clicks
      this.grain(pool[(Math.random() * pool.length) | 0], t, rnd(0.15, 0.5), pitch * rnd(0.8, 1.25), rnd(-0.2, 0.2), out)
    }
  }

  /** A drop on a leaf or the pool: a tiny, high tick. */
  private drip(at: number) {
    this.grain(this.clicks[(Math.random() * this.clicks.length) | 0], at, rnd(0.05, 0.2), this.pitch('drips') * rnd(1.6, 2.6), rnd(-1, 1), this.bus.drips)
  }

  /** A long low rumble (with a crack first, if it's close). */
  private thunder(at: number, power: number) {
    const out = this.bus.thunder
    const deep = 1 / this.pitch('thunder')
    const len = 3 + power * 3
    if (power > 0.75) this.burst(at, 0.25, 1400 * deep, 0.7, 0.45 * power, rnd(-0.6, 0.6), 'bandpass', this.white, out)
    for (let k = 0; k < 3; k++)
      this.burst(at + k * rnd(0.25, 0.75), len - k * 0.6, rnd(90, 160) * deep, 0.7, 0.9 * power, rnd(-0.3, 0.3), 'lowpass', this.brown, out)
  }

  private frog(at: number, pan: number, g: number) {
    const p = this.pitch('frog')
    for (const k of [0, 0.16]) this.voice(at + k, 0.11, 'sawtooth', 460 * p, 400 * p, 0.22 * g, pan, this.bus.frog, ['bandpass', 900 * p, 2], 38)
  }

  private cricket(at: number, i: number, g: number) {
    const f = [4600, 5100, 4300][i] * this.pitch('crickets')
    const pan = [-0.7, 0.5, 0.85][i]
    for (let k = 0; k < 3; k++) this.voice(at + k * 0.055, 0.035, 'sine', f, f * 0.98, 0.03 * g, pan, this.bus.crickets)
  }

  private owl(at: number, pan: number, g: number) {
    const p = this.pitch('owl')
    const out = this.bus.owl
    const lp: [BiquadFilterType, number, number] = ['lowpass', 900 * p, 0.7]
    this.voice(at, 0.45, 'sine', 400 * p, 370 * p, 0.16 * g, pan, out, lp)
    this.voice(at + 0.7, 0.25, 'sine', 410 * p, 385 * p, 0.13 * g, pan, out, lp)
    this.voice(at + 1.0, 0.5, 'sine', 400 * p, 360 * p, 0.15 * g, pan, out, lp)
  }

  private crow(at: number, pan: number) {
    const p = this.pitch('crow')
    for (const k of [0, 0.32]) {
      this.voice(at + k, 0.24, 'sawtooth', 720 * p, 560 * p, 0.12, pan, this.bus.crow, ['bandpass', 1300 * p, 1.5])
      this.burst(at + k, 0.2, 1500 * p, 1, 0.05, pan, 'bandpass', this.white, this.bus.crow)
    }
  }

  private door(at: number, pan: number, g: number) {
    const p = this.pitch('door')
    this.voice(at, 0.35, 'triangle', rnd(340, 460) * p, 520 * p, 0.12 * g, pan, this.bus.door, ['bandpass', 700 * p, 4], 22)
  }

  /** Where something is, for the ears: pan from its screen x, and a gain falling off with distance from the fire. */
  private place(x: number, y: number, z: number): [number, number] {
    const [sx] = project(x, y, z)
    return [clamp((sx / W) * 2 - 1, -0.9, 0.9), 1 / (1 + Math.hypot(x, z) / 70)]
  }

  /** Listen to the world: call every frame. */
  update(w: World) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const now = ctx.currentTime
    const S = settings.sound.sources
    const held = (k: SoundKey) => (this.hold[k] && this.hold[k]!.until > now ? this.hold[k]!.level : 0)
    // ---- the buses: on, solo, level (an audition plays whatever the switches say)
    for (const { key } of SOUND_SOURCES) {
      const T = S[key]
      const live = T.on && (!settings.sound.solo || settings.sound.solo === key)
      this.bus[key].gain.setTargetAtTime(live || held(key) ? T.gain : 0, now, 0.05)
    }
    const heat = w.fire.heat
    const rain = w.weather.rain
    const cloud = w.weather.cloud

    // ---- the beds
    const rainLevel = Math.max(rain, held('rain'))
    this.rainBed.gain.setTargetAtTime(0.2 * rainLevel, now, 0.4)
    for (const f of this.rainTone) f.frequency.setTargetAtTime(clamp(6500 * S.rain.pitch * (0.75 + 0.35 * rainLevel), 800, 18000), now, 0.5)
    const g = w.t * S.wind.rate
    const gust = 0.5 + 0.5 * Math.sin(g * 0.13) * Math.sin(g * 0.071 + 1)
    const windLevel = Math.max(0.15 + 0.5 * cloud + 0.4 * rain, held('wind'))
    this.windBed.gain.setTargetAtTime(0.2 * windLevel * (0.4 + gust), now, 1.2)
    this.windTone.frequency.setTargetAtTime((300 + 260 * gust + 200 * rain) * S.wind.pitch, now, 1.5)

    // ---- the fire: crackling, busier the bigger it burns (fewer in the rain)
    if (this.nextCrackle < now - 0.2) this.nextCrackle = now
    while (this.nextCrackle < now + 0.05) {
      this.crackle(Math.max(now, this.nextCrackle), heat, rain)
      this.nextCrackle += wait((0.6 + 9 * heat ** 1.3) * S.crackle.rate * (1 - 0.6 * rain))
    }
    // a log lands on the fire
    if (this.last.fuel >= 0 && w.fire.fuel > this.last.fuel + 0.05) this.logLands(now)
    this.last.fuel = w.fire.fuel

    // ---- rain: drops ticking on the pool and the leaves
    if (this.nextDrip < now - 0.2) this.nextDrip = now
    if (rain > 0.05)
      while (this.nextDrip < now + 0.05) {
        this.drip(Math.max(now, this.nextDrip))
        this.nextDrip += wait(40 * rain * S.drips.rate)
      }
    // ---- thunder, when it arrives
    for (const th of w.weather.thunder) {
      if (th.at > w.t || this.heard.has(th.at)) continue
      this.heard.add(th.at)
      this.thunder(now + 0.02, th.power)
    }
    if (this.heard.size > 50) this.heard = new Set([...this.heard].slice(-20))

    // ---- the frog
    if (w.frog.croak > 0 && this.last.croak <= 0) {
      const [pan, gain] = this.place(...frogAt(w))
      this.frog(now, pan, gain)
    }
    this.last.croak = w.frog.croak

    // ---- crickets and the owl, on a clear dry night
    const quiet = clamp(1 - cloud * 1.5) * (isRaining(w) ? 0 : 1)
    this.nextCricket.forEach((at, i) => {
      if (now < at) return
      if (quiet > 0.05) this.cricket(now, i, quiet)
      this.nextCricket[i] = now + rnd(0.7, 1.6) / S.crickets.rate
    })
    if (now >= this.nextOwl) {
      if (quiet > 0.3) {
        const t = owlAt()
        const [pan, gain] = t ? this.place(...t) : [-0.6, 0.4]
        this.owl(now, pan, gain)
      }
      this.nextOwl = now + rnd(25, 70) / S.owl.rate
    }
    // ---- the crow takes off
    if (w.crow.fsm.state === 'flying' && this.last.crow !== 'flying') {
      const [px] = perchPos()
      this.crow(now, clamp((px / W) * 2 - 1, -0.9, 0.9))
    }
    this.last.crow = w.crow.fsm.state
    // ---- a hut door opening
    PROPS.huts.forEach((h, i) => {
      const open = doorOpen(w, i)
      if (open && this.last.doors[i] === false) {
        const [pan, gain] = this.place(h.x, 4, h.z)
        this.door(now, pan, gain)
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
