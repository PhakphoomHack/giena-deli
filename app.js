import { h, render, Component } from './vendor/preact.js';
import htm from './vendor/htm.js';
import { rpc, store } from './config.js';
import { DICT } from './i18n.js';
import * as M from './match.js';

const html = htm.bind(h);
const INK = '#1B2238';
const GOLD = '#8A6A2F';
const LINE = 'rgba(27,34,56,.16)';
const ORDER_KEY = 'giena-order';
const BEST_KEY = 'giena-match-best';
const MOVES = 25;
const WISH_KEY = 'giena-wish';
const PREF_KEY = 'giena-prefs';

const FILLS = [
  { id: 'brisket', img: 'img/brisket.webp', w: 132 },
  { id: 'avocado', img: 'img/avocado.webp', w: 128 },
  { id: 'onion', img: 'img/onion.webp', w: 128 },
  { id: 'cheese', img: 'img/cheese.webp', w: 92, note: true }
];
const SAUCES = [
  { id: 'mustard', img: 'img/mustard_bowl.webp' },
  { id: 'garlic', img: 'img/garlic_bowl.webp' },
  { id: 'thousand', img: 'img/thousand_bowl.webp' }
];
const ROT = [[0], [-4, 5], [-6, 3, 8]];
const TILE_COL = { brisket: ['#F28BA8', '#F7C4D1'], avocado: ['#7CCB86', '#BFE5C2'], onion: ['#F6A86B', '#F9C9A6'], cheese: ['#F2BE3A', '#FFE08A'], pickle: ['#A98BE0', '#D3C8F2'], toast: ['#8DB6E0', '#C7DAEE'], gold: ['#E9B92C', '#F6D46A'] };
const STATUS_IDX = { new: 0, making: 1, ready: 2, collected: 2 };

