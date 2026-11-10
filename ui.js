/* Strata — interface. Everything here talks to the engine through its public API. */
(function () {
'use strict';
const A = window.ALife, C = A.C, G = A.G, GENES = A.GENES, ROLES = A.ROLES;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROLE_VARS = ['--photo', '--herb', '--carn', '--omni', '--mixo'];

const state = { running: true, speed: 'max', tool: 'inspect', layer: 'terrain', dock: 'phylo', side: 'env',
  selOrg: null, selSp: null, follow: false, seed: 7, preset: 'continents', start: 'ecosystem', wildfire: false, phColor: 'pigment' };
const params = {};
let world, T = {}, frameN = 0, pointerDown = false, terrDirty = true, dockDirty = true, sideDirty = true;

// ---------- theme ----------
function readTheme() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  T = { fg: v('--fg'), fg2: v('--fg-2'), fg3: v('--fg-3'), line: v('--line'), surface: v('--surface'), surface2: v('--surface-2'),
    accent: v('--accent'), roles: ROLE_VARS.map(v), ui: v('--ui'), serif: v('--serif'), mono: v('--mono') };
}
function fitCanvas(cv) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
const colOf = g => 'rgb(' + ((30 + g[0] * 215) | 0) + ',' + ((30 + g[1] * 215) | 0) + ',' + ((30 + g[2] * 215) | 0) + ')';
const years = t => (t / C.YEAR);
const real = (key, norm) => A.toReal(GENES[G[key]], norm);
function fmt(v) { const a = Math.abs(v); return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2); }

// ---------- world lifecycle ----------
function wildfire(w) { // example extension: a disturbance system added through world.addSystem
  if (!state.wildfire || w.tick % 300) return;
  for (let n = 0; n < 3; n++) {
    const x = w.rand() * w.W, y = w.rand() * w.H;
    if (w.elevAt(x, y) < w.P.seaLevel) continue;
    const c = ((y / C.RES) | 0) * w.rw + ((x / C.RES) | 0);
    if (w.cellGround[c] > 0.45) continue; // only closed canopy carries fire
    const r = 30 + w.rand() * 50; let k = 0;
    for (const o of w.orgs) if (o.alive && !o.water && !o.mobile && Math.hypot(o.x - x, o.y - y) < r && w.rand() < 0.5 + 0.5 * o.height - 0.6 * o.armor) { w.kill(o, 'hazard'); k++; }
    if (k > 20) w.log('user', 'Wildfire burned ' + k + ' plants');
  }
}
function newWorld() {
  world = new A.World({ seed: state.seed, preset: state.preset, start: state.start, params: Object.assign({}, params) });
  world.addSystem('wildfire', wildfire, 'metabolism');
  Object.assign(params, world.P);
  state.selOrg = state.selSp = null; ph.auto = true; ph.y0 = 0; view.fit = true;
  terrDirty = dockDirty = sideDirty = true;
  window.strata = world; // open the console and poke at it
}

// ---------- world view ----------
const view = { s: 1, ox: 0, oy: 0, fit: true };
const terr = document.createElement('canvas');
const RAMP = {
  temp: [[-20, [38, 56, 150]], [2, [110, 168, 205]], [16, [226, 226, 198]], [30, [232, 150, 66]], [46, [160, 34, 40]]],
  soil: [[0, [18, 20, 24]], [0.5, [176, 132, 52]], [1.2, [244, 232, 170]]],
  light: [[0, [10, 12, 22]], [0.5, [120, 110, 70]], [1.3, [255, 240, 170]]],
};
function ramp(r, v) {
  if (v <= r[0][0]) return r[0][1];
  for (let i = 1; i < r.length; i++) if (v <= r[i][0]) {
    const a = r[i - 1], b = r[i], t = (v - a[0]) / (b[0] - a[0]);
    return [a[1][0] + (b[1][0] - a[1][0]) * t, a[1][1] + (b[1][1] - a[1][1]) * t, a[1][2] + (b[1][2] - a[1][2]) * t];
  }
  return r[r.length - 1][1];
}
function renderTerrain() {
  const w = world, gw = w.gw, gh = w.gh, sea = w.P.seaLevel, layer = state.layer;
  if (terr.width !== gw) { terr.width = gw; terr.height = gh; }
  const ctx = terr.getContext('2d'), img = ctx.createImageData(gw, gh), d = img.data, k = C.RES / C.FINE;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const i = gy * gw + gx, e = w.elev[i], rc = ((gy / k) | 0) * w.rw + ((gx / k) | 0), water = e < sea;
    let r, g, b;
    if (layer === 'terrain') {
      const temp = w.tempAt(gx * C.FINE, gy * C.FINE);
      if (water) {
        const t = clamp((sea - e) * 4.5, 0, 1);
        r = 46 - 36 * t; g = 124 - 92 * t; b = 146 - 84 * t;
        if (temp < -4) { const s = clamp((-4 - temp) / 8, 0, 0.8); r += (215 - r) * s; g += (228 - g) * s; b += (236 - b) * s; }
      } else {
        const h = e - sea, f = clamp(w.cap[rc] / 1.2, 0, 1), t = clamp((h - 0.2) * 4, 0, 1);
        r = 172 - 100 * f; g = 154 - 46 * f; b = 112 - 46 * f;
        r += (122 - r) * t; g += (116 - g) * t; b += (110 - b) * t;
        if (temp < -2) { const s = clamp((-2 - temp) / 7, 0, 0.9); r += (232 - r) * s; g += (236 - g) * s; b += (238 - b) * s; }
        const sh = 1 + clamp((e - w.elev[Math.max(0, i - gw - 1)]) * 7, -0.22, 0.22);
        r *= sh; g *= sh; b *= sh;
      }
    } else {
      let c;
      if (layer === 'temp') c = ramp(RAMP.temp, (gx & 1) === 0 ? (renderTerrain._t = w.tempAt(gx * C.FINE, gy * C.FINE)) : renderTerrain._t);
      else if (layer === 'soil') c = ramp(RAMP.soil, w.N[rc] / C.NMAX);
      else c = ramp(RAMP.light, w.lightAtCell(rc) * w.cellGround[rc]);
      const m = water ? 0.72 : 1; r = c[0] * m; g = c[1] * m; b = c[2] * m;
    }
    const j = i * 4; d[j] = r; d[j + 1] = g; d[j + 2] = b; d[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  terrDirty = false;
  $('legend').textContent = { terrain: 'Greener ground holds more nutrients · shadows show stature',
    temp: 'Temperature  −20 °C blue → 45 °C red', soil: 'Soil and water nutrients  dark = depleted', light: 'Light reaching the ground  dark = closed canopy' }[layer];
}

function drawBody(ctx, p, css, x, y, r, h) {
  if (!p.mobile) {
    const sh = p.height * r * 0.9;
    if (sh > 0.6) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(x + sh, y + sh, r, 0, 6.283); ctx.fill(); }
    const n = Math.round(p.lobes);
    ctx.beginPath();
    for (let k = 0; k <= n; k++) {
      const a = k / n * 6.283 + h, am = (k - 0.5) / n * 6.283 + h, px = x + Math.cos(a) * r * 0.7, py = y + Math.sin(a) * r * 0.7;
      if (k === 0) ctx.moveTo(px, py); else ctx.quadraticCurveTo(x + Math.cos(am) * r * 1.35, y + Math.sin(am) * r * 1.35, px, py);
    }
    ctx.fillStyle = css; ctx.fill();
    if (p.armor > 0.15) { ctx.lineWidth = p.armor * r * 0.35; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.stroke(); }
    ctx.fillStyle = p.toxin > 0.25 ? '#fff' : 'rgba(0,0,0,.32)';
    ctx.beginPath(); ctx.arc(x, y, r * (0.2 + 0.2 * p.toxin), 0, 6.283); ctx.fill();
    if (p.biter) { ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, r * 0.12); ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, 6.283); ctx.stroke(); }
    return;
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(h);
  ctx.fillStyle = css;
  const tl = r * (1.3 + p.speed * 1.5);
  ctx.beginPath(); ctx.moveTo(-r * 0.6, 0); ctx.lineTo(-tl, -r * 0.55); ctx.lineTo(-tl * 0.85, 0); ctx.lineTo(-tl, r * 0.55); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * 0.82, 0, 0, 6.283); ctx.fill();
  if (p.armor > 0.15) { ctx.lineWidth = p.armor * r * 0.4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.stroke(); }
  if (p.toxin > 0.25) { ctx.fillStyle = '#fff'; ctx.fillRect(-r * 0.5, -r * 0.7, r * 0.22, r * 1.4); ctx.fillRect(r * 0.05, -r * 0.78, r * 0.22, r * 1.56); }
  if (p.photoEff > 0.15) { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(-r * 0.2, 0, r * 0.35, 0, 6.283); ctx.fill(); }
  if (p.carnEff > 0.25) {
    ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, r * 0.16); ctx.beginPath();
    ctx.moveTo(r * 1.05, -r * 0.4); ctx.lineTo(r * 1.75, -r * 0.1); ctx.moveTo(r * 1.05, r * 0.4); ctx.lineTo(r * 1.75, r * 0.1); ctx.stroke();
  }
  const er = r * (0.12 + 0.2 * p.sense);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r * 0.6, -r * 0.42, er, 0, 6.283); ctx.arc(r * 0.6, r * 0.42, er, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(r * 0.66, -r * 0.42, er * 0.5, 0, 6.283); ctx.arc(r * 0.66, r * 0.42, er * 0.5, 0, 6.283); ctx.fill();
  ctx.restore();
}

