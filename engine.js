/* Strata — artificial-life engine (DOM-free; runs in browser or node).
 *
 * Extension points
 *   ALife.registerGene({key,label,group,min,max,log})   add a heritable trait (before creating a World)
 *   ALife.registerDerive(fn(p))                          derive phenotype values from expressed genes
 *   ALife.registerFounder(key, {label, genes, brain})    add a seedable founder organism
 *   ALife.upkeepModifiers.push(fn(o, world) => mult)     scale an organism's metabolic cost
 *   world.addSystem(name, fn(world), beforeName?)        insert a step into the tick pipeline
 *   world.on(event, fn)                                  'birth' | 'death' | 'speciation' | 'extinction' | 'sample'
 */
(function (root) {
'use strict';

// ---------- utilities ----------
function rng32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------- gene registry ----------
const GENES = [];
const G = {};
const DERIVERS = [];
const FOUNDERS = {};
const upkeepModifiers = [];
function registerGene(def) {
  def.index = GENES.length; def.log = !!def.log;
  GENES.push(def); G[def.key] = def.index; return def.index;
}
function registerDerive(fn) { DERIVERS.push(fn); }
function registerFounder(key, def) { FOUNDERS[key] = def; }

[ // appearance
  { key: 'r', label: 'Pigment red', group: 'Appearance', min: 0, max: 1 },
  { key: 'g', label: 'Pigment green', group: 'Appearance', min: 0, max: 1 },
  { key: 'b', label: 'Pigment blue', group: 'Appearance', min: 0, max: 1 },
  { key: 'lobes', label: 'Body lobes', group: 'Appearance', min: 3, max: 9 },
  // body
  { key: 'size', label: 'Adult mass', group: 'Body', min: 0.6, max: 60, log: true },
  { key: 'height', label: 'Stature', group: 'Body', min: 0, max: 1 },
  { key: 'armor', label: 'Armour', group: 'Body', min: 0, max: 1 },
  { key: 'toxin', label: 'Toxicity', group: 'Body', min: 0, max: 1 },
  // energy
  { key: 'photo', label: 'Photosynthesis', group: 'Energy', min: 0, max: 1 },
  { key: 'herb', label: 'Plant digestion', group: 'Energy', min: 0, max: 1 },
  { key: 'carn', label: 'Flesh digestion', group: 'Energy', min: 0, max: 1 },
  { key: 'topt', label: 'Thermal optimum °C', group: 'Energy', min: -15, max: 45 },
  { key: 'ttol', label: 'Thermal tolerance', group: 'Energy', min: 4, max: 20 },
  { key: 'aqua', label: 'Aquatic affinity', group: 'Energy', min: 0, max: 1 },
  // locomotion + sensing
  { key: 'speed', label: 'Locomotion', group: 'Locomotion', min: 0, max: 1 },
  { key: 'sense', label: 'Sensor range', group: 'Sensing', min: 0, max: 1 },
  // reproduction
  { key: 'mature', label: 'Maturity reserve', group: 'Reproduction', min: 0.2, max: 1.5 },
  { key: 'egg', label: 'Offspring investment', group: 'Reproduction', min: 0.08, max: 0.6 },
  { key: 'clutch', label: 'Clutch size', group: 'Reproduction', min: 1, max: 6 },
  { key: 'disperse', label: 'Dispersal', group: 'Reproduction', min: 0, max: 1 },
  { key: 'sex', label: 'Outcrossing', group: 'Reproduction', min: 0, max: 1 },
  { key: 'dorm', label: 'Resting offspring', group: 'Reproduction', min: 0, max: 1 },
  { key: 'rest', label: 'Rest length (ticks)', group: 'Reproduction', min: 300, max: 20000, log: true },
  { key: 'long', label: 'Longevity', group: 'Reproduction', min: 0.5, max: 2.5 },
  { key: 'mut', label: 'Mutation rate', group: 'Reproduction', min: 0.01, max: 0.4, log: true },
].forEach(registerGene);

// ---------- brain layout ----------
const NI = 23, NH = 8, NO = 3;
const BRAIN_N = NI * NH + (NH + 1) * NO;
const INPUT_LABELS = ['bias', 'energy', 'R side', 'G side', 'B side', 'R ahead', 'G ahead', 'B ahead',
  'near side', 'near ahead', 'near dist', 'near size', 'near kin', 'habitat ahead', 'warmth ahead', 'noise', 'moving R side', 'moving G side', 'moving B side', 'digesting', 'stranger side', 'stranger dist', 'stranger size'];
const OUTPUT_LABELS = ['turn', 'thrust', 'mouth'];

// ---------- tuning constants ----------
const C = {
  W: 960, H: 608, FINE: 4, RES: 32, HASH: 24, YEAR: 2400, SLOW: 8,
  UPKEEP: 0.0025, MOVE: 0.0008, SUPPORT: 0.0006, STEM: 0.008,
  CELLGAIN: 0.26, LEAFK: 51, NMAX: 40, NREGEN: 0.008, NUSE: 0.6,
  FLOOR: 0, WIRE: 0.3, BANK: 3000, EGGLIFE: 20000, MATE: 24, LEAF: 1.4, KEEP: 1, STARVE: 0.33, BITE: 0.25, REACH: 2.2, HANDLE: 3, DIGTIME: 10, DIGEST: 0.75, FLESH: 0.6, RICH: 1.2, HAZARD: 0.00015, LIFE: 400,
};

function toReal(def, v) {
  return def.log ? def.min * Math.pow(def.max / def.min, v) : def.min + (def.max - def.min) * v;
}
function toNorm(def, real) {
  return clamp(def.log ? Math.log(real / def.min) / Math.log(def.max / def.min) : (real - def.min) / (def.max - def.min), 0, 1);
}

function express(genome) {
  const p = {};
  for (let i = 0; i < GENES.length; i++) p[GENES[i].key] = toReal(GENES[i], genome[i]);
  // diet allocation: specialists digest better than generalists
  const root2 = 1 - p.speed; // roots vs legs
  const ph = p.photo * root2 * root2;
  const sum = p.photo + p.herb + p.carn + 1e-6;
  p.photoEff = p.photo * ph / sum;
  p.herbEff = p.herb * p.herb / sum;
  p.carnEff = p.carn * p.carn / sum;
  p.plantness = p.photoEff / (p.photoEff + p.herbEff + p.carnEff + 1e-6);
  p.mobile = p.speed > 0.08;
  p.biter = (p.herbEff + p.carnEff) > 0.12;
  p.range = p.mobile ? (8 + p.sense * 48) * (0.6 + 0.29 * Math.cbrt(p.size)) : 0; // bigger eyes see further
  p.eggB = p.egg * p.size;
  p.life = C.LIFE * Math.pow(p.size, 0.25) * p.long;
  p.costMult = 1 + C.LEAF * p.photo + 0.6 * p.armor + 0.6 * p.toxin + 0.3 * p.speed + (p.mobile ? 0.15 * p.sense : 0) + 0.5 * (p.ttol - 4) / 16 + 0.2 * (p.long - 1);
  for (let i = 0; i < DERIVERS.length; i++) DERIVERS[i](p);
  return p;
}

// ---------- founders ----------
function brainPreset(chase, minus, flee, brake) {
  // steer toward sensor input `chase` (minus input `minus`), away from input `flee`; -1 disables.
  // inputs 2..4 are the red/green/blue side signals, 16..18 the same for moving bodies only
  return function (w, rand) {
    w.fill(0); // a clean controller: every other wire starts silent and mutation explores from there
    const ih = (i, h) => h * NI + i, ho = (h, o) => NI * NH + o * (NH + 1) + h;
    if (chase >= 0) { w[ih(chase, 0)] = 4; if (minus >= 0) w[ih(minus, 0)] = -4; w[ho(0, 0)] = 1.5; }
    if (flee >= 0) { w[ih(flee, 1)] = 3; w[ho(1, 0)] = -1.2; }
    w[ih(13, 2)] = 6; w[ho(2, 0)] = -1.5;       // turn away from bad habitat
    w[ih(15, 3)] = 1; w[ho(3, 0)] = 0.5;        // wander
    w[ih(12, 4)] = 10; w[ih(0, 4)] = -4; w[ho(4, 2)] = -1.5; w[ho(NH, 2)] = 0.5; // do not bite kin
    w[ih(1, 5)] = 2; w[ih(0, 5)] = -1; w[ho(5, 1)] = -1;                         // ease off when full
    w[ho(NH, 1)] = 1;
    if (brake) { w[ih(19, 6)] = 6; w[ih(0, 6)] = -3; w[ho(6, 1)] = -2.5; w[ho(NH, 1)] = -1.5; } // stay put while digesting, so the next bite is in reach
  };
}
function hunterBrain(w, rand) { // pursue anything that moves and is not coloured like its own kind
  brainPreset(-1, -1, -1, false)(w, rand);
  const ih = (i, h) => h * NI + i, ho = (h, o) => NI * NH + o * (NH + 1) + h;
  w[ih(20, 0)] = 6; w[ho(0, 0)] = 1.5;                      // turn toward the nearest moving stranger
  w[ih(21, 7)] = 6; w[ho(7, 1)] = 1.5; w[ho(NH, 1)] = 0;      // cruise, and sprint when one is in view
}
registerFounder('plant', { label: 'Ground plant', habitat: 'land',
  genes: { r: .2, g: .75, b: .25, lobes: 5, size: 5, height: .45, armor: 0, toxin: 0, photo: 1, herb: 0, carn: 0, topt: 18, ttol: 10, aqua: 0, speed: 0, sense: 0, mature: .6, egg: .15, clutch: 2, disperse: .4, sex: 0.5, dorm: 0.15, rest: 2000, long: 1, mut: .08 } });
registerFounder('alga', { label: 'Alga', habitat: 'water',
  genes: { r: .15, g: .6, b: .5, lobes: 7, size: 1.5, height: .1, armor: 0, toxin: 0, photo: 1, herb: 0, carn: 0, topt: 16, ttol: 10, aqua: 1, speed: 0, sense: 0, mature: .6, egg: .2, clutch: 2, disperse: .5, sex: 0.5, dorm: 0.15, rest: 2000, long: 1, mut: .08 } });
registerFounder('grazer', { label: 'Grazer', habitat: 'land', brain: brainPreset(3, 4, 16, true),
  genes: { r: .25, g: .4, b: .9, lobes: 4, size: 3, height: 0, armor: 0, toxin: 0, photo: 0, herb: 1, carn: 0, topt: 18, ttol: 11, aqua: 0, speed: .5, sense: .5, mature: .7, egg: .3, clutch: 1, disperse: .3, sex: 0.5, dorm: 0.3, rest: 4000, long: 1.3, mut: .08 } });
registerFounder('hunter', { label: 'Hunter', habitat: 'land', brain: hunterBrain,
  genes: { r: .9, g: .25, b: .2, lobes: 3, size: 1.5, height: 0, armor: 0, toxin: 0, photo: 0, herb: 0, carn: 1, topt: 18, ttol: 11, aqua: 0, speed: .65, sense: .8, mature: .5, egg: .5, clutch: 1, disperse: .3, sex: 0.5, dorm: 0.4, rest: 6000, long: 2.2, mut: .05 } });
registerFounder('proto', { label: 'Proto-cell', habitat: 'water', brain: brainPreset(3, 4, -1, true),
  genes: { r: .5, g: .6, b: .45, lobes: 6, size: 1.2, height: .05, armor: 0, toxin: 0, photo: .8, herb: .15, carn: .1, topt: 16, ttol: 12, aqua: .85, speed: .04, sense: .3, mature: .5, egg: .3, clutch: 2, disperse: .5, sex: 0.2, dorm: 0.2, rest: 2000, long: 1, mut: .12 } });

// ---------- names ----------
const SYL_A = ['Ar', 'Bel', 'Cor', 'Dra', 'El', 'Fen', 'Gal', 'Hel', 'Ix', 'Kal', 'Lum', 'Mor', 'Nym', 'Or', 'Pel', 'Quil', 'Rha', 'Syl', 'Tor', 'Ul', 'Vex', 'Xan', 'Zor', 'Thal', 'Myr', 'Cry', 'Ost', 'Phy'];
const SYL_B = ['a', 'o', 'i', 'e', 'u', 'ae', 'io', 'ya'];
const SYL_C = ['don', 'pus', 'tera', 'morpha', 'saurus', 'phyta', 'cera', 'nax', 'lia', 'thrix', 'derma', 'zoa', 'plax', 'myces', 'gnath', 'soma', 'cys', 'ptera'];
const EPI = ['vagans', 'minor', 'major', 'ferox', 'placidus', 'obscurus', 'viridis', 'ruber', 'altus', 'nanus', 'velox', 'tardus', 'armatus', 'toxicus', 'borealis', 'australis', 'marinus', 'aridus', 'gracilis', 'robustus', 'lucens', 'umbrosus', 'socialis', 'solitarius', 'vorax', 'pallidus', 'niger', 'aureus', 'profundus', 'litoralis', 'montanus', 'errans'];
function pick(a, rand) { return a[(rand() * a.length) | 0]; }
function genus(rand) { return pick(SYL_A, rand) + pick(SYL_B, rand) + pick(SYL_C, rand); }

// ---------- World ----------
function World(opts) {
  opts = opts || {};
  this.seed = (opts.seed == null ? 1 : opts.seed) >>> 0;
  this.rand = rng32(this.seed * 7919 + 13);
  this.W = C.W; this.H = C.H;
  this.gw = C.W / C.FINE; this.gh = C.H / C.FINE;
  this.rw = C.W / C.RES; this.rh = C.H / C.RES;
  this.hw = Math.ceil(C.W / C.HASH); this.hh = Math.ceil(C.H / C.HASH);
  this.nG = GENES.length; this.nGenome = this.nG + BRAIN_N;
  this.P = Object.assign({
    gravity: 1, temperature: 15, seasonality: 0.3, rainfall: 1, sunlight: 1, fertility: 1,
    mutationRate: 1, mutationSize: 1, seaLevel: 0.42, maxPop: 4000, speciation: 0.17, immigration: 0,
  }, opts.params || {});
  this.preset = opts.preset || 'continents';
  this.elev = new Float32Array(this.gw * this.gh);
  this.N = new Float32Array(this.rw * this.rh);
  this.cap = new Float32Array(this.rw * this.rh);
  this.fert = new Float32Array(this.rw * this.rh).fill(1);
  this.cellWater = new Uint8Array(this.rw * this.rh);
  this.cellDepth = new Float32Array(this.rw * this.rh);
  this.cellLight = new Float32Array(this.rw * this.rh);
  this.cellGround = new Float32Array(this.rw * this.rh).fill(1);
  this.head = new Int32Array(this.hw * this.hh);
  this.mhead = new Int32Array(this.hw * this.hh);
  this.agg = new Float32Array(this.hw * this.hh * 6);
  this.nMobile = 0; this.nSessile = 0;
  this.fame = { grazer: [], hunter: [] };
  this.banks = [[], []]; this.rested = 0;
  this.next = new Int32Array(1024);
  this.rhead = new Int32Array(this.rw * this.rh);
  this.rnext = new Int32Array(1024);
  this.orgs = [];
  this.tick = 0; this.nextId = 1; this.nextSp = 1;
  this.species = new Map();
  this.events = [];
  this.history = [];
  this.schedule = [];
  this.listeners = {};
  this.deaths = { starved: 0, eaten: 0, old: 0, hazard: 0 };
  this.births = 0; this.sexual = 0; this.maxGen = 0; this.season = 0;
  this.terrainVersion = 0;
  this.systems = [
    { name: 'schedule', fn: sysSchedule },
    { name: 'immigration', fn: sysImmigration },
    { name: 'hatching', fn: sysHatching },
    { name: 'environment', fn: sysEnvironment },
    { name: 'index', fn: sysIndex },
    { name: 'canopy', fn: sysCanopy },
    { name: 'behaviour', fn: sysBehaviour },
    { name: 'metabolism', fn: sysMetabolism },
    { name: 'sweep', fn: sysSweep },
    { name: 'census', fn: sysCensus },
  ];
  this.generateTerrain(this.preset, this.seed);
  for (let i = 0; i < this.N.length; i++) this.N[i] = this.cap[i] * C.NMAX;
  this.populate(opts.start || 'ecosystem');
}
const WP = World.prototype;

WP.on = function (ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); };
WP.emit = function (ev, a, b, c) { const l = this.listeners[ev]; if (l) for (let i = 0; i < l.length; i++) l[i](a, b, c); };
WP.addSystem = function (name, fn, before) {
  const i = before ? this.systems.findIndex(s => s.name === before) : -1;
  if (i >= 0) this.systems.splice(i, 0, { name, fn }); else this.systems.push({ name, fn });
};
WP.log = function (type, text, sp) {
  this.events.push({ t: this.tick, type, text, sp: sp ? sp.id : 0 });
  if (this.events.length > 400) this.events.splice(0, 100);
};

// ----- terrain -----
WP.generateTerrain = function (preset, seed) {
  this.preset = preset;
  const gw = this.gw, gh = this.gh, r = rng32(seed * 2654435761 + 99);
  const L = 64, lat = new Float32Array(L * L);
  for (let i = 0; i < L * L; i++) lat[i] = r();
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = lat[(yi & 63) * L + (xi & 63)], b = lat[(yi & 63) * L + ((xi + 1) & 63)];
    const c = lat[((yi + 1) & 63) * L + (xi & 63)], d = lat[((yi + 1) & 63) * L + ((xi + 1) & 63)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const fbm = (x, y, f) => {
    let s = 0, a = 0.5, n = 0;
    for (let o = 0; o < 5; o++) { s += a * vn(x * f, y * f); n += a; a *= 0.5; f *= 2; }
    return s / n;
  };
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const u = x / gw, v = y / gh, dx = u - 0.5, dy = v - 0.5;
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const n = fbm(x, y, 0.035), n2 = fbm(x + 300, y + 170, 0.09);
    let e;
    if (preset === 'pangaea') {
      e = 0.78 - Math.sqrt(dx * dx * 1.1 + dy * dy * 1.6) * 1.25 + (n - 0.5) * 0.45;
    } else if (preset === 'archipelago') {
      e = 0.12 + n2 * 0.38 + n * 0.22;
    } else if (preset === 'twin') {
      const strait = Math.abs(dx + (n2 - 0.5) * 0.12);
      e = 0.3 + n * 0.5 - Math.max(0, 0.09 - strait) * 3.2;
    } else if (preset === 'ridge') {
      const ridge = Math.max(0, 0.1 - Math.abs(dx + (n2 - 0.5) * 0.2)) * 4.5;
      e = 0.36 + n * 0.3 + ridge;
    } else if (preset === 'ocean') {
      e = 0.02 + n * 0.3 + n2 * 0.28;
    } else { // continents
      e = 0.18 + n * 0.62 + (n2 - 0.5) * 0.12;
    }
    e -= Math.max(0, 0.1 - edge) * 3;
    this.elev[y * gw + x] = clamp(e, 0, 1);
  }
  this.rebuildEnv();
};

WP.rebuildEnv = function () {
  const { rw, rh, gw } = this, sea = this.P.seaLevel, k = C.RES / C.FINE;
  const dist = new Int16Array(rw * rh).fill(-1), q = [];
  const meanE = new Float32Array(rw * rh);
  for (let cy = 0; cy < rh; cy++) for (let cx = 0; cx < rw; cx++) {
    let s = 0, wcount = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const e = this.elev[(cy * k + j) * gw + cx * k + i]; s += e; if (e < sea) wcount++;
    }
    const c = cy * rw + cx; meanE[c] = s / (k * k);
    this.cellWater[c] = wcount * 2 >= k * k ? 1 : 0;
    this.cellDepth[c] = Math.max(0, sea - meanE[c]);
    if (wcount > 0) { dist[c] = 0; q.push(c); }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi], cx = c % rw, cy = (c / rw) | 0, d = dist[c] + 1;
    if (cx > 0 && dist[c - 1] < 0) { dist[c - 1] = d; q.push(c - 1); }
    if (cx < rw - 1 && dist[c + 1] < 0) { dist[c + 1] = d; q.push(c + 1); }
    if (cy > 0 && dist[c - rw] < 0) { dist[c - rw] = d; q.push(c - rw); }
    if (cy < rh - 1 && dist[c + rw] < 0) { dist[c + rw] = d; q.push(c + rw); }
  }
  const P = this.P;
  for (let c = 0; c < rw * rh; c++) {
    let cap;
    if (this.cellWater[c]) cap = clamp(1 - this.cellDepth[c] * 3.2, 0.15, 1);
    else {
      const d = dist[c] < 0 ? 30 : dist[c];
      const moist = clamp(P.rainfall * (1.25 - d * 0.1), 0.04, 1.3);
      cap = moist * (1 - clamp((meanE[c] - sea - 0.22) * 3, 0, 0.85));
    }
    this.cap[c] = cap * P.fertility * this.fert[c];
  }
  this.terrainVersion++;
};

