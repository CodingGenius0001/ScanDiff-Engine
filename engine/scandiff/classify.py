"""Classify regions of geometric change."""

import base64
import io
import json
import logging
import os
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from typing import Literal

import numpy as np
from dotenv import load_dotenv
from PIL import Image

from scandiff import config
from scandiff.photos import CropPair
from scandiff.regions import RegionGeom
from scandiff.storage import ENV_PATH

logger = logging.getLogger(__name__)

Label = Literal["missing_part", "dent_damage", "scratch_scuff", "normal_wear"]
LABELS: tuple[Label, ...] = ("missing_part", "dent_damage", "scratch_scuff", "normal_wear")

# A vision provider takes the side-by-side JPEG and the prompt and returns the model's
# {"label", "confidence", "reason"}. It may raise; vision_score treats that as no answer.
VisionProvider = Callable[[bytes, str], dict]

VISION_PROMPT = (
    "The left half of this image is a part of an object before it was lent out; the right half "
    "is the same part after it came back. A 3D comparison flagged a shape change here. Classify "
    "the change as one of: missing_part (a piece is gone), dent_damage (a dent, crack or deformation), "
    "scratch_scuff (a surface scratch or scuff with no real shape change), normal_wear (ordinary "
    "handling wear, or nothing visible). Give your confidence from 0 to 1 and one short sentence why."
)
VISION_SCHEMA = {
    "type": "object",
    "properties": {
        "label": {"type": "string", "enum": list(LABELS)},
        "confidence": {"type": "number"},
        "reason": {"type": "string"},
    },
    "required": ["label", "confidence", "reason"],
    "additionalProperties": False,
}

_vision_pool = ThreadPoolExecutor(max_workers=config.MAX_CROPPED_REGIONS, thread_name_prefix="vision")


def _above(value: float, cutoff: float) -> float:
    """Soft step from 0 to 1 around `cutoff`."""
    width = config.CLASSIFY_SOFTNESS * abs(cutoff)
    return float(1.0 / (1.0 + np.exp(-(value - cutoff) / width)))


def _below(value: float, cutoff: float) -> float:
    return 1.0 - _above(value, cutoff)


def geometry_score(region: RegionGeom, threshold_mm: float = config.THRESHOLD_MM) -> dict[Label, float]:
    """Probability of each label from the region's shape alone. They sum to 1.

    - missing_part: a missing region over MISSING_MIN_AREA_CM2, or anything but
      added material deeper than MISSING_MIN_DEPTH_MM over a compact area.
    - dent_damage: compact, and deeper than DENT_MIN_DEPTH_THRESHOLDS thresholds or sharp-edged.
    - scratch_scuff: long and narrow, shallow (under SCRATCH_MAX_EXTRA_MM past the threshold), small.
    - normal_wear: small, shallow, spread out, and soft-edged. Spread out
      means scattered, not long and narrow: that is a scratch's shape.
    """
    extra_mm = region.max_depth_mm - threshold_mm
    compact = _below(region.spread, config.COMPACT_MAX_SPREAD)
    scores = {
        "missing_part": max(
            (region.kind == "missing") * _above(region.area_cm2, config.MISSING_MIN_AREA_CM2),
            (region.kind != "added") * _above(region.max_depth_mm, config.MISSING_MIN_DEPTH_MM) * compact,
        ),
        "dent_damage": compact
        * max(
            _above(region.max_depth_mm, config.DENT_MIN_DEPTH_THRESHOLDS * threshold_mm),
            _above(region.sharpness, config.DENT_MIN_SHARPNESS),
        ),
        "scratch_scuff": _above(region.aspect_ratio, config.SCRATCH_MIN_ASPECT)
        * _below(extra_mm, config.SCRATCH_MAX_EXTRA_MM)
        * _below(region.area_cm2, config.SCRATCH_MAX_AREA_CM2),
        "normal_wear": _below(region.area_cm2, config.WEAR_MAX_AREA_CM2)
        * _below(extra_mm, config.WEAR_MAX_EXTRA_MM)
        * _above(region.spread, config.COMPACT_MAX_SPREAD)
        * _below(region.aspect_ratio, config.SCRATCH_MIN_ASPECT)
        * _below(region.sharpness, config.DENT_MIN_SHARPNESS),
    }
    return _normalize({label: score + config.CLASSIFY_PRIOR for label, score in scores.items()})


def vision_provider() -> VisionProvider | None:
    """The provider named by VISION_PROVIDER, or None when VISION_API_KEY is not set."""
    load_dotenv(ENV_PATH)
    api_key = os.environ.get("VISION_API_KEY")
    if not api_key:
        return None
    name = os.environ.get("VISION_PROVIDER") or config.VISION_DEFAULT_PROVIDER
    if name not in PROVIDERS:
        logger.warning("Unknown VISION_PROVIDER %r; vision is off", name)
        return None
    return PROVIDERS[name](api_key, os.environ.get("VISION_MODEL") or config.VISION_DEFAULT_MODEL)


