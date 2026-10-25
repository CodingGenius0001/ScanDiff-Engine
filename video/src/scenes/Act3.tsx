import React from "react";
import { AbsoluteFill, interpolate, Sequence } from "remotion";
import { Chip, PipelineTracker } from "../components/Brand";
import { BrowserFrame, webPoint } from "../components/BrowserFrame";
import { DeviceFrame } from "../components/DeviceFrame";
import { FocusKeys, moves } from "../components/Focus";
import {
  AlignGraphic,
  ClassifyGraphic,
  Histogram,
} from "../components/Graphics";
import { Highlight, LowerThird } from "../components/Overlays";
import { C, EASE_IN_OUT, MONO, clamp } from "../theme";
import { PHONE, SideLabel, WEB } from "./Act2";
import { BRoll, Plate, Shot, useScene } from "./kit";

/** L10: the buyer scans the item again on arrival. */
export const BuyerScan: React.FC<{ base: number; end: number }> = ({
  base,
  end,
}) => {
  const { w } = useScene(base);
  const len = end - base;
  const cut = w("L10", "scans") - 4;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Shot name="Point at the object" from={0} to={cut + 4} fadeIn={6}>
        <Plate />
        <DeviceFrame
          {...PHONE}
          kind="image"
          src="app/05-find-the-object.png"
          focus={moves([[0, { x: 0.5, y: 0.5, zoom: 1 }]], cut)}
        />
        <SideLabel kicker="On arrival" title="Buyer check-in scan" delay={4} />
      </Shot>
      <Shot name="Check scan" from={cut} to={len} fadeIn={6}>
        <BRoll
          src="clips/cam6525_scan.mp4"
          srcW={1080}
          srcH={1920}
          trimBefore={4}
          focus={[
            [0, { x: 0.5, y: 0.5, zoom: 1.0 }],
            [len - cut, { x: 0.5, y: 0.5, zoom: 1.08 }],
          ]}
        />
      </Shot>
      <LowerThird n="04" label="Buyer check-in" duration={len} />
    </AbsoluteFill>
  );
};

/** L11: align both models, globally, then ICP. */
export const Align: React.FC<{ base: number; end: number }> = ({
  base,
  end,
}) => {
  const { frame, w } = useScene(base);
  const len = end - base;
  const icpAt = w("L11", "icp");
  const t = interpolate(
    frame,
    [0, icpAt - 12, icpAt + 10, len - 6],
    [0, 0.42, 0.5, 1],
    { ...clamp, easing: EASE_IN_OUT },
  );
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Plate />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          paddingBottom: 90,
        }}
      >
        <AlignGraphic t={t} size={720} rmseLabel={frame > len - 40} />
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 170,
          top: 420,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: "flex-start",
        }}
      >
        <Chip delay={0}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 99,
              background: C.unchanged,
            }}
          />{" "}
          baseline scan
        </Chip>
        <Chip delay={6} accent>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 99,
              background: C.stamp,
            }}
          />{" "}
          check-in scan
        </Chip>
      </div>
      <div
        style={{
          position: "absolute",
          right: 170,
          top: 420,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: "flex-end",
        }}
      >
        <Chip delay={w("L11", "globally") - 4} accent={frame < icpAt}>
          1 · global · FPFH + RANSAC
        </Chip>
        <Chip delay={icpAt - 4} accent={frame >= icpAt}>
          2 · ICP refine
        </Chip>
      </div>
      <PipelineTracker active="align" duration={len} />
      <LowerThird n="05" label="Align" duration={len} />
    </AbsoluteFill>
  );
};

/** L12: point-to-surface distance, measured against the scan's own noise. */
export const Measure: React.FC<{ base: number; end: number }> = ({
  base,
  end,
}) => {
  const { frame, c } = useScene(base);
  const len = end - base;
  const hist = c("L12", 2) - 4;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Plate />
      <Shot name="Heat map on the phone" from={0} to={hist + 4} fadeIn={6}>
        <DeviceFrame {...PHONE} kind="image" src="app/14-heat-map-3d.png" />
        <SideLabel kicker="Every point, both scans" title="Down to a few mm">
          <div style={{ display: "flex", gap: 16, marginTop: 40 }}>
            <Chip delay={c("L12", 1) - 6}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 99,
                  background: C.dent,
                }}
              />{" "}
              dent
            </Chip>
            <Chip delay={c("L12", 1) - 3}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 99,
                  background: C.unchanged,
                }}
              />{" "}
              unchanged
            </Chip>
            <Chip delay={c("L12", 1)}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 99,
                  background: C.added,
                }}
              />{" "}
              added
            </Chip>
          </div>
        </SideLabel>
      </Shot>
      <Shot name="Noise floor and threshold" from={hist} to={len}>
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            paddingBottom: 110,
            paddingTop: 60,
          }}
        >
          <Histogram
            w={1360}
            h={600}
            grow={interpolate(frame, [hist, hist + 30], [0, 1], clamp)}
            showNoise={interpolate(
              frame,
              [c("L12", 3), c("L12", 3) + 12],
              [0, 1],
              clamp,
            )}
            showThreshold={interpolate(
              frame,
              [c("L12", 4), c("L12", 4) + 12],
              [0, 1],
              clamp,
            )}
          />
          <div
            style={{
              fontFamily: MONO,
              fontSize: 22,
              color: C.inkFaint,
              marginTop: 18,
            }}
          >
            distance per point, from a real engine run
            (contract/diff_response.json)
          </div>
        </AbsoluteFill>
      </Shot>
      <PipelineTracker active="distance" duration={len} />
      <LowerThird n="06" label="Measure" duration={len} />
    </AbsoluteFill>
  );
};

