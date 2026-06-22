// audio.js — AudioEngine: owns the musical clock and all sound.
//
// THE timing rule: song time = ctx.currentTime - startedAt. Everything musical reads `.time`.
// No setTimeout / setInterval / Date.now() anywhere near gameplay timing.

export class AudioEngine {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.buffer = null;          // decoded AudioBuffer (null => metronome mode)
    this.source = null;          // active AudioBufferSourceNode
    this.startedAt = null;       // ctx time corresponding to song time 0
    this.bpm = 120;
    this.running = false;

    // Master + SFX gain so hit sounds don't clip the music.
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.35;
    this.sfxGain.connect(this.master);

    // Metronome scheduler state (only used when there's no audio buffer).
    this._metroNextBeat = 0;     // next beat index to schedule
    this._metroTimer = null;
  }

  /** Browsers start the AudioContext suspended until a user gesture. Call on first input. */
  async resume() {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  get hasAudio() { return !!this.buffer; }

  /** Current song time in seconds. Negative during the count-in lead. */
  get time() {
    if (this.startedAt == null) return 0;
    return this.ctx.currentTime - this.startedAt;
  }

  async decodeArrayBuffer(arrayBuffer) {
    return await this.ctx.decodeAudioData(arrayBuffer);
  }

  async loadFile(file) {
    this.buffer = await this.decodeArrayBuffer(await file.arrayBuffer());
    return this.buffer;
  }

  /** Try to load assets/<name>; returns false (not throws) if it's not there. */
  async tryLoadUrl(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) { this.buffer = null; return false; }
      this.buffer = await this.decodeArrayBuffer(await res.arrayBuffer());
      return true;
    } catch {
      this.buffer = null;
      return false;
    }
  }

  setBuffer(buffer) { this.buffer = buffer; }
  clearBuffer() { this.buffer = null; }

  /**
   * Start playback after `leadIn` seconds of count-in. Song time begins at -leadIn and the
   * audio/metronome fires exactly when song time hits 0.
   */
  start(bpm, leadIn = 2.5) {
    this.bpm = bpm || 120;
    const t0 = this.ctx.currentTime + leadIn;
    this.startedAt = t0;
    this.running = true;

    if (this.buffer) {
      this.source = this.ctx.createBufferSource();
      this.source.buffer = this.buffer;
      this.source.connect(this.master);
      this.source.start(t0);
    } else {
      // Metronome mode: a count-in tick set + ongoing beat clicks.
      this._metroNextBeat = Math.ceil(this.time * this.bpm / 60);
      this._scheduleMetronome();
    }
  }

  stop() {
    this.running = false;
    if (this.source) {
      try { this.source.stop(); } catch { /* already stopped */ }
      this.source.disconnect();
      this.source = null;
    }
    if (this._metroTimer) { clearTimeout(this._metroTimer); this._metroTimer = null; }
    this.startedAt = null;
  }

  // --- Metronome (clock-accurate via Web Audio scheduling, only the lookahead uses a timer) ---
  _scheduleMetronome() {
    if (!this.running || this.buffer) return;
    const secPerBeat = 60 / this.bpm;
    const lookahead = 0.2; // schedule up to 200 ms ahead
    while (this._metroNextBeat * secPerBeat < this.time + lookahead) {
      const beatTime = this.startedAt + this._metroNextBeat * secPerBeat;
      if (beatTime >= this.ctx.currentTime) {
        const downbeat = this._metroNextBeat % 4 === 0;
        this._click(beatTime, downbeat ? 1500 : 1000, downbeat ? 0.25 : 0.14);
      }
      this._metroNextBeat++;
    }
    // The 25 ms poll only refills the lookahead buffer; the actual ticks are sample-accurate.
    this._metroTimer = setTimeout(() => this._scheduleMetronome(), 25);
  }

  _click(when, freq, gain) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(g); g.connect(this.master);
    osc.start(when); osc.stop(when + 0.06);
  }

  /** Short feedback blip on a hit. Pitch encodes the judgement. */
  hitSound(judgement) {
    const now = this.ctx.currentTime;
    const freq = judgement === 'perfect' ? 1320 : judgement === 'good' ? 880 : 220;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = judgement === 'miss' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    if (judgement !== 'miss') osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.05);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.5, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.14);
  }
}
