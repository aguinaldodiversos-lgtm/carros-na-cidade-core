# Homologação Automatizada Pré-Lançamento — Carros na Cidade

> Execução: 2026-09-06 · Escopo: auditoria de cobertura, implementação das lacunas P0 automatizáveis e execução da bateria.
> **Nenhum código funcional de produto foi alterado.** `git diff --stat` sobre arquivos versionados: vazio.

---

## 1. Ambiente

| Item              | Valor                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Commit testado    | `7ee7599cb5823e82943e9a119f9af53da318be94`                                                                                |
| Branch            | `feat/catalogo-shell-largo-comprar`                                                                                       |
| Node              | v25.9.0 — **acima do `engines` do repo (`>=20 <21`)** — todas as suítes rodaram sem erro de runtime, mas o CI usa Node 20 |
| npm               | 11.12.1                                                                                                                   |
| Postgres          | 15.17 (Docker, `docker-compose.test.yml`, porta 5433)                                                                     |
| Backend (Express) | `http://127.0.0.1:4000` — `npm run dev` contra o Postgres de teste                                                        |
| Frontend (Next)   | `http://127.0.0.1:3000` — `next dev`, Next 14.2.35                                                                        |
| Playwright        | 1.49.1 (chromium)                                                                                                         |
| Vitest            | 2.1.9                                                                                                                     |
| Banco             | `carros_na_cidade_test` — migrations + `scripts/e2e-seed.mjs`                                                             |

**Variáveis relevantes (sem segredos):**

- `DATABASE_URL` / `TEST_DATABASE_URL` → `postgresql://postgres:***@localhost:5433/carros_na_cidade_test`
- `NEXT_PUBLIC_API_URL` / `BACKEND_API_URL` / `AUTH_API_BASE_URL` / `API_URL` → `http://127.0.0.1:4000`
- `DISABLE_REDIS=true`, `RUN_WORKERS=false`, `RUN_MIGRATIONS=false`, `PG_SSL_ENABLED=false`
- `MP_ACCESS_TOKEN` — **ausente** no runtime; presente apenas como valor fictício dentro do teste de integração de pagamentos, para forçar o caminho de produção com `fetch` substituído por duplo. Nenhuma chamada real ao Mercado Pago.
- `AUTH_SESSION_SECRET` — **deliberadamente não definido** (ver §6, BUG-AMB-01)
- `SITEMAP_PUBLIC_ENABLED` — não definido (default `false`; ver §6, BUG-AMB-02)

### Alerta de segurança de ambiente (não é bug de produto)

`frontend/.env.local` aponta `AUTH_API_BASE_URL`, `BACKEND_API_URL`, `API_URL` e `NEXT_PUBLIC_API_URL` para
**`https://carros-na-cidade-core.onrender.com` (produção)**. Qualquer `npm run dev` no frontend sem override
explícito faz a suíte E2E — que cadastra usuários e publica anúncios — rodar **contra a API de produção**.

Nesta homologação as quatro variáveis foram sobrescritas no comando de start e a rota foi **verificada por
evidência**, não por suposição: uma requisição a `/comprar` no Next produziu 74 novas linhas no log da API
local, com `path: "/api/ads/search…"`. Produção não recebeu tráfego de escrita.

**Recomendação (fora do escopo desta tarefa):** documentar em `docs/testing/e2e.md` que o `.env.local` local
precisa apontar para `127.0.0.1:4000`, ou adicionar um guard que recuse rodar E2E contra host não-local.

---

## 2. Cobertura encontrada (Fase 0 — inventário)

### 2.1 O que já existia

| Camada                   | Arquivos | Testes                             | Comando oficial                                |
| ------------------------ | -------- | ---------------------------------- | ---------------------------------------------- |
| Unit backend (Vitest)    | 223      | 3.646 (1 skip condicional)         | `npm test` / `npm run test:coverage`           |
| Unit/route frontend      | 229      | 3.582                              | `npm run test:frontend`                        |
| Integração (Postgres)    | 21       | 336                                | `npm run test:integration:ads` (só 1 arquivo)  |
| E2E (Playwright)         | 37 specs | 267                                | `npm run e2e`, `npm run e2e:smoke`             |
| Smoke (backend)          | —        | 14 checagens                       | `npm run smoke` (BASE_URL)                     |
| Smoke (contrato público) | —        | ~60 checagens                      | `node scripts/smoke/public-contract-smoke.mjs` |
| Auditorias estáticas     | —        | links/assets/rotas/env/integridade | `npm run audit:project`, `audit:integrity`     |

**Skips estáticos:** apenas 1 (`seo-jsonld.spec.ts` — depende de `VEHICLE_SLUG_FOR_E2E`).
**Skips condicionais em runtime:** 30 ocorrências, todas guardadas por disponibilidade de ambiente
(backend sem estoque, credenciais ausentes, rate limit) — nenhuma usada para mascarar defeito.

### 2.2 Descobertas estruturais da auditoria

1. **`src/modules/auth/` não tinha nenhum teste.** Todo o Grupo A e B dependia de testes do BFF do Next
   (que provam o _repasse_ do status) e de validadores de dígito verificador — nada cobria quem decide
   400/401, quem normaliza e-mail, quem impede o documento duplicado.
2. **O CI roda 1 dos 21 arquivos de integração.** `ci:integration-ads` aponta só para
   `ads-pipeline.integration.test.js`. Os outros 20 nunca são executados na pipeline — e 6 estão quebrados
   há tempo indeterminado (§6, BUG-INT-01).
3. **`/tabela-fipe` e `/simulador-financiamento` não tinham teste de rota.** O helper
   `buildPublicRedirectUrl` era testado puro; a rota que precisa chamá-lo, não. Função pura verde não prova
   alcance.
4. **O cálculo do simulador não tinha teste nenhum.** É a única promessa numérica que o portal faz ao
   visitante, e a fórmula já esteve triplicada com três taxas divergentes no passado.
5. **Favoritos: só o botão era testado, nunca o comportamento.** `AdCard.test.tsx` prova que o botão é
   renderizado; a persistência (o contrato inteiro da funcionalidade, já que é 100% `localStorage`) estava
   descoberta.
6. **A idempotência do webhook de boost estava declarada como não coberta.** O cabeçalho de
   `tests/payments/boost-7d-flow.test.js` diz textualmente que depende de "runbook em staging".
7. **`PROF-08` (timeout de serviço externo de CNPJ) não é aplicável:** `verifyDocument` é validação
   **local** de dígitos verificadores. Não existe integração com Receita/BrasilAPI no código.

---

## 3. Testes adicionados

Todos os arquivos abaixo são **novos** e contêm exclusivamente testes. Nenhum arquivo de produto foi tocado.

