"""Download real scans from Supabase Storage for local testing.

The iOS app uploads each scan flat into `<bucket>/<item_id>/<scan_id>/`:
metadata.json, model.usdz, and photo_NN.jpg. Settings come from engine/.env
(see .env.example).

    python scripts/fetch_scans.py --tree
    python scripts/fetch_scans.py --list
    python scripts/fetch_scans.py --scan <scan_id | item_id/scan_id>
"""

import argparse
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE_DIR))

from supabase import Client  # noqa: E402

from scandiff.errors import ScanDiffError  # noqa: E402
from scandiff.io import verify_model_sha256  # noqa: E402
from scandiff.storage import (  # noqa: E402
    DATA_DIR,
    Settings,
    connect,
    download,
    entry_size,
    expected_hashes,
    is_current,
    is_folder,
    list_entries,
    load_settings,
    read_metadata,
    remote_files,
    resolve_folder,
)

TREE_DEPTH = 3


def print_table(headers: list[str], rows: list[list]) -> None:
    cells = [headers] + [["" if value is None else str(value) for value in row] for row in rows]
    widths = [max(len(row[i]) for row in cells) for i in range(len(headers))]
    for index, row in enumerate(cells):
        print("  ".join(value.ljust(width) for value, width in zip(row, widths)).rstrip())
        if index == 0:
            print("  ".join("-" * width for width in widths))


def print_tree(client: Client, bucket: str, prefix: str = "", depth: int = 0) -> None:
    for entry in list_entries(client, bucket, prefix):
        indent = "  " * depth
        if is_folder(entry):
            print(f"{indent}{entry['name']}/")
            if depth + 1 < TREE_DEPTH:
                print_tree(client, bucket, f"{prefix}/{entry['name']}".lstrip("/"), depth + 1)
        else:
            print(f"{indent}{entry['name']}  ({entry_size(entry)} B)")


def list_scans(client: Client, settings: Settings) -> None:
    if settings.scans_table:
        rows = (
            client.table(settings.scans_table)
            .select("*")
            .order("created_at", desc=True)
            .execute()
            .data
        )
        print_table(
            ["item_id", "scan_id", "kind", "created_at"],
            # The iOS app stores the scan id in `id`.
            [[row.get("item_id"), row.get("scan_id", row.get("id")), row.get("kind"), row.get("created_at")] for row in rows],
        )
        return

    rows = []
    for item in filter(is_folder, list_entries(client, settings.bucket, "")):
        for scan in filter(is_folder, list_entries(client, settings.bucket, item["name"])):
            files = list_entries(client, settings.bucket, f"{item['name']}/{scan['name']}")
            rows.append([item["name"], scan["name"], len(files)])
    print_table(["item_id", "scan_id", "files"], rows)


def fetch_scan(client: Client, settings: Settings, scan: str) -> None:
    item_id, scan_id = resolve_folder(client, settings, scan)
    folder = f"{item_id}/{scan_id}"
    files = remote_files(client, settings.bucket, folder)
    if not files:
        sys.exit(f"No files in {settings.bucket}/{folder}.")
    target = DATA_DIR / item_id / scan_id

    # metadata.json is tiny and names the hashes of the other files, so it always comes first and fresh.
    files.sort(key=lambda file: file[0] != "metadata.json")
    hashes: dict[str, str] = {}
    metadata, metadata_error = None, "metadata.json is missing"
    for relative, size in files:
        local = target / relative
        if relative != "metadata.json" and is_current(local, size, hashes.get(relative)):
            print(f"  kept        {relative}")
            continue
        download(client, settings.bucket, f"{folder}/{relative}", local)
        print(f"  downloaded  {relative}  ({local.stat().st_size} B)")
        if relative == "metadata.json":
            try:
                metadata = read_metadata(local)
            except ScanDiffError as exc:
                metadata_error = str(exc)
            else:
                hashes = expected_hashes(metadata)

    print(f"Saved to {target}")
    if metadata is None:
        sys.exit(metadata_error)
    model = target / metadata.model_file
    if not model.is_file():
        sys.exit(f"metadata.json names {metadata.model_file}, which is not in {folder}.")
    verify_model_sha256(model, metadata.model_sha256)
    print(f"metadata.json is valid and {metadata.model_file} matches model_sha256.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--tree", action="store_true", help="Print the bucket's folder layout")
    action.add_argument("--list", action="store_true", help="List the scans available")
    action.add_argument("--scan", metavar="SCAN", help="Download a scan by scan id or item_id/scan_id")
    args = parser.parse_args()

    try:
        settings = load_settings()
        client = connect(settings)
        if args.tree:
            print(f"{settings.bucket}/")
            print_tree(client, settings.bucket)
        elif args.list:
            list_scans(client, settings)
        else:
            fetch_scan(client, settings, args.scan)
    except ScanDiffError as exc:
        sys.exit(str(exc))


if __name__ == "__main__":
    main()