WP.elevAt = function (x, y) {
  const gx = clamp((x / C.FINE) | 0, 0, this.gw - 1), gy = clamp((y / C.FINE) | 0, 0, this.gh - 1);
  return this.elev[gy * this.gw + gx];
};
WP.tempAt = function (x, y) {
  const lat = (y / this.H - 0.5) * 2, al = Math.abs(lat), e = this.elevAt(x, y), sea = this.P.seaLevel;
  const land = e >= sea;
  return this.P.temperature + 14 - 30 * Math.pow(al, 1.3) - (land ? (e - sea) * 45 : 0)
    + this.P.seasonality * 14 * this.season * lat * (land ? 1 : 0.4);
};
WP.lightAtCell = function (c) {
  const cy = (c / this.rw) | 0, lat = ((cy + 0.5) / this.rh - 0.5) * 2;
  let l = this.P.sunlight * (1 - 0.45 * Math.abs(lat)) * (1 + this.P.seasonality * 0.6 * this.season * lat);
  if (this.cellWater[c]) l *= Math.exp(-this.cellDepth[c] * 5);
  return l < 0.02 ? 0.02 : l;
};

WP.paintTerrain = function (x, y, radius, delta) {
  const gw = this.gw, gh = this.gh, r = radius / C.FINE, gx = x / C.FINE, gy = y / C.FINE;
  for (let j = Math.max(0, Math.floor(gy - r)); j <= Math.min(gh - 1, Math.ceil(gy + r)); j++)
    for (let i = Math.max(0, Math.floor(gx - r)); i <= Math.min(gw - 1, Math.ceil(gx + r)); i++) {
      const d = Math.hypot(i - gx, j - gy) / r;
      if (d < 1) this.elev[j * gw + i] = clamp(this.elev[j * gw + i] + delta * (1 - d * d), 0, 1);
    }
  this.rebuildEnv();
};
WP.paintFertility = function (x, y, radius, factor) {
  const r = radius / C.RES, cx0 = x / C.RES, cy0 = y / C.RES;
  for (let j = Math.max(0, Math.floor(cy0 - r)); j <= Math.min(this.rh - 1, Math.ceil(cy0 + r)); j++)
    for (let i = Math.max(0, Math.floor(cx0 - r)); i <= Math.min(this.rw - 1, Math.ceil(cx0 + r)); i++)
      if (Math.hypot(i + 0.5 - cx0, j + 0.5 - cy0) < r + 0.5) {
        const c = j * this.rw + i; this.fert[c] = clamp(this.fert[c] * factor, 0.05, 4);
      }
  this.rebuildEnv();
};
WP.meteor = function (x, y, radius) {
  let killed = 0;
  for (const o of this.orgs) if (o.alive && Math.hypot(o.x - x, o.y - y) < radius * (0.8 + this.rand() * 0.6)) { this.kill(o, 'hazard'); killed++; }
  this.paintTerrain(x, y, radius * 0.6, -0.12);
  this.log('user', 'Impact at ' + (x | 0) + ',' + (y | 0) + ' killed ' + killed);
  return killed;
};
WP.setParam = function (key, v) {
  this.P[key] = v;
  if (key === 'seaLevel' || key === 'rainfall' || key === 'fertility') this.rebuildEnv();
};

