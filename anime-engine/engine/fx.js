// fx.js — anime effects: speed lines, impact frames, dust, debris, cracks, SFX lettering, flares, grade.

const SCR = {};
function scratch(name, w = W, h = H) {
  if (!SCR[name]) { const c = document.createElement('canvas'); c.width = w; c.height = h; SCR[name] = c; }
  const c = SCR[name], x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
  x.clearRect(0, 0, w, h);
  return [c, x];
}
// paint something on its own layer, then composite it as a whole (silhouettes keep one alpha)
function layer(ctx, alpha, comp, paint) {
  const [c, x] = scratch('layer');
  paint(x);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = comp; ctx.drawImage(c, 0, 0); ctx.restore();
}

function speedLinesRadial(ctx, cx, cy, seed, o = {}) {
  const r = mulberry32(seed), n = o.n ?? 90, rin = o.rin ?? 380, rout = o.rout ?? 1500;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = o.color ?? 'rgba(255,255,255,.75)';
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, w = (o.w ?? 7) * (.3 + r()), r0 = rin * (.75 + r() * .7);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a + w / rout) * rout, cy + Math.sin(a + w / rout) * rout);
    ctx.lineTo(cx + Math.cos(a - w / rout) * rout, cy + Math.sin(a - w / rout) * rout);
    ctx.fill();
  }
  ctx.restore();
}
// streaks along a direction (deg, screen), e.g. vertical updraft lines
function speedLinesDir(ctx, deg, seed, o = {}) {
  const r = mulberry32(seed), n = o.n ?? 40, d = V.dir(deg), nx = [-d[1], d[0]];
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = o.color ?? 'rgba(255,255,255,.6)'; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const off = (r() - .5) * 2400, along = (r() - .5) * 1600, len = (o.len ?? 500) * (.4 + r());
    const c = [W / 2 + nx[0] * off + d[0] * along, H / 2 + nx[1] * off + d[1] * along];
    if (o.avoid && Math.abs(off) < o.avoid) continue;
    ctx.lineWidth = (o.w ?? 3) * (.4 + r());
    ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0] + d[0] * len, c[1] + d[1] * len); ctx.stroke();
  }
  ctx.restore();
}

// impact frame: the whole picture slammed to high-contrast mono (kind 1 = inverted)
function impactFrame(ctx, kind, tint) {
  const [c, x] = scratch('impact');
  x.drawImage(ctx.canvas, 0, 0);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = kind ? 'grayscale(1) contrast(7) invert(1)' : 'grayscale(1) contrast(7) brightness(1.15)';
  ctx.drawImage(c, 0, 0); ctx.filter = 'none';
  if (tint) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// cel dust: puffs roll outward along the floor, grow, then thin out
function dustBurst(ctx, x, y, age, seed, o = {}) {
  if (age < 0) return;
  const r = mulberry32(seed), n = o.n ?? 18, life = o.life ?? 1.4;
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const side = o.dir ?? (i % 2 ? 1 : -1), sp = (o.speed ?? 140) * (.35 + .65 * r()), rise = (o.rise ?? 30) * r();
    const lf = life * (.6 + .5 * r()), k = age / lf; if (k >= 1) { r(); continue; }
    const dist = sp * (1 - Math.exp(-age * 3.2)) / 3.2 * 3;
    const sz = (o.size ?? 22) * (.55 + .7 * r()) * (.7 + 1.4 * Math.min(1, age * 2.5)) * (1 - k * k);
    const vy = o.up ? -(o.up * (.4 + .6 * r())) * (1 - Math.exp(-age * 2.5)) : 0;
    puffs.push([x + side * dist * (o.spread ?? 1), y - rise * Math.min(1, age * 3) + vy, sz]);
  }
  ctx.fillStyle = o.sh ?? '#9a7290';
  for (const [px, py, s] of puffs) { ctx.beginPath(); ctx.arc(px, py, s, 0, TAU); ctx.fill(); }
  ctx.fillStyle = o.lit ?? '#f1c0a8';
  for (const [px, py, s] of puffs) { ctx.beginPath(); ctx.arc(px + s * .12, py - s * .14, s * .84, 0, TAU); ctx.fill(); }
  ctx.fillStyle = o.rim ?? 'rgba(255,235,210,.9)';
  for (const [px, py, s] of puffs) { ctx.beginPath(); ctx.arc(px + s * .3, py - s * .3, s * .42, 0, TAU); ctx.fill(); }
}

