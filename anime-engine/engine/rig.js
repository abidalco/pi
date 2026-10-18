// rig.js — SORA, the hero. A 3/4-right cut-out rig drawn as cel-shaded parts.
// World units: standing height ≈ 96. Angles in degrees, clockwise from straight up (screen space).

const PAL = {
  line: '#21162a',
  skin: { lit: '#ffe4d2', sh: '#eba08c', rim: '#fff6e6' },
  hair: { lit: '#323366', sh: '#1a1836', rim: '#ff9f6e', band: '#6670bb' },
  jacket: { lit: '#36477f', sh: '#1d2548', rim: '#ffa46b' },
  accent: { lit: '#ff8b2b', sh: '#c4501a', rim: '#ffd9a0' },
  shirt: { lit: '#f7f3f6', sh: '#b9b1d0', rim: '#ffffff' },
  pants: { lit: '#3d3946', sh: '#201d29', rim: '#ff9a6a' },
  shoe: { lit: '#f7f4ef', sh: '#b4acc9', rim: '#ffffff' },
  sole: { lit: '#e3333f', sh: '#9b1a2f', rim: '#ff8f5e' },
  scarf: { lit: '#ea3340', sh: '#9a1830', rim: '#ffa774' },
  iris: ['#3c1407', '#c45f12', '#ffcf5e'],
  mouth: '#5e1427', tongue: '#ec7680', blush: '#ff6f7d',
};

const BASE = {
  x: 0, y: 0, rot: 0, lean: 4, curl: 0, neck: 4, head: -3,
  shN: 10, elN: 18, wrN: 0, shF: -8, elF: 14, wrF: 0, fistN: 1, fistF: 1,
  hipN: 3, knN: 5, anN: 0, hipF: -3, knF: 5, anF: 0,
  eye: 1, narrow: 0, lookX: .35, lookY: 0, mouth: 0, grit: 0, smile: 0, brow: 0,
  tired: 0, sweat: 0, blush: 0, squash: 0, glint: 0,
};
const P = o => Object.assign({}, BASE, o);
const mixPose = (a, b, k) => { const o = {}; for (const key in BASE) o[key] = lerp(a[key] ?? BASE[key], b[key] ?? BASE[key], k); return o; };
function poseKeys(t, keys) {          // [[t, pose, ease?], ...]
  if (t <= keys[0][0]) return P(keys[0][1]);
  for (let i = 1; i < keys.length; i++) {
    const [t1, p1, e] = keys[i];
    if (t <= t1) { const [t0, p0] = keys[i - 1]; return mixPose(P(p0), P(p1), (e || E.inOut)((t - t0) / (t1 - t0))); }
  }
  return P(keys[keys.length - 1][1]);
}

const LEN = { ua: 15.5, fa: 13.5, th: 23, sn: 22.5 };
let HEAD_R = 8.8, HK = HEAD_R / 50;           // head drawn in a 50-radius local space

// ---------------------------------------------------------------- skeleton
// ---------------------------------------------------------------- image-part characters
// A character drawn from PNG parts (engine/characters/<name>/char.js). CHAR = null → SORA, drawn in code.
let CHAR = null;
const CHARACTERS = {};
const ENGINE_BASE = document.currentScript ? document.currentScript.src.replace(/rig\.js$/, '') : '';
// load engine/characters/<name>/char.js on demand, then wait for its images
function useCharacter(name) {
  if (!name || name === 'sora') { CHAR = null; return Promise.resolve(); }
  const ready = () => { CHAR = CHARACTERS[name]; return Promise.all(Object.values(CHAR.img).map(im => im.decode().catch(() => {}))); };
  if (CHARACTERS[name]) return ready();
  return new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = ENGINE_BASE + 'characters/' + name + '/char.js';
    sc.onload = () => res(ready()); sc.onerror = () => rej(new Error('no character: ' + name)); document.head.appendChild(sc);
  });
}
function registerCharacter(def, base) {
  def.img = {};
  for (const [k, v] of [...Object.entries(def.parts), ...Object.entries(def.faces || {}).map(([n, f]) => ['face_' + n, f]),
    ...Object.entries(def.sprites || {}).map(([n, f]) => ['spr_' + n, f])]) {
    const im = new Image(); im.src = base + v.img; def.img[k] = im;
  }
  def.headH = (def.parts.head.pivot[1] - def.parts.head.to[1]) * def.k;
  CHARACTERS[def.name] = def;
}

