"use client";

import { adminLabelForReasonCode } from "@/lib/moderation/ad-block-reasons";
import type { AdModerationEvent } from "@/lib/admin/api";

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * Histórico de moderação do anúncio (Fase 4.10A).
 *
 * A trilha é append-only: bloqueio e reativação são linhas separadas, e
 * reativar não apaga nem edita o bloqueio anterior. Por isso a lista pode ter
 * vários ciclos do mesmo anúncio — é intencional, não duplicata.
 *
 * Nunca renderiza quem executou a ação: o DTO do backend não traz esse campo.
 */
export function AdModerationHistory({
  events,
  loading,
}: {
  events: AdModerationEvent[];
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
      <h2 className="mb-3 text-sm font-bold text-cnc-text">Histórico de moderação</h2>

      {loading ? (
        <p className="text-xs text-cnc-muted">Carregando…</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-cnc-muted" data-testid="moderation-history-empty">
          Nenhuma ação de moderação registrada.
        </p>
      ) : (
        <ol
          // Altura limitada como em "Eventos Recentes": a trilha é append-only,
          // e um anúncio com vários ciclos esticaria a coluna inteira.
          className="max-h-60 space-y-3 overflow-y-auto"
          data-testid="moderation-history-list"
        >
          {events.map((evt) => {
            const blocked = evt.event_type === "admin_blocked";
            return (
              <li key={evt.id} className="flex gap-3 text-xs">
                <span
                  aria-hidden
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    blocked ? "bg-cnc-danger" : "bg-cnc-success"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-cnc-muted">{formatDateTime(evt.created_at)}</p>
                  <p className="font-semibold text-cnc-text">
                    {blocked ? "Anúncio bloqueado" : "Anúncio reativado"}
                  </p>
                  {blocked && evt.reason_code && (
                    <p className="text-cnc-muted">
                      Motivo: {adminLabelForReasonCode(evt.reason_code)}
                    </p>
                  )}
                  {!blocked && evt.to_status && (
                    <p className="text-cnc-muted">Restaurado para: {evt.to_status}</p>
                  )}
                  {evt.note && <p className="break-words text-cnc-muted">Observação: {evt.note}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
