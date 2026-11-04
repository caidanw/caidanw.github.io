# Research: crow caw synthesis, and the acoustics of corvid caws

Background research for the dark-forest crow voice. Measurements of the reference recording that follow up on this are in `dark-forest-audio.md`.

Evidence labels used below:

- **[direct]**: the source states it.
- **[interp]**: my reading of the source, for example of a Pd patch.
- **[inference]**: my own reasoning; no source states it.
- **[secondary/unverified]**: a forum post or search snippet that I could not fetch or confirm.

## Summary: ranked actionable ideas

1. **The American crow caw voice is probably around 600–700 Hz, not 300–340 Hz. Treat the ~350 Hz spacing as a subharmonic (f0/2), not the fundamental.** Fixes timbre; confidence medium-high.
   - Mates et al. measured 1,674 wild American crow caws: mean F0 604 Hz (SD 76), 5th percentile 477 Hz, 95th percentile 697 Hz [direct].
   - In our reference, energy is sharply cut below ~0.7 kHz and peaks around 1.8–2 kHz. That fits a weak fundamental near 600–700 Hz, with harmonics 2–3 carrying most of the energy [inference].
   - The ~350 Hz harmonic spacing seen in some reference calls then reads as f0/2 period doubling, a documented nonlinear phenomenon (Fitch et al. 2002) [inference].
   - The current 300–340 Hz figure comes from _hooded_ crow pulse-register data (Jensen et al.): 3–4 ms intervals, and per-bird pitch ranges of about 300–570 Hz. That is a different species and possibly a different call type.
2. **Replace the two bandpass "tract" filters with a single quarter-wave tube (a delay-line comb).** Fixes timbre; confidence medium.
   - Fletcher's raven-validated model has a tube closed at the syrinx and open at the beak. It gives broad formants at the odd "closed-pipe" resonances (1.2, 3.6 and 6.0 kHz for a 70 mm trachea) and sharper "open-pipe" bands near 2.2/4.4/6.6 kHz [direct]. It matched a sonagram of the little raven _Corvus mellori_ [direct].
   - Our reference has a peak at 1.8–2 kHz, a gap at 3.6–4.7 kHz and a weak band at 5.5–6.1 kHz. That is the pattern of a closed–open tube with f1 ≈ 1.9 kHz and 3·f1 ≈ 5.7 kHz [inference].
   - So the separate flickering "trill" band is probably the tube's third resonance, and should be excited by the same source rather than added as an independent filtered layer [inference].
3. **Make the onset smooth by tying brightness to amplitude. Delete the noise "ka" burst.** Fixes the onset; confidence medium-high.
   - Phonation starts when the syrinx closes and pressure crosses a threshold. In Goller & Larsen's endoscopic crow study, soft calls had incomplete closure and loud calls complete closure [direct].
   - Fletcher (2010): at very low blowing pressure the valve fails to close on each cycle, giving very low sound level [direct]. Kahrs & Avanzini: the closed phase is what broadens the spectrum [direct].
   - Hopf-type onsets in syrinx models start from zero amplitude at a defined frequency [direct, generic songbird].
   - Fitch et al. note that even chaotic calls keep tonal on- and offsets [direct, macaque].
   - Taken together, the onset should be a near-sinusoidal, dark tone that brightens as the "closure" grows over the first tens of ms, not broadband noise [inference].
4. **Use the literature's caw "wobble" as the roughness source.** Fixes timbre; confidence medium-high.
   - Mates et al.: pitch wobble 50 Hz (SD 12), amplitude wobble 48 Hz (SD 16), amplitude-wobble magnitude 0.38 (SD 0.17) [direct]. They note this wobble "is typically found in 'caw'-type calls across the genus _Corvus_" [direct].
   - Our reference measures about 65–75 Hz with depth ~0.45. That is the same phenomenon, near the upper end of the published range [inference].
   - Implement it as correlated, slightly irregular FM plus AM of a continuous voice, not as gaps between pulse clusters.
5. **Add rare nonlinear episodes on top of the steady voice.** Fixes timbre; confidence medium.
   - Candidates: f0/2 subharmonics, short jitter/"chaos" bursts, and occasional frequency jumps. Wascher et al.'s corvid review calls corvid harshness a product of nonlinear phenomena [direct], but notes these are "hardly described" in corvid literature [direct].
   - Parameter ranges used in a published NLP resynthesis study (Terrade et al. 2025, soundgen): AM 25–120 Hz at 30–60% depth; subharmonics f0/2–f0/4 at 30–60% depth; chaos as 1–3 semitone jitter; jumps of 3–12 semitones [direct].