function solve(p) {
  if (CHAR) p = { ...p, lean: p.lean + p.curl * .6, curl: 0 };      // image torsos are rigid: fold the curl into the lean
  const pr = CHAR ? CHAR.prop : null;
  const S = { p };
  const phiP = p.rot, phiS = p.rot + p.lean, phiU = phiS + p.curl;
  const u = V.dir(phiS), f = V.dir(phiS + 90);
  const O = [p.x, p.y];
  // torso-space point: fx forward, uy up; curl bends the chest forward smoothly
  S.map = (fx, uy) => {
    let q = [fx, uy];
    if (p.curl) {
      const a = p.curl * smooth(clamp((uy - 6) / 22)) * D2R, c = Math.cos(a), s = Math.sin(a);
      const y = uy - 6; q = [fx * c + y * s, -fx * s + y * c + 6];
    }
    return [O[0] + f[0] * q[0] + u[0] * q[1], O[1] + f[1] * q[0] + u[1] * q[1]];
  };
  S.phiP = phiP; S.phiS = phiS; S.phiU = phiU;
  S.neck0 = pr ? S.map(...pr.neck0) : S.map(0.6, 28.2);
  S.phiNeck = phiU + p.neck;
  S.neck1 = V.axpy(S.neck0, V.dir(S.phiNeck), pr ? pr.neckLen : 4.4);
  S.phiHead = S.phiNeck + p.head;
  S.scarfAnchor = S.map(-3.6, 30.2);
  for (const s of ['N', 'F']) {
    const sho = pr ? S.map(...pr['shoulder' + s]) : s === 'N' ? S.map(1.6, 25.6) : S.map(-2.4, 26.2);
    const pUA = phiU + 180 - p['sh' + s], el = V.axpy(sho, V.dir(pUA), pr ? pr.ua : LEN.ua);
    const pFA = pUA - p['el' + s], wr = V.axpy(el, V.dir(pFA), pr ? pr.fa : LEN.fa);
    S['arm' + s] = { sho, el, wr, pUA, pFA, pH: pFA - p['wr' + s], fist: p['fist' + s] };
    const hip = pr ? S.map(...pr['hip' + s]) : s === 'N' ? S.map(1.4, 0.8) : S.map(-1.4, 0.8);
    const pTh = phiP + 180 - p['hip' + s], kn = V.axpy(hip, V.dir(pTh), pr ? pr.th : LEN.th);
    const pSn = pTh + p['kn' + s], an = V.axpy(kn, V.dir(pSn), pr ? pr.sn : LEN.sn);
    const pFt = pSn - 90 + p['an' + s];
    const fd = V.dir(pFt), fn = V.dir(pFt + 90);
    const so = pr ? pr.sole : [[-2.8, 3.4], [9.2, 3.4]];
    const sole = so.map(([a, b]) => V.add(an, V.add(V.mul(fd, a), V.mul(fn, b))));
    S['leg' + s] = { hip, kn, an, pTh, pSn, pFt, sole };
  }
  return S;
}
// lowest sole point (for planting feet on a floor)
const footLow = S => Math.max(...S.legN.sole.map(q => q[1]), ...S.legF.sole.map(q => q[1]));

// ---------------------------------------------------------------- cel painting
let SIL = null;          // silhouette override colour (shadows, ghosts, impact frames)
let LW = 0.7;            // outline width in current units
function celFill(ctx, build, pal, L) {
  if (SIL) { ctx.beginPath(); build(0, 0); ctx.fillStyle = SIL; ctx.fill(); return; }
  ctx.save();
  ctx.beginPath(); build(0, 0); ctx.clip();
  ctx.fillStyle = L.r > 0 ? pal.rim : pal.lit; ctx.fill();
  const rx = -L.x * L.r, ry = -L.y * L.r;
  ctx.beginPath(); build(rx, ry); ctx.clip();
  ctx.fillStyle = pal.sh; ctx.fill();
  ctx.beginPath(); build(L.x * L.s, L.y * L.s); ctx.fillStyle = pal.lit; ctx.fill();
  ctx.restore();
}
function outline(ctx, build, w = LW * 2) {
  ctx.beginPath(); build(0, 0); ctx.lineWidth = w; ctx.strokeStyle = SIL || PAL.line; ctx.stroke();
}
// a group shares one outer outline; parts: [build, pal, L]
function group(ctx, parts) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const [b] of parts) outline(ctx, b);
  for (const [b, pal, L] of parts) celFill(ctx, b, pal, L);
}
function capsule(a, b, ra, rb) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return (ctx, dx = 0, dy = 0) => {
    ctx.arc(a[0] + dx, a[1] + dy, ra, ang + Math.PI / 2, ang + Math.PI * 1.5);
    ctx.arc(b[0] + dx, b[1] + dy, rb, ang - Math.PI / 2, ang + Math.PI / 2);
    ctx.closePath();
  };
}
// light vector expressed in a rotated + scaled local frame
const localL = (L, deg, k = 1) => { const v = V.rot([L.x, L.y], -deg); return { x: v[0], y: v[1], s: L.s / k, r: L.r / k }; };
const farL = L => ({ x: L.x, y: L.y, s: L.s * 2.6, r: L.r * .6 });

