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
import { vnoise } from './util'
import { PADS, PROPS, TREES, W, project } from './world'

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
/** Time to the next event of a Poisson process with this rate (per second). */
const wait = (rate: number) => (rate > 0 ? -Math.log(1 - Math.random()) / rate : 1e9)

export class Soundscape {
  private ctx: BaseAudioContext | null = null
  /** A live AudioContext (not an offline render). */
  private live = false
  private master!: GainNode
  private masterMeter!: AnalyserNode
  private bus = {} as Record<SoundKey, GainNode>
  private meters = {} as Record<SoundKey, AnalyserNode>
  private white!: AudioBuffer
  private brown!: AudioBuffer
  /** Crackle grains, quietest to loudest: a snap, then a noisy fizz (see buildCrackles). */
  private crackles: AudioBuffer[] = []
  /** Single drops: tiny noisy ticks. */
  private ticks: AudioBuffer[] = []
  private flamesBed!: GainNode
  private flamesTone!: BiquadFilterNode
  /** Crackles waiting to sound: the clusters' follow-ups (time, loudness). */
  private pending: { at: number; amp: number; pan: number }[] = []
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
    if (!this.ctx) {
      this.live = true
      this.build(new AudioContext())
    }
    void (this.ctx as AudioContext).resume()
  }

  stop() {
    if (this.live) void (this.ctx as AudioContext).suspend()
  }

  /** Render into an offline context instead (tools: compare against recordings). */
  attach(ctx: BaseAudioContext) {
    this.build(ctx)
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
        hold(3.2)
        for (let at = now; at < now + 3; at += wait((1 + 14 * 0.7 ** 1.5) * 0.55 * T.rate)) this.crackleStart(at, 0.7, 0)
        break
      }
      case 'flames':
        hold(4, 1)
        break
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

  private build(ctx: BaseAudioContext) {
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
    this.buildCrackles()
    // the flames: a soft broadband breath (pink noise, rounded off at both ends), lapping slowly
    const pink = ctx.createBuffer(1, n, ctx.sampleRate)
    // mostly pink, a little white: real fire beds are soft, rolling off above ~7 kHz
    const pd = pink.getChannelData(0)
    pinkNoise(pd)
    for (let i = 0; i < n; i++) pd[i] = pd[i] * 0.85 + wd[i] * 0.15
    this.flamesTone = this.filter('lowpass', 6000, 0.5)
    this.flamesBed = ctx.createGain()
    this.flamesBed.gain.value = 0
    this.flamesBed.connect(this.bus.flames)
    this.loop(pink, [this.filter('highpass', 120, 0.6), this.flamesTone], this.flamesBed)
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
   * Crackle grains, made once, measured against recordings of real campfires (see
   * dark-forest-moodboard/sounds/NOTES.md): every crackle is a broadband snap (well under
   * a millisecond, all frequencies at once), then a noisy fizz dying away, brightest
   * around 2-9 kHz, longer the louder the crackle (a few ms for the small ones, up to
   * ~150 ms for a big split); the big ones have a little low body, the wood itself. No
   * tones anywhere: that's what made the old ones sound like pachinko.
   */
  private buildCrackles() {
    const sr = this.ctx!.sampleRate
    const N = 96
    for (let k = 0; k < N; k++) {
      const size = k / (N - 1) // 0 small .. 1 big
      const tau = (rnd(0.8, 4) + size ** 2 * rnd(15, 45)) / 1000
      const len = Math.round(sr * (0.002 + tau * 5))
      const buf = this.ctx!.createBuffer(1, len, sr)
      const d = buf.getChannelData(0)
      const snap = Math.round(sr * rnd(0.0003, 0.002))
      const bp = biquad('bandpass', Math.exp(rnd(Math.log(500), Math.log(7000 - 3500 * size))), rnd(0.5, 1.1), sr) // big ones fizz darker
      // some snaps are duller than others (wetter wood, further in)
      const dull = Math.exp((-2 * Math.PI * Math.exp(rnd(Math.log(2500), Math.log(20000)))) / sr)
      let lp = 0
      const body = biquad('lowpass', rnd(500, 1200), 0.7, sr)
      const bodyTau = sr * rnd(0.002, 0.006)
      const tailGain = rnd(0.06, 0.2) * (1 - 0.4 * size) // the fizz is ~20 dB under the snap
      const raw = rnd(0.15, 0.45)
      let peak = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        lp = (1 - dull) * w + dull * lp
        const s1 = i < snap ? (lp / Math.sqrt(Math.max(0.05, 1 - dull))) * Math.exp((-3 * i) / snap) : 0
        const tail = (bp(w) + raw * w) * tailGain * Math.exp(-i / sr / tau) * Math.min(1, i / (snap + 1))
        const b = size > 0.6 ? body(w) * (size - 0.6) * 1.5 * Math.exp(-i / bodyTau) : 0
        d[i] = s1 + tail + b
        peak = Math.max(peak, Math.abs(d[i]))
      }
      for (let i = 0; i < len; i++) d[i] /= peak
      this.crackles.push(buf)
    }
    for (let k = 0; k < 24; k++) {
      const len = Math.round(sr * rnd(0.003, 0.012))
      const buf = this.ctx!.createBuffer(1, len, sr)
      const d = buf.getChannelData(0)
      const bp = biquad('bandpass', rnd(2500, 7000), 1, sr)
      for (let i = 0; i < len; i++) d[i] = bp(Math.random() * 2 - 1) * Math.exp((-5 * i) / len) * 3
      this.ticks.push(buf)
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

  /**
   * The fire's crackling, as a self-exciting process (like the recordings: about half the
   * gaps under 40 ms, the rest long and irregular): crackles start at a rate the fire sets,
   * and each one may set off a few quieter follow-ups a few tens of ms later. Loudness is
   * heavy-tailed: mostly small ticks, now and then a big split (up to ~35 dB louder).
   */
  private crackleStart(at: number, heat: number, rain: number) {
    const db = Math.min(40, -Math.log(1 - Math.random()) * 12)
    this.crackleAt(at, 10 ** (-db / 20), rnd(-0.25, 0.25), heat, rain)
  }

  private crackleAt(at: number, amp: number, pan: number, heat: number, rain: number) {
    const gain = 0.6 * amp * (0.55 + 0.45 * heat) * (1 - 0.35 * rain)
    // louder crackles use the longer, fuller grains
    const k = Math.min(this.crackles.length - 1, Math.floor((amp ** 2.5 * 0.9 + Math.random() * 0.1) * this.crackles.length))
    this.grain(this.crackles[k], at, gain, this.pitch('crackle') * rnd(0.9, 1.1), pan, this.bus.crackle)
    // follow-ups: on average about one, quieter, soon after
    const kids = poisson(0.45)
    for (let i = 0; i < kids; i++)
      this.pending.push({ at: at + 0.01 + -Math.log(1 - Math.random()) * 0.045, amp: amp * rnd(0.25, 0.9), pan: pan + rnd(-0.08, 0.08) })
  }

  /** A log lands on the fire: a soft thump, then a flurry of crackling as it catches. */
  private logLands(at: number) {
    const out = this.bus.log
    const pitch = this.pitch('log')
    this.voice(at, 0.3, 'sine', 80 * pitch, 42 * pitch, 0.4, 0.05, out, ['lowpass', 200 * pitch, 0.7])
    this.burst(at, 0.09, 700 * pitch, 0.7, 0.1, 0, 'lowpass', this.brown, out)
    for (let i = 0; i < 22; i++) {
      const t = at + 0.1 + Math.random() ** 1.6 * 2
      const amp = 10 ** (-Math.min(30, -Math.log(1 - Math.random()) * 8) / 20)
      const k = Math.floor(amp ** 0.6 * (this.crackles.length - 1))
      this.grain(this.crackles[k], t, 0.6 * amp, pitch * rnd(0.9, 1.1), rnd(-0.25, 0.25), out)
    }
  }

  /** A drop on a leaf or the pool: a tiny noisy tick. */
  private drip(at: number) {
    this.grain(this.ticks[(Math.random() * this.ticks.length) | 0], at, rnd(0.04, 0.16), this.pitch('drips') * rnd(0.8, 1.3), rnd(-1, 1), this.bus.drips)
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
    if (!ctx || (this.live && ctx.state !== 'running')) return
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

    // ---- the fire: crackling, busier the bigger it burns (fewer in the rain): ~2/s from
    // embers, ~9/s for a steady fire, ~20/s blazing (counting the follow-ups, which more
    // than double the starts)
    if (this.nextCrackle < now - 0.2) this.nextCrackle = now
    const starts = (1 + 14 * heat ** 1.5) * 0.55 * S.crackle.rate * (1 - 0.6 * rain)
    while (this.nextCrackle < now + 0.05) {
      this.crackleStart(Math.max(now, this.nextCrackle), heat, rain)
      this.nextCrackle += wait(starts)
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i]
      if (p.at > now + 0.05) continue
      this.pending.splice(i, 1)
      if (p.at > now - 0.1) this.crackleAt(Math.max(now, p.at), p.amp, p.pan, heat, rain)
    }
    // the flames' breath: lapping slowly, louder for a bigger fire
    const lap = 0.6 + 0.8 * vnoise(1.7, w.t * 1.1) ** 2
    this.flamesBed.gain.setTargetAtTime(Math.max((0.001 + 0.01 * heat ** 1.5) * lap, held('flames') * 0.012), now, 0.12)
    this.flamesTone.frequency.setTargetAtTime(clamp(7000 * S.flames.pitch, 500, 20000), now, 0.3)
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

/** Poisson-distributed count with this mean. */
function poisson(mean: number) {
  const L = Math.exp(-mean)
  let k = 0
  for (let p = Math.random(); p > L; p *= Math.random()) k++
  return k
}

/** Pink noise (Paul Kellet's filter), normalised. */
function pinkNoise(d: Float32Array) {
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
}

/** A biquad filter in plain JS (RBJ cookbook), for shaping grains before they're buffers. */
function biquad(type: 'lowpass' | 'bandpass', f: number, q: number, sr: number) {
  const w0 = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr
  const al = Math.sin(w0) / (2 * q)
  const cw = Math.cos(w0)
  const [b0, b1, b2] = type === 'lowpass' ? [(1 - cw) / 2, 1 - cw, (1 - cw) / 2] : [al, 0, -al]
  const a0 = 1 + al
  const a1 = -2 * cw
  const a2 = 1 - al
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0
  return (x: number) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    return y
  }
}
