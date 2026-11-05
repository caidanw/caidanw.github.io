# Research: a convincing wood knock (a log landing on a fire), and why synthesized impacts sound bit-crushed

> Background research for `src/lib/dark-forest/audio-log.ts`, after the operator heard the first rebuild as "incredibly bit crushed" without a wood-knock quality.

**Labels**

- **[direct]**: stated in the source, or read straight from the original code.
- **[interp]**: my reading of a source.
- **[inference]**: my own DSP reasoning or a design suggestion that no source states.
- **[unverified]**: not checked against a primary text.

---

## 0. What the current code does (read from `audio-log.ts`)

These observations matter for the diagnosis. Each is [direct from the code], and the level estimates are [inference].

1. **The noise "knock" probably dominates the wood layer.**
   - Code: `wood[s+i] += 12 * h.gain * lp(white) * exp(-i/tau)`, with τ = 3–7 ms, a length of 7τ (21–49 ms), and a 2nd-order RBJ lowpass at 2.5–5 kHz.
   - Level estimate: white noise in [−1, 1] has an RMS of 0.58. Lowpassed at 2.5–5 kHz (at 48 kHz) it keeps roughly 0.2–0.25 RMS, so ×12 gives about 2.5–3 RMS and peaks of about 7.
   - By comparison, each mode rings at an amplitude of about `m.a` (0.35–1.5), because a unit-area pulse into `g = sin θ` gives unit amplitude. The modes sum to a peak of perhaps 2–4.
   - `normalise(wood)` runs **after** the noise is added. So the "wood" layer is roughly a 20–50 ms burst of lowpassed white noise with modes underneath. That is a _hiss/grit burst_, not a knock.
2. **The crunch is loud, dense and bright.**
   - Each layer is normalised to peak 1 on its own and then mixed. So the crunch always sits at −5 dB·√size relative to the wood peak, whatever its real energy.
   - Collision rate: probability 8–16·√size/1024 per 44.1 kHz sample, which is **about 350–700 random clicks per second** for up to 0.5 s after each injection.
   - It includes a "big rocks" resonator at 6.46 kHz (r 0.932, about 1 kHz bandwidth). The crunch branch also goes through a first difference (+6 dB/oct).
   - The references show **about 5 discrete crunch transients per landing** (`log-sound.md`). That is orders of magnitude sparser than the synthesized micro-collision rate, even though the transient detector counts about 6 on both.
3. **Mode gains favour the upper modes.**
   - The code uses `[0.7, 1, 0.8, 0.5]` × rnd(0.5, 1.5), with the 2nd mode loudest, excited by 0.15–0.5 ms pulses. A raised cosine of width T is flat to about 1/T and has its first null at 2/T (4–13 kHz), so all four modes are fully driven.
   - STK's wood presets put the fundamental about 10 dB above the next modes (§2.1).
4. **Higher modes decay too slowly.**
   - The damping law is T60 ∝ 1/√f. Wood's internal friction gives T60 ∝ 1/f (constant tan φ), or steeper (Chaigne/Aramaki parabolic law).
   - With 1/√f, the upper modes ring relatively long. That tilts the tail toward a glassy or metallic quality.
   - The repo's own measurements say the opposite fits the references (see Contradictions).
5. **Modes are excited only by a pulse, not by a noisy or textured contact.** The Csound/Lindroth and Menzies sources (below) both say wood needs a _stochastic but resonant_ component. The current code supplies stochasticity only as _raw_ noise.

---

## 1. Ranked actionable ideas

### (a) For wood-knock quality

1. **Put the noise _through_ the resonators, or through a frequency-dependent "diffuse resonator". Do not add it to the output.**
   - STK `Modal`: the excitation (a recorded mallet wavetable) goes through a one-pole and then the mode filters. Only `directGain` of the dry stick is mixed in: 0.047 for Wood1 and 0.109 for Wood2 [direct].
   - Faust `pm.marimba`: `strikeModel` (noise → HP → LP with a 2·sharpness ms AR envelope) feeds `marimbaModel`; nothing is added dry [direct].
   - Menzies (Phya): "For less dense, more damped material such as wood, noticeable diffuse resonance occurs at modest sizes" [direct]. He models it with a band-split "perceptual resonator" [direct].
   - Recommendation [inference]: make the dry contact noise ≤ −20 dB re the wood peak, with τ ≤ 1 ms.
