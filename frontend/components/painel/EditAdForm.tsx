"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { OwnedAdEditable } from "@/lib/account/backend-account";
import {
  BODY_TYPE_CHOICES,
  CAMBIO_OPTION_KEYS,
  extractSelectedKeys,
  syncCambioOptionKeys,
  TRANSMISSION_CHOICES,
  transmissionLabelFromKeys,
} from "@/lib/ads/vehicle-options";
import VehicleOptionsSelector from "./VehicleOptionsSelector";
import {
  formatCurrencyInput,
  formatKm,
  parseCurrency,
  parseKmDigits,
} from "./new-ad-wizard/currency";

/**
 * Status em que o dono pode editar — espelha
 * `src/modules/ads/ad-ownership.AD_STATUS_OWNER_EDITABLE`. Mantido aqui só
 * para desabilitar o formulário e dar feedback antecipado; o backend é a
 * autoridade final (PUT /api/ads/:id valida de novo).
 */
const OWNER_EDITABLE_STATUSES = new Set([
  "draft",
  "pending_review",
  "active",
  "paused",
  "rejected",
]);

// Slugs persistidos → rótulos dos <select> (Fase B: câmbio/carroceria editáveis).
const SLUG_TO_TRANSMISSION: Record<string, string> = {
  manual: "Manual",
  automatico: "Automático",
  cvt: "CVT",
};
const SLUG_TO_BODY_TYPE: Record<string, string> = {
  hatch: "Hatch",
  sedan: "Sedã",
  suv: "SUV",
  picape: "Picape",
  coupe: "Coupé",
  minivan: "Minivan",
  wagon: "Perua",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  pending_review: "Em análise",
  active: "Ativo",
  paused: "Pausado",
  rejected: "Rejeitado",
  sold: "Vendido",
  expired: "Expirado",
  archived: "Arquivado",
  blocked: "Bloqueado",
};

type EditAdFormProps = {
  adId: string;
  status: string;
  imageUrl: string;
  editable: OwnedAdEditable | null;
  dashboardHref: string;
};