// band across a capsule between fractions a..b of its length (sleeve stripes, cuffs)
function band(ctx, p0, p1, fa, fb, w, pal, L) {
  if (SIL) return;
  const d = V.norm(V.sub(p1, p0)), n = [-d[1], d[0]];
  const A = V.lerp(p0, p1, fa), B = V.lerp(p0, p1, fb);
  const q = [V.axpy(A, n, w), V.axpy(B, n, w), V.axpy(B, n, -w), V.axpy(A, n, -w)];
  const build = (dx, dy) => { ctx.moveTo(q[0][0] + dx, q[0][1] + dy); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0] + dx, q[i][1] + dy); ctx.closePath(); };
  celFill(ctx, build, pal, L);
}

// ---------------------------------------------------------------- parts
function handBuild(ctx, wr, phi, fist, k = 1) {
  const d = V.dir(phi), n = V.dir(phi + 90);
  const P2 = (x, y) => [wr[0] + d[0] * x * k + n[0] * y * k, wr[1] + d[1] * x * k + n[1] * y * k];
  // fist: compact rounded block; open: long mitten with the thumb out
  const pts = fist > .5
    ? [P2(-.6, -2.3), P2(2.6, -2.9), P2(5.1, -2.0), P2(5.7, 0.4), P2(4.9, 2.6), P2(2.2, 3.0), P2(0.2, 2.4), P2(-.8, 0)]
    : [P2(-.4, -2.0), P2(3.4, -2.3), P2(6.8, -1.5), P2(7.6, 0.3), P2(6.6, 1.7), P2(3.6, 2.0), P2(2.6, 3.9), P2(1.0, 3.3), P2(-.5, 1.6)];
  return (c, dx = 0, dy = 0) => splinePath(c, pts, dx, dy, true);
}

function shoeBuild(an, phi) {
  const d = V.dir(phi), n = V.dir(phi + 90);
  const P2 = (x, y) => [an[0] + d[0] * x + n[0] * y, an[1] + d[1] * x + n[1] * y];
  const upper = [P2(-2.6, -4.2), P2(-3.3, 0.4), P2(-2.9, 2.6), P2(8.6, 2.6), P2(10.2, 1.2), P2(9.4, -0.6), P2(6.0, -1.6), P2(2.6, -3.4), P2(1.9, -5.0)];
  const sole = [P2(-3.1, 2.1), P2(-2.9, 3.6, 1), P2(9.2, 3.6, 1), P2(10.4, 1.7), P2(9.9, 1.2), P2(8.8, 2.1)];
  return { upper: (c, dx = 0, dy = 0) => splinePath(c, upper, dx, dy), sole: (c, dx = 0, dy = 0) => splinePath(c, sole, dx, dy),
    lace: [P2(2.3, -2.9), P2(5.6, -1.3)], stripe: [P2(-1.6, 0.6), P2(4.6, 0.2)] };
}

function drawLeg(ctx, S, side, L) {
  const g = S['leg' + side];
  const thigh = capsule(g.hip, g.kn, 4.7, 3.7), shin = capsule(g.kn, g.an, 3.6, 3.1);
  group(ctx, [[(dx, dy) => shin(ctx, dx, dy), PAL.pants, L], [(dx, dy) => thigh(ctx, dx, dy), PAL.pants, L]]);
  const sh = shoeBuild(g.an, g.pFt);
  ctx.lineJoin = 'round';
  outline(ctx, (dx, dy) => sh.upper(ctx, dx, dy)); outline(ctx, (dx, dy) => sh.sole(ctx, dx, dy));
  celFill(ctx, (dx, dy) => sh.upper(ctx, dx, dy), PAL.shoe, L);
  celFill(ctx, (dx, dy) => sh.sole(ctx, dx, dy), PAL.sole, L);
  if (!SIL) {
    ctx.lineWidth = LW * .8; ctx.strokeStyle = PAL.line; ctx.beginPath();
    ctx.moveTo(...sh.lace[0]); ctx.lineTo(...sh.lace[1]); ctx.stroke();
    ctx.strokeStyle = PAL.accent.lit; ctx.lineWidth = LW * 1.4; ctx.beginPath();
    ctx.moveTo(...sh.stripe[0]); ctx.lineTo(...sh.stripe[1]); ctx.stroke();
  }
}

function drawArm(ctx, S, side, L) {
  const a = S['arm' + side];
  const ua = capsule(a.sho, a.el, 3.6, 3.0), fa = capsule(a.el, a.wr, 3.0, 2.7);
  const hand = handBuild(ctx, a.wr, a.pH, a.fist);
  ctx.lineJoin = 'round';
  outline(ctx, (dx, dy) => hand(ctx, dx, dy));
  celFill(ctx, (dx, dy) => hand(ctx, dx, dy), PAL.skin, L);
  group(ctx, [[(dx, dy) => fa(ctx, dx, dy), PAL.jacket, L], [(dx, dy) => ua(ctx, dx, dy), PAL.jacket, L]]);
  // orange stripe on the upper sleeve, cuff at the wrist
  ctx.save(); ctx.beginPath(); ua(ctx); ctx.clip(); band(ctx, a.sho, a.el, .38, .52, 4.2, PAL.accent, L); ctx.restore();
  ctx.save(); ctx.beginPath(); fa(ctx); ctx.clip(); band(ctx, a.el, a.wr, .84, 1.1, 3.6, PAL.accent, L); ctx.restore();
}

