/**
 * Cadeia REAL de autorização profissional: authMiddleware → requireDealerAccount.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE TESTE EXISTE, SEPARADO DO UNITÁRIO
 * ────────────────────────────────────────────────────────────────────────────
 * O unitário (`dealer-middleware.test.js`) prova que o guard DECIDE certo
 * quando recebe `account_type`. Ele não prova nada sobre quem entrega esse
 * valor — e um guard perfeito alimentado com `undefined` seria um guard que
 * bloqueia todo mundo, ou (pior, num refactor descuidado) que não bloqueia
 * ninguém.
 *
 * Aqui a cadeia é montada com as peças REAIS:
 *   • `authMiddleware` de verdade (não mockado);
 *   • token assinado pelo signer de verdade;
 *   • só o `pool` do Postgres é substituído, porque é a única dependência
 *     externa.
 *
 * O que isto prova, e o unitário não podia provar:
 *   1. `authMiddleware` de fato popula `req.user.account_type`;
 *   2. os valores que ele produz a partir de `users.document_type` são
 *      EXATAMENTE os que o guard reconhece — se alguém trocar "CNPJ" por
 *      "cnpj" de um lado só, este teste fica vermelho;
 *   3. o guard é ALCANÇADO (o handler protegido não roda antes dele).
 *
 * Nenhuma rota de produção é criada para este teste: o router vive só aqui.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

// Precisa existir ANTES de o token.signer ser importado (ele lê a env em runtime,
// mas manter isto no topo evita depender dessa ordem).
process.env.JWT_SECRET = process.env.JWT_SECRET || "phase-0-1-test-secret";

/**
 * Linha de `users` devolvida pelo SELECT do authMiddleware. O teste troca este
 * valor entre casos — é o equivalente a "esta conta é CPF/CNPJ/pending no banco".
 */
let currentUserRow = null;

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: {
    query: vi.fn(async () => ({ rows: currentUserRow ? [currentUserRow] : [] })),
  },
}));

let app;
let signAccessToken;
/** Marcado true pelo handler protegido — se ficar false, o guard barrou antes. */
let handlerReached = false;

beforeAll(async () => {
  const { authMiddleware } = await import("../../src/shared/middlewares/auth.middleware.js");
  const { requireDealerAccount } = await import(
    "../../src/shared/middlewares/dealer.middleware.js"
  );
  const { errorHandler } = await import("../../src/shared/middlewares/error.middleware.js");
  ({ signAccessToken } = await import("../../src/modules/auth/token/token.signer.js"));

  app = express();
  app.use(express.json());

  // Composição idêntica à que os routers de oportunidade usarão.
  app.get("/protegido", authMiddleware, requireDealerAccount(), (req, res) => {
    handlerReached = true;
    res.json({ ok: true, accountType: req.user.account_type });
  });

  app.use(errorHandler);
});

function tokenFor(userId) {
  return signAccessToken({ id: userId, email: `u${userId}@test.local` });
}

/**
 * @param {string|null} documentType — valor cru de `users.document_type`
 */
async function callAs(documentType, { authenticated = true } = {}) {
  handlerReached = false;
  currentUserRow =
    documentType === "__NO_ROW__"
      ? null
      : { id: "77", role: "user", plan: "free", document_type: documentType };

  const req = request(app).get("/protegido");
  if (authenticated) {
    req.set("Authorization", `Bearer ${tokenFor("77")}`);
  }
  const res = await req;

  return { status: res.status, body: res.body, handlerReached };
}

describe("cadeia real — conta CNPJ é a única que atravessa", () => {
  it("document_type='cnpj' → 200 e o handler roda", async () => {
    const res = await callAs("cnpj");

    expect(res.status).toBe(200);
    expect(res.handlerReached).toBe(true);
    // Prova o acoplamento de vocabulário: authMiddleware emitiu exatamente o
    // literal que o guard compara.
    expect(res.body.accountType).toBe("CNPJ");
  });
});

describe("cadeia real — contas bloqueadas nunca alcançam o handler", () => {
  it("document_type='cpf' → 403 e handler NÃO roda", async () => {
    const res = await callAs("cpf");

    expect(res.status).toBe(403);
    expect(res.handlerReached).toBe(false);
  });

  it("document_type NULL (pending) → 403 e handler NÃO roda", async () => {
    const res = await callAs(null);

    expect(res.status).toBe(403);
    expect(res.handlerReached).toBe(false);
  });

  it("document_type string vazia (pending) → 403", async () => {
    const res = await callAs("   ");

    expect(res.status).toBe(403);
    expect(res.handlerReached).toBe(false);
  });

  it("sem Authorization → 401 e handler NÃO roda", async () => {
    const res = await callAs("cnpj", { authenticated: false });

    expect(res.status).toBe(401);
    expect(res.handlerReached).toBe(false);
  });

  it("token válido de usuário inexistente no banco → 401", async () => {
    const res = await callAs("__NO_ROW__");

    expect(res.status).toBe(401);
    expect(res.handlerReached).toBe(false);
  });

  it("Bearer forjado (assinatura inválida) → 401", async () => {
    handlerReached = false;
    currentUserRow = { id: "77", role: "user", plan: "free", document_type: "cnpj" };

    const res = await request(app)
      .get("/protegido")
      .set("Authorization", "Bearer nao.e.um.token.valido");

    expect(res.status).toBe(401);
    expect(handlerReached).toBe(false);
  });
});

describe("cadeia real — o cliente não consegue se promover a lojista", () => {
  it("headers/query alegando CNPJ não sobrepõem o document_type do banco", async () => {
    handlerReached = false;
    currentUserRow = { id: "77", role: "user", plan: "free", document_type: "cpf" };

    const res = await request(app)
      .get("/protegido?account_type=CNPJ&type=CNPJ")
      .set("Authorization", `Bearer ${tokenFor("77")}`)
      .set("x-account-type", "CNPJ")
      .set("Cookie", "cnc_session=qualquer-coisa-dizendo-CNPJ");

    expect(res.status).toBe(403);
    expect(handlerReached).toBe(false);
  });

  it("um token com account_type embutido no payload não vale — quem manda é o banco", async () => {
    handlerReached = false;
    currentUserRow = { id: "77", role: "user", plan: "free", document_type: "cpf" };

    // Token legitimamente assinado, mas com claim extra tentando escalar.
    const forged = signAccessToken({
      id: "77",
      email: "u77@test.local",
      account_type: "CNPJ",
      role: "admin",
    });

    const res = await request(app).get("/protegido").set("Authorization", `Bearer ${forged}`);

    expect(res.status).toBe(403);
    expect(handlerReached).toBe(false);
  });
});

describe("cadeia real — corpo da resposta 403", () => {
  it("expõe code estável e não vaza schema", async () => {
    const res = await callAs("cpf");

    expect(res.body?.details?.code).toBe("DEALER_ACCOUNT_REQUIRED");
    expect(JSON.stringify(res.body)).not.toMatch(/document_type|SELECT|password/i);
  });
});
