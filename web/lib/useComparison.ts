"use client";

import { useEffect, useState } from "react";
import { getDiff } from "./diffClient";
import { loadModel, type LoadedModel } from "./modelLoader";
import type { DiffResult, Item } from "./types";

export interface Comparison {
  diff: DiffResult;
  baseModel: LoadedModel;
  newModel: LoadedModel;
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
        const [baseModel, newModel] = withModels
          ? await Promise.all([
              loadModel(diff.baseScan.modelUrl, diff.baseScan.format, diff.upAxis),
              loadModel(diff.newScan.modelUrl, diff.newScan.format, diff.upAxis),
            ])
          : [null, null];
        if (!cancelled) {
          setState({ status: "ready", data: { diff, baseModel: baseModel!, newModel: newModel! } });
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
