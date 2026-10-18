// world.js — painted backgrounds. Heavy static layers are painted once into cached canvases.
const W = 1920, H = 1080;

const SKY = {
  stops: [[0, '#1d2158'], [.30, '#3b3a7e'], [.52, '#7e5aa0'], [.70, '#d8788f'], [.84, '#ff9f6f'], [.95, '#ffcd92'], [1, '#ffe4b3']],
  cloudSh: '#6a5596', cloudLit: '#ff9f86', cloudRim: '#ffe3ba',
};

// ---------------------------------------------------------------- sky
function cloudPuffs(seed, w, h) {
  const r = mulberry32(seed), puffs = [];
  const n = 8 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1) - .5, x = u * w * .92 + (r() - .5) * w * .06;
    const hp = 1 - Math.pow(Math.abs(u * 2), 1.5);
    const rad = h * (.2 + .36 * hp) * (.8 + .4 * r());
    puffs.push([x, -rad * .45 - hp * h * .32 * r(), rad]);
  }
  for (let i = 0; i < n + 3; i++) { const u = i / (n + 2) - .5; puffs.push([u * w * .95, h * .02, h * (.13 + .08 * r())]); }
  return puffs;
}
function drawCloud(c, x, y, w, h, seed, sun) {
  const puffs = cloudPuffs(seed, w, h);
  const build = (dx, dy) => { for (const [px, py, pr] of puffs) { c.moveTo(x + px + pr + dx, y + py + dy); c.arc(x + px + dx, y + py + dy, pr, 0, TAU); } };
  const L = V.norm([sun[0] - x, sun[1] - y]);
  c.save();
  c.beginPath(); c.rect(x - w, y - h * 2, w * 2, h * 2 + h * .12); c.clip();     // flat cumulus base
  c.beginPath(); build(0, 0); c.clip();
  c.fillStyle = SKY.cloudRim; c.fill();
  c.beginPath(); build(-L[0] * h * .05, -L[1] * h * .05); c.clip();
  c.fillStyle = SKY.cloudSh; c.fill();
  c.beginPath(); build(L[0] * h * .22, L[1] * h * .22); c.fillStyle = SKY.cloudLit; c.fill();
  // cool top fade + warm underside glow
  const g = c.createLinearGradient(0, y - h, 0, y + h * .15);
  g.addColorStop(0, 'rgba(40,36,110,.45)'); g.addColorStop(.6, 'rgba(40,36,110,0)'); g.addColorStop(1, 'rgba(255,190,140,.35)');
  c.fillStyle = g; c.fillRect(x - w, y - h * 2, w * 2, h * 3);
  c.restore();
}
function paintSky(c, w, h, o) {
  const hz = o.horizon;
  const g = c.createLinearGradient(0, hz - h * .95, 0, hz);
  for (const [k, col] of SKY.stops) g.addColorStop(k, col);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const [sx, sy] = o.sun;
  // high streak clouds
  const r = mulberry32(o.seed || 9);
  for (let i = 0; i < 14; i++) {
    const y = hz * (.12 + .5 * r()), x = r() * w, ww = 300 + r() * 600, hh = 6 + r() * 10;
    c.fillStyle = `rgba(255,${150 + r() * 60 | 0},${160 + r() * 40 | 0},${.12 + .18 * r()})`;
    c.beginPath(); c.ellipse(x, y, ww, hh, 0, 0, TAU); c.fill();
  }
  // sun glow
  const sg = c.createRadialGradient(sx, sy, 0, sx, sy, w * .55);
  sg.addColorStop(0, 'rgba(255,252,232,1)'); sg.addColorStop(.035, 'rgba(255,240,200,.95)'); sg.addColorStop(.1, 'rgba(255,196,130,.5)');
  sg.addColorStop(.3, 'rgba(255,140,110,.16)'); sg.addColorStop(1, 'rgba(255,120,120,0)');
  c.fillStyle = sg; c.fillRect(0, 0, w, h);
  for (const cl of o.clouds || []) drawCloud(c, cl[0], cl[1], cl[2], cl[3], cl[4], [sx, sy]);
  // low horizon cloud bands, gold-lit
  for (let i = 0; i < 6; i++) {
    const y = hz - 20 - r() * 90, x = r() * w;
    c.fillStyle = `rgba(255,${190 + r() * 40 | 0},${150 + r() * 30 | 0},${.25 + .3 * r()})`;
    c.beginPath(); c.ellipse(x, y, 260 + r() * 400, 5 + r() * 7, 0, 0, TAU); c.fill();
  }
}

