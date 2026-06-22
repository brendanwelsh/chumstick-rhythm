// main.js — STEREO FLIX entry point. State machine + game loop wiring all modules together.

import { AudioEngine } from './audio.js';
import { GamepadInput } from './input.js';
import { Renderer } from './render.js';
import { Scorer } from './scoring.js';
import { normalizeChart, dirVector } from './chart.js';
import { generateBeatmap, chartToJSON } from './beatgen.js';

const LEAD_IN = 3.0; // seconds of "3..2..1" count-in before the music

// Built-in charts (audio is loaded from assets/ if present, else metronome).
const BUILTIN = [
  { title: 'Raise Your Weapon (Camo & Krooked remix)', sub: 'deadmau5 · DnB · 174', url: 'beatmaps/raise-your-weapon.json' },
];

class Game {
  constructor() {
    this.audio = new AudioEngine();
    this.input = new GamepadInput();
    this.renderer = new Renderer(document.getElementById('stage'));
    this.scorer = new Scorer();

    this.state = 'title';
    this.demo = false;        // attract/auto-play mode
    this.currentRaw = null;   // un-normalized chart, re-normalized on each (re)start
    this.chart = null;
    this.focusIndex = 0;
    this._generated = null;   // last auto-generated chart, for download
    this._demoDefl = { L: { v: { x: 0, y: 0 }, m: 0 }, R: { v: { x: 0, y: 0 }, m: 0 } };

    this._buildSongList();
    this._wireDom();
    this._unlockAudioOnGesture();
    this.showScreen('title');

    requestAnimationFrame((t) => this._loop(t));
  }

  // --- DOM / screens -------------------------------------------------------
  _el(id) { return document.getElementById(id); }

  showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
    if (id) this._el(id).classList.remove('hidden');
    this.focusIndex = 0;
    this._applyFocus();
  }

  _activeScreen() {
    return document.querySelector('.screen:not(.hidden)');
  }

  _focusables() {
    const scr = this._activeScreen();
    return scr ? [...scr.querySelectorAll('button:not([disabled]), .song-btn')] : [];
  }

  _applyFocus() {
    const items = this._focusables();
    items.forEach((el, i) => el.classList.toggle('focused', i === this.focusIndex));
  }

  _moveFocus(d) {
    const items = this._focusables();
    if (!items.length) return;
    this.focusIndex = (this.focusIndex + d + items.length) % items.length;
    this._applyFocus();
    items[this.focusIndex].scrollIntoView({ block: 'nearest' });
  }

  _activateFocus() {
    const items = this._focusables();
    if (items[this.focusIndex]) items[this.focusIndex].click();
  }

  _buildSongList() {
    const list = this._el('song-list');
    list.innerHTML = '';
    BUILTIN.forEach((song) => {
      const btn = document.createElement('button');
      btn.className = 'song-btn';
      btn.innerHTML = `<span class="song-title">${song.title}</span><span class="song-sub">${song.sub}</span>`;
      btn.addEventListener('click', () => this._startUrlChart(song.url));
      btn.addEventListener('mouseenter', () => { this.focusIndex = this._focusables().indexOf(btn); this._applyFocus(); });
      list.appendChild(btn);
    });
  }

  _wireDom() {
    this._el('btn-start').addEventListener('click', () => this.showScreen('songselect'));
    this._el('btn-demo').addEventListener('click', () => this._watchDemo());
    this._el('btn-custom').addEventListener('click', () => this.showScreen('custom'));
    this._el('btn-songs-back').addEventListener('click', () => this.showScreen('title'));
    this._el('btn-custom-back').addEventListener('click', () => this.showScreen('songselect'));

    this._el('btn-play-custom').addEventListener('click', () => this._playCustom(false));
    this._el('btn-autochart').addEventListener('click', () => this._playCustom(true));
    this._el('btn-download').addEventListener('click', () => this._downloadChart());

    this._el('btn-resume').addEventListener('click', () => this._resume());
    this._el('btn-restart').addEventListener('click', () => this._startChart());
    this._el('btn-quit').addEventListener('click', () => this._quitToSongs());

    this._el('btn-results-again').addEventListener('click', () => this._startChart());
    this._el('btn-results-back').addEventListener('click', () => this.showScreen('songselect'));
  }

  _unlockAudioOnGesture() {
    const unlock = () => { this.audio.resume(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  // --- chart loading / start ----------------------------------------------
  async _loadUrlRaw(url) {
    const raw = await (await fetch(url)).json();
    this.currentRaw = raw;
    this.audio.clearBuffer();
    if (raw.meta && raw.meta.audio) {
      const ok = await this.audio.tryLoadUrl('assets/' + raw.meta.audio);
      if (!ok) console.info(`No audio at assets/${raw.meta.audio} — using metronome.`);
    }
  }

  async _startUrlChart(url) {
    try {
      this.demo = false;
      await this._loadUrlRaw(url);
      this._startChart();
    } catch (e) {
      alert('Could not load chart: ' + e.message);
    }
  }

  /** Attract mode: load the base chart and let the game play itself. */
  async _watchDemo() {
    try {
      this.demo = true;
      await this._loadUrlRaw(BUILTIN[0].url);
      this._startChart();
    } catch (e) {
      this.demo = false;
      alert('Could not start demo: ' + e.message);
    }
  }

  _exitDemo() {
    this.demo = false;
    this.audio.stop();
    this.audio.ctx.resume();
    this.state = 'title';
    this.showScreen('title');
  }

  async _playCustom(autochart) {
    const audioFile = this._el('audio-input').files[0];
    const beatmapFile = this._el('beatmap-input').files[0];
    const status = this._el('custom-status');
    if (!audioFile) { status.textContent = 'Pick an audio file first.'; return; }

    this.demo = false;
    try {
      status.textContent = 'Decoding audio…';
      await this.audio.resume();
      const buffer = await this.audio.loadFile(audioFile);

      if (autochart || !beatmapFile) {
        status.textContent = 'Analysing (onsets + BPM)…';
        // Yield a frame so the status text paints before the heavy sync work.
        await new Promise((r) => requestAnimationFrame(r));
        const raw = generateBeatmap(buffer, { title: audioFile.name.replace(/\.[^.]+$/, ''), audioName: audioFile.name });
        this.currentRaw = raw;
        this._generated = raw;
        this._el('btn-download').classList.remove('hidden');
        status.textContent = `Generated ${raw.notes.length} notes @ ${raw.meta.bpm} BPM.`;
      } else {
        this.currentRaw = JSON.parse(await beatmapFile.text());
        this._generated = null;
        this._el('btn-download').classList.add('hidden');
      }
      this._startChart();
    } catch (e) {
      status.textContent = 'Error: ' + e.message;
    }
  }

  _downloadChart() {
    if (!this._generated) return;
    const blob = new Blob([chartToJSON(this._generated)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (this._generated.meta.title || 'chart').replace(/\s+/g, '-').toLowerCase() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  _startChart() {
    if (!this.currentRaw) return;
    this.chart = normalizeChart(this.currentRaw);
    this.scorer.reset();
    this.renderer.effects = [];
    this.renderer.flickFx = [];
    this.renderer.pulse = 0;
    this._ended = false;
    this.audio.stop();
    this.audio.resume();
    this.audio.start(this.chart.meta.bpm, LEAD_IN);
    this.state = 'playing';
    this.showScreen(null);
  }

  // --- pause / quit / finish ----------------------------------------------
  async _pause() {
    if (this.state !== 'playing') return;
    await this.audio.ctx.suspend();        // freezes ctx.currentTime => song clock frozen
    this.state = 'paused';
    this.showScreen('pause');
  }

  async _resume() {
    if (this.state !== 'paused') return;
    await this.audio.ctx.resume();
    this.state = 'playing';
    this.showScreen(null);
  }

  _quitToSongs() {
    this.audio.stop();
    this.audio.ctx.resume();
    this.state = 'songselect';
    this.showScreen('songselect');
  }

  _finish() {
    this.audio.stop();
    this.state = 'results';
    const s = this.scorer;
    this._el('res-grade').textContent = s.grade;
    this._el('res-grade').dataset.grade = s.grade;
    this._el('res-score').textContent = String(s.score).padStart(7, '0');
    this._el('res-combo').textContent = s.maxCombo + 'x';
    this._el('res-acc').textContent = (s.accuracy * 100).toFixed(2) + '%';
    this._el('res-counts').innerHTML =
      `<span class="c-perfect">${s.counts.perfect} PERFECT</span>` +
      `<span class="c-good">${s.counts.good} GOOD</span>` +
      `<span class="c-miss">${s.counts.miss} MISS</span>`;
    this.showScreen('results');
  }

  // --- demo / attract auto-play -------------------------------------------
  _demoAutoplay(songTime) {
    // decay the faux stick deflection each frame
    this._demoDefl.L.m *= 0.80;
    this._demoDefl.R.m *= 0.80;
    // fire a perfect flick for each note exactly as its time arrives
    for (const n of this.chart.notes) {
      if (!n.judged && n.time <= songTime && n.time > songTime - 0.13) {
        this.input.flicks.push({ ring: n.ring, dir: n.dir, mods: n.mod ? [n.mod] : [], mag: 1, t: n.time });
        this._demoDefl[n.ring] = { v: dirVector(n.dir), m: 0.95 };
      }
    }
    // drive the live stick dots so the sticks visibly "flick" out and snap back
    const dot = (d) => ({ x: d.v.x * d.m, y: d.v.y * d.m, mag: d.m });
    this.input.left = dot(this._demoDefl.L);
    this.input.right = dot(this._demoDefl.R);
  }

  // --- input intents -------------------------------------------------------
  _handleIntents() {
    for (const it of this.input.takeMenu()) {
      if (this.state === 'playing') {
        if (this.demo) {
          if (it === 'pause' || it === 'back' || it === 'confirm') this._exitDemo();
        } else if (it === 'pause' || it === 'back') {
          this._pause();
        }
        continue;
      }
      if (this.state === 'paused') {
        if (it === 'pause' || it === 'back') { this._resume(); continue; }
      }
      // menu navigation
      if (it === 'up' || it === 'left') this._moveFocus(-1);
      else if (it === 'down' || it === 'right') this._moveFocus(1);
      else if (it === 'confirm') this._activateFocus();
      else if (it === 'back') {
        const scr = this._activeScreen();
        const back = scr && scr.querySelector('[data-back]');
        if (back) back.click();
      }
    }
  }

  // --- main loop -----------------------------------------------------------
  _loop() {
    const songTime = this.state === 'playing' ? this.audio.time : 0;
    window.__songTime = songTime; // for keyboard flick stamping
    this.input.update(songTime);
    this._handleIntents();

    if (this.state === 'title') {
      this._el('title-status').textContent = this.input.connected
        ? '🎮 Controller connected'
        : '⌨️  No controller — keyboard fallback active';
    }

    if (this.state === 'playing' || this.state === 'paused') {
      if (this.state === 'playing') {
        if (this.demo) this._demoAutoplay(songTime);
        // resolve flicks (every flick gets a visual streak, hit or not)
        for (const f of this.input.takeFlicks()) {
          this.renderer.addFlick(f);
          this.scorer.judgeFlick(f, this.chart.notes, songTime);
        }
        this.scorer.checkMisses(this.chart.notes, songTime);
        for (const ev of this.scorer.takeEvents()) {
          this.renderer.addEffect(ev);
          this.audio.hitSound(ev.judgement);
        }
        if (songTime > this.chart.duration) {
          if (this.demo) this._startChart();                 // loop the attract demo
          else if (!this._ended) { this._ended = true; this._finish(); }
        }
      }
      this.renderer.drawGame({ chart: this.chart, songTime, scorer: this.scorer, input: this.input, demo: this.demo });
    } else {
      this.input.takeFlicks(); // drain so flicks don't queue up in menus
    }

    requestAnimationFrame(() => this._loop());
  }
}

window.addEventListener('DOMContentLoaded', () => { window.game = new Game(); });