const check = (size, sw) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${sw} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>`;
const STAR_PATH = 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z';
const CROWN = html`<svg width="34" height="20" viewBox="0 0 34 20" fill="none" stroke="#8A6A2F" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><path d="M4 17L6 5l6 6 5-9 5 9 6-6 2 12z"></path><path d="M4 19h26"></path></svg>`;

class App extends Component {
  constructor() {
    super();
    const prefs = store(PREF_KEY) || {};
    const wk = store(WISH_KEY);
    this.state = this.fresh({ lang: prefs.lang || this.guessLang(), big: !!prefs.big, sound: prefs.sound !== false, wishSent: !!(wk && Date.now() - wk.at < 12 * 3600 * 1000), name: (wk && wk.name) || '' });
    this.timers = [];
    this.dragging = false;
    this.dragX = 0;
    this.best = Number(store(BEST_KEY)) || 0;
    this.width = Math.min(window.innerWidth, 480);
    const saved = store(ORDER_KEY);
    if (saved && saved.id && Date.now() - saved.at < 8 * 3600 * 1000) {
      Object.assign(this.state, saved.snap, { screen: 'wait', orderId: saved.id, status: saved.status || 0, readySeen: saved.status === 2 });
      this.resumed = true;
    }
  }
  guessLang() {
    const l = (navigator.language || 'en').slice(0, 2);
    return l === 'th' || l === 'de' ? l : 'en';
  }
  fresh(k) {
    return {
      screen: 'home', toasted: true, toast: 1, fill: {}, portion: {}, sauces: {}, saucy: 1, pickle: false,
      name: '', note: '', status: 0, drag: 0, dragging: false, wish: '', wishSent: !!k.wishSent, wishBusy: false,
      stars: 0, tags: {}, comment: '', rateBusy: false, game: null, gameFrom: 'home', readySeen: false,
      confettiN: k.confettiN || 0, orderId: null, sending: false, error: '', scoreName: k.name || '', scoreSent: false, scoreBusy: false,
      notice: false, music: !!k.music, lang: k.lang || 'en', big: !!k.big, sound: k.sound === undefined ? true : k.sound
    };
  }
  componentDidMount() {
    this.onResize = () => { this.width = Math.min(window.innerWidth, 480); this.forceUpdate(); };
    window.addEventListener('resize', this.onResize);
    this.onVis = () => { if (document.hidden) this.stopMusic(true); else if (this.state.music) this.startMusic(); };
    document.addEventListener('visibilitychange', this.onVis);
    if (this.resumed) this.startPolling();
    this.syncChrome();
  }
  componentDidUpdate(prevProps, prevState) {
    this.syncChrome();
    if (prevState.lang !== this.state.lang || prevState.big !== this.state.big || prevState.sound !== this.state.sound) {
      store(PREF_KEY, { lang: this.state.lang, big: this.state.big, sound: this.state.sound });
    }
    if (prevState.screen !== this.state.screen) window.scrollTo(0, 0);
    if (prevState.screen === 'game' && this.state.screen !== 'game') this.clearHint();
  }
  componentWillUnmount() { this.clearTimers(); clearInterval(this.poll); this.clearHint(); }
  syncChrome() {
    const dark = this.state.screen === 'wait';
    document.body.classList.toggle('dark', dark);
    document.documentElement.lang = this.state.lang;
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', dark ? '#121828' : '#F6F1E7');
  }
  clearTimers() { this.timers.forEach((t) => clearTimeout(t)); this.timers = []; }

  // ---------- sound ----------
  audio() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  tone(f1, f2, dur, type, vol, delay, out, attack) {
    const c = this.ctx; const t = c.currentTime + (delay || 0);
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t);
    if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.015));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, vol, freq, q, delay) {
    const c = this.ctx; const t = c.currentTime + (delay || 0);
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(bp); bp.connect(g); g.connect(this.master); src.start(t);
  }
  play(name, pitch) {
    if (!this.state.sound) return;
    if (!this.audio()) return;
    const p = pitch || 520;
    if (name === 'tap') this.tone(660, 560, 0.06, 'sine', 0.04);
    if (name === 'tick') this.tone(1180, 1180, 0.035, 'triangle', 0.025);
    if (name === 'pop') this.tone(p, p * 1.5, 0.12, 'sine', 0.06);
    if (name === 'unpop') this.tone(560, 380, 0.09, 'sine', 0.04);
    if (name === 'crunch') { this.noise(0.07, 0.08, 2600, .9); this.noise(0.06, 0.05, 2300, .9, 0.06); this.noise(0.05, 0.035, 2900, .9, 0.11); }
    if (name === 'plip') { this.tone(880, 1240, 0.08, 'sine', 0.04); this.tone(1240, 1400, 0.06, 'sine', 0.025, 0.06); }
    if (name === 'chime') [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, f, 0.6, 'sine', 0.045, i * 0.11));
    if (name === 'ready') [783.99, 987.77, 1174.66].forEach((f, i) => this.tone(f, f, 0.9, 'sine', 0.05, i * 0.14));
    if (name === 'sparkle') { this.tone(1318.5, 1318.5, 0.18, 'triangle', 0.03, 0.05); this.tone(1760, 1760, 0.25, 'triangle', 0.025, 0.12); }
    if (name === 'miss') this.tone(320, 150, 0.3, 'sine', 0.05);
    if (name === 'over') [523.25, 440, 349.23].forEach((f, i) => this.tone(f, f, 0.45, 'sine', 0.045, i * 0.18));
    if (name === 'swish') this.noise(0.11, 0.05, 3400, 1.3);
    if (name === 'match') { const sc = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5]; const f = sc[Math.min((pitch || 1) - 1, sc.length - 1)]; this.tone(f, f * 1.5, 0.14, 'sine', 0.07); this.tone(f * 2, f * 2.2, 0.1, 'triangle', 0.022, 0.05); this.noise(0.05, 0.03, 1800, 1.5); }
    if (name === 'whoosh') { this.noise(0.34, 0.08, 1300, 0.5); this.tone(320, 1400, 0.32, 'triangle', 0.028); }
    if (name === 'yum') [659.25, 880, 1046.5].forEach((f, i) => this.tone(f, f, 0.28, 'triangle', 0.035, 0.12 + i * 0.09));
    if (name === 'hb') [[392, 0, .22], [392, .3, .12], [440, .45, .4], [392, .9, .4], [523.25, 1.35, .4], [493.88, 1.8, .8]].forEach(([f, t, d]) => this.tone(f, f, d + .15, 'triangle', 0.045, t));
  }
  buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  // ---------- background music (gentle, generated) ----------
  startMusic() {
    if (!this.audio() || this.musicTimer) return;
    const c = this.ctx;
    this.musicGain = c.createGain(); this.musicGain.gain.value = 0.0001; this.musicGain.connect(this.master);
    this.musicGain.gain.exponentialRampToValueAtTime(0.9, c.currentTime + 1.5);
    const CH = [[261.63, 329.63, 392, 493.88], [220, 261.63, 329.63, 392], [174.61, 220, 261.63, 329.63], [196, 246.94, 293.66, 349.23]];
    let step = 0;
    const tick = () => {
      const chord = CH[Math.floor(step / 8) % 4];
      if (step % 8 === 0) chord.forEach((f) => this.tone(f, f, 4.4, 'sine', 0.014, 0, this.musicGain, 0.9));
      if (step % 2 === 0) { const f = chord[Math.floor(Math.random() * 4)] * 2; this.tone(f, f, 0.9, 'triangle', 0.016, 0, this.musicGain, 0.02); }
      step++;
    };
    tick();
    this.musicTimer = setInterval(tick, 520);
  }
  stopMusic(keepFlag) {
    clearInterval(this.musicTimer); this.musicTimer = null;
    if (this.musicGain && this.ctx) { try { this.musicGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.6); } catch (e) {} }
    if (!keepFlag) this.setState({ music: false });
  }
  toggleMusic() {
    if (this.state.music) { this.stopMusic(); return; }
    this.setState({ music: true }); this.startMusic();
  }

  // ---------- order ----------
  englishSummary() {
    const s = this.state; const E = DICT.en;
    const chosen = FILLS.filter((f) => s.fill[f.id]);
    const sauces = SAUCES.filter((x) => s.sauces[x.id]);
    return {
      bread: 'Sourdough, ' + (s.toasted ? E.toastPh[s.toast] : E.notToastedPh),
      fillings: chosen.length ? chosen.map((f) => E.fills[f.id] + (f.note ? '' : ' (' + E.portion[s.portion[f.id] ?? 1].toLowerCase() + ')')).join(', ') : E.noFill,
      sauces: sauces.length ? sauces.map((x) => E.sauces[x.id]).join(', ') + ' (' + E.saucy[s.saucy].toLowerCase() + ')' : E.noSauce,
      side: s.pickle ? 'Pickle' : 'None'
    };
  }
  snapshot() {
    const s = this.state;
    return { toasted: s.toasted, toast: s.toast, fill: s.fill, portion: s.portion, sauces: s.sauces, saucy: s.saucy, pickle: s.pickle, name: s.name, lang: s.lang, scoreName: s.name };
  }
  async sendOrder() {
    const s = this.state;
    if (s.sending) return;
    this.play('tap');
    this.setState({ sending: true, error: '' });
    try {
      const sum = this.englishSummary();
      const id = await rpc('place_order', {
        p_name: s.name.trim(), p_lang: s.lang, p_bread: sum.bread, p_fillings: sum.fillings, p_sauces: sum.sauces,
        p_side: sum.side, p_note: s.note.trim(), p_details: this.snapshot()
      });
      store(ORDER_KEY, { id, at: Date.now(), snap: this.snapshot(), status: 0 });
      const next = s.wishSent ? 'wait' : 'wish';
      this.setState({ orderId: id, screen: next, status: 0, drag: 0, sending: false, readySeen: false, scoreName: s.name.trim(), error: '' }, () => (next === 'wait' ? this.enterWait() : this.startPolling()));
    } catch (e) {
      this.setState({ sending: false, error: DICT[s.lang].sendError });
    }
  }
  enterWait() {
    this.clearTimers();
    const layers = this.layerCount || 3;
    for (let i = 0; i < layers; i++) this.timers.push(setTimeout(() => this.play('pop', 392 + i * 50), 500 + i * 340));
    this.timers.push(setTimeout(() => this.play('chime'), 700 + layers * 340));
    this.startPolling();
  }
  startPolling() {
    clearInterval(this.poll);
    const check = async () => {
      const s = this.state;
      if (!s.orderId) return;
      try {
        const st = await rpc('order_status', { p_id: s.orderId });
        if (st === null) { this.orderCancelled(); return; }
        const idx = STATUS_IDX[st] ?? 0;
        if (idx !== this.state.status) {
          const saved = store(ORDER_KEY);
          if (saved) store(ORDER_KEY, { ...saved, status: idx });
          if (idx === 2) { this.play('ready'); this.buzz([120, 80, 120]); this.setState({ status: 2, confettiN: this.state.confettiN + 1 }); }
          else this.setState({ status: idx });
        }
        if (st === 'collected') clearInterval(this.poll);
      } catch (e) { /* keep trying quietly */ }
    };
    check();
    this.poll = setInterval(check, 4000);
  }
  orderCancelled() {
    clearInterval(this.poll); this.clearTimers();
    store(ORDER_KEY, null);
    const s = this.state;
    if (s.screen === 'game') { this.setState({ orderId: null, status: 0, notice: true }); return; }
    this.setState({ ...this.fresh({ lang: s.lang, big: s.big, sound: s.sound, music: s.music, confettiN: s.confettiN, name: s.scoreName, wishSent: s.wishSent }), notice: true });
  }
  async sendWish() {
    const s = this.state;
    const who = s.name.trim() || s.scoreName.trim();
    if (!s.wish.trim() || s.wishBusy || (!s.orderId && !who)) return;
    this.setState({ wishBusy: true, error: '' });
    try {
      await rpc('add_wish', { p_name: who, p_message: s.wish.trim() });
      store(WISH_KEY, { at: Date.now(), name: who });
      this.play('hb');
      const patch = { wishSent: true, wishBusy: false, wish: '', scoreName: s.scoreName || who, confettiN: s.confettiN + 1 };
      if (s.orderId) this.setState({ ...patch, screen: 'wait' }, () => this.enterWait());
      else this.setState(patch, () => this.startGame());
    } catch (e) { this.setState({ wishBusy: false, error: DICT[s.lang].sendError }); }
  }
  openGame() {
    if (this.state.wishSent) { this.startGame(); return; }
    this.play('tap');
    this.setState({ screen: 'wish', error: '' });
  }
  async sendRating() {
    const s = this.state;
    if (!s.stars || s.rateBusy) return;
    this.setState({ rateBusy: true });
    try {
      await rpc('add_rating', { p_order: s.orderId, p_name: s.name.trim(), p_stars: s.stars, p_tags: Object.keys(s.tags).filter((k) => s.tags[k]).map(Number), p_comment: s.comment.trim() });
      this.play('chime');
      this.setState({ screen: 'thanks', rateBusy: false, error: '' });
    } catch (e) { this.setState({ rateBusy: false, error: DICT[s.lang].sendError }); }
  }
  newOrder() {
    this.play('tap');
    this.clearTimers(); clearInterval(this.poll);
    store(ORDER_KEY, null);
    const s = this.state;
    this.setState(this.fresh({ lang: s.lang, big: s.big, sound: s.sound, music: s.music, confettiN: s.confettiN, name: s.scoreName, wishSent: s.wishSent }));
  }

  // ---------- 3D sandwich ----------
  buildPlanes(cfg) {
    const TF = ['brightness(1.12) saturate(.85)', 'none', 'brightness(.8) saturate(1.15) contrast(1.05)'];
    const bf = cfg.toasted ? TF[cfg.toast] : 'none';
    const crust = cfg.toasted ? '#A8682F' : '#C4935C';
    const raw = [];
    let y = 0; let layer = 0;
    const add = (count, gap, mk, keep) => {
      for (let i = 0; i < count; i++) { raw.push({ cls: '', bg: 'transparent', sh: 'none', filter: 'none', rz: 0, r: '0', y, layer: keep === 'plate' ? -1 : layer, ...mk(i, count) }); y -= gap; }
      if (!keep) layer++;
    };
    const pc = (id) => (cfg.portion[id] ?? 1) + 1;
    add(1, 2.5, () => ({ w: 340, h: 340, r: '50%', bg: '#C9D5E2' }), 'plate');
    add(1, 5, () => ({ w: 340, h: 340, r: '50%', bg: '#FFFFFF', sh: 'inset 0 0 0 1.5px #C9D5E2, inset 0 0 0 24px #FFFFFF, inset 0 0 0 25px #D9E6F1' }), 'plate');
    const plateY = y;
    const edge = { w: 210, h: 136, r: '50% 50% 46% 46% / 52% 52% 48% 48%' };
    add(5, 2.2, (i) => ({ ...edge, bg: i === 0 ? '#8C5A2B' : crust, filter: bf }), 'same');
    add(1, 2.6, () => ({ w: 222, h: 146, cls: cfg.toasted ? 'ph-toast' : 'ph-crumb', filter: bf }));
    if (cfg.fill.brisket) add(pc('brisket'), 3, (i) => ({ w: 226, h: 154, cls: 'ph-brisket', rz: i % 2 ? 5 : -4 }));
    if (cfg.fill.cheese) add(1, 2, () => ({ w: 156, h: 150, cls: 'ph-cheese', rz: 16 }));
    if (cfg.fill.onion) add(pc('onion'), 2.8, (i) => ({ w: 214, h: 131, cls: 'ph-onion', rz: i * 25 }));
    if (cfg.fill.avocado) add(pc('avocado'), 3.2, (i) => ({ w: 214, h: 138, cls: 'ph-avocado', rz: i * 9 - 4 }));
    const chosen = ['mustard', 'garlic', 'thousand'].filter((k) => cfg.sauces[k]);
    if (chosen.length) {
      const reps = [1, 1, 2][cfg.saucy];
      add(chosen.length * reps, 1.2, (i) => ({ w: [150, 182, 206][cfg.saucy], h: [94, 114, 128][cfg.saucy], cls: 'ph-' + chosen[i % chosen.length], rz: (i % chosen.length) * 50 - 25 + (i >= chosen.length ? 90 : 0) }));
    }
    add(1, 2.2, () => ({ ...edge, bg: cfg.toasted ? '#E2B878' : '#EBD5A8', filter: bf }), 'same');
    add(5, 2.2, () => ({ ...edge, bg: crust, filter: bf }), 'same');
    add(1, 2, () => ({ w: 224, h: 147, cls: 'ph-crust', filter: bf }));
    if (cfg.pickle) raw.push({ cls: 'ph-pickle', bg: 'transparent', sh: 'none', filter: 'none', r: '0', w: 96, h: 72, rz: -20, x: 0, z: 124, y: plateY - 1, layer });
    const mid = y / 2 - 4;
    return {
      layers: layer + (cfg.pickle ? 1 : 0),
      planes: raw.map((p) => ({
        cls: p.cls, style: `position:absolute;left:${-p.w / 2}px;top:${-p.h / 2}px;width:${p.w}px;height:${p.h}px;border-radius:${p.r};background-color:${p.bg};box-shadow:${p.sh};filter:${p.filter};transform:translateY(${(p.y - mid).toFixed(1)}px) translateX(${p.x || 0}px) translateZ(${p.z || 0}px) rotateX(90deg) rotateZ(${p.rz}deg)`,
        delay: (0.5 + p.layer * 0.34).toFixed(2) + 's'
      }))
    };
  }
  creation() {
    const s = this.state;
    const adj = s.toasted ? ['Sunrise', 'Golden', 'Bold'][s.toast] : 'Classic';
    const f = s.fill;
    const n = ['brisket', 'avocado', 'onion', 'cheese'].filter((k) => f[k]).length;
    let noun = 'Sourdough';
    if (n >= 3) noun = 'Works'; else if (f.brisket) noun = 'Brisket'; else if (f.avocado) noun = 'Avocado'; else if (f.onion) noun = 'Onion'; else if (f.cheese) noun = 'Melt';
    const name = 'The ' + adj + ' ' + noun;
    return s.lang === 'de' ? '„' + name + '“' : '“' + name + '”';
  }

  // ---------- game: Sandwich Match ----------
  newGame() {
    this.gameToken = (this.gameToken || 0) + 1;
    this.busy = false;
    return { phase: 'intro', board: M.newBoard(), moves: MOVES, score: 0, sel: -1, fall: {}, pops: [], fx: [], fxN: 0, floats: [], word: '', wordN: 0, hint: null, bad: null, badN: 0, newBest: false };
  }
  startGame() {
    this.play('tap');
    const s = this.state;
    this.clearHint();
    const from = s.screen === 'game' ? s.gameFrom : (s.screen === 'wish' ? (s.orderId ? 'wait' : 'home') : s.screen);
    this.setState({ screen: 'game', gameFrom: from, game: this.newGame(), scoreSent: false });
  }
  beginPlay() {
    this.play('tap');
    this.setState({ game: { ...this.state.game, phase: 'play' } }, () => this.armHint());
  }
  gset(patch) { return new Promise((res) => this.setState({ game: { ...this.state.game, ...patch } }, res)); }
  wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
  clearHint() { clearTimeout(this.hintTimer); }
  armHint() {
    this.clearHint();
    this.hintTimer = setTimeout(() => {
      const G = this.state.game;
      if (!G || G.phase !== 'play' || this.busy || this.state.screen !== 'game') return;
      this.gset({ hint: M.findHint(G.board) });
    }, 5000);
  }
  cellAt(e) {
    if (!this.boardEl) return -1;
    const r = this.boardEl.getBoundingClientRect();
    const S = r.width / M.N;
    const c = Math.floor((e.clientX - r.left) / S); const rr = Math.floor((e.clientY - r.top) / S);
    if (c < 0 || c >= M.N || rr < 0 || rr >= M.N) return -1;
    return M.idx(rr, c);
  }
  onBoardDown(e) {
    const G = this.state.game;
    if (!G || G.phase !== 'play' || this.busy) return;
    const i = this.cellAt(e);
    if (i < 0) return;
    this.gp = { x: e.clientX, y: e.clientY, i, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  }
  onBoardMove(e) {
    const gp = this.gp;
    if (!gp || gp.moved || !this.boardEl) return;
    const S = this.boardEl.getBoundingClientRect().width / M.N;
    const dx = e.clientX - gp.x; const dy = e.clientY - gp.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < S * 0.4) return;
    gp.moved = true;
    const [r, c] = M.rc(gp.i);
    let t = -1;
    if (Math.abs(dx) > Math.abs(dy)) { if (dx > 0 && c < M.N - 1) t = gp.i + 1; if (dx < 0 && c > 0) t = gp.i - 1; }
    else { if (dy > 0 && r < M.N - 1) t = gp.i + M.N; if (dy < 0 && r > 0) t = gp.i - M.N; }
    if (t >= 0) this.trySwap(gp.i, t);
  }
  onBoardUp() {
    const gp = this.gp; this.gp = null;
    if (!gp || gp.moved) return;
    this.tapCell(gp.i);
  }
  tapCell(i) {
    const G = this.state.game;
    if (!G || G.phase !== 'play' || this.busy) return;
    this.armHint();
    if (G.sel < 0 || G.sel === i) { this.play(G.sel === i ? 'unpop' : 'tick'); this.gset({ sel: G.sel === i ? -1 : i, hint: null }); return; }
    if (M.adjacent(G.sel, i)) { this.trySwap(G.sel, i); return; }
    this.play('tick'); this.gset({ sel: i, hint: null });
  }
  async trySwap(a, b) {
    const G0 = this.state.game;
    if (this.busy || !G0 || G0.phase !== 'play' || !M.adjacent(a, b)) return;
    this.busy = true; this.clearHint();
    const tok = this.gameToken;
    const L = DICT[this.state.lang];
    this.play('swish'); this.buzz(8);
    const sw = M.swapped(G0.board, a, b);
    await this.gset({ board: sw, sel: -1, hint: null, fall: {} });
    await this.wait(190);
    if (tok !== this.gameToken) return;
    if (!M.isValidSwap(G0.board, a, b)) {
      this.play('unpop'); this.buzz([20, 40, 20]);
      await this.gset({ board: G0.board, bad: [a, b], badN: G0.badN + 1 });
      await this.wait(260);
      if (tok !== this.gameToken) return;
      await this.gset({ bad: null });
      this.busy = false; this.armHint();
      return;
    }
    let board = sw; let cascade = 1; let res = M.resolve(sw, [a, b], 1);
    while (res) {
      const g = this.state.game;
      const per = Math.round(res.points / Math.max(1, res.pops.length));
      const floats = res.pops.map((p) => ({ k: 'f' + (this.fk = (this.fk || 0) + 1), r: p.r, c: p.c, text: '+' + per }));
      const madeGold = res.created.some((t) => t.sp === 'gold');
      const madeSpecial = res.created.length > 0;
      let word = '';
      if (res.effects.some((x) => x.kind === 'gold')) word = L.g.goldWord;
      else if (madeGold) word = L.g.goldMade;
      else if (cascade >= 2) word = L.g.words[Math.min(cascade - 2, L.g.words.length - 1)];
      else if (madeSpecial) word = L.g.specialWord;
      this.play('match', cascade);
      if (madeSpecial) this.play('sparkle');
      if (res.effects.some((x) => x.kind === 'line')) this.play('whoosh');
      if (res.effects.some((x) => x.kind === 'gold')) this.play('chime');
      if (word && cascade >= 3) this.play('yum');
      this.buzz(12);
      await this.gset({
        board: res.board, fall: {},
        pops: res.cleared.map(({ i, tile }) => ({ i, id: tile.id, t: tile.t, sp: tile.sp })),
        fx: res.effects, fxN: g.fxN + 1, floats,
        score: g.score + res.points,
        word, wordN: word ? g.wordN + 1 : g.wordN
      });
      await this.wait(250);
      if (tok !== this.gameToken) return;
      const gr = M.gravity(res.board);
      await this.gset({ board: gr.board, fall: gr.fall, pops: [] });
      await this.wait(340);
      if (tok !== this.gameToken) return;
      board = gr.board; cascade++;
      res = M.resolve(board, null, cascade);
    }
    const moves = this.state.game.moves - 1;
    await this.gset({ moves, fall: {} });
    if (moves <= 0) { await this.wait(450); if (tok !== this.gameToken) return; this.busy = false; this.endGame(); return; }
    if (!M.findHint(board)) {
      await this.wait(200);
      const g = this.state.game;
      this.play('sparkle');
      await this.gset({ board: M.shuffle(board), fall: {}, word: L.g.shuffle, wordN: g.wordN + 1 });
    }
    this.busy = false; this.armHint();
  }
  endGame() {
    this.clearHint();
    const G = this.state.game;
    const pts = G.score;
    const newBest = pts > 0 && pts > this.best;
    if (newBest) { this.best = pts; store(BEST_KEY, pts); }
    this.play(newBest ? 'chime' : 'over');
    if (newBest) setTimeout(() => this.play('hb'), 700);
    this.setState({ game: { ...G, phase: 'over', newBest, sel: -1, hint: null }, confettiN: this.state.confettiN + (newBest ? 1 : 0), scoreSent: false }, () => {
      if (this.state.scoreName.trim() && pts > 0) this.submitScore();
    });
  }
  async submitScore() {
    const s = this.state; const G = s.game;
    if (!G || s.scoreBusy || s.scoreSent) return;
    const pts = G.score;
    const name = s.scoreName.trim();
    if (!name || pts < 1) return;
    this.setState({ scoreBusy: true });
    try { await rpc('add_score', { p_name: name, p_layers: pts }); this.setState({ scoreSent: true, scoreBusy: false }); }
    catch (e) { this.setState({ scoreBusy: false }); }
  }
  async shareCard() {
    const s = this.state; const L = DICT[s.lang]; const G = s.game;
    if (!G) return;
    this.play('tap');
    const pts = G.score;
    const W = 1080, H = 1350;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#EAF1F8'); bg.addColorStop(0.5, '#FBF6EC'); bg.addColorStop(1, '#FBE6EC');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    try { await document.fonts.ready; } catch (e) {}
    c.textAlign = 'center';
    c.fillStyle = INK; c.font = 'italic 500 104px "Bodoni Moda", serif'; c.fillText("Giena's", W / 2, 160);
    c.font = '500 28px Jost, sans-serif'; c.fillStyle = GOLD; c.fillText('D  E  L  I   ·   S A N D W I C H   M A T C H', W / 2, 212);
    const load = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    const types = [...M.TYPES, 'gold'];
    const imgs = {};
    for (const t of types) imgs[t] = await load('img/t-' + t + '.webp');
    const grid = ['brisket', 'avocado', 'cheese', 'onion', 'toast', 'gold', 'gold', 'pickle', 'cheese', 'gold', 'avocado', 'brisket', 'onion', 'pickle', 'toast', 'cheese'];
    const T = 150, gap = 18, gx = (W - (T * 4 + gap * 3)) / 2, gy = 290;
    c.save(); c.shadowColor = 'rgba(138,106,47,.25)'; c.shadowBlur = 40; c.fillStyle = '#FFFBF2';
    const rr = (x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
    rr(gx - 30, gy - 30, T * 4 + gap * 3 + 60, T * 4 + gap * 3 + 60, 46); c.fill(); c.restore();
    grid.forEach((t, k) => {
      const x = gx + (k % 4) * (T + gap); const y = gy + Math.floor(k / 4) * (T + gap);
      c.fillStyle = TILE_COL[t][1]; rr(x, y, T, T, 44); c.fill();
      c.fillStyle = 'rgba(255,255,255,.55)'; rr(x + 22, y + 12, T * 0.5, T * 0.2, 20); c.fill();
      const im = imgs[t]; if (im) c.drawImage(im, x + T * 0.1, y + T * 0.1, T * 0.8, T * 0.8);
    });
    c.fillStyle = INK; c.font = 'italic 500 70px "Bodoni Moda", "Noto Serif Thai", serif';
    c.fillText(L.g.shareLine1(pts), W / 2, 1110);
    c.font = '400 40px Jost, Sarabun, sans-serif'; c.fillStyle = '#4A5570';
    c.fillText(L.g.shareLine2, W / 2, 1180);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    if (!blob) return;
    const file = new File([blob], 'giena-sandwich-match.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Sandwich Match', text: L.g.shareLine1(pts) }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'giena-sandwich-match.png'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ---------- values ----------
  vals() {
    const s = this.state;
    const L = DICT[s.lang];
    const snd = (name, fn) => (...a) => { this.play(name); if (fn) fn(...a); };
    const go = (screen) => snd('tap', () => this.setState({ screen, error: '' }));
    const stepN = { bread: 1, fill: 2, sauce: 3 }[s.screen] || 0;
    const track = (v) => { const p = (v / 2) * 100; return `background:linear-gradient(to right, ${INK} 0%, ${INK} ${p}%, rgba(27,34,56,.18) ${p}%, rgba(27,34,56,.18) 100%)`; };
    const ticks = (labels, v, onPick) => labels.map((label, i) => ({
      label, on: i === v, color: i === v ? INK : '#7A7F92', weight: i === v ? 600 : 400,
      align: i === 0 ? 'left' : (i === 2 ? 'right' : 'center'), pick: snd('tick', () => onPick(i))
    }));
    const portionOf = (id) => (s.portion[id] ?? 1);
    const fills = FILLS.map((f) => {
      const on = !!s.fill[f.id]; const pv = portionOf(f.id); const n = on && !f.note ? pv + 1 : 1;
      return {
        ...f, on, name: L.fills[f.id],
        border: on ? INK : 'rgba(27,34,56,.14)', ring: on ? 'inset 0 0 0 1px ' + INK : 'none',
        sub: f.note ? L.cheeseNote : (on ? L.portion[pv] : L.tapToAdd), subColor: on && !f.note ? GOLD : '#7A7F92',
        stack: ROT[n - 1].map((rot, i) => ({ rot, dy: (n - 1) * 5 - i * 10 })),
        toggle: snd(on ? 'unpop' : 'pop', () => this.setState({ fill: { ...s.fill, [f.id]: !on } }))
      };
    });
    const chosenFills = FILLS.filter((f) => s.fill[f.id]);
    const portionRows = chosenFills.filter((f) => !f.note).map((f) => {
      const v = portionOf(f.id);
      const set = (i) => this.setState({ portion: { ...this.state.portion, [f.id]: i } });
      return { id: f.id, name: L.fills[f.id], img: f.img, v, value: L.portion[v], track: track(v), ticks: ticks(L.portion, v, set),
        onSlide: (e) => { const nv = Number(e.target.value); if (nv !== v) this.play('tick'); set(nv); } };
    });
    const sauces = SAUCES.map((x) => {
      const on = !!s.sauces[x.id];
      return { ...x, on, name: L.sauces[x.id], border: on ? INK : 'rgba(27,34,56,.14)', ring: on ? 'inset 0 0 0 1px ' + INK : 'none', toggle: snd(on ? 'unpop' : 'plip', () => this.setState({ sauces: { ...s.sauces, [x.id]: !on } })) };
    });
    const chosenSauces = SAUCES.filter((x) => s.sauces[x.id]);
    const lowerIf = (t) => (s.lang === 'th' ? t : t.toLowerCase());
    const breadText = L.sourdough + (s.lang === 'th' ? ' ' : ', ') + (s.toasted ? L.toastPh[s.toast] : L.notToastedPh);
    const fillText = chosenFills.length ? chosenFills.map((f) => L.fills[f.id] + (f.note ? '' : ' (' + lowerIf(L.portion[portionOf(f.id)]) + ')')).join(L.join) : L.noFill;
    const sauceText = chosenSauces.length ? chosenSauces.map((x) => L.sauces[x.id]).join(L.join) + ' (' + lowerIf(L.saucy[s.saucy]) + ')' : L.noSauce;
    const lines = [
      { title: L.lineTitles[0], detail: breadText, go: go('bread') },
      { title: L.lineTitles[1], detail: fillText, go: go('fill') },
      { title: L.lineTitles[2], detail: sauceText, go: go('sauce') },
      { title: L.lineTitles[3], detail: s.pickle ? L.pickleYes : L.pickleNo, go: go('sauce') }
    ];
    const built = this.buildPlanes(s);
    this.layerCount = built.layers;
    const nm = s.name.trim();
    const who = nm || L.friend;
    const ready = s.status === 2;
    const wt = L.waitT[s.status];
    const needName = s.screen === 'review' && nm === '';
    const needStar = s.screen === 'rate' && s.stars === 0;
    const needWishName = s.screen === 'wish' && !s.orderId && !s.scoreName.trim();
    const needWish = s.screen === 'wish' && !s.wish.trim();
    const busy = s.sending || s.rateBusy || s.wishBusy;
    const ctaMap = {
      home: go('bread'), bread: go('fill'), fill: go('sauce'), sauce: go('review'),
      review: () => this.sendOrder(), wish: () => this.sendWish(), wait: go('rate'), rate: () => this.sendRating(), thanks: () => this.newOrder()
    };
    const ctaLabel = busy ? L.sending : L.cta[s.screen];
    const dark = s.screen === 'wait';
    const scale = Math.min(1, (this.width - 30) / 360);
    return {
      L, s, stepN, fills, chosenFills, portionRows, sauces, anySauce: chosenSauces.length > 0, lines, built, who, ready, nm,
      waitTitle: typeof wt === 'function' ? wt(who) : wt, scale, dark,
      chrome: dark ? '#F6F1E7' : INK, chromeLine: dark ? 'rgba(246,241,231,.25)' : 'rgba(27,34,56,.22)',
      tt: L.titles[s.screen] || ['', ''],
      back: go({ bread: 'home', fill: 'bread', sauce: 'fill', review: 'sauce', game: s.gameFrom, wish: s.orderId ? 'wait' : 'home' }[s.screen] || 'home'),
      toastTrack: track(s.toast), toastTicks: ticks(L.toastLv, s.toast, (i) => { this.play('crunch'); this.setState({ toast: i }); }),
      saucyTrack: track(s.saucy), saucyTicks: ticks(L.saucy, s.saucy, (i) => this.setState({ saucy: i })),
      showCta: !(s.screen === 'wait' && !ready) && s.screen !== 'game',
      ctaDisabled: needName || needStar || needWish || needWishName || busy, hint: s.error || (needName ? L.needName : (needStar ? L.tapStar : (needWishName ? L.wishNeedName : ''))),
      ctaLabel, cta: ctaMap[s.screen],
      snd, go
    };
  }

  // ---------- render pieces ----------
  renderTop(v) {
    const { s, L } = v;
    const isHome = s.screen === 'home';
    const showBack = v.stepN > 0 || s.screen === 'review' || s.screen === 'game' || s.screen === 'wish';
    const zoomBg = s.big ? v.chrome : 'transparent';
    const zoomFg = s.big ? (v.dark ? '#121828' : '#F6F1E7') : v.chrome;
    const circ = `width:46px;height:46px;border-radius:50%;border:1px solid ${v.chromeLine};background:transparent;color:${v.chrome};display:flex;align-items:center;justify-content:center;padding:0`;
    return html`<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding-top:max(18px, env(safe-area-inset-top));min-height:52px">
      <div style="display:flex">
        ${showBack && html`<button class="press" onClick=${v.back} style="height:48px;padding:0 10px 0 0;border:0;background:transparent;color:${v.chrome};display:flex;align-items:center;gap:4px;font-size:18px">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>${L.back}</button>`}
        ${isHome && html`<div role="group" aria-label="Language" style="display:flex;border:1px solid rgba(27,34,56,.22);border-radius:999px;padding:3px">
          ${[['en', 'EN', 'English'], ['th', 'ไทย', 'ภาษาไทย'], ['de', 'DE', 'Deutsch']].map(([k, label, aria]) => html`<button class="press" onClick=${v.snd('tap', () => this.setState({ lang: k }))} aria-pressed=${s.lang === k} aria-label=${aria} style="height:40px;min-width:44px;padding:0 8px;border:0;border-radius:999px;background:${s.lang === k ? INK : 'transparent'};color:${s.lang === k ? '#F6F1E7' : INK};font-size:15px;font-weight:500">${label}</button>`)}
        </div>`}
      </div>
      ${isHome ? html`<span></span>` : html`<span class="serif" style="font-style:italic;font-size:24px;color:${v.chrome}">Giena's</span>`}
      <div style="display:flex;justify-content:flex-end;gap:6px">
        <button class="press" onClick=${() => this.toggleMusic()} aria-pressed=${s.music} aria-label=${L.musicAria} style="${circ};background:${s.music ? v.chrome : 'transparent'};color:${s.music ? (v.dark ? '#121828' : '#F6F1E7') : v.chrome}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="17" cy="16" r="3"></circle></svg>
        </button>
        <button class="press" onClick=${() => { const on = !s.sound; this.setState({ sound: on }, () => { if (on) this.play('plip'); }); }} aria-pressed=${s.sound} aria-label=${s.sound ? L.soundOff : L.soundOn} style=${circ}>
          ${s.sound ? html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"></path><path d="M16.5 8.5a5 5 0 0 1 0 7"></path></svg>`
            : html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"></path><path d="M17 9.5l4 5M21 9.5l-4 5"></path></svg>`}
        </button>
        <button class="press serif" onClick=${v.snd('tap', () => this.setState({ big: !s.big }))} aria-pressed=${s.big} aria-label=${s.big ? 'A-' : 'A+'} style="${circ};background:${zoomBg};color:${zoomFg};font-size:18px">Aa</button>
      </div>
    </div>`;
  }

  renderHome(v) {
    const { L } = v;
    return html`<div class="screen" style="display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:10px">
      ${v.s.notice && this.noticeBox(v)}
      ${CROWN}
      <span class="serif" style="font-style:italic;font-weight:500;font-size:52px;line-height:1.05;margin-top:4px">Giena's</span>
      <div style="display:flex;align-items:center;gap:12px;margin-top:4px">
        <span style="width:40px;height:1px;background:${INK}"></span>
        <span style="font-family:Jost,sans-serif;font-weight:500;text-transform:uppercase;font-size:15px;letter-spacing:.5em;padding-left:.5em">Deli</span>
        <span style="width:40px;height:1px;background:${INK}"></span>
      </div>
      <span style="font-family:Jost,sans-serif;text-transform:uppercase;font-size:12px;letter-spacing:.35em;color:#5B6075;margin-top:6px">Est. 1999</span>
      <div style="margin-top:22px;position:relative;width:100%;height:250px;display:flex;align-items:center;justify-content:center">
        <div style="position:absolute;width:300px;height:300px;border-radius:50%;background:#FFFFFF;box-shadow:inset 0 0 0 1px #D2DCE8, inset 0 0 0 22px #FFFFFF, inset 0 0 0 23px #D9E6F1, 0 20px 40px rgba(27,34,56,.10)" aria-hidden="true"></div>
        <img class="float" src="img/hero.webp" alt="Sandwich" style="position:relative;width:min(300px, 90%);height:auto;filter:drop-shadow(0 14px 18px rgba(27,34,56,.22))" />
      </div>
      <span class="label" style="font-size:14px;color:${GOLD};margin-top:30px">${L.overline}</span>
      <h1 class="serif" style="margin:10px 0 0;font-weight:500;font-size:40px;line-height:1.15">${L.h1a} <span style="font-style:italic">${L.h1b}</span></h1>
      <p style="margin:14px 0 0;font-size:19px;line-height:1.55;color:#3F455A;max-width:320px">${L.homeSub}</p>
      <div style="width:100%;margin-top:28px;border-top:1px solid ${LINE}">
        ${L.courses.map((c, i) => html`<div style="padding:20px 8px;border-bottom:1px solid ${LINE};display:flex;flex-direction:column;align-items:center;gap:6px">
          <span class="label" style="font-size:13px;color:${GOLD}">${L.course(i)}</span>
          <span class="serif" style="font-size:26px;font-weight:500">${c[0]}</span>
          <span style="font-size:17px;line-height:1.45;color:#5B6075;font-style:italic">${c[1]}</span>
        </div>`)}
      </div>
      <div style="width:100%;margin-top:28px;padding:22px 18px 26px;background:#FFFFFF;border:1px solid rgba(27,34,56,.14);display:flex;flex-direction:column;align-items:center;gap:8px">
        <img src="img/salmon.webp" alt=${L.spTitle} style="width:100%;max-width:300px;height:auto;margin-bottom:8px;filter:drop-shadow(0 10px 14px rgba(27,34,56,.14))" />
        <span class="label" style="font-size:13px;color:${GOLD}">${L.spLabel}</span>
        <span class="serif hy" style="font-size:26px;font-weight:500;line-height:1.25">${L.spTitle}</span>
        <span class="serif" style="font-size:20px;font-style:italic;color:#3F455A">${L.spSub}</span>
        <span style="width:28px;height:1px;background:${GOLD};margin:8px 0"></span>
        <span class="label" style="font-size:13px">${L.spGuests}</span>
        <span style="font-size:17px;color:#5B6075">${L.spNote}</span>
      </div>
      <button class="press" onClick=${() => this.openGame()} style="width:100%;margin-top:16px;min-height:64px;border:1px solid ${INK};border-radius:2px;background:transparent;color:${INK};display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 16px;font-size:18px">
        <span style="display:grid;grid-template-columns:repeat(2,18px);gap:3px" aria-hidden="true">${['brisket', 'avocado', 'cheese', 'toast'].map((t) => html`<img src=${'img/t-' + t + '.webp'} alt="" style="width:18px;height:18px;border-radius:6px;background:${TILE_COL[t][1]}" />`)}</span>
        <span>${L.g.homeGame}</span>
      </button>
    </div>`;
  }

  noticeBox(v) {
    const { L } = v;
    return html`<div role="alert" class="screen" style="width:100%;margin:6px 0 18px;padding:14px 16px;background:#FFFFFF;border:1px solid #C2416B;border-radius:2px;display:flex;align-items:flex-start;gap:12px;text-align:left">
      <span style="flex:1;font-size:18px;line-height:1.45">${L.cancelled}</span>
      <button onClick=${v.snd('tap', () => this.setState({ notice: false }))} aria-label=${L.close} style="width:40px;height:40px;flex:none;border:0;background:transparent;color:${INK};font-size:24px;line-height:1">×</button>
    </div>`;
  }
  renderTitle(v) {
    const { L, stepN, tt } = v;
    return html`<div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding-top:14px">
      ${stepN > 0 && html`<div style="display:flex;flex-direction:column;align-items:center;gap:10px">
        <span class="label" style="font-size:14px;color:${GOLD}">${L.stepOf(stepN - 1)}</span>
        <div style="display:flex;gap:6px" aria-hidden="true">${[1, 2, 3].map((n) => html`<span style="width:34px;height:2px;background:${n <= stepN ? INK : 'rgba(27,34,56,.18)'};transition:background .3s ease"></span>`)}</div>
      </div>`}
      <h2 class="serif" style="margin:0;font-weight:500;font-size:42px;line-height:1.12">${tt[0]}</h2>
      <span style="font-size:19px;line-height:1.45;color:#5B6075;font-style:italic">${tt[1]}</span>
    </div>`;
  }

  amountControl(label, valueLabel, value, track, onSlide, ticks, size) {
    return html`<div style="display:flex;flex-direction:column;gap:14px">
      ${label && html`<div style="display:flex;align-items:baseline;justify-content:space-between">
        <span style="font-size:20px;font-weight:500">${label}</span>
        <span class="serif" style="font-size:22px;font-style:italic;color:${GOLD}">${valueLabel}</span>
      </div>`}
      <div style="padding:0 14px"><input type="range" min="0" max="2" step="1" value=${value} onInput=${onSlide} aria-label=${label || valueLabel} aria-valuetext=${valueLabel} style=${track} /></div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr))">
        ${ticks.map((t) => html`<button onClick=${t.pick} aria-pressed=${t.on} style="height:48px;border:0;background:transparent;color:${t.color};font-size:${size || 18}px;font-weight:${t.weight};text-align:${t.align};padding:0">${t.label}</button>`)}
      </div>
    </div>`;
  }

  renderBread(v) {
    const { L, s } = v;
    const breadFilter = s.toasted ? ['brightness(1.12) saturate(.85)', 'brightness(1)', 'brightness(.8) saturate(1.15) contrast(1.05)'][s.toast] : 'brightness(1)';
    return html`<div class="screen" style="display:flex;flex-direction:column;gap:22px;padding-top:16px">
      <div style="position:relative;height:250px;display:flex;align-items:center;justify-content:center">
        <div style="position:absolute;width:270px;height:270px;border-radius:50%;background:#FFFFFF;box-shadow:inset 0 0 0 1px #D2DCE8, inset 0 0 0 20px #FFFFFF, inset 0 0 0 21px #D9E6F1, 0 16px 30px rgba(27,34,56,.08)" aria-hidden="true"></div>
        <img src=${s.toasted ? 'img/toasted.webp' : 'img/crumb.webp'} alt="" style="position:relative;width:236px;max-width:80%;height:auto;filter:${breadFilter} drop-shadow(0 8px 10px rgba(27,34,56,.18));transition:filter .4s ease" />
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
        <span class="serif" style="font-size:28px;font-weight:500">${L.sourdough}</span>
        <span class="label" style="font-size:13px;color:${GOLD}">${L.included}</span>
      </div>
      <div role="group" aria-label=${L.howToasted} style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
        ${[[L.toasted, true, 'crunch'], [L.notToasted, false, 'tap']].map(([label, val, sn]) => html`<button class="press" onClick=${v.snd(sn, () => this.setState({ toasted: val }))} aria-pressed=${s.toasted === val} style="height:60px;border:1px solid ${INK};border-radius:2px;background:${s.toasted === val ? INK : '#FFFFFF'};color:${s.toasted === val ? '#F6F1E7' : INK};font-size:19px;font-weight:500">${label}</button>`)}
      </div>
      ${s.toasted && html`<div class="screen" style="padding:18px 0 4px;border-top:1px solid ${LINE}">
        ${this.amountControl(L.howToasted, L.toastLv[s.toast], s.toast, v.toastTrack, (e) => { const n = Number(e.target.value); if (n !== s.toast) this.play('crunch'); this.setState({ toast: n }); }, v.toastTicks)}
      </div>`}
    </div>`;
  }

  tile(item, onClick, inner, minH) {
    return html`<button class="press" onClick=${onClick} aria-pressed=${item.on} aria-label=${item.name} style="position:relative;min-height:${minH}px;padding:12px 10px 16px;border:1px solid ${item.border};box-shadow:${item.ring};border-radius:2px;background:#FFFFFF;display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:8px;color:${INK}">
      ${inner}
      ${item.on && html`<span class="badge" style="position:absolute;top:10px;right:10px;width:32px;height:32px;border-radius:50%;background:${INK};color:#F6F1E7;display:flex;align-items:center;justify-content:center" aria-hidden="true">${check(16, 2.6)}</span>`}
    </button>`;
  }

  renderFill(v) {
    const { L } = v;
    return html`<div class="screen" style="display:flex;flex-direction:column;gap:26px;padding-top:18px">
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
        ${v.fills.map((f) => this.tile(f, f.toggle, html`
          <span style="position:relative;width:100%;height:124px" aria-hidden="true">
            ${f.stack.map((c) => html`<img src=${f.img} alt="" style="position:absolute;left:50%;top:50%;width:${f.w}px;max-width:95%;transform:translate(-50%,-50%) translateY(${c.dy}px) rotate(${c.rot}deg);filter:drop-shadow(0 4px 5px rgba(27,34,56,.18));transition:transform .3s ease" />`)}
          </span>
          <span class="serif hy" style="font-size:21px;font-weight:500;line-height:1.2;text-align:center;max-width:100%">${f.name}</span>
          <span style="font-size:16px;color:${f.subColor};font-style:italic;text-align:center">${f.sub}</span>`, 212))}
      </div>
      ${v.portionRows.length > 0 && html`<div class="screen" style="display:flex;flex-direction:column;border-top:1px solid ${LINE}">
        <span class="label" style="font-size:13px;color:${GOLD};text-align:center;padding:18px 0 4px">${L.howMuchEach}</span>
        ${v.portionRows.map((r) => html`<div key=${r.id} style="display:flex;flex-direction:column;gap:12px;padding:16px 0;border-bottom:1px solid rgba(27,34,56,.12)">
          <div style="display:flex;align-items:center;gap:12px">
            <img src=${r.img} alt="" style="width:52px;height:36px;object-fit:contain" />
            <span class="serif hy" style="flex:1;min-width:0;font-size:21px;font-weight:500">${r.name}</span>
            <span class="serif" style="font-size:20px;font-style:italic;color:${GOLD}">${r.value}</span>
          </div>
          ${this.amountControl('', r.value, r.v, r.track, r.onSlide, r.ticks, 17)}
        </div>`)}
      </div>`}
    </div>`;
  }

  renderSauce(v) {
    const { L, s } = v;
    const pickleItem = { on: s.pickle, name: L.pickle, border: s.pickle ? INK : 'rgba(27,34,56,.14)', ring: s.pickle ? 'inset 0 0 0 1px ' + INK : 'none' };
    return html`<div class="screen" style="display:flex;flex-direction:column;gap:26px;padding-top:18px">
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
        ${v.sauces.map((x) => this.tile(x, x.toggle, html`
          <span style="height:120px;display:flex;align-items:center;justify-content:center"><img src=${x.img} alt="" style="width:128px;max-width:100%;height:auto;filter:drop-shadow(0 6px 8px rgba(27,34,56,.16))" /></span>
          <span class="serif hy" style="font-size:21px;font-weight:500;line-height:1.2;text-align:center;max-width:100%">${x.name}</span>`, 196))}
        ${this.tile(pickleItem, v.snd(s.pickle ? 'unpop' : 'crunch', () => this.setState({ pickle: !s.pickle })), html`
          <span style="height:120px;display:flex;align-items:center;justify-content:center"><img src="img/pickle_bowl.webp" alt="" style="width:128px;max-width:100%;height:auto;filter:drop-shadow(0 6px 8px rgba(27,34,56,.16))" /></span>
          <span style="display:flex;flex-direction:column;align-items:center;gap:2px">
            <span class="serif hy" style="font-size:21px;font-weight:500;line-height:1.2;text-align:center">${L.pickle}</span>
            <span class="label" style="font-size:11px;color:${GOLD}">${L.onTheSide}</span>
          </span>`, 196)}
      </div>
      ${v.anySauce && html`<div class="screen" style="padding:18px 0 8px;border-top:1px solid ${LINE}">
        ${this.amountControl(L.howMuchSauce, L.saucy[s.saucy], s.saucy, v.saucyTrack, (e) => { const n = Number(e.target.value); if (n !== s.saucy) this.play('plip'); this.setState({ saucy: n }); }, v.saucyTicks)}
      </div>`}
    </div>`;
  }

  renderReview(v) {
    const { L, s } = v;
    const field = 'border:0;border-bottom:1px solid ' + INK + ';border-radius:0;background:transparent;color:' + INK + ';width:100%';
    return html`<div class="screen" style="display:flex;flex-direction:column;gap:22px;padding-top:18px">
      <div style="background:#FFFFFF;border:1px solid rgba(27,34,56,.14);padding:26px 20px 10px;display:flex;flex-direction:column;align-items:center;text-align:center">
        <span class="serif" style="font-style:italic;font-size:26px">Giena's</span>
        <span class="label" style="font-size:12px;color:#5B6075;margin-top:2px">${v.tt[0]}</span>
        <span style="width:28px;height:1px;background:${GOLD};margin:14px 0 4px"></span>
        ${v.lines.map((l, i) => html`<div style="width:100%;padding:14px 0;border-bottom:${i === v.lines.length - 1 ? '0' : '1px solid ' + LINE};display:flex;flex-direction:column;align-items:center;gap:4px">
          <span class="label" style="font-size:12px;color:${GOLD}">${l.title}</span>
          <span class="serif" style="font-size:20px;line-height:1.45">${l.detail}</span>
          <button onClick=${l.go} style="height:40px;padding:0 10px;border:0;background:transparent;color:#5B6075;font-size:16px;text-decoration:underline;text-underline-offset:4px">${L.change}</button>
        </div>`)}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <label for="order-name" class="label" style="font-size:13px;color:${GOLD}">${L.nameLabel}</label>
        <input id="order-name" type="text" maxlength="40" value=${s.name} onInput=${(e) => this.setState({ name: e.target.value, error: '' })} placeholder=${L.namePh} autocomplete="given-name" class="serif" style="${field};height:58px;padding:0 2px;font-size:26px" />
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <label for="order-note" class="label" style="font-size:13px;color:${GOLD}">${L.noteLabel}</label>
        <textarea id="order-note" maxlength="300" value=${s.note} onInput=${(e) => this.setState({ note: e.target.value })} placeholder=${L.notePh} rows="2" style="${field};padding:8px 2px;font-family:inherit;font-size:19px;line-height:1.5;resize:none"></textarea>
      </div>
    </div>`;
  }

  renderScene(v, height, top, extraScale, drop) {
    const { s } = v;
    return html`<div onPointerDown=${(e) => { this.dragging = true; this.dragX = e.clientX; this.setState({ dragging: true }); }}
      onPointerMove=${(e) => { if (!this.dragging) return; const dx = e.clientX - this.dragX; this.dragX = e.clientX; this.setState({ drag: this.state.drag + dx * 0.8 }); }}
      onPointerUp=${() => { if (!this.dragging) return; this.dragging = false; this.setState({ dragging: false }); }}
      onPointerCancel=${() => { this.dragging = false; this.setState({ dragging: false }); }}
      onPointerLeave=${() => { if (!this.dragging) return; this.dragging = false; this.setState({ dragging: false }); }}
      style="width:100%;height:${height}px;position:relative;perspective:1000px;touch-action:none;cursor:grab;overflow:hidden">
      <div style="position:absolute;left:50%;top:${top + 92 * v.scale}px;width:${260 * v.scale}px;height:40px;margin-left:${-130 * v.scale}px;border-radius:50%;background:radial-gradient(ellipse, rgba(0,0,0,.55), rgba(0,0,0,0) 70%)" aria-hidden="true"></div>
      <div class="float" style="position:absolute;left:50%;top:${top}px;transform-style:preserve-3d" aria-hidden="true">
        <div class="spin" style="position:relative;width:0;height:0;transform-style:preserve-3d;animation-play-state:${s.dragging ? 'paused' : 'running'}">
          <div style="position:relative;width:0;height:0;transform-style:preserve-3d;transform:scale(${(v.scale * extraScale).toFixed(3)}) rotateY(${s.drag}deg)">
            ${v.built.planes.map((p) => drop
              ? html`<div class="drop" style="position:absolute;left:0;top:0;width:0;height:0;transform-style:preserve-3d;animation-delay:${p.delay}"><div class=${'ph ' + p.cls} style=${p.style}></div></div>`
              : html`<div class=${'ph ' + p.cls} style=${p.style}></div>`)}
          </div>
        </div>
      </div>
    </div>`;
  }

  renderWait(v) {
    const { L, s } = v;
    const status = L.status.map((label, i) => {
      const done = i < s.status || (i === 2 && s.status === 2);
      const active = i === s.status && !done;
      return { label, dot: done ? '#E8D49A' : 'transparent', ring: done || active ? '#E8D49A' : 'rgba(246,241,231,.35)', pulse: active ? 'pulse' : '', color: done || active ? '#F6F1E7' : 'rgba(246,241,231,.5)' };
    });
    const wishEmpty = !s.wish.trim();
    return html`<div class="screen" style="display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:6px;color:#F6F1E7">
      <span class="label" style="font-size:13px;color:#E8D49A">${L.kicker(v.who)}</span>
      ${this.renderScene(v, 320, 164, 1, true)}
      <span class="label" style="font-size:12px;color:rgba(246,241,231,.6)">${L.creation}</span>
      <span class="serif" style="font-size:26px;font-style:italic;color:#E8D49A;margin-top:4px">${this.creation()}</span>
      <h2 class="serif" style="margin:22px 0 0;font-weight:500;font-size:34px;line-height:1.18">${v.waitTitle}</h2>
      <p style="margin:12px 0 0;font-size:19px;line-height:1.5;color:rgba(246,241,231,.82);max-width:320px">${L.waitS[s.status]}</p>
      <div style="display:flex;align-items:flex-start;justify-content:center;margin-top:26px;width:100%" role="status" aria-live="polite">
        ${status.map((it) => html`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:10px">
          <span class=${it.pulse} style="width:14px;height:14px;border-radius:50%;background:${it.dot};border:1px solid ${it.ring}"></span>
          <span style="font-size:16px;color:${it.color}">${it.label}</span>
        </div>`)}
      </div>
      <span style="font-size:15px;color:rgba(246,241,231,.55);margin-top:22px;font-style:italic">${L.drag}</span>
      ${!s.wishSent && html`<button class="press" onClick=${() => this.openGame()} style="width:100%;margin-top:30px;min-height:92px;border:0;border-radius:2px;background:#E8D49A;color:#121828;display:flex;align-items:center;gap:14px;padding:14px 16px;text-align:left">
        <span style="width:48px;height:48px;flex:none;border-radius:50%;background:#121828;color:#E8D49A;display:flex;align-items:center;justify-content:center" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 11-11-3-3L5 16z"></path><path d="M14 6l3 3"></path></svg></span>
        <span style="flex:1;display:flex;flex-direction:column;gap:2px">
          <span class="label" style="font-size:11px;color:#5A4520">${L.whileWait}</span>
          <span class="serif" style="font-size:24px;line-height:1.2">${L.wishTitle}</span>
          <span style="font-size:15px;color:#3F3420">${L.wishFirst}</span>
        </span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
      </button>`}
      ${s.wishSent && html`<div class="screen" style="width:100%;margin-top:26px;display:flex;align-items:center;justify-content:center;gap:10px;color:#E8D49A">${check(18, 2.2)}<span style="font-size:17px">${L.wishSent}</span></div>`}
      <button class="press" onClick=${() => this.openGame()} style="width:100%;margin-top:14px;min-height:92px;border:1px solid ${s.wishSent ? '#E8D49A' : 'rgba(246,241,231,.25)'};border-radius:2px;background:${s.wishSent ? 'rgba(232,212,154,.12)' : 'transparent'};color:#F6F1E7;display:flex;align-items:center;gap:14px;padding:12px 16px;text-align:left;opacity:${s.wishSent ? 1 : 0.6}">
        <span style="display:grid;grid-template-columns:repeat(2,24px);gap:4px;flex:none" aria-hidden="true">${['brisket', 'avocado', 'cheese', 'gold'].map((t) => html`<img src=${'img/t-' + t + '.webp'} alt="" style="width:24px;height:24px;border-radius:8px;background:${TILE_COL[t][1]}" />`)}</span>
        <span style="flex:1;display:flex;flex-direction:column;gap:2px">
          <span class="label" style="font-size:11px;color:#E8D49A">${s.wishSent ? L.g.playSub : L.g.locked}</span>
          <span class="serif" style="font-size:26px;font-style:italic">${L.g.playCta}</span>
        </span>
        ${s.wishSent ? html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>`
          : html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>`}
      </button>
    </div>`;
  }

  renderWish(v) {
    const { L, s } = v;
    const ordered = !!s.orderId;
    const ready = ordered && s.status === 2;
    return html`<div class="screen" style="display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:14px">
      ${ready && html`<div class="screen" style="width:100%;margin-bottom:18px;background:#FFE9A8;padding:14px;border-radius:16px;display:flex;align-items:center;gap:12px;text-align:left">
        <span class="serif" style="flex:1;font-size:20px;line-height:1.25">${L.g.readyBanner}</span>
        <button class="press label" onClick=${v.snd('tap', () => this.setState({ screen: 'wait', readySeen: true }, () => this.enterWait()))} style="height:48px;padding:0 14px;border:0;border-radius:999px;background:${INK};color:#F6F1E7;font-size:12px">${L.g.readyBtn}</button>
      </div>`}
      ${ordered ? html`<span style="display:flex;align-items:center;gap:8px;color:#2E7D4F;font-size:17px;font-weight:500">${check(18, 2.2)} ${L.wishOrderSent}</span>`
        : html`<span class="label" style="font-size:13px;color:${GOLD}">${L.wishSalmon}</span>`}
      <div style="margin-top:18px">${CROWN}</div>
      <h2 class="serif" style="margin:10px 0 0;font-weight:500;font-size:36px;line-height:1.18">${L.wishHead}</h2>
      <p style="margin:12px 0 0;font-size:19px;line-height:1.5;color:#3F455A;max-width:340px">${ordered ? L.wishSub : L.wishSubSalmon}</p>
      ${!ordered && html`<input id="wish-name" type="text" maxlength="40" value=${s.scoreName} onInput=${(e) => this.setState({ scoreName: e.target.value })} placeholder=${L.wishNamePh} aria-label=${L.wishNamePh} autocomplete="name" style="margin-top:22px;width:100%;height:58px;border:0;border-bottom:1px solid ${INK};background:transparent;padding:0 2px;font-family:inherit;font-size:21px;color:${INK};border-radius:0" />`}
      <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:24px">
        ${L.wishChips.map((w) => { const on = s.wish === w; return html`<button class="press" onClick=${v.snd('tick', () => this.setState({ wish: w, error: '' }))} aria-pressed=${on} style="min-height:48px;padding:8px 16px;border:1px solid ${INK};border-radius:999px;background:${on ? INK : 'transparent'};color:${on ? '#F6F1E7' : INK};font-size:17px">${w}</button>`; })}
      </div>
      <textarea id="wish-text" maxlength="280" value=${s.wish} onInput=${(e) => this.setState({ wish: e.target.value, error: '' })} placeholder=${L.wishPh} rows="3" aria-label=${L.wishTitle} style="margin-top:20px;border:1px solid rgba(27,34,56,.25);border-radius:2px;background:#FFFFFF;padding:14px;font-family:inherit;font-size:19px;line-height:1.5;color:${INK};width:100%;resize:none;text-align:left"></textarea>
      ${ordered && html`<button onClick=${v.snd('tap', () => this.setState({ screen: 'wait', error: '' }, () => this.enterWait()))} style="margin-top:18px;height:48px;padding:0 12px;border:0;background:transparent;color:#5B6075;font-size:17px;text-decoration:underline;text-underline-offset:4px">${L.wishSkip}</button>`}
    </div>`;
  }

  renderRate(v) {
    const { L, s } = v;
    return html`<div class="screen" style="display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:18px">
      <h2 class="serif" style="margin:0;font-weight:500;font-size:40px;line-height:1.15">${L.rateTitle}</h2>
      <span style="font-size:19px;line-height:1.45;color:#5B6075;font-style:italic;margin-top:10px">${L.rateSub}</span>
      <div role="group" aria-label=${L.rateTitle} style="display:flex;gap:4px;margin-top:30px">
        ${[1, 2, 3, 4, 5].map((n) => html`<button class="press" onClick=${() => { this.play('pop', 360 + n * 70); this.setState({ stars: n, error: '' }); }} aria-pressed=${n <= s.stars} aria-label=${L.starAria(n)} style="width:60px;height:60px;border:0;background:transparent;padding:0;display:flex;align-items:center;justify-content:center">
          <svg class=${'star ' + (n <= s.stars ? 'star-on' : '')} width="46" height="46" viewBox="0 0 24 24" aria-hidden="true"><path d=${STAR_PATH} fill=${n <= s.stars ? '#D9B25A' : 'transparent'} stroke=${INK} stroke-width="1.1" stroke-linejoin="round"></path></svg>
        </button>`)}
      </div>
      <span class="serif" style="font-size:24px;font-style:italic;color:${GOLD};margin-top:10px;min-height:34px">${s.stars ? L.starWords[s.stars - 1] : ''}</span>
      <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:22px">
        ${L.rateChips.map((label, i) => { const on = !!s.tags[i]; return html`<button class="press" onClick=${v.snd('tick', () => this.setState({ tags: { ...s.tags, [i]: !on } }))} aria-pressed=${on} style="min-height:48px;padding:8px 16px;border:1px solid ${INK};border-radius:999px;background:${on ? INK : 'transparent'};color:${on ? '#F6F1E7' : INK};font-size:17px">${label}</button>`; })}
      </div>
      <textarea maxlength="500" value=${s.comment} onInput=${(e) => this.setState({ comment: e.target.value })} placeholder=${L.commentPh} rows="2" aria-label=${L.commentPh} style="margin-top:26px;border:0;border-bottom:1px solid ${INK};border-radius:0;background:transparent;padding:8px 2px;font-family:inherit;font-size:19px;line-height:1.5;color:${INK};width:100%;resize:none;text-align:left"></textarea>
    </div>`;
  }

  renderThanks(v) {
    const { L, s } = v;
    return html`<div class="screen" style="display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:70px">
      ${CROWN}
      <h2 class="serif" style="margin:16px 0 0;font-weight:500;font-size:42px;line-height:1.15">${L.thanksT(v.who)}</h2>
      <div style="display:flex;gap:4px;margin-top:18px" aria-hidden="true">
        ${[1, 2, 3, 4, 5].map((n) => html`<svg width="26" height="26" viewBox="0 0 24 24"><path d=${STAR_PATH} fill=${n <= s.stars ? '#D9B25A' : 'transparent'} stroke=${INK} stroke-width="1.1" stroke-linejoin="round"></path></svg>`)}
      </div>
      <p style="margin:18px 0 0;font-size:20px;line-height:1.5;color:#3F455A;max-width:300px">${L.thanksSub}</p>
      <button class="press" onClick=${() => this.openGame()} style="margin-top:30px;min-height:56px;padding:0 24px;border:1px solid ${INK};border-radius:2px;background:transparent;color:${INK};font-size:18px">${L.g.playCta}</button>
    </div>`;
  }

  miniTile(t, sp, size) {
    return html`<span style="position:relative;display:inline-block;width:${size}px;height:${size}px;flex:none" aria-hidden="true"><span class=${'mt-in mt-' + t + (sp ? ' sp-' + sp : '')} style="inset:2px"><img src=${'img/t-' + t + '.webp'} alt="" /></span></span>`;
  }
  renderGame(v) {
    const { L, s } = v; const G = s.game;
    if (!G) return null;
    const S = Math.floor(Math.min(this.width - 24, 460) / M.N);
    const W = S * M.N;
    const hint = new Set(G.hint || []);
    const bad = new Set(G.bad || []);
    const low = G.moves <= 5;
    const pos = (i) => { const [r, c] = M.rc(i); return `transform:translate(${c * S}px,${r * S}px)`; };
    const tiles = G.board.map((t, i) => {
      if (!t) return null;
      const f = G.fall[t.id];
      const [, c] = M.rc(i);
      const cls = 'mt-in mt-' + t.t + (G.sel === i ? ' sel' : '') + (hint.has(i) ? ' hint' : '') + (bad.has(i) ? ' bad' : '') + (t.sp ? ' sp-' + t.sp : '');
      return html`<div key=${t.id} class="mt" style="width:${S}px;height:${S}px;${pos(i)}">
        <div class=${f ? 'mt-b mfall' : 'mt-b'} style=${f ? `--fy:${-f * S}px;animation-delay:${(c * 0.018).toFixed(3)}s` : ''}>
          <div class=${cls}><img src=${'img/t-' + t.t + '.webp'} alt="" draggable="false" /></div>
        </div>
      </div>`;
    });
    const pops = G.pops.map((p) => html`<div key=${'p' + p.id} class="mt mpop" style="width:${S}px;height:${S}px;${pos(p.i)}" aria-hidden="true">
      <div class=${'mt-in mt-' + p.t}><img src=${'img/t-' + p.t + '.webp'} alt="" /></div>
      <span style="position:absolute;left:50%;top:50%;--pc:${TILE_COL[p.t][0]}">${[0, 1, 2, 3, 4, 5].map((k) => html`<span class="spark mspk" style="transform:rotate(${k * 60 + 20}deg)"><span></span></span>`)}</span>
    </div>`);
    const fx = G.fx.map((e, k) => e.kind === 'line'
      ? html`<div key=${'x' + G.fxN + '-' + k} class=${'mline mline-' + e.dir} style=${e.dir === 'h' ? `top:${e.at * S}px;height:${S}px` : `left:${e.at * S}px;width:${S}px`} aria-hidden="true"></div>`
      : html`<div key=${'g' + G.fxN + '-' + k} class="mgold" aria-hidden="true"></div>`);
    const floats = G.floats.map((f) => html`<span key=${f.k} class="mfloat" style="left:${f.c * S + S / 2}px;top:${f.r * S + S / 2}px" aria-hidden="true">${f.text}</span>`);
    const readyBanner = s.orderId && s.status === 2 && !s.readySeen;
    const pill = 'display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:18px;padding:6px 14px;min-width:92px';
    return html`<div class="screen" style="display:flex;flex-direction:column;gap:14px;padding-top:6px">
      ${s.notice && this.noticeBox(v)}
      ${readyBanner && html`<div class="screen" style="background:#FFE9A8;color:${INK};padding:14px;border-radius:16px;display:flex;align-items:center;gap:12px;box-shadow:0 10px 30px rgba(27,34,56,.25)">
          <span class="serif" style="flex:1;font-size:20px;line-height:1.25">${L.g.readyBanner}</span>
          <button class="press label" onClick=${v.snd('tap', () => this.setState({ screen: 'wait', readySeen: true }))} style="height:48px;padding:0 14px;border:0;border-radius:999px;background:${INK};color:#F6F1E7;font-size:12px">${L.g.readyBtn}</button>
        </div>`}
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:2px">
        <span class="serif" style="font-size:34px;font-style:italic;line-height:1.05">${L.g.title}</span>
        <span class="label" style="font-size:12px;color:${GOLD}">${L.g.best} · ${this.best.toLocaleString()}</span>
      </div>
      <div style="display:flex;justify-content:center;gap:10px">
        <div class=${low && G.phase === 'play' ? 'pulse-soft' : ''} style="${pill};background:${low ? '#F9D6DF' : '#FFFFFF'};box-shadow:0 0 0 1px rgba(27,34,56,.12)" role="status" aria-label=${L.g.movesAria(G.moves)}>
          <span class="serif" style="font-size:32px;line-height:1">${G.moves}</span>
          <span class="label" style="font-size:11px;color:#5B6075">${L.g.moves}</span>
        </div>
        <div style="${pill};background:${INK};color:#F6F1E7;min-width:130px" aria-live="polite">
          <span class="serif" style="font-size:32px;line-height:1">${G.score.toLocaleString()}</span>
          <span class="label" style="font-size:11px;color:#E8D49A">${L.g.score}</span>
        </div>
      </div>
      <div style="position:relative;margin:0 -10px">
        <div ref=${(el) => { this.boardEl = el; }} class="mboard" role="application" aria-label=${L.g.title}
          onPointerDown=${(e) => this.onBoardDown(e)} onPointerMove=${(e) => this.onBoardMove(e)} onPointerUp=${() => this.onBoardUp()} onPointerCancel=${() => { this.gp = null; }}
          style="width:${W}px;height:${W}px;background-size:${S * 2}px ${S * 2}px">
          ${tiles}${pops}${fx}${floats}
          ${G.wordN > 0 && G.word && html`<span key=${'w' + G.wordN} class="mword" aria-hidden="true">${G.word}</span>`}
          ${G.phase === 'intro' && html`<div class="screen" style="position:absolute;inset:0;z-index:8;border-radius:18px;background:rgba(255,251,242,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:18px;text-align:center">
            <span style="font-size:19px;line-height:1.45;max-width:300px">${L.g.intro}</span>
            <div style="display:flex;flex-direction:column;gap:8px;text-align:left;width:100%;max-width:300px">
              <div style="display:flex;align-items:center;gap:10px">${this.miniTile('cheese', null, 34)}${this.miniTile('cheese', null, 34)}${this.miniTile('cheese', null, 34)}<span style="font-size:16px;line-height:1.3">${L.g.leg3}</span></div>
              <div style="display:flex;align-items:center;gap:10px">${this.miniTile('avocado', 'h', 40)}<span style="font-size:16px;line-height:1.3">${L.g.leg4}</span></div>
              <div style="display:flex;align-items:center;gap:10px">${this.miniTile('gold', 'gold', 40)}<span style="font-size:16px;line-height:1.3">${L.g.leg5}</span></div>
            </div>
            <button class="press label" onClick=${() => this.beginPlay()} style="margin-top:6px;height:60px;padding:0 34px;border:0;border-radius:999px;background:${INK};color:#F6F1E7;font-size:15px">${L.g.start}</button>
          </div>`}
          ${G.phase === 'over' && html`<div class="screen" style="position:absolute;inset:0;z-index:8;border-radius:18px;background:rgba(255,251,242,.96);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:16px;overflow-y:auto">
            ${G.newBest && html`<span class="label" style="font-size:12px;color:${INK};background:#FFE9A8;padding:6px 12px;border-radius:999px">${L.g.newBest}</span>`}
            <span class="serif" style="font-size:28px;font-style:italic">${L.g.over}</span>
            <span class="serif" style="font-size:64px;line-height:1;color:${GOLD}">${G.score.toLocaleString()}</span>
            <span style="font-size:17px;color:#4A5570">${L.g.overSub(G.score)}</span>
            ${G.score > 0 && (s.scoreSent ? html`<span style="font-size:17px;color:#2E7D4F;display:flex;align-items:center;gap:8px">${check(18, 2.2)} ${L.g.onBoard}</span>`
              : html`<div style="width:100%;display:flex;gap:8px;margin-top:2px">
                <input type="text" maxlength="40" value=${s.scoreName} onInput=${(e) => this.setState({ scoreName: e.target.value })} placeholder=${L.g.namePh} aria-label=${L.g.namePh} style="flex:1;min-width:0;height:50px;border:1px solid rgba(27,34,56,.3);border-radius:12px;background:#FFFFFF;color:${INK};padding:0 12px;font-size:18px;font-family:inherit" />
                <button class="press label" onClick=${() => { this.play('tap'); this.submitScore(); }} disabled=${!s.scoreName.trim() || s.scoreBusy} style="height:50px;padding:0 12px;border:0;border-radius:12px;background:${INK};color:#F6F1E7;font-size:12px">${L.g.submit}</button>
              </div>`)}
            <button class="press label" onClick=${v.snd('tap', () => this.setState({ game: { ...this.newGame(), phase: 'play' }, scoreSent: false }, () => this.armHint()))} style="margin-top:4px;width:100%;height:56px;border:0;border-radius:999px;background:${INK};color:#F6F1E7;font-size:15px">${L.g.again}</button>
            <div style="width:100%;display:flex;gap:8px">
              ${G.score > 0 && html`<button class="press" onClick=${() => this.shareCard()} style="flex:1;height:48px;border:1px solid rgba(27,34,56,.3);border-radius:999px;background:transparent;color:${INK};font-size:16px">${L.g.share}</button>`}
              <button class="press" onClick=${v.back} style="flex:1;height:48px;border:1px solid rgba(27,34,56,.3);border-radius:999px;background:transparent;color:${INK};font-size:16px">${L.back}</button>
            </div>
          </div>`}
        </div>
      </div>
      ${G.phase === 'play' && html`<span style="text-align:center;font-size:16px;color:#5B6075;font-style:italic">${L.g.howTo}</span>`}
    </div>`;
  }

  renderConfetti() {
    const n = this.state.confettiN;
    if (!n) return null;
    const COLS = ['#E8D49A', '#D9E6F1', '#EFD3D7', '#F6F1E7', '#FFE9A8'];
    return html`<div key=${'c' + n} aria-hidden="true" style="position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:50">
      ${Array.from({ length: 36 }, (_, i) => html`<span class="conf" style="left:${(i * 37) % 100}%;width:${6 + (i % 3) * 3}px;height:${10 + (i % 4) * 3}px;background:${COLS[i % 5]};animation-delay:${((i * 7) % 10) / 10}s;animation-duration:${(2.4 + ((i * 13) % 10) / 6).toFixed(2)}s"></span>`)}
    </div>`;
  }

  render() {
    const v = this.vals();
    const { s, L } = v;
    const sc = s.screen;
    const showTitle = v.stepN > 0 || sc === 'review';
    const ctaBg = v.ctaDisabled ? '#D8D6D0' : (v.dark ? '#F6F1E7' : INK);
    const ctaFg = v.ctaDisabled ? '#5B6075' : (v.dark ? '#121828' : '#F6F1E7');
    return html`<div class=${'lang-' + s.lang} lang=${s.lang} style="position:relative;max-width:480px;margin:0 auto;min-height:100dvh;color:${INK}">
      ${sc === 'game' && html`<div class="fade" style="position:fixed;inset:0;background:radial-gradient(circle at 12% 18%, rgba(217,230,241,.9), rgba(217,230,241,0) 38%), radial-gradient(circle at 88% 30%, rgba(255,233,168,.75), rgba(255,233,168,0) 36%), radial-gradient(circle at 30% 92%, rgba(249,214,223,.8), rgba(249,214,223,0) 40%);pointer-events:none" aria-hidden="true"></div>`}
      ${sc === 'wait' && html`<div class="fade" style="position:fixed;inset:0;background:radial-gradient(ellipse 70% 30% at 50% 26%, rgba(241,226,179,.2) 0%, rgba(18,24,40,0) 70%);pointer-events:none" aria-hidden="true"></div>`}
      <div style="position:relative;padding:0 22px ${v.showCta ? 150 : 40}px">
        <div style="zoom:${s.big && sc !== 'game' ? 1.15 : 1}">
          ${this.renderTop(v)}
          ${sc === 'home' && this.renderHome(v)}
          ${showTitle && this.renderTitle(v)}
          ${sc === 'bread' && this.renderBread(v)}
          ${sc === 'fill' && this.renderFill(v)}
          ${sc === 'sauce' && this.renderSauce(v)}
          ${sc === 'review' && this.renderReview(v)}
          ${sc === 'wish' && this.renderWish(v)}
          ${sc === 'wait' && this.renderWait(v)}
          ${sc === 'rate' && this.renderRate(v)}
          ${sc === 'thanks' && this.renderThanks(v)}
          ${sc === 'game' && this.renderGame(v)}
        </div>
      </div>
      ${v.showCta && html`<div style="position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:480px;padding:14px 22px calc(18px + env(safe-area-inset-bottom));background:${v.dark ? '#121828' : '#F6F1E7'};border-top:1px solid ${v.chromeLine};display:flex;flex-direction:column;gap:8px;z-index:20">
        ${v.hint && html`<span role="alert" style="font-size:16px;text-align:center;color:${s.error ? '#A8355C' : '#5B6075'};font-style:italic">${v.hint}</span>`}
        <button class="press label" onClick=${v.cta} disabled=${v.ctaDisabled} style="height:62px;border:0;border-radius:2px;background:${ctaBg};color:${ctaFg};font-size:16px">${v.ctaLabel}</button>
      </div>`}
      ${this.renderConfetti()}
    </div>`;
  }
}

render(html`<${App} />`, document.getElementById('app'));
