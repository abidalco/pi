// timeline.js — turns a film description (data) into window.seek(t). See engine/README.md for the format.
const q2 = t => Math.floor(t * 12 + 1e-6) / 12;               // drawings hold for two frames (on twos)
const lwFor = z => clamp(1.7 + z * .3, 2.4, 6.5) / z;
let ctx;

// a value spec: number | [a, b] (eased across the shot) | [[u, v, ease?], ...] keys in shot time
function val(spec, u, dur, ease = E.inOut) {
  if (spec === undefined || spec === null) return undefined;
  if (typeof spec === 'number') return spec;
  if (Array.isArray(spec) && Array.isArray(spec[0])) return kf(u, spec.map(k => [k[0], k[1], typeof k[2] === 'string' ? E[k[2]] : k[2]]));
  if (Array.isArray(spec)) return lerp(spec[0], spec[1], ease(clamp(u / dur)));
  return spec;
}
function worldCam(c, cam) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.translate(W / 2 + (cam.sx || 0), H / 2 + (cam.sy || 0));
  if (cam.roll) c.rotate(cam.roll * D2R);
  c.scale(cam.z, cam.z);
  c.translate(-cam.x, -cam.y);
}
const toScreen = (cam, p) => [(p[0] - cam.x) * cam.z + W / 2 + (cam.sx || 0), (p[1] - cam.y) * cam.z + H / 2 + (cam.sy || 0)];
function shakeAt(t, t0, amp, decay) {
  const a = t - t0; if (a < 0) return [0, 0];
  const e = amp * Math.exp(-a * decay), q = Math.floor(t * 24);
  return [(hash(q, 11) - .5) * 2 * e, (hash(q, 12) - .5) * 2 * e];
}
function headCenter(S) { return CHAR ? V.axpy(S.neck1, V.dir(S.phiHead), CHAR.headH * .5) : V.add(S.neck1, V.rot([8 * HK, -50 * HK], S.phiHead)); }

// what each cue does on screen by default: [shake amp, decay], effects
const CUE_FX = {
  launch: { shake: [26, 7], impact: true, decal: 'launch', burst: 'launch', updraft: true },
  land: { shake: [34, 5.5], impact: true, decal: 'land', burst: 'land', radial: true },
  flipLand: { shake: [6, 9], burst: 'tap' },
  plop: { shake: [9, 8], burst: 'plop', sweat: true },
  exhale: { breath: true },
};

// ---------------------------------------------------------------- the hero
function drawHero(c, sh, cam, t, o = {}) {
  const perf = sh.perf, tq = q2(t);
  const p = perf(tq), pr = perf(t), g = perf.segAt(tq);
  const ro = g.a.rootOnes;
  const dx = ro ? pr.x - p.x : 0, dy = ro === 'xy' ? pr.y - p.y : 0;
  p.x += dx; p.y += dy;
  const dir = p.dir ?? 1, X0 = p.x;
  const set = SETS[sh.set] || {};
  const wind0 = sh.wind ?? set.wind ?? [-60, 0], wind = dir < 0 ? [-wind0[0], wind0[1]] : wind0;
  // scarf + hair are computed in the character's own facing space (root motion mirrored when facing left)
  const loc = tt => { const q = perf(tt); if (dir < 0) q.x = 2 * X0 - q.x; return q; };
  const posAt = tt => solve(loc(tt)).scarfAnchor;
  const lx = q => (dir < 0 ? 2 * X0 - q : q);
  const sc = [scarfChain(posAt, tq, { wind, seed: 0, n: 12, seg: 3.2 }), scarfChain(posAt, tq, { wind, seed: 2.4, n: 9, seg: 3.0, dt: .034 })]
    .map(pts => pts.map(q => [q[0] + (dir < 0 ? -dx : dx), q[1] + dy]));
  const pv = loc(tq - 1 / 12), pq = loc(tq);
  const vel = [(pq.x - pv.x) * 12, (pq.y - pv.y) * 12];
  const L0 = sh.light ?? set.light ?? SUN_L, L = dir < 0 ? { ...L0, x: -L0.x } : L0;
  const opts = { L, lw: lwFor(cam.z), t: tq, scarf: sc, hairWind: V.add(wind, V.mul(vel, -1)), flap: Math.sin(tq * 17) * .8 };
  const mirror = (x, px) => { if (dir < 0) { x.translate(px, 0); x.scale(-1, 1); x.translate(-px, 0); } };
  const shd = sh.shadow ?? set.shadow;
  if (shd) layer(c, shd.a ?? .34 * (o.shadowFade ?? 1), 'multiply', x => {
    worldCam(x, cam); x.transform(1, 0, shd.shx, -shd.shy, 0, 0);
    mirror(x, X0); SIL = '#4a2a66'; drawChar(x, p, opts); SIL = null;
  });
  if (g.a.smear && g.a.smear(tq - g.t0)) {
    for (const [dt, a, col] of [[1 / 12, .32, '#ffe2c8'], [2 / 12, .14, '#ffc6a8']]) {
      const pg = perf(tq - dt);
      layer(c, a, 'source-over', x => { worldCam(x, cam); mirror(x, pg.x); SIL = col; drawChar(x, pg, { ...opts, scarf: null }); SIL = null; });
    }
    if (g.a.smear && p.rot) {          // motion arcs around a spin
      worldCam(c, cam); c.save(); c.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        c.strokeStyle = `rgba(255,250,240,${.55 - i * .15})`; c.lineWidth = (5 - i) / cam.z;
        const a1 = (dir * p.rot - 90) * D2R;
        c.beginPath(); c.arc(p.x, p.y - 6, 44 + i * 7, a1 - 1.6 + i * .2, a1 - .15); c.stroke();
      }
      c.restore();
    }
  }
  worldCam(c, cam); mirror(c, X0);
  const S = drawChar(c, p, opts);
  S.screenHead = toScreen(cam, (() => { const h = headCenter(S); return dir < 0 ? [2 * X0 - h[0], h[1]] : h; })());
  S.dir = dir;
  return S;
}

