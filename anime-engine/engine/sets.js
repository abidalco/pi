// sets.js — locations. A side-view set paints behind the hero (draw) and optionally in front (front).
// Each set gives its light, shadow shear, wind and default flare; shots may override any of them.
const SUN_L = { x: .94, y: -.34, s: 1.5, r: .5 };

function drawSkyClose(ctx, cam, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'blur(10px)';
  ctx.drawImage(skyS1(), 1100, 420, 1300, 731, -60, -40, W + 120, H + 80);
  ctx.filter = 'none';
  const r = mulberry32(8);
  for (let i = 0; i < 26; i++) {
    const x = ((r() * 2200 - t * (300 + r() * 500)) % 2200 + 2200) % 2200 - 140, y = r() * H, s = 10 + r() * 46;
    ctx.fillStyle = `rgba(255,${200 + r() * 50 | 0},${150 + r() * 60 | 0},${.12 + .2 * r()})`;
    ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
  }
}

const SETS = {
  embankment: { draw: drawS1, front: drawS1Front, light: SUN_L, shadow: { shx: 1.25, shy: .1 }, wind: [-60, 0] },
  rooftop: { draw: drawRoof, light: SUN_L, shadow: { shx: 1.4, shy: .13 }, wind: [-50, 0], flare: [1560, 70, .5] },
  sky_close: { draw: drawSkyClose, light: { x: .9, y: -.4, s: 1.1, r: .3 }, shadow: false, wind: [-150, -30], flare: [1700, 120, .55] },
  // a 3D chase down a canyon of towers toward the sun (use with shot type 'chase')
  canyon: { chase: true },
};

