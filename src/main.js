// main.js — CHUMSTICK RHYTHM entry point. State machine + game loop wiring all modules together.

import { AudioEngine } from './audio.js';
import { GamepadInput, BUTTON_LABELS } from './input.js';
import { Renderer } from './render.js';
import { Scorer } from './scoring.js';
import { normalizeChart, angleVec, noteTargetAngle } from './chart.js';
import { generateBeatmap, chartToJSON } from './beatgen.js';

const LEAD_IN = 3.0; // seconds of "3..2..1" count-in before the music

const SETTINGS_KEY = 'chumstick.settings';
const SETTINGS_DEFAULTS = { music: 0.9, sfx: 0.5, offsetMs: 0, noteSpeed: 1.8 };

// Built-in charts (audio is loaded from assets/ if present, else metronome).
const BUILTIN = [
  { title: 'Raise Your Weapon (Camo & Krooked remix)', sub: 'deadmau5 · DnB · 174', url: 'beatmaps/raise-your-weapon.json' },
];

class Game {
  constructor() {
    this.audio = new AudioEngine();
    this.input = new GamepadInput();
    this.scorer = new Scorer();
    this.renderer = new Renderer(document.getElementById('stage'));

    this.state = 'title';
    this.demo = false;        // attract/auto-play mode
    this.currentRaw = null;   // un-normalized chart, re-normalized on each (re)start
    this.chart = null;
    this.focusIndex = 0;
    this._generated = null;   // last auto-generated chart, for download
    this._demoDefl = { L: { v: { x: 0, y: 0 }, m: 0 }, R: { v: { x: 0, y: 0 }, m: 0 } };

    this.settings = this._loadSettings();
    this._applySettings();

    this._buildSongList();
    this._wireDom();
    this._wireSettings();
    this._unlockAudioOnGesture();
    this.showScreen('title');

    requestAnimationFrame((t) => this._loop(t));
  }

  // --- DOM / screens -------------------------------------------------------
  _el(id) { return document.getElementById(id); }

  showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
    if (id) this._el(id).classList.remove('hidden');
    // HUD shows only during live gameplay (id === null).
    this._el('hud').classList.toggle('hidden', id !== null);
    // floating pause control only during live, non-demo play
    this._el('btn-pause-float').classList.toggle('hidden', id !== null || this.demo);
    this.focusIndex = 0;
    this._applyFocus();
  }

  _activeScreen() {
    return document.querySelector('.screen:not(.hidden)');
  }

  _focusables() {
    const scr = this._activeScreen();
    return scr ? [...scr.querySelectorAll('button:not([disabled]), .song-btn, input[type=range]')] : [];
  }

  _applyFocus() {
    const items = this._focusables();
    items.forEach((el, i) => {
      // for a slider, glow its row instead of the bare input
      const target = (el.tagName === 'INPUT' && el.type === 'range') ? (el.closest('.set-row') || el) : el;
      target.classList.toggle('focused', i === this.focusIndex);
    });
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
    this._el('btn-settings').addEventListener('click', () => { this._syncSettingsUI(); this.showScreen('settings'); });
    this._el('btn-custom').addEventListener('click', () => this.showScreen('custom'));
    this._el('btn-songs-back').addEventListener('click', () => this.showScreen('title'));
    this._el('btn-custom-back').addEventListener('click', () => this.showScreen('songselect'));
    this._el('btn-settings-back').addEventListener('click', () => this.showScreen('title'));
    this._el('btn-settings-reset').addEventListener('click', () => this._resetSettings());
    this._el('btn-pause-float').addEventListener('click', () => this._pause());

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
    const unlock = () => {
      this.audio.resume();
      const boot = this._el('boot');
      if (boot) boot.classList.add('gone'); // reveal the title once audio is unlocked
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  // --- settings (persisted to localStorage) --------------------------------
  _loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return { ...SETTINGS_DEFAULTS, ...s };
    } catch { return { ...SETTINGS_DEFAULTS }; }
  }

  _saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* private mode */ }
  }

  /** Push the current settings into the live engine (volumes apply immediately). */
  _applySettings() {
    this.audio.setMusicVolume(this.settings.music);
    this.audio.setSfxVolume(this.settings.sfx);
  }

  /** Reflect the current settings onto the slider widgets + value labels. */
  _syncSettingsUI() {
    const s = this.settings;
    this._el('set-music').value = Math.round(s.music * 100);
    this._el('set-sfx').value = Math.round(s.sfx * 100);
    this._el('set-offset').value = s.offsetMs;
    this._el('set-speed').value = Math.round(s.noteSpeed * 100);
    this._el('set-music-val').textContent = Math.round(s.music * 100) + '%';
    this._el('set-sfx-val').textContent = Math.round(s.sfx * 100) + '%';
    this._el('set-offset-val').textContent = s.offsetMs + ' ms';
    this._el('set-speed-val').textContent = s.noteSpeed.toFixed(1) + ' s';
  }

  _wireSettings() {
    const onInput = (id, fn) => this._el(id).addEventListener('input', (e) => {
      fn(Number(e.target.value));
      this._applySettings();
      this._saveSettings();
      this._syncSettingsUI();
    });
    onInput('set-music', (v) => { this.settings.music = v / 100; });
    onInput('set-sfx', (v) => { this.settings.sfx = v / 100; });
    onInput('set-offset', (v) => { this.settings.offsetMs = v; });
    onInput('set-speed', (v) => { this.settings.noteSpeed = v / 100; });
  }

  _resetSettings() {
    this.settings = { ...SETTINGS_DEFAULTS };
    this._applySettings();
    this._saveSettings();
    this._syncSettingsUI();
  }

  /** Adjust the focused slider by one step in `dir` (±1) — for D-pad / arrow control. */
  _adjustFocusedRange(dir) {
    const items = this._focusables();
    const el = items[this.focusIndex];
    if (!el || el.tagName !== 'INPUT' || el.type !== 'range') return false;
    const step = Number(el.step) || 1;
    el.value = Math.max(Number(el.min), Math.min(Number(el.max), Number(el.value) + dir * step));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
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
    this._applyChartSettings(this.chart);
    this.scorer.reset();
    this.renderer.effects = [];
    this.renderer.flickFx = [];
    this.renderer.pulse = 0;
    this.renderer.trail = { L: [], R: [] };
    this._ended = false;
    this._lastSongTime = null;
    this._demoDefl = { L: { v: { x: 0, y: 0 }, m: 0 }, R: { v: { x: 0, y: 0 }, m: 0 } };
    this.audio.stop();
    this.audio.resume();
    this.audio.start(this.chart.meta.bpm, LEAD_IN);
    this._el('audio-src').textContent = this.audio.hasAudio
      ? '♪ ' + this.chart.meta.title
      : '♪ synth groove — drop assets/' + (this.chart.meta.audio || 'your-track.mp3') + ' for the real track';
    this.state = 'playing';
    this.showScreen(null);
  }

  /** Apply player settings that affect a chart at start: audio offset + note approach speed. */
  _applyChartSettings(chart) {
    const off = (this.settings.offsetMs || 0) / 1000;   // +ms => notes later (you were hitting early)
    if (off) { for (const n of chart.notes) n.time += off; chart.duration += off; }
    chart.meta.approachTime = this.settings.noteSpeed;
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
  // Drives each faux stick toward the live target so the demo SHOWS the flow: it eases toward an
  // approaching note, parks in the arc for taps/holds, traces the moving line of a slide, and
  // whirls around for a spinner. Same presence-based scoring then "plays" it perfectly.
  _demoAutoplay(songTime) {
    for (const ring of ['L', 'R']) {
      const tgt = this._demoStick(ring, songTime);
      const d = this._demoDefl[ring];
      if (tgt) { d.v = { x: tgt.x, y: tgt.y }; d.m = tgt.mag; }
      else { d.m *= 0.82; }
      const side = ring === 'L' ? 'left' : 'right';
      this.input[side] = { x: d.v.x * d.m, y: d.v.y * d.m, mag: d.m };
    }
  }

  /** Where the demo should aim a stick right now: {x,y,mag} unit-ish vector, or null to relax. */
  _demoStick(ring, songTime) {
    let best = null, bestDist = Infinity;
    for (const n of this.chart.notes) {
      if (n.ring !== ring || n.judged) continue;
      const t0 = n.time, t1 = n.time + n.hold;
      const dist = songTime < t0 ? t0 - songTime : songTime > t1 ? songTime - t1 : 0;
      if (dist < bestDist) { bestDist = dist; best = n; }
    }
    if (!best || bestDist > 0.7) return null;
    let a;
    if (best.type === 'spin') a = songTime * 14;                 // whirl to fill the gauge
    else a = noteTargetAngle(best, songTime);                    // park / trace the (moving) target
    const v = angleVec(a);
    // full deflection inside the window, easing in as the note approaches
    const mag = bestDist <= 0.16 ? 0.94 : Math.max(0.3, 0.94 - (bestDist - 0.16) * 1.1);
    return { x: v.x, y: v.y, mag };
  }

  _updateHud(songTime) {
    const s = this.scorer;
    this._el('hud-score').textContent = String(s.score).padStart(7, '0');
    this._el('hud-combo').textContent = s.combo > 0 ? s.combo + 'x' : '';
    this._el('hud-acc').textContent = (s.accuracy * 100).toFixed(1) + '%';
    this._el('countin').textContent = songTime < 0 ? String(Math.ceil(-songTime)) : '';
    this._el('demo-badge').classList.toggle('hidden', !this.demo);
  }

  _showError(e) {
    console.error('CHUMSTICK RHYTHM render error:', e);
    const el = this._el('error');
    if (el) { el.textContent = 'Render error: ' + (e && e.message ? e.message : e) + ' — check the console.'; el.classList.remove('hidden'); }
  }

  _flashJudge(judgement) {
    const el = this._el('judge');
    el.textContent = judgement.toUpperCase();
    el.dataset.j = judgement;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); // restart anim
  }

  // --- input intents -------------------------------------------------------
  _handleIntents() {
    for (const it of this.input.takeMenu()) {
      if (this.state === 'playing') {
        if (this.demo) {
          if (it === 'pause' || it === 'back' || it === 'confirm' || it === 'start') this._exitDemo();
        } else if (it === 'pause' || it === 'back' || it === 'start') {
          this._pause();   // Options / ◯ / Esc all pause
        }
        continue;
      }
      if (this.state === 'paused') {
        // Options / ◯ / Esc resume; ↑↓ + ✕ still navigate the pause menu (Resume/Restart/Quit)
        if (it === 'pause' || it === 'back' || it === 'start') { this._resume(); continue; }
      }
      // menu navigation (←/→ adjust a focused slider; otherwise they move focus)
      if (it === 'up') this._moveFocus(-1);
      else if (it === 'down') this._moveFocus(1);
      else if (it === 'left') { if (!this._adjustFocusedRange(-1)) this._moveFocus(-1); }
      else if (it === 'right') { if (!this._adjustFocusedRange(1)) this._moveFocus(1); }
      else if (it === 'confirm' || it === 'start') this._activateFocus();
      else if (it === 'back') {
        const scr = this._activeScreen();
        const back = scr && scr.querySelector('[data-back]');
        if (back) back.click();
      }
    }
  }

  // --- main loop -----------------------------------------------------------
  _controllerStatus() {
    if (this.input.connected) {
      const id = this.input.padId ? this.input.padId.replace(/\(.*\)/, '').trim().slice(0, 30) : 'Controller';
      return '🎮 ' + (id || 'Controller') + ' connected';
    }
    return '🎮 connect a controller, then PRESS A BUTTON to wake it';
  }

  _buildTester() {
    if (this._testerBuilt) return;
    const axes = this._el('axes-bars');
    this._axisDots = [];
    for (let i = 0; i < 6; i++) {
      const bar = document.createElement('div'); bar.className = 'axis';
      const dot = document.createElement('i'); bar.appendChild(dot);
      const lbl = document.createElement('span'); lbl.textContent = i; bar.appendChild(lbl);
      axes.appendChild(bar); this._axisDots.push(dot);
    }
    const pips = this._el('btn-pips');
    this._pips = [];
    for (const label of BUTTON_LABELS) {
      const p = document.createElement('span'); p.className = 'pip'; p.textContent = label;
      pips.appendChild(p); this._pips.push(p);
    }
    this._testerBuilt = true;
  }

  // The splash IS a live controller tester: axis bars move, button pips light, triggers fill.
  _updateSplash() {
    this._buildTester();
    const inp = this.input;
    this._el('title-status').textContent = this._controllerStatus();
    const t = inp.triggers();
    this._el('trig-l2').style.width = Math.round(Math.min(1, t.L2) * 100) + '%';
    this._el('trig-r2').style.width = Math.round(Math.min(1, t.R2) * 100) + '%';
    const both = inp.bothTriggers();
    this._el('start-prompt').classList.toggle('armed', both);

    const ax = inp.allAxes();
    this._axisDots.forEach((dot, i) => {
      const v = ax[i];
      dot.parentElement.style.opacity = v == null ? 0.25 : 1;
      dot.style.left = (((v == null ? 0 : v) + 1) / 2 * 100) + '%';
    });
    const bs = inp.buttonStates();
    this._pips.forEach((p, i) => p.classList.toggle('on', !!(bs[i] && bs[i].pressed)));

    if (both && !this._l2r2was) { this._l2r2was = true; this._startUrlChart(BUILTIN[0].url); }
    if (!both) this._l2r2was = false;
  }

  _loop() {
    const live = this.state === 'playing' || this.state === 'paused';
    const songTime = live ? this.audio.time : 0;
    window.__songTime = songTime; // for keyboard flick stamping
    this.input.update(songTime);
    this._handleIntents();

    if (this.state === 'title') this._updateSplash();

    if (this.state === 'playing') {
      if (this.demo) this._demoAutoplay(songTime);
      // Frame-driven, presence-based scoring: notes resolve themselves as their window passes.
      const dt = Math.max(0, Math.min(0.05, songTime - (this._lastSongTime ?? songTime)));
      this._lastSongTime = songTime;
      this.scorer.update(this.chart.notes, this.input, songTime, dt);
      for (const f of this.input.takeFlicks()) this.renderer.addFlick(f); // little flick spark only
      for (const ev of this.scorer.takeEvents()) {
        this.renderer.addEffect(ev);
        if (ev.judgement === 'miss') this.audio.glitch();   // Guitar-Hero: miss glitches the mix
        this._flashJudge(ev.judgement);
      }
      this._updateHud(songTime);
      if (songTime > this.chart.duration) {
        if (this.demo) this._startChart();                  // loop the attract demo
        else if (!this._ended) { this._ended = true; this._finish(); }
      }
    } else {
      this.input.takeFlicks(); // drain so flicks don't queue up in menus
    }

    // Render the stage EVERY frame so the boombox + thumbsticks are visible and moving even in
    // the menus (notes only draw while a song is live).
    try {
      this.renderer.drawGame({ chart: live ? this.chart : null, songTime, scorer: this.scorer, input: this.input, playing: this.state === 'playing', demo: this.demo });
    } catch (e) {
      if (!this._renderDead) { this._renderDead = true; this._showError(e); }
    }

    requestAnimationFrame(() => this._loop());
  }
}

window.addEventListener('DOMContentLoaded', () => { window.game = new Game(); });
