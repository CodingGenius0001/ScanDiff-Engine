"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { CameraLink, viewFrom } from "@/lib/cameraSync";
import { M_TO_MM, scanModelUrl } from "@/lib/diffClient";
import { loadModel, type LoadedModel } from "@/lib/modelLoader";
import { toDisplay } from "@/lib/format";
import LocalTime from "./LocalTime";
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-16 pt-8 sm:pt-12">
      <header className="flex flex-col gap-3 border-b border-ink pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-ink-soft">
          <span>{item.kind === "rental" ? "Rental car · pickup and return" : "Shipping · condition at handoff"}</span>
          <span className="font-mono text-xs">Case {item.id}</span>
        </div>
        <h1 className="display text-5xl sm:text-6xl">{item.title}</h1>
        {item.source === "supabase" && (
          <p className="flex items-center gap-2 text-sm text-ink-soft" role="status">
            <span className={`h-1.5 w-1.5 rounded-full ${live.updating ? "animate-pulse bg-stamp" : "bg-ink"}`} />
            {live.updating ? "New scan received. Updating…" : "Live: this page updates when a new scan is uploaded."}
          </p>
        )}
        <Timeline
          versions={item.versions}
          baseId={item.versions[0].scanId}
          newId={item.versions[item.versions.length - 1].scanId}
        />
      </header>
      {state.status === "loading" && (
        <div className="flex flex-col gap-3 py-16" role="status">
          <p className="display text-center text-2xl italic text-ink-soft">Computing comparison…</p>
          <div className="progress mx-auto w-48" />
        </div>
      )}
      {state.status === "error" && (
        <div className="border border-stamp p-4 text-sm text-stamp" role="alert">
          Could not load the comparison: {state.message}{" "}
          <button type="button" onClick={state.retry} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}
      {state.status === "waiting" && (
        <>
          <p className="display text-2xl italic text-ink-soft" role="status">
            Baseline scan received. Waiting for a check scan to compare it with.
          </p>
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
          <label className="flex min-h-11 cursor-pointer items-center gap-2 border border-ink px-3 text-sm has-[:checked]:bg-ink has-[:checked]:text-paper">
            <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} className="h-4 w-4 accent-black" />
            Heat map
          </label>
          <button
            type="button"
            onClick={() => {
              const h = home();
              setSelectedId(null);
              link.flyTo(h.position, h.target);
            }}
            className="min-h-11 border border-ink px-3 text-sm hover:bg-paper-deep"
          >
            Reset view
          </button>
          <span className="caption">Drag to rotate. Both exhibits move together.</span>
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
              exhibit="A"
              title={diff.baseScan.name}
              subtitle={<>Fig. 1. Baseline scan, <LocalTime iso={diff.baseScan.capturedAt} />.</>}
              model={baseModel}
              {...common}
            />
            <ScanViewer
              exhibit="B"
              title={diff.newScan.name}
              subtitle={
                heat ? (
                  <>
                    Fig. 2. Heat map on the new scan, <LocalTime iso={diff.newScan.capturedAt} />. Removed parts appear
                    only in the findings.
                  </>
                ) : (
                  <>
                    Fig. 2. New scan aligned to the baseline, <LocalTime iso={diff.newScan.capturedAt} />.
                  </>
                )
              }
              model={heat ? heatModel : newModel}
              {...common}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ScanViewer
              exhibit="A"
              title={diff.baseScan.name}
              subtitle="Fig. 1. Red marks material that is missing from the new scan."
              model={baseModel}
              distances={diff.baseToNew}
              {...common}
            />
            <ScanViewer
              exhibit="B"
              title={diff.newScan.name}
              subtitle="Fig. 2. Red marks where the surface moved compared with the baseline."
              model={newModel}
              distances={diff.newToBase}
              {...common}
            />
          </div>
        )}
        {selected && (
          <div className="border-l-2 border-ink bg-paper-deep px-4 py-2.5 text-sm" role="status">
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
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section>
          <h2 className="display mb-3 border-b border-ink pb-2 text-3xl">Findings</h2>
          <RegionList diff={diff} selectedId={selectedId} onSelect={select} />
        </section>
        <section>
          <h2 className="display border-b border-ink pb-2 text-3xl">
            {diff.heatmap ? "Change from the baseline surface" : "Distance per vertex, both scans"}
          </h2>
          <p className="caption mb-2 mt-2">Areas with no data are left out.</p>
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-5" style={{ background: COLORS.noChange }} />
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
        <span className="h-3 w-5" style={{ background: COLORS.noData }} />
        No data
      </span>
    </div>
  );
}

/** Legend for the engine's baked signed scale (colors match the engine's GLB). */
function SignedLegend({ heatmap, units }: { heatmap: BakedHeatmap; units: LengthUnit }) {
  const swatch = (background: string) => <span className="h-3 w-5" style={{ background }} />;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
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
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-ink text-[9px] font-bold">
          –
        </span>
        No data (dashed marker), not counted as damage
      </span>
      <span className="flex items-center gap-1.5">
        <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-stamp text-[9px] font-bold text-stamp">
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
      <div className="border border-stamp p-4 text-sm text-stamp" role="alert">
        {error}
      </div>
    );
  if (!model)
    return (
      <div className="flex flex-col gap-3 py-16" role="status">
        <p className="display text-center text-xl italic text-ink-soft">Preparing the 3D model. The first load takes a few seconds.</p>
        <div className="progress mx-auto w-48" />
      </div>
    );
  return (
    <ScanViewer
      exhibit="A"
      title={`${scan.label}, ${item.title}`}
      subtitle={
        <>
          Fig. 1. Baseline scan, <LocalTime iso={scan.capturedAt} />. Shape only; LiDAR does not capture color.
        </>
      }
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
