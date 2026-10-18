"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Single-series bar chart (no legend: the card title names the series).
 * Thin bars with rounded data-ends, recessive grid, hover tooltip, and a
 * visually-hidden table for screen readers.
 */
export function SimpleBarChart({ data, valueLabel, format = (v) => String(v), height = 180 }: {
  data: { label: string; value: number }[];
  valueLabel: string;
  format?: (v: number) => string;
  height?: number;
}) {
  return (
    <figure>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval={0} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={44} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              formatter={(v) => [format(Number(v)), valueLabel]}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--popover-foreground)" }}
              labelStyle={{ color: "var(--muted-foreground)" }}
            />
            <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{valueLabel}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}><th scope="row">{d.label}</th><td>{format(d.value)}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
