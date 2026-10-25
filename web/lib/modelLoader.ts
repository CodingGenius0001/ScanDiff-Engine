/**
 * The ONE place the web app loads 3D models from.
 *
 * Returns a single BufferGeometry with positions, normals and, when the file
 * has them, vertex colors (the engine's heat map) or UVs plus the scan's color
 * texture. Vertex order is kept
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
  /** The scan's color texture (with `uv` on the geometry), when the file has one. */
  texture?: THREE.Texture;
  /** Bounding sphere, used to frame the camera. */
  center: THREE.Vector3;
  radius: number;
}

interface Loaded {
  geometry: THREE.BufferGeometry;
  texture?: THREE.Texture;
}

const cache = new Map<string, Promise<LoadedModel>>();

/** `scale` multiplies file coordinates, e.g. 1000 for a file in meters viewed in millimeters. */
export function loadModel(url: string, format: ModelFormat, upAxis: UpAxis = "Y", scale = 1): Promise<LoadedModel> {
  const key = `${url}|${format}|${upAxis}|${scale}`;
  let p = cache.get(key);
  if (!p) {
    p = load(url, format).then((l) => finish(l, upAxis, scale));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

async function load(url: string, format: ModelFormat): Promise<Loaded> {
  if (url.startsWith("mock://")) {
    const { mockGeometry } = await import("./mock/scenarios");
    return { geometry: await mockGeometry(url.slice("mock://".length)) };
  }
  switch (format) {
    case "ply": {
      const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
      return { geometry: await new PLYLoader().loadAsync(url) };
    }
    case "glb": {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      // Fetched here rather than by the loader so engine errors ({"detail": ...}) reach the page.
      const res = await fetch(url);
      if (!res.ok) throw new Error(await errorDetail(res));
      const gltf = await new GLTFLoader().parseAsync(await res.arrayBuffer(), "");
      return mergeScene(gltf.scene);
    }
    default:
      throw new Error(`Unsupported model format "${format}"`);
  }
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "detail" in body) return `Could not load the 3D model: ${String(body.detail)}`;
  } catch {
    // Not JSON; fall through to the status code.
  }
  return `Could not load the 3D model (${res.status})`;
}

/**
 * Merge every mesh in a GLB scene into one geometry, in traversal order,
 * with world transforms applied. Vertex colors, normals and UVs are kept only
 * when every mesh has them, so a merge never mixes parts. The color texture is
 * kept when every mesh uses the same one (a scan from the app has one mesh).
 * TODO(backend): confirm distances are indexed in this same order for
 * multi-mesh files (single-mesh exports avoid the question).
 */
async function mergeScene(scene: THREE.Object3D): Promise<Loaded> {
  const { mergeGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");
  scene.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  if (meshes.length === 0) throw new Error("GLB file contains no meshes");
  const every = (name: string) => meshes.every((m) => m.geometry.getAttribute(name));
  const withColors = every("color");
  const withNormals = every("normal");
  const maps = new Set(meshes.map((m) => (m.material as THREE.MeshStandardMaterial).map ?? null));
  const texture = maps.size === 1 ? ([...maps][0] ?? undefined) : undefined;
  const withUVs = !!texture && every("uv");
  const parts = meshes.map((mesh) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", mesh.geometry.getAttribute("position").clone());
    if (withColors) g.setAttribute("color", rgbFloat(mesh.geometry.getAttribute("color")));
    if (withNormals) g.setAttribute("normal", mesh.geometry.getAttribute("normal").clone());
    if (withUVs) g.setAttribute("uv", mesh.geometry.getAttribute("uv").clone());
    if (mesh.geometry.index) g.setIndex(mesh.geometry.index.clone());
    g.applyMatrix4(mesh.matrixWorld);
    return g;
  });
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!merged) throw new Error("Could not merge GLB meshes");
  return { geometry: merged, texture: withUVs ? texture : undefined };
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

function finish({ geometry, texture }: Loaded, upAxis: UpAxis, scale: number): LoadedModel {
  // Work on a copy so cached mock geometry is never mutated.
  const g = geometry.clone();
  if (scale !== 1) g.scale(scale, scale, scale);
  if (upAxis === "Z") g.rotateX(-Math.PI / 2);
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  g.computeBoundingSphere();
  const s = g.boundingSphere!;
  return { geometry: g, texture, center: s.center.clone(), radius: s.radius };
}