def claude_vision(api_key: str, model: str) -> VisionProvider:
    """A provider backed by Claude, with structured JSON output."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key, timeout=config.VISION_TIMEOUT_S, max_retries=0)

    def ask(image_jpeg: bytes, prompt: str) -> dict:
        response = client.beta.messages.create(
            model=model,
            max_tokens=1024,
            # On a policy decline, Anthropic re-runs the request on its recommended fallback model.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": VISION_SCHEMA}},
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": base64.standard_b64encode(image_jpeg).decode("ascii"),
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        if response.stop_reason == "refusal":
            raise RuntimeError("the vision model declined")
        return json.loads(next(block.text for block in response.content if block.type == "text"))

    return ask


PROVIDERS: dict[str, Callable[[str, str], VisionProvider]] = {"anthropic": claude_vision}


def vision_score(before_crop: Image.Image | None, after_crop: Image.Image | None) -> dict[Label, float] | None:
    """Label probabilities from a vision model looking at both crops, or None.

    None when vision is not configured, a crop is missing, the model's answer
    is unusable, or it takes longer than VISION_TIMEOUT_S: the pipeline never
    waits on it. The answer's label gets its confidence; the rest is shared
    evenly by the other labels.
    """
    provider = vision_provider()
    if provider is None or before_crop is None or after_crop is None:
        return None
    future = _vision_pool.submit(provider, _side_by_side(before_crop, after_crop), VISION_PROMPT)
    try:
        answer = future.result(timeout=config.VISION_TIMEOUT_S)
        label = answer["label"]
        confidence = float(np.clip(float(answer["confidence"]), 0.0, 1.0))
    except FutureTimeout:
        logger.warning("vision model took over %.0f s; using geometry only", config.VISION_TIMEOUT_S)
        return None
    except Exception as exc:
        logger.warning("vision model gave no usable answer (%s); using geometry only", exc)
        return None
    if label not in LABELS:
        logger.warning("vision model answered unknown label %r; using geometry only", label)
        return None
    rest = (1.0 - confidence) / (len(LABELS) - 1)
    return {name: confidence if name == label else rest for name in LABELS}


def classify(
    region: RegionGeom,
    crops: CropPair | None = None,
    threshold_mm: float = config.THRESHOLD_MM,
    bounds: np.ndarray | None = None,
) -> tuple[Label, float, str]:
    """(label, confidence, reason) for one region.

    Geometry and vision are mixed GEOMETRY_WEIGHT to the rest when vision
    answers, otherwise geometry decides alone. `bounds` (the base mesh's
    2x3 min/max corners) lets the reason say where on the object the region is.
    """
    probabilities = geometry_score(region, threshold_mm)
    vision = vision_score(*crops) if crops is not None else None
    if vision is not None:
        weight = config.GEOMETRY_WEIGHT
        probabilities = {label: weight * probabilities[label] + (1 - weight) * vision[label] for label in LABELS}
    label = max(probabilities, key=probabilities.get)
    return label, probabilities[label], describe(region, label, bounds)


def describe(region: RegionGeom, label: Label, bounds: np.ndarray | None = None) -> str:
    """One plain line, such as "4 mm deep, 3.0 cm² dent with sharp edges near the top."."""
    noun = {
        "missing_part": "missing part",
        "dent_damage": "bump" if region.kind == "added" else "dent",
        "scratch_scuff": "scratch or scuff",
        "normal_wear": "worn patch",
    }[label]
    details = []
    if region.sharpness >= config.DENT_MIN_SHARPNESS:
        details.append("with sharp edges")
    if region.aspect_ratio >= config.SCRATCH_MIN_ASPECT:
        details.append("long and narrow")
    elif region.spread >= config.COMPACT_MAX_SPREAD:
        details.append("spread out")
    area = f"{region.area_cm2:.1f}" if region.area_cm2 < 10 else f"{region.area_cm2:.0f}"
    height = "high" if region.kind == "added" else "deep"
    line = f"{region.max_depth_mm:.0f} mm {height}, {area} cm² {noun}"
    if details:
        line += " " + ", ".join(details)
    if bounds is not None:
        line += " " + _height_word(region.anchor_m[1], bounds)
    return line + "."


def _height_word(y: float, bounds: np.ndarray) -> str:
    share = (y - bounds[0][1]) / max(bounds[1][1] - bounds[0][1], 1e-9)
    if share > 2 / 3:
        return "near the top"
    if share < 1 / 3:
        return "near the bottom"
    return "around the middle"


def _side_by_side(before: Image.Image, after: Image.Image) -> bytes:
    canvas = Image.new("RGB", (before.width + after.width, max(before.height, after.height)), "white")
    canvas.paste(before.convert("RGB"), (0, 0))
    canvas.paste(after.convert("RGB"), (before.width, 0))
    buffer = io.BytesIO()
    canvas.save(buffer, format="JPEG", quality=config.CROP_JPEG_QUALITY)
    return buffer.getvalue()


def _normalize(scores: dict[Label, float]) -> dict[Label, float]:
    total = sum(scores.values())
    return {label: score / total for label, score in scores.items()}
