# Log on the fire

The operator's review was that "the thump of the log when it's put on the fire feels off". The old sound was an 80→42 Hz sine sweep through a 200 Hz lowpass, essentially Farnell's bouncing-ball recipe, which reads as a kick drum. It was followed by 22 crackle grains within 2 s. Background research: [`log-and-wind-synthesis.md`](./log-and-wind-synthesis.md), section A.

## References

The recordings are in `~/Projects/dark-forest-moodboard/sounds/refs/log/` (`manifest.json` has URLs and licenses). They are used for analysis only and never bundled.

| Recording | Author      | License   | Note                                |
| --------- | ----------- | --------- | ----------------------------------- |
| 468179    | juliadang   | CC0       | wood thrown into a fireplace        |
| 802191    | Sadiquecat  | CC0       | new log on embers, fire pit         |
| 455132    | richwise    | CC0       | logs into a hot stove (metal box)   |
| 660298    | Ambient-X   | CC0       | kindling on an outdoor campfire     |
| 801818    | Sadiquecat  | CC0       | log on a log pile                   |
| 614885    | flwrpwr     | CC BY 3.0 | adding logs to a fireplace          |
| 683056    | EricBuechel | CC BY 4.0 | pallet on a bonfire                 |
| 796642    | Frostnox    | CC BY 4.0 | small log hitting a branch, no fire |

Measured with `tools/log/impact.py` over ten landings in seven recordings. Values are median (range):

| Measure                                                                   | Value                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Energy share by band: <150 Hz / 150–500 Hz / 0.5–2 kHz / 2–8 kHz / >8 kHz | 2 (0–17) / 27 (2–68) / **46 (19–89)** / 9 (3–36) / 2 (0–10) % |
| Centroid, 0–30 ms                                                         | 1570 Hz (667–2827)                                            |
| Centroid, 30–150 ms                                                       | 1155 Hz (304–4435)                                            |
| Time to −10 dB / −20 dB                                                   | 17 ms (10–66) / 97 ms (22–146)                                |
| Mode frequency                                                            | 825 Hz (161–2681)                                             |
| Mode T60                                                                  | 121 ms (33–894)                                               |
| Crunch transients, 15–800 ms after impact                                 | 5 (0–16); the last at about 636 ms                            |

The impact is a wooden knock in the hundreds of Hz to a few kHz, with a broadband contact. There is no tonal low thump. Crackling picks up over seconds as the wood catches: `tools/log/catch*.py`, `shots/log-catch*.png`.

## Model (`src/lib/dark-forest/audio-log.ts`)

`Soundscape.logLands(at, fuel)` calls `logLanding()` with the fuel added. One log adds about 0.2; size = fuel/0.2, clamped to 0.5–1.6.

1. **Contact.** Rendered into one 1.1 s buffer per landing, at about 4–5 ms of CPU.
   - **Wood modes:** free–free beam modes at f₁·{1, 2.757, 5.404, 8.933} (Irvine), with f₁ = 380–800 Hz·size^−0.3·pitch. A second, higher set models the log it strikes.
   - **Mode decay:** T60 = ring·√(600/f), with ring 60–160 ms. Wood's tan φ ≈ 0.02 alone gives 110/f, but the recorded modes (0.3–1.7 kHz) all die in 70–500 ms.
   - **Excitation:** raised-cosine contact pulses (van den Doel & Pai): the landing, 0.15–0.5 ms, then one or two softer settling knocks, closer and closer together (dropper-like).
   - **Knock:** a few ms of low-passed noise for the contact itself.
   - **Thud:** an unpitched low-passed noise thud from the bed, at −16 dB.
