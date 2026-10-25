"""Intelligibility regression: transcribe each mastered line and its raw source
range with whisper.cpp and list every word that differs.

Usage: python video/tools/vo_check.py
"""

import difflib
import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODEL = Path.home() / ".cache/whisper-cpp/ggml-medium.en.bin"


def transcribe(src, start=None, end=None):
    with tempfile.NamedTemporaryFile(suffix=".wav") as t:
        cmd = ["ffmpeg", "-v", "error", "-y"]
        if start is not None:
            cmd += ["-ss", str(start), "-to", str(end)]
        cmd += ["-i", str(src), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", t.name]
        subprocess.run(cmd, check=True)
        out = subprocess.run(["whisper-cli", "-m", str(MODEL), "-f", t.name, "-np", "-nt", "-ng", "-t", "6"], capture_output=True, text=True).stdout
    return re.findall(r"[a-z0-9']+", out.lower())


def main():
    m = json.loads((ROOT / "video/vo/lines.json").read_text())
    bad = 0
    for ln in m["lines"]:
        raw = transcribe(ROOT / "media/vo/raw" / ln["source"].replace(".wav", "_f32.wav"), ln["in"], ln["out"])
        fin = transcribe(ROOT / ln["file"])
        diffs = [(op, raw[a:b], fin[c:d]) for op, a, b, c, d in difflib.SequenceMatcher(a=raw, b=fin).get_opcodes() if op != "equal"]
        ok = not diffs
        bad += not ok
        print(f"{ln['id']}: {'OK' if ok else 'DIFF'} {'' if ok else diffs}")
    print("lines with differences:", bad)


if __name__ == "__main__":
    main()
