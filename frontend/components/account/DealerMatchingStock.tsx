"use client";

import { useCallback, useEffect, useState } from "react";
import { VehicleImage } from "@/components/ui/VehicleImage";
import {
  BUDGET_RELATION_CLASS,
  BUDGET_RELATION_LABEL,
  fetchMatchingAds,
  formatVehiclePrice,
  sendVehicleToBuyer,
  vehicleAttributes,
  type MatchingAd,
  type MatchingAdsPage,
} from "@/lib/purchase-intents/offers";

/**
 * "Veículos do seu estoque" — a seção de envio, na tela da oportunidade.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * COMPONENTE SEPARADO, DE PROPÓSITO
 * ────────────────────────────────────────────────────────────────────────────
 * A procura é o conteúdo PRINCIPAL da página. Se a lista de estoque falhar, a
 * oportunidade tem de continuar na tela — daí este componente ter o próprio
 * fetch e o próprio estado de erro, em vez de participar do carregamento do
 * `DealerOpportunityDetail`. Um único `try` cobrindo as duas coisas trocaria
 * "não consegui listar seu estoque" por uma página de erro inteira.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO É O `AdCard` PÚBLICO
 * ────────────────────────────────────────────────────────────────────────────
 * `components/ads/AdCard` é o card OFICIAL do catálogo — e carrega junto o que
 * o catálogo precisa e esta tela não: favoritos, selos públicos de confiança
 * (`resolvePublicAdBadges`), `buildAdHref` para a rota pública e a semântica de
 * vitrine. Montá-lo aqui traria comportamento de superfície pública para dentro
 * da área privada. O que É reaproveitado é o que faz sentido reaproveitar:
 * `VehicleImage`, o componente único de imagem de veículo, com todo o
 * tratamento de R2/proxy/fallback.
 *
 * Nenhuma regra de negócio vive aqui. Compatibilidade, posse, limite e
 * disponibilidade são decididos no backend; esta tela renderiza o veredito.
 */

const SKELETON_KEYS = ["a", "b"];