// ----- genomes, organisms, species -----
WP.makeGenome = function (founderKey) {
  const f = FOUNDERS[founderKey], g = new Float32Array(this.nGenome);
  for (let i = 0; i < this.nG; i++) {
    const def = GENES[i], v = f.genes[def.key];
    g[i] = v == null ? 0.5 : toNorm(def, v);
  }
  const w = new Float32Array(BRAIN_N);
  if (f.brain) f.brain(w, this.rand); else for (let i = 0; i < BRAIN_N; i++) w[i] = (this.rand() - 0.5) * 0.2;
  g.set(w, this.nG);
  return g;
};
WP.newSpecies = function (genome, parent) {
  const rand = this.rand;
  const sp = {
    id: this.nextSp++, parent: parent ? parent.id : 0, born: this.tick, died: -1,
    type: genome.slice(), n: 0, bank: 0, peak: 0, hist: [], mean: genome.slice(), role: '', tags: [],
    genus: '', clan: 0, clanType: null, epithet: pick(EPI, rand),
    col: [genome[G.r], genome[G.g], genome[G.b]], gen: 0, logged: false,
    intake: [0, 0, 0, 0],
  };
  // a genus is a clan: descendants stay in it until they have drifted well away from the genome that founded it
  if (parent && this.distance(genome, parent.clanType) < 2.5 * this.P.speciation) { sp.clan = parent.clan; sp.clanType = parent.clanType; sp.genus = parent.genus; }
  else { sp.clan = sp.id; sp.clanType = sp.type; sp.genus = genus(rand); }
  sp.name = sp.genus + ' ' + sp.epithet;
  this.species.set(sp.id, sp);
  return sp;
};
WP.spawn = function (genome, x, y, B, sp, gen, parentId) {
  const p = express(genome);
  const o = {
    id: this.nextId++, x, y, h: this.rand() * 6.283, B: B == null ? p.eggB : B, age: 0, gen: gen || 0,
    sp, genome, p, alive: true, gain: 0, therm: 1, hab: 1, rad: 1, peak: 0, thrust: 0, mouth: 0,
    inPhoto: 0, inPlant: 0, inMeat: 0, inKin: 0, kids: 0, parentId: parentId || 0,
    life: p.life * (0.8 + this.rand() * 0.4), water: false, _h: 0, _st: 0, _thA: 1, css: null, cool: 0, cover: 1, turn: 0, gut: p.size <= 1 ? 1 : Math.min(1.4, Math.pow(p.size, 0.2)), reach: 1.15 * Math.cbrt(p.size) * C.REACH,
    // hot phenotype values, flattened for speed
    size: p.size, mobile: p.mobile, biter: p.biter, range: p.range, photoEff: p.photoEff, herbEff: p.herbEff,
    carnEff: p.carnEff, plantness: p.plantness, armor: p.armor, toxin: p.toxin, speed: p.speed, height: p.height,
    aqua: p.aqua, topt: p.topt, ttol: p.ttol, full: p.size * (1 + p.mature), costMult: p.costMult,
    floor: p.mobile ? C.FLOOR : 0, // nerves and muscle carry a running cost that does not shrink with the body
    upA: C.UPKEEP * (Math.pow(p.size, 0.75) + (p.mobile ? C.FLOOR : 0)) * p.costMult, supA: C.SUPPORT * Math.pow(p.size, 1.2) + C.STEM * p.height * p.height * p.size,
  };
  this.refresh(o);
  sp.n++; if (sp.n > sp.peak) sp.peak = sp.n;
  if (o.gen > this.maxGen) this.maxGen = o.gen;
  if (o.gen > sp.gen) sp.gen = o.gen;
  this.orgs.push(o);
  return o;
};
WP.refresh = function (o) { // slow-changing state
  const st = o.B < o.size ? o.B : o.size;
  o.rad = 1.15 * Math.cbrt(st);
  const e = this.elevAt(o.x, o.y);
  o.water = e < this.P.seaLevel;
  o.hab = o.water ? o.aqua : 1 - o.aqua;
  const d = (this.tempAt(o.x, o.y) - o.topt) / o.ttol;
  o.therm = Math.exp(-d * d);
  if (o.mobile) o.cover = 0.2 + 0.8 * this.cellGround[((o.y / C.RES) | 0) * this.rw + ((o.x / C.RES) | 0)]; // animals under canopy are hard to see
};
WP.kill = function (o, cause, by) {
  if (!o.alive) return;
  o.alive = false; this.deaths[cause]++;
  const c = clamp((o.y / C.RES) | 0, 0, this.rh - 1) * this.rw + clamp((o.x / C.RES) | 0, 0, this.rw - 1);
  if (o.B > 0) this.N[c] = Math.min(C.NMAX * 2.5, this.N[c] + o.B * 0.5);
  const sp = o.sp; sp.n--;
  if (o.mobile && o.kids > 1) { // remember the most prolific animals: later colonists descend from them
    const f = o.carnEff > 0.3 ? this.fame.hunter : o.herbEff > 0.3 ? this.fame.grazer : null;
    if (f) {
      for (const e of f) e.score *= 0.985;
      if (f.length < 16) f.push({ score: o.kids, genome: o.genome });
      else { let lo = 0; for (let i = 1; i < 16; i++) if (f[i].score < f[lo].score) lo = i; if (f[lo].score < o.kids) f[lo] = { score: o.kids, genome: o.genome }; }
    }
  }
  this.emit('death', o, cause, by);
  if (sp.n === 0) this.checkExtinct(sp);
};
WP.checkExtinct = function (sp) { // a species with resting eggs or seeds in the ground is dormant, not gone
  if (sp.n > 0 || sp.bank > 0 || sp.died >= 0) return;
  sp.died = this.tick;
  if (sp.peak >= 25) this.log('extinct', sp.name + ' went extinct (peak ' + sp.peak + ')', sp);
  this.emit('extinction', sp);
};
WP.layResting = function (genome, x, y, sp, gen, pid, rest) {
  const dur = Math.min(60000, 100 - Math.log(1 - this.rand() * 0.999) * rest);
  if (this.rand() > Math.exp(-dur / C.EGGLIFE)) return; // the longer it waits, the likelier it rots
  // rooted and motile life keep separate banks, so seeds cannot bury the eggs
  const bank = this.banks[genome[G.speed] > 0.08 ? 1 : 0], e = { t: this.tick + (dur | 0), genome, x, y, sp, gen, pid };
  if (bank.length < C.BANK) bank.push(e);
  else { // a full bank loses an egg of whichever species has the most resting there, so rare lineages keep theirs
    let i = (this.rand() * bank.length) | 0;
    for (let k = 0; k < 8; k++) { const j = (this.rand() * bank.length) | 0; if (bank[j].sp.bank > bank[i].sp.bank) i = j; }
    const old = bank[i].sp; bank[i] = e; old.bank--; this.checkExtinct(old);
  }
  sp.bank++; this.rested++;
};
WP.distance = function (a, b) {
  let s = 0; const nG = this.nG;
  for (let i = 0; i < nG; i++) { const d = a[i] - b[i]; s += d * d; }
  let sb = 0;
  for (let i = nG; i < a.length; i++) { const d = a[i] - b[i]; sb += d * d; }
  return Math.sqrt(s / nG) + 0.04 * Math.sqrt(sb / BRAIN_N);
};
WP.assignSpecies = function (genome, parentSp) {
  const th = this.P.speciation;
  if (this.distance(genome, parentSp.mean) <= th) return parentSp;
  let best = null, bd = th * 0.7;
  for (const s of this.species.values()) {
    if (s.parent !== parentSp.id || s.n === 0) continue;
    const d = this.distance(genome, s.mean);
    if (d < bd) { bd = d; best = s; }
  }
  if (best) return best;
  const sp = this.newSpecies(genome, parentSp);
  this.emit('speciation', sp, parentSp);
  return sp;
};

