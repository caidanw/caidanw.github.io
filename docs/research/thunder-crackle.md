# Research: thunder crackle / crack — physics and procedural synthesis (for a WebAudio rebuild)

Background research for the dark-forest thunder crack.

Our own measurement of the close-strike references (`moodboard/shots/thunder-crackle-zoom.png`): above 800 Hz, their kurtosis is 8–222 (noise = 3). Distinct pulses above 25% of peak occur at 4–88/s, with median widths of about 0.5–0.9 ms. That is sparse, sharp shocks over a quieter bed. Our band-passed-noise crack measured kurtosis 5.8 and about 175 events/s: a dense, even wash.

Labels used throughout:

- **[direct]**: stated in the cited source, or read directly from the original patch or code.
- **[interp]**: my reading of a source, e.g. decoding a Pd patch into numbers.
- **[inference]**: researcher reasoning that no source states.
- **[secondary]**: a hobbyist or tutorial source, or a claim known only from a search snippet or abstract.
- **[unverified]**: I could not open the original.

---

## Summary

The physics literature describes close thunder as a superposition of many N-shaped shock pulses, one from each kink of the tortuous channel.

- Each pulse lasts on the order of a millisecond to ~5 ms.
- Arrival order and density come from channel geometry relative to the listener.
- A _clap_ is many pulses arriving in phase. The _tearing/ripping_ is a fast succession of distinct pulses whose spacing grows as more distant parts of the channel arrive.

None of the published models sounds like a crack made of a few long band-passed noise bursts. Our current crack is 3–5 overlapping 0.25–0.8 s bursts, and is therefore missing the cue that makes a crack read as "tearing": dozens to hundreds of **very short, sharp, individually audible impulses**, dense at first and then thinning out.

Farnell's actual `strike-pattern` patch, decoded below, does exactly this with ~20 events in ~1 s:

- inter-onset gaps grow from ~1 ms to ~100 ms;
- burst lengths grow from 2 ms to ~1 s;
- band centres fall from 1.3 kHz to 100 Hz.

The earlier "dropout" artifact is avoidable. The pulses must be added on top of a continuous bed, never gated out of one. They should also be either far shorter than 20 ms (heard as clicks) or long and overlapping.

---

## Ranked actionable ideas

1. **Port Farnell's strike-pattern timing exactly.** This is the cheapest change with the highest confidence.
   - Replace the 3–5 long bursts with ~20 events over ~1 s.
   - Event _k_ fires at Σx, where the accumulator x grows by U(0, 9.9) ms per event, from 1 up to 100 ms.
   - Burst length is `(x/100+0.4)^5·200 ms` (2 ms → ~1 s).
   - Each burst feeds two bandpasses at `100+1200·(1−x/100)` Hz and half that, both Q 3.
   - Source: original patch, decoded in §B1. **[direct + interp]**
2. **Make the earliest events true pressure pulses, not noise.** Use N-waves (fast rise, linear fall to negative, fast return), or WM parabolic doublets, 0.5–5 ms long. Farnell `nwave.pd`, Wright–Medendorp/Ribner–Roy via Glassner and Reiss, and Saksela's Brode pulse all use deterministic pulse shapes for the shock. §B1, §B3, §B4. **[direct]**
3. **Derive pulse arrival times from a random channel geometry, pre-rendered per strike.**
   - Build a random-walk channel (segments 5–70 m, or steps of ~8 m with ~16° mean deflection).
   - Time each kink by `r/c` and set its amplitude ∝ length/r.
   - Clap clusters, the accelerate/decelerate density and the stereo spread then emerge naturally.
   - Sources: Glassner, Reiss 2021, Saksela code, Dayeh 2015. §A, §B3–B5. **[direct for the method; inference for the crackle-specific numbers]**
4. **Never multiply the crack against a gate. Add pulses over a continuous bed.** Our own measurement showed the dropout cue is a ≥12 dB dip in 300–1500 Hz recovering within 60 ms. Keep the existing 0.4–2.5 kHz bursts as a _bed_, roughly 6–10 dB below the pulse peaks, so the band never empties. §D. **[inference from our measurement]**
5. **Repeat the signature for multiple return strokes.** Use 1–4 extra copies of the same pulse train (same channel), 20–300 ms apart, each quieter. Sources: Reiss 2021 (~60 ms), Dayeh 2015 (measured intervals 17–287 ms), Glassner. **[direct]**
6. **Add asymmetric soft waveshaping on the summed pulses.** This gives the clap its "weight" and flattens the brittle top. Use Brookes' waveshaper formula (§B6), then a fast compressor (Fineberg: −20 dB threshold, ratio 12, knee 20 dB, attack 0, release 0.5 s). **[direct; Brookes details partly via Reiss]**
7. **Distance processing.**
   - Lowpass cutoff ∝ 1/distance (Reiss).
   - Slightly lengthen pulses with distance (Ribner–Roy stretch factor, §A4).
   - Optionally sweep the lowpass darker over the first ~12 s, as Farnell's `distance` line does. **[direct]**
