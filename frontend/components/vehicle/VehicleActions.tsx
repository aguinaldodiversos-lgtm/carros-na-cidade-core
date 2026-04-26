"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import { trackAdEvent } from "@/lib/analytics/public-events";
import { submitVehicleLead } from "@/lib/leads/public-leads";
import { useCityOptional } from "@/lib/city/CityContext";
import { DEFAULT_PUBLIC_CITY_SLUG } from "@/lib/site/public-config";
import {
  buildFinanceLink,
  buildVehicleWhatsappHref,
  digitsOnly,
  estimateMonthlyPayment,
  formatBrl,
  formatPhoneDisplay,
} from "@/lib/vehicle/detail-utils";

type VehicleActionsProps = {
  vehicleId: string;
  vehicleName: string;
  whatsappPhone?: string;
  sellerPhone?: string;
  /** Território do anúncio; se omitido, usa a cidade ativa (cookie). */
  financeCitySlug?: string;
  /** Preço numérico (BRL) para pré-preencher o simulador e estimativa de parcela */
  vehiclePriceNumeric?: number | null;
  priceLabel: string;
  adCode: string;
  fipePrice?: string | null;
  fipeDeltaLine?: string | null;
  publishedLabel?: string | null;
};

type LeadStatus = {
  tone: "success" | "error";
  message: string;
} | null;

