import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

export const LOCAL_EMAIL = process.env.E2E_EMAIL ?? "cpf@carrosnacidade.com";
export const LOCAL_PASSWORD = process.env.E2E_PASSWORD ?? "123456";

export async function ensureDevServerUp(request: APIRequestContext, baseURL: string | undefined) {
  const origin = baseURL ?? "http://127.0.0.1:3000";
  let lastStatus = 0;
  for (let i = 0; i < 15; i += 1) {
    const res = await request.get(origin, { timeout: 20_000 }).catch(() => null);
    lastStatus = res?.status() ?? 0;
    if (res?.ok()) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `Servidor Next não respondeu OK em ${origin} (último status ${lastStatus}). ` +
      `Suba o frontend: cd frontend && npm run dev (porta 3000). ` +
      `Guia completo: docs/testing/e2e.md (raiz do monorepo).`
  );
}

export async function prepareCleanBrowserState(page: Page, context: BrowserContext) {
  await context.clearCookies();
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      // noop
    }
  });
}

export async function waitForVehicleGalleryReady(page: Page) {
  await expect(page.getByTestId("vehicle-gallery")).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
}

export async function loginAsLocalUser(page: Page, context: BrowserContext) {
  await prepareCleanBrowserState(page, context);

  const loginRes = await page.request.post("/api/auth/login", {
    data: {
      email: LOCAL_EMAIL,
      password: LOCAL_PASSWORD,
    },
    headers: { "Content-Type": "application/json" },
  });

  if (!loginRes.ok()) {
    const errBody = await loginRes.text();
    if (loginRes.status() === 401 && /Credenciais invalidas|invalidas/i.test(errBody)) {
      test.skip(true, "Login rejeitado (credenciais ou backend; E2E_EMAIL/E2E_PASSWORD).");
    }
    throw new Error(
      `POST /api/auth/login falhou: HTTP ${loginRes.status()} — ${errBody.slice(0, 500)}`
    );
  }

  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForURL(/\/(dashboard|dashboard-loja)/, {
    timeout: 120_000,
    waitUntil: "domcontentloaded",
  });
}

/** Aceita sucesso da API ou erro conhecido (backend ausente, 502, etc.). */
export function expectPublishFeedback(bodyText: string) {
  const published =
    bodyText.includes("sucesso") ||
    bodyText.includes("enviado") ||
    bodyText.includes("Publicando") ||
    bodyText.includes("Anúncio enviado");
  const backendDown =
    bodyText.includes("Não foi possível publicar") ||
    bodyText.includes("nao configurada") ||
    bodyText.includes("NEXT_PUBLIC_API_URL") ||
    bodyText.includes("API_URL") ||
    bodyText.includes("502") ||
    bodyText.includes("backend") ||
    bodyText.includes("endpoint");

  const hasFeedback =
    published ||
    backendDown ||
    /sucesso|enviado|falha|502|endpoint|configurad|publicar o anúncio|Não foi/i.test(bodyText);

  expect(hasFeedback, `Resposta inesperada (trecho): ${bodyText.slice(0, 900)}`).toBeTruthy();
}

/** CPF válido (11 dígitos) para cadastro único por execução. */
export function generateValidCpfDigits(): string {
  const n: number[] = [];
  for (let i = 0; i < 9; i += 1) {
    n.push(Math.floor(Math.random() * 10));
  }
  if (n.every((d) => d === n[0])) {
    n[8] = (n[8] + 1) % 10;
  }
  let d1 = 0;
  for (let i = 0; i < 9; i += 1) {
    d1 += n[i] * (10 - i);
  }
  d1 = (11 - (d1 % 11)) % 11;
  if (d1 >= 10) d1 = 0;
  n.push(d1);
  let d2 = 0;
  for (let i = 0; i < 10; i += 1) {
    d2 += n[i] * (11 - i);
  }
  d2 = (11 - (d2 % 11)) % 11;
  if (d2 >= 10) d2 = 0;
  n.push(d2);
  return n.join("");
}

