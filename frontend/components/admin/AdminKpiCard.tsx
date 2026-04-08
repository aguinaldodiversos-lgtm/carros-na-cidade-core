type Props = { label: string; value: string | number; subtitle?: string; color?: string };

export function AdminKpiCard({ label, value, subtitle, color = "#1a56db" }: Props) {
  return (
    <div className="rounded-xl border border-cnc-line bg-white px-5 py-4 shadow-card">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-cnc-muted">{label}</p>
      <p className="mt-1 text-[28px] font-extrabold tracking-tight" style={{ color }}>{value}</p>
      {subtitle && <p className="mt-0.5 text-[12px] text-cnc-muted-soft">{subtitle}</p>}
    </div>
  );
}