2. **Make the fundamental dominant and the upper modes weaker and shorter (ModalBar Wood1).**
   - With the strike-position override, the effective gains at position 0.375 are 0.111, 0.030, 0.037, 0.008. That is 0, −11, −9.5 and −23 dB [interp: computed from `setStrikePosition`].
   - Radii are 0.996, 0.994, 0.994 and 0.99 at 44.1 kHz, which gives T60 = 39, 26, 26 and 16 ms [interp: computed].
3. **Use a damping law in which decay rate grows at least linearly with frequency.**
   - α = π f tan φ (van den Doel & Pai; Klatzky et al. [direct]), or α = a0 + a2 f² for wood bars (Aramaki 2007 Eq. 10, after Chaigne & Doutaut [direct]).
   - Replace `ring·√(600/f)` with `T60 = 2.2/(f·tanφ)` and tan φ = 0.02–0.06, or with a0 + a2 f² (numbers in §3).
4. **Add a stochastic but _resonant_ high band.** Csound manual (Lindroth/Bower): "wooden objects will not sound 'wooden' unless a stochastic component is present in the sound (try banded waveguides)" [direct]. Build it as Menzies' perceptual resonator, or as Aramaki-style noise with frequency-dependent decay (§3, Recipe B).
5. **A hard impact is several micro-impacts within about 15 ms, not one clean pulse.**
   - FoleyAutomatic: a single-sample contact sounds "too 'clean'"; "microcollisions take place within 15 ms"; "an impact audio-force composed of impulses at the first 4 modal resonance frequencies sounded very convincing" [direct].
   - Menzies: "Contact models that generate sequences of microimpacts stochastically are well suited for generating complex impacts" [direct].
6. **Use more modes, and some in clusters.** Real bars have torsional and lateral modes between the bending modes. The Faust mesh2faust marimba bar has 1, 3.31, 3.83, 8.06, 9.45, 14.1, … (50 modes) [direct]. Four ideal beam modes are sparse and "synthetic" [inference]. Add 4–10 low-gain extra modes, or 2–3 near-degenerate pairs (±2–6 %), so there is gentle beating and density [inference].
7. **Use longer contact pulses for log-on-log.** 0.15 ms is a hard steel-mallet-like contact. Wood-on-wood with bark and char is softer: 0.5–2 ms for the landing and 3–10 ms for a roll onto embers [inference; the τ ↔ hardness link is direct in van den Doel/FoleyAutomatic: "the hardness is conveyed well by the duration"].

### (b) For removing the "bit-crushed" or digital character

1. **Remove or cut the 12× dry noise knock** (see §0.1). This is the most likely culprit [inference].
2. **Tame the PhISEM crunch.** [inference] for all of these.
   - Drop the 6.46 kHz "big rocks" layer, or lowpass it at about 3 kHz.
   - Cut the collision density by 10–50×, or replace it with 5–15 discrete, heavy-tailed events per landing (SDT crumpling, below).
   - Mix by absolute level, not peak-normalised, at about −15 to −20 dB re wood.
   - Dense random clicks at hundreds per second with 1–7 kHz ringing is exactly the texture of sample-and-hold or bitcrusher grit.
3. **Stop peak-normalising layers independently.** Otherwise a quiet layer is pushed up to full scale on every render [inference].
4. **Use (1 − z⁻²) numerators on resonators.** These are STK `setEqualGainZeroes` and Faust `modeFilter` [direct]. They put zeros at DC and Nyquist, so modes near Nyquist and pulse edges do not leak top-octave energy. This is a minor effect [inference].
5. **Keep every excitation band-limited.**
   - A raised cosine of ≥ 8–10 samples is effectively band-limited: its spectrum falls 18 dB/oct beyond the main lobe [inference: standard Hann-pulse spectrum]. Avoid single-sample steps and impulses into resonators that are mixed straight to output.
   - STK PhISEM _does_ feed single-sample impulses into its resonators (`input = sndLevel_` only on collision samples) [direct]. That is fine for a maraca, but harsh for wood [inference].
   - If you keep impulses, smear each one with a 2–4-sample raised cosine or a one-pole lowpass at about 4–6 kHz first [inference].
