"use client";

import { AdminEmptyState } from "./AdminEmptyState";

type BarData = { label: string; value: number; color?: string };

export function AdminChartCard({
  title,
  bars,
  maxValue,
}: {
  title: string;
  bars: BarData[];
  maxValue?: number;
}) {
  const max = maxValue ?? Math.max(...bars.map((b) => b.value), 1);

  return (
    <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
      <h3 className="text-sm font-bold text-cnc-text">{title}</h3>
      {bars.length === 0 ? (
        <AdminEmptyState message="Sem dados disponíveis" />
      ) : (
        <div className="mt-4 space-y-3">
          {bars.map((b, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-cnc-muted">{b.label}</span>
                <span className="text-xs font-semibold text-cnc-text">{b.value.toLocaleString("pt-BR")}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-cnc-bg">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((b.value / max) * 100, 100)}%`, backgroundColor: b.color ?? "#1a56db" }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminMiniBarChart({
  title,
  items,
}: {
  title: string;
  items: { label: string; values: { name: string; value: number; color: string }[] }[];
}) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
        <h3 className="text-sm font-bold text-cnc-text">{title}</h3>
        <AdminEmptyState message="Sem dados disponíveis" />
      </div>
    );
  }

  const maxTotal = Math.max(...items.map((i) => i.values.reduce((s, v) => s + v.value, 0)), 1);

  return (
    <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
      <h3 className="mb-4 text-sm font-bold text-cnc-text">{title}</h3>
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-cnc-muted truncate max-w-[60%]">{item.label}</span>
              <div className="flex gap-2">
                {item.values.map((v, vi) => (
                  <span key={vi} className="text-[11px] font-semibold" style={{ color: v.color }}>
                    {v.name}: {v.value.toLocaleString("pt-BR")}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-cnc-bg">
              {item.values.map((v, vi) => {
                const w = (v.value / maxTotal) * 100;
                return (
                  <div
                    key={vi}
                    className="h-2 transition-all"
                    style={{ width: `${w}%`, backgroundColor: v.color, borderRadius: vi === 0 ? "9999px 0 0 9999px" : vi === item.values.length - 1 ? "0 9999px 9999px 0" : "0" }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