/** L13: changes grouped into regions; Claude labels each region from photo crops. */
export const Classify: React.FC<{ base: number; end: number }> = ({
  base,
  end,
}) => {
  const { frame, c, w } = useScene(base);
  const len = end - base;
  const claude = c("L13", 1) - 4;
  const focus: FocusKeys = moves(
    [
      [0, { x: 0.5, y: 0.25, zoom: 1.0 }],
      [30, { x: 0.64, y: 0.22, zoom: 1.45 }],
    ],
    claude + 4,
  );
  const markers = [
    [1803, 402],
    [2259, 366],
    [1779, 477],
  ].map(([x, y]) => webPoint(x, y, WEB.width, WEB.height, frame, focus));
  const settle = interpolate(
    frame,
    [w("L13", "wear") + 10, w("L13", "wear") + 22],
    [0, 1],
    clamp,
  );
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Plate />
      <Shot name="Regions" from={0} to={claude + 4} fadeIn={6}>
        <BrowserFrame
          src="web/05-comparison-heat-map.png"
          url="/item/mug-001"
          width={WEB.width}
          height={WEB.height}
          style={{ left: WEB.left, top: WEB.top }}
          focus={focus}
        >
          {markers.map((m, i) => (
            <Sequence key={i} from={30 + i * 7} layout="none">
              <Highlight
                x={m.x - 24}
                y={m.y - 24 - 52}
                w={48}
                h={48}
                radius={24}
                duration={claude - 30}
              />
            </Sequence>
          ))}
        </BrowserFrame>
      </Shot>
      <Shot name="Claude labels each region" from={claude} to={len}>
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            paddingBottom: 110,
          }}
        >
          <ClassifyGraphic
            t={interpolate(frame, [claude, len - 20], [0, 1], clamp)}
            settle={settle}
          />
        </AbsoluteFill>
      </Shot>
      <PipelineTracker
        active={frame < claude ? "regions" : "classify"}
        duration={len}
      />
      <LowerThird
        n="07"
        label={frame < claude ? "Group into regions" : "Classify"}
        duration={len}
      />
    </AbsoluteFill>
  );
};

/** L14: surface only one scan saw is "no data", never damage. */
export const NoData: React.FC<{ base: number; end: number }> = ({
  base,
  end,
}) => {
  const { frame, c } = useScene(base);
  const len = end - base;
  const phone = c("L14", 1) + 8;
  const focus: FocusKeys = moves(
    [
      [0, { x: 0.4, y: 0.72, zoom: 1.15 }],
      [20, { x: 0.28, y: 0.9, zoom: 1.7 }],
    ],
    phone + 4,
  );
  const a = webPoint(330, 1590, WEB.width, WEB.height, frame, focus);
  const b = webPoint(1420, 1770, WEB.width, WEB.height, frame, focus);
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Plate />
      <Shot name="No data finding" from={0} to={phone + 4} fadeIn={6}>
        <BrowserFrame
          src="web/05-comparison-heat-map.png"
          url="/item/mug-001"
          width={WEB.width}
          height={WEB.height}
          style={{ left: WEB.left, top: WEB.top }}
          focus={focus}
        >
          <Sequence from={20} layout="none">
            <Highlight
              x={a.x}
              y={a.y - 52}
              w={b.x - a.x}
              h={b.y - a.y}
              duration={phone - 20}
            />
          </Sequence>
        </BrowserFrame>
      </Shot>
      <Shot name="Covered by both scans" from={phone} to={len}>
        <DeviceFrame
          {...PHONE}
          kind="image"
          src="app/17-needs-review-stats.png"
          focus={moves(
            [
              [0, { x: 0.5, y: 0.3, zoom: 1.0 }],
              [20, { x: 0.5, y: 0.22, zoom: 1.12 }],
            ],
            len - phone,
          )}
          rings={[
            {
              at: 20,
              dur: len - phone - 20,
              x: 0.03,
              y: 0.191,
              w: 0.94,
              h: 0.022,
            },
          ]}
        />
        <SideLabel
          kicker="Compared only where both scans saw"
          title="The rest is “no data”"
        />
      </Shot>
      <PipelineTracker active="coverage" duration={len} />
      <LowerThird n="08" label="Coverage" duration={len} />
    </AbsoluteFill>
  );
};
