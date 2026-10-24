"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_TIME_ZONE, formatDate } from "@/lib/format";

const subscribe = () => () => {};

function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/**
 * The viewer's time zone. The server render and hydration use DEFAULT_TIME_ZONE so the
 * markup matches, then React switches to the browser's zone.
 */
export function useTimeZone(): string {
  return useSyncExternalStore(subscribe, viewerTimeZone, () => DEFAULT_TIME_ZONE);
}

/** A timestamp in the viewer's time zone, with the zone named (for example "PDT"). */
export default function LocalTime({ iso }: { iso: string }) {
  const timeZone = useTimeZone();
  return <time dateTime={iso}>{formatDate(iso, timeZone)}</time>;
}
