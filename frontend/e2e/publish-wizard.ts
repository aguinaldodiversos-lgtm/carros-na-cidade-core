import { expect, type Page } from "@playwright/test";

import { WIZARD_STEP_LABELS, wizardStepContainer, wizardStepHeading } from "./helpers";

/** PNG 1×1 válido para upload no passo Fotos. */
const MIN_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const WIZARD_STORAGE_KEY = "carros-na-cidade:new-ad-wizard:v1";

const E2E_DEBUG_FIPE = process.env.E2E_DEBUG_FIPE === "1";

function debugFipe(message: string) {
  if (E2E_DEBUG_FIPE) {
    console.log(`[e2e:fipe] ${message}`);
  }
}

/**
 * Seleciona a primeira opção real de um `<select>` do wizard pelo RÓTULO.
 *
 * Os campos ficam dentro de `<label>` com `<span>` de texto (associação
 * implícita), então `getByLabel` resolve. As regex são ancoradas em `^` de
 * propósito: "Modelo" não pode casar "Ano do modelo".
 *
 * Falha com o NOME do campo em vez de "timeout no nth(4)" — metade do valor de
 * um helper de E2E é o diagnóstico que ele deixa quando quebra.
 */
/**
 * Espera o wizard chegar ao passo N e confere o rótulo contra a fonte única.
 *
 * O container (`data-testid="wizard-step-container"` + `data-step`) é a âncora
 * estrutural; o rótulo é asserção de contrato, não de localização. Se o produto
 * renomear um passo, o teste diz QUAL passo mudou em vez de estourar timeout
 * procurando um H1 que não existe mais.
 */
async function aguardarPasso(page: Page, passo: number, timeout = 90_000) {
  const container = wizardStepContainer(page, passo);
  await expect(container, `o wizard não chegou ao passo ${passo}`).toBeVisible({ timeout });

  // Passos 1–4 usam o H1 do `SellWizardLayout`, alimentado por `STEP_LABELS`.
  // O passo 5 é a tela de conversão (`StepReview`): ela traz um H1 PRÓPRIO
  // ("Seu anúncio está quase no ar") em vez do rótulo do progresso, porque o
  // objetivo ali é converter, não rotular a etapa. Exigir "Revisão" naquele
  // ponto seria o teste inventando um contrato que o produto nunca prometeu.
  if (passo <= 4) {
    await expect(wizardStepHeading(page, passo)).toHaveText(WIZARD_STEP_LABELS[passo - 1]);
  } else {
    await expect(
      wizardStepHeading(page, passo),
      "o passo de revisão precisa ter um H1 próprio"
    ).toBeVisible();
  }
}

/**
 * Clica num botão-etiqueta se ele existir.
 *
 * Opcionais e condições são conteúdo editorial: a lista muda com o catálogo, e
 * o fluxo de publicação não depende de nenhum item específico. Exigir
 * "Ar-condicionado" faria o caminho crítico reprovar por causa de uma mudança
 * de catálogo — ruído com cara de defeito.
 */
async function clicarSeExistir(page: Page, nome: string) {
  const botao = page.getByRole("button", { name: nome, exact: true }).first();
  if (await botao.isVisible().catch(() => false)) {
    await botao.click();
  } else {
    debugFipe(`opção "${nome}" ausente no passo de descrição — seguindo sem ela`);
  }
}

async function selecionarPorRotulo(
  page: Page,
  rotulo: RegExp,
  nomeLegivel: string,
  timeout = 30_000
) {
  const campo = page.getByLabel(rotulo).first();
  await expect(campo, `campo "${nomeLegivel}" não apareceu no passo 1 do wizard`).toBeVisible({
    timeout,
  });

  // Os campos do passo 1 são EM CASCATA: Marca → Modelo → Versão → Anos →
  // Combustível. Escolher um dispara uma chamada à FIPE e só então o seguinte
  // ganha opções. Conferir a contagem uma vez só reprovava por corrida — foi
  // exatamente o que aconteceu com "Ano do modelo", que só popula depois de a
  // Versão ser escolhida.
  await expect
    .poll(async () => campo.locator("option").count(), {
      timeout,
      message: `campo "${nomeLegivel}" não recebeu opções (a cascata da FIPE não respondeu?)`,
    })
    .toBeGreaterThan(1);

  await campo.selectOption({ index: 1 });
}

function waitForResponseSafe(
  page: Page,
  predicate: Parameters<Page["waitForResponse"]>[0],
  timeout = 90_000
) {
  return page.waitForResponse(predicate, { timeout }).catch(() => null);
}

