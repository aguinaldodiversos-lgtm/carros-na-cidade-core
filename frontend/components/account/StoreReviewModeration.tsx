"use client";
import { useEffect, useState } from "react";

type Review = {
  id: number;
  author: string;
  rating: number;
  body: string;
  created_at: string;
  status: "published" | "hidden";
};

export default function StoreReviewModeration() {
  const [items, setItems] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/account/store/reviews", { credentials: "include", cache: "no-store" })
      .then(async res => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Não foi possível carregar avaliações.");
        if (mounted) setItems(json.reviews || []);
      })
      .catch(err => { if (mounted) setMessage(err.message || "Falha ao consultar avaliações."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  async function remove(review: Review) {
    if (!window.confirm("Excluir esta avaliação da página pública? O histórico de moderação será preservado.")) return;
    setBusy(review.id);
    setMessage("");
    try {
      const response = await fetch("/api/account/store/reviews/" + review.id, { method: "DELETE", credentials: "include" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Não foi possível excluir.");
      setItems(items => items.map(item => item.id === review.id ? { ...item, status: "hidden" } : item));
      setMessage("Avaliação removida do perfil público. A atualização pode levar até um minuto.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro ao excluir avaliação.");
    } finally { setBusy(null); }
  }

  return (
    <section aria-label="Moderação das avaliações" className="mt-6 rounded-[24px] border border-[#E5E9F2] bg-white p-5 shadow-card sm:p-7">
      <h2 className="text-lg font-extrabold text-cnc-text-strong">Avaliações da minha loja</h2>
      <p className="mt-1 text-sm leading-relaxed text-cnc-muted">Aqui você pode excluir uma avaliação da exibição pública. A exclusão mantém o registro para auditoria do portal.</p>
      {loading ? <p role="status" className="mt-4 text-sm text-cnc-muted">Carregando avaliações...</p> : null}
      {message ? <p role="status" className="mt-3 text-sm text-cnc-text-strong">{message}</p> : null}
      {!loading && !items.length && !message ? <p className="mt-4 text-sm text-cnc-muted">Sua loja ainda não recebeu avaliações.</p> : null}
      {items.length ? <ul className="mt-4 space-y-3">
        {items.map(item => <li key={item.id} className="rounded-xl border border-cnc-line p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-bold text-cnc-text-strong">{item.author}</span>
            <span className="text-xs text-cnc-muted">{item.status === "hidden" ? "Excluída do perfil" : "Visível publicamente"}</span>
          </div>
          <p aria-label={item.rating + " de 5 estrelas"} className="text-amber-500">{"★".repeat(Math.max(1, Math.min(5, item.rating)))}</p>
          <p className="mt-2 break-words text-sm text-cnc-muted">{item.body}</p>
          {item.status === "published" ?
            <button type="button" onClick={() => remove(item)} disabled={busy !== null} className="mt-3 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50">
              {busy === item.id ? "Excluindo..." : "Excluir avaliação"}
            </button> : null}
        </li>)}
      </ul> : null}
    </section>
  );
}
