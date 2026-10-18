// actions.js — the action library. An action turns local time u (seconds) into a pose with world root (x, y, rot).
//   ACTIONS[name](params, start) → { dur, pose(u), cues: [{t, name}], rootOnes: false|'x'|'xy', smear?(u) }
//   start = { x, pose, dir }  — where the previous action left the character. Floor is y = 0, height ≈ 96 units.
// Poses are in the character's own (right-facing) space; dir = -1 mirrors the drawing and the root motion.

const FACES = {
  neutral: { narrow: 0, brow: 0, smile: 0, mouth: 0, grit: 0, tired: 0, eye: 1, sweat: 0, blush: 0 },
  determined: { narrow: 1, brow: -1, mouth: 0, smile: 0 },
  grit: { narrow: 1, brow: -1, mouth: .3, grit: 1 },
  smirk: { smile: 1, narrow: .4, brow: -.4, mouth: 0 },
  smile: { smile: 1, eye: .6, brow: .3, mouth: 0 },
  happy: { smile: 1, mouth: .45, eye: .95, brow: .5 },
  tired: { tired: 1, brow: 1, mouth: .5, sweat: 1, blush: .6, eye: .85 },
  surprised: { eye: 1, narrow: 0, mouth: .7, brow: 1, smile: 0 },
  blink: { eye: .05 },
  glint: { glint: 1 },
};
const LOOKS = {               // neck/head are added, eyes are set
  up: { neck: -12, head: -10, lookY: -1 }, down: { neck: 14, head: 8, lookY: 1 },
  forward: { lookX: .6, lookY: 0 }, back: { lookX: -.9 }, sky: { neck: -30, head: -16, lookY: -1 },
};

// which key drawing (if the character has one) stands for each library pose
const POSE_SPR = { stand: 'idle', lookUp: 'idle', crouch: 'crouch', launch: 'launch', fly: 'fly', brake: 'brake', land: 'land', landRise: 'land_look',
  preFlip: 'crouch', spring: 'launch', tuck: 'tuck', stick: 'stick', wobble: 'wobble', sit: 'sit' };
const alt = (u, a, b, hz = 3) => (Math.floor(u * hz * 2) % 2 ? b : a);
function breathe(q, u, k = 1) { const b = Math.sin(u * TAU * .45); q.lean += b * .8 * k; q.shN += b * 1.4 * k; q.shF += b * 1.4 * k; q.neck -= b * .6 * k; }
const poseOf = v => P(typeof v === 'string' ? POSE[v] : v || {});
const bez = (a, b, c, d, u) => { const v = 1 - u; return [0, 1].map(i => v * v * v * a[i] + 3 * v * v * u * b[i] + 3 * v * u * u * c[i] + u * u * u * d[i]); };

function runPose(ph) {
  const leg = q => {
    q = ((q % 1) + 1) % 1;
    return { hip: 34 * Math.cos(TAU * q) + 10, kn: q < .4 ? 22 + 24 * Math.sin(Math.PI * q / .4) : 22 + 98 * Math.sin(Math.PI * (q - .4) / .6) };
  };
  const n = leg(ph), f = leg(ph + .5), c = Math.cos(TAU * ph);
  return P({ lean: 17, curl: 4, neck: -14, head: -4, hipN: n.hip, knN: n.kn, hipF: f.hip, knF: f.kn,
    shN: -40 * c + 12, elN: 96, shF: 40 * c + 8, elF: 96, narrow: .5, brow: -.5, lookX: .7, mouth: .12 });
}

