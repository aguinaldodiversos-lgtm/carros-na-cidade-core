/**
 * Homologação pré-lançamento — GRUPO A (autenticação), camada de SERVIÇO.
 *
 * Motivo de existir: `src/modules/auth/` não tinha NENHUM teste. Havia
 * cobertura farta do BFF do Next (`frontend/app/api/auth/login/route.test.ts`)
 * — que prova o repasse de status — mas nada que provasse a regra em si:
 * quem decide 400/401, quem normaliza o e-mail, quem impede o duplicado.
 * Um BFF fiel repassando a decisão errada continua verde.
 *
 * IDs cobertos:
 *   AUTH-01  cadastro válido → INSERT + sessão emitida
 *   AUTH-02  e-mail duplicado → erro controlado e NENHUM INSERT
 *   AUTH-03  senha abaixo do mínimo → 400 antes de tocar o banco
 *   AUTH-04  e-mail com espaços/maiúsculas → normalizado na consulta E no INSERT
 *   AUTH-06  senha incorreta → 401 (nunca 500) + contabilização da falha
 *
 * Estratégia: o `pool` é despachado por texto de SQL, então cada asserção
 * pode afirmar o que foi (ou não foi) enviado ao banco. Sessão, auditoria e
 * política de bloqueio são mockadas — são contratos de outros módulos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

const queryMock = vi.fn();

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: (...args) => queryMock(...args) },
  default: { query: (...args) => queryMock(...args) },
  closeDatabasePool: vi.fn(),
}));

const validateUserForLogin = vi.fn();
const handleFailedLogin = vi.fn();
const resetLoginAttempts = vi.fn();

vi.mock("../../src/modules/auth/auth.security.service.js", () => ({
  validateUserForLogin: (...args) => validateUserForLogin(...args),
  handleFailedLogin: (...args) => handleFailedLogin(...args),
  resetLoginAttempts: (...args) => resetLoginAttempts(...args),
}));

vi.mock("../../src/modules/auth/auth.audit.service.js", () => ({
  logLoginAttempt: vi.fn(async () => {}),
}));

const issueSession = vi.fn(async () => ({
  accessToken: "access-token-fake",
  refreshToken: "refresh-token-fake",
}));

vi.mock("../../src/modules/auth/sessions/session.issuer.js", () => ({
  issueSession: (...args) => issueSession(...args),
}));

vi.mock("../../src/modules/auth/sessions/refreshToken.repository.js", () => ({
  rotateRefreshToken: vi.fn(async () => ({})),
  revokeRefreshToken: vi.fn(async () => ({})),
  revokeAllUserRefreshTokens: vi.fn(async () => ({})),
}));

const USERS_COLUMNS = [
  "id",
  "name",
  "email",
  "password_hash",
  "phone",
  "city",
  "document_type",
  "document_number",
  "document_verified",
  "role",
  "plan_id",
  "created_at",
  "updated_at",
];

/** Registra o SQL emitido para permitir asserções de ausência (nenhum INSERT). */
let emitted = [];

/**
 * Despacha por texto de SQL. `existingEmailRows` controla o cenário de
 * duplicidade; `loginUser` controla a linha devolvida no login.
 */
