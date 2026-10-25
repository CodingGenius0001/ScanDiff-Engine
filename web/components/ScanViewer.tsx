"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
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
  /** "missing": a part that is gone, so it has no surface on the new scan's heat map. */
  kind: "change" | "missing" | "nodata";
}

interface Props {
  /** Exhibit letter, e.g. "A" for the baseline. */
  exhibit?: string;
  title: string;
  subtitle: React.ReactNode;
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
  // Marker badges are plain DOM buttons over the canvas, positioned each frame.
  const badges = useRef(new Map<string, HTMLButtonElement>());
  return (
    <figure className="flex flex-col">
      <div className="mb-2 flex items-baseline gap-2">
        {props.exhibit && <span className="display text-2xl">Exhibit {props.exhibit}</span>}
        <span className="truncate text-sm text-ink-soft">{props.title}</span>
      </div>
      <div className="plate relative h-64 touch-none overflow-hidden border border-rule sm:h-80 lg:h-[420px]">
        <Canvas
          dpr={[1, 2]}
          camera={{ fov: 40, near: props.model.radius / 100, far: props.model.radius * 50 }}
        >
          {/* Transparent canvas: the exhibit plate shows through. Soft studio light. */}
          <hemisphereLight args={["#ffffff", "#8d8a82", 1.3]} />
          <directionalLight position={[1, 2, 1.5]} intensity={1.3} />
          <directionalLight position={[-1.5, 0.5, -1]} intensity={0.6} />
          <Model {...props} />
          <LinkedControls link={props.link} />
          {props.markers.map((m) => (
            <MarkerSphere key={m.id} marker={m} selected={m.id === props.selectedId} />
          ))}
          <BadgeProjector markers={props.markers} badges={badges} />
        </Canvas>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {props.markers.map((m) => {
            const selected = m.id === props.selectedId;
            return (
              <button
                key={m.id}
                ref={(el) => {
                  if (el) badges.current.set(m.id, el);
                  else badges.current.delete(m.id);
                }}
                type="button"
                onClick={() => props.onSelect(m.id)}
                aria-label={m.kind === "nodata" ? "No data region" : m.kind === "missing" ? `Region ${m.number}, missing part` : `Region ${m.number}`}
                style={{ visibility: "hidden" }}
                className={`pointer-events-auto absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold ${
                  selected
                    ? "border-ink bg-ink text-paper"
                    : m.kind === "missing"
                      ? "border-2 border-stamp bg-paper text-stamp"
                      : "border-ink bg-paper text-ink"
                } ${m.kind === "nodata" ? "border-dashed" : ""}`}
              >
                {m.kind === "nodata" ? "–" : m.number}
              </button>
            );
          })}
        </div>
      </div>
      <figcaption className="display mt-2 text-base italic text-ink-soft">{props.subtitle}</figcaption>
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
  const showHeat = heat && hasColors;
  // The scan's own colors whenever the heat map is not drawn over it.
  const texture = !showHeat && geometry.getAttribute("uv") ? model.texture : undefined;
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        key={showHeat ? "heat" : texture ? "texture" : "plain"}
        vertexColors={showHeat}
        map={texture ?? null}
        color={showHeat || texture ? "#ffffff" : COLORS.neutral}
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

function MarkerSphere({ marker, selected }: { marker: Marker; selected: boolean }) {
  if (!selected) return null;
  const color = marker.kind === "nodata" ? COLORS.noData : marker.kind === "missing" ? "#9b2c1c" : "#141413";
  return (
    <mesh position={marker.center}>
      <sphereGeometry args={[marker.radius, 24, 16]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={0.35} />
    </mesh>
  );
}

/** Moves each badge to its marker's screen position every frame. */
function BadgeProjector({
  markers,
  badges,
}: {
  markers: Marker[];
  badges: React.RefObject<Map<string, HTMLButtonElement>>;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (const m of markers) {
      const el = badges.current.get(m.id);
      if (!el) continue;
      v.set(...m.center).project(camera);
      if (v.z > 1 || v.z < -1) {
        el.style.visibility = "hidden";
        continue;
      }
      const x = ((v.x + 1) / 2) * size.width - 12;
      const y = ((1 - v.y) / 2) * size.height - 12;
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.visibility = "visible";
    }
  });
  return null;
}
