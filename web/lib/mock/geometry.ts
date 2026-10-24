/**
 * Mock scan geometry, generated in code (no external assets).
 * MOCK ONLY: real scans come from the iOS app through `modelLoader.ts`.
 *
 * Units are millimeters and Y is up, matching the mock DiffResult.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Small seeded PRNG so the mock is identical on every run. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Keep only position and normal so parts can be merged, and drop the index. */
function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", g.getAttribute("position").clone());
  out.setAttribute("normal", g.getAttribute("normal").clone());
  if (g.index) out.setIndex(g.index.clone());
  return out;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map(clean), false);
  if (!merged) throw new Error("mock geometry merge failed");
  return merged;
}

/**
 * Push vertices inward (against their normal) with a smooth falloff around
 * `center`. With `facing` set, only vertices whose normal faces that way are
 * moved; with null, every vertex in range moves (both walls of a thin shell).
 */
function dent(
  g: THREE.BufferGeometry,
  center: THREE.Vector3,
  radius: number,
  depth: number,
  facing: THREE.Vector3 | null,
  axis?: THREE.Vector3,
) {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    if (facing && n.dot(facing) < 0.3) continue;
    const r = p.distanceTo(center);
    if (r > radius) continue;
    const falloff = 0.5 * (1 + Math.cos((Math.PI * r) / radius));
    const dir = axis ? axis : n;
    p.addScaledVector(dir, -depth * falloff);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
}

/** Scanner-like noise along the normal, uniform in [-amp, amp]. */
function addNoise(g: THREE.BufferGeometry, amp: number, seed: number) {
  const rand = mulberry32(seed);
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  for (let i = 0; i < pos.count; i++) {
    const s = (rand() * 2 - 1) * amp;
    pos.setXYZ(
      i,
      pos.getX(i) + nor.getX(i) * s,
      pos.getY(i) + nor.getY(i) * s,
      pos.getZ(i) + nor.getZ(i) * s,
    );
  }
  pos.needsUpdate = true;
}

// ---------------------------------------------------------------- mug

export const MUG = {
  radius: 45,
  height: 95,
  wall: 4,
  base: 6,
  handleRadius: 26,
  handleTube: 6,
  /** Angles (radians) of the handle piece that is missing in the new scan. */
  missingFrom: -0.1,
  missingTo: 1.0,
  dentCenter: new THREE.Vector3(0, 55, 45),
  dentRadius: 22,
  dentDepth: 9,
  wearCenter: new THREE.Vector3(-45, 14, 0),
  wearRadius: 16,
  wearDepth: 6,
};

/** Closed lathe profile (outer wall, rim, inner wall, inner floor) sampled every ~2 mm. */
function mugBody(): THREE.BufferGeometry {
  const { radius: R, height: H, wall: w, base: b } = MUG;
  const corners: [number, number][] = [
    [0.001, 0],
    [R, 0],
    [R, H],
    [R - w, H],
    [R - w, b],
    [0.001, b],
  ];
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const [x0, y0] = corners[i];
    const [x1, y1] = corners[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      pts.push(new THREE.Vector2(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t));
    }
  }
  pts.push(new THREE.Vector2(...corners[corners.length - 1]));
  return new THREE.LatheGeometry(pts, 128);
}

/** Handle arc from angle a0 to a1 (radians, 0 = pointing away from the body). */
function mugHandle(a0: number, a1: number): THREE.BufferGeometry {
  const arc = a1 - a0;
  const segs = Math.max(4, Math.round((arc / Math.PI) * 64));
  const g = new THREE.TorusGeometry(MUG.handleRadius, MUG.handleTube, 16, segs, arc);
  g.rotateZ(a0);
  g.translate(MUG.radius - 3, MUG.height / 2, 0);
  return g;
}

export function mugBaseline(): THREE.BufferGeometry {
  const g = merge([mugBody(), mugHandle(-Math.PI / 2, Math.PI / 2)]);
  addNoise(g, 1, 11);
  return g;
}

