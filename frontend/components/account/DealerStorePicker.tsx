"use client";

import type { DealerStoreOption } from "@/lib/sale-requests/dealer-api";

/**
 * "Comprando como" — a escolha de qual loja está comprando.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTA TELA EXISTE
 * ────────────────────────────────────────────────────────────────────────────
 * Uma proposta grava `advertiser_id`: ela afirma que ESTA EMPRESA ofereceu ESTE
 * valor. Quando a conta tem mais de uma loja, o servidor não tem como saber qual
 * delas está comprando — e escolher por conta própria (a mais antiga, a
 * primeira, a de menor id) registraria a oferta em nome de uma empresa que talvez
 * não a tenha feito.
 *
 * Por isso o servidor responde 409 pedindo a escolha, em vez de adivinhar. Este
 * componente é o que transforma esse 409 numa pergunta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A ESCOLHA NÃO É PERSISTIDA
 * ────────────────────────────────────────────────────────────────────────────
 * Nada de `localStorage`. A seleção vive na URL (`?loja=`), o que a torna
 * compartilhável entre as telas do módulo e some quando o lojista sai — e, mais
 * importante, **não é autorização**: o servidor confronta o valor com as lojas do
 * usuário a cada request. Um `?loja=` adulterado não abre porta nenhuma; recebe
 * 403.
 *
 * O lojista com UMA loja só nunca vê esta tela: não há o que escolher, e pedir
 * uma escolha seria atrito puro.
 */
export default function DealerStorePicker({
  stores,
  onSelect,
}: {
  stores: DealerStoreOption[];
  onSelect: (advertiserId: number) => void;
}) {
  return (
    <section
      className="rounded-2xl border border-[#E5E9F2] bg-white p-6 sm:p-8"
      data-testid="dealer-store-picker"
    >
      <h2 className="text-base font-bold text-[#161f34]">Comprando como</h2>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-[#64748b]">
        Sua conta tem mais de uma loja. Escolha qual delas vai avaliar e comprar —
        a proposta fica registrada em nome dela.
      </p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {stores.map((store) => (
          <li key={store.advertiser_id}>
            <button
              type="button"
              onClick={() => onSelect(store.advertiser_id)}
              className="flex w-full flex-col items-start gap-0.5 rounded-xl border border-[#E5E9F2] bg-white p-4 text-left transition hover:border-[#0e62d8] hover:bg-[#F9FBFF] focus:border-[#0e62d8] focus:outline-none"
              data-testid="dealer-store-option"
            >
              <span className="text-[14px] font-bold text-[#1D2440]">
                {store.name || `Loja ${store.advertiser_id}`}
              </span>
              <span className="text-[12px] text-[#64748b]">
                {store.city.name}
                {store.city.state ? ` - ${store.city.state}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
