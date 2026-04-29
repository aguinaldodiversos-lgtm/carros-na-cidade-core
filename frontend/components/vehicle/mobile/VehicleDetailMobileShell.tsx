// frontend/components/vehicle/mobile/VehicleDetailMobileShell.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import AdCard from "@/components/ads/AdCard";
import type { BaseAdData } from "@/components/ads/AdCard";
import { trackAdEvent } from "@/lib/analytics/public-events";
import { submitVehicleLead } from "@/lib/leads/public-leads";
import {
  buildFinanceLink,
  buildVehicleWhatsappHref,
} from "@/lib/vehicle/detail-utils";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";

import MobileHero from "./MobileHero";
import MobileTopBar from "./MobileTopBar";
import PhoneRevealSheet from "./PhoneRevealSheet";

/**
 * Shell mobile da rota /veiculo. Orquestra o layout fiel ao mockup
 * `frontend/public/images/detalhes.png`:
 *
 *   1. TopBar (← Detalhes do veículo  ⤴︎  ♡)
 *   2. Hero (foto + chips + counter + dots)
 *   3. Título + meta (modelo · ano · km · cidade) + tag "Contato direto"
 *   4. Preço grande azul
 *   5. Linha de 3 CTAs: WhatsApp · Simular financiamento · Ver telefone
 *   6. Principais dados (4 itens com ícone)
 *   7. Descrição (clamp 3 linhas + Ver mais)
 *   8. Vendedor (avatar + nome + badge + "no portal desde")
 *   9. Opcionais do veículo (chips com check)
 *  10. Enviar mensagem ao vendedor (form)
 *  11. Mais carros em [Cidade] (cards horizontais)
 *  12. Espaço para BottomNav
 */

type RelatedVehicle = BaseAdData;

type VehicleDetailMobileShellProps = {
  vehicle: VehicleDetail;
  shareUrl: string;
  cityVehicles: RelatedVehicle[];
  sellerVehicles?: RelatedVehicle[];
};

