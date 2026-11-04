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
- Existing editor buses remain separate: **rain** (wash/brightness) and **leaf & pool drops** (level/rate/pitch). Both support on/off, solo and example playback.
- Final tuning: drizzle has distinguishable close taps; the diffuse wash grows faster than the foreground drop rate, so heavy rain overlaps into a continuous texture. Reference-like contrast is a tuning aid, not a claim of exact acoustic equivalence.
- Deterministic offline checks at 44.1 and 48 kHz: dry output is zero; light/medium/heavy overall RMS increases; channels are decorrelated; grains have rounded beginnings and decayed ends; clearing and source mute settle to silence; min/max editor pitch and rate remain finite and below clipping at default levels. Tests live at `~/Projects/dark-forest-moodboard/tools/rain-check.ts`, run there with `node --no-warnings --import ./hook.mjs rain-check.ts`.
- Representative default output at 44.1 kHz: stereo left-channel RMS 0.0030 / 0.0066 / 0.0098 for intensity 0.2 / 0.6 / 1.0; heavy peak 0.154. These are implementation checks, not loudness targets for every source.
- TypeScript strict check and Astro build pass. Browser checks: trusted-click auditions for wash and drops produce output, brightness and solo controls work, and sound stops when switched off. The test browser was hardware-muted and closed afterwards. Programmatic `.click()` alone does not satisfy the browser's user-activation policy for starting Web Audio.

Listening files under `sounds/synth/`: `rain-after-0.2.wav`, `rain-after-0.6.wav`, `rain-after-1.wav`, `rain-coming-and-going.wav`, and `rain-with-fire.wav`. Compare the last two for the actual in-scene balance; compare loudness-matched references for texture only.

## Next research pass

After rain is reviewed: frog, owl, crow and wooden door creaks need species/material-specific references. Crickets are liked already; compare references before changing their character. Thunder and flames are accepted and should remain untouched.