function drawWorld() {
  const cv = $('world'), { ctx, w, h } = fitCanvas(cv), W = world.W, H = world.H;
  const fitS = Math.min(w / W, h / H);
  if (view.fit) { view.s = fitS; view.ox = (w - W * fitS) / 2; view.oy = (h - H * fitS) / 2; }
  if (state.follow && state.selOrg && state.selOrg.alive) { view.ox = w / 2 - state.selOrg.x * view.s; view.oy = h / 2 - state.selOrg.y * view.s; }
  const s = view.s, ox = view.ox, oy = view.oy;
  ctx.fillStyle = '#0b1820'; ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(terr, ox, oy, W * s, H * s);
  const orgs = world.orgs, detail = s >= 2.6, selSp = state.selSp;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < orgs.length; i++) {
      const o = orgs[i];
      if (!o.alive || o.mobile !== (pass === 1)) continue;
      const x = o.x * s + ox, y = o.y * s + oy;
      if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
      const css = o.css || (o.css = colOf(o.genome));
      let r = o.rad * s;
      if (detail) { drawBody(ctx, o.p, css, x, y, r, pass ? o.h : o.id); continue; }
      ctx.fillStyle = css;
      if (pass) {
        if (r < 2.2) r = 2.2;
        const c = Math.cos(o.h) * r, sn = Math.sin(o.h) * r;
        ctx.beginPath(); ctx.moveTo(x + c * 1.7, y + sn * 1.7); ctx.lineTo(x - c - sn * 0.9, y - sn + c * 0.9); ctx.lineTo(x - c + sn * 0.9, y - sn - c * 0.9); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 0.75; ctx.stroke();
      } else if (r < 1.3) ctx.fillRect(x - 1, y - 1, 2, 2);
      else { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); }
    }
  }
  if (selSp && selSp.n > 0) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.25; ctx.beginPath();
    for (let i = 0; i < orgs.length; i++) {
      const o = orgs[i]; if (!o.alive || o.sp !== selSp) continue;
      const x = o.x * s + ox, y = o.y * s + oy, r = Math.max(3.5, o.rad * s + 2.5);
      ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.283);
    }
    ctx.stroke();
  }
  const so = state.selOrg;
  if (so && so.alive) {
    const x = so.x * s + ox, y = so.y * s + oy;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, Math.max(7, so.rad * s + 5), 0, 6.283); ctx.stroke();
    if (so.mobile) { ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(x, y, so.range * s, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); }
  }
  if (hoverBrush) {
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(hoverBrush.x, hoverBrush.y, +$('brush').value * s, 0, 6.283); ctx.stroke();
  }
}

// world pointer tools
let drag = null, hoverBrush = null, lastPaint = null;
function toWorld(e) { const r = $('world').getBoundingClientRect(); return { x: (e.clientX - r.left - view.ox) / view.s, y: (e.clientY - r.top - view.oy) / view.s, cx: e.clientX - r.left, cy: e.clientY - r.top }; }
function applyTool(e, first) {
  const p = toWorld(e), b = +$('brush').value, t = state.tool;
  if (p.x < 0 || p.y < 0 || p.x > world.W || p.y > world.H) return;
  if (t === 'impact' || t === 'seed') {
    if (!first) return;
    if (t === 'impact') world.meteor(p.x, p.y, b);
    else { const sp = world.seedFounder($('founder').value, 30, p.x, p.y, b); if (sp) { state.selSp = sp; state.selOrg = null; } }
  } else {
    if (!first && lastPaint && Math.hypot(p.x - lastPaint.x, p.y - lastPaint.y) < b * 0.3) return;
    lastPaint = p;
    if (t === 'raise') world.paintTerrain(p.x, p.y, b, 0.05);
    else if (t === 'lower') world.paintTerrain(p.x, p.y, b, -0.05);
    else if (t === 'enrich') world.paintFertility(p.x, p.y, b, 1.3);
    else if (t === 'deplete') world.paintFertility(p.x, p.y, b, 0.75);
  }
  terrDirty = true; dockDirty = sideDirty = true;
}
function pick(e) {
  const p = toWorld(e); let best = null, bd = Math.max(5, 9 / view.s);
  for (const o of world.orgs) { if (!o.alive) continue; const d = Math.hypot(o.x - p.x, o.y - p.y) - o.rad * 0.5; if (d < bd) { bd = d; best = o; } }
  state.selOrg = best; state.selSp = best ? best.sp : null; state.follow = false;
  if (best) setTab('sidetabs', 'inspect');
  sideDirty = dockDirty = true;
}
function zoomAt(cx, cy, f) {
  const cv = $('world'), fitS = Math.min(cv.clientWidth / world.W, cv.clientHeight / world.H);
  const ns = clamp(view.s * f, fitS * 0.9, 16);
  if (ns <= fitS) { view.fit = true; return; }
  view.fit = false; view.ox = cx - (cx - view.ox) * ns / view.s; view.oy = cy - (cy - view.oy) * ns / view.s; view.s = ns;
}
function bindWorld() {
  const cv = $('world');
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, moved: false };
    if (state.tool !== 'inspect') applyTool(e, true);
  });
  cv.addEventListener('pointermove', e => {
    const p = toWorld(e);
    hoverBrush = state.tool === 'inspect' ? null : { x: p.cx, y: p.cy };
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
    if (state.tool === 'inspect') { if (drag.moved && !view.fit) { view.ox = drag.ox + e.clientX - drag.x; view.oy = drag.oy + e.clientY - drag.y; state.follow = false; } }
    else applyTool(e, false);
  });
  cv.addEventListener('pointerup', e => { if (drag && state.tool === 'inspect' && !drag.moved) pick(e); drag = null; lastPaint = null; });
  cv.addEventListener('pointerleave', () => { hoverBrush = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); const p = toWorld(e); zoomAt(p.cx, p.cy, Math.exp(-e.deltaY * 0.0016)); }, { passive: false });
  $('zin').onclick = () => zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, 1.6);
  $('zout').onclick = () => zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, 1 / 1.6);
  $('zfit').onclick = () => { view.fit = true; state.follow = false; };
}

