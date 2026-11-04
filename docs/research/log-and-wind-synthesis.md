# Research: synthesizing a log dropped on a campfire, and night wind in a forest clearing (WebAudio)

> Background research for the dark-forest log-on-fire and wind sounds. The researcher could not download reference audio; recordings are fetched into the moodboard when each sound is reworked.

Labels used below:

- **[direct]**: the source states it, or it is read straight from the original patch or code.
- **[interp]**: my reading of a source.
- **[inference]**: my own derivation or a design suggestion that no source states.
- **[unverified]**: secondary, abstract-only, or not checked against the full text.

---

## Summary

**Log.** The current log is a sine sweeping 80→42 Hz through a 200 Hz lowpass. That is essentially Farnell's _bouncing rubber ball_ recipe (an oscillator around 80 Hz with a pitch sweep), and it signals "kick drum or ball", not "wood". Wood reads as wood because of its _high damping that rises with frequency_ (tan φ ≈ 0.02, about 20× steel). A short log or stick has bending modes in the hundreds of Hz to several kHz, not at 40–80 Hz. Rebuild the event as layers:

1. An unpitched low body thud.
2. A few strongly damped inharmonic wood modes (beam ratios 1 : 2.76 : 5.40) excited by a 1–3 ms contact pulse.
3. A stochastic PhISEM-style "crunch" of charcoal and embers over a few hundred ms.
4. A slow flare of Farnell-style hiss and lapping.
5. A crackle rate that _ramps up over seconds_. It should not start as an immediate burst of 22 grains.

**Wind.** Farnell's Wind practical is **Practical 18** (https://aspress.co.uk/sd/practical18.html). It drives every layer from one _wind-speed_ control signal: a slow base plus a 0.5 Hz-lowpassed noise "gust" plus a 3 Hz "squall" that only appears above a threshold. Each layer reads that signal through a delay line at a different delay (0–3 s), so the gust front reaches different objects at different times. The layers are:

- a broadband body whose brightness rises with speed;
- whistles at Q 60;
- doorway howls that sound only inside a window of wind speeds;
- a **leaf layer made by thresholding white noise into sparse spikes**.

Our current wind lacks the leaf layer and the per-source delays. Its periodic two-sine gust is predictable. Published vegetation-noise models (Fégeant/Bolin, as used by Heutschi 2014) give canopy spectra: a 1/f component plus a broad bump near 3–4.5 kHz for broadleaf trees, and a Strouhal-type band at f ≈ 0.2·U/d_needle for conifers. Level scales as u^(1.5–2.7) in amplitude.

---

## Ranked actionable ideas

### A. Log onto the campfire

1. **Drop the pitched 80→42 Hz sine sweep.** Replace it with an unpitched low thud: a lowpassed noise or impulse with about 20–60 ms decay, plus 3–5 _wood modes_ above about 300 Hz. Mode decays follow T60 ≈ 110 / f seconds (tan φ ≈ 0.02). Sources: Farnell P7 bouncing ball [direct] for what the current sound resembles; Giordano & McAdams 2006 for wood tan φ [direct]; T60 formula [inference].
2. **Contact pulse sets hardness.** Excite modes with a raised-cosine force F(t)=Fmax(1−cos 2πt/T). Use T ≈ 1–3 ms for wood-on-wood and longer for a soft landing in ash. About 50 ms already reads as a very soft "thud" (van den Doel & Pai) [direct for formula and 50 ms; ms values for wood are inference].
3. **Ember and charcoal crunch as PhISEM.** Fire random impulses with probability N/1024 per sample. Each adds the current "system energy" to a sound level that decays every sample, then passes through 1–2 two-pole resonators. Cook's STK presets give starting values: Crunch 800 Hz r=0.95; Big Rocks 6460 Hz r=0.932, ±11% frequency jitter; Little Rocks 9000 Hz r=0.843 (STK `Shakers.cpp`) [direct].
4. **Bundles of sticks are several impacts, not one.** Use 3–8 clonks at higher mode frequencies, spread over about 30–150 ms with decreasing spacing and random jitter, like the SOb "dropper" model for breaking (Rath et al. 2003) [interp].
5. **Make the catch slow.** Add a hiss and lapping swell over 0.3–1 s, then ramp the crackle _rate_. Start within 0.5–2 s, peak after a few seconds and decay to the baseline over 10–30 s. Do not fire 22 grains in 2 s [inference; to be measured on the refs below].

### B. Night wind in a forest clearing

1. **One wind-speed control signal with Farnell's gust and squall maths, read by every layer through different delays (0–3 s).** Practical 18 [direct].
2. **Add a leaf/needle layer of sparse thresholded-noise spikes.** In Farnell this is `(max(n,t)−t)·t` with t = 1 − 0.4·LP₀.₀₇Hz(w+0.3), then HP 200 / LP 4000, with gain LP(w+0.3)−0.2 [direct]. In WebAudio it can be built from noise + ConstantSource offset + a ReLU WaveShaper [inference].
3. **Shape the canopy spectrum with vegetation-noise models.**
   - Broadleaf: Γ(f)=C₁/f + C₂·exp(−C₃(f−f_d)²/f_d²), with f_d = 3000 Hz (oak), 3200 Hz (aspen), 4500 Hz (birch).
   - Conifers: a log-Gaussian band at f_s = 0.2·u/d_n, with d_n = 1.3 mm (pine) or 1.0 mm (spruce).
   - Scaling: amplitude ∝ u^χ, χ = 1.5–2.7.
   - Source: Heutschi et al. 2014, after Fégeant and Bolin [direct].