function torsoPts(S, flap) {
  const m = S.map;
  return [m(-6.3, -1.4 - flap * .6), m(-6.8, 6), m(-7.2, 14), m(-6.9, 21), m(-5.6, 26.6), m(-2.8, 29.6),
    m(3.4, 30.0), m(5.9, 27.6), m(7.5, 21), m(6.7, 13), m(5.7, 6), m(6.5, -1.2 + flap * .3), m(0, -2.6 - flap * .4)];
}

function drawTorso(ctx, S, L, flap) {
  const pts = torsoPts(S, flap);
  const build = (dx, dy) => splinePath(ctx, pts, dx, dy);
  ctx.lineJoin = 'round';
  outline(ctx, build);
  celFill(ctx, build, PAL.jacket, L);
  if (SIL) return;
  const m = S.map;
  ctx.save(); ctx.beginPath(); build(0, 0); ctx.clip();
  // undershirt showing at the open front
  const sh = [m(3.9, 30.5), m(9, 30), m(9, 3), m(4.8, 3.2), m(4.1, 16)];
  celFill(ctx, (dx, dy) => splinePath(ctx, sh, dx, dy), PAL.shirt, L);
  ctx.strokeStyle = PAL.line; ctx.lineWidth = LW;
  ctx.beginPath(); splinePath(ctx, [m(3.9, 30.5), m(4.1, 16), m(4.8, 3.2)], 0, 0, false); ctx.stroke();
  // hem band
  band(ctx, m(0, -4), m(0, 4), 0, .42, 9, PAL.accent, L);
  // back seam / fold
  ctx.lineWidth = LW * .7; ctx.beginPath(); splinePath(ctx, [m(-3.6, 23), m(-4.6, 14), m(-4.2, 7)], 0, 0, false); ctx.stroke();
  ctx.restore();
}

function drawPelvis(ctx, S, L) {
  const c = S.map(-0.6, 1.4), ang = (S.phiS) * D2R;
  const build = (dx, dy) => ctx.ellipse(c[0] + dx, c[1] + dy, 7.0, 5.6, ang, 0, TAU);
  outline(ctx, build); celFill(ctx, build, PAL.pants, L);
}

function drawNeck(ctx, S, L) {
  const nk = capsule(S.neck0, V.axpy(S.neck1, V.dir(S.phiHead), 1.5), 2.6, 2.5);
  outline(ctx, (dx, dy) => nk(ctx, dx, dy)); celFill(ctx, (dx, dy) => nk(ctx, dx, dy), PAL.skin, { ...L, s: L.s * 2.2 });
}

function drawScarfWrap(ctx, S, L) {
  const m = S.map;
  const pts = [m(-4.6, 27.2), m(0, 26.4), m(4.9, 27.4), m(5.0, 30.2), m(4.3, 33.0), m(0, 33.4), m(-4.4, 32.2), m(-5.2, 29.6)];
  const build = (dx, dy) => splinePath(ctx, pts, dx, dy);
  outline(ctx, build); celFill(ctx, build, PAL.scarf, L);
  if (SIL) return;
  ctx.strokeStyle = PAL.line; ctx.lineWidth = LW * .7;
  ctx.beginPath(); splinePath(ctx, [m(-3.8, 29.4), m(0.5, 29.6), m(4.4, 30.6)], 0, 0, false); ctx.stroke();
}

// scarf tail: pts from the anchor outward; width tapers; twist shows the darker reverse side
function drawScarfTail(ctx, pts, t, L, seed = 0, w0 = 2.7, w1 = 2.1) {
  const n = pts.length, Lft = [], Rgt = [], tw = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const d = V.norm(V.sub(b, a)), nn = [-d[1], d[0]];
    const twist = Math.cos(t * 9.5 - i * .72 + seed);
    const w = lerp(w0, w1, i / (n - 1)) * (0.35 + 0.65 * Math.abs(twist));
    tw.push(twist); Lft.push(V.axpy(pts[i], nn, w)); Rgt.push(V.axpy(pts[i], nn, -w));
  }
  // forked tip
  const tip = pts[n - 1], dEnd = V.norm(V.sub(pts[n - 1], pts[n - 2]));
  const poly = [...Lft, V.axpy(V.lerp(Lft[n - 1], tip, .5), dEnd, 2.2), V.axpy(tip, dEnd, .4), V.axpy(V.lerp(Rgt[n - 1], tip, .5), dEnd, 2.4), ...Rgt.reverse()];
  const build = (dx, dy) => { ctx.moveTo(poly[0][0] + dx, poly[0][1] + dy); for (const q of poly) ctx.lineTo(q[0] + dx, q[1] + dy); ctx.closePath(); };
  ctx.lineJoin = 'round';
  outline(ctx, build);
  celFill(ctx, build, PAL.scarf, L);
  if (SIL) return;
  // reverse side where the ribbon has flipped
  const Rr = Rgt.slice().reverse();
  ctx.fillStyle = PAL.scarf.sh;
  for (let i = 0; i < n - 1; i++) if (tw[i] < 0 && tw[i + 1] < 0) {
    ctx.beginPath(); ctx.moveTo(...Lft[i]); ctx.lineTo(...Lft[i + 1]); ctx.lineTo(...Rr[i + 1]); ctx.lineTo(...Rr[i]); ctx.closePath(); ctx.fill();
  }
}

