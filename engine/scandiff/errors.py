"""Typed errors."""


class ScanDiffError(Exception):
    """Base error for the scan comparison pipeline."""


class UnsupportedFormat(ScanDiffError):
    """The model file could not be read. The app should also send an OBJ."""


class ChecksumMismatch(ScanDiffError):
    """The model file bytes do not match model_sha256."""


class ScanTooSparse(ScanDiffError):
    """The scan has too few vertices, points, or too little surface to compare."""


class ScaleMismatch(ScanDiffError):
    """The two scans differ in size by more than a rescan could explain."""


class AlignmentFailed(ScanDiffError):
    """The new scan could not be aligned to the base scan."""


class StorageNotConfigured(ScanDiffError):
    """Supabase settings are missing from engine/.env or the environment."""


class ScanNotFound(ScanDiffError):
    """No scan folder or file for that id in the scans bucket."""


class InvalidMetadata(ScanDiffError):
    """A scan's metadata.json does not match ScanMetadata."""