6. **Coefficient quantization is not the cause here.** JS numbers are float64, and T60 ≤ 0.6 s is far from the float32 trouble zone that the Faust docs describe ("bell or marimba mode drifted by up to 5 %… at 192 kHz") [direct for Faust; inference for applicability].
7. **Check resampling of the crackle grains.** `playbackRate` 0.9–1.1 on AudioBufferSourceNodes may use cheap interpolation in browsers [unverified]. FoleyAutomatic notes linear-interpolation resampling creates "spurious high frequency components" [direct], though they found it inaudible.

---

## 2. Per-source findings

### 2.1 STK `ModalBar` / `Modal` (Cook & Scavone): wood presets

Sources: `ModalBar.cpp`, `Modal.h`, `Modal.cpp` at https://github.com/thestk/stk (src/ModalBar.cpp, include/Modal.h, src/Modal.cpp). All values [direct].

**Presets** (ratios / radii / gains / [hardness, position, directGain]):

| Preset  | Ratios                           | Radii                         | Gains                   | Hardness, position, direct |
| ------- | -------------------------------- | ----------------------------- | ----------------------- | -------------------------- |
| Wood1   | 1, 2.777, 7.378, 15.377          | 0.996, 0.994, 0.994, 0.99     | 0.04, 0.01, 0.01, 0.008 | 0.4609, 0.375, 0.0469      |
| Wood2   | 1, 1.777, 2.378, 3.377           | same as Wood1                 | same as Wood1           | 0.3125, 0.4453, 0.1094     |
| Marimba | 1, 3.99, 10.65, −2443 Hz (fixed) | 0.9996, 0.9994, 0.9994, 0.999 | 0.04, 0.01, 0.01, 0.008 | 0.4297, 0.4453, 0.0938     |
| Clump   | 1, 1.217, 1.475, 1.729           | 0.999 ×4                      | 0.03 ×4                 |                            |

- **Strike position** overrides the gains of the first three modes: g0 = 0.12·sin(πp), g1 = −0.03·sin(0.05 + 3.9πp), g2 = 0.11·sin(−0.05 + 11πp).
- **Stick hardness:** the excitation wavetable `marmstk1.raw` (a recorded mallet strike) is played at rate 0.25·4^hardness, and `masterGain = 0.1 + 1.8·hardness`. A harder stick means a faster, shorter excitation.
- **Signal chain (`Modal::tick`):** `temp = masterGain·onepole(wave·envelope)`, then the sum of BiQuad resonators, then `out = (1−direct)·modes + direct·temp`. On a strike, the one-pole pole is set to `1 − amplitude`, so softer strikes are lowpassed more.
- **Resonators** are BiQuads with `setEqualGainZeroes()`, i.e. numerator 1 − z⁻².
- **Mode frequencies near Nyquist** are folded down by octaves (`temp *= 0.5`) to avoid aliasing.

[interp] Radii are per sample at STK's rate. At 44.1 kHz:

| Radius | T60   |
| ------ | ----- |
| 0.996  | 39 ms |
| 0.994  | 26 ms |
| 0.99   | 16 ms |

These are far more damped than our current 60–160 ms. The decay rate is fixed per mode, not per frequency, but the presets are already shortest for the top mode.

### 2.2 STK `Shakers` (PhISEM): what the crunch really is

Source: `Shakers.cpp` / `Shakers.h` (thestk/stk master). [direct]

| Preset       | Sound decay | System decay | Objects | Resonator       | Equalizer | Frequency jitter |
| ------------ | ----------- | ------------ | ------- | --------------- | --------- | ---------------- |
| Crunch1      | 0.95        | 0.99806      | 7       | 800 Hz r 0.95   | 1 − z⁻¹   | none             |
| Big Rocks    | **0.98**    | 0.9965       | 23      | 6460 Hz r 0.932 | 1 − z⁻²   | varyFactor 0.11  |
| Little Rocks | 0.98        | 0.99586      | 1600    | 9000 Hz r 0.843 |           | varyFactor 0.18  |