| Arquivo                                                                    | Camada                       | IDs cobertos                           | Motivo                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ---------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/auth/auth-service-contract.test.js`                                 | unit                         | AUTH-01, 02, 03, 04, 06                | `src/modules/auth/` sem nenhum teste; despacha o `pool` por texto de SQL para permitir asserções de **ausência** ("nenhum INSERT")                                               |
| `tests/auth/verify-document-contract.test.js`                              | integration HTTP (supertest) | PROF-01, 02, 03, 04 + AUTH-09, AUTH-12 | Sobe o router real atrás do `authMiddleware` real; prova que o 409 do documento duplicado **não grava**                                                                          |
| `tests/integration/payments-boost-webhook-idempotency.integration.test.js` | integration (Postgres real)  | PAY-02, 03, 04, 05, 06, 08, 09, 10, 11 | A guarda é `FOR UPDATE` + `!alreadyApproved`; mock de uma conexão só nunca disputa lock. Inclui **teste por mutação** provando que o cenário distingue 7 de 14 dias              |
| `frontend/app/tabela-fipe/route.test.ts`                                   | route                        | FIN-02, 03, 04, 05 (+SEO-10)           | Trava o Route Handler, não o helper — o defeito `srv-…:10000` mora na rota                                                                                                       |
| `frontend/app/simulador-financiamento/route.test.ts`                       | route                        | FIN-10                                 | A correção das duas rotas foi feita por cópia; cópia é onde uma volta a divergir                                                                                                 |
| `frontend/components/financing/FinancingSimulator.test.tsx`                | component                    | FIN-07, FIN-08                         | `calculateMonthlyPayment` é interna e **não foi exportada** (seria alterar produto); o contrato é lido por `onResultChange`, que é a mesma fonte que a página do anúncio consome |
| `frontend/lib/favorites/local-favorites.test.ts`                           | unit                         | VEH-05, 06, 07                         | "Reload" = `resetModules()` + reimport, para o módulo ter de reler o `localStorage`                                                                                              |
| `frontend/lib/admin/server-admin-session.test.ts`                          | unit                         | ADM-01, ADM-04 (shell/proxy)           | Fixa o **fail-closed** e transforma o cache de papel de 30s em contrato conhecido                                                                                                |
| `frontend/e2e/ops-viewport-overflow.spec.ts`                               | E2E                          | OPS-01, 03, 05, 06                     | Matriz transversal 7 larguras × 8 páginas; as suítes existentes cobrem 1 superfície cada e nenhuma vai a 1600/1920                                                               |
| `frontend/e2e/seo-sitemap-urls.spec.ts`                                    | E2E                          | SEO-07, SEO-10, SEO-12                 | O spec existente prova que o XML responde 200; este percorre os `<loc>`                                                                                                          |
| `frontend/e2e/session-persistence-gates.spec.ts`                           | E2E                          | AUTH-08, AUTH-11, AD-03                | Ninguém dava F5 numa página autenticada nem abria o wizard anônimo                                                                                                               |

---

## 4. Matriz final

Legenda de Status: **PASS** · **FAIL** · **NOT TESTED** · **BLOCKED** (ambiente/dados impedem) · **FLAKY** · **SKIPPED PREEXISTENTE** · **N/A** (não existe no produto).
Cobertura: **C** = já coberto antes desta homologação · **P** = parcial · **A** = ausente (coberto agora) · **—** = segue descoberto.

### Grupo A — Autenticação e sessão

| ID      | Pri | Tipo       | Cob. | Status | Spec/test                                                  | Dur. | Observação                                                                      |
| ------- | --- | ---------- | ---- | ------ | ---------------------------------------------------------- | ---- | ------------------------------------------------------------------------------- |
| AUTH-01 | P0  | unit       | A    | PASS   | `tests/auth/auth-service-contract.test.js`                 | <1s  | + hash bcrypt, senha nunca em claro                                             |
| AUTH-02 | P0  | unit       | A    | PASS   | idem                                                       | <1s  | prova ausência de INSERT                                                        |
| AUTH-03 | P0  | unit       | A    | PASS   | idem (+ leitura do BFF `api/auth/register/route.ts`)       | <1s  | fronteira 6 travada nas duas pontas                                             |
| AUTH-04 | P1  | unit       | A    | PASS   | idem                                                       | <1s  | trim+lowercase em consulta, INSERT e login                                      |
| AUTH-05 | P0  | E2E        | C    | PASS   | `full-flow.spec.ts` (API + formulário)                     | ~8s  |                                                                                 |
| AUTH-06 | P0  | unit       | A    | PASS   | `tests/auth/auth-service-contract.test.js`                 | <1s  | 401, nunca 500; conta a falha                                                   |
| AUTH-07 | P0  | E2E        | C    | PASS   | `full-flow.spec.ts` — logout                               | ~6s  |                                                                                 |
| AUTH-08 | P0  | E2E        | A    | PASS   | `session-persistence-gates.spec.ts`                        | ~15s | F5 ×1 e ×2 + rota privada pós-reload                                            |
| AUTH-09 | P0  | E2E + HTTP | C/A  | PASS   | `full-flow.spec.ts` + `verify-document-contract.test.js`   | <1s  |                                                                                 |
| AUTH-10 | P0  | route      | C    | PASS   | `app/api/dashboard/me/route.test.ts`                       | <1s  | refresh 1×, 401 final, nunca 502                                                |
| AUTH-11 | P0  | unit + E2E | C/A  | PASS   | `lib/auth/redirects.test.ts` + `session-persistence-gates` | ~6s  | agora provado APÓS o login, não só na tela                                      |
| AUTH-12 | P1  | HTTP       | A    | PASS   | `verify-document-contract.test.js`                         | <1s  | 5 vetores: adulterado, outro segredo, refresh-como-access, expirado, `alg:none` |

### Grupo B — Perfil PF/PJ

| ID      | Pri | Tipo | Cob. | Status     | Spec/test                                                         | Observação                                                                                            |
| ------- | --- | ---- | ---- | ---------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| PROF-01 | P0  | HTTP | A    | PASS       | `verify-document-contract.test.js`                                | `account_type` = `pending` para NULL e `''`                                                           |
| PROF-02 | P0  | HTTP | A    | PASS       | idem                                                              | CPF e CNPJ, com e sem máscara                                                                         |
| PROF-03 | P0  | HTTP | A    | PASS       | idem                                                              | 400 e nenhum UPDATE                                                                                   |
| PROF-04 | P0  | HTTP | A    | PASS       | idem                                                              | 409 sem gravar; escopo exclui a própria conta                                                         |
| PROF-05 | P0  | unit | C    | PASS       | `CompleteProfileGate.test.tsx` + `normalize-dashboard-payload`    | gate não reaparece com documento válido                                                               |
| PROF-06 | P0  | unit | C    | PASS       | `dealer-middleware.test.js`, `dealer-authorization-chain.test.js` |                                                                                                       |
| PROF-07 | P0  | E2E  | C    | PASS       | `dashboard-login-pf-pj.spec.ts` (registro CNPJ)                   | não depende de credencial externa                                                                     |
| PROF-08 | P1  | —    | N/A  | NOT TESTED | —                                                                 | **Não existe serviço externo de CNPJ.** `verifyDocument` é validação local de dígitos. Nada a simular |

### Grupo C — Publicação e ciclo de vida

| ID    | Pri | Tipo              | Cob. | Status  | Spec/test                                                                                                          | Observação                                                                                     |
| ----- | --- | ----------------- | ---- | ------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| AD-01 | P0  | E2E               | C    | FAIL    | `main-flow`, `10-login-ad-publish`, `20-login-ad-checkout`                                                         | **BUG-E2E-01** — ver §6                                                                        |
| AD-02 | P0  | E2E               | P    | BLOCKED | `critical-pj-flow.spec.ts` é placeholder                                                                           | publicação PJ completa nunca foi automatizada                                                  |
| AD-03 | P0  | E2E               | A    | PASS    | `session-persistence-gates.spec.ts`                                                                                | wizard anônimo → `/login?next=/anunciar…`                                                      |
| AD-04 | P0  | unit              | C    | PASS    | `resolve-initial-step.test.ts`, `wizard-state-rehydration.test.js`                                                 |                                                                                                |
| AD-05 | P0  | unit              | C    | PASS    | `wizard-step-validation.test.js`, `ads.validators.test.js`                                                         |                                                                                                |
| AD-06 | P0  | unit              | C    | PASS    | `city-resolution-publish.test.js`, `publish-supplies-explicit-city.test.js`, `advertiser-city-fail-closed.test.js` |                                                                                                |
| AD-07 | P0  | unit              | C    | PASS    | `ad-create-requires-images.test.js`                                                                                |                                                                                                |
| AD-08 | P0  | E2E + unit        | C    | PASS    | `register-minimal-to-publish.spec.ts` (png/jpg/jpeg)                                                               |                                                                                                |
| AD-09 | P1  | unit              | C    | PASS    | `direct-r2-rejeita-heic.test.ts`, `ad-upload-constants.test.js`, `image-normalizer.test.js`                        |                                                                                                |
| AD-10 | P0  | unit              | C    | PASS    | `ad-edit-status-guard.test.js`, `editable-ad-payload.test.ts`                                                      |                                                                                                |
| AD-11 | P0  | unit              | P    | PARCIAL | `photo-draft-persistence.test.js`, `upload-draft-photo-snapshots.test.ts`                                          | pipeline de upload coberto; **reordenar/remover foto de anúncio JÁ publicado segue sem teste** |
| AD-12 | P0  | unit/integration  | C    | PASS    | `ads-public-filter-only-active.test.js`, `ads-filter-builder-canonical.test.js`                                    | `status='active'` sempre no WHERE                                                              |
| AD-13 | P0  | integration + E2E | C    | FAIL    | `ad-admin-moderation.integration.test.js` (PASS) / `admin-ad-moderation.spec.ts` (FAIL)                            | **BUG-E2E-02** — ver §6                                                                        |
| AD-14 | P0  | unit              | C    | PASS    | `account-dashboard-api-isolation.test.js`, `ad-ownership.test.js`                                                  | 404 sem vazamento                                                                              |
| AD-15 | P0  | unit              | C    | PASS    | idem (DELETE escopado por `req.user.id`)                                                                           |                                                                                                |
| AD-16 | P0  | E2E + SQL         | C    | FAIL    | `assertLatestAdPersistedForEmail` em `main-flow`/`10-login-ad-publish`                                             | arrastado por BUG-E2E-01                                                                       |

### Grupo D — Catálogo, busca e filtros

| ID     | Pri | Tipo | Cob. | Status  | Spec/test                                                                            | Observação                                                                            |
| ------ | --- | ---- | ---- | ------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| CAT-01 | P0  | E2E  | C    | PASS    | `comprar-national-catalog.spec.ts` + smoke                                           |                                                                                       |
| CAT-02 | P0  | unit | C    | PASS    | `ads-public-filter-only-active.test.js`, `blocked-ad-no-public-leak.test.js`         |                                                                                       |
| CAT-03 | P0  | unit | C    | PASS    | `ads-search-url.test.ts`, `ads-filter-builder-canonical.test.js`                     |                                                                                       |
| CAT-04 | P0  | unit | C    | PASS    | idem                                                                                 |                                                                                       |
| CAT-05 | P0  | unit | C    | PASS    | `ads-filter-city-slugs.test.js`, `city-catalog-loader.test.ts`                       |                                                                                       |
| CAT-06 | P0  | unit | C    | PASS    | `ads-search-url.test.ts` (aliases price_min/max)                                     |                                                                                       |
| CAT-07 | P0  | unit | C    | PASS    | `ads-filter-builder-canonical.test.js` + `FilterSidebar.test.tsx`                    |                                                                                       |
| CAT-08 | P0  | unit | C    | PASS    | idem                                                                                 |                                                                                       |
| CAT-09 | P1  | unit | C    | PASS    | `ads-opportunity-expr.test.js` + integração `ads-opportunity` (FAIL por fixture, §6) |                                                                                       |
| CAT-10 | P1  | unit | C    | PASS    | `ads-filter-builder-canonical.test.js` — 3 WHEREs distintos                          |                                                                                       |
| CAT-11 | P1  | unit | C    | PASS    | `mergeSearchFilters` + `AppliedFilterChips.test.tsx`                                 |                                                                                       |
| CAT-12 | P1  | unit | P    | PARCIAL | `comprar/page.test.ts`, `CatalogPagination.test.tsx`                                 | URL/canônica cobertas; **ausência de duplicação/omissão entre páginas não é provada** |
| CAT-13 | P1  | unit | C    | PASS    | `ads-filter-sort.test.js`, `ads-search-url.test.ts`                                  |                                                                                       |
| CAT-14 | P0  | unit | P    | PARCIAL | `build-empty-state-copy.test.ts`                                                     | copy coberta; **render de zero resultados sem erro de runtime não tem E2E**           |

### Grupo E — Veículo, favoritos e ownership

| ID     | Pri | Tipo       | Cob. | Status | Spec/test                                                               | Observação                                                   |
| ------ | --- | ---------- | ---- | ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| VEH-01 | P0  | E2E        | C    | PASS   | `vehicle-detail-premium.spec.ts`, `publish-full-surface.spec.ts`        |                                                              |
| VEH-02 | P0  | unit       | C    | PASS   | `lib/middleware/ad-detail-gate.test.ts` (404/410/5xx)                   |                                                              |
| VEH-03 | P0  | E2E        | C    | PASS   | `register-minimal-to-publish.spec.ts` (galeria/lightbox)                |                                                              |
| VEH-04 | P1  | E2E        | C    | PASS   | `image-fallback.spec.ts`, `VehicleImage.test.tsx`                       |                                                              |
| VEH-05 | P0  | unit       | A    | PASS   | `lib/favorites/local-favorites.test.ts`                                 |                                                              |
| VEH-06 | P0  | unit       | A    | PASS   | idem                                                                    |                                                              |
| VEH-07 | P0  | unit       | A    | PASS   | idem — reload real (`resetModules` + reimport)                          |                                                              |
| VEH-08 | P0  | E2E        | C    | PASS   | `full-flow.spec.ts` + `session-persistence-gates.spec.ts`               | favoritos são locais e **não exigem login** (contrato atual) |
| VEH-09 | P0  | unit + E2E | C    | PASS   | `account-dashboard-api-isolation.test.js`, `user-isolation-api.spec.ts` |                                                              |

### Grupo F — FIPE e simulador

| ID     | Pri | Tipo      | Cob. | Status | Spec/test                                                                      | Observação                                                |
| ------ | --- | --------- | ---- | ------ | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| FIN-01 | P0  | unit      | C    | PASS   | `home/cta-url.test.ts`, `site-navigation.test.ts`                              |                                                           |
| FIN-02 | P0  | route     | A    | PASS   | `app/tabela-fipe/route.test.ts`                                                | 307, nunca 200/308                                        |
| FIN-03 | P0  | route     | A    | PASS   | idem                                                                           | cookie sem estoque **não** é obedecido                    |
| FIN-04 | P0  | route     | A    | PASS   | idem                                                                           | `Location` jamais contém `srv-`                           |
| FIN-05 | P0  | route     | A    | PASS   | idem                                                                           | fallback para origem canônica                             |
| FIN-06 | P0  | E2E       | C    | PASS   | `ops-viewport-overflow.spec.ts` (`/tabela-fipe/atibaia-sp` 200 nas 7 larguras) |                                                           |
| FIN-07 | P0  | component | A    | PASS   | `FinancingSimulator.test.tsx`                                                  | Price + monotonicidade + paridade tela↔callback          |
| FIN-08 | P1  | component | A    | PASS   | idem                                                                           | entrada 0, entrada = valor, acima do valor, tetos 5k/500k |
| FIN-09 | P1  | unit      | C    | PASS   | `lib/fipe/fipe-provider.test.ts` (snapshot estático)                           |                                                           |
| FIN-10 | P0  | route     | A    | PASS   | `app/simulador-financiamento/route.test.ts`                                    |                                                           |

### Grupo G — Mercado Pago (sem cobrança real)

| ID     | Pri | Tipo               | Cob. | Status | Spec/test                                                                   | Observação                                               |
| ------ | --- | ------------------ | ---- | ------ | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| PAY-01 | P0  | unit               | C    | PASS   | `boost-7d-flow.test.js`, `app/api/payments/boost-7d/checkout/route.test.ts` |                                                          |
| PAY-02 | P0  | unit + integration | C/A  | PASS   | idem + `payments-boost-webhook-idempotency`                                 | ownership no checkout **e** revalidada no webhook        |
| PAY-03 | P0  | integration        | A    | PASS   | `payments-boost-webhook-idempotency`                                        |                                                          |
| PAY-04 | P0  | integration        | A    | PASS   | idem                                                                        | pending não concede                                      |
| PAY-05 | P0  | integration        | A    | PASS   | idem                                                                        | rejected e cancelled não concedem                        |
| PAY-06 | P0  | integration        | A    | PASS   | idem                                                                        | 2×, 5× e 2 simultâneos → sempre 7 dias                   |
| PAY-07 | P0  | unit               | C    | PASS   | `webhook-signature.test.js`, `subscription-hmac-activation.test.js`         |                                                          |
| PAY-08 | P0  | integration        | A    | PASS   | `payments-boost-webhook-idempotency`                                        | approved→pending não retira; pending→approved concede 1× |
| PAY-09 | P0  | integration        | A    | PASS   | idem                                                                        | exatamente 7 dias; `priority` intocado                   |
| PAY-10 | P0  | integration        | A    | PASS   | idem                                                                        | 404 = ACK; 500 propaga sem benefício                     |
| PAY-11 | P0  | integration        | A    | PASS   | idem + **teste por mutação** (14 dias quando a guarda é burlada)            |                                                          |
| PAY-12 | P1  | unit               | C    | PASS   | `frontend-public-url.test.js`                                               | rejeita http/localhost/relativo                          |

### Grupo H — SEO e integridade pública

| ID     | Pri | Tipo        | Cob. | Status                     | Spec/test                                                                                        | Observação                               |
| ------ | --- | ----------- | ---- | -------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| SEO-01 | P0  | E2E         | C    | PASS                       | `seo-canonical.spec.ts`                                                                          |                                          |
| SEO-02 | P0  | E2E + unit  | C    | PASS                       | `seo-canonical.spec.ts`, `territory-gate.test.ts`                                                |                                          |
| SEO-03 | P0  | unit        | C    | PASS                       | `city-existence-gate.test.ts`, `territorial-existence-rule.test.js`                              | 404 real vem do gate                     |
| SEO-04 | P0  | E2E         | C    | PASS                       | `seo-jsonld.spec.ts`, `vehicle-structured-data.test.ts`                                          |                                          |
| SEO-05 | P0  | unit        | C    | PASS                       | `blocked-ad-no-public-leak.test.js`                                                              |                                          |
| SEO-06 | P0  | E2E         | C    | PASS                       | `seo-sitemap.spec.ts`                                                                            |                                          |
| SEO-07 | P0  | E2E         | A    | PASS                       | `seo-sitemap-urls.spec.ts`                                                                       | percorre os `<loc>`; zero 404 e zero 3xx |
| SEO-08 | P1  | unit        | C    | PASS                       | `territorial-canonical-contract.test.ts`, `canonical-city-path.test.ts`                          |                                          |
| SEO-09 | P1  | E2E         | C    | PASS (1 skip preexistente) | `seo-jsonld.spec.ts`                                                                             | skip depende de `VEHICLE_SLUG_FOR_E2E`   |
| SEO-10 | P0  | route + E2E | A    | PASS                       | `tabela-fipe/route.test.ts`, `simulador-financiamento/route.test.ts`, `seo-sitemap-urls.spec.ts` |                                          |
| SEO-11 | P0  | unit        | C    | PASS                       | `ads-public-filter-only-active.test.js` + smoke de contrato                                      |                                          |
| SEO-12 | P1  | E2E         | A    | PASS                       | `seo-sitemap-urls.spec.ts`                                                                       | nada em sitemap declara `noindex`        |

### Grupo I — Admin e autorização

| ID     | Pri | Tipo              | Cob. | Status | Spec/test                                                                                   | Observação                                            |
| ------ | --- | ----------------- | ---- | ------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| ADM-01 | P0  | unit              | C/A  | PASS   | `admin-role-middleware.test.js` + `server-admin-session.test.ts`                            | API e shell do Next                                   |
| ADM-02 | P0  | unit              | C    | PASS   | `admin-routes-contract.test.js`                                                             |                                                       |
| ADM-03 | P0  | integration + E2E | C    | FAIL   | `ad-admin-moderation.integration.test.js` **PASS** / `admin-ad-moderation.spec.ts` **FAIL** | **BUG-E2E-02** — regra provada no banco; só o E2E cai |
| ADM-04 | P0  | unit              | C/A  | PASS   | `admin-moderation-auth.test.js` + `server-admin-session.test.ts`                            | inclui fail-closed                                    |
| ADM-05 | P1  | unit              | C    | PASS   | `admin-moderation-auth.test.js` (400 sem motivo), `admin-seo-mutation.test.js`              |                                                       |

### Grupo J — Performance e acessibilidade automatizável

| ID     | Pri | Tipo | Cob. | Status     | Spec/test                       | Observação                                                                                 |
| ------ | --- | ---- | ---- | ---------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| OPS-01 | P1  | E2E  | A    | PASS       | `ops-viewport-overflow.spec.ts` | 7 larguras × 8 páginas (home, comprar, cidade, veículo, login, dashboard, simulador, FIPE) |
| OPS-02 | P1  | —    | —    | NOT TESTED | —                               | CLS medido em `next dev` mede o HMR, não o produto — exigiria build de produção; ver §8    |
| OPS-03 | P1  | E2E  | A    | PASS       | `ops-viewport-overflow.spec.ts` | console limpo em 375 e 1440                                                                |
| OPS-04 | P1  | —    | —    | NOT TESTED | —                               | teclado no wizard depende do fluxo bloqueado por BUG-E2E-01; ver §8                        |
| OPS-05 | P1  | E2E  | A    | PASS       | `ops-viewport-overflow.spec.ts` | nome acessível em todo link/botão visível da home + rótulo da busca                        |
| OPS-06 | P1  | E2E  | A    | PASS       | `ops-viewport-overflow.spec.ts` | 5 rotas, inclusive `/veiculo/slug-inexistente`                                             |

---

## 5. Resumo da execução

### 5.1 Bateria completa (comandos oficiais do repositório)

| Suíte                           | Comando                                                                              | Arquivos | Resultado                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------- |
| Unit backend                    | `npx vitest run --exclude "tests/integration/**"`                                    | 225      | **3.680 PASS · 1 skip · exit 0**                                       |
| Unit/route frontend             | `npx vitest run` (em `frontend/`)                                                    | 234      | **3.639 PASS · exit 0**                                                |
| Integração (Postgres real)      | runner espelhando `run-integration-ads-tests.mjs`, `--no-file-parallelism`           | 22       | **312 PASS · 40 FAIL** (6 arquivos, todos pré-existentes — BUG-INT-01) |
| E2E (Playwright)                | `npx playwright test`                                                                | 39 specs | **216 PASS · 38 FAIL · 13 SKIP · 5 não executados**                    |
| E2E — specs novos, reexecutados | `playwright test e2e/session-persistence-gates.spec.ts e2e/seo-sitemap-urls.spec.ts` | 2        | **11 PASS**                                                            |
| Smoke backend                   | `BASE_URL=http://127.0.0.1:4000 npm run smoke`                                       | —        | **13/14** (1 = kill switch, BUG-AMB-02)                                |
| Smoke contrato público          | `BASE_URL=http://127.0.0.1:3000 node scripts/smoke/public-contract-smoke.mjs`        | —        | **64/67** (3 = cidades sem estoque local)                              |