// concrete chunks: ballistic, spinning, settle on the floor
function debris(ctx, x, y, age, seed, o = {}) {
  if (age < 0) return;
  const r = mulberry32(seed), n = o.n ?? 16, g = o.g ?? 520, floor = o.floor ?? y;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (r() - .5) * (o.cone ?? 2.2), sp = (o.speed ?? 260) * (.4 + .8 * r());
    const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp, s = (o.size ?? 5) * (.5 + r()), w0 = (r() - .5) * 18;
    const shape = []; const m = 5 + Math.floor(r() * 3);
    for (let j = 0; j < m; j++) shape.push([Math.cos(j / m * TAU) * (.7 + .5 * r()), Math.sin(j / m * TAU) * (.7 + .5 * r())]);
    let px = x + vx * age, py = y + vy * age + .5 * g * age * age, rot = w0 * age;
    const tHit = (-vy + Math.sqrt(vy * vy + 2 * g * (floor - y))) / g;
    if (age > tHit) { px = x + vx * tHit + vx * .15 * (1 - Math.exp(-(age - tHit) * 6)); py = floor - s * .4; rot = w0 * tHit; }
    ctx.save(); ctx.translate(px, py); ctx.rotate(rot); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(...shape[0]); for (const q of shape) ctx.lineTo(...q); ctx.closePath();
    ctx.fillStyle = o.col ?? '#cf9a8c'; ctx.fill(); ctx.lineWidth = .28; ctx.strokeStyle = PAL.line; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(shape[0][0] * .6, shape[0][1] * .6); ctx.lineTo(shape[2][0] * .6, shape[2][1] * .6); ctx.lineTo(shape[3][0] * .6, shape[3][1] * .6);
    ctx.fillStyle = 'rgba(80,40,80,.45)'; ctx.fill();
    ctx.restore();
  }
}

