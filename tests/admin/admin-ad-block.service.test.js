/**
 * Fase 4.10A — bloqueio e reativação administrativa de anúncio.
 *
 * O foco destes testes é o que a especificação chama de invariantes:
 * bloquear exige motivo, bloquear preserva o estado anterior, reativar
 * RESTAURA esse estado em vez de forçar `active`, e um retry não reescreve a
 * história. Um teste que só verificasse "status virou blocked" passaria com
 * qualquer uma dessas garantias quebrada.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/** Banco falso: fila de respostas por padrão de SQL. */
const state = {
  adRow: null,
  queries: [],
};

function fakeQuery(sql, params = []) {
  state.queries.push({ sql: String(sql), params });
  const text = String(sql);

  if (text.includes("FOR UPDATE")) {
    return Promise.resolve({ rows: state.adRow ? [state.adRow] : [] });
  }
  if (text.includes("UPDATE ads")) {
    // Reproduz o efeito do UPDATE sobre a linha em memória para que uma
    // segunda chamada dentro do mesmo teste enxergue o estado já gravado.
    const next = { ...state.adRow };
    if (text.includes("blocked_reason_code     = $3")) {
      next.status = params[1];
      next.blocked_reason_code = params[2];
      next.blocked_reason = params[3];
      next.blocked_previous_status = params[4];
      next.blocked_by_user_id = params[5];
    } else {
      next.status = params[1];
      next.blocked_reason_code = null;
      next.blocked_reason = null;
      next.blocked_previous_status = null;
      next.blocked_by_user_id = null;
    }
    state.adRow = next;
    return Promise.resolve({ rows: [next] });
  }
  if (text.includes("INSERT INTO ad_moderation_events")) {
    state.queries.at(-1).isModerationEvent = true;
    return Promise.resolve({ rows: [] });
  }
  if (text.includes("FROM ad_moderation_events")) {
    return Promise.resolve({ rows: state.history || [] });
  }
  return Promise.resolve({ rows: [] });
}

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: (sql, params) => fakeQuery(sql, params),
  pool: { query: (sql, params) => fakeQuery(sql, params) },
  withTransaction: (cb) => cb({ query: (sql, params) => fakeQuery(sql, params) }),
  default: { query: (sql, params) => fakeQuery(sql, params) },
}));

const recordAdminAction = vi.fn();
vi.mock("../../src/modules/admin/admin.audit.js", () => ({
  recordAdminAction: (...args) => recordAdminAction(...args),
}));

const invalidateAdsCachesAfterMutation = vi.fn().mockResolvedValue(undefined);
vi.mock("../../src/modules/ads/ads.mutation-cache.js", () => ({
  invalidateAdsCachesAfterMutation: () => invalidateAdsCachesAfterMutation(),
}));

const { blockAd, unblockAd, listModerationHistory } = await import(
  "../../src/modules/admin/ads/admin-ad-block.service.js"
);

function moderationEvents() {
  return state.queries.filter((q) => q.isModerationEvent);
}

function adUpdates() {
  return state.queries.filter((q) => q.sql.includes("UPDATE ads"));
}

beforeEach(() => {
  state.queries = [];
  state.history = [];
  state.adRow = {
    id: "42",
    status: "active",
    blocked_reason_code: null,
    blocked_reason: null,
    blocked_at: null,
    blocked_previous_status: null,
    blocked_by_user_id: null,
  };
  recordAdminAction.mockClear();
  invalidateAdsCachesAfterMutation.mockClear();
});

describe("blockAd — motivo obrigatório", () => {
  it("recusa bloqueio sem reason_code", async () => {
    await expect(blockAd("admin1", "42", {})).rejects.toThrow(/Motivo de bloqueio inválido/);
    expect(adUpdates()).toHaveLength(0);
  });

  it("recusa reason_code fora do catálogo", async () => {
    await expect(blockAd("admin1", "42", { reasonCode: "porque_sim" })).rejects.toThrow(
      /Motivo de bloqueio inválido/
    );
    expect(adUpdates()).toHaveLength(0);
  });

  it("recusa 'other' sem descrição administrativa", async () => {
    await expect(blockAd("admin1", "42", { reasonCode: "other" })).rejects.toThrow(
      /exige uma descrição/
    );
    await expect(blockAd("admin1", "42", { reasonCode: "other", note: "   " })).rejects.toThrow(
      /exige uma descrição/
    );
    expect(adUpdates()).toHaveLength(0);
  });

  it("aceita 'other' com descrição", async () => {
    const result = await blockAd("admin1", "42", {
      reasonCode: "other",
      note: "Placa divergente do documento enviado.",
    });
    expect(result.changed).toBe(true);
    expect(result.ad.status).toBe("blocked");
    expect(result.ad.blocked_reason).toBe("Placa divergente do documento enviado.");
  });

  it("os demais motivos não exigem descrição", async () => {
    const result = await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });
    expect(result.changed).toBe(true);
    expect(result.ad.blocked_reason_code).toBe("suspected_fraud");
    expect(result.ad.blocked_reason).toBeNull();
  });
});

