"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { trackAdEvent } from "@/lib/analytics/public-events";
import { submitVehicleLead } from "@/lib/leads/public-leads";
import { useCityOptional } from "@/lib/city/CityContext";
import { DEFAULT_PUBLIC_CITY_SLUG } from "@/lib/site/public-config";

type VehicleActionsProps = {
  vehicleId: string;
  vehicleName: string;
  whatsappPhone?: string;
  /** Território do anúncio; se omitido, usa a cidade ativa (cookie). */
  financeCitySlug?: string;
  /** Preço numérico (BRL) para pré-preencher o simulador e estimativa de parcela */
  vehiclePriceNumeric?: number | null;
};

type LeadStatus = {
  tone: "success" | "error";
  message: string;
} | null;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeWhatsapp(value?: string) {
  const digits = digitsOnly(value || "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function buildFinanceLink(vehicleId: string, citySlug: string, vehiclePrice?: number | null) {
  const params = new URLSearchParams({
    veiculo: vehicleId,
  });

  if (vehiclePrice != null && vehiclePrice > 0) {
    params.set("valor", String(Math.round(vehiclePrice)));
  }

  return `/simulador-financiamento/${encodeURIComponent(citySlug)}?${params.toString()}`;
}

function estimateMonthlyPayment(vehicleValue: number) {
  const entry = vehicleValue * 0.2;
  const financed = Math.max(vehicleValue - entry, 0);
  const monthlyRate = 1.99 / 100;
  const months = 36;
  if (financed <= 0 || months <= 0) return 0;
  return (financed * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export default function VehicleActions({
  vehicleId,
  vehicleName,
  whatsappPhone,
  financeCitySlug,
  vehiclePriceNumeric,
}: VehicleActionsProps) {
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [loadingLead, setLoadingLead] = useState(false);
  const [leadStatus, setLeadStatus] = useState<LeadStatus>(null);
  const cityCtx = useCityOptional();

  const normalizedWhatsapp = useMemo(() => normalizeWhatsapp(whatsappPhone), [whatsappPhone]);

  const hasWhatsapp = normalizedWhatsapp.length >= 12;

  const waText = useMemo(() => {
    return encodeURIComponent(`Olá, tenho interesse no veículo ${vehicleName}`);
  }, [vehicleName]);

  const waLink = hasWhatsapp ? `https://wa.me/${normalizedWhatsapp}?text=${waText}` : null;

  const financeLink = useMemo(() => {
    const slug = financeCitySlug?.trim() || cityCtx?.city.slug || DEFAULT_PUBLIC_CITY_SLUG;
    return buildFinanceLink(vehicleId, slug, vehiclePriceNumeric);
  }, [vehicleId, financeCitySlug, cityCtx?.city.slug, vehiclePriceNumeric]);

  const estimatedInstallment =
    vehiclePriceNumeric != null && vehiclePriceNumeric > 0
      ? estimateMonthlyPayment(vehiclePriceNumeric)
      : null;

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
      <section
        id="lead-form"
        className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]"
      >
        <h2 className="text-xl font-extrabold text-[#1d2538]">Fale com o anunciante</h2>

        <p className="mt-1 text-sm text-[#5c6880]">
          Resposta rápida no WhatsApp ou solicite retorno pelo formulário. Financiamento com
          simulação no próximo passo.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {waLink ? (
            <Link
              href={waLink}
              target="_blank"
              rel="noreferrer"
              onClick={handleWhatsappClick}
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#25D366] px-4 text-[16px] font-extrabold text-white shadow-[0_12px_28px_rgba(37,211,102,0.38)] ring-2 ring-[#128C7E]/35 transition hover:brightness-[1.03] active:scale-[0.99]"
            >
              Chamar no WhatsApp agora
            </Link>
          ) : null}

          <Link
            href={financeLink}
            onClick={handleFinanceClick}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border-2 border-[#0e62d8] bg-white px-4 text-[15px] font-bold text-[#0e62d8] shadow-sm transition hover:bg-[#f0f6ff]"
          >
            Simular financiamento
          </Link>

          {!waLink ? (
            <p className="text-center text-[13px] font-semibold text-[#64748b]">
              WhatsApp do anunciante em atualização — use o formulário abaixo.
            </p>
          ) : null}

          {estimatedInstallment != null && estimatedInstallment > 0 ? (
            <div className="rounded-2xl border border-[#dbe7ff] bg-[#f5f9ff] px-4 py-3 text-[13px] leading-relaxed text-[#3d4a63]">
              <p className="font-extrabold text-[#0f2a52]">
                Parcela estimada a partir de {formatBrl(estimatedInstallment)}/mês
              </p>
              <p className="mt-1 text-[12px] text-[#5c6880]">
                Cenário ilustrativo: 36 parcelas, entrada 20%, taxa 1,99% a.m. Valores podem mudar
                conforme banco e análise de crédito — ajuste no simulador.
              </p>
              <Link
                href={financeLink}
                onClick={handleFinanceClick}
                className="mt-2 inline-flex text-[13px] font-bold text-[#0e62d8] hover:underline"
              >
                Abrir simulador com o valor deste carro →
              </Link>
            </div>
          ) : null}
        </div>

        <form
          onSubmit={handleLeadSubmit}
          className="mt-4 rounded-2xl border border-[#e3e8f1] bg-[#f8fafc] p-4"
        >
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <label className="grid gap-1 text-sm font-semibold text-[#22314d]">
              Seu nome
              <input
                type="text"
                name="buyerName"
                value={buyerName}
                onChange={(event) => setBuyerName(event.target.value)}
                placeholder="Digite seu nome"
                className="h-11 rounded-xl border border-[#d5dce8] bg-white px-3 text-sm font-medium text-[#1d2538] outline-none transition focus:border-[#0e62d8]"
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
                className="h-11 rounded-xl border border-[#d5dce8] bg-white px-3 text-sm font-medium text-[#1d2538] outline-none transition focus:border-[#0e62d8]"
              />
            </label>

            <button
              type="submit"
              disabled={loadingLead}
              className="mt-auto inline-flex h-11 items-center justify-center rounded-xl bg-[#0f172a] px-4 text-sm font-bold text-white transition hover:bg-[#111f3f] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loadingLead ? "Enviando..." : "Solicitar contato"}
            </button>
          </div>

          <p className="mt-3 text-xs text-[#66728a]">
            Seu contato segue para o anunciante pelo fluxo oficial do portal.
          </p>

          {leadStatus ? (
            <p
              className={`mt-3 rounded-xl border px-3 py-2 text-sm font-medium ${
                leadStatus.tone === "success"
                  ? "border-[#b8e7c9] bg-[#eefbf3] text-[#11643a]"
                  : "border-[#f3c2c2] bg-[#fff2f2] text-[#a52a2a]"
              }`}
            >
              {leadStatus.message}
            </p>
          ) : null}
        </form>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#d8dfeb] bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(16,28,58,0.14)] backdrop-blur md:hidden">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
          {waLink ? (
            <Link
              href={waLink}
              target="_blank"
              rel="noreferrer"
              onClick={handleWhatsappClick}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#25D366] px-2 text-[14px] font-extrabold leading-tight text-white shadow-[0_10px_22px_rgba(37,211,102,0.35)] ring-1 ring-[#128C7E]/40"
            >
              WhatsApp
            </Link>
          ) : (
            <span className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#d8dfeb] bg-[#f8fafc] px-2 text-[13px] font-bold leading-tight text-[#64748b]">
              Sem WhatsApp
            </span>
          )}

          <Link
            href={financeLink}
            onClick={handleFinanceClick}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-[#0e62d8] bg-white px-2 text-[13px] font-bold leading-tight text-[#0e62d8]"
          >
            Simular
          </Link>

          <Link
            href="#lead-form"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#0f172a] px-2 text-[13px] font-bold leading-tight text-white"
          >
            Contato
          </Link>
        </div>
      </div>
    </>
  );
}