4. **Replace the two-sine gust** with filtered noise across several timescales: a Kaimal-type spectrum, roughly 1 minute down to about 1 s (Heutschi Eq. 22 [direct]), plus Farnell's 0.5 Hz gust and 3 Hz squall [direct].
5. **Keep whistles very quiet and narrow.** Aeolian tone at St ≈ 0.2 (f = St·U/d) with relative bandwidth Δf/f ≈ 1–2% (Q ≈ 50–100) at low Reynolds numbers, plus a 3rd harmonic at 0.6× intensity (Selfridge et al. 2016) [direct]. Farnell's whistles use Q 60 at 600+400w Hz and 1000+1000w Hz [direct].
6. **Optional:** add sparse branch creaks from the existing stick-slip door model (Farnell P9), triggered on strong gusts, and a doorway howl for the hut using Farnell's speed-window trick [inference].

---

## Per-source findings

### 1. Farnell, _Designing Sound_, Practical 18: Wind

Original Pd patches `wind0.pd`, `wind1.pd`, `wind2.pd`, `wind4.pd`, `fcpan.pd`, plus `wind.wav`: https://aspress.co.uk/sd/practical18.html. The index of practicals is https://aspress.co.uk/sd/index.html and confirms that Wind is Practical 18 [direct].

I decoded the parameters below from the Pd object and connection lists. The numbers are **[direct]**; the reading of the topology is **[interp]**, because the patch was traced by hand.

**Wind-speed generator (`pd windspeed`), identical in all patches:**

- `base = (osc~ 0.1 + 1) × 0.25` gives a 10 s sinusoidal cycle between 0 and 0.5.
- `windspeed = clip(base + gust(base) + squall(base), 0, 1)`.
- **gust**: `noise~ → lop~ 0.5 → lop~ 0.5 → hip~ 0 → ×50`, multiplied by `(base + 0.5)² − 0.125`. This is a second-order 0.5 Hz lowpassed noise whose depth grows with mean wind. [interp] Pd's `hip~ 0` is effectively a pass-through; I have not run it in Pd to confirm.
- **squall**: `noise~ → lop~ 3 → lop~ 3 → hip~ 0 → ×20`, multiplied by `(8·(max(base, 0.4) − 0.4))²`. It is silent below base 0.4 and adds faster 3 Hz turbulence in strong wind.
- The speed is written to `delwrite~ a 3000`. Each layer reads `vd~ a <ms>` at 0, 100, 300, 500, 900 or 3000 ms, so gusts reach different objects at different times. Layers are spread with the constant-power pan `fcpan` at 0.03–0.91.

**Layers in `wind4.pd` ("complete wind scene", with text labels buildings / doorways / branches/wires / tree leaves):**

| Layer              | Chain [direct]                                                                                                        | Delay   | Pan  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ------- | ---- |
| Body ("buildings") | white → `bp~ 800 1` × (w+0.2) → `rzero~` with coefficient `clip(0.6·(w+0.2), 0, 0.99)` → ×0.2                         | 0 ms    | 0.51 |
| Doorway 1          | white → `bp~ 400 40` × env × 2 × `osc~(30 + 200·env)`; env = `lop~0.5( cos(2π(2·(clip(w,0.35,0.6)−0.35) − 0.25)) )`   | 100 ms  | 0.91 |
| Doorway 2          | white → `bp~ 200 40` × env × 2 × `osc~(20 + 100·env)`; env = `lop~0.1( cos(2π(2·(clip(w,0.25,0.5)−0.25) − 0.25)) )`   | 300 ms  | 0.03 |
| Branch/wire 1      | white → `vcf~` centre 600+400·w, Q 60 → × (w+0.12)² × 1.2                                                             | 500 ms  | 0.28 |
| Branch/wire 2      | white → `vcf~` centre 1000+1000·w, Q 60 → × w² × 2                                                                    | 900 ms  | 0.64 |
| Tree leaves        | ws = `lop~0.07(w₃ₛ + 0.3)`; t = 1 − 0.4·ws; `(max(white, t) − t) · t` → `hip~ 200` → `lop~ 4000` → × (ws − 0.2) × 0.8 | 3000 ms | 0.71 |
| Master             | L/R × 0.45                                                                                                            |         |      |

How to read these layers:

- `rzero~` is the one-zero filter y = x − a·x[n−1]. As a rises with wind speed, the body loses low end and gains top, so stronger wind sounds brighter. [interp]
- The doorway envelope is a raised-cosine _window over wind speed_. It is 0 at the edges of the range and 1 in the middle, so each cavity howls only within a band of speeds. [interp]
- The leaf layer turns white noise into sparse positive spikes that pass only when the noise exceeds threshold t. Stronger, slower-smoothed wind lowers t from 0.88 toward 0.48, so spike _density_ rises. [interp]

`wind1.pd` ("simple noise based wind") is only white → `bp~ 800 1` × (w + 0.2) × 0.3 [direct]. Our current wind is close to this, but uses brown noise, a lower centre and a sine-product gust [interp].

