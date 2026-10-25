import React from "react";
import { AbsoluteFill, interpolate, Sequence } from "remotion";
import { Chip, Rise } from "../components/Brand";
import { BrowserPages, webPoint } from "../components/BrowserFrame";
import { DeviceFrame } from "../components/DeviceFrame";
import { FocusKeys, moves } from "../components/Focus";
import { DemoBadge, Highlight, LowerThird } from "../components/Overlays";
import { C, EASE_IN_OUT, EASE_OUT, clamp } from "../theme";
import { PHONE, SideLabel, WEB } from "./Act2";
import { BRoll, Plate, Shot, useScene } from "./kit";

// app/16-findings-accepted.png: the buyer's decision block near the bottom.
const DECISION: FocusKeys = moves(
  [
    [0, { x: 0.5, y: 0.55, zoom: 1 }],
    [22, { x: 0.5, y: 0.72, zoom: 1.12 }],
  ],
  600,
);
// "Accepted: payment released (demo)" and the Accept/Dispute buttons.
const DECISION_RING = { x: 0.03, y: 0.755, w: 0.94, h: 0.11 };

/** L15: "So, what happens next? The buyer reviews the result and accepts the item." */
export const Accept: React.FC<{ base: number; end: number }> = ({
  base,
  end,
}) => {
  const { c, w } = useScene(base);
  const len = end - base;
  const phone = c("L15", 1) - 4;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Plate />
      <Shot name="Next" from={0} to={phone + 4} fadeIn={6}>
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            paddingBottom: 110,
          }}
        >
          <Rise size={140}>What happens next?</Rise>
        </AbsoluteFill>
      </Shot>
      <Shot name="Accept on the phone" from={phone} to={len}>
        <DeviceFrame
          {...PHONE}
          kind="image"
          src="app/16-findings-accepted.png"
          focus={DECISION}
          taps={[{ at: w("L15", "accepts") - phone, x: 0.31, y: 0.84 }]}
          rings={[{ at: 22, dur: len - phone - 22, ...DECISION_RING }]}
        />
        <SideLabel kicker="The buyer decides" title="Accept" delay={4} />
        <DemoBadge duration={len - phone} />
        <LowerThird n="09" label="Accept or dispute" duration={len - phone} />
      </Shot>
    </AbsoluteFill>
  );
};