function BudgetBadge({ relation }: { relation: MatchingAd["budget_relation"] }) {
  if (!relation) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${BUDGET_RELATION_CLASS[relation]}`}
      data-testid="matching-ad-budget"
    >
      {BUDGET_RELATION_LABEL[relation]}
    </span>
  );
}

function MatchingAdCard({
  ad,
  onSend,
  sending,
  blockedByLimit,
}: {
  ad: MatchingAd;
  onSend: (adId: MatchingAd["ad_id"]) => void;
  sending: boolean;
  blockedByLimit: boolean;
}) {
  const attributes = vehicleAttributes(ad);

  return (
    <li
      className="rounded-2xl border border-[#e8ecf4] bg-white p-3 sm:p-4"
      data-testid="matching-ad-card"
    >
      {/* Mobile: foto em cima, texto embaixo. A partir de `sm`, foto à esquerda.
          Comprimir a foto em 360px deixaria o carro irreconhecível — que é
          justamente o que o lojista usa para escolher. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="shrink-0 overflow-hidden rounded-xl sm:w-[168px]">
          <VehicleImage
            src={ad.main_image}
            alt={ad.vehicle_name}
            width={336}
            height={252}
            variant="card"
            className="h-40 w-full object-cover sm:h-[126px]"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3
              className="min-w-0 break-words text-base font-bold text-[#161f34]"
              data-testid="matching-ad-name"
            >
              {ad.vehicle_name}
            </h3>
            <BudgetBadge relation={ad.budget_relation} />
          </div>

          {attributes.length > 0 ? (
            <p className="mt-1 text-sm text-[#64748b]">{attributes.join(" · ")}</p>
          ) : null}

          <p className="mt-2 text-lg font-bold text-[#161f34]" data-testid="matching-ad-price">
            {formatVehiclePrice(ad.price)}
          </p>

          <div className="mt-3">
            {ad.already_sent ? (
              <span
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[#a7e3c0] bg-[#f0fbf4] px-4 text-sm font-bold text-[#15803d] sm:w-auto sm:min-w-[200px]"
                data-testid="matching-ad-sent"
              >
                ✓ Enviado
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onSend(ad.ad_id)}
                // A trava de clique duplo é `sending`: o botão desabilita no
                // primeiro clique e só volta quando a resposta chega. O banco
                // continua sendo a garantia final (índice único), mas evitar a
                // segunda request também evita o piscar de "Enviando…" duplo.
                disabled={sending || blockedByLimit}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#0e62d8] px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[200px]"
                data-testid="matching-ad-send"
              >
                {sending ? "Enviando…" : "Enviar ao comprador"}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function DealerMatchingStock({ intentId }: { intentId: number }) {
  const [page, setPage] = useState<MatchingAdsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPage(await fetchMatchingAds(intentId));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Não foi possível carregar seu estoque."
      );
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [intentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSend = useCallback(
    async (adId: MatchingAd["ad_id"]) => {
      if (sendingId) return;
      setSendingId(String(adId));
      setSendError(null);

      try {
        await sendVehicleToBuyer(intentId, adId);

        // Atualiza SÓ o que mudou, sem recarregar a página inteira: o card vira
        // "Enviado" e o contador de vagas anda. Um reload completo devolveria o
        // lojista ao topo da lista depois de cada envio.
        //
        // `already_sent` é marcado tanto num envio novo quanto num retry
        // idempotente — nos dois casos o veículo ESTÁ com o comprador, que é o
        // que o selo comunica.
        setPage((current) => {
          if (!current) return current;
          const alreadyMarked = current.matching_ads.some(
            (ad) => String(ad.ad_id) === String(adId) && ad.already_sent
          );
          const used = alreadyMarked ? current.limit.used : current.limit.used + 1;

          return {
            matching_ads: current.matching_ads.map((ad) =>
              String(ad.ad_id) === String(adId) ? { ...ad, already_sent: true } : ad
            ),
            limit: {
              ...current.limit,
              used,
              remaining: Math.max(0, current.limit.max_per_dealer - used),
            },
          };
        });
      } catch (submitError) {
        setSendError(
          submitError instanceof Error
            ? submitError.message
            : "Não foi possível enviar o veículo. Tente novamente."
        );
      } finally {
        setSendingId(null);
      }
    },
    [intentId, sendingId]
  );

  const limitReached = Boolean(page && page.limit.remaining <= 0);

  return (
    <section className="mt-8" data-testid="dealer-matching-stock">
      <h2 className="text-lg font-bold text-[#161f34]">Veículos do seu estoque</h2>
      <p className="mt-1 text-sm leading-relaxed text-[#64748b]">
        Selecione um veículo compatível para enviar a este comprador.
      </p>

      {loading ? (
        <ul className="mt-4 grid gap-4" data-testid="dealer-matching-stock-loading">
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

      {/* Erro DISCRETO: a oportunidade acima continua legível e utilizável. */}
      {!loading && error ? (
        <div
          className="mt-4 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-5 text-center"
          data-testid="dealer-matching-stock-error"
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

      {!loading && !error && page && page.matching_ads.length === 0 ? (
        <div
          className="mt-4 rounded-2xl border border-dashed border-[#cfd8e8] bg-white p-6 text-center sm:p-8"
          data-testid="dealer-matching-stock-empty"
        >
          <p className="text-base font-semibold text-[#161f34]">
            Nenhum veículo do seu estoque combina com esta procura.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#64748b]">
            Só aparecem aqui anúncios ativos seus com a mesma marca, modelo e câmbio que o comprador
            pediu.
          </p>
        </div>
      ) : null}

      {!loading && !error && page && page.matching_ads.length > 0 ? (
        <>
          {limitReached ? (
            <p
              className="mt-4 rounded-2xl border border-[#fcd9a8] bg-[#fff7ed] px-4 py-3 text-sm leading-relaxed text-[#b45309]"
              data-testid="dealer-matching-stock-limit"
            >
              Você já enviou {page.limit.max_per_dealer} veículos disponíveis para este comprador.
              Quando um deles for vendido ou pausado, você libera uma vaga.
            </p>
          ) : (
            <p className="mt-4 text-sm text-[#64748b]" data-testid="dealer-matching-stock-remaining">
              {page.limit.remaining === 1
                ? "Você ainda pode enviar 1 veículo para este comprador."
                : `Você ainda pode enviar ${page.limit.remaining} veículos para este comprador.`}
            </p>
          )}

          {sendError ? (
            <p
              className="mt-3 rounded-[14px] border border-[#F4C7C3] bg-[#FFF4F3] px-4 py-3 text-sm text-[#B42318]"
              role="alert"
              data-testid="dealer-matching-stock-send-error"
            >
              {sendError}
            </p>
          ) : null}

          <ul className="mt-4 grid gap-4">
            {page.matching_ads.map((ad) => (
              <MatchingAdCard
                key={String(ad.ad_id)}
                ad={ad}
                onSend={(adId) => void handleSend(adId)}
                sending={sendingId === String(ad.ad_id)}
                blockedByLimit={limitReached && !ad.already_sent}
              />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
