"""Turn classified regions into a comparison verdict."""

from dataclasses import dataclass
from typing import Literal

import numpy as np

from scandiff import config
from scandiff.align import AlignResult
from scandiff.classify import Label
from scandiff.regions import RegionGeom

Verdict = Literal["accept", "damage_likely", "needs_review"]
DAMAGE_LABELS = ("dent_damage", "missing_part")


@dataclass(frozen=True)
class ClassifiedRegion:
    geom: RegionGeom
    label: Label
    confidence: float
    reason: str


def alignment_quality(align_result: AlignResult) -> float:
    """0 at the alignment gate's MIN_FITNESS, 1 when every new point is within the gate distance."""
    span = 1.0 - config.MIN_FITNESS
    return float(np.clip((align_result.gate_fitness - config.MIN_FITNESS) / span, 0.0, 1.0))


def decide(
    regions: list[ClassifiedRegion],
    stats: dict,
    align_result: AlignResult,
    scale_warning: str | None = None,
) -> tuple[Verdict, float, str]:
    """(verdict, confidence, reason) for the whole comparison.

    - needs_review when the alignment is weak (gate fitness under
      REVIEW_MIN_FITNESS) or the scale check warned: nothing else can be trusted.
    - damage_likely when any dent_damage or missing_part region is over
      DAMAGE_MIN_CONFIDENCE.
    - accept when every region is normal_wear and changed_fraction is under ACCEPT_FRACTION.
    - needs_review otherwise.

    Confidence is scaled by `alignment_quality`. For accept it is the least
    sure normal_wear region's confidence (1 with none), for damage_likely the
    surest damage region's; for needs_review it grows as the alignment weakens
    or as the surest region gets less sure.
    """
    quality = alignment_quality(align_result)
    top = max((region.confidence for region in regions), default=0.0)
    review_confidence = (1.0 - quality) + quality * (1.0 - top)

    if align_result.gate_fitness < config.REVIEW_MIN_FITNESS or scale_warning:
        why = scale_warning or (
            f"only {align_result.gate_fitness:.0%} of the new scan lines up with the base "
            f"within {config.ALIGN_GATE_DISTANCE_MM:g} mm"
        )
        return "needs_review", review_confidence, f"Check by hand: {_sentence(why)}"

    damage = sorted(
        (r for r in regions if r.label in DAMAGE_LABELS and r.confidence > config.DAMAGE_MIN_CONFIDENCE),
        key=lambda r: r.confidence,
        reverse=True,
    )
    if damage:
        more = f" ({len(damage) - 1} more like it)" if len(damage) > 1 else ""
        return "damage_likely", quality * damage[0].confidence, f"Likely damage: {_sentence(damage[0].reason)}{more}"

    changed = stats["changed_fraction"]
    if all(r.label == "normal_wear" for r in regions) and changed < config.ACCEPT_FRACTION:
        confidence = quality * min((r.confidence for r in regions), default=1.0)
        if not regions:
            return "accept", confidence, f"No changes found; {changed:.1%} of the surface moved past the threshold."
        return "accept", confidence, f"Only normal wear; {changed:.1%} of the surface changed."

    if all(r.label == "normal_wear" for r in regions):
        return "needs_review", review_confidence, (
            f"{changed:.0%} of the surface changed, more than normal wear explains."
        )
    unsure = max((r for r in regions if r.label != "normal_wear"), key=lambda r: r.confidence)
    return "needs_review", review_confidence, f"Unsure: {_sentence(unsure.reason)}"


def _sentence(text: str) -> str:
    """`text` with a lowercase start and one final period, to follow a lead-in like "Unsure: "."""
    text = text.strip().rstrip(".")
    return (text[:1].lower() + text[1:] if text[:1].isupper() and not text[1:2].isupper() else text) + "."
