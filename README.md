# 🦈 CHUMSTICK RHYTHM

> A **dual-analog-stick rhythm game** for the DualSense / DualShock — a play on *thumbstick*
> rhythm. It's a front-facing **stereo**: two speakers, each with a real analog **thumbstick in
> the centre**. Notes sweep in 360° around each speaker; **flick the matching stick toward them
> on the beat**. Land them and the song plays clean — **miss and the audio glitches**, Guitar-Hero
> style. Grooveshark-blue, with a shark cruising the sky. Pure **Web Audio + Canvas**, no plugins,
> runs in a browser tab.

<p align="center">
  <img src="docs/demo.gif" width="860" alt="Demo — notes sweep around each speaker, the thumbsticks flick to hit them, combo climbs, a shark swims the sky">
</p>

<p align="center"><sub>Auto-play demo: notes ride in around the speakers, the on-screen <b>thumbsticks flick to hit them</b>, combo climbs — and a shark cruises behind.</sub></p>

---

## What it is

Most rhythm games are about *buttons*. This one is about the **sticks**. Each speaker is a 360°
dial with a real thumbstick at its hub; a note lights a point on the rim and you **flick the stick
that way, on time**. Two hands, two sticks, eight-plus directions, holds, and modifier buttons.

The clever bit is the audio: the track just **plays through**. Nail your flicks and it stays clean
— **whiff one and the mix stutters, pitch-bends and buzzes** for a beat. The song is the reward and
the punishment.

> Why it's new: flick-stick aiming, directional rhythm (DDR), and two-handed directional hits
> (Beat Saber) all exist — but nobody's made a rhythm game whose **core input is flicking two
> analog sticks to the beat**. See [`DESIGN.md`](DESIGN.md) for the landscape + design notes.

---

## Play it

It needs a real `http://` origin (Gamepad API + ES modules), so serve the folder:

```bash
python -m http.server 8000      # …or:  npx serve .
```

Open **http://localhost:8000**, then:

1. **Click** once to enable sound.
2. Plug in / pair a **DualSense** and **press a button to wake it** — browsers hide a gamepad
   until you do. The splash is a live **controller tester**: move the sticks and watch them on the
   speakers; the L2/R2 bars fill as you pull the triggers.
3. **Pull L2 + R2 together to start.**

> Just want to watch? Hit **▶ watch demo** for an attract-mode auto-play (that's the GIF above).

**Controller required** — the game needs real analog sticks you can flick and *flow*; the keyboard
only confirms/cancels menus.

### Controls
| Input | Action |
| --- | --- |
| **Left stick** | Flick toward **left-speaker** notes — any angle into the note's **arc** (a forgiving range, not an exact spot) |
| **Right stick** | Flick toward **right-speaker** notes |
| **Hold notes** | Flick and *keep* the stick there for the note's length |
| **L1 / R1 / face buttons** | Held for **modifier** notes |
| **L2 + R2** | Start (on the splash) |
| **Options / ✕** confirm · **◯ / Esc** | back / pause |

---

## Bring your own music

From **browse songs → Load custom**:

- **Audio + beatmap** — drop a local audio file (`.mp3/.ogg/.wav`) and a matching `.json` chart.
- **Audio + auto-chart** — drop *just* an audio file; it runs onset/BPM detection to generate a
  starter chart you can play immediately and **download to hand-tune**.

Nothing's uploaded — it all stays in your browser.

### Beatmap format
Plain JSON (full spec in [`DESIGN.md`](DESIGN.md#5-beatmap-format)):

```jsonc
{
  "meta": {
    "title": "…", "artist": "…",
    "audio": "raise-your-weapon.mp3",   // file expected in assets/ (optional)
    "bpm": 175, "offset": 0.0,           // offset seconds added to every note time
    "approachTime": 2.4,                  // seconds a note is visible before its hit
    "difficulty": "Onset"
  },
  "notes": [
    { "time": 2.13, "ring": "L", "angle": 300 },
    { "time": 3.20, "ring": "R", "angle": 90, "mod": "L1" },
    { "time": 7.55, "ring": "L", "angle": 188, "hold": 0.46 }
  ]
}
```

- `ring` — `"L"` or `"R"`
- `angle` — degrees, **0 = right, 90 = down, 180 = left, 270 = up** (continuous; flick within a
  forgiving arc). *Legacy:* a named `dir` (`up/down/left/right/+diagonals`) still works.
- `mod` *(optional)* — `L1 · R1 · L2 · R2 · cross · circle · square · triangle`
- `hold` *(optional)* — seconds to keep the stick held

---

## Base song — "Raise Your Weapon (Camo & Krooked remix)"

The bundled chart is built around this track. **The audio isn't included** (copyright). Drop your
own file in as `assets/raise-your-weapon.mp3` and it plays. Until then there's a **synth groove**
(kick/hat/snare/bass) locked to the chart's BPM so the game is fully playable. The included chart
was generated from the real song's **onsets**, so notes land on the actual beats.

---

## How it's built

Vanilla **JavaScript + HTML5 Canvas + Web Audio API** — no framework, no build step, near-zero
deps. Timing is driven entirely off `AudioContext.currentTime` (never `setTimeout`) for
sample-accurate sync. Input is the **Gamepad API**, polled once per frame, with a hysteresis
flick detector + a stick deadzone. OBS-overlay friendly.

```
index.html · styles.css
src/        ES modules — audio (clock + groove + glitch), input (gamepad/flicks),
            chart, scoring (incl. holds), render (the stereo), beatgen (auto-charting), main
beatmaps/   committed chart JSON (no audio)
brand/      the chum logo
assets/     drop local audio here (gitignored)
```

## Credits
- Brand mark is the **chum / Grooveshark** logo used across [brendanwelsh](https://github.com/brendanwelsh)'s projects.
- Base track used with permission; **not distributed** here.
