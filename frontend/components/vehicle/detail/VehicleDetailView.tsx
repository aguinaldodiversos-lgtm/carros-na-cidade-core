// frontend/components/vehicle/detail/VehicleDetailView.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import AdCard, { type BaseAdData } from "@/components/ads/AdCard";
import { ReportAdModal } from "@/components/vehicle/ReportAdModal";
import VehicleOptionsGroups from "@/components/vehicle/VehicleOptionsGroups";
import PhoneRevealSheet from "@/components/vehicle/mobile/PhoneRevealSheet";
import VehicleFinancingSimulator from "@/components/vehicle/VehicleFinancingSimulator";
import { trackAdEvent } from "@/lib/analytics/public-events";
import {
  buildShortVehicleH1,
  buildVehicleWhatsappHref,
  splitVersionTrim,
} from "@/lib/vehicle/detail-utils";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";

import VehicleGalleryCarousel from "./VehicleGalleryCarousel";
import VehicleMessageForm from "./VehicleMessageForm";

type BreadcrumbItem = { name: string; href?: string };

type VehicleDetailViewProps = {
  vehicle: VehicleDetail;
  shareUrl: string;
  breadcrumbItems: BreadcrumbItem[];
  cityVehicles: BaseAdData[];
  sellerVehicles: BaseAdData[];
};

/**
 * Reconstrução visual do miolo da rota /veiculo (redesign detalhes.png).
 * Galeria full-width + duas colunas (conteúdo | sidebar sticky). Toda a
 * camada de dados/SEO é montada no server (`app/veiculo/[slug]/page.tsx`);
 * aqui é só apresentação + interações (WhatsApp, telefone, lead, denúncia).
 *
 * Mobile-first: no mobile a sidebar vira blocos empilhados; o bloco de
 * contato aparece logo abaixo do título e o preço/CTA principal ficam
 * acessíveis numa barra fixa inferior.
 */
