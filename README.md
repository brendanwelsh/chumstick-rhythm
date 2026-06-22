# 🦈 CHUMSTICK RHYTHM

A **dual-analog-stick rhythm game** for the DualSense / DualShock 5 — a play on *thumbstick*
rhythm. It's a front-facing **stereo**: two speakers (blue L / blue R) each with a realistic
**thumbstick in the centre**. Notes approach 360° around each speaker; **flick the matching
stick toward them on the beat**. Hit notes and the song plays clean — **miss and the audio
glitches** (Guitar-Hero style). Grooveshark-blue, with a shark swimming in the sky.

> Why it's new: flick-stick aiming, directional rhythm (DDR), and two-handed directional hits
> (Beat Saber) all exist — but **nobody has made a rhythm game whose core input is flicking two
> analog sticks to the beat.** See [`DESIGN.md`](DESIGN.md).

**Controller required** (real analog sticks — no keyboard play). 2D canvas + Web Audio, runs in
any modern browser via the Gamepad API. No install, no build step, OBS-overlay friendly.

---

## Run it

The Gamepad API and ES modules require a real `http://` origin (not `file://`), so serve the
folder:

```bash
# Python (already on most machines)
python -m http.server 8000

# …or Node
npx serve .
```

Then open **http://localhost:8000**:

1. **Click** once to enable sound.
2. Plug in / pair a DualSense and **press a button to wake it** (browsers hide a gamepad until
   you do). The splash is a live **controller tester** — move the sticks and watch them on the
   speakers; the L2/R2 bars fill as you pull the triggers.
3. **Pull L2 + R2 together to start.**

**Just want to see it move?** Hit **▶ watch demo** — the game auto-plays the base track as an
attract loop.

**Play it from another device** (couch, phone, second PC): serve it bound to all interfaces and
open it over your LAN or Tailscale:

```bash
python -m http.server 8000 --bind 0.0.0.0
```
- Same network: `http://<this-PC's-LAN-IP>:8000`
- Over Tailscale: bring it up first (`tailscale up`), then `http://<machine-name>:8000`.

(You may need to allow Python through Windows Firewall the first time for off-box access.)

### Controls
| Input | Action |
|---|---|
| **Left stick** | Flick toward **left-speaker** notes (any of 8 directions) |
| **Right stick** | Flick toward **right-speaker** notes |
| **L1 / R1 / face buttons** | Held for **modifier** notes |
| **L2 + R2** | Start (on the splash) |
| **Options / ✕** | Confirm menus · **◯ / Esc** back/pause |

The keyboard only confirms/cancels menus — there's no keyboard *play* (the game needs real
analog sticks you can flick and flow).

---

## Custom music

From the song-select screen, choose **Load custom**:

1. **Audio + beatmap** — pick a local audio file (`.mp3/.ogg/.wav`) and a matching beatmap
   `.json`.
2. **Audio + auto-chart** — pick just an audio file and the game runs onset/BPM detection to
   generate a starter beatmap you can play immediately and **download to hand-tune**.

Nothing is uploaded; everything stays in your browser.

### Beatmap format
Plain JSON (full spec in [`DESIGN.md`](DESIGN.md#5-beatmap-format)):

```jsonc
{
  "meta": {
    "title": "Raise Your Weapon (Camo & Krooked remix)",
    "artist": "deadmau5 / Camo & Krooked",
    "audio": "raise-your-weapon.mp3",   // expected in assets/ (optional)
    "bpm": 174,
    "offset": 0.0,                       // seconds added to every note time
    "approachTime": 1.5,                 // seconds a note is visible before its hit
    "difficulty": "Normal"
  },
  "notes": [
    { "time": 2.07, "ring": "L", "dir": "up" },
    { "time": 2.41, "ring": "R", "dir": "right", "mod": "L1" }
  ]
}
```

- `ring`: `"L"` or `"R"`
- `dir`: `up · down · left · right · upleft · upright · downleft · downright`
- `mod` (optional): `L1 · R1 · L2 · R2 · cross · circle · square · triangle`

---

## Base song — "Raise Your Weapon (Camo & Krooked remix)"

The first chart is built around this track. **The audio is not included** (copyright). Brendan
has permission to use the bootleg; drop the file in as:

```
assets/raise-your-weapon.mp3
```

Until then the song is fully playable with a **metronome** at the chart's BPM (174) driving the
same audio clock — so you can test the feel right now. Once the real file is in place, the
included beatmap can be auto-regenerated and hand-tuned against it. See
[`assets/README.md`](assets/README.md).

---

## Project layout
```
index.html          # shell + menus + HUD + import map
styles.css
src/                # ES modules — see CLAUDE.md for the map (render3d.js = Three.js stage)
vendor/             # vendored Three.js (MIT) + GLTFLoader + BufferGeometryUtils
models/             # boombox.glb — CC0 3D model (see Credits)
beatmaps/           # committed chart JSON (no audio)
assets/             # drop local audio here (gitignored)
DESIGN.md           # concept, landscape, mechanics
CLAUDE.md           # working guidance for this repo
```

## Status
Playable prototype: a 2D **stereo** stage (two speakers with centred thumbsticks on a blue
shark sky), a splash that doubles as a **controller tester** (L2+R2 to start), gamepad flick
detection with a deadzone + hold notes across 8 directions, an onset-aligned chart of the base
song, Guitar-Hero **glitch-on-miss** audio, scoring/combo, demo/attract mode, and custom-track
loading with auto-charting. (An earlier 3D/Three.js renderer lives in `src/render3d.js` +
`vendor/` + `models/` but is no longer wired in.)

## Credits
- **Three.js** — 3D engine, MIT License. <https://threejs.org>
- **"Boom Box" model** — by Microsoft, **CC0 1.0** (public domain), from the
  [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets).
- Music is **not** included; see the base-song note above.