// ---------------------------------------------------------------- skylines
function paintSkyline(c, w, h, o) {
  const r = mulberry32(o.seed);
  const base = h;
  const bld = (x, bw, bh, top) => {
    const y = base - bh;
    const g = c.createLinearGradient(0, y, 0, base);
    g.addColorStop(0, o.top); g.addColorStop(1, o.bottom);
    c.fillStyle = g; c.fillRect(x, y, bw, bh);
    // sun-side edge
    c.fillStyle = o.rim; c.fillRect(x + bw - Math.max(2, bw * .06), y, Math.max(2, bw * .06), bh);
    c.fillRect(x, y, bw, Math.max(1.5, o.winH * .3));
    // windows
    const cols = Math.floor((bw - 6) / (o.winW * 2)), rows = Math.floor((bh - 10) / (o.winH * 1.9));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const q = r();
      if (q < o.lit) { c.fillStyle = q < o.lit * .35 ? o.win2 : o.win; c.fillRect(x + 4 + i * o.winW * 2, y + 8 + j * o.winH * 1.9, o.winW, o.winH); }
    }
    // roof clutter
    if (top !== false) {
      const k = r();
      c.fillStyle = o.top;
      if (k < .3) { c.fillRect(x + bw * .2, y - 10, bw * .25, 10); c.fillRect(x + bw * .27, y - 18, 3, 8); }
      else if (k < .5) { c.fillRect(x + bw * .6, y - 26, 2, 26); }
      else if (k < .65) { c.beginPath(); c.ellipse(x + bw * .4, y - 9, bw * .12, 9, 0, 0, TAU); c.fill(); c.fillRect(x + bw * .3, y - 9, bw * .2, 9); }
    }
  };
  let x = -30;
  while (x < w) {
    const bw = lerp(o.minW, o.maxW, r()), bh = lerp(o.minH, o.maxH, Math.pow(r(), 1.6));
    bld(x, bw, bh);
    x += bw + (r() < .3 ? r() * o.gap : -bw * .2 * r());
  }
  for (const t of o.towers || []) {
    bld(t.x, t.w, t.h, false);
    c.fillStyle = o.top;
    c.beginPath(); c.moveTo(t.x + t.w * .15, base - t.h); c.lineTo(t.x + t.w * .5, base - t.h - t.w * .9); c.lineTo(t.x + t.w * .85, base - t.h); c.fill();
    c.fillRect(t.x + t.w * .5 - 1.5, base - t.h - t.w * 2.2, 3, t.w * 1.4);
    c.fillStyle = '#ff6a5a'; c.beginPath(); c.arc(t.x + t.w * .5, base - t.h - t.w * 2.2, 3, 0, TAU); c.fill();
  }
}

