// frontend/lib/home/cta-url.ts
//
// Validação de LEITURA do `cta_url` dos banners do hero.
//
// ── Por que existe, se a escrita já valida ───────────────────────────────────
// `src/modules/admin/home/admin-home.service.js#validateCtaUrl` já rejeita
// espaço, control-chars, `javascript:`, `data:`, `//host` e caminho interno
// malformado — e o comentário de lá cita "/abaixo da fipe" pelo nome, porque
// foi esse valor que motivou a regra.
//
// A validação de escrita, porém, chegou DEPOIS do dado. Medido em produção em
// 2026-08-31:
//
//     GET /api/public/home/hero
//       "key":"home_hero_3", "cta_url":"/abaixo da fipe"
//     HTML da Home:
//       <a aria-label="Oportunidade" … href="/abaixo da fipe">   → 404
//
// O banner principal do carrossel — o link mais visível do portal — levava a um
// 404, e nada no caminho de leitura questionava o valor. Validar só na escrita
// deixa o site refém do estado do banco: qualquer linha gravada antes da regra,
// por outro caminho, ou por um backend em versão anterior, chega intacta ao
// HTML.
//
// Este módulo é o espelho de leitura da MESMA política. Não é uma segunda
// regra: é a mesma regra aplicada na outra ponta.
//
// ── Não é sanitização ────────────────────────────────────────────────────────
// Um valor inválido é DESCARTADO, não "consertado". Tentar reparar
// "/abaixo da fipe" adivinharia a intenção do admin e produziria um link que
// ninguém revisou. Descartado, o componente cai no destino canônico que ele já
// sabe calcular.

/** Protocolos aceitos em URL absoluta. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Espaço (U+0020), control-chars (U+0000–U+001F), DEL (U+007F) e barra
 * invertida (U+005C) literais. Espelha `hasUnsafeUrlChars` do backend: URL
 * legítima escreve espaço como `%20`.
 */
function hasUnsafeUrlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}

/**
 * A URL é utilizável como destino de CTA?
 *
 * Aceita: caminho interno começando com `/` (e não `//`) que resolva dentro da
 * própria origem, ou URL absoluta http/https.
 *
 * Rejeita: vazio, só espaços, `"/abaixo da fipe"`, `"abaixo da fipe"`,
 * `javascript:`, `data:`, `file:`, protocol-relative `//host`, e caminho que
 * escape da origem (`/..//host`).
 */
export function isValidCtaUrl(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (hasUnsafeUrlChars(trimmed)) return false;

  if (trimmed.startsWith("/")) {
    // `//host` é protocol-relative: sai da origem sem declarar protocolo.
    if (trimmed.startsWith("//")) return false;
    try {
      const SENTINEL = "https://internal.invalid";
      const url = new URL(trimmed, SENTINEL);
      if (url.origin !== SENTINEL) return false;
      const normalized = `${url.pathname}${url.search}${url.hash}`;
      return normalized.startsWith("/") && !normalized.startsWith("//");
    } catch {
      return false;
    }
  }

  try {
    return ALLOWED_PROTOCOLS.has(new URL(trimmed).protocol);
  } catch {
    return false;
  }
}

/**
 * O `cta_url` se for utilizável; `null` caso contrário.
 *
 * `null` sinaliza ao componente "não há override" — e ele então usa o destino
 * canônico que já calcula sozinho, em vez de renderizar um link quebrado.
 */
export function sanitizeCtaUrl(raw: unknown): string | null {
  if (!isValidCtaUrl(raw)) return null;
  return (raw as string).trim();
}