O CI oficial roda `npm run test:e2e:full-flow` (1 spec). Esta homologação executou **a suíte inteira**,
que é onde os 38 vermelhos aparecem — nenhum deles reprova a pipeline hoje.

### 5.2 Contabilidade por prioridade (matriz da §4 — 104 IDs: 81 P0 + 23 P1)

| Prioridade | Total | PASS   | FAIL                        | BLOCKED   | NOT TESTED / N/A                  | PARCIAL                                          |
| ---------- | ----- | ------ | --------------------------- | --------- | --------------------------------- | ------------------------------------------------ |
| **P0**     | 81    | **75** | **3** (AD-01, AD-13, AD-16) | 1 (AD-02) | 0                                 | 2 (AD-11, CAT-14)                                |
| **P1**     | 23    | **19** | 0                           | 0         | 3 (PROF-08 = N/A, OPS-02, OPS-04) | 1 (CAT-12)                                       |
| **P2**     | 0     | —      | —                           | —         | —                                 | — (o escopo desta homologação não define IDs P2) |

**As 3 falhas P0 são todas de INFRAESTRUTURA DE TESTE, não de produto** — diagnóstico em §6
(BUG-E2E-01 e BUG-E2E-02). A regra de negócio correspondente está provada em outra camada:
AD-01/AD-16 por `tests/ads/*` + `ads-pipeline.integration`, AD-13 por
`ad-admin-moderation.integration.test.js` (PASS contra Postgres real).