function gauss(rand) { return (rand() + rand() + rand() + rand() - 2) * 1.732; }
WP.mutate = function (src, rate) {
  const g = src.slice(), rand = this.rand, P = this.P, nG = this.nG;
  const mu = rate * P.mutationRate, sd = 0.06 * P.mutationSize;
  for (let i = 0; i < nG; i++) if (rand() < mu) {
    g[i] = clamp(g[i] + gauss(rand) * sd * (rand() < 0.06 ? 4 : 1), 0, 1);
  }
  const m = BRAIN_N * mu * C.WIRE; let k = Math.floor(m); // wiring is a large target, so each weight mutates less often than a trait if (rand() < m - k) k++;
  for (; k > 0; k--) {
    const i = nG + ((rand() * BRAIN_N) | 0);
    g[i] = clamp(g[i] + gauss(rand) * 0.2 * P.mutationSize * (rand() < 0.06 ? 4 : 1), -5, 5);
  }
  return g;
};
WP.recombine = function (a, b) { // uniform crossover on traits; neural wiring is inherited one neuron at a time
  const g = a.slice(), rand = this.rand, nG = this.nG;
  for (let i = 0; i < nG; i++) if (rand() < 0.5) g[i] = b[i];
  for (let h = 0; h < NH; h++) if (rand() < 0.5) { const o0 = nG + h * NI; for (let i = 0; i < NI; i++) g[o0 + i] = b[o0 + i]; }
  for (let o = 0; o < NO; o++) if (rand() < 0.5) { const o0 = nG + NI * NH + o * (NH + 1); for (let i = 0; i <= NH; i++) g[o0 + i] = b[o0 + i]; }
  return g;
};
WP.findMate = function (o) { // nearest mature member of the same species within pollen / courtship range
  const hw = this.hw, hh = this.hh, orgs = this.orgs, next = this.next, list = o.mobile ? this.mhead : this.head;
  const cx = (o.x / C.HASH) | 0, cy = (o.y / C.HASH) | 0;
  let best = null, bd = C.MATE * C.MATE;
  for (let y = Math.max(0, cy - 1); y <= Math.min(hh - 1, cy + 1); y++) for (let x = Math.max(0, cx - 1); x <= Math.min(hw - 1, cx + 1); x++)
    for (let j = list[y * hw + x]; j >= 0; j = next[j]) {
      const t = orgs[j];
      if (!t || t === o || !t.alive || t.sp !== o.sp || t.B < t.size * 0.6) continue;
      const dx = t.x - o.x, dy = t.y - o.y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = t; }
    }
  return best;
};

