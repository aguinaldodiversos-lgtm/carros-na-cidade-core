"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { trackAdEvent } from "@/lib/analytics/public-events";
import { submitVehicleLead } from "@/lib/leads/public-leads";

type VehicleActionsProps = {
  vehicleId: string;
  vehicleName: string;
  whatsappPhone?: string;
};

type LeadStatus = {
  tone: "success" | "error";
  message: string;
} | null;

const DEFAULT_FINANCE_CITY = "sao-paulo-sp";

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeWhatsapp(value?: string) {
  const digits = digitsOnly(value || "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function buildFinanceLink(vehicleId: string) {
  const params = new URLSearchParams({
    veiculo: vehicleId,
  });

  return `/simulador-financiamento/${DEFAULT_FINANCE_CITY}?${params.toString()}`;
}

export default function VehicleActions({
  vehicleId,
  vehicleName,
  whatsappPhone,
}: VehicleActionsProps) {
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [loadingLead, setLoadingLead] = useState(false);
  const [leadStatus, setLeadStatus] = useState<LeadStatus>(null);

  const normalizedWhatsapp = useMemo(
    () => normalizeWhatsapp(whatsappPhone),
    [whatsappPhone]
  );

  const hasWhatsapp = normalizedWhatsapp.length >= 12;

  const waText = useMemo(() => {
    return encodeURIComponent(`Olá, tenho interesse no veículo ${vehicleName}`);
  }, [vehicleName]);

  const waLink = hasWhatsapp
    ? `https://wa.me/${normalizedWhatsapp}?text=${waText}`
    : null;

  const financeLink = useMemo(() => buildFinanceLink(vehicleId), [vehicleId]);

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
        error instanceof Error
          ? error.message
          : "Não foi possível enviar seu contato agora.";

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
        <h2 className="text-xl font-extrabold text-[#1d2538]">
          Fale com o anunciante
        </h2>

        <p className="mt-1 text-sm text-[#5c6880]">
          Solicite contato direto pelo portal e mantenha o WhatsApp como atalho opcional.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            href={financeLink}
            onClick={handleFinanceClick}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-4 text-[15px] font-bold text-white shadow-[0_10px_20px_rgba(14,98,216,0.25)] transition hover:brightness-110"
          >
            Simular financiamento
          </Link>

          {waLink ? (
            <Link
              href={waLink}
              target="_blank"
              rel="noreferrer"
              onClick={handleWhatsappClick}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1fa855] px-4 text-[15px] font-bold text-white shadow-[0_10px_20px_rgba(31,168,85,0.25)] transition hover:brightness-110"
            >
              Falar no WhatsApp
            </Link>
          ) : (
            <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8dfeb] bg-[#f8fafc] px-4 text-[15px] font-bold text-[#64748b]">
              Contato em atualização
            </span>
          )}
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

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#d8dfeb] bg-white/95 p-3 shadow-[0_-10px_30px_rgba(16,28,58,0.14)] backdrop-blur md:hidden">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-3 gap-2">
          <Link
            href={financeLink}
            onClick={handleFinanceClick}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-3 text-[14px] font-bold text-white"
          >
            Simular
          </Link>

          <Link
            href="#lead-form"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#0f172a]/10 bg-[#0f172a] px-3 text-[14px] font-bold text-white"
          >
            Contato
          </Link>

          {waLink ? (
            <Link
              href={waLink}
              target="_blank"
              rel="noreferrer"
              onClick={handleWhatsappClick}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1fa855] px-3 text-[15px] font-bold text-white shadow-[0_10px_20px_rgba(31,168,85,0.2)]"
            >
              WhatsApp
            </Link>
          ) : (
            <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8dfeb] bg-[#f8fafc] px-3 text-[14px] font-bold text-[#64748b]">
              WhatsApp
            </span>
          )}
        </div>
      </div>
    </>
  );
}
