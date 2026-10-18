"""Sound library for the anime engine: synth voices, SFX generators, buses. Extracted from SORA's score."""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
rng = np.random.default_rng(7)
N = 0
BUS = {}


def init(dur):
    global N, BUS
    N = int(SR * dur)
    BUS = {k: np.zeros((2, N)) for k in ("mus", "sfx", "amb")}


def tt(d):
    return np.arange(int(SR * d)) / SR


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def sos(kind, f, order=2):
    nyq = SR / 2
    if kind == "band":
        return butter(order, [max(20, f[0]) / nyq, min(nyq * .98, f[1]) / nyq], btype="band", output="sos")
    return butter(order, min(f, nyq * .98) / nyq, btype=kind, output="sos")


def filt(x, kind, f, order=2):
    return sosfilt(sos(kind, f, order), x)


def noise(d):
    return rng.standard_normal(int(SR * d))


def expdec(d, k):
    return np.exp(-tt(d) * k)


def adsr(d, a=.01, r=.1):
    n = int(SR * d)
    e = np.ones(n)
    na, nr = min(n, int(SR * a)), min(n, int(SR * r))
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[n - nr:] *= np.linspace(1, 0, nr)
    return e


def place(bus, sig, t, gain=1.0, pan=0.0):
    sig = np.asarray(sig, dtype=float)
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.vstack([sig * np.cos(a), sig * np.sin(a)]) * 1.4142
    na = min(sig.shape[1], int(SR * .0008))        # sub-ms attack: punch without digital clicks
    sig = sig.copy(); sig[:, :na] *= np.linspace(0, 1, na)
    i = int(round(t * SR))
    if i < 0:
        sig = sig[:, -i:]; i = 0
    n = min(sig.shape[1], N - i)
    if n > 0:
        BUS[bus][:, i:i + n] += gain * sig[:, :n]


def sweep_bp(x, f0, f1, q=1.6, blocks=48):
    """band-pass whose centre glides f0→f1 (log), done as crossfaded blocks"""
    n = len(x)
    out = np.zeros(n)
    edges = np.linspace(0, n, blocks + 1).astype(int)
    hop = edges[1] - edges[0]
    for b in range(blocks):
        fc = f0 * (f1 / f0) ** ((b + .5) / blocks)
        lo, hi = fc / (1 + 1 / q), fc * (1 + 1 / q)
        a, z = max(0, edges[b] - hop // 2), min(n, edges[b + 1] + hop // 2)
        seg = filt(x[a:z], "band", (lo, hi))
        w = np.hanning(z - a) if z - a > 2 else np.ones(z - a)
        out[a:z] += seg * w
    return out


def saw(f, d, detune=0.0, phase=0.0):
    t = tt(d)
    ph = (f * (1 + detune) * t + phase) % 1.0
    return 2 * ph - 1


def supersaw(f, d, n=7, spread=.012):
    out = np.zeros(int(SR * d))
    for k in range(n):
        dt = (k - (n - 1) / 2) / ((n - 1) / 2) * spread
        out += saw(f, d, dt, rng.random())
    return out / n


def pluck(m, d=.9, bright=1.0):
    f, t = mtof(m), tt(d)
    s = sum(np.sin(2 * np.pi * f * k * t) * np.exp(-t * (3 + k * 2.2 / bright)) / k ** 1.1 for k in range(1, 9))
    return s * adsr(d, .003, .05)


def piano(m, d=2.0):
    f, t = mtof(m), tt(d)
    B = .0004
    s = np.zeros_like(t)
    for k in range(1, 12):
        fk = f * k * np.sqrt(1 + B * k * k)
        s += np.sin(2 * np.pi * fk * t + rng.random()) * np.exp(-t * (1.2 + k * .55)) / k ** 1.25
    ham = filt(noise(d), "band", (f * 2, min(f * 10, 12000))) * np.exp(-t * 90) * .15
    return (s + ham) * adsr(d, .002, .2)


def bell(f, d=1.4):
    t = tt(d)
    s = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * dk) for r, a, dk in
            [(1, 1, 3), (2.76, .6, 5), (5.4, .4, 8), (8.93, .25, 12), (13.3, .12, 16)])
    return s * adsr(d, .001, .1)


def kick(d=.45, f0=150, f1=44, k=7, click=.4):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t * 28)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * k)
    return np.tanh(s * 1.6) + click * filt(noise(d), "high", 2500) * np.exp(-t * 180)


def snare(d=.3):
    t = tt(d)
    body = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 22) * .6
    sn = filt(noise(d), "band", (1400, 9000)) * np.exp(-t * 16)
    return body + sn


def hat(d=.08, k=60):
    return filt(noise(d), "high", 7000) * np.exp(-tt(d) * k)


def crash(d=2.4):
    t = tt(d)
    s = filt(noise(d), "high", 3500) * np.exp(-t * 2.2)
    ring = sum(np.sin(2 * np.pi * f * t) for f in (3150, 4270, 5630, 7020)) * np.exp(-t * 3) * .05
    return s + ring


