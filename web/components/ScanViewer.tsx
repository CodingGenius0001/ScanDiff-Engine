"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import * as THREE from "three";
import type { CameraLink } from "@/lib/cameraSync";
import { COLORS, vertexColors } from "@/lib/heatmap";
import type { LoadedModel } from "@/lib/modelLoader";
import type { Vec3 } from "@/lib/types";

export interface Marker {
  id: string;
  number: number;
  center: Vec3;
  radius: number;
  kind: "change" | "nodata";
}

interface Props {
  title: string;
  subtitle: string;
  model: LoadedModel;
  distances?: (number | null)[];
  threshold: number;
  colorMax: number;
  heat: boolean;
  link: CameraLink;
  markers: Marker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function ScanViewer(props: Props) {
  return (
    <figure className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <figcaption className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <div className="text-sm font-semibold">{props.title}</div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">{props.subtitle}</div>
      </figcaption>
      <div className="relative h-64 touch-none sm:h-80 lg:h-[420px]">
        <Canvas
          dpr={[1, 2]}
          camera={{ fov: 40, near: props.model.radius / 100, far: props.model.radius * 50 }}
        >
          <color attach="background" args={["#f4f4f5"]} />
          <hemisphereLight args={["#ffffff", "#9ca3af", 1.6]} />
          <directionalLight position={[1, 2, 1.5]} intensity={1.6} />
          <directionalLight position={[-1.5, 0.5, -1]} intensity={0.6} />
          <Model {...props} />
          <LinkedControls link={props.link} />
          {props.markers.map((m) => (
            <MarkerView key={m.id} marker={m} selected={m.id === props.selectedId} onSelect={props.onSelect} />
          ))}
        </Canvas>
      </div>
    </figure>
  );
}

function Model({ model, distances, threshold, colorMax, heat }: Props) {
  const geometry = useMemo(() => {
    // Each viewer gets its own copy so color attributes never clash.
    const g = model.geometry.clone();
    if (distances && distances.length === g.getAttribute("position").count) {
      g.setAttribute("color", new THREE.BufferAttribute(vertexColors(distances, threshold, colorMax), 3));
    }
    return g;
  }, [model, distances, threshold, colorMax]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const hasColors = !!geometry.getAttribute("color");
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        key={heat && hasColors ? "heat" : "plain"}
        vertexColors={heat && hasColors}
        color={heat && hasColors ? "#ffffff" : COLORS.neutral}
        roughness={0.75}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function LinkedControls({ link }: { link: CameraLink }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const seen = useRef(-1);
  const applying = useRef(false);

  useFrame(() => {
    link.tick(performance.now());
    const c = controls.current;
    if (!c || seen.current === link.version) return;
    applying.current = true;
    camera.position.copy(link.position);
    c.target.copy(link.target);
    c.update();
    applying.current = false;
    seen.current = link.version;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={false}
      onChange={() => {
        const c = controls.current;
        if (!c || applying.current) return;
        link.set(camera.position, c.target);
        seen.current = link.version;
      }}
    />
  );
}

function MarkerView({
  marker,
  selected,
  onSelect,
}: {
  marker: Marker;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const color = marker.kind === "nodata" ? COLORS.noData : "#111827";
  return (
    <group position={marker.center}>
      {selected && (
        <mesh>
          <sphereGeometry args={[marker.radius, 24, 16]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={0.35} />
        </mesh>
      )}
      <Html center zIndexRange={[10, 0]}>
        <button
          type="button"
          onClick={() => onSelect(marker.id)}
          aria-label={`Region ${marker.number}`}
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-bold shadow ${
            selected ? "border-white bg-zinc-900 text-white" : "border-zinc-900 bg-white text-zinc-900"
          } ${marker.kind === "nodata" ? "border-dashed" : ""}`}
        >
          {marker.kind === "nodata" ? "–" : marker.number}
        </button>
      </Html>
    </group>
  );
}