function isFipeResponse(url: string, fragment: string) {
  return url.includes(fragment);
}

async function selectHasOptions(page: Page, index: number, minimum = 2) {
  return page.evaluate(
    ({ index: selectIndex, minimumOptions }) => {
      const select = document.querySelectorAll("main select")[selectIndex];
      return Boolean(select && select.querySelectorAll("option").length >= minimumOptions);
    },
    { index, minimumOptions: minimum }
  );
}

async function waitForSelectOptions(page: Page, index: number, minimum = 2, timeout = 90_000) {
  await page.waitForFunction(
    ({ index: selectIndex, minimumOptions }) => {
      const select = document.querySelectorAll("main select")[selectIndex];
      return Boolean(select && select.querySelectorAll("option").length >= minimumOptions);
    },
    { index, minimumOptions: minimum },
    { timeout }
  );
}

async function safeApiJson(response: Awaited<ReturnType<Page["waitForResponse"]>>) {
  if (!response) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractPublishedSlug(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const root = payload as Record<string, unknown>;
  const result =
    root.result && typeof root.result === "object"
      ? (root.result as Record<string, unknown>)
      : root;
  const nested =
    result.ad && typeof result.ad === "object"
      ? (result.ad as Record<string, unknown>)
      : result.data && typeof result.data === "object"
        ? (result.data as Record<string, unknown>)
        : result;

  const slug = nested.slug;
  return typeof slug === "string" && slug.trim() ? slug.trim() : null;
}

export type PublishWizardResult = {
  brandLabel: string;
  modelLabel: string;
  publishedSlug: string | null;
};

export type PublishWizardPhoto = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

export type RunPublishWizardOptions = {
  /** Se true, não navega de novo — use após `completePendingProfileIfNeeded` na mesma URL. */
  skipInitialNavigation?: boolean;
  photos?: PublishWizardPhoto[];
};

/**
 * Executa o assistente `/anunciar/novo` até Publicar (alinhado a `10-login-ad-publish.spec.ts`).
 */
export async function runPublishWizardFlow(
  page: Page,
  options?: RunPublishWizardOptions
): Promise<PublishWizardResult> {
  await page.addInitScript(
    ({ storageKey }) => {
      try {
        window.localStorage.removeItem(storageKey);
        window.sessionStorage.clear();
      } catch {
        // noop
      }
    },
    { storageKey: WIZARD_STORAGE_KEY }
  );

  await page
    .evaluate(
      ({ storageKey }) => {
        try {
          window.localStorage.removeItem(storageKey);
          window.sessionStorage.clear();
        } catch {
          // noop
        }
      },
      { storageKey: WIZARD_STORAGE_KEY }
    )
    .catch(() => null);

  page.on("response", (response) => {
    const url = response.url();
    if (
      isFipeResponse(url, "/api/fipe/brands") ||
      isFipeResponse(url, "/api/fipe/models") ||
      isFipeResponse(url, "/api/fipe/years") ||
      isFipeResponse(url, "/api/fipe/quote")
    ) {
      debugFipe(`${response.request().method()} ${url} -> ${response.status()}`);
    }
  });

  const brandsResponsePromise = waitForResponseSafe(
    page,
    (r) => r.request().method() === "GET" && r.url().includes("/api/fipe/brands") && r.ok()
  );

  if (!options?.skipInitialNavigation) {
    await page.goto("/anunciar/novo?tipo=particular&step=1", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  }
  // O passo 1 é identificado pelo container + data-step; o texto do H1 vem de
  // STEP_LABELS e já mudou uma vez, quebrando toda a suíte de publicação.
  await expect(wizardStepContainer(page, 1)).toBeVisible();
  await expect(wizardStepHeading(page, 1)).toHaveText(WIZARD_STEP_LABELS[0]);

  const selects = page.locator("main select");
  await selects.nth(0).waitFor({ state: "visible", timeout: 60_000 });
  if (!(await selectHasOptions(page, 0))) {
    debugFipe("aguardando brands após mount do wizard");
    await brandsResponsePromise.catch(() => null);
    await waitForSelectOptions(page, 0);
  }

  let brandPicked = false;
  const brandCount = await selects.nth(0).locator("option").count();
  for (let bi = 1; bi < Math.min(brandCount, 12); bi += 1) {
    const modelsResponsePromise = waitForResponseSafe(
      page,
      (r) => r.request().method() === "GET" && r.url().includes("/api/fipe/models") && r.ok()
    );
    await selects.nth(0).selectOption({ index: bi });
    if (!(await selectHasOptions(page, 1))) {
      await modelsResponsePromise.catch(() => null);
      await waitForSelectOptions(page, 1, 2, 30_000);
    }
    const modelOpts = await selects.nth(1).locator("option").count();
    if (modelOpts > 1) {
      brandPicked = true;
      break;
    }
  }
  expect(
    brandPicked,
    "Nenhuma marca retornou modelos da FIPE (configure API ou ambiente)."
  ).toBeTruthy();

  const brandLabel = (await selects.nth(0).locator("option:checked").textContent())?.trim() || "";

  const yearsResponsePromise = waitForResponseSafe(
    page,
    (r) => r.request().method() === "GET" && r.url().includes("/api/fipe/years") && r.ok()
  );
  await selects.nth(1).selectOption({ index: 1 });

  if (!(await selectHasOptions(page, 2))) {
    await yearsResponsePromise.catch(() => null);
    await waitForSelectOptions(page, 2);
  }

  await page.waitForTimeout(400);

  const modelLabel = (await selects.nth(1).locator("option:checked").textContent())?.trim() || "";

  // ── De índice para RÓTULO ───────────────────────────────────────────────
  //
  // Este bloco preenchia os campos por posição (`allSelects.nth(2..5)`), o que
  // quebra sempre que o formulário ganha um campo. Foi o que aconteceu: a Fase B
  // acrescentou Cor, Câmbio e Carroceria como obrigatórios, os índices
  // deslizaram e o wizard parava em "Selecione a cor." — o teste ficava 2
  // minutos preenchendo os campos errados e reprovava sem dizer o porquê.
  //
  // Rótulo é o que o usuário enxerga e o que o produto promete; posição é
  // detalhe de layout. Um campo novo agora não invalida os outros.
  await selecionarPorRotulo(page, /^Versão/, "Versão");
  await selecionarPorRotulo(page, /^Ano do modelo/, "Ano do modelo");

  const quoteResponsePromise = waitForResponseSafe(
    page,
    (r) => r.request().method() === "GET" && r.url().includes("/api/fipe/quote") && r.ok()
  );
  await selecionarPorRotulo(page, /^Ano de fabricação/, "Ano de fabricação");
  await selecionarPorRotulo(page, /^Combustível/, "Combustível / Ano FIPE");
  await quoteResponsePromise.catch(() => null);

  // Obrigatórios desde a Fase B — sem eles o passo 1 não avança.
  await selecionarPorRotulo(page, /^Cor/, "Cor");
  await selecionarPorRotulo(page, /^Câmbio/, "Câmbio");
  await selecionarPorRotulo(page, /^Carroceria/, "Carroceria");

  await page.getByRole("button", { name: /Continuar/i }).click();

  // ── O wizard tem CINCO passos, não sete ────────────────────────────────
  //
  // Este helper dirigia um fluxo que não existe mais: esperava os H1
  // "Informações do anúncio", "Opcionais", "Condições", "Destaque" e
  // "Finalização". A Fase do StepReview fundiu Destaque + Finalização numa
  // única tela de revisão (`StepReview` substituiu `StepFinalize` +
  // `StepHighlight`, ambos mortos), e os rótulos passaram a vir de
  // `STEP_LABELS = ["Veículo", "Preço", "Fotos", "Descrição", "Revisão"]`.
  //
  // Como o CI nunca executou estes specs, o helper apodreceu em silêncio e as
  // CINCO suítes de publicação ficaram vermelhas. A partir daqui as transições
  // são ancoradas em `data-step`, que é estrutural, e o rótulo é conferido
  // contra a fonte única — se o produto renomear um passo, o teste diz qual.
  await aguardarPasso(page, 2);
  await page.getByLabel(/Quilometragem/i).fill("45000");
  await page.getByLabel(/^Preço/i).fill("8500000");
  await page.getByRole("button", { name: /Continuar/i }).click();

  await aguardarPasso(page, 3);
  const photos =
    options?.photos && options.photos.length > 0
      ? options.photos
      : [
          {
            name: "e2e.png",
            mimeType: "image/png",
            buffer: Buffer.from(MIN_PNG_BASE64, "base64"),
          },
        ];

  const uploadResponsePromise = waitForResponseSafe(
    page,
    (r) =>
      r.request().method() === "POST" &&
      r.url().includes("/api/painel/anuncios/upload-draft-photos"),
    120_000
  );

  await page.locator('input[type="file"]').setInputFiles(
    photos.map((photo) => ({
      name: photo.name,
      mimeType: photo.mimeType,
      buffer: photo.buffer,
    }))
  );

  // O upload é ASSÍNCRONO. Clicar em "Continuar" logo após `setInputFiles`
  // chegava antes de `draftPhotoUrls` ser preenchido: o passo recusava com
  // "Adicione pelo menos uma foto." — corretamente — e o teste ficava travado
  // no passo 3 enquanto a miniatura aparecia atrás do aviso.
  //
  // Não é defeito de produto: o wizard estava certo em recusar. O que faltava
  // era o teste esperar o que o próprio produto promete ("Suas fotos estão
  // salvas no servidor"). Esperamos a resposta E a miniatura, porque a resposta
  // sozinha não garante que o estado do React já assentou.
  await uploadResponsePromise.catch(() => null);
  await expect(
    page.getByRole("button", { name: /^Remover$/i }).first(),
    "a foto enviada não apareceu no grid do passo Fotos"
  ).toBeVisible({ timeout: 120_000 });

  await page.getByRole("button", { name: /Continuar/i }).click();

  // Passo 4 — "Descrição": opcionais + condição, numa tela só.
  await aguardarPasso(page, 4);
  await clicarSeExistir(page, "Ar-condicionado");
  await clicarSeExistir(page, "IPVA pago");
  await page.getByRole("button", { name: /Continuar/i }).click();

  // Passo 5 — "Revisão": localização, termos e publicação, tudo aqui.
  await aguardarPasso(page, 5);

  await page
    .locator("label")
    .filter({ hasText: /Estado \(UF\)/i })
    .locator("select")
    .selectOption("SP");

  const selectedCityBanner = page.locator("text=(selecionada na base)").first();
  if (await selectedCityBanner.isVisible().catch(() => false)) {
    debugFipe("cidade já resolvida no wizard; reutilizando seleção existente");
  } else {
    const citySearchResponsePromise = waitForResponseSafe(
      page,
      (r) => r.request().method() === "GET" && r.url().includes("/api/painel/cidades/search")
    );
    const cityInput = page.getByPlaceholder("Digite ao menos 2 letras e escolha na lista");
    await cityInput.fill("Atibaia");
    const citySearchResponse = await citySearchResponsePromise.catch(() => null);
    if (citySearchResponse && !citySearchResponse.ok()) {
      const errText = await citySearchResponse.text();
      throw new Error(
        `GET /api/painel/cidades/search falhou: HTTP ${citySearchResponse.status()} — ${errText.slice(0, 500)}`
      );
    }
    await page
      .getByRole("button", { name: /^Atibaia$/i })
      .first()
      .waitFor({ state: "visible", timeout: 90_000 });
    await page
      .getByRole("button", { name: /^Atibaia$/i })
      .first()
      .click();
  }

  // Os campos de telefone/WhatsApp NÃO existem mais no wizard: eram do antigo
  // `StepFinalize`. O contato passou a vir do perfil do anunciante, coletado no
  // gate de documento (`profile-phone` / `profile-whatsapp`). Preenchê-los aqui
  // travava o teste esperando um placeholder que o produto não renderiza.
  await page
    .getByRole("checkbox", { name: /informações são verdadeiras|autorizo a publicação/i })
    .check();

  const publishResponsePromise = waitForResponseSafe(
    page,
    (r) => r.url().includes("/api/painel/anuncios") && r.request().method() === "POST",
    120_000
  );

  // `data-testid="review-primary-cta"` é a CTA principal do StepReview. O
  // rótulo dela muda conforme o card comercial selecionado ("Publicar grátis",
  // "Publicar com destaque"…), então casar por texto voltaria a apodrecer.
  await page.getByTestId("review-primary-cta").click();

  const publishRes = await publishResponsePromise;
  if (!publishRes) {
    throw new Error("POST /api/painel/anuncios não foi observado pelo Playwright.");
  }
  if (!publishRes.ok()) {
    const errText = await publishRes.text();
    throw new Error(
      `POST /api/painel/anuncios falhou: HTTP ${publishRes.status()} — ${errText.slice(0, 900)}`
    );
  }

  const publishPayload = await safeApiJson(publishRes);
  const publishedSlug = extractPublishedSlug(publishPayload);

  const bodyText = (await page.textContent("body")) ?? "";
  const published =
    bodyText.includes("sucesso") ||
    bodyText.includes("enviado") ||
    bodyText.includes("Publicando") ||
    bodyText.includes("Anúncio enviado");
  expect(
    published,
    `Feedback de publicação ausente ou inesperado: ${bodyText.slice(0, 800)}`
  ).toBeTruthy();

  return {
    brandLabel: brandLabel.replace(/\s+/g, " ").trim(),
    modelLabel: modelLabel.replace(/\s+/g, " ").trim(),
    publishedSlug,
  };
}
