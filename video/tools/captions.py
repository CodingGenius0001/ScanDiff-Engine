"""Build the VO data the Remotion project reads: line files, word timings and
caption cards.

Caption text is what is actually said (proper nouns spelled right), split into
cards of at most two short lines. Each card is aligned to whisper.cpp's word
timestamps for the mastered line (video/vo/work/w16/<id>.json).

Usage: python video/tools/captions.py
Writes video/src/data/vo.json and copies the line WAVs to video/public/vo/.
"""

import difflib
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

CARDS = {
    "L01": [
        "Every time an item changes hands,",
        "whether it's a marketplace sale, a return, a rental,",
        "there's one big question: what condition was it in?",
        "Usually, all we have are a few photos.",
        "A tiny 3 mm dent can disappear under the wrong lighting.",
        "And comparing photos taken at different times?",
        "That's mostly guesswork.",
    ],
    "L02": ["And now, that's where our product, ScanDiff, comes in."],
    "L03": ["We're turning “just trust me” into real, measurable evidence."],
    "L04": [
        "ScanDiff compares three-dimensional scans of physical items",
        "to detect changes in their condition,",
        "with the marketplace checkout built right into the app.",
    ],
    "L05": ["Let's start with a simple example: a mug."],
    "L06": [
        "The seller sells a mug, and ScanDiff generates a unique item ID",
        "and two QR codes:",
        "one for its original scan, and one is for the buyer's check-in.",
    ],
    "L07": ["Before shipping, the seller scans the mug", "using their iPhone LiDAR."],
    "L08": [
        "The app guides the capture,",
        "builds textured three-dimensional model,",
        "and saves photos along with their camera positions",
        "before uploading every file, which gets a unique SHA-256 fingerprint",
        "to help detect whether the evidence has been altered.",
    ],
    "L09": [
        "Now, the buyer checks out using our demo Visa payment flow,",
        "but the money isn't released yet.",
        "It is still held until the buyer",
        "checks the item's condition on arrival.",
    ],
    "L10": ["Once the mug arrives, the buyer scans it again."],
    "L11": [
        "ScanDiff aligns both three-dimensional models,",
        "first globally, and then using a technique called ICP",
        "to refine the match.",
    ],
    "L12": [
        "Then, it measures how much the surface has changed,",
        "down to a few millimeters.",
        "Instead of guessing what counts as damage,",
        "we estimate the scan's own noise level,",
        "helping distinguish real changes from measurement noise.",
    ],
    "L13": [
        "Next, we group the changes into individual regions.",
        "For each region, Claude compares the before-and-after photo crops",
        "and classifies the change.",
        "It might be a dent, a missing part, a scuff,",
        "or just normal wear and tear.",
    ],
    "L14": [
        "And if one scan can't see a particular surface,",
        "we mark it as “no data” rather than incorrectly calling it damage.",
    ],
    "L15": ["So, what happens next?", "The buyer reviews the result and accepts the item."],
    "L16": [
        "Through Supabase Realtime,",
        "that decision immediately updates the checkout",
        "and the payment held is released.",
    ],
    "L17": [
        "But what if something went wrong during shipping?",
        "The buyer can dispute the transaction,",
        "the payment stays held,",
        "and the refund process runs through Capital One's Nessie sandbox.",
        "Both sides also get the same printable evidence page,",
        "complete with the original exhibits,",
        "file fingerprints, and flagged regions.",
    ],
    "L18": [
        "That brings us to an important distinction.",
        "ScanDiff provides tamper evidence of an item's condition at handoff.",
        "It doesn't prove that the item was originally advertised accurately,",
        "and our payment flow is for demonstration purposes only.",
    ],
    "L19": [
        "Today, anyone can generate a photo of damage that never happened.",
        "So a photo is no longer proof.",
        "ScanDiff works like two-factor authentication for physical things.",
        "One scan when you take something, and another when you hand it back,",
        "and both have to match before money moves.",
        "Think of everything we share.",
        "Rental cars, where you get billed for a scratch you didn't make,",
        "or hotel rooms and apartments,",
        "where a security deposit comes down to a landlord's photos at move-out.",
        "Equipment rentals, shared scooters, borrowed gear,",
        "returns and insurance claims.",
        "With our SDK, any of those companies can build",
        "scan-in and scan-out checks into their own app.",
    ],
    "L20": [
        "Looking ahead, we're expanding ScanDiff into use cases",
        "like rental cars, hotel rooms,",
        "while building an SDK that lets marketplaces and shipping platforms",
        "integrate scan-based payments and returns.",
    ],
    "L21": ["We're ScanDiff."],
    "L22": ["Measured, not argued."],
}

