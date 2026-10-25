"""The display GLB uses the app's textured OBJ only when it lines up with the model."""

import numpy as np
import trimesh
from PIL import Image

from app import scan_models


class Meta:
    scan_id = "scan"


def _textured_box(tmp_path, offset=(0.0, 0.0, 0.0)):
    box = trimesh.creation.box(extents=(0.09, 0.08, 0.10))
    box.apply_translation(offset)
    uv = np.random.default_rng(0).random((len(box.vertices), 2))
    image = Image.new("RGB", (8, 8), (200, 40, 40))
    box.visual = trimesh.visual.TextureVisuals(uv=uv, image=image)
    path = tmp_path / "model.obj"
    box.export(path)
    return path


def test_uses_textured_obj_in_the_same_frame(tmp_path, monkeypatch):
    obj = _textured_box(tmp_path)
    geometry = trimesh.creation.box(extents=(0.09, 0.08, 0.10))
    monkeypatch.setattr(scan_models.storage, "fetch_textured_obj", lambda metadata: obj)
    mesh = scan_models.textured_mesh(Meta(), geometry)
    assert mesh is not None
    assert mesh.visual.kind == "texture"


def test_falls_back_when_obj_is_in_another_frame(tmp_path, monkeypatch):
    obj = _textured_box(tmp_path, offset=(0.05, 0.0, 0.0))
    geometry = trimesh.creation.box(extents=(0.09, 0.08, 0.10))
    monkeypatch.setattr(scan_models.storage, "fetch_textured_obj", lambda metadata: obj)
    assert scan_models.textured_mesh(Meta(), geometry) is None


def test_falls_back_without_obj_or_on_errors(monkeypatch):
    geometry = trimesh.creation.box(extents=(0.09, 0.08, 0.10))
    monkeypatch.setattr(scan_models.storage, "fetch_textured_obj", lambda metadata: None)
    assert scan_models.textured_mesh(Meta(), geometry) is None

    def broken(metadata):
        raise OSError("download failed")

    monkeypatch.setattr(scan_models.storage, "fetch_textured_obj", broken)
    assert scan_models.textured_mesh(Meta(), geometry) is None
