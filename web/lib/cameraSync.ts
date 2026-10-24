/**
 * Shared camera state so the baseline and new viewers move together.
 * Each viewer copies the state into its own camera every frame when the
 * version changes, and writes back when the user drags it.
 */
import * as THREE from "three";

export class CameraLink {
  position = new THREE.Vector3(0, 0, 1);
  target = new THREE.Vector3();
  version = 0;
  private anim: {
    fromP: THREE.Vector3;
    fromT: THREE.Vector3;
    toP: THREE.Vector3;
    toT: THREE.Vector3;
    start: number;
    duration: number;
  } | null = null;

  set(position: THREE.Vector3, target: THREE.Vector3) {
    this.anim = null;
    this.position.copy(position);
    this.target.copy(target);
    this.version++;
  }

  /** Smoothly move both cameras. */
  flyTo(position: THREE.Vector3, target: THREE.Vector3, duration = 600) {
    this.anim = {
      fromP: this.position.clone(),
      fromT: this.target.clone(),
      toP: position.clone(),
      toT: target.clone(),
      start: performance.now(),
      duration,
    };
  }

  /** Advance any running animation. Safe to call from several viewers per frame. */
  tick(now: number) {
    const a = this.anim;
    if (!a) return;
    const t = Math.min(1, (now - a.start) / a.duration);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    this.position.lerpVectors(a.fromP, a.toP, e);
    this.target.lerpVectors(a.fromT, a.toT, e);
    this.version++;
    if (t >= 1) this.anim = null;
  }
}

/** Camera position that looks at `point` from outside the model. */
export function viewFrom(point: THREE.Vector3, modelCenter: THREE.Vector3, distance: number) {
  const dir = point.clone().sub(modelCenter);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  // Lift slightly so the view is never exactly edge-on.
  dir.y += 0.25;
  dir.normalize();
  return point.clone().addScaledVector(dir, distance);
}
