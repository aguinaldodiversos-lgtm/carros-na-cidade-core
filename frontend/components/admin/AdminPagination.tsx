"use client";

type Props = { total: number; limit: number; offset: number; onChange: (offset: number) => void };

export function AdminPagination({ total, limit, offset, onChange }: Props) {
  const pages = Math.ceil(total / limit) || 1;
  const current = Math.floor(offset / limit);
  if (pages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-cnc-line px-4 py-3">
      <span className="text-xs text-cnc-muted">{total} registros</span>
      <div className="flex items-center gap-1">
        <button
          disabled={current === 0}
          onClick={() => onChange(Math.max(0, (current - 1) * limit))}
          className="rounded px-2.5 py-1 text-xs font-medium text-cnc-muted hover:bg-cnc-bg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Anterior
        </button>
        <span className="px-2 text-xs font-semibold text-cnc-text">
          {current + 1} / {pages}
        </span>
        <button
          disabled={current >= pages - 1}
          onClick={() => onChange((current + 1) * limit)}
          className="rounded px-2.5 py-1 text-xs font-medium text-cnc-muted hover:bg-cnc-bg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Próximo →
        </button>
      </div>
    </div>
  );
}