const ACTIONS = {
  // ---- standing ----------------------------------------------------------
  hold(p, s) {
    const to = p.pose ? poseOf(p.pose) : P(s.pose), mode = p.plant || 'knee';
    const spr = typeof p.pose === 'string' ? POSE_SPR[p.pose] : null;
    return { dur: p.dur ?? 1, spr: () => spr, pose: u => { const q = P(to); if (p.breathe !== false) breathe(q, u); q.x = s.x; q.rot = 0; return plant(q, 0, mode); } };
  },
  idle(p, s) { return ACTIONS.hold({ pose: 'stand', ...p }, s); },
  // move into any library pose in place (dx slides while it happens)
  pose(p, s) {
    const to = poseOf(p.to), D = p.dur ?? .35, mode = p.plant || 'knee', e = E[p.ease] || E.inOut;
    return { dur: D, spr: () => POSE_SPR[p.to], pose: u => { const k = e(clamp(u / D)); const q = mixPose(s.pose, to, k); q.x = s.x + (p.dx ?? 0) * s.dir * k; return plant(q, 0, mode); } };
  },
  walk(p, s) {
    const v = p.speed ?? 76, D = p.dur ?? 1, r = v / 76, cues = [];
    for (let t = 0; t < D - 1e-6; t += .5 / r) cues.push({ t, name: 'step' });
    // drawn walk: contact → down → passing → up each step, each drawing held three frames
    const wspr = u => ['walk_1', 'walk_2', 'walk_3', 'walk_4'][Math.floor(((u * r * 2) % 1) * 4)];
    return { dur: D, rootOnes: 'x', cues, spr: wspr, pose: u => { const ph = u * r, q = flatFeet(walkPose(ph), ph); q.x = s.x + v * u * s.dir; return plant(q, 0); } };
  },
  run(p, s) {
    const v = p.speed ?? 210, D = p.dur ?? 1, r = v / 105, cues = [];
    for (let t = 0; t < D - 1e-6; t += .5 / r) cues.push({ t, name: 'runstep' });
    return { dur: D, rootOnes: 'x', cues, spr: u => ['walk_1', 'walk_3', 'walk_2', 'walk_4'][Math.floor(((u * r * 2) % 1) * 4)], pose: u => {
      const ph = u * r, q = flatFeet(runPose(ph), ph); q.x = s.x + v * u * s.dir; plant(q, 0);
      q.y -= 4 * Math.max(0, Math.sin(TAU * 2 * ph)); return q; } };
  },
  stop(p, s) {
    const to = poseOf(p.to ?? 'stand'), D = p.dur ?? .25, slide = p.slide ?? 12;
    return { dur: D, rootOnes: 'x', cues: [{ t: D * .85, name: 'scuff' }], spr: u => (u < D * .5 ? 'walk_4' : POSE_SPR[p.to ?? 'stand'] || 'idle'), pose: u => {
      const k = clamp(u / D), q = mixPose(s.pose, to, E.out(k)); q.x = s.x + slide * E.out2(k) * s.dir; return plant(q, 0); } };
  },
  wave(p, s) {
    const D = p.dur ?? 1.2, up = P({ shN: 116, elN: 46, wrN: -8, fistN: 0, smile: 1, mouth: .3, neck: -2, head: -4, lean: 0, lookX: .2 });
    return { dur: D, cues: [{ t: .1, name: 'swish' }], spr: u => (u < .1 || u > D - .1 ? 'idle' : alt(u, 'wave_a', 'wave_b')), pose: u => {
      const k = E.out(clamp(u / .22)) * (1 - E.in(clamp((u - D + .22) / .22)));
      const q = mixPose(P(POSE.stand), up, k); q.elN += Math.sin(u * TAU * 2.6) * 22 * k; breathe(q, u); q.x = s.x; return plant(q, 0); } };
  },
  point(p, s) {
    const D = p.dur ?? 1, at = P({ shN: 90, elN: 4, wrN: -4, fistN: 1, lean: 8, curl: 2, narrow: .5, brow: -.5, mouth: .3, lookX: .9 });
    return { dur: D, cues: [{ t: .05, name: 'swish' }], spr: u => (u < .06 || u > D - .1 ? 'idle' : 'point'), pose: u => {
      const k = E.outBack(clamp(u / .2)) * (1 - E.in(clamp((u - D + .2) / .2)));
      const q = mixPose(P(POSE.stand), at, clamp(k, 0, 1.15)); breathe(q, u, .5); q.x = s.x; return plant(q, 0); } };
  },
  talk(p, s) {
    const D = p.dur ?? 1.5, base = poseOf(p.pose ?? 'stand');
    return { dur: D, cues: [{ t: 0, name: 'talk', dur: D }], spr: u => (hash(Math.floor(u * 8), 9) < .72 ? 'talk_a' : 'talk_b'), pose: u => {
      const q = P(base), sy = Math.floor(u * 8);
      q.mouth = hash(sy, 9) < .72 ? .25 + .5 * hash(sy, 10) : 0;
      q.neck += Math.sin(u * 5.3) * 2.5; q.head += Math.sin(u * 3.1) * 2;
      q.shN += 14 + Math.sin(u * 3.4) * 10; q.elN += 50 + Math.sin(u * 4.1) * 14; q.fistN = 0;
      breathe(q, u); q.x = s.x; return plant(q, 0); } };
  },
  hop(p, s) {
    const Hh = p.height ?? 26, dx = (p.dist ?? 0) * s.dir, D = .6;
    const crouch = P({ ...POSE.preFlip, shN: -20, shF: -26 }), air = P({ ...POSE.spring, shN: 120, shF: 100, hipN: 20, knN: 40, hipF: 10, knF: 50 });
    return { dur: D, rootOnes: 'xy', cues: [{ t: .14, name: 'push' }, { t: .48, name: 'step' }],
      spr: u => (u < .14 ? 'crouch' : u < .48 ? 'hop' : u < .56 ? 'stick' : 'idle'), pose: u => {
      const q = poseKeys(u, [[0, s.pose], [.12, crouch], [.18, air, E.out], [.44, air], [.5, POSE.stick], [D, POSE.stand, E.inOut]]);
      const k = clamp((u - .16) / .32);
      q.x = s.x + dx * k; plant(q, 0, 'knee'); if (k > 0 && k < 1) q.y -= 4 * Hh * k * (1 - k); return q; } };
  },
  // ---- big moves ----------------------------------------------------------
  // crouch, then rocket straight up out of frame at `at`
  launch(p, s) {
    const D = p.dur ?? .5, L = p.takeoff ?? .25;            // (not `at`: that is the event's own start time)
    const crouch = P(POSE.crouch), mid = P({ ...POSE.crouch, hipN: 54, knN: 76, hipF: 44, knF: 72, lean: 18, shN: -30, shF: -40 });
    return { dur: D, rootOnes: 'xy', cues: [{ t: Math.max(0, L - .2), name: 'gather' }, { t: L, name: 'launch' }], smear: u => u > L && u < L + .16,
      spr: u => (u < L * .36 ? 'idle' : u < L - .04 ? 'crouch' : 'launch'),
      pose: u => {
        let q;
        if (u < L - .05) q = u < L * .36 ? mixPose(s.pose, mid, E.inOut(u / (L * .36))) : mixPose(mid, crouch, E.inOut((u - L * .36) / (L * .64 - .05)));
        else q = mixPose(crouch, P(POSE.launch), E.in(clamp((u - (L - .05)) / .05)));
        q.x = s.x; plant(q, 0);
        if (u > L) { const a = u - L; q.y -= 1700 * a + 2600 * a * a; }
        return q;
      } };
  },
  // fly from the current point along a curve by `to` = [dx, dy] (screen-free, world units)
  fly(p, s) {
    const D = p.dur ?? 1, to = p.to ?? [400, -60], y0 = p.y ?? s.pose.y ?? -200;
    const A = [s.x, y0], B = [s.x + to[0] * s.dir, y0 + to[1]], C1 = [lerp(A[0], B[0], .33), A[1] + (p.arc ?? -40)], C2 = [lerp(A[0], B[0], .66), B[1] + (p.arc ?? -40)];
    return { dur: D, rootOnes: 'xy', cues: [{ t: 0, name: 'whoosh' }], smear: () => true, spr: () => 'fly', pose: u => {
      const k = clamp(u / D), pos = bez(A, C1, C2, B, k), nx = bez(A, C1, C2, B, Math.min(1, k + .02));
      const ang = Math.atan2(nx[1] - pos[1], Math.abs(nx[0] - pos[0]) || 1e-3) / D2R;
      const q = P({ ...POSE.fly, rot: 76 + clamp(ang, -50, 70) }); q.x = pos[0]; q.y = pos[1]; return q; } };
  },
  // dive in from `from` (offset from the landing spot), brake, superhero landing on the current x
  dive_land(p, s) {
    const D = p.dur ?? .75, from = p.from ?? [-250, -330], d = s.dir, X = s.x;
    const P3 = [X, plant(P(POSE.land), 0, 'knee').y];
    const P0 = [X + from[0] * d, from[1]], P1 = [X + from[0] * .6 * d, from[1] * .7], P2 = [X + from[0] * .18 * d, from[1] * .36];
    const b0 = .6 * D, b1 = .907 * D;
    return { dur: D, rootOnes: 'xy', cues: [{ t: 0, name: 'dive', dur: D }, { t: D, name: 'land' }], smear: u => u > .2 * D && u < D,
      spr: u => (u < b0 ? 'fly' : u < D - .03 ? 'brake' : 'land'),
      pose: u => {
        const k = clamp(u / D), pos = bez(P0, P1, P2, P3, .35 * k + .65 * k * k);
        let q = mixPose(P({ ...POSE.fly, rot: 126 }), P(POSE.brake), E.inOut(clamp((u - b0) / (b1 - b0))));
        if (u > b1) q = mixPose(P(POSE.brake), P(POSE.land), E.in(clamp((u - b1) / (D - b1))));
        q.x = pos[0]; q.y = pos[1]; return q;
      } };
  },
  // from the landing crouch: settle, then the head comes up with a smirk
  rise(p, s) {
    const D = p.dur ?? .62;
    return { dur: D, spr: u => (u < D * .55 ? 'land' : 'land_look'), pose: u => {
      const q = poseKeys(u, [[0, POSE.land], [D * .55, { ...POSE.land, neck: 18 }], [D * .87, POSE.landRise, E.out], [D, POSE.landRise]]);
      q.x = s.x; plant(q, 0, 'knee'); q.y += 2.6 * (1 - E.out(clamp(u / .12))); return q; } };
  },
  front_flip(p, s) {
    const dist = (p.dist ?? 75) * s.dir, Hh = p.height ?? 86, D = .88, base = plant(P(POSE.spring), 0).y;
    return { dur: D, rootOnes: 'xy', smear: u => u > .27 && u < .82, spr: u => (u < .15 ? 'crouch' : u < .27 ? 'launch' : u < .76 ? 'tuck' : 'stick'),
      cues: [{ t: .15, name: 'push' }, { t: .21, name: 'spring' }, { t: .33, name: 'spin' }, { t: .54, name: 'spin' }, { t: D, name: 'flipLand' }],
      pose: u => {
        if (u < .21) { const q = poseKeys(u, [[0, s.pose], [.15, POSE.preFlip], [.21, POSE.spring, E.in]]); q.x = s.x + 3 * s.dir * u / .21; return plant(q, 0, 'knee'); }
        const k = (u - .21) / (D - .21);
        const q = poseKeys(u, [[.21, POSE.spring], [.31, POSE.tuck, E.out], [.68, POSE.tuck], [.83, POSE.stick, E.out]]);
        q.rot = 360 * E.inOut(clamp((u - .24) / .57));
        q.x = s.x + 3 * s.dir + (dist - 3 * s.dir) * k;
        const ground = plant({ ...q, rot: 0 }, 0, 'knee').y;
        q.y = lerp(base - 4 * Hh * k * (1 - k), ground, E.in(clamp((u - .78) / .1)));
        if (q.rot > 359.5) q.rot = 0;
        return q;
      } };
  },
  // stuck landing → legs give out, arms flail for balance
  wobble(p, s) {
    const D = p.dur ?? .5;
    return { dur: D, rootOnes: 'x', cues: [{ t: .3, name: 'shuffle' }], spr: u => (u < .12 ? 'stick' : 'wobble'), pose: u => {
      const q = poseKeys(u, [[0, POSE.stick], [.1, { ...POSE.stick, hipN: 74, knN: 104, hipF: 58, knF: 98, lean: 24 }], [.32, POSE.wobble, E.out]]);
      const sw = Math.sin(u * 15) * Math.exp(-u * 1.5) * clamp((u - .1) / .15);
      q.lean += sw * 9; q.shN += sw * 40; q.shF -= sw * 36; q.knN += Math.abs(sw) * 10;
      q.x = s.x + 6 * E.out(clamp((u - .1) / .4)) * s.dir; return plant(q, 0, 'knee'); } };
  },
  // stagger back a step and drop onto the seat
  sit_down(p, s) {
    const wob = POSE.wobble, D = .48;
    const k1 = { ...wob, lean: 10, hipN: -12, knN: 18, hipF: 22, knF: 34, shN: -30, shF: 40 }, k2 = { ...wob, lean: 28, hipN: 44, knN: 70, hipF: 40, knF: 74, shN: 30, shF: -20 };
    const k2y = plant(P(k2), 0, 'knee').y;
    return { dur: D, cues: [{ t: .13, name: 'shuffle' }, { t: .28, name: 'shuffle' }, { t: D, name: 'plop' }], spr: u => (u < .38 ? 'wobble' : 'sit'), pose: u => {
      const q = poseKeys(u, [[0, s.pose], [.18, k1], [.36, k2], [D, { ...POSE.sit, mouth: .4 }, E.in]]);
      q.x = s.x - 9 * E.inOut(clamp(u / .3)) * s.dir;
      q.y = u < .36 ? plant({ ...q }, 0, 'knee').y : lerp(k2y, plant({ ...q }, 0, 'seat').y, E.in2(clamp((u - .36) / .12)));
      return q; } };
  },
  // slumped and panting; optional lookUp (head up to the sky) and smile times
  sit_pant(p, s) {
    const D = p.dur ?? 2, per = p.period ?? .5, up0 = p.lookUp, sm0 = p.smile, cues = [];
    for (let t = per / 2; t < D; t += per) cues.push({ t, name: 'exhale' });
    return { dur: D, cues, spr: u => (up0 !== undefined && u > up0 + .2 ? 'sit_up' : 'sit'), pose: u => {
      const q = P(POSE.sit), br = Math.sin(u / per * TAU - Math.PI / 2), k = clamp(u / .3);
      q.lean += 3 * br * k; q.curl -= 3 * br * k; q.shN += 4 * br * k; q.shF += 4 * br * k; q.neck += 3 * br * k;
      q.mouth = .5 + .35 * (.5 - .5 * br);
      if (up0 !== undefined) { const up = E.inOut(clamp((u - up0) / .45)); q.neck -= 36 * up; q.head -= 20 * up; q.lean -= 14 * up; q.curl -= 10 * up; q.lookY = lerp(.5, -1, up); }
      if (sm0 !== undefined) { const sm = E.inOut(clamp((u - sm0) / .4)); q.smile = sm; q.mouth = lerp(q.mouth, .22 + .1 * (.5 - .5 * br), sm); q.eye = lerp(.85, .62, sm); q.brow = lerp(1, .5, sm); }
      q.x = s.x; plant(q, 0, 'seat'); q.y -= Math.sin(clamp(u / .18) * Math.PI) * 3; return q; } };
  },
};