// relative-airflow scarf chain: each link points away from the anchor's (delayed) velocity, plus wind and gravity.
// posAt(tt) → anchor world point. Pure function of t.
function scarfChain(posAt, t, o = {}) {
  const N = o.n ?? 11, seg = o.seg ?? 3.1, dt = o.dt ?? .028, wind = o.wind ?? [-55, 0], g = o.g ?? 38, seed = o.seed ?? 0;
  const pts = [posAt(t)];
  let prev = null;
  for (let i = 1; i < N; i++) {
    const tt = t - i * dt, h = 1 / 48;
    const v = V.mul(V.sub(posAt(tt), posAt(tt - h)), 1 / h);
    let d = [-v[0] + wind[0], -v[1] + wind[1] + g];
    const sp = V.len(d);
    d = V.norm(d);
    const pn = [-d[1], d[0]];
    const amp = (0.12 + 0.55 * clamp(sp / 400)) * Math.pow(i / N, .8);
    const fl = Math.sin(t * (7 + sp / 60) - i * .95 + seed) * amp + fbm1(t * 3 + i * .4, 17 + seed) * .18;
    d = V.norm(V.axpy(d, pn, fl));
    if (prev) d = V.norm(V.lerp(prev, d, .55));
    prev = d;
    pts.push(V.axpy(pts[pts.length - 1], d, seg));
  }
  return pts;
}

// ---------------------------------------------------------------- head (local 50-radius space, facing right)
const HEAD_PIVOT = [-4, 50];
const SPIKES = [ // back-to-front over the top: [phi, len, width, sweep]
  [214, 16, 26, -14], [236, 22, 26, -18], [258, 26, 26, -20], [283, 30, 26, -22], [308, 30, 25, -22],
  [333, 27, 24, -22], [358, 23, 24, -20], [22, 18, 22, -26], [44, 14, 20, -30],
];
function hairPts(wind, t, seed) {
  const pts = [];
  const pol = (phi, r) => [Math.sin(phi * D2R) * r, -Math.cos(phi * D2R) * r];
  // wind arrives as world velocity; saturate it to 0..1 so a gale bends spikes, never snaps them
  const wl = V.len(wind), wk = Math.min(1, wl / 320) / (wl || 1), w = [wind[0] * wk, wind[1] * wk];
  const jit = .02 + .06 * Math.min(1, wl / 320);
  const sway = (i, ln) => [w[0] * ln * .42 + noise1(t * 7 + i * 1.7, seed + i) * ln * jit,
    w[1] * ln * .42 + noise1(t * 7.4 + i * 2.3, seed + 40 + i) * ln * jit];
  pts.push(pol(196, 50));
  SPIKES.forEach(([phi, ln, w, sw], i) => {
    const tip = pol(phi + sw, 50 + ln), s = sway(i, ln);
    pts.push(pol(phi - w / 2, 49));
    pts.push([tip[0] + s[0], tip[1] + s[1], 1]);
  });
  // front tuft and bangs, hanging over the forehead toward the eyes
  const b = (x, y, i, k = 1) => { const s = sway(20 + i, 14 * k); return [x + s[0], y + s[1]]; };
  pts.push([44, -32]);
  pts.push([...b(58, -24, 0), 1]);       // forward flick
  pts.push([48, -14]);
  pts.push([...b(49, 6, 1), 1]);         // front lock past the far eye
  pts.push([40, -6]);
  pts.push([...b(28, 9, 2), 1]);         // centre lock between the eyes
  pts.push([20, -6]);
  pts.push([...b(10, 4, 3), 1]);
  pts.push([0, -8]);
  pts.push([...b(-10, 8, 4), 1]);
  pts.push([-16, 0]);
  pts.push([...b(-15, 27, 5, 1.4), 1]);  // sideburn, in front of the ear
  pts.push([-20, 6]);
  pts.push([-31, 4]);
  pts.push([...b(-44, 30, 7, 1.3), 1]);  // nape
  return pts;
}

function faceBuild(ctx) {
  const pts = [[-50, 0], [-44, -26], [-26, -44], [0, -50], [26, -43], [41, -26], [47, -6], [48.5, 12], [50, 20],
    [46.5, 31], [42, 41], [33, 52], [22, 59, 1], [8, 55], [-10, 45], [-22, 35], [-36, 26], [-47, 14]];
  return (c, dx = 0, dy = 0) => splinePath(c, pts, dx, dy);
}

