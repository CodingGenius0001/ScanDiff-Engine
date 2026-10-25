"""Cut, clean and master the VO lines for the demo video.

Reads the float WAVs in media/vo/raw/, writes one mastered WAV per line to
video/vo/clean/lines/ and a manifest (video/vo/lines.json) with each line's
source range, speaker and before/after measurements.

Never changes pitch or speed: only cuts (pauses, breaths, noises), filters
and gain.

Usage: python video/tools/vo_pipeline.py
"""

import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import welch

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "media/vo/raw"
OUT = ROOT / "video/vo"
WORK = OUT / "work"
LINES = OUT / "clean/lines"
SR = 48000

TARGET_LUFS = -16.0
TARGET_TP = -1.5
MAX_PAUSE = 0.30  # pauses and breaths inside a line are shortened to this
NR_DB = 10  # spectral noise reduction on the Presidio take; 18 already smears soft words ("the buyer")
# RNNoise speech model (richardpl/arnndn-models, std.rnnn), mixed at 85%: removes the
# hiss afftdn leaves between words without the smearing a stronger afftdn causes.
RNN = Path.home() / ".cache/scandiff-video/rnnoise/std.rnnn"
# AAC at 69 kb/s carries no voice above ~16 kHz, only codec clicks; Opus at 18 kb/s stops at 8 kHz.
LOWPASS = {"presidio": "lowpass=f=15000:p=2,lowpass=f=15000:p=2", "whatsapp": "lowpass=f=7600:p=2,lowpass=f=7600:p=2"}
# Fixed low-end correction before the matching loop: the WhatsApp take (phone
# held close) carries ~20 dB of extra bass, Adithya's Presidio lines ~10 dB.
PRE_EQ = {
    "koushik": "anull",
    "adithya": "highpass=f=90:p=2,lowshelf=f=300:g=-5",
    "adithya_wa": "highpass=f=110:p=2,highpass=f=110:p=2,lowshelf=f=400:g=-12",
}
GATE = "agate=threshold=0.006:ratio=2:range=0.25:attack=5:release=220:knee=3"  # -44 dBFS, at most -12 dB
FADE = 0.012

# (id, speaker, source, in, out). Ranges come from per-chunk transcription;
# the non-speech chunks (clap 1.1 s, clicks 52 s, crunch 179 s, scratch and
# a stray "thank you" 215-217 s, mumbling 254 s) are simply not listed.
P, W = "presidio1_take_f32.wav", "whatsapp_take_f32.wav"
LINE_TABLE = [
    ("L01", "adithya", P, 1.95, 20.40),
    ("L02", "adithya", P, 23.55, 26.35),
    ("L03", "adithya", P, 28.95, 33.10),
    ("L04", "adithya", P, 33.55, 41.95),
    ("L05", "koushik", P, 56.40, 59.30),
    ("L06", "koushik", P, 60.28, 71.40),
    ("L07", "koushik", P, 72.31, 77.15),
    ("L08", "koushik", P, 83.22, 102.00),
    ("L09", "koushik", P, 107.74, 122.85),
    ("L10", "adithya", P, 125.22, 128.40),
    ("L11", "adithya", P, 131.85, 140.55),
    ("L12", "adithya", P, 145.22, 157.85),
    ("L13", "adithya", P, 158.20, 170.10),
    ("L14", "adithya", P, 170.52, 177.85),
    ("L15", "koushik", P, 181.52, 186.95),
    ("L16", "koushik", P, 187.62, 194.10),
    ("L17", "koushik", P, 194.62, 214.00),
    ("L18", "adithya", P, 217.72, 234.45),
    ("L19", "adithya_wa", W, 1.25, 42.37),
    ("L20", "adithya", P, 234.80, None),  # end found at the pause before "We're ScanDiff"
    ("L21", "adithya", P, None, 249.05),
    ("L22", "adithya", P, 250.27, 251.95),
]

# Long-term average spectrum target, dB relative to 1 kHz (a close-miked
# male voice). Each source is pulled toward it, at most +/-6 dB per band.
TARGET_LTAS = {100: -3, 200: 1, 300: 1, 500: 1, 1000: 0, 2000: -5, 3500: -9, 5000: -12, 8000: -16, 10000: -18}


