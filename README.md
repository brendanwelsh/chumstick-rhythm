# 📻 STEREO FLIX

A **dual-analog-stick rhythm game** for the DualSense / DualShock 5, themed as a **boombox**:
the two rings are the **left and right speakers** (cyan L, magenta R). **Flick** the matching
stick in the required direction, in time with the music. Think *Beat Saber × osu! × DDR*, but
the instrument is the **sticks themselves**.

> Why it's new: flick-stick aiming, directional rhythm (DDR), and two-handed directional hits
> (Beat Saber) all exist — but **nobody has made a rhythm game whose core input is flicking two
> analog sticks to the beat.** See [`DESIGN.md`](DESIGN.md).

Runs in any modern browser via the Gamepad API + Web Audio API. No install, no build step,
OBS-overlay friendly.

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

Then open **http://localhost:8000** and plug in / pair a DualSense.

1. Press **Options/Start** (or **Enter**) on the title screen.
2. Pick a song.
3. Flick to the beat.

**Just want to see it move?** Hit **▶ Watch demo** on the title screen — the game auto-plays
the base track (perfect flicks, full feedback) as an attract loop. Back/Esc exits.

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
| **Left stick** | Flick to hit **left-ring** notes (up/down/left/right + diagonals) |
| **Right stick** | Flick to hit **right-ring** notes |
| **L1 / R1 / L2 / R2 / face buttons** | Held/pressed for **modifier** notes |
| **Options / Start / Enter** | Confirm / advance menus |
| **Esc / Circle** | Back / pause |

**No controller?** A keyboard fallback is built in for testing:
`W A S D` = left-ring up/left/down/right · Arrow keys = right-ring ·
`Q` = L1, `E` = R1, `Shift` = L2, `Space` = R2 (held while you press a direction).
The real feel needs sticks — keyboard is just for dev.

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
index.html          # shell + menus
styles.css
src/                # ES modules — see CLAUDE.md for the map
beatmaps/           # committed chart JSON (no audio)
assets/             # drop local audio here (gitignored)
DESIGN.md           # concept, landscape, mechanics
CLAUDE.md           # working guidance for this repo
```

## Status
Playable prototype: title/song-select/results flow, two-ring playfield, gamepad flick detection
with modifiers, audio-clock-synced chart player, hit detection + scoring/combo, and custom-track
loading with auto-charting. Built to be extended (flick strength, rotation/hold notes, haptics).