# Whisper spellings that mean the same spoken word as the caption.
SAME = {
    "scandif": "scandiff", "scandish": "scandiff", "skandiff": "scandiff", "scandeaf": "scandiff",
    "scan_diff": "scandiff", "superbase": "supabase", "nestle": "nessie", "nasty": "nessie",
    "rsdk": "sdk", "bill": "build", "lidar": "lidar", "shaw": "sha", "3mm": "3",
    "bias": "buyer", "biar": "buyer", "virus": "buyer", "where's": "we're",
}


def norm(text):
    out = []
    for t in re.findall(r"[a-z0-9'_]+", text.lower().replace("-", " ")):
        t = SAME.get(t, t)
        out.append(t)
    # "scan diff" spoken as two tokens
    i, merged = 0, []
    while i < len(out):
        if out[i] == "scan" and i + 1 < len(out) and out[i + 1] == "diff":
            merged.append("scandiff")
            i += 2
        else:
            merged.append(out[i])
            i += 1
    return merged


def whisper_words(lid):
    js = json.loads((ROOT / f"video/vo/work/w16/{lid}.json").read_text())
    words = []
    for w in js["transcription"]:
        t = w["text"].strip()
        if not t:
            continue
        a, b = w["offsets"]["from"] / 1000, w["offsets"]["to"] / 1000
        for tok in norm(t) or [t.lower()]:
            words.append({"tok": tok, "text": t, "start": a, "end": b})
    return words


def main():
    m = json.loads((ROOT / "video/vo/lines.json").read_text())
    pub = ROOT / "video/public/vo"
    pub.mkdir(parents=True, exist_ok=True)
    lines = []
    for ln in m["lines"]:
        lid = ln["id"]
        ww = whisper_words(lid)
        cards = CARDS[lid]
        ctoks, owner = [], []
        for ci, c in enumerate(cards):
            for t in norm(c):
                ctoks.append(t)
                owner.append(ci)
        sm = difflib.SequenceMatcher(a=ctoks, b=[w["tok"] for w in ww], autojunk=False)
        hit = {}
        for a, b, n in sm.get_matching_blocks():
            for k in range(n):
                hit[a + k] = b + k
        matched = len(hit) / max(1, len(ctoks))
        dur = ln["duration"]
        out_cards = []
        for ci, c in enumerate(cards):
            idx = [i for i, o in enumerate(owner) if o == ci]
            got = [hit[i] for i in idx if i in hit]
            if got:
                s, e = ww[min(got)]["start"], ww[max(got)]["end"]
            else:
                s, e = None, None
            out_cards.append({"text": c, "start": s, "end": e})
        # Fill unmatched cards between neighbours, then make cards contiguous.
        for i, c in enumerate(out_cards):
            if c["start"] is None:
                prev_end = out_cards[i - 1]["end"] if i else 0.0
                nxt = next((d["start"] for d in out_cards[i + 1 :] if d["start"] is not None), dur)
                c["start"], c["end"] = prev_end, nxt
        for i, c in enumerate(out_cards):
            c["start"] = round(max(0.0, c["start"] - 0.05), 3)
            nxt = out_cards[i + 1]["start"] if i + 1 < len(out_cards) else None
            c["end"] = round(min(dur, (nxt if nxt is not None else c["end"] + 0.35)), 3)
        shutil.copy(ROOT / ln["file"], pub / f"{lid}.wav")
        lines.append({
            "id": lid,
            "speaker": "Koushik" if ln["speaker"] == "koushik" else "Adithya",
            "src": f"vo/{lid}.wav",
            "duration": dur,
            "words": [{"text": w["text"], "start": round(w["start"], 3), "end": round(w["end"], 3)} for w in ww],
            "cards": out_cards,
        })
        print(f"{lid}: {matched:4.0%} of caption words aligned, {len(out_cards)} cards, {dur:.2f}s")
    dst = ROOT / "video/src/data/vo.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps({"lines": lines}, indent=1, ensure_ascii=False))
    print("wrote", dst.relative_to(ROOT))


if __name__ == "__main__":
    main()
