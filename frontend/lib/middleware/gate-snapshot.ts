/**
 * Último estado bom conhecido dos gates — a peça que torna o fail-safe viável.
 *
 * ── Por que existe ───────────────────────────────────────────────────────────
 * Um gate de indexação tem que responder a três perguntas distintas, e a
 * terceira é a que estava faltando:
 *
 *   1. o recurso existe?          → segue
 *   2. o recurso não existe?      → 404
 *   3. não consegui verificar?    → **não pode virar 200**
 *
 * A versão anterior tratava (3) como (1): `pass-unavailable` deixava passar, e
 * a página respondia 200 como se o gate não existisse. Uma falha de
 * infraestrutura — ou uma variável de ambiente ausente no build — criava
 * páginas públicas indevidas sem nenhum erro visível.
 *
 * Responder 503 a toda indisponibilidade seria correto mas caro: um blip de
 * rede derrubaria toda a superfície territorial. O snapshot é o meio-termo
 * honesto: durante a janela de instabilidade seguimos decidindo com o último
 * estado que sabemos ter sido verdadeiro, e só quando não há estado nenhum
 * respondemos 503.
 *
 * ── Best-effort, deliberadamente ─────────────────────────────────────────────
 * Estado de módulo. Morre em restart/deploy e não é compartilhado entre
 * instâncias do Render — mesma natureza do `lastGoodByPath` do sitemap-client.
 * Isso é aceitável porque o snapshot NUNCA relaxa a decisão: ele só substitui
 * um 503 por uma decisão baseada em dado real e recente. Sem snapshot, o pior
 * caso é 503 — nunca 200 indevido.
 *
 * ── Por que o snapshot expira ────────────────────────────────────────────────
 * Um snapshot de semanas atrás não é "o último estado bom", é um palpite. Em
 * operação normal o conjunto se renova a cada 60s; um snapshot velho significa
 * indisponibilidade sustentada, e aí 503 volta a ser a resposta honesta. O
 * limite é generoso (24h por padrão) porque errar para o lado do 503 também
 * custa caro, e o conjunto de cidades muda em escala de semanas, não de horas.
 */

import { readPositiveIntEnv } from "./gate-runtime-env";

const HOUR_MS = 60 * 60 * 1000;

/** 24h. Ajustável por `GATE_SNAPSHOT_MAX_AGE_HOURS`. */
export function getSnapshotMaxAgeMs(): number {
  return readPositiveIntEnv("GATE_SNAPSHOT_MAX_AGE_HOURS", 24) * HOUR_MS;
}

export interface SnapshotEntry<T> {
  value: T;
  storedAt: number;
}

export type SnapshotLookup<T> =
  | { kind: "hit"; value: T; ageMs: number }
  | { kind: "miss" }
  | { kind: "expired"; ageMs: number };

/**
 * Guarda um valor por chave, com teto de entradas.
 *
 * O teto existe por causa do gate de anúncio: o espaço de identificadores é
 * ilimitado e um crawler varrendo slugs inventados encheria a memória do
 * processo. Cidades não têm esse problema (o conjunto inteiro é UMA entrada),
 * mas o mesmo cofre serve os dois.
 */
export class GateSnapshotStore<T> {
  private readonly entries = new Map<string, SnapshotEntry<T>>();

  constructor(private readonly maxEntries: number) {}

  /**
   * Só guarda o que foi CONFIRMADO pelo backend. Nunca guardamos o resultado de
   * uma falha — cachear "não sei" como se fosse estado bom é o defeito que
   * custou semanas de sitemap vazio em 2026-07-27.
   */
  remember(key: string, value: T, now: number): void {
    // Reinserir move a chave para o fim da ordem de iteração do Map, que é o
    // que dá o comportamento LRU no despejo abaixo.
    this.entries.delete(key);
    this.entries.set(key, { value, storedAt: now });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  lookup(key: string, now: number, maxAgeMs: number): SnapshotLookup<T> {
    const entry = this.entries.get(key);
    if (!entry) return { kind: "miss" };

    const ageMs = Math.max(0, now - entry.storedAt);
    if (ageMs > maxAgeMs) return { kind: "expired", ageMs };

    return { kind: "hit", value: entry.value, ageMs };
  }

  get size(): number {
    return this.entries.size;
  }

  /** Uso EXCLUSIVO de teste: sem reset, um caso contamina o seguinte. */
  clear(): void {
    this.entries.clear();
  }
}