// ---------------------------------------------------------------- the canyon chase
function skyCanyon() {
  return cached('skyCan', 2600, 1600, (c, w, h) => paintSky(c, w, h, {
    horizon: 860, sun: [1300, 790], seed: 21,
    clouds: [[420, 420, 900, 260, 131], [2150, 360, 900, 280, 151], [1300, 140, 1000, 220, 171], [700, 700, 500, 120, 191], [1950, 690, 520, 110, 211]],
  }));
}
const BIRDS = (() => { const r = mulberry32(55), b = []; for (let i = 0; i < 16; i++) b.push({ x: (r() - .5) * 12, y: 3 + r() * 9, z: 64 + r() * 16, vx: (r() < .5 ? -1 : 1) * (5 + r() * 10), vy: 4 + r() * 8, vz: 2 + r() * 6, ph: r() * TAU }); return b; })();
function drawCityBox(c, cam, b) {
  const d = Math.max(1, (b.z0 + b.z1) / 2 - cam.z), fg = fogK(d * 1.3);
  const top = mixHex('#7a5c96', '#f0a6a4', fg), front = mixHex('#33295a', '#e8a0a2', fg), side = mixHex('#8a5a88', '#f2b0a4', fg);
  if (cam.z < b.z0) polyFill(c, projPoly(cam, [[b.x0, 0, b.z0], [b.x1, 0, b.z0], [b.x1, b.h, b.z0], [b.x0, b.h, b.z0]]), front);
  if (cam.x > b.x1) polyFill(c, projPoly(cam, [[b.x1, 0, b.z0], [b.x1, 0, b.z1], [b.x1, b.h, b.z1], [b.x1, b.h, b.z0]]), side);
  if (cam.x < b.x0) polyFill(c, projPoly(cam, [[b.x0, 0, b.z0], [b.x0, 0, b.z1], [b.x0, b.h, b.z1], [b.x0, b.h, b.z0]]), side);
  polyFill(c, projPoly(cam, [[b.x0, b.h, b.z0], [b.x1, b.h, b.z0], [b.x1, b.h, b.z1], [b.x0, b.h, b.z1]]), top);
  c.strokeStyle = `rgba(255,205,160,${.75 * (1 - fg)})`; c.lineWidth = 1.5; c.beginPath(); seg3(c, cam, [b.x0, b.h, b.z1], [b.x1, b.h, b.z1]); c.stroke();
  if (b.lit < .5 && cam.z < b.z0) {
    const wp = projPoly(cam, [[lerp(b.x0, b.x1, .3), b.h * .4, b.z0], [lerp(b.x0, b.x1, .5), b.h * .4, b.z0], [lerp(b.x0, b.x1, .5), b.h * .6, b.z0], [lerp(b.x0, b.x1, .3), b.h * .6, b.z0]]);
    polyFill(c, wp, `rgba(255,200,120,${(1 - fg) * .9})`);
  }
}
// sh: the shot (t0, dur, chase params); t: absolute time
// chase params: z keys [[u, z]] (camera depth, 0 = shot start), y [a, b], enter (s for the hero to rise into place),
//   roll [u0, u1] barrel roll, birds (u when they scatter), flare [u0, u1] peak window
function drawChase(ctx, sh, t) {
  const c = sh.chase || {}, u = t - sh.t0, uq = q2(t) - sh.t0;
  const zk = c.z ?? [[0, -150], [.87, 22, E.lin], [1.35, 92, E.lin], [2, 190, E.out2]];
  const cam = { x: 1.6 * Math.sin(u * 2.6), y: lerp(...(c.y ?? [34, 44]), E.inOut(clamp(u / sh.dur))), z: kf(u, zk) };
  const rr = c.roll ?? [1.41, 1.81];
  const bank = 16 * Math.sin(uq * 3.4) + 360 * E.inOut(clamp((uq - rr[0]) / (rr[1] - rr[0])));
  const roll = 6 * Math.sin(u * 3.4 - .5);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(W / 2, H / 2); ctx.rotate(roll * D2R); ctx.translate(-W / 2, -H / 2);
  const base = ctx.getTransform();
  ctx.drawImage(skyCanyon(), -340, -320);
  const items = [...CITY.map(b => ({ b, d: b.z0 - cam.z })), ...TOWERS.map(T2 => ({ T: T2, d: T2.z0 - cam.z }))].sort((a, b) => b.d - a.d);
  for (const it of items) {
    if (it.T) { if (it.T.z1 > cam.z + NEAR) drawTower(ctx, cam, it.T); }
    else if (it.b.z1 > cam.z + 2) drawCityBox(ctx, cam, it.b);
  }
  const bt = c.birds ?? .7;
  for (const b of BIRDS) {
    const a = Math.max(0, u - bt);
    const s = proj(cam, [b.x + b.vx * a, 38 + b.y + b.vy * a, b.z + b.vz * a]);
    if (s[2] < 1) continue;
    const size = F3 * .55 / s[2], fl = Math.sin(t * (a > 0 ? 34 : 14) + b.ph);
    ctx.strokeStyle = '#2a1d3a'; ctx.lineWidth = Math.max(1.5, size * .16); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s[0] - size, s[1] - size * .5 * fl); ctx.quadraticCurveTo(s[0] - size * .4, s[1] - size * .3, s[0], s[1]);
    ctx.quadraticCurveTo(s[0] + size * .4, s[1] - size * .3, s[0] + size, s[1] - size * .5 * fl); ctx.stroke();
  }
  const r = mulberry32(99);
  ctx.strokeStyle = 'rgba(255,240,225,.55)'; ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = cam.x + (r() - .5) * 46, y = cam.y + (r() - .5) * 26, z0 = r() * 70;
    const z = cam.z + ((z0 - cam.z) % 70 + 70) % 70 + 1.2;
    const a = proj(cam, [x, y, z]), b = proj(cam, [x, y, z + 7]);
    ctx.lineWidth = clamp(9 / a[2], .6, 5);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  speedLinesRadial(ctx, W / 2, H / 2, Math.floor(t * 24) * 7 + 1, { n: 70, rin: 470, w: 5, color: 'rgba(255,250,240,.38)' });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const hy = kf(u, [[0, 1500], [c.enter ?? .4, 790, E.out]]) + 12 * Math.sin(q2(t) * 5);
  drawBack(ctx, 960 + 40 * Math.sin(q2(t) * 3.4 + .4), hy, 1.42, bank, q2(t), {});
  const fw = c.flare ?? [1.15, 1.67, 1.87];
  ctx.setTransform(base);
  lensFlare(ctx, 960, 470, .55 + .9 * smooth(clamp((u - fw[0]) / (fw[1] - fw[0]))) - .3 * smooth(clamp((u - fw[1] - .03) / .17)), 3);
}
