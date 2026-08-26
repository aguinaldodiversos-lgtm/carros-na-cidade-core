"use client";

/**
 * "Avalie com atenção" — o aviso abaixo da referência de mercado (§35).
 *
 * Curto de propósito. O §35 pede um bloco pequeno e proíbe transformá-lo em
 * contrato: um parágrafo jurídico ocupando meia coluna seria rolado sem leitura,
 * e o efeito prático de um aviso que ninguém lê é o de não existir.
 *
 * O texto NÃO promete e NÃO desobriga. Ele diz o que fazer antes de fechar —
 * ver o carro, conferir presencialmente, pedir laudo. As regras operacionais da
 * oferta (compromisso, avaliação presencial) continuam onde sempre estiveram: no
 * painel de negociação, no caminho entre o campo de valor e o botão.
 */
export default function OpportunitySafetyNotice() {
  return (
    <section
      className="rounded-2xl border border-[#DBE7FB] bg-[#F5F9FF] p-4 sm:p-5"
      data-testid="dealer-detail-safety-notice"
    >
      <h2 className="flex items-center gap-2 text-[13.5px] font-bold text-[#0e62d8]">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          aria-hidden="true"
        >
          <path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" />
          <path d="M9.2 12.2l2 2 3.6-3.8" />
        </svg>
        Avalie com atenção
      </h2>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[#3F5C8C]">
        Recomendamos análise completa do veículo, verificação presencial e laudo cautelar
        antes de finalizar sua compra.
      </p>
    </section>
  );
}