WP.seedFounder = function (key, n, x, y, spread, opts) {
  const f = FOUNDERS[key]; if (!f) return null;
  const vary = opts && opts.vary, genome = (opts && opts.genome) || this.makeGenome(key), sp = this.newSpecies(genome, null);
  let placed = 0;
  for (let tries = 0; tries < n * 40 && placed < n; tries++) {
    let px, py;
    if (x == null) { px = this.rand() * this.W; py = this.H * (0.15 + this.rand() * 0.7); }
    else { const a = this.rand() * 6.283, d = Math.sqrt(this.rand()) * (spread || 40); px = clamp(x + Math.cos(a) * d, 1, this.W - 1); py = clamp(y + Math.sin(a) * d, 1, this.H - 1); }
    const water = this.elevAt(px, py) < this.P.seaLevel;
    if (x == null && water !== (f.habitat === 'water')) continue;
    if (x == null && f.habitat === 'water' && this.P.seaLevel - this.elevAt(px, py) > 0.12) continue;
    const o = this.spawn(this.mutate(genome, vary || 0.05), px, py, toReal(GENES[G.size], genome[G.size]) * 0.8, sp, 0, 0);
    o.age = (this.rand() * 200) | 0; placed++;
  }
  if (placed === 0) { this.species.delete(sp.id); return null; }
  sp.logged = true;
  this.log('founder', f.label + ' introduced as ' + sp.name + ' (' + placed + ')', sp);
  return sp;
};
WP.seedAt = function (key, n, pred, opts) { // found a local colony beside one organism matching pred
  const c = this.orgs.filter(o => o.alive && pred(o));
  if (!c.length) return this.seedFounder(key, n, null, null, null, opts);
  const t = c[(this.rand() * c.length) | 0];
  return this.seedFounder(key, n, t.x, t.y, 45, opts);
};
WP.seedScatter = function (key, n, pred, opts) { // one founder species, each individual dropped beside a different matching organism
  const c = this.orgs.filter(o => o.alive && pred(o));
  if (!c.length) return this.seedFounder(key, n, null, null, null, opts);
  const vary = opts && opts.vary, genome = (opts && opts.genome) || this.makeGenome(key), sp = this.newSpecies(genome, null), size = toReal(GENES[G.size], genome[G.size]);
  for (let i = 0; i < n; i++) {
    const t = c[(this.rand() * c.length) | 0], a = this.rand() * 6.283;
    this.spawn(this.mutate(genome, vary || 0.05), clamp(t.x + Math.cos(a) * 25, 1, this.W - 1), clamp(t.y + Math.sin(a) * 25, 1, this.H - 1), size, sp, 0, 0);
  }
  sp.logged = true;
  this.log('founder', FOUNDERS[key].label + ' introduced as ' + sp.name + ' (' + n + ')', sp);
  return sp;
};
WP.populate = function (start) {
  this.start = start;
  if (start === 'proto') { this.seedFounder('proto', 400); return; }
  this.seedFounder('plant', 700); this.seedFounder('alga', 500);
  const land = o => !o.mobile && !o.water, prey = o => o.mobile && o.herbEff > 0.3;
  this.schedule.push({ t: 500, fn: w => { for (let i = 0; i < 8; i++) w.seedAt('grazer', 15, land); } });
  let releases = 0;
  const hunters = w => { // hunters are released once there is a prey base, and again (up to four times) if a release fails to take hold
    let n = 0, h = 0; for (const o of w.orgs) if (o.alive && o.mobile) { if (o.carnEff > 0.3) h++; else if (o.herbEff > 0.3) n++; }
    if (h >= 4) { w.schedule.push({ t: w.tick + 5000, fn: hunters }); return; }
    if (releases >= 4) return;
    if (n >= 250 || (releases === 0 && w.tick >= 40000)) { releases++; w.seedScatter('hunter', 24, prey); w.schedule.push({ t: w.tick + 5000, fn: hunters }); }
    else w.schedule.push({ t: w.tick + 1500, fn: hunters });
  };
  this.schedule.push({ t: 6000, fn: hunters });
};

