import { test, expect, request } from "@playwright/test";
import { ensureDevServerUp, getBackendApiBaseUrl } from "./helpers";

/**
 * Isolamento: dois cadastros mínimos → cada `APIRequestContext` isolado vê apenas o próprio `user.id`.
 * Exige API + Postgres. Se POST /register falhar, o spec é ignorado.
 */

let backendRegisterOk = false;

test.beforeAll(async ({ request: req, baseURL }) => {
  await ensureDevServerUp(req, baseURL);
  const apiBase = getBackendApiBaseUrl();
  const probe = await req.post(`${apiBase}/api/auth/register`, {
    data: {
      email: `e2e.iso.probe.${Date.now()}@e2e.carrosnacidade.test`,
      password: "Probe123456xx",
    },
    headers: { "Content-Type": "application/json" },
    timeout: 30_000,
  });
  backendRegisterOk = probe.ok();
});

test.describe.serial("Isolamento — dashboard por usuário", () => {
  test("dois usuários obtêm user.id distintos em /api/dashboard/me", async ({ baseURL }) => {
    test.skip(
      !backendRegisterOk,
      "Backend POST /api/auth/register indisponível (DATABASE_URL / Postgres)."
    );

    const origin = baseURL ?? "http://127.0.0.1:3000";
    const t = Date.now();
    const emailA = `e2e.iso.a.${t}@e2e.carrosnacidade.test`;
    const emailB = `e2e.iso.b.${t}@e2e.carrosnacidade.test`;
    const password = "E2Eiso_123456";

    let idA: string | undefined;
    let idB: string | undefined;

    const ctxA = await request.newContext({ baseURL: origin });
    try {
      const regA = await ctxA.post("/api/auth/register", {
        data: { email: emailA, password },
        headers: { "Content-Type": "application/json" },
      });
      expect(regA.ok(), await regA.text()).toBeTruthy();
      const meA = await ctxA.get("/api/dashboard/me");
      expect(meA.ok(), await meA.text()).toBeTruthy();
      const jsonA = (await meA.json()) as { user?: { id?: string } };
      idA = jsonA.user?.id;
    } finally {
      await ctxA.dispose();
    }

    const ctxB = await request.newContext({ baseURL: origin });
    try {
      const regB = await ctxB.post("/api/auth/register", {
        data: { email: emailB, password },
        headers: { "Content-Type": "application/json" },
      });
      expect(regB.ok(), await regB.text()).toBeTruthy();
      const meB = await ctxB.get("/api/dashboard/me");
      expect(meB.ok(), await meB.text()).toBeTruthy();
      const jsonB = (await meB.json()) as { user?: { id?: string } };
      idB = jsonB.user?.id;
    } finally {
      await ctxB.dispose();
    }

    expect(
      idA && idB && idA !== idB,
      `Esperado ids distintos, obtido A=${idA} B=${idB}`
    ).toBeTruthy();
  });
});