function drawEye(ctx, cx, cy, w, h, p, far) {
  const open = clamp(p.eye) * (1 - .5 * p.tired);
  const nar = p.narrow;
  // lid corners: inner (toward the nose, +x) and outer
  const inn = [cx + w * .5, cy - h * .02 + h * .14 * nar], out = [cx - w * .5, cy + h * .06];
  const lowY = cy + h * .5;
  const topY = lerp(lowY - h * .05, cy - h * (.66 - .3 * nar), open);
  const topC = [cx - w * .08, topY];
  const lowC = [cx + w * .02, lowY];
  const upper = c => { c.moveTo(...out); c.quadraticCurveTo(topC[0], topC[1] - h * .08, ...inn); };
  const lower = c => { c.quadraticCurveTo(lowC[0], lowC[1] + h * .03, ...out); };
  if (open > .08) {
    ctx.save();
    ctx.beginPath(); upper(ctx); lower(ctx); ctx.closePath();
    ctx.fillStyle = '#fbf8ff'; ctx.fill(); ctx.clip();
    // iris
    const ix = cx + p.lookX * w * .2, iy = cy + h * .14 + p.lookY * h * .12, rx = w * (far ? .34 : .31), ry = h * .44;
    const g = ctx.createLinearGradient(0, iy - ry, 0, iy + ry);
    g.addColorStop(0, PAL.iris[0]); g.addColorStop(.45, PAL.iris[1]); g.addColorStop(1, PAL.iris[2]);
    ctx.beginPath(); ctx.ellipse(ix, iy, rx, ry, 0, 0, TAU); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = w * .045; ctx.strokeStyle = PAL.iris[0]; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(ix + rx * .05, iy + ry * .08, rx * .46, ry * .5, 0, 0, TAU); ctx.fillStyle = '#1b0905'; ctx.fill();
    // lid shadow across the top of the eye
    ctx.beginPath(); ctx.moveTo(out[0], out[1] - h); ctx.lineTo(inn[0], inn[1] - h); ctx.lineTo(inn[0], inn[1] + h * .02);
    ctx.quadraticCurveTo(topC[0], topC[1] + h * .3, out[0], out[1] + h * .04); ctx.closePath();
    ctx.fillStyle = 'rgba(70,40,110,.32)'; ctx.fill();
    // highlights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(ix - rx * .38, iy - ry * .42, rx * .3, ry * .22, -.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(ix + rx * .36, iy + ry * .38, rx * .13, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // upper lash line: heavy, tapered, with an outer flick
  ctx.fillStyle = PAL.line;
  ctx.beginPath();
  ctx.moveTo(out[0] - w * .12, out[1] + h * .14);
  ctx.quadraticCurveTo(out[0] - w * .02, out[1] - h * .02, out[0] + w * .04, out[1] - h * .04);
  ctx.quadraticCurveTo(topC[0], topC[1] - h * .14, inn[0], inn[1]);
  ctx.quadraticCurveTo(topC[0], topC[1] + h * (.1 + .02 * nar), out[0] + w * .06, out[1] + h * .08);
  ctx.closePath(); ctx.fill();
  if (open > .08) {
    // lower lash (outer half)
    ctx.lineWidth = w * .05; ctx.strokeStyle = PAL.line; ctx.lineCap = 'round';
    ctx.lineWidth = w * .035;
    ctx.beginPath(); ctx.moveTo(out[0] + w * .06, out[1] + h * .26); ctx.quadraticCurveTo(out[0] + w * .14, lowY - h * .02, cx - w * .14, lowY + h * .01); ctx.stroke();
  }
}

function drawHead(ctx, S, o) {
  const p = S.p, L = localL(o.L, S.phiHead, HK);
  ctx.save();
  ctx.translate(S.neck1[0], S.neck1[1]); ctx.rotate(S.phiHead * D2R); ctx.scale(HK, HK);
  ctx.translate(-HEAD_PIVOT[0], -HEAD_PIVOT[1]);
  const lw0 = LW; LW = LW / HK;
  const wind = V.rot(o.hairWind || [0, 0], -S.phiHead);
  const hp = hairPts(wind, o.t || 0, 3);
  const hairB = (dx, dy) => splinePath(ctx, hp, dx, dy);
  const face = faceBuild(ctx);
  ctx.lineJoin = 'round';
  // face
  outline(ctx, (dx, dy) => face(ctx, dx, dy));
  celFill(ctx, (dx, dy) => face(ctx, dx, dy), PAL.skin, L);
  if (!SIL) {
    // ear
    const ear = (dx, dy) => splinePath(ctx, [[-19, 8], [-26, 4], [-32, 13], [-30, 27], [-21, 31]], dx, dy);
    outline(ctx, ear); celFill(ctx, ear, PAL.skin, { ...L, s: L.s * 1.8 });
    ctx.strokeStyle = PAL.line; ctx.lineWidth = LW * .7;
    ctx.beginPath(); ctx.moveTo(-23, 11); ctx.quadraticCurveTo(-30, 15, -25, 25); ctx.stroke();
    // blush hatching
    if (p.blush > .02) {
      ctx.strokeStyle = rgba(PAL.blush, .75 * p.blush); ctx.lineWidth = 2.2;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-2 + i * 6, 36); ctx.lineTo(-6 + i * 6, 42); ctx.stroke(); }
      ctx.fillStyle = rgba(PAL.blush, .22 * p.blush); ctx.beginPath(); ctx.ellipse(6, 38, 15, 7, 0, 0, TAU); ctx.fill();
    }
    // eyes: near (big) and far (narrower, near the contour)
    drawEye(ctx, 4, 15, 33, 34, p, false);
    drawEye(ctx, 38.8, 15, 15.5, 32, p, true);
    // nose
    ctx.strokeStyle = PAL.line; ctx.lineWidth = LW * .9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(45.8, 28); ctx.lineTo(43.2, 32); ctx.stroke();
    // mouth
    drawMouth(ctx, p);
  }
  // hair over everything
  outline(ctx, hairB);
  celFill(ctx, hairB, PAL.hair, { ...L, r: L.r * .55 });
  if (!SIL) {
    // angel-ring highlight band
    ctx.save(); ctx.beginPath(); hairB(0, 0); ctx.clip();
    ctx.fillStyle = PAL.hair.band;
    ctx.beginPath();
    const ring = [];
    for (let a = -70; a <= 40; a += 10) ring.push([Math.sin(a * D2R) * 38, -Math.cos(a * D2R) * 38 + (a % 20 === 0 ? 3 : -3)]);
    const ring2 = [];
    for (let a = 40; a >= -70; a -= 10) ring2.push([Math.sin(a * D2R) * 31, -Math.cos(a * D2R) * 31 + (a % 20 === 0 ? 3.5 : -1)]);
    ctx.moveTo(...ring[0]); for (const q of ring) ctx.lineTo(...q); for (const q of ring2) ctx.lineTo(...q); ctx.closePath();
    ctx.globalAlpha = .55; ctx.fill(); ctx.globalAlpha = 1;
    ctx.restore();
    // brows drawn through the bangs
    const bl = p.brow, ang = -p.narrow * 8 + bl * 9;
    ctx.strokeStyle = PAL.line; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    ctx.globalAlpha = .8;
    ctx.beginPath(); ctx.moveTo(-8, -4 + p.narrow * 1 - bl * 2); ctx.quadraticCurveTo(4, -9 - bl * 2, 17, -6 + p.narrow * 5 - bl * 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(32, -6 + p.narrow * 5 - bl * 5); ctx.quadraticCurveTo(38, -8 - bl * 2, 43, -5 - bl * 1); ctx.stroke();
    ctx.globalAlpha = 1;
    // sweat on the temple
    if (p.sweat > .02) drawDrop(ctx, -6, -10 + (o.t ? (o.t * 9) % 6 : 0), 5.5 * p.sweat, 0);
    if (p.glint > .01) sparkle(ctx, 1, 9, 17 * p.glint, o.t || 0);
  }
  LW = lw0;
  ctx.restore();
}

