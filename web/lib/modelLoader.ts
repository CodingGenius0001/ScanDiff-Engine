/**
 * The ONE place the web app loads 3D models from.
 *
 * Returns a single BufferGeometry with positions and normals. Vertex order
 * is kept exactly as in the file, because DiffResult distances are indexed
 * by vertex (see types.ts).
 *
 * Supported: GLB (and GLTF), PLY, and `mock://<scanId>` for generated data.
 * TODO(ios): confirm the export format. Add OBJ, USDZ or Draco-compressed GLB
 * here if needed (USDZ has no stable three.js loader; prefer GLB or PLY).
 */
import * as THREE from "three";
import type { ModelFormat, UpAxis } from "./types";

export interface LoadedModel {
  geometry: THREE.BufferGeometry;
  /** Bounding sphere, used to frame the camera. */
  center: THREE.Vector3;
  radius: number;
}

const cache = new Map<string, Promise<LoadedModel>>();

export function loadModel(url: string, format: ModelFormat, upAxis: UpAxis = "Y"): Promise<LoadedModel> {
  const key = `${url}|${format}|${upAxis}`;
  let p = cache.get(key);
  if (!p) {
    p = load(url, format).then((g) => finish(g, upAxis));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

async function load(url: string, format: ModelFormat): Promise<THREE.BufferGeometry> {
  if (url.startsWith("mock://")) {
    const { mockGeometry } = await import("./mock/scenarios");
    return mockGeometry(url.slice("mock://".length));
  }
  switch (format) {
    case "ply": {
      const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
      return new PLYLoader().loadAsync(url);
    }
    case "glb": {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const gltf = await new GLTFLoader().loadAsync(url);
      return mergeScene(gltf.scene);
    }
    default:
      throw new Error(`Unsupported model format "${format}"`);
  }
}

/**
 * Merge every mesh in a GLB scene into one geometry, in traversal order,
 * with world transforms applied.
 * TODO(backend): confirm distances are indexed in this same order for
 * multi-mesh files (single-mesh exports avoid the question).
 */
async function mergeScene(scene: THREE.Object3D): Promise<THREE.BufferGeometry> {
  const { mergeGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");
  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", mesh.geometry.getAttribute("position").clone());
    if (mesh.geometry.index) g.setIndex(mesh.geometry.index.clone());
    g.applyMatrix4(mesh.matrixWorld);
    parts.push(g);
  });
  if (parts.length === 0) throw new Error("GLB file contains no meshes");
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!merged) throw new Error("Could not merge GLB meshes");
  return merged;
}

function finish(source: THREE.BufferGeometry, upAxis: UpAxis): LoadedModel {
  // Work on a copy so cached mock geometry is never mutated.
  const g = source.clone();
  if (upAxis === "Z") g.rotateX(-Math.PI / 2);
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  g.computeBoundingSphere();
  const s = g.boundingSphere!;
  return { geometry: g, center: s.center.clone(), radius: s.radius };
}