export default function EditAdForm({
  adId,
  status,
  imageUrl,
  editable,
  dashboardHref,
}: EditAdFormProps) {
  const router = useRouter();

  const canEdit = OWNER_EDITABLE_STATUSES.has(status);

  const [title, setTitle] = useState(editable?.title ?? "");
  const [description, setDescription] = useState(editable?.description ?? "");
  const [price, setPrice] = useState(
    editable?.price ? formatCurrencyInput(String(Math.round(editable.price * 100))) : ""
  );
  const [mileage, setMileage] = useState(
    editable?.mileage != null ? formatKm(String(editable.mileage)) : ""
  );
  const [optionKeys, setOptionKeys] = useState<string[]>(() =>
    extractSelectedKeys(editable?.vehicle_options)
  );
  // Câmbio: preferir a chave de opcional (fonte única da Fase A); senão o slug
  // da coluna transmission. Carroceria: slug da coluna body_type.
  const [transmission, setTransmission] = useState<string>(() => {
    const fromKey = transmissionLabelFromKeys(extractSelectedKeys(editable?.vehicle_options));
    return fromKey || SLUG_TO_TRANSMISSION[(editable?.transmission ?? "").toLowerCase()] || "";
  });
  const [bodyStyle, setBodyStyle] = useState<string>(
    () => SLUG_TO_BODY_TYPE[(editable?.body_type ?? "").toLowerCase()] || ""
  );

  function onTransmissionChange(value: string) {
    setTransmission(value);
    setOptionKeys((keys) => syncCambioOptionKeys(keys, value));
  }

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const vehicleSummary = useMemo(() => {
    if (!editable) return "";
    const parts = [editable.brand, editable.model, editable.year ? String(editable.year) : ""]
      .filter(Boolean)
      .join(" ");
    const place = [editable.city, editable.state].filter(Boolean).join(" - ");
    return place ? `${parts} • ${place}` : parts;
  }, [editable]);

  const publicHref = status === "active" && editable?.slug ? `/veiculo/${editable.slug}` : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !canEdit) return;

    setError(null);
    setSuccess(false);

    const priceValue = parseCurrency(price);
    if (!priceValue || priceValue <= 0) {
      setError("Informe um preço válido.");
      return;
    }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      price: priceValue,
      // Câmbio/carroceria (Fase B): rótulos; backend normaliza p/ slug. Vazio →
      // null (não força "sedan"/"automatico"). `vehicle_options` já carrega a
      // chave de câmbio sincronizada.
      transmission: transmission || null,
      body_type: bodyStyle || null,
      // Lista achatada de keys; backend reagrupa e valida. Array vazio limpa.
      vehicle_options: optionKeys,
    };

    const mileageDigits = parseKmDigits(mileage);
    if (mileageDigits) {
      payload.mileage = Number(mileageDigits);
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/ads/${encodeURIComponent(adId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setError(
          body.error || body.message || "Não foi possível salvar as alterações. Tente novamente."
        );
        return;
      }

      setSuccess(true);
      // Revalida o dashboard (Server Component) ao voltar — preço/título novos
      // aparecem na lista sem hard refresh.
      router.refresh();
    } catch {
      setError("Falha de conexão ao salvar. Verifique sua internet e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-cnc-text-strong">
            Editar anúncio
          </h1>
          <p className="mt-1 text-sm text-cnc-muted">
            Status atual:{" "}
            <span className="font-semibold text-cnc-text">{STATUS_LABEL[status] ?? status}</span>
          </p>
        </div>
        <Link
          href={dashboardHref}
          className="shrink-0 rounded-xl border border-cnc-line px-4 py-2 text-sm font-bold text-cnc-text transition hover:bg-white"
        >
          ← Voltar
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-cnc-line bg-cnc-surface shadow-card">
        <div className="flex items-center gap-4 border-b border-cnc-line bg-white/60 p-4">
          <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-[#eef2f8]">
            <Image
              src={imageUrl}
              alt=""
              fill
              className="object-cover"
              sizes="96px"
              unoptimized={!imageUrl.startsWith("/")}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-cnc-text">
              {editable?.title || title || "Anúncio"}
            </p>
            {vehicleSummary ? (
              <p className="mt-0.5 truncate text-xs text-cnc-muted">{vehicleSummary}</p>
            ) : null}
          </div>
        </div>

        {!canEdit ? (
          <div className="p-6">
            <p className="rounded-xl border border-cnc-warning/40 bg-[#fff8ec] px-4 py-3 text-sm text-[#8a5a08]">
              Este anúncio está <strong>{STATUS_LABEL[status] ?? status}</strong> e não pode ser
              editado. Anúncios vendidos, expirados, arquivados ou bloqueados não aceitam edição.
              Para anunciar novamente, crie um novo anúncio.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={dashboardHref}
                className="rounded-xl border border-cnc-line px-4 py-2 text-sm font-bold text-cnc-text transition hover:bg-white"
              >
                Voltar ao painel
              </Link>
              <Link
                href="/anunciar/novo"
                className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-primary-strong"
              >
                + Criar novo anúncio
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 p-6" noValidate>
            {success ? (
              <div
                role="status"
                className="rounded-xl border border-cnc-success/40 bg-[#ecfdf5] px-4 py-3 text-sm font-semibold text-[#0a7a52]"
              >
                Alterações salvas com sucesso.
                {publicHref ? (
                  <>
                    {" "}
                    <Link href={publicHref} className="underline underline-offset-2">
                      Ver anúncio público
                    </Link>
                    .
                  </>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-cnc-danger/40 bg-[#fdecec] px-4 py-3 text-sm font-semibold text-cnc-danger"
              >
                {error}
              </div>
            ) : null}

            <div>
              <label htmlFor="ad-title" className="mb-1.5 block text-sm font-bold text-cnc-text">
                Título do anúncio
              </label>
              <input
                id="ad-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                minLength={3}
                maxLength={120}
                className="w-full rounded-xl border border-cnc-line bg-white px-3.5 py-2.5 text-sm text-cnc-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-soft"
                placeholder="Ex.: Honda Civic EXL 2019 impecável"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ad-price" className="mb-1.5 block text-sm font-bold text-cnc-text">
                  Preço
                </label>
                <input
                  id="ad-price"
                  inputMode="numeric"
                  value={price}
                  onChange={(e) => setPrice(formatCurrencyInput(e.target.value))}
                  className="w-full rounded-xl border border-cnc-line bg-white px-3.5 py-2.5 text-sm text-cnc-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-soft"
                  placeholder="R$ 0,00"
                />
              </div>

              <div>
                <label
                  htmlFor="ad-mileage"
                  className="mb-1.5 block text-sm font-bold text-cnc-text"
                >
                  Quilometragem (km)
                </label>
                <input
                  id="ad-mileage"
                  inputMode="numeric"
                  value={mileage}
                  onChange={(e) => setMileage(formatKm(e.target.value))}
                  className="w-full rounded-xl border border-cnc-line bg-white px-3.5 py-2.5 text-sm text-cnc-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-soft"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="ad-description"
                className="mb-1.5 block text-sm font-bold text-cnc-text"
              >
                Descrição
              </label>
              <textarea
                id="ad-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                maxLength={4000}
                className="w-full resize-y rounded-xl border border-cnc-line bg-white px-3.5 py-2.5 text-sm text-cnc-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-soft"
                placeholder="Detalhe estado de conservação, opcionais, revisões..."
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ad-cambio" className="mb-1.5 block text-sm font-bold text-cnc-text">
                  Câmbio
                </label>
                <select
                  id="ad-cambio"
                  value={transmission}
                  onChange={(e) => onTransmissionChange(e.target.value)}
                  className="w-full rounded-xl border border-cnc-line bg-white px-3.5 py-2.5 text-sm text-cnc-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-soft"
                >
                  <option value="">Não informado</option>
                  {TRANSMISSION_CHOICES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="ad-carroceria"
                  className="mb-1.5 block text-sm font-bold text-cnc-text"
                >
                  Carroceria
                </label>
                <select
                  id="ad-carroceria"
                  value={bodyStyle}
                  onChange={(e) => setBodyStyle(e.target.value)}
                  className="w-full rounded-xl border border-cnc-line bg-white px-3.5 py-2.5 text-sm text-cnc-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-soft"
                >
                  <option value="">Não informado</option>
                  {BODY_TYPE_CHOICES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-cnc-text">Opcionais do veículo</h3>
              <p className="mb-3 mt-1 text-xs text-cnc-muted">
                Marque os itens que o veículo possui. Aparecem agrupados por categoria no anúncio
                público. (O câmbio é definido no campo acima.)
              </p>
              <VehicleOptionsSelector
                selected={optionKeys}
                onChange={setOptionKeys}
                hiddenKeys={CAMBIO_OPTION_KEYS}
              />
            </div>

            <div className="rounded-xl border border-cnc-line bg-cnc-bg/60 px-4 py-3 text-xs text-cnc-muted">
              <p className="font-semibold text-cnc-text">Não editável após publicação</p>
              <p className="mt-1">
                Marca, modelo, ano e cidade ({vehicleSummary || "—"}) e as fotos são preservados.
                Para alterá-los, crie um novo anúncio.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white transition hover:bg-primary-strong disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar alterações"}
              </button>
              <Link
                href={dashboardHref}
                className="rounded-xl border border-cnc-line px-5 py-2.5 text-sm font-bold text-cnc-text transition hover:bg-white"
              >
                Cancelar
              </Link>
              {publicHref ? (
                <Link
                  href={publicHref}
                  className="ml-auto text-sm font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Ver anúncio público →
                </Link>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