// ---------- tooltip ----------
function tip(html, x, y) {
  const t = $('tip');
  if (!html) { t.hidden = true; return; }
  t.innerHTML = html; t.hidden = false;
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = clamp(x + 14, 4, window.innerWidth - w - 4) + 'px';
  t.style.top = clamp(y - h - 10, 4, window.innerHeight - h - 4) + 'px';
}
function spTip(s) {
  return '<em>' + esc(s.name) + '</em><small>' + ROLES[s.role || 0] + ' · ' + (s.n > 0 ? s.n + ' alive' : s.bank > 0 ? 'dormant, ' + s.bank + ' resting' : 'extinct, peak ' + s.peak) +
    ' · arose year ' + years(s.born).toFixed(1) + '</small>' + (s.tags.length ? '<small>' + esc(s.tags.join(', ')) + '</small>' : '');
}

// ---------- phylogeny ----------
const ph = { t0: 0, t1: 1000, y0: 0, auto: true, rows: [], rowH: 16, total: 0, geom: null };
function phyloLayout() {
  const min = +$('ph-min').value, extant = $('ph-extant').checked, all = world.species;
  const live = new Set();
  for (const s of all.values()) if (s.n > 0 || s.bank > 0) { let p = s; while (p && !live.has(p.id)) { live.add(p.id); p = all.get(p.parent); } }
  const vis = new Map();
  for (const s of all.values()) if ((s.peak >= min || !s.parent || s === state.selSp) && (!extant || live.has(s.id))) vis.set(s.id, { sp: s, kids: [], par: null, row: 0 });
  const roots = [];
  for (const n of vis.values()) {
    let p = n.sp.parent;
    while (p && !vis.has(p)) { const ps = all.get(p); p = ps ? ps.parent : 0; }
    if (p) { n.par = vis.get(p); n.par.kids.push(n); } else roots.push(n);
  }
  const rows = [], stack = roots.sort((a, b) => b.sp.born - a.sp.born).slice();
  while (stack.length) { // preorder without recursion; later branches sit nearest their parent
    const n = stack.pop(); n.row = rows.length; rows.push(n);
    n.kids.sort((a, b) => a.sp.born - b.sp.born);
    for (const k of n.kids) stack.push(k);
  }
  ph.rows = rows;
}
function niceStep(span, target) {
  const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
function timeAxis(ctx, x0, x1, t0, t1, y, hgt) {
  const y0 = years(t0), y1 = years(t1), step = niceStep(y1 - y0, Math.max(3, (x1 - x0) / 90));
  ctx.font = '500 10px ' + T.mono; ctx.fillStyle = T.fg3; ctx.strokeStyle = T.line; ctx.lineWidth = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  for (let v = Math.ceil(y0 / step) * step; v <= y1 + 1e-9; v += step) {
    const x = Math.round(x0 + (v - y0) / (y1 - y0) * (x1 - x0)) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + hgt); ctx.stroke();
    ctx.fillText('yr ' + +v.toFixed(2), x + 4, y + 2);
  }
}
function drawPhylo(ctx, w, h) {
  phyloLayout();
  const rows = ph.rows, padL = 12, padR = w < 560 ? 96 : 190, padT = 20, padB = 8;
  if (ph.auto) { ph.t0 = 0; ph.t1 = Math.max(world.tick, 600); }
  const rowH = clamp((h - padT - padB) / Math.max(1, rows.length), 15, 28);
  ph.rowH = rowH; ph.total = rows.length * rowH;
  ph.y0 = clamp(ph.y0, 0, Math.max(0, ph.total - (h - padT - padB)));
  const X = t => padL + (t - ph.t0) / (ph.t1 - ph.t0) * (w - padL - padR), Y = r => padT + (r + 0.5) * rowH - ph.y0;
  ph.geom = { X, Y, padT, padL, padR, w };
  timeAxis(ctx, padL, w - padR, ph.t0, ph.t1, 0, h);
  const now = world.tick;
  ctx.save(); ctx.beginPath(); ctx.rect(0, padT - 4, w, h); ctx.clip();
  ctx.strokeStyle = T.fg3; ctx.lineWidth = 1;
  ctx.beginPath();
  for (const n of rows) if (n.par) { const x = Math.round(X(n.sp.born)) + 0.5; ctx.moveTo(x, Y(n.par.row)); ctx.lineTo(x, Y(n.row)); }
  ctx.stroke();
  for (const n of rows) {
    const s = n.sp, y = Y(n.row);
    if (y < -rowH || y > h + rowH) continue;
    const end = s.n > 0 ? now : (s.died >= 0 ? s.died : now), xb = X(s.born), xe = X(end), hist = s.hist;
    const hw = c => Math.min(rowH * 0.46, 0.8 + Math.sqrt(c) * 0.34);
    ctx.fillStyle = state.phColor === 'role' ? T.roles[s.role || 0] : colOf(s.col);
    ctx.globalAlpha = s.n > 0 ? 1 : 0.5;
    const step = Math.max(2, 2 * Math.ceil(hist.length / 2 / 140));
    ctx.beginPath(); ctx.moveTo(xb, y - 0.8);
    for (let i = 0; i < hist.length; i += step) ctx.lineTo(X(hist[i]), y - hw(hist[i + 1]));
    const last = hist.length ? hw(hist[hist.length - 1]) : 0.8;
    ctx.lineTo(xe, y - (s.n > 0 ? last : 0.8)); ctx.lineTo(xe, y + (s.n > 0 ? last : 0.8));
    for (let i = hist.length - 2 - ((hist.length / 2 - 1) % (step / 2)) * 2; i >= 0; i -= step) ctx.lineTo(X(hist[i]), y + hw(hist[i + 1]));
    ctx.lineTo(xb, y + 0.8); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    if (s === state.selSp) { ctx.strokeStyle = T.fg; ctx.lineWidth = 1.5; ctx.stroke(); ctx.strokeStyle = T.fg3; ctx.lineWidth = 1; }
    if (s.n > 0 || s.bank > 0 || s === state.selSp) {
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.font = 'italic 400 15px ' + T.serif; ctx.fillStyle = T.fg;
      const lx = Math.min(xe + 8, w - padR + 8), name = w < 560 ? s.name.split(' ')[0] : s.name;
      ctx.fillText(name, lx, y);
      const tw = ctx.measureText(name).width;
      ctx.font = '500 10px ' + T.mono; ctx.fillStyle = T.fg3;
      ctx.fillText(s.n > 0 ? String(s.n) : s.bank > 0 ? (w < 560 ? 'zz' : 'resting') : '†', lx + tw + 6, y + 1);
    }
  }
  ctx.restore();
  if (!rows.length) { ctx.fillStyle = T.fg3; ctx.font = '500 12px ' + T.ui; ctx.fillText('No lineages yet', 16, 40); }
}
function phyloHit(mx, my) {
  const g = ph.geom; if (!g) return null;
  const row = Math.floor((my - g.padT + ph.y0) / ph.rowH), n = ph.rows[row];
  if (!n) return null;
  const s = n.sp, xb = g.X(s.born), xe = s.n > 0 ? g.w : g.X(s.died >= 0 ? s.died : world.tick);
  return mx >= xb - 4 && mx <= xe + 4 ? s : null;
}