// ----- systems -----
function sysSchedule(w) {
  const s = w.schedule;
  for (let i = s.length - 1; i >= 0; i--) if (s[i].t <= w.tick) { const e = s[i]; s.splice(i, 1); e.fn(w); }
}
function sysImmigration(w) {
  // Optional rescue (off by default): when a whole feeding guild is missing, a few colonists drift in from off the map,
  // half from the guild's most prolific past animals and half from founder stock.
  const rate = w.P.immigration;
  if (w.start !== 'ecosystem' || rate <= 0 || w.tick < 3000 || w.tick % Math.round(1500 / rate)) return;
  let graz = 0, hunt = 0, flora = 0, algae = 0;
  for (const o of w.orgs) {
    if (!o.alive) continue;
    if (o.mobile) { if (o.carnEff > 0.3) hunt++; else if (o.herbEff > 0.3) graz++; }
    else if (o.photoEff > 0.3 && o.hab > 0.5) { if (o.water) algae++; else flora++; }
  }
  const pool = k => { const f = w.fame[k]; return { vary: 0.2, genome: f.length && w.rand() < 0.5 ? f[(w.rand() * f.length) | 0].genome : null }; };
  if (flora < 40) w.seedFounder('plant', 150, null, null, null, { vary: 0.25 });
  else if (algae < 40) w.seedFounder('alga', 150, null, null, null, { vary: 0.25 });
  else if (graz < 10) for (let i = 0; i < 4; i++) w.seedAt('grazer', 15, o => !o.mobile && !o.water, pool('grazer'));
  else if (hunt < 4 && graz >= 150 && w.tick >= 6000) w.seedScatter('hunter', 12, o => o.mobile && o.herbEff > 0.3, pool('hunter'));
}
function sysHatching(w) { // resting eggs and seeds wake where they were laid
  if (w.tick % 16) return;
  const now = w.tick, capS = w.P.maxPop * 0.7 * 1.1, capM = w.P.maxPop * 0.3 * 1.1;
  for (let b = 0; b < 2; b++) for (let bank = w.banks[b], mobile = b === 1, i = bank.length - 1; i >= 0; i--) {
    const e = bank[i];
    if (e.t > now) continue;
    if ((mobile ? w.nMobile > capM : w.nSessile > capS) && e.sp.n > w.P.maxPop * 0.02) { e.t = now + 400; continue; } // no room yet
    bank[i] = bank[bank.length - 1]; bank.pop();
    const sp = e.sp; sp.bank--;
    if (sp.died >= 0) { sp.died = -1; if (sp.peak >= 25) w.log('species', sp.name + ' re-emerged from resting ' + (mobile ? 'eggs' : 'seeds'), sp); }
    const child = w.spawn(e.genome, e.x, e.y, null, sp, e.gen, e.pid);
    w.births++; w.emit('birth', child, null);
  }
}
function sysEnvironment(w) {
  w.season = Math.sin(w.tick / C.YEAR * 6.2832);
  if (w.tick % 8) return;
  const N = w.N, cap = w.cap, k = C.NREGEN * 8;
  for (let c = 0; c < N.length; c++) N[c] += (cap[c] * C.NMAX - N[c]) * k;
}
function sysIndex(w) {
  if (w.tick & 1) return;
  const orgs = w.orgs, n = orgs.length;
  if (w.next.length < n) { w.next = new Int32Array(n * 2); w.rnext = new Int32Array(n * 2); }
  const head = w.head, mhead = w.mhead, agg = w.agg, next = w.next, hw = w.hw;
  head.fill(-1); mhead.fill(-1); agg.fill(0);
  let nm = 0, ns = 0;
  for (let i = 0; i < n; i++) {
    const o = orgs[i];
    if (!o.alive) continue;
    const c = ((o.y / C.HASH) | 0) * hw + ((o.x / C.HASH) | 0);
    if (o.mobile) { next[i] = mhead[c]; mhead[c] = i; nm++; }
    else { // rooted bodies are also summarised per cell, so distant vegetation is sensed as one patch
      next[i] = head[c]; head[c] = i; ns++;
      const v = o.rad > 2.5 ? 1 : o.rad * 0.4, g = o.genome, a = c * 6;
      agg[a] += v; agg[a + 1] += v * o.x; agg[a + 2] += v * o.y; agg[a + 3] += v * g[0]; agg[a + 4] += v * g[1]; agg[a + 5] += v * g[2];
    }
  }
  w.nMobile = nm; w.nSessile = ns;
}
const _cell = [];
function sysCanopy(w) {
  if (w.tick % C.SLOW) return;
  const orgs = w.orgs, n = orgs.length, rw = w.rw, rhead = w.rhead, rnext = w.rnext, N = w.N;
  rhead.fill(-1); w.cellGround.fill(1);
  for (let i = 0; i < n; i++) {
    const o = orgs[i];
    if (!o.alive || o.photoEff < 0.02) { o.gain = 0; continue; }
    const c = ((o.y / C.RES) | 0) * rw + ((o.x / C.RES) | 0);
    rnext[i] = rhead[c]; rhead[c] = i;
  }
  const A = C.RES * C.RES, g = w.P.gravity;
  for (let c = 0; c < rhead.length; c++) {
    if (rhead[c] < 0) continue;
    let m = 0;
    for (let j = rhead[c]; j >= 0; j = rnext[j]) {
      const o = orgs[j], st = o.B < o.size ? o.B : o.size;
      o._h = o.height * Math.sqrt(st) + (o.id % 97) * 1e-4; o._st = st;
      _cell[m++] = o;
    }
    for (let a = 1; a < m; a++) { // insertion sort, tallest first
      const o = _cell[a]; let b = a - 1;
      while (b >= 0 && _cell[b]._h < o._h) { _cell[b + 1] = _cell[b]; b--; }
      _cell[b + 1] = o;
    }
    let L = w.lightAtCell(c), total = 0;
    const L0 = L;
    w.cellLight[c] = L;
    for (let a = 0; a < m; a++) {
      const o = _cell[a];
      const leaf = 3.5 * Math.pow(o._st, 0.6667);
      const f = 1 - Math.exp(-C.LEAFK * leaf / A);
      o.gain = L * f * C.CELLGAIN * o.photoEff * o.therm * o.hab;
      L *= 1 - f; total += o.gain;
    }
    w.cellGround[c] = L / L0;
    const need = total * C.SLOW * C.NUSE;
    if (need > 0) {
      const s = N[c] >= need ? 1 : N[c] / need;
      N[c] -= need * s;
      if (s < 1) for (let a = 0; a < m; a++) _cell[a].gain *= s;
    }
  }
}

function bite(a, t, w) {
  const ast = a.B < a.size ? a.B : a.size;
  if (a.cool > 0 || a.B > a.full * 1.3) return;
  let amt = C.BITE * ast * (1 - 0.8 * t.armor) * (t.mobile ? 2 : 1);
  if (t.mobile) { const tst = t.B < t.size ? t.B : t.size; if (tst > ast) { const q = ast / tst; amt *= q * q; } } // larger animals are hard to bite
  if (amt > t.B) amt = t.B;
  if (!t.mobile) {
    const tst = t.B < t.size ? t.B : t.size;
    if (t.height * Math.sqrt(tst) > a.reach) return; // foliage above the grazer's reach is safe
    const stub = t.B - 0.45 * t.peak; if (stub <= 0) return; if (amt > stub) amt = stub; // roots survive grazing
  }
  // a bigger gut ferments plant matter more completely, so very small grazers extract less from each bite
  const gut = a.gut; // set by the adult body plan
  const gp = amt * t.plantness * a.herbEff * C.DIGEST * gut, gm = amt * (1 - t.plantness) * a.carnEff * (C.FLESH + C.RICH * t.herbEff); // plant-eaters have concentrated their food: their flesh is the richest
  if (gp + gm < 0.1 * amt) return; // nothing here it can digest
  const gainE = gp + gm - amt * t.toxin * 0.9;
  t.B -= amt; a.B += gainE; a.cool = C.HANDLE + C.DIGTIME * amt / ast; // a big meal takes time to digest
  a.inPlant += gp; a.inMeat += gm;
  if (t.sp === a.sp) a.inKin += gp + gm;
  if (t.B < 0.4 * t.peak || t.B < 0.05) w.kill(t, 'eaten', a);
}

