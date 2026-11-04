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
import { rainDrops, rainWash, type RainDrops } from './audio-rain'
import { buildVoices, type VoiceBank, type VoiceKey } from './audio-voices'
import { doorOpen, isRaining, perchPos, type World } from './sim'
import { SOUND_SOURCES, settings, type SoundKey } from './settings'
import { vnoise } from './util'
import { PADS, POOL, PROPS, TREES, W, project } from './world'

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
  /** A positive, spiky random envelope (mean 1) that steps every few ms, for thunder's churning roll. */
  private flutter!: AudioBuffer
  /** Crackle grains, quietest to loudest: a snap, then a noisy fizz (see buildCrackles). */
  private crackles: AudioBuffer[] = []
  private drops!: RainDrops
  private voices!: VoiceBank
  private flamesBed!: GainNode
  private flamesTone!: BiquadFilterNode
  /** Crackles waiting to sound: the clusters' follow-ups (time, loudness). */
  private pending: { at: number; amp: number; pan: number }[] = []
  private rainLanes: GainNode[] = []
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
  private nextDrop = { drips: 0, pool: 0 }
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
    if (this.live) void (this.ctx as AudioContext).resume()
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
    // The first ▶ creates/resumes the context; update() can't open the bus until it runs,
    // which would swallow a short cue like the door. Open it for the example directly.
    this.bus[key].gain.setValueAtTime(T.gain, now)
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
      case 'pool': {
        const seconds = key === 'pool' ? 4 : 2.2
        hold(seconds + 0.3)
        for (let at = now; at < now + seconds; at += wait(this.dropRate(key, 0.6))) this.drip(at, key)
        break
      }
      case 'thunder':
        // A different distance each time: close and sharp, or far and soft.
        hold(this.thunder(now, rnd(0.5, 5), rnd(-0.6, 0.6)) + 0.5)
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
        hold(7.5 / (T.pitch * 0.97))
        this.owl(now, -0.5, 1)
        break
      case 'crow':
        hold(this.crow(now, 0.4) + 0.1)
        break
      case 'door':
        hold(Math.max(...this.voices.door.map((voice) => voice.duration)) / (T.pitch * 0.97) + 0.1)
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
    this.flutter = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
    const fd = this.flutter.getChannelData(0)
    const smooth = Math.exp(-1 / (ctx.sampleRate * 0.004))
    let level = 1
    let target = 1
    let next = 0
    let sum = 0
    for (let i = 0; i < fd.length; i++) {
      if (i >= next) {
        target = 0.15 + 2.5 * Math.random() ** 3 // mostly low, now and then a spike
        next = i + ctx.sampleRate * (0.005 + 0.06 * Math.random() ** 2)
      }
      level = smooth * level + (1 - smooth) * target
      sum += fd[i] = level
    }
    for (let i = 0; i < fd.length; i++) fd[i] /= sum / fd.length
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
    // Rain: independent, long left/right textures of unresolved impacts. No short shared
    // noise loop; leaf taps and pool drips each have their own bus for editor balancing.
    this.drops = rainDrops(ctx)
    for (const [i, pan] of [-0.75, 0.75].entries()) {
      const lp = this.filter('lowpass', 5500, 0.55)
      this.rainTone.push(lp)
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      const g = ctx.createGain()
      g.gain.value = 0
      g.connect(this.bus.rain)
      this.rainLanes.push(g)
      this.loop(rainWash(ctx, 17 + i * 2), [this.filter('highpass', 120, 0.5), lp, p], g)
    }
    // wind in the trees: deep noise through a slowly wandering band
    this.windTone = this.filter('bandpass', 420, 0.8)
    this.windBed = ctx.createGain()
    this.windBed.gain.value = 0
    this.windBed.connect(this.bus.wind)
    this.loop(this.brown, [this.windTone], this.windBed)
    this.voices = buildVoices(ctx)
  }

  /**
   * Crackle grains, made once, measured against recordings of real campfires (see
   * docs/research/dark-forest-audio.md): every crackle is a broadband snap (well under
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

  /** A burst of filtered noise with an attack and a long exponential tail. */
  private burst(
    at: number,
    len: number,
    freq: number,
    q: number,
    gain: number,
    pan: number,
    type: BiquadFilterType,
    buf: AudioBuffer,
    out: AudioNode,
    attack = Math.min(0.03, len / 4),
    tail = 0.0001,
  ) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true // the noise buffers are 3 s; thunder rolls far longer
    const g = ctx.createGain()
    const p = ctx.createStereoPanner()
    p.pan.value = clamp(pan, -1, 1)
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(gain, at + attack)
    g.gain.exponentialRampToValueAtTime(gain * tail, at + len)
    src
      .connect(this.filter(type, freq, q))
      .connect(g)
      .connect(p)
      .connect(out)
    src.start(at, Math.random() * 2, len + 0.05)
  }

  /** A pitched voice with an envelope and glide, for log thumps and crickets. */
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

  private dropRate(key: 'drips' | 'pool', rain: number) {
    // Pool drips stay sparse; the surrounding wash supplies the dense rainfall.
    return (key === 'pool' ? 2 : 22) * rain ** 0.8 * settings.sound.sources[key].rate
  }

  /** Independent leaf taps and water drips; the water sounds come from the pool, not the canopy. */
  private drip(at: number, key: 'drips' | 'pool') {
    const water = key === 'pool'
    const bank = water ? this.drops.water : this.drops.leaves
    const [pan, distance] = water ? this.place(POOL.x + rnd(-0.65, 0.65) * POOL.rx, 0, POOL.z + rnd(-0.5, 0.5) * POOL.rz) : [rnd(-0.95, 0.95), rnd(0.5, 1)]
    const gain = (water ? rnd(0.12, 0.24) : 0.015 + 0.48 * Math.random() ** 3) * distance
    this.grain(bank[(Math.random() * bank.length) | 0], at, gain, this.pitch(key) * rnd(0.85, 1.15), pan, this.bus[key])
  }

  /**
   * Thunder, after Farnell (Designing Sound, Practical 17) and measured recordings
   * (docs/research/dark-forest-audio.md): a tearing strike for close bolts; one long main peal
   * with later swells on top, all with a fast spiky flutter rather than smooth swells; reflections
   * from the surroundings in the 400–900 Hz range (what carries on small speakers); a late
   * sub-boom; all through one distance lowpass. `distance` in km: ~0.5 close … ~7 far.
   * Returns how long it rolls (s).
   */
  private thunder(at: number, distance: number, pan: number) {
    const ctx = this.ctx!
    const deep = 1 / this.pitch('thunder')
    const near = clamp(1 - (distance - 0.5) / 5.5, 0, 1)
    const len = rnd(10, 14) + 4 * (1 - near)
    // distance: quieter and duller (air and ground absorb the highs first)
    const strike = ctx.createGain()
    strike.gain.value = 1 / (1 + 0.3 * (distance - 0.5))
    const muffle = this.filter('lowpass', (500 + 9000 * near ** 2) * deep, 0.7)
    strike.connect(muffle).connect(this.bus.thunder)
    const side = (spread: number) => clamp(pan + rnd(-spread, spread), -1, 1)
    const mid = 0.4 + 0.6 * near // near thunder keeps more of its audible mid band
    // the strike: a tearing pattern of noise bursts over the first second or two, only when it's close
    if (near > 0.55) {
      for (let t = 0, i = 0, n = 5 + ((Math.random() * 6) | 0); i < n; i++, t += rnd(0.02, 0.1) + 0.25 * Math.random() ** 3) {
        const tear = clamp((Math.random() + 0.4) ** 5 * 0.2, 0.02, 0.6)
        const gain = 1.6 * near ** 1.5 * (i === 0 ? 1 : rnd(0.25, 0.8))
        this.burst(at + t, tear, (500 + 4500 * Math.random()) * deep, 1.2, gain, side(0.15), 'bandpass', this.white, strike, 0.002)
      }
    }
    // the main peal: builds for ~0.3 s as the nearest parts of the channel arrive, then rolls on
    const start = at + rnd(0.1, 0.2)
    this.rumble(start, len * 0.9, rnd(180, 300) * deep, 0.7, 0.8, side(0.2), 'lowpass', this.brown, strike, 0.3)
    this.rumble(start, len * 0.75, rnd(250, 500) * deep, 0.8, 0.8 * mid, side(0.2), 'bandpass', this.white, strike, 0.3)
    // swells on top: arrivals from farther parts of the channel, a little later and weaker
    const tau = rnd(3, 5) + 2 * (1 - near)
    for (let t = rnd(0.6, 1.4); t < len * 0.7; t += rnd(0.5, 1.8)) {
      const swell = rnd(0.3, 0.9) * Math.exp(-t / tau)
      const body = rnd(1.5, 3.5)
      const attack = rnd(0.08, 0.4)
      this.rumble(at + t, body, rnd(120, 400) * deep, 0.7, 0.8 * swell, side(0.3), 'lowpass', this.brown, strike, attack)
      this.rumble(at + t, body * 0.8, rnd(200, 700) * deep, 0.8, 0.7 * swell * mid, side(0.3), 'bandpass', this.white, strike, attack)
    }
    // reflections from the hills and trees around: later, scattered, in the mid band
    for (let i = 0, n = 14 + ((Math.random() * 10) | 0); i < n; i++) {
      const t = 0.4 + len * 0.85 * Math.random() ** 1.5
      this.rumble(
        at + t,
        rnd(0.8, 2),
        rnd(400, 900) * deep,
        2,
        0.2 * Math.exp(-t / (tau * 1.5)) * rnd(0.3, 1),
        rnd(-0.8, 0.8),
        'bandpass',
        this.white,
        strike,
        rnd(0.05, 0.2),
      )
    }
    // the deep boom: late, slow and long
    this.burst(at + 0.6, len, 80 * deep, 0.7, 0.5, pan * 0.5, 'lowpass', this.brown, strike, 1.5, 0.001)
    return len + 0.6
  }

  /**
   * Filtered noise whose level flutters in fast random steps (Farnell's thunder rumble: noise
   * sampled-and-held at a random rate), under an attack and a long tail to −60 dB.
   */
  private rumble(
    at: number,
    len: number,
    freq: number,
    q: number,
    gain: number,
    pan: number,
    type: BiquadFilterType,
    buf: AudioBuffer,
    out: AudioNode,
    attack: number,
  ) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const flutter = ctx.createBufferSource()
    flutter.buffer = this.flutter
    flutter.loop = true
    const rough = ctx.createGain()
    rough.gain.value = 0
    flutter.connect(rough.gain)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, at)
    env.gain.linearRampToValueAtTime(gain, at + attack)
    env.gain.exponentialRampToValueAtTime(gain * 0.001, at + len)
    const p = ctx.createStereoPanner()
    p.pan.value = clamp(pan, -1, 1)
    src
      .connect(this.filter(type, freq, q))
      .connect(rough)
      .connect(env)
      .connect(p)
      .connect(out)
    src.start(at, Math.random() * 2, len + 0.05)
    flutter.start(at, Math.random() * 3, len + 0.05)
  }

  /** Play one variant from a bank; returns how long it sounds (s). */
  private playVoice(key: VoiceKey, at: number, gain: number, pan: number, bank = this.voices[key]) {
    const buf = bank[(Math.random() * bank.length) | 0]
    const rate = this.pitch(key) * rnd(0.97, 1.03)
    this.grain(buf, at, gain, rate, pan, this.bus[key])
    return buf.duration / rate
  }

  private frog(at: number, pan: number, g: number) {
    this.playVoice('frog', at, 0.2 * g, pan)
  }

  private cricket(at: number, i: number, g: number) {
    const f = [4600, 5100, 4300][i] * this.pitch('crickets')
    const pan = [-0.7, 0.5, 0.85][i]
    for (let k = 0; k < 3; k++) this.voice(at + k * 0.055, 0.035, 'sine', f, f * 0.98, 0.03 * g, pan, this.bus.crickets)
  }

  private owl(at: number, pan: number, g: number) {
    this.playVoice('owl', at, 0.18 * g, pan)
  }

  /** A series, like the reference: one long caw, then one to three shorter ones. Returns its length (s). */
  private crow(at: number, pan: number) {
    const pitch = this.pitch('crow')
    let t = at + this.playVoice('crow', at, 0.2, pan, this.voices.crowOpening) + rnd(0.3, 0.4) / pitch
    const more = 1 + ((Math.random() * 3) | 0)
    for (let i = 0; i < more; i++) {
      t += this.playVoice('crow', t, 0.16 * rnd(0.85, 1), pan)
      if (i < more - 1) t += rnd(0.22, 0.32) / pitch
    }
    return t - at
  }

  private door(at: number, pan: number, g: number) {
    this.playVoice('door', at, 0.08 * g, pan)
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
    this.rainLanes.forEach((lane, i) => {
      // Small irregular swells in different parts of the wood, never a periodic wind-like whoosh.
      const variation = 0.85 + 0.3 * vnoise(51 + i * 17, w.t * 0.35)
      lane.gain.setTargetAtTime(0.04 * rainLevel ** 1.2 * variation, now, 0.25)
    })
    for (const f of this.rainTone) f.frequency.setTargetAtTime(clamp(7000 * S.rain.pitch * (0.85 + 0.25 * rainLevel), 800, 18000), now, 0.5)
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

    // ---- rain: each material has its own clock, rate, pitch and mute/solo bus
    for (const key of ['drips', 'pool'] as const) {
      if (this.nextDrop[key] < now - 0.2) this.nextDrop[key] = now
      if (rain <= 0.001 || (!S[key].on && !held(key))) continue
      while (this.nextDrop[key] < now + 0.05) {
        this.drip(Math.max(now, this.nextDrop[key]), key)
        this.nextDrop[key] += wait(this.dropRate(key, rain))
      }
    }
    // ---- thunder, when it arrives
    for (const th of w.weather.thunder) {
      if (th.at > w.t || this.heard.has(th.at)) continue
      this.heard.add(th.at)
      this.thunder(now + 0.02, th.distance, th.pan)
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
      this.nextOwl = now + 7.2 / this.pitch('owl') + rnd(25, 70) / S.owl.rate
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