function drawMouth(ctx, p) {
  const m = p.mouth, x = 33, y = 43;
  ctx.strokeStyle = PAL.line; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (m < .08) {
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(x - 7, y - 1 - p.smile * 2); ctx.quadraticCurveTo(x - 1, y + 1.5 + p.smile * 3 - p.narrow * 2, x + 5, y - 1 - p.smile * 3); ctx.stroke();
    return;
  }
  // open: rounded trapezoid, wider at the bottom when panting
  const w = 6 + m * 5, hgt = 3 + m * 11;
  const sh = [[x - w, y - 1], [x + w * .8, y - 1.5], [x + w * .9, y + hgt * .6], [x + w * .2, y + hgt], [x - w * .7, y + hgt * .8]];
  ctx.beginPath(); splinePath(ctx, sh); ctx.fillStyle = PAL.mouth; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = PAL.tongue; ctx.beginPath(); ctx.ellipse(x, y + hgt * 1.02, w * .9, hgt * .45, 0, 0, TAU); ctx.fill();
  if (p.grit > .1) { ctx.fillStyle = '#fff'; ctx.fillRect(x - w, y - 2, w * 2, 3.2); }
  ctx.restore();
  ctx.lineWidth = 2.4; ctx.beginPath(); splinePath(ctx, sh); ctx.stroke();
}

function drawDrop(ctx, x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, -2.2); ctx.bezierCurveTo(.9, -.6, 1.3, .3, 1.3, .9); ctx.arc(0, .9, 1.3, 0, Math.PI); ctx.bezierCurveTo(-1.3, .3, -.9, -.6, 0, -2.2);
  ctx.fillStyle = '#bfe6ff'; ctx.fill(); ctx.lineWidth = .32; ctx.strokeStyle = '#3b6ea8'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-.45, .6, .3, .5, -.3, 0, TAU); ctx.fill();
  ctx.restore();
}

