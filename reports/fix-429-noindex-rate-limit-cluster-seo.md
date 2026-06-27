# Fix — 429/noindex em páginas SEO cidade+marca+modelo (rate limit)

**Data:** 2026-06-26
**Escopo:** SEO técnico, API pública, rate limit, regra de robots. **Sem alteração de layout/cards/header/footer. Sem rota nova. Sitemap não ativado. Mercado Pago/fluxo de anúncio intocados.**

---

## 1. Sintoma

`https://www.carrosnacidade.com/cidade/atibaia-sp/marca/fiat/modelo/argo-drive-1-0-6v-flex` (1 anúncio ativo) renderiza:

```html
<meta name="robots" content="noindex, follow"/>
<link rel="canonical" href="https://www.carrosnacidade.com/cidade/atibaia-sp/marca/fiat/modelo/argo-drive-1-0-6v-flex"/>
```

O canonical é **self** (correto) — e isso é a primeira pista: `noindex,follow` + canonical self é exatamente a assinatura do `buildEmptyTerritorialPayload` (fallback do frontend introduzido na fase anterior). Ou seja: **o frontend caiu no fallback de erro**, não numa regra de robots por estoque.

---

## 2. Causa raiz (comprovada empiricamente)

O endpoint público que alimenta a página por SSR está sendo **rate-limited (429)** quando a chamada **não é reconhecida como interna autenticada**.

### 2.1 O backend, em si, está correto

Com User-Agent de navegador/Googlebot/interno, o endpoint retorna **200 + dados corretos**:

```
curl -A "Mozilla/5.0" .../api/public/cities/atibaia-sp/brand/fiat/model/argo-drive-1-0-6v-flex
→ seo.robots = "index,follow", activeCount = 1, indexable = true, hasActiveInventory = true
```

(O `curl` "pelado" do smoke original deu 429 porque o UA `curl/` está na blocklist do `bot-blocker` — **red herring**, não é o caminho do SSR.)

### 2.2 O que derruba o SSR: `publicCitiesRateLimit` (30/min)

`app.js:269` monta `publicCitiesRateLimit` em **todo** `/api/public/cities/*`:

```js
app.use("/api/public/cities", publicCitiesRateLimit); // 30 req/min por IP
```

Esse limiter (e o global de 1000/15min) só **pulam** (`skip`) requisições **internas autenticadas** = par **UA `cnc-internal/1.0` + `X-Internal-Token` batendo** com o `INTERNAL_API_TOKEN` do backend (`timingSafeEqual`, ver `bot-blocker.middleware.js` + `rateLimit.middleware.js#skipIfAuthenticatedInternal`).

**Prova empírica** — burst de 36 GETs com UA `cnc-internal/1.0` **sem token**, IP fixo:

```
200 ×30, depois 429 ×6
```

Exatamente 30 e corta. O 429 carrega `X-Robots-Tag: noindex, nofollow, noarchive` e corpo `{"error":"rate_limited"}`.

### 2.3 A cadeia completa

```
SSR do Next chama /api/public/cities/.../model/...
  → request NÃO autenticado como interno (UA cnc-internal/1.0 SEM X-Internal-Token válido)
  → cai no publicCitiesRateLimit (30/min por IP)
  → sob crawl/tráfego, estoura → HTTP 429
  → ssrResilientFetch retorna !ok
  → fetchTerritorialPage → buildEmptyTerritorialPayload(..., "backend_unavailable")
  → seo.robots = "noindex,follow" + canonical self
  → página renderiza noindex,follow  ❌ (apesar de activeCount = 1)
```

**Por que o SSR não autentica?** Porque o `INTERNAL_API_TOKEN` do **frontend** (Render) está ausente ou diferente do backend. O contrato está documentado em `frontend/env.local.example`: *"INTERNAL_API_TOKEN — Deve ser idêntico ao INTERNAL_API_TOKEN no backend. Em prod, todo fetch SSR/BFF…"*. Sem o par UA+token batendo, o frontend é tratado como tráfego externo qualquer e entra no cap de 30/min.

