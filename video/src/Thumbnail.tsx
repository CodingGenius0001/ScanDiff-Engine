import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Mark } from "./components/Brand";
import { C, FONT } from "./theme";

/** 1280 x 720 cover: the real comparison heat map, the mark and the tagline. */
export const Thumbnail: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 70% 70% at 72% 40%, #262626 0%, #121212 55%, ${C.paper} 100%)`,
      }}
    />
    <div
      style={{
        position: "absolute",
        right: -40,
        top: 40,
        width: 720,
        height: 640,
        overflow: "hidden",
        borderRadius: 20,
      }}
    >
      <Img
        src={staticFile("web/05-comparison-heat-map.png")}
        style={{
          position: "absolute",
          width: 2880 * 0.62,
          left: -1500 * 0.62 + 170,
          top: -40 * 0.62,
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(90deg, ${C.paper} 0%, rgba(11,11,11,0) 40%)`,
        }}
      />
    </div>
    <div style={{ position: "absolute", left: 80, top: 120, width: 640 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <Mark size={72} animate={false} />
        <span
          style={{
            fontFamily: FONT,
            fontWeight: 300,
            fontSize: 64,
            letterSpacing: "-0.035em",
            color: C.ink,
          }}
        >
          scandiff
        </span>
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 300,
          fontSize: 92,
          lineHeight: 1.02,
          letterSpacing: "-0.035em",
          color: C.ink,
          marginTop: 70,
        }}
      >
        Measured,
        <br />
        <span style={{ color: C.stamp }}>not argued.</span>
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 30,
          color: C.inkSoft,
          marginTop: 34,
          lineHeight: 1.3,
        }}
      >
        Proof of condition, at every handoff.
      </div>
    </div>
  </AbsoluteFill>
);