### 5.3 Classificação das 38 falhas E2E

| Causa                                                                     | Testes                                                    | Classe                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| Seed com 4 anúncios (spec exige > 4 cards)                                | 11 (`catalog-city-clean-grid`)                            | BLOCKED — dados                               |
| Kill switch `SITEMAP_PUBLIC_ENABLED=false` → 503                          | 7 (`seo-sitemap`) + 1 (meu `seo-sitemap-urls`, corrigido) | BLOCKED — ambiente                            |
| Seed cria anúncios **sem fotos** (`jsonb_array_length(images) = 0` nos 4) | 4 (`vehicle-detail-premium`)                              | BLOCKED — dados                               |
| Locator obsoleto `"Dados do veículo"` / `"Meus anúncios"` ambíguo         | 5 (publicação PF)                                         | **FAIL — teste desatualizado**                |
| Seed não cria `admin.mod@example.com` (login 401)                         | 1 (`admin-ad-moderation`)                                 | BLOCKED — dados                               |
| Seed sem procuras de compra                                               | 1 (`active-buyers`) + 2 (`purchase-intents`)              | BLOCKED — dados                               |
| Feed de lojista sem dados/cópia esperada                                  | 3 (`dealer-sale-*`)                                       | BLOCKED — dados                               |
| **JSON-LD e redirect territorial**                                        | 3 (`seo-jsonld`)                                          | **candidato a defeito real — ver BUG-SEO-01** |

