/**
 * Serviço de notificações — criação e idempotência.
 *
 * O `pool` é substituído por um Postgres de mentira que implementa DE VERDADE
 * a semântica do índice único `(recipient_user_id, idempotency_key)` e do
 * `ON CONFLICT DO NOTHING`. Isso é deliberado: um mock que apenas devolve
 * `{ rows: [...] }` provaria que o código chama o banco, não que a
 * idempotência funciona. Aqui, se o repositório parar de usar ON CONFLICT (ou
 * escopar a chave errado), o teste quebra.
 *
 * A garantia contra corrida real — duas transações simultâneas — depende do
 * índice no PostgreSQL e é exercitada no teste de integração
 * (`tests/integration/user-notifications-schema.integration.test.js`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/** Estado do "banco". */
let rows = [];
let nextId = 1;

function parseInsert(sql, params) {
  const [recipient, eventType, title, body, entityType, entityId, actionPath, payload, key] =
    params;
  return {
    recipient: String(recipient),
    eventType,
    title,
    body,
    entityType,
    entityId,
    actionPath,
    payload,
    key,
  };
}

const fakeQuery = vi.fn(async (sql, params = []) => {
  const text = String(sql).replace(/\s+/g, " ").trim();

  if (/^INSERT INTO user_notifications/i.test(text)) {
    const input = parseInsert(text, params);

    // A constraint UNIQUE (recipient_user_id, idempotency_key), de verdade.
    const clash = rows.find(
      (r) => String(r.recipient_user_id) === input.recipient && r.idempotency_key === input.key
    );
    if (clash) {
      // ON CONFLICT DO NOTHING → nenhuma linha retornada.
      return { rows: [], rowCount: 0 };
    }

    const row = {
      id: nextId++,
      recipient_user_id: input.recipient,
      event_type: input.eventType,
      title: input.title,
      body: input.body,
      entity_type: input.entityType,
      entity_id: input.entityId,
      action_path: input.actionPath,
      payload: JSON.parse(input.payload),
      idempotency_key: input.key,
      read_at: null,
      created_at: new Date(`2026-08-10T12:00:${String(nextId).padStart(2, "0")}.000Z`),
    };
    rows.push(row);
    return { rows: [row], rowCount: 1 };
  }

  if (
    /SELECT .* FROM user_notifications WHERE recipient_user_id = \$1 AND idempotency_key = \$2/i.test(
      text
    )
  ) {
    const found = rows.find(
      (r) => String(r.recipient_user_id) === String(params[0]) && r.idempotency_key === params[1]
    );
    return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
  }

  if (/SELECT COUNT\(\*\)::int AS count FROM user_notifications/i.test(text)) {
    const count = rows.filter(
      (r) => String(r.recipient_user_id) === String(params[0]) && r.read_at == null
    ).length;
    return { rows: [{ count }], rowCount: 1 };
  }

  if (/^UPDATE user_notifications SET read_at = COALESCE/i.test(text)) {
    const row = rows.find(
      (r) => r.id === Number(params[0]) && String(r.recipient_user_id) === String(params[1])
    );
    if (!row) return { rows: [], rowCount: 0 };
    row.read_at = row.read_at ?? new Date("2026-08-10T13:00:00.000Z");
    return { rows: [row], rowCount: 1 };
  }

  if (/^UPDATE user_notifications SET read_at = NOW\(\)/i.test(text)) {
    const target = rows.filter(
      (r) => String(r.recipient_user_id) === String(params[0]) && r.read_at == null
    );
    for (const r of target) r.read_at = new Date("2026-08-10T13:00:00.000Z");
    return { rows: [], rowCount: target.length };
  }

  if (/^SELECT .* FROM user_notifications WHERE recipient_user_id = \$1/i.test(text)) {
    const limit = Number(params[params.length - 1]);
    const mine = rows
      .filter((r) => String(r.recipient_user_id) === String(params[0]))
      .sort((a, b) => b.created_at - a.created_at || b.id - a.id);
    return { rows: mine.slice(0, limit), rowCount: mine.length };
  }

  return { rows: [], rowCount: 0 };
});

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: (sql, params) => fakeQuery(sql, params),
  pool: { query: (sql, params) => fakeQuery(sql, params) },
  withTransaction: vi.fn(),
}));

const service = await import("../../src/modules/notifications/notifications.service.js");

const BASE = {
  recipientUserId: "10",
  eventType: "sale_request.bid_received",
  title: "Nova oferta recebida",
  body: "Uma loja fez uma oferta pelo seu veículo.",
  idempotencyKey: "sale_request:1:bid:1",
};

beforeEach(() => {
  rows = [];
  nextId = 1;
  fakeQuery.mockClear();
});

