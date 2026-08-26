"use client";

/**
 * "Informações do veículo" — a ficha técnica curta (Fase 4.11A, §13 e §14).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE NÃO ESTÁ AQUI, E POR QUE NÃO PODE ESTAR
 * ════════════════════════════════════════════════════════════════════════════
 * A referência visual desta fase mostra PORTAS, COR, PLACA e CHASSI. Nenhum dos
 * quatro entra:
 *
 *   portas, cor  — não existem. `sale_requests` não tem essas colunas e o
 *                  formulário de publicação nunca as pergunta. Derivá-las da
 *                  descrição FIPE seria adivinhação apresentada como declaração
 *                  do proprietário;
 *   placa        — é dado pessoal. Identifica o veículo e, por consulta, quem o
 *                  possui. Mascarada ("F**4A56") continua sendo um identificador
 *                  parcial que o produto não precisa entregar antes do handoff;
 *   chassi       — idem, e pior: é o identificador único do bem.
 *
 * O §46 é explícito ("nenhuma PII nova") e o §3 também ("se algum dado
 * necessário não existir: NÃO inventar"). Uma referência visual é um alvo de
 * layout, não uma autorização de contrato de dados.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * "ANO", E NÃO "ANO/MODELO"
 * ════════════════════════════════════════════════════════════════════════════
 * A solicitação guarda UM ano (`sale_requests.year`). "2024/2024" exigiria um
 * ano de modelo que ninguém coletou — e repetir o mesmo número dos dois lados da
 * barra fabricaria uma coincidência que pode ser falsa (um 2023/2024 sairia
 * como 2023/2023). O rótulo diz o que o dado é.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * GRADE COMPACTA, NÃO CINCO CARTÕES (§14)
 * ════════════════════════════════════════════════════════════════════════════
 * Um cartão por campo produziria dez bordas para cinco dados e forçaria leitura
 * linha a linha. Aqui é ícone discreto + rótulo pequeno + valor forte, numa
 * grade que se lê em varredura horizontal.
 */

export type VehicleInfoItem = {
  label: string;
  value: string;
  icon: React.ReactNode;
};

export const VEHICLE_INFO_ICON = {
  calendar: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  gauge: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="M12 18l4-5" />
    </svg>
  ),
  fuel: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M5 20V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15M4 20h10" />
      <path d="M16 9l2 2v6a1.6 1.6 0 0 0 3 0V8l-2.5-2.5" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 4v16M7 7v4a5 5 0 0 0 10 0V7" />
      <circle cx="7" cy="5.5" r="1.6" />
      <circle cx="17" cy="5.5" r="1.6" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  ),
} as const;

export default function OpportunityVehicleInfo({ items }: { items: VehicleInfoItem[] }) {
  return (
    <section
      className="rounded-2xl border border-[#E5E9F2] bg-white p-4 sm:p-5"
      data-testid="dealer-detail-vehicle-info"
    >
      <h2 className="mb-4 flex items-center gap-2 text-[14px] font-bold text-[#161f34]">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF4FF] text-[#0e62d8]"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 7.6v.9" />
          </svg>
        </span>
        Informações do veículo
      </h2>

      {/*
        2 colunas no celular, 3 no tablet, 5 no desktop — uma linha só na largura
        cheia, que é a varredura do §14. `min-w-0` + `truncate` no valor impedem
        que "200.000 km" empurre a grade e crie rolagem horizontal em 360px.
      */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4F7FC] text-[#0e62d8]"
              aria-hidden="true"
            >
              {item.icon}
            </span>
            <div className="min-w-0">
              <dt className="text-[11px] leading-tight text-[#98A2B3]">{item.label}</dt>
              <dd className="truncate text-[13.5px] font-semibold leading-tight text-[#1D2440]">
                {item.value}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}