// scent of kind: 1 for the same species, 0.6 for another species of the same genus, 0 for strangers
function kinship(a, b) { return a === b ? 1 : a.clan === b.clan ? 0.6 : 0; }
const _in = new Float32Array(NI), _hid = new Float32Array(NH);
function sysBehaviour(w) {
  const orgs = w.orgs, n = orgs.length, head = w.head, mhead = w.mhead, agg = w.agg, next = w.next, hw = w.hw, hh = w.hh;
  const rand = w.rand, grav = w.P.gravity, sea = w.P.seaLevel, nG = w.nG, W = w.W, H = w.H, tick = w.tick;
  for (let i = 0; i < n; i++) {
    const o = orgs[i];
    if (!o.alive) continue;
    if (!o.mobile) continue;
    let target = null;
    if (((tick + o.id) & 1) === 0) { // sense and think on alternate ticks; act on the last decision in between
    const R = o.range, R2 = R * R, ch = Math.cos(o.h), sh = Math.sin(o.h), herbV = o.herbEff * C.DIGEST, carnV = o.carnEff * C.FLESH;
    let tgap = 0, md = R, mside = 0, mrel = 0, msal = 0;
    let sR = 0, sG = 0, sB = 0, fR = 0, fG = 0, fB = 0, mR = 0, mG = 0, mB = 0, nd = R, near = null, nside = 0, nfwd = 0;
    const cx0 = Math.max(0, ((o.x - R) / C.HASH) | 0), cx1 = Math.min(hw - 1, ((o.x + R) / C.HASH) | 0);
    const cy0 = Math.max(0, ((o.y - R) / C.HASH) | 0), cy1 = Math.min(hh - 1, ((o.y + R) / C.HASH) | 0);
    const ocx = (o.x / C.HASH) | 0, ocy = (o.y / C.HASH) | 0;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = cy * hw + cx, close = cx - ocx <= 1 && ocx - cx <= 1 && cy - ocy <= 1 && ocy - cy <= 1;
      if (!close) { // far vegetation: one summed patch per cell
        const a = c * 6, wv = agg[a];
        if (wv > 0) {
          const dx = agg[a + 1] / wv - o.x, dy = agg[a + 2] / wv - o.y, d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            const d = Math.sqrt(d2) + 1e-6, vis = 1 - d / R, fwd = (dx * ch + dy * sh) / d * vis, side = (dy * ch - dx * sh) / d * vis;
            sR += agg[a + 3] * side; sG += agg[a + 4] * side; sB += agg[a + 5] * side;
            fR += agg[a + 3] * fwd; fG += agg[a + 4] * fwd; fB += agg[a + 5] * fwd;
          }
        }
      }
      for (let lst = 0; lst < 2; lst++) for (let j = lst ? (close ? head[c] : -1) : mhead[c]; j >= 0; j = next[j]) {
        if (j === i) continue;
        const t = orgs[j];
        if (!t.alive) continue;
        const dx = t.x - o.x, dy = t.y - o.y, d2 = dx * dx + dy * dy;
        if (d2 > R2) continue;
        const d = Math.sqrt(d2) + 1e-6;
        const gap = d - o.rad - t.rad; // surface-to-surface: the nearest body is the one it would bite
        if (gap < 0 && !t.mobile && t.biter) bite(t, o, w);
        const fwd = (dx * ch + dy * sh) / d, side = (dy * ch - dx * sh) / d;
        const vis = (1 - d / R) * (t.rad > 2.5 ? 1 : t.rad * 0.4) * t.cover, g = t.genome;
        sR += vis * g[0] * side; sG += vis * g[1] * side; sB += vis * g[2] * side;
        fR += vis * g[0] * fwd; fG += vis * g[1] * fwd; fB += vis * g[2] * fwd;
        if (t.mobile) {
          const mv = vis * t.thrust * t.speed * 3 * side; mR += mv * g[0]; mG += mv * g[1]; mB += mv * g[2]; // movement stands out from vegetation
          // nearest moving animal of another species: kind is told apart by scent, so colour mimicry cannot hide it
          if (gap < R * t.cover && t.thrust * t.speed > 0.05 && kinship(o.sp, t.sp) === 0) {
            const sal = t.rad * t.rad / (gap > 0 ? gap + 1 : 1); // attention goes to what looms largest, not merely what is nearest
            if (sal > msal) { msal = sal; md = gap; mside = side; mrel = t.rad / o.rad; }
          }
        }
        if (gap < nd) { nd = gap; near = t; nside = side; nfwd = fwd; }
        // the mouth closes on the most deeply overlapped body it can actually digest
        if (gap < tgap && t.plantness * herbV + (1 - t.plantness) * carnV >= 0.1) { tgap = gap; target = t; }
      }
    }
    if (!o.alive) continue;
    const I = _in;
    I[0] = 1; I[1] = o.B / o.full;
    I[2] = sR; I[3] = sG; I[4] = sB; I[5] = fR; I[6] = fG; I[7] = fB;
    if (near) {
      const nb = target || near; // kin sense reads the body in the mouth if there is one
      I[8] = nside; I[9] = nfwd; I[10] = nd <= 0 ? 1 : 1 - nd / R; // 1 means touching
      I[11] = Math.tanh(Math.log((near.rad + 0.01) / o.rad) * 3);
      I[12] = kinship(o.sp, nb.sp);
    } else { I[8] = I[9] = I[10] = I[11] = I[12] = 0; }
    // look ahead
    const ax = o.x + ch * 10, ay = o.y + sh * 10;
    let habA, thA;
    if (ax < 0 || ay < 0 || ax >= W || ay >= H) { habA = 0; thA = 0; }
    else {
      habA = w.elevAt(ax, ay) < sea ? o.aqua : 1 - o.aqua;
      if (((tick + o.id) & 7) === 0) { const d = (w.tempAt(ax, ay) - o.topt) / o.ttol; o._thA = Math.exp(-d * d); }
      thA = o._thA;
    }
    I[13] = habA - o.hab; I[14] = (thA - o.therm) * 4; I[15] = rand() * 2 - 1; I[16] = mR; I[17] = mG; I[18] = mB; I[19] = o.cool > 0 ? 1 : 0;
    if (md < R) { I[20] = mside; I[21] = md <= 0 ? 1 : 1 - md / R; I[22] = Math.tanh(Math.log(mrel) * 3); } else { I[20] = I[21] = I[22] = 0; }
    // brain
    const g = o.genome; let k = nG;
    for (let h = 0; h < NH; h++) {
      let s = 0;
      for (let a = 0; a < NI; a++) s += g[k++] * I[a];
      _hid[h] = Math.tanh(s);
    }
    let o0 = 0, o1 = 0, o2 = 0;
    for (let h = 0; h < NH; h++) o0 += g[k++] * _hid[h]; o0 += g[k++];
    for (let h = 0; h < NH; h++) o1 += g[k++] * _hid[h]; o1 += g[k++];
    for (let h = 0; h < NH; h++) o2 += g[k++] * _hid[h]; o2 += g[k++];
    o.turn = Math.tanh(o0) * 0.3; o.thrust = 1 / (1 + Math.exp(-o1)); o.mouth = o2;
    }
    o.h += o.turn;
    const thrust = o.thrust, o2 = o.mouth;
    // move
    const st = o.B < o.size ? o.B : o.size;
    const v = thrust * 2.4 * o.speed * (1 - 0.5 * o.armor) * (0.25 + 0.75 * o.hab) * (0.4 + 0.4 * o.rad); // stride grows with the body
    const e0 = w.elevAt(o.x, o.y);
    let nx = o.x + Math.cos(o.h) * v, ny = o.y + Math.sin(o.h) * v;
    if (nx < 1) { nx = 1; o.h += 1.6; } else if (nx > W - 1) { nx = W - 1; o.h += 1.6; }
    if (ny < 1) { ny = 1; o.h += 1.6; } else if (ny > H - 1) { ny = H - 1; o.h += 1.6; }
    o.x = nx; o.y = ny;
    let cost = C.MOVE * st * v * v * (o.water ? 0.5 : grav);
    if (!o.water) { const de = w.elevAt(nx, ny) - e0; if (de > 0) cost += grav * st * de * 1.5; }
    o.B -= cost;
    if (target && o2 > 0 && o.biter && target.alive) bite(o, target, w);
  }
}

function sysMetabolism(w) {
  const orgs = w.orgs, n = orgs.length, rand = w.rand, grav = w.P.gravity, tick = w.tick;
  const mods = upkeepModifiers, SLOW = C.SLOW, mask = SLOW - 1;
  // rooted and motile life have separate ceilings (70% / 30%), so a carpet of seedlings cannot crowd out animal births
  const capS = w.P.maxPop * 0.7, capM = w.P.maxPop * 0.3;
  const rare = w.P.maxPop * 0.02;
  const crowdS = Math.min(1, (capS - w.nSessile) / (0.12 * capS)), crowdM = Math.min(1, (capM - w.nMobile) / (0.12 * capM));
  for (let i = 0; i < n; i++) {
    const o = orgs[i];
    if (!o.alive) continue;
    const turn = ((tick + o.id) & mask) === 0;
    let dt = 1;
    if (o.mobile) { if (turn) w.refresh(o); }
    else { if (!turn) continue; dt = SLOW; w.refresh(o); } // sessile life runs on a slower clock
    const adult = o.B >= o.size, st = adult ? o.size : o.B;
    if (st > o.peak) o.peak = st;
    if (o.gain > 0) { o.B += o.gain * dt; o.inPhoto += o.gain * dt; }
    const mis = 1 - o.hab;
    let up = (adult ? o.upA : C.UPKEEP * (Math.pow(st, 0.75) + o.floor) * o.costMult) * (1 + 1.5 * (1 - o.therm)) * (1 + 1.5 * mis * mis);
    up += grav * (o.water ? 0.15 : 1) * (adult ? o.supA : C.SUPPORT * Math.pow(st, 1.2) + C.STEM * o.height * o.height * st);
    for (let m = 0; m < mods.length; m++) up *= mods[m](o, w);
    o.B -= up * dt; o.age += dt; if (o.cool > 0) o.cool -= dt;
    if (o.B > o.full * 1.5) o.B = o.full * 1.5;
    if (o.B < C.STARVE * o.peak) w.kill(o, 'starved');
    else if (o.age > o.life) w.kill(o, 'old');
    else if (rand() < C.HAZARD * dt) w.kill(o, 'hazard');
    else if (o.B >= o.full && o.age >= 30) {
      // the ceiling is a performance guard, not ecology: it never squeezes out a rare lineage
      const crowd = o.mobile ? crowdM : crowdS;
      if (crowd >= 1 || rand() < crowd || (o.sp.n < rare && crowd > -1)) w.reproduce(o);
    }
  }
}