def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def ffout(*args):
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostats", *args], capture_output=True, text=True).stderr


def env_db(x, hop):
    n = len(x) // hop
    frames = x[: n * hop].reshape(n, hop)
    return 20 * np.log10(np.sqrt((frames**2).mean(1)) + 1e-9)


def noise_floor(x):
    return float(np.percentile(env_db(x, SR // 100), 10))


def loudness(path):
    err = ffout("-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-")
    tail = err[err.rfind("Summary:") :]
    i = float(tail.split("I:")[1].split("LUFS")[0])
    tp = float(tail.split("Peak:")[1].split("dBFS")[0])
    return i, tp


def ltas(x):
    f, p = welch(x, SR, nperseg=4096)
    ref = p[(f > 1000 / 1.26) & (f < 1000 * 1.26)].mean()
    return {c: float(10 * np.log10(p[(f > c / 1.26) & (f < c * 1.26)].mean() / ref)) for c in TARGET_LTAS}


def split_point(x, a, b):
    """Quietest 10 ms frame between a and b seconds."""
    seg = x[int(a * SR) : int(b * SR)]
    e = env_db(seg, SR // 100)
    return a + int(np.argmin(e)) / 100


def shorten_pauses(x, speech_db):
    """Shorten every run below speech level - 25 dB (pauses, breaths) to MAX_PAUSE, with crossfades."""
    hop = SR // 100
    e = env_db(x, hop)
    quiet = e < speech_db - 25
    runs, i = [], 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]:
                j += 1
            runs.append((i, j))
            i = j
        else:
            i += 1
    out, pos, removed = [], 0, 0.0
    xf = int(FADE * SR)
    ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, xf))
    for a, b in runs:
        if a == 0 or b == len(quiet):
            continue  # leading/trailing quiet is handled by the line pads
        if (b - a) / 100 <= MAX_PAUSE:
            continue
        keep = int(MAX_PAUSE * SR)
        cut_a = a * hop + keep // 2
        cut_b = b * hop - keep // 2
        head = x[pos:cut_a].copy()
        tail_start = cut_b
        if out or len(head) > xf:
            head[-xf:] *= ramp[::-1]
        out.append(head)
        nxt = x[tail_start : tail_start + xf].copy() * ramp
        out.append(nxt)
        pos = tail_start + xf
        removed += (cut_b - cut_a) / SR
    out.append(x[pos:])
    return np.concatenate(out), removed


def fade_edges(x):
    n = int(0.02 * SR)
    r = np.linspace(0, 1, n)
    x = x.copy()
    x[:n] *= r
    x[-n:] *= r[::-1]
    return x


def eq_chain(src_ltas, allow_air):
    parts = []
    for c, tgt in TARGET_LTAS.items():
        if c == 1000:
            continue
        if c >= 8000 and not allow_air:
            continue
        g = float(np.clip(tgt - src_ltas[c], -6, 6))
        if abs(g) >= 0.75:
            parts.append(f"equalizer=f={c}:t=o:w=1:g={g:.1f}")
    return parts


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    LINES.mkdir(parents=True, exist_ok=True)

    # 1. De-noise each full take once. The Presidio take learns its noise profile
    # from a real silent stretch (42.6-50.6 s), prepended and stripped again.
    srcs = {}
    for name in (P, W):
        x, sr = sf.read(RAW / name, dtype="float32")
        assert sr == SR
        before_floor = noise_floor(x)
        dn = WORK / f"dn_{name}"
        if name == W:
            # WhatsApp already gated its noise; only repair its flat-topped clipping.
            chain = f"volume=-3dB,adeclip=w=55:o=75:a=8:t=10,afftdn=nr=6:nf=-70:tn=1,adeclick,{LOWPASS['whatsapp']}"
            ff("-i", str(RAW / name), "-af", chain, "-c:a", "pcm_f32le", str(dn))
            y, _ = sf.read(dn, dtype="float32")
        else:
            pre = x[int(42.6 * SR) : int(50.6 * SR)]
            padded = WORK / "padded.wav"
            sf.write(padded, np.concatenate([pre, x]), SR, subtype="FLOAT")
            chain = (f"volume=-3dB,asendcmd=c='0.5 afftdn sn start;7.5 afftdn sn stop',"
                     f"afftdn=nr={NR_DB}:tn=0,arnndn=m={RNN}:mix=0.85,adeclick,{LOWPASS['presidio']}")
            ff("-i", str(padded), "-af", chain, "-c:a", "pcm_f32le", str(dn))
            y, _ = sf.read(dn, dtype="float32")
            y = y[len(pre) :]
        srcs[name] = {"x": y, "floor_before": before_floor, "floor_after_dn": noise_floor(y)}
        print(name, "noise floor", round(before_floor, 1), "->", round(noise_floor(y), 1), "dBFS (incl. -3 dB headroom)")

    # 2. Resolve the split between "…payments and returns." and "We're ScanDiff."
    px = srcs[P]["x"]
    cut = split_point(px, 247.2, 248.05)
    table = []
    for lid, spk, src, a, b in LINE_TABLE:
        a = cut if a is None else a
        b = cut if b is None else b
        table.append((lid, spk, src, a, b))

    # 3. Cut lines, shorten pauses/breaths.
    lines = []
    for lid, spk, src, a, b in table:
        x = srcs[src]["x"][int(a * SR) : int(b * SR)]
        speech_db = float(np.percentile(env_db(x, SR // 100), 90))
        y, removed = shorten_pauses(x, speech_db)
        y = fade_edges(y)
        raw_cut = WORK / f"{lid}_cut.wav"
        sf.write(raw_cut, y, SR, subtype="FLOAT")
        rawf = WORK / f"{lid}_rawseg.wav"
        sf.write(rawf, sf.read(RAW / src, dtype="float32")[0][int(a * SR) : int(b * SR)], SR, subtype="FLOAT")
        lines.append({
            "id": lid, "speaker": spk, "source": src.replace("_f32", ""), "in": round(a, 3), "out": round(b, 3),
            "pause_removed_s": round(removed, 2), "cut": str(raw_cut), "rawseg": str(rawf),
        })

    # 4. Per speaker: base chain, then tone-match EQ measured on that speaker's concatenated lines.
    base = ("highpass=f=80:p=2,deesser=i=0.4:m=0.5:f=0.5,"
            "acompressor=threshold=-22dB:ratio=3:attack=5:release=90:knee=4:makeup=1")
    style = "equalizer=f=250:t=q:w=1.2:g=-2,equalizer=f=4000:t=q:w=1.4:g=1.5,highshelf=f=9000:g=1"
    groups = {}
    for ln in lines:
        groups.setdefault(ln["speaker"], []).append(ln)
    for spk, gl in groups.items():
        gap = np.zeros(SR, dtype="float32")
        parts, offs, pos = [], [], 0
        for ln in gl:
            y, _ = sf.read(ln["cut"], dtype="float32")
            offs.append((pos, len(y)))
            parts += [y, gap]
            pos += len(y) + len(gap)
        cat = np.concatenate(parts)
        # Pre-level to -23 LUFS so the compressor threshold means the same for both speakers.
        catf = WORK / f"cat_{spk}.wav"
        sf.write(catf, cat, SR, subtype="FLOAT")
        i0, _ = loudness(catf)
        pre = f"volume={-23 - i0:.2f}dB"
        # Iterative tone match: process, measure the long-term spectrum, correct, repeat.
        # Every speaker converges on the same TARGET_LTAS, so they sound like one room.
        gate = GATE if spk == "koushik" else GATE.replace("range=0.25", "range=0.1")
        limiter = "alimiter=limit=0.84:attack=3:release=60:level=disabled:latency=1"
        gains = {c: 0.0 for c in TARGET_LTAS if c != 1000}
        proc = WORK / f"proc_{spk}.wav"
        for _ in range(4):
            match = [f"equalizer=f={c}:t=o:w=1:g={g:.1f}" for c, g in gains.items() if abs(g) >= 0.5]
            chain = ",".join([pre, gate, PRE_EQ[spk], base, *match, style, limiter])
            ff("-i", str(catf), "-af", chain, "-c:a", "pcm_f32le", str(proc))
            t, _ = sf.read(proc, dtype="float32")
            src_l = ltas(t[np.abs(t) > 1e-4])
            for c in gains:
                if c >= 8000 and spk == "adithya_wa":
                    continue  # band-limited source: nothing up there to lift
                lim = 10 if spk == "adithya_wa" else 7
                gains[c] = float(np.clip(gains[c] + 0.8 * (TARGET_LTAS[c] - src_l[c]), -lim, lim))
        # Two-pass loudnorm, linear (one gain for the whole speaker, so every line keeps its dynamics).
        meas = ffout("-i", str(proc), "-af", f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA=7:print_format=json", "-f", "null", "-")
        js = json.loads(meas[meas.rfind("{") : meas.rfind("}") + 1])
        ln_f = (f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA=7:linear=true:"
                f"measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:"
                f"measured_thresh={js['input_thresh']}:offset={js['target_offset']}")
        fin = WORK / f"final_{spk}.wav"
        ff("-i", str(proc), "-af", ln_f, "-ar", str(SR), "-c:a", "pcm_f32le", str(fin))
        f, _ = sf.read(fin, dtype="float32")
        # Split back into lines. loudnorm keeps sample positions in linear mode.
        for ln, (o, n) in zip(gl, offs):
            seg = f[o : o + n]
            dst = LINES / f"{ln['id']}.wav"
            # Trim each line to the target too, so every line sits at the same level.
            tmpl = WORK / f"{ln['id']}_ln.wav"
            sf.write(tmpl, seg, SR, subtype="FLOAT")
            li, _ = loudness(tmpl)
            trim = float(np.clip(TARGET_LUFS - li, -4, 4))
            ff("-i", str(tmpl), "-af", f"volume={trim:.2f}dB,alimiter=limit=0.89:attack=2:release=50:level=disabled:latency=1",
               "-ar", str(SR), "-c:a", "pcm_s24le", str(dst))
            ln["line_trim_db"] = round(trim, 2)
            ln["file"] = str(dst.relative_to(ROOT))
            ln["duration"] = round(sf.info(dst).frames / SR, 3)
        groups[spk] = {"chain": chain, "loudnorm_pass1": js, "ltas_final": src_l}
        sf.write(OUT / f"clean/{spk}_all.wav", f, SR, subtype="PCM_24")

    # 5. Measurements: before (raw segment) and after (mastered line).
    for ln in lines:
        rb = Path(ln.pop("rawseg"))
        ln.pop("cut")
        ib, tpb = loudness(rb)
        ia, tpa = loudness(ROOT / ln["file"])
        xb, _ = sf.read(rb, dtype="float32")
        xa, _ = sf.read(ROOT / ln["file"], dtype="float32")
        ln.update({
            "before": {"lufs": ib, "true_peak": tpb, "noise_floor_dbfs": round(noise_floor(xb), 1)},
            "after": {"lufs": ia, "true_peak": tpa, "noise_floor_dbfs": round(noise_floor(xa), 1)},
        })
    manifest = {"sample_rate": SR, "target_lufs": TARGET_LUFS, "target_tp": TARGET_TP,
                "split_returns_wereScanDiff": round(cut, 2), "speakers": groups, "lines": lines}
    (OUT / "lines.json").write_text(json.dumps(manifest, indent=2, default=float))
    for ln in lines:
        b, a = ln["before"], ln["after"]
        print(f"{ln['id']} {ln['speaker']:<11} {ln['duration']:6.2f}s  -{ln['pause_removed_s']:.2f}s pauses | "
              f"before {b['lufs']:6.1f} LUFS tp {b['true_peak']:5.1f} floor {b['noise_floor_dbfs']:6.1f} | "
              f"after {a['lufs']:6.1f} LUFS tp {a['true_peak']:5.1f} floor {a['noise_floor_dbfs']:6.1f}")
    print("total speech", round(sum(l["duration"] for l in lines), 1), "s")
    for spk, g in groups.items():
        print(spk, "final LTAS", {k: round(v, 1) for k, v in g["ltas_final"].items()})
        print("   EQ match:", [p for p in g["chain"].split(",") if p.startswith("equalizer") and ":t=o" in p])


if __name__ == "__main__":
    main()
