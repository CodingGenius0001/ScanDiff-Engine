"""Scans stored in Supabase.

The iOS app uploads each scan flat into `<bucket>/<item_id>/<scan_id>/`:
metadata.json, model.usdz, and photo_NN.jpg. The `scans` table row for a scan
has the same id in `id`, lowercase, while the folder name is uppercase.
Settings come from the environment or engine/.env (see .env.example).

Results (heat maps, legends) are uploaded to a separate public bucket, or
saved under engine/static/ when Supabase is not configured.
"""

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from dotenv import load_dotenv
from postgrest.exceptions import APIError
from pydantic import ValidationError
from storage3.utils import StorageException
from supabase import Client, create_client

from app.schemas import ScanMetadata
from scandiff.errors import InvalidMetadata, ScanNotFound, StorageNotConfigured, UploadFailed
from scandiff.io import file_sha256, verify_model_sha256

ENGINE_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = ENGINE_DIR / ".env"
DATA_DIR = ENGINE_DIR / "data" / "scans"
STATIC_DIR = ENGINE_DIR / "static"
PAGE_SIZE = 1000
DEFAULT_RESULTS_BUCKET = "scandiff"
# Base of the URLs returned for files saved locally; app/main.py serves STATIC_DIR at /static.
DEFAULT_LOCAL_URL = "http://localhost:8000"
CONTENT_TYPES = {".glb": "model/gltf-binary", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg"}


@dataclass(frozen=True)
class Settings:
    url: str
    key: str
    bucket: str
    scans_table: str | None


def load_settings() -> Settings:
    load_dotenv(ENV_PATH)
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
    hashes = {record.name: record.sha256 for record in metadata.files if record.sha256}
    hashes[metadata.model_file] = metadata.model_sha256
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
    return _fetch(scan, photos=False)


def fetch_scan(scan: str) -> tuple[Path, ScanMetadata]:
    """`fetch_model`, plus every key photo the metadata lists. Returns the model's path; its folder holds the rest.

    A photo is kept when the local copy matches its hash in `files`, or, with
    no hash, when it is already there: a scan's files do not change.
    """
    return _fetch(scan, photos=True)


def _fetch(scan: str, photos: bool) -> tuple[Path, ScanMetadata]:
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
    if photos:
        hashes = expected_hashes(metadata)
        for photo in metadata.photos:
            local = target / photo.file
            sha256 = hashes.get(photo.file)
            if not (is_current(local, None, sha256) if sha256 else local.is_file()):
                download(client, settings.bucket, f"{folder}/{photo.file}", local)
    return model, metadata


def upload_file(data: bytes, path: str) -> str:
    """Store a result file and return a URL the web viewer can load.

    With SUPABASE_URL and SUPABASE_KEY set, the file goes to the public bucket
    named by SUPABASE_RESULTS_BUCKET (default "scandiff"), replacing any file
    at that path. Without them, it is saved under engine/static/ and the URL
    starts with ENGINE_PUBLIC_URL (default http://localhost:8000), so the
    engine works offline.
    """
    relative = _relative_path(path)
    load_dotenv(ENV_PATH)
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY")
    if not (url and key):
        write_atomic(STATIC_DIR / relative, data)
        base = os.environ.get("ENGINE_PUBLIC_URL") or DEFAULT_LOCAL_URL
        return f"{base.rstrip('/')}/static/{relative}"

    bucket_name = os.environ.get("SUPABASE_RESULTS_BUCKET") or DEFAULT_RESULTS_BUCKET
    bucket = create_client(url, key).storage.from_(bucket_name)
    content_type = CONTENT_TYPES.get(PurePosixPath(relative).suffix.lower(), "application/octet-stream")
    try:
        bucket.upload(relative, data, {"content-type": content_type, "upsert": "true"})
    except StorageException as exc:
        raise UploadFailed(
            f"Could not upload {relative} to the {bucket_name} bucket: {exc}. The bucket must "
            "exist, be public, and allow inserts and updates for this key."
        ) from exc
    return bucket.get_public_url(relative)


def _relative_path(path: str) -> str:
    """`path` as a relative POSIX path that cannot leave the bucket or engine/static/."""
    parts = PurePosixPath(path).parts
    if not parts or PurePosixPath(path).is_absolute() or ".." in parts:
        raise ValueError(f"Upload path must be relative and stay inside the bucket, got {path!r}.")
    return str(PurePosixPath(*parts))
