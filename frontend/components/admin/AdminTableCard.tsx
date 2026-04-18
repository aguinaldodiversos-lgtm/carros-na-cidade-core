import { AdminEmptyState } from "./AdminEmptyState";

type Column<T> = { key: string; label: string; render?: (row: T) => React.ReactNode };

export function AdminTableCard<T extends Record<string, unknown>>({
  title,
  columns,
  rows,
  maxRows = 5,
  emptyMessage = "Nenhum registro encontrado",
  onViewAll,
}: {
  title: string;
  columns: Column<T>[];
  rows: T[];
  maxRows?: number;
  emptyMessage?: string;
  onViewAll?: () => void;
}) {
  const visible = rows.slice(0, maxRows);

  return (
    <div className="rounded-xl border border-cnc-line bg-white shadow-card">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h3 className="text-sm font-bold text-cnc-text">{title}</h3>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Ver todos →
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <AdminEmptyState message={emptyMessage} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-t border-cnc-line bg-cnc-bg/50">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-5 py-2 font-semibold text-cnc-muted uppercase tracking-wider whitespace-nowrap"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => (
                <tr
                  key={i}
                  className="border-t border-cnc-line/70 hover:bg-cnc-bg/30 transition-colors"
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-2.5 whitespace-nowrap text-cnc-text">
                      {col.render ? col.render(row) : String(row[col.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