export default function VehicleDetailMobileShell({
  vehicle,
  shareUrl,
  cityVehicles,
}: VehicleDetailMobileShellProps) {
  const [phoneSheetOpen, setPhoneSheetOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  const sellerPhone = vehicle.seller.phone || "";
  const waLink = useMemo(
    () => buildVehicleWhatsappHref({ phone: sellerPhone, vehicleName: vehicle.fullName }),
    [sellerPhone, vehicle.fullName]
  );
  const financeLink = useMemo(
    () => buildFinanceLink(vehicle.id, vehicle.citySlug, vehicle.priceNumeric),
    [vehicle.id, vehicle.citySlug, vehicle.priceNumeric]
  );

  // Texto compacto: "2020 · 41.000 km · Atibaia (SP)"
  const metaPieces = [
    primaryYear(vehicle.year),
    vehicle.km,
    vehicle.city,
  ].filter((piece) => piece && piece !== "Não informado" && piece !== "Ano não informado");

  const sellerKind: "dealer" | "private" =
    vehicle.seller.type === "dealer" ? "dealer" : "private";

  const cityName = vehicle.city.split(" (")[0] || vehicle.city || "sua cidade";

  return (
    <>
      {/*
        Marker que ativa o CSS escondendo PublicHeader/PublicFooter
        em telas < lg. A regra mora em layout/globals via [data-...]
        seletor (ver app/veiculo/[slug]/page.tsx).
      */}
      <div data-vehicle-detail-mobile-shell className="bg-white pb-24">
        <MobileTopBar shareUrl={shareUrl} shareText={vehicle.fullName} />

        <div className="mt-3">
          <MobileHero
            images={vehicle.images}
            alt={vehicle.fullName}
            bodyTypeChip={vehicle.bodyType !== "Não informado" ? vehicle.bodyType : null}
            isBelowFipe={vehicle.isBelowFipe}
          />
        </div>

        {/* ---- Título + meta + preço ---- */}
        <section className="px-4 pt-5">
          <h2 className="text-[20px] font-extrabold leading-tight text-slate-900">
            {vehicle.fullName || vehicle.model}
          </h2>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-slate-600">
            {metaPieces.map((piece, i) => (
              <span key={`${piece}-${i}`} className="inline-flex items-center gap-1">
                {i === metaPieces.length - 1 ? <LocationPinIcon /> : null}
                <span>{piece}</span>
                {i < metaPieces.length - 1 ? (
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                ) : null}
              </span>
            ))}
            {sellerKind === "private" ? (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Contato direto
              </span>
            ) : null}
          </p>

          <p className="mt-3 text-[26px] font-extrabold leading-none text-[#0e62d8]">
            {vehicle.price}
          </p>
        </section>

        {/* ---- Linha de 3 CTAs ---- */}
        <section className="px-4 pt-4">
          <div className="grid grid-cols-3 gap-2">
            <a
              href={waLink ?? "#"}
              aria-disabled={!waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!waLink) {
                  e.preventDefault();
                  return;
                }
                trackAdEvent(vehicle.id, "whatsapp").catch(() => {});
              }}
              className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#1ea860] text-[12.5px] font-bold text-white transition hover:bg-[#178a4f] ${
                waLink ? "" : "pointer-events-none opacity-60"
              }`}
            >
              <WhatsappIcon />
              <span className="truncate">WhatsApp</span>
            </a>

            <Link
              href={financeLink}
              onClick={() => trackAdEvent(vehicle.id, "finance").catch(() => {})}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#0e62d8] px-2 text-[12.5px] font-bold text-white transition hover:bg-[#0a52b8]"
            >
              <CalculatorIcon />
              <span className="truncate">Simular</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                setPhoneSheetOpen(true);
                trackAdEvent(vehicle.id, "click").catch(() => {});
              }}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#0e62d8] bg-white text-[12.5px] font-bold text-[#0e62d8] transition hover:bg-[#eef5ff]"
            >
              <PhoneIcon />
              <span className="truncate">Ver telefone</span>
            </button>
          </div>
        </section>

        {/* ---- Principais dados ---- */}
        <section aria-label="Principais dados" className="px-4 pt-5">
          <h3 className="text-[15px] font-extrabold text-slate-900">Principais dados</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3">
            <SpecRow icon={<CalendarIcon />} label="Ano" value={primaryYear(vehicle.year)} />
            <SpecRow icon={<GaugeIcon />} label="Quilometragem" value={vehicle.km} />
            <SpecRow icon={<CogIcon />} label="Câmbio" value={vehicle.transmission} />
            <SpecRow icon={<PaletteIcon />} label="Cor" value={vehicle.color} />
          </div>
        </section>

        {/* ---- Descrição ---- */}
        {vehicle.description ? (
          <section aria-label="Descrição do veículo" className="px-4 pt-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[15px] font-extrabold text-slate-900">Descrição do veículo</h3>
                <button
                  type="button"
                  onClick={() => setDescriptionOpen((v) => !v)}
                  className="shrink-0 text-[12.5px] font-bold text-[#0e62d8] hover:underline"
                >
                  {descriptionOpen ? "Ver menos" : "Ver mais"}
                </button>
              </div>
              <p
                className={`mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-slate-700 ${
                  descriptionOpen ? "" : "line-clamp-3"
                }`}
              >
                {vehicle.description}
              </p>
            </div>
          </section>
        ) : null}

        {/* ---- Vendedor ---- */}
        <section aria-label="Vendedor" className="px-4 pt-5">
          <SellerCard vehicle={vehicle} />
        </section>

        {/* ---- Opcionais ---- */}
        {vehicle.optionalItems?.length ? (
          <section aria-label="Opcionais do veículo" className="px-4 pt-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-[15px] font-extrabold text-slate-900">Opcionais do veículo</h3>
              <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {vehicle.optionalItems.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-[13px] leading-snug text-slate-700"
                  >
                    <CheckIcon />
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ---- Enviar mensagem ao vendedor ---- */}
        <section aria-label="Enviar mensagem ao vendedor" className="px-4 pt-5">
          <MessageForm vehicleId={vehicle.id} vehicleName={vehicle.fullName} />
        </section>

        {/* ---- Mais carros em [Cidade] ---- */}
        {cityVehicles.length > 0 ? (
          <section aria-label={`Mais carros em ${cityName}`} className="pt-7">
            <div className="flex items-center justify-between gap-3 px-4">
              <h3 className="text-[15px] font-extrabold text-slate-900">
                Mais carros em {cityName}
              </h3>
              <Link
                href={`/comprar?city_slug=${encodeURIComponent(vehicle.citySlug)}`}
                className="shrink-0 text-[12.5px] font-bold text-[#0e62d8] hover:underline"
              >
                Ver todos
              </Link>
            </div>

            <ul className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {cityVehicles.slice(0, 6).map((item, idx) => (
                <li
                  key={`${item.id ?? item.slug ?? idx}`}
                  className="w-[68%] max-w-[260px] shrink-0 snap-start"
                >
                  <AdCard item={item} variant="grid" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <PhoneRevealSheet
        open={phoneSheetOpen}
        onClose={() => setPhoneSheetOpen(false)}
        vehicleId={vehicle.id}
        vehicleName={vehicle.fullName}
        sellerPhone={sellerPhone}
      />
    </>
  );
}

/* ----------------------------------------------------------------------
 * Sub-componentes inline (sem state pesado)
 * -------------------------------------------------------------------- */

function primaryYear(value: string): string {
  const raw = value || "";
  if (!raw || raw === "Ano não informado") return "Ano";
  return raw.split("/")[0] || raw;
}

function SpecRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl px-2 py-1.5">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eef5ff] text-[#0e62d8]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="truncate text-[13px] font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function SellerCard({ vehicle }: { vehicle: VehicleDetail }) {
  const seller = vehicle.seller;
  const isDealer = seller.type === "dealer";
  const dealerLogo = isDealer ? seller.logo : null;
  const sellerName = seller.name || (isDealer ? "Loja parceira" : "Anunciante");
  const sellerInitials = sellerName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
  const cityLabel = vehicle.city || "Brasil";
  const partnerSince = isDealer ? "No Carros na Cidade" : "Anunciante particular";

  const href = isDealer && seller.storeSlug ? `/loja/${seller.storeSlug}` : null;

  const Wrapper: React.ElementType = href ? Link : "div";
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:bg-slate-50"
    >
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0e62d8]/10 text-[14px] font-extrabold text-[#0e62d8]">
        {dealerLogo ? (
          <Image
            src={dealerLogo}
            alt={sellerName}
            width={48}
            height={48}
            className="h-full w-full object-cover"
          />
        ) : (
          sellerInitials || "C"
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[14px] font-extrabold text-slate-900">{sellerName}</p>
          {isDealer ? (
            <span className="inline-flex items-center rounded-full bg-[#eef5ff] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#0e62d8]">
              Loja parceira
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[12px] text-slate-500">{cityLabel}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-slate-400">{partnerSince}</p>
      </div>
      {href ? (
        <span aria-hidden="true" className="shrink-0 text-slate-400">
          <ChevronRightIcon />
        </span>
      ) : null}
    </Wrapper>
  );
}

function MessageForm({ vehicleId, vehicleName }: { vehicleId: string; vehicleName: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(
    `Olá, vi seu anúncio do ${vehicleName} no Carros na Cidade e tenho interesse.`
  );
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !trimmedPhone) {
      setFeedback({ tone: "error", text: "Preencha nome e telefone para enviar." });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await submitVehicleLead({
        adId: vehicleId,
        buyerName: trimmedName,
        buyerPhone: trimmedPhone,
      });
      trackAdEvent(vehicleId, "lead").catch(() => {});
      setFeedback({
        tone: "success",
        text: "Mensagem enviada! O anunciante vai entrar em contato em breve.",
      });
      setName("");
      setPhone("");
    } catch (err) {
      const text =
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível enviar a mensagem. Tente novamente.";
      setFeedback({ tone: "error", text });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4"
    >
      <h3 className="text-[15px] font-extrabold text-slate-900">Enviar mensagem ao vendedor</h3>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Seu nome"
        autoComplete="name"
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none transition focus:border-[#0e62d8] focus:ring-2 focus:ring-[#0e62d8]/20"
      />
      <input
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Seu telefone"
        autoComplete="tel"
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none transition focus:border-[#0e62d8] focus:ring-2 focus:ring-[#0e62d8]/20"
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Escreva sua mensagem"
        rows={3}
        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] leading-snug outline-none transition focus:border-[#0e62d8] focus:ring-2 focus:ring-[#0e62d8]/20"
      />
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#0e62d8] text-[14px] font-bold text-white transition hover:bg-[#0a52b8] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Enviando..." : "Enviar mensagem"}
      </button>
      {feedback ? (
        <p
          className={`text-[12.5px] ${
            feedback.tone === "success" ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {feedback.text}
        </p>
      ) : null}
    </form>
  );
}