// floor cracks radiating from an impact, squashed onto the floor plane
function cracks(ctx, x, y, age, seed, o = {}) {
  if (age < 0) return;
  const r = mulberry32(seed), n = o.n ?? 9, L = (o.len ?? 90) * (1 - Math.exp(-age * 30)), sq = o.squash ?? .22;
  ctx.save(); ctx.lineJoin = 'miter'; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let a = (i / n) * TAU + (r() - .5) * .5, px = 0, py = 0;
    const pts = [[0, 0]], len = L * (.5 + .7 * r());
    for (let j = 0; j < 6; j++) { a += (r() - .5) * .9; px += Math.cos(a) * len / 6; py += Math.sin(a) * len / 6; pts.push([px, py]); }
    for (const [col, w, dy] of [[o.edge ?? 'rgba(255,220,190,.7)', o.w ?? 3, 1.6], [o.col ?? '#3a2340', (o.w ?? 3), 0]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
      pts.forEach(([qx, qy], k) => { const X = x + qx, Y = y + qy * sq + dy; k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.stroke();
    }
  }
  // crater
  ctx.fillStyle = 'rgba(60,30,70,.4)';
  ctx.beginPath(); ctx.ellipse(x, y + 2, (o.crater ?? 34) * Math.min(1, age * 20), (o.crater ?? 34) * sq * 1.2 * Math.min(1, age * 20), 0, 0, TAU); ctx.fill();
  ctx.restore();
}

function shockRing(ctx, x, y, age, o = {}) {
  if (age < 0 || age > (o.life ?? .45)) return;
  const k = age / (o.life ?? .45), R = (o.r ?? 420) * E.out(k);
  ctx.save();
  ctx.strokeStyle = `rgba(255,248,235,${(1 - k) * .9})`; ctx.lineWidth = (o.w ?? 16) * (1 - k);
  ctx.beginPath(); ctx.ellipse(x, y, R, R * (o.squash ?? .2), 0, 0, TAU); ctx.stroke();
  ctx.restore();
}

// katakana SFX lettering with pop-in, shake on twos, thick outline
function sfxText(ctx, str, x, y, size, deg, age, o = {}) {
  if (age < 0 || age > (o.life ?? .7)) return;
  const life = o.life ?? .7, pop = age < .06 ? lerp(1.7, 1, age / .06) : 1;
  const out = age > life - .1 ? 1 - (age - (life - .1)) / .1 : 1;
  const q = Math.floor(age * 12);
  const jx = (hash(q, 3) - .5) * size * .05 * (o.shake ?? 1), jy = (hash(q, 4) - .5) * size * .05 * (o.shake ?? 1);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(x + jx, y + jy); ctx.rotate(deg * D2R); ctx.scale(pop * (o.sx ?? 1), pop * out);
  ctx.font = `900 ${size}px "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = size * .26; ctx.strokeStyle = o.out ?? '#1b1026'; ctx.strokeText(str, 0, 0);
  ctx.lineWidth = size * .11; ctx.strokeStyle = o.mid ?? '#ff4d3a'; ctx.strokeText(str, 0, 0);
  const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  g.addColorStop(0, o.top ?? '#ffffff'); g.addColorStop(1, o.bot ?? '#ffe08a');
  ctx.fillStyle = g; ctx.fillText(str, 0, 0);
  ctx.restore();
}

function lensFlare(ctx, sx, sy, k, seed = 1) {
  if (k <= 0) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen';
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 520 * k);
  g.addColorStop(0, `rgba(255,250,230,${.95 * Math.min(1, k)})`); g.addColorStop(.12, `rgba(255,210,150,${.5 * Math.min(1, k)})`);
  g.addColorStop(.5, `rgba(255,140,110,${.14 * Math.min(1, k)})`); g.addColorStop(1, 'rgba(255,120,120,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // anamorphic streak
  const s = ctx.createLinearGradient(sx - 1400, 0, sx + 1400, 0);
  s.addColorStop(0, 'rgba(255,170,120,0)'); s.addColorStop(.5, `rgba(255,236,200,${.55 * Math.min(1, k)})`); s.addColorStop(1, 'rgba(255,170,120,0)');
  ctx.fillStyle = s; ctx.beginPath(); ctx.ellipse(sx, sy, 1400, 7 * k, 0, 0, TAU); ctx.fill();
  // ghosts along the line through the frame centre
  const r = mulberry32(seed), dx = W / 2 - sx, dy = H / 2 - sy;
  for (const [f, rad, col] of [[.45, 40, '255,190,140'], [.7, 18, '180,220,255'], [1.15, 70, '255,140,160'], [1.4, 26, '255,230,170'], [1.75, 120, '160,170,255']]) {
    const gx = sx + dx * f * 2, gy = sy + dy * f * 2;
    ctx.fillStyle = `rgba(${col},${(.08 + .06 * r()) * Math.min(1, k)})`;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .3; ctx.lineTo(gx + Math.cos(a) * rad * k, gy + Math.sin(a) * rad * k); }
    ctx.closePath(); ctx.fill();
  }
  // god rays
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU, w = .02 + r() * .05, L = 900 + r() * 700;
    ctx.fillStyle = `rgba(255,220,170,${.05 * Math.min(1, k)})`;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a - w) * L, sy + Math.sin(a - w) * L); ctx.lineTo(sx + Math.cos(a + w) * L, sy + Math.sin(a + w) * L); ctx.fill();
  }
  ctx.restore();
}

function bloom(ctx, k = .35, blur = 7) {
  const [s, sx] = scratch('bloomS', 480, 270);
  sx.filter = `blur(${blur}px) brightness(1.1)`; sx.drawImage(ctx.canvas, 0, 0, 480, 270);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = k;
  ctx.drawImage(s, 0, 0, W, H); ctx.restore();
}

function grade(ctx, frame, o = {}) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  // warm lift in the highlights, cool shadows
  ctx.globalCompositeOperation = 'soft-light';
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(90,70,190,.28)'); g.addColorStop(1, 'rgba(255,160,90,.28)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply';
  const v = ctx.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, H * 1.15);
  v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(1, `rgba(70,40,90,${o.vig ?? 1})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  // grain, reseeded on twos like the drawings
  const r = mulberry32(Math.floor(frame / 2) * 7919 + 1);
  ctx.fillStyle = 'rgba(255,240,230,.05)';
  for (let i = 0; i < 2600; i++) ctx.fillRect(r() * W, r() * H, 2, 2);
  ctx.fillStyle = 'rgba(30,10,40,.05)';
  for (let i = 0; i < 2600; i++) ctx.fillRect(r() * W, r() * H, 2, 2);
  ctx.restore();
}

// ---------------------------------------------------------------- SORA from behind (canyon chase)
// screen space; origin at the small of the back, y up the screen is away from camera
function drawBack(ctx, x, y, s, bank, t, o = {}) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(bank * D2R); ctx.scale(s, s);
  const L0 = V.rot([0, -1], -bank), L = { x: L0[0], y: L0[1], s: o.sh ?? 26, r: o.rim ?? 3.2 };
  const lw0 = LW; LW = 2.2 / s;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const fl = (i, a = 1) => noise1(t * 9 + i * 1.3, 50 + i) * a;
  // forward arm reaching past the head, fist toward the sun
  const fist = [18 + fl(1, 2), -172 + fl(2, 2)];
  const ua = capsule([26, -92], [22, -140], 11.5, 10), fa = capsule([22, -140], fist, 10, 9);
  group(ctx, [[(dx, dy) => fa(ctx, dx, dy), PAL.jacket, L], [(dx, dy) => ua(ctx, dx, dy), PAL.jacket, L]]);
  const fb = (dx, dy) => ctx.ellipse(fist[0] + dx, fist[1] - 6 + dy, 10.5, 9, 0, 0, TAU);
  outline(ctx, fb); celFill(ctx, fb, PAL.skin, L);
  ctx.save(); ctx.beginPath(); fa(ctx); ctx.clip(); band(ctx, [22, -140], fist, .75, 1, 12, PAL.accent, L); ctx.restore();
  // head from behind: spiky hair blown back toward camera
  const hc = [0, -118];
  const ears = (dx, dy) => { ctx.moveTo(-26 + dx, -112 + dy); ctx.ellipse(-30 + dx, -110 + dy, 6, 9, -.2, 0, TAU); ctx.moveTo(36 + dx, -112 + dy); ctx.ellipse(30 + dx, -110 + dy, 6, 9, .2, 0, TAU); };
  outline(ctx, ears); celFill(ctx, ears, PAL.skin, L);
  const hp = [];
  const spikes = [[-120, 14], [-150, 20], [-178, 26], [150, 26], [120, 20], [95, 22], [70, 14], [40, 10], [0, 8], [-40, 10], [-70, 14], [-95, 20]];
  spikes.forEach(([a, ln], i) => {
    const a0 = a - 13, tip = a + (a > 0 ? 8 : -8);
    hp.push([hc[0] + Math.sin(a0 * D2R) * 28, hc[1] - Math.cos(a0 * D2R) * 28]);
    const L2 = 30 + ln + fl(i, 4);
    hp.push([hc[0] + Math.sin(tip * D2R) * L2 + fl(i + 20, 3), hc[1] - Math.cos(tip * D2R) * L2 + Math.abs(fl(i + 40, 4)), 1]);
  });
  const hairB = (dx, dy) => splinePath(ctx, hp, dx, dy);
  outline(ctx, hairB); celFill(ctx, hairB, PAL.hair, L);
  // torso (jacket back) with the emblem
  const tor = [[-36, -92], [-14, -100], [14, -100], [36, -92], [34, -50], [26, -6], [24, 8], [0, 12], [-24, 8], [-26, -6], [-34, -50]];
  const torB = (dx, dy) => splinePath(ctx, tor, dx, dy);
  // trailing arm along the body
  const la = capsule([-32, -86], [-42, -40], 11, 10), lf = capsule([-42, -40], [-40, 4], 10, 9);
  const lh = (dx, dy) => ctx.ellipse(-40 + dx, 12 + dy, 9.5, 11, 0, 0, TAU);
  outline(ctx, torB); celFill(ctx, torB, PAL.jacket, L);
  ctx.save(); ctx.beginPath(); torB(0, 0); ctx.clip();
  ctx.strokeStyle = PAL.accent.lit; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, -52, 15, 0, TAU); ctx.stroke();
  ctx.fillStyle = PAL.accent.lit; ctx.beginPath(); ctx.moveTo(-6, -40); ctx.lineTo(8, -66); ctx.lineTo(4, -44); ctx.closePath(); ctx.fill();
  band(ctx, [0, -2], [0, 14], 0, 1, 40, PAL.accent, L);
  ctx.strokeStyle = PAL.line; ctx.lineWidth = LW; ctx.beginPath(); ctx.moveTo(0, -96); ctx.lineTo(0, -70); ctx.stroke();
  ctx.restore();
  // nape + scarf knot
  const nape = (dx, dy) => ctx.ellipse(0 + dx, -96 + dy, 17, 8, 0, 0, TAU);
  outline(ctx, nape); celFill(ctx, nape, PAL.scarf, L);
  outline(ctx, lh); celFill(ctx, lh, PAL.skin, L);
  group(ctx, [[(dx, dy) => lf(ctx, dx, dy), PAL.jacket, L], [(dx, dy) => la(ctx, dx, dy), PAL.jacket, L]]);
  // pants + legs, nearer = bigger
  const seat = (dx, dy) => ctx.ellipse(0 + dx, 22 + dy, 27, 18, 0, 0, TAU);
  const kneeL = [-18 + fl(5, 2), 74], ankL = [-22 + fl(6, 3), 120 + fl(7, 3)];
  const kneeR = [18 + fl(8, 2), 70], ankR = [27 + fl(9, 3), 106 + fl(10, 4)];
  const legs = [capsule([-12, 26], kneeL, 14, 13), capsule(kneeL, ankL, 13, 12), capsule([12, 26], kneeR, 14, 13), capsule(kneeR, ankR, 13, 12)];
  outline(ctx, seat); celFill(ctx, seat, PAL.pants, L);
  group(ctx, legs.map(c => [(dx, dy) => c(ctx, dx, dy), PAL.pants, L]));
  // soles facing camera
  for (const [ax, ay, big] of [[ankL[0], ankL[1], 1.08], [ankR[0], ankR[1], 1]]) {
    const sw = 17 * big, shh = 29 * big, cy = ay + 22 * big;
    const up = (dx, dy) => { ctx.roundRect(ax - sw + dx, cy - shh + dy, sw * 2, shh * 2, sw * .9); };
    const so = (dx, dy) => { ctx.roundRect(ax - sw * .78 + dx, cy - shh * .84 + dy, sw * 1.56, shh * 1.78, sw * .75); };
    outline(ctx, up); celFill(ctx, up, PAL.shoe, L);
    celFill(ctx, so, PAL.sole, L);
    if (!SIL) {
      ctx.strokeStyle = 'rgba(70,10,30,.6)'; ctx.lineWidth = 2;
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(ax - sw * .6, cy + i * shh * .22); ctx.lineTo(ax + sw * .6, cy + i * shh * .22 - 4); ctx.stroke(); }
    }
  }
  // scarf tails stream back at the camera, widening with nearness
  for (const [side, len, wmax, seed] of [[-1, 1, 30, 0], [1, .62, 18, 3]]) {
    const pts = [];
    for (let i = 0; i <= 9; i++) {
      const u = i / 9, wave = Math.sin(t * 13 - u * 5 + seed) * 24 * u + fl(i + seed * 7, 10 * u);
      pts.push([side * (8 + u * 120 * len) + wave, -94 + u * 300 * len + Math.abs(wave) * .3]);
    }
    const ribbon = (dx, dy) => {
      const Lf = [], Rt = [];
      pts.forEach((q, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(9, i + 1)], d = V.norm(V.sub(b, a)), nn = [-d[1], d[0]];
        const w = lerp(5, wmax, i / 9) * (.35 + .65 * Math.abs(Math.cos(t * 10 - i * .8 + seed)));
        Lf.push(V.axpy(q, nn, w)); Rt.push(V.axpy(q, nn, -w));
      });
      const poly = [...Lf, ...Rt.reverse()];
      ctx.moveTo(poly[0][0] + dx, poly[0][1] + dy); for (const q of poly) ctx.lineTo(q[0] + dx, q[1] + dy); ctx.closePath();
    };
    outline(ctx, ribbon); celFill(ctx, ribbon, PAL.scarf, { ...L, s: L.s * .5 });
  }
  LW = lw0;
  ctx.restore();
}