// ---------- populations ----------
let popGeom = null;
function drawPop(ctx, w, h) {
  const H = world.history, padL = 44, padR = 16, padT = 26, padB = 8;
  if (H.length < 2) { ctx.fillStyle = T.fg3; ctx.font = '500 12px ' + T.ui; ctx.fillText('Collecting census data…', 16, 30); popGeom = null; return; }
  const t0 = H[0].t, t1 = H[H.length - 1].t;
  let max = 10; for (const s of H) if (s.pop > max) max = s.pop;
  const lmax = Math.log10(max * 1.3);
  const X = t => padL + (t - t0) / (t1 - t0) * (w - padL - padR), Y = v => h - padB - (v < 1 ? 0 : Math.log10(v) / lmax) * (h - padT - padB);
  timeAxis(ctx, padL, w - padR, t0, t1, 0, h);
  ctx.font = '500 10px ' + T.mono; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = 1; v <= max * 1.3; v *= 10) {
    const y = Math.round(Y(v)) + 0.5; ctx.strokeStyle = T.line; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillStyle = T.fg3; ctx.fillText(v >= 1000 ? v / 1000 + 'k' : v, padL - 6, y);
  }
  const line = (get, col, lw) => {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.beginPath();
    for (let i = 0; i < H.length; i++) { const x = X(H[i].t), y = Y(get(H[i])); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
  };
  line(s => s.pop, T.fg3, 1);
  for (let r = 0; r < 5; r++) line(s => s.roles[r], T.roles[r], 2);
  let lx = padL + 8; ctx.textAlign = 'left'; ctx.font = '600 11px ' + T.ui;
  const lastS = H[H.length - 1];
  for (let r = 0; r < 5; r++) {
    ctx.fillStyle = T.roles[r]; ctx.fillRect(lx, padT - 5, 10, 3);
    ctx.fillStyle = T.fg; const txt = ROLES[r] + 's ' + lastS.roles[r]; ctx.fillText(txt, lx + 14, padT - 3); lx += ctx.measureText(txt).width + 30;
    if (lx > w - 120) break;
  }
  popGeom = { X, t0, t1, padL, padR, w, h };
}

