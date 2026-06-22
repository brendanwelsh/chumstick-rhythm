# DESIGN.md — STEREO FLIX

> A rhythm game you play by **flicking the two analog sticks** of a DualSense / DualShock
> controller in time with the music. Left stick drives the **left ring**, right stick drives
> the **right ring**. Notes approach each ring; you flick the matching stick in the required
> direction on the beat. Modifier buttons add variation.
>
> **Theme: a boombox.** The two rings are the boombox's **left and right speakers** (cyan L,
> magenta R). The HUD sits in the center like a **cassette deck** — combo, score, accuracy, and
> two reels that spin faster as your combo climbs; VU meters flank the speakers and bounce on
> hits. Retro neon over a dark stage.

---

## 1. Landscape — what already exists

Quick survey of adjacent games/tech, and what each one contributes to the idea.

| Thing | What it is | What's worth borrowing |
|---|---|---|
| **osu! / osu!mania** | Click/tap circles to a precise timing window. | Approach-circle visual language; Perfect/Good/Miss windows; accuracy %, combo, grade. Note: osu! is famously *painful* on thumbsticks — that's the gap we exploit by making the **stick itself** the instrument. |
| **DDR / StepMania** | Step on directional arrows scrolling to a target. | The **directional** vocabulary (up/down/left/right + diagonals) maps 1:1 onto stick flick directions. Lane-of-arrows readability. |
| **Beat Saber** | Slash blocks in an arrow direction with two hands. | **Two independent hands**, each with its own colour; *direction matters*, not just timing; the satisfying "follow-through" of a directional gesture. |
| **Thumper** | "Rhythm violence" — one lane, hold/turn on beats, brutal flow. | Aesthetic intensity; tight single-input flow; juice/feedback on every hit. |
| **Sayonara Wild Hearts** | Score-attack rhythm-action set to a pop album. | Whole-album choreography; style over twitch; gorgeous feedback. |
| **Spin Rhythm XD** | A **single rotary wheel** (one analog stick / DJ dial / mouse) you spin to colour-match falling notes; tap `X` for bars, jog for spinners, and **flick/wiggle the stick** for "scratch" notes. | *The closest existing relative* — it proves analog-stick rhythm feels great and that **stick flicks** read as note hits. But it's **one** rotational input doing **colour-matching**; flicking is a special-case note, not the core. Our game is **two independent sticks** where **8-directional flicking is the entire instrument** — no wheel, no colour-match. |
| **Flick Stick** (Jibb Smart, 2018 — JoyShockMapper / Steam Input) | Push the stick toward a heading and the camera *snaps* there; rotate to turn. Used in CS, Fortnite, Deathloop. | Proves players can **flick a stick to a precise direction fast and accurately** — exactly the motor skill this game is built on. But it's a *shooter aiming* tool, not a rhythm mechanic. |
| **Twin-stick shooters / Katamari** | Both sticks used simultaneously for movement/aim. | Evidence that simultaneous two-stick coordination is a learnable, fun skill. |

### The gap
There is **no shipping rhythm game whose core input is flicking two analog sticks to the
beat.** The pieces exist — directional rhythm (DDR), two-handed directional hits (Beat Saber),
fast precise stick flicks (Flick Stick) — but the *combination* is unclaimed. This is the
novel space.

---

## 2. What's genuinely novel here

1. **The stick is the instrument.** Not a cursor, not a camera — a flick *is* the note hit.
   Analog magnitude + direction + timing all carry meaning.
2. **Two-hand directional polyrhythm.** Left and right rings can demand different directions
   on different subdivisions, so you're playing a two-limb directional pattern — closer to
   drumming than to tapping.
3. **Native controller, zero install.** Runs in any browser via the Gamepad API; the DualSense
   "just works" over USB/Bluetooth. OBS-overlay friendly for streaming.
4. **Analog nuance is available** for later: flick *strength*, return-flicks, rotations
   (flick-stick-style), and stick *holds* — a richer input space than buttons.

---

## 3. Core mechanics (prototype scope)

