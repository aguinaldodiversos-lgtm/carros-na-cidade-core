"use client";

import { fieldDomId, fieldErrorDomId } from "@/lib/sale-requests/evaluation";
import { formatMoneyInput, moneyDigits } from "@/lib/sale-requests/api";

/**
 * Campos de texto da ficha.
 *
 * Dois primitivos pequenos no mesmo arquivo, de propósito: cada um é usado três
 * ou quatro vezes e nenhum tem lógica própria além de formatação e `aria`. Um
 * arquivo por primitivo dobraria o número de arquivos sem separar nada que
 * estivesse junto.
 */

const INPUT_CLASS =
  "h-11 w-full rounded-xl border bg-white px-3.5 text-[15px] text-[#1D2440] outline-none transition focus:border-[#1F66E5] disabled:bg-[#f6f7f9] disabled:text-[#94a3b8]";

/**
 * Campo monetário — mostra em português, guarda em CENTAVOS.
 *
 * O estado é uma string de dígitos e nada mais. Digitar "18500" produz
 * "R$ 185,00" e continuar digitando produz "R$ 18.500,00": a máscara cresce da
 * direita para a esquerda, como um caixa eletrônico, então não existe cursor no
 * meio do número nem separador que a pessoa tenha de acertar.
 *
 * Guardar o TEXTO formatado seria mais direto de escrever e ambíguo de
 * converter: "1.500" é mil e quinhentos aqui e um e meio no backend. Com
 * centavos, `moneyToDecimal` é uma divisão por 100 — não há o que interpretar.
 *
 * OPCIONAL em todos os usos: quem tem financiamento e não sabe o saldo de
 * cabeça não pode ficar impedido de publicar por causa disso.
 */
export function MoneyField({
  field,
  label,
  value,
  onChange,
  hint,
}: {
  field: string;
  label: string;
  /** Dígitos (centavos). */
  value: string;
  onChange: (digits: string) => void;
  hint?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-[13px] font-semibold text-[#33405A]">
        {label} <span className="font-normal text-[#64748b]">(opcional)</span>
      </span>
      <input
        id={fieldDomId(field)}
        className={`${INPUT_CLASS} border-[#E5E9F2]`}
        value={formatMoneyInput(value)}
        onChange={(event) => onChange(moneyDigits(event.target.value))}
        inputMode="numeric"
        autoComplete="off"
        placeholder="R$ 0,00"
        data-testid={`money-${field}`}
      />
      {hint ? <span className="mt-1 block text-[11px] text-[#64748b]">{hint}</span> : null}
    </label>
  );
}

/**
 * Descrição curta condicional (problema mecânico, local dos detalhes de pintura).
 *
 * `required` é do CHAMADOR: o mesmo componente descreve um problema de motor
 * (obrigatório quando existe problema) e o local de um risco na lataria
 * (sempre opcional). Decidir isso aqui dentro exigiria o componente conhecer o
 * domínio, que é o que a fonte única de validação já faz num lugar só.
 */
export function NotesField({
  field,
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  required = false,
  error,
}: {
  field: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  required?: boolean;
  error?: string | null;
}) {
  const errorId = fieldErrorDomId(field);
  const hasError = Boolean(error);

  return (
    <label className="mt-3 block min-w-0">
      <span className="mb-2 block text-[13px] font-semibold text-[#33405A]">
        {label}{" "}
        {required ? null : <span className="font-normal text-[#64748b]">(opcional)</span>}
      </span>
      <textarea
        id={fieldDomId(field)}
        className={`min-h-[76px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-[15px] text-[#1D2440] outline-none transition focus:border-[#1F66E5] ${
          hasError ? "border-[#FDA29B]" : "border-[#E5E9F2]"
        }`}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        data-testid={`notes-${field}`}
      />
      <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#64748b]">
        <span>
          {error ? (
            <span id={errorId} role="alert" className="font-medium text-[#b42318]">
              {error}
            </span>
          ) : null}
        </span>
        <span aria-hidden="true">
          {value.length}/{maxLength}
        </span>
      </span>
    </label>
  );
}