// ---------- trait space ----------
let trGeom = null;
function drawTraits(ctx, w, h) {
  const gx = +$('tr-x').value, gy = +$('tr-y').value, dx = GENES[gx], dy = GENES[gy], H = world.history;
  const split = w > 620 ? Math.round(w * 0.42) : 0, padT = 26, padB = 22;
  ctx.font = '600 11px ' + T.ui; ctx.fillStyle = T.fg; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if (split && H.length > 1) { // global mean of X through time
    const t0 = H[0].t, t1 = H[H.length - 1].t; let lo = Infinity, hi = -Infinity;
    const vals = H.map(s => A.toReal(dx, s.mean[gx]));
    for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo < 1e-6) { hi += 0.5; lo -= 0.5; } const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
    const x0 = 44, x1 = split - 20, X = t => x0 + (t - t0) / (t1 - t0) * (x1 - x0), Y = v => h - padB - (v - lo) / (hi - lo) * (h - padT - padB);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, split, h); ctx.clip();
    timeAxis(ctx, x0, x1, t0, t1, padT - 8, h);
    ctx.restore();
    ctx.fillStyle = T.fg; ctx.font = '600 11px ' + T.ui; ctx.fillText('World mean · ' + dx.label, 12, 14);
    ctx.font = '500 10px ' + T.mono; ctx.fillStyle = T.fg3; ctx.textAlign = 'right';
    ctx.fillText(fmt(hi), x0 - 6, Y(hi) + 8); ctx.fillText(fmt(lo), x0 - 6, Y(lo));
    ctx.strokeStyle = T.fg; ctx.lineWidth = 2; ctx.beginPath();
    vals.forEach((v, i) => { const x = X(H[i].t), y = Y(v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = T.fg; ctx.beginPath(); ctx.arc(X(t1), Y(vals[vals.length - 1]), 3.5, 0, 6.283); ctx.fill();
    ctx.textAlign = 'right'; ctx.fillStyle = T.fg; ctx.font = '600 11px ' + T.mono; ctx.fillText(fmt(vals[vals.length - 1]), X(t1) - 8, Y(vals[vals.length - 1]) - 8);
  }
  const x0 = split + 48, x1 = w - 18, y0 = padT, y1 = h - padB - 10;
  const X = v => x0 + v * (x1 - x0), Y = v => y1 - v * (y1 - y0);
  ctx.strokeStyle = T.line; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
  ctx.font = '600 11px ' + T.ui; ctx.fillStyle = T.fg; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('Living species · ' + dy.label + ' against ' + dx.label, split + 12, 14);
  ctx.font = '500 10px ' + T.mono; ctx.fillStyle = T.fg3;
  ctx.textAlign = 'left'; ctx.fillText(fmt(dx.min), x0, h - 8); ctx.textAlign = 'right'; ctx.fillText(fmt(dx.max) + '  ' + dx.label, x1, h - 8);
  ctx.fillText(fmt(dy.max), x0 - 6, y0 + 8); ctx.fillText(fmt(dy.min), x0 - 6, y1);
  const pts = [];
  for (const s of world.species.values()) if (s.n >= 5) pts.push({ s, x: X(s.mean[gx]), y: Y(s.mean[gy]), r: 2.5 + Math.sqrt(s.n) * 0.55 });
  pts.sort((a, b) => b.r - a.r);
  for (const p of pts) {
    ctx.fillStyle = colOf(p.s.col); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = p.s === state.selSp ? T.fg : T.roles[p.s.role || 0]; ctx.lineWidth = p.s === state.selSp ? 3 : 1.5; ctx.stroke();
  }
  trGeom = pts;
}

function drawDock() {
  readTheme();
  dockDirty = false;
  if (state.dock === 'log') { renderLog(); return; }
  const { ctx, w, h } = fitCanvas($('dockcv'));
  ctx.clearRect(0, 0, w, h);
  if (state.dock === 'phylo') drawPhylo(ctx, w, h);
  else if (state.dock === 'pop') drawPop(ctx, w, h);
  else drawTraits(ctx, w, h);
}
let logSig = '';
function renderLog() {
  const ev = world.events, sig = ev.length + ':' + (ev.length ? ev[ev.length - 1].t : 0) + ':' + world.seed;
  if (sig === logSig) return; logSig = sig;
  $('log').innerHTML = ev.slice(-150).reverse().map(e =>
    '<li' + (e.sp && world.species.has(e.sp) ? ' data-sp="' + e.sp + '"' : '') + '><time>yr ' + years(e.t).toFixed(2) + '</time><span>' + esc(e.text) + '</span></li>').join('') ||
    '<li><time></time><span class="muted">Nothing has happened yet.</span></li>';
}
function bindDock() {
  const cv = $('dockcv'); let d = null;
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const hit = p => {
    if (state.dock === 'phylo') return phyloHit(p.x, p.y);
    if (state.dock === 'traits' && trGeom) { for (let i = trGeom.length - 1; i >= 0; i--) { const q = trGeom[i]; if (Math.hypot(q.x - p.x, q.y - p.y) < q.r + 3) return q.s; } }
    return null;
  };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); const p = pos(e); d = { x: p.x, y: p.y, t0: ph.t0, t1: ph.t1, y0: ph.y0, moved: false }; });
  cv.addEventListener('pointermove', e => {
    const p = pos(e);
    if (d && state.dock === 'phylo') {
      if (Math.hypot(p.x - d.x, p.y - d.y) > 4) d.moved = true;
      if (d.moved) {
        const g = ph.geom, span = d.t1 - d.t0, dt = -(p.x - d.x) / (g.w - g.padL - g.padR) * span;
        if (!ph.auto || Math.abs(p.x - d.x) > 12) { ph.auto = false; ph.t0 = d.t0 + dt; ph.t1 = d.t1 + dt; }
        ph.y0 = d.y0 - (p.y - d.y); dockDirty = true;
      }
      return;
    }
    const s = hit(p);
    cv.style.cursor = s ? 'pointer' : 'default';
    if (s) tip(spTip(s), e.clientX, e.clientY);
    else if (state.dock === 'pop' && popGeom && p.x > popGeom.padL) {
      const H = world.history, t = popGeom.t0 + (p.x - popGeom.padL) / (popGeom.w - popGeom.padL - popGeom.padR) * (popGeom.t1 - popGeom.t0);
      let b = H[0]; for (const q of H) if (Math.abs(q.t - t) < Math.abs(b.t - t)) b = q;
      tip('<small>year ' + years(b.t).toFixed(2) + ' · ' + b.pop + ' organisms · ' + b.species + ' species</small>' +
        ROLES.map((r, i) => '<small>' + r + 's ' + b.roles[i] + '</small>').join(''), e.clientX, e.clientY);
    } else tip(null);
  });
  cv.addEventListener('pointerup', e => {
    if (d && !d.moved) { const s = hit(pos(e)); if (s) selectSpecies(s); }
    d = null;
  });
  cv.addEventListener('pointerleave', () => tip(null));
  cv.addEventListener('wheel', e => {
    if (state.dock !== 'phylo' || !ph.geom) return;
    e.preventDefault();
    const p = pos(e), g = ph.geom;
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { ph.y0 += e.deltaY + e.deltaX; }
    else {
      const f = Math.exp(e.deltaY * 0.0016), tc = ph.t0 + (p.x - g.padL) / (g.w - g.padL - g.padR) * (ph.t1 - ph.t0);
      ph.auto = false; ph.t0 = tc - (tc - ph.t0) * f; ph.t1 = tc + (ph.t1 - tc) * f;
      if (ph.t1 - ph.t0 > world.tick * 1.5 + 2000) ph.auto = true;
    }
    dockDirty = true;
  }, { passive: false });
  $('ph-fit').onclick = () => { ph.auto = true; ph.y0 = 0; dockDirty = true; };
  ['ph-min', 'ph-extant', 'tr-x', 'tr-y'].forEach(id => $(id).addEventListener('change', () => { dockDirty = true; }));
  $('log').addEventListener('click', e => { const li = e.target.closest('[data-sp]'); if (li) { const s = world.species.get(+li.dataset.sp); if (s) selectSpecies(s); } });
}
function selectSpecies(s) { state.selSp = s; state.selOrg = null; state.follow = false; setTab('sidetabs', 'inspect'); sideDirty = dockDirty = true; }

