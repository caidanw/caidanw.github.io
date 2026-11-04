# Dark Forest sound references

The scene synthesizes its audio; these recordings are **references**, not shipped assets. Local downloads and offline renders live in `~/Projects/dark-forest-moodboard/sounds/`. We can compare spectra, timing and envelopes, but those checks do not establish perceptual realism: listening remains the acceptance test.

## Accepted fire model

Accepted by the operator after comparing against real recordings. Saved in commit `aafe719`; keep its synthesis and the quiet flames bed unchanged during the rain pass.

- [Andy Farnell, Fire practical (original Pure Data patches)](https://aspress.co.uk/sd/practical11.html): separate crackling, hissing and lapping; crackles are noise under short envelopes, not little musical tones. The patches vary duration and filtering.
- [Joseph Sardin, Fireplace #3](https://bigsoundbank.com/fireplace-3-s2855.html) (CC0): `refs/bsb-fireplace-2855.mp3`.
- [Glaneur de sons, Campfire sound ambience](https://commons.wikimedia.org/wiki/File:Campfire_sound_ambience.ogg): `refs/campfire-commons.ogg`. Consult the source page for attribution/license if reusing audio.
- [FunWithSound, Campfire Close Crackling Sticks](https://freesound.org/people/FunWithSound/sounds/588401/): `refs/freesound-588401.mp3`.

Our interpretation: broadband snaps, some followed by a much quieter noisy tail; uneven event spacing and a large spread of loudness. The old ringing tones were the wrong cue. Measured resemblance is useful for rejecting bad models, not proof that a model sounds like fire.

## Rain: reference selection

| Recording                                                                                    | Local file under `sounds/refs/` | Useful evidence / caveat                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Anya_Media, Forest, light rain](https://freesound.org/people/Anya_Media/sounds/523391/)     | `rain-forest-1.mp3`             | Recordist describes light rain starting in woodland; stereo BP4025 / Zoom F8. CC0. Includes other woodland sounds; do not model the entire spectrum as rain. |
| [giddster, Forest cabin summer rain 1](https://freesound.org/people/giddster/sounds/719062/) | `rain-forest-2.mp3`             | CC0. Useful softer forest/cabin texture, not a close-mic drop template.                                                                                      |
| [theplax, Rain on Leaves](https://freesound.org/people/theplax/sounds/680402/)               | `rain-leaves-680402.mp3`        | Recordist describes moderate/heavy rain close to dead leaves, Pixel 6 internal mics. Attribution-required license. Reference only.                           |
| [conleec, AMB_M_City_Rain_Heavy](https://freesound.org/people/conleec/sounds/171981/)        | `rain-heavy-2.mp3`              | Recordist describes a courtyard with a stream splashing from a balcony. Good dense wash/splash reference, **not** a pure forest ambience.                    |
| [Anthousai, rain - drops on porch](https://freesound.org/people/Anthousai/sounds/398740/)    | `rain-drops-1.mp3`              | Useful close foreground impacts; porch coloration is not appropriate for the whole forest.                                                                   |

Other downloads (`rain-forest-3`, `rain-heavy-1`, `rain-pond-*`) contain strong rumble, other ambience, an umbrella or a hydrophone perspective. Do not average all of them into a supposed universal rain spectrum. MP3 previews, microphone response, distance and recording processing also affect these measurements.

### Synthesis sources

- [Andy Farnell, Rain practical, original patches and audio](https://aspress.co.uk/sd/practical15.html): models rain with many shaped pulses, noise-based drops, separate rain-on-leaf and rain-on-water models. The final audio example explicitly combines pulses, excited noise bands and entrained-bubble droplets. This supports distinguishing surfaces rather than treating every drop as a click.
- [Independent SuperCollider adaptation, Rain](https://en.wikibooks.org/wiki/Designing_Sound_in_SuperCollider/Rain): illustrates short parabolic contact pulses and how summing many independent sources approaches Gaussian noise. Useful readable cross-check, not the original author's implementation.

### Baseline measurements (local, not universal acoustics)

`tools/sound_analyze.py` in the moodboard workspace measures whole recordings using Welch spectra, and an exploratory transient detector (>4× local high-passed envelope, 4 ms separation). It can count several peaks inside a single splash and can mistake birds/handling noise for rain. Event rates are **detector outputs**, not literal counts of raindrops.

- Close leaves: mean spectral density roughly flat from 250 Hz–4 kHz, dropping above that; 50 ms RMS quiet-to-loud contrast ~18 dB. Transient median detected decay ~18 ms, with a long tail of overlapping splashes.
- Dense courtyard rain: emphasis around 2–8 kHz, quiet-to-loud contrast ~9 dB; much more continuous than the leaf recording.
- Forest/cabin recording: darker spectrum, contrast ~5 dB; distant soft texture.
- Old synth: contrast ~1 dB at every intensity. Almost constant noise plus clicks that were 3–12 ms long, with no surface variation. Increasing intensity mainly raised volume; it barely changed the texture.

### Rain design target

A soft, broad noise wash stays central (the operator's preference). Add many low-level impacts to keep it granular rather than static, with gently varying—not periodic or wind-like—density. Foreground drops have a rounded contact, a short damp leaf/body component and a splash tail. Sparse pool drops may have a short damp bubble component; avoid a chorus of pitched "water drop" beeps. Intensity changes density and overlap as well as level. Keep rain wash and nearby drops on the existing separate editor buses, with live controls and previews using the same synthesis as the world.

### Rain implementation and checks

- `audio-rain.ts`: independent 17/19-second granular white-noise washes; short, damp leaf impacts and a small proportion of pool drops. No recorded samples are bundled. Close impacts use a rounded contact and noisy splash tail; they are no longer the fire's tiny crackle grains.
- Editor buses: **rain** (wash/brightness), **leaf drops** and **pool drips** (each level/rate/pitch). All support independent on/off, solo and example playback. Leaf and pool foreground drops are both off by default; the accepted rain wash stays on.
- Final tuning: drizzle has distinguishable close taps; the diffuse wash grows faster than the foreground drop rate, so heavy rain overlaps into a continuous texture. Reference-like contrast is a tuning aid, not a claim of exact acoustic equivalence.
- Deterministic offline checks at 44.1 and 48 kHz: dry output is zero; light/medium/heavy overall RMS increases; channels are decorrelated; grains have rounded beginnings and decayed ends; clearing and source mute settle to silence; min/max editor pitch and rate remain finite and below clipping at default levels. Tests live at `~/Projects/dark-forest-moodboard/tools/rain-check.ts`, run there with `node --no-warnings --import ./hook.mjs rain-check.ts`.
- Initial combined-drop mix at 44.1 kHz (before the operator muted foreground drops): stereo left-channel RMS 0.0030 / 0.0066 / 0.0098 for intensity 0.2 / 0.6 / 1.0; heavy peak 0.154. Historical implementation checks, not current defaults or loudness targets for every source.
- TypeScript strict check and Astro build pass. Browser checks: trusted-click auditions for wash and drops produce output, brightness and solo controls work, and sound stops when switched off. The test browser was hardware-muted and closed afterwards. Programmatic `.click()` alone does not satisfy the browser's user-activation policy for starting Web Audio.

Listening files under `sounds/synth/`: `rain-after-0.2.wav`, `rain-after-0.6.wav`, `rain-after-1.wav`, `rain-coming-and-going.wav`, and `rain-with-fire.wav`. Compare the last two for the actual in-scene balance; compare loudness-matched references for texture only.

### Pool drips: separated from leaf taps

The operator liked the rain wash but disliked the mixed foreground pops. The old `drips` tuning key now controls **only leaves**, keeping its disabled default. A new `pool` key controls sparse water drips (now off by default; gain 0.65 if enabled), with its own clock, rate, pitch, meter and preview. Existing staged leaf tuning does not become pool tuning. The wash generator and its level/brightness curves are unchanged.

Additional primary references (analysis-only downloads, both CC0):

- [ftpalad, Water Dripping on Water](https://freesound.org/people/ftpalad/sounds/119938/): recordist describes drops into a pool of water, simulating a dripping faucet. Local `refs/pool-drips-119938.mp3`.
- [ProductionNow, Drips](https://freesound.org/people/ProductionNow/sounds/223049/): drops into water in a bathroom sink; cleaned up in Audacity. Local `refs/sink-drips-223049.mp3`. The sink coloration/reverb is not the outdoor target.
- [Farnell, Bubbles practical](https://aspress.co.uk/sd/practical12.html): bubble/drip generators combine changing oscillator frequency with short amplitude envelopes. The cave-drip example adds reverberation separately; we do not add that cave treatment to the pool.

Our implementation choice: water has a faint noisy contact followed by a short, damp, slightly rising bubble chirp, rather than the leaf's dominant noisy splash. Generated carrier starts around 1.4–2.8 kHz, with a 10–24 ms decay constant and a smooth attack. These are chosen tuning ranges guided by the recordings, not universal physical values. Events are sparse (2/s at full rain and default rate, fewer in drizzle), spatially anchored across the pool. Pool and leaf source mute/solo, sample-rate extremes and staged-data round trips are covered by the local regression checks. No other sound source changed.

Operator review: the revised pool drips still read as animal squeaks, so this model is parked, not accepted. Do not retune it during the animal pass.

Listening files: `sounds/synth/pool-drips-solo.wav` and `sounds/synth/rain-with-pool-drips.wav` in the moodboard workspace.

## Animal, door and cricket reference set

**No animal, cricket or door synthesis changed in the rain commit**; these references guide the subsequent voice pass. The reference species are starting points for the scene's character, not a claim that this fantasy clearing has a particular geography. Uploader species labels have not been independently verified.

| Sound   | Primary recording and local file under `sounds/refs/`                                                                                                                                          | License on source page |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Owl     | [sean.townsend, Tawny Owl — Male](https://freesound.org/people/sean.townsend/sounds/202917/), a night field recording; `owl-male-202917.mp3`                                                   | CC BY 3.0              |
| Crow    | [nigelcoop, crow.wav](https://freesound.org/people/nigelcoop/sounds/75162/), cawing while flying off, background filtered by the recordist; `crow-75162.mp3`                                   | CC0                    |
| Frog    | [IchBinChrist, Common Frog call](https://freesound.org/people/IchBinChrist/sounds/424288/), field recording labeled common frog in Arnsberg; `frog-common-424288.mp3`                          | CC0                    |
| Door    | [TheBuilder15, Wooden door creaking](https://freesound.org/people/TheBuilder15/sounds/367052/), wooden door slowly opening; `door-367052.mp3`                                                  | CC0                    |
| Cricket | [albertogalka, European field cricket](https://freesound.org/people/albertogalka/sounds/555199/), southern Poland in May, Zoom recorder and slight noise reduction; `cricket-field-555199.mp3` | CC0                    |

The local `refs/animals-and-doors.json` manifest records the source page, preview URL and license link for each download. These are analysis copies, not proposed bundled assets.

### Initial diagnosis

Measurements and proposed directions before the voice pass (not universal species constants):

- **Owl:** this male tawny reference has its strongest sustained energy in roughly the 0.7–0.9 kHz region, quite unlike the current repeated 400 Hz glides. Next: measure one complete phrase's contours and gaps, then model rounded breath/envelope and slight instability instead of three identical whistles. Do not simply transpose every owl to one frequency.
- **Crow:** the reference concentrates energy around 1.5–2.1 kHz with structured harmonics. These are spectral peaks, not necessarily its fundamental. Next: measure the underlying pulse rate, formants and onset/offset of one caw, retaining roughness without making a generic sawtooth buzz. [Farnell's Birds practical](https://aspress.co.uk/sd/practical28.html) explicitly separates modulation, tracheal formants and overall envelope; it is a synthesis framework, not an owl/crow-specific preset. [Cornell's American Crow sound archive](https://www.allaboutbirds.org/guide/American_Crow/sounds) provides identified recording context and examples for a second cross-check; it is not the species ID of the Freesound crow.
- **Frog:** prominent lower bands around 0.4–0.65 kHz in this recording. Next: isolate single calls, measure their pulse spacing and harmonic/formant envelopes. The current square-wave amplitude modulation of a sawtooth is only a placeholder. Do not infer all frogs have a Hollywood double "ribbit" from this file's tags.
- **Door:** the recording has high squeaking bands near 3–5 kHz as well as lower body sound; the current 700 Hz-filtered tone is missing the friction cue. [Farnell's original Creaking Door practical](https://aspress.co.uk/sd/practical09.html) supplies a concrete alternative: irregular stick-slip pulses under changing force, exciting wood bands and a panel response. Next: a short, restrained friction creak, not a horror-door recording or a pitched beep.
- **Cricket:** this recording's strongest narrow band is around 4.6 kHz, already inside the current 4.3–5.1 kHz range. Keep its liked character; inspect within-chirp pulses and pauses before deciding whether any change is warranted. [Farnell's Insects practical](https://aspress.co.uk/sd/practical27.html) has distinct cricket-chirp and stridulation models, with carrier and pulse/envelope structure rather than undifferentiated noise.

Full-recording spectra above contain background and processing. Single-call spectrograms and matched-level listening guide implementation, not these summary numbers alone. Thunder and flames are accepted and remain untouched.

### Reference-based voice pass

Operator review: **frog and owl accepted**. The first crow sounded like a baby crying; the first door sounded like dragging a stick through gravel. The crow and door descriptions below record that initial pass; the next section records their revisions. Preserve the accepted frog/owl synthesis.

`audio-voices.ts` generates variant banks from synthesis equations, never decoded recording data. `audio.ts` plays them through the existing per-source buses with position, distance, gain, pitch, solo and mute. Natural world triggers are unchanged: the frog croaks, crow takes flight, hut door opens, and owl calls occasionally in dry weather.

Additional frog reference: [daveincamas, Pacific Chorus Frog solo](https://freesound.org/people/daveincamas/sounds/32807/) (CC BY 4.0), local `refs/frog-chorus-solo-32807.mp3`. The recordist identifies a close solo male, with house echo and distant frogs, and notes low-frequency cleanup. This is a clearer individual call than the earlier common-frog chorus. It is a sound-design reference, not a species assignment for the scene's frog.

Local measurements and synthesis choices:

- **Frog:** reference foreground calls around 0.2–0.3 seconds, strongest bands near 1.1 and 2.4 kHz, envelope pulses around 60–70 Hz in the selected excerpt. New synthesis uses short damp throat/sac modes in an irregular pulse train, a swelling syllable envelope and very faint breath. No low sawtooth with square-wave gating, and no mandatory double "ribbit".
- **Owl:** in the first measured phrase, the first hoot spans roughly 1.94–2.77 seconds; a short pickup is near 6.76 seconds, and the response near 7.53–8.67 seconds. The new full phrase includes that long pause, rounded onset/release, a curved 0.7–0.9 kHz contour, weak harmonics/breath and a quavering response. It is deliberately not three equally spaced descending sines. The editor preview keeps the whole phrase audible, including at low pitch; automatic scheduling leaves a gap after the complete phrase.
- **Crow:** the reference caws range roughly 0.35–0.8 seconds, with a quick rise, ragged held middle and a fall. The new harmonic source has pressure-dependent pitch, small random frequency perturbations, throat bands around 1.1/1.85/2.65 kHz and a little air. Two caws vary in duration and strength; they no longer use a short uniform sawtooth glide.
- **Door:** irregular force-dependent stick/slip impulses excite several damp wood modes; a rough high-frequency hinge rub supplies the friction cue. The old triangle-note bend is gone. The model is intentionally a short, restrained hut creak, not a long horror-door sample. Spectral balance was checked against the recorded door, but the result still needs perceptual review.
- **Crickets:** the existing liked synthesis is retained. Its carrier range already overlaps the field-cricket reference; no change made merely to make it different.

Checks: finite, tapered, normalized voice buffers and routed previews at 44.1/48 kHz; each source audible independently even when off during audition; pitch-range extremes; complete owl responses rather than truncated previews; world event triggers; mute and return to silence. Local command: from `~/Projects/dark-forest-moodboard/tools/`, `node --no-warnings --import ./hook.mjs voice-check.ts`. Rain regression checks also pass. Strict TypeScript and the Astro build pass. Browser checks confirm trusted-click previews, the owl's late response, per-source tuning and solo, and sound stopping when disabled; the hardware-muted test browser was closed afterwards. The accepted fire/log/thunder/cricket methods and rain-material module were also compared against their previous source to catch unintended retuning. Spectral/envelope comparison is a diagnostic tool, not a substitute for listening.

Listening sheet for the initial pass: `~/Projects/dark-forest-moodboard/sounds/voices-listening.html` (reference / previous synth / new synth, approximately matched by active sound level). Raw individual previews and an actual-level scene mix are in `sounds/synth/`. Nothing autoplays.

### Crow and door: articulation revision

Same primary recordings as above. Looking at selected single-event spectrograms and 2 ms envelopes, rather than just the whole-file spectrum, showed the missing cues:

- The old crow had a clean rising/falling harmonic arch and a swelling vowel onset. The operator specifically wanted the "ka" part. Revision: a brief band-limited noisy opening overlapping a fast voiced onset, shorter coarse body, irregular pressure rather than periodic vibrato, nearly level pitch with a small terminal break. The higher opening band settles into the caw. "Ka" is a perceptual analogy for the desired attack, not a claim about crow speech articulation.
- The old door had a nearly stationary noise band and many little impacts, consistent with the operator hearing gravel. The reference's initial squeak has visible moving harmonic bands and distinct catches, followed by a lower strained pull. Revision: two slightly detuned, overtone-rich hinge-slip voices follow an uneven motion/pressure contour. A brief pressure catch separates the initial squeak from the downward pull. Only three small loads excite the wooden body; broadband friction noise is now faint, not the main sound. No reverb or slam.

No accepted sound was retuned. All frog/owl variant buffers compare byte-for-byte with the saved accepted module under the same random seed at 44.1 and 48 kHz (`accepted-voices-check.ts` in the local tools workspace). Existing voice checks now also require an audible early crow attack, a pressure catch in the door, an audible pull after it, and a lower crossing rate during that pull. These are structural checks, not a guarantee of perceptual success.

Focused listening sheet for that revision: `~/Projects/dark-forest-moodboard/sounds/crow-door-listening.html`. It presents each reference, the rejected first pass and the revision at approximately matched active levels, plus raw scene-level previews. No autoplay.

### Research-led pulse-source pass

Operator review of the articulation revision: the crow improved but still lacked the reference's rattling/trilling texture; the door sounded like a pitch-loop effect rather than a creak. Both remain unaccepted. The previously accepted frog and owl must remain unchanged.

Primary and implementation sources checked before the next prototype:

1. [Jensen et al., _Songbirds use pulse tone register in two voices to generate low-frequency sound_](https://pmc.ncbi.nlm.nih.gov/articles/PMC2279211/) reports high-speed observations of hooded-crow syrinx dynamics, and compares induced sounds with spontaneous calls. In the reported calls, short pulses recur at roughly 3–4 ms intervals; two/three-pulse clusters and longer closed intervals occur. Natural calls include damped oscillations interpreted as tracheal resonance near 1.6 kHz. This supports pulse-cluster excitation plus tract resonance, rather than a smooth sustained harmonic vowel. It is not a universal recipe for every crow species or call.
2. [Farnell's original Creaking Door practical](https://aspress.co.uk/sd/practical09.html) provides an actual synthesised example and a force-driven stick-slip source, wood filtering and panel delays. The example audio was downloaded locally as `sounds/refs/farnell-creaking.wav` for comparison only; it is not an application asset.
3. [Independent SuperCollider implementation, Creaking Door](https://en.wikibooks.org/wiki/Designing_Sound_in_SuperCollider/Creaking_door) explicitly notes that purely random Dust events lack the slightly pitched creak; it uses a near-periodic impulse source with varying frequency, force buildup and event envelopes into wood and panel processing. Useful implementation cross-check, not a claim of exact physical simulation.
4. [Tsugi / Kevin Doran, _Patch Anatomy #6 — Creaky Hinge_](https://tsugi-studio.com/blog/2020/10/19/patch-anatomy-6-creaky-hinge/) demonstrates an existing procedural hinge patch: slip-stick source clicks, a resonant Cabinet, and automation that maps to click clock frequency and subtle pitch/speed variation. Friction/body and tonal color are separate parts of the model.
5. [Sound Design Toolkit, Friction API](https://sdt.lim.di.unimi.it/docs/API/v2.2-078/group__friction.html) documents an elasto-plastic friction interactor with elastic, dissipation, viscosity and surface-noise terms; it specifically identifies pre-sliding/breakaway transients as important for realism. This is context, not code reused here. The proposed lightweight clock/event model is **not** SDT's full solver.

Implementation direction: preserve the improved crow opening but replace its held vowel with short grouped pressure pulses exciting damp tract bands. For the door, discard the hand-drawn audio-frequency pitch contour; drive a nearly regular, force-varying stick-slip event source into fixed material resonances and short panel reflections. Random clicks alone gave gravel; a clean oscillator sweep gave the loop effect. The intended creak comes from the interaction of a pulse train and a resonating object. No external library/source implementation is copied or linked into the app.

The resulting prototype uses:

- **Crow:** 0.5–0.8 ms pressure pulses in two/three-pulse clusters, damp tract bands near 1.6 and 2.7 kHz, a faint air component and the retained noisy opening. Resonator decay overlaps the individual openings without erasing the group gaps. In a diagnostic 1–3 kHz envelope comparison, the reference and prototype both have prominent texture around 70–100 Hz; the prototype's depth is intentionally stronger than the previous held voice. Matching this modulation range alone does not establish a natural-sounding crow.
- **Door:** a force-varying clock drives semi-regular, short release envelopes. Longer sticking intervals build larger releases, capped to avoid a slam. Fixed wood/hinge modes and four short damp panel reflections shape those releases. No manually swept audible oscillator remains in the door. This is a lightweight perceptual/event model, not a fully solved mass/friction system.

Safety/structure checks at 44.1 and 48 kHz include finite tapered buffers, independent previews, pitch-range extremes, world triggers, mute and silence; the crow must now retain substantial short-time grouped amplitude variation, and the door must have semi-regular slip structure with a catch and resumed pull. The old assertion demanding a large pitched downward sweep was removed: it encoded the rejected whistle design, not a creak requirement. Accepted frog/owl variant buffers remain byte-for-byte identical under the same seed. Other accepted sound generators and disabled foreground-drop defaults are unchanged.

Listening sheet: `~/Projects/dark-forest-moodboard/sounds/pulse-models-listening.html` includes the reference recordings, previous versions, new pulse-source models, and Farnell's published synthesized door example. Comparisons are approximately active-level matched; raw scene-level previews are separate. Nothing autoplays. This is still a listening prototype pending operator review, not a claim of perceptual success.

### Envelope/body and slower-motion refinement

Operator review: the pulse-source crow improved, but needed a slightly longer attack, sharper release and less crushed/thin timbre. The door was still perceived as two short, flatulent blips; the requested next step was a slower drawn-out pull with changing release rate.

- **Crow:** keep the same pulse grouping/cadence. Grow the voiced body over about 45 ms instead of 8 ms, release over about 18 ms instead of 70 ms, and soften the noisy opening. The pressure pulse now tapers closed rather than being abruptly truncated. A broad chest band around 700–950 Hz adds low-mid weight; the raw pulse and upper-band gains are reduced and a gentle 3.9 kHz rounding filter limits the brittle edge. This is timbre/envelope shaping, not changing the actual sample bit depth or lowering the whole call's pitch.
- **Door:** extend the motion from roughly 1.1 seconds to 2.8–3.3 seconds. Separate pressure from slip cadence: pressure remains present through the middle, while the slip clock follows a changing motion curve (roughly 70–620 releases/second). Shorten release pulses as they crowd together so they remain individual slips rather than a sustained DC-heavy buzz. Weight upper wood/hinge modes more strongly and attenuate the bass modes, addressing the flatulent quality without reinstating a swept whistle oscillator.
- **Playback:** the door's editor audition hold is derived from the longest generated door buffer and the selected playback pitch, rather than a stale 1.8-second constant. This prevents cutting off the slower creak, including at the lowest pitch.

Updated checks require a growing crow onset and quick release, retain grouped body texture, require a roughly three-second continuous door motion, detect changing cadence in separate portions of the pull, and check that late door audio survives the full preview at pitch extremes. The obsolete zero-energy catch requirement was removed because the operator explicitly rejected the two-blip shape. Other accepted sounds remain untouched; the accepted frog/owl buffers still compare byte-for-byte at 44.1/48 kHz. Strict TypeScript, Astro build and rain regressions pass. A hardware-muted browser check confirmed the door remains audible after two seconds in the editor preview and stops when sound is switched off; that test browser was closed.

Focused listening sheet: `~/Projects/dark-forest-moodboard/sounds/envelope-motion-listening.html`, comparing the previous pulse versions with this refinement. Reference recordings and raw scene-level previews are included, with no autoplay. Awaiting perceptual review; passing waveform checks does not establish realism.

### Operator verdict: restore the crow, shorten the door

Operator review of the envelope/body refinement: the crow went the wrong way, and the previous pulse version was better. The long door's creak sounded good but was much too long. The requested direction was a single short squeak rather than repeated slips, closer to a game's quick, subtle door-open click (for example Minecraft) than a full recorded door.

- **Crow:** `crow()` is restored exactly to the `43dd133` pulse-source version: 8 ms body attack, 70 ms release, no chest band, no rounding filter. The softer-attack/fuller-body variant is rejected and should not be revisited without a new request.
- **Door:** keep the liked stick/slip material model (wood and hinge bands, panel reflections), but run one short movement of 0.26–0.33 s with a single force swell. The slip rate rises quickly to about 600 releases/second, then falls; there is no catch or second pull. A small wooden latch impulse 3 ms in, through the same wood bands, gives the opening click. The tail is shortened to 100 ms, and the scene gain is halved to 0.08 so it reads as an incidental cue.
- **Editor preview:** source buses start at zero and were opened only by `update()`, which waits for a running context. The first ▶ after page load could therefore swallow a short sound before the bus opened; the three-second door had hidden this. `audition()` now opens its bus at the example's start time. This is a preview gating fix and does not alter any voice synthesis.

Checks: door buffers are one short movement with an early latch click, an audible creak and prompt settling; door previews have no second event and are quiet by default. The crow keeps its earlier ka-attack check. Accepted frog/owl buffers are still byte-for-byte unchanged. A hardware-muted browser check confirmed the door is audible on the first click after load, silent after one second, and that sound stops on toggle.

Tooling note: `node-web-audio-api` occasionally rejects a valid offline `suspend()` (`InvalidStateError`), even in a minimal graph with no forest code. Chaining suspends from inside a checkpoint fails reliably, so batch registration stays. `voice-check.ts` retries one affected render and logs the retry; rerun the other offline tools if they hit it.

Listening sheet: `~/Projects/dark-forest-moodboard/sounds/quick-door-listening.html`. Awaiting perceptual review.

### Half-second door squeak; crow high trill from measurement

Operator review: the latch was inaudible, which was fine because the request was for one squeak. The squeak itself was good but too quick; it should last 0.5–0.8 seconds. The restored crow is better but still lacks the higher-pitched trilling heard in the reference.

- **Door:** remove the latch impulse. Run the same single force/slip-rate swell over 0.5–0.8 s; the normalized contours stretch with the duration, so the liked squeak character is kept, just slower. Scene gain remains 0.08.
- **Crow, measured:** comparing the reference (`crow-75162`) with the restored synth showed similar rattle rates in the body envelope (reference 65–75 Hz, synth 75–81 Hz). The difference is spectral:
  - The reference has a separate high band peaking around 5.5–6.1 kHz, about 23–30 dB below the 0.7–3.5 kHz body.
  - That band stands 8–16 dB (up to 41 dB) above an empty 3.6–4.7 kHz gap.
  - Its envelope flickers only partly with the body; correlation is 0.4–0.6, and about 0 in one call.
  - The synth had no distinct band. Its 2nd-order resonator skirts and click spillover filled the gap, so the "high" region was 5 dB _below_ the gap and locked to the clicks (correlation 0.66). Removing individual components did not open the gap.
- **Crow, change:**
  - Keep the restored pulse body, ka attack and envelope.
  - Pass the body through an 8th-order 3.3 kHz Butterworth lowpass (two RBJ pairs), leaving the ka burst unfiltered.
  - Add a trill band: two cascaded bandpasses (Q 4) at 5.6–6.1 kHz, driven mostly by the pressure pulses plus a little noise. Its gain flickers to random 0.1–1 levels every 8–16 ms, smoothed over 2 ms.
  - The bank now measures: trill −21.6 dB below the body, 8.7 dB above the gap, envelope correlation 0.55, peak around 5.7–5.9 kHz. These are within the reference ranges.
  - Alternative **A** keeps the unfiltered body and needs the trill at about −15 dB to clear the leaked energy. It is rendered for comparison only.

Checks: `voice-check.ts` now requires the crow trill band to be >5 dB clear of the 3.6–4.7 kHz gap and between −28 and −16 dB relative to the body. The previous crow fails this and the new one passes. Door checks require one 0.5–0.8 s squeak that does not break into blips and settles promptly. Accepted frog/owl buffers are still byte-for-byte unchanged; rain checks pass. A hardware-muted browser check confirmed both previews; that browser was closed.

Listening sheet: `~/Projects/dark-forest-moodboard/sounds/squeak-trill-listening.html`, with variants A and B (B in the scene). Matching measured spectra does not prove the trill is perceived the same way; awaiting operator review.

### Crow: smooth onset and the real fundamental (reference measurements)

Operator review: the trill helped less than expected. The burst at the start of each caw is wrong (the reference is smoother), and the overall timbre is still off. Background research on crow synthesis and corvid caw acoustics is in [`crow-synthesis.md`](./crow-synthesis.md).

Measurements of Freesound 75162 (five caws) against the current synth:

- **Onset.** The reference rises over 84–203 ms (10–90%); the envelope peaks 135–333 ms in. Its first 40 ms are only 0.49–0.76× the steady level, and the onset is slightly _darker_ than the steady part (centroid about 1.6–1.9 kHz, against 1.8–2.0 kHz steady). The synth rises in about 9 ms. Its first 40 ms reach 1.3–1.8× the steady level, with a bright 3.7–4.1 kHz centroid. The noisy "ka" burst is therefore the opposite of the reference.
- **Fundamental.** A narrowband (8192-point) analysis gives f0 ≈ 690–720 Hz in every caw. The fundamental is a weak line near 700 Hz, about 15–20 dB below the strongest harmonics. The 1.5–3.1 kHz harmonics are smeared into a dense plateau by rapid wobble, and the spectrum cuts off steeply above about 3.2–3.4 kHz. A component at f0/2 (360 Hz) appears only at about −75 dB. This matches Mates et al.'s American-crow mean of 604 Hz (95th percentile 697 Hz). The current 300–340 Hz pulse clock, taken from hooded-crow pulse-register data, is about an octave low.
- **Texture.** The synth's spectrogram shows separate click groups with silent gaps about every 13 ms, ringing two narrow fixed resonances. The reference is a continuous, wobbling harmonic tone with no gaps.

Plot: `~/Projects/dark-forest-moodboard/shots/crow-onset.png` and `crow-f0-narrowband.png`.

### Crow prototypes from the research (offline, not yet in the scene)

A further narrowband check refines the f0 finding above. The energy halfway between the ~700 Hz harmonics is within −5 to +3 dB of the harmonics, and about 7 dB above the floor between them. The caw is therefore _period-doubled_: a ~700 Hz voice with a strong ~350 Hz subharmonic stack, whose lowest component is cut away below ~600 Hz. The old 300–340 Hz clock was close to the subharmonic. What was wrong was its sparse click clusters with silent gaps, not the clock rate alone.

Prototype generator: `~/Projects/dark-forest-moodboard/tools/crow-proto.ts`. Measurement tools: `tools/crow_compare.py` and `tools/debug/crow_bands.py`. The prototype has:

- **Source:** a continuous Farnell `vposc` pulse, `1/(1 + (pw·cos θ)²)` with the mean removed, at f0 ≈ 670–730 Hz. Every other pulse is weakened by 0.65–0.95, producing the subharmonic.
- **Closure and onset:** the pulse width `pw` (sharpness, so brightness) runs from 5 to 22 and follows the loudness envelope raised to the power 1.5. Attack is ~0.13 s and release ~0.3 s (raised cosine). There is no noise burst, only a little high-passed breath while the closure is incomplete.
- **Pitch and wobble:** the pitch arches, peaking at about 40% of the call. A linked pitch (±6%) and amplitude (depth 0.95) wobble runs at 55–75 Hz, with a wandering rate and uneven cycle depth, plus 2% per-cycle jitter.
- **Tract:** a closed–open tube (negative-feedback comb, gain 0.7, loop lowpass 6 kHz) with f1 ≈ 2.05 kHz. The body takes a 12th-order 3.25 kHz Butterworth lowpass and a 4th-order 1.3 kHz highpass. The tube output's third resonance (3·f1) is band-passed (two Q-5 stages) to form the high band.
- **Variants:** 1 _smooth_: the high band as above. 2 _trill_: the high band's level flickers independently. 3 _rasp_: one 40–90 ms episode of ±2.5-semitone period jitter mid-call (Terrade et al.'s chaos range).

Measured medians, five caws each (reference / current scene crow / prototype 1):

| Measure                          | Reference | Current   | Prototype 1 |
| -------------------------------- | --------- | --------- | ----------- |
| Rise, 10–90% (ms)                | 51        | 6         | 54          |
| First 40 ms ÷ steady             | 0.76      | 1.57      | 0.62        |
| Onset centroid (Hz)              | 1702      | 3796      | 1741        |
| Steady centroid (Hz)             | 1931      | 1835      | 1832        |
| Release (ms)                     | 106       | 31        | 95          |
| Harmonics − half-harmonics (dB)  | −0.5      | 2.6       | 0.1         |
| Half-harmonics − floor (dB)      | 6.8       | 4.8       | 7.7         |
| High band ÷ body (dB)            | −26       | −22       | −23         |
| High band ÷ 3.6–4.7 kHz gap (dB) | 16        | 8         | 11          |
| Wobble rate (Hz) / depth         | 65 / 0.39 | 83 / 0.43 | 65 / 0.36   |

The remaining measured differences are a slightly less steep cliff above 3.3 kHz and a main peak 1.66 kHz versus 1.79. Listening sheet: `~/Projects/dark-forest-moodboard/sounds/crow-proto-listening.html`; spectrograms: `shots/crow-prototypes.png`. These measurements do not establish perceptual likeness. The scene still uses the current crow until a prototype is chosen by ear.

### Prototype 1 in the scene, with reference-like caw lengths

Operator review: prototype 1 (smooth) is the preferred direction, but its caws were too short. The reference opens with a longer caw, followed by several shorter ones.

Reference lengths (envelope above 10%): 0.78, 0.60, 0.48, 0.51 and 0.49 s. Onsets are 1.13 s apart after the opening caw and 0.77–0.83 s apart after that. Prototype 1 caws measured only 0.38–0.52 s.

- `crow(ctx, duration)` is now the prototype 1 voice, ported unchanged from `tools/crow-proto.ts`. The bank holds 12 shorter caws (0.55–0.70 s synthesis length) and a separate `crowOpening` bank of 6 long caws (0.82–0.92 s).
- `Soundscape.crow()` plays a series: one opening caw; then, after 0.30–0.40 s, one to three shorter caws separated by 0.22–0.32 s. All gaps are divided by the pitch setting. It returns the series length, so the editor preview holds the bus open for exactly as long as needed.
- Rendered scene previews measure opening caws of 0.77–0.83 s and shorter caws of 0.50–0.63 s. Onsets are 1.2–1.26 s apart after the opening and about 0.87 s apart after that. Per-caw spectral, onset and wobble measurements stay those of prototype 1.

Checks: the crow banks must have their target lengths, an onset that grows in (no burst), the rough wobble texture, a high band clear of the 3.6–4.7 kHz gap and little energy below 550 Hz. The crow preview must play 2–4 caws, opening with the longest, with the last one fading rather than cut off, at all pitch settings. Accepted frog/owl buffers are unchanged; the rain checks and build pass. A hardware-muted browser preview gave a 0.79 s caw followed by a 0.49 s caw; the browser was closed afterwards.

Listening sheet: `~/Projects/dark-forest-moodboard/sounds/crow-series-listening.html`. Awaiting operator review.

### Accepted: crow series and door squeak

The operator accepted the crow series in `9d6f6b1` ("sounds good") and the single 0.5–0.8 s door squeak ("good for now"). Treat both as accepted. Do not retune them while working on other sounds, and keep their voice-check assertions.

## Thunder: distance-driven and rolling

Operator review: thunder is liked overall but may be too quiet; does it vary with distance? Approved approach: make the rumble audible, give each strike a real distance driving everything, then set the level.

**Old model.** Lightning `power` = 0.5–1 × cloud cover. Thunder followed 0.8–3.5 s later regardless of power. The sound was three low-passed brown-noise bursts (90–160 Hz) plus a 1.4 kHz crack above power 0.75, panned at random. The 3 s noise buffers were not looped, so the bursts ran out of noise after 1–3 s and ended abruptly.

Measured, at power 1 (the maximum): 77% of energy below 150 Hz and about 1.5% above 300 Hz. A-weighted, its loudest second was only **+1 dB over a heavy-rain storm bed**.

**References** (Freesound, CC0, analysis only; `moodboard/sounds/refs/thunder/manifest.json`):

| Recording               | Note                        |
| ----------------------- | --------------------------- |
| Fission9 534023         | strike about 1.6 km away    |
| TRP 717907              | close crack                 |
| cognito perceptu 347853 | close clap and rumble       |
| bastipictures 243778    | close peal                  |
| kangaroovindaloo 585077 | clap                        |
| TRP 717845              | distant rolling             |
| newlocknew 768076       | distant rolling (CC BY 4.0) |

Measured with `tools/thunder_measure.py`:

- **Low end:** real thunder is also mostly below 300 Hz by energy, so "too much bass" alone was not the problem.
- **Mid band and crack:** in the first 1.5 s, the brighter close strikes put 13–24% of their energy in 300–800 Hz and up to 7.6% in 0.8–3 kHz (the tearing crackle).
- **Build-up:** about 0.3 s from −30 dB to the main peak.
- **Decay:** 0.8–2.4 s to −20 dB below the peak, and 3–13 s (typically about 6 s) to −30 dB.
- **Roll:** 3–8 swells per 10 s, with 6–10 dB of fast, spiky fluctuation.
- **Distant strikes:** slow builds, little above 1–2 kHz.

**Model** (after Farnell, Designing Sound, [Practical 17](https://aspress.co.uk/sd/practical17.html): strike pattern, rumble with random sample-and-hold flutter, "box of delays" reflections band-passed at 400–800 Hz, a late sub "deep" boom, and a distance lowpass):

- **Weather** (`sim/weather.ts`):
  - Each strike gets a distance `0.5 + 5.5·r^0.8·(1.3 − 0.3·cloud)` km; the median is about 3.7 km, with about 12% within 1.5 km.
  - Flash brightness is `cloud·(0.35 + 0.65·near)`.
  - The bolt is drawn with probability `0.15 + 0.85·near`; far strikes are mostly sheet lightning.
  - Thunder arrives `0.3 + 0.9·distance` s later (sound's ~3 s/km, compressed).
  - Pan comes from the bolt's screen x.
- **Audio** (`Soundscape.thunder(at, distance, pan)`):
  - Strike gain `1/(1 + 0.3·(d − 0.5))`; distance lowpass `500 + 9000·near²` Hz.
  - Close strikes (near > 0.55) start with 5–10 tearing band-passed noise bursts (0.5–5 kHz) spread over the first second or so.
  - One long main peal: brown noise lowpassed at 180–300 Hz, plus band-passed white noise at 250–500 Hz, with a 0.3 s build.
  - Later swells every 0.5–1.8 s, decaying with τ = 3–7 s.
  - 14–23 scattered reflections at 400–900 Hz.
  - A late 80 Hz boom.
  - All rumble layers pass through a looping "flutter" envelope: random steps every 5–65 ms, mostly low, with occasional spikes, mean 1. They decay to −60 dB over 10–18 s.
  - `burst()` now loops its noise and takes an optional attack and tail level. `audition('thunder')` plays a random distance each press and holds for its full length.

**Results**, measured at 0.7, 1.5, 3 and 5 km:

| Measure                                  | New thunder | References |
| ---------------------------------------- | ----------- | ---------- |
| Fade to −30 dB                           | 4–6 s       | 3–13 s     |
| Swells per 10 s                          | 4–6         | 3–8        |
| Fluctuation depth                        | 6–7 dB      | 6–10 dB    |
| 0.7 km, first 1.5 s: share in 300–800 Hz | 15%         | up to 24%  |
| 0.7 km, first 1.5 s: share in 0.8–3 kHz  | 7.4%        | up to 7.6% |

Far strikes stay dull. Loudest A-weighted second over the heavy-rain bed: about +12 dB at 0.7 and 1.5 km, +5.5 dB at 3 km and +2.3 dB at 5 km (it varies a few dB between strikes).

`tools/sound_render.ts … sim=1 storm=1` renders a storm with real strikes and logs their distances. Listening sheet: `~/Projects/dark-forest-moodboard/sounds/thunder-listening.html`. Awaiting operator review.
