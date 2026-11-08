// Sandwich Match: pure board logic (no DOM). Board = flat array of N*N tiles.
// Tile: { id, t: type, sp: null | 'h' | 'v' | 'x' | 'gold' }
export const N = 7;
export const TYPES = ['brisket', 'avocado', 'onion', 'cheese', 'pickle', 'toast', 'pesto'];
let uid = 1;
const rnd = (n) => Math.floor(Math.random() * n);
export const mk = (t, sp) => ({ id: uid++, t, sp: sp || null });
export const rc = (i) => [Math.floor(i / N), i % N];
export const idx = (r, c) => r * N + c;
export const adjacent = (a, b) => { const [ar, ac] = rc(a); const [br, bc] = rc(b); return Math.abs(ar - br) + Math.abs(ac - bc) === 1; };
const same = (b, i, j) => b[i] && b[j] && b[i].t !== 'gold' && b[i].t === b[j].t;

export function newBoard() {
  for (let tries = 0; tries < 50; tries++) {
    const b = new Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const [r, c] = rc(i);
      let t;
      do { t = TYPES[rnd(TYPES.length)]; }
      while ((c >= 2 && b[i - 1].t === t && b[i - 2].t === t) || (r >= 2 && b[i - N].t === t && b[i - 2 * N].t === t));
      b[i] = mk(t);
    }
    if (findHint(b)) return b;
  }
  return shuffle(newBoardRaw());
}
function newBoardRaw() { return Array.from({ length: N * N }, () => mk(TYPES[rnd(TYPES.length)])); }

export function swapped(b, a, c) { const nb = b.slice(); const t = nb[a]; nb[a] = nb[c]; nb[c] = t; return nb; }

// All horizontal / vertical runs of 3+
export function runs(b) {
  const out = [];
  for (let r = 0; r < N; r++) {
    let c = 0;
    while (c < N) {
      let e = c + 1;
      while (e < N && same(b, idx(r, c), idx(r, e))) e++;
      if (e - c >= 3) out.push({ dir: 'h', cells: Array.from({ length: e - c }, (_, k) => idx(r, c + k)), t: b[idx(r, c)].t });
      c = e;
    }
  }
  for (let c = 0; c < N; c++) {
    let r = 0;
    while (r < N) {
      let e = r + 1;
      while (e < N && same(b, idx(r, c), idx(e, c))) e++;
      if (e - r >= 3) out.push({ dir: 'v', cells: Array.from({ length: e - r }, (_, k) => idx(r + k, c)), t: b[idx(r, c)].t });
      r = e;
    }
  }
  return out;
}

function groupRuns(rs) {
  const groups = [];
  rs.forEach((run) => {
    const hit = groups.filter((g) => g.t === run.t && run.cells.some((x) => g.set.has(x)));
    const g = { t: run.t, set: new Set(run.cells), runs: [run] };
    hit.forEach((h) => { h.set.forEach((x) => g.set.add(x)); g.runs.push(...h.runs); groups.splice(groups.indexOf(h), 1); });
    groups.push(g);
  });
  return groups;
}

export function isValidSwap(b, a, c) {
  if (!adjacent(a, c) || !b[a] || !b[c]) return false;
  if (b[a].t === 'gold' || b[c].t === 'gold') return true;
  if (b[a].sp && b[c].sp) return true;
  return runs(swapped(b, a, c)).length > 0;
}

export function findHint(b) {
  for (let i = 0; i < N * N; i++) {
    const [r, c] = rc(i);
    if (c < N - 1 && isValidSwap(b, i, i + 1)) return [i, i + 1];
    if (r < N - 1 && isValidSwap(b, i, i + N)) return [i, i + N];
  }
  return null;
}

// Expand a clear set with every special tile inside it (chain reactions).
function expand(b, clear, effects, protect) {
  const queue = [...clear];
  const done = new Set();
  const counts = () => { const m = {}; b.forEach((x, i) => { if (x && x.t !== 'gold' && !clear.has(i)) m[x.t] = (m[x.t] || 0) + 1; }); return m; };
  while (queue.length) {
    const i = queue.shift();
    if (done.has(i)) continue; done.add(i);
    const tile = b[i]; if (!tile || !tile.sp) continue;
    const [r, c] = rc(i);
    const add = (j) => { if (b[j] && !clear.has(j) && !(protect && protect.has(j))) { clear.add(j); queue.push(j); } };
    if (tile.sp === 'h' || tile.sp === 'x') { effects.push({ kind: 'line', dir: 'h', at: r }); for (let k = 0; k < N; k++) add(idx(r, k)); }
    if (tile.sp === 'v' || tile.sp === 'x') { effects.push({ kind: 'line', dir: 'v', at: c }); for (let k = 0; k < N; k++) add(idx(k, c)); }
    if (tile.sp === 'gold') {
      const m = counts(); const top = Object.keys(m).sort((x, y) => m[y] - m[x])[0];
      if (top) { effects.push({ kind: 'gold', t: top }); b.forEach((x, j) => { if (x && x.t === top) add(j); }); }
    }
  }
}