// ---------- side: environment ----------
const CONTROLS = [
  { h: 'Gravity' },
  { k: 'gravity', label: 'Surface gravity', min: 0.2, max: 3, step: 0.05, f: v => v.toFixed(2) + ' g', hint: 'Raises the cost of walking, climbing, body mass and tall growth on land. Water gives buoyancy.' },
  { h: 'Climate' },
  { k: 'temperature', label: 'Global temperature', min: -12, max: 40, step: 0.5, f: v => v.toFixed(1) + ' °C', hint: 'Equator runs warmer, poles and peaks colder. Each lineage carries its own thermal optimum.' },
  { k: 'seasonality', label: 'Seasonality', min: 0, max: 1, step: 0.05, f: v => (v * 100).toFixed(0) + '%', hint: 'Swing of light and warmth between hemispheres over a 2,400-tick year.' },
  { k: 'rainfall', label: 'Rainfall', min: 0.2, max: 2, step: 0.05, f: v => v.toFixed(2) + '×', hint: 'How far inland the soil stays productive.' },
  { h: 'Resources' },
  { k: 'sunlight', label: 'Sunlight', min: 0.3, max: 2, step: 0.05, f: v => v.toFixed(2) + '×', hint: 'Energy at the top of the canopy. Taller growth takes it first.' },
  { k: 'fertility', label: 'Nutrient supply', min: 0.2, max: 2.5, step: 0.05, f: v => v.toFixed(2) + '×', hint: 'Rate at which soil and water recharge. The dead are recycled where they fall.' },
  { h: 'Mutation' },
  { k: 'mutationRate', label: 'Mutation rate', min: 0, max: 5, step: 0.1, f: v => v.toFixed(1) + '×', hint: 'Multiplies each lineage’s own heritable mutation rate.' },
  { k: 'mutationSize', label: 'Mutation effect', min: 0.3, max: 3, step: 0.1, f: v => v.toFixed(1) + '×', hint: 'How far a single mutation moves a trait or a neural weight.' },
  { h: 'Geography' },
  { k: 'seaLevel', label: 'Sea level', min: 0.2, max: 0.7, step: 0.01, f: v => (v * 100).toFixed(0), hint: 'Flood land bridges to isolate populations, or drain straits to rejoin them.' },
];
const LIMITS = [
  { k: 'maxPop', label: 'Organism ceiling', min: 1500, max: 8000, step: 250, f: v => v.toFixed(0), hint: 'A performance guard. Births thin out evenly as the world approaches it.' },
  { k: 'immigration', label: 'Immigration', min: 0, max: 3, step: 0.25, f: v => v === 0 ? 'off' : v.toFixed(2) + '×', hint: 'Optional rescue from off the map: when a whole feeding guild dies out, a few colonists arrive. Off by default; lineages persist through resting eggs and seeds instead.' },
  { k: 'speciation', label: 'Species boundary', min: 0.08, max: 0.3, step: 0.01, f: v => v.toFixed(2), hint: 'Genetic distance from a lineage’s moving centre at which a newborn founds a new species.' },
];
function ctlHTML(c) {
  if (c.h) return '<h2>' + c.h + '</h2>';
  return '<div class="ctl"><label for="c-' + c.k + '">' + c.label + '</label><output id="o-' + c.k + '"></output>' +
    '<input type="range" id="c-' + c.k + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '"><small>' + c.hint + '</small></div>';
}
function buildEnv() {
  $('p-env').innerHTML = CONTROLS.map(ctlHTML).join('') +
    '<div class="row"><select id="preset" aria-label="Landform"><option value="continents">Continents</option><option value="pangaea">Supercontinent</option><option value="twin">Twin continents</option>' +
    '<option value="archipelago">Archipelago</option><option value="ridge">Mountain divide</option><option value="ocean">Ocean world</option></select>' +
    '<input type="number" id="seed" min="1" max="99999" aria-label="World seed"></div>' +
    '<div class="row"><button class="btn small" id="reform">Reshape land, keep life</button></div>' +
    '<small class="muted">Paint land, soil and impacts directly on the map with the tools above it.</small>' +
    '<h2>New world</h2><div class="row"><select id="start" aria-label="Starting life"><option value="ecosystem">Seeded: plants, algae, grazers, hunters</option><option value="proto">Single ancestor: one proto-cell</option></select></div>' +
    '<div class="row"><button class="btn" id="reset">Start a new world</button></div>' +
    '<h2>World rules</h2>' + LIMITS.map(ctlHTML).join('');
  for (const c of CONTROLS.concat(LIMITS)) {
    if (c.h) continue;
    const inp = $('c-' + c.k), out = $('o-' + c.k);
    inp.value = world.P[c.k]; out.textContent = c.f(+inp.value);
    inp.addEventListener('input', () => {
      const v = +inp.value; out.textContent = c.f(v); params[c.k] = v; world.setParam(c.k, v);
      if (c.k === 'seaLevel' || c.k === 'rainfall' || c.k === 'fertility' || c.k === 'temperature') terrDirty = true;
    });
    inp.addEventListener('change', () => world.log('user', c.label + ' set to ' + c.f(+inp.value)));
  }
  $('preset').value = state.preset; $('seed').value = state.seed; $('start').value = state.start;
  $('preset').onchange = e => { state.preset = e.target.value; };
  $('seed').onchange = e => { state.seed = clamp(+e.target.value || 1, 1, 99999); };
  $('start').onchange = e => { state.start = e.target.value; };
  $('reform').onclick = () => { world.generateTerrain(state.preset, state.seed); world.log('user', 'Landscape reshaped'); terrDirty = true; };
  $('reset').onclick = () => { newWorld(); };
}

