"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { VehicleImage } from "@/components/ui/VehicleImage";
import {
  BUDGET_RELATION_CLASS,
  BUYER_BUDGET_RELATION_LABEL,
  OFFER_ERROR_CODE,
  OffersApiError,
  fetchReceivedOffers,
  formatOfferCount,
  formatVehiclePrice,
  requestOfferWhatsapp,
  vehicleAttributes,
  vehicleHref,
  type ReceivedOffer,
} from "@/lib/purchase-intents/offers";

/**
 * "Veículos enviados para você" — a área do comprador na procura.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O CARD É VIVO
 * ────────────────────────────────────────────────────────────────────────────
 * Preço, foto, quilometragem e disponibilidade vêm do ANÚNCIO no momento do
 * fetch, nunca de uma cópia guardada quando o lojista enviou. Se a loja baixar
 * o preço, o comprador vê o novo valor no próximo carregamento. Sem WebSocket e
 * sem polling: "atualizado" aqui significa "no próximo request".
 *
 * ────────────────────────────────────────────────────────────────────────────
 * INDISPONÍVEL NÃO É APAGADO
 * ────────────────────────────────────────────────────────────────────────────
 * Veículo vendido, pausado ou de loja bloqueada continua na lista, marcado como
 * indisponível e SEM o link público — mandar o comprador para uma página que
 * não existe mais seria pior do que dizer que o carro saiu. A opção fez parte
 * da história da procura dele, e sumir com ela deixaria a contagem de opções
 * mudando sozinha entre duas visitas.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O BOTÃO DE WHATSAPP ABRE UMA CONVERSA — NÃO AGENDA NADA
 * ────────────────────────────────────────────────────────────────────────────
 * "Agendar visita pelo WhatsApp" leva o comprador para a conversa com a loja,
 * com uma mensagem já escrita. Nada foi agendado: não há dia, hora, nem
 * compromisso registrado em lugar nenhum. Por isso a tela nunca diz "visita
 * agendada" ou "horário reservado" — quem combina isso são as duas pessoas, no
 * WhatsApp.
 *
 * A URL é pedida ao SERVIDOR a cada clique e nunca guardada no card: é assim
 * que um veículo pausado há dez minutos deixa de abrir conversa. O telefone da
 * loja não vem no payload da listagem — só existe dentro da URL que o backend
 * devolve depois da ação explícita do comprador.
 *
 * Continua SEM chat interno, sem caixa de mensagem e sem agenda: o WhatsApp é o
 * canal, e o portal não precisa virar um para concluir esta etapa do funil.
 */

const SKELETON_KEYS = ["a", "b"];