// One resolution step. `swap` = [from, to] for the player's move (only on the first step).
// Returns null when nothing clears.
export function resolve(b, swap, cascade) {
  const effects = [];
  const clear = new Set();
  const create = [];
  const pops = [];
  let bonus = 0;
  const lvl = Math.max(1, cascade || 1);

  if (swap) {
    const [a, c] = swap; const A = b[a]; const C = b[c];
    if (A && C && (A.t === 'gold' || C.t === 'gold')) {
      clear.add(a); clear.add(c);
      if (A.t === 'gold' && C.t === 'gold') { b.forEach((x, j) => x && clear.add(j)); effects.push({ kind: 'gold', t: 'all' }); bonus += 500; }
      else {
        const other = A.t === 'gold' ? C : A;
        effects.push({ kind: 'gold', t: other.t });
        b.forEach((x, j) => { if (x && x.t === other.t) clear.add(j); });
        bonus += 200;
      }
      expand(b, clear, effects);
      return finish();
    }
    if (A && C && A.sp && C.sp && runs(b).length === 0) {
      clear.add(a); clear.add(c); bonus += 150;
      expand(b, clear, effects);
      return finish();
    }
  }

  const rs = runs(b);
  if (!rs.length) return null;
  const groups = groupRuns(rs);
  groups.forEach((g) => {
    const cells = [...g.set];
    const longest = Math.max(...g.runs.map((x) => x.cells.length));
    const hasH = g.runs.some((x) => x.dir === 'h'); const hasV = g.runs.some((x) => x.dir === 'v');
    let sp = null;
    if (longest >= 5) sp = 'gold';
    else if (hasH && hasV) sp = 'x';
    else if (longest === 4) sp = hasH ? 'h' : 'v';
    let at = cells[Math.floor(cells.length / 2)];
    if (swap && cells.includes(swap[1])) at = swap[1]; else if (swap && cells.includes(swap[0])) at = swap[0];
    if (hasH && hasV) { const counts = {}; g.runs.forEach((x) => x.cells.forEach((y) => { counts[y] = (counts[y] || 0) + 1; })); const cross = Object.keys(counts).find((k) => counts[k] > 1); if (cross !== undefined && !(swap && cells.includes(swap[1]))) at = Number(cross); }
    cells.forEach((i) => clear.add(i));
    bonus += cells.length >= 5 ? 100 : cells.length === 4 ? 60 : 30;
    if (sp) create.push({ at, tile: mk(sp === 'gold' ? 'gold' : g.t, sp) });
    const [r0, c0] = rc(at);
    pops.push({ r: r0, c: c0, n: cells.length, t: g.t, sp });
  });
  const protect = new Set(create.map((x) => x.at));
  // A newly created special keeps its cell; the tile that was there still counts as cleared.
  expand(b, clear, effects, null);
  return finish(protect);

  function finish(protect) {
    const nb = b.slice();
    const cleared = [];
    clear.forEach((i) => { if (nb[i]) { cleared.push({ i, tile: nb[i] }); nb[i] = null; } });
    create.forEach(({ at, tile }) => { nb[at] = tile; });
    const points = (cleared.length * 10 + bonus) * lvl;
    if (!pops.length && cleared.length) { const mid = cleared[Math.floor(cleared.length / 2)].i; const [r, c] = rc(mid); pops.push({ r, c, n: cleared.length, t: null, sp: null }); }
    return { board: nb, cleared, created: create.map((x) => x.tile), effects, points, pops, protect };
  }
}

// Drop tiles down and refill. Returns new board and fall distances for new tiles (id -> rows above).
export function gravity(b) {
  const nb = new Array(N * N).fill(null);
  const fall = {};
  for (let c = 0; c < N; c++) {
    let w = N - 1;
    for (let r = N - 1; r >= 0; r--) { const t = b[idx(r, c)]; if (t) { nb[idx(w, c)] = t; w--; } }
    const missing = w + 1;
    for (let r = w; r >= 0; r--) { const t = mk(TYPES[rnd(TYPES.length)]); nb[idx(r, c)] = t; fall[t.id] = missing; }
  }
  return { board: nb, fall };
}

export function shuffle(b) {
  for (let tries = 0; tries < 80; tries++) {
    const tiles = b.filter(Boolean);
    for (let i = tiles.length - 1; i > 0; i--) { const j = rnd(i + 1); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
    const nb = tiles.slice(0, N * N);
    while (nb.length < N * N) nb.push(mk(TYPES[rnd(TYPES.length)]));
    if (runs(nb).length === 0 && findHint(nb)) return nb;
  }
  return newBoard();
}
