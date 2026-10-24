"use client";

import { useEffect, useState } from "react";
import { getDiff } from "./diffClient";
import { loadModel, type LoadedModel } from "./modelLoader";
import type { DiffResult, Item } from "./types";

export interface Comparison {
  diff: DiffResult;
  baseModel: LoadedModel;
  newModel: LoadedModel;
  /** The engine's baked heat map, when the diff has one. */
  heatModel: LoadedModel | null;
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Comparison };

/** Loads the diff and both models for an item's first and last scans. */
export function useComparison(item: Item, withModels = true): State & { retry: () => void } {
  const baseId = item.versions[0].scanId;
  const newId = item.versions[item.versions.length - 1].scanId;
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const diff = await getDiff(baseId, newId);
        const scale = diff.modelScale ?? 1;
        const [baseModel, newModel, heatModel] = withModels
          ? await Promise.all([
              loadModel(diff.baseScan.modelUrl, diff.baseScan.format, diff.upAxis, scale),
              loadModel(diff.newScan.modelUrl, diff.newScan.format, diff.upAxis, scale),
              diff.heatmap ? loadModel(diff.heatmap.modelUrl, diff.heatmap.format, diff.upAxis, scale) : null,
            ])
          : [null, null, null];
        if (!cancelled) {
          setState({ status: "ready", data: { diff, baseModel: baseModel!, newModel: newModel!, heatModel } });
        }
      } catch (e) {
        if (!cancelled) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseId, newId, withModels, attempt]);

  return {
    ...state,
    retry: () => {
      setState({ status: "loading" });
      setAttempt((a) => a + 1);
    },
  };
}
