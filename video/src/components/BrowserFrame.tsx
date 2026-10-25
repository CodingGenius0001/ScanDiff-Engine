import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, EASE_IN_OUT, FONT } from "../theme";
import { focusAt, FocusKeys, placeSource } from "./Focus";

// Website captures: 1440 x 900 at 2x.
const WEB_W = 2880;
const WEB_H = 1800;
const BAR = 52;

type Props = {
  src: string;
  url: string;
  width: number;
  height: number;
  focus?: FocusKeys;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/** Three dots and the URL: the whole browser chrome. */
const Bar: React.FC<{ url: string }> = ({ url }) => (
  <div
    style={{
      height: BAR,
      display: "flex",
      alignItems: "center",
      padding: "0 20px",
      gap: 9,
      background: "#151515",
      borderBottom: `1px solid ${C.rule}`,
    }}
  >
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          width: 13,
          height: 13,
          borderRadius: 99,
          background: "#3a3a39",
        }}
      />
    ))}
    <div
      style={{
        margin: "0 auto",
        translate: "-30px 0",
        minWidth: 420,
        height: 32,
        borderRadius: 8,
        background: "#0d0d0d",
        border: `1px solid ${C.rule}`,
        color: C.inkSoft,
        fontFamily: FONT,
        fontSize: 17,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 18px",
        letterSpacing: 0.2,
      }}
    >
      <span style={{ color: C.inkFaint }}>scandiff.us</span>
      <span style={{ color: C.ink }}>{url}</span>
    </div>
  </div>
);

/** A minimal dark browser window: three dots and the URL, nothing else. */
export const BrowserFrame: React.FC<Props> = ({
  src,
  url,
  width,
  height,
  focus,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const f = focusAt(frame, focus ?? [[0, { x: 0.5, y: 0.5, zoom: 1 }]]);
  const vh = height - BAR;
  const p = placeSource(WEB_W, WEB_H, width, vh, f);
  return (
    <div
      style={{
        position: "absolute",
        width,
        height,
        borderRadius: 14,
        overflow: "hidden",
        background: C.panel,
        boxShadow: `0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px ${C.rule}`,
        ...style,
      }}
    >
      <Bar url={url} />
      <div
        style={{
          position: "relative",
          width,
          height: vh,
          overflow: "hidden",
          background: C.paper,
        }}
      >
        <Img src={staticFile(src)} style={{ position: "absolute", ...p }} />
        {children}
      </div>
    </div>
  );
};

/** Where a point of the capture (in its 2880 x 1800 px) lands inside the viewport. */
export const webPoint = (
  px: number,
  py: number,
  width: number,
  height: number,
  frame: number,
  focus: FocusKeys,
) => {
  const f = focusAt(frame, focus);
  const p = placeSource(WEB_W, WEB_H, width, height - BAR, f);
  return {
    x: p.left + (px / WEB_W) * p.width,
    y: BAR + p.top + (py / WEB_H) * p.height,
  };
};

export type WebPage = {
  at: number;
  src: string;
  url: string;
  focus?: FocusKeys;
  enter?: "fade" | "scroll";
};
const PAGE_FADE = 10;
const PAGE_SCROLL = 22;

/**
 * One browser window, several page states (e.g. card form -> payment held).
 * The window stays put and only the page cross-fades, the way a page updates in
 * place; each page's focus counts frames from its own `at`.
 */
export const BrowserPages: React.FC<{
  pages: WebPage[];
  width: number;
  height: number;
  style?: React.CSSProperties;
}> = ({ pages, width, height, style }) => {
  const frame = useCurrentFrame();
  const vh = height - BAR;
  const current =
    [...pages].reverse().find((p) => frame >= p.at + PAGE_FADE / 2) ?? pages[0];
  return (
    <div
      style={{
        position: "absolute",
        width,
        height,
        borderRadius: 14,
        overflow: "hidden",
        background: C.panel,
        boxShadow: `0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px ${C.rule}`,
        ...style,
      }}
    >
      <Bar url={current.url} />
      <div
        style={{
          position: "relative",
          width,
          height: vh,
          overflow: "hidden",
          background: C.paper,
        }}
      >
        {pages.map((pg, i) => {
          const nxt = pages[i + 1];
          const len = pg.enter === "scroll" ? PAGE_SCROLL : PAGE_FADE;
          const nextLen = nxt?.enter === "scroll" ? PAGE_SCROLL : PAGE_FADE;
          if (frame < pg.at || (nxt && frame >= nxt.at + nextLen)) return null;
          const ease = {
            extrapolateLeft: "clamp" as const,
            extrapolateRight: "clamp" as const,
            easing: EASE_IN_OUT,
          };
          const inP =
            i === 0
              ? 1
              : interpolate(frame, [pg.at, pg.at + len], [0, 1], ease);
          // A scroll moves the outgoing section up as the next one rises in from below.
          const outP =
            nxt?.enter === "scroll"
              ? interpolate(frame, [nxt.at, nxt.at + nextLen], [0, 1], ease)
              : 0;
          const dy = pg.enter === "scroll" ? (1 - inP) * vh * 0.6 : 0;
          const p = placeSource(
            WEB_W,
            WEB_H,
            width,
            vh,
            focusAt(
              frame - pg.at,
              pg.focus ?? [[0, { x: 0.5, y: 0.5, zoom: 1 }]],
            ),
          );
          return (
            <Img
              key={pg.at}
              src={staticFile(pg.src)}
              style={{
                position: "absolute",
                ...p,
                top: p.top + dy - outP * vh * 0.6,
                opacity: pg.enter === "scroll" ? 1 : inP,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
