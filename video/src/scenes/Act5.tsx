import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Chip, Mark, Rise, Strike, Wordmark } from "../components/Brand";
import { BrowserFrame } from "../components/BrowserFrame";
import { moves } from "../components/Focus";
import { PhotoCard } from "../components/Graphics";
import { Icon, IconName } from "../components/Icons";
import { C, EASE_OUT, FONT, MONO, clamp } from "../theme";
import { Plate, Shot, useScene } from "./kit";

/** L18: what ScanDiff is, and what it is not. */
export const Distinction: React.FC<{ base: number; end: number }> = ({
  base,
}) => {
  const { c } = useScene(base);
  return (
    <AbsoluteFill
      style={{
        background: C.paper,
        justifyContent: "center",
        paddingLeft: 170,
        paddingBottom: 120,
      }}
    >
      <Rise delay={c("L18", 1) - 6} size={92}>
        Tamper-evident evidence
        <br />
        of condition <span style={{ color: C.stamp }}>at handoff.</span>
      </Rise>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          marginTop: 64,
        }}
      >
        <Rise delay={c("L18", 2) - 4} size={44} color={C.inkSoft} weight={400}>
          — Not proof the item was advertised accurately.
        </Rise>
        <Rise delay={c("L18", 3) - 4} size={44} color={C.inkSoft} weight={400}>
          — Payments in this demo are not real.
        </Rise>
      </div>
    </AbsoluteFill>
  );
};

const USES: { icon: IconName; label: string; word: string; after?: number }[] =
  [
    { icon: "car", label: "Rental cars", word: "rental", after: 15 },
    { icon: "hotel", label: "Hotel rooms", word: "hotel" },
    { icon: "apartment", label: "Apartments", word: "apartments" },
    { icon: "equipment", label: "Equipment rentals", word: "equipment" },
    { icon: "scooter", label: "Shared scooters", word: "shared" },
    { icon: "gear", label: "Borrowed gear", word: "borrowed" },
    { icon: "returns", label: "Returns", word: "returns" },
    { icon: "claim", label: "Insurance claims", word: "insurance" },
  ];