describe("blockAd — preservação do estado anterior", () => {
  it("guarda 'active' quando o anúncio estava publicado", async () => {
    const result = await blockAd("admin1", "42", { reasonCode: "duplicate_ad" });
    expect(result.ad.blocked_previous_status).toBe("active");
  });

  it("guarda 'paused' quando o dono já tinha pausado", async () => {
    state.adRow.status = "paused";
    const result = await blockAd("admin1", "42", { reasonCode: "invalid_photos" });
    expect(result.ad.blocked_previous_status).toBe("paused");
  });

  it("guarda 'pending_review' quando o anúncio estava retido na fila", async () => {
    state.adRow.status = "pending_review";
    const result = await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });
    expect(result.ad.blocked_previous_status).toBe("pending_review");
  });

  it("recusa bloquear anúncio deletado", async () => {
    state.adRow.status = "deleted";
    await expect(blockAd("admin1", "42", { reasonCode: "terms_violation" })).rejects.toThrow(
      /não admite bloqueio/
    );
    expect(adUpdates()).toHaveLength(0);
  });

  it("recusa anúncio inexistente", async () => {
    state.adRow = null;
    await expect(blockAd("admin1", "999", { reasonCode: "terms_violation" })).rejects.toThrow(
      /não encontrado/
    );
  });
});

describe("unblockAd — restaura, não força 'active'", () => {
  it("devolve o anúncio a 'paused' quando era esse o estado antes do bloqueio", async () => {
    state.adRow.status = "paused";
    await blockAd("admin1", "42", { reasonCode: "invalid_photos" });

    const result = await unblockAd("admin1", "42", {});

    expect(result.changed).toBe(true);
    expect(result.ad.status).toBe("paused");
  });

  it("devolve o anúncio a 'pending_review' — reativar não pula a fila de moderação", async () => {
    state.adRow.status = "pending_review";
    await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });

    const result = await unblockAd("admin1", "42", {});

    expect(result.ad.status).toBe("pending_review");
  });

  it("devolve a 'active' quando era esse o estado", async () => {
    await blockAd("admin1", "42", { reasonCode: "duplicate_ad" });
    const result = await unblockAd("admin1", "42", {});
    expect(result.ad.status).toBe("active");
  });

  it("limpa os campos de bloqueio ao reativar", async () => {
    await blockAd("admin1", "42", { reasonCode: "other", note: "nota interna" });
    const result = await unblockAd("admin1", "42", {});

    expect(result.ad.blocked_reason_code).toBeNull();
    expect(result.ad.blocked_reason).toBeNull();
    expect(result.ad.blocked_previous_status).toBeNull();
    expect(result.ad.blocked_by_user_id).toBeNull();
  });

  it("cai em 'active' se o estado anterior for dado corrompido", async () => {
    state.adRow.status = "blocked";
    state.adRow.blocked_previous_status = "deleted";

    const result = await unblockAd("admin1", "42", {});

    expect(result.ad.status).toBe("active");
  });

  it("cai em 'active' quando o legado não tem estado anterior", async () => {
    state.adRow.status = "blocked";
    state.adRow.blocked_previous_status = null;

    const result = await unblockAd("admin1", "42", {});

    expect(result.ad.status).toBe("active");
  });
});

describe("idempotência", () => {
  it("bloquear duas vezes não grava segundo evento nem reescreve o motivo", async () => {
    await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });
    const firstEvents = moderationEvents().length;
    const firstUpdates = adUpdates().length;

    const second = await blockAd("admin2", "42", {
      reasonCode: "duplicate_ad",
      note: "tentativa de sobrescrever",
    });

    expect(second.changed).toBe(false);
    expect(moderationEvents()).toHaveLength(firstEvents);
    expect(adUpdates()).toHaveLength(firstUpdates);
    // O motivo original sobrevive ao segundo bloqueio.
    expect(second.ad.blocked_reason_code).toBe("suspected_fraud");
    expect(recordAdminAction).toHaveBeenCalledTimes(1);
  });

  it("reativar duas vezes não grava segundo evento", async () => {
    await blockAd("admin1", "42", { reasonCode: "invalid_photos" });
    recordAdminAction.mockClear();

    const first = await unblockAd("admin1", "42", {});
    const eventsAfterFirst = moderationEvents().length;

    const second = await unblockAd("admin1", "42", {});

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(moderationEvents()).toHaveLength(eventsAfterFirst);
    expect(recordAdminAction).toHaveBeenCalledTimes(1);
  });

  it("reativar um anúncio que nunca foi bloqueado é no-op", async () => {
    const result = await unblockAd("admin1", "42", {});
    expect(result.changed).toBe(false);
    expect(adUpdates()).toHaveLength(0);
    expect(recordAdminAction).not.toHaveBeenCalled();
  });
});

