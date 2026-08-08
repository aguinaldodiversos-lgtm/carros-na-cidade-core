import "server-only";

import type { PublicSitemapEntry } from "./sitemap-client";
import { getRedisClient } from "@/lib/redis";

/**
 * Último sitemap bom conhecido, PERSISTENTE entre processos.
 *
 * ── O buraco que este módulo fecha ───────────────────────────────────────────
 * O `lastGoodByPath` em memória (em `sitemap-client.ts`) resolve o caso quente:
 * o processo já respondeu uma vez, o backend cai, servimos o último bom. Mas
 * ele nasce vazio a cada boot — e o cenário mais provável de dar errado é
 * exatamente **deploy/restart coincidindo com backend instável**. Medido em
 * 2026-08-07: processo novo + backend fora produzia
 *
 *     HTTP 200  +  <urlset></urlset>
 *
 * para cities, vehicles, brands, models, blog e regional. Para o Google, isso
 * não é "estou com problema" — é "estas URLs não existem mais".
 *
 * ── Três camadas, nesta ordem ────────────────────────────────────────────────
 *   1. resultado fresco do backend        → usa, e persiste
 *   2. `lastGoodByPath` (memória)         → sobrevive a blip, morre no restart
 *   3. snapshot no Redis (este módulo)    → sobrevive a restart e é compartilhado
 *   4. nada confiável                     → 503 (nunca 200 vazio)
 *
 * ── Redis é OPCIONAL ─────────────────────────────────────────────────────────
 * `getRedisClient()` devolve `null` sem `REDIS_URL`. Nesse caso o sistema
 * degrada para as camadas 1, 2 e 4 — nunca falha por causa do Redis. Servir
 * conteúdo FRESCO jamais pode depender do cache: toda operação aqui é
 * best-effort, com timeout curto e falha silenciosa (logada, nunca propagada).
 */

/** Namespace próprio — não colide com o `cacheGet` do backend (`public:*`). */
const KEY_PREFIX = "seo:sitemap:last-good:";

/**
 * Versão do formato. Mudou a forma do payload? Suba o número e os snapshots
 * antigos passam a ser ignorados em vez de interpretados errado.
 */
const SNAPSHOT_FORMAT = 1;

/**
 * IDADE MÁXIMA UTILIZÁVEL — não confundir com TTL de cache.
 *
 *   TTL de cache (`revalidate: 3600`)  = "quando devo perguntar de novo?"
 *   idade máxima do snapshot (6 h)     = "até quando um dado velho ainda é
 *                                         melhor que admitir que não sei?"
 *
 * Seis horas porque o risco de um sitemap velho é ANUNCIAR URL QUE MORREU —
 * exatamente o defeito que a Fase 2B.1 acabou de corrigir. Uma cidade que
 * perdeu o último anúncio começa a responder 404 em ~60 s; deixar o sitemap
 * dizendo o contrário por um dia inteiro seria trocar um problema por outro.
 *
 * Seis horas cobre com folga qualquer janela realista de deploy ou de
 * indisponibilidade de backend, que é o cenário para o qual o snapshot existe.
 *
 * Mais curto que as 24 h do snapshot dos gates, e de propósito: lá o erro é
 * negar acesso a uma página que existe (recuperável no próximo crawl); aqui o
 * erro é convidar o Google a rastrear uma URL morta.
 */
