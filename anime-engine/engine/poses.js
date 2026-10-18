// poses.js — the pose library and the walk cycle. Poses are partial objects over BASE.

const POSE = {
  stand: {},
  lookUp: { lean: 0, neck: -12, head: -10, lookY: -1, lookX: .5, shN: 6, elN: 14, shF: -4, elF: 10, hipN: 6, knN: 3, hipF: -6, knF: 4 },
  crouch: { lean: 34, curl: 8, neck: -26, head: -12, shN: -58, elN: 30, shF: -66, elF: 26, fistN: 1,
    hipN: 92, knN: 128, anN: 30, hipF: 76, knF: 118, anF: 36, narrow: 1, brow: -1, lookY: -.8, mouth: .05, grit: 1 },
  launch: { lean: -4, curl: -4, neck: -14, head: -8, shN: 172, elN: 4, wrN: 0, shF: 146, elF: 14,
    hipN: 4, knN: 8, anN: 62, hipF: -16, knF: 26, anF: 66, narrow: 1, brow: -1, mouth: .3, grit: 1, lookY: -1 },
  fly: { rot: 76, lean: -2, curl: -4, neck: -30, head: -22, shN: 168, elN: 4, wrN: 0, shF: -6, elF: 12,
    hipN: -4, knN: 22, anN: 64, hipF: -16, knF: 54, anF: 70, narrow: .8, brow: -.7, lookX: .8, mouth: 0 },
  brake: { rot: -8, lean: -14, curl: -6, neck: 2, head: 4, shN: 96, elN: 34, shF: 70, elF: 30, fistF: 0,
    hipN: 66, knN: 64, anN: -6, hipF: 30, knF: 70, anF: 10, narrow: .6, brow: -.6, lookY: .6 },
  land: { lean: 38, curl: 12, neck: 22, head: 10, shN: 34, elN: 22, wrN: 28, shF: -96, elF: 6, wrF: -10, fistF: 0,
    hipN: 92, knN: 108, anN: 10, hipF: -2, knF: 96, anF: 18, narrow: 1, brow: -1, lookY: 1, lookX: .6 },
  landRise: { lean: 30, curl: 10, neck: -20, head: -10, shN: 30, elN: 24, wrN: 20, shF: -90, elF: 10, fistF: 0,
    hipN: 92, knN: 108, anN: 10, hipF: -2, knF: 96, anF: 18, narrow: .6, brow: -.6, lookY: -.2, lookX: .8, smile: 1 },
  preFlip: { lean: 30, curl: 8, neck: -10, head: -6, shN: -64, elN: 30, shF: -72, elF: 26,
    hipN: 84, knN: 118, anN: 30, hipF: 78, knF: 112, anF: 32, narrow: .6, brow: -.5 },
  spring: { lean: -6, neck: -10, head: -6, shN: 160, elN: 20, shF: 140, elF: 26, hipN: 6, knN: 10, anN: 50, hipF: -6, knF: 16, anF: 56 },
  tuck: { lean: 22, curl: 26, neck: 24, head: 10, shN: 64, elN: 84, shF: 58, elF: 92,
    hipN: 128, knN: 138, anN: 40, hipF: 118, knF: 142, anF: 44, eye: .15, narrow: 1, mouth: 0 },
  stick: { lean: 16, curl: 4, neck: -6, head: -2, shN: 96, elN: 12, shF: 64, elF: 16, fistN: 0, fistF: 0,
    hipN: 58, knN: 82, anN: 12, hipF: 40, knF: 74, anF: 22, smile: .8, lookX: .7 },
  wobble: { lean: 22, curl: 14, neck: 14, head: 8, shN: 18, elN: 30, shF: -10, elF: 26, fistN: 0, fistF: 0,
    hipN: 14, knN: 30, anN: 4, hipF: 2, knF: 24, anF: 8, tired: 1, eye: .9, mouth: .45, brow: .9, sweat: 1, blush: .6 },
  // slumped on the floor: near knee up with the arm draped over it, far leg out, head hanging
  sit: { lean: 10, curl: 22, neck: 18, head: 10, shN: 62, elN: 30, wrN: -50, fistN: 0, shF: 16, elF: 4, wrF: -70, fistF: 0,
    hipN: 125, knN: 120, anN: 5, hipF: 88, knF: 14, anF: 6, tired: 1, eye: .8, mouth: .7, brow: 1, sweat: 1, blush: 1, lookY: .5, lookX: .4 },
};

// walk cycle, phase ph in cycles (one cycle = two steps). Near-leg heel strike at ph = 0.
function walkPose(ph, o = {}) {
  const st = o.stride ?? 24, sw = o.swing ?? 20;
  const leg = q => {
    q = ((q % 1) + 1) % 1;
    const hip = st * Math.cos(TAU * q) + 3;
    const kn = q < .5 ? 6 + 14 * Math.sin(Math.PI * q / .5) : 6 + 58 * Math.sin(Math.PI * (q - .5) / .5);
    return { hip, kn };
  };
  const n = leg(ph), f = leg(ph + .5);
  const c = Math.cos(TAU * ph);
  const bob = Math.cos(TAU * 2 * ph);
  return P({
    lean: 7 + 2 * bob, curl: 2, neck: -4 - bob, head: -2,
    hipN: n.hip, knN: n.kn, hipF: f.hip, knF: f.kn,
    anN: 0, anF: 0,
    shN: -sw * c + 4, elN: 22 + 10 * Math.max(0, -c), shF: sw * c - 6, elF: 22 + 10 * Math.max(0, c),
    lookX: .5, ...o.face,
  });
}

// keep a foot flat while it bears weight: solve ankle so the sole is level (+ a little toe-off)
function flatFeet(p, ph) {
  const S = solve(p);
  for (const s of ['N', 'F']) {
    const g = S['leg' + s];
    const q = (((ph + (s === 'F' ? .5 : 0)) % 1) + 1) % 1;
    const flat = 180 - g.pSn;          // ankle angle that points the foot along +x
    const toe = q > .42 && q < .62 ? Math.sin(Math.PI * (q - .42) / .2) * 34 : 0;
    const swing = q >= .62 ? 18 * Math.sin(Math.PI * (q - .62) / .38) : 0;
    p['an' + s] = flat + toe + swing;
  }
  return p;
}

// drop the pose so its lowest contact point sits on floorY
function plant(p, floorY, pts = 'feet') {
  const S = solve(p);
  let low = footLow(S);
  if (pts === 'knee') low = Math.max(low, S.legF.kn[1] + 3.6, S.legN.kn[1] + 3.6);
  if (pts === 'seat') { const c = S.map(-0.6, 1.4); low = Math.max(c[1] + 5.8, footLow(S)); }
  p.y += floorY - low;
  return p;
}
