"""Scans stored in Supabase.

The iOS app uploads each scan flat into `<bucket>/<item_id>/<scan_id>/`:
metadata.json, model.usdz, and photo_NN.jpg. The `scans` table row for a scan
has the same id in `id`, lowercase, while the folder name is uppercase.
Settings come from the environment or engine/.env (see .env.example).
"""

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from postgrest.exceptions import APIError
from pydantic import ValidationError
from storage3.utils import StorageException
from supabase import Client, create_client

from app.schemas import ScanMetadata
from scandiff.errors import InvalidMetadata, ScanNotFound, StorageNotConfigured
from scandiff.io import file_sha256, verify_model_sha256

ENGINE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ENGINE_DIR / "data" / "scans"
PAGE_SIZE = 1000


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
        raise StorageNotConfigured(f"Set {', '.join(missing)} in engine/.env (see .env.example).")
    return Settings(
        url=os.environ["SUPABASE_URL"],
        key=os.environ["SUPABASE_KEY"],
        bucket=os.environ["SUPABASE_BUCKET"],
        scans_table=os.environ.get("SUPABASE_SCANS_TABLE") or None,
    )


def connect(settings: Settings) -> Client:
    return create_client(settings.url, settings.key)


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


def resolve_folder(client: Client, settings: Settings, scan: str) -> tuple[str, str]:
    """(item_id, scan_id) as the bucket names them, for a scan id or an `item_id/scan_id` path.

    Scan ids match case-insensitively. With a scans table, the item comes from
    the scan's row; otherwise, or when there is no row, every item folder is searched.
    """
    parts = [part for part in scan.split("/") if part]
    if len(parts) not in (1, 2):
        raise ScanNotFound(f"Expected a scan id or item_id/scan_id, got {scan!r}.")

    wanted = parts[-1].lower()
    if len(parts) == 2:
        items = [parts[0]]
    else:
        items = _item_from_table(client, settings, wanted) or [
            item["name"] for item in filter(is_folder, list_entries(client, settings.bucket, ""))
        ]
    matches = [
        (item, entry["name"])
        for item in items
        for entry in filter(is_folder, list_entries(client, settings.bucket, item))
        if entry["name"].lower() == wanted
    ]
    if not matches:
        raise ScanNotFound(f"No scan folder named {parts[-1]} in {settings.bucket}.")
    if len(matches) > 1:
        raise ScanNotFound(f"Scan {parts[-1]} is in {len(matches)} item folders; pass item_id/scan_id instead.")
    return matches[0]


def _item_from_table(client: Client, settings: Settings, scan_id: str) -> list[str]:
    if not settings.scans_table:
        return []
    try:
        rows = client.table(settings.scans_table).select("item_id").eq("id", scan_id).execute().data
    except APIError:
        # Not a UUID, or a table without `id`: fall back to searching the bucket.
        return []
    return [row["item_id"] for row in rows]


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


def read_metadata(path: Path) -> ScanMetadata:
    try:
        return ScanMetadata.model_validate_json(path.read_text())
    except OSError as exc:
        raise InvalidMetadata(str(exc)) from exc
    except ValidationError as exc:
        error = exc.errors()[0]
        where = ".".join(str(part) for part in error["loc"])
        raise InvalidMetadata(
            f"metadata.json does not match ScanMetadata: {f'{where}: ' if where else ''}{error['msg']}"
        ) from exc


def expected_hashes(metadata: ScanMetadata) -> dict[str, str]:
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


def download(client: Client, bucket: str, remote: str, local: Path) -> None:
    """Download one file, replacing `local` only once it is complete."""
    try:
        data = client.storage.from_(bucket).download(remote)
    except StorageException as exc:
        raise ScanNotFound(f"{remote} is not in the {bucket} bucket.") from exc
    write_atomic(local, data)


def write_atomic(path: Path, data: bytes) -> None:
    """Write through a temporary file so readers never see a partial file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as handle:
        handle.write(data)
    os.replace(handle.name, path)


def fetch_model(scan: str) -> tuple[Path, ScanMetadata]:
    """Download a scan's metadata.json and model into data/scans and check the model's sha256.

    metadata.json is always downloaded fresh. The model is kept when a local
    copy already matches `model_sha256`.
    """
    settings = load_settings()
    client = connect(settings)
    item_id, scan_id = resolve_folder(client, settings, scan)
    folder = f"{item_id}/{scan_id}"
    target = DATA_DIR / item_id / scan_id

    download(client, settings.bucket, f"{folder}/metadata.json", target / "metadata.json")
    metadata = read_metadata(target / "metadata.json")
    model = target / metadata.model_file
    if not is_current(model, None, metadata.model_sha256):
        download(client, settings.bucket, f"{folder}/{metadata.model_file}", model)
    verify_model_sha256(model, metadata.model_sha256)
    return model, metadata