2. **Crunch.** PhISEM after Cook's STK Shakers: "crunch" at 800 Hz plus "big rocks" at 6.46 kHz (±11%), 10 dB down. Energy is injected at the landing, at the settles and 1–4 more times over 0.5 s, at −5 dB·√size.
3. **Ash puff.** Low-passed noise at 0.8–1.5 kHz, with 20–40 ms rise and 50–80 ms decay, at −18 dB.
4. **Flare.** Noise high-passed at 1 kHz, swelling over 0.4–0.9 s, holding for 0.6–1.4 s, then decaying with τ = 1.4–2.2·√size s (Farnell P11's hiss).
5. **Catching.** The fire's own accepted crackle grains, at a rate that starts 0.8–1.6 s after the landing, peaks 5–8 s in and decays with τ = 7–11 s. The peak rate is 3.5·size·rate extra starts per second. Loudness is heavy-tailed, with follow-ups like `Soundscape.crackleAt`.

`pitch` shifts the modes, crunch and hiss; `rate` (labelled "catching") scales how hard it catches. The editor preview holds for the whole event.

## Results

Ten rendered landings, measured the same way. Values are median (range):

| Measure                                    | References            | New                   |
| ------------------------------------------ | --------------------- | --------------------- |
| Bands <150 / 150–500 / 0.5–2k / 2–8k / >8k | 2 / 27 / 46 / 9 / 2 % | 6 / 21 / 64 / 7 / 0 % |
| Centroid 0–30 ms                           | 1570 Hz               | 1417 Hz (877–1812)    |
| Centroid 30–150 ms                         | 1155 Hz               | 986 Hz                |
| −10 / −20 dB                               | 17 / 97 ms            | 17 / 96 ms            |
| Mode frequency                             | 825 Hz                | 713 Hz                |
| Mode T60                                   | 121 ms                | 222 ms (40–1616)      |
| Crunch hits                                | 5                     | 6 (0–16)              |

The old sound had a single 80 Hz peak about 30 dB above everything else.

This was built by a subagent that timed out before finishing. The parent reviewed the code and confirmed it against the main branch: the impact measurements above, a strict typecheck and the build. Listening sheet: `~/Projects/dark-forest-moodboard/sounds/log-listening.html`. Awaiting operator review.

## Revision: woodblock tok

Operator review: the first rebuild sounded "incredibly bit crushed" and lacked a wood-knock quality. Soloing the layers ([`wood-knock.md`](./wood-knock.md)) showed two causes:

- The ×12 raw low-passed noise "knock" turned the wood layer into a 20–50 ms grit burst.
- The PhISEM crunch fired about 350–700 single-sample clicks per second and was mixed at a fixed −5 dB. Every layer was also normalised on its own.

Three offline variants (`moodboard/tools/log/knock-proto.ts`) all used band-limited strikes, noise only through resonators, and real-level mixing:

- **A:** beam-mode wood after STK ModalBar Wood1.
- **B:** A plus a diffuse resonator after Menzies.
- **D:** a woodblock tok.

The operator found A and B comical and chose **D**.

`contact()` now has these layers:

- **Strikes:** a main strike of 0.35–1 ms (×0.6, at least 0.3 ms), 2–4 micro-impacts within about 12 ms at −6 to −18 dB (FoleyAutomatic), and one or two settles.
- **Wood (the tok):** f0 = 650–1300 Hz·size^−0.3·pitch, Q 15–40, T60 = min(0.2 s, 2.2·Q/(π·f0)). Beside it:
  - a matched "cavity" mode at 0.95–1.05·f0, ×1.3 T60, 0.5 gain;
  - an upper mode at 2.3–3.3·f0, ½ T60, 0.25 gain;
  - the log it lands on, at 1.2–1.9·f0, 0.7 T60, 0.4 gain.
- **Bed:** a 6–15 ms raised cosine into 90–140 Hz and 150–210 Hz resonators, at −20 dB re the wood peak.
- **Crunch:** 4–12·√size soft heavy-tailed cracks (0.3–0.8 ms strikes into 900–3000 Hz modes, T60 8–25 ms), at −20 dB + 3·log₂(size).
- **Puff:** at −20 dB.

Contact gain is 0.95·√size, up from 0.68, to match the previous version's A-weighted level; a short tok carries less energy than a grit burst. Flare and catch are unchanged.

Measured over ten landings:

| Measure                                    | Value                                       |
| ------------------------------------------ | ------------------------------------------- |
| Bands <150 / 150–500 / 0.5–2k / 2–8k / >8k | 14 / 9 / 75 / 2 / 0 %                       |
| Centroid, 0–30 ms                          | 748 Hz                                      |
| Time to −10 / −20 dB                       | 9 / 16 ms (a short knock)                   |
| Flatness, 0–30 ms                          | 0.03 (tonal, like the clean-drop reference) |

Listening sheet: `moodboard/sounds/log-tok-listening.html`.
