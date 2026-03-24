"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type SellerType = "particular" | "lojista";

type Props = {
  initialType: SellerType;
};

const PANEL_NEW_AD_ROUTE = "/anunciar/novo";

function buildPanelHref(type: SellerType) {
  return `${PANEL_NEW_AD_ROUTE}?tipo=${type}`;
}

function buildLoginHref(type: SellerType) {
  const next = buildPanelHref(type);
  const query = new URLSearchParams({
    next,
    flow: "anunciar",
    tipo: type,
  });

  return `/entrar?${query.toString()}`;
}

function buildSignupHref(type: SellerType) {
  const next = buildPanelHref(type);
  const query = new URLSearchParams({
    next,
    flow: "anunciar",
    tipo: type,
    modo: "cadastro",
  });

  return `/entrar?${query.toString()}`;
}

function SectionTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="max-w-[760px]">
      {eyebrow ? (
        <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-[#2F67F6]">
          {eyebrow}
        </div>
      ) : null}
      <h1 className="text-[38px] font-extrabold leading-[1.03] tracking-[-0.05em] text-[#1D2440] sm:text-[52px]">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-4 text-[16px] leading-8 text-[#5C647C] sm:text-[18px]">{subtitle}</p>
      ) : null}
    </div>
  );
}

export default function SellPublishFlowClient({ initialType }: Props) {
  const [selectedType, setSelectedType] = useState<SellerType>(initialType);

  const panelHref = useMemo(() => buildPanelHref(selectedType), [selectedType]);
  const loginHref = useMemo(() => buildLoginHref(selectedType), [selectedType]);
  const signupHref = useMemo(() => buildSignupHref(selectedType), [selectedType]);

  const selectedMeta = useMemo(() => {
    if (selectedType === "lojista") {
      return {
        title: "Fluxo para lojista",
        subtitle:
          "Ideal para operação com estoque, exposição comercial mais forte e continuidade futura com CRM.",
        bullets: [
          "Preparado para anúncios em volume",
          "Hierarquia comercial no catálogo",
          "Presença regional com cara de operação séria",
          "Pronto para crescer junto com seu estoque",
        ],
      };
    }

    return {
      title: "Fluxo para particular",
      subtitle:
        "Ideal para quem quer publicar um veículo com rapidez, visual premium e foco em compradores da região.",
      bullets: [
        "Publicação simples e objetiva",
        "Anúncio com aparência premium",
        "Contato rápido com interessados",
        "Mais confiança na apresentação do carro",
      ],
    };
  }, [selectedType]);

  const stepCards = [
    {
      step: "01",
      title: "Escolha seu perfil",
      description: "Defina se o anúncio será de particular ou lojista.",
    },
    {
      step: "02",
      title: "Entre ou crie sua conta",
      description: "O acesso direciona você para o fluxo correto de publicação.",
    },
    {
      step: "03",
      title: "Publique seu veículo",
      description: "Depois do acesso, você segue para o formulário do anúncio.",
    },
  ];

  return (
    <main className="min-h-screen bg-[#F5F7FB]">
      <div className="mx-auto max-w-[1320px] px-4 pb-16 pt-6 sm:pt-8">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div>
            <div className="mb-4 inline-flex rounded-full border border-[#DCE6F7] bg-white px-4 py-2 text-sm font-bold text-[#2F67F6] shadow-sm">
              Fluxo de anúncio
            </div>

            <SectionTitle
              title="Comece seu anúncio no Carros na Cidade"
              subtitle="Escolha seu perfil e siga para o acesso. A partir daí, o usuário entra no fluxo de publicação do veículo com direcionamento correto para particular ou lojista."
            />

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSelectedType("particular")}
                className={`rounded-[28px] border p-6 text-left transition ${
                  selectedType === "particular"
                    ? "border-[#2F67F6] bg-[linear-gradient(180deg,#F8FBFF_0%,#EEF4FF_100%)] shadow-[0_14px_32px_rgba(47,103,246,0.10)]"
                    : "border-[#E5E9F2] bg-white hover:border-[#C7D7F8]"
                }`}
              >
                <div className="text-sm font-bold uppercase tracking-[0.16em] text-[#2F67F6]">
                  Particular
                </div>
                <h2 className="mt-3 text-[28px] font-extrabold tracking-[-0.04em] text-[#1D2440]">
                  Quero vender meu carro
                </h2>
                <p className="mt-3 text-[15px] leading-7 text-[#5C647C]">
                  Fluxo mais simples, rápido e focado em boa apresentação do veículo e contato qualificado.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedType("lojista")}
                className={`rounded-[28px] border p-6 text-left transition ${
                  selectedType === "lojista"
                    ? "border-[#2F67F6] bg-[linear-gradient(180deg,#F8FBFF_0%,#EEF4FF_100%)] shadow-[0_14px_32px_rgba(47,103,246,0.10)]"
                    : "border-[#E5E9F2] bg-white hover:border-[#C7D7F8]"
                }`}
              >
                <div className="text-sm font-bold uppercase tracking-[0.16em] text-[#2F67F6]">
                  Lojista
                </div>
                <h2 className="mt-3 text-[28px] font-extrabold tracking-[-0.04em] text-[#1D2440]">
                  Quero anunciar como loja
                </h2>
                <p className="mt-3 text-[15px] leading-7 text-[#5C647C]">
                  Fluxo preparado para operação comercial, estoque, hierarquia de exposição e evolução com CRM.
                </p>
              </button>
            </div>

            <div className="mt-8 rounded-[32px] border border-[#DCE6F7] bg-[linear-gradient(145deg,#FFFFFF_0%,#F4F8FF_50%,#EDF3FF_100%)] p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)] sm:p-7">
              <div className="text-sm font-bold uppercase tracking-[0.16em] text-[#2F67F6]">
                Perfil selecionado
              </div>
              <h3 className="mt-3 text-[32px] font-extrabold tracking-[-0.04em] text-[#1D2440]">
                {selectedMeta.title}
              </h3>
              <p className="mt-3 text-[16px] leading-8 text-[#5C647C]">{selectedMeta.subtitle}</p>

              <div className="mt-6 grid gap-3">
                {selectedMeta.bullets.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-[18px] border border-white/70 bg-white/80 px-4 py-3"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#EEF4FF] text-[#2F67F6]">
                      ✓
                    </span>
                    <span className="text-sm font-semibold text-[#1D2440]">{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={loginHref}
                  className="inline-flex items-center justify-center rounded-[20px] bg-[#2F67F6] px-6 py-4 text-base font-bold text-white shadow-[0_12px_30px_rgba(47,103,246,0.24)] transition hover:bg-[#1F66E5]"
                >
                  Entrar e continuar
                </Link>

                <Link
                  href={signupHref}
                  className="inline-flex items-center justify-center rounded-[20px] border border-[#E5E9F2] bg-white px-6 py-4 text-base font-bold text-[#1D2440] transition hover:border-[#D3DCEC] hover:bg-[#F9FBFF]"
                >
                  Criar conta e continuar
                </Link>
              </div>

              <div className="mt-4 text-sm text-[#6E748A]">
                Destino pós-acesso: <span className="font-semibold text-[#1D2440]">{panelHref}</span>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[32px] border border-[#E5E9F2] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-7">
              <div className="text-sm font-bold uppercase tracking-[0.16em] text-[#2F67F6]">
                Etapas
              </div>

              <div className="mt-5 grid gap-4">
                {stepCards.map((item) => (
                  <div
                    key={item.step}
                    className="rounded-[24px] border border-[#E5E9F2] bg-[#FBFCFF] p-5"
                  >
                    <div className="text-[13px] font-extrabold tracking-[0.16em] text-[#2F67F6]">
                      {item.step}
                    </div>
                    <div className="mt-2 text-[22px] font-bold tracking-[-0.03em] text-[#1D2440]">
                      {item.title}
                    </div>
                    <p className="mt-2 text-[15px] leading-7 text-[#5C647C]">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border border-[#E5E9F2] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-7">
              <div className="text-sm font-bold uppercase tracking-[0.16em] text-[#2F67F6]">
                O que preparar
              </div>

              <div className="mt-5 grid gap-3">
                {[
                  "Fotos externas e internas do veículo",
                  "Quilometragem e versão corretas",
                  "Cidade, preço e principais diferenciais",
                  "Descrição comercial clara e honesta",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] px-4 py-3"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#EEF4FF] text-[#2F67F6]">
                      ✓
                    </span>
                    <span className="text-sm font-semibold text-[#1D2440]">{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-[24px] border border-[#DCE6F7] bg-[linear-gradient(135deg,#F8FBFF_0%,#EEF4FF_100%)] p-5">
                <div className="text-[20px] font-bold text-[#1D2440]">
                  Fluxo preparado para conversão
                </div>
                <p className="mt-2 text-[15px] leading-7 text-[#5C647C]">
                  Essa etapa já separa corretamente particular e lojista e entrega um caminho mais limpo para autenticação e continuidade do anúncio.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
