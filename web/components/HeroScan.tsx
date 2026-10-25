"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useState } from "react";
import * as THREE from "three";
import { vertexColors } from "@/lib/heatmap";

/**
 * The home page's product shot: the example mug's arrival scan, heat map on,
 * turning slowly under a studio light. MOCK DATA, generated in the browser.
 */
export default function HeroScan() {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/lib/mock/scenarios").then(({ buildMockDiff, mockGeometry }) => {
      if (cancelled) return;
      const diff = buildMockDiff("mug-before", "mug-arrival");
      const g = mockGeometry("mug-arrival").clone();
      g.setAttribute("color", new THREE.BufferAttribute(vertexColors(diff.newToBase ?? [], diff.noiseThreshold, diff.summary.maxDistance), 3));
      g.computeBoundingSphere();
      setGeometry(g);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  return (
    <div className="absolute inset-0" aria-hidden>
      {geometry && (
        <Canvas dpr={[1, 2]} camera={{ fov: 30, position: [190, 150, 330], near: 1, far: 5000 }}>
          <hemisphereLight args={["#ffffff", "#222222", 0.9]} />
          <spotLight position={[0, 400, 120]} angle={0.5} penumbra={0.8} intensity={4} decay={0} />
          <directionalLight position={[-200, 80, -150]} intensity={0.5} />
          <mesh geometry={geometry} position={[0, -47, 0]} rotation={[0, -0.6, 0]}>
            <meshStandardMaterial vertexColors roughness={0.7} metalness={0} side={THREE.DoubleSide} />
          </mesh>
          <FitCamera />
          <OrbitControls autoRotate autoRotateSpeed={0.6} enableZoom={false} enablePan={false} enableRotate={false} target={[0, 0, 0]} />
        </Canvas>
      )}
    </div>
  );
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
