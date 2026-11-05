# Dark Forest: roadmap

Ideas and open work for `/lab/dark_forest`, roughly in priority order. Research notes live in `docs/research/`.

## Now

- **Visitor UI (not the editor).** Clear sound controls on the page, and story text in Mekzantine (a pixel font by Michael Alexander, MEK.txt), self-hosted.

## Smoothness

- **Storm stutter.** Every 0.035 rise in `w.poolLevel` during rain (about every 3.5 s at full rain) calls `renderer.buildStatic()`, which rebuilds the whole static layer: sky, all foliage, static shadow maps and reflections. That is a 74–109 ms main-thread stall (4–6 dropped frames); profiled in Chrome, it has nothing to do with sound. Fix: update only the pool's region (the ground and reflections inside its bounding box) when the level changes, and/or spread the work over frames. The nav mesh rebuild on `poolLevel` steps of 0.03 (`sim/index.ts`) has the same shape; check its cost too.
- **Headroom.** Steady frames take about 5 ms on a fast desktop (18 cores, a 1× display). Measure with Chrome's CPU throttling (4×), on a high-DPI laptop and on a phone.
- **Sound's one-off costs.** About 4–8 ms on the main thread per log landing and per close thunder crack, from rendering their buffers. They are fine for now; they could move to idle time or an AudioWorklet if they ever show up.
- **GPU uploads.** Static planar buffers are re-uploaded every frame; upload them only when they change.

## Sound

- The full mix is judged good (an 8-minute night render with per-source levels is in `moodboard/sounds/night/`, tool `tools/night_render.ts`).
- **Parked:** leaf drops and pool drips (off by default). They sounded like pops and animal squeaks; they could get the research-and-measure treatment that fixed the crow, log and thunder.
- **A hummed melody for songs by the fire** (the song, dancing and floating notes exist; the sound doesn't yet).
- **Creature sounds:** the shroomfolk, knight, deer, bats and moths are silent. Candidates: soft footsteps on leaves and moss, the knight's armour, shroomfolk murmurs or humming when merry, wingbeats as bats pass.

## Life that reads

- The sim has depth (emergent fire tending, keeper, memorials, moods, rain shelter). A visitor watching for a minute should catch a small story: readable poses and timing, small moments of focus, sounds for creatures.
- **Graded rain reactions:** creatures react to how hard it rains, not just to a 0.3 threshold.

## Visual finish

- Art redesigns for the knight, frog and crow.
- Brighter, thinner small scenery where needed.
- The editor inspector shows a stale final colour on the GPU path.

## Time

- It is always the same night. A slow arc would make returning feel different: the moon moving, the fire's cycle, rare events, maybe dawn.

## Shipping

- The work is on `experiment/dark-forest-sim`, unmerged and unpushed. Merge and deploy when ready; check loading time and browser coverage (WebGL2, falling back to the CPU path).
- Site fonts: `--font-mono` names ServerMono but nothing loads it, so visitors without it installed get a fallback monospace. Self-host it like Mekzantine if it matters.