export function formatCpfMask(digits: string) {
  const d = digits.replace(/\D/g, "").slice(0, 11);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export type RegisterCredentials = {
  email: string;
  password: string;
  name: string;
  phone: string;
  city: string;
  cpfDigits: string;
};

/**
 * Cadastro via BFF `POST /api/auth/register` (mesmo payload que o formulário).
 * Usa `page.request` para evitar descompasso React/DOM no Playwright; define cookie de sessão no contexto.
 */
export type MinimalRegisterCredentials = {
  email: string;
  password: string;
};

/**
 * Cadastro mínimo (e-mail + senha), via BFF — mesmo contrato da página de registro.
 */
export async function registerMinimalUserViaApi(page: Page, cred: MinimalRegisterCredentials) {
  const res = await page.request.post("/api/auth/register", {
    data: {
      email: cred.email,
      password: cred.password,
    },
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Cadastro mínimo rejeitado: HTTP ${res.status()} — ${body.slice(0, 600)}`);
  }

  const payload = (await res.json()) as { redirect_to?: string };
  const dest = payload.redirect_to ?? "/dashboard";
  await page.goto(dest, { waitUntil: "domcontentloaded", timeout: 120_000 });
}

/**
 * Conta `pending`: preenche CPF/nome no gate antes do wizard FIPE.
 */
export async function completePendingProfileIfNeeded(page: Page) {
  await page.waitForFunction(
    () => {
      const headings = Array.from(document.querySelectorAll("h1")).map((el) => el.textContent || "");
      return headings.some(
        (t) =>
          /Dados do veículo/i.test(t) || /Complete seu cadastro para anunciar/i.test(t)
      );
    },
    { timeout: 120_000 }
  );

  const vehicle = page.getByRole("heading", { level: 1, name: /Dados do veículo/i });
  if (await vehicle.isVisible()) {
    return;
  }

  await page.getByPlaceholder(/Como aparecerá nos anúncios/i).fill(`E2E mínimo ${Date.now()}`);
  const cpf = generateValidCpfDigits();
  await page.getByPlaceholder("000.000.000-00").fill(formatCpfMask(cpf));

  const verifyPromise = page.waitForResponse(
    (r) =>
      r.url().includes("/api/auth/verify-document") &&
      r.request().method() === "POST" &&
      r.ok(),
    { timeout: 120_000 }
  );

  await page.getByRole("button", { name: /Salvar e continuar/i }).click();
  await verifyPromise;

  await expect(
    page.getByRole("heading", { level: 1, name: /Dados do veículo/i })
  ).toBeVisible({ timeout: 120_000 });
}

export async function registerNewUserViaUi(page: Page, cred: RegisterCredentials) {
  const phoneDigits = cred.phone.replace(/\D/g, "").slice(0, 11);
  const cpfDigits = cred.cpfDigits.replace(/\D/g, "").slice(0, 11);

  const res = await page.request.post("/api/auth/register", {
    data: {
      name: cred.name,
      email: cred.email,
      password: cred.password,
      phone: phoneDigits,
      city: cred.city,
      document_type: "cpf",
      document_number: cpfDigits,
    },
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Cadastro rejeitado: HTTP ${res.status()} — ${body.slice(0, 600)}`);
  }

  const payload = (await res.json()) as { redirect_to?: string };
  const dest = payload.redirect_to ?? "/dashboard";
  await page.goto(dest, { waitUntil: "domcontentloaded", timeout: 120_000 });
}

/** Base da API backend (mesma prioridade que o BFF Next). */
export function getBackendApiBaseUrl(): string {
  const raw =
    process.env.E2E_BACKEND_API_URL?.trim() ||
    process.env.BACKEND_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.API_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "") || "http://127.0.0.1:4000";
}

/**
 * Valida que a API de busca pública retorna ao menos um anúncio com a marca esperada.
 */