function sparkle(ctx, x, y, r, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(.3 + t * .8);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(255,220,150,1)'; ctx.shadowBlur = r * .8;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * .14 : (i % 4 ? r * .6 : r); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- whole character
// o: { L, lw (world), t, scarf: [pts] or [[pts],[pts]], hairWind, flap }
function placePart(ctx, name, A, phi, filter) {
  const pt = CHAR.parts[name] || CHAR.faces[name.replace('face_', '')], img = CHAR.img[name];
  if (!img || !img.complete || !pt) return;
  const th = Math.atan2(pt.to[1] - pt.pivot[1], pt.to[0] - pt.pivot[0]), d = V.dir(phi);
  ctx.save(); ctx.translate(A[0], A[1]); ctx.rotate(Math.atan2(d[1], d[0]) - th); ctx.scale(CHAR.k, CHAR.k);
  if (filter) ctx.filter = filter;
  ctx.drawImage(img, -pt.pivot[0], -pt.pivot[1]);
  ctx.restore();
}
// pick a drawn head for the current expression
function faceFor(p) {
  const f = CHAR.faces || {}, has = n => f[n] && 'face_' + n;
  return (p.eye < .3 && has('closed')) || (p.tired > .5 && p.mouth > .35 && has('pant')) || (p.mouth > .5 && has('shout'))
    || (p.smile > .5 && has('smile')) || (p.narrow > .5 && has('determined')) || 'head';
}
function drawCharPNG(ctx, S, o) {
  let base = null;
  if (SIL) { const n = parseInt(SIL.slice(1), 16), lum = ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255); base = lum > 384 ? 'brightness(0) invert(1)' : 'brightness(0)'; }
  const far = base || 'brightness(.62) saturate(.9)', near = base;
  for (const [side, f] of [['F', far], ['N', near]]) {
    const g = S['leg' + side];
    placePart(ctx, 'shin', g.kn, g.pSn, f); placePart(ctx, 'foot', g.an, g.pFt, f); placePart(ctx, 'thigh', g.hip, g.pTh, f);
    if (side === 'F') {
      const a = S.armF; placePart(ctx, 'hand', a.wr, a.pH, f); placePart(ctx, 'forearm', a.el, a.pFA, f); placePart(ctx, 'upperArm', a.sho, a.pUA, f);
      placePart(ctx, 'torso', S.map(0, 0), S.phiS, near);
    }
  }
  placePart(ctx, faceFor(S.p), S.neck1, S.phiHead, near);
  const a = S.armN; placePart(ctx, 'hand', a.wr, a.pH, near); placePart(ctx, 'forearm', a.el, a.pFA, near); placePart(ctx, 'upperArm', a.sho, a.pUA, near);
  if (!SIL && S.p.sweat > .3) { ctx.save(); const h = V.axpy(S.neck1, V.dir(S.phiHead + 40), CHAR.headH * .75); ctx.translate(h[0], h[1]); drawDrop(ctx, 0, 0, 1.4 * S.p.sweat, 0); ctx.restore(); }
}
// a key drawing: the whole body as one illustration, anchored on the floor (ground) or at the body centre (airborne)
function drawSprite(ctx, p, o) {
  const sp = CHAR.sprites[p.spr], img = CHAR.img['spr_' + p.spr];
  if (!img || !img.complete) return false;
  let filter = null;
  if (SIL) { const n = parseInt(SIL.slice(1), 16), lum = ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255); filter = lum > 384 ? 'brightness(0) invert(1)' : 'brightness(0)'; }
  const ground = sp.mode === 'ground';
  const breathe = ground ? 1 + .006 * Math.sin((o.t || 0) * 5.2) : 1;
  ctx.save();
  ctx.translate(p.x, ground ? (p.sprDy || 0) : p.y);
  if (!ground) ctx.rotate(((p.rot || 0) - sp.rot0) * D2R);
  ctx.scale(sp.k, sp.k * breathe);
  if (filter) ctx.filter = filter;
  ctx.drawImage(img, -sp.anchor[0], -sp.anchor[1]);
  ctx.restore();
  return true;
}
function drawChar(ctx, p, o) {
  if (CHAR) { const S = solve(p); if (!(p.spr && CHAR.sprites && CHAR.sprites[p.spr] && drawSprite(ctx, p, o))) drawCharPNG(ctx, S, o); return S; }
  const S = solve(p);
  const L = o.L, Lf = farL(L);
  const lw0 = LW; LW = o.lw ?? .7;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (o.scarf) o.scarf.forEach((pts, i) => drawScarfTail(ctx, pts, o.t, Lf, i * 2.1, i ? 2.3 : 2.8, i ? 1.7 : 2.2));
  drawArm(ctx, S, 'F', Lf);
  drawLeg(ctx, S, 'F', Lf);
  drawPelvis(ctx, S, L);
  drawNeck(ctx, S, L);
  drawTorso(ctx, S, L, o.flap || 0);
  drawLeg(ctx, S, 'N', L);
  drawScarfWrap(ctx, S, L);
  drawHead(ctx, S, o);
  drawArm(ctx, S, 'N', L);
  LW = lw0;
  return S;
}