export function mugNew(): THREE.BufferGeometry {
  const g = merge([
    mugBody(),
    mugHandle(-Math.PI / 2, MUG.missingFrom),
    mugHandle(MUG.missingTo, Math.PI / 2),
  ]);
  const radialZ = new THREE.Vector3(0, 0, 1);
  dent(g, MUG.dentCenter, MUG.dentRadius, MUG.dentDepth, null, radialZ);
  const radialX = new THREE.Vector3(-1, 0, 0);
  dent(g, MUG.wearCenter, MUG.wearRadius, MUG.wearDepth, null, radialX);
  g.computeVertexNormals();
  addNoise(g, 1.2, 22);
  return g;
}

/** Center of the missing handle piece, for the flagged region. */
export function mugMissingCenter(): THREE.Vector3 {
  const a = (MUG.missingFrom + MUG.missingTo) / 2;
  return new THREE.Vector3(
    MUG.radius - 3 + MUG.handleRadius * Math.cos(a),
    MUG.height / 2 + MUG.handleRadius * Math.sin(a),
    0,
  );
}

// ---------------------------------------------------------------- car

export const CAR = {
  length: 4200,
  width: 1800,
  bodyBottom: 300,
  bodyTop: 1000,
  cabinLength: 2200,
  cabinWidth: 1600,
  cabinTop: 1500,
  wheelRadius: 330,
  mirror: { x: 700, y: 1080, size: [140, 110, 200] as const },
  dentCenter: new THREE.Vector3(-300, 650, 900),
  dentRadius: 320,
  dentDepth: 30,
  wearCenter: new THREE.Vector3(2100, 450, -400),
  wearRadius: 220,
  wearDepth: 8,
};

function box(w: number, h: number, d: number, step: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(
    w,
    h,
    d,
    Math.ceil(w / step),
    Math.ceil(h / step),
    Math.ceil(d / step),
  );
  g.translate(x, y, z);
  return g;
}

function wheel(x: number, z: number) {
  const g = new THREE.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, 220, 32, 4);
  g.rotateX(Math.PI / 2);
  g.translate(x, CAR.wheelRadius, z);
  return g;
}

/** Side mirror on the +Z (right, z > 0) or -Z side. */
function mirror(side: 1 | -1) {
  const [w, h, d] = CAR.mirror.size;
  return box(w, h, d, 30, CAR.mirror.x, CAR.mirror.y, side * (CAR.width / 2 + d / 2 - 20));
}

function carParts(withRightMirror: boolean): THREE.BufferGeometry {
  const c = CAR;
  const bodyH = c.bodyTop - c.bodyBottom;
  const cabinH = c.cabinTop - c.bodyTop;
  const parts = [
    box(c.length, bodyH, c.width, 40, 0, c.bodyBottom + bodyH / 2, 0),
    box(c.cabinLength, cabinH, c.cabinWidth, 40, -150, c.bodyTop + cabinH / 2, 0),
    wheel(1300, c.width / 2 - 100),
    wheel(1300, -c.width / 2 + 100),
    wheel(-1300, c.width / 2 - 100),
    wheel(-1300, -c.width / 2 + 100),
    mirror(-1),
  ];
  if (withRightMirror) parts.push(mirror(1));
  return merge(parts);
}

export function carPickup(): THREE.BufferGeometry {
  const g = carParts(true);
  addNoise(g, 1.5, 33);
  return g;
}

export function carReturn(): THREE.BufferGeometry {
  const g = carParts(false);
  const z = new THREE.Vector3(0, 0, 1);
  dent(g, CAR.dentCenter, CAR.dentRadius, CAR.dentDepth, z, z);
  const x = new THREE.Vector3(1, 0, 0);
  dent(g, CAR.wearCenter, CAR.wearRadius, CAR.wearDepth, x, x);
  g.computeVertexNormals();
  addNoise(g, 1.5, 44);
  return g;
}

export function carMirrorCenter(): THREE.Vector3 {
  const d = CAR.mirror.size[2];
  return new THREE.Vector3(CAR.mirror.x, CAR.mirror.y, CAR.width / 2 + d / 2 - 20);
}