// ---------------------------------------------------------------- cameras
function camAt(sh, t) {
  const c = sh.camera || {}, u = t - sh.t0, D = sh.dur;
  const z = val(c.zoom ?? 4, u, D);
  const root = sh.perf(t);
  let x, y;
  if (c.target === 'head') {
    const S = solve(sh.perf(t)), hc = headCenter(S), off = c.offset ?? [5, 4];
    x = hc[0] + off[0] * (root.dir ?? 1); y = hc[1] + off[1];
  } else {
    if (c.x === undefined || c.x === 'follow') { const f = c.follow || {}; x = sh.x0 + (f.k ?? .85) * (root.x - sh.x0) + (f.lead ?? 30) * (root.dir ?? 1); }
    else x = val(c.x, u, D);
    y = c.y !== undefined ? val(c.y, u, D) : -(val(c.floorY ?? 900, u, D) - 540) / z;
  }
  let sx = 0, sy = 0;
  if (c.shake !== false) for (const q of sh.cues) {
    const fx = CUE_FX[q.name]; if (!fx || !fx.shake) continue;
    const s = shakeAt(t, sh.t0 + q.t, ...fx.shake); sx += s[0]; sy += s[1];
  }
  return { x, y, z, roll: val(c.roll, u, D) || 0, sx, sy, dy: val(c.dy, u, D), lift: val(c.lift, u, D) };
}

