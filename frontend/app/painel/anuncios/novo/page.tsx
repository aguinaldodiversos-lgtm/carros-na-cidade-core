"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type SellerType = "particular" | "lojista";

type FormState = {
  sellerType: SellerType;
  brand: string;
  model: string;
  version: string;
  yearModel: string;
  mileage: string;
  price: string;
  fipeValue: string;
  city: string;
  state: string;
  fuel: string;
  transmission: string;
  bodyStyle: string;
  color: string;
  plateFinal: string;
  title: string;
  description: string;
  whatsapp: string;
  phone: string;
  acceptTerms: boolean;
};

type SaveState = "idle" | "saved" | "loaded";

const DRAFT_STORAGE_KEY = "carros-na-cidade:new-ad:draft";

const INITIAL_FORM: FormState = {
  sellerType: "particular",
  brand: "",
  model: "",
  version: "",
  yearModel: "",
  mileage: "",
  price: "",
  fipeValue: "",
  city: "São Paulo",
  state: "SP",
  fuel: "Flex",
  transmission: "Automático",
  bodyStyle: "Sedã",
  color: "",
  plateFinal: "",
  title: "",
  description: "",
  whatsapp: "",
  phone: "",
  acceptTerms: false,
};

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  const number = Number(digits) / 100;

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(number);
}

function parseCurrency(value: string) {
  if (!value) return 0;

  const cleaned = value
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value || 0);
}

function percentageLabel(value: number) {
  return `${Math.abs(value).toFixed(1).replace(".", ",")}%`;
}

function getCompletionScore(form: FormState, photoCount: number) {
  const checks = [
    form.brand,
    form.model,
    form.version,
    form.yearModel,
    form.mileage,
    form.price,
    form.city,
    form.state,
    form.description,
    form.whatsapp || form.phone,
    photoCount > 0 ? "ok" : "",
  ];

  const filled = checks.filter(Boolean).length;
  return {
    filled,
    total: checks.length,
    percent: Math.round((filled / checks.length) * 100),
  };
}