**Não era Cloudflare nem Render** — o corpo `{"error":"rate_limited"}` e o cap exato de 30 são do nosso middleware Express (`src/shared/middlewares/rateLimit.middleware.js`).

---

## 3. Correção

A causa raiz tem **duas alavancas**: uma de **operação** (token) e uma de **código** (cap agressivo demais). Apliquei a de código; a de operação requer ação no Render.

### 3.1 Código (entregue neste PR) — cap razoável e tunável

`publicCitiesRateLimit` subiu de **30/min → 200/min** (≈3,3 req/s por IP real), tunável por env `RATE_LIMIT_PUBLIC_CITIES_MAX`. Estas são *money pages* SEO servidas por SSR + cache de 60s no BFF; 30/min era herança do fix de bandwidth (2026-05-14) e fragilizava a indexação:

- **Per-visitante:** Googlebot/usuário crawleando rápido a partir de um IP não estoura mais 200/min; antes 30/min era trivial de exceder.
- **Defesa mantida:** scraping sustentado (>3,3 req/s por IP) ainda é cortado; o `skip` interno autenticado e o `bot-blocker` continuam intactos. **Nenhum bypass inseguro aberto** (não relaxei o `skip` para UA-only — exigir o token continua sendo a barreira).

`src/shared/middlewares/rateLimit.middleware.js`:
- novo helper exportado `resolvePerMinuteMax(rawEnv, fallback, cap)` (saneia env, cap defensivo 5000);
- `publicCitiesRateLimit = buildPerMinuteLimit("public-cities", resolvePerMinuteMax(process.env.RATE_LIMIT_PUBLIC_CITIES_MAX, 200))`.

`.env.example`: documenta `RATE_LIMIT_PUBLIC_CITIES_MAX=200`.

### 3.2 Operação (AÇÃO NECESSÁRIA, fora do código) — sincronizar o token

**Definir `INTERNAL_API_TOKEN` idêntico nos dois serviços Render (frontend e backend).** Com o par UA+token batendo, **todo SSR pula 100% dos rate limits** (comportamento projetado) e o 429 nunca atinge o SSR — independentemente do cap. Esta é a correção definitiva da causa raiz.

Como confirmar que o token está errado/ausente hoje (Render → Logs do serviço):
- frontend: `[internal-backend-headers] INTERNAL_API_TOKEN ausente em producao…`
- backend: `[bot-blocker] UA cnc-internal/1.0 recebido SEM X-Internal-Token valido em producao…`

> Não alterei nenhuma env de produção (não tenho acesso). O cap de código reduz o raio de impacto, mas o token é o que garante SSR 200 sob qualquer volume.

### 3.3 O fallback do frontend está correto — e foi mantido

`buildEmptyTerritorialPayload` (noindex,follow + canonical self em erro/429) é o comportamento certo para **erro real**. O problema nunca foi o fallback; foi o 429 ocorrer em SSR legítimo. Não mexi na regra de robots do frontend.

---

## 4. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/shared/middlewares/rateLimit.middleware.js` | + `resolvePerMinuteMax`; `publicCitiesRateLimit` 30→200/min tunável (`RATE_LIMIT_PUBLIC_CITIES_MAX`) |
| `src/shared/middlewares/rateLimit.resolve.test.js` | **novo** — testes do resolver |
| `.env.example` | + `RATE_LIMIT_PUBLIC_CITIES_MAX=200` documentado |

**Layout/cards/header/footer:** intocados. **Nenhuma rota nova. Sitemap não ativado.**

---

## 5. Testes

```
npx vitest run src/shared           → 32 passed (inclui 4 novos do resolver)
npx eslint <arquivos>               → OK
npx prettier --check <arquivos JS>  → OK
```