// ---------------------------------------------------------------- per-cue effects
function cueFxUnder(sh, cam, t) {          // decals on the floor, under the hero
  worldCam(ctx, cam);
  for (const q of sh.cues) {
    const fx = CUE_FX[q.name], a = t - sh.t0 - q.t;
    if (!fx || !fx.decal || a < 0) continue;
    ctx.save(); ctx.translate(q.x + 2, 1); ctx.scale(1 / cam.z, 1 / cam.z);
    if (fx.decal === 'land') cracks(ctx, 0, 0, a, 33, { len: 330, n: 12, crater: 120, w: 3.4 });
    else cracks(ctx, 0, 0, a, 21, { len: 230, n: 10, crater: 70, w: 3 });
    ctx.restore();
  }
}
function cueFxOver(sh, cam, t, S) {
  for (const q of sh.cues) {
    const fx = CUE_FX[q.name], a = t - sh.t0 - q.t;
    if (!fx || a < 0) continue;
    worldCam(ctx, cam);
    ctx.save(); ctx.translate(q.x + 2, 0); ctx.scale(1 / cam.z, 1 / cam.z);
    if (fx.burst === 'land') {
      dustBurst(ctx, 0, -8, a, 7, { n: 30, speed: 900, size: 52, life: 1.05, rise: 60 });
      dustBurst(ctx, 0, -20, a, 17, { n: 10, speed: 360, size: 34, life: .7, rise: 30, up: 120 });
      debris(ctx, 0, -14, a, 13, { n: 26, speed: 780, size: 11, g: 1800, floor: 18, cone: 2.4 });
      shockRing(ctx, 0, 6, a, { r: 900, w: 26, squash: .16 });
    } else if (fx.burst === 'launch') {
      dustBurst(ctx, 0, -10, a, 5, { n: 26, speed: 330, size: 46, life: 1.3, rise: 50 });
      debris(ctx, 0, -10, a, 9, { n: 22, speed: 700, size: 9, g: 1500, floor: 0, cone: 1.6 });
      shockRing(ctx, 0, 0, a, { r: 640, w: 22 });
    } else if (fx.burst === 'tap') dustBurst(ctx, 0, -4, a, 41, { n: 12, speed: 160, size: 22, life: .8, rise: 10 });
    else if (fx.burst === 'plop') dustBurst(ctx, 0, -6, a, 61, { n: 16, speed: 300, size: 30, life: .6, rise: 14 });
    ctx.restore();
    if (fx.sweat && S && a < .6) {
      const hc = headCenter(S), r = mulberry32(71);
      for (let i = 0; i < 6; i++) {
        const b = a - .02 * i, vx = (r() - .3) * 70, vy = -50 - r() * 50, s = 7 + r() * 4;
        if (b < 0 || b > .55) continue;
        worldCam(ctx, cam); ctx.translate(hc[0] + vx * b, hc[1] - 6 + vy * b + 260 * b * b); ctx.scale(1 / cam.z, 1 / cam.z);
        drawDrop(ctx, 0, 0, s, Math.atan2(vy + 520 * b, vx) + Math.PI * 2);
      }
    }
    if (fx.breath && S && a < .45) {
      const mouth = V.add(headCenter(S), V.rot([5.5, 6.5], S.phiHead)), k = 1 - a / .45;
      worldCam(ctx, cam); ctx.translate(mouth[0] + 10 * a, mouth[1] - 8 * a); ctx.scale(1 / cam.z, 1 / cam.z);
      ctx.strokeStyle = `rgba(255,255,255,${.85 * k})`; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(18 + i * 22 + a * 60, -i * 10, 9 + i * 4, Math.PI * .9, Math.PI * 2.1); ctx.stroke(); }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fx.radial && a < .25) { const s = toScreen(cam, [q.x + 4, -30]); speedLinesRadial(ctx, s[0], s[1], Math.floor(t * 24) + 5, { n: 80, rin: 330, w: 9, color: `rgba(255,252,240,${.8 * (1 - a / .25)})` }); }
    if (fx.updraft && a > 0 && t < sh.t0 + sh.dur) speedLinesDir(ctx, 0, Math.floor(t * 24) + 77, { n: 34, len: 700, w: 4, color: `rgba(255,248,235,${.65 * (1 - clamp((t - sh.t0 - sh.dur + .13) / .13))})` });
  }
}
function impactFrames(sh, t) {
  for (const q of sh.cues) {
    const fx = CUE_FX[q.name], a = t - sh.t0 - q.t;
    if (fx && fx.impact && a >= 0 && a < .085) impactFrame(ctx, Math.floor(a * 24) % 2, null);
  }
}
// SFX lettering: {at | on: cueName, str, size, dx, dy (px from the anchor), angle, anchor: 'cue'|'head'|'screen', life, style}
const TEXT_STYLE = { impact: {}, soft: { shake: .4, mid: '#7a7bd8', bot: '#dfe6ff' } };
function drawTexts(sh, cam, t, S) {
  for (const tx of sh.text || []) {
    const cue = tx.on ? sh.cues.find(q => q.name === tx.on) : null;
    const at = cue ? cue.t + (tx.at ?? 0) : tx.at ?? 0;
    let ax = W / 2, ay = H / 2;
    if (tx.anchor === 'head' && S) [ax, ay] = S.screenHead;
    else if (cue) [ax, ay] = toScreen(cam, [cue.x, 0]);
    sfxText(ctx, tx.str, ax + (tx.dx ?? 0), ay + (tx.dy ?? 0), tx.size ?? 120, tx.angle ?? -6, t - sh.t0 - at,
      { life: tx.life ?? .75, ...(TEXT_STYLE[tx.style] || {}) });
  }
}

// ---------------------------------------------------------------- shots
function drawSideShot(sh, t) {
  const cam = camAt(sh, t), set = SETS[sh.set];
  set.draw(ctx, { ...cam, x: cam.x + cam.sx / 3 }, t);
  cueFxUnder(sh, cam, t);
  const S = drawHero(ctx, sh, cam, t);
  cueFxOver(sh, cam, t, S);
  if (set.front) set.front(ctx, cam, t);
  drawTexts(sh, cam, t, S);
  const fl = sh.flare ?? set.flare;
  if (fl) lensFlare(ctx, fl[0] - cam.x * cam.z * .02, fl[1], val(fl[2], t - sh.t0, sh.dur), 5);
  impactFrames(sh, t);
}