WP.reproduce = function (o) {
  const p = o.p, rand = this.rand;
  const each = p.eggB * 1.1 * (1 + 0.3 * p.disperse);
  let k = Math.round(p.clutch);
  const spare = o.B - p.size * C.KEEP; // a parent never spends below this share of its adult mass
  if (k * each > spare) k = Math.floor(spare / each);
  if (k < 1) return 0;
  o.B -= k * each;
  let mate;
  const reach = p.mobile ? 3 + p.disperse * 12 : (3 + p.disperse * 70) / Math.sqrt(this.P.gravity);
  for (let c = 0; c < k; c++) {
    const a = rand() * 6.2832, d = reach * (0.3 + 0.7 * rand());
    const x = clamp(o.x + Math.cos(a) * d, 1, this.W - 1), y = clamp(o.y + Math.sin(a) * d, 1, this.H - 1);
    if (p.plantness > 0.05) { // seeds need light at ground level to establish
      const ground = this.cellGround[((y / C.RES) | 0) * this.rw + ((x / C.RES) | 0)];
      if (rand() > 1 - p.plantness * (1 - ground)) continue;
    }
    let src = o.genome;
    if (mate === undefined) mate = p.sex > 0.02 ? this.findMate(o) : null;
    if (mate && rand() < p.sex) { src = this.recombine(src, mate.genome); this.sexual++; }
    const genome = this.mutate(src, p.mut);
    const sp = this.assignSpecies(genome, o.sp);
    if (p.dorm > 0.01 && rand() < p.dorm) { this.layResting(genome, x, y, sp, o.gen + 1, o.id, p.rest); o.kids++; continue; }
    const child = this.spawn(genome, x, y, p.eggB, sp, o.gen + 1, o.id);
    o.kids++; this.births++;
    this.emit('birth', child, o);
  }
  return k;
};

function sysSweep(w) {
  if (w.tick % 16 !== 15) return;
  const orgs = w.orgs; let k = 0;
  for (let i = 0; i < orgs.length; i++) if (orgs[i].alive) orgs[k++] = orgs[i];
  orgs.length = k;
}

const ROLES = ['Phototroph', 'Herbivore', 'Carnivore', 'Omnivore', 'Mixotroph'];
function roleOf(ph, pl, me, mean) {
  let t = ph + pl + me;
  if (t < 1e-3 && mean) { // no realised intake yet: read the genes
    ph = mean[G.photo] * (1 - mean[G.speed]); pl = mean[G.herb]; me = mean[G.carn]; t = ph + pl + me + 1e-6;
  }
  ph /= t; pl /= t; me /= t;
  if (ph > 0.7) return 0;
  if (pl > 0.7) return 1;
  if (me > 0.7) return 2;
  if (ph > 0.25) return 4;
  return 3;
}
function tagsOf(sp, w) {
  const m = sp.mean, t = [], v = k => toReal(GENES[G[k]], m[G[k]]);
  const mobile = v('speed') > 0.08, it = sp.intake, tot = it[0] + it[1] + it[2] + 1e-6;
  if (v('aqua') > 0.65) t.push('aquatic'); else if (v('aqua') > 0.35) t.push('amphibious');
  if (!mobile && (it[1] + it[2]) / tot > 0.25) t.push('sessile ambusher');
  if (mobile && it[0] / tot > 0.3) t.push('motile phototroph');
  if (v('toxin') > 0.35) t.push('toxic');
  if (v('armor') > 0.35) t.push('armoured');
  if (v('height') > 0.6 && sp.role === 0) t.push('canopy');
  if (v('height') < 0.12 && sp.role === 0) t.push('ground cover');
  if (v('size') > 25) t.push('giant'); else if (v('size') < 1.2) t.push('minute');
  if (it[3] / tot > 0.2) t.push('cannibal');
  if (v('clutch') > 3.5 && v('egg') < 0.2) t.push('broadcast spawner');
  if (v('dorm') > 0.5) t.push('bet-hedger');
  if (v('sex') > 0.7) t.push('outcrossing'); else if (v('sex') < 0.12) t.push('clonal');
  if (v('egg') > 0.45) t.push('heavy parental investment');
  if (v('topt') < 3) t.push('cold-adapted'); else if (v('topt') > 30) t.push('heat-adapted');
  if (mobile && v('speed') > 0.75) t.push('sprinter');
  if (mobile && v('sense') < 0.15) t.push('near-blind');
  return t;
}

function sysCensus(w) {
  if (w.tick % 100) return;
  w.census();
}
WP.census = function () {
  const w = this, nG = w.nG, nA = w.nGenome, orgs = w.orgs;
  for (const sp of w.species.values()) { sp._sum = null; }
  const gsum = new Float64Array(nG), roles = [0, 0, 0, 0, 0], mass = [0, 0, 0, 0, 0];
  let pop = 0, genSum = 0;
  for (let i = 0; i < orgs.length; i++) {
    const o = orgs[i]; if (!o.alive) continue;
    const sp = o.sp;
    if (!sp._sum) { sp._sum = new Float64Array(nA); sp._it = [0, 0, 0, 0]; sp._c = 0; }
    const s = sp._sum, g = o.genome;
    for (let k = 0; k < nG; k++) { s[k] += g[k]; gsum[k] += g[k]; }
    for (let k = nG; k < nA; k++) s[k] += g[k];
    sp._it[0] += o.inPhoto; sp._it[1] += o.inPlant; sp._it[2] += o.inMeat; sp._it[3] += o.inKin; sp._c++;
    pop++; genSum += o.gen;
  }
  let alive = 0;
  for (const sp of w.species.values()) {
    if (!sp._sum) { if (sp.n === 0) w.checkExtinct(sp); continue; }
    if (sp.n === 0) continue;
    alive++;
    const m = sp.mean;
    for (let k = 0; k < nA; k++) m[k] = sp._sum[k] / sp._c;
    sp._sum = null;
    sp.col = [m[0], m[1], m[2]];
    sp.intake = sp._it;
    sp.role = roleOf(sp._it[0], sp._it[1], sp._it[2], m);
    sp.tags = tagsOf(sp, w);
    roles[sp.role] += sp._c;
    sp.hist.push(w.tick, sp._c);
    if (sp.hist.length > 1600) { const h = sp.hist, o2 = []; for (let i = 0; i < h.length; i += 4) o2.push(h[i], h[i + 1]); sp.hist = o2; }
    if (!sp.logged && sp._c >= 25) {
      sp.logged = true; const par = w.species.get(sp.parent);
      w.log('species', sp.name + ' (' + ROLES[sp.role].toLowerCase() + ') established' + (par ? ', from ' + par.name : ''), sp);
    }
  }
  const mean = new Float32Array(nG);
  if (pop) for (let k = 0; k < nG; k++) mean[k] = gsum[k] / pop;
  w.history.push({ t: w.tick, pop, roles, species: alive, mean, gen: pop ? genSum / pop : 0, maxGen: w.maxGen });
  if (w.history.length > 1200) { const h = w.history; w.history = h.filter((_, i) => i % 2 === 0 || i > h.length - 200); }
  if (w.tick % 2000 === 0) w.compact();
  w.emit('sample', w.history[w.history.length - 1]);
};
WP.compact = function () { // drop transient extinct twigs, reparent their descendants
  const sp = this.species, gone = [];
  for (const s of sp.values()) if (s.n === 0 && !s.bank && s.peak < 6 && s.parent) gone.push(s);
  if (!gone.length) return;
  const map = new Map();
  for (const s of gone) map.set(s.id, s.parent);
  const resolve = id => { while (map.has(id)) id = map.get(id); return id; };
  for (const s of gone) sp.delete(s.id);
  for (const s of sp.values()) if (map.has(s.parent)) s.parent = resolve(s.parent);
};

WP.step = function () {
  const s = this.systems;
  for (let i = 0; i < s.length; i++) s[i].fn(this);
  this.tick++;
};
WP.run = function (n) { for (let i = 0; i < n; i++) this.step(); };

const ALife = { World, GENES, G, C, ROLES, FOUNDERS, INPUT_LABELS, OUTPUT_LABELS, NI, NH, NO, BRAIN_N,
  registerGene, registerDerive, registerFounder, upkeepModifiers, express, toReal, toNorm, roleOf };
if (typeof module !== 'undefined' && module.exports) module.exports = ALife; else root.ALife = ALife;
})(typeof window !== 'undefined' ? window : globalThis);