Farnell's book chapter text (theory of Strouhal, gusts and so on) was **not** consulted. Only the patches were. [unverified]

### 2. Farnell, Practical 11: Fire (the hiss and lapping used for the flare)

https://aspress.co.uk/sd/practical11.html, final `fire_generator` abstraction (decoded with fetch tool "answer" mode, then cross-read; [direct] values, extraction via tool):

- **Hissing**: noise → `hip~ 1000` × (10·`lop~1`(noise))⁴ × 600.
- **Lapping**: noise → `bp~ 30 5` × 100 → `hip~ 25` → `clip~ −0.9 0.9` → `hip~ 25` × 0.6.
- Crackle generator: already accepted in the repo; not re-derived here.

### 3. Farnell, Practical 7: Bouncing Ball

https://aspress.co.uk/sd/practical07.html. A `vline~` envelope drives `osc~` with an offset of `+~ 80` Hz plus frequency modulation from `osc~ 120` [direct]. [interp] The current log thump (an 80→42 Hz sine) belongs to this "elastic ball" family, which explains why it "feels off" for wood.

### 4. Wood damping: Giordano & McAdams (2006), JASA 119(2) 1171–1181

https://brungio.github.io/BLG_SMC_2006_JASA.pdf.

- Wood has the highest damping of the four materials tested; measured hand-struck plates give an internal-friction coefficient tan φ ≈ 0.018–0.022 [direct, Table I]. The definition is tan φ = α/(π f), where α is the 1/e amplitude decay rate [direct, with the formula reconstructed from garbled PDF text].

  | Material | tan φ_aud (Table I)                     | Durations   | Lowest frequency                  |
  | -------- | --------------------------------------- | ----------- | --------------------------------- |
  | Wood     | 19.29, 22.33, 19.03, 19.78, 17.55 ×10⁻³ | 0.16–0.30 s | 23–527 Hz (plates of 75–1200 cm²) |
  | Steel    | 0.27–1.05 ×10⁻³                         | 0.98 s      |                                   |
  | Glass    | 1.5–4.5 ×10⁻³                           |             |                                   |

- Listeners confused wood with plexiglass but almost never with steel or glass. Damping-related parameters explain most of the variance (Tucker & Brown, cited) [direct].
- **[inference]** From α = π f tan φ with tan φ = 0.02, T60 = ln(1000)/α ≈ **110/f seconds**:

  | Frequency | T60    |
  | --------- | ------ |
  | 300 Hz    | 370 ms |
  | 1 kHz     | 110 ms |
  | 3 kHz     | 37 ms  |

### 5. Modal synthesis: van den Doel & Pai, "Modal Synthesis for Vibrating Objects"

http://persianney.com/kvdoelcsubc/publications/modalpaper.pdf [direct]:

- Impulse response: y(t) = Σ aₙ e^(−dₙ t) sin(2π fₙ t). Damping is modelled as dₙ = ρ fₙ, which is proportional to frequency and set by internal friction. Large ρ gives a "highly damped… plastic and wood" model.
- Implementation is a reson bank: R = e^(−d/fs), θ = ω/fs.
- Contact is a raised cosine F(t) = Fmax(1 − cos(2πt/T)). "Hardness translates directly in the duration of the force." "About 50 ms will be perceived as a very soft 'thud'." Hard impacts with micro-collisions can be simulated by "a short burst of impulse trains".
- The paper gives no numeric wood ρ.

### 6. Beam modes (for estimating what frequencies a log has)

Irvine, _Bending Frequencies of Beams, Rods and Pipes_ (Rev. K), https://leehite.org/documents/Euler_Irvine.pdf [direct]:

- Free-free beam: ω₁ = (22.373/L²)·√(EI/ρ_l), with ρ_l the mass per length.
- f₂ = 2.757·f₁ and f₃ = 5.404·f₁. The next ratio, ≈8.93, is the standard 4th root and was not read from this PDF.
- The formula neglects shear and rotary inertia.

**[inference]** Assume E ≈ 10 GPa and density ≈ 500 kg/m³; these are typical dry-wood values that I did not verify against a source. Then a round billet with d = 8 cm and L = 40 cm gives f₁ ≈ 2 kHz, and a stick with d = 3 cm and L = 50 cm gives f₁ ≈ 1.2 kHz. Short, thick billets break the slender-beam assumption, so treat these as upper-end estimates.

Firewood's "clonk" therefore lives in the **hundreds of Hz to a few kHz**. A 40–80 Hz pitched component is not a wood mode. Any low "thump" comes from the bed (ash, embers, ground, other logs) and from mass, and is unpitched.

### 7. PhISEM / PhOLIES: Perry Cook, STK `Shakers` (original code)

https://raw.githubusercontent.com/thestk/stk/master/src/Shakers.cpp and https://raw.githubusercontent.com/thestk/stk/master/include/Shakers.h [direct].

The algorithm runs per sample:

1. `shakeEnergy *= systemDecay`.
2. If `rand(1024) < nObjects`, then `sndLevel += shakeEnergy` and `input = sndLevel`. Frequencies are re-jittered by ±`varyFactor` if enabled.
3. `sndLevel *= soundDecay`.
4. Sum of two-pole resonators: a₁ = −2r·cos(2πf/fs), a₂ = r².
5. A final FIR "equaliser": (1, −1, 0) = first difference, or (1, 0, −1) = band emphasis.
6. Gain = log(N)·baseGain/N.