function fades(sh, t) {
  const u = t - sh.t0, white = 'rgba(255,246,230,';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (sh.in?.white) { const k = 1 - clamp(u / sh.in.white); if (k > 0) { ctx.fillStyle = white + .9 * E.in2(k) + ')'; ctx.fillRect(0, 0, W, H); } }
  if (sh.out?.white) { const k = clamp((u - sh.dur + sh.out.white) / sh.out.white); if (k > 0) { ctx.fillStyle = white + .9 * E.in2(k) + ')'; ctx.fillRect(0, 0, W, H); } }
  if (sh.in?.black) { const k = 1 - clamp(u / sh.in.black); if (k > 0) { ctx.fillStyle = `rgba(0,0,0,${k})`; ctx.fillRect(0, 0, W, H); } }
  if (sh.out?.black) { const k = clamp((u - sh.dur + sh.out.black) / sh.out.black); if (k > 0) { ctx.fillStyle = `rgba(0,0,0,${k})`; ctx.fillRect(0, 0, W, H); } }
}

// ---------------------------------------------------------------- build + run
function RUN(film) {
  useCharacter(film.character).then(() => build(film));
}
function build(film) {
  ctx = document.getElementById('c').getContext('2d');
  const fps = film.fps ?? 24;
  let t0 = 0, state = { x: 0, dir: 1, pose: 'stand' };
  const shots = film.shots.map(s0 => {
    const sh = { ...s0, t0 };
    t0 += sh.dur;
    if (SETS[sh.set]?.chase) {
      const c = sh.chase || {}, zk = c.z ?? [[0, -150], [.87, 22], [1.35, 92], [2, 190]], rr = c.roll ?? [1.41, 1.81];
      sh.cues = [{ t: 0, name: 'windbed', dur: sh.dur }, { t: zk[1][0] - .4, name: 'passL' }, { t: zk[1][0] - .28, name: 'passR' },
        { t: zk[2][0] - .05, name: 'exitL' }, { t: zk[2][0] + .03, name: 'exitR' }, { t: c.birds ?? .7, name: 'birds' }, { t: rr[0], name: 'roll' }];
      sh.perf = Object.assign(() => P({}), { segAt: () => ({ t0: 0, a: {} }) });
      return sh;
    }
    const start = { ...state, ...(sh.start || {}) };
    if (sh.start && sh.start.pose === undefined && state.pose) start.pose = state.pose;
    const seq = sequence(sh.hero || [{ at: 0, do: 'idle' }], start);
    sh.perf = tt => seq.perf(tt - sh.t0);
    sh.perf.segAt = tt => seq.perf.segAt(tt - sh.t0);
    sh.x0 = seq.perf(0).x;
    sh.cues = [...seq.cues.map(q => ({ ...q, x: seq.perf(q.t).x })), ...(sh.sfx || []).map(q => ({ t: q.at, name: q.name, x: seq.perf(q.at).x }))];
    state = { x: seq.end.x, dir: seq.end.dir, pose: seq.end.pose };
    return sh;
  });
  const DUR = t0;
  window.FILM = { duration: DUR, width: W, height: H, fps };
  window.SHOTS = shots;
  window.CUES = {
    duration: DUR, fps, music: film.music ?? null,
    cuts: shots.map(s => ({ t: s.t0, id: s.id, set: s.set })),
    cues: shots.flatMap(s => s.cues.map(q => ({ t: +(s.t0 + q.t).toFixed(4), name: q.name, dur: q.dur, pan: q.x !== undefined ? clamp((q.x - camAt(s, s.t0 + q.t).x) / 300, -1, 1) : 0 }))).sort((a, b) => a.t - b.t),
  };
  window.SHEET_TIMES = film.sheet ?? Array.from({ length: Math.ceil(DUR / .5) }, (_, i) => +(i * .5 + .02).toFixed(2)).filter(t => t < DUR);
  window.seek = t => {
    t = clamp(t, 0, DUR - 1e-6);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    let sh = shots[0]; for (const s of shots) if (t >= s.t0) sh = s;
    if (SETS[sh.set]?.chase) drawChase(ctx, sh, t); else drawSideShot(sh, t);
    fades(sh, t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    bloom(ctx, film.bloom ?? .26);
    grade(ctx, Math.round(t * fps));
  };
  window.seek(0);
}
