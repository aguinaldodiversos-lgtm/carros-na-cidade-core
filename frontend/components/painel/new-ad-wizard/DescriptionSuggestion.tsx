"use client";

import { useEffect, useRef, useState } from "react";
import { WIZARD_STORAGE_KEY, type WizardFormState } from "./types";

/**
 * Botão "Gerar sugestão" do passo de Revisão (Fase 4.5).
 *
 * Regras de comportamento que vêm do briefing:
 *   • o texto é SUGESTÃO — a microcopy diz isso e o textarea segue editável;
 *   • se já houver texto, confirma antes de substituir;
 *   • falha NUNCA bloqueia a publicação: mostra recado curto e deixa o
 *     textarea intocado.
 *
 * A confirmação é inline em vez de `window.confirm` porque o diálogo nativo
 * trava a aba e some do fluxo visual do card.
 */

const ENDPOINT = "/api/painel/descricao-sugestao";
const GENERIC_ERROR = "Não foi possível gerar agora. Tente de novo em instantes.";
const DRAFT_ID_KEY = `${WIZARD_STORAGE_KEY}:draft-id`;

/**
 * Interruptor de exibição — default DESLIGADO.
 *
 * O endpoint depende de um provedor de IA (`AI_LOCAL_URL` ou `OPENAI_API_KEY`)
 * que hoje NÃO está configurado. Sem este gate, o botão apareceria em produção
 * e falharia em 100% dos cliques: pior que não existir.
 *
 * Ligar junto com o provedor, no build do frontend:
 *   NEXT_PUBLIC_AD_DESCRIPTION_SUGGESTION_ENABLED=true
 *
 * É `NEXT_PUBLIC_*` porque o wizard é client component — o valor é embutido no
 * build, então mudar a env exige rebuild do frontend, não só restart.
 */
export const SUGGESTION_UI_ENABLED =
  process.env.NEXT_PUBLIC_AD_DESCRIPTION_SUGGESTION_ENABLED === "true";

/**
 * Id estável do rascunho, guardado ao lado do wizard no localStorage.
 *
 * Serve ao balde de rate limit "por rascunho" do backend. É uma trava de uso
 * normal, não de abuso: o valor vem do cliente e pode ser trocado. Quem segura
 * abuso é o limite por usuário, que usa o id do JWT.
 */
function readDraftId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(DRAFT_ID_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(DRAFT_ID_KEY, generated);
    return generated;
  } catch {
    // localStorage bloqueado (aba privada / cookies desligados): seguimos sem
    // id. O backend cai no balde "sem-rascunho" e o limite por usuário vale.
    return "";
  }
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Wand() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M12 3l1.3 3.4L16.7 7.7 13.3 9 12 12.4 10.7 9 7.3 7.7l3.4-1.3L12 3Zm6.5 8l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2ZM5 13l.9 2.3L8.2 16l-2.3.9L5 19l-.9-2.1L1.8 16l2.3-.7L5 13Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  state: WizardFormState;
  /** Aplica o texto sugerido no formulário. */
  onApply: (text: string) => void;
  /** Só para teste: permite exercitar a UI sem depender da env de build. */
  forceEnabled?: boolean;
};

export default function DescriptionSuggestion({ state, onApply, forceEnabled }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [applied, setApplied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const hasText = state.description.trim().length > 0;
  const canGenerate = state.brandLabel.trim().length > 0 || state.modelLabel.trim().length > 0;
  const enabled = forceEnabled ?? SUGGESTION_UI_ENABLED;

  async function generate() {
    if (loading) return;
    setConfirming(false);
    setLoading(true);
    setError("");
    setApplied(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          draftId: readDraftId(),
          brandLabel: state.brandLabel,
          modelLabel: state.modelLabel,
          versionLabel: state.versionLabel,
          yearModel: state.yearModel,
          yearManufacture: state.yearManufacture,
          color: state.color,
          fuel: state.fuel,
          transmission: state.transmission,
          bodyStyle: state.bodyStyle,
          mileage: state.mileage,
          armored: state.armored,
          vehicleOptionKeys: state.vehicleOptionKeys,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        suggestion?: string;
        message?: string;
      } | null;

      if (!response.ok || !data?.ok || typeof data.suggestion !== "string" || !data.suggestion) {
        setError(data?.message || GENERIC_ERROR);
        return;
      }

      onApply(data.suggestion);
      setApplied(true);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function handleClick() {
    setError("");
    if (hasText) {
      setConfirming(true);
      return;
    }
    void generate();
  }

  // Desligado: fica só o rótulo, exatamente como era antes da Fase 4.5.
  if (!enabled) {
    return (
      <span className="mb-2 block text-sm font-semibold text-cnc-text-strong">
        Descrição do anúncio (opcional)
      </span>
    );
  }

  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <span className="text-sm font-semibold text-cnc-text-strong">
        Descrição do anúncio (opcional)
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {applied && !loading ? (
          <span className="text-xs font-medium text-cnc-muted" data-testid="suggestion-hint">
            Sugestão gerada — revise antes de publicar.
          </span>
        ) : null}

        <button
          type="button"
          onClick={handleClick}
          disabled={loading || !canGenerate}
          data-testid="generate-description"
          aria-busy={loading}
          title={
            canGenerate
              ? "Cria um texto a partir dos dados que você preencheu"
              : "Preencha marca e modelo do veículo primeiro"
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary-soft/40 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-55"
        >
          {loading ? <Spinner /> : <Wand />}
          {loading ? "Gerando…" : "Gerar sugestão"}
        </button>
      </div>

      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Confirmar substituição da descrição"
          className="w-full rounded-xl border border-cnc-warning/40 bg-amber-50 px-4 py-3"
        >
          <p className="text-sm font-medium text-amber-900">
            Isso vai substituir o texto atual da descrição.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => void generate()}
              data-testid="confirm-replace"
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-bold text-white transition hover:bg-primary-strong"
            >
              Substituir
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              data-testid="cancel-replace"
              className="inline-flex h-8 items-center rounded-lg border border-cnc-line bg-white px-3 text-xs font-bold text-cnc-text-strong transition hover:bg-cnc-bg"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" data-testid="suggestion-error" className="w-full text-sm text-cnc-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
