# SledMaster

A 3D launch-and-upgrade sledding game for the browser, built with Three.js. There is no build step.

## Run

ES modules need a local server; opening `index.html` directly from disk won't work. Use the bundled dev server, which turns off caching so your edits show up on reload:

```bash
python3 tools/serve.py
```

Then open http://localhost:5173.

## Install on a phone (PWA)

SledMaster is a Progressive Web App: `manifest.json` makes it installable with its own icon and fullscreen launch, and `sw.js` caches the game so it plays offline.

Service workers only run on `https://` or `localhost`. On your local network (`http://<your-mac-ip>:5173`) the game still plays, and iOS can still "Add to Home Screen", but it won't work offline and Android won't offer a real install. For the full PWA, serve it over HTTPS (any static host works; there is no build step).

If you add a file under `src/`, add it to `SHELL` in `sw.js` and bump `CACHE` so phones pick it up. Icons are drawn by `tools/make_icons.py` (needs Pillow).

## Layout

| File | What it does |
| --- | --- |
| `src/main.js` | Renderer, game states (menu → aim → run → results / shop), camera, slingshot, coins |
| `src/terrain.js` | Endless procedural height field, ice patches, chunked meshes, trees, coin patterns |
| `src/physics.js` | Sled physics: gravity, friction, drag, steering grip, wing lift, rocket |
| `src/sled.js` | Penguin, sled, wing shapes and rocket |
| `src/upgrades.js` | Upgrade and wing definitions, costs, `computeStats()` |
| `src/ui.js` | HUD, results and workshop overlays |
| `src/scenery.js` | Sky gradient, clouds, distant mountains, snow spray |
| `src/effects.js` | Coin pickup animation and sparkles, snowman debris |
| `src/audio.js` | Synthesized sound effects (Web Audio), mute setting |
| `src/save.js` | `localStorage` save/load |

## Tuning knobs

- Course shape: `profile()` in `src/terrain.js` (hill size, how fast hills grow, downhill trend).
- Feel: `GRAVITY`, `ICE_MU`, `LIFT_K` in `src/physics.js`.
- Economy: upgrade `base`/`growth` and wing `cost` in `src/upgrades.js`; distance bonus in `endRun()`.
- Ramps: `rampsFor()` in `src/terrain.js`.
- Booster pads: placement in `padsFor()` in `src/terrain.js`; strength `PAD_KICK`, `PAD_SURGE`, `PAD_ACCEL` in `src/physics.js`.
- Snowmen: placement in `snowmenFor()` in `src/terrain.js`; `SHATTER_SPEED` (smash vs stop) and `SHATTER_KEEP` (speed kept) in `src/physics.js`.
- Trees and igloos: placement in `obstaclesFor()` in `src/terrain.js`; `SCRAPE_LOSS` (speed scrubbed on a head-on hit) in `src/physics.js`.

`tools/balance.js` simulates full-power runs across seeds and upgrade levels with a simple driver bot. To use it, open the game and run this in the browser console:

```js
const { runBalance } = await import('/tools/balance.js'); await runBalance()
```

To swap in real models later, replace the geometry built in `src/sled.js`. The physics only uses the sled's position and facing direction.

## Credits

- “Igloo” by Poly by Google, [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/), via Poly Pizza (`models/igloo.glb`, unmodified).