// ---------------------------------------------------------------- sequencing
// acts: [{at, do, ...params}] plus overlay events [{at, face}] / [{at, look}] (optional dur).
// Returns perf(t) over shot-local time, the cue list, and the end state for the next shot.
function sequence(events, start) {
  const acts = events.filter(e => e.do).sort((a, b) => a.at - b.at);
  const over = events.filter(e => e.face || e.look).sort((a, b) => a.at - b.at);
  let st = { x: start.x ?? 0, pose: P(start.pose ? poseOf(start.pose) : {}), dir: start.dir ?? 1 };
  if (start.pose) st.pose = plant({ ...st.pose, x: st.x }, 0, 'knee');
  const segs = [], cues = [];
  acts.forEach((ev, i) => {
    if (ev.dir) st.dir = ev.dir;
    if (ev.x !== undefined) st.x = ev.x;
    const fn = ACTIONS[ev.do];
    if (!fn) throw new Error('unknown action: ' + ev.do);
    const a = fn(ev, { ...st, pose: P(st.pose) });
    const next = acts[i + 1], dur = next ? Math.min(a.dur, next.at - ev.at) : a.dur;
    segs.push({ t0: ev.at, dur, a, from: P(st.pose), dir: st.dir, blend: ev.blend ?? (i && !['launch', 'dive_land', 'front_flip', 'sit_down', 'wobble', 'rise'].includes(ev.do) ? .12 : 0) });
    for (const c of a.cues || []) if (c.t <= dur + 1e-6) cues.push({ ...c, t: ev.at + c.t, seg: segs.length - 1 });
    const end = a.pose(dur);
    end.rot = ((end.rot % 360) + 360) % 360; if (end.rot > 180) end.rot -= 360;
    st = { x: end.x, pose: end, dir: st.dir };
  });
  for (const o of over) if (o.face === 'glint') cues.push({ t: o.at, name: 'glint' });
  const segAt = t => { let s = segs[0]; for (const g of segs) if (t >= g.t0) s = g; return s; };
  const perf = t => {
    const g = segAt(t), u = clamp(t - g.t0, 0, g.dur);
    let q = g.a.pose(u);
    if (g.blend && u < g.blend) { const k = smooth(u / g.blend); const x = q.x, y = q.y; q = mixPose(g.from, q, k); q.x = x; q.y = lerp(g.from.y, y, k); }
    for (const o of over) {
      if (t < o.at) continue;
      const w = E.out(clamp((t - o.at) / .08)) * (o.dur ? 1 - E.in(clamp((t - o.at - o.dur) / .08)) : 1);
      if (w <= 0) continue;
      if (o.face) for (const [k, v] of Object.entries(FACES[o.face] || o.face)) q[k] = lerp(q[k], v, w);
      if (o.look) for (const [k, v] of Object.entries(LOOKS[o.look] || o.look)) q[k] = k === 'neck' || k === 'head' ? q[k] + v * w : lerp(q[k], v, w);
    }
    q.dir = g.dir;
    q.spr = g.a.spr ? g.a.spr(u) : null;
    return q;
  };
  perf.segAt = segAt;
  return { perf, cues, end: st, segs };
}
