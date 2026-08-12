"use client";

/**
 * Botão "Carregar mais" das listas de procuras.
 *
 * `<button>` de verdade, não div clicável: precisa de foco por teclado, Enter e
 * do estado `disabled` que o leitor de tela anuncia.
 *
 * O erro de página seguinte fica AO LADO do botão, discreto, e nunca substitui
 * a lista — quem já tinha 20 cards continua com 20.
 */
export default function LoadMoreButton({
  onClick,
  loading,
  error,
  label = "Carregar mais",
}: {
  onClick: () => void;
  loading: boolean;
  error?: string | null;
  label?: string;
}) {
  return (
    <div className="mt-5 flex flex-col items-center gap-2">
      {error ? (
        <p
          className="text-center text-sm text-[#b42318]"
          role="alert"
          data-testid="load-more-error"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-busy={loading}
        className="h-12 w-full rounded-xl border border-[#dbe7fb] bg-[#eff5ff] px-5 text-sm font-bold text-[#0e62d8] transition hover:bg-[#e2edff] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[220px]"
        data-testid="load-more"
      >
        {loading ? "Carregando…" : error ? "Tentar novamente" : label}
      </button>
    </div>
  );
}