function ReceivedVehicleCard({
  offer,
  onWhatsapp,
  whatsappPending,
  whatsappError,
}: {
  offer: ReceivedOffer;
  onWhatsapp: (offer: ReceivedOffer) => void;
  whatsappPending: boolean;
  whatsappError: string | null;
}) {
  const { vehicle, dealer, budget_relation: budgetRelation } = offer;
  const attributes = vehicleAttributes(vehicle);
  const href = vehicle.available ? vehicleHref(vehicle.slug) : null;

  return (
    <li
      className="rounded-2xl border border-[#e8ecf4] bg-white p-3 sm:p-4"
      data-testid="received-vehicle-card"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="shrink-0 overflow-hidden rounded-xl sm:w-[168px]">
          <VehicleImage
            src={vehicle.main_image}
            alt={vehicle.vehicle_name}
            width={336}
            height={252}
            variant="card"
            className={`h-40 w-full object-cover sm:h-[126px] ${
              vehicle.available ? "" : "opacity-60 grayscale"
            }`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3
              className="min-w-0 break-words text-base font-bold text-[#161f34]"
              data-testid="received-vehicle-name"
            >
              {vehicle.vehicle_name}
            </h3>

            {vehicle.available && budgetRelation ? (
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${BUDGET_RELATION_CLASS[budgetRelation]}`}
                data-testid="received-vehicle-budget"
              >
                {BUYER_BUDGET_RELATION_LABEL[budgetRelation]}
              </span>
            ) : null}

            {!vehicle.available ? (
              <span
                className="inline-flex shrink-0 items-center rounded-full border border-[#cfd8e8] bg-[#f3f4f6] px-2.5 py-1 text-xs font-semibold text-[#475569]"
                data-testid="received-vehicle-unavailable"
              >
                Indisponível
              </span>
            ) : null}
          </div>

          {attributes.length > 0 ? (
            <p className="mt-1 text-sm text-[#64748b]">{attributes.join(" · ")}</p>
          ) : null}

          <p className="mt-2 text-lg font-bold text-[#161f34]" data-testid="received-vehicle-price">
            {formatVehiclePrice(vehicle.price)}
          </p>

          {dealer.name ? (
            <p className="mt-1 text-sm text-[#64748b]" data-testid="received-vehicle-dealer">
              {dealer.name}
            </p>
          ) : null}

          {/* CTAs. No mobile empilham (`flex-col`, `w-full`); a partir de `sm`
              ficam lado a lado. O WhatsApp vem PRIMEIRO em ambos: o comprador
              já passou da etapa de descobrir o carro e está na de falar com a
              loja — "Ver anúncio" é a consulta, não a ação. */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            {vehicle.available ? (
              <button
                type="button"
                onClick={() => onWhatsapp(offer)}
                // A trava de clique duplo é `whatsappPending`: o botão desabilita
                // no primeiro clique e só volta quando a resposta chega. Sem ela,
                // dois cliques abririam DUAS abas do WhatsApp.
                disabled={whatsappPending}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#1f9d55] px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[240px]"
                data-testid="received-vehicle-whatsapp"
              >
                {whatsappPending ? "Abrindo WhatsApp…" : "Agendar visita pelo WhatsApp"}
              </button>
            ) : null}

            {href ? (
              <Link
                href={href}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[#dbe7fb] bg-[#eff5ff] px-4 text-sm font-bold text-[#0e62d8] transition hover:bg-[#e2edff] sm:w-auto sm:min-w-[160px]"
                data-testid="received-vehicle-link"
              >
                Ver anúncio
              </Link>
            ) : (
              <p className="text-sm text-[#64748b]" data-testid="received-vehicle-gone">
                Este veículo não está mais disponível.
              </p>
            )}
          </div>

          {/* Erro POR CARD, e não da seção inteira: com uma mensagem global, o
              comprador com três veículos não saberia qual deles falhou. */}
          {whatsappError ? (
            <p
              className="mt-2 rounded-[14px] border border-[#F4C7C3] bg-[#FFF4F3] px-3 py-2 text-sm text-[#B42318]"
              role="alert"
              data-testid="received-vehicle-whatsapp-error"
            >
              {whatsappError}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default function ReceivedVehicles({ intentId }: { intentId: number }) {
  const [offers, setOffers] = useState<ReceivedOffer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Oferta cujo WhatsApp está sendo resolvido agora. Só uma por vez. */
  const [whatsappPendingId, setWhatsappPendingId] = useState<string | null>(null);
  const [whatsappErrors, setWhatsappErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchReceivedOffers(intentId);
      setOffers(page.offers);
    } catch {
      // Mensagem própria e discreta: a procura acima é o conteúdo principal e
      // continua na tela. Detalhe técnico do erro não ajuda o comprador aqui.
      setError("Não foi possível carregar os veículos recebidos.");
      setOffers(null);
    } finally {
      setLoading(false);
    }
  }, [intentId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Resolve o WhatsApp e abre a conversa.
   *
   * A URL é pedida ao SERVIDOR a cada clique — nunca guardada no card. É o que
   * garante que um veículo pausado há dez minutos não abra conversa: quem
   * decide é o backend, no instante do clique, e não o estado que a tela
   * carregou.
   *
   * `window.open` com `noopener,noreferrer`: sem isso a aba do WhatsApp
   * receberia `window.opener` e poderia navegar a aba do painel.
   *
   * Sem detecção de user-agent. O link oficial do WhatsApp já resolve app no
   * celular e Web no desktop; adivinhar aqui só criaria um caminho errado para
   * algum dispositivo que ninguém testou.
   */
  const handleWhatsapp = useCallback(
    async (offer: ReceivedOffer) => {
      const key = String(offer.offer_id);
      if (whatsappPendingId) return; // uma resolução ativa por vez

      setWhatsappPendingId(key);
      setWhatsappErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });

      try {
        const { url } = await requestOfferWhatsapp(intentId, offer.offer_id);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (whatsappError) {
        // Cada motivo tem texto próprio. Um "tente novamente" genérico faria o
        // comprador insistir num botão que nunca vai funcionar (loja sem
        // WhatsApp) ou desistir de um que voltaria a funcionar (falha de rede).
        const code = whatsappError instanceof OffersApiError ? whatsappError.code : null;

        let message = "Não foi possível abrir o WhatsApp da loja. Tente novamente.";
        if (code === OFFER_ERROR_CODE.UNAVAILABLE) {
          message = "Este veículo não está mais disponível.";
          // O backend acabou de dizer que saiu do ar: recarrega a lista para o
          // card refletir isso e o botão sumir, em vez de ficar mentindo.
          void load();
        } else if (code === OFFER_ERROR_CODE.WHATSAPP_UNAVAILABLE) {
          message = "Esta loja não possui WhatsApp disponível para contato no momento.";
        }

        setWhatsappErrors((current) => ({ ...current, [key]: message }));
      } finally {
        setWhatsappPendingId(null);
      }
    },
    [intentId, load, whatsappPendingId]
  );

  return (
    <section className="mt-8" data-testid="received-vehicles">
      <h2 className="text-lg font-bold text-[#161f34]">Veículos enviados para você</h2>

      {loading ? (
        <ul className="mt-4 grid gap-4" data-testid="received-vehicles-loading">
          {SKELETON_KEYS.map((key) => (
            <li key={key} className="rounded-2xl border border-[#e8ecf4] bg-white p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <div className="h-40 w-full animate-pulse rounded-xl bg-[#f1f4f9] sm:h-[126px] sm:w-[168px]" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-[#f1f4f9]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[#f1f4f9]" />
                  <div className="h-6 w-1/3 animate-pulse rounded bg-[#f1f4f9]" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && error ? (
        <div
          className="mt-4 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-5 text-center"
          data-testid="received-vehicles-error"
        >
          <p className="text-sm text-[#b42318]">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 h-11 rounded-xl border border-[#fecaca] bg-white px-5 text-sm font-bold text-[#b42318] transition hover:bg-[#fff5f5]"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {/* Vazio é o estado NORMAL de uma procura recém-publicada. O texto conta o
          que vai acontecer, em vez de anunciar uma ausência. */}
      {!loading && !error && offers && offers.length === 0 ? (
        <div
          className="mt-4 rounded-2xl border border-dashed border-[#cfd8e8] bg-white p-6 text-center sm:p-8"
          data-testid="received-vehicles-empty"
        >
          <p className="text-base font-semibold text-[#161f34]">
            Nenhuma loja enviou um veículo para esta procura ainda.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#64748b]">
            As lojas da sua cidade veem o que você procura. Quando uma delas enviar um veículo, ele
            aparece aqui e você recebe um aviso.
          </p>
        </div>
      ) : null}

      {!loading && !error && offers && offers.length > 0 ? (
        <>
          <p className="mt-1 text-sm text-[#64748b]" data-testid="received-vehicles-count">
            {formatOfferCount(offers.length)}
          </p>
          <ul className="mt-4 grid gap-4">
            {offers.map((offer) => (
              <ReceivedVehicleCard
                key={String(offer.offer_id)}
                offer={offer}
                onWhatsapp={(target) => void handleWhatsapp(target)}
                whatsappPending={whatsappPendingId === String(offer.offer_id)}
                whatsappError={whatsappErrors[String(offer.offer_id)] ?? null}
              />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