8. **Stereo and early reflections.**
   - Pan each pulse by its channel segment's horizontal position, with small random jitter.
   - Add a short reverb or reflections to the crack only (Fineberg: feedback delay 0.6 s at 0.15; Saksela's reverb: 0.17 s predelay, 0.14 s attack, 2 s release).
   - Reiss found reverb had a "huge effect" on perception, and that mono output was a major limitation of every published model. **[direct]**

---

## A. Physics and acoustics findings

### A1. What crackle, clap and rumble are

- **Claim:** Rumble comes from varying arrival times along the sinuous channel. An "initial tearing sound" is attributed to the stepped leader, and the "sharp click or crack heard at very close range, just prior to the main crash" to the ground streamer. Distant thunder is low-pitched because high frequencies are attenuated.
  **Source:** [AMS Glossary, "thunder"](https://glossary.ametsoc.org/wiki/thunder/). **Support:** direct. **Confidence:** medium. This is an authoritative glossary, but the leader/streamer attribution is old and disputed (see Contradictions).
- **Claim:** In the WM model, the wave from one straight segment depends on the listener's angle to it.
  - Perpendicular → a plain N-wave.
  - Oblique → the ends round into parabolic arcs.
  - At sin θ = φ → two parabolas with no linear part between them.
  - Larger angles → the parabolas separate.

  Two **colinear adjacent segments cancel**: the positive lobe of one cancels the negative lobe of the next. "It's the kink, or angle, between them that determines the acoustic wave they generate."

  Further: a **clap** occurs where a section of channel forms an arc centred on the listener, so all wavefronts arrive together ("essentially no duration"). **Rumble** is channel nearly end-on to the observer. **Roar** is a region of high tortuosity.

  **Source:** [Glassner, "The Digital Ceraunoscope, Part 2", IEEE CG&A 2000](https://glassner.com/wp-content/uploads/2014/04/CG-CGA-PDF-00-05-The-Digital-Ceraunoscope-2-May00.pdf), summarising Wright & Medendorp 1968 and Ribner & Roy 1982. **Support:** direct. **Confidence:** high (as a model).
  - **[inference]** For synthesis this means the crackle is a train of discrete pulses, one per kink, not a noise band. Amplitude should grow with kink angle; straight runs contribute little.

- **Claim:** About 80% of the acoustic energy is radiated within 30° of the plane perpendicular to a macro-tortuous segment. Observers in that region hear claps; others hear rumble.
  **Source:** [Wikibooks, Engineering Acoustics/Thunder acoustics](https://en.wikibooks.org/wiki/Engineering_Acoustics/Thunder_acoustics), attributed to Few 1995. **Support:** direct from a secondary source. **Confidence:** low–medium. **[secondary]**
- **Claim:** Ribner & Roy's quasilinear model of tortuous lightning predicts the rumble and roll. Nonlinear treatments of a straight channel cannot, since they "yield but a single short thunderclap". A 1975 version was "made briefly audible".
  **Sources:** [Ribner & Roy 1982 abstract](https://doi.org/10.1121/1.388621); [Roy & Ribner 1980 JASA abstract](https://pubs.aip.org/asa/jasa/article/68/S1/S3/656147/Acoustics-of-thunder-III-Mapping-the-3-dimensional). **Support:** direct (abstracts only; full text was 403). **Confidence:** medium.

### A2. Pulse shape and duration

- **Claim:** The typical WM/N-wave duration is **T ≈ 5 ms** on segments of **l ≈ 3 m**. The received WM-wave lasts `2(l|sin φ|/c + T)`. The dimensionless quantities are `τ=(ct−r)/l`, `ψ=cT/l` and `B=l²/(2rcT)`, with amplitude ∝ 1/r.
  **Source:** [Reiss, Tez & Selfridge, AES e-Brief 640 (2021)](https://joshreiss.github.io/documents/2021/21101.pdf). Glassner gives the same T ≈ 5 ms and l = 3 m. **Support:** direct. **Confidence:** high that these are the values the models use. They are not field measurements.
- **Claim:** The relaxation radius is about 3–5 m, and structure smaller than it is "sonically blurred away". The shock loses ~99% of its energy within a few metres.
  **Source:** Glassner 2000. **Support:** direct. **Confidence:** medium.
- **Claim:** The Brode-pulse alternative has a sharp front that arrives first, with polynomial shape `y = −0.0279x −0.376x² −0.485x³ +0.596x⁴ −0.1259x⁵`.
  - In Saksela's code the pulse spans x = 0–2.5 m for a positive-phase length of 0.5 m, which is **≈1.5 ms**.
  - The code uses `Rc = 0.5 m`.
  - The ground positive length is `Lg = Rc·(0.386 + 0.147·(ln(H/(10.46·Rc·cosθ)) − H/16000))^(2/3)`.

  **Sources:** Reiss 2021; Saksela `lightning_worker.js` in [joshreiss/thunder-simulation-evaluation](https://github.com/joshreiss/thunder-simulation-evaluation) (archive copy; original at [kai5z/Thunder-simulation](https://github.com/kai5z/Thunder-simulation), GPL). **Support:** direct, read from the code. **Confidence:** high that this is the implementation.

- **Claim:** Each stroke starts at ~24,000 K and ~10⁶ Pa, and the shock expands at ~3000 m/s before relaxing to an acoustic wave.
  **Source:** Reiss 2021, citing Orville 1968 and Few. **Support:** direct. **Confidence:** medium.

### A3. Spectrum: peak frequency and energy

- **Claim:** Few's 1969 model says the thunder spectrum resembles that of a short segment with the energy per unit length E_l of the most energetic stroke. The peak frequency lets one estimate E_l.
  **Source:** [Few 1969 abstract](https://agupubs.onlinelibrary.wiley.com/doi/abs/10.1029/JC074i028p06926). **Support:** direct. **Confidence:** medium.
  - The form usually quoted is `f_m = 0.63·c0·√(P0/E_l)`, with relaxation radius `R_c = √(E_l/(πP0))`. **[secondary/unverified]:** only a search summary and Wikibooks give this (Wikibooks omits the 0.63), and I could not open the paper.
- **Claim:** Forty thunder events gave a low-Q spectrum (Q 0.5–2) with peak power between <4 and 125 Hz. Intracloud and CG thunder differ.
  **Source:** [Holmes, Brook, Krehbiel & McCrory 1971 abstract](https://doi.org/10.1029/jc076i009p02106). **Support:** direct (abstract). **Confidence:** medium–high.
- **Claim:** Glassner states measured thunder spectra "fall off at around 200 Hz", with most energy at or below 200 Hz.
  **Source:** Glassner 2000. **Support:** direct. **Confidence:** medium.
- **Claim:** Lacroix et al. found flat spectra with no clear peak near 150 Hz, contrary to Few's model. Their 2018 data were 0.1–180 Hz at 0.3–20 km.
  **Sources:** [Coulouvrat & Farges slides](https://acoustique.ec-lyon.fr/LETMA/Coulouvrat_Farges.pdf) (**search snippet only; fetching failed**); [Lacroix et al. 2018 JGR abstract](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2018JD028814). **Confidence:** low–medium. **[secondary]**
- **Claim:** At 95 m from a triggered channel, there is strong acoustic content above 1 kHz. Beamforming above 1 kHz shows a "wing": the nearest (lowest) part of the channel arrives first, then the higher parts. Overall power is still concentrated at low frequency.
  **Source:** [Dayeh et al. 2015, GRL "First images of thunder"](https://repository.fit.edu/cgi/viewcontent.cgi?article=1451&context=apss_faculty). **Support:** direct. **Confidence:** high.
  - **[inference]** Energy rises toward the bass, but the _perception_ of crack lives in the kHz band. The crack layer can be a small share of energy (our refs: ≤7.6% in 0.8–3 kHz) and still be decisive.

### A4. How distance changes the waveform

- **Claim:** Near the channel, nonlinear effects strongly shape the waveform and the near-field spectrum. Atmospheric absorption also changes the signature significantly from source to receiver, even though it is "not large".
  **Sources:** [Bass 1980 JASA abstract](https://pubs.aip.org/asa/jasa/article/67/6/1959/768842/The-propagation-of-thunder-through-the-atmosphere); [Losey & Bass JASA abstract](https://pubs.aip.org/asa/jasa/article-pdf/55/S1/S75/18783388/s75_5_online.pdf). **Support:** direct (abstract fragments). **Confidence:** medium.
- **Claim:** Under Otterman's theory, a single large pulse evolves into an N-wave and then lengthens with further propagation. Visco-thermal losses "erode" the front into a rounded profile.
  **Sources:** the Ouyang & Yuan 2012 J. Earth Syst. Sci. snippet (full text was 403); Wikibooks. **Support:** snippet. **Confidence:** medium. **[secondary]**
- **Claim:** The model of stretch with distance is `k = ln(1000/10)/ln(r/10)`, `ψ_i = k^½·ψ` and `B_i = k·B`, i.e. a=10 and r0=1000 m in Glassner.
  **Sources:** Reiss 2021; Glassner 2000. **Support:** direct. **Confidence:** high (as model formula).
  - **[interp]** k = 1 at 1 km and ≈0.81 at 3 km, so the duration factor is about 0.9.
- **Claim:** Reiss recommends modelling air absorption as a lowpass with cutoff ∝ 1/distance, after ISO 9613-1 and Huopaniemi et al. "Distant sounds [should] 'rumble' while the closest sounds are sharp and discernible."
  **Source:** Reiss 2021. **Support:** direct. **Confidence:** high (as recommendation).
- **Claim:** Refraction curves the rays along circular arcs, with radius ~80 km in still air and ~55 km in storms. This creates a ground shadow zone: at 3 km, the lowest ~82 m of channel is inaudible. Glassner also jitters flight times with slowly varying noise, and lowpasses the result "to smooth out sharp pops".
  **Source:** Glassner 2000. **Support:** direct. **Confidence:** medium.

### A5. Time structure of the first second of a close strike

- **Claim:** A flash has several strokes along the same channel "of order 60 ms apart". Thunder is the superposition of the single-stroke signatures with those delays, which can be rendered as an FIR filter.
  **Source:** Reiss 2021. **Support:** direct. **Confidence:** high (as a model).
- **Claim:** In a measured triggered event, nine return strokes arrived over ~0.97 s. From the UTC timestamps in Table 1, the intervals were ≈ **287, 118, 112, 17, 55, 178, 135 and 72 ms** **[interp: computed from the table]**. Acoustic pressure correlated with peak current (r = 0.8). Each stroke produced its own wing-shaped arrival.
  **Source:** Dayeh et al. 2015. **Support:** direct. **Confidence:** high.
- **Claim:** Lightning time scales are:
  - stepped leader: µs steps (1–5 µs);
  - return stroke: 50–100 µs;
  - interval between strokes: 20–50 ms;
  - whole flash: 0.2–1 s.

  A typical recording lasts seconds to a minute, reaches up to 50 Pa, and has "several peaks (of a few 0.1 s)".
  **Source:** Coulouvrat & Farges slides, citing Rakov & Uman. **Snippet only.** **Confidence:** low–medium. **[secondary]**

- **Claim:** The return-stroke channel geometry has steps of about 8 m with a mean deflection of 16.3° (Hill 1968). Rakov & Uman give segments of 5–70 m.
  **Sources:** the Coulouvrat snippet; Reiss 2021. **Support:** snippet/direct. **Confidence:** medium.
- **[inference] The geometry of a close crack:** for a near-vertical channel at horizontal distance d, a point at height h arrives at `t(h)=√(d²+h²)/c`.
  - Arrivals per second at height h are `(c/ℓ)·√(d²+h²)/h` for kink spacing ℓ.
  - This is effectively unbounded at the first arrival, so the lowest segments pile up into a clap. It falls toward `c/ℓ` (~40/s for ℓ = 8 m) as h ≫ d.
  - Tortuosity scatters this into irregular clusters.

  This _deceleration_ of pulse density is the same contour Farnell hard-codes, and it matches Dayeh's "wing".

---

## B. Procedural and physically based implementations

### B1. Farnell, _Designing Sound_, Practical 17: the original Pd patches

Sources:

- [practical17.html](https://aspress.co.uk/sd/practical17.html), where `thunder4.pd`, `strike-sound.pd`, `distance.pd` and `udly.pd` are shown inline.
- The remaining abstractions (`strike-pattern.pd`, `nwave.pd`, `cheap-nwave-aftershock.pd`, `quickpolytap.pd`, …) in Reiss's archive copy [`Code/Farnell/`](https://github.com/joshreiss/thunder-simulation-evaluation/tree/main/Code/Farnell). That copy was taken from `aspress.co.uk/sd/examples.tar.gz`, per its README. **I did not download the tarball myself.**

Below I decode each patch from the `.pd` text. **[interp]**

**`strike-pattern.pd`** (also identical to `strike-decay.pd`):

- On a bang, accumulator x := 1.
- Loop:
  - output amplitude `a = (100 − x)/100`;
  - wait `x` ms;
  - emit `(voice = n mod 4, a)`;
  - then `x += random(100)/10`, i.e. U{0…9.9} ms;
  - repeat while x < 100.
- **Result:** about 20 events, with mean step ≈5 ms. The total pattern takes ≈1 s: Σx ≈ 20 + 4.95·190 ≈ 0.96 s. Gaps grow linearly from ~1 ms to ~100 ms, and a falls from ~1 to ~0.
- **This is a decelerating train.**

**`strike-sound.pd`** (= `filter-strike.pd`). For input a:

- envelope: jump to 1, then linear decay to 0 over `L = (1 − a + 0.4)^5 · 200` ms;
- that gives a = 1 → 2.0 ms, a = 0.5 → 118 ms, a = 0 → 1076 ms;
- white noise × envelope → two `bp~` filters in parallel, at `f = 100 + 1200·a` Hz (with Q 3) and `f/2` (with Q 3), summed.

Taken together:

- the **first events are tiny 2–10 ms bright clicks** (bands ~1.3 kHz and 650 Hz), only 1–20 ms apart;
- later ones are longer and darker, and spaced up to 100 ms;
- the envelope peak is always 1, so later events carry more energy because they are longer;
- four voices, round-robin; a retrigger restarts that voice's `vline~`;
- the whole strike is scaled ×0.3 in `thunder4.pd`.

> Note for our doc: `docs/research/dark-forest-audio.md` writes the length as `(x+0.4)^5·200 ms` and the frequency as `100+1200x`. In the patch, both use _a = 1 − (normalized accumulator)_: frequency **falls** while length **rises**. If our code reads x as "brightness", the two relations are consistent. If x was taken as time-progress, one of them is inverted. Worth checking against `audio.ts`.

**`nwave.pd`.** For input D, in ms (0–100):

- `vline~` goes 0 → +1 in 1 ms;
- then +1 → −1 linearly over D ms;
- then −1 → 0 in 1 ms;
- output is multiplied by `(100 − D)/100`.
- So a literal N-wave, with longer waves quieter.

**`cheap-nwave-aftershock.pd`** (the rumble core; also inlined as `pd rumble` in `thunder4.pd`):

- noise → 2× `lop~` (density) → `samphold~`, clocked by a phasor;
- the phasor frequency is `1 + 3000·max(0, lop(lop(noise)))` Hz, i.e. a random, mostly low rate;
- the held value → `rpole~ 0.99` (a random walk) → ×0.04 → abs;
- that becomes the amplitude of a **parabolic pulse per phasor cycle**, `0.5·(1 − 4(p − 0.5)²)`;
- → `hip~ 100`;
- envelope in `thunder4.pd`: rise 50 ms, decay over 8 s.
- In effect: a random-rate stream of rounded pulses with random-walk amplitudes.

**`thunder4.pd` afterimage:**

- noise → `lop~`, with cutoff 33 → 3 Hz over 600 ms → ×80;
- × a second noise → `clip~ ±1` → `bp~ 333 Q4`;
- × a 6 s linear decay → ×0.9;
- starts 200 ms after the trigger.

**`deep`:**

- noise → `lop~ 80` ×2 → `hip~ 15` → ×12 → `clip~` → `lop~ 80` ×2;
- envelope: 1 s delay, 2 s rise, 20 s decay;
- scaled ×0.5.

**`distance.pd`:**

- three cascaded one-pole `lop~` at `50 + 6000·(1 − d)` Hz;
- plus a copy through a 2–5 ms variable delay at 0.5 gain, i.e. a short comb (**[inference]** a ground reflection);
- in `thunder4.pd`, `d` is ramped **0 → 1 over 12 s**, so the whole thunder gets darker over time.

**`udly.pd`, "box of delays":**

- 24 units, each with a random delay of 0–12 s (`quickpolytap.pd` version: 3 s);
- gain falls linearly with delay;
- `bp~` at 400–800 Hz, Q 2;
- random equal-power pan.

Farnell's audio notes say there are three versions:

1. a "highly efficient castle thunder using only four subtractive bands";
2. a "cheap N-Wave and multi-tap delay model";
3. a "composite N-Wave and large environment model made from several multi-taps and reverbs".

**The patch for (3) was not among the files found [missing].**

### B2. Fineberg, Walters & Reiss 2022 (Nemisindo, WebAudio): code and paper

Sources: [AES Convention Paper 10574](https://joshreiss.github.io/documents/2022/Fineberg%20AES152.pdf) ([arXiv 2204.08026](https://arxiv.org/abs/2204.08026)); code at [bineferg/thunder-synthesis](https://github.com/bineferg/thunder-synthesis), files `Lightning.js`, `Crackle.js` and `Thunder.js`. **[direct]**

**Multi-strike:**

- strike count ~ U[1, 6);
- the source alternates between white noise and "20 impulses": `Crackle.js` makes 0.5 ms `ConstantSourceNode` pulses at uniform random times within 1 s;
- each strike uses Farnell's pattern: 20 iterations, 4 gain voices, each feeding 2 bandpasses;
- band frequency `time·1200 + 80` Hz (originally +100) and half that; Q 10 in the paper, **7 in the improved version**;
- decay `240·((1 − time) + 0.4)^5` ms, quoted as 2.45–1290 ms;
- gain `2·strike`;
- followed by a feedback delay (0.6 s, 0.15), an HRTF `PannerNode` at a random position, and convolution with the EchoThief "DivorceBeach" IR.

**Post-processing:** a compressor with threshold −20 dB, knee 20, ratio 12, attack 0 and release 0.5 s, "balancing the explosiveness of the initial Multi-Strike against the Rumbler".

**Result:**

| Model          | Median realness (1–10) |
| -------------- | ---------------------- |
| Real recording | 8.17                   |
| Fineberg       | 6.15                   |
| Farnell        | 5.04                   |
| Saksela        | 5.0                    |
| FXive          | 2.47                   |

Listener comments: "rocket taking off or an explosion… because of the power and pitch of the first sound"; "a single thunderclap is usually faster"; "too perfect".

The authors' future work explicitly lists **simulating "the crackling… directly preceding the main clap"**, more randomness in envelopes and waveshaping, and "procedural granular synthesis" for scattering. `Crackle.js` is marked `// TODO IMPROVE`. In other words, **nobody in this line of work has solved crackle yet.**

### B3. Reiss, Tez & Selfridge 2021: comparative evaluation

Source: [AES e-Brief 640](https://joshreiss.github.io/documents/2021/21101.pdf); data and code at [joshreiss/thunder-simulation-evaluation](https://github.com/joshreiss/thunder-simulation-evaluation).

- They found ten models. Physically based ones follow Ribner & Roy (WM-waves) or Few; signal-based ones follow Farnell.
- In tests with 51 participants, **none came close to the recording**. Signal-based models slightly beat physical ones, and Blanco (closest to Ribner–Roy) was worst.
- Their recommendations (§7):
  - 3-D channel with branches and the cloud "crown";
  - multistroke;
  - careful delay, filter and reverb, since "reverb in particular had a huge effect on perception";
  - frequency-dependent distance attenuation;
  - outdoor reverb;
  - stereo or immersive output ("all models produced monaural output, a major limitation");
  - an HRTF for headphones.

  **[direct]**

### B4. Saksela 2014 (Brode-pulse physical model, JavaScript, GPL)

Source: `Code/Saksela/js/lightning_worker.js` in the Reiss archive; original at [kai5z/Thunder-simulation](https://github.com/kai5z/Thunder-simulation). **[direct, read from code]**

- Channel segments are straight lines of random length 5–70 m with ~16° zig-zag (Reiss 2021), plus ±15% micro/meso jitter on subdivision points.
- The channel is subdivided so that the **path-length difference between adjacent points is ≤ 0.5·c/Fs (half a sample)**. This makes the sum alias-free.
- Each point adds a Brode pulse at `t = r/c`, with amplitude `A = 10000·segLen/r`. Branches use ×0.2 and the cloud "top/crown" ×0.1.
- Reverb: noise IR with predelay 0.17 s, attack 0.14 s, release 2 s and mix 0.04, through a short FIR.
- Then a distance-dependent FIR lowpass interpolated from a table, using 1.5× the attenuation.
- **GPL: reimplement the ideas; do not copy the code.**

### B5. Glassner 2000: "Digital Ceraunoscope", WM-wave sum over a synthetic bolt

Source: [IEEE CG&A, Part 2](https://glassner.com/wp-content/uploads/2014/04/CG-CGA-PDF-00-05-The-Digital-Ceraunoscope-2-May00.pdf). **[direct]**

- Uses 3 m segments, justified two ways:
  - a 5 km bolt at 3 km lasts ~8.25 s, and at ~200 Hz that needs ~1650 zero crossings, so ~1650 segments;
  - structure smaller than the relaxation radius (3–5 m) is blurred away.
- One WM-wave per segment, timed with refraction (circular arc, shadow zone eased out).
- Slowly varying random time jitter and a mild lowpass.
- Design controls: clap = channel arc around the listener; rumble = end-on channel; roar = extra tortuosity.
- His example uses five strokes with a 5 ms mean interflash time. **[interp]** That is far shorter than the 20–300 ms in A5. It is probably a design choice, not a measurement.

### B6. Brookes 2016 (Max/MSP; signal-based, physically inspired)

Sources: Reiss 2021 §3.4 for the description; `Code/Brookes/Thunder externals/distortion.gendsp` for the waveshaper. The original blog (joebrookssound.com) is **unreachable (DNS failure)**. **[mixed]**

- The initial strike is "a series of short, staccato noise envelopes… very close together bangs" imitating in-phase N-waves. Hundreds of pulses are triggered through delay lines whose ratios are re-randomised per strike.
- 110 N-wave envelopes are said to be "based on observations of sonic booms made by NASA" (personal communication). **[unverified]**
- A resonant lowpass and short delays follow. Distortion "to flatten the high end of the strike and give it a more clap-sound".
- Afterimage delays at 1.25, 2.5 and 4.5 s, with feedback loops.
- Waveshaper (gen~ code, "Gloubi-boulga"), with drive g:
  ```
  x = in·g;  a = 1 + exp(−0.75·√|x|);  out = (eˣ − e^(−a·x)) / (eˣ + e^(−x))
  ```
  This is an **asymmetric tanh-like soft clip**. **[direct]**

### B7. Other implementations (secondary)

- **SuperCollider, "Thunderstorm" by Henk Lasschuit ([sccode 1-29o](https://sccode.org/1-29o)):**
  - `RLPF(WhiteNoise)` with cutoff `1500·Env.perc(0.05, 16 s, curve −1) + 20`, rq 0.55;
  - amplitude `Env.perc(0.01, 0.5, 2, −1)` retriggered by `Dust.kr(15)`;
  - FreeVerb (mix 0.5, room 0.75).
  - Hobbyist; it shows the "fast-trigger rumble" idea but has no real crack. **[secondary]**
- **Pure Data forum "synthetic thunder" generator (2007), based on Ribner & Roy.** Archived in the Reiss repo as `Code/Unknown/NWaveSegments*.m/js`. It sums WM-waves over a vertical line of segments with random angles. Not evaluated. **[secondary]**
- **Synth tutorials.** [Once Upon A Synth, DSI Pro 2 thunderstorm](https://www.matrixsynth.com/2017/07/dsi-pro-2-thunderstorm-wind-rain-sound.html): "The thunder's secret ingredient is heavy distortion." The reddit r/synthrecipes and David Dumais videos are noise → LPF/ADSR recipes. **[secondary; low weight]**
- **Not found:** a Csound thunder example with a credible crack, a Nathan Ho post on thunder, or a GDC talk with concrete thunder-crack parameters. **[missing]**

---

## C. Candidate WebAudio recipes

All three recipes pre-render one `AudioBuffer` per strike, in plain JS at `ctx.sampleRate`, and play it with an `AudioBufferSourceNode` → existing pan/bus. This avoids scheduling hundreds of nodes. A 1.5 s stereo buffer is ~130k samples per channel, and a few hundred pulses render in well under a millisecond.

### Recipe 1: "Farnell-exact" strike pattern (lowest risk; mono → pan)

```
x = 1; t = 0; n = 0
while x < 100:
  a = (100 - x) / 100
  t += x / 1000                        // s  (gap = x ms)            [Farnell strike-pattern]
  L = 0.2 * (1 - a + 0.4) ** 5         // s  (2 ms … 1.08 s)         [Farnell strike-sound]
  f = 100 + 1200 * a                   // Hz; second band at f/2, Q 3 [Farnell strike-sound]
  render noise * env(t, L)  →  BP(f, Q3) + BP(f/2, Q3)  (biquad in JS, or OfflineAudioContext)
  env: jump to 1, linear decay to 0 over L  (we may add a 0.1–0.3 ms attack to avoid
       a DC step; Farnell uses none)       [our choice]
  x += random(0, 9.9)
```

- Gain about 0.3 of the full thunder, as in Farnell. Use 4 voices round-robin, or simply sum everything (overlap is fine in a buffer).
- Variations:
  - Fineberg's Q 7 and +80 Hz offset;
  - repeat 1–5 times per flash at return-stroke delays (Recipe 3, step 6).
- Expected outcome: a fast click-cluster that broadens into the clap. Our current crack covers only the tail end of this.

### Recipe 2: geometric kink train (physically inspired; best stereo and distance behaviour)

1. **Channel.** Build a 3-D random walk from ground (0, 0, 0) up to H.
   - H is 0.5–1 km for the crack buffer; the rest belongs to the rumble.
   - Step length ℓ ~ U(5, 70) m [Rakov & Uman via Reiss], or mean 8 m with ~16° mean deflection [Hill 1968 via Coulouvrat; snippet].
   - Subdivide each step into ~3 m pieces with ±15% jitter [Glassner; Saksela].
   - Optionally add 1–3 branches at 0.2 amplitude [Saksela].
2. **Listener.** Place it at horizontal distance d, using the sim's strike distance; for a convincing crackle, d ≲ 1.5 km.
3. **For each vertex i:**
   - arrival `t_i = r_i/c`, with c = 343 m/s;
   - kink weight `w_i = sin(deflection_i)` **[inference from Glassner: straight runs cancel, kinks radiate]**;
   - amplitude `A_i = w_i · ℓ_i / r_i` [Saksela's A ∝ len/r; Reiss's B ∝ 1/r];
   - pulse duration `T_i = T0 · √k(r_i)`, with `k = ln(100)/ln(r_i/10)` [Ribner–Roy/Glassner stretch];
   - T0 = **1.5 ms** for the bright crack [Saksela Brode, L+ = 0.5 m], up to **5 ms** for heavy claps [Glassner/Reiss]. Jitter T0 by ±30% **[inference]**.
4. **Pulse shape.**
   - If the listener is near the segment normal, use an **N-wave**: rise over ~0.1–0.3 ms, linear fall to −1 over T_i, return to 0 over ~0.3–1 ms [Farnell `nwave.pd` uses 1 ms ramps].
   - Otherwise use a **parabolic doublet** (+lobe, gap, −lobe), per the WM shape [Glassner/Reiss].
   - Keep the positive phase first.
5. **Sum** into a buffer, starting the buffer at `min t_i`, so the sim's delay handles the absolute time. Clap clusters, the deceleration and the low-to-high "wing" fall out of the geometry [Dayeh 2015; Glassner].
6. **Repeat for return strokes.** Add 1–4 extra strokes on the **same pulse list**, delayed by 20–300 ms (e.g. U(20, 150) ms between strokes) [Reiss ~60 ms; Dayeh 17–287 ms], each 0.5–1.0× the previous amplitude [Dayeh: amplitude follows peak current, which varies]. Shift 10–30% of the pulse times slightly per stroke **[inference: avoids a mechanical echo]**.
7. **Stereo.** Pan each pulse by the segment's horizontal offset, projected onto the screen, plus ±0.1 jitter. Optionally add a 0–0.5 ms ITD **[inference]**. This addresses Reiss's "all mono" criticism.
8. **Post.**
   - Asymmetric shaper with drive 1.5–3 [Brookes formula], then normalise.
   - Distance lowpass, cutoff ∝ 1/d: keep our `500 + 4000·near²`, or use e.g. `fc = min(8000, 3000 / d_km)` **[our choice; Reiss gives only the proportionality]**.
   - Short reflections: 3–6 taps at 30–200 ms, bandpassed 400–800 Hz, Q 2 [Farnell `udly`, scaled down], or the Fineberg feedback delay (0.6 s, 0.15).
9. **Level.** Normalise the crack buffer so its 0.8–3 kHz share of the first 1.5 s stays in the measured ≤7.6% range [our reference measurements]. Check the dropout detector (§D).

### Recipe 3: stochastic shortcut (no geometry; same perceptual targets)

- Draw pulse times from a non-homogeneous Poisson process with rate `λ(t) = λ0 · e^(−t/τ)`.
  - λ0 = 300–800/s and τ = 0.12–0.3 s **[inference, chosen to match the A5 geometry: dense, then ~40/s]**.
  - Add 1–3 "clap" clusters of 10–40 pulses within 2–10 ms **[inference from Glassner's in-phase arc]**.
- Amplitudes log-normal with σ ≈ 6–10 dB **[inference; cf. our fire finding of a "large spread of loudness"]**.
- Each pulse is one of:
  - an N-wave (0.5–3 ms);
  - a noise grain of 2–15 ms with instant attack and exponential decay, band 0.6–3 kHz **[inference]**.
- Bias early pulses short and bright and late ones longer and darker, mirroring Farnell's `a`.
- Sum, shape, filter and pan as in Recipe 2, steps 6–9.

### Where the current bursts go

Keep 2–3 of the existing 0.4–2.5 kHz, 0.25–0.8 s band-passed noise bursts as a **continuous "tear bed"** under the pulses, 6–10 dB below pulse peak. **[inference]** The bed then fills every inter-pulse gap in the 300–1500 Hz band, so the dropout detector stays at 0/s while the pulses supply the sharpness.

---

## D. Avoiding the "dropout" artifact (from our own measurements plus inference)

- Our detector fires on dips ≥12 dB below the local 150 ms median in 300–1500 Hz that recover within 60 ms. The references show ~0/s (`dark-forest-audio.md`).
- The old crack failed for two reasons **[inference]**:
  - 20 ms blips with 2 ms attacks sat in silence, so the mid band repeatedly emptied between them;
  - a multiplicative flutter gate (down to 0.15, 4 ms smoothing) carved holes in a continuous band.
- **Rules [inference]:**
  1. Pulses are additive. Never use a gain envelope on the bed faster than ~15 ms or deeper than ~6 dB.
  2. Make individual pulses either ≤ 5 ms (heard as clicks and shocks, not as a "signal"), or long and overlapping (≥ 100 ms, Farnell's later events).
  3. Avoid isolated 10–40 ms mid-band blips over silence; this is the duration range that read as packet loss.
  4. Keep the bed floor under the crack for the crack's whole duration.
  5. Verify with `tools/debug/thunder_dropouts.py` at 0.7 km and 1.5 km.

---

## Contradictions

- **Where the tearing comes from.** The AMS Glossary attributes the initial tearing to the stepped leader and the close click to the ground streamer. Glassner, Reiss and Ribner–Roy attribute crack, clap and roar to return-stroke shock pulses from channel geometry. Dayeh et al. found the only non-return-stroke acoustic source in their event was one fast M-component, and a 2015 press piece quotes Dayeh: "We still don't know which of these creates an acoustic signal" ([Vice](https://www.vice.com/en/article/this-is-what-thunder-looks-like/)). This is unresolved. For synthesis the outcome is the same either way: short pulses just before and during the clap.
- **Spectral peak.** Few's model predicts a peak (often quoted ~100–200 Hz). Holmes et al. 1971 found peaks at <4–125 Hz. Lacroix et al. (slides, snippet) found flat spectra without a clear ~150 Hz peak.
- **Inter-stroke timing.** Glassner's example uses a 5 ms mean interflash. Reiss says ~60 ms. Coulouvrat (snippet) says 20–50 ms. Dayeh measured 17–287 ms.
- **Q of the strike bands.** Farnell uses Q 3. Fineberg used Q 10, then reduced it to 7 after "too synthetic" feedback.

## Missing evidence

- I could not open full texts for Few 1969/1975, Ribner & Roy 1982, Bass 1980, Depasse 1994, Bodhika 2019 ("A brief study on thunder claps": it quantifies claps, but I could not read it), Lacroix 2018/2019, or the Coulouvrat & Farges slides. Measured close-range N-wave durations and pulse rates are therefore **not verified from field data**. The 1.5–5 ms values are model parameters.
- The `f_m = 0.63·c0·√(P0/E_l)` constant is unverified.
- The Farnell "composite N-wave + large environment" patch, Brookes' original blog and patch internals (beyond the waveshaper), and the Nemisindo hosted model's current code were not examined.
- No credible source gave crackle-specific pulse statistics (rate, amplitude distribution) for real close strikes. The Recipe 3 numbers are inference and should be tuned against our refs: TRP 717907 and cognito perceptu 347853 are close cracks. Next measurement: count transients >1 kHz in their first second.

## Sources

- **Kept:**
  - Farnell P17 page and the original patches (Reiss archive): exact numbers for strike timing, N-wave and rumble.
  - Fineberg/Walters/Reiss 2022, paper and code: the best-rated WebAudio model, parameters, listener critiques, and crackle as open future work.
  - Reiss/Tez/Selfridge 2021: survey and evaluation, WM/Brode formulas, recommendations.
  - Glassner 2000: the kink, clap and rumble geometry explanation, segment justification, refraction.
  - Saksela code: alias-free physical summation, amplitude law, reverb numbers.
  - Dayeh et al. 2015: measured close-range (95 m) high-frequency arrivals and stroke timings.
  - AMS Glossary: authoritative qualitative description of tearing and crack.
  - Holmes et al. 1971 and Few 1969 abstracts: spectrum.
  - Bass 1980 abstract: nonlinear near field.
- **Deprioritised:**
  - Wikibooks thunder page (secondary, uncited numbers).
  - Coulouvrat slides (snippet only).
  - sccode Thunderstorm (hobbyist, no crack).
  - Synth tutorials and reddit (anecdotal).
  - NOAA/NWS pages (qualitative only).
  - "Lethal frequencies" mini-review (low quality).

## Next steps

1. Measure transient counts, inter-onset intervals and pulse widths above 1 kHz in the first 1.5 s of our two close-crack references. Use them to fix λ0/τ and T0.
2. Prototype Recipes 1 and 2 offline in the moodboard tools. Compare them with the references and the Fineberg/Farnell survey WAVs (in both repos), and run the dropout detector.
3. If a library is reachable, get Few 1975 (_Scientific American_), Bodhika 2019 or Depasse 1994 for measured close N-wave durations.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Research brief written to the authoritative artifact path. It has a ranked summary, per-source findings with parameters and links, three WebAudio recipes with sourced starting values, dropout-avoidance rules, and explicit [direct]/[interp]/[inference]/[secondary]/[unverified] labels."
    }
  ],
  "changedFiles": [
    "/Users/caidan/.pi/agent/sessions/--Users-caidan-Projects-caidanw.github.io--/subagent-artifacts/outputs/b1f16f63-cfa8-4aff-8bbd-a49298607cc1/research.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [],
  "validationOutput": [
    "Farnell strike-pattern, strike-sound, nwave, cheap-nwave-aftershock and thunder4 patches read and decoded from original .pd text",
    "Fineberg Lightning.js/Crackle.js/Thunder.js and Saksela lightning_worker.js read directly",
    "source_check on Few's peak-frequency formula returned 'unclear'; marked unverified"
  ],
  "residualRisks": [
    "Full texts of Few, Ribner & Roy, Bass, Depasse, Bodhika and Lacroix were not accessible (403/paywall). Field-measured close N-wave durations and pulse rates are unverified; the numbers used are model parameters.",
    "Coulouvrat & Farges slide numbers (8 m steps, 16.3 deg, 20-50 ms inter-stroke) come from search snippets only.",
    "Recipe 3 rates and amplitude distributions are researcher inference and need tuning against the close-crack references.",
    "Farnell patches came from Reiss's archive copy, not a fresh download of the aspress tarball.",
    "Possible inconsistency in dark-forest-audio.md's Farnell formula (sign of x in the frequency vs length relations). Not checked against audio.ts."
  ],
  "noStagedFiles": true,
  "diffSummary": "New research markdown only, at the artifact path. No repo files edited; no commits.",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "The run was restricted to the artifact path, so the file was NOT written to docs/research/thunder-crackle.md; copy it there if desired. Saksela's code is GPL: reimplement, don't copy."
}
```

---

## Implementation and results (two models, for listening)

`src/lib/dark-forest/audio-thunder.ts` renders one stereo buffer per close strike (near > 0.55, about ≤ 3 km), at the moment of the flash; this takes about 5–8 ms of CPU. `crack.model` selects the model. Both models share the following:

- **Shocks:** N-waves with a 0.1–0.3 ms rise, a linear fall over `len`, and a 0.3–0.8 ms return.
- **Repeat strokes:** 1–4 strokes down the same channel, 20–150 ms apart, each 0.5–1× as loud, with 25% of the shocks shuffled by ±4 ms.
- **Tear bed:** band-passed noise (0.7–1.4 kHz, Q 1.2) with a 10 ms rise and τ = 0.3–0.5 s, _added_ under the shocks so the band never empties.
- **Weight:** Brookes' asymmetric soft clip at drive 2.

The two models:

- **A, `pattern`:** Farnell's strike-pattern timing. The accumulator x grows by U(0, 9.9) ms, and each event fires 1–4 shocks. Early events are short (0.5 ms) and bright; later ones are long (up to 3 ms) and weaker, with log-normal (σ 8 dB) sizes. The output is scaled ×0.5 to match B's crack energy.
- **B, `channel`:** a random channel. Steps of 5–70 m with 8–24° turns run up to 1.5 km and are cut into about 3 m pieces with a ±0.08 m wiggle. The listener is at the strike distance, at a random azimuth. Each step's kink sends a shock with amplitude kink·length/r × log-normal; the pieces give a faint texture (0.01·length/r). Arrival is r/c. Pulse length is 1.2 ms·√k (the Ribner–Roy stretch). Pan comes from each point's position across the listener's view. Output ×0.55.

In `Soundscape.thunder()`, the crack plays at gain 0.65·near^1.2 through its own lowpass, `800 + 7000·near²` Hz. The rumble layers now share a darker lowpass pair, `(400 + 1600·near²)`·{1, 1.3} Hz. The references are nearly empty above about 2 kHz apart from the crack's shocks; previously, one `500 + 4000·near²` lowpass left a continuous hiss up to about 4.5 kHz.

Measured above 800 Hz in the first 1.5 s (`tools/debug/crackle_stats.py`), as the median over six strikes:

|                      | Kurtosis   | Crest | Pulses/s | Width      |
| -------------------- | ---------- | ----- | -------- | ---------- |
| References           | 9–213      | 9–39  | 5–79     | 0.5–0.9 ms |
| Previous noise crack | 5.5        | 7.7   | 175      | 0.43 ms    |
| A, 1 km / 2 km       | 7.7 / 8.9  | 11    | 50 / 26  | 0.9–1.1 ms |
| B, 1 km / 2 km       | 7.2 / 10.2 | 10–11 | 55 / 44  | 0.5 ms     |

Single strikes vary: some come out dense, up to about 150–200/s. There are no dropouts (0/s) in either model or the storm mix. Loudness over heavy rain is about +16–19 dB at 0.7 km and +11–17 dB at 1.5 km. Peaks are at most about 0.65–0.8 for a single strike, and 0.73 in the full storm mix.

Plot: `moodboard/shots/thunder-crack-models.png`. Listening sheet: `moodboard/sounds/thunder-crack-listening.html`. The scene uses B until the operator chooses; then the other model and the `crack.model` switch should be removed.

### Decision

The operator liked B a lot and A too. Each close strike now picks its crack at random: B (channel) two-thirds of the time, A (pattern) otherwise. The `crack.model` switch is gone; `thunderCrack()` takes the model as an optional argument.