Note that in the current STK the per-event input is the decaying level itself, not noise × level.

| Preset           | soundDecay | systemDecay | N objects | Resonance f (Hz) | radius r | vary | EQ       |
| ---------------- | ---------- | ----------- | --------- | ---------------- | -------- | ---- | -------- |
| Stix1 ("Sticks") | 0.96       | 0.998       | 2         | 5500             | 0.6      | –    | (1,0,−1) |
| Crunch1          | 0.95       | 0.99806     | 7         | 800              | 0.95     | –    | (1,−1,0) |
| Big Rocks        | 0.98       | 0.9965      | 23        | 6460             | 0.932    | 0.11 | (1,0,−1) |
| Little Rocks     | 0.98       | 0.99586     | 1600      | 9000             | 0.843    | 0.18 | (1,0,−1) |

**[inference]** The decays are per sample and so depend on sample rate. Convert with τ = 1/((1 − d)·fs). At 44.1 kHz, Crunch1's systemDecay gives τ ≈ 12 ms per shake, so a long crunch needs repeated energy injections. The event rate is N/1024 × fs, roughly 300 events/s for Crunch1 at 44.1 kHz. A resonator radius r gives a bandwidth of about (1 − r)·fs/π, so r = 0.95 is about 700 Hz wide at 44.1 kHz: a broad, noisy band, not a ring.

### 8. Contact, crumpling and breaking: SOb / SDT (Rath, Avanzini, Rocchesso et al.)