- A collision happens if `randomFloat(1024) < nObjects`. Then `sndLevel += shakeEnergy; input = sndLevel`.
- **On non-collision samples `input = 0`.** So the resonators are driven by sparse single-sample impulses (this version of STK).
- Gain = log(N)·baseGain/N.

Differences in the repo [interp]:

- It feeds the decaying `level` _every_ sample. That is a sum of 0.45 ms one-sided exponentials, softer than STK.
- It uses 0.95 for big rocks where STK uses 0.98.
- It draws its own collision rate.

Neither form is "wood". PhISEM is built for shakers and gravel, and at our density and level it is a gravel or static texture [inference].

### 2.3 Faust `physmodels.lib` (Michon, Smith, Chafe et al.)

Source: https://github.com/grame-cncm/faustlibraries/blob/master/physmodels.lib. [direct]

- **`modeFilter(freq, t60, gain)`:** `(1 − z⁻²)/(1 − 2r cos w z⁻¹ + r² z⁻²)`, with r = 0.001^(1/(t60·SR)). It is implemented as a Chamberlin SVF for float precision. The library notes that direct form loses poles in float near z = 1.
- **`strikeModel(HP, LP, sharpness, gain, trigger)`:** `noise : highpass(2, HP) : lowpass(2, LP) : *(en.ar(att, rel, trig))`, with att = rel = 0.002·sharpness s.
  - `pm.marimba` uses `strikeModel(10, strikeCutoff ≈ 7000, sharpness ≈ 0.25, …)` into `marimbaModel`.
  - So the excitation is a noise burst of about 0.5 + 0.5 ms that only reaches the output through the modes.
- **`marimbaBarModel`:** 50 modes from a mesh2faust FEM model.
  - Ratios: 1, 3.31356, 3.83469, 8.06313, 9.44778, 14.1169, 18.384, 21.0102, 26.1775, 28.9944, …
  - T60_i = t60·(1 − ratio_i/195.955·t60DecayRatio)^t60DecaySlope.
  - Recommended t60 = 0.1 s, ratio = 1, slope = 5. Output = sum/nModes.
- **`djembeModel`:** 20 modes at f + 200i, T60 = (20 − i)·0.03 s, gains 1/(i+1)².

### 2.4 Wood damping and material perception

- **Klatzky, Pai & Krotkov 2000** (Presence 9(4)), https://www.cs.ubc.ca/labs/lci/papers/docs2000/pai-KlaPai00.pdf.
  - Model [direct]: amplitude ∝ exp(−π tanφ f t)·sin(2πft); t_e = 1/(π f tanφ); τ_d = 1/(π tanφ).
  - Stimuli [direct]: f = 100–1000 Hz and τ_d = 3–300.
  - Categories [direct]: the 50 % critical log τ_d was 0.46 (rubber), 0.50 (wood), 2.10 (glass) and 2.65 (steel). Decay was the dominant cue.
  - [interp, log base unstated] Wood answers sit at τ_d ≲ 3, i.e. tan φ ≳ 0.1, which is very heavily damped. tan φ = 0.03 (τ_d ≈ 10) is already in the mixed wood/glass zone for a pure modal tone.
