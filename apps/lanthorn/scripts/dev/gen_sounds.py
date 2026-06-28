#!/usr/bin/env python3
"""gen_sounds.py — offline-render Lanthorn's sound set to WAV.

The sounds ship in web/sounds/ (inside the iOS bundle via the web folder
reference) and are played natively through AVAudioEngine on device, or via
WebAudio on the web build. Offline rendering buys what realtime synthesis
can't: layered partials, tanh saturation for harmonic body, and peak
normalization to -1 dBFS so every hit lands hot.

Deterministic (seeded noise) — same files every run.
Usage: python3 scripts/dev/gen_sounds.py
"""
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parents[2] / "web" / "sounds"
rng = np.random.default_rng(20260611)


def t_axis(dur):
    return np.arange(int(SR * dur)) / SR


def env(t, attack=0.002, tau=0.2, start=0.0):
    """attack ramp then exponential decay, delayed by `start` seconds"""
    tt = t - start
    e = np.where(tt < 0, 0.0, np.minimum(tt / max(attack, 1e-4), 1.0) * np.exp(-np.maximum(tt, 0) / tau))
    return e


def sine(t, f):
    return np.sin(2 * np.pi * f * t)


def tri(t, f):
    return (2 / np.pi) * np.arcsin(np.sin(2 * np.pi * f * t))


def slide(t, f0, f1, tau):
    """sine with exponential frequency glide f0→f1"""
    f = f1 + (f0 - f1) * np.exp(-t / tau)
    phase = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(phase)


def noise(n):
    return rng.uniform(-1, 1, n)


def hiss(t, tau, start=0.0, bright=True):
    """noise burst; differencing tilts it bright (click/sparkle air)"""
    n = noise(len(t))
    if bright:
        n = np.diff(n, prepend=0.0) * 2.2
    return n * env(t, 0.001, tau, start)


def saturate(x, drive):
    return np.tanh(x * drive) / np.tanh(drive)


def finish(x, peak=0.891):  # -1 dBFS
    m = np.max(np.abs(x))
    if m > 0:
        x = x / m * peak
    # 3 ms fade out, kill DC
    fade = min(len(x), int(SR * 0.003))
    x[-fade:] *= np.linspace(1, 0, fade)
    return x - np.mean(x)


def write(name, x):
    OUT.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"  {name:8s} {len(x)/SR:5.2f}s  peak {np.max(np.abs(x)):.3f}  rms {np.sqrt(np.mean(x**2)):.3f}")


def gen_tap():
    t = t_axis(0.13)
    body = slide(t, 235, 88, 0.04) * env(t, 0.001, 0.038) * 1.0
    knock = slide(t, 470, 180, 0.02) * env(t, 0.001, 0.018) * 0.35
    click = hiss(t, 0.009) * 0.55
    return finish(saturate(body + knock + click, 1.8))


def gen_ui():
    t = t_axis(0.09)
    x = tri(t, 520) * env(t, 0.002, 0.03) * 0.8 + sine(t, 1040) * env(t, 0.002, 0.02) * 0.25
    return finish(saturate(x, 1.2), peak=0.6)


def _chime(t, parts):
    x = np.zeros(len(t))
    for f, gain, start, tau, shape in parts:
        x += shape(t, f) * env(t, 0.003, tau, start) * gain
    return x


def gen_clear():
    # NEUTRAL "cleared" whoosh — a quick downward sweep + soft pop, NO bell
    # chord, so it reads as board management, not a reward (the lantern is the
    # reward). Low-mid register, short, clearly distinct from gen_lantern.
    t = t_axis(0.34)
    body = slide(t, 470, 190, 0.08) * env(t, 0.002, 0.085) * 0.85
    pop = slide(t, 300, 150, 0.03) * env(t, 0.001, 0.04) * 0.45
    air = hiss(t, 0.11, 0.0, bright=False) * 0.18   # dark whoosh, not bright hiss
    return finish(saturate(body + pop + air, 1.3), peak=0.72)


def gen_clear2():
    # multi-line clear — same neutral whoosh, a little bigger/lower, no chord
    t = t_axis(0.42)
    body = slide(t, 540, 200, 0.1) * env(t, 0.002, 0.11) * 0.85
    body2 = slide(t, 360, 160, 0.06) * env(t, 0.003, 0.08, 0.045) * 0.55
    air = hiss(t, 0.15, 0.0, bright=False) * 0.2    # dark whoosh
    return finish(saturate(body + body2 + air, 1.35), peak=0.8)


def gen_lantern():
    # THE REWARD — warm bell with shimmer + an ASCENDING sparkle motif, bright
    # and magical and clearly higher than the clear whoosh: "you lit one".
    t = t_axis(1.2)
    x = _chime(t, [
        (660.0, 1.0, 0.0,   0.42, sine),
        (663.0, 0.5, 0.0,   0.40, sine),    # detune → warm beating glow
        (1320.0, 0.42, 0.005, 0.28, sine),
        (1980.0, 0.18, 0.01,  0.18, sine),
        (2640.0, 0.08, 0.01,  0.12, sine),
    ])
    for i, f in enumerate([880.0, 1174.7, 1568.0]):   # rising sparkle, the signature
        x += sine(t, f) * env(t, 0.003, 0.16, 0.05 + i * 0.07) * 0.3
    x += hiss(t, 0.14, 0.01) * 0.07
    return finish(saturate(x, 1.4))


