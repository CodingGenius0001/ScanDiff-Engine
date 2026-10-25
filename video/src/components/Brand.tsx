import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, EASE_OUT, FONT, MONO, clamp } from "../theme";

/**
 * The site's mark (web/components/SiteNav.tsx): a solid circle and a dashed one,
 * before and after, plus the orange status dot. `slide` 1 starts the dashed circle
 * apart; it settles onto its place as the animation runs.
 */
export const Mark: React.FC<{
  size: number;
  delay?: number;
  animate?: boolean;
}> = ({ size, delay = 0, animate = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = animate
    ? spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.9 } })
    : 1;
  const dot = animate
    ? spring({
        frame: frame - delay - 14,
        fps,
        config: { damping: 14, stiffness: 180 },
      })
    : 1;
  const dx = interpolate(s, [0, 1], [9, 0]);
  return (
    <svg
      viewBox="0 0 28 28"
      width={size}
      height={size}
      fill="none"
      strokeWidth={1.25}
      style={{ overflow: "visible" }}
    >
      <circle
        cx={12}
        cy={14}
        r={8}
        stroke={C.ink}
        opacity={interpolate(s, [0, 0.4], [0, 1], clamp)}
      />
      <circle
        cx={16 + dx}
        cy={14}
        r={8}
        stroke={C.ink}
        strokeDasharray="2 2"
        opacity={0.6 * interpolate(s, [0, 0.4], [0, 1], clamp)}
      />
      <circle cx={21.6} cy={8.4} r={1.6 * dot} fill={C.stamp} />
    </svg>
  );
};

export const Wordmark: React.FC<{ size: number; delay?: number }> = ({
  size,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const text = "scandiff";
  const n = Math.round(
    interpolate(frame, [delay, delay + 16], [0, text.length], clamp),
  );
  return (
    <span
      style={{
        fontFamily: FONT,
        fontWeight: 300,
        fontSize: size,
        letterSpacing: "-0.035em",
        color: C.ink,
        lineHeight: 1,
      }}
    >
      {text.slice(0, n)}
      <span style={{ opacity: 0 }}>{text.slice(n)}</span>
    </span>
  );
};

/** Big display line that rises in with a slight blur, Linear style. */
export const Rise: React.FC<{
  children: React.ReactNode;
  delay?: number;
  size?: number;
  color?: string;
  weight?: number;
  style?: React.CSSProperties;
  exitAt?: number;
}> = ({
  children,
  delay = 0,
  size = 96,
  color = C.ink,
  weight = 300,
  style,
  exitAt,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + 20], [0, 1], {
    ...clamp,
    easing: EASE_OUT,
  });
  const out =
    exitAt === undefined
      ? 1
      : interpolate(frame, [exitAt, exitAt + 10], [1, 0], clamp);
  return (
    <div
      style={{
        fontFamily: FONT,
        fontWeight: weight,
        fontSize: size,
        letterSpacing: "-0.035em",
        lineHeight: 1.04,
        color,
        opacity: p * out,
        translate: `0 ${(1 - p) * 28}px`,
        filter: `blur(${(1 - p) * 8}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** A word that gets an orange strike drawn through it at `at`. */
export const Strike: React.FC<{ children: React.ReactNode; at: number }> = ({
  children,
  at,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + 12], [0, 1], {
    ...clamp,
    easing: EASE_OUT,
  });
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span style={{ opacity: interpolate(p, [0, 1], [1, 0.45]) }}>
        {children}
      </span>
      <span
        style={{
          position: "absolute",
          left: "-2%",
          top: "54%",
          height: 6,
          width: `${104 * p}%`,
          background: C.stamp,
          borderRadius: 3,
        }}
      />
    </span>
  );
};

/** Small mono chip, like the labels on the site's spec sheets. */
export const Chip: React.FC<{
  children: React.ReactNode;
  delay?: number;
  accent?: boolean;
  size?: number;
}> = ({ children, delay = 0, accent, size = 26 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 18px",
        borderRadius: 8,
        border: `1.5px solid ${accent ? C.stamp : C.rule}`,
        background: accent ? "rgba(255,106,26,0.08)" : C.panel,
        color: accent ? C.stamp : C.ink,
        fontFamily: MONO,
        fontSize: size,
        opacity: s,
        translate: `0 ${(1 - s) * 14}px`,
      }}
    >
      {children}
    </span>
  );
};

/** Real engine stages (engine/scandiff/), lit up as the story reaches them. */
export const STAGES = [
  "clean",
  "align",
  "distance",
  "coverage",
  "regions",
  "classify",
  "verdict",
] as const;
export const PipelineTracker: React.FC<{
  active: (typeof STAGES)[number];
  duration: number;
}> = ({ active, duration }) => {
  const frame = useCurrentFrame();
  const o = interpolate(
    frame,
    [0, 12, duration - 10, duration],
    [0, 1, 1, 0],
    clamp,
  );
  const ai = STAGES.indexOf(active);
  return (
    <div
      style={{
        position: "absolute",
        top: 36,
        right: 120,
        display: "flex",
        alignItems: "center",
        gap: 10,
        opacity: o,
      }}
    >
      {STAGES.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 ? (
            <span
              style={{
                width: 18,
                height: 1.5,
                background: i <= ai ? C.inkSoft : C.rule,
              }}
            />
          ) : null}
          <span
            style={{
              fontFamily: MONO,
              fontSize: 20,
              padding: "6px 12px",
              borderRadius: 6,
              color: i === ai ? "#000" : i < ai ? C.inkSoft : C.inkFaint,
              background: i === ai ? C.stamp : "transparent",
              border: `1px solid ${i === ai ? C.stamp : C.rule}`,
            }}
          >
            {s}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};