export default function VehicleDetailView({
  vehicle,
  shareUrl,
  breadcrumbItems,
  cityVehicles,
  sellerVehicles,
}: VehicleDetailViewProps) {
  const [phoneSheetOpen, setPhoneSheetOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);

  const sellerPhone = vehicle.seller.phone || "";
  const waLink = useMemo(
    () => buildVehicleWhatsappHref({ phone: sellerPhone, vehicleName: vehicle.fullName }),
    [sellerPhone, vehicle.fullName]
  );
  const year = primaryYear(vehicle.year);

  // H1 VISÍVEL curto (estilo Webmotors): "Marca Modelo Trim" (ex.: "Chevrolet
  // Onix Hatch LT"). Contém marca+modelo p/ SEO on-page, sem o excesso (motor,
  // ano, cidade). O <title>/canonical/JSON-LD/meta description NÃO mudam — eles
  // continuam longos e com cidade (definidos em generateMetadata / page.tsx).
  const vehicleH1 = buildShortVehicleH1({
    brand: vehicle.brand,
    model: vehicle.model,
    version: vehicle.version,
  });

  // Subtítulo secundário com o resto: motor/versão (sem o trim que subiu p/ o
  // H1) • carroceria • câmbio • ano — ex.: "1.0 12V Flex • Hatch • Manual • 2025".
  const versionSpecs = splitVersionTrim(vehicle.version).specs || vehicle.version;
  const subtitle = [versionSpecs, chip(vehicle.bodyType), chip(vehicle.transmission), year]
    .filter(Boolean)
    .join(" • ");

  const specs = [
    // Câmbio e Carroceria sempre aparecem (com "Não informado" quando a fonte
    // confiável não existe) — nunca escondemos para não mascarar o dado.
    { icon: <CogIcon />, label: "Câmbio", value: vehicle.transmission || "Não informado" },
    { icon: <FuelIcon />, label: "Combustível", value: chip(vehicle.fuel) },
    { icon: <CarIcon />, label: "Carroceria", value: vehicle.bodyType || "Não informado" },
    { icon: <PaletteIcon />, label: "Cor", value: chip(vehicle.color) },
    { icon: <PinIcon />, label: "Cidade", value: chip(vehicle.city, "Localização não informada") },
  ].filter((s) => s.value);

  // Recomendados (Fase 2a): prioriza os da mesma loja quando houver, senão os
  // da cidade. Cada AdCard já mostra cidade/UF de origem e distância.
  const recommended = (sellerVehicles.length > 0 ? sellerVehicles : cityVehicles).slice(0, 8);
  const cityName = vehicle.city === "Localização não informada" ? "" : vehicle.city.split(" (")[0];
  const moreCarsHref = vehicle.citySlug
    ? `/comprar?city_slug=${encodeURIComponent(vehicle.citySlug)}`
    : "/comprar";

  const isDealer = vehicle.seller.type === "dealer";

  return (
    <div className="bg-cnc-bg pb-24 lg:pb-12">
      {/* ---- Galeria FULL-WIDTH (edge-to-edge, fora do container) ---- */}
      <VehicleGalleryCarousel
        images={vehicle.images}
        alt={vehicle.fullName}
        isBelowFipe={vehicle.isBelowFipe}
      />

      {/* Conteúdo continua no container com max-width normal */}
      <div className="mx-auto w-full max-w-[1180px] px-4 pt-5 sm:px-5">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* ================= COLUNA ESQUERDA ================= */}
          <div className="min-w-0 space-y-5">
            {/* Card principal: breadcrumb + título + preço + specs + descrição + selos */}
            <section className="rounded-2xl border border-cnc-line bg-white p-4 shadow-card sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <Breadcrumb items={breadcrumbItems} />
                <ShareButton shareUrl={shareUrl} title={vehicle.fullName} />
              </div>

              {/* H1 único e VISÍVEL curto (marca+modelo+trim). Excesso vai p/ o
                  subtítulo; cidade/versão completa ficam no <title>/JSON-LD. */}
              <h1 className="mt-3 text-[24px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[30px]">
                {vehicleH1}
              </h1>
              {subtitle ? (
                <p className="mt-1 text-[13.5px] font-medium text-cnc-muted">{subtitle}</p>
              ) : null}

              {/* Preço + ano */}
              <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-[28px] font-extrabold leading-none text-primary sm:text-[32px]">
                  {vehicle.price}
                </p>
                {year ? (
                  <span className="text-[16px] font-semibold text-cnc-muted">{year}</span>
                ) : null}
              </div>

              {/* Specs com ícone */}
              {specs.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t border-cnc-line pt-4">
                  {specs.map((s) => (
                    <div key={s.label} className="flex items-center gap-2">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        {s.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[10.5px] font-bold uppercase tracking-wideish text-cnc-muted-soft">
                          {s.label}
                        </span>
                        <span className="block truncate text-[13.5px] font-semibold text-cnc-text">
                          {s.value}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Descrição */}
              {vehicle.description ? (
                <div className="mt-5 border-t border-cnc-line pt-4">
                  <h2 className="text-[15px] font-extrabold text-cnc-text-strong">
                    Descrição do veículo
                  </h2>
                  <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-cnc-text">
                    {vehicle.description}
                  </p>
                </div>
              ) : null}

              {/* Selos de procedência (item 6) — só o que o anúncio marcou */}
              {vehicle.trustBadges.length > 0 ? (
                <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-cnc-line pt-4">
                  {vehicle.trustBadges.map((badge) => (
                    <li
                      key={badge.key}
                      className="flex items-center gap-1.5 text-[13px] font-semibold text-cnc-text"
                    >
                      <CheckIcon />
                      {badge.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            {/* Card de opcionais (item 7) — já categorizado Conforto/Dirigibilidade/Segurança */}
            {vehicle.vehicleOptionGroups.length > 0 ? (
              <section className="rounded-2xl border border-cnc-line bg-white p-4 shadow-card sm:p-6">
                <h2 className="text-[16px] font-extrabold text-cnc-text-strong">
                  Opcionais do veículo
                </h2>
                <div className="mt-4">
                  <VehicleOptionsGroups groups={vehicle.vehicleOptionGroups} columns={2} />
                </div>
              </section>
            ) : null}

            {/* Simulador de financiamento embutido (antes dos recomendados) */}
            <VehicleFinancingSimulator
              vehicleId={vehicle.id}
              citySlug={vehicle.citySlug}
              vehicleName={vehicle.fullName}
              vehiclePriceNumeric={vehicle.priceNumeric}
              sellerPhone={sellerPhone}
            />

            {/* Recomendados (Fase 2a) */}
            {recommended.length > 0 ? (
              <section
                aria-label="Veículos recomendados para você"
                className="rounded-2xl border border-cnc-line bg-white p-4 shadow-card sm:p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[16px] font-extrabold text-cnc-text-strong">
                    Veículos recomendados para você
                  </h2>
                  <Link
                    href={moreCarsHref}
                    className="shrink-0 text-[13px] font-bold text-primary hover:underline"
                  >
                    Ver todos
                  </Link>
                </div>
                {cityName ? (
                  <p className="mt-1 text-[12.5px] text-cnc-muted">
                    {isDealer && sellerVehicles.length > 0
                      ? "Outros anúncios deste vendedor"
                      : `Mais carros em ${cityName}`}
                  </p>
                ) : null}
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {recommended.map((item, idx) => (
                    <li key={`${item.id ?? item.slug ?? idx}`} className="min-w-0">
                      <AdCard item={item} variant="carousel" />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {/* ================= COLUNA DIREITA (sticky) ================= */}
          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            {/* Preço + contato */}
            <section className="rounded-2xl border border-cnc-line bg-white p-4 shadow-card">
              <p className="text-[26px] font-extrabold leading-none text-primary">{vehicle.price}</p>
              {year ? <p className="mt-1 text-[13px] font-semibold text-cnc-muted">{year}</p> : null}

              <div className="mt-4 space-y-2">
                <a
                  href={waLink ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!waLink}
                  onClick={(e) => {
                    if (!waLink) {
                      e.preventDefault();
                      return;
                    }
                    trackAdEvent(vehicle.id, "whatsapp").catch(() => {});
                  }}
                  className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1ea860] text-[14px] font-bold text-white transition hover:bg-[#178a4f] ${
                    waLink ? "" : "pointer-events-none opacity-60"
                  }`}
                >
                  <WhatsappIcon />
                  Mensagem WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneSheetOpen(true);
                    trackAdEvent(vehicle.id, "click").catch(() => {});
                  }}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary bg-white text-[14px] font-bold text-primary transition hover:bg-primary-soft"
                >
                  <PhoneIcon />
                  Ver telefone
                </button>
                <button
                  type="button"
                  onClick={() => setMessageOpen((v) => !v)}
                  aria-expanded={messageOpen}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-cnc-line bg-white text-[14px] font-bold text-cnc-text transition hover:bg-cnc-bg"
                >
                  <MailIcon />
                  Enviar mensagem
                </button>
              </div>

              {messageOpen ? (
                <div className="mt-3 border-t border-cnc-line pt-3">
                  <VehicleMessageForm vehicleId={vehicle.id} vehicleName={vehicle.fullName} />
                </div>
              ) : null}
              {/* CTA "Simular financiamento" removido: o simulador agora é
                  embutido na coluna de conteúdo, com WhatsApp próprio. */}
            </section>

            {/* Vendedor */}
            <SellerCard vehicle={vehicle} />

            {/* Dicas de segurança */}
            <section className="rounded-2xl border border-cnc-line bg-white p-4 shadow-card">
              <h2 className="text-[15px] font-extrabold text-cnc-text-strong">
                Dicas de Segurança
              </h2>
              <ul className="mt-3 space-y-2 text-[13px] text-cnc-text">
                <li className="flex items-start gap-2">
                  <ShieldIcon />
                  Não faça pagamentos antecipados.
                </li>
                <li className="flex items-start gap-2">
                  <ShieldIcon />
                  Nunca pague em nome de terceiros.
                </li>
              </ul>
              <Link
                href="/seguranca"
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1 rounded-xl border border-cnc-line bg-white text-[13px] font-bold text-primary transition hover:bg-primary-soft"
              >
                Exibir mais dicas de segurança
                <ChevronDownIcon />
              </Link>
            </section>

            {/* Aviso legal */}
            <section className="rounded-2xl border border-cnc-line bg-white p-4 shadow-card">
              <h2 className="text-[15px] font-extrabold text-cnc-text-strong">Aviso Legal</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-cnc-muted">
                Carros na Cidade é um portal de anúncios classificados. Não intermedia
                negociações, não recebe pagamentos e não se responsabiliza pelas ofertas ou
                informações divulgadas pelos anunciantes.
              </p>
            </section>

            {/* Denunciar */}
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="inline-flex w-full items-center justify-center gap-1.5 text-[13px] font-semibold text-cnc-muted transition hover:text-cnc-danger"
            >
              <FlagIcon />
              Denunciar anúncio
            </button>
          </aside>
        </div>
      </div>

      {/* Barra fixa de contato no mobile (o tráfego é majoritariamente mobile) */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-cnc-line bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-extrabold leading-none text-primary">
            {vehicle.price}
          </p>
        </div>
        <a
          href={waLink ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!waLink}
          onClick={(e) => {
            if (!waLink) {
              e.preventDefault();
              return;
            }
            trackAdEvent(vehicle.id, "whatsapp").catch(() => {});
          }}
          className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#1ea860] px-4 text-[13.5px] font-bold text-white ${
            waLink ? "" : "pointer-events-none opacity-60"
          }`}
        >
          <WhatsappIcon />
          WhatsApp
        </a>
        <button
          type="button"
          onClick={() => {
            setPhoneSheetOpen(true);
            trackAdEvent(vehicle.id, "click").catch(() => {});
          }}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-primary bg-white px-4 text-[13.5px] font-bold text-primary"
        >
          <PhoneIcon />
          Telefone
        </button>
      </div>

      <PhoneRevealSheet
        open={phoneSheetOpen}
        onClose={() => setPhoneSheetOpen(false)}
        vehicleId={vehicle.id}
        vehicleName={vehicle.fullName}
        sellerPhone={sellerPhone}
      />
      <ReportAdModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        adId={vehicle.id}
        vehicleName={vehicle.fullName}
      />
    </div>
  );
}

function ShareButton({ shareUrl, title }: { shareUrl: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, url: shareUrl });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      // usuário cancelou o share nativo, ou clipboard indisponível — silencioso
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="Compartilhar anúncio"
      title={copied ? "Link copiado!" : "Compartilhar"}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cnc-line bg-white text-cnc-muted transition hover:border-primary hover:text-primary"
    >
      {copied ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 5 5L20 7" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5" />
        </svg>
      )}
    </button>
  );
}

/* ---------------------------------------------------------------------- */

function primaryYear(value: string): string {
  const raw = value || "";
  if (!raw || raw === "Ano não informado") return "";
  return raw.split("/")[0] || raw;
}

/** Normaliza valores "Não informado" (e afins) para vazio → não renderiza. */
function chip(value: string, ...alsoEmpty: string[]): string {
  const v = (value || "").trim();
  if (!v || v === "Não informado" || alsoEmpty.includes(v)) return "";
  return v;
}

function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Trilha de navegação" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-cnc-muted">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.name}-${i}`} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-primary hover:underline">
                  {item.name}
                </Link>
              ) : (
                <span className={isLast ? "font-semibold text-cnc-text" : undefined}>
                  {item.name}
                </span>
              )}
              {!isLast ? (
                <span aria-hidden="true" className="text-cnc-line-strong">
                  ›
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SellerCard({ vehicle }: { vehicle: VehicleDetail }) {
  const seller = vehicle.seller;
  const isDealer = seller.type === "dealer";
  // PF: `seller.name` já é APENAS o primeiro nome (truncado na fonte, LGPD).
  // Loja: nome comercial completo.
  const name = seller.name || (isDealer ? "Loja parceira" : "Anunciante");
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("") || "C";
  const city = vehicle.city === "Localização não informada" ? "" : vehicle.city;
  const href = isDealer && seller.storeSlug ? `/lojas/${seller.storeSlug}` : null;
  const Wrapper: React.ElementType = href ? Link : "div";
  const wrapperProps = href ? { href } : {};

  return (
    <section className="rounded-2xl border border-cnc-line bg-white p-4 shadow-card">
      <h2 className="text-[15px] font-extrabold text-cnc-text-strong">Vendedor</h2>
      <Wrapper
        {...wrapperProps}
        className="mt-3 flex items-center gap-3 rounded-xl transition hover:bg-cnc-bg"
      >
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[14px] font-extrabold text-primary">
          {isDealer && seller.logo ? (
            <Image
              src={seller.logo}
              alt={name}
              width={48}
              height={48}
              className="h-full w-full object-cover"
            />
          ) : (
            initials
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold text-cnc-text-strong">{name}</p>
          {city ? <p className="mt-0.5 truncate text-[12.5px] text-cnc-muted">{city}</p> : null}
          <p className="mt-0.5 text-[11.5px] text-cnc-muted-soft">
            {isDealer ? "Loja / Revenda" : "Anunciante particular"}
          </p>
        </div>
        {href ? (
          <span aria-hidden="true" className="shrink-0 text-cnc-muted-soft">
            <ChevronRightIcon />
          </span>
        ) : null}
      </Wrapper>
    </section>
  );
}

/* ----------------------------------- Ícones ----------------------------------- */

function iconBase(className = "h-4 w-4") {
  return {
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function CogIcon() {
  return (
    <svg {...iconBase()}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
function FuelIcon() {
  return (
    <svg {...iconBase()}>
      <path d="M3 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18" />
      <path d="M3 12h10" />
      <path d="M13 8h3l3 3v6a2 2 0 0 1-4 0v-5" />
    </svg>
  );
}
function CarIcon() {
  return (
    <svg {...iconBase()}>
      <path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13" />
      <path d="M3 17h18v-2.5a1.5 1.5 0 0 0-1-1.4l-1-.6H5l-1 .6A1.5 1.5 0 0 0 3 14.5Z" />
      <circle cx="7.5" cy="17.5" r="1.3" />
      <circle cx="16.5" cy="17.5" r="1.3" />
    </svg>
  );
}
function PaletteIcon() {
  return (
    <svg {...iconBase()}>
      <path d="M12 22a10 10 0 1 1 0-20 8 8 0 0 1 8 8c0 2.5-1.5 4-4 4h-1a2 2 0 0 0-1 3.74A2 2 0 0 1 12 22Z" />
      <circle cx="6.5" cy="11.5" r="1" />
      <circle cx="9.5" cy="6.5" r="1" />
      <circle cx="14.5" cy="6.5" r="1" />
      <circle cx="17.5" cy="11.5" r="1" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg {...iconBase()}>
      <path d="M12 22s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-cnc-success" fill="none" aria-hidden="true">
      <path d="M16.7 5.7 8.5 13.9l-3.2-3.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function WhatsappIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="currentColor">
      <path d="M19.05 4.91A10 10 0 0 0 12.04 2c-5.46 0-9.9 4.45-9.9 9.92 0 1.75.46 3.46 1.34 4.97L2 22l5.31-1.39a9.86 9.86 0 0 0 4.73 1.21h.01c5.46 0 9.9-4.45 9.9-9.92a9.92 9.92 0 0 0-2.9-7Zm-7.01 15.27h-.01a8.27 8.27 0 0 1-4.21-1.16l-.3-.18-3.15.83.84-3.07-.2-.32a8.26 8.26 0 0 1-1.27-4.39c0-4.55 3.7-8.25 8.26-8.25 2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.42 5.84c0 4.55-3.7 8.25-8.21 8.28Zm4.52-6.18c-.25-.13-1.46-.72-1.69-.8-.23-.08-.39-.13-.56.13s-.65.8-.79.97c-.15.17-.29.19-.54.06-.25-.13-1.04-.38-1.99-1.22-.74-.65-1.23-1.46-1.38-1.71-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.32-.02-.45-.06-.13-.56-1.34-.77-1.84-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.45.06-.69.32-.23.25-.9.88-.9 2.15 0 1.27.92 2.5 1.05 2.67.13.17 1.81 2.76 4.39 3.87.61.27 1.09.42 1.46.54.61.19 1.17.16 1.61.1.49-.07 1.46-.6 1.66-1.18.21-.58.21-1.07.14-1.18-.06-.11-.23-.17-.48-.3Z" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg {...iconBase()}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6 6l1.27-1.36a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg {...iconBase()}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg {...iconBase()}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
function ChevronDownIcon() {
  return (
    <svg {...iconBase("h-4 w-4")}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function FlagIcon() {
  return (
    <svg {...iconBase()}>
      <path d="M4 4v17M4 4l13 2-3 5 3 5-13-2" />
    </svg>
  );
}