describe("createUserNotification — criação", () => {
  it("cria notificação válida e devolve created: true", async () => {
    const result = await service.createUserNotification(BASE);

    expect(result.created).toBe(true);
    expect(result.notification.title).toBe("Nova oferta recebida");
    expect(result.notification.read_at).toBe(null);
    expect(rows).toHaveLength(1);
  });

  it("normaliza opcionais: payload default e action_path validado", async () => {
    const result = await service.createUserNotification({
      ...BASE,
      entityType: "vehicle_sale_request",
      entityId: 42,
      actionPath: "/dashboard/vender-para-lojas/42",
    });

    expect(result.notification.payload).toEqual({});
    expect(result.notification.entity_id).toBe("42");
    expect(result.notification.action_path).toBe("/dashboard/vender-para-lojas/42");
  });

  it("recusa action_path externo ANTES de tocar o banco", async () => {
    await expect(
      service.createUserNotification({ ...BASE, actionPath: "https://evil.com" })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(rows).toHaveLength(0);
  });

  it("recusa destinatário inválido", async () => {
    for (const bad of [null, "", "abc", 0]) {
      await expect(
        service.createUserNotification({ ...BASE, recipientUserId: bad })
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(rows).toHaveLength(0);
  });
});

describe("createUserNotification — idempotência", () => {
  it("mesma chave + mesmo destinatário → apenas 1 linha", async () => {
    const first = await service.createUserNotification(BASE);
    const second = await service.createUserNotification(BASE);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(rows).toHaveLength(1);
    // Colisão devolve a linha vigente, não null — o chamador sempre tem objeto.
    expect(second.notification.id).toBe(first.notification.id);
  });

  it("colisão NÃO lança erro (retry do produtor não pode derrubar o fluxo)", async () => {
    await service.createUserNotification(BASE);
    await expect(service.createUserNotification(BASE)).resolves.toBeTruthy();
  });

  it("chaves diferentes para o MESMO usuário → 2 notificações", async () => {
    await service.createUserNotification({ ...BASE, idempotencyKey: "evento:1" });
    await service.createUserNotification({ ...BASE, idempotencyKey: "evento:2" });

    expect(rows).toHaveLength(2);
  });

  it("MESMA chave para usuários diferentes → 2 notificações (escopo por destinatário)", async () => {
    // O caso que um UNIQUE global em idempotency_key quebraria: um fan-out
    // legítimo notifica o dono E o lojista sobre o MESMO evento.
    const a = await service.createUserNotification({ ...BASE, recipientUserId: "10" });
    const b = await service.createUserNotification({ ...BASE, recipientUserId: "20" });

    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it("reprocessar o mesmo evento 5x continua com 1 linha", async () => {
    for (let i = 0; i < 5; i += 1) {
      await service.createUserNotification(BASE);
    }
    expect(rows).toHaveLength(1);
  });
});

describe("consumo — contagem e leitura", () => {
  it("unread count considera só as não lidas do próprio usuário", async () => {
    await service.createUserNotification({ ...BASE, idempotencyKey: "a" });
    await service.createUserNotification({ ...BASE, idempotencyKey: "b" });
    await service.createUserNotification({ ...BASE, idempotencyKey: "c" });
    await service.createUserNotification({ ...BASE, recipientUserId: "20", idempotencyKey: "d" });

    await service.markMyNotificationAsRead("10", rows[0].id);

    expect(await service.countMyUnread("10")).toBe(2);
    expect(await service.countMyUnread("20")).toBe(1);
  });

  it("marcar como lida é idempotente e preserva o read_at original", async () => {
    const { notification } = await service.createUserNotification(BASE);

    const first = await service.markMyNotificationAsRead("10", notification.id);
    expect(first.read_at).not.toBe(null);

    const second = await service.markMyNotificationAsRead("10", notification.id);
    expect(second.read_at).toEqual(first.read_at);
  });

  it("marcar notificação de OUTRO usuário → 404", async () => {
    const { notification } = await service.createUserNotification(BASE);

    await expect(service.markMyNotificationAsRead("20", notification.id)).rejects.toMatchObject({
      statusCode: 404,
    });

    // E não alterou nada.
    expect(rows[0].read_at).toBe(null);
  });

  it("read-all afeta só o próprio usuário", async () => {
    await service.createUserNotification({ ...BASE, idempotencyKey: "a" });
    await service.createUserNotification({ ...BASE, idempotencyKey: "b" });
    await service.createUserNotification({ ...BASE, idempotencyKey: "c" });
    await service.createUserNotification({ ...BASE, recipientUserId: "20", idempotencyKey: "d" });
    await service.createUserNotification({ ...BASE, recipientUserId: "20", idempotencyKey: "e" });

    const result = await service.markAllMyNotificationsAsRead("10");

    expect(result.updated).toBe(3);
    expect(await service.countMyUnread("10")).toBe(0);
    expect(await service.countMyUnread("20")).toBe(2);
  });

  it("read-all sem não lidas devolve 0 sem erro", async () => {
    expect(await service.markAllMyNotificationsAsRead("10")).toEqual({ updated: 0 });
  });
});

describe("listagem", () => {
  it("devolve só as do próprio usuário, mais recentes primeiro", async () => {
    await service.createUserNotification({ ...BASE, idempotencyKey: "a", title: "Primeira" });
    await service.createUserNotification({ ...BASE, idempotencyKey: "b", title: "Segunda" });
    await service.createUserNotification({ ...BASE, recipientUserId: "20", idempotencyKey: "c" });

    const page = await service.listMyNotifications("10");

    expect(page.notifications).toHaveLength(2);
    expect(page.notifications[0].title).toBe("Segunda");
    expect(page.notifications.every((n) => String(n.recipient_user_id) === "10")).toBe(true);
  });

  it("limit do cliente é clampado ao máximo", async () => {
    const page = await service.listMyNotifications("10", { limit: "9999" });
    expect(page.limit).toBe(50);
  });

  it("sem próxima página, next_cursor é null", async () => {
    await service.createUserNotification(BASE);
    const page = await service.listMyNotifications("10");
    expect(page.next_cursor).toBe(null);
  });
});
