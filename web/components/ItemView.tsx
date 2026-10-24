"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { CameraLink, viewFrom } from "@/lib/cameraSync";
import { M_TO_MM, scanModelUrl } from "@/lib/diffClient";
import { loadModel, type LoadedModel } from "@/lib/modelLoader";
import { toDisplay } from "@/lib/format";
import { COLORS, RAMP_CSS } from "@/lib/heatmap";
import type { BakedHeatmap, Item, LengthUnit } from "@/lib/types";
import { useComparison, type Comparison } from "@/lib/useComparison";
import DecisionPanel from "./DecisionPanel";
import Histogram from "./Histogram";
import RegionList from "./RegionList";
import ScanDecisionPanel from "./ScanDecisionPanel";
import ScanViewer, { type Marker } from "./ScanViewer";
import Timeline from "./Timeline";
import VerdictBanner from "./VerdictBanner";

export default function ItemView({ item }: { item: Item }) {
  const state = useComparison(item);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:py-6">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-xs font-semibold text-zinc-500 underline">
          ScanDiff
        </Link>
        <h1 className="text-xl font-bold sm:text-2xl">{item.title}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {item.kind === "rental" ? "Rental car pickup and return comparison" : "Shipping handoff comparison"}
        </p>
      </header>
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-zinc-500">Version timeline</h2>
        <Timeline
          versions={item.versions}
          baseId={item.versions[0].scanId}
          newId={item.versions[item.versions.length - 1].scanId}
        />
      </section>
      {state.status === "loading" && (
        <div className="rounded-xl border border-zinc-200 p-8 text-center text-sm text-zinc-500" role="status">
          Computing comparison…
        </div>
      )}
      {state.status === "error" && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
          Could not load the comparison: {state.message}{" "}
          <button type="button" onClick={state.retry} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}
      {state.status === "waiting" && (
        <>
          <div className="rounded-xl border border-zinc-200 p-4 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400" role="status">
            Baseline scan received. Waiting for a check scan to compare it with.
          </div>
          <BaselinePreview item={item} />
        </>
      )}
      {state.status === "ready" && <ComparisonView data={state.data} />}
      {item.source === "supabase" ? <ScanDecisionPanel item={item} /> : <DecisionPanel item={item} />}
    </main>
  );
}

function ComparisonView({ data }: { data: Comparison }) {
  const { diff, baseModel, newModel, heatModel } = data;
  const [link] = useState(() => new CameraLink());
  const [heat, setHeat] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const home = useCallback(() => {
    const c = baseModel.center;
    const dir = new THREE.Vector3(0.55, 0.4, 1).normalize();
    return { position: c.clone().addScaledVector(dir, baseModel.radius * 3), target: c.clone() };
  }, [baseModel]);

  useEffect(() => {
    const h = home();
    link.set(h.position, h.target);
  }, [link, home]);

  const markers: Marker[] = useMemo(
    () => [
      ...diff.flaggedRegions.map((r, i) => ({
        id: r.id,
        number: i + 1,
        center: toDisplay(r.center, diff.upAxis),
        radius: r.radius,
        kind: "change" as const,
      })),
      ...diff.uncoveredRegions.map((u, i) => ({
        id: u.id,
        number: diff.flaggedRegions.length + i + 1,
        center: toDisplay(u.center, diff.upAxis),
        radius: u.radius,
        kind: "nodata" as const,
      })),
    ],
    [diff],
  );

  const select = useCallback(
    (id: string) => {
      const m = markers.find((x) => x.id === id);
      if (!m) return;
      setSelectedId(id);
      const center = new THREE.Vector3(...m.center);
      const distance = Math.max(m.radius * 5, baseModel.radius * 1.2);
      link.flyTo(viewFrom(center, baseModel.center, distance), center);
    },
    [markers, baseModel, link],
  );

  const selected = [...diff.flaggedRegions, ...diff.uncoveredRegions].find((r) => r.id === selectedId);
  const colorMax = diff.summary.maxDistance;
  const common = {
    threshold: diff.noiseThreshold,
    colorMax,
    heat,
    link,
    markers,
    selectedId,
    onSelect: select,
  };

  return (
    <>
      <VerdictBanner diff={diff} />
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold dark:border-zinc-700 dark:bg-zinc-900">
            <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} className="h-4 w-4" />
            Heat map
          </label>
          <button
            type="button"
            onClick={() => {
              const h = home();
              setSelectedId(null);
              link.flyTo(h.position, h.target);
            }}
            className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold dark:border-zinc-700 dark:bg-zinc-900"
          >
            Reset view
          </button>
          <span className="text-xs text-zinc-500">Drag to rotate. Both views move together.</span>
        </div>
        {heat &&
          (diff.heatmap ? (
            <SignedLegend heatmap={diff.heatmap} units={diff.units} />
          ) : (
            <Legend threshold={diff.noiseThreshold} max={colorMax} units={diff.units} />
          ))}
        {heatModel ? (
          // Engine result: the heat map is baked onto the baseline surface; the new scan is shown plain.
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ScanViewer
              title={`Baseline: ${diff.baseScan.name}`}
              subtitle={heat ? "Heat map of the change, drawn on the baseline surface." : "Baseline scan."}
              model={heat ? heatModel : baseModel}
              {...common}
            />
            <ScanViewer
              title={`New: ${diff.newScan.name}`}
              subtitle="Aligned into the baseline frame by the engine."
              model={newModel}
              {...common}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ScanViewer
              title={`Baseline: ${diff.baseScan.name}`}
              subtitle="Red here means material that is missing from the new scan."
              model={baseModel}
              distances={diff.baseToNew}
              {...common}
            />
            <ScanViewer
              title={`New: ${diff.newScan.name}`}
              subtitle="Red here means the surface moved compared with the baseline."
              model={newModel}
              distances={diff.newToBase}
              {...common}
            />
          </div>
        )}
        {selected && (
          <div className="rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm text-white dark:border-white dark:bg-white dark:text-zinc-900" role="status">
            {"label" in selected ? (
              <>
                <span className="font-semibold">{selected.label === "needs_review" ? "Needs review" : "Normal wear"}</span>
                {" · "}Confidence {Math.round(selected.confidence * 100)}%{" · "}
                {selected.description}
              </>
            ) : (
              <>
                <span className="font-semibold">No data</span>
                {" · "}
                {selected.description}
              </>
            )}
          </div>
        )}
      </section>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-base font-semibold">Flagged regions</h2>
          <RegionList diff={diff} selectedId={selectedId} onSelect={select} />
        </section>
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold">
            {diff.heatmap ? "Change from the baseline surface" : "Distance per vertex, both scans"}
          </h2>
          <p className="mb-2 text-xs text-zinc-500">Areas with no data are left out.</p>
          <Histogram
            histogram={diff.histogram}
            threshold={diff.noiseThreshold}
            units={diff.units}
            signedScale={!!diff.heatmap}
          />
        </section>
      </div>
    </>
  );
}