// ---------- side: life ----------
function geneRows(norm, ref) {
  let html = '', grp = '';
  for (const d of GENES) {
    if (d.group !== grp) { grp = d.group; html += '<h2>' + grp + '</h2>'; }
    const v = norm[d.index];
    html += '<div class="gene"><span>' + d.label + '</span><span class="track"><i style="width:' + (v * 100).toFixed(1) + '%"></i>' +
      (ref ? '<b style="left:' + (ref[d.index] * 100).toFixed(1) + '%"></b>' : '') + '</span><span>' + fmt(A.toReal(d, v)) + '</span></div>';
  }
  return html;
}
function dietHTML(it) {
  const t = it[0] + it[1] + it[2];
  if (t < 1e-6) return '<p class="muted">No intake recorded yet.</p>';
  const pc = i => (it[i] / t * 100);
  return '<div class="diet"><i style="width:' + pc(0) + '%;background:var(--photo)"></i><i style="width:' + pc(1) + '%;background:var(--herb)"></i><i style="width:' + pc(2) + '%;background:var(--carn)"></i></div>' +
    '<div class="dietkey"><span><i class="dot" style="background:var(--photo)"></i>Light ' + pc(0).toFixed(0) + '%</span><span><i class="dot" style="background:var(--herb)"></i>Plants ' + pc(1).toFixed(0) +
    '%</span><span><i class="dot" style="background:var(--carn)"></i>Flesh ' + pc(2).toFixed(0) + '%</span></div>';
}
function roleChip(r) { return '<span class="chip role"><i class="dot" style="background:var(' + ROLE_VARS[r || 0] + ')"></i>' + ROLES[r || 0] + '</span>'; }
function portrait(p, col, heading) {
  const cv = $('portrait'); if (!cv) return;
  const { ctx, w, h } = fitCanvas(cv);
  ctx.clearRect(0, 0, w, h);
  const r = clamp(10 + Math.cbrt(p.size) * 9, 14, 44);
  drawBody(ctx, p, col, w / 2 - (p.mobile ? 0 : r * 0.3), h / 2 - (p.mobile ? 0 : r * 0.3), r, heading);
}
function drawBrain(o) {
  const cv = $('brain'); if (!cv) return;
  const { ctx, w, h } = fitCanvas(cv), g = o.genome, nG = world.nG, NI = A.NI, NH = A.NH, NO = A.NO;
  ctx.clearRect(0, 0, w, h);
  const xi = 92, xh = w * 0.56, xo = w - 58, yi = i => 10 + i * (h - 20) / (NI - 1), yh = i => 30 + i * (h - 60) / (NH - 1), yo = i => h * 0.25 + i * h * 0.25;
  const edge = (x1, y1, x2, y2, wt) => {
    const a = Math.min(1, Math.abs(wt) / 2.5); if (a < 0.06) return;
    ctx.globalAlpha = a; ctx.strokeStyle = wt > 0 ? T.accent : T.roles[2]; ctx.lineWidth = 0.6 + a * 1.8;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  for (let hI = 0; hI < NH; hI++) for (let i = 0; i < NI; i++) edge(xi, yi(i), xh, yh(hI), g[nG + hI * NI + i]);
  for (let oI = 0; oI < NO; oI++) for (let hI = 0; hI < NH; hI++) edge(xh, yh(hI), xo, yo(oI), g[nG + NI * NH + oI * (NH + 1) + hI]);
  ctx.globalAlpha = 1; ctx.font = '500 9px ' + T.mono; ctx.textBaseline = 'middle';
  ctx.textAlign = 'right'; ctx.fillStyle = T.fg2;
  for (let i = 0; i < NI; i++) { ctx.fillText(A.INPUT_LABELS[i], xi - 7, yi(i)); ctx.beginPath(); ctx.arc(xi, yi(i), 2.5, 0, 6.283); ctx.fill(); }
  for (let i = 0; i < NH; i++) { ctx.beginPath(); ctx.arc(xh, yh(i), 4, 0, 6.283); ctx.fill(); }
  ctx.textAlign = 'left';
  for (let i = 0; i < NO; i++) { ctx.beginPath(); ctx.arc(xo, yo(i), 4, 0, 6.283); ctx.fill(); ctx.fillText(A.OUTPUT_LABELS[i], xo + 8, yo(i)); }
}
function renderLife() {
  sideDirty = false;
  const el = $('p-inspect'), keep = el.scrollTop, H = world.history, gmean = H.length ? H[H.length - 1].mean : null;
  let o = state.selOrg, s = state.selSp;
  if (o && !o.alive) { o = state.selOrg = null; }
  if (o) {
    const sp = o.sp;
    el.innerHTML = '<button class="link" data-act="all">All living species</button>' +
      '<h2>Individual #' + o.id + '</h2><p class="sp-name">' + esc(sp.name) + '</p>' +
      '<div class="chips">' + roleChip(A.roleOf(o.inPhoto, o.inPlant, o.inMeat, o.genome)) + '<span class="chip">' + (o.mobile ? 'motile' : 'sessile') + '</span><span class="chip">' + (o.water ? 'in water' : 'on land') + '</span></div>' +
      '<canvas class="portrait" id="portrait"></canvas>' +
      '<dl class="kv"><div><dt>Age</dt><dd>' + o.age + ' / ' + (o.life | 0) + '</dd></div><div><dt>Biomass</dt><dd>' + fmt(o.B) + '</dd></div><div><dt>Generation</dt><dd>' + o.gen + '</dd></div>' +
      '<div><dt>Offspring</dt><dd>' + o.kids + '</dd></div><div><dt>Thermal fit</dt><dd>' + (o.therm * 100).toFixed(0) + '%</dd></div><div><dt>Habitat fit</dt><dd>' + (o.hab * 100).toFixed(0) + '%</dd></div></dl>' +
      '<div class="row"><button class="btn small" data-act="follow">' + (state.follow ? 'Stop following' : 'Follow') + '</button><button class="btn small" data-act="species">View species</button></div>' +
      '<h2>Lifetime energy intake</h2>' + dietHTML([o.inPhoto, o.inPlant, o.inMeat]) +
      (o.mobile ? '<h2>Neural controller</h2><canvas id="brain" style="width:100%;height:230px;display:block"></canvas><small class="muted">Blue wires excite, red inhibit. Every weight is heritable.</small>' : '') +
      '<h2>Genome</h2><small class="muted">Bar: this individual. Marker: its species mean.</small>' + geneRows(o.genome, sp.mean);
    portrait(o.p, colOf(o.genome), o.mobile ? -0.4 : o.id); if (o.mobile) drawBrain(o);
  } else if (s && world.species.has(s.id)) {
    const par = world.species.get(s.parent), p = A.express(s.mean);
    const kids = []; for (const k of world.species.values()) if (k.parent === s.id && k.peak >= 10) kids.push(k);
    el.innerHTML = '<button class="link" data-act="all">All living species</button>' +
      '<h2>Species</h2><p class="sp-name">' + esc(s.name) + '</p>' +
      '<div class="chips">' + roleChip(s.role) + s.tags.map(t => '<span class="chip">' + esc(t) + '</span>').join('') + (s.n === 0 ? '<span class="chip">' + (s.bank > 0 ? 'dormant' : 'extinct') + '</span>' : '') + '</div>' +
      '<canvas class="portrait" id="portrait"></canvas>' +
      '<dl class="kv"><div><dt>Alive</dt><dd>' + s.n + '</dd></div><div><dt>Resting</dt><dd>' + (s.bank || 0) + '</dd></div><div><dt>Peak</dt><dd>' + s.peak + '</dd></div>' +
      '<div><dt>Arose</dt><dd>yr ' + years(s.born).toFixed(1) + '</dd></div><div><dt>' + (s.n ? 'Age' : 'Lasted') + '</dt><dd>' + years((s.n ? world.tick : s.died) - s.born).toFixed(1) + ' yr</dd></div><div><dt>Lineage depth</dt><dd>' + s.gen + '</dd></div><div><dt>Kin eaten</dt><dd>' +
      (s.intake[1] + s.intake[2] > 1e-6 ? (s.intake[3] / (s.intake[1] + s.intake[2]) * 100).toFixed(0) + '%' : '–') + '</dd></div></dl>' +
      '<p>' + (par ? 'Descends from <button class="link" data-sp="' + par.id + '"><i>' + esc(par.name) + '</i></button>. ' : 'A founding lineage. ') +
      (kids.length ? 'Gave rise to ' + kids.slice(0, 8).map(k => '<button class="link" data-sp="' + k.id + '"><i>' + esc(k.name) + '</i></button>').join(', ') + (kids.length > 8 ? ' and ' + (kids.length - 8) + ' more' : '') + '.' : '') + '</p>' +
      '<h2>Realised diet of living members</h2>' + dietHTML(s.intake) +
      '<h2>Mean genome</h2><small class="muted">Bar: species mean. Marker: mean of all life.</small>' + geneRows(s.mean, gmean);
    portrait(p, colOf(s.col), -0.4);
  } else {
    state.selSp = null;
    const list = [...world.species.values()].filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 40);
    el.innerHTML = '<h2>Living species · ' + [...world.species.values()].filter(x => x.n >= 5).length + '</h2>' +
      '<p class="muted">Select a row, a branch of the tree, or any organism on the map. Diet labels come from what members actually ate, not from their genes.</p>' +
      '<table class="spp"><thead><tr><th>Species</th><th style="text-align:right">Alive</th></tr></thead><tbody>' +
      list.map(x => '<tr data-sp="' + x.id + '"><td><i class="dot" style="background:' + colOf(x.col) + '"></i> <em>' + esc(x.name) + '</em><small>' + ROLES[x.role || 0] + (x.tags.length ? ' · ' + esc(x.tags.join(', ')) : '') + '</small></td><td class="n">' + x.n + '</td></tr>').join('') +
      '</tbody></table>';
  }
  el.scrollTop = keep;
}
function bindLife() {
  $('p-inspect').addEventListener('click', e => {
    const a = e.target.closest('[data-act]'), sp = e.target.closest('[data-sp]');
    if (a) {
      const act = a.dataset.act;
      if (act === 'all') { state.selOrg = state.selSp = null; }
      else if (act === 'follow') { state.follow = !state.follow; if (state.follow && view.s < 3) { view.fit = false; view.s = 4; } }
      else if (act === 'species') { state.selOrg = null; }
    } else if (sp) { const s = world.species.get(+sp.dataset.sp); if (s) { state.selSp = s; state.selOrg = null; $('p-inspect').scrollTop = 0; } }
    else return;
    sideDirty = dockDirty = true; renderLife();
  });
}