Cobertura de regressão já existente (fase anterior, continua verde) cobre os itens 6.B–6.F do briefing:
- `territorial-cluster.logic.test.js`: payload com `activeCount>=1` → `index,follow`, `indexable:true`, `hasActiveInventory:true`; `activeCount=0` → `noindex,follow`, fora do sitemap.
- `territorial-seo.test.ts`: `shouldIndexTerritorialPage` → `index,follow` para payload válido; `noindex` para fallback/sem estoque/`noindexReason`.
- `territorial-public.test.ts`: fallback 429/erro → `noindex,follow` + canonical self (nunca `/`).
- `territorial-inventory-sitemap.test.js`: só combinações com estoque ativo entram no sitemap.

---

## 6. Smoke (pós-deploy + token sincronizado)

```bash
# A. Endpoint público — esperado 200 JSON (browser/Googlebot/interno)
curl -sSI -A "Mozilla/5.0" \
  "https://carros-na-cidade-core.onrender.com/api/public/cities/atibaia-sp/brand/fiat/model/argo-drive-1-0-6v-flex"
# esperado: HTTP/2 200 ; NÃO esperado: 429 {"error":"rate_limited"}

# B. Página com estoque — esperado index,follow + canonical self
curl -sSL -A "Mozilla/5.0" \
  "https://www.carrosnacidade.com/cidade/atibaia-sp/marca/fiat/modelo/argo-drive-1-0-6v-flex" \
  | grep -oE '<meta name="robots"[^>]*>|<link rel="canonical"[^>]*>'
# esperado:
#   <meta name="robots" content="index, follow"/>
#   <link rel="canonical" href="https://www.carrosnacidade.com/cidade/atibaia-sp/marca/fiat/modelo/argo-drive-1-0-6v-flex"/>

# C. Página SEM estoque — esperado noindex,follow ou 404 (nunca index; canonical ≠ home)
curl -sSL -A "Mozilla/5.0" \
  "https://www.carrosnacidade.com/cidade/atibaia-sp/marca/ferrari/modelo/enzo" \
  | grep -oE '<meta name="robots"[^>]*>|<link rel="canonical"[^>]*>'

# D. Verificar que o cap não derruba crawl legítimo (burst > 30, < 200, mesmo IP)
#    Deve permanecer 200 (antes virava 429 no 31º).
```

> Nota sobre o `curl` direto: com UA `curl/` o `bot-blocker` (se `BAD_BOTS_BLOCKED=true`) devolve 429 — é esperado e não reflete o caminho do SSR. Use `-A "Mozilla/5.0"` para reproduzir tráfego de navegador/Googlebot.

---

## 7. Riscos remanescentes

1. **O cap (3.1) sozinho não garante index se o `INTERNAL_API_TOKEN` estiver dessincronizado e o SSR colapsar todo o tráfego no IP do container** (sem `X-Cnc-Client-Ip` por-visitante). A correção definitiva é **sincronizar o token (3.2)** — então o SSR pula o limite por completo. Recomendação: aplicar 3.2 e 3.1 juntos.
2. **Se o token vazar**, um atacante pula os rate limits (risco já aceito e documentado no projeto; mitigação: token sem prefixo `NEXT_PUBLIC_*`, rotação, `timingSafeEqual`).
3. **`SITEMAP_PUBLIC_ENABLED=false`** segue inalterado (fora de escopo): `brands.xml`/`models.xml` ainda servem vazio até ligar a flag.
4. **Next data-cache (`revalidate:60`)** pode segurar um 429 cacheado por até 60s após o deploy/token; a página normaliza sozinha na próxima revalidação.

---

## 8. Critério de aprovação

Atendido quando, com o token sincronizado e o cap deployado:
- `/api/public/cities/.../model/...` → **200 JSON** para navegador/Googlebot/SSR;
- a página com estoque → **`index, follow` + canonical self**;
- a página sem estoque → **`noindex,follow` ou 404**, canonical nunca = home;
- **sem alteração de layout**.

A parte de código está pronta e testada; a parte de operação (token) precisa ser aplicada no Render.