describe("audit trail append-only", () => {
  it("bloqueio e reativação são DOIS eventos distintos", async () => {
    await blockAd("admin1", "42", { reasonCode: "terms_violation" });
    await unblockAd("admin1", "42", {});

    const events = moderationEvents();
    expect(events).toHaveLength(2);
    expect(events[0].params[1]).toBe("admin_blocked");
    expect(events[1].params[1]).toBe("admin_unblocked");

    // Nenhum UPDATE/DELETE na trilha — só INSERT.
    const touchedTrail = state.queries.filter(
      (q) =>
        q.sql.includes("ad_moderation_events") &&
        (q.sql.includes("UPDATE") || q.sql.includes("DELETE"))
    );
    expect(touchedTrail).toHaveLength(0);
  });

  it("o evento de bloqueio registra o status anterior e o resultante", async () => {
    state.adRow.status = "paused";
    await blockAd("admin7", "42", { reasonCode: "vehicle_unavailable" });

    const evt = moderationEvents()[0];
    expect(evt.params[2]).toBe("admin7"); // actor_user_id
    expect(evt.params[3]).toBe("admin"); // actor_role
    expect(evt.params[4]).toBe("paused"); // from_status
    expect(evt.params[5]).toBe("blocked"); // to_status
  });

  it("o evento de reativação registra o estado restaurado", async () => {
    state.adRow.status = "paused";
    await blockAd("admin1", "42", { reasonCode: "vehicle_unavailable" });
    await unblockAd("admin9", "42", {});

    const evt = moderationEvents()[1];
    expect(evt.params[4]).toBe("blocked");
    expect(evt.params[5]).toBe("paused");
    expect(JSON.parse(evt.params[7]).restored_status).toBe("paused");
  });

  it("registra admin_actions no bloqueio e na reativação", async () => {
    await blockAd("admin1", "42", { reasonCode: "duplicate_ad" });
    await unblockAd("admin1", "42", {});

    const actions = recordAdminAction.mock.calls.map((c) => c[0].action);
    expect(actions).toEqual(["block_ad", "unblock_ad"]);
  });
});

describe("cache", () => {
  it("invalida os caches públicos ao bloquear", async () => {
    await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });
    expect(invalidateAdsCachesAfterMutation).toHaveBeenCalledTimes(1);
  });

  it("invalida os caches públicos ao reativar", async () => {
    await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });
    invalidateAdsCachesAfterMutation.mockClear();

    await unblockAd("admin1", "42", {});
    expect(invalidateAdsCachesAfterMutation).toHaveBeenCalledTimes(1);
  });

  it("não invalida cache num no-op idempotente", async () => {
    await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });
    invalidateAdsCachesAfterMutation.mockClear();

    await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });
    expect(invalidateAdsCachesAfterMutation).not.toHaveBeenCalled();
  });
});

describe("concorrência", () => {
  it("lê a linha com FOR UPDATE antes de decidir", async () => {
    await blockAd("admin1", "42", { reasonCode: "duplicate_ad" });

    const lock = state.queries.find((q) => q.sql.includes("FOR UPDATE"));
    expect(lock).toBeTruthy();
    // O lock precisa vir ANTES do UPDATE, senão a decisão é tomada sobre um
    // estado que outra transação já pode ter mudado.
    expect(state.queries.indexOf(lock)).toBeLessThan(state.queries.indexOf(adUpdates()[0]));
  });

  it("bloquear × reativar: quem chega depois lê o estado já gravado", async () => {
    // Simula a serialização que o FOR UPDATE garante: as duas chamadas
    // acontecem em sequência sobre a MESMA linha em memória.
    await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });
    const unblocked = await unblockAd("admin2", "42", {});
    const reblocked = await blockAd("admin3", "42", { reasonCode: "invalid_photos" });

    expect(unblocked.changed).toBe(true);
    expect(reblocked.changed).toBe(true);
    // O último a vencer é o bloqueio — o anúncio termina fora do ar.
    expect(reblocked.ad.status).toBe("blocked");
    expect(moderationEvents()).toHaveLength(3);
  });
});

describe("listModerationHistory", () => {
  it("consulta apenas os eventos de bloqueio e reativação", async () => {
    await listModerationHistory("42");
    const q = state.queries.find((x) => x.sql.includes("FROM ad_moderation_events"));
    expect(q.params).toContain("admin_blocked");
    expect(q.params).toContain("admin_unblocked");
  });
});