## 6. Bugs e achados (registrados, **não corrigidos**)

> Nenhum destes foi corrigido. Todos permanecem reproduzíveis no commit testado.

### BUG-INT-01 — 6 arquivos de integração quebrados e invisíveis ao CI · **P1**

- **Teste que detectou:** execução completa de `tests/integration/**` (o CI roda só 1 dos 21).
- **Arquivos:** `ads-opportunity`, `ads-ranking-base-city-boost`, `migrations-compat`,
  `purchase-intent-offers-concurrency`, `sale-request-offers-concurrency`, `seed-cities-geo`.
- **Reprodução:** `npm run integration:db:up && npm run integration:db:prepare` e então rodar
  `tests/integration/` inteiro (o script oficial `test:integration:ads` aponta só para `ads-pipeline`).
- **Esperado:** 336 testes verdes. **Obtido:** 40 falhas em 6 arquivos.
- **Causa provável (verificada, não inferida):** as fixtures desses arquivos não acompanharam o schema.
  `tests/integration/ads-opportunity.integration.test.js:144` faz
  `INSERT INTO advertisers (user_id, name)`, mas no banco `advertisers.city_id` e `advertisers.slug` são
  `NOT NULL` (confirmado por `information_schema` no banco migrado). São 18 das 40 falhas com a mensagem
  `null value in column "city_id" of relation "advertisers" violates not-null constraint`; o restante são
  asserções encadeadas depois do setup falho (`expected [] to have a length of 1`,
  `SALE_OPPORTUNITY_OFFER_CLOSED`, etc.). O arquivo irmão `ad-admin-moderation.integration.test.js:140`
  fornece `city_id` e **passa**.
