// util.js — deterministic helpers. Nothing here keeps state between frames.
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const mulberry32 = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hash = (i, s = 0) => mulberry32(Math.imul(i | 0, 374761393) ^ Math.imul(s | 0, 668265263) ^ 0x5bd1e995)();
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const smooth = x => x * x * (3 - 2 * x);
const E = {
  lin: x => x,
  inOut: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  out: x => 1 - Math.pow(1 - x, 3),
  in: x => x * x * x,
  out2: x => 1 - (1 - x) * (1 - x),
  in2: x => x * x,
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  inExpo: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
  outBack: x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  sine: x => -(Math.cos(Math.PI * x) - 1) / 2,
  step: x => x >= 1 ? 1 : 0,
};
const noise1 = (x, seed = 0) => { const i = Math.floor(x), f = x - i; return lerp(hash(i, seed), hash(i + 1, seed), smooth(f)) * 2 - 1; };
const fbm1 = (x, seed = 0) => noise1(x, seed) * .6 + noise1(x * 2.13, seed + 7) * .3 + noise1(x * 4.37, seed + 13) * .1;

// keyframes [[t, v, ease?], ...]; a key's ease shapes the segment that arrives at it
function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    if (t <= t1) { const [t0, v0] = keys[i - 1]; const k = (e || E.inOut)((t - t0) / (t1 - t0)); return v0 + (v1 - v0) * k; }
  }
  return keys[keys.length - 1][1];
}

// 2D vectors as [x, y]
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, k) => [a[0] * k, a[1] * k],
  len: a => Math.hypot(a[0], a[1]),
  norm: a => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; },
  lerp: (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k],
  // phi in degrees, clockwise from straight up (screen space, y down)
  dir: phi => [Math.sin(phi * D2R), -Math.cos(phi * D2R)],
  rot: (a, deg) => { const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R); return [a[0] * c - a[1] * s, a[0] * s + a[1] * c]; },
  axpy: (o, a, k) => [o[0] + a[0] * k, o[1] + a[1] * k],
};

// smooth closed/open path through points; a point [x, y, 1] is a sharp corner
function splinePath(ctx, pts, dx = 0, dy = 0, closed = true) {
  const n = pts.length, at = i => closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)];
  ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const k1 = p1[2] ? 0 : 1 / 6, k2 = p2[2] ? 0 : 1 / 6;
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k1 + dx, p1[1] + (p2[1] - p0[1]) * k1 + dy,
      p2[0] - (p3[0] - p1[0]) * k2 + dx, p2[1] - (p3[1] - p1[1]) * k2 + dy, p2[0] + dx, p2[1] + dy);
  }
  if (closed) ctx.closePath();
}

const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const mixHex = (h1, h2, k) => { const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const c = s => Math.round(lerp(a >> s & 255, b >> s & 255, k)); return `rgb(${c(16)},${c(8)},${c(0)})`; };

// offscreen canvas cache: built once per key, deterministic contents
const CACHE = new Map();
function cached(key, w, h, paint) {
  if (CACHE.has(key)) return CACHE.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h); CACHE.set(key, c); return c;
}