/** L16: Supabase Realtime carries the decision to the checkout, and the hold is released. */
export const Release: React.FC<{ base: number; end: number }> = ({
  base,
  end,
}) => {
  const { frame, w } = useScene(base);
  const len = end - base;
  const pulse = w("L16", "immediately");
  const released = w("L16", "released") - 4;
  const p = interpolate(frame, [pulse - 4, pulse + 14], [0, 1], {
    ...clamp,
    easing: EASE_OUT,
  });
  const W = 1080;
  const H = 680;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Plate />
      <DeviceFrame
        height={interpolate(frame, [0, 20], [810, 760], {
          ...clamp,
          easing: EASE_IN_OUT,
        })}
        style={{
          left: interpolate(frame, [0, 20], [1250, 150], {
            ...clamp,
            easing: EASE_IN_OUT,
          }),
          top: interpolate(frame, [0, 20], [96, 120], {
            ...clamp,
            easing: EASE_IN_OUT,
          }),
        }}
        kind="image"
        src="app/16-findings-accepted.png"
        focus={[[0, { x: 0.5, y: 0.72, zoom: 1.12 }]]}
        rings={[{ at: 0, dur: len, ...DECISION_RING }]}
      />
      {/* the realtime hop, phone -> checkout */}
      <div
        style={{
          position: "absolute",
          left: 530,
          top: 498,
          width: 210,
          height: 2,
          background: C.rule,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${p * 100}%`,
            top: -6,
            width: 14,
            height: 14,
            borderRadius: 99,
            background: C.stamp,
            boxShadow: `0 0 18px ${C.stamp}`,
            opacity: p > 0 && p < 1 ? 1 : 0,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 530,
          top: 430,
          width: 210,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Chip delay={Math.max(22, w("L16", "supabase") - 4)} size={22}>
          Supabase Realtime
        </Chip>
      </div>
      <Shot
        name="Checkout: held, then released in place"
        from={0}
        to={len}
        fadeIn={0}
        fadeOut={0}
      >
        <BrowserPages
          width={W}
          height={H}
          style={{
            left: interpolate(frame, [4, 24], [1960, 760], {
              ...clamp,
              easing: EASE_OUT,
            }),
            top: 170,
          }}
          pages={[
            {
              at: 0,
              src: "web/08-checkout-payment-held.png",
              url: "/checkout/mug-001",
              focus: [[0, { x: 0.5, y: 0.32, zoom: 1.1 }]],
            },
            {
              at: released,
              src: "web/10-checkout-payment-released.png",
              url: "/checkout/mug-001",
              focus: moves(
                [
                  [0, { x: 0.5, y: 0.32, zoom: 1.1 }],
                  [14, { x: 0.5, y: 0.45, zoom: 1.12 }],
                ],
                len - released,
              ),
            },
          ]}
        />
      </Shot>
      <DemoBadge duration={len} />
    </AbsoluteFill>
  );
};

/** L17: the dispute branch, the Nessie refund, and the shared evidence page. */
export const Dispute: React.FC<{ base: number; end: number }> = ({
  base,
  end,
}) => {
  const { frame, c, w } = useScene(base);
  const len = end - base;
  const phone = c("L17", 1) - 4;
  const refund = c("L17", 3) - 4;
  const evidence = c("L17", 4) - 4;
  const regions = c("L17", 6) - 4;
  // One evidence page: settle on the refund, glide down to the exhibits, then scroll to the flagged regions.
  const refundFocus: FocusKeys = moves(
    [
      [0, { x: 0.5, y: 0.35, zoom: 1.0 }],
      [14, { x: 0.5, y: 0.47, zoom: 1.45 }],
      [evidence - refund, { x: 0.5, y: 0.76, zoom: 1.3 }],
    ],
    regions + 30 - refund,
  );
  const ra = webPoint(
    576,
    684,
    WEB.width,
    WEB.height,
    frame - refund,
    refundFocus,
  );
  const rb = webPoint(
    2302,
    1028,
    WEB.width,
    WEB.height,
    frame - refund,
    refundFocus,
  );
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Plate />
      <Shot
        name="What if it broke in shipping"
        from={0}
        to={phone + 4}
        fadeIn={6}
      >
        <BRoll
          src="clips/cam6526_orbit.mp4"
          srcW={1440}
          srcH={2560}
          trimBefore={2}
          focus={[
            [0, { x: 0.5, y: 0.55, zoom: 1.0 }],
            [phone, { x: 0.5, y: 0.55, zoom: 1.08 }],
          ]}
        />
      </Shot>
      <Shot name="Dispute on the phone" from={phone} to={refund + 4}>
        <DeviceFrame
          {...PHONE}
          kind="image"
          src="app/18-findings-disputed.png"
          focus={moves(
            [
              [0, { x: 0.5, y: 0.5, zoom: 1 }],
              [22, { x: 0.5, y: 0.6, zoom: 1.12 }],
            ],
            refund + 4 - phone,
          )}
          taps={[{ at: w("L17", "dispute") - phone, x: 0.72, y: 0.655 }]}
          rings={[
            {
              at: 22,
              dur: refund - phone - 18,
              x: 0.03,
              y: 0.595,
              w: 0.94,
              h: 0.08,
            },
          ]}
        />
        <SideLabel kicker="Dispute" title="Payment stays held" delay={4} />
      </Shot>
      <Shot
        name="Evidence page: refund, exhibits, flagged regions"
        from={refund}
        to={len}
        fadeOut={8}
      >
        <BrowserPages
          width={WEB.width}
          height={WEB.height}
          style={{ left: WEB.left, top: WEB.top }}
          pages={[
            {
              at: 0,
              src: "web/11-dispute-nessie-refund.png",
              url: "/item/mug-001/evidence",
              focus: refundFocus,
            },
            {
              at: regions - refund,
              src: "web/13-evidence-diff-summary.png",
              url: "/item/mug-001/evidence",
              enter: "scroll",
              focus: [[0, { x: 0.5, y: 0.33, zoom: 1.2 }]],
            },
          ]}
        />
        <Sequence
          from={20}
          durationInFrames={evidence - refund - 22}
          layout="none"
        >
          <div style={{ position: "absolute", left: WEB.left, top: WEB.top }}>
            <Highlight
              x={ra.x}
              y={ra.y}
              w={rb.x - ra.x}
              h={rb.y - ra.y}
              duration={evidence - refund - 22}
            />
          </div>
        </Sequence>
      </Shot>
      <Sequence from={phone} durationInFrames={evidence - phone} layout="none">
        <DemoBadge duration={evidence - phone} />
        <LowerThird n="10" label="Dispute" duration={evidence - phone} />
      </Sequence>
      <Sequence from={evidence} durationInFrames={len - evidence} layout="none">
        <LowerThird
          n="11"
          label="Shared evidence page"
          duration={len - evidence}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