- Rath et al. 2003 (https://avanzini.di.unimi.it/downloads/publications/rath_cim03_finalsub.pdf) [direct]:
  - Hunt-Crossley-type nonlinear contact force with parameters: hardness k, exponent α, dissipation λ.
  - Crumpling triggers impacts following statistics from Houle & Sethna's crumpling-paper acoustic emission.
  - "Breaking" uses the bouncing "dropper" with high randomness and quickly decreasing temporal density, plus "a short noise impulse added to the attack". Extreme striker/resonator mass ratios were more convincing.
  - The text gives no numeric values; the equations were garbled in extraction.
- The SDT API exposes `SDTCrumpling_setCrushingEnergy / setGranularity / setFragmentation` and `SDTBreaking_setStoredEnergy` (https://sdt.lim.di.unimi.it/docs/API/v2.2-078/group__crumpling.html) [direct, API names only; from search snippet, page not fetched].
- [unverified] I could not fetch the companion crumpling statistics (power-law exponents) from Bresin et al. 2008 (speech.kth.se DNS failure).

### 9. Aeolian tones: Selfridge, Reiss, Avital & Tang (AES 141, 2016), "Physically Derived Synthesis Model of an Aeolian Tone"

https://joshreiss.github.io/documents/2016/Selfridge%20Reiss%20AES141%202016.pdf [direct]:

**Frequency**

- St = f·d/u. The lift (fundamental) is at St ≈ 0.2 and the drag dipole at St ≈ 0.4.
- St depends on Re: St = λ + τ/√Re, from Fey et al. For example, for Re in [360, 1300), λ = 0.2257 and τ = −0.4402; for [1300, 5000), λ = 0.2040 and τ = +0.3364.

**Intensity and bandwidth**

- Lift intensity ∝ u⁶, and wake noise ∝ u⁸.
- Bandwidth: Δf/f (%) = 4.624×10⁻⁵·Re + 0.9797 for Re ≤ 193,260, so Q = f/Δf.

**Partials, wake and implementation**

- Output = I_l[b(f_l) + 0.6·b(3f_l) + 0.1·b(5f_l)] + I_d[b(2f_l) + 0.125·b(4f_l)] + I_w·wake.
- The wake is brown noise (pole at 0.99), highpassed at f_l, because there is little wake noise below the fundamental.
- The model was implemented in Pure Data in real time.

**[inference]** Air at 3 m/s past a 2 mm twig gives Re ≈ 400, St ≈ 0.2, f ≈ 300 Hz and Q ≈ 100. A 1 mm needle gives about 600 Hz. A forest has a wide spread of diameters and turbulent inflow, so individual whistles smear into a band. That is why the conifer model in §10 is a broad band, not a line.

### 10. Vegetation noise: Heutschi, Pieren, Müller, Manyoky et al. (Acta Acustica 2014), after Fégeant and Bolin

https://www.dora.lib4ri.ch/empa/dload/empa:6079/PDF/Heutschi-2014-Auralization_of_wind_turbine_noise-(published_version).pdf. Values are [direct]; equation layout reconstructed from PDF text.

**Sound power:** ΔW(f) = C_R·S·(u/c)^(2χ)·Γ(f). Amplitude therefore ∝ u^χ.

**Broadleaf trees in leaf:** Γ = C₁/f + C₂·exp(−C₃(f − f_d)²/f_d²).

| Species | χ   | C₁   | C₂  | C₃  | f_d (Hz) |
| ------- | --- | ---- | --- | --- | -------- |
| birch   | 1.8 | 932  | 0.8 | 2   | 4500     |
| aspen   | 2.7 | 120  | 1.0 | 1   | 3200     |
| oak     | 1.5 | 1580 | 0.5 | 1   | 3000     |

**Leafless broadleaf trees:** Γ = C₄/f² + exp(−λ_dl·(log(f/f_dl))²), with f_dl = 0.2u/0.005, C₄ = 6×10⁴ and λ_dl = 3.

**Conifers:** Γ = exp(−λ₁·(log(f/f_s))²) + C_c·exp(−λ₂·(log(f/f₂))²), with f_s = 0.2u/d_n and f₂ = 0.2u/d₂.

| Species | χ   | λ₁  | d_n (m) | C_c | λ₂   | d₂ (m) |
| ------- | --- | --- | ------- | --- | ---- | ------ |
| pine    | 1.5 | 10  | 0.0013  | 1   | 0.50 | 0.03   |
| spruce  | 1.5 | 15  | 0.0010  | 1   | 0.16 | 0.20   |

"Fluctuations of the wind speed will thus not only alter the amplitude but the spectral content as well" for conifers and leafless trees.

**Wind-speed time series:**

- Kaimal spectrum: n·S(n)/u*² = 105·n/(1 + 33n)^(5/3), with n = f·z/ū and u* = 0.4ū/ln(z/z₀).
- Generated by FIR-filtering white noise.
- The example in Fig. 12 shows about 3–7 m/s over 100 s, 15 m inside a forest.

**Synthesis:** the vegetation FIR filter was **updated 4 times per second** and applied to white noise, with each sample scaled by √ΔW.

[unverified] The paper does not say whether `log` is natural or base 10.

- [inference] With λ₁ = 10 for pine, the band's −3 dB width is about 0.53·f_s (Q ≈ 1.9) for natural log, or about 1.3·f_s (Q ≈ 0.8) for log₁₀.
- [inference] At u = 3–5 m/s, the pine f_s is about 460–770 Hz. That is very close to our current 300–760 Hz bandpass, so the current wind already resembles a _conifer needle band_.
- [inference] The Kaimal peak of n·S(n) is at n ≈ 0.045. With z = 10 m and ū = 4 m/s, that is about 0.018 Hz, so the dominant gust energy has periods near a minute. Energy falls off as f^(−2/3) in n·S(n) toward second-scale gusts.

### 11. Microphone wind noise versus wind in trees

[unverified, abstract-only]

- Outdoor microphone wind noise is caused by atmospheric turbulence pressure fluctuations at the microphone and is a low-frequency problem (Raspet et al., JASA 2006/2008; Morgan & Raspet 1993: https://doi.org/10.1121/1.2832329, https://doi.org/10.1121/1.407592).
- [inference] The low rumble or "buffeting" in many wind recordings is a recording artefact, not the sound of the forest. Use a highpass around 100–150 Hz when comparing references to synthesis, and do not model that rumble.

### 12. Tree sound-effect generation (graphics literature)

[unverified, abstract-only] Matsuyama et al. (2003/2004) synthesise branches from Kármán-vortex frequencies, synthesise leaves separately from leaf-blade state, and drive motion with 1/f^β noise (https://doi.org/10.2312/egsl.20031086, https://doi.org/10.3756/artsci.3.76). This supports the branch/leaf split and 1/f-type gust driving, but I took no parameters from these papers.

---

## Candidate recipes for our WebAudio scene

Starting points only. Every number names its backing source or is marked [inference]. Tune by listening against the references.

### Recipe A: log or stick bundle onto the campfire

All layers are triggered at contact time t₀, with per-event random variation of ±10–20% [inference].

1. **Bed thud (unpitched).**
   - White noise burst → lowpass at 150–300 Hz with Q ≈ 0.7.
   - Envelope: 2 ms attack, then exponential decay with τ ≈ 15–30 ms.
   - Optional: one heavily damped mode at 90–160 Hz with T60 < 80 ms, and no pitch sweep.
   - Basis: van den Doel's soft-contact rule (a long contact gives a "thud") [interp], and the material damping in §4 [inference]. _Replaces the 80→42 Hz sine._
2. **Wood clonk (modal).**
   - 3–4 modes at f₁·{1, 2.76, 5.40, (8.93)}. Beam ratios from Irvine [direct]; 8.93 is the standard 4th root [unverified here].
   - Pick f₁ at random: 300–900 Hz for a log, 900–2500 Hz for sticks [inference from §6].
   - T60ₙ = k·110/fₙ s, with k ≈ 0.4–0.8 to account for extra damping from ash contact [Giordano tan φ ≈ 0.02 → 110/f; k is inference].
   - Mode gains roughly 1, 0.5, 0.3, 0.15 [inference]. Randomise them per event, because strike position changes the gains (van den Doel) [interp].
   - Excitation: raised-cosine pulse with T = 1–3 ms for log-on-log, 4–8 ms for log-on-ash (van den Doel formula [direct]; durations [inference]). The modes plus excitation pulse map well to WebAudio: an AudioBuffer generated offline, as the voice banks already do, or BiquadFilter bandpasses at high Q fed by a short pulse.
   - Level: the loudest layer, 0 dB reference.
3. **Bundle variant.** 3–8 clonks over 30–150 ms. Intervals start at about 40 ms, are multiplied by 0.6–0.8 each step, and get ±30% jitter. Clonk gains fall by 20–40% each step. Basis: the Rath et al. dropper concept with high randomness and fast-decreasing interval [interp]; numbers [inference].
4. **Ember and charcoal crunch (PhISEM).**
   - Start with shakeEnergy = 1 at t₀. Inject energy again 2–4 times over the first 300 ms as the log settles [inference].
   - Per sample: event probability N/1024 with N = 7–23; two resonators.
     - (a) Crunch1, 800 Hz, r = 0.95.
     - (b) Big Rocks, 6460 Hz, r = 0.932, ±11% jitter.
   - Mix (b) at about −6 dB relative to (a). Use soundDecay 0.95–0.98 and EQ (1, −1, 0). Source: STK [direct].
   - Convert systemDecay for 48 kHz so τ stays about 50–150 ms per injection [inference; STK's 0.998x values are per sample].
   - Overall level −10 to −16 dB relative to the clonk [inference].
   - Implement in an AudioWorklet, or pre-render several variants into buffers.
5. **Ash puff.** Lowpassed noise at 800–1500 Hz with a 20–40 ms attack and 150–250 ms decay, at −18 dB [inference only; listen for it in refs 802191 and 614885].
6. **Flare.**
   - Scale the fire's existing Farnell hiss (HP 1 kHz noise × envelope⁴) and lapping (BP 30 Hz, Q 5, with clipping) [direct, P11].
   - Envelope: +3 to +6 dB with 0.3–1 s attack, held about 1–2 s, then decaying over 3–6 s [inference].
7. **Delayed catch.**
   - Drive the _accepted_ crackle generator's event rate, not a fixed burst:
     - rate(t) = base·(1 + A·g(t)), with A ≈ 2–4;
     - g rises from 0 at t₀ + 0.5–2 s, peaks at about t₀ + 3–8 s and decays with τ ≈ 8–15 s.
   - Optionally add rare "sap/steam" hiss whistles, short narrowband noise at 2–6 kHz, for wet wood. Ambient-X has a separate "hot air leaking from wet wood" recording on Freesound.
   - All timings are [inference]; measure them on the references.
8. **Drop.**
   - Drop the 22-grains-in-2-s burst. At most 1–3 snaps should land inside the first 300 ms; they come from the crunch layer.

### Recipe B: night wind in the forest clearing

1. **Control signal w(t) in [0, 1]**, computed in JS at about 60–200 Hz control rate or in an AudioWorklet.
   - `base` = the scene's weather mapping for cloud and rain, plus a slow drift: filtered noise with energy at 20–120 s periods (Kaimal shape) [Heutschi Eq. 22 direct; mapping is inference].
   - `gust` = 2nd-order 0.5 Hz lowpassed noise × ((base + 0.5)² − 0.125) [Farnell direct]. Calibrate its scale so that gust std ≈ 0.08–0.15 [inference]. Farnell's ×50 assumes Pd audio-rate noise~ ±1 through two `lop~ 0.5`, so recompute the scale for a different update rate rather than copying 50.
   - `squall` = 2nd-order 3 Hz lowpassed noise × 20 × (8·max(base − 0.4, 0))² [Farnell direct], scaled the same way.
   - w = clip(base + gust + squall, 0, 1). Keep a ring buffer of w with 3 s of history so each layer reads its own delay [Farnell direct].
2. **Canopy body ("treetop roar").**
   - Pink-ish noise, matching the 1/f term in Heutschi Eq. 19.
   - Broad bandpass or lowpass tilt; drive the gain with w.
   - Map w to a notional u of 1–6 m/s [inference]. Amplitude ∝ u^1.5–2 (oak/birch/pine χ) [Heutschi direct].
   - Add Farnell's brightening: tilt more high frequencies in as w rises, like `rzero~` coefficient 0.6·(w + 0.2) [Farnell direct]. In WebAudio, use a highshelf or lowshelf pair driven by w.
   - Delay 0–0.3 s. Use 2–3 independent instances panned wide, because the scene is surrounded by trees [inference].
3. **Leaf / needle layer.**
   - (a) Farnell spikes.
     - Graph: white noise → `+ ConstantSource(−t)` → WaveShaper ReLU (curve = max(x, 0)) → × t → highpass 200 Hz → lowpass 4 kHz → gain (ws − 0.2) × 0.8.
     - Here ws = one-pole 0.07 Hz lowpass of (w delayed 3 s + 0.3) and t = 1 − 0.4·ws [Farnell direct]. The WebAudio mapping is [inference].
     - The noise _must_ be white, with uniform ±1 distribution like Pd's `noise~`, for the threshold statistics to match.
   - (b) Spectral shaping toward a broadleaf bump: a broad peak at f_d ≈ 3–4.5 kHz, C₃ = 1–2 (Gaussian width ≈ f_d/√C₃) [Heutschi direct]. Use, for example, a peaking EQ with Q ≈ 0.7–1. Alternatively, a conifer band at 0.2·u/0.0013 Hz (≈ 460–770 Hz for 3–5 m/s) [Heutschi direct].
   - Use 2 instances at different delays and pans.
   - The scene has ferns, grass and bushes, so add a quieter, faster-responding instance with a lower threshold for nearby low vegetation [inference].
4. **Whistles** (optional, very quiet, only when w > about 0.5).
   - Two bandpasses at Q 50–100 (Selfridge bandwidth [direct]; Farnell Q 60 [direct]).
   - Centres: 600 + 400w and 1000 + 1000w Hz [Farnell direct]. Gains (w + 0.12)²·1.2 and w²·2, then −20 to −30 dB in our mix [mix level inference].
   - Delays 500 and 900 ms.
5. **Hut doorway howl** (optional).
   - Farnell doorway 2: BP 200 Hz, Q 40, a speed window 0.25–0.5 and AM at 20 + 100·env Hz [direct].
   - Position it at the hut [inference].
6. **Creaks** (optional).
   - Sparse, about 1 per 10–60 s, more often when w is high and rising.
   - Reuse the existing stick-slip door creak at lower pitch with damped wood modes (Farnell P9, already referenced in `dark-forest-audio.md`) [inference].
7. **Remove** the two-sine gust and the single fixed-Q 0.8 brown-noise band as the _only_ layer. Its 300–760 Hz movement can be kept as the conifer-needle band in (3b) [inference].

---

## Reference recordings

All licenses and preview URLs were read from the Freesound page HTML on this run (`data-mp3` attribute and license link) [direct]. Descriptions are the uploaders' own. I did **not** listen to or download any of them, so the usefulness notes are based on the descriptions [unverified]. Freesound serves `-hq.mp3` previews at the same path with `hq` in place of `lq` [unverified per file].

### A. Log or wood onto a fire

| Recording                                                                                                             | Author      | License   | Preview MP3                                                   | Why useful                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ----------- | --------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [Firepit wood stove small fire, ember and new log 32bitfloat](https://freesound.org/people/Sadiquecat/sounds/802191/) | Sadiquecat  | CC0       | https://cdn.freesound.org/previews/802/802191_5287430-lq.mp3  | "New log on ember", low flames. Closest to the ember-crunch and settle layer. Uploader warns the preview may be very loud.           |
| [27Madera_Al_Fuego.wav](https://freesound.org/people/juliadang/sounds/468179/)                                        | juliadang   | CC0       | https://cdn.freesound.org/previews/468/468179_7721775-lq.mp3  | "Throwing wood to a chimney". A 1.56 s isolated event, good for impact timing.                                                       |
| [Wood Burning Stove](https://freesound.org/people/richwise/sounds/455132/)                                            | richwise    | CC0       | https://cdn.freesound.org/previews/455/455132_1481531-lq.mp3  | "Loading a log into an already hot wood burning stove", 3:02. Shows the delayed catch and crackle ramp. Stove (metal box) colouring. |
| [Campfire deer camp – adding kindling – med wind – part 4](https://freesound.org/people/Ambient-X/sounds/660298/)     | Ambient-X   | CC0       | https://cdn.freesound.org/previews/660/660298_13721094-lq.mp3 | Outdoor campfire, kindling thrown in. Good for the stick-bundle variant. Contains wind.                                              |
| [Wood fire in a fireplace / living room](https://freesound.org/people/flwrpwr/sounds/614885/)                         | flwrpwr     | CC BY 3.0 | https://cdn.freesound.org/previews/614/614885_12147886-lq.mp3 | "Adding a log and the fire burning", 1:56. Shows the add-then-catch timeline. Indoor.                                                |
| [pallet-on-fire](https://freesound.org/people/EricBuechel/sounds/683056/)                                             | EricBuechel | CC BY 4.0 | https://cdn.freesound.org/previews/683/683056_14801954-lq.mp3 | Pallet thrown on a big outdoor bonfire at night, "lots of crackles". Upper bound for the catch. Much bigger than our fire.           |
| [Firewood Drop 4](https://freesound.org/people/Frostnox/sounds/796642/)                                               | Frostnox    | CC BY 4.0 | https://cdn.freesound.org/previews/796/796642_14089324-lq.mp3 | Clean 0.46 s small log hitting a large branch, with no fire. Isolates wood-on-wood modes and decay for measurement.                  |
| [Throwing a log on a pile of logs](https://freesound.org/people/Sadiquecat/sounds/801818/)                            | Sadiquecat  | CC0       | https://cdn.freesound.org/previews/801/801818_5287430-lq.mp3  | 3.3 s log-on-logs in a barn, with no fire. Second clean modal reference, though barn reverb.                                         |

Deprioritised log references:

- acclivity, _LogsOnLogs.wav_: CC BY-NC 4.0 (non-commercial); usable for analysis only.
- ZapSplat, Orange Free Sounds and Pixabay copies: their own non-CC licences and/or re-hosted Freesound material.

### B. Wind in trees at night

| Recording                                                                                                          | Author         | License            | Preview MP3                                                   | Why useful                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------ | -------------- | ------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [windynight.wav](https://freesound.org/people/j1987/sounds/106134/)                                                | j1987          | CC0                | https://cdn.freesound.org/previews/106/106134_367313-lq.mp3   | "Wind blowing through the trees in a forest in Sweden at night… no rain, only wind". 22 s. Primary target.               |
| [Soft Wind in the Trees – Leaves rustle](https://freesound.org/people/Borgory/sounds/751473/)                      | Borgory        | CC0                | https://cdn.freesound.org/previews/751/751473_801011-lq.mp3   | 2:27 soft broadleaf rustle. Leaf-layer density and spectrum at low wind. Time of day not stated.                         |
| [Wind in trees 1.mp3](https://freesound.org/people/alppdcjr12/sounds/662575/)                                      | alppdcjr12     | CC0                | https://cdn.freesound.org/previews/662/662575_14530623-lq.mp3 | 46 s subtle wind in trees; a commenter calls it "perfect subtle". Gentle end of the range.                               |
| [Wind in Pine Trees, Soft Rustle, Slaley Forest, ORTF](https://freesound.org/people/Hear_it_use_it/sounds/849627/) | Hear_it_use_it | CC BY 4.0          | https://cdn.freesound.org/previews/849/849627_18634554-lq.mp3 | Moderate wind in Sitka spruce and Scots pine, long take. Tests the conifer-band hypothesis. Time of day not stated.      |
| [Wind in trees-force8-night.aif](https://freesound.org/people/surrey_film/sounds/86345/)                           | surrey_film    | CC0                | https://cdn.freesound.org/previews/86/86345_1328296-lq.mp3    | Scots pines in a force-8 gale at night. Upper bound for storm wind and squall behaviour. Uploader says the level is low. |
| Farnell P18 _wind.wav_                                                                                             | Andy Farnell   | not stated on page | https://aspress.co.uk/sd/p18/wind.wav                         | The original model's own output, for A/B comparison against our port.                                                    |

Deprioritised wind references:

- jgrzinich, _Breezy quiet night in a forest_: CC BY-NC 4.0, but otherwise ideal (4:20, soft night wind); analysis only.
- franciscopcoutinho 466122: through a window screen, in a city.
- Simon Spiers 502523: bare trees, recorded from a bedroom window. License not checked.
- PKCubed 826093: crickets dominate.
- Akacie 73723: has birds.

---

## Contradictions

- **Leaf/needle band versus our current band.** Heutschi's conifer band at 0.2u/d_n sits in our current 300–760 Hz range. The broadleaf bump sits at 3–4.5 kHz, and Farnell's leaf layer covers 200 Hz – 4 kHz. Which is right depends on the trees we depict, so this is a design decision, not a conflict in the sources.
- **Whistle Q.** Farnell uses Q 60. Selfridge's bandwidth formula gives Q ≈ 100 at low Re. Both are "narrow"; in a turbulent forest the effective Q is probably lower [inference].
- **Gust timescale.** Farnell's gusts are 0.5 Hz noise on a 10 s sine cycle. The atmospheric Kaimal spectrum puts most energy near minute periods. They are compatible if both are layered.

## Missing evidence

- I did not download or analyse any recording, so every timing in Recipe A steps 5–7 (puff, flare, catch ramp) is unmeasured.
- No source gives measured modal frequencies or decays for firewood or charcoal. The beam estimates assume E and density values I did not verify, and the slender-beam assumption fails for short billets.
- Whether "charcoal clinks brightly" is unsourced. It is presented only as an inference via the "Big Rocks" preset.
- The text of Farnell's book chapter on wind is unread.
- Aramaki & Kronland-Martinet's wood damping law fetch failed (https://www.lma.cnrs-mrs.fr/~kronland/Categorization/Aramaki_IEEE2011.pdf).
- The crumpling power-law statistics (Bresin et al. 2008) could not be fetched.
- Heutschi's log base (natural or 10) is ambiguous.
- Microphone wind-noise claims rest on abstracts only.

## Sources

- **Kept:**
  - Farnell P18 Wind (https://aspress.co.uk/sd/practical18.html): the primary wind model, with exact patches.
  - Farnell P11 Fire, for the flare layer.
  - Farnell P7 Bouncing Ball: shows the current log's lineage.
  - STK Shakers.cpp/.h: exact PhISEM code and presets.
  - van den Doel & Pai: the modal and contact model.
  - Giordano & McAdams 2006: measured wood damping.
  - Irvine beam table: mode ratios.
  - Selfridge et al. 2016: aeolian tone equations.
  - Heutschi et al. 2014: vegetation spectra, wind time series and synthesis method.
  - Rath et al. 2003: breaking and crumpling concepts.
  - The Freesound pages listed above.
- **Rejected or deprioritised:**
  - ZapSplat, orangefreesounds and Pixabay: restrictive or unclear licensing, or re-hosts.
  - NC-licensed Freesound items: analysis only.
  - The Matsuyama papers: abstract only.
  - Wind-turbine masking theses: superseded by the Heutschi summary.

## Next steps

1. Download the previews listed above into `~/Projects/dark-forest-moodboard/sounds/refs/research/`. Measure, at minimum:
   - the onset-to-catch timeline in 802191, 455132 and 614885;
   - modal peaks and T60 in 796642 and 801818;
   - the leaf band centre and gust envelope statistics in 106134, 751473 and 849627, after a 120 Hz highpass.
2. Prototype Farnell P18 `wind4` faithfully in an offline render, and A/B it against `p18/wind.wav` before adapting it to the forest.
3. If needed, fetch the Aramaki 2011 paper for a frequency-dependent wood damping law, which would refine the 110/f rule.
