"use client";

import {
  arc,
  line,
  max,
  pie,
  scaleBand,
  scaleLinear,
  scalePoint,
} from "d3";
import type { AnalyticsOverview } from "../../../lib/api";

type DailyFlowPoint = AnalyticsOverview["dailyFlow"][number];

const SERIES = [
  { key: "needsCreated", label: "Needs created", color: "#0f766e" },
  { key: "tasksCreated", label: "Tasks created", color: "#0369a1" },
  { key: "tasksCompleted", label: "Tasks completed", color: "#7c3aed" },
  { key: "tasksVerified", label: "Tasks verified", color: "#ea580c" },
] as const;

function formatDayLabel(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function TrendChart({ data }: { data: DailyFlowPoint[] }) {
  const width = 760;
  const height = 320;
  const margin = { top: 20, right: 24, bottom: 42, left: 42 };
  const x = scalePoint<string>()
    .domain(data.map((point) => point.day))
    .range([margin.left, width - margin.right]);
  const yMax =
    max(data, (point) =>
      max(SERIES, (series) => point[series.key])
    ) ?? 0;
  const y = scaleLinear()
    .domain([0, Math.max(1, yMax)])
    .nice()
    .range([height - margin.bottom, margin.top]);
  const ticks = y.ticks(4);

  return (
    <section className="glass rounded-3xl p-6 soft-ring">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Flow Over Last 14 Days</h2>
          <p className="text-sm text-slate-500">
            Intake, task creation, completions, and verifications in one operational view.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          {SERIES.map((series) => (
            <span key={series.key} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: series.color }}
              />
              {series.label}
            </span>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-5 w-full">
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#cbd5e1"
              strokeDasharray="4 6"
            />
            <text x={margin.left - 10} y={y(tick) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
              {tick}
            </text>
          </g>
        ))}

        {SERIES.map((series) => {
          const path = line<DailyFlowPoint>()
            .x((point) => x(point.day) ?? 0)
            .y((point) => y(point[series.key]))(data);

          return (
            <g key={series.key}>
              <path
                d={path ?? ""}
                fill="none"
                stroke={series.color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {data.map((point) => (
                <circle
                  key={`${series.key}-${point.day}`}
                  cx={x(point.day) ?? 0}
                  cy={y(point[series.key])}
                  r={3.5}
                  fill={series.color}
                />
              ))}
            </g>
          );
        })}

        {data.map((point, index) => {
          const xValue = x(point.day) ?? 0;
          const showLabel = index === 0 || index === data.length - 1 || index % 3 === 0;
          return showLabel ? (
            <text
              key={point.day}
              x={xValue}
              y={height - 16}
              textAnchor="middle"
              className="fill-slate-500 text-[11px]"
            >
              {formatDayLabel(point.day)}
            </text>
          ) : null;
        })}
      </svg>
    </section>
  );
}

function DonutChart({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: Array<{ label: string; value: number }>;
}) {
  const width = 260;
  const height = 260;
  const radius = 88;
  const innerRadius = 52;
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const palette = ["#0f766e", "#0284c7", "#7c3aed", "#ea580c", "#334155"];
  const pieData = pie<{ label: string; value: number }>()
    .sort(null)
    .value((item) => item.value)(items.filter((item) => item.value > 0));
  const arcGenerator = arc<(typeof pieData)[number]>()
    .innerRadius(innerRadius)
    .outerRadius(radius)
    .cornerRadius(8);

  return (
    <section className="glass rounded-3xl p-6 soft-ring">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500">{description}</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[260px_1fr]">
        <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto w-full max-w-[260px]">
          <g transform={`translate(${width / 2}, ${height / 2})`}>
            {pieData.length > 0 ? (
              pieData.map((slice, index) => (
                <path
                  key={slice.data.label}
                  d={arcGenerator(slice) ?? ""}
                  fill={palette[index % palette.length]}
                />
              ))
            ) : (
              <circle r={radius} fill="#e2e8f0" />
            )}
            <circle r={innerRadius - 2} fill="white" />
            <text y={-4} textAnchor="middle" className="fill-slate-400 text-[11px] uppercase tracking-[0.2em]">
              Total
            </text>
            <text y={24} textAnchor="middle" className="fill-slate-900 text-3xl font-semibold">
              {total}
            </text>
          </g>
        </svg>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: palette[index % palette.length] }}
                  />
                  <span className="text-sm font-medium capitalize text-slate-700">{item.label}</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{item.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryBars({
  title,
  description,
  items,
  color,
}: {
  title: string;
  description: string;
  items: Array<{ label: string; value: number }>;
  color: string;
}) {
  const width = 560;
  const height = 280;
  const margin = { top: 18, right: 18, bottom: 42, left: 36 };
  const x = scaleBand<string>()
    .domain(items.map((item) => item.label))
    .range([margin.left, width - margin.right])
    .padding(0.24);
  const y = scaleLinear()
    .domain([0, Math.max(1, max(items, (item) => item.value) ?? 0)])
    .nice()
    .range([height - margin.bottom, margin.top]);
  const ticks = y.ticks(4);

  return (
    <section className="glass rounded-3xl p-6 soft-ring">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500">{description}</p>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-5 w-full">
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#e2e8f0"
            />
            <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
              {tick}
            </text>
          </g>
        ))}

        {items.map((item) => {
          const xValue = x(item.label) ?? 0;
          const yValue = y(item.value);
          const barHeight = height - margin.bottom - yValue;

          return (
            <g key={item.label}>
              <rect
                x={xValue}
                y={yValue}
                width={x.bandwidth()}
                height={barHeight}
                rx={12}
                fill={color}
                opacity={item.value === 0 ? 0.3 : 1}
              />
              <text
                x={xValue + x.bandwidth() / 2}
                y={yValue - 8}
                textAnchor="middle"
                className="fill-slate-700 text-[11px]"
              >
                {item.value}
              </text>
              <text
                x={xValue + x.bandwidth() / 2}
                y={height - 16}
                textAnchor="middle"
                className="fill-slate-500 text-[11px] capitalize"
              >
                {item.label.replace("_", " ")}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

function SkillBalanceChart({
  items,
}: {
  items: AnalyticsOverview["skillBalance"];
}) {
  const width = 760;
  const height = Math.max(240, items.length * 48 + 48);
  const margin = { top: 18, right: 24, bottom: 20, left: 110 };
  const x = scaleLinear()
    .domain([0, Math.max(1, max(items, (item) => Math.max(item.supply, item.demand)) ?? 0)])
    .nice()
    .range([margin.left, width - margin.right]);
  const y = scaleBand<string>()
    .domain(items.map((item) => item.skill))
    .range([margin.top, height - margin.bottom])
    .padding(0.28);

  return (
    <section className="glass rounded-3xl p-6 soft-ring">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Skill Supply vs Active Demand</h2>
          <p className="text-sm text-slate-500">
            Demand is counted from open and in-flight tasks. Supply is counted from active volunteers.
          </p>
        </div>
        <div className="flex gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-700" />
            Supply
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            Demand
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-5 w-full">
        {items.map((item) => {
          const rowY = y(item.skill) ?? 0;
          const bandHeight = y.bandwidth();
          const barHeight = bandHeight / 2 - 3;
          return (
            <g key={item.skill}>
              <text
                x={margin.left - 12}
                y={rowY + bandHeight / 2 + 4}
                textAnchor="end"
                className="fill-slate-600 text-[12px] capitalize"
              >
                {item.skill.replace(/_/g, " ")}
              </text>
              <rect
                x={margin.left}
                y={rowY}
                width={(x(item.supply) ?? 0) - margin.left}
                height={barHeight}
                rx={8}
                fill="#0f766e"
              />
              <rect
                x={margin.left}
                y={rowY + barHeight + 6}
                width={(x(item.demand) ?? 0) - margin.left}
                height={barHeight}
                rx={8}
                fill="#f97316"
              />
              <text x={(x(item.supply) ?? 0) + 8} y={rowY + barHeight - 2} className="fill-slate-600 text-[11px]">
                {item.supply}
              </text>
              <text
                x={(x(item.demand) ?? 0) + 8}
                y={rowY + bandHeight - 3}
                className="fill-slate-600 text-[11px]"
              >
                {item.demand}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

export default function AnalyticsCharts({ data }: { data: AnalyticsOverview }) {
  return (
    <div className="space-y-6">
      <TrendChart data={data.dailyFlow} />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <DonutChart
          title="Task Lifecycle"
          description="Where coordinator work is currently bottlenecked."
          items={data.taskStatus}
        />
        <CategoryBars
          title="Needs By Category"
          description="Demand concentration across reported community issues."
          items={data.needsByCategory}
          color="#0284c7"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SkillBalanceChart items={data.skillBalance} />
        <CategoryBars
          title="Urgency Mix"
          description="Spread of current reported severity scores."
          items={data.urgencyBands}
          color="#7c3aed"
        />
      </div>
    </div>
  );
}
