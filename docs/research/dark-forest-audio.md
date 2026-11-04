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

Focused listening sheet: `~/Projects/dark-forest-moodboard/sounds/crow-door-listening.html`. It presents each reference, the rejected first pass and the revision at approximately matched active levels, plus raw scene-level previews. No autoplay.