/** L19: generated photos aren't proof; 2FA for physical goods; everything we share. */
export const Proof: React.FC<{ base: number; end: number }> = ({
  base,
  end,
}) => {
  const { frame, c, w } = useScene(base);
  const { fps } = useVideoConfig();
  const len = end - base;
  const twoFa = c("L19", 2) - 4;
  const share = c("L19", 5) - 4;
  const sdk = c("L19", 11) - 4;
  const scanIn = w("L19", "take");
  const scanOut = w("L19", "back");
  const match = w("L19", "match");
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Plate />
      <Shot
        name="A photo is no longer proof"
        from={0}
        to={twoFa + 4}
        fadeIn={8}
      >
        <GeneratedPhoto />
        <div style={{ position: "absolute", left: 980, top: 320, width: 820 }}>
          <Rise delay={c("L19", 1) - 4} size={96}>
            A photo is no longer
            <br />
            <Strike at={w("L19", "proof") + 4}>proof.</Strike>
          </Rise>
        </div>
      </Shot>
      <Shot name="2FA for physical goods" from={twoFa} to={share + 4}>
        <AbsoluteFill style={{ alignItems: "center", paddingTop: 170 }}>
          <Rise size={124}>
            <span style={{ color: C.stamp }}>2FA</span> for physical goods
          </Rise>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 60,
              marginTop: 90,
            }}
          >
            <FactorCard
              delay={scanIn - twoFa}
              label="scan in"
              sub="when you take it"
            />
            <div
              style={{
                fontFamily: MONO,
                fontSize: 30,
                color: frame > match ? C.stamp : C.inkFaint,
                opacity: interpolate(
                  frame,
                  [scanOut + 4, scanOut + 14],
                  [0, 1],
                  clamp,
                ),
                textAlign: "center",
              }}
            >
              {frame > match ? "✓ match" : "="}
              <div
                style={{
                  fontSize: 22,
                  marginTop: 10,
                  color: C.inkSoft,
                  opacity: interpolate(
                    frame,
                    [w("L19", "money"), w("L19", "money") + 10],
                    [0, 1],
                    clamp,
                  ),
                }}
              >
                then money moves
              </div>
            </div>
            <FactorCard
              delay={scanOut - twoFa}
              label="scan out"
              sub="when you hand it back"
            />
          </div>
        </AbsoluteFill>
      </Shot>
      <Shot name="Everything we share" from={share} to={sdk + 4}>
        <AbsoluteFill style={{ alignItems: "center", paddingTop: 120 }}>
          <Rise size={72}>Think of everything we share.</Rise>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 330px)",
              gap: 26,
              marginTop: 70,
            }}
          >
            {USES.map((u, i) => {
              const at = w("L19", u.word, u.after ?? 18) - share;
              const s = spring({
                frame: frame - share - at,
                fps,
                config: { damping: 200 },
              });
              const lit = frame - share >= at;
              return (
                <div
                  key={u.label}
                  style={{
                    height: 190,
                    borderRadius: 14,
                    border: `1.5px solid ${lit ? C.stamp : C.rule}`,
                    background: lit ? "rgba(255,106,26,0.06)" : C.panel,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 18,
                    opacity:
                      interpolate(
                        frame - share,
                        [i * 2, i * 2 + 10],
                        [0, 1],
                        clamp,
                      ) * interpolate(s, [0, 1], [0.35, 1]),
                    scale: interpolate(s, [0, 1], [0.96, 1]),
                  }}
                >
                  <Icon
                    name={u.icon}
                    size={72}
                    color={lit ? C.stamp : C.inkSoft}
                    stroke={1.1}
                  />
                  <span
                    style={{
                      fontFamily: FONT,
                      fontSize: 30,
                      color: lit ? C.ink : C.inkSoft,
                    }}
                  >
                    {u.label}
                  </span>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      </Shot>
      <Shot name="Into their own app" from={sdk} to={len} fadeOut={8}>
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            paddingBottom: 130,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 50 }}>
            <div
              style={{
                width: 300,
                height: 520,
                borderRadius: 48,
                border: `2px solid ${C.rule}`,
                background: C.panel,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 22,
              }}
            >
              <span
                style={{
                  fontFamily: FONT,
                  fontSize: 30,
                  color: C.inkSoft,
                  marginBottom: 10,
                }}
              >
                Your app
              </span>
              <Chip delay={w("L19", "scan", 35) - sdk} size={26}>
                scan-in
              </Chip>
              <Chip delay={w("L19", "out", 35) - sdk} size={26} accent>
                scan-out
              </Chip>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 40, color: C.inkFaint }}>
              +
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <Mark size={120} animate={false} />
              <span
                style={{
                  fontFamily: FONT,
                  fontWeight: 300,
                  fontSize: 70,
                  color: C.ink,
                  letterSpacing: "-0.035em",
                }}
              >
                SDK
              </span>
            </div>
          </div>
        </AbsoluteFill>
      </Shot>
    </AbsoluteFill>
  );
};

const FactorCard: React.FC<{ delay: number; label: string; sub: string }> = ({
  delay,
  label,
  sub,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + 16], [0, 1], {
    ...clamp,
    easing: EASE_OUT,
  });
  return (
    <div
      style={{
        width: 380,
        padding: "40px 0",
        borderRadius: 16,
        border: `1.5px solid ${C.rule}`,
        background: C.panel,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        opacity: p,
        translate: `0 ${(1 - p) * 30}px`,
      }}
    >
      <Icon name="phone" size={70} color={C.ink} />
      <span style={{ fontFamily: MONO, fontSize: 34, color: C.ink }}>
        {label}
      </span>
      <span style={{ fontFamily: FONT, fontSize: 26, color: C.inkSoft }}>
        {sub}
      </span>
    </div>
  );
};

