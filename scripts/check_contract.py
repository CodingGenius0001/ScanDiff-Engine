#!/usr/bin/env python3
"""Validate a DiffResponse against the contract.

Checks two things:
1. The response matches engine/contract/diff_response.schema.json (generated from
   the engine's Pydantic models, which the web types are generated from too).
2. The plain-language fields the iOS app reads (contract/README.md) are present
   and agree with the fields they are derived from.

Usage (run with the engine's venv, which has jsonschema):
  engine/.venv/bin/python scripts/check_contract.py contract/diff_response.json
  engine/.venv/bin/python scripts/check_contract.py --engine http://127.0.0.1:8000 --base <scan id> --new <scan id>
  engine/.venv/bin/python scripts/check_contract.py --engine http://127.0.0.1:8000 --mock
Exits 1 on any failure.
"""

import argparse
import json
import sys
import urllib.request
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "engine" / "contract" / "diff_response.schema.json"
TRIAGE = {"no_change", "wear", "damage", "inconclusive"}
REGION_TRIAGE = {"wear", "damage", "inconclusive"}


def fetch(engine: str, base: str, new: str, mock: bool) -> dict:
    url = f"{engine.rstrip('/')}/diff{'?mock=true' if mock else ''}"
    body = json.dumps({"base_id": base, "new_id": new}).encode()
    headers = {"Content-Type": "application/json"}
    if not mock:
        # POST /diff needs the session that GET /health hands out (contract/README.md).
        with urllib.request.urlopen(f"{engine.rstrip('/')}/health", timeout=30) as response:
            headers["X-Session-ID"] = json.load(response)["session_id"]
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)


def check(response: dict) -> list[str]:
    if not isinstance(response, dict):
        return [f"the response is a {type(response).__name__}, not a JSON object"]
    problems = []
    validator = jsonschema.Draft202012Validator(json.loads(SCHEMA.read_text()))
    problems += [f"schema: {'/'.join(map(str, e.path)) or '<root>'}: {e.message}" for e in validator.iter_errors(response)]

    expected_triage = (
        "damage" if response.get("verdict") == "damage_likely"
        else "inconclusive" if response.get("verdict") in ("needs_review", "inconclusive")
        else "wear" if response.get("regions") else "no_change"
    )
    if response.get("triage") not in TRIAGE:
        problems.append(f"triage {response.get('triage')!r} is not one of {sorted(TRIAGE)}")
    elif response["triage"] != expected_triage:
        problems.append(f"triage {response['triage']!r} disagrees with verdict {response.get('verdict')!r}")
    if response.get("confidence") != response.get("verdict_confidence"):
        problems.append("confidence must equal verdict_confidence")
    if response.get("reason") != response.get("verdict_reason"):
        problems.append("reason must equal verdict_reason")
    if "compared_fraction" not in response:
        problems.append("compared_fraction is missing (null is allowed)")
    histogram = response.get("histogram")
    if not isinstance(histogram, dict):
        problems.append(f"histogram must be an object, got {type(histogram).__name__}")
    elif histogram.get("bins_mm") != histogram.get("bin_edges_mm"):
        problems.append("histogram.bins_mm must equal histogram.bin_edges_mm")
    regions = response.get("regions")
    if not isinstance(regions, list):
        problems.append(f"regions must be a list, got {type(regions).__name__}")
        regions = []
    for region in regions:
        if not isinstance(region, dict):
            problems.append(f"region {region!r} is not an object")
            continue
        rid = region.get("id", "?")
        if region.get("triage") not in REGION_TRIAGE:
            problems.append(f"region {rid}: triage {region.get('triage')!r} is not one of {sorted(REGION_TRIAGE)}")
        if region.get("bbox") != {"min": region.get("bbox_min_m"), "max": region.get("bbox_max_m")}:
            problems.append(f"region {rid}: bbox must be {{min: bbox_min_m, max: bbox_max_m}}")
        if region.get("max_mm") != region.get("max_depth_mm") or region.get("mean_mm") != region.get("mean_depth_mm"):
            problems.append(f"region {rid}: max_mm/mean_mm must equal max_depth_mm/mean_depth_mm")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", nargs="?", help="DiffResponse JSON file to check")
    parser.add_argument("--engine", help="Engine base URL; POSTs /diff and checks the live response")
    parser.add_argument("--base", default="mock-base")
    parser.add_argument("--new", default="mock-new")
    parser.add_argument("--mock", action="store_true", help="Ask the engine for its fixed example (?mock=true)")
    args = parser.parse_args()

    if args.engine:
        response, source = fetch(args.engine, args.base, args.new, args.mock), f"{args.engine} /diff"
    elif args.file:
        response, source = json.loads(Path(args.file).read_text()), args.file
    else:
        parser.error("pass a file or --engine")

    problems = check(response)
    fields = response if isinstance(response, dict) else {}
    summary = f"triage={fields.get('triage')} verdict={fields.get('verdict')} regions={len(fields.get('regions') or [])} mock={fields.get('is_mock')}"
    if problems:
        print(f"FAIL {source} ({summary})")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print(f"PASS {source} ({summary})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
