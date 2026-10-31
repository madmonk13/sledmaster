# Just Sled

A 3D launch-and-upgrade sledding game for the browser, built with Three.js. There is no build step.

## Run

ES modules need a local server; opening `index.html` directly from disk won't work. Use the bundled dev server, which turns off caching so your edits show up on reload:

```bash
python3 tools/serve.py
```

Then open http://localhost:5173.

## Install on a phone (PWA)

Just Sled is a Progressive Web App: `manifest.json` makes it installable with its own icon and fullscreen launch, and `sw.js` caches the game so it plays offline.

Service workers only run on `https://` or `localhost`. On your local network (`http://<your-mac-ip>:5173`) the game still plays, and iOS can still "Add to Home Screen", but it won't work offline and Android won't offer a real install. For the full PWA, serve it over HTTPS (any static host works; there is no build step).

If you add a file under `src/`, add it to `SHELL` in `sw.js` and bump `CACHE` so phones pick it up. Icons are drawn by `tools/make_icons.py` (needs Pillow).

## Controls

- **Launch:** drag back on the screen, aim, release (or ↑/↓ for power, ←/→ to aim, Space).
- **Steer:** ←/→ or A/D, or drag left/right. The Settings screen has a slider for how sensitive touch steering is.
- **Rocket:** hold Space or Shift, or touch the screen with a second finger.
- **Tricks:** switched off for now; set `TRICKS_ENABLED` in `src/tricks.js` to `true` to bring them back. When on: in the air, tap ↑ for a front flip, ↓ for a back flip, ← or → to spin; or flick the screen. Holding ←/→ steers instead. A trick is a full turn and takes about half a second, so finish it before you land or you wipe out and the run ends. Chain tricks in one jump for 1x, 2x, 3x… The points are paid out as coins.

## Layout

| File | What it does |
| --- | --- |
| `src/main.js` | Renderer, game states (menu → aim → run → results / shop), camera, slingshot, coins |
| `src/terrain.js` | Endless procedural height field, ice patches, chunked meshes, trees, coin patterns |
| `src/physics.js` | Sled physics: gravity, friction, drag, steering grip, wing lift, rocket, wipeouts |
| `src/tricks.js` | In-air tricks: durations, points (paid as coins), combo multiplier |
| `src/input.js` | Keyboard and touch: dragging steers, a second finger fires the rocket, quick flicks in the air are tricks |
| `src/sled.js` | Penguin, sled, wing shapes and rocket |
| `src/upgrades.js` | Upgrade and wing definitions, costs, `computeStats()` |
| `src/ui.js` | HUD, results and workshop overlays |
| `src/scenery.js` | Sky gradient, clouds, distant mountains, snow spray |
| `src/effects.js` | Coin pickup animation and sparkles, hazard hit effects (snowman debris, tumbling penguins) |
| `src/environment.js` | Day/night cycle (sky, fog, light and cloud colours, stars, moon) and falling snow |
| `src/audio.js` | Synthesized sound effects (Web Audio), mute setting |
| `src/save.js` | `localStorage` save/load |

## Tuning knobs

- Course shape: `profile()` in `src/terrain.js` (hill size, how fast hills grow, downhill trend).
- Tricks: `TRICKS` (durations and base points), `TAP_MS`, `BUFFER` and `FORGIVE` in `src/tricks.js`.
- Touch steering: `STEER_PX` in `src/input.js` (drag for full lock at 100%); the default and range of the slider are in `src/save.js`.
- Feel: `GRAVITY`, `ICE_MU`, `LIFT_K` in `src/physics.js`.
- Economy: upgrade `base`/`growth` and wing `cost` in `src/upgrades.js`; distance bonus in `endRun()`.
- Ramps: `rampsFor()` in `src/terrain.js`.
- Booster pads: placement in `padsFor()` in `src/terrain.js`; strength `PAD_KICK`, `PAD_SURGE`, `PAD_ACCEL` in `src/physics.js`.
- Snowmen: placement in `snowmenFor()` in `src/terrain.js`; `SHATTER_SPEED` (smash vs stop) and `SHATTER_KEEP` (speed kept) in `src/physics.js`.
- Day/night and weather: `DAY_LENGTH` (seconds per full cycle), the colour keyframes in `KEYS`, the sun and moon path (`ARC_*`) and light angles (`LIGHT_ELEV_*`), flake counts and size, and shower timing in `updateWeather()`, all in `src/environment.js`.
- Gas cans: `CAN_CHANCE` (per 100 m) in `src/terrain.js`; `CAN_REFILL` (share of a tank) in `src/main.js`.
- Terrain width: `OUTER_HALF` and `OUTER_SEG` in `src/terrain.js` (how far the far hills reach, and how many columns they use).
- Birds: flocks in `birdsFor()` in `src/terrain.js`; `STALL_TIME` and `STALL_DEPTH` (lift lost after a strike) in `src/physics.js`; speed loss shares `KNOCK_SPEED`/`KNOCK_KEEP` with penguins.
- Penguins: placement in `penguinsFor()` in `src/terrain.js`; `KNOCK_SPEED` (bowl over vs stop) and `KNOCK_KEEP` (speed kept) in `src/physics.js`.
- Trees, igloos and polar bears: placement in `obstaclesFor()` in `src/terrain.js`; `SCRAPE_LOSS` (speed scrubbed on a head-on hit) in `src/physics.js`.

`tools/balance.js` simulates full-power runs across seeds and upgrade levels with a simple driver bot. To use it, open the game and run this in the browser console:

```js
const { runBalance } = await import('/tools/balance.js'); await runBalance()
```

To swap in real models later, replace the geometry built in `src/sled.js`. The physics only uses the sled's position and facing direction.
