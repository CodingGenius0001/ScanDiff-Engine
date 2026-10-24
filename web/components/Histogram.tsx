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
  // Ink and gray: the heat map stays the only color on the page, and neither implies dent or added.
  const below = signedScale ? "#7f7c74" : COLORS.noChange;
  const above = signedScale ? "#141413" : COLORS.ramp[2];
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
      <div className="h-56 w-full text-ink sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 12, bottom: 16, left: 0 }} barCategoryGap={1}>
            <CartesianGrid vertical={false} stroke="#d6d3ca" />
            <XAxis
              dataKey="mid"
              type="number"
              domain={[0, max]}
              tick={{ fontSize: 11, fill: "#5b5953" }}
              tickLine={false}
              axisLine={{ stroke: "#141413" }}
              label={{ value: `Change (${units})`, position: "insideBottom", offset: -8, fontSize: 11, fill: "#5b5953" }}
            />
            <YAxis
              scale="sqrt"
              domain={[0, "auto"]}
              tick={{ fontSize: 11, fill: "#5b5953" }}
              tickFormatter={(n: number) => n.toLocaleString("en-US", { notation: "compact" })}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ fill: "rgb(20 20 19 / 0.05)" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !p) return null;
                return (
                  <div className="border border-ink bg-paper px-2.5 py-1.5 font-mono text-[11px]">
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
              strokeDasharray="2 3"
              label={{ value: `Threshold ${threshold} ${units}`, position: labelSide, fontSize: 11, fill: "currentColor", dy: -18 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
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
