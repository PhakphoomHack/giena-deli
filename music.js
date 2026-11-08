// Happy Birthday to You (melody is public domain) as a soft music-box loop, synthesized with Web Audio.
const NOTE = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99 };
const MEL = [['G4', .75], ['G4', .25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2],
  ['G4', .75], ['G4', .25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2],
  ['G4', .75], ['G4', .25], ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 2],
  ['F5', .75], ['F5', .25], ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 3]];
// one chord per 3/4 bar after the one-beat pickup: [root, third, fifth] in Hz (low register)
const CH = { C: [130.81, 164.81, 196.0], G: [98.0, 123.47, 146.83], F: [87.31, 110.0, 130.81] };
const BARS = [['C'], ['G'], ['G'], ['C'], ['C'], ['F'], ['C', 'G'], ['C']];
const BEAT = 0.56;
const LOOP_BEATS = 25 + 3;
const VOICES = [{ oct: 1, bright: 1 }, { oct: 2, bright: 1.4 }, { oct: 1, bright: .7 }, { oct: .5, bright: .5 }];

export class Music {
  constructor() { this.ctx = null; this.on = false; this.n = 0; }
  start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.on) {
      this.on = true;
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0.22, this.ctx.currentTime, 0.4);
      if (!this.timer) { this.next = this.ctx.currentTime + 0.3; this.loop(); }
    }
    return true;
  }
  stop() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  loop() {
    const t0 = Math.max(this.next, this.ctx.currentTime + 0.1);
    this.song(t0, VOICES[this.n % VOICES.length]);
    this.n++;
    this.next = t0 + LOOP_BEATS * BEAT;
    this.timer = setTimeout(() => this.loop(), Math.max(200, (this.next - this.ctx.currentTime - 1.2) * 1000));
  }
  bell(f, t, dur, vol, bright) {
    const c = this.ctx; const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    [[1, 1], [2, 0.22 * bright], [4.07, 0.07 * bright]].forEach(([m, a]) => {
      const o = c.createOscillator(); const og = c.createGain();
      o.type = 'sine'; o.frequency.value = f * m; og.gain.value = a;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  pad(f, t, dur, vol) {
    const c = this.ctx; const o = c.createOscillator(); const g = c.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  song(t0, v) {
    let t = t0;
    MEL.forEach(([n, b]) => { this.bell(NOTE[n] * v.oct, t, Math.max(0.9, b * BEAT * 1.6), 0.16, v.bright); t += b * BEAT; });
    BARS.forEach((chs, i) => {
      const bar = t0 + (1 + i * 3) * BEAT;
      chs.forEach((ch, k) => {
        const at = bar + k * 2 * BEAT; const [r, th, fi] = CH[ch];
        this.pad(r, at, 1.6, 0.07);
        this.bell(th * 2, at + BEAT * (k ? 0.5 : 1), 0.9, 0.035, 0.4);
        this.bell(fi * 2, at + BEAT * (k ? 0.75 : 2), 0.9, 0.035, 0.4);
      });
    });
  }
  sparkle() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + 0.02;
    [1568, 2093, 2637, 3136].forEach((f, i) => this.bell(f, t + i * 0.07, 0.8, 0.06, 0.5));
  }
}