6. **Optional and heavier: a full physical model.** This means the Mindlin/Amador normal-form labial oscillator, a delay-line trachea and an OEC Helmholtz filter. The actual C constants are given below. It runs per sample in JS when pre-rendering buffers, but needs about 20× oversampling and retuning away from zebra-finch values (confidence medium for "worth trying").

## Per-source findings

### A. Corvid-specific bioacoustics

1. **Mates, Tarter, Ha et al., American crow caws (Ithaca, NY; 18 banded birds; 1,674 caws)** — [PMC4237024](https://pmc.ncbi.nlm.nih.gov/articles/PMC4237024/)
   - Quote [direct]: caws are "harmonically rich and locally tonal… contain rapid variations in pitch and amplitude, which produce a 'harsh' quality to the human ear."
   - Locally periodic (harmonic) models captured 92.9% of frame energy. Frame-to-frame RMS F0 shift was 12.67 Hz [direct]. So these calls are mostly harmonic, not noise.
   - Table 2, mean (SD): mean F0 604.34 (75.82); 95th percentile F0 696.63 (66.08); 5th percentile F0 476.60 (84.26); F0 peak value 668.56 (77.95); F0 peak location −0.13 (0.19); pitch wobble frequency 50.15 (12.04); pitch instability (RMS residual after a cubic fit) 28.16 (12.88); amplitude wobble frequency 47.97 (15.67); wobble magnitude 0.38 (0.17) [direct].
   - The table prints no units. Hz is implied by context and by the text's "22 Hz higher in mean frequency" for females [interp]. The time normalisation for "peak location" is not stated, so read it only as "the pitch peak falls slightly before mid-call" [interp].
   - High-PC1 calls are longer, lower and flatter, with less regular wobble, and "more energy in the third harmonic as opposed to the second" [direct]. Energy therefore sits in H2/H3 [interp].
   - Females are about 22 Hz higher in mean F0 [direct].
2. **Tarter 2008 (OSU MSc thesis, American crow vocal behaviour)**: "Short call… roughly 200 msec… nearly symmetrical frequency contour. The majority of the acoustic energy in this call is contained in the second harmonic, but the first and third harmonics are always visible" [secondary/unverified: seen only in a search-result excerpt; the [catalog page](http://rave.ohiolink.edu/etdc/view?acc_num=osu1204876597) fetched without the thesis text].
3. **Jensen et al., hooded crow (_Corvus corone cornix_) pulse-tone register** — [PMC2279211](https://pmc.ncbi.nlm.nih.gov/articles/PMC2279211/)
   - Pulses last 0.5–0.8 ms. Induced calls repeat them about every 3 ms (F0 ≈ 300 Hz). In natural calls pulses repeat every 3–4 ms, in clusters of 2–3 separated by 3–7 ms closed periods. Per-bird pitch ranges were 326–568, 323–565 and 297–505 Hz [direct].
   - The inter-pulse interval shortens with rising pressure. The left side sometimes period-halves below about 2 kPa, without an audible effect [direct].
   - Pulses are followed by damped oscillations, read as tracheal resonance near 1.6 kHz (trachea ≈ 9 cm). Natural calls are more resonant than induced ones (about 4 dB more energy at that peak) [direct].
   - Phonation threshold is 1.1 kPa. "Occasional simultaneous bilateral opening was observed only at the on- and offset of sounds" [direct].
   - Caveat: this paper is about a hooded crow low-frequency register, mostly in induced calls. It does not show that American crow caws use the same register [interp].
4. **Goller & Larsen 1997, _A new mechanism of sound generation in songbirds_, PNAS 94:14787** — [PMC25115](https://pmc.ncbi.nlm.nih.gov/articles/PMC25115/); the title was confirmed via [PubMed 9405691](https://pubmed.ncbi.nlm.nih.gov/9405691/). This is endoscopy of a hand-raised American crow.
   - Phonation "is never observed unless both sides of the syrinx are constricted simultaneously" [direct].
   - "A soft call… is generated with incomplete closure of the ventral portion… during a louder call… there is complete bilateral closure" [direct].
   - With incomplete adduction, the ventral part "probably allows air to escape unmodulated" [direct].
   - The crow syrinx lacks an ossified pessulus and forms a dome during loud calls [direct].
   - No crow call frequencies are given.
5. **Fletcher 1988, "Bird song — a quantitative acoustic model", J. Theor. Biol. 135:455** — [PDF](https://www.phys.unsw.edu.au/music/people/publications/Fletcher1988.pdf). The parameters are explicitly for "a bird of moderate size, such as a crow or raven."
   - Table 1 [direct; OCR partly garbled]: trachea length 70 mm, diameter 7 mm; membrane diameter 7 mm, thickness 100 µm; equilibrium opening 0; membrane modes 150 and 250 Hz; damping K = 300 s⁻¹; bronchial volume 1 ml; mouth/beak diameter 20 mm, with an end correction of about 0.6b; blowing pressure 0.3 kPa.
   - Output: exact harmonics of the membrane frequency (~200 Hz). Within each period the energy concentrates near the closed-pipe resonance. Broad formants at 1.2, 3.6 and 6.0 kHz (closed pipe, odd); sharper bands at 2.2, 4.4 and 6.6 kHz (open-pipe, lowered by the syrinx load). This is "in excellent agreement" with the sonagram of _Corvus mellori_ (fundamental about 200 Hz) [direct].
   - The membrane "closes against the wall once in each cycle… this feature is important" [direct].
   - At high pressure and high tension, output can become non-periodic broadband noise ("screeched") [direct].
   - White studied other corvids, which "had voice fundamental higher in frequency than that of _C. mellori_" [direct].
6. **Fletcher 2010, "Acoustical background to the many voices of birds"**, Acoustics Australia 38(2) — [PDF](https://www.acoustics.asn.au/journal/2010/2010_38_2_Fletcher.pdf)
   - Lung overpressure is about 1 kPa. The single-valve model closes every cycle at ~200 Hz, with formant bands near 1 and 2 kHz [direct].
   - At very low blowing pressure the valve fails to close, giving an "extremely low sound level" [direct].
   - Tongue and beak opening can tune the formants except perhaps the first [direct].
7. **Kahrs & Avanzini 2001, "Computer synthesis of bird songs and calls"**, DAFx-01 — [PDF](https://www.dafx.de/paper-archive/2001/papers/kahrs.pdf)
   - Raven dimensions: trachea L = 70 mm, r = 3.5 mm; beak 20 mm [direct].
   - Model: a one-mass syrinx with Ishizaka–Flanagan flow. Closure adds restoring force and damping. "During the whole closed phase the syringeal flow is zero, and consequently its spectrum is broadened and higher partials are generated" [direct].
   - The beak is two 5th-order Butterworth filters (one HP, one LP), and the LP output is fed back to the syrinx [direct].
   - The equations are illegible in the extracted text [unverified].
8. **Wascher et al., "Unsung Songbirds: Advances in the Study of Corvid Communication"** (EcoEvoRxiv preprint, post-2024) — [PDF](https://ecoevorxiv.org/repository/object/10600/download/22164/)
   - Corvids are known for "loud and 'harsh'-sounding broadband vocalisations… caused by unpredictable or irregular ways the sound is produced (non-linear phenomena)" [direct].
   - NLP in corvids are "hardly described… except deterministic chaos in 'alalā" (Tanimoto et al. 2017) [direct].
   - Fig. 2 shows non-harmonic calls of carrion crow, raven, jackdaw and rook [direct].
9. **Terrade et al. 2025, "Nonlinear phenomena make animal calls alarming"** — [PMC12150040](https://pmc.ncbi.nlm.nih.gov/articles/PMC12150040/)
   - Resynthesis with soundgen 2.7.1 [direct]. Manipulations: one jump of 3–12 semitones; AM at 25–120 Hz, 30–60% depth; subharmonics f0/2, f0/3 or f0/4 at 30–60% depth; chaos as 1–3 semitone jitter; each covering 40% or 80% of the call [direct].
   - Raven calls were included. The originals sounded more natural, "probably because the characteristic 'croaking' amplitude modulation of the original was not reproduced" [direct].
   - Corvid-relevant implication: modulation is an important cue, and a crude AM can fail to stand in for it [inference].
10. **Tsukahara et al. 2007** (carrion vs jungle crow) — [J-STAGE](https://www.jstage.jst.go.jp/article/jjo/56/2/56_2_163/_article/-char/en): carrion crows have higher peak and maximum frequencies, and a smaller beak and syrinx [direct]. Numbers are only in the full text [unverified].
11. **Chamberlain & Cornwell 1971, "Selected vocalizations of the common crow"**, Auk 88:613 — [PDF](https://digitalcommons.usf.edu/cgi/viewcontent.cgi?article=19187&context=auk): qualitative call types only. Example: the assembly call has "long notes (wide band width)"; the scolding call is "not so raucous". The spectrogram numbers did not survive extraction.

### B. Generic nonlinear voice dynamics (not corvid-specific)

- **Fitch, Neubauer & Herzel 2002**, Anim. Behav. 63:407 — [PDF](http://www.biolinguistics.uqam.ca/Fitch&al_2002.pdf)
  - Subharmonics are 1:2 (or other) entrainment, appearing as "a new stack of spectral components interspersed between the previous ones" (p. 411) [direct].
  - Chaos is broadband, "harsh and 'noisy'", but keeps "residual periodic energy, which appears as banding," which distinguishes it from turbulent noise (pp. 411–412) [direct].
  - Episodes appear and disappear as pressure or tension cross thresholds [direct].
  - In a macaque example, the chaotic call's "on- and offset still clearly resemble the first coo" (p. 408) [direct].
  - The paper is about mammals, but the authors say the conclusions "probably apply to a wide variety of mammals and birds" [direct].
- **Mindlin et al.**, "The physics of birdsong production" — [PMC3923535](https://pmc.ncbi.nlm.nih.gov/articles/PMC3923535/), and "Nonlinear dynamics in the study of birdsong" — [PMC5605333](https://pmc.ncbi.nlm.nih.gov/articles/PMC5605333/)
  - Labium equation: ẋ = y, ẏ = −k(x)x − βy − γx²y + a·p_av [direct].
  - Normal form: ẋ = y, ẏ = αγ² + βγ²x − γ²x³ − γx²y + γ²x² − γxy, with α ≈ air-sac pressure and β ≈ tension [direct].
  - Onset: at a Hopf bifurcation (high tension), oscillation is born "with zero amplitude and well-defined frequency" (tonal). At a SNILC (low tension), it is born with zero frequency and finite amplitude, and low-frequency sounds are spectrally rich [direct].
  - These are zebra finch and canary results. Applying them to crows is [inference].
- **Smyth & Smith 2002**, "The Syrinx: Nature's Hybrid Wind Instrument" — [PDF](https://ccrma.stanford.edu/~tamara/publications/asa_02.pdf)
  - Fletcher's membrane model (2 modes, contact "stickiness" factor, mass that varies with displacement) is integrated with the trapezoid rule, because backward Euler is "not sufficient for stability at typical audio sampling rates" [direct].
  - Waveguide bronchi and trachea meet at a 3-port junction. The beak is a lowpass with negated reflection [direct].
  - Closed membrane → high amplitude near the closed-tube resonance; open membrane → lower amplitude and a higher, open-tube resonance [direct].
  - The numeric values are unreadable in the extracted PDF [unverified].

### C. Synthesis implementations

1. **Andy Farnell, _Designing Sound_, Practical 28 "Birds" (original Pd patches)** — [aspress.co.uk/sd/practical28.html](https://aspress.co.uk/sd/practical28.html)
   - **`vposc`, the variable pulse oscillator** [interp from patch wiring]: out = 1 / (1 + (pw·cos 2πft)²). It gives smooth peaks of width set by pw, two peaks per cosine cycle, and a pulse rate of 2f. This is a cheap, band-limited-ish _smooth_ glottal-like pulse that sharpens as pw grows. Its brightness is controllable, so it is a natural "closure" knob.
   - **`avian-syrinx-model`** [interp]: carrier frequency = `base + mod · xfade(b1 + b2, b1 · b2, rm)`, fed into `vposc` with pulse width `pw`. Here b1 and b2 are two slower `vposc` "bronchus" oscillators (tables bp1 ≈ 43–45, bw1 ≈ 1.05–1.41, bp2 ≈ 88–92, bw2 ≈ 8.2–8.8), so this is ring/sum FM from two sides. The base is set by the message `bf const 200`; the patch labels it "base frequency of pessulus". I did not confirm the units of the tables [unverified].
   - **`trachea`** [direct]: two `vcf~` bandpasses in parallel at `tf1` and `tf2`, with a shared resonance (Q). The control list is bp1/bp2, bw1/bw2, rm, mod, bf, pw, tf1, tf2 and amp (the overall envelope).
   - The page's audio note: seagulls and ducks were made "with a non-oscine model adding grainy noise to the syrinx modulation outlet" [direct]. Harsh calls come from _noise in the FM path_, not from additive noise.
   - There is no crow preset. A port of Farnell's earlier "hansm-bird" tutorial to SuperCollider exists ([Olofsson](https://fredrikolofsson.com/f0blog/hansm-bird/)) and is also generic.
2. **Mindlin-lab C synthesizer (`finch_void.c` in kylerbrown/mindlin_auto, after Boari et al.)** — [repo](https://github.com/kylerbrown/mindlin_auto), [finch_void.c](https://raw.githubusercontent.com/kylerbrown/mindlin_auto/master/finch_void.c) [direct from code; zebra-finch tuned]
   - Labia: `dv[1] = alfa1*gm*gm + beta1*gm*gm*x - gm*gm*x^3 - gm*x^2*y + gm*gm*x^2 - gm*x*y`, with `gm = 24000`, `alfa1 = -0.15`, and `beta1` looked up from an (α, β) → (FF, SCI) table, `OEC.new.dat`.
   - Integration: RK4 with `dt = 1/882000`, i.e. 20× oversampling of 44.1 kHz.
   - Noise: `noise = 0.21*(rand-0.5)`, `beta1 += 0.01*noise`, `A1 = amplitude + 0.5*noise`.
   - Source into the tract: `a[t] = 0.5*1.01*A1*y + bb[t - tau1]`. The flow derivative y drives the tube, and the near end reflects +1, i.e. closed at the syrinx.
   - Tract: three sections of 1.5, 1.5 and 1.0 cm at c = 35000 cm/s with equal widths, so effectively one 4 cm tube. The far-end reflection is `db = -r*cf` with `r = 0.1` during song (0.4 at init).
   - OEC: a 3-state circuit with `s1overCH = (360/0.8)e8`, `s1overLB = 1e-4`, `s1overLG = 1/82`, `RB = 0.5e7` and `rdis = 6e5`. Output = `RB * i3`.
3. **soundgen (Anikin, R)** — [docs §2.11](https://cogsci.se/soundgen/sound_generation.html), [paper](https://link.springer.com/article/10.3758/s13428-018-1095-7)
   - Soundgen synthesises harmonics plus formants, plus noise [direct].
   - Nonlinear effects: jumps, subharmonics, sidebands (as subharmonic modification or AM), and chaos "approximated by adding strong jitter and shimmer", where jitter and shimmer are random noise added to cycle periods and amplitudes [direct].
   - I did not fetch the parameter defaults (the page was too large) [unverified].
4. **Forum and synth recipes** (crow/raven-specific, but weak):
   - KVR, JO512, Serum crows: "basically a saw with a bit of FM from a second oscillator, some carefully tuned filtering, and some envelopes to control pitch, volume, filter"; "The filter is extremely important!"; parallel BPs help. No numbers. [secondary] — [KVR](https://www.kvraudio.com/forum/viewtopic.php?start=15&t=547614)
   - Modwiggler: saw source through 2–3 parallel BPs for an "Ah" formant, quick attack and long decay [secondary/unverified, snippet only] — [link](https://modwiggler.com/forum/viewtopic.php?t=217989)
   - r/synthrecipes: Vital text-to-wavetable "caw"; a 500 ms decay envelope to wavetable position and +1 semitone to pitch; fast random pitch [secondary/unverified, snippet only; the page fetch failed] — [link](https://www.reddit.com/r/synthrecipes/comments/lt10s5/can_anyone_explain_how_to_achieve_a_synthetic/)
   - No sccode.org, Csound, Faust or WebAudio crow implementation was found.

## Candidate approaches for our WebAudio crow

### Recipe 1: smooth voiced source and quarter-wave tube (recommended first)

All of this is per sample and cheap.

- **f0 contour**
  - Start around 560–620 Hz and arch to 650–700 Hz just before mid-call, then fall to about 480–520 Hz. Source: Mates (mean 604, peak value 669, 5th/95th percentiles 477/697 Hz).
  - Females +20 Hz (Mates).
  - Let the effective pitch run at f0/2 for about 30–60% of some calls (Terrade et al.'s 40/80% coverage and 30–60% depth). Implement by scaling every other pulse/cycle to (1 − d), d = 0.3–0.6, which puts a subharmonic stack at f0/2 ≈ 300–350 Hz. Matching this to the reference's 350 Hz spacing is [inference].
- **Wobble**
  - Pitch: a quasi-periodic LFO at 50 Hz ±12 (Mates). Our reference suggests 65–75 Hz. Use a random rate per call and ±1–3% period noise. Depth: about 28 Hz RMS around the smooth contour ("pitch instability").
  - Amplitude: an LFO at about 48 Hz ±16 (Mates), or the reference's 65–75 Hz, with depth 0.38 (Mates) to 0.45 (reference). Partially correlate it with the pitch LFO.
  - Researcher's choice: drive both from one jittered phase, with an independent random amplitude for each cycle.
- **Source pulse**: Farnell's `1/(1 + (pw·cos φ)²)` at f0/2 phase rate (it doubles), or a Rosenberg/LF-style pulse. Set `pw`, the "closure", from the envelope.
  - Low pw: near-sinusoid, dark.
  - High pw: sharp, bright.
  - This expresses Goller & Larsen's soft calls (incomplete closure) versus loud calls (complete closure), and Kahrs & Avanzini's "closed phase broadens the spectrum".
  - Exact pw values (Farnell's tables) are unverified. Tune pw from about 1 to 8–15 by ear [inference].
- **Onset/offset**: no noise burst.
  - Amplitude rises over about 15–30 ms. Brightness lags amplitude: pw follows env^1.5–2 (a Hopf-style zero-amplitude birth, per Mindlin).
  - Add a little breath noise only while closure is incomplete: highpassed noise × (1 − closure) at −30 to −24 dB. This follows Goller & Larsen ("air to escape unmodulated").
  - Release about 20–40 ms, with brightness falling first.
  - Caution: the project log records an operator rejection of a 45 ms plain amplitude attack combined with a chest band and rounding filter. Change the _spectral_ onset, not only the amplitude ramp. The exact numbers are researcher starting points.
- **Tract**: one quarter-wave comb, closed at the syrinx and nearly open at the beak.
  - `p[n] = s[n] − g · LP(p[n − D])`, with D = fs / (2·f1). That gives resonances at f1, 3f1, 5f1 and troughs near 2f1, 4f1 [inference from the Fletcher and Mindlin code structure].
  - Set f1 ≈ 1.85–1.95 kHz, so 3f1 ≈ 5.6–5.8 kHz. This is fitted to our reference (peak 1.8–2 kHz, band 5.5–6.1 kHz, gap 3.6–4.7 kHz) [inference]. For comparison, Fletcher's raven trachea (70 mm) gives 1.2/3.6/6.0 kHz [direct].
  - g ≈ 0.3–0.7 [researcher range]; Mindlin's code uses r = 0.1 for zebra finch [direct]. Use a one-pole LP in the loop for the higher-loss upper resonance [Smyth & Smith use loss filters; direct].
  - Then apply a gentle HP at about 600–700 Hz, a stand-in for the radiation/beak HP (Kahrs & Avanzini's beak HP) and for the weak F0 in the reference [inference].
  - Drop the separate random-gated "trill" band once the comb's 3rd resonance provides it. Keep a variant that has it, for A/B comparison.
- **Nonlinear episodes**, per call, with some probability:
  - Jitter bursts of 1–3 semitones over 20–80 ms (Terrade's chaos), typically mid-call. Fitch: keep onsets and offsets tonal.
  - Rarely, one 3–12 semitone jump. Possibly skip this for crows; there is no corvid evidence for it [unverified].

### Recipe 2: Farnell-style FM syrinx

Use the `vposc` carrier at about 600–700 Hz. Make its frequency modulation the 50–75 Hz wobble, plus _low-passed noise in the FM path_ (Farnell's harsh-bird trick) at roughly ±2–5% deviation (researcher range). Feed it to the same comb tract as Recipe 1. This gives a "rough but tonal" texture without additive noise.

### Recipe 3: Mindlin normal form (physics experiment, pre-rendered only)

- Use the C code's equations, with RK4 at 20× oversampling, and the tract/OEC constants listed in section C.2.
- Retune it for a crow:
  - Lower γ (`gm`) from 24000 so FF lands near 600 Hz. That FF scales with γ is my inference from time scaling, so verify it.
  - Lengthen the tube to about 4.5 cm, which places 1/(4τ) ≈ 1.9 kHz at c = 35000 cm/s [inference].
  - Push α/β toward the SNILC side for richer spectra.
  - Inject noise into β (as the code does) for wobble and jitter.
- Cost: roughly 0.8 s × 882k steps × 4 evaluations, which is fine for offline AudioBuffer generation but not for an AudioWorklet [inference].

## Contradictions

- **Fundamental frequency.** Hooded crow pulse register: about 300 Hz, 3–4 ms intervals (Jensen). American crow caws: about 600 Hz on average (Mates). Raven model and data: about 200 Hz (Fletcher/White). These are species and register differences. The current model's 300–340 Hz borrows the hooded crow figure for an American-crow reference.
- **Tract length versus formant.** Anatomical tracheae (crow about 9 cm, Jensen; raven 70 mm, Fletcher and Kahrs) predict a lower first closed-pipe formant (about 1–1.2 kHz) than our reference's apparent f1 ≈ 1.9 kHz. Jensen puts the hooded crow tracheal resonance at 1.6 kHz but describes it as the round trip over twice the length, i.e. a half-wave framing.
  - The 1.9/5.7 kHz fit could instead reflect H3 emphasis, OEC/beak effects or a different species. Treat it as a fitting choice, not anatomy.
- **Harsh mechanism.** Mates calls caws mostly harmonic, with 93% of energy in a harmonic model. Wascher and Kovářová (corvid alarm calls, [PMC12549722](https://pmc.ncbi.nlm.nih.gov/articles/PMC12549722/)) call corvid calls broadband, rarely tonal and NLP-rich. Call type and species probably explain this; caws sit at the more tonal end.

## Missing evidence

- I found no corvid formant frequencies measured from caws, apart from Fletcher's little-raven case and Jensen's 1.6 kHz. The Tsukahara numbers are paywalled or unextracted.
- I found no evidence on nasal anti-resonances or beak-gape effects specific to crows. The "nasal" quality has no supporting source; the comb troughs are my proposed explanation [inference].
- I found no direct measurement of caw onset rise time or onset spectrum in the literature. Measure the 10–90% rise and the evolution of spectral centroid in Freesound 75162 before tuning.
- I could not verify:
  - the Tarter thesis numbers;
  - the units and ranges of Farnell's tables;
  - the soundgen defaults;
  - the equations of Smyth & Smith and Kahrs & Avanzini (PDF extraction garbled);
  - whether the reference's 350 Hz spacing is really a subharmonic. Check with a narrowband spectrogram: subharmonics interleave between strong 700 Hz-spaced harmonics.
- Primary sources are paywalled and were not checked: Laiolo & Rolando 2003 on _Corvus_ caw evolution; Tanimoto et al. 2017 on 'alalā chaos; Royal Society 2025 NLP-in-birds review (Amador/Mindlin; HTTP 403).

## Sources

- Kept:
  - Mates et al. ([PMC4237024](https://pmc.ncbi.nlm.nih.gov/articles/PMC4237024/)): the only large-n American crow caw parameters.
  - Jensen et al. ([PMC2279211](https://pmc.ncbi.nlm.nih.gov/articles/PMC2279211/)): corvid syrinx dynamics and onset.
  - Goller & Larsen 1997 ([PMC25115](https://pmc.ncbi.nlm.nih.gov/articles/PMC25115/)): crow closure, soft vs loud.
  - Fletcher 1988 ([PDF](https://www.phys.unsw.edu.au/music/people/publications/Fletcher1988.pdf)): corvid-validated source-tract model with formants.
  - Fletcher 2010 ([PDF](https://www.acoustics.asn.au/journal/2010/2010_38_2_Fletcher.pdf)): valve threshold behaviour.
  - Kahrs & Avanzini 2001 ([PDF](https://www.dafx.de/paper-archive/2001/papers/kahrs.pdf)): raven dimensions, collision spectrum.
  - Smyth & Smith 2002 ([PDF](https://ccrma.stanford.edu/~tamara/publications/asa_02.pdf)): waveguide structure.
  - Mindlin reviews ([PMC3923535](https://pmc.ncbi.nlm.nih.gov/articles/PMC3923535/), [PMC5605333](https://pmc.ncbi.nlm.nih.gov/articles/PMC5605333/)) and mindlin_auto C code ([finch_void.c](https://raw.githubusercontent.com/kylerbrown/mindlin_auto/master/finch_void.c)): runnable constants.
  - Fitch et al. 2002 ([PDF](http://www.biolinguistics.uqam.ca/Fitch&al_2002.pdf)): NLP definitions.
  - Terrade et al. 2025 ([PMC12150040](https://pmc.ncbi.nlm.nih.gov/articles/PMC12150040/)): concrete NLP synthesis ranges, raven AM note.
  - Wascher et al. ([PDF](https://ecoevorxiv.org/repository/object/10600/download/22164/)): corvid NLP status.
  - Farnell Practical 28 ([page](https://aspress.co.uk/sd/practical28.html)): original patch structure.
- Rejected or deprioritized:
  - The CrowLingo vocal-anatomy page: no citations.
  - Morphic and stock-SFX pages: marketing.
  - The prani Rust crate and the Unity monster synth: no crow parameters or evidence.
  - crow-caw.com: unrelated.
  - The Chamberlain & Cornwell spectrogram numbers: lost in extraction.

## Next steps

1. On the reference, run a narrowband spectrogram (≥8192-point FFT) to decide between "f0 ≈ 700 Hz with f0/2 episodes" and "f0 ≈ 350 Hz". Also measure the onset rise time and how the spectral centroid changes during the onset.
2. Prototype Recipe 1 offline against Freesound 75162. A/B three variants: the comb's 3rd resonance alone, comb plus the old trill band, and the current model.
3. If a full-text route exists, check Tsukahara 2007 and Laiolo & Rolando 2003 for corvid formant and FM numbers.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "The research brief is written to the authoritative artifact path. It ranks fixes for the onset and timbre problems, gives exact parameters per source with links (Mates F0/wobble table, Jensen pulse data, Fletcher 1988 Table 1 and formants, Mindlin C constants, Farnell vposc/syrinx structure, Terrade NLP ranges), and maps them to three WebAudio recipes with sourced starting values. Unverified and secondary items are labelled throughout."
    }
  ],
  "changedFiles": [
    "/Users/caidan/.pi/agent/sessions/--Users-caidan-Projects-caidanw.github.io--/subagent-artifacts/outputs/9932aae6-4bf7-42e1-b22f-d25178fc48ca/research.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [],
  "validationOutput": [
    "Key claims were checked against fetched primary sources: PMC4237024 Table 2, PMC2279211, PMC25115, Fletcher1988 PDF, finch_void.c raw code, the Farnell practical28 patch text, Fitch 2002 PDF and PMC12150040. source_check was not used; the original pages were inspected directly instead."
  ],
  "residualRisks": [
    "Reading the reference's ~350 Hz spacing as an f0/2 subharmonic of a ~700 Hz voice is researcher inference and needs a narrowband spectrogram check.",
    "The quarter-wave tract fit (f1≈1.9 kHz, 3f1≈5.7 kHz) conflicts with anatomical trachea lengths (7–9 cm). It is a fitting choice, not established crow anatomy.",
    "Farnell table units, soundgen defaults, the Tarter thesis numbers and the Smyth/Kahrs equations could not be verified because extraction was garbled or a snippet was the only access.",
    "Recipe 3 retuning (lowering gm to reach ~600 Hz) is inference; the Mindlin constants are zebra-finch tuned.",
    "Per the run instructions, the file was written to the artifact path, not docs/research/crow-synthesis.md. The parent must copy it there if wanted."
  ],
  "noStagedFiles": true,
  "diffSummary": "New research markdown at the artifact path only; no repo files were touched.",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "Main recommendations: (1) the voice is likely ~600–700 Hz, with the 350 Hz spacing as a subharmonic; (2) a single closed–open tube comb explains the peak, gap and 5.7 kHz band; (3) a smooth onset where brightness follows amplitude and closure, with no noise burst; (4) the 48–50 Hz pitch/amplitude wobble from Mates et al. No sccode, Csound, Faust or WebAudio crow implementation was found."
}
```
