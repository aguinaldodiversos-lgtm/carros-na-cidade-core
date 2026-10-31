"use client";

import { useState } from "react";
import { adminApi, type DealerReviewAdminRow } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";

export default function AdminDealerReviews({ advertiserId }: { advertiserId: number | string }) {
  const reviews = useAdminFetch<{ ok: boolean; data: DealerReviewAdminRow[] }>(
    () => adminApi.advertisers.reviews(advertiserId),
    [advertiserId]
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function hideReview(reviewId: number) {
    if (busy || reason.trim().length < 15) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await adminApi.advertisers.hideReview(advertiserId, reviewId, reason.trim());
      setSuccess("Avaliação ocultada do perfil público. Decisão e justificativa registradas.");
      setSelectedId(null);
      setReason("");
      reviews.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ocultar a avaliação.");
    } finally {
      setBusy(false);
    }
  }

  const items = reviews.data?.data ?? [];

  return (
    <section
      className="rounded-xl border border-cnc-line bg-white p-5 shadow-card"
      aria-label="Inspeção de avaliações da loja"
    >
      <h2 className="text-sm font-bold text-cnc-text">
        Avaliações dos clientes — inspeção administrativa
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-cnc-muted">
        Consulte avaliações positivas e negativas antes de decidir. Somente o administrador pode
        ocultá-las; o lojista não possui essa permissão. Nenhuma avaliação é apagada do histórico.
      </p>
      {reviews.loading ? (
        <div className="mt-4">
          <AdminLoadingState />
        </div>
      ) : null}
      {reviews.error ? (
        <div className="mt-4">
          <AdminErrorState message={reviews.error} onRetry={reviews.reload} />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="mt-3 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}
      {!reviews.loading && !reviews.error && items.length === 0 ? (
        <p className="mt-4 text-sm text-cnc-muted">Esta loja ainda não recebeu avaliações.</p>
      ) : null}
      {items.length > 0 ? (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {items.map((review) => (
            <li key={review.id} className="rounded-xl border border-cnc-line bg-cnc-bg/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-cnc-text">{review.author}</span>
                <span className="text-xs text-cnc-muted">
                  {review.status === "hidden" ? "Oculta (histórico preservado)" : "Pública"}
                </span>
              </div>
              <span className="text-amber-500" aria-label={review.rating + " de 5 estrelas"}>
                {"★".repeat(Math.min(5, Math.max(1, review.rating)))}
              </span>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-cnc-text">
                {review.body}
              </p>
              <p className="mt-2 text-xs text-cnc-muted">
                Publicada em {new Date(review.created_at).toLocaleDateString("pt-BR")}
              </p>
              {review.status === "published" ? (
                selectedId === review.id ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <label className="block text-xs font-bold text-cnc-text">
                      Motivo da decisão (15–500 caracteres)
                      <textarea
                        className="mt-1 min-h-24 w-full rounded-lg border border-cnc-line bg-white p-3 text-sm"
                        value={reason}
                        maxLength={500}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Registre os fatos apurados, contato com a loja e justificativa da ocultação."
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || reason.trim().length < 15}
                        onClick={() => void hideReview(review.id)}
                        className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {busy ? "Registrando..." : "Confirmar ocultação"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setSelectedId(null);
                          setReason("");
                          setError("");
                        }}
                        className="rounded-lg border border-cnc-line bg-white px-3 py-2 text-xs font-bold text-cnc-text"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-3 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700"
                    onClick={() => {
                      setSelectedId(review.id);
                      setReason("");
                      setError("");
                      setSuccess("");
                    }}
                  >
                    Analisar ocultação
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