function installPool({ existingEmailRows = [], loginUser = null } = {}) {
  queryMock.mockReset();
  emitted = [];
  queryMock.mockImplementation(async (text, params) => {
    const sql = String(text).replace(/\s+/g, " ").trim();
    emitted.push({ sql, params });

    if (sql.includes("information_schema.columns")) {
      return { rows: USERS_COLUMNS.map((column_name) => ({ column_name })), rowCount: 13 };
    }
    if (sql.startsWith("SELECT id FROM users WHERE LOWER(email)")) {
      return { rows: existingEmailRows, rowCount: existingEmailRows.length };
    }
    if (sql.startsWith("SELECT * FROM users WHERE LOWER(email)")) {
      return { rows: loginUser ? [loginUser] : [], rowCount: loginUser ? 1 : 0 };
    }
    if (sql.startsWith("INSERT INTO users")) {
      return { rows: [{ id: 4242, email: params?.[1] ?? null, role: "user" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
}

async function loadAuthService() {
  // `usersColumnsPromise` é cacheado no módulo — resetar evita que o Set de
  // colunas de um teste vaze para o seguinte.
  vi.resetModules();
  return import("../../src/modules/auth/auth.service.js");
}

beforeEach(() => {
  validateUserForLogin.mockReset();
  handleFailedLogin.mockReset();
  resetLoginAttempts.mockReset();
  issueSession.mockClear();
});

describe("AUTH-01 — cadastro válido", () => {
  it("insere o usuário e emite sessão", async () => {
    installPool();
    const { register } = await loadAuthService();

    const result = await register({
      name: "Maria Teste",
      email: "maria@exemplo.com",
      password: "123456",
      phone: "11999998888",
      city: "Atibaia",
    });

    const inserts = emitted.filter((e) => e.sql.startsWith("INSERT INTO users"));
    expect(inserts).toHaveLength(1);
    expect(issueSession).toHaveBeenCalledTimes(1);
    expect(result).toBeTruthy();
  });

  it("a senha nunca é gravada em claro — a coluna recebe um hash bcrypt", async () => {
    installPool();
    const { register } = await loadAuthService();

    await register({ email: "hash@exemplo.com", password: "senhaSegura1" });

    const insert = emitted.find((e) => e.sql.startsWith("INSERT INTO users"));
    expect(insert.params).not.toContain("senhaSegura1");
    const hash = insert.params.find((p) => typeof p === "string" && p.startsWith("$2"));
    expect(hash).toBeTruthy();
    await expect(bcrypt.compare("senhaSegura1", hash)).resolves.toBe(true);
  });
});

describe("AUTH-02 — cadastro com e-mail duplicado", () => {
  it("erro controlado 400 e NENHUM INSERT (não duplica a conta)", async () => {
    installPool({ existingEmailRows: [{ id: 7 }] });
    const { register } = await loadAuthService();

    await expect(
      register({ email: "duplicado@exemplo.com", password: "123456" })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(emitted.some((e) => e.sql.startsWith("INSERT INTO users"))).toBe(false);
  });

  it("a checagem de duplicidade é case-insensitive no SQL (LOWER(email))", async () => {
    installPool({ existingEmailRows: [{ id: 7 }] });
    const { register } = await loadAuthService();

    await expect(
      register({ email: "DUPLICADO@Exemplo.com", password: "123456" })
    ).rejects.toMatchObject({ statusCode: 400 });

    const dup = emitted.find((e) => e.sql.startsWith("SELECT id FROM users WHERE LOWER(email)"));
    expect(dup.params[0]).toBe("duplicado@exemplo.com");
  });
});

describe("AUTH-03 — senha abaixo do mínimo", () => {
  it("5 caracteres → 400 e o banco nem é consultado para duplicidade", async () => {
    installPool();
    const { register } = await loadAuthService();

    await expect(register({ email: "curta@exemplo.com", password: "12345" })).rejects.toMatchObject(
      { statusCode: 400 }
    );

    expect(emitted.some((e) => e.sql.startsWith("SELECT id FROM users"))).toBe(false);
    expect(emitted.some((e) => e.sql.startsWith("INSERT INTO users"))).toBe(false);
  });

  it("6 caracteres é o limite ACEITO — a fronteira é 6, não 7", async () => {
    installPool();
    const { register } = await loadAuthService();

    await expect(
      register({ email: "limite@exemplo.com", password: "123456" })
    ).resolves.toBeTruthy();
  });

  it("senha só de espaços é tratada como ausente (400), não como 'tem 8 chars'", async () => {
    installPool();
    const { register } = await loadAuthService();

    await expect(
      register({ email: "espacos@exemplo.com", password: "        " })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("AUTH-04 — e-mail com espaços e letras maiúsculas", () => {
  it("normaliza para trim+lowercase na consulta E no valor persistido", async () => {
    installPool();
    const { register } = await loadAuthService();

    await register({ email: "   Maria.Teste@EXEMPLO.com  ", password: "123456" });

    const dup = emitted.find((e) => e.sql.startsWith("SELECT id FROM users WHERE LOWER(email)"));
    expect(dup.params[0]).toBe("maria.teste@exemplo.com");

    const insert = emitted.find((e) => e.sql.startsWith("INSERT INTO users"));
    expect(insert.params).toContain("maria.teste@exemplo.com");
    // Nenhuma variante crua sobrevive — senão o duplicado passaria pela porta lateral.
    expect(insert.params).not.toContain("   Maria.Teste@EXEMPLO.com  ");
    expect(insert.params).not.toContain("Maria.Teste@EXEMPLO.com");
  });

  it("o login aplica a MESMA normalização (senão cadastro e login divergem)", async () => {
    const hash = await bcrypt.hash("123456", 4);
    installPool({ loginUser: { id: 1, email: "maria@exemplo.com", password_hash: hash } });
    const { login } = await loadAuthService();

    await login("  MARIA@Exemplo.COM ", "123456");

    const sel = emitted.find((e) => e.sql.startsWith("SELECT * FROM users WHERE LOWER(email)"));
    expect(sel.params[0]).toBe("maria@exemplo.com");
  });
});

describe("AUTH-06 — login com senha incorreta", () => {
  it("nega com 401 (jamais 500) e não emite sessão", async () => {
    const hash = await bcrypt.hash("senha-correta", 4);
    installPool({ loginUser: { id: 9, email: "user@exemplo.com", password_hash: hash } });
    const { login } = await loadAuthService();

    await expect(login("user@exemplo.com", "senha-errada")).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(issueSession).not.toHaveBeenCalled();
  });

  it("contabiliza a tentativa falha (alimenta o bloqueio por força bruta)", async () => {
    const hash = await bcrypt.hash("senha-correta", 4);
    installPool({ loginUser: { id: 9, email: "user@exemplo.com", password_hash: hash } });
    const { login } = await loadAuthService();

    await expect(login("user@exemplo.com", "errada")).rejects.toBeTruthy();

    expect(handleFailedLogin).toHaveBeenCalledTimes(1);
    expect(resetLoginAttempts).not.toHaveBeenCalled();
  });

  it("e-mail inexistente também é 401 — a mensagem não enumera contas", async () => {
    installPool({ loginUser: null });
    const { login } = await loadAuthService();

    const erro = await login("ninguem@exemplo.com", "qualquer").catch((e) => e);

    expect(erro.statusCode).toBe(401);
    expect(String(erro.message)).not.toMatch(/não encontrad|inexistente|not found/i);
  });

  it("credenciais ausentes → 401 sem sequer consultar o banco", async () => {
    installPool();
    const { login } = await loadAuthService();

    await expect(login("", "")).rejects.toMatchObject({ statusCode: 401 });
    expect(emitted.filter((e) => e.sql.startsWith("SELECT * FROM users"))).toHaveLength(0);
  });

  it("login correto emite sessão e zera o contador de falhas", async () => {
    const hash = await bcrypt.hash("senha-correta", 4);
    installPool({ loginUser: { id: 9, email: "user@exemplo.com", password_hash: hash } });
    const { login } = await loadAuthService();

    await login("user@exemplo.com", "senha-correta");

    expect(issueSession).toHaveBeenCalledTimes(1);
    expect(resetLoginAttempts).toHaveBeenCalledWith(9);
    expect(handleFailedLogin).not.toHaveBeenCalled();
  });
});

describe("AUTH-03 — alinhamento frontend ↔ backend do mínimo de senha", () => {
  it("o BFF do Next recusa < 6 com a MESMA fronteira do serviço Express", async () => {
    const { readFileSync } = await import("node:fs");
    const bff = readFileSync("frontend/app/api/auth/register/route.ts", "utf8");
    // Se o BFF passar a exigir 8 e o Express continuar em 6 (ou o contrário),
    // o usuário vê mensagens contraditórias entre a tela e a API.
    expect(bff).toMatch(/length\s*<\s*6/);
  });
});
