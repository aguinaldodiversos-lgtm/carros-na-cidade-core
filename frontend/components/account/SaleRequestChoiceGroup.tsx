"use client";

import { fieldDomId, fieldErrorDomId } from "@/lib/sale-requests/evaluation";
import type { ChoiceOption } from "@/lib/sale-requests/api";

/**
 * Grupo de escolha ÚNICA da ficha.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * RADIO NATIVO, SEMPRE
 * ────────────────────────────────────────────────────────────────────────────
 * O visual é de cartão/pílula, mas o controle por baixo é `input[type=radio]`
 * dentro de `fieldset`/`legend`. Nada de `div` com `onClick` e `role`: o radio
 * nativo já traz navegação por setas, agrupamento por `name`, anúncio de "1 de
 * 6" pelo leitor de tela e o comportamento de formulário que o teclado espera.
 * Reimplementar isso à mão é como se perde acessibilidade sem perceber.
 *
 * O radio fica VISÍVEL (não escondido atrás do rótulo) porque a seleção precisa
 * de um sinal que não seja só a cor de fundo — quem não distingue o azul claro
 * do branco continua vendo qual está marcado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ERRO
 * ────────────────────────────────────────────────────────────────────────────
 * `aria-invalid` em cada opção e `aria-describedby` apontando para a mensagem,
 * que tem `role="alert"`. O primeiro input carrega o `id` previsível do campo —
 * é por ele que o formulário dá foco quando a pessoa tenta enviar incompleto.
 */

type Layout = "cards" | "pills" | "stack";

const LAYOUT_CLASS: Record<Layout, string> = {
  // Cartões com descrição: uma coluna no mobile, duas a partir de sm.
  cards: "grid gap-2 sm:grid-cols-2",
  // Pílulas curtas: quebram para a linha seguinte, nunca estouram a largura.
  pills: "flex flex-wrap gap-2",
  // Empilhado: para listas longas de rótulo comprido.
  stack: "grid gap-2 sm:grid-cols-2",
};

export default function SaleRequestChoiceGroup<T extends string>({
  field,
  legend,
  options,
  value,
  onChange,
  layout = "pills",
  error,
  hint,
  disabled = false,
}: {
  /** Chave do campo — vira o `id` do primeiro input e o `name` do grupo. */
  field: string;
  legend: string;
  options: ReadonlyArray<ChoiceOption<T>>;
  value: T | "";
  onChange: (value: T) => void;
  layout?: Layout;
  /** Mensagem já resolvida pelo formulário; `null` quando não há pendência. */
  error?: string | null;
  hint?: string;
  disabled?: boolean;
}) {
  const errorId = fieldErrorDomId(field);
  const hasError = Boolean(error);

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 block text-[13px] font-semibold text-[#33405A]">{legend}</legend>

      {hint ? <p className="mb-2 -mt-1 text-xs text-[#64748b]">{hint}</p> : null}

      <div className={LAYOUT_CLASS[layout]} data-testid={`choice-${field}`}>
        {options.map((option, index) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex min-w-0 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                selected
                  ? "border-[#1F66E5] bg-[#F5F9FF]"
                  : hasError
                    ? "border-[#FDA29B] bg-white hover:bg-[#FFFBFA]"
                    : "border-[#E5E9F2] bg-white hover:bg-[#F9FBFF]"
              } ${layout === "pills" ? "grow sm:grow-0" : ""}`}
            >
              <input
                // Só o PRIMEIRO recebe o id previsível: `document.getElementById`
                // precisa de um alvo único, e o grupo inteiro é alcançado a
                // partir dele pela navegação nativa de radio.
                id={index === 0 ? fieldDomId(field) : undefined}
                type="radio"
                name={field}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                aria-invalid={hasError || undefined}
                aria-describedby={hasError ? errorId : undefined}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#1F66E5]"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-tight text-[#1D2440]">
                  {option.label}
                </span>
                {option.hint ? (
                  <span className="mt-0.5 block text-[11px] leading-tight text-[#64748b]">
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-xs font-medium text-[#b42318]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Grupo de MÚLTIPLA escolha (checkbox). Usado só pelos detalhes de lataria.
 *
 * Separado do de escolha única em vez de virar uma prop `multiple`: o tipo do
 * valor muda (`T` vira `T[]`), o elemento muda (`radio` vira `checkbox`) e a
 * semântica de "desmarcar" muda. Uma prop booleana ligando dois componentes
 * diferentes economizaria um arquivo e custaria a clareza dos dois.
 */
export function SaleRequestCheckboxGroup<T extends string>({
  field,
  legend,
  options,
  values,
  onToggle,
  error,
  hint,
}: {
  field: string;
  legend: string;
  options: ReadonlyArray<ChoiceOption<T>>;
  values: T[];
  onToggle: (value: T) => void;
  error?: string | null;
  hint?: string;
}) {
  const errorId = fieldErrorDomId(field);
  const hasError = Boolean(error);

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 block text-[13px] font-semibold text-[#33405A]">{legend}</legend>

      {hint ? <p className="mb-2 -mt-1 text-xs text-[#64748b]">{hint}</p> : null}

      <div className="flex flex-wrap gap-2" data-testid={`choice-${field}`}>
        {options.map((option, index) => {
          const selected = values.includes(option.value);
          return (
            <label
              key={option.value}
              className={`flex min-w-0 grow cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition sm:grow-0 ${
                selected
                  ? "border-[#1F66E5] bg-[#F5F9FF]"
                  : hasError
                    ? "border-[#FDA29B] bg-white hover:bg-[#FFFBFA]"
                    : "border-[#E5E9F2] bg-white hover:bg-[#F9FBFF]"
              }`}
            >
              <input
                id={index === 0 ? fieldDomId(field) : undefined}
                type="checkbox"
                name={field}
                value={option.value}
                checked={selected}
                onChange={() => onToggle(option.value)}
                aria-invalid={hasError || undefined}
                aria-describedby={hasError ? errorId : undefined}
                className="h-4 w-4 shrink-0 accent-[#1F66E5]"
              />
              <span className="text-[13px] font-semibold leading-tight text-[#1D2440]">
                {option.label}
              </span>
            </label>
          );
        })}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-xs font-medium text-[#b42318]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
