"use client";

import { useMemo, useState } from "react";
import type { DashboardData } from "@/lib/admin-data";

const SERIES = [
  { key: "mentee", label: "Mentorados", color: "#7dd3fc" },
  { key: "mentor", label: "Mentores", color: "#a78bfa" },
  { key: "company", label: "Empresas", color: "#fbbf24" },
  { key: "project", label: "Projetos", color: "#34d399" },
  { key: "mentorship", label: "Associacoes (mentorias)", color: "#f472b6" },
] as const;
type Key = (typeof SERIES)[number]["key"];
const RANGES = [{ d: 7, label: "7 dias" }, { d: 30, label: "30 dias" }, { d: 90, label: "90 dias" }, { d: 0, label: "Tudo" }];
const TOOL_TABS = [
  { key: "all", label: "Todos" }, { key: "mentor", label: "Mentores" }, { key: "mentee", label: "Mentorados" },
  { key: "company", label: "Empresas" }, { key: "project", label: "Projetos" },
] as const;

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-accent bg-accent/15 text-fg" : "border-line text-muted hover:text-fg"}`;

function fmt(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

export function EvolutionChart({ days }: { days: DashboardData["days"] }) {
  const [range, setRange] = useState(30);
  const [cumulative, setCumulative] = useState(true);
  const [on, setOn] = useState<Record<Key, boolean>>({ mentee: true, mentor: true, company: true, project: true, mentorship: true });
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(() => {
    const acc: Record<Key, number> = { mentee: 0, mentor: 0, company: 0, project: 0, mentorship: 0 };
    const rows = days.map((d) => {
      const r = { date: d.date } as { date: string } & Record<Key, number>;
      for (const s of SERIES) { acc[s.key] += d[s.key]; r[s.key] = cumulative ? acc[s.key] : d[s.key]; }
      return r;
    });
    return range ? rows.slice(-range) : rows;
  }, [days, range, cumulative]);

  const W = 760, H = 260, L = 36, B = 28, T = 12;
  const active = SERIES.filter((s) => on[s.key]);
  const max = Math.max(1, ...points.flatMap((p) => active.map((s) => p[s.key])));
  const x = (i: number) => L + (points.length <= 1 ? (W - L) / 2 : (i * (W - L - 8)) / (points.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max];
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const h = hover !== null ? points[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => <button key={r.d} type="button" onClick={() => setRange(r.d)} className={chip(range === r.d)}>{r.label}</button>)}
        <span className="mx-2 h-4 w-px bg-line" />
        <button type="button" onClick={() => setCumulative(true)} className={chip(cumulative)}>Acumulado</button>
        <button type="button" onClick={() => setCumulative(false)} className={chip(!cumulative)}>Novos por dia</button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {SERIES.map((s) => (
          <button key={s.key} type="button" aria-pressed={on[s.key]} onClick={() => setOn({ ...on, [s.key]: !on[s.key] })} className={chip(on[s.key])}>
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolucao por dia"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            let best = 0;
            points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
            setHover(points.length ? best : null);
          }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-line" strokeDasharray="3 4" />
              <text x={L - 6} y={y(t) + 4} textAnchor="end" className="fill-current text-muted" fontSize="10">{t}</text>
            </g>
          ))}
          {points.map((p, i) => i % labelEvery === 0 && (
            <text key={p.date} x={x(i)} y={H - 8} textAnchor="middle" className="fill-current text-muted" fontSize="10">{fmt(p.date)}</text>
          ))}
          {active.map((s) => (
            <g key={s.key}>
              <polyline fill="none" stroke={s.color} strokeWidth="2" points={points.map((p, i) => `${x(i)},${y(p[s.key])}`).join(" ")} />
              {points.length <= 40 && points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p[s.key])} r="2.5" fill={s.color} />)}
            </g>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="currentColor" className="text-muted" />}
        </svg>
        {h && (
          <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-line bg-surface/95 p-2 text-xs shadow-lg">
            <p className="mb-1 font-semibold">{fmt(h.date)}</p>
            {active.map((s) => <p key={s.key}><span style={{ color: s.color }}>●</span> {s.label}: {h[s.key]}</p>)}
          </div>
        )}
      </div>
    </div>
  );
}

export function Bars({ data, empty = "Sem dados ainda." }: { data: { label: string; value: number }[]; empty?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.label} className="text-sm">
          <div className="mb-0.5 flex justify-between gap-2"><span>{d.label}</span><span className="text-muted">{d.value}</span></div>
          <div className="h-2 rounded-full bg-raised"><div className="h-2 rounded-full bg-accent" style={{ width: `${(d.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function ToolStats({ tools }: { tools: DashboardData["tools"] }) {
  const [tab, setTab] = useState<(typeof TOOL_TABS)[number]["key"]>("all");
  const [showAll, setShowAll] = useState(false);
  const data = tools[tab];
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {TOOL_TABS.map((t) => <button key={t.key} type="button" onClick={() => setTab(t.key)} className={chip(tab === t.key)}>{t.label}</button>)}
      </div>
      <Bars data={showAll ? data : data.slice(0, 10)} />
      {data.length > 10 && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-3 text-xs text-accent hover:underline">
          {showAll ? "Mostrar menos" : `Mostrar todas (${data.length})`}
        </button>
      )}
    </div>
  );
}
