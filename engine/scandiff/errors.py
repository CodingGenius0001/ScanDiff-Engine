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