- **Descartado como causa:** contaminação de dados. As mesmas 6 falhas ocorreram num volume Docker
  **recriado do zero** (`down -v` → `up` → migrations, sem `e2e-seed`).
- **Não é defeito de produto.** É dívida de infraestrutura de teste, agravada por o CI executar 1/21.

### BUG-CI-01 — o gate E2E do CI pula silenciosamente o teste que ele existe para proteger · **P0**

- **Teste que detectou:** execução completa da suíte com o seed oficial (`npm run e2e:prepare`).
- **Obtido:** `full-flow.spec.ts` — o **único** spec que o CI executa (`npm run test:e2e:full-flow`) —
  reportou **6 dos seus 9 testes como SKIPPED**, entre eles o principal:
  _"login → wizard (7 steps) → publicar → painel lista o anúncio publicado"_.
- **Causa raiz (verificada):**
  - `frontend/e2e/helpers.ts:7-16` define `USERS.A`/`USERS.B` com fallback
    `testa@carrosnacidade.com` / `testb@carrosnacidade.com`.
  - `scripts/e2e-seed.mjs` — o preparador oficial — **não cria esses usuários**. Ele cria
    `cpf@`, `cnpj@`…`cnpj5@`. Consulta direta ao banco de teste: nenhuma linha para `testa`/`testb`.
  - Os testes usam `test.skip(!loginRes.ok(), "Usuário A indisponível…")`. Login falha → **skip**.
- **Por que isso é P0:** um `skip` **não reprova o job**. O workflow `.github/workflows/ci.yml` marca
  `### E2E full-flow passed` e libera o deploy. Se `secrets.E2E_USER_A_EMAIL` estiver vazio, apontar para
  um usuário inexistente no banco efêmero do CI, ou tiver a senha trocada, **o gate de publicação nunca
  roda e ninguém é avisado**. É exatamente o padrão "falha silenciosa esconde queda total": o pipeline
  fica verde por ausência de teste, não por ausência de defeito.
- **Correção sugerida (fora do escopo desta tarefa):** o seed passar a criar `testa`/`testb`, **ou** o
  spec falhar (não pular) quando o login do usuário A não funcionar em ambiente que se declara preparado.

### BUG-E2E-01 — 5 specs de publicação quebrados por locator obsoleto · **P0 (infraestrutura de teste)**

- **Testes:** `main-flow`, `10-login-ad-publish`, `20-login-ad-checkout`, `publish-full-surface`,
  `register-minimal-to-publish` — os cinco do funil de publicação.
- **Erro (4 dos 5), idêntico:**
  ```
  Timed out waiting for expect(locator).toBeVisible()
  Locator: getByRole('heading', { name: /Dados do veículo/i, level: 1 })
  Received: <element(s) not found>
    at publish-wizard.ts:151  /  helpers.ts:214
  ```