const MAX_USABLE_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * TTL FÍSICO no Redis. Maior que a idade utilizável de propósito: a chave
 * sobrevive um pouco além da validade para diagnóstico ("existia snapshot, mas
 * estava velho demais" é informação diferente de "nunca houve snapshot").
 */
const REDIS_TTL_SECONDS = 24 * 60 * 60;

/** Orçamento por operação. Sitemap não pode ficar pendurado esperando cache. */
const REDIS_TIMEOUT_MS = 1500;

interface SnapshotEnvelope {
  v: number;
  at: number;
  entries: PublicSitemapEntry[];
}

export type SnapshotReadResult =
  | { kind: "hit"; entries: PublicSitemapEntry[]; ageMs: number }
  | { kind: "miss" }
  | { kind: "expired"; ageMs: number }
  | { kind: "unavailable"; reason: string };

function log(message: string): void {
  if (typeof window !== "undefined") return;
  // eslint-disable-next-line no-console
  console.error(`[sitemap-snapshot] ${message}`);
}

/** `/api/public/seo/sitemap/type/city_home?limit=50000` → `type-city_home`. */
export function snapshotKeyForPath(path: string): string {
  const clean = String(path || "")
    .split("?")[0]
    .replace(/^\/api\/public\/seo\/sitemap\/?/, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .toLowerCase();
  return clean || "root";
}

/** Corre a operação contra um relógio — Redis lento não pode travar o sitemap. */
async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: timeout`)), REDIS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isValidEnvelope(value: unknown): value is SnapshotEnvelope {
  if (!value || typeof value !== "object") return false;
  const env = value as Partial<SnapshotEnvelope>;
  if (env.v !== SNAPSHOT_FORMAT) return false;
  if (typeof env.at !== "number" || !Number.isFinite(env.at)) return false;
  if (!Array.isArray(env.entries)) return false;
  // Entrada sem `loc` não é sitemap — é payload corrompido travestido.
  return env.entries.every((e) => e && typeof e === "object" && typeof e.loc === "string");
}

/**
 * Lê o snapshot persistente.
 *
 * `unavailable` (Redis fora) é DIFERENTE de `miss` (Redis ok, sem snapshot):
 * o caller precisa dos dois para logar a causa certa, ainda que a decisão
 * final — 503 — seja a mesma.
 */
export async function readSitemapSnapshot(
  path: string,
  now: number = Date.now(),
  maxAgeMs: number = MAX_USABLE_AGE_MS
): Promise<SnapshotReadResult> {
  const redis = getRedisClient();
  if (!redis) return { kind: "unavailable", reason: "redis-nao-configurado" };

  const key = `${KEY_PREFIX}${snapshotKeyForPath(path)}`;

  try {
    const raw = await withTimeout(redis.get(key), "get");
    if (!raw) return { kind: "miss" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      log(`${key}: JSON inválido no Redis — ignorando`);
      return { kind: "miss" };
    }

    if (!isValidEnvelope(parsed)) {
      log(`${key}: envelope inválido ou de formato antigo — ignorando`);
      return { kind: "miss" };
    }

    const ageMs = Math.max(0, now - parsed.at);
    if (ageMs > maxAgeMs) {
      log(`${key}: snapshot com ${Math.round(ageMs / 60000)} min — velho demais para usar`);
      return { kind: "expired", ageMs };
    }

    return { kind: "hit", entries: parsed.entries, ageMs };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log(`${key}: leitura falhou (${reason})`);
    return { kind: "unavailable", reason };
  }
}

/**
 * Persiste um resultado CONFIRMADO.
 *
 * Nunca lança e nunca bloqueia a resposta: Redis fora significa perder a
 * camada 3, não perder o sitemap.
 *
 * ── Por que resultado VAZIO não vira snapshot ────────────────────────────────
 * Um sitemap legitimamente vazio existe (`models.xml`, enquanto nenhum modelo
 * atinge o limiar) e continua respondendo 200 vazio quando a consulta funciona
 * — isso é decidido pelo `source: "fresh"`, não aqui.
 *
 * Mas guardar `[]` como "último estado bom" tornaria indistinguível, MAIS
 * TARDE, "estava vazio de verdade" de "não consegui buscar". Foi essa confusão
 * que congelou o sitemap vazio por semanas em 2026-07-27. Snapshot só serve
 * para responder "o que eu sabia quando sabia algo" — e `[]` não é algo.
 */
export async function writeSitemapSnapshot(
  path: string,
  entries: PublicSitemapEntry[],
  now: number = Date.now()
): Promise<void> {
  if (!Array.isArray(entries) || entries.length === 0) return;

  const redis = getRedisClient();
  if (!redis) return;

  const key = `${KEY_PREFIX}${snapshotKeyForPath(path)}`;
  const envelope: SnapshotEnvelope = { v: SNAPSHOT_FORMAT, at: now, entries };

  try {
    await withTimeout(
      redis.set(key, JSON.stringify(envelope), "EX", REDIS_TTL_SECONDS),
      "set"
    );
  } catch (error) {
    log(`${key}: gravação falhou (${error instanceof Error ? error.message : String(error)})`);
  }
}

export const __testing = {
  KEY_PREFIX,
  SNAPSHOT_FORMAT,
  MAX_USABLE_AGE_MS,
  REDIS_TTL_SECONDS,
};
