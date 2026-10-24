"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COLORS } from "@/lib/heatmap";
import type { Histogram as HistogramData, LengthUnit } from "@/lib/types";

interface Props {
  histogram: HistogramData;
  threshold: number;
  units: LengthUnit;
  /**
   * The 3D view uses a signed blue/gray/red scale, so blue must not mean
   * "unchanged" here. Use gray and amber instead.
   */
  signedScale?: boolean;
}

export default function Histogram({ histogram, threshold, units, signedScale }: Props) {
  // Gray matches the "unchanged" band of the 3D heat map; amber marks change without implying dent or added.
  const below = signedScale ? "#71717a" : COLORS.noChange;
  const above = signedScale ? "#f59e0b" : COLORS.ramp[2];
  const { binEdges, counts } = histogram;
  const data = counts.map((count, i) => ({
    from: binEdges[i],
    to: binEdges[i + 1],
    mid: (binEdges[i] + binEdges[i + 1]) / 2,
    count,
    above: binEdges[i] >= threshold,
  }));
  const max = binEdges[binEdges.length - 1];
  // Keep the label inside the chart when the line sits near the left edge.
  const labelSide = threshold / max < 0.4 ? "insideTopLeft" : "insideTopRight";

  return (
    <div>
      {/* currentColor: the threshold line is light on screen and black when printed. */}
      <div className="h-56 w-full text-zinc-200 sm:h-64 print:text-black">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 12, bottom: 16, left: 0 }} barCategoryGap={1}>
            <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.06)" />
            <XAxis
              dataKey="mid"
              type="number"
              domain={[0, max]}
              tick={{ fontSize: 11, fill: "#a1a1aa" }}
              tickLine={false}
              axisLine={{ stroke: "rgb(255 255 255 / 0.15)" }}
              label={{ value: `Change (${units})`, position: "insideBottom", offset: -8, fontSize: 11, fill: "#a1a1aa" }}
            />
            <YAxis
              scale="sqrt"
              domain={[0, "auto"]}
              tick={{ fontSize: 11, fill: "#a1a1aa" }}
              tickFormatter={(n: number) => n.toLocaleString("en-US", { notation: "compact" })}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ fill: "rgb(255 255 255 / 0.04)" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !p) return null;
                return (
                  <div className="rounded-lg border border-white/10 bg-zinc-950/95 px-2.5 py-1.5 font-mono text-[11px] text-zinc-200 shadow-xl">
                    <div>
                      {p.from} to {p.to} {units}
                    </div>
                    <div className="font-semibold">{p.count.toLocaleString()} samples</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="count" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.above ? above : below} />
              ))}
            </Bar>
            <ReferenceLine
              x={threshold}
              stroke="currentColor"
              strokeWidth={2}
              strokeDasharray="4 3"
              label={{ value: `Threshold ${threshold} ${units}`, position: labelSide, fontSize: 11, fill: "currentColor", dy: -18 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: below }} /> At or below threshold (treated as unchanged)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: above }} /> Above threshold
        </span>
        <span>Vertical scale is square root so small counts stay visible.</span>
      </div>
    </div>
  );
}
