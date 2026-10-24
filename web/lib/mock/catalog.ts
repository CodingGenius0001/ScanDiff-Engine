/**
 * Mock items and scans. MOCK ONLY: later these come from the backend.
 * Timestamps are fixed so the demo looks the same on every run.
 */
import type { Item, ScanMeta } from "../types";

export const MOCK_SCANS: Record<string, ScanMeta> = {
  "mug-before": {
    id: "mug-before",
    name: "Seller scan before packing",
    capturedAt: "2026-10-20T15:42:00Z",
    capturedBy: "Seller",
    modelUrl: "mock://mug-before",
    format: "mock",
    sha256: null,
  },
  "mug-arrival": {
    id: "mug-arrival",
    name: "Buyer scan on arrival",
    capturedAt: "2026-10-23T18:05:00Z",
    capturedBy: "Buyer",
    modelUrl: "mock://mug-arrival",
    format: "mock",
    sha256: null,
  },
  "car-pickup": {
    id: "car-pickup",
    name: "Pickup scan at rental desk",
    capturedAt: "2026-10-18T09:10:00Z",
    capturedBy: "Rental desk",
    modelUrl: "mock://car-pickup",
    format: "mock",
    sha256: null,
  },
  "car-return": {
    id: "car-return",
    name: "Return scan at rental desk",
    capturedAt: "2026-10-22T17:30:00Z",
    capturedBy: "Rental desk",
    modelUrl: "mock://car-return",
    format: "mock",
    sha256: null,
  },
};

export const MOCK_ITEMS: Item[] = [
  {
    id: "mug-001",
    kind: "shipping",
    title: "Handmade ceramic mug",
    priceCents: 4800,
    versions: [
      { scanId: "mug-before", label: "Packed by seller", capturedAt: MOCK_SCANS["mug-before"].capturedAt },
      { scanId: "mug-arrival", label: "Arrived at buyer", capturedAt: MOCK_SCANS["mug-arrival"].capturedAt },
    ],
  },
  {
    id: "car-001",
    kind: "rental",
    title: "Rental car, compact hatchback",
    versions: [
      { scanId: "car-pickup", label: "Pickup", capturedAt: MOCK_SCANS["car-pickup"].capturedAt },
      { scanId: "car-return", label: "Return", capturedAt: MOCK_SCANS["car-return"].capturedAt },
    ],
  },
];