- **Causa raiz (verificada):** o passo 1 do wizard hoje tem o H1 **"Veículo"** (subtítulo "Informe os
  principais dados do seu carro"). A string `"Dados do veículo"` **não existe** como heading do wizard em
  lugar nenhum do produto — `grep` só a encontra como _título de Card_ no fluxo de **venda para lojas**
  (`SaleRequestForm.tsx:443`, `SaleRequestDetail.tsx:437`). Os helpers de E2E
  (`helpers.ts:188,194,214` e `publish-wizard.ts:151`) ficaram com a cópia antiga.
- **O 5º (`main-flow`) é a mesma classe, outro sintoma:**
  ```
  strict mode violation: getByRole('heading', { name: /Meus anúncios/i }) resolved to 2 elements:
    1) <h1 …>Meus anúncios</h1>
    2) <h2 …> dentro de getByTestId('dashboard-ads-list')
  ```
  O painel passou a ter o título em dois níveis; o locator não desambigua.
- **Hipóteses DESCARTADAS por evidência:**
  - _FIPE indisponível_ — o log do Next registra `GET /api/fipe/brands?vehicleType=carros 200` quatro
    vezes durante a execução; a API externa responde 200 em 171 ms; o endpoint devolve 107 marcas.
  - _R2 ausente_ — plausível (não há `R2_*` no ambiente), mas o teste nem chega ao passo de fotos: ele
    para no H1 do passo 1.
  - _Select de marca vazio_ — o primeiro screenshot mostrava "Escolha uma…", que é o **placeholder** de um
    `<select>` fechado, não prova de lista vazia. Ler screenshot como evidência de ausência foi um erro
    meu de diagnóstico, corrigido aqui.
- **Consequência:** **não há defeito de produto demonstrado em AD-01/AD-16.** O que há é uma suíte que
  parou de acompanhar a UI e ninguém percebeu, porque o CI não roda esses specs e o spec que ele roda
  pula o teste equivalente (BUG-CI-01).
- **Correção sugerida:** atualizar os 4 pontos de locator e desambiguar o heading do painel. **Não foi
  feito** — é alteração de comportamento de teste e a instrução desta tarefa é preservar a falha.

### BUG-E2E-02 — moderação administrativa: o usuário admin do spec não existe · **P1 (dados de teste)**

- **Teste:** `admin-ad-moderation.spec.ts:109` — "ciclo completo: ativo → bloqueado → reativado".
- **Erro:** `login falhou para admin.mod@example.com: 401`.
- **Causa raiz (verificada):** `SELECT count(*) FROM users WHERE email='admin.mod@example.com'` → **0**.
  O `scripts/e2e-seed.mjs` não cria esse usuário.
- **Contraste:** a **mesma regra** contra Postgres real
  (`tests/integration/ad-admin-moderation.integration.test.js`) **passa**, assim como
  `admin-ad-block.service.test.js`, `admin-ad-block-routes.test.js` e `blocked-ad-no-public-leak.test.js`.
  A regra de negócio está provada; falta o fixture da jornada.

### BUG-SEED-01 — o seed oficial não sustenta a suíte que ele deveria preparar · **P1**

`npm run e2e:prepare` é o comando documentado para deixar o ambiente pronto. Medido no banco resultante:

| O que o spec precisa                  | O que o seed entrega                       | Testes bloqueados                       |
| ------------------------------------- | ------------------------------------------ | --------------------------------------- |
| usuários `testa@` / `testb@`          | **não existem**                            | 6 (`full-flow`, o gate do CI)           |
| `admin.mod@example.com`               | **não existe**                             | 1 (`admin-ad-moderation`)               |
| > 4 anúncios ativos na cidade-base    | **3 em Atibaia, 1 em Bragança**            | 11 (`catalog-city-clean-grid`)          |
| anúncio com fotos                     | **`jsonb_array_length(images) = 0` nos 4** | 4 (`vehicle-detail-premium`)            |
| procuras de compra (purchase intents) | nenhuma                                    | 3 (`active-buyers`, `purchase-intents`) |

Somados: **25 dos 38 vermelhos e 6 dos 13 skips** vêm daqui. Não é defeito de produto — é a razão pela
qual a camada E2E protege muito menos do que o seu tamanho sugere.

### BUG-SEO-01 — `/cidade/[slug]/oportunidades` responde **200 indexável canonicalizando para outra página** · **P1 — defeito real**

- **Teste que detectou:** `seo-jsonld.spec.ts` — _"Esperado ao menos 1 bloco JSON-LD em
  /cidade/atibaia-sp/oportunidades"_.
- **Reprodução (`curl`, sem `-L`):**
  ```
  GET http://127.0.0.1:3000/cidade/atibaia-sp/oportunidades
  HTTP/1.1 200 OK
  <title>Carros na Cidade | Marketplace automotivo regional</title>        ← título do LAYOUT RAIZ
  <link rel="canonical" href="…/carros-baratos-em/atibaia-sp">             ← canônica de OUTRA página
  …NEXT_REDIRECT… (3 ocorrências no corpo)
  ```
- **Esperado:** 308 para `/cidade/[slug]/abaixo-da-fipe`, que é o que
  `frontend/app/cidade/[slug]/oportunidades/page.test.ts` afirma.
- **Por que o teste unitário não pega:** ele chama a função da página e observa que `redirect()` foi
  invocado. Isso prova que **o código chama** o redirect, não que **a resposta HTTP** é um redirect.
- **Este é exatamente o defeito que o projeto já corrigiu uma vez.** O comentário de
  `frontend/lib/city/territorial-index-redirect.ts` descreve o mesmo padrão em `/tabela-fipe`:
  `redirect()` de Server Component executado depois de o shell do layout começar a streamar sai como
  _"HTTP 200 + título do layout + canonical da home + NEXT_REDIRECT no corpo"_. A correção adotada lá foi
  trocar `page.tsx` por **Route Handler**. Esta rota não recebeu o mesmo tratamento.
- **Atenuante:** a URL não está em sitemap (`sitemap-transition.test.ts` a exclui), então o alcance é
  menor que no caso do `/tabela-fipe`, que estava em `core.xml`.
- **Ressalva honesta:** medido em `next dev`. O comportamento de streaming pode diferir em
  `npm run build && npm start` — **confirmar em build de produção antes de agir**. O mecanismo, porém,
  está documentado no próprio repositório.

### BUG-SEO-02 — `/cidade/[slug]` não emite `BreadcrumbList` · **P1 — candidato**

- **Teste:** `seo-jsonld.spec.ts` — _"BreadcrumbList esperado em /cidade/atibaia-sp — tipos encontrados:
  CollectionPage"_.
- **Verificado por `curl`:** os `@type` presentes em `/cidade/atibaia-sp` são `CollectionPage`, `Place`,
  `PostalAddress`, `WebSite`. **Não há `BreadcrumbList`.**
- **Precisa de decisão de produto:** ou o breadcrumb estruturado foi removido sem atualizar o contrato de
  SEO, ou o spec ficou desatualizado. Não é possível decidir isso a partir do código — por isso fica
  registrado como candidato, não como defeito confirmado.

### BUG-AMB-01 — `AUTH_SESSION_SECRET` explícito invalida 100% dos specs que forjam cookie · **P2 (documentação)**

- Descoberto **por engano meu**, e vale registrar porque vai morder de novo: a primeira execução da suíte
  E2E subiu o Next com `AUTH_SESSION_SECRET` definido. Vários specs (`active-buyers-card-grid`,
  `dealer-*`, `admin-ad-moderation`) forjam um cookie assinado com a constante de desenvolvimento
  `"cnc-dev-session-secret"` (ver `services/sessionService.ts:48`). Com outro segredo, o HMAC não fecha e
  **todos** falham por 401 — sem nenhuma relação com o produto.
- **Recomendação:** documentar em `docs/testing/e2e.md` que `AUTH_SESSION_SECRET` **não deve** ser definido
  ao rodar E2E local.

### BUG-AMB-02 — `GET /api/public/seo/sitemap` responde 503 no smoke local · **não é defeito**

- `npm run smoke` (BASE_URL local) reprova 1 de 11 checagens obrigatórias.
- É o **kill switch** documentado em `src/modules/public/public-seo.controller.js:49`:
  `SITEMAP_PUBLIC_ENABLED` tem default `false` e devolve 503 + `Retry-After`. Em produção a variável está
  `true`. O smoke assume a configuração de produção; localmente o 503 é o comportamento correto.
- **Recomendação:** o smoke poderia aceitar 503 quando `SITEMAP_PUBLIC_ENABLED` não estiver `true`, para o
  sinal não virar ruído.

### ACHADO-01 — `frontend/.env.local` aponta para produção · **P1 (risco operacional)**

Ver §1. Não é bug de código; é uma armadilha real de ambiente para quem rodar E2E sem override.

---

## 7. Flakes

Nenhum flake **de produto** foi identificado. Um caso foi investigado e classificado:

### FLAKY-AMBIENTAL-01 — `lib/painel/upload-draft-photos-direct-r2.test.ts` (frontend)

| Item               | Valor                                                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classificação      | **ENVIRONMENTAL**                                                                                                                                                                                                      |
| Sintoma            | `isR2ConfiguredInBff > returns false when R2 env vars are missing` — _Test timed out in 5000ms_                                                                                                                        |
| Taxa de reprodução | **1/1 sob contenção · 0/3 isolado**                                                                                                                                                                                    |
| Contexto da falha  | suíte completa do frontend rodando **em paralelo** com a suíte do backend; o relatório do Vitest registrou `environment 727.17s` — a máquina estava saturada                                                           |
| Reprodução isolada | `npx vitest run lib/painel/upload-draft-photos-direct-r2.test.ts` — 23/23 verdes, 3× seguidas (1,39s · 0,98s · 1,32s). Suíte frontend inteira reexecutada SOZINHA no fim: **234 arquivos / 3.639 testes, zero falhas** |
| Causa provável     | timeout padrão de 5s do Vitest atingido por escalonamento de CPU, não por assincronismo do teste                                                                                                                       |
| Ação tomada        | **nenhuma.** Não foi aumentado timeout, não foi adicionado `.skip`, não foi afrouxada asserção                                                                                                                         |

**Nada de `|| true`, `.skip` novo, retry, ou relaxamento de expectativa foi introduzido nesta homologação.**

### Sobre os 11 casos de `catalog-city-clean-grid.spec.ts`

Não são flakes: falham **deterministicamente** por falta de dados. O spec exige
`boxes.length > expected` (mais de 4 cards para os casos de 4 colunas) e o seed oficial
`scripts/e2e-seed.mjs` cria **4 anúncios ativos no total** — 3 em Atibaia, 1 em Bragança
(confirmado por `SELECT status, count(*) FROM ads`). Os casos mobile/tablet (1 e 2 colunas) passam;
todos os desktop reprovam na pré-condição. Classificação: **BLOCKED — dados de teste insuficientes**,
não FAIL de produto. Ver §8.

---

## 8. Lacunas que continuam manuais ou descobertas

### Automatizáveis, mas ainda não automatizadas

| Item                                                    | Por quê                                                                                                                                                                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AD-02 — publicação PJ completa**                      | `critical-pj-flow.spec.ts` segue placeholder. O registro CNPJ é coberto (`dashboard-login-pf-pj`), mas o wizard lojista ponta a ponta não. Depende de resolver BUG-E2E-01 primeiro                                   |
| **AD-11 — reordenar/remover foto de anúncio publicado** | pipeline de upload coberto; a edição da galeria de um anúncio vivo não                                                                                                                                               |
| **CAT-12 — paginação sem duplicação/omissão**           | exige seed com > 1 página de anúncios                                                                                                                                                                                |
| **CAT-14 — render de zero resultados**                  | exige uma consulta garantidamente vazia no catálogo                                                                                                                                                                  |
| **OPS-02 — CLS**                                        | `next dev` injeta HMR e recompila sob demanda; qualquer CLS medido ali é do dev server. Precisa de `npm run build` + `npm start` para medir o produto                                                                |
| **OPS-04 — navegação por teclado no wizard**            | o wizard não completa no ambiente atual (BUG-E2E-01). Automatizar agora produziria verde sobre um fluxo quebrado                                                                                                     |
| **`catalog-city-clean-grid` (11 casos)**                | o seed precisa de ≥ 5 anúncios ativos na cidade-base para as medições de 4 colunas valerem                                                                                                                           |
| **Smoke de contrato público contra produção**           | `scripts/smoke/public-contract-smoke.mjs` tem produção como default e é read-only. **Não foi executado contra produção nesta homologação** — a decisão foi manter tráfego zero em produção sem autorização explícita |

### MANUAL FUTURE CHECK (não automatizar como substituto de homologação humana)

- Compra real no Mercado Pago (cartão real, conta real).
- WhatsApp real em Android e iPhone — o provider do projeto ainda é mock.
- Safari real em iPhone (o Playwright aqui roda apenas chromium).
- Clareza visual, hierarquia e qualidade estética.
- Revisão jurídica, termos de uso e política de privacidade.
- Percepção de performance em 4G real.

### Tickets de `docs/testing/qa-edge-cases.md` fechados por esta homologação

`QA-102` (409 de documento duplicado), `QA-103` (contrato de conta `pending`), `QA-104` (redirect `next`
pós-login), `QA-105` parcial (token expirado → refresh, via `dashboard/me/route.test.ts`).
Seguem abertos: `QA-101`, `QA-106`, `QA-109`, `QA-110`, `QA-111`, `QA-112`.

---

## 9. Go/No-Go técnico

### Veredito: **GO COM PENDÊNCIAS**

**Nenhum P0 funcional real está falhando.** As três linhas P0 vermelhas da matriz (AD-01, AD-13, AD-16)
foram rastreadas até a causa e **nenhuma é defeito de produto**:

| P0 vermelho   | Causa verificada                                   | A regra está provada em                                        |
| ------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| AD-01 / AD-16 | locator obsoleto `"Dados do veículo"` (BUG-E2E-01) | `tests/ads/*` (40+ testes), `ads-pipeline.integration.test.js` |
| AD-13         | usuário admin ausente do seed (BUG-E2E-02)         | `ad-admin-moderation.integration.test.js` contra Postgres real |

E as duas suítes que gateiam o merge hoje — **unit backend (3.680) e unit/route frontend (3.639)** —
estão **100% verdes**, incluindo os 91 testes novos desta homologação.

#### O que impede um "GO AUTOMATIZADO"

Não é um defeito; é a **confiabilidade do próprio sinal**:

1. **BUG-CI-01 (P0)** — o gate E2E do CI reporta sucesso pulando 6 dos 9 testes do seu único spec, entre
   eles o de publicação. Enquanto isso valer, um deploy pode passar sem que o funil crítico tenha sido
   exercitado uma única vez.
2. **BUG-SEED-01 (P1)** — 25 dos 38 vermelhos e 6 dos 13 skips existem porque o seed oficial não fornece
   usuários, admin, fotos, estoque nem procuras que os specs exigem.
3. **BUG-INT-01 (P1)** — 6 arquivos de integração quebrados e fora do CI (20 dos 21 nunca rodam na
   pipeline).
4. **BUG-SEO-01 (P1)** — único candidato a defeito real de produto encontrado; precisa de confirmação em
   build de produção.

#### Ordem sugerida de correção (fora do escopo desta tarefa)

1. `BUG-CI-01` — fazer o gate falhar, e não pular, quando o usuário de teste não existir.
2. `BUG-SEED-01` — estender `scripts/e2e-seed.mjs` (usuários A/B, admin, ≥ 6 anúncios com fotos, procuras).
3. `BUG-E2E-01` + `BUG-E2E-02` — atualizar locators e desambiguar o heading do painel.
4. `BUG-SEO-01` — confirmar em build de produção; se confirmado, aplicar o mesmo tratamento de
   `/tabela-fipe` (Route Handler).
5. `BUG-INT-01` — repor `city_id`/`slug` nas fixtures e colocar `tests/integration/**` inteiro no CI.

**Critério objetivo para virar GO AUTOMATIZADO:** itens 1 a 3 resolvidos e a suíte E2E completa verde com
o seed oficial — sem nenhum `skip` silencioso no caminho crítico.

---

## 10. Controle de diff

```
$ git diff --stat
(vazio — nenhum arquivo versionado foi modificado)
```

Todos os arquivos abaixo são **novos** e contêm exclusivamente testes:

```
frontend/app/simulador-financiamento/route.test.ts
frontend/app/tabela-fipe/route.test.ts
frontend/components/financing/FinancingSimulator.test.tsx
frontend/e2e/ops-viewport-overflow.spec.ts
frontend/e2e/seo-sitemap-urls.spec.ts
frontend/e2e/session-persistence-gates.spec.ts
frontend/lib/admin/server-admin-session.test.ts
frontend/lib/favorites/local-favorites.test.ts
tests/auth/auth-service-contract.test.js
tests/auth/verify-document-contract.test.js
tests/integration/payments-boost-webhook-idempotency.integration.test.js
reports/homologacao-automatizada-pre-lancamento-2026-09-06.md   (este relatório)
```

Sem alteração em `src/`, `frontend/components/*.tsx` de produto, `frontend/app/**/page.tsx`,
`frontend/app/**/route.ts`, regras de negócio, migrations, UI ou configuração de produção.
`prettier --check` e `eslint` passam em todos os arquivos adicionados.

### Efeito colateral revertido

Rodar a suíte E2E **reescreve 21 PNGs versionados** em `reports/screenshots/fase-4-11{a,b,c}/` — os
specs `dealer-opportunity-detail-premium`, `dealer-opportunities-hub` e `active-buyers-card-grid`
capturam para lá. Como não são artefato desta homologação, foram restaurados com
`git checkout -- reports/screenshots/`. Fica o registro: **qualquer execução da suíte completa suja
esses arquivos**, e é fácil commitá-los sem perceber.

**Não houve commit nem push**, conforme instruído.