/** A photo card whose content is visibly re-generated: it re-renders, frame by frame, into noise. */
const GeneratedPhoto: React.FC = () => {
  const frame = useCurrentFrame();
  const glitch = interpolate(frame, [20, 60], [0, 1], clamp);
  return (
    <>
      <PhotoCard
        src="stills/photo_36.jpg"
        w={460}
        h={600}
        delay={0}
        rotate={-4}
        style={{ left: 360, top: 150 }}
      />
      <div
        style={{
          position: "absolute",
          left: 360 + 14,
          top: 150 + 14,
          width: 460,
          height: 600,
          rotate: "-4deg",
          background: `repeating-linear-gradient(0deg, rgba(255,106,26,0.0) 0px, rgba(255,106,26,${0.12 * glitch}) ${2 + (frame % 5)}px, rgba(0,0,0,0) ${6 + (frame % 7)}px)`,
          mixBlendMode: "screen",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 400,
          top: 700,
          rotate: "-4deg",
          opacity: glitch,
        }}
      >
        <Chip accent size={24}>
          generated
        </Chip>
      </div>
    </>
  );
};

/** L20: looking ahead: rental cars, hotel rooms, an SDK for marketplaces and shipping. */
export const Ahead: React.FC<{ base: number; end: number }> = ({
  base,
  end,
}) => {
  const { c } = useScene(base);
  const len = end - base;
  const sdk = c("L20", 2) - 4;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Plate />
      <div style={{ position: "absolute", left: 170, top: 110 }}>
        <Rise size={30} color={C.stamp} weight={400}>
          Looking ahead
        </Rise>
      </div>
      <Shot name="Rental car demo" from={0} to={sdk + 4} fadeIn={6}>
        <BrowserFrame
          src="web/15-rental-car-heat-map.png"
          url="/item/car-001"
          width={1300}
          height={720}
          style={{ left: 310, top: 180 }}
          focus={moves(
            [
              [0, { x: 0.5, y: 0.3, zoom: 1.0 }],
              [c("L20", 1) - 4, { x: 0.45, y: 0.28, zoom: 1.3 }],
            ],
            sdk + 4,
          )}
        />
      </Shot>
      <Shot name="SDK" from={sdk} to={len} fadeOut={8}>
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            paddingBottom: 120,
          }}
        >
          <Rise size={96}>An SDK for scan-based</Rise>
          <Rise delay={4} size={96}>
            <span style={{ color: C.stamp }}>payments</span> and{" "}
            <span style={{ color: C.stamp }}>returns</span>
          </Rise>
          <div style={{ display: "flex", gap: 20, marginTop: 56 }}>
            <Chip delay={10}>marketplaces</Chip>
            <Chip delay={16}>shipping platforms</Chip>
          </div>
        </AbsoluteFill>
      </Shot>
    </AbsoluteFill>
  );
};

/** L21-L22 and the end card: "We're ScanDiff. Measured, not argued." */
export const EndCard: React.FC<{ base: number; end: number }> = ({
  base,
  end,
}) => {
  const { frame, c } = useScene(base);
  const len = end - base;
  const tag = c("L22", 0) - 2;
  const outro = interpolate(frame, [len - 18, len], [1, 0], clamp);
  return (
    <AbsoluteFill
      style={{
        background: C.paper,
        justifyContent: "center",
        alignItems: "center",
        paddingBottom: 60,
        opacity: outro,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
        <Mark size={170} delay={2} />
        <Wordmark size={150} delay={10} />
      </div>
      <Rise delay={tag} size={88} style={{ marginTop: 64 }}>
        Measured, <span style={{ color: C.stamp }}>not argued.</span>
      </Rise>
      <div
        style={{
          marginTop: 90,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          opacity: interpolate(frame, [tag + 40, tag + 56], [0, 1], clamp),
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 32, color: C.ink }}>
          scandiff.us
        </span>
        <span style={{ fontFamily: FONT, fontSize: 26, color: C.inkFaint }}>
          Adithya Sripada · Koushik Jandhyala · Keshav Pillarisetti · Cal Hacks
          13.0
        </span>
      </div>
    </AbsoluteFill>
  );
};