// ---------- side: engine ----------
function renderEngine() {
  $('p-engine').innerHTML =
    '<h2>How it works</h2><p>Every organism runs the same rules. A genome of ' + GENES.length + ' traits and ' + A.BRAIN_N +
    ' neural weights sets its body, diet, senses and behaviour. Nothing is labelled plant or predator: a lineage is whatever its genes let it get away with. Selection is only birth and death.</p>' +
    '<h2>Tick pipeline</h2><ol class="pipe">' + world.systems.map(s => '<li>' + esc(s.name) + '</li>').join('') + '</ol>' +
    '<h2>Example extension</h2><div class="row"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="wf"' + (state.wildfire ? ' checked' : '') + '> Wildfire system</label></div>' +
    '<small class="muted">Added with <code>world.addSystem</code>. Fire takes hold under closed canopy and favours short or armoured growth.</small>' +
    '<h2>Extend it</h2><p>The engine is one DOM-free file. The running world is exposed as <code>window.strata</code>.</p>' +
    '<pre class="code">// a new heritable trait, before creating a World\nALife.registerGene({ key: \'glow\', label: \'Bioluminescence\',\n  group: \'Appearance\', min: 0, max: 1 });\nALife.upkeepModifiers.push(o =&gt; 1 + 0.2 * o.p.glow);\n\n// a new rule in the tick pipeline\nworld.addSystem(\'drought\', w =&gt; {\n  if (w.tick % 2400 === 0) w.setParam(\'rainfall\',\n    0.4 + w.rand());\n}, \'canopy\');\n\n// observe evolution as it happens\nworld.on(\'speciation\', (child, parent) =&gt;\n  console.log(parent.name, \'→\', child.name));</pre>' +
    '<h2>Registered founders</h2><p>' + Object.keys(A.FOUNDERS).map(k => esc(A.FOUNDERS[k].label)).join(', ') + '. Add your own with <code>ALife.registerFounder</code>, then place it with the Seed tool.</p>';
  $('wf').onchange = e => { state.wildfire = e.target.checked; world.log('user', 'Wildfire system ' + (state.wildfire ? 'enabled' : 'disabled')); };
}

// ---------- chrome ----------
function seg(id, key, cb) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    for (const x of $(id).querySelectorAll('button')) x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
    state[key] = b.dataset.v; if (cb) cb(b.dataset.v);
  });
}
function setTab(id, v) {
  for (const b of $(id).querySelectorAll('.tab')) b.setAttribute('aria-selected', b.dataset.v === v ? 'true' : 'false');
  if (id === 'sidetabs') {
    state.side = v; $('p-env').hidden = v !== 'env'; $('p-inspect').hidden = v !== 'inspect'; $('p-engine').hidden = v !== 'engine';
    if (v === 'engine') renderEngine(); sideDirty = true;
  } else {
    state.dock = v; $('dockcv').hidden = v === 'log'; $('logwrap').hidden = v !== 'log';
    $('tools-phylo').hidden = v !== 'phylo'; $('tools-traits').hidden = v !== 'traits'; logSig = ''; dockDirty = true;
  }
}
function bindChrome() {
  $('play').onclick = () => { state.running = !state.running; $('play').textContent = state.running ? 'Pause' : 'Run'; };
  seg('speed', 'speed');
  seg('layer', 'layer', () => { terrDirty = true; });
  seg('ph-color', 'phColor', () => { dockDirty = true; });
  seg('tool', 'tool', v => { $('brushwrap').hidden = v === 'inspect'; $('founder').hidden = v !== 'seed'; $('world').style.cursor = v === 'inspect' ? 'grab' : 'crosshair'; });
  for (const id of ['docktabs', 'sidetabs']) $(id).addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) setTab(id, b.dataset.v); });
  $('founder').innerHTML = Object.keys(A.FOUNDERS).map(k => '<option value="' + k + '">' + esc(A.FOUNDERS[k].label) + '</option>').join('');
  const opts = GENES.map(d => '<option value="' + d.index + '">' + esc(d.label) + '</option>').join('');
  $('tr-x').innerHTML = opts; $('tr-y').innerHTML = opts; $('tr-x').value = G.size; $('tr-y').value = G.height;
  window.addEventListener('pointerdown', () => { pointerDown = true; });
  window.addEventListener('pointerup', () => { pointerDown = false; });
  window.addEventListener('resize', () => { dockDirty = true; });
  window.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|SELECT|BUTTON|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); $('play').click(); } });
}

// ---------- main loop ----------
let tpsT = performance.now(), tpsN = 0, tps = 0;
function frame() {
  const t0 = performance.now();
  if (state.running) {
    const budget = state.speed === 'max' ? 48 : 40, n = state.speed === 'max' ? 1e9 : +state.speed;
    let i = 0;
    do { world.step(); i++; } while (i < n && performance.now() - t0 < budget);
    tpsN += i;
  }
  frameN++;
  if (terrDirty || (frameN % 45 === 0 && state.running)) renderTerrain();
  if (state.speed !== 'max' || !state.running || frameN % 3 === 0) drawWorld(); // at Max, most of each frame goes to simulation
  if (frameN % 12 === 0) {
    const now = performance.now(); tps = tpsN / ((now - tpsT) / 1000); tpsT = now; tpsN = 0;
    let spp = 0; for (const s of world.species.values()) if (s.n >= 5) spp++;
    $('r-year').textContent = years(world.tick).toFixed(1); $('r-gen').textContent = world.maxGen.toLocaleString();
    $('r-pop').textContent = world.orgs.length.toLocaleString(); $('r-spp').textContent = spp; $('r-tps').textContent = Math.round(tps).toLocaleString();
  }
  if (dockDirty || frameN % 24 === 0) drawDock();
  if (state.side === 'inspect' && !pointerDown && (sideDirty || frameN % 40 === 0)) renderLife();
  requestAnimationFrame(frame);
}

function start() {
  readTheme(); newWorld(); bindChrome(); bindWorld(); bindDock(); bindLife(); buildEnv();
  world.run(300); // open on a world that is already alive
  $('world').style.cursor = 'grab';
  requestAnimationFrame(frame);
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { dockDirty = true; });
start();
})();
