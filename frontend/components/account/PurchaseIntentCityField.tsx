"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BR_UF_VALUES } from "@/lib/painel/br-states";

/**
 * Escolha explícita de cidade para a procura.
 *
 * Copia a disciplina do passo de localização do wizard de anúncio: UF primeiro,
 * busca com no mínimo 2 letras, e o valor só é aceito quando vem da LISTA — com
 * `id` real do catálogo. Texto livre não vira cidade.
 *
 * Usa `/api/painel/cidades/search`, e NÃO `/api/cities/search`. A diferença é
 * decisiva aqui: a busca pública é filtrada para cidades que já têm anúncio
 * ativo, e o comprador que este produto existe para atender é justamente o de
 * uma cidade sem estoque. Com a busca pública, ele não encontraria a própria
 * cidade.
 *
 * Não existe pré-seleção a partir do contexto territorial (cookie/CityContext).
 * `useCity().cityId` é nulo com frequência e o `state` dele cai para "SP"
 * quando a origem vem vazia — uma sugestão silenciosa a partir daí publicaria a
 * procura na cidade errada, que é o pior defeito possível neste produto.
 */

export type SelectedCity = { id: number; name: string; state: string };

type CityRow = { id: number; name: string; state: string };

const FIELD_CLASS =
  "h-12 w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]";
const LABEL_CLASS = "mb-2 block text-sm font-semibold text-[#33405A]";

function normalizeRows(raw: unknown): CityRow[] {
  if (!Array.isArray(raw)) return [];
  const out: CityRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id =
      typeof row.id === "number"
        ? Math.trunc(row.id)
        : typeof row.id === "string"
          ? Number.parseInt(row.id.trim(), 10)
          : NaN;
    // Linha sem id positivo é descartada: sem id não há o que persistir.
    if (!Number.isFinite(id) || id <= 0) continue;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;
    out.push({
      id,
      name,
      state: typeof row.state === "string" ? row.state.trim().toUpperCase().slice(0, 2) : "",
    });
  }
  return out;
}

/**
 * `helpText` é o ÚNICO ponto configurável, adicionado na Fase 4.1 para que
 * "Venda seu carro para lojas" reuse este campo sem duplicá-lo.
 *
 * O default preserva exatamente o texto do Produto 1 — nenhuma chamada
 * existente muda de comportamento, e a suíte de Compradores Ativos continua
 * válida sem alteração. Extrair um componente genérico e reescrever as duas
 * pontas seria a refatoração "certa", mas `purchase_intents` é domínio protegido
 * nesta fase, e trocar a UI de um produto em produção para entregar outro é
 * risco sem contrapartida.
 */
export default function PurchaseIntentCityField({
  value,
  onChange,
  error,
  helpText = "A cidade define quais lojas encontram a sua procura.",
}: {
  value: SelectedCity | null;
  onChange: (city: SelectedCity | null) => void;
  error?: string | null;
  helpText?: string;
}) {
  const [uf, setUf] = useState("");
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<CityRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const search = useCallback(async (query: string, stateUf: string) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setSearchError(null);
    try {
      const params = new URLSearchParams({ q: query, uf: stateUf });
      const res = await fetch(`/api/painel/cidades/search?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      const json = (await res.json().catch(() => null)) as {
        data?: unknown;
        message?: string;
      } | null;

      if (!res.ok) {
        setRows([]);
        // O 429 precisa aparecer: engolido, ele vira "nenhuma cidade
        // encontrada" e o usuário conclui que a cidade dele não existe.
        setSearchError(
          res.status === 429
            ? "Muitas buscas em sequência. Aguarde alguns segundos."
            : json?.message || "Não foi possível buscar cidades."
        );
        return;
      }
      setRows(normalizeRows(json?.data));
    } catch {
      if (controller.signal.aborted) return;
      setRows([]);
      setSearchError("Falha de rede ao buscar cidades.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (value) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    const query = term.trim();
    if (uf.length !== 2 || query.length < 2) {
      setRows([]);
      setSearchError(null);
      return;
    }

    debounceRef.current = window.setTimeout(() => void search(query, uf), 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [term, uf, value, search]);

  useEffect(() => {
    function handle(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function pick(row: CityRow) {
    onChange({ id: row.id, name: row.name, state: row.state || uf });
    setTerm("");
    setRows([]);
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setTerm("");
    setRows([]);
    setSearchError(null);
  }

  if (value) {
    return (
      <div data-testid="purchase-intent-city-field">
        <span className={LABEL_CLASS}>Cidade</span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div
            className={`${FIELD_CLASS} flex items-center font-medium`}
            data-testid="purchase-intent-city-selected"
          >
            {value.name}
            {value.state ? ` - ${value.state}` : ""}
          </div>
          <button
            type="button"
            onClick={clear}
            className="h-12 shrink-0 rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-sm font-bold text-[#0e62d8] transition hover:bg-[#F9FBFF]"
          >
            Trocar cidade
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="purchase-intent-city-field">
      {/* Uma coluna no mobile; UF e cidade lado a lado só a partir de sm. */}
      <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
        <label className="block">
          <span className={LABEL_CLASS}>Estado</span>
          <select
            className={FIELD_CLASS}
            value={uf}
            onChange={(event) => {
              setUf(event.target.value);
              setTerm("");
              setRows([]);
              setSearchError(null);
            }}
            aria-label="Estado (UF)"
          >
            <option value="">UF</option>
            {BR_UF_VALUES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <div className="relative block" ref={wrapRef}>
          <span className={LABEL_CLASS}>Cidade</span>
          <input
            className={FIELD_CLASS}
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setSearchError(null);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            disabled={uf.length !== 2}
            placeholder={uf.length === 2 ? "Digite e escolha na lista" : "Escolha a UF primeiro"}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-label="Cidade"
            data-testid="purchase-intent-city-input"
          />

          {loading ? <p className="mt-1 text-xs text-[#64748b]">Buscando cidades…</p> : null}
          {searchError ? (
            <p className="mt-1 text-xs text-[#b42318]" role="alert">
              {searchError}
            </p>
          ) : null}

          {open && rows.length > 0 ? (
            <ul
              className="absolute z-40 mt-1 max-h-52 w-full overflow-auto rounded-[14px] border border-[#E5E9F2] bg-white py-1 shadow-lg"
              role="listbox"
            >
              {rows.map((row) => (
                <li key={row.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-sm text-[#1D2440] transition hover:bg-[#EEF4FF]"
                    onClick={() => pick(row)}
                  >
                    {row.name}
                    {row.state ? ` - ${row.state}` : ""}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {open &&
          !loading &&
          !searchError &&
          uf.length === 2 &&
          term.trim().length >= 2 &&
          rows.length === 0 ? (
            <p className="mt-1 text-xs text-[#b45309]">
              Nenhuma cidade encontrada para esse trecho.
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mt-2 text-xs text-[#b42318]" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-[#64748b]">{helpText}</p>
      )}
    </div>
  );
}