function Legend({ threshold, max, units }: { threshold: number; max: number; units: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-700 dark:text-zinc-300">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-5 rounded-sm" style={{ background: COLORS.noChange }} />
        No change (≤ {threshold} {units})
      </span>
      <span className="flex items-center gap-1.5">
        <span>
          {threshold} {units}
        </span>
        <span className="h-3 w-24 rounded-sm" style={{ background: RAMP_CSS }} />
        <span>
          {max.toFixed(0)} {units} (log scale)
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-5 rounded-sm" style={{ background: COLORS.noData }} />
        No data
      </span>
    </div>
  );
}

/** Legend for the engine's baked signed scale (colors match the engine's GLB). */
function SignedLegend({ heatmap, units }: { heatmap: BakedHeatmap; units: LengthUnit }) {
  const swatch = (background: string) => <span className="h-3 w-5 rounded-sm" style={{ background }} />;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-700 dark:text-zinc-300">
      <span className="flex items-center gap-1.5">
        {swatch(SIGNED.dent)}
        Dent (down to {heatmap.min} {units})
      </span>
      <span className="flex items-center gap-1.5">
        {swatch(SIGNED.neutral)}
        Unchanged (within ±{heatmap.neutralBand} {units})
      </span>
      <span className="flex items-center gap-1.5">
        {swatch(SIGNED.added)}
        Added material (up to +{heatmap.max} {units})
      </span>
      <span className="flex items-center gap-1.5">
        {/* Not a gray swatch: gray already means "unchanged" on this scale. */}
        <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-dashed border-zinc-500 text-[9px] font-bold">
          –
        </span>
        No data (dashed marker), not counted as damage
      </span>
    </div>
  );
}

/** Ends of the engine's diverging scale (engine/app/mock.py). */
const SIGNED = { dent: "#2563eb", neutral: "#a8a8a8", added: "#dc2626" };

/** The baseline scan on its own, from the engine, before there is anything to compare it with. */
function BaselinePreview({ item }: { item: Item }) {
  const scan = item.versions[0];
  const url = item.source === "supabase" ? scanModelUrl(scan.scanId) : null;
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link] = useState(() => new CameraLink());

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    loadModel(url, "glb", "Y", M_TO_MM).then(
      (m) => {
        if (cancelled) return;
        const dir = new THREE.Vector3(0.55, 0.4, 1).normalize();
        link.set(m.center.clone().addScaledVector(dir, m.radius * 3), m.center.clone());
        setModel(m);
      },
      (e: Error) => !cancelled && setError(e.message),
    );
    return () => {
      cancelled = true;
    };
  }, [url, link]);

  if (!url) return null;
  if (error)
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
        {error}
      </div>
    );
  if (!model)
    return (
      <div className="rounded-xl border border-zinc-200 p-8 text-center text-sm text-zinc-500" role="status">
        Preparing the 3D model. The first load of a scan takes a few seconds.
      </div>
    );
  return (
    <ScanViewer
      title={`${scan.label}: ${item.title}`}
      subtitle="Shape only. LiDAR does not capture color."
      model={model}
      threshold={0}
      colorMax={0}
      heat={false}
      link={link}
      markers={[]}
      selectedId={null}
      onSelect={() => {}}
    />
  );
}