### Rings & sticks
- **Left ring** ← left stick (`axes[0]` = X, `axes[1]` = Y).
- **Right ring** ← right stick (`axes[2]` = X, `axes[3]` = Y).
- Each ring has 8 directional slots: `up, down, left, right` + 4 diagonals.

### A flick
A flick is a **gesture**, detected with a hysteresis state machine per stick:
1. Stick rests inside the **deadzone** → *armed*.
2. Stick magnitude crosses the **flick threshold** (≈0.55) → fire a flick event; the
   **direction is the angle at the crossing**, snapped to the nearest of 8.
3. Stick must fall back below the **release threshold** (≈0.35) before it can fire again.

This yields exactly one clean flick per physical motion and ignores slow drift.

### Notes
A note approaches its ring as a **chevron travelling inward along its flick direction**, with an
osu!-style **approach ring** shrinking onto the target. It arrives at the ring edge exactly at
its hit time. You flick that stick in that direction at that moment.

### Modifiers
A note may carry a `mod` requiring a button to be **held** (or pressed) during the flick:
- `L1` / `R1` (shoulder), `L2` / `R2` (trigger), or face buttons `cross/circle/square/triangle`.
- Modifier notes are visually distinct (outline + glyph). Hitting without the modifier = miss.

### Judgement & scoring (osu/DDR-style)
- **Perfect** ±45 ms, **Good** ±90 ms, else **Miss**. (Tunable in `scoring.js`.)
- Wrong direction or wrong modifier inside the window = **Miss** (consumes the note).
- **Combo** builds on Perfect/Good, resets on Miss.
- **Score** = per-note base × accuracy weight × combo multiplier.
- **Accuracy %** and a letter **grade** (S/A/B/C/D) on the results screen.

---

## 4. Tech decisions

- **Vanilla JS + HTML5 Canvas + Web Audio API.** No framework, no build step. Keeps deps near
  zero and stays OBS/overlay friendly. (PixiJS was an option but Canvas is plenty for two rings
  and a handful of moving notes.)
- **Timing is driven by `AudioContext.currentTime`, never `setTimeout`.** Song time =
  `ctx.currentTime − startedAt`. The render loop reads this clock every frame; nothing musical
  is scheduled on wall-clock timers. This is the non-negotiable rule for rhythm-game sync.
- **Input via the Gamepad API**, polled once per animation frame. Keyboard fallback exists for
  development without a controller.
- **No audio shipped.** Custom tracks are loaded locally by the player. If a chart's audio file
  is missing, a Web Audio **metronome** at the chart BPM drives the same clock so the game is
  still playable.

---

## 5. Beatmap format

JSON. See `beatmaps/raise-your-weapon.json` and the README for the full spec.

```jsonc
{
  "meta": {
    "title": "...", "artist": "...",
    "audio": "raise-your-weapon.mp3",   // file expected in assets/ (optional)
    "bpm": 174, "offset": 0.0,          // offset seconds added to every note time
    "approachTime": 1.5,                 // seconds a note is visible before its hit
    "difficulty": "Normal"
  },
  "notes": [
    { "time": 2.07, "ring": "L", "dir": "up" },
    { "time": 2.41, "ring": "R", "dir": "right", "mod": "L1" }
  ]
}
```

`dir` ∈ `up,down,left,right,upleft,upright,downleft,downright`.
`mod` (optional) ∈ `L1,R1,L2,R2,cross,circle,square,triangle`.

### Auto-charting
`beatgen.js` can build a chart from a loaded audio file:
- **Onset detection** (short-time energy + adaptive-threshold peak picking) places notes on
  musical hits.
- **BPM estimate** via autocorrelation of the onset envelope (shown to the player; used for the
  grid fallback).
- Rings/directions assigned by a deterministic choreographed pattern; sparse modifier notes.
- Output is the same JSON, ready to hand-tune.

---

## 6. Out of scope for the prototype (future)

- Flick *strength* / partial-hit scoring, return-flicks, stick **rotations** (flick-stick-style
  spin notes), and **hold** notes.
- Haptics / adaptive triggers (DualSense exposes these only partially to the browser).
- Online leaderboards, replay export, chart editor UI, song library management.
- Lane-based "stream" sections and boss-style intensity ramps.
