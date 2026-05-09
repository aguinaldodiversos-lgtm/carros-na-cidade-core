"use client";

import { useEffect, useState } from "react";
import { adminApi, type RegionalSettings } from "@/lib/admin/api";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";

/**
 * Painel admin: editar `platform_settings.regional.radius_km`.
 *
 * Estado simples — não usa useAdminFetch porque precisa controlar
 * loading/saving/feedback após PATCH (toasts não estão padronizados no
 * painel; fica inline).
 */

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; updated_at?: string }
  | { kind: "error"; message: string };

export default function AdminRegionalSettingsPage() {
  const [settings, setSettings] = useState<RegionalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [radiusInput, setRadiusInput] = useState<string>("");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminApi.regional.getSettings();
      setSettings(res.data);
      setRadiusInput(String(res.data.radius_km));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;

    const parsed = Number(radiusInput);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      setSaveState({
        kind: "error",
        message: "Informe um número inteiro",
      });
      return;
    }
    if (parsed < settings.radius_min_km || parsed > settings.radius_max_km) {
      setSaveState({
        kind: "error",
        message: `Valor deve estar entre ${settings.radius_min_km} e ${settings.radius_max_km} km`,
      });
      return;
    }

    setSaveState({ kind: "saving" });
    try {
      const res = await adminApi.regional.updateSettings(parsed);
      setSettings(res.data);
      setRadiusInput(String(res.data.radius_km));
      setSaveState({ kind: "saved", updated_at: res.data.updated_at });
    } catch (err) {
      setSaveState({
        kind: "error",
        message: err instanceof Error ? err.message : "Erro ao salvar",
      });
    }
  }

  if (loading) return <AdminLoadingState message="Carregando configurações…" />;
  if (loadError)
    return <AdminErrorState message={loadError} onRetry={() => void load()} />;
  if (!settings) return null;

  const isDirty = String(settings.radius_km) !== radiusInput.trim();

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold text-cnc-text">Configurações regionais</h1>

      <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
        <h2 className="text-sm font-bold text-cnc-text mb-1">Raio regional</h2>
        <p className="text-xs text-cnc-muted-soft mb-4 leading-relaxed">
          Define a distância usada para montar as páginas regionais a partir da cidade base.
          A cidade base sempre é incluída e tem prioridade no ranking de anúncios.
        </p>

        <form onSubmit={handleSave} className="space-y-4 max-w-md">
          <div>
            <label
              htmlFor="radius_km"
              className="block text-xs font-semibold text-cnc-text mb-1"
            >
              Raio em km
            </label>
            <div className="flex items-center gap-2">
              <input
                id="radius_km"
                type="number"
                inputMode="numeric"
                min={settings.radius_min_km}
                max={settings.radius_max_km}
                step={1}
                value={radiusInput}
                onChange={(e) => {
                  setRadiusInput(e.target.value);
                  if (saveState.kind === "error" || saveState.kind === "saved") {
                    setSaveState({ kind: "idle" });
                  }
                }}
                className="w-32 rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
                disabled={saveState.kind === "saving"}
              />
              <span className="text-xs text-cnc-muted">km</span>
            </div>
            <p className="mt-1.5 text-[11px] text-cnc-muted-soft">
              Entre {settings.radius_min_km} e {settings.radius_max_km} km.
              Valor padrão: {settings.radius_default_km} km.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!isDirty || saveState.kind === "saving"}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveState.kind === "saving" ? "Salvando…" : "Salvar"}
            </button>

            {saveState.kind === "saved" && (
              <span
                className="text-xs font-semibold text-emerald-700"
                role="status"
                aria-live="polite"
              >
                Salvo com sucesso.
              </span>
            )}
            {saveState.kind === "error" && (
              <span
                className="text-xs font-semibold text-cnc-danger"
                role="alert"
                aria-live="assertive"
              >
                {saveState.message}
              </span>
            )}
          </div>
        </form>

        <div className="mt-6 rounded-lg border border-cnc-line/60 bg-cnc-bg/40 p-4">
          <h3 className="text-xs font-bold text-cnc-text mb-1.5">Como funciona</h3>
          <ul className="space-y-1 text-[11px] text-cnc-muted leading-relaxed">
            <li>• A página regional inclui a cidade base e cidades próximas dentro deste raio.</li>
            <li>• Apenas cidades da mesma UF da cidade base são consideradas.</li>
            <li>• A cidade base sempre aparece primeiro no ranking de anúncios.</li>
            <li>• Cache pode levar até 5 minutos para refletir a mudança em produção.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
