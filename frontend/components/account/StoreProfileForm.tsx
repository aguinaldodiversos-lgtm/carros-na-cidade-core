"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";

import type { StoreProfile } from "@/lib/account/backend-account";
import PurchaseIntentCityField, {
  type SelectedCity,
} from "@/components/account/PurchaseIntentCityField";

/**
 * Formulário "Dados da loja" (lojista). Edita advertisers.{name,email,whatsapp,
 * address}; documento (CPF/CNPJ, de users) é read-only. O WhatsApp é o campo
 * mais importante — é por ele que o comprador fala com a loja pelo anúncio;
 * quando vazio, mostramos um aviso forte de que os anúncios ficam sem contato.
 *
 * Salva via BFF PUT /api/account/store (escopado ao usuário do JWT no backend).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Espelha a validação do backend (store-profile.service.js). */
function normalizeBrPhoneOrNull(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (digits.length === 11 && digits[2] !== "9") return null;
  return digits;
}

function formatDocument(type: "CPF" | "CNPJ" | null, number: string): string {
  const d = number.replace(/\D/g, "");
  if ((type === "CNPJ" || d.length === 14) && d.length === 14) {
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if ((type === "CPF" || d.length === 11) && d.length === 11) {
    return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return number;
}

const INPUT_CLASS =
  "h-[52px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]";
const LABEL_CLASS = "mb-2 block text-sm font-semibold text-[#33405A]";

export default function StoreProfileForm({ initial }: { initial: StoreProfile | null }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [coverUrl, setCoverUrl] = useState(initial?.cover_url ?? "");
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url ?? "");
  const [uploading, setUploading] = useState<"cover" | "logo" | null>(null);
  const [created, setCreated] = useState(Boolean(initial));
  const [verified, setVerified] = useState(Boolean(initial?.verified));
  const [city, setCity] = useState<SelectedCity | null>(initial?.city ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  );

  const nameOk = name.trim().length >= 2;
  const emailOk = email.trim() === "" || EMAIL_RE.test(email.trim());
  const whatsappTrimmed = whatsapp.trim();
  const whatsappOk = whatsappTrimmed === "" || normalizeBrPhoneOrNull(whatsappTrimmed) !== null;
  const whatsappEmpty = whatsappTrimmed === "";
  const canSubmit =
    nameOk &&
    emailOk &&
    whatsappOk &&
    !submitting &&
    !uploading &&
    (created ||
      (city !== null &&
        whatsappTrimmed !== "" &&
        email.trim() !== "" &&
        address.trim().length >= 10));

  const documentDisplay = initial?.document.number
    ? formatDocument(initial?.document.type ?? null, initial?.document.number ?? "")
    : "";
  const documentLabel = "CNPJ da conta";

  async function uploadStoreImage(kind: "cover" | "logo", file?: File) {
    if (!file) return;
    if (
      file.size > 6 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    ) {
      setFeedback({ tone: "error", text: "Selecione uma imagem JPG, PNG ou WebP de até 6 MB." });
      return;
    }
    setUploading(kind);
    setFeedback(null);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("photo", file);
      const response = await fetch("/api/account/store/media", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const json = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !json.url) throw new Error(json.error || "Falha ao enviar imagem.");
      if (kind === "cover") setCoverUrl(json.url);
      else setLogoUrl(json.url);
      setFeedback({
        tone: "success",
        text: "Imagem enviada. Clique em Salvar dados da loja para publicar.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Falha ao enviar imagem.",
      });
    } finally {
      setUploading(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/account/store", {
        method: created ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          whatsapp: whatsappTrimmed,
          address: address.trim(),
          description: description.trim(),
          cover_url: coverUrl,
          logo_url: logoUrl,
          ...(!created ? { city_id: city?.id } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        store?: StoreProfile;
      };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Não foi possível salvar os dados. Tente novamente."
        );
      }
      if (data.store) {
        setCreated(true);
        setVerified(Boolean(data.store.verified));
        if (data.store.city) setCity(data.store.city);
        setName(data.store.name);
        setEmail(data.store.email);
        setWhatsapp(data.store.whatsapp);
        setAddress(data.store.address);
        setDescription(data.store.description ?? "");
        setCoverUrl(data.store.cover_url ?? "");
        setLogoUrl(data.store.logo_url ?? "");
      }
      setFeedback({
        tone: "success",
        text: created
          ? "Dados da loja salvos com sucesso."
          : "Cadastro da loja concluído. A verificação será feita pela equipe do portal.",
      });
    } catch (err) {
      setFeedback({
        tone: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar. Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-[28px] border border-[#E5E9F2] bg-white p-6 shadow-[0_16px_36px_rgba(16,28,58,0.06)] md:p-8"
      >
        <div
          role="status"
          className="rounded-[16px] border border-[#BFDAFB] bg-[#F0F6FF] px-4 py-3 text-sm text-[#21456F]"
        >
          {verified
            ? "Loja verificada pela equipe do portal."
            : created
              ? "Loja cadastrada. A verificação do CNPJ e do endereço físico está pendente."
              : "Cadastre sua loja agora, mesmo sem publicar anúncios. O cadastro não exige a contratação de planos nem a criação de anúncios. A equipe fará a verificação do CNPJ e do endereço."}
        </div>

        {!created ? (
          <PurchaseIntentCityField
            value={city}
            onChange={setCity}
            helpText="Selecione a cidade do endereço físico da loja. A escolha é obrigatória e não cria anúncios."
          />
        ) : city ? (
          <p className="text-sm text-[#475569]">
            Cidade da loja:{" "}
            <strong>
              {city.name} - {city.state}
            </strong>
          </p>
        ) : null}

        {/* Aviso forte quando não há WhatsApp — o comprador fica sem canal de contato. */}
        {whatsappEmpty ? (
          <div className="rounded-[16px] border border-[#F5C878] bg-[#FFF8EC] px-4 py-3 text-[14px] font-medium text-[#8A5A00]">
            Seus anúncios estão <strong>sem WhatsApp cadastrado</strong>. É o principal canal de
            contato — sem ele, nenhum comprador consegue falar com você. Cadastre um número abaixo.
          </div>
        ) : null}

        {/* WhatsApp — campo mais importante, em destaque. */}
        <div className="rounded-[18px] border border-[#1F66E5]/30 bg-[#F5F9FF] p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#1F66E5] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
              Principal
            </span>
            <span className="text-sm font-semibold text-[#33405A]">WhatsApp de contato</span>
          </div>
          <input
            type="tel"
            inputMode="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="DDD + número (ex.: 11 91234-5678)"
            autoComplete="tel"
            aria-label="WhatsApp de contato"
            className={INPUT_CLASS}
          />
          <p className="mt-2 text-[13px] text-[#475569]">
            É por este número que o comprador entra em contato pelo anúncio.
          </p>
          {!whatsappOk ? (
            <p className="mt-1 text-[13px] font-semibold text-[#C2410C]">
              Número inválido. Use DDD + número (ex.: 11 91234-5678).
            </p>
          ) : null}
        </div>

        <label className="block">
          <span className={LABEL_CLASS}>Nome da loja</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome que aparece nos seus anúncios"
            className={INPUT_CLASS}
          />
          {!nameOk ? (
            <p className="mt-2 text-[13px] font-semibold text-[#C2410C]">
              Informe o nome da loja (mínimo 2 caracteres).
            </p>
          ) : (
            <p className="mt-2 text-[13px] text-[#64748b]">O comprador vê este nome no anúncio.</p>
          )}
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>E-mail de contato</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contato@sualoja.com.br"
            autoComplete="email"
            className={INPUT_CLASS}
          />
          {!emailOk ? (
            <p className="mt-2 text-[13px] font-semibold text-[#C2410C]">E-mail inválido.</p>
          ) : null}
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Endereço</span>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Rua, número, bairro, cidade"
            autoComplete="street-address"
            className={INPUT_CLASS}
          />
        </label>

        <div className="space-y-4 rounded-[18px] border border-[#BFDAFB] bg-[#F5F9FF] p-4">
          <div>
            <h2 className="text-base font-extrabold text-[#17274E]">Perfil público da loja</h2>
            <p className="mt-1 text-sm text-[#475569]">
              Esses dados aparecem para os compradores. Não alteram seu painel interno.
            </p>
          </div>
          <label className="block">
            <span className={LABEL_CLASS}>Sobre a loja (até 600 caracteres)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={600}
              rows={4}
              placeholder="Apresente sua loja, experiência e atendimento, sem promessas que não possa comprovar."
              className="w-full rounded-[14px] border border-[#E5E9F2] bg-white p-4 text-base text-[#1D2440] outline-none focus:border-[#1F66E5]"
            />
            <span className="text-xs text-[#64748b]">{description.length}/600</span>
          </label>
          {created ? (
            <>
              <label className="block">
                <span className={LABEL_CLASS}>Foto da fachada (capa)</span>
                {coverUrl ? (
                  <Image
                    src={coverUrl}
                    alt="Prévia da fachada da loja"
                    width={640}
                    height={260}
                    unoptimized
                    className="mb-2 aspect-[16/7] w-full rounded-xl object-cover"
                  />
                ) : null}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading !== null}
                  onChange={(e) => void uploadStoreImage("cover", e.target.files?.[0])}
                  className="block w-full rounded-lg border border-[#E5E9F2] bg-white p-3 text-sm"
                />
                {coverUrl ? (
                  <button
                    type="button"
                    className="mt-2 text-xs font-bold text-red-700"
                    onClick={() => setCoverUrl("")}
                  >
                    Remover capa
                  </button>
                ) : null}
              </label>
              <label className="block">
                <span className={LABEL_CLASS}>Logotipo da loja</span>
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    alt="Prévia do logotipo da loja"
                    width={100}
                    height={100}
                    unoptimized
                    className="mb-2 h-20 w-20 rounded-xl object-contain"
                  />
                ) : null}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading !== null}
                  onChange={(e) => void uploadStoreImage("logo", e.target.files?.[0])}
                  className="block w-full rounded-lg border border-[#E5E9F2] bg-white p-3 text-sm"
                />
                {logoUrl ? (
                  <button
                    type="button"
                    className="mt-2 text-xs font-bold text-red-700"
                    onClick={() => setLogoUrl("")}
                  >
                    Remover logotipo
                  </button>
                ) : null}
              </label>
              {uploading ? (
                <p role="status" className="text-sm font-semibold text-primary">
                  Enviando imagem...
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-[#475569]">
              Salve primeiro o cadastro da loja para liberar o envio de fotos.
            </p>
          )}
        </div>

        {/* Documento — READ-ONLY (identidade fiscal; correção só via suporte). */}
        <label className="block">
          <span className={LABEL_CLASS}>{documentLabel}</span>
          <input
            type="text"
            value={documentDisplay || "CNPJ vinculado à conta (somente leitura)"}
            readOnly
            disabled
            aria-label="CPF ou CNPJ (somente leitura)"
            className="h-[52px] w-full cursor-not-allowed rounded-[14px] border border-[#E5E9F2] bg-[#F3F6FB] px-4 text-[16px] text-[#64748b] outline-none"
          />
          <p className="mt-2 text-[13px] text-[#64748b]">
            Documento não editável. Para corrigir, fale com o suporte.
          </p>
        </label>

        {feedback ? (
          <div
            className={
              feedback.tone === "success"
                ? "rounded-[16px] border border-[#A7E3C0] bg-[#F0FBF4] px-4 py-3 text-[14px] font-medium text-[#15803D]"
                : "rounded-[16px] border border-[#F4C7C3] bg-[#FFF4F3] px-4 py-3 text-[14px] font-medium text-[#B42318]"
            }
          >
            {feedback.text}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-[52px] w-full items-center justify-center rounded-[16px] bg-[#1F66E5] px-6 text-[16px] font-extrabold text-white transition hover:bg-[#1758CC] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Salvando..." : "Salvar dados da loja"}
        </button>
      </form>
    </>
  );
}