def tom(f, d=.35):
    t = tt(d)
    fr = f * (1 + .5 * np.exp(-t * 30))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 10) + filt(noise(d), "band", (200, 2000)) * np.exp(-t * 40) * .3


def boom(d=2.2, f0=62, f1=26, k=2.2, drive=2.4):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t * 4)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * k)
    return np.tanh(s * drive) / np.tanh(drive)


def crack(d=.5):
    t = tt(d)
    return filt(noise(d), "band", (900, 7000)) * np.exp(-t * 26) + filt(noise(d), "low", 400) * np.exp(-t * 10) * .8


def rubble(d, density, seed, bright=1.0):
    r = np.random.default_rng(seed)
    out = np.zeros(int(SR * d))
    tt0 = 0.0
    while True:
        tt0 += r.exponential(1 / density) * (1 + tt0 * 1.5)
        if tt0 >= d - .05: break
        g = int(SR * r.uniform(.006, .03))
        f = r.uniform(800, 5000) * bright
        grain = filt(r.standard_normal(g), "band", (f * .6, f * 1.4)) * np.exp(-np.arange(g) / g * 5) * r.uniform(.2, 1) * np.exp(-tt0 * 1.4)
        i = int(tt0 * SR); out[i:i + g] += grain[:len(out) - i]
    return out


def whoosh(d, f0, f1, peak=.6, q=1.4):
    n = noise(d)
    x = sweep_bp(n, f0, f1, q)
    t = tt(d) / d
    env = np.where(t < peak, (t / peak) ** 2, ((1 - t) / (1 - peak)) ** 1.5)
    return x * env


def step(scuff=1.0, heavy=1.0):
    d = .22
    t = tt(d)
    thump = np.sin(2 * np.pi * 70 * t) * np.exp(-t * 40) * heavy
    sc = filt(noise(d), "band", (1200, 6000)) * np.exp(-t * 30) * .5 * scuff
    sq = filt(noise(d), "band", (2500, 4500)) * np.exp(-t * 60) * .25 * scuff
    return thump + sc + sq


def breath(d, f, gain=1.0, inhale=False):
    t = tt(d) / d
    env = np.sin(np.pi * t ** (.6 if not inhale else 1.4)) ** 1.5
    x = filt(noise(d), "band", (f * .6, f * 1.6)) + .5 * filt(noise(d), "band", (f * 2, f * 3.4))
    return x * env * gain


def reverb(x, d=2.2, k=3.0, lp=6000, wet=.3, seed=3):
    r = np.random.default_rng(seed)
    t = tt(d)
    irs = []
    for ch in range(2):
        ir = r.standard_normal(len(t)) * np.exp(-t * k)
        ir = filt(ir, "low", lp)
        ir[: int(SR * .012)] *= np.linspace(0, 1, int(SR * .012))
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    out = np.vstack([fftconvolve(x[c], irs[c])[:x.shape[1]] for c in range(2)])
    return x * (1 - wet) + out * wet * 1.6


def delay(x, dt=.375, fb=.35, mix=.3, n=4):
    out = x.copy()
    s = int(dt * SR)
    for k in range(1, n + 1):
        sh = np.zeros_like(x)
        if s * k >= x.shape[1]: break
        sh[:, s * k:] = x[:, :x.shape[1] - s * k] * (fb ** k)
        sh = sh[::-1] if k % 2 else sh       # ping-pong
        out += sh * mix
    return out


def chord_pad(notes, d, gain=1.0, cutoff=2400, a=.25):
    s = sum(supersaw(mtof(m), d) for m in notes) / len(notes)
    s = filt(s, "low", cutoff)
    return s * adsr(d, a, .25) * gain


def lead(notes, vib=5.5):
    """notes: [(t, midi, dur)] → mono line starting at notes[0] t"""
    t0 = notes[0][0]
    end = max(t + d for t, _, d in notes) + .3
    out = np.zeros(int(SR * (end - t0)))
    for t, m, d in notes:
        f = mtof(m)
        tl = tt(d + .2)
        v = 1 + .006 * np.sin(2 * np.pi * vib * tl) * np.clip((tl - .12) * 4, 0, 1)
        ph = np.cumsum(f * v) / SR
        s = (2 * (ph % 1) - 1) * .6 + (2 * ((ph * 1.004) % 1) - 1) * .4
        s = filt(s, "low", 3800) * adsr(d + .2, .015, .2)
        i = int((t - t0) * SR)
        out[i:i + len(s)] += s[: len(out) - i]
    return t0, out



def tape_stop(x, t0, t1):
    """slow the bus to a halt between t0 and t1 (pitch falls with speed), silence after"""
    i0, i1 = int(t0 * SR), int(t1 * SR)
    n = i1 - i0
    rate = np.linspace(1, 0, n) ** 1.3
    pos = i0 + np.cumsum(rate)
    for c in range(2):
        seg = np.interp(pos, np.arange(x.shape[1]), x[c])
        x[c, i0:i1] = seg * np.linspace(1, .6, n)
        x[c, i1:i1 + int(SR * .45)] *= 0
    return x


