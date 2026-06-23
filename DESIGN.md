# DESIGN.md — CHUMSTICK RHYTHM

> A rhythm game you play by **flowing the two analog sticks** of a DualSense / DualShock
> controller in time with the music. Left stick drives the **left mouth**, right stick the
> **right**. Each stick is an **absolute cursor inside a disc**, so scoring is *continuous and
> presence-based*: **be on** a note as it crosses, **trace** the lines that sweep around the rim,
> and **spin** to fill a gauge. Modifier buttons add variation.
>
> **Theme: underwater Jaws.** A deep-ocean gradient (bright surface → deep dark) with sunlight
> god-rays, bubbles, a rising open-jaws **shark**, a cruising **fin** and floating **barrels**. The
> two rings are **shark mouths** (gullet, red gums, a ring of inward teeth) with a per-side glow
> (**cyan L, orange R**, kept distinct so you can tell the sides). The aim cursor is the shark's
> **tongue** licking out from each throat and leaving a glowing **trail**; the notes are **fish**
> swimming in to be eaten. Title set in the **Jaws font**, blood-red.
>
> *(History: this started as a discrete "flick to the beat" game; later a stereo/boombox/3D theme.
> All were dropped — flicks played clunky, so the input model became continuous flow (see §3), and
> the stereo theme gave way to the Jaws look.)*

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

1. **The stick is the instrument, played by flow.** Not a cursor, not a camera, and *not* a
   discrete flick — the stick's **absolute position over time** is the note hit. Where you point,
   how you trace, and how you spin all carry meaning; you're rewarded for *being on it*, not for
   snapping. This is what makes it feel fluid instead of clunky.
2. **Two-hand polyrhythm of lines.** Left and right mouths can demand different headings, traces
   and spins on different subdivisions, so you're drawing a two-limb pattern of moving lines —
   closer to conducting/drawing than to tapping.
3. **Native controller, zero install.** Runs in any browser via the Gamepad API; the DualSense
   "just works" over USB/Bluetooth. OBS-overlay friendly for streaming.
4. **Analog nuance is available** for later: flick *strength*, return-flicks, rotations
   (flick-stick-style), and stick *holds* — a richer input space than buttons.

---

## 3. Core mechanics — the flow model

### Mouths & sticks
- **Left mouth** ← left stick (`axes[0]` = X, `axes[1]` = Y).
- **Right mouth** ← right stick (`axes[2..]`, with DualSense's non-standard layout handled).
- A note's target is a **continuous angle** on the rim (0=right, 90=down, …), not one of 8 slots.
  You point *within a forgiving arc* of it — flow over precision.

### Presence, not a press
There is **no discrete flick event** driving gameplay. Every frame, for each live note, we ask:
*is the stick where this note wants it?* (deflected past a small magnitude, and its heading within
the note's arc). Credit **accrues from being on it**, and the note resolves itself when its window
passes. The whole judge is `Scorer.update(notes, input, songTime, dt)` — frame-driven, off the
audio clock. (A leftover hysteresis flick detector survives only to throw a tiny visual spark.)

### The four note types
- **tap** — *be in the arc as the note crosses.* Graded by how centred your on-target moment was
  (Perfect ±50 ms, else Good); never on it in-window → Miss. No timed press.
- **hold** — *park the stick in the arc* for `hold` seconds. Graded by **coverage** (fraction of
  the span you were on target).
- **slide** — a target **sweeps along the rim** from `angle` to `to` over `hold`; you **trace the
  line**. Graded by coverage of the moving target. The staple note — this is the "draw a line" feel.
- **spin** — *rotate the stick* for the span; accumulated rotation fills a gauge to `spin` turns.
  Graded by rotations completed.

Holds/slides/spins also drip score while satisfied, and light up (plus the stick trail) so motion
reads continuously.

### Modifiers
A note may carry a `mod` requiring a button **held** while you're on it:
- `L1` / `R1` (shoulder), `L2` / `R2` (trigger), or face buttons `cross/circle/square/triangle`.
- Modifier notes are visually distinct (glyph on the rim). On-target without the modifier ≠ credit.

### Scoring (osu/DDR-flavoured)
- **Perfect / Good / Miss** per note (windows + coverage thresholds tunable in `scoring.js`).
- **Combo** builds on Perfect/Good, resets on Miss; multiplier escalates with combo.
- **Score** = per-note base × combo multiplier (+ sustain drip + hold bonus).
- **Accuracy %** and a letter **grade** (S/A/B/C/D) on the results screen.
- **A miss glitches the music** (stutter + pitch wobble + buzz) — the song is the feedback.

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
    { "time": 2.07, "ring": "L", "angle": 270 },                       // tap
    { "time": 2.41, "ring": "R", "angle": 0, "mod": "L1" },            // tap + modifier
    { "time": 3.10, "ring": "L", "angle": 90, "hold": 0.5 },           // hold
    { "time": 4.00, "ring": "R", "angle": 0, "to": 200, "hold": 1.0 }, // slide (traced line)
    { "time": 6.00, "ring": "L", "angle": 0, "spin": 2, "hold": 1.3 }  // spinner
  ]
}
```

`angle` = degrees (continuous; legacy named `dir` ∈ `up,down,left,…` still parses).
`hold` = sustain seconds · `to` = slide end heading · `spin` = spinner rotations.
`mod` (optional) ∈ `L1,R1,L2,R2,cross,circle,square,triangle`.

### Auto-charting
`beatgen.js` can build a chart from a loaded audio file:
- **Onset detection** (short-time energy + adaptive-threshold peak picking) places notes on
  musical hits.
- **BPM estimate** via autocorrelation of the onset envelope (shown to the player; used for the
  grid fallback).
- Notes are choreographed into **flow**: runs of tight onsets → slides, long gaps → spinners,
  medium gaps → holds, the rest presence taps; hands alternate; angle drifts so nothing is static.
- Output is the same JSON, ready to hand-tune. `scripts/flowify.mjs` did the same transform on the
  base chart (sparse onsets → a continuous slide-path) without moving any onset time.

---

## 6. Done since the prototype / still future

**Landed:** continuous **flow** input (presence/coverage, no discrete flick), **hold / slide /
spin** note types, a stick **trail**, miss-glitches-the-music audio, onset auto-charting that
emits flow, a synth groove when no audio file is present, **DualSense rumble haptics** (crisp on a
hit, heavy buzz on a miss, soft hum while you ride a sustain, double-pulse on a combo milestone;
intensity in Settings), **difficulty tiers** (Easy thins taps + widens arcs/windows · Normal is the
authored chart · Hard tightens both; leaderboards are kept per song *and* tier), and a
re-choreographed base chart with deliberate phrase texture (taps/slides/holds/spins + accent mods).

**Still future:**
- Adaptive triggers (the browser Gamepad API doesn't expose DualSense trigger effects yet).
- Online leaderboards, replay export, a chart-editor UI, song library management.
- Calibration (audio/video offset), per-stick sensitivity settings.
- Lane-based "stream" sections and boss-style intensity ramps.
