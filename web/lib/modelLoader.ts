/**
 * The ONE place the web app loads 3D models from.
 *
 * Returns a single BufferGeometry with positions, normals and, when the file
 * has them, vertex colors (the engine's heat map). Vertex order is kept
 * exactly as in the file, because DiffResult distances are indexed by vertex
 * (see types.ts).
 *
 * Supported: GLB (and GLTF), PLY, and `mock://<scanId>` for generated data.
 * The engine converts the iPhone's USDZ uploads to GLB, so USDZ is not needed.
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

/** `scale` multiplies file coordinates, e.g. 1000 for a file in meters viewed in millimeters. */
export function loadModel(url: string, format: ModelFormat, upAxis: UpAxis = "Y", scale = 1): Promise<LoadedModel> {
  const key = `${url}|${format}|${upAxis}|${scale}`;
  let p = cache.get(key);
  if (!p) {
    p = load(url, format).then((g) => finish(g, upAxis, scale));
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
 * with world transforms applied. Vertex colors are kept only when every mesh
 * has them, so a merge never mixes colored and uncolored parts.
 * TODO(backend): confirm distances are indexed in this same order for
 * multi-mesh files (single-mesh exports avoid the question).
 */
async function mergeScene(scene: THREE.Object3D): Promise<THREE.BufferGeometry> {
  const { mergeGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");
  scene.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  if (meshes.length === 0) throw new Error("GLB file contains no meshes");
  const withColors = meshes.every((m) => m.geometry.getAttribute("color"));
  const parts = meshes.map((mesh) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", mesh.geometry.getAttribute("position").clone());
    if (withColors) g.setAttribute("color", rgbFloat(mesh.geometry.getAttribute("color")));
    if (mesh.geometry.index) g.setIndex(mesh.geometry.index.clone());
    g.applyMatrix4(mesh.matrixWorld);
    return g;
  });
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!merged) throw new Error("Could not merge GLB meshes");
  return merged;
}

/** Vertex colors as plain RGB floats (glTF may store normalized bytes or RGBA). */
function rgbFloat(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  const out = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }
  return new THREE.BufferAttribute(out, 3);
}

function finish(source: THREE.BufferGeometry, upAxis: UpAxis, scale: number): LoadedModel {
  // Work on a copy so cached mock geometry is never mutated.
  const g = source.clone();
  if (scale !== 1) g.scale(scale, scale, scale);
  if (upAxis === "Z") g.rotateX(-Math.PI / 2);
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  g.computeBoundingSphere();
  const s = g.boundingSphere!;
  return { geometry: g, center: s.center.clone(), radius: s.radius };
}
