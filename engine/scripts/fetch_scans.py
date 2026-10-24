"""Download real scans from Supabase Storage for local testing.

The iOS app uploads each scan flat into `<bucket>/<item_id>/<scan_id>/`:
metadata.json, model.usdz, and photo_NN.jpg. Settings come from engine/.env
(see .env.example).

    python scripts/fetch_scans.py --tree
    python scripts/fetch_scans.py --list
    python scripts/fetch_scans.py --scan <scan_id | item_id/scan_id>
"""

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE_DIR))

from dotenv import load_dotenv  # noqa: E402
from pydantic import ValidationError  # noqa: E402
from supabase import Client, create_client  # noqa: E402

from app.schemas import ScanMetadata  # noqa: E402
from scandiff.errors import ChecksumMismatch  # noqa: E402
from scandiff.io import file_sha256, verify_model_sha256  # noqa: E402

DATA_DIR = ENGINE_DIR / "data" / "scans"
PAGE_SIZE = 1000
TREE_DEPTH = 3


@dataclass(frozen=True)
class Settings:
    url: str
    key: str
    bucket: str
    scans_table: str | None


def load_settings() -> Settings:
    load_dotenv(ENGINE_DIR / ".env")
    missing = [
        name for name in ("SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_BUCKET") if not os.environ.get(name)
    ]
    if missing:
        sys.exit(f"Set {', '.join(missing)} in engine/.env (see .env.example).")
    return Settings(
        url=os.environ["SUPABASE_URL"],
        key=os.environ["SUPABASE_KEY"],
        bucket=os.environ["SUPABASE_BUCKET"],
        scans_table=os.environ.get("SUPABASE_SCANS_TABLE") or None,
    )


def list_entries(client: Client, bucket: str, prefix: str) -> list[dict]:
    """Every entry directly under `prefix`. Folders have no `id`."""
    entries = []
    while True:
        page = client.storage.from_(bucket).list(
            prefix, {"limit": PAGE_SIZE, "offset": len(entries), "sortBy": {"column": "name", "order": "asc"}}
        )
        entries.extend(page)
        if len(page) < PAGE_SIZE:
            return entries


def is_folder(entry: dict) -> bool:
    return entry.get("id") is None


def entry_size(entry: dict) -> int | None:
    return (entry.get("metadata") or {}).get("size")


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


def resolve_folder(client: Client, bucket: str, scan: str) -> tuple[str, str]:
    """(item_id, scan_id) as the bucket names them, for a scan id or an `item_id/scan_id` path.

    Scan ids match case-insensitively: the scans table stores UUIDs in lowercase,
    while the iOS app names the folders in uppercase.
    """
    parts = [part for part in scan.split("/") if part]
    if len(parts) not in (1, 2):
        sys.exit(f"Expected a scan id or item_id/scan_id, got {scan!r}.")

    wanted = parts[-1].lower()
    if len(parts) == 2:
        items = [parts[0]]
    else:
        items = [item["name"] for item in filter(is_folder, list_entries(client, bucket, ""))]
    matches = [
        (item, entry["name"])
        for item in items
        for entry in filter(is_folder, list_entries(client, bucket, item))
        if entry["name"].lower() == wanted
    ]
    if not matches:
        sys.exit(f"No scan folder named {parts[-1]} in {bucket}. Try --list.")
    if len(matches) > 1:
        sys.exit(f"Scan {parts[-1]} is in {len(matches)} item folders; pass item_id/scan_id instead.")
    return matches[0]


def remote_files(client: Client, bucket: str, folder: str) -> list[tuple[str, int | None]]:
    """(relative path, size) for every file under `folder`, including subfolders."""
    files = []
    for entry in list_entries(client, bucket, folder):
        if is_folder(entry):
            for relative, size in remote_files(client, bucket, f"{folder}/{entry['name']}"):
                files.append((f"{entry['name']}/{relative}", size))
        else:
            files.append((entry["name"], entry_size(entry)))
    return files


def read_metadata(path: Path) -> tuple[ScanMetadata | None, str | None]:
    try:
        return ScanMetadata.model_validate_json(path.read_text()), None
    except OSError as exc:
        return None, str(exc)
    except ValidationError as exc:
        error = exc.errors()[0]
        where = ".".join(str(part) for part in error["loc"])
        return None, f"{where}: {error['msg']}" if where else error["msg"]


def expected_hashes(metadata: ScanMetadata | None) -> dict[str, str]:
    if metadata is None:
        return {}
    hashes = {metadata.model_file: metadata.model_sha256}
    hashes.update({texture.file: texture.sha256 for texture in metadata.textures})
    return hashes


def is_current(local: Path, size: int | None, sha256: str | None) -> bool:
    """Whether a downloaded file can be kept: its sha256 matches, or its size when no hash is known."""
    if not local.is_file():
        return False
    if sha256 is not None:
        return file_sha256(local).lower() == sha256.lower()
    return size is not None and local.stat().st_size == size


def fetch_scan(client: Client, settings: Settings, scan: str) -> None:
    item_id, scan_id = resolve_folder(client, settings.bucket, scan)
    folder = f"{item_id}/{scan_id}"
    files = remote_files(client, settings.bucket, folder)
    if not files:
        sys.exit(f"No files in {settings.bucket}/{folder}.")
    target = DATA_DIR / item_id / scan_id
    bucket = client.storage.from_(settings.bucket)

    # metadata.json is tiny and names the hashes of the other files, so it always comes first and fresh.
    files.sort(key=lambda file: file[0] != "metadata.json")
    hashes: dict[str, str] = {}
    metadata, metadata_error = None, "metadata.json is missing"
    for relative, size in files:
        local = target / relative
        if relative != "metadata.json" and is_current(local, size, hashes.get(relative)):
            print(f"  kept        {relative}")
            continue
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(bucket.download(f"{folder}/{relative}"))
        print(f"  downloaded  {relative}  ({local.stat().st_size} B)")
        if relative == "metadata.json":
            metadata, metadata_error = read_metadata(local)
            hashes = expected_hashes(metadata)

    print(f"Saved to {target}")
    if metadata is None:
        sys.exit(f"metadata.json does not match ScanMetadata: {metadata_error}")
    model = target / metadata.model_file
    if not model.is_file():
        sys.exit(f"metadata.json names {metadata.model_file}, which is not in {folder}.")
    try:
        verify_model_sha256(model, metadata.model_sha256)
    except ChecksumMismatch as exc:
        sys.exit(str(exc))
    print(f"metadata.json is valid and {metadata.model_file} matches model_sha256.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--tree", action="store_true", help="Print the bucket's folder layout")
    action.add_argument("--list", action="store_true", help="List the scans available")
    action.add_argument("--scan", metavar="SCAN", help="Download a scan by scan id or item_id/scan_id")
    args = parser.parse_args()

    settings = load_settings()
    client = create_client(settings.url, settings.key)
    if args.tree:
        print(f"{settings.bucket}/")
        print_tree(client, settings.bucket)
    elif args.list:
        list_scans(client, settings)
    else:
        fetch_scan(client, settings, args.scan)


if __name__ == "__main__":
    main()