def gen_win():
    t = t_axis(1.7)
    steps = [
        ((523.25, 659.25), 0.00),
        ((659.25, 783.99), 0.10),
        ((783.99, 987.77), 0.20),
    ]
    x = np.zeros(len(t))
    for (a, b), start in steps:
        x += tri(t, a) * env(t, 0.004, 0.12, start) * 0.75
        x += sine(t, b) * env(t, 0.004, 0.11, start + 0.01) * 0.45
    # resolving chord, long tail
    x += tri(t, 1046.5) * env(t, 0.005, 0.42, 0.32) * 0.85
    x += sine(t, 1318.5) * env(t, 0.005, 0.40, 0.33) * 0.5
    x += sine(t, 1568.0) * env(t, 0.005, 0.36, 0.34) * 0.35
    x += sine(t, 2093.0) * env(t, 0.005, 0.30, 0.36) * 0.15
    x += hiss(t, 0.3, 0.33) * 0.16
    return finish(saturate(x, 1.6))


def gen_fail():
    t = t_axis(0.95)
    x = slide(t, 196, 158, 0.3) * env(t, 0.004, 0.22) * 0.8
    x += sine(t, 98) * env(t, 0.004, 0.3) * 0.7
    x += slide(t, 147, 128, 0.35) * env(t, 0.004, 0.3, 0.2) * 0.6
    return finish(saturate(x, 1.25), peak=0.8)


def add_wrapped(buf, x, start_idx):
    """mix x into circular buffer buf starting at start_idx (wraps the loop)"""
    n = len(buf)
    i = int(start_idx) % n
    end = i + len(x)
    if end <= n:
        buf[i:end] += x
    else:
        k = n - i
        buf[i:] += x[:k]
        buf[: end - n] += x[k:]


def gen_bgm():
    """24 s seamless ambient night loop: slow warm pad cycle + sparse
    music-box plucks. Everything is placed on a circular timeline, so the
    loop point is inaudible by construction. Mixed well below SFX level."""
    dur = 24.0
    buf = np.zeros(int(SR * dur))

    # pad: Cmaj7 → Am7 → Fmaj7 → G6, 6 s each, envelopes overlap the seam
    chords = [
        [130.81, 196.00, 246.94, 329.63],   # Cmaj7
        [110.00, 164.81, 196.00, 261.63],   # Am7
        [87.31, 130.81, 164.81, 220.00],    # Fmaj7
        [98.00, 146.83, 246.94, 329.63],    # G6
    ]
    t_note = t_axis(9.0)
    for ci, chord in enumerate(chords):
        start = ci * 6.0
        for ni, f in enumerate(chord):
            e = env(t_note, attack=1.8, tau=3.0)
            x = (sine(t_note, f) + 0.3 * sine(t_note, f * 2)) * e * 0.085
            if ni == 0:
                x += sine(t_note, f / 2) * e * 0.05      # sub root warmth
            add_wrapped(buf, x, start * SR)

    # music-box plucks: pentatonic random walk on a 0.375 s grid
    scale = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66]
    t_pluck = t_axis(1.6)
    idx = 2
    for slot in range(64):                                # 64 grid slots in 24 s
        if rng.random() > 0.28:                           # sparse
            continue
        idx = int(np.clip(idx + rng.integers(-2, 3), 0, len(scale) - 1))
        f = scale[idx]
        e = env(t_pluck, attack=0.002, tau=0.75)
        x = (sine(t_pluck, f) + 0.25 * sine(t_pluck, f * 2) + 0.08 * sine(t_pluck, f * 4)) * e * 0.14
        start = slot * 0.375 * SR
        add_wrapped(buf, x, start)
        add_wrapped(buf, x * 0.45, start + int(0.375 * SR))   # soft echo

    buf = saturate(buf, 1.1)
    m = np.max(np.abs(buf))
    if m > 0:
        buf = buf / m * 0.42                              # sits under the SFX
    return buf - np.mean(buf)


def main():
    print(f"rendering → {OUT}")
    write("tap", gen_tap())
    write("ui", gen_ui())
    write("clear", gen_clear())
    write("clear2", gen_clear2())
    write("lantern", gen_lantern())
    write("win", gen_win())
    write("fail", gen_fail())
    write("bgm", gen_bgm())
    # compressed copy for web delivery (2.1 MB wav → ~220 KB aac); the wav
    # stays as a decode fallback
    import shutil
    import subprocess
    if shutil.which("afconvert"):
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "96000",
                        str(OUT / "bgm.wav"), str(OUT / "bgm.m4a")], check=True)
        print(f"  bgm.m4a  {(OUT / 'bgm.m4a').stat().st_size / 1024:.0f} KB (aac)")
    else:
        print("  ! afconvert not found — bgm.m4a not regenerated")
    print("done")


if __name__ == "__main__":
    main()
