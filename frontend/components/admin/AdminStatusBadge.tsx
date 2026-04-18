const MAP: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Ativo" },
  paused: { bg: "bg-amber-100", text: "text-amber-700", label: "Pausado" },
  blocked: { bg: "bg-red-100", text: "text-red-700", label: "Bloqueado" },
  deleted: { bg: "bg-gray-200", text: "text-gray-600", label: "Deletado" },
  suspended: { bg: "bg-orange-100", text: "text-orange-700", label: "Suspenso" },
  approved: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Pago" },
  pending: { bg: "bg-amber-100", text: "text-amber-700", label: "Pendente" },
  rejected: { bg: "bg-red-100", text: "text-red-700", label: "Rejeitado" },
  canceled: { bg: "bg-gray-200", text: "text-gray-600", label: "Cancelado" },
  refunded: { bg: "bg-purple-100", text: "text-purple-700", label: "Estornado" },
};

export function AdminStatusBadge({ status }: { status: string }) {
  const s = MAP[status?.toLowerCase()] ?? {
    bg: "bg-gray-200",
    text: "text-gray-600",
    label: status || "—",
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}
