/**
 * The ONE place the web app gets diff results from.
 *
 * Now: returns mock data generated in the browser.
 * Later: call the real diff API and map its response onto `DiffResult`.
 * Components only ever see `DiffResult`, so only this file changes.
 */
import type { DiffResult } from "./types";

// TODO(backend): set to the real API base URL once the endpoint exists.
const API_BASE: string | null = null;

const cache = new Map<string, Promise<DiffResult>>();

export function getDiff(baseId: string, newId: string): Promise<DiffResult> {
  const key = `${baseId}|${newId}`;
  let p = cache.get(key);
  if (!p) {
    p = API_BASE ? fetchDiff(API_BASE, baseId, newId) : mockDiff(baseId, newId);
    // A failed request should be retryable, not cached forever.
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

async function mockDiff(baseId: string, newId: string): Promise<DiffResult> {
  // Loaded lazily so the mock (and three.js) stay out of pages that do not need them.
  const { buildMockDiff } = await import("./mock/scenarios");
  return buildMockDiff(baseId, newId);
}

async function fetchDiff(base: string, baseId: string, newId: string): Promise<DiffResult> {
  // TODO(backend): confirm the route, query names and response shape.
  const res = await fetch(`${base}/diff?base=${encodeURIComponent(baseId)}&new=${encodeURIComponent(newId)}`);
  if (!res.ok) throw new Error(`Diff request failed (${res.status})`);
  const raw: unknown = await res.json();
  return toDiffResult(raw);
}

/** TODO(backend): map the real response onto DiffResult here. */
function toDiffResult(raw: unknown): DiffResult {
  return raw as DiffResult;
}