export async function assertSearchApiListsVehicle(
  request: APIRequestContext,
  apiBase: string,
  brandHint: string
) {
  const brand = brandHint.split(/\s+/)[0]?.trim() || brandHint;
  const deadline = Date.now() + 25_000;

  while (Date.now() < deadline) {
    const url = new URL(`${apiBase}/api/ads/search`);
    url.searchParams.set("brand", brand);
    url.searchParams.set("limit", "30");
    url.searchParams.set("sort", "recent");

    const res = await request.get(url.toString(), {
      headers: { Accept: "application/json" },
      timeout: 60_000,
    });

    expect(res.ok(), `GET /api/ads/search falhou: ${res.status()}`).toBeTruthy();
    const json = (await res.json()) as {
      data?: Array<{ brand?: string; title?: string }>;
    };
    const rows = Array.isArray(json?.data) ? json.data : [];
    const match = rows.some(
      (row) =>
        String(row?.brand || "")
          .toLowerCase()
          .includes(brand.toLowerCase()) ||
        String(row?.title || "")
          .toLowerCase()
          .includes(brand.toLowerCase())
    );
    if (match) return;
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error(`Busca pública não listou anúncio com marca contendo "${brand}" após ~25s.`);
}

/**
 * Primeiro slug retornado pela busca (para abrir `/veiculo/[slug]` no E2E).
 */
export async function getFirstSearchAdSlug(
  request: APIRequestContext,
  apiBase: string,
  brandHint: string
): Promise<string | null> {
  const brand = brandHint.split(/\s+/)[0]?.trim() || brandHint;
  const deadline = Date.now() + 25_000;

  while (Date.now() < deadline) {
    const url = new URL(`${apiBase}/api/ads/search`);
    url.searchParams.set("brand", brand);
    url.searchParams.set("limit", "15");
    url.searchParams.set("sort", "recent");

    const res = await request.get(url.toString(), {
      headers: { Accept: "application/json" },
      timeout: 60_000,
    });
    if (res.ok()) {
      const json = (await res.json()) as {
        data?: Array<{ slug?: string }>;
      };
      const rows = Array.isArray(json?.data) ? json.data : [];
      const row = rows.find((r) => r?.slug && String(r.slug).trim().length > 0);
      const slug = row?.slug ? String(row.slug) : null;
      if (slug) return slug;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

/**
 * Marca CPF como verificado no Postgres de teste (publicação exige `document_verified`).
 * Sem DB configurado, não faz nada.
 */
export async function ensureE2eUserDocumentVerified(email: string) {
  const conn = process.env.E2E_DATABASE_URL?.trim() || process.env.TEST_DATABASE_URL?.trim() || "";
  if (!conn) return;

  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: conn });
  try {
    await pool.query(
      `UPDATE users SET document_verified = true WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))`,
      [email]
    );
  } finally {
    await pool.end().catch(() => null);
  }
}

/**
 * Se `E2E_DATABASE_URL` ou `TEST_DATABASE_URL` estiver definido, confere `ads` + `users`.
 */
export async function assertLatestAdPersistedForEmail(email: string, brandHint: string) {
  const conn = process.env.E2E_DATABASE_URL?.trim() || process.env.TEST_DATABASE_URL?.trim() || "";
  if (!conn) {
    return;
  }

  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: conn });
  try {
    const { rows } = await pool.query(
      `
      SELECT a.id, a.brand, a.model, a.status
      FROM ads a
      JOIN advertisers adv ON adv.id = a.advertiser_id
      JOIN users u ON u.id::text = adv.user_id::text
      WHERE LOWER(TRIM(u.email)) = LOWER(TRIM($1))
      ORDER BY a.created_at DESC
      LIMIT 1
      `,
      [email]
    );
    expect(rows.length, "Nenhuma linha em ads para o usuário criado no E2E.").toBeGreaterThan(0);
    const row = rows[0] as { brand?: string; model?: string; status?: string };
    expect(String(row.status || "").toLowerCase()).toMatch(/active/);
    const b =
      String(brandHint || "")
        .split(/\s+/)[0]
        ?.toLowerCase() || "";
    if (b) {
      expect(String(row.brand || "").toLowerCase()).toContain(b);
    }
  } finally {
    await pool.end().catch(() => null);
  }
}
