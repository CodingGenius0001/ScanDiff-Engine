"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useState } from "react";
import * as THREE from "three";
import { colorScaleMax, missingGhost, vertexColors } from "@/lib/heatmap";
import { Ghost } from "./ScanViewer";

/**
 * The home page's product shot: the example mug's arrival scan, heat map on,
 * turning slowly under a studio light. MOCK DATA, generated in the browser.
 */
export default function HeroScan() {
  const [scan, setScan] = useState<{ geometry: THREE.BufferGeometry; ghost: THREE.BufferGeometry | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/lib/mock/scenarios").then(({ buildMockDiff, mockGeometry }) => {
      if (cancelled) return;
      const diff = buildMockDiff("mug-before", "mug-arrival");
      const g = mockGeometry("mug-arrival").clone();
      g.setAttribute("color", new THREE.BufferAttribute(vertexColors(diff.newToBase ?? [], diff.noiseThreshold, colorScaleMax(diff.newToBase, diff.noiseThreshold, diff.summary.maxDistance)), 3));
      g.computeBoundingSphere();
      // The broken-off handle piece, from the seller's baseline, so the missing section shows in red.
      const ghost = missingGhost(
        mockGeometry("mug-before"),
        diff.baseToNew ?? [],
        diff.noiseThreshold,
        diff.flaggedRegions.filter((r) => r.seenOn === "baseline"),
      );
      setScan({ geometry: g, ghost });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(
    () => () => {
      scan?.geometry.dispose();
      scan?.ghost?.dispose();
    },
    [scan],
  );

  return (
    <div className="absolute inset-0" aria-hidden>
      {scan && (
        <Canvas dpr={[1, 2]} camera={{ fov: 30, position: [190, 150, 330], near: 1, far: 5000 }}>
          <hemisphereLight args={["#ffffff", "#222222", 0.9]} />
          <spotLight position={[0, 400, 120]} angle={0.5} penumbra={0.8} intensity={4} decay={0} />
          <directionalLight position={[-200, 80, -150]} intensity={0.5} />
          <group position={[0, -47, 0]} rotation={[0, -0.6, 0]}>
            <mesh geometry={scan.geometry}>
              <meshStandardMaterial vertexColors roughness={0.7} metalness={0} side={THREE.DoubleSide} />
            </mesh>
            {scan.ghost && <Ghost geometry={scan.ghost} />}
          </group>
          <FitCamera />
          <OrbitControls
            autoRotate
            autoRotateSpeed={0.6}
            enableZoom={false}
            enablePan={false}
            minPolarAngle={0.35}
            maxPolarAngle={2.2}
            target={[0, 0, 0]}
          />
          <ScrollFriendlyTouch />
        </Canvas>
      )}
    </div>
  );
}

/**
 * Drag to turn the mug. On touch screens only sideways drags turn it, so a
 * vertical swipe over the mug still scrolls the page.
 */
function ScrollFriendlyTouch() {
  const canvas = useThree((s) => s.gl.domElement);
  useEffect(() => {
    // OrbitControls sets touch-action: none on connect; run after it.
    const id = requestAnimationFrame(() => {
      canvas.style.touchAction = "pan-y";
      canvas.style.cursor = "grab";
    });
    const grab = () => (canvas.style.cursor = "grabbing");
    const release = () => (canvas.style.cursor = "grab");
    canvas.addEventListener("pointerdown", grab);
    window.addEventListener("pointerup", release);
    return () => {
      cancelAnimationFrame(id);
      canvas.removeEventListener("pointerdown", grab);
      window.removeEventListener("pointerup", release);
    };
  }, [canvas]);
  return null;
}

/** Pulls the camera back on narrow screens so the whole mug stays in frame. */
function FitCamera() {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / s.size.height);
  useEffect(() => {
    const scale = aspect < 1.2 ? 1.2 / aspect : 1;
    camera.position.set(190 * scale, 150 * scale, 330 * scale);
  }, [camera, aspect]);
  return null;
}