function buildSuggestedTitle(form: FormState) {
  return [form.yearModel, form.brand, form.model, form.version].filter(Boolean).join(" ").trim();
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[#1D2440]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] px-4 py-3 text-sm text-[#1D2440] outline-none transition placeholder:text-[#98A2B3] focus:border-[#AFC6FF] focus:bg-white"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[#1D2440]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] px-4 py-3 text-sm text-[#1D2440] outline-none transition focus:border-[#AFC6FF] focus:bg-white"
      >
        {options.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
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

function ProfileCard({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[24px] border p-5 text-left transition ${
        active
          ? "border-[#2F67F6] bg-[linear-gradient(180deg,#F8FBFF_0%,#EEF4FF_100%)] shadow-[0_14px_32px_rgba(47,103,246,0.10)]"
          : "border-[#E5E9F2] bg-white hover:border-[#C7D7F8]"
      }`}
    >
      <div className="text-sm font-bold uppercase tracking-[0.16em] text-[#2F67F6]">{title}</div>
      <p className="mt-3 text-sm leading-7 text-[#5C647C]">{description}</p>
    </button>
  );
}

export default function NovoAnuncioPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const searchType = searchParams.get("tipo") === "lojista" ? "lojista" : "particular";

  const [form, setForm] = useState<FormState>({
    ...INITIAL_FORM,
    sellerType: searchType,
  });

  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      sellerType: searchType,
    }));
  }, [searchType]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<FormState>;

      setForm((prev) => ({
        ...prev,
        ...parsed,
        sellerType: (parsed.sellerType === "lojista" ? "lojista" : prev.sellerType) as SellerType,
      }));

      setSaveState("loaded");
    } catch {
      // ignora draft inválido
    }
  }, []);

  const suggestedTitle = useMemo(() => buildSuggestedTitle(form), [form]);

  const finalTitle = useMemo(() => {
    return form.title.trim() || suggestedTitle || "Novo anúncio";
  }, [form.title, suggestedTitle]);

  const priceNumber = useMemo(() => parseCurrency(form.price), [form.price]);
  const fipeNumber = useMemo(() => parseCurrency(form.fipeValue), [form.fipeValue]);

  const fipeDelta = priceNumber - fipeNumber;
  const fipePercent = fipeNumber > 0 ? (fipeDelta / fipeNumber) * 100 : 0;
  const belowFipe = fipeNumber > 0 && priceNumber > 0 && priceNumber < fipeNumber;

  const completion = useMemo(
    () => getCompletionScore(form, photoPreviews.length),
    [form, photoPreviews.length]
  );

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function changeType(type: SellerType) {
    updateField("sellerType", type);
    router.replace(`${pathname}?tipo=${type}`, { scroll: false });
  }

  function handlePriceChange(value: string) {
    updateField("price", formatCurrencyInput(value));
  }

  function handleFipeChange(value: string) {
    updateField("fipeValue", formatCurrencyInput(value));
  }

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const urls = files.map((file) => URL.createObjectURL(file));
    setPhotoPreviews(urls.slice(0, 10));
  }

  function handleSaveDraft() {
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
      setSaveState("saved");
    } catch {
      setSaveState("idle");
    }
  }

  function handleReview() {
    setShowReview(true);
    handleSaveDraft();
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  const profileDescription =
    form.sellerType === "lojista"
      ? "Fluxo preparado para loja, estoque e hierarquia comercial no catálogo."
      : "Fluxo simples e direto para quem quer vender um único carro com apresentação premium.";

  return (
    <main className="min-h-screen bg-[#F5F7FB]">
      <div className="mx-auto max-w-[1360px] px-4 pb-16 pt-6">
        <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[#6E748A]">
          <Link href="/painel" className="transition hover:text-[#1F66E5]">
            Painel
          </Link>
          <span>›</span>
          <Link href="/painel/anuncios" className="transition hover:text-[#1F66E5]">
            Anúncios
          </Link>
          <span>›</span>
          <span>Novo anúncio</span>
        </nav>

        <section className="rounded-[32px] border border-[#DCE6F7] bg-[linear-gradient(135deg,#F8FBFF_0%,#EEF4FF_52%,#FFF5EA_100%)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.05)] sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-[860px]">
              <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-[#2F67F6]">
                Publicação de anúncio
              </div>
              <h1 className="text-[38px] font-extrabold leading-[1.03] tracking-[-0.05em] text-[#1D2440] sm:text-[54px]">
                Crie um anúncio premium para vender com mais confiança
              </h1>
              <p className="mt-4 text-[16px] leading-8 text-[#5C647C] sm:text-[18px]">
                Esta tela já organiza os dados do veículo, calcula contexto de preço com FIPE,
                permite salvar rascunho e deixa o anúncio pronto para a próxima integração de publicação.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:w-[360px]">
              <div className="rounded-[22px] border border-white/70 bg-white/80 p-4">
                <div className="text-[22px] font-extrabold text-[#1D2440]">{completion.percent}%</div>
                <div className="mt-1 text-sm text-[#6E748A]">preenchido</div>
              </div>
              <div className="rounded-[22px] border border-white/70 bg-white/80 p-4">
                <div className="text-[22px] font-extrabold text-[#1D2440]">{photoPreviews.length}</div>
                <div className="mt-1 text-sm text-[#6E748A]">fotos</div>
              </div>
              <div className="rounded-[22px] border border-white/70 bg-white/80 p-4">
                <div className="text-[22px] font-extrabold text-[#1D2440]">
                  {form.sellerType === "lojista" ? "Loja" : "Particular"}
                </div>
                <div className="mt-1 text-sm text-[#6E748A]">perfil</div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <SectionCard
              title="Perfil do anúncio"
              subtitle="Escolha o tipo de anunciante para manter o fluxo coerente com a lógica comercial do portal."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <ProfileCard
                  active={form.sellerType === "particular"}
                  title="Particular"
                  description="Ideal para vender um único carro com rapidez, boa apresentação e contato direto."
                  onClick={() => changeType("particular")}
                />
                <ProfileCard
                  active={form.sellerType === "lojista"}
                  title="Lojista"
                  description="Ideal para estoque, exposição comercial mais forte e evolução para operação completa."
                  onClick={() => changeType("lojista")}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Dados principais do veículo"
              subtitle="Essas informações são a base do título, da navegação e da apresentação no catálogo."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InputField
                  label="Marca"
                  value={form.brand}
                  onChange={(value) => updateField("brand", value)}
                  placeholder="Ex.: Toyota"
                />
                <InputField
                  label="Modelo"
                  value={form.model}
                  onChange={(value) => updateField("model", value)}
                  placeholder="Ex.: Corolla"
                />
                <InputField
                  label="Versão"
                  value={form.version}
                  onChange={(value) => updateField("version", value)}
                  placeholder="Ex.: XEi 2.0 Flex Automático"
                />
                <InputField
                  label="Ano/modelo"
                  value={form.yearModel}
                  onChange={(value) => updateField("yearModel", value)}
                  placeholder="Ex.: 2021/2022"
                />
                <InputField
                  label="Cidade"
                  value={form.city}
                  onChange={(value) => updateField("city", value)}
                  placeholder="Ex.: São Paulo"
                />
                <InputField
                  label="Estado"
                  value={form.state}
                  onChange={(value) => updateField("state", value.toUpperCase())}
                  placeholder="SP"
                />
                <InputField
                  label="Título do anúncio"
                  value={form.title}
                  onChange={(value) => updateField("title", value)}
                  placeholder={suggestedTitle || "Será sugerido automaticamente"}
                />
                <div className="rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] p-4">
                  <div className="text-sm font-semibold text-[#1D2440]">Título sugerido</div>
                  <div className="mt-3 text-sm leading-7 text-[#5C647C]">
                    {suggestedTitle || "Preencha marca, modelo, versão e ano para gerar uma sugestão."}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Preço e posicionamento"
              subtitle="O comprador tende a confiar mais quando preço e contexto de mercado estão bem apresentados."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InputField
                  label="Preço do anúncio"
                  value={form.price}
                  onChange={handlePriceChange}
                  placeholder="R$ 0,00"
                />
                <InputField
                  label="Valor FIPE"
                  value={form.fipeValue}
                  onChange={handleFipeChange}
                  placeholder="R$ 0,00"
                />
                <InputField
                  label="Quilometragem"
                  value={form.mileage}
                  onChange={(value) => updateField("mileage", value.replace(/[^\d]/g, ""))}
                  placeholder="Ex.: 32500"
                />
                <InputField
                  label="Final de placa"
                  value={form.plateFinal}
                  onChange={(value) => updateField("plateFinal", value.replace(/[^\d]/g, ""))}
                  placeholder="Ex.: 7"
                />

                <SelectField
                  label="Combustível"
                  value={form.fuel}
                  onChange={(value) => updateField("fuel", value)}
                  options={["Flex", "Gasolina", "Diesel", "Híbrido", "Elétrico"]}
                />
                <SelectField
                  label="Câmbio"
                  value={form.transmission}
                  onChange={(value) => updateField("transmission", value)}
                  options={["Automático", "Manual", "CVT", "Automatizado"]}
                />
                <SelectField
                  label="Carroceria"
                  value={form.bodyStyle}
                  onChange={(value) => updateField("bodyStyle", value)}
                  options={["Sedã", "Hatch", "SUV", "Picape", "Cupê", "Van"]}
                />
                <InputField
                  label="Cor"
                  value={form.color}
                  onChange={(value) => updateField("color", value)}
                  placeholder="Ex.: Prata"
                />
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <div className="rounded-[24px] border border-[#E5E9F2] bg-[#FBFCFF] p-5">
                  <div className="text-sm font-semibold text-[#4B536A]">Preço atual</div>
                  <div className="mt-2 text-[30px] font-extrabold tracking-[-0.04em] text-[#1D2440]">
                    {priceNumber > 0 ? formatCurrencyInput(form.price) : "R$ 0,00"}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#D8E8D8] bg-[#F5FCF5] p-5">
                  <div className="text-sm font-semibold text-[#4B536A]">Valor FIPE</div>
                  <div className="mt-2 text-[30px] font-extrabold tracking-[-0.04em] text-[#1D2440]">
                    {fipeNumber > 0 ? formatCurrencyInput(form.fipeValue) : "R$ 0,00"}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#E5E9F2] bg-white p-5">
                  <div className="text-sm font-semibold text-[#4B536A]">Comparativo</div>
                  <div
                    className={`mt-2 text-[18px] font-bold ${
                      fipeNumber > 0
                        ? belowFipe
                          ? "text-green-600"
                          : "text-orange-600"
                        : "text-[#1D2440]"
                    }`}
                  >
                    {fipeNumber > 0
                      ? `${belowFipe ? "Abaixo" : "Acima"} da FIPE • ${percentageLabel(fipePercent)}`
                      : "Informe a FIPE para comparar"}
                  </div>
                  {fipeNumber > 0 ? (
                    <div className="mt-2 text-sm text-[#6E748A]">
                      Diferença de{" "}
                      <span className="font-semibold text-[#1D2440]">
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        }).format(Math.abs(fipeDelta))}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Fotos do anúncio"
              subtitle="Quanto melhor a vitrine visual, maior a percepção de valor e a chance de clique."
            >
              <label className="flex min-h-[170px] cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-[#B9C8E8] bg-[#F8FBFF] px-6 py-8 text-center transition hover:border-[#2F67F6] hover:bg-[#F2F7FF]">
                <span className="text-[18px] font-bold text-[#1D2440]">Adicionar fotos</span>
                <span className="mt-2 text-sm leading-7 text-[#6E748A]">
                  Selecione até 10 imagens do veículo. A primeira será a foto principal.
                </span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
              </label>

              {photoPreviews.length ? (
                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  {photoPreviews.map((src, index) => (
                    <div
                      key={src}
                      className="overflow-hidden rounded-[22px] border border-[#E5E9F2] bg-white"
                    >
                      <div className="aspect-[4/3] bg-[#EDF2FB]">
                        <img src={src} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />
                      </div>
                      <div className="border-t border-[#EEF2F7] px-4 py-3 text-sm font-semibold text-[#1D2440]">
                        {index === 0 ? "Foto principal" : `Foto ${index + 1}`}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Descrição e contato"
              subtitle="A descrição deve ser clara, comercial e confiável. O contato precisa estar pronto para conversão."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <InputField
                  label="WhatsApp"
                  value={form.whatsapp}
                  onChange={(value) => updateField("whatsapp", value)}
                  placeholder="(11) 99999-9999"
                />
                <InputField
                  label="Telefone"
                  value={form.phone}
                  onChange={(value) => updateField("phone", value)}
                  placeholder="(11) 3333-3333"
                />
              </div>

              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-semibold text-[#1D2440]">Descrição do anúncio</span>
                <textarea
                  value={form.description}
                  onChange={(event) => updateField("description", event.target.value)}
                  rows={7}
                  placeholder="Descreva estado geral, revisões, diferenciais, conservação, procedência e pontos fortes do veículo."
                  className="w-full rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] px-4 py-3 text-sm leading-7 text-[#1D2440] outline-none transition placeholder:text-[#98A2B3] focus:border-[#AFC6FF] focus:bg-white"
                />
              </label>

              <label className="mt-4 flex items-start gap-3 rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] p-4">
                <input
                  type="checkbox"
                  checked={form.acceptTerms}
                  onChange={(event) => updateField("acceptTerms", event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[#C5D1E8]"
                />
                <span className="text-sm leading-7 text-[#5C647C]">
                  Confirmo que as informações do anúncio são verdadeiras e autorizo a publicação dentro das regras do portal.
                </span>
              </label>
            </SectionCard>

            <SectionCard
              title="Ações do anúncio"
              subtitle="Esta etapa já permite salvar rascunho local e seguir para revisão visual antes da integração final do POST."
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="inline-flex items-center justify-center rounded-[20px] border border-[#E5E9F2] bg-white px-6 py-4 text-base font-bold text-[#1D2440] transition hover:border-[#D3DCEC] hover:bg-[#F9FBFF]"
                >
                  Salvar rascunho
                </button>

                <button
                  type="button"
                  onClick={handleReview}
                  className="inline-flex items-center justify-center rounded-[20px] bg-[#2F67F6] px-6 py-4 text-base font-bold text-white shadow-[0_12px_30px_rgba(47,103,246,0.24)] transition hover:bg-[#1F66E5]"
                >
                  Revisar anúncio
                </button>
              </div>

              <div className="mt-4 text-sm text-[#6E748A]">
                {saveState === "saved" && "Rascunho salvo no navegador com sucesso."}
                {saveState === "loaded" && "Rascunho anterior carregado automaticamente."}
                {saveState === "idle" && "Nenhuma ação recente de rascunho."}
              </div>
            </SectionCard>

            {showReview ? (
              <SectionCard
                title="Revisão do anúncio"
                subtitle="Prévia textual do anúncio pronta para a próxima etapa de integração com publicação real."
              >
                <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="overflow-hidden rounded-[24px] border border-[#E5E9F2] bg-white">
                    <div className="aspect-[4/3] bg-[#EDF2FB]">
                      {photoPreviews[0] ? (
                        <img
                          src={photoPreviews[0]}
                          alt="Prévia do anúncio"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm font-semibold text-[#6E748A]">
                          Sem foto principal
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                        {form.sellerType === "lojista" ? "Lojista" : "Particular"}
                      </span>
                      {belowFipe && fipeNumber > 0 ? (
                        <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700">
                          Abaixo da FIPE
                        </span>
                      ) : null}
                    </div>

                    <h3 className="text-[34px] font-extrabold leading-[1.06] tracking-[-0.04em] text-[#1D2440]">
                      {finalTitle}
                    </h3>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] p-4">
                        <div className="text-sm text-[#6E748A]">Preço</div>
                        <div className="mt-1 text-[22px] font-extrabold text-[#1F66E5]">
                          {priceNumber > 0 ? formatCurrencyInput(form.price) : "R$ 0,00"}
                        </div>
                      </div>
                      <div className="rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] p-4">
                        <div className="text-sm text-[#6E748A]">Cidade</div>
                        <div className="mt-1 text-[18px] font-bold text-[#1D2440]">
                          {form.city || "—"} - {form.state || "—"}
                        </div>
                      </div>
                      <div className="rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] p-4">
                        <div className="text-sm text-[#6E748A]">Quilometragem</div>
                        <div className="mt-1 text-[18px] font-bold text-[#1D2440]">
                          {form.mileage ? `${formatNumber(Number(form.mileage))} km` : "—"}
                        </div>
                      </div>
                      <div className="rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] p-4">
                        <div className="text-sm text-[#6E748A]">Câmbio</div>
                        <div className="mt-1 text-[18px] font-bold text-[#1D2440]">
                          {form.transmission || "—"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 rounded-[22px] border border-[#E5E9F2] bg-[#FBFCFF] p-5">
                      <div className="text-sm font-semibold text-[#1D2440]">Descrição</div>
                      <p className="mt-3 text-sm leading-7 text-[#5C647C]">
                        {form.description || "Sem descrição preenchida."}
                      </p>
                    </div>
                  </div>
                </div>
              </SectionCard>
            ) : null}
          </div>

          <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <section className="rounded-[28px] border border-[#E5E9F2] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              <div className="text-sm font-bold uppercase tracking-[0.14em] text-[#2F67F6]">
                Resumo lateral
              </div>

              <div className="mt-4 rounded-[22px] border border-[#E5E9F2] bg-[#FBFCFF] p-4">
                <div className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1D2440]">
                  {finalTitle}
                </div>
                <p className="mt-2 text-sm leading-7 text-[#5C647C]">{profileDescription}</p>
              </div>

              <div className="mt-4 grid gap-3">
                <div className="rounded-[20px] border border-[#E5E9F2] bg-[#FBFCFF] p-4">
                  <div className="text-sm text-[#6E748A]">Progresso</div>
                  <div className="mt-1 text-[26px] font-extrabold text-[#1D2440]">
                    {completion.percent}%
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E9EEF8]">
                    <div
                      className="h-full rounded-full bg-[#2F67F6]"
                      style={{ width: `${completion.percent}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-[#6E748A]">
                    {completion.filled} de {completion.total} pontos preenchidos
                  </div>
                </div>

                <div className="rounded-[20px] border border-[#E5E9F2] bg-[#FBFCFF] p-4">
                  <div className="text-sm text-[#6E748A]">Preço</div>
                  <div className="mt-1 text-[24px] font-extrabold text-[#1F66E5]">
                    {priceNumber > 0 ? formatCurrencyInput(form.price) : "R$ 0,00"}
                  </div>
                  {fipeNumber > 0 ? (
                    <div
                      className={`mt-2 text-sm font-semibold ${
                        belowFipe ? "text-green-600" : "text-orange-600"
                      }`}
                    >
                      {belowFipe ? "Abaixo" : "Acima"} da FIPE • {percentageLabel(fipePercent)}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-[#6E748A]">FIPE ainda não informada</div>
                  )}
                </div>

                <div className="rounded-[20px] border border-[#E5E9F2] bg-[#FBFCFF] p-4">
                  <div className="text-sm text-[#6E748A]">Checklist rápido</div>
                  <div className="mt-3 space-y-3 text-sm">
                    {[
                      { ok: Boolean(form.brand && form.model && form.version), label: "Identificação do veículo" },
                      { ok: Boolean(form.price), label: "Preço preenchido" },
                      { ok: Boolean(form.description), label: "Descrição adicionada" },
                      { ok: Boolean(form.whatsapp || form.phone), label: "Contato informado" },
                      { ok: photoPreviews.length > 0, label: "Fotos adicionadas" },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                            item.ok
                              ? "bg-[#EAF8EF] text-[#15803D]"
                              : "bg-[#EFF3F9] text-[#6E748A]"
                          }`}
                        >
                          {item.ok ? "✓" : "•"}
                        </span>
                        <span className="text-[#4B536A]">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="inline-flex items-center justify-center rounded-[18px] border border-[#E5E9F2] bg-white px-5 py-3 text-sm font-bold text-[#1D2440] transition hover:bg-[#F9FBFF]"
                >
                  Salvar rascunho
                </button>

                <button
                  type="button"
                  onClick={handleReview}
                  className="inline-flex items-center justify-center rounded-[18px] bg-[#2F67F6] px-5 py-3 text-sm font-bold text-white shadow-[0_12px_26px_rgba(47,103,246,0.24)] transition hover:bg-[#1F66E5]"
                >
                  Revisar anúncio
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
