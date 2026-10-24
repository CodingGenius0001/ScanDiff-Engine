"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { CameraLink, viewFrom } from "@/lib/cameraSync";
import { M_TO_MM, scanModelUrl } from "@/lib/diffClient";
import { loadModel, type LoadedModel } from "@/lib/modelLoader";
import { toDisplay } from "@/lib/format";
import { COLORS, RAMP_CSS } from "@/lib/heatmap";
import type { BakedHeatmap, Item, LengthUnit } from "@/lib/types";
import { useLiveScans } from "@/lib/liveScans";
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
  const live = useLiveScans(item);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-12 pt-6 sm:pt-10">
      <header className="flex flex-col gap-2">
        <span className="label">
          {item.kind === "rental" ? "Rental · pickup vs return" : "Shipping · handoff comparison"}
        </span>
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{item.title}</h1>
        {item.source === "supabase" && (
          <p className="flex items-center gap-2 font-mono text-xs text-zinc-400" role="status">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${live.updating ? "bg-amber-400" : "bg-emerald-400"}`}
              />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${live.updating ? "bg-amber-400" : "bg-emerald-400"}`} />
            </span>
            {live.updating ? "New scan received. Updating…" : "Live: this page updates when a new scan is uploaded."}
          </p>
        )}
      </header>
      <section className="panel">
        <h2 className="label mb-3">Version timeline</h2>
        <Timeline
          versions={item.versions}
          baseId={item.versions[0].scanId}
          newId={item.versions[item.versions.length - 1].scanId}
        />
      </section>
      {state.status === "loading" && (
        <div className="panel scanning stage flex h-72 items-center justify-center" role="status">
          <span className="label text-zinc-300">Computing comparison…</span>
        </div>
      )}
      {state.status === "error" && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
          Could not load the comparison: {state.message}{" "}
          <button type="button" onClick={state.retry} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}
      {state.status === "waiting" && (
        <>
          <div className="panel flex items-center gap-3 text-sm text-zinc-300" role="status">
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent shadow-[0_0_10px_var(--color-accent)]" />
            Baseline scan received. Waiting for a check scan to compare it with.
          </div>
          <BaselinePreview item={item} />
        </>
      )}
      {state.status === "ready" && <ComparisonView data={state.data} />}
      {item.source === "supabase" ? <ScanDecisionPanel item={item} decision={live.decision} onDecided={live.decided} /> : <DecisionPanel item={item} />}
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
        kind: r.kind === "missing" ? ("missing" as const) : ("change" as const),
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
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm font-medium transition-colors hover:border-white/25 has-[:checked]:border-accent/50 has-[:checked]:bg-accent/10 has-[:checked]:text-violet-100">
            <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} className="h-4 w-4 accent-violet-500" />
            Heat map
          </label>
          <button
            type="button"
            onClick={() => {
              const h = home();
              setSelectedId(null);
              link.flyTo(h.position, h.target);
            }}
            className="min-h-11 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm font-medium transition-colors hover:border-white/25"
          >
            Reset view
          </button>
          <span className="font-mono text-[11px] text-zinc-500">Drag to rotate · views are linked</span>
        </div>
        {heat &&
          (diff.heatmap ? (
            <SignedLegend heatmap={diff.heatmap} units={diff.units} />
          ) : (
            <Legend threshold={diff.noiseThreshold} max={colorMax} units={diff.units} />
          ))}
        {heatModel ? (
          // Engine result: the heat map is baked onto the new scan's surface, aligned to the baseline.
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ScanViewer
              title={`Baseline: ${diff.baseScan.name}`}
              subtitle="Baseline scan."
              model={baseModel}
              {...common}
            />
            <ScanViewer
              title={`New: ${diff.newScan.name}`}
              subtitle={
                heat
                  ? "Heat map on the new scan. Removed parts show only in the flagged regions."
                  : "Aligned into the baseline frame by the engine."
              }
              model={heat ? heatModel : newModel}
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
          <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-violet-50 shadow-[0_0_30px_-10px_var(--color-accent)]" role="status">
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
        <section className="panel">
          <h2 className="label mb-3">Flagged regions</h2>
          <RegionList diff={diff} selectedId={selectedId} onSelect={select} />
        </section>
        <section className="panel">
          <h2 className="label">
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] text-zinc-400">
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] text-zinc-400">
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
      <span className="flex items-center gap-1.5">
        <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-rose-400 text-[9px] font-bold text-rose-300">
          ×
        </span>
        Missing part (no surface on the new scan)
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
