"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AdDetails, RelatedAd } from "@/lib/ads/get-ad-details";

type Props = {
  ad: AdDetails;
};

type ContactFormState = {
  name: string;
  phone: string;
  email: string;
  message: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value || 0);
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeWhatsapp(value: string) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function percentageLabel(value: number) {
  return `${Math.abs(value).toFixed(1).replace(".", ",")}%`;
}

function badgeClasses(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("abaixo")) {
    return "border-green-200 bg-green-50 text-green-700";
  }

  if (normalized.includes("destaque")) {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (normalized.includes("premium")) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function sellerTypeLabel(type: AdDetails["seller"]["type"]) {
  if (type === "premium") return "Anunciante Platinum";
  if (type === "basic") return "Lojista";
  return "Particular";
}

function isDealer(type: AdDetails["seller"]["type"]) {
  return type === "premium" || type === "basic";
}

function resolveShowcase(ad: AdDetails): {
  visible: boolean;
  title: string;
  subtitle?: string;
  items: RelatedAd[];
  emptyMessage?: string;
} {
  const dealer = isDealer(ad.seller.type);

  if (ad.weight === 1) {
    return {
      visible: true,
      title: `Mais anúncios em ${ad.city}`,
      subtitle: "Outras oportunidades e veículos anunciados na sua cidade.",
      items: ad.similarAds.slice(0, 4),
      emptyMessage: "Nenhum anúncio adicional disponível no momento.",
    };
  }

  if (ad.weight === 2) {
    return {
      visible: true,
      title: "Mais anúncios deste anunciante",
      subtitle: "Exibindo somente anúncios do lojista desta página.",
      items: ad.stockFromSeller.slice(0, 4),
      emptyMessage: "Este anunciante ainda não possui outros veículos publicados.",
    };
  }

  if (ad.weight === 3) {
    return {
      visible: true,
      title: `Estoque da ${ad.seller.name}`,
      subtitle: "Exibindo somente anúncios da loja deste lojista.",
      items: ad.stockFromSeller.slice(0, 4),
      emptyMessage: `A ${ad.seller.name} ainda não possui outros veículos publicados.`,
    };
  }

  if (ad.weight === 4 && !dealer) {
    return {
      visible: false,
      title: "",
      items: [],
    };
  }

  return {
    visible: true,
    title: `Destaques da ${ad.seller.name}`,
    subtitle: "Exibindo somente anúncios da página do lojista.",
    items: ad.stockFromSeller.slice(0, 4),
    emptyMessage: `A ${ad.seller.name} ainda não possui outros anúncios disponíveis.`,
  };
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[#E5E9F2] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="mb-5">
        <h2 className="text-[28px] font-bold tracking-[-0.03em] text-[#1D2440]">{title}</h2>
        {subtitle ? (
          <p className="mt-2 text-sm leading-6 text-[#6E748A]">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function VehicleCard({ item }: { item: RelatedAd }) {
  return (
    <Link
      href={`/comprar/${item.slug}`}
      className="group overflow-hidden rounded-[24px] border border-[#E5E9F2] bg-white shadow-[0_12px_30px_rgba(30,41,59,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(30,41,59,0.10)]"
    >
      <div className="aspect-[16/10] overflow-hidden bg-[#EDF2FB]">
        <img
          src={item.image}
          alt={item.title}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
        />
      </div>

      <div className="space-y-2 p-4">
        {item.badge ? (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClasses(item.badge)}`}>
            {item.badge}
          </span>
        ) : null}

        <h3 className="line-clamp-2 min-h-[44px] text-[18px] font-semibold leading-6 text-[#1D2440]">
          {item.title}
        </h3>

        <p className="text-sm text-[#6E748A]">
          {item.city} - {item.state}
        </p>

        <div className="flex items-center justify-between gap-3 pt-1">
          <strong className="text-[20px] font-extrabold text-[#1F66E5]">
            {formatCurrency(item.price)}
          </strong>
          <span className="text-xs font-medium text-[#6E748A]">{item.yearLabel}</span>
        </div>
      </div>
    </Link>
  );
}

export default function AdDetailsPage({ ad }: Props) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [favorite, setFavorite] = useState(false);
  const [form, setForm] = useState<ContactFormState>({
    name: "",
    phone: "",
    email: "",
    message: `Olá, tenho interesse no ${ad.title}. Gostaria de mais informações.`,
  });

  const showcase = useMemo(() => resolveShowcase(ad), [ad]);

  const whatsappLink = useMemo(() => {
    const message = `Olá! Tenho interesse no veículo ${ad.title} anunciado no Carros na Cidade por ${formatCurrency(
      ad.price
    )}. Gostaria de mais informações.`;

    return `https://wa.me/${normalizeWhatsapp(ad.seller.whatsapp)}?text=${encodeURIComponent(message)}`;
  }, [ad]);

  const financingLink = useMemo(() => {
    const params = new URLSearchParams({
      veiculo: ad.slug,
      titulo: ad.title,
      valor: String(ad.price),
      cidade: ad.city,
    });

    return `/financiamento?${params.toString()}`;
  }, [ad]);

  const priceDiff = ad.price - ad.fipeValue;
  const diffPercent = ad.fipeValue ? (priceDiff / ad.fipeValue) * 100 : 0;
  const belowFipe = priceDiff < 0;

  function goPrevImage() {
    setSelectedImage((current) => (current === 0 ? ad.images.length - 1 : current - 1));
  }

  function goNextImage() {
    setSelectedImage((current) => (current === ad.images.length - 1 ? 0 : current + 1));
  }

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = ad.title;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // segue para clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      alert("Link copiado com sucesso.");
    } catch {
      alert("Não foi possível copiar o link.");
    }
  }

  function handleContactSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = [
      `Olá! Tenho interesse no veículo ${ad.title}.`,
      `Nome: ${form.name || "Não informado"}`,
      `Telefone: ${form.phone || "Não informado"}`,
      `E-mail: ${form.email || "Não informado"}`,
      `Mensagem: ${form.message || "Gostaria de mais informações."}`,
    ].join("\n");

    window.open(
      `https://wa.me/${normalizeWhatsapp(ad.seller.whatsapp)}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  const detailItems = [
    { label: "Ano/modelo", value: ad.yearLabel },
    { label: "Quilometragem", value: `${formatNumber(ad.mileage)} km` },
    { label: "Câmbio", value: ad.transmission },
    { label: "Combustível", value: ad.fuel },
    { label: "Carroceria", value: ad.bodyStyle },
    { label: "Cor", value: ad.color },
    { label: "Final de placa", value: ad.plateFinal },
    { label: "Publicação", value: ad.publishedLabel },
  ];

  return (
    <main className="min-h-screen bg-[#F5F7FB]">
      <div className="mx-auto max-w-[1360px] px-4 pb-16 pt-6">
        <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[#6E748A]">
          <Link href="/" className="transition hover:text-[#1F66E5]">
            {ad.city}
          </Link>
          <span>›</span>
          <Link href="/comprar" className="transition hover:text-[#1F66E5]">
            {ad.brand}
          </Link>
          <span>›</span>
          <span>{ad.model}</span>
          <span>›</span>
          <span>{ad.version}</span>
        </nav>

        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap gap-2">
              {ad.badges.map((badge) => (
                <span
                  key={badge}
                  className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-bold ${badgeClasses(
                    badge
                  )}`}
                >
                  {badge}
                </span>
              ))}
            </div>

            <h1 className="max-w-[920px] text-[34px] font-extrabold leading-[1.08] tracking-[-0.04em] text-[#1D2440] sm:text-[46px]">
              {ad.title}
            </h1>

            <div className="mt-5 flex flex-wrap gap-3">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-[#E5E9F2] bg-white px-3 py-2 text-sm font-medium text-[#4B536A] shadow-sm">
                {ad.city} - {ad.state}
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl border border-[#E5E9F2] bg-white px-3 py-2 text-sm font-medium text-[#4B536A] shadow-sm">
                {sellerTypeLabel(ad.seller.type)}
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl border border-[#E5E9F2] bg-white px-3 py-2 text-sm font-medium text-[#4B536A] shadow-sm">
                {formatNumber(ad.mileage)} km
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl border border-[#E5E9F2] bg-white px-3 py-2 text-sm font-medium text-[#4B536A] shadow-sm">
                Peso {ad.weight}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3 xl:items-end">
            <div className="text-left xl:text-right">
              <div className="text-sm font-medium text-[#6E748A]">Preço do veículo</div>
              <div className="text-[42px] font-extrabold tracking-[-0.04em] text-[#1D2440]">
                {formatCurrency(ad.price)}
              </div>
              <div className={`mt-1 text-sm font-semibold ${belowFipe ? "text-green-600" : "text-orange-600"}`}>
                {belowFipe ? "Abaixo da FIPE" : "Acima da FIPE"} • {percentageLabel(diffPercent)}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFavorite((value) => !value)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E5E9F2] bg-white px-4 py-3 text-sm font-semibold text-[#1D2440] transition hover:border-[#D0D8E7] hover:bg-[#F8FAFF]"
              >
                {favorite ? "Salvo" : "Favoritar"}
              </button>

              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E5E9F2] bg-white px-4 py-3 text-sm font-semibold text-[#1D2440] transition hover:border-[#D0D8E7] hover:bg-[#F8FAFF]"
              >
                Compartilhar
              </button>
            </div>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-[28px] border border-[#E5E9F2] bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-4">
              <div className="relative overflow-hidden rounded-[22px] bg-[#EDF2FB]">
                <div className="aspect-[16/10] sm:aspect-[16/9] xl:aspect-[16/8.4]">
                  <img
                    src={ad.images[selectedImage]}
                    alt={`${ad.title} - foto ${selectedImage + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>

                {ad.images.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={goPrevImage}
                      className="absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#1D2440] shadow-lg backdrop-blur transition hover:bg-white"
                      aria-label="Foto anterior"
                    >
                      ‹
                    </button>

                    <button
                      type="button"
                      onClick={goNextImage}
                      className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#1D2440] shadow-lg backdrop-blur transition hover:bg-white"
                      aria-label="Próxima foto"
                    >
                      ›
                    </button>

                    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/85 px-3 py-2 shadow-lg backdrop-blur">
                      {ad.images.map((_, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setSelectedImage(index)}
                          className={`h-2.5 rounded-full transition ${
                            selectedImage === index ? "w-8 bg-[#2F67F6]" : "w-2.5 bg-[#CBD5E1]"
                          }`}
                          aria-label={`Ir para foto ${index + 1}`}
                        />
                      ))}
                    </div>
                  </>
                ) : null}

                <div className="absolute bottom-4 right-4 rounded-2xl bg-white/90 px-4 py-2 text-sm font-semibold text-[#1D2440] shadow-lg backdrop-blur">
                  {ad.images.length} fotos
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                {ad.images.slice(0, 6).map((image, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setSelectedImage(index)}
                    className={`overflow-hidden rounded-[18px] border transition ${
                      selectedImage === index
                        ? "border-[#2F67F6] ring-2 ring-[#DDE8FF]"
                        : "border-[#E5E9F2] hover:border-[#C9D7F6]"
                    }`}
                  >
                    <div className="aspect-[4/3] bg-[#EDF2FB]">
                      <img src={image} alt={`Miniatura ${index + 1}`} className="h-full w-full object-cover" />
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <SectionCard title="Principais destaques">
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                {ad.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EEF4FF] text-[#2F67F6]">
                      ✓
                    </span>
                    <span className="text-[15px] font-medium text-[#4B536A]">{feature}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Informações do veículo">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {detailItems.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[22px] border border-[#E5E9F2] bg-[#FBFCFF] p-4"
                  >
                    <div className="text-sm font-medium text-[#6E748A]">{item.label}</div>
                    <div className="mt-2 text-[18px] font-bold text-[#1D2440]">{item.value}</div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Tabela FIPE">
              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="rounded-[24px] border border-[#D8E8D8] bg-[#F5FCF5] p-5">
                  <div className="text-sm font-semibold text-[#4B536A]">Valor FIPE</div>
                  <div className="mt-2 text-[34px] font-extrabold tracking-[-0.04em] text-[#1D2440]">
                    {formatCurrency(ad.fipeValue)}
                  </div>
                  <div className={`mt-2 text-sm font-semibold ${belowFipe ? "text-green-600" : "text-orange-600"}`}>
                    {belowFipe
                      ? `${percentageLabel(diffPercent)} abaixo da FIPE`
                      : `${percentageLabel(diffPercent)} acima da FIPE`}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#E5E9F2] bg-[#FBFCFF] p-5">
                  <div className="text-sm font-semibold text-[#4B536A]">Preço do anúncio</div>
                  <div className="mt-2 text-[28px] font-extrabold tracking-[-0.04em] text-[#1F66E5]">
                    {formatCurrency(ad.price)}
                  </div>
                  <div className="mt-2 text-sm text-[#6E748A]">
                    Diferença de {formatCurrency(Math.abs(priceDiff))} em relação à FIPE.
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <Link
                      href={financingLink}
                      className="inline-flex items-center justify-center rounded-2xl bg-[#2F67F6] px-5 py-3 text-sm font-bold text-white shadow-[0_12px_26px_rgba(47,103,246,0.24)] transition hover:bg-[#1F66E5]"
                    >
                      Simular financiamento
                    </Link>

                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-2xl bg-[#16A34A] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(22,163,74,0.24)] transition hover:bg-[#15803D]"
                    >
                      Chamar no WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            </SectionCard>

            {showcase.visible ? (
              <SectionCard title={showcase.title} subtitle={showcase.subtitle}>
                {showcase.items.length ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {showcase.items.map((item) => (
                      <VehicleCard key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-[#E5E9F2] bg-[#FBFCFF] p-6 text-sm leading-7 text-[#5C647C]">
                    {showcase.emptyMessage || "Nenhum anúncio disponível no momento."}
                  </div>
                )}
              </SectionCard>
            ) : null}

            <SectionCard title="Descrição do veículo">
              <div className="space-y-4 text-[16px] leading-8 text-[#4B536A]">
                <p>{ad.description}</p>
                <p>
                  Atendimento com foco em transparência, avaliação justa e envio rápido de informações.
                  Você pode falar direto com o vendedor pelo WhatsApp ou simular financiamento sem sair do portal.
                </p>
              </div>
            </SectionCard>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <section className="rounded-[28px] border border-[#E5E9F2] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              <div className="flex items-start gap-4">
                <div className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#EEF4FF] text-[22px] font-extrabold text-[#2F67F6]">
                  {ad.seller.name.charAt(0)}
                </div>

                <div className="min-w-0">
                  <div className="text-[28px] font-extrabold tracking-[-0.04em] text-[#1D2440]">
                    {ad.seller.name}
                  </div>
                  <div className="mt-1 text-base font-medium text-[#6E748A]">
                    {ad.seller.city} - {ad.seller.state}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-1 rounded-full bg-[#FFF7E8] px-3 py-1 text-sm font-semibold text-[#B7791F]">
                      ★ {ad.seller.rating.toFixed(1)}
                    </div>

                    <span className="text-sm text-[#6E748A]">{ad.seller.reviewCount} avaliações</span>
                    <span className="text-sm text-[#6E748A]">•</span>
                    <span className="text-sm text-[#6E748A]">{sellerTypeLabel(ad.seller.type)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Link
                  href={financingLink}
                  className="inline-flex items-center justify-center rounded-2xl bg-[#2F67F6] px-4 py-3.5 text-center text-sm font-bold text-white shadow-[0_12px_26px_rgba(47,103,246,0.24)] transition hover:bg-[#1F66E5]"
                >
                  Simular financiamento
                </Link>

                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl bg-[#16A34A] px-4 py-3.5 text-center text-sm font-bold text-white shadow-[0_10px_24px_rgba(22,163,74,0.24)] transition hover:bg-[#15803D]"
                >
                  WhatsApp
                </a>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <a
                  href={`tel:${digitsOnly(ad.seller.phone)}`}
                  className="inline-flex items-center justify-center rounded-2xl border border-[#E5E9F2] bg-[#FBFCFF] px-4 py-3 text-sm font-semibold text-[#1D2440] transition hover:bg-white"
                >
                  {ad.seller.phone}
                </a>

                <a
                  href="#formulario-contato"
                  className="inline-flex items-center justify-center rounded-2xl border border-[#E5E9F2] bg-[#FBFCFF] px-4 py-3 text-sm font-semibold text-[#1D2440] transition hover:bg-white"
                >
                  Enviar mensagem
                </a>
              </div>

              <div className="mt-6 rounded-[22px] border border-[#E5E9F2] bg-[#FBFCFF] p-4">
                <div className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2F67F6]">
                  Informações do anunciante
                </div>
                <div className="mt-3 space-y-2 text-sm text-[#5C647C]">
                  <p>{ad.seller.address}</p>
                  <p>{ad.seller.stockCount} veículos anunciados no portal</p>
                  <p>Peso comercial do anúncio: {ad.weight}</p>
                </div>
              </div>
            </section>

            <section
              id="formulario-contato"
              className="rounded-[28px] border border-[#E5E9F2] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
            >
              <h3 className="text-[24px] font-bold tracking-[-0.03em] text-[#1D2440]">
                Enviar mensagem
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#6E748A]">
                Preencha os dados abaixo e a conversa seguirá direto para o vendedor via WhatsApp.
              </p>

              <form onSubmit={handleContactSubmit} className="mt-5 space-y-3">
                <input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Nome"
                  className="w-full rounded-2xl border border-[#E5E9F2] bg-[#FBFCFF] px-4 py-3 text-sm text-[#1D2440] outline-none transition placeholder:text-[#9AA3B2] focus:border-[#AFC6FF] focus:bg-white"
                />

                <input
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="Telefone"
                  className="w-full rounded-2xl border border-[#E5E9F2] bg-[#FBFCFF] px-4 py-3 text-sm text-[#1D2440] outline-none transition placeholder:text-[#9AA3B2] focus:border-[#AFC6FF] focus:bg-white"
                />

                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="seuemail@exemplo.com"
                  className="w-full rounded-2xl border border-[#E5E9F2] bg-[#FBFCFF] px-4 py-3 text-sm text-[#1D2440] outline-none transition placeholder:text-[#9AA3B2] focus:border-[#AFC6FF] focus:bg-white"
                />

                <textarea
                  value={form.message}
                  onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
                  rows={5}
                  placeholder="Digite sua mensagem"
                  className="w-full rounded-2xl border border-[#E5E9F2] bg-[#FBFCFF] px-4 py-3 text-sm text-[#1D2440] outline-none transition placeholder:text-[#9AA3B2] focus:border-[#AFC6FF] focus:bg-white"
                />

                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-[#2F67F6] px-5 py-3.5 text-base font-bold text-white shadow-[0_12px_26px_rgba(47,103,246,0.24)] transition hover:bg-[#1F66E5]"
                >
                  Enviar mensagem
                </button>
              </form>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