/* ----------------------------------------------------------------------
 * Ícones
 * -------------------------------------------------------------------- */

function LocationPinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function WhatsappIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="currentColor"
    >
      <path d="M19.05 4.91A10 10 0 0 0 12.04 2c-5.46 0-9.9 4.45-9.9 9.92 0 1.75.46 3.46 1.34 4.97L2 22l5.31-1.39a9.86 9.86 0 0 0 4.73 1.21h.01c5.46 0 9.9-4.45 9.9-9.92a9.92 9.92 0 0 0-2.9-7Zm-7.01 15.27h-.01a8.27 8.27 0 0 1-4.21-1.16l-.3-.18-3.15.83.84-3.07-.2-.32a8.26 8.26 0 0 1-1.27-4.39c0-4.55 3.7-8.25 8.26-8.25 2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.42 5.84c0 4.55-3.7 8.25-8.21 8.28Zm4.52-6.18c-.25-.13-1.46-.72-1.69-.8-.23-.08-.39-.13-.56.13s-.65.8-.79.97c-.15.17-.29.19-.54.06-.25-.13-1.04-.38-1.99-1.22-.74-.65-1.23-1.46-1.38-1.71-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.32-.02-.45-.06-.13-.56-1.34-.77-1.84-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.45.06-.69.32-.23.25-.9.88-.9 2.15 0 1.27.92 2.5 1.05 2.67.13.17 1.81 2.76 4.39 3.87.61.27 1.09.42 1.46.54.61.19 1.17.16 1.61.1.49-.07 1.46-.6 1.66-1.18.21-.58.21-1.07.14-1.18-.06-.11-.23-.17-.48-.3Z" />
    </svg>
  );
}

function CalculatorIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8M8 11h2M12 11h4M8 15h2M12 15h4M8 19h2M12 19h4" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6 6l1.27-1.36a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 14a4 4 0 0 0 4-4" />
      <path d="M12 2a10 10 0 1 0 10 10" />
      <path d="M12 14 4 6" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22a10 10 0 1 1 0-20 8 8 0 0 1 8 8c0 2.5-1.5 4-4 4h-1a2 2 0 0 0-1 3.74A2 2 0 0 1 12 22Z" />
      <circle cx="6.5" cy="11.5" r="1" />
      <circle cx="9.5" cy="6.5" r="1" />
      <circle cx="14.5" cy="6.5" r="1" />
      <circle cx="17.5" cy="11.5" r="1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4 12 5 5L20 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
