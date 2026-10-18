"""Build a film's soundtrack from its cue sheet: synth score (or a supplied track) + one SFX per cue.

    .venv/bin/python engine/sound/build.py films/<name>      (after: node engine/tools/peek.mjs films/<name> --cues)
    → films/<name>/sound/mix.wav
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).parent))
import lib as L
from lib import (SR, adsr, bell, boom, breath, chord_pad, crack, crash, delay, expdec, filt, hat, kick, lead, mtof,
                 noise, piano, pluck, reverb, rubble, snare, step, supersaw, tape_stop, tom, tt, whoosh)

film = Path(sys.argv[1])
CUE = json.loads((film / "sound" / "cues.json").read_text())
DUR = CUE["duration"]
L.init(DUR)
place = L.place
music = CUE.get("music") or {}
B = 60 / music.get("bpm", 120)
KEY = music.get("key", 60)
DEG = {"I": (0, 1), "ii": (2, 0), "iii": (4, 0), "IV": (5, 1), "V": (7, 1), "vi": (9, 0)}


def chord(name):
    """roman numeral → 5-note voicing (root around octave 3) and bass note"""
    d, major = DEG[name]
    r = KEY - 12 + d
    if r > KEY - 3: r -= 12
    notes = [r, r + 4, r + 7, r + (11 if name in ("I", "IV") else 12), r + 16] if major else [r, r + 3, r + 7, r + 10, r + 15]
    return notes, r - 12


def split(sec, names):
    """divide a section evenly between its chords, snapped to the beat"""
    t0, t1 = sec["at"], sec.get("to", sec["at"] + 1)
    n = len(names)
    edges = [t0 + round((t1 - t0) * i / n / B) * B for i in range(n)] + [t1]
    return [(edges[i], edges[i + 1] - edges[i], names[i]) for i in range(n)]


# ------------------------------------------------------------------ score
def sec_intro(s):
    for t, d, nm in split(s, s.get("chords", ["IV", "V"])):
        ns, _ = chord(nm)
        place("mus", chord_pad(ns[:4], d + .1, .2, 1900, .3), t)
        arp = [ns[0], ns[1], ns[2], ns[3], ns[2], ns[1]]
        for i in range(int(round(d / (B / 2)))):
            place("mus", pluck(arp[i % len(arp)] + 12, .9), t + i * B / 2, .3, pan=-.3 + .6 * (i % 2))
    for i in range(int((s["to"] - s["at"]) / (B / 2))):
        place("mus", filt(noise(.06), "band", (5000, 11000)) * expdec(.06, 70), s["at"] + i * B / 2 + B / 4, .05 + .03 * (i % 2), pan=.4)


def sec_riser(s):
    d = s["to"] - s["at"]
    place("mus", whoosh(d + .03, 300, 6000, peak=.97, q=1.1), s["at"] - .03, .5)
    place("mus", crash(1.0)[::-1] * np.linspace(0, 1, SR) ** 2, s["to"] - 1.0, .35)
    ns, _ = chord("V")
    place("mus", chord_pad(ns, d, .16, 3200, .5), s["at"], 1.0)


def sec_drive(s):
    t0, t1 = s["at"], s["to"]
    place("mus", crash(), t0, .4)
    mel = []
    for t, d, nm in split(s, s.get("chords", ["IV", "V", "iii", "vi"])):
        ns, bass = chord(nm)
        place("mus", chord_pad(ns, d + .05, .3, 4200, .01), t, 1.0)
        for k in range(int(round(d / (B / 2)))):
            bs = supersaw(mtof(bass), B / 2 * .9, 3, .006) * .7 + np.sin(2 * np.pi * mtof(bass - 12) * tt(B / 2 * .9))
            place("mus", filt(bs, "low", 600) * adsr(B / 2 * .9, .004, .05), t + k * B / 2, .32)
        top = [n + 12 for n in ns[1:4]]                              # melody from chord tones, rising inside each chord
        steps = max(1, int(round(d / B)))
        for k in range(steps):
            mel.append((t + k * B, top[min(k, 2)] + (12 if k == steps - 1 and steps > 1 else 0) - 12 * (top[min(k, 2)] > 84), B * .9))
    for k in range(int((t1 - t0) / B + .01)):
        place("mus", kick(), t0 + k * B, .62)
        if k % 2 == 1: place("mus", snare(), t0 + k * B, .42)
    for k in range(int((t1 - t0) / (B / 4))):
        place("mus", hat(.06 if k % 2 else .1), t0 + k * B / 4, .07 if k % 2 else .1, pan=.25)
    for k in range(6): place("mus", snare(.12), t1 - .25 + k * .042, .12 + .05 * k)
    if mel:
        l0, ld = lead(mel)
        place("mus", delay(np.vstack([ld, ld]) * .5, dt=B * .75, fb=.4, mix=.35), l0, .28)


def sec_stab(s):
    ns, bass = chord(s.get("chord", "vi"))
    st = sum(supersaw(mtof(m), 1.6, 9, .02) for m in [bass + 12] + ns) / 6
    place("mus", filt(st, "low", 5000) * np.exp(-tt(1.6) * 2.4) * adsr(1.6, .003, .3), s["at"], .55)
    place("mus", crash(3.0), s["at"], .5)


def sec_tension(s):
    ns, _ = chord(s.get("chord", "vi"))
    place("mus", chord_pad(ns[:4], s["to"] - s["at"], .22, 1600, .3), s["at"], 1.0)
    place("mus", kick(.6, 70, 35, 4, 0), s["at"], .3)


def sec_fill(s):
    d = s["to"] - s["at"]
    for k, f in enumerate([220, 196, 175, 156, 139, 123, 110]):
        place("mus", tom(f), s["at"] + k * d / 7.4, .45, pan=-.4 + k * .13)
    for k, m in enumerate([0, 4, 7, 12, 16, 19]):
        place("mus", pluck(KEY + m, .4, 1.6), s["at"] + .03 + k * d / 7, .16)


def sec_tada(s):
    ns, bass = chord(s.get("chord", "I"))
    td = sum(supersaw(mtof(m), 1.0, 7, .015) for m in [bass + 12] + ns) / 6
    place("mus", filt(td, "low", 5200) * adsr(1.0, .004, .4) * np.exp(-tt(1.0) * 1.2), s["at"], .5)
    place("mus", kick(), s["at"], .5)
    place("mus", crash(1.2), s["at"], .25)


def sec_outro(s):
    for t, d, nm in split(s, s.get("chords", ["IV", "V", "I"])):
        ns, bass = chord(nm)
        for i, m in enumerate([bass + 12] + ns[1:]):
            place("mus", piano(m, 2.4), t + i * .018, .22 * (1.2 if i == 0 else 1), pan=-.2 + .1 * i)
        place("mus", chord_pad(ns[:4], d, .07, 1400, .3), t, 1.0)
    for i, m in enumerate([24, 19, 16]):
        place("mus", bell(mtof(KEY + m), 1.0), s["to"] - .55 + i * .12, .05, pan=.5)


STYLES = dict(intro=sec_intro, riser=sec_riser, drive=sec_drive, stab=sec_stab, tension=sec_tension, fill=sec_fill, tada=sec_tada, outro=sec_outro)
if music.get("track"):
    x, sr = sf.read(film / music["track"], always_2d=True)
    if sr != SR:
        from scipy.signal import resample_poly
        x = resample_poly(x, SR, sr, axis=0)
    place("mus", x.T[:2] if x.shape[1] > 1 else x[:, 0], music.get("offset", 0), music.get("gain", 1.0))
for s in music.get("sections", []):
    STYLES[s["style"]](s)
for s in music.get("sections", []):
    if s.get("tapeStop"): L.BUS["mus"] = tape_stop(L.BUS["mus"], *s["tapeStop"])

# ------------------------------------------------------------------ sfx, one generator per cue name
r2 = np.random.default_rng(5)


def fx_birds(t, p):
    for _ in range(26):
        fl = filt(noise(.12), "band", (500, 2500)) * (np.sin(2 * np.pi * 14 * tt(.12)) ** 2) * np.exp(-tt(.12) * 14)
        place("sfx", fl, t + r2.random() * .55, .12, pan=r2.uniform(-.9, .9))


def fx_dive(t, p, d):
    f = np.geomspace(1900, 520, int(SR * (d - .05)))
    w = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.linspace(.1, 1, len(f)) ** 2
    place("sfx", w * .25 + whoosh(d - .05, 600, 3000, .95), t, .4)


def fx_wind(t, p, d):
    w = filt(noise(d), "low", 1400) + .4 * filt(noise(d), "band", (1500, 4000))
    env = np.interp(tt(d) / d, [0, .2, .43, .68, .8, 1], [.3, .55, .9, 1, .6, .4])
    place("amb", np.vstack([w * env, filt(noise(d), "low", 1400) * env]), t, .32)


def fx_roll(t, p):
    r = whoosh(.45, 600, 3500, .5, 1.1)
    place("sfx", np.vstack([r * np.linspace(1, .2, len(r)), r * np.linspace(.2, 1, len(r))]), t, .5)


def fx_exhale(t, p):
    place("sfx", breath(.36, 900, 1.0), t - .02, .38, pan=p)
    place("sfx", breath(.22, 1500, .5, inhale=True), t + .27, .25, pan=p)


SFX = {
    "step": lambda t, p: place("sfx", step(), t + .015, .85, pan=p),
    "runstep": lambda t, p: place("sfx", step(1.3, 1.1), t + .01, .9, pan=p),
    "scuff": lambda t, p: place("sfx", step(.6, .5), t, .35, pan=p),
    "shuffle": lambda t, p: place("sfx", step(1.2, .6), t, .33, pan=p),
    "push": lambda t, p: place("sfx", step(.8, .7), t, .35, pan=p),
    "swish": lambda t, p: place("sfx", whoosh(.25, 800, 3000, .4), t, .3, pan=p),
    "gather": lambda t, p: place("sfx", whoosh(.4, 200, 1200, .9), t - .2, .25),
    "launch": lambda t, p: [place("sfx", boom(1.8, 70, 30, 2.6), t, .9), place("sfx", crack(.5), t, .7),
                            place("sfx", rubble(1.4, 70, 11), t + .03, .45, pan=p - .2), place("sfx", rubble(1.4, 60, 12), t + .05, .45, pan=p + .25),
                            place("sfx", whoosh(.55, 300, 5000, .25, 1.2), t - .02, .7)],
    "glint": lambda t, p: place("mus", bell(mtof(96), 1.4) + .6 * bell(mtof(103), 1.4), t, .12, pan=.5),
    "heartbeat": lambda t, p: [place("mus", kick(.4, 90, 40, 9, 0), t + k, .55) for k in (0, .16)],
    "passL": lambda t, p: place("sfx", whoosh(.7, 250, 2500, .75), t - .1, .55, pan=-.7),
    "passR": lambda t, p: place("sfx", whoosh(.7, 280, 2700, .75), t - .1, .5, pan=.7),
    "exitL": lambda t, p: place("sfx", whoosh(.6, 2400, 300, .2), t, .45, pan=-.6),
    "exitR": lambda t, p: place("sfx", whoosh(.6, 2600, 320, .2), t, .45, pan=.6),
    "birds": fx_birds, "roll": fx_roll, "exhale": fx_exhale,
    "whoosh": lambda t, p: place("sfx", whoosh(.6, 300, 3000, .4), t, .5, pan=p),
    "land": lambda t, p: [place("sfx", boom(2.6, 80, 26, 1.6, 3.0), t, 1.0), place("sfx", crack(.6), t, .9),
                          place("sfx", filt(noise(1.2), "low", 500) * expdec(1.2, 3), t, .7),
                          place("sfx", rubble(1.5, 110, 21), t + .04, .5, pan=p - .4), place("sfx", rubble(1.5, 110, 22), t + .06, .5, pan=p + .4),
                          place("sfx", rubble(1.2, 30, 23, .6), t + .35, .3)],
    "spring": lambda t, p: place("sfx", whoosh(.3, 400, 2600, .3), t, .45, pan=p),
    "spin": lambda t, p: [place("sfx", whoosh(.22, 700, 2200, .4, 2), t, .5, pan=p),
                          place("sfx", filt(noise(.3), "band", (300, 2200)) * np.abs(np.sin(2 * np.pi * 11 * tt(.3))) * expdec(.3, 5), t, .2)],
    "flipLand": lambda t, p: [place("sfx", step(1, 1.2), t, .6, pan=p - .15), place("sfx", step(1, 1.0), t + .035, .5, pan=p + .15),
                              place("sfx", filt(noise(.5), "band", (300, 3000)) * expdec(.5, 7), t, .2)],
    "plop": lambda t, p: [place("sfx", boom(.7, 110, 50, 9, 1.4), t, .55), place("sfx", filt(noise(.6), "band", (250, 2500)) * expdec(.6, 6), t, .3),
                          place("sfx", whoosh(.25, 3000, 900, .2), t - .1, .2)],
    "talk": lambda t, p: None,                       # no voice synthesis — supply dialogue as a track
}
for c in CUE["cues"]:
    t, p, nm = c["t"], c.get("pan", 0) * .6, c["name"]
    if nm == "dive": fx_dive(t, p, c.get("dur", .75))
    elif nm == "windbed": fx_wind(t, p, c.get("dur", 2))
    elif nm in SFX: SFX[nm](t, p)
    else: print("no sound for cue:", nm)

# ambience: evening city + breeze, dipped inside chase shots
cuts = CUE["cuts"] + [{"t": DUR, "set": None}]
env = np.ones(L.N)
for a, b in zip(cuts, cuts[1:]):
    if a["set"] == "canyon": env[int(a["t"] * SR):int(b["t"] * SR)] = .1
env = np.convolve(env, np.ones(SR // 8) / (SR // 8), mode="same")
hum = filt(noise(DUR), "low", 220) * .5 + filt(noise(DUR), "band", (300, 1200)) * .12
place("amb", np.vstack([hum[:L.N] * env, filt(noise(DUR), "low", 220)[:L.N] * .5 * env]), 0, .1)
place("amb", filt(noise(DUR), "band", (400, 2500))[:L.N] * env, 0, .03, pan=.2)

# ------------------------------------------------------------------ mix
mus = reverb(L.BUS["mus"], 2.4, 2.6, 7000, .28, 3)
sfx = reverb(L.BUS["sfx"], 1.6, 3.4, 5000, .18, 4)
duck = np.ones(L.N)
for c in CUE["cues"]:
    if c["name"] in ("launch", "land"):
        i, n = int(c["t"] * SR), int(SR * .5)
        duck[i:i + n] *= 1 - .32 * np.exp(-np.arange(min(n, L.N - i)) / SR * 6)
mix = mus * duck * .85 + sfx * .95 + L.BUS["amb"]
for c in CUE["cues"]:                                   # a beat of silence right before each landing
    if c["name"] == "land":
        i0, i1 = int((c["t"] - .07) * SR), int(c["t"] * SR)
        mix[:, i0:i1] *= np.linspace(1, .05, i1 - i0)
fade = int(SR * .35)
mix[:, -fade:] *= np.linspace(1, 0, fade) ** 1.5
mix = filt(mix, "high", 28)
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.3) / np.tanh(1.3) * .89
sf.write(film / "sound" / "mix.wav", mix.T, SR, subtype="PCM_24")
print("wrote", film / "sound" / "mix.wav", f"({len(CUE['cues'])} cues)")
