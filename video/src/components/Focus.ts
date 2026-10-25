import { interpolate } from "remotion";
import { EASE_IN_OUT } from "../theme";

/**
 * A camera on a still or a video: which point of the source (0-1 fractions)
 * sits at the center of the viewport, and how far it is magnified.
 * Keyframes are [frame, focus] pairs, eased between.
 */
export type Focus = { x: number; y: number; zoom: number };
export type FocusKeys = [number, Focus][];

export const focusAt = (frame: number, keys: FocusKeys): Focus => {
  if (keys.length === 1) return keys[0][1];
  const frames = keys.map((k) => k[0]);
  const pick = (f: (v: Focus) => number) =>
    interpolate(
      frame,
      frames,
      keys.map((k) => f(k[1])),
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE_IN_OUT,
      },
    );
  return {
    x: pick((v) => v.x),
    y: pick((v) => v.y),
    zoom: pick((v) => v.zoom),
  };
};

/**
 * Size and offset of a source of `srcW x srcH` drawn so that `focus` lands in the
 * middle of a `vw x vh` viewport. At zoom 1 the source covers the viewport.
 * The offset is clamped so the source always fills the viewport.
 */
export const placeSource = (
  srcW: number,
  srcH: number,
  vw: number,
  vh: number,
  f: Focus,
) => {
  const cover = Math.max(vw / srcW, vh / srcH);
  const w = srcW * cover * f.zoom;
  const h = srcH * cover * f.zoom;
  const left = Math.min(0, Math.max(vw - w, vw / 2 - f.x * w));
  const top = Math.min(0, Math.max(vh - h, vh / 2 - f.y * h));
  return { width: w, height: h, left, top };
};

/**
 * Editorial framing: each framing holds still (moving fine UI text shimmers) and
 * the next one arrives as a hard cut on its frame. `drift` adds an optional slow push.
 * `shots` are [startFrame, focus]; `end` is the last frame of the shot.
 */
export const cuts = (
  shots: [number, Focus][],
  end: number,
  drift = 0,
): FocusKeys => {
  const keys: FocusKeys = [];
  shots.forEach(([start, f], i) => {
    const stop = i + 1 < shots.length ? shots[i + 1][0] - 1 : end;
    keys.push([start, f]);
    if (stop > start) keys.push([stop, { ...f, zoom: f.zoom * (1 + drift) }]);
  });
  return keys;
};

/**
 * Camera moves: hold on each framing, then glide to the next one over `dur`
 * frames (eased in and out) starting on its cue. Use this instead of cutting
 * between two framings of the same picture, which reads as a jump cut.
 * `shots` are [cueFrame, focus]; `end` is the last frame of the shot.
 */
export const moves = (
  shots: [number, Focus][],
  end: number,
  dur = 21,
): FocusKeys => {
  const keys: FocusKeys = [[shots[0][0], shots[0][1]]];
  for (let i = 1; i < shots.length; i++) {
    const [at, f] = shots[i];
    const prev = shots[i - 1][1];
    const last = keys[keys.length - 1][0];
    const start = Math.max(at, last + 1);
    keys.push([start, prev], [start + dur, f]);
  }
  const lastAt = keys[keys.length - 1][0];
  if (end > lastAt) keys.push([end, keys[keys.length - 1][1]]);
  return keys;
};