export default function VehicleActions({
  vehicleId,
  vehicleName,
  whatsappPhone,
  sellerPhone,
  financeCitySlug,
  vehiclePriceNumeric,
  priceLabel,
  adCode,
  fipePrice,
  fipeDeltaLine,
  publishedLabel,
}: VehicleActionsProps) {
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [loadingLead, setLoadingLead] = useState(false);
  const [leadStatus, setLeadStatus] = useState<LeadStatus>(null);
  const cityCtx = useCityOptional();

  const waLink = useMemo(
    () => buildVehicleWhatsappHref({ phone: whatsappPhone, vehicleName }),
    [vehicleName, whatsappPhone]
  );

  const financeLink = useMemo(() => {
    const slug = financeCitySlug?.trim() || cityCtx?.city.slug || DEFAULT_PUBLIC_CITY_SLUG;
    return buildFinanceLink(vehicleId, slug, vehiclePriceNumeric);
  }, [vehicleId, financeCitySlug, cityCtx?.city.slug, vehiclePriceNumeric]);

  const estimatedInstallment =
    vehiclePriceNumeric != null && vehiclePriceNumeric > 0
      ? estimateMonthlyPayment(vehiclePriceNumeric, 60, 0.2)
      : null;
  const displayedPhone = formatPhoneDisplay(whatsappPhone || sellerPhone);
  const hasWhatsapp = Boolean(waLink);

  async function handleLeadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loadingLead) return;

    const trimmedName = buyerName.trim();
    const normalizedPhone = digitsOnly(buyerPhone);

    if (trimmedName.length < 2) {
      setLeadStatus({
        tone: "error",
        message: "Informe seu nome para solicitar contato.",
      });
      return;
    }

    if (normalizedPhone.length < 10) {
      setLeadStatus({
        tone: "error",
        message: "Informe um WhatsApp com DDD para receber retorno.",
      });
      return;
    }

    try {
      setLoadingLead(true);
      setLeadStatus(null);

      await submitVehicleLead({
        adId: vehicleId,
        buyerName: trimmedName,
        buyerPhone: normalizedPhone,
      });

      trackAdEvent(vehicleId, "lead");

      setLeadStatus({
        tone: "success",
        message: hasWhatsapp
          ? "Lead enviado ao anunciante. Você também pode continuar a conversa pelo WhatsApp."
          : "Lead enviado ao anunciante. O time comercial retornará pelo contato informado.",
      });

      setBuyerName("");
      setBuyerPhone("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível enviar seu contato agora.";

      setLeadStatus({ tone: "error", message });
    } finally {
      setLoadingLead(false);
    }
  }

  function handleFinanceClick() {
    trackAdEvent(vehicleId, "finance");
  }

  function handleWhatsappClick() {
    trackAdEvent(vehicleId, "whatsapp");
  }

  return (
    <>
      <section className="space-y-4">
        <article className="rounded-[28px] border border-[#e2e8f2] bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#7b869d]">
            Fale com o anunciante
          </p>
          <p className="mt-2 text-[14px] leading-6 text-[#5d6880]">
            Entre em contato com o anunciante ou registre seu interesse pelo portal.
          </p>

          <div className="mt-5 rounded-[24px] border border-[#ebf6ef] bg-[#f6fbf8] p-4">
            <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#0d8d6f]">
              Preço anunciado
            </p>
            <p className="mt-2 text-[42px] font-extrabold leading-none tracking-[-0.03em] text-[#0c8f73]">
              {priceLabel}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {fipeDeltaLine ? (
                <span className="inline-flex rounded-full bg-white px-3 py-1 text-[12px] font-bold text-[#197a61]">
                  {fipeDeltaLine}
                </span>
              ) : null}
              {fipePrice ? (
                <span className="inline-flex rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[#556176]">
                  FIPE: {fipePrice}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-4 space-y-2 rounded-[22px] border border-[#eef2f7] bg-[#fafbfd] p-4 text-[13px] leading-6 text-[#556176]">
            <p>
              <span className="font-bold text-[#1d2538]">Código do anúncio:</span> {adCode}
            </p>
            {publishedLabel ? (
              <p>
                <span className="font-bold text-[#1d2538]">Publicação:</span> {publishedLabel}
              </p>
            ) : null}
            {displayedPhone ? (
              <p>
                <span className="font-bold text-[#1d2538]">Contato:</span> {displayedPhone}
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {waLink ? (
              <Link
                data-testid="vehicle-whatsapp-cta"
                href={waLink}
                target="_blank"
                rel="noreferrer"
                onClick={handleWhatsappClick}
                className="inline-flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-[#0e62d8] px-4 text-[16px] font-extrabold text-white shadow-[0_16px_30px_rgba(14,98,216,0.26)] transition hover:bg-[#0b54be]"
              >
                Enviar mensagem no WhatsApp
              </Link>
            ) : (
              <div
                data-testid="vehicle-whatsapp-unavailable"
                className="rounded-2xl border border-[#f1dfdf] bg-[#fff7f7] px-4 py-3 text-[13px] font-semibold text-[#8b4b4b]"
              >
                WhatsApp do anunciante indisponível no momento. Use o formulário oficial abaixo.
              </div>
            )}

            <Link
              href={financeLink}
              onClick={handleFinanceClick}
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[#cfe0ff] bg-white px-4 text-[15px] font-bold text-[#0e62d8] transition hover:bg-[#f5f9ff]"
            >
              Simular financiamento
            </Link>

            {estimatedInstallment != null && estimatedInstallment > 0 ? (
              <div className="rounded-2xl border border-[#dce8df] bg-[#f4fbf7] px-4 py-3 text-[13px] leading-relaxed text-[#3d4a63]">
                <p className="font-extrabold text-[#166534]">
                  Parcela estimada a partir de {formatBrl(estimatedInstallment)}/mês
                </p>
                <p className="mt-1 text-[12px] text-[#5c6880]">
                  Cenário ilustrativo com 60 parcelas, entrada de 20% e taxa base de 1,99% a.m.
                </p>
              </div>
            ) : null}
          </div>
        </article>

        <article
          id="lead-form"
          className="rounded-[28px] border border-[#e2e8f2] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]"
        >
          <h2 className="text-[20px] font-extrabold text-[#1d2538]">Solicitar contato oficial</h2>
          <p className="mt-1 text-sm text-[#5c6880]">
            Envie seu contato para receber retorno do anunciante.
          </p>

          <form
            onSubmit={handleLeadSubmit}
            className="mt-4 rounded-[24px] border border-[#e7edf6] bg-[#f8fafc] p-4"
          >
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm font-semibold text-[#22314d]">
                Seu nome
                <input
                  type="text"
                  name="buyerName"
                  value={buyerName}
                  onChange={(event) => setBuyerName(event.target.value)}
                  placeholder="Digite seu nome"
                  className="h-12 rounded-2xl border border-[#d5dce8] bg-white px-4 text-sm font-medium text-[#1d2538] outline-none transition focus:border-[#0e62d8]"
                />
              </label>

              <label className="grid gap-1 text-sm font-semibold text-[#22314d]">
                Seu WhatsApp
                <input
                  type="tel"
                  name="buyerPhone"
                  value={buyerPhone}
                  onChange={(event) => setBuyerPhone(event.target.value)}
                  placeholder="(11) 99999-9999"
                  className="h-12 rounded-2xl border border-[#d5dce8] bg-white px-4 text-sm font-medium text-[#1d2538] outline-none transition focus:border-[#0e62d8]"
                />
              </label>

              <button
                type="submit"
                disabled={loadingLead}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#0f172a] px-4 text-sm font-bold text-white transition hover:bg-[#111f3f] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loadingLead ? "Enviando..." : "Solicitar contato"}
              </button>
            </div>

            <p className="mt-3 text-xs text-[#66728a]">
              Seus dados serão enviados ao anunciante para retorno sobre este veículo.
            </p>

            {leadStatus ? (
              <p
                className={`mt-3 rounded-2xl border px-3 py-2 text-sm font-medium ${
                  leadStatus.tone === "success"
                    ? "border-[#b8e7c9] bg-[#eefbf3] text-[#11643a]"
                    : "border-[#f3c2c2] bg-[#fff2f2] text-[#a52a2a]"
                }`}
              >
                {leadStatus.message}
              </p>
            ) : null}
          </form>
        </article>
      </section>

      {/*
        PR I — Sticky CTA mobile redesenhado.
        Regra 8 do PR I: "preço + 'Chamar no WhatsApp'" como prioridade.
        Regra 9: substitui BottomNav nesta página (foco em contato).
        Layout: preço à esquerda (destaque) + botão WhatsApp grande à
        direita. Simular fica como link secundário menor abaixo.
        Quando não há WhatsApp, troca por "Solicitar contato"
        (rola para form de lead). Tokens DS — sem hex hardcoded.
      */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-cnc-line bg-cnc-surface/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold leading-tight text-primary">
              {priceLabel}
            </p>
            <Link
              href={financeLink}
              onClick={handleFinanceClick}
              className="text-[11px] font-semibold text-cnc-muted underline-offset-2 hover:text-primary hover:underline"
            >
              Simular financiamento
            </Link>
          </div>

          {waLink ? (
            <Link
              href={waLink}
              target="_blank"
              rel="noreferrer"
              onClick={handleWhatsappClick}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-cnc-success px-4 text-sm font-bold text-white shadow-card transition hover:bg-cnc-success/90"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="currentColor">
                <path d="M20.5 3.5A11.4 11.4 0 0 0 12 0a11.5 11.5 0 0 0-9.7 17.5L1 24l6.7-1.8A11.5 11.5 0 0 0 23.5 12a11.4 11.4 0 0 0-3-8.5ZM12 21.5a9.4 9.4 0 0 1-4.8-1.3l-.3-.2-3.6 1 1-3.5-.2-.3A9.5 9.5 0 1 1 12 21.5Zm5.5-7.1c-.3-.2-1.8-.9-2-1s-.5-.2-.7.1l-1 1.3c-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5a9 9 0 0 1-1.7-2.1c-.2-.3 0-.5.1-.6l.4-.5.3-.4.1-.4 0-.4-.7-1.7c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.4-.3.3-1 1-1 2.4 0 1.4 1 2.7 1.2 2.9.2.2 2 3 4.7 4.2 1.6.7 2.3.8 3.2.7.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4l-.5-.3Z" />
              </svg>
              <span>Chamar no WhatsApp</span>
            </Link>
          ) : (
            <Link
              href="#lead-form"
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-white shadow-card transition hover:bg-primary-strong"
            >
              Solicitar contato
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