- **Giordano & McAdams 2006** (JASA 119): measured wooden plates have tan φ ≈ 0.018–0.022, about 20× steel [direct, via the repo's earlier doc `log-and-wind-synthesis.md`].
- **Aramaki et al. 2007**, "Sound quality assessment of wood for xylophone bars", http://kronland.fr/wp-content/uploads/2016/08/jasa_Xylophone.pdf. [direct]
  - α(f) = a0 + a2·f² for wooden bars (Eq. 10). Q_n = π f_n/α_n.
  - At 1002 Hz, α1 = 14.3–45.6 s⁻¹ (mean 26.1). [interp] That is T60 = 6.91/α = 150–480 ms and tan φ = α/(πf) ≈ 0.005–0.015.
  - These are _selected xylophone tonewoods_. Firewood (cracked, green or charred, resting on a bed) will be well above this.
- **Aramaki et al. 2011**, IEEE TASLP 19(2) "Controlling the perceived material…", https://hal.science/hal-00465085/document.
  - [direct] They define "a damping law chosen as an exponential function" with a global parameter (α_G) and a relative, frequency-dependent parameter (α_R), and note the parabolic law for wood bars.
  - [direct] Wood and glass sounds have "relatively poor spectra (i.e., few components)". Only components within 30 dB of the maximum were synthesized.
  - [direct] Reference sounds were built from the same 500 Hz, 40-component harmonic set by changing only damping and spectral shaping. The Wood reference was tuned to C3.
  - [unverified] The exact form α(ω) = e^(α_G + α_R·ω) and the Table II values for Wood. The PDF text extraction stripped the formulas and table values, so no wood numbers can be quoted.
- **Aramaki et al. 2009** (LNCS 5493), https://kronland.fr/wp-content/uploads/2015/08/2009_LNCS_Aramaki1.pdf. [direct]
  - Wood is "non harmonic" with high modes "rapidly damped".
  - Normalised sound decay α is −0.088 dB (Wood), −0.037 (Glass) and −0.013 (Metal).
  - The Wood spectral centroid is 2573 ± 597 Hz.
  - "Damping did not entirely characterize the Wood category" (spectrum matters).
- **Avanzini & Rocchesso 2001** / SOb book: tan φ = 1/(π f t_e) = Q⁻¹; the material ordering follows decay [interp, from secondary summary; not fetched in full].
- **McAdams et al. 2004/2010** on wood species: **not fetched** [unverified].

### 2.5 van den Doel, Kry & Pai: FoleyAutomatic (SIGGRAPH 2001)

Source: https://www.cs.mcgill.ca/~kry/pubs/foleyautomatic/foleyautomatic.pdf. [direct]

- Force pulse 1 − cos(2πt/τ) for 0 ≤ t ≤ τ. "The hardness is conveyed well by the duration".
- Hard contacts "sound too 'clean'… when represented by a single non-zero sample". The fix: "a short burst of impulse trains at the dominant modal frequencies". Four modal-frequency impulse trains "sounded very convincing". "Microcollisions take place within 15 ms".
- Modal model y(t) = Σ a_n e^(−d_n t) sin(2π f_n t). The paper gives no wood values.

### 2.6 SDT, the Sound Design Toolkit (Baldan, Delle Monache, Rocchesso)

Source: https://github.com/SkAT-VG/SDT, src/SDT/SDTInteractors.c and SDTControl.c. [direct]

- **Impact (Marhefka–Orin / Hunt–Crossley):** f = k·p^α·(1 + λ·v) while p > 0, where p is compenetration and v the relative velocity. It is solved with energy correction. There are no wood presets in the code or handbook. The handbook points to CLOSED D2.3 [not fetched].
- **Crumpling** (the alternative to PhISEM for crunch):
  - Each sample, an event fires with probability = granularity.
  - Event energy = crushingEnergy·clip(expRand(1.45), 0.1, 10). Fragment size = (1 − frag + frag·rand)·(0.5 + 0.5·rand). Size scales the resonator.
  - [interp] Energies are heavy-tailed and sizes vary, so it reads as discrete cracks rather than uniform grit. [unverified] The exact distribution of `SDT_expRand`.
- **Breaking:** the same, but with a stored-energy budget, so events thin out as energy is used up.

### 2.7 Menzies, "Physically Motivated Environmental Sound Synthesis for Virtual Worlds" (Phya), EURASIP JASMP 2010

Source: https://link.springer.com/article/10.1155/2010/137878. [direct]

- "Modal resonators are less suitable for more diffuse resonances … such as wooden furniture."
- Wood "noticeable diffuse resonance occurs at modest sizes".
- **Perceptual resonator:** "dividing the excitation into frequency bands. The energy in each band is filtered with a onepole filter … The resonant energy in each band then modulates a matching synthesized output noise band". "When combined with modal synthesis for lower frequencies, it can efficiently simulate wood resonance."
- **Contact damping:** "multiplying damping factors from each surface onto each resonator it is in contact with". Hardness is the combined (lesser) stiffness: a soft surface makes a soft collision. Stiffer contact gives a "reduced duration and a brighter excitation".
- [unverified] The band count and decay values; they are not in the extracted text.

### 2.8 Csound manual: modal frequency ratios (Lindroth/Bower)

Source: https://csound.com/manual/misc/modalfreq/. [direct]

- Uniform wooden bar: 1, 2.572, 4.644, 6.984, 9.723, 12.
- Wood plates (red cedar, redwood, Douglas fir): 1, 1.42–1.47, 2.09–2.11, 2.47–2.57.
- Xylophone: 1, 3.932, 9.538, 16.688, …
- "wooden objects will not sound 'wooden' unless a stochastic component is present".

### 2.9 Farnell, _Designing Sound_

- There is **no wood-knock practical.** Practical 26 (Footsteps, `foot2.pd`) has a `wood` floor texture: two `noise~` banks through very narrow `bp~` (Q 90) at 95, 134, 139, 154 Hz and 123 (Q 20), 156, 189, 201 (Q 70–90) Hz, scaled by √ and squared foot pressure [direct, extracted via fetch tool from the Pd file].
- [interp] Farnell's wood is _noise through resonant filters_, i.e. stochastic resonance, again. Practical 7 (ball) is what the old log resembled.
- https://aspress.co.uk/sd/practical26.html

### 2.10 Nathan Ho, "Exploring Modal Synthesis" (2019)

Source: https://nathan.ho.name/posts/exploring-modal-synthesis/. [direct, practitioner]

- "Setting all your modes to the same decay time… rarely sounds good. Frequency-dependent damping is important."
- Model: R_k = b1 + b3·f_k². Short triangular DC impulses are "useful enough for many practical purposes".
- Gains A_k = sin(πkx) for strike position x, randomised per hit. Use impulse-invariant resonators.

### 2.11 Woodblock and slit drum (hollow "tok")

Source: Logos Foundation, temple blocks, https://logosfoundation.org/instrum_gwr/temblo.html.

- [direct] They act "much like a tuning fork and their cavity like a Helmholtz resonator. The pitch of both elements should be matched for a good hollow and resonating sound."
- [inference] A solid log has no Helmholtz cavity. A hollow-sounding "tok" comes from one dominant low-mid mode with moderate Q and little top end, not from a cavity, unless the log is hollow or rotten.

### 2.12 Not consulted or unavailable

- Cook, _Real Sound Synthesis for Interactive Applications_: wood examples **not verified** (no full text).
- STK BandedWG: no wood preset as far as I know [unverified].
- van den Doel & Pai, "Sounds of physical shapes" (1998): only a summary; t_i = 1/(π f_i tanφ) [interp].
- GDC procedural-impact talks: none found with numbers.

---

## 3. Candidate recipes (sample-by-sample JS)

Notation: `res(f, T60, g)` is a two-pole with numerator g·(1 − z⁻²)/2 (or `g·sinθ`, as now). `rc(T)` is a unit-area raised cosine of width T.

### Recipe A: "ModalBar-wood" knock (minimal change, highest priority)

| Parameter     | Value                                                                                                                                                      | Source                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode ratios   | Beam 1, 2.757, 5.404, 8.933, or Wood1 1, 2.777, 7.378, 15.377                                                                                              | Irvine (repo); STK Wood1 [direct]                                                                                                                   |
| f1            | 300–700 Hz (keep the current size law)                                                                                                                     | refs median 825 Hz (`log-sound.md`)                                                                                                                 |
| Gains         | 1, 0.3, 0.3, 0.07 (0 / −10 / −10 / −23 dB), each × rnd(0.7, 1.3), or sin(πk·x) with x ~ U(0.2, 0.45)                                                       | STK Wood1 with strike override [interp]; Ho [direct]                                                                                                |
| Damping       | T60_k = 2.2/(f_k·tanφ), tan φ = rnd(0.025, 0.06). At f = 500 Hz that is 73–176 ms; at 1.4 kHz 26–63 ms; at 4.5 kHz 8–20 ms. Cap the mode-1 T60 at 250 ms   | van den Doel/Klatzky law [direct]; tan φ range between Giordano (0.02) and Klatzky wood (≥ 0.03–0.1) [interp]; refs mode T60 median 121 ms (33–894) |
| Excitation    | Main landing: rc(T) with T = 0.5–1.5 ms, then 2–4 micro-impacts at +1–12 ms, each at −6 to −18 dB and T = 0.3–1 ms. Settles: T = 2–6 ms                    | FoleyAutomatic: microcollisions within 15 ms [direct]; T values [inference]                                                                         |
| Contact noise | Optional. The _same_ excitation shape × white noise (STK/Faust style), **fed into the resonators**. Dry mix ≤ 0.05 of the wood peak (STK directGain 0.047) | STK Wood1 [direct]; Faust strikeModel [direct]                                                                                                      |
| Second body   | The struck log: f1 × 1.2–1.9, same law, −3 to −6 dB                                                                                                        | (current)                                                                                                                                           |

### Recipe B: modal low end + "perceptual (diffuse) resonator" high end (the most "wooden")

Low part: Recipe A's 3–4 lowest modes.

Diffuse part (Menzies' structure [direct]; numbers [inference]):

1. **Bands:** 8 bands at 1/2-octave spacing from 700 Hz to 8 kHz (centres about 0.7, 1, 1.4, 2, 2.8, 4, 5.6, 8 kHz). Each is a 2nd-order bandpass on independent white noise, with Q ≈ 2–3.
2. **Envelope:** each band's envelope is the excitation energy in that band (here simply the impact strength × the rc(T) spectrum |sinc|-like rolloff, i.e. weaker above 1/T), decayed by a one-pole.
3. **Decay:** use the same damping law, T60_band = 2.2/(f·tanφ_diffuse) with tan φ_diffuse = 0.05–0.1. That gives about 30–60 ms at 700 Hz and 3–5 ms at 8 kHz.
4. **Spectral tilt:** band gains fall about 6 dB/oct above 2 kHz. This targets the refs' 2–8 kHz share of 9 % and > 8 kHz of 2 %.
5. **Level:** the diffuse sum sits at −10 to −16 dB re the modal peak.

This replaces the current 12× LP-noise knock. It is the same idea as Aramaki & Kronland-Martinet 2006 ("dynamic filtering of noisy input signals that simulates the damping of spectral components") [direct, abstract only] and Farnell's noise-into-narrow-bandpass wood texture [direct].

### Recipe C: the log on a fire bed (contact-damped, with sparse crunch)

1. **Landing.** Recipe A or B, with T = 0.8–2 ms (bark and char soften the contact) [inference].
2. **Contact damping.**
   - About 20–60 ms after the landing, multiply every mode's decay _rate_ by 1.5–3. This models the log coming to rest on embers and another log (Menzies' "multiply damping factors… while in contact" [direct]; values [inference]).
   - A free bar on node supports barely loses energy through the supports (Brémaud on Chaigne & Doutaut [direct, secondary]). A log lying along its length on a bed does lose energy, so its modes die faster.
3. **Bed thud.**
   - Replace the lowpassed white-noise thud with rc(T = 6–15 ms) into one or two broad resonators at 90–200 Hz, Q ≈ 1–2, at about −14 dB.
   - Or keep the noise, but at ≤ 0.1 relative level and lowpassed with 2 × 2nd-order filters.
   - Refs: < 150 Hz is 2 % of energy and 150–500 Hz is 27 % [direct from `log-sound.md`]. Design [inference].
4. **Crunch as sparse events (SDT crumpling style).**
   - Draw 4–12 events over 15–800 ms, Poisson in time and denser early. Refs: 5 (0–16), last at about 636 ms.
   - Each event's energy = E·clip(Exp-like heavy tail, 0.1, 10) (SDT [direct]).
   - Each event is rc(0.1–0.3 ms) into 2–3 modes at 1.2–4 kHz × size jitter, with T60 4–15 ms. A light (1 − z⁻²) numerator is fine.
   - Mix at −14 to −20 dB re wood, by absolute level.
   - Optional texture: a very quiet PhISEM-crunch (800 Hz only, no 6.46 kHz) at ≤ 50 collisions/s, or none.
5. **Puff and flare:** unchanged.

### Recipe D: woodblock / hollow "tok" (for small kindling or a hollow log)

- **One dominant mode** f0 = 600–1500 Hz, Q_eff ≈ 15–40 (T60 = 2.2·Q/f ≈ 25–100 ms).
- **A second mode** at about 2.3–3.3 × f0, −12 dB, half the T60. Faust's marimba bar has its 2nd and 3rd modes at 3.31 and 3.83 [direct]; the 2.3–3.3 range is [inference].
- **Optional "cavity"** at 0.95–1.05 × f0 with a slightly longer T60. This follows the matched-pitch temple-block rule [direct].
- **Excitation:** rc(0.3–0.8 ms) and 1–2 micro-impacts. No dry noise.
- Values other than the cited ratios are [inference].

---

## 4. Contradictions

- **Damping law versus the repo's measurements.**
  - Physics and perception sources favour T60 ∝ 1/f or steeper for wood: Klatzky/van den Doel; Aramaki's parabolic a0 + a2 f²; STK Wood1 (fastest top mode); Faust marimba (T60 falls with ratio).
  - `log-sound.md` reports that the recorded logs' modes (0.3–1.7 kHz) "all die in 70–500 ms, nearly whatever their frequency", which motivated √(600/f).
  - Possible reconciliation [inference]: the measured "mode T60" includes room or fireplace reverb, crackle and noise floor, which flatten the apparent decay. Recordings in fireplaces and stoves (455132 is a metal box) add a resonant enclosure.
  - Not resolved. Test it by measuring the T60 of the 2nd and 3rd peaks separately, with reverb-robust fitting (early-decay slope, the first 20 dB).
- **How damped "wood" is.**
  - Giordano & McAdams measure tan φ ≈ 0.02 for real wood plates.
  - Klatzky's listeners called a single-bar synthetic tone "wood" only at about tan φ ≳ 0.1 [interp; log base unstated].
  - STK Wood1 is about 0.09 at 600 Hz [interp].
  - Xylophone tonewoods measure about 0.005–0.015 (Aramaki 2007).
  - So synthetic wood is typically _more_ damped than measured wood, presumably to compensate for the missing stochastic and diffuse component [inference].
- **Grain density.** PhISEM's crunch runs at hundreds of grains per second, while the refs show about 5 transients per landing. The repo's detector counts about 6 on both, so the detector does not separate the two textures.

## 5. Missing evidence

- The Aramaki 2011 Table II values (α_G, α_R for Wood) and the exact damping-law equation. The PDF text extraction dropped them. Need the PDF read visually: https://www.lma.cnrs-mrs.fr/~kronland/Categorization/Aramaki_IEEE2011.pdf (fetch failed).
- Menzies' perceptual-resonator band count and decays. Cook's book wood examples. The SDT CLOSED D2.3 impact parameters. McAdams 2004/2010 wood-species damping values.
- No listening test was done. The "bit-crushed" diagnosis in §0 is inferred from code and arithmetic: the noise level ×12 and the crunch density. It should be confirmed by soloing layers (wood without knock, crunch alone).
- Whether the operator's playback context runs at an unusual sample rate. Whether browser `playbackRate` resampling of the crackle grains contributes.

## 6. Next steps

1. **Ablation render**, 10 landings each:
   - (i) current;
   - (ii) knock gain 12 → 0;
   - (iii) crunch off;
   - (iv) both off.
     Add a spectral-flatness or tonality metric in 0.5–4 kHz over 0–30 ms and 30–150 ms, compared with the refs. Band shares alone do not capture "noisy versus tonal".
2. **Implement Recipe A first** (gains, damping law, micro-impacts, noise through resonators), then add Recipe B's diffuse band if it still sounds "plinky".
3. **Re-measure the per-mode T60 on the references** with an early-decay fit, to settle the 1/f versus 1/√f question.