// ---------------------------------------------------------------- set: S1 embankment
const EMB = { horizon: 600, ground: 710 };
function skyS1() {
  return cached('skyS1', 2600, 1500, (c, w, h) => paintSky(c, w, h, {
    horizon: EMB.horizon + 300, sun: [1880, 820], seed: 4,
    clouds: [[560, 600, 700, 210, 11], [1500, 480, 820, 240, 23], [2250, 630, 600, 170, 37], [120, 420, 500, 150, 51], [1000, 230, 900, 200, 63]],
  }));
}
function farS1() {
  return cached('farS1', 3200, 460, (c, w, h) => paintSkyline(c, w, h, {
    seed: 77, minW: 30, maxW: 90, minH: 40, maxH: 190, gap: 30, top: '#a06f9e', bottom: '#d98e9c', rim: '#ffc6a0',
    win: 'rgba(255,214,150,.75)', win2: 'rgba(255,240,200,.9)', winW: 3, winH: 4, lit: .1,
    towers: [{ x: 1980, w: 54, h: 400 }, { x: 2070, w: 48, h: 350 }],
  }));
}
function midS1() {
  return cached('midS1', 3600, 300, (c, w, h) => paintSkyline(c, w, h, {
    seed: 91, minW: 50, maxW: 140, minH: 30, maxH: 150, gap: 50, top: '#6b4f85', bottom: '#8e5f8c', rim: '#ff9f7c',
    win: 'rgba(255,200,130,.85)', win2: 'rgba(255,236,190,.95)', winW: 4, winH: 6, lit: .14,
  }));
}
function drawS1(ctx, cam, t) {
  const z = cam.z;
  ctx.setTransform(1, 0, 0, 1, 0, cam.dy || 0);
  const pan = cam.x * z;                      // world → screen pan in px at k=1
  ctx.drawImage(skyS1(), -300 - pan * .02, -300 + (cam.skyY ?? 0));
  ctx.drawImage(farS1(), -400 - pan * .06, EMB.horizon - 460 + 6 + (cam.skyY ?? 0) * .3);
  // river
  const ry = EMB.horizon + (cam.skyY ?? 0) * .3;
  const g = ctx.createLinearGradient(0, ry, 0, EMB.ground + 40);
  g.addColorStop(0, '#ffd8a0'); g.addColorStop(.25, '#f39b86'); g.addColorStop(1, '#7a5694');
  ctx.fillStyle = g; ctx.fillRect(0, ry, W, EMB.ground + 60 - ry);
  // shimmer and the sun's column of light on the water
  const r = mulberry32(5);
  for (let i = 0; i < 70; i++) {
    const y = ry + 4 + Math.pow(r(), 1.4) * (EMB.ground - ry);
    const x = ((r() * 2600 - pan * .12) % 2600 + 2600) % 2600 - 300;
    ctx.fillStyle = `rgba(255,235,200,${.15 + .25 * r()})`;
    ctx.fillRect(x, y, 30 + r() * 120, 1.5 + (y - ry) * .015);
  }
  for (let i = 0; i < 46; i++) {
    const y = ry + 3 + i * 2.6, s = Math.sin(t * 11 + i * 1.7) * .5 + .5;
    const wv = (34 - i * .4) * (.5 + s);
    ctx.fillStyle = `rgba(255,248,220,${.35 + .5 * s})`;
    ctx.fillRect(1660 - pan * .02 - wv + noise1(t * 3 + i, 9) * 18, y, wv * 2, 1.6);
  }
  ctx.drawImage(midS1(), -500 - pan * .14, EMB.ground - 300 - 2);
  // walkway (k = 1) and railing (k = .93)
  ctx.save();
  const gy = EMB.ground;
  const wg = ctx.createLinearGradient(0, gy, 0, H);
  wg.addColorStop(0, '#b77c86'); wg.addColorStop(.12, '#d99a8a'); wg.addColorStop(1, '#a86d7d');
  ctx.fillStyle = wg; ctx.fillRect(0, gy, W, H - gy);
  ctx.strokeStyle = 'rgba(80,40,80,.35)'; ctx.lineWidth = 2;
  for (let i = -2; i < 20; i++) {
    const wx = Math.floor(cam.x / 60) * 60 + (i - 8) * 60;
    const sx = (wx - cam.x) * z + W / 2;
    ctx.beginPath(); ctx.moveTo(sx, gy + 30); ctx.lineTo(sx + (sx - W / 2) * .55, H); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(70,35,80,.45)'; ctx.fillRect(0, gy, W, 30);
  ctx.fillStyle = '#ffcfa0'; ctx.fillRect(0, gy + 28, W, 3);
  // railing
  const k = .93;
  ctx.fillStyle = '#2c2244';
  for (let i = -2; i < 40; i++) {
    const wx = Math.floor(cam.x * k / 34) * 34 + (i - 14) * 34;
    const sx = (wx - cam.x * k) * z + W / 2;
    ctx.fillRect(sx, gy - 118, 7, 120);
  }
  ctx.fillRect(0, gy - 126, W, 12); ctx.fillRect(0, gy - 66, W, 7);
  ctx.fillStyle = '#ffb08a'; ctx.fillRect(0, gy - 126, W, 3);
  ctx.restore();
}
// foreground for S1: utility pole and sagging wires (k = 1.55)
function drawS1Front(ctx, cam) {
  ctx.setTransform(1, 0, 0, 1, 0, cam.dy || 0);
  const z = cam.z, k = 1.55;
  const px = (-70 - cam.x * k) * z + W / 2;
  ctx.fillStyle = '#1a1328';
  // wires first (they span the frame)
  ctx.strokeStyle = 'rgba(26,19,40,.9)';
  for (let i = 0; i < 4; i++) {
    const y0 = 70 + i * 26, x1 = px + 2600;
    ctx.lineWidth = 3 - i * .4;
    ctx.beginPath(); ctx.moveTo(px - 2600, y0); ctx.quadraticCurveTo(px - 1300, y0 + 260, px, y0);
    ctx.quadraticCurveTo(px + 1300, y0 + 260 + i * 20, x1, y0); ctx.stroke();
  }
  ctx.fillRect(px - 16, -20, 32, H + 40);
  ctx.fillRect(px - 120, 60, 240, 14); ctx.fillRect(px - 90, 118, 180, 10);
  for (const dx of [-100, -40, 40, 100]) { ctx.fillRect(px + dx - 5, 44, 10, 18); }
  ctx.fillRect(px + 16, 300, 70, 90);   // transformer box
  ctx.fillStyle = 'rgba(255,170,120,.6)'; ctx.fillRect(px + 13, -20, 4, H + 40);
  // grass tufts along the bottom edge
  const r = mulberry32(31);
  for (let i = 0; i < 90; i++) {
    const wx = i * 22 + r() * 10, sx = ((wx - cam.x * 1.3 * z * .25) % 2100 + 2100) % 2100 - 90;
    const hgt = 40 + r() * 90;
    ctx.fillStyle = '#20142c';
    ctx.beginPath(); ctx.moveTo(sx, H); ctx.quadraticCurveTo(sx + 6, H - hgt * .6, sx + 14 + r() * 10, H - hgt); ctx.lineTo(sx + 12, H); ctx.fill();
  }
}

// ---------------------------------------------------------------- set: rooftop (S4–S6)
const ROOF = { horizon: 560, floor: 712 };
function skyRoof() {
  return cached('skyRoof', 2800, 1500, (c, w, h) => paintSky(c, w, h, {
    horizon: ROOF.horizon + 300, sun: [1950, 770], seed: 12,
    clouds: [[700, 500, 900, 250, 61], [1700, 620, 620, 170, 73], [2500, 460, 700, 220, 89], [150, 660, 460, 120, 97], [1300, 250, 1000, 200, 111]],
  }));
}
function farRoof() {
  return cached('farRoof', 3600, 420, (c, w, h) => paintSkyline(c, w, h, {
    seed: 303, minW: 30, maxW: 100, minH: 40, maxH: 210, gap: 40, top: '#9c6c9c', bottom: '#d68e9a', rim: '#ffc39c',
    win: 'rgba(255,214,150,.75)', win2: 'rgba(255,240,200,.9)', winW: 3, winH: 4, lit: .1,
    towers: [{ x: 560, w: 60, h: 390 }, { x: 650, w: 54, h: 340 }],
  }));
}
function midRoof() {
  return cached('midRoof', 3800, 260, (c, w, h) => paintSkyline(c, w, h, {
    seed: 404, minW: 60, maxW: 160, minH: 40, maxH: 170, gap: 60, top: '#5d4680', bottom: '#7d5486', rim: '#ff9e7a',
    win: 'rgba(255,200,130,.85)', win2: 'rgba(255,236,190,.95)', winW: 4, winH: 6, lit: .16,
  }));
}
// roof set; cam: {x, y, z} world camera. Floor plane y=0 in world maps to ROOF-relative rows.
function drawRoof(ctx, cam, t) {
  const z = cam.z, pan = cam.x * z, lift = cam.lift || 0;    // lift: px the horizon moves down for a lower camera
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(skyRoof(), -400 - pan * .02, -300 + lift * .4);
  ctx.drawImage(farRoof(), -300 - pan * .05, ROOF.horizon - 420 + 8 + lift * .5);
  ctx.drawImage(midRoof(), -600 - pan * .12, ROOF.floor - 260 - 30 + lift * .7);
  const fy = ROOF.floor + lift;
  // fence (k = .9): posts, rails, chain-link diamonds
  const k = .9, fz = z * .9;
  const ftop = fy - 108 * fz * .95;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, ftop, W, fy - ftop); ctx.clip();
  ctx.strokeStyle = `rgba(40,28,64,${clamp(.5 - (z - 3.6) * .06, .22, .5)})`; ctx.lineWidth = 1.6 * Math.max(1, z / 4.5);
  const sp = 16 * Math.max(1, z / 3.6), off = ((-cam.x * k * fz) % sp + sp) % sp;
  for (let x = -H; x < W + H; x += sp) {
    ctx.beginPath(); ctx.moveTo(x + off, ftop); ctx.lineTo(x + off + (fy - ftop), fy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + off, ftop); ctx.lineTo(x + off - (fy - ftop), fy); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#2a2142';
  for (let i = -3; i < 16; i++) {
    const wx = Math.floor(cam.x * k / 130) * 130 + (i - 6) * 130, sx = (wx - cam.x * k) * fz + W / 2;
    ctx.fillRect(sx - 5, ftop - 6, 10, fy - ftop + 6);
  }
  ctx.fillRect(0, ftop - 8, W, 9); ctx.fillStyle = '#ffb58c'; ctx.fillRect(0, ftop - 8, W, 2.5);
  ctx.fillStyle = '#2a2142'; ctx.fillRect(0, fy - 40, W, 5);
  // floor with perspective tiles
  const g = ctx.createLinearGradient(0, fy, 0, H);
  g.addColorStop(0, '#a46e86'); g.addColorStop(.18, '#d49a8e'); g.addColorStop(1, '#b07784');
  ctx.fillStyle = g; ctx.fillRect(0, fy, W, H - fy);
  // long warm light streak across the floor from the low sun
  const sg = ctx.createLinearGradient(0, 0, W, 0);
  sg.addColorStop(0, 'rgba(255,200,150,0)'); sg.addColorStop(1, 'rgba(255,214,160,.32)');
  ctx.fillStyle = sg; ctx.fillRect(0, fy, W, H - fy);
  ctx.strokeStyle = 'rgba(90,50,90,.32)'; ctx.lineWidth = 2;
  const vx = W / 2, vy = ROOF.horizon + lift;
  for (const d of [8, 22, 44, 76, 122, 190, 290]) {
    const y = fy + d * (z / 3.1); if (y > H) break;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let i = -30; i < 30; i++) {
    const wx = Math.floor(cam.x / 70) * 70 + i * 70, bx = (wx - cam.x) * z + W / 2;
    // line from the floor's back edge toward the camera, converging on the vanishing point
    const u = (fy - vy), ex = vx + (bx - vx) * (H - vy) / u;
    ctx.beginPath(); ctx.moveTo(bx, fy); ctx.lineTo(ex, H); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(60,30,80,.35)'; ctx.fillRect(0, fy, W, 10);
  // water tank on legs, left side (k = .96)
  const tx = (-330 - cam.x * .96) * z * .96 + W / 2, tb = fy + 4;
  ctx.fillStyle = '#2c2346';
  for (const dx of [-70, -20, 20, 70]) ctx.fillRect(tx + dx - 5, tb - 150, 10, 150);
  ctx.fillRect(tx - 90, tb - 160, 180, 12);
  const tg = ctx.createLinearGradient(tx - 85, 0, tx + 85, 0);
  tg.addColorStop(0, '#3a2f5c'); tg.addColorStop(.75, '#6c5a8e'); tg.addColorStop(1, '#ffb894');
  ctx.fillStyle = tg; ctx.beginPath(); ctx.roundRect(tx - 85, tb - 330, 170, 175, 12); ctx.fill();
  ctx.fillStyle = '#2c2346'; ctx.beginPath(); ctx.ellipse(tx, tb - 330, 86, 18, 0, Math.PI, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(30,20,50,.6)'; ctx.lineWidth = 3;
  for (const yy of [-290, -240, -195]) { ctx.beginPath(); ctx.moveTo(tx - 85, tb + yy); ctx.lineTo(tx + 85, tb + yy); ctx.stroke(); }
}

// ---------------------------------------------------------------- 3D: the tower canyon (S3)
const F3 = 1150, NEAR = .4;
const TOWERS = [
  { x0: -40, x1: -8, z0: 30, z1: 72, h: 175, seed: 1 },
  { x0: 8, x1: 40, z0: 40, z1: 86, h: 150, seed: 2 },
  { x0: -150, x1: -96, z0: 150, z1: 200, h: 120, seed: 3 },
  { x0: 84, x1: 130, z0: 175, z1: 225, h: 130, seed: 4 },
  { x0: -260, x1: -200, z0: 260, z1: 320, h: 160, seed: 5 },
  { x0: 190, x1: 250, z0: 300, z1: 360, h: 140, seed: 6 },
];
function proj(cam, p) {
  const x = p[0] - cam.x, y = p[1] - cam.y, z = p[2] - cam.z;
  return [W / 2 + F3 * x / z, H / 2 - F3 * y / z, z];
}
// clip a world-space polygon to the near plane, then project
function projPoly(cam, pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const za = a[2] - cam.z, zb = b[2] - cam.z;
    if (za >= NEAR) out.push(a);
    if ((za >= NEAR) !== (zb >= NEAR)) {
      const k = (NEAR - za) / (zb - za);
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
    }
  }
  return out.map(p => proj(cam, p));
}
function polyFill(ctx, sp, style) {
  if (sp.length < 3) return;
  ctx.beginPath(); ctx.moveTo(sp[0][0], sp[0][1]); for (const q of sp) ctx.lineTo(q[0], q[1]); ctx.closePath();
  ctx.fillStyle = style; ctx.fill();
}
function seg3(ctx, cam, a, b) {
  let za = a[2] - cam.z, zb = b[2] - cam.z;
  if (za < NEAR && zb < NEAR) return;
  if (za < NEAR) { const k = (NEAR - za) / (zb - za); a = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  if (zb < NEAR) { const k = (NEAR - zb) / (za - zb); b = [b[0] + (a[0] - b[0]) * k, b[1] + (a[1] - b[1]) * k, b[2] + (a[2] - b[2]) * k]; }
  const A = proj(cam, a), B = proj(cam, b);
  ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
}
const fogK = d => 1 - Math.exp(-d / 420);

// a vertical face given as a function face(u, v) → world point, u across, v up (0..1 each)
function drawFace(ctx, cam, f) {
  const corners = [f.at(0, 0), f.at(1, 0), f.at(1, 1), f.at(0, 1)];
  const sp = projPoly(cam, corners);
  if (sp.length < 3) return;
  const minx = Math.min(...sp.map(q => q[0])), maxx = Math.max(...sp.map(q => q[0]));
  if (maxx < -50 || minx > W + 50) return;
  // base gradient across the face in screen space
  const a = proj(cam, f.at(0, .5)), b = proj(cam, f.at(1, .5));
  let g;
  if (a[2] > NEAR && b[2] > NEAR) { g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]); g.addColorStop(0, f.c0); g.addColorStop(1, f.c1); }
  else g = f.c1;
  polyFill(ctx, sp, g);
  // glass reflection band: sky colours sliding down the face
  ctx.save();
  ctx.beginPath(); ctx.moveTo(sp[0][0], sp[0][1]); for (const q of sp) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.clip();
  const rg = ctx.createLinearGradient(0, 0, 0, H);
  rg.addColorStop(0, 'rgba(120,100,200,.18)'); rg.addColorStop(.55, 'rgba(255,150,140,.12)'); rg.addColorStop(1, 'rgba(255,200,150,.05)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  // lit windows
  const r = mulberry32(f.seed * 977);
  for (let j = 0; j < f.floors; j++) for (let i = 0; i < f.cols; i++) {
    const q = r();
    if (q > f.lit) continue;
    const u0 = (i + .18) / f.cols, u1 = (i + .82) / f.cols, v0 = (j + .25) / f.floors, v1 = (j + .8) / f.floors;
    const wp = projPoly(cam, [f.at(u0, v0), f.at(u1, v0), f.at(u1, v1), f.at(u0, v1)]);
    polyFill(ctx, wp, q < f.lit * .3 ? 'rgba(255,244,210,.95)' : 'rgba(255,190,110,.8)');
  }
  // floor lines and mullions
  ctx.strokeStyle = f.line; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let j = 1; j < f.floors; j++) seg3(ctx, cam, f.at(0, j / f.floors), f.at(1, j / f.floors));
  ctx.stroke();
  ctx.strokeStyle = f.line2; ctx.beginPath();
  for (let i = 1; i < f.cols; i++) seg3(ctx, cam, f.at(i / f.cols, 0), f.at(i / f.cols, 1));
  ctx.stroke();
  ctx.restore();
  // sun-lit edge
  if (f.rimEdge) {
    ctx.strokeStyle = f.rimEdge; ctx.lineWidth = f.rimW || 4; ctx.beginPath();
    seg3(ctx, cam, f.at(f.rimU, 0), f.at(f.rimU, 1)); ctx.stroke();
  }
}

function drawTower(ctx, cam, T) {
  const d = Math.max(0, T.z0 - cam.z), fg = fogK(d);
  const fog = (hex, k = fg) => mixHex(hex, '#e69aa0', k * .8);
  const floors = Math.round(T.h / 4.2), colsF = Math.round((T.x1 - T.x0) / 3.2), colsS = Math.round((T.z1 - T.z0) / 3.2);
  const faces = [];
  // face toward the gap (the sun is straight ahead, so these inner walls catch it at the far end)
  if (cam.x > T.x1) faces.push({ at: (u, v) => [T.x1, v * T.h, lerp(T.z0, T.z1, u)], c0: fog('#3a2d66'), c1: fog('#ff9a7c'),
    floors, cols: colsS, lit: .07, seed: T.seed * 3, line: 'rgba(30,20,60,.55)', line2: 'rgba(30,20,60,.3)', rimEdge: 'rgba(255,230,180,.95)', rimU: 1 });
  if (cam.x < T.x0) faces.push({ at: (u, v) => [T.x0, v * T.h, lerp(T.z0, T.z1, u)], c0: fog('#3a2d66'), c1: fog('#ff9a7c'),
    floors, cols: colsS, lit: .07, seed: T.seed * 5, line: 'rgba(30,20,60,.55)', line2: 'rgba(30,20,60,.3)', rimEdge: 'rgba(255,230,180,.95)', rimU: 1 });
  if (cam.z < T.z0) faces.push({ at: (u, v) => [lerp(T.x0, T.x1, u), v * T.h, T.z0], c0: fog('#43377a'), c1: fog('#5a4688'),
    floors, cols: colsF, lit: .16, seed: T.seed * 7, line: 'rgba(150,130,210,.5)', line2: 'rgba(150,130,210,.3)',
    rimEdge: 'rgba(255,190,150,.7)', rimU: cam.x > (T.x0 + T.x1) / 2 ? 1 : 0, rimW: 3 });
  for (const f of faces) drawFace(ctx, cam, f);
  // roof edge glow
  ctx.strokeStyle = 'rgba(255,210,170,.8)'; ctx.lineWidth = 2.5; ctx.beginPath();
  seg3(ctx, cam, [T.x0, T.h, T.z0], [T.x1, T.h, T.z0]); seg3(ctx, cam, [T.x1, T.h, T.z0], [T.x1, T.h, T.z1]); seg3(ctx, cam, [T.x0, T.h, T.z0], [T.x0, T.h, T.z1]);
  ctx.stroke();
}

// low-rise city carpet far below: boxes on a jittered grid
const CITY = (() => {
  const r = mulberry32(2024), out = [];
  for (let gx = -12; gx <= 12; gx++) for (let gz = -2; gz < 26; gz++) {
    const x = gx * 34 + (r() - .5) * 10, z = gz * 34 + (r() - .5) * 10;
    if (Math.abs(x) < 22) continue;              // keep the flight path clear
    out.push({ x0: x - 11 - r() * 5, x1: x + 11 + r() * 5, z0: z - 11 - r() * 5, z1: z + 11 + r() * 5, h: 5 + Math.pow(r(), 2) * 17, lit: r() });
  }
  return out;
})();
