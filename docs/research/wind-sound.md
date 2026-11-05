# Wind in the trees

The operator asked for the wind to be reviewed. The old wind was looped brown noise through one bandpass at 300–760 Hz, Q 0.8. Its level and centre followed a product of two slow sines. Background research: [`log-and-wind-synthesis.md`](./log-and-wind-synthesis.md), section B. The agreed scope was the core layers only: gusts, treetops and leaf rustle, with no whistles, doorway howls or creaks.

## References

The recordings are in `~/Projects/dark-forest-moodboard/sounds/refs/wind/`. They are used for analysis only and never bundled.

| Recording                                                            | Author         | License    | Note                                               |
| -------------------------------------------------------------------- | -------------- | ---------- | -------------------------------------------------- |
| [106134](https://freesound.org/people/j1987/sounds/106134/)          | j1987          | CC0        | night wind in a Swedish forest; the primary target |
| [751473](https://freesound.org/people/Borgory/sounds/751473/)        | Borgory        | CC0        | soft wind, leaves rustling                         |
| [662575](https://freesound.org/people/alppdcjr12/sounds/662575/)     | alppdcjr12     | CC0        | subtle wind in trees                               |
| [849627](https://freesound.org/people/Hear_it_use_it/sounds/849627/) | Hear_it_use_it | CC BY 4.0  | wind in pine trees                                 |
| [86345](https://freesound.org/people/surrey_film/sounds/86345/)      | surrey_film    | CC0        | Scots pines in a force-8 gale; upper bound         |
| [wind.wav](https://aspress.co.uk/sd/p18/wind.wav)                    | Farnell, P18   | not stated | the model's own output                             |

## Model (`src/lib/dark-forest/audio-wind.ts`, `WindInTrees`)

- **Wind speed w (0..1).** Computed in JS at 50 Hz, after Farnell's Practical 18:
  - **Base:** weather `0.12 + 0.15·cloud + 0.1·rain`, multiplied by a log-normal drift over about 12 s and 3 s.
  - **Gust:** noise low-passed twice at 0.5 Hz, scaled by `(base + 0.5)² − 0.125`.
  - **Squall:** noise low-passed twice at 3 Hz, only above base 0.4.

  `rate` (gustiness) scales the drift, gust and squall. A 4 s history lets each layer read w through its own delay (0–3 s), so gusts travel through the trees.

- **Treetops.** Three layers panned −0.8, 0.1 and 0.85, at delays 0, 1.2 and 3 s.
  - Pink noise, high-passed at 160 Hz.
  - Gain ∝ (w + 0.1)^1.5 (Heutschi's vegetation noise).
  - A low shelf with the gain of Farnell's `rzero~`, at coefficient 0.4·(w + 0.2), and a lowpass at (600 + 1500·w)·brightness. Stronger wind sounds brighter.
- **Leaf rustle.** Farnell's thresholded noise: a ConstantSource offset of −t, a ReLU WaveShaper, then HP 200 Hz / LP 4 kHz.
  - The threshold comes from a table, so spike density follows a smoothed w (time constant about 2.3 s) between 0.42 and 0.75.
  - The gain is normalised by the spikes' RMS, so density and loudness are independent.
  - The noise level itself wanders every few ms (log-normal), so the spikes cluster like leaves ticking together.
  - Two layers sit in the trees; a third, quieter, quicker and brighter (HP 600 / LP 6.5 kHz), is in the undergrowth close by.
- **Looping.** Each layer plays its buffer twice, at slightly different lengths and rates, so the texture only repeats after minutes.
- **Editor preview.** The ▶ audition brings w up to a breezy 0.42 at once on every layer.

## Results

Measured after a 120 Hz highpass, with `tools/wind/wind_measure.py`:

| Measure                                                 | References            | Old       | New          |
| ------------------------------------------------------- | --------------------- | --------- | ------------ |
| Centroid (Hz)                                           | 800–3900              | 450–575   | 1200–1600    |
| Slope, 0.3–3 kHz (dB/octave)                            | −2.9 to −6.2          | −8 to −10 | −3.2 to −5.0 |
| Leaf band (2–6 kHz) kurtosis                            | 3.0–3.4 (Farnell 4.4) | 2.9       | 3.5–3.8      |
| Leaf band crest (dB)                                    | 12.2–14.8             | 11.8–12.2 | 13.8–14.7    |
| Envelope std (dB)                                       | 2.7–5.6               | 3.2–3.8   | 2.4–2.8      |
| Envelope 10–90% (dB)                                    | 7.2–10.8              | 6.6       | 5.0–6.4      |
| Periodicity (autocorrelation peak > 2 s, trend removed) | 0.05–0.33             | 0.12–0.19 | 0.17–0.27    |

The level swings are a little gentler than the references, which suits ambience under a campfire.

A-weighted level, old against new: clear night +2.6 dB, cloudy −2.4 dB, storm −4.4 dB. The new wind's energy is brighter; it sits under the fire, crickets and rain. The thunder, fire and other sources are unchanged.

This was built by a subagent that timed out before finishing. The parent integrated it into the main branch, re-rendered the comparisons, measured them as above, and confirmed the strict typecheck and the build. Listening sheet: `~/Projects/dark-forest-moodboard/sounds/wind-listening.html`. Awaiting operator review.

## Revision: audible when cloudy

Operator review: the wind sounds great, but the cloudy wind was so quiet it could not be heard at scene level. Over the first 30 s, cloudy wind measured −56 to −61.5 dB (A-weighted), 6–9 dB under the old wind and about 10 dB under the cloudy mix of fire and crickets, so it was masked. The weather base is now `0.12 + 0.3·cloud + 0.15·rain`, up from `0.12 + 0.15·cloud + 0.1·rain`. Clear nights are unchanged. Cloudy averages −52.3 dB (old −53.5), and storm −46.2 dB (old −48.1); stormy wind now crosses Farnell's squall threshold.
