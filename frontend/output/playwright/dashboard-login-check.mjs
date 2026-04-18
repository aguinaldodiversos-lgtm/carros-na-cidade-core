import { chromium } from "playwright";

const stamp = new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, "")
  .slice(0, 14);
const email = `codex.dashboard.${stamp}@example.com`;
const password = `Probe_${stamp}_Aa1!`;
const backend = "https://carros-na-cidade-core.onrender.com";
const base = "http://127.0.0.1:3000";

function safe(data) {
  return {
    user_email: data?.user?.email || null,
    user_type: data?.user?.type || null,
    redirect_to: data?.redirect_to || null,
    error: data?.error || null,
    message: data?.message || null,
    hasAccess: Boolean(
      data?.accessToken ||
        data?.access_token ||
        data?.token ||
        data?.data?.accessToken ||
        data?.data?.access_token ||
        data?.data?.token
    ),
    hasRefresh: Boolean(
      data?.refreshToken ||
        data?.refresh_token ||
        data?.data?.refreshToken ||
        data?.data?.refresh_token
    ),
  };
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // noop
  }
  return { status: res.status, ok: res.ok, data };
}

const reg = await postJson(`${backend}/api/auth/register`, {
  email,
  password,
  name: "Codex Dashboard Probe",
});
console.log("REGISTER", JSON.stringify({ status: reg.status, body: safe(reg.data) }));
if (!reg.ok && !/cadastrado/i.test(JSON.stringify(reg.data))) {
  throw new Error(`register failed ${reg.status}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
const responses = [];
const loginRequests = [];

page.on("request", (request) => {
  if (request.url().includes("/api/auth/login") && request.method() === "POST") {
    let parsed = {};
    try {
      parsed = JSON.parse(request.postData() || "{}");
    } catch {
      // noop
    }
    loginRequests.push({
      url: request.url(),
      method: request.method(),
      body: {
        email: parsed.email || null,
        passwordPresent: Boolean(parsed.password),
        next: parsed.next || null,
      },
    });
  }
});

page.on("response", (response) => {
  const url = response.url();
  if (
    url.includes("/api/auth/login") ||
    url.includes("/api/dashboard/me") ||
    url.includes("/dashboard")
  ) {
    responses.push({
      url,
      status: response.status(),
      method: response.request().method(),
    });
  }
});

await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector('[data-testid="login-email"]', { timeout: 120000, state: "visible" });
await page.waitForTimeout(1500);

const emailInput = page.locator('[data-testid="login-email"]');
const passInput = page.locator('[data-testid="login-password"]');
await emailInput.click();
await emailInput.fill("");
await page.keyboard.type(email, { delay: 5 });
await passInput.click();
await passInput.fill("");
await page.keyboard.type(password, { delay: 5 });

console.log(
  "FORM_VALUES",
  JSON.stringify({
    emailValue: await emailInput.inputValue(),
    passwordLength: (await passInput.inputValue()).length,
  })
);

const loginRespPromise = page.waitForResponse(
  (response) =>
    response.url().includes("/api/auth/login") && response.request().method() === "POST",
  { timeout: 120000 }
);
await page.locator('[data-testid="login-submit"]').click();
const loginResp = await loginRespPromise;
let loginJson = {};
try {
  loginJson = await loginResp.json();
} catch {
  // noop
}

console.log("LOGIN_REQUESTS", JSON.stringify(loginRequests));
console.log(
  "LOGIN_RESPONSE",
  JSON.stringify({ status: loginResp.status(), body: safe(loginJson) })
);

await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 120000 });

let dashboardLoaded = false;
let dashboardErrorText = "";
try {
  await page.waitForSelector('[data-testid="dashboard-content"]', {
    timeout: 120000,
    state: "visible",
  });
  dashboardLoaded = true;
} catch {
  const body = await page
    .locator("body")
    .innerText({ timeout: 5000 })
    .catch(() => "");
  dashboardErrorText =
    body.match(
      /Painel indisponivel|Nao foi possivel carregar seu painel agora|Acesso negado|Erro interno[^\n]*/i
    )?.[0] || body.slice(0, 300);
}

const cookies = await page.context().cookies(base);
const cookieNames = cookies
  .map((cookie) => cookie.name)
  .filter((name) => name.startsWith("cnc_"))
  .sort();
const headerLoginCount = await page
  .getByRole("link", { name: "Entrar" })
  .count()
  .catch(() => -1);
const minhaContaCount = await page
  .getByRole("link", { name: /Minha conta|Conta/ })
  .count()
  .catch(() => -1);
const bodyText = await page
  .locator("body")
  .innerText({ timeout: 10000 })
  .catch(() => "");
const greeting = (bodyText.match(/Ol[aá],\s*[^!]+!/i) || [""])[0];

await page.screenshot({ path: "output/playwright/dashboard-login-check.png", fullPage: true });

console.log(
  "DASHBOARD",
  JSON.stringify({
    url: page.url(),
    dashboardLoaded,
    dashboardErrorText,
    greeting,
    cookieNames,
    headerLoginCount,
    minhaContaCount,
    screenshot: "output/playwright/dashboard-login-check.png",
    responses,
  })
);

await browser.close();
