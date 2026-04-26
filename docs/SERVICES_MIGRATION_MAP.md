# SERVICES_MIGRATION_MAP — Inventário e plano de migração `services/` → `lib/`

| Campo             | Valor                                                                           |
| ----------------- | ------------------------------------------------------------------------------- |
| **Versão**        | 1                                                                               |
| **Data**          | 2026-04-24                                                                      |
| **Branch**        | `claude/sad-elbakyan-8155e1`                                                    |
| **Status**        | 📜 PR 0.4A — Inventário (zero mudança funcional)                                |
| **Próximo passo** | PR 0.4B (migração de `marketService` e `planService`/`planStore` — baixo risco) |
| **Referência**    | [DIAGNOSTICO_REDESIGN.md](./DIAGNOSTICO_REDESIGN.md) §15                        |

---

## 0. Regra oficial

**A partir desta data, é proibido criar novos arquivos em `frontend/services/`.**

Toda nova integração — fetch para backend, lógica de domínio, store, helper de transformação — deve viver em `frontend/lib/<dominio>/`. A pasta `services/` é considerada **legado em migração** e será extinta nos PRs 0.4B → 0.4D.

Esta regra é referenciada também em [PROJECT_RULES.md](../PROJECT_RULES.md).

---

## 1. Inventário completo de `frontend/services/`

| Arquivo                  | Linhas |                            Importadores | Risco          | Sub-PR alvo        |
| ------------------------ | -----: | --------------------------------------: | -------------- | ------------------ |
| `marketService.ts`       |    300 |                             4 (estável) | **Baixo**      | 0.4B               |
| `planService.ts`         |     37 |                                1 (page) | **Baixo**      | 0.4B               |
| `planStore.ts`           |    447 | 7 (3 API + 1 lib + 1 comp + 2 internos) | **Médio-Alto** | 0.4B (com cuidado) |
| `aiService.ts`           |    198 |                         2 (page + comp) | **Médio**      | 0.4C               |
| `vehicleService.ts`      |    303 |              0 (órfão de import direto) | **Médio**      | 0.4C               |
| `adService.ts`           |    275 |    1 (`lib/account/backend-account.ts`) | **Médio**      | 0.4C               |
| `authService.ts`         |    616 |                            4 (API auth) | **Alto**       | 0.4D               |
| `sessionService.ts`      |    288 |                   17 (API + page + lib) | **Crítico**    | 0.4D (último)      |
| `sessionService.test.ts` |     96 |                                  (test) | —              | acompanha 0.4D     |

**Total**: 9 arquivos, ~2.560 linhas, 36+ pontos de import.

---

## 2. Mapeamento por domínio

### 2.1. `marketService.ts` — Dados estáticos de mercado por cidade

**Propósito**: city profile, slugs estáticos, FIPE/financing stats determinísticos, FAQ e blog stubs.

**Exports principais**:

- `getCityProfile(cidade)`, `getStaticCitySlugs(limit)`, `isSupportedCitySlug(slug)`
- `getVehiclesByCity(cidade, limit)` (delega a `buyCars`)
- `getFipeStatsByCity(cidade)`, `getFinancingStatsByCity(cidade)`
- `getFipeFaqByCity(cidade)`, `getBlogArticlesByCity(cidade)`
- Tipos: `CityProfile`, `MarketStat`, `FaqItem`, `BlogArticle`

**Importadores**:

| Arquivo                                  | Uso                                        |
| ---------------------------------------- | ------------------------------------------ |
| `app/sitemaps/content.xml/route.ts`      | `getStaticCitySlugs()`                     |
| `components/common/RegionalEntryHub.tsx` | `getCityProfile()`, `getStaticCitySlugs()` |
| `components/common/FAQSection.tsx`       | tipo `FaqItem`                             |
| `components/common/StatsSection.tsx`     | tipo `MarketStat`                          |
| `services/aiService.ts` (interno)        | `getCityProfile()`                         |
| `services/vehicleService.ts` (interno)   | `getCityProfile()`                         |

**Equivalente em `lib/`**: parcial — `lib/city/` existe (CityContext, fetchers territoriais) mas não cobre `MarketStat`/`FaqItem`/`BlogArticle`.

**Sobreposição**: nenhuma direta. `lib/city/` trata cidade no contexto de UI/fetch; `marketService` trata dados estáticos.

**Destino canônico**: `lib/market/` (criar). Mover tudo intacto. Tipos podem ser exportados para reuso público.

**Risco**: Baixo. Dados estáticos, sem efeitos colaterais. Mas atenção:

- 3 dos importadores são componentes em `common/` que **estão classificados como suspeitos no §3.4 do diagnóstico** (`RegionalEntryHub`, `FAQSection`, `StatsSection`). Se forem deletados no PR C, o número de importadores cai para 1.
- Antes de migrar, validar status desses 3 componentes pelo checklist §13.

---

### 2.2. `planService.ts` — Fachada simples de planos

**Propósito**: wrapper de fetch `/api/plans` com fallback SSR para `planStore.getPlans()`.

**Exports**:

- `fetchPlansFromAPI(options)`, `getPlansByType(type)`

**Importadores**:

| Arquivo               | Uso                |
| --------------------- | ------------------ |
| `app/planos/page.tsx` | `getPlansByType()` |

**Equivalente em `lib/`**: nenhum direto. `lib/account/backend-account.ts` orquestra mas não cobre planos públicos.

**Sobreposição**: baixa. Wrapper simples.

**Destino canônico**: `lib/plans/` (criar). Junto com `planStore.ts` (a parte de planos, não de subscriptions/payments).

**Risco**: Baixo. 1 importador, função pura.

---

### 2.3. `planStore.ts` — Source of truth (mock) de planos, usuários, subscriptions, payments

**Propósito**: seeds e operações in-memory para planos, usuários mock, subscriptions, registro de pagamento, validação CPF/CNPJ, idempotency de webhook.

**Exports principais**:

- Planos: `getPlans()`, `getPlanById()`, `updatePlanById()`
- Usuário/elegibilidade: `getUserById()`, `countActiveAdsByUser()`, `validatePublishEligibility()`
- Subscriptions/payments: `createOrUpdateSubscription()`, `registerPayment()`, `markWebhookEventProcessed()`, `listUserSubscriptions()`, `listPaymentsByUser()`, `getActiveSubscription()`
- Validação: `isValidCPF()`, `isValidCNPJ()`
- Tipos: `PlanType`, `SubscriptionPlan`, `UserSubscription`, `PaymentRecord`, `PaymentStatus`, `SubscriptionStatus`

**Importadores**:

| Arquivo                             | Uso                                 |
| ----------------------------------- | ----------------------------------- |
| `app/api/plans/route.ts`            | `getPlans()`                        |
| `app/api/plans/[id]/route.ts`       | `getPlanById()`, `updatePlanById()` |
| `components/plans/PlanCard.tsx`     | tipo `SubscriptionPlan`             |
| `lib/account/backend-account.ts`    | tipo `SubscriptionPlan`             |
| `services/adService.ts` (interno)   | tipo `PaymentStatus`                |
| `services/authService.ts` (interno) | `getUserById()`                     |
| `services/planService.ts` (interno) | `getPlans()`                        |

**Equivalente em `lib/`**: nenhum.

**Sobreposição**: nenhuma — é fonte de dados, não há equivalente.

**Destino canônico**: separar em 3 arquivos:

- `lib/plans/plan-store.ts` — operações de plano
- `lib/account/subscription-store.ts` — subscriptions e payments (já que `lib/account/` existe)
- `lib/validation/cpf-cnpj.ts` — validadores (puros, podem ser usados em outros lugares — auth, painel)

**Risco**: Médio-Alto. Dados de pagamento são sensíveis. Migração exige:

1. Validar que nenhuma migração quebra idempotency de webhook.
2. Manter testes de subscription/payment passando.
3. Atenção: usuários mock vivem aqui — se o backend real assumir essa responsabilidade no futuro, esse arquivo morre. Hoje, ainda é usado por `authService.getAuthUserById()`.

---

### 2.4. `aiService.ts` — Integração com IA externa + cache de boost metrics

**Propósito**: chama `NEXT_PUBLIC_AI_API_URL` para insights de FIPE, financing, blog, price signal e similares. Cache em `Map` para boost metrics.

**Exports principais**:

- `getAIFipeInsights(cidade)`, `getAIFipeStats(cidade)`, `getAIFinancingStats(cidade)`, `getAIFinancingInsights(cidade)`, `getAIBlogInsights(cidade)`
- `getAIVehiclePriceSignal(vehicle)`, `getAIVehicleInsights(vehicle)`, `getAISimilarVehicles(vehicle)`
- `applyAdBoostMetrics(input)`, `getAdBoostMetrics(adId)`
- Tipos: `AdBoostMetrics`, `VehiclePriceSignal`

**Importadores**:

| Arquivo                               | Uso                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `app/veiculo/[slug]/page.tsx`         | `getAIVehicleInsights()`, `getAIVehiclePriceSignal()`, `getAISimilarVehicles()` |
| `components/vehicle/VehicleInfo.tsx`  | tipo `VehiclePriceSignal`                                                       |
| `services/marketService.ts` (interno) | (uso indireto via `getCityProfile`)                                             |

**Equivalente em `lib/`**: nenhum. `lib/fipe/` cobre FIPE pura, não IA.

**Sobreposição**: nenhuma.

**Destino canônico**: `lib/ai/` (criar). Subdividir:

- `lib/ai/insights.ts` — insights de cidade
- `lib/ai/vehicle-signals.ts` — price signal e insights de veículo
- `lib/ai/boost-metrics.ts` — cache de boost (atenção: estado in-memory por instância — pode quebrar em multi-replica)

**Risco**: Médio. Atenção:

- Cache `Map` em memória é frágil em produção com múltiplas réplicas. Avaliar mover para Redis (já instalado como `ioredis`) durante migração.
- `app/veiculo/[slug]/page.tsx` (456 linhas) é página crítica e usa heavy. A extração de AI logic dessa página (mencionada no diagnóstico §4 risco #11) acontece **antes** do PR I, e essa migração 0.4C pode ser feita junto.

---

### 2.5. `vehicleService.ts` — Mock de veículos e sellers

**Propósito**: 3 veículos seed (dealer + private), parser de slug fallback, listagens (city, seller, similares).

**Exports**:

- `getVehicleSlugs(limit)`, `getVehicleBySlug(slug)`, `getSellerVehicles(vehicle)`, `getCityVehicles(vehicle)`, `getSimilarVehicles(vehicle)`
- Tipos: `SellerDealer`, `SellerPrivate`, `SellerInfo`, **`VehicleDetail`**

**Importadores**: **0 imports diretos** (órfão de uso direto).

**Equivalente em `lib/`**: **`lib/vehicle/public-vehicle.ts`** — versão moderna com mais campos (`brand`, `version`, `priceNumeric`, `adPublishedAt`, `isPaidListing`, `advertiserId`, `hasRealImages`, `fipeDeltaBrl`, `fipeDeltaPercent`).

**Sobreposição**: 🚨 **CRÍTICA — conflito de tipo**:

- `services/vehicleService.VehicleDetail` ≠ `lib/vehicle/public-vehicle.VehicleDetail` (estruturas diferentes)
- Tipos compartilhados podem causar erro silencioso de TypeScript se importados de fontes diferentes em pontos próximos.

**Destino canônico**: **deletar** `vehicleService.ts` no PR 0.4C, após:

1. Confirmar zero importadores diretos (já confirmado).
2. Verificar que nenhum import indireto via barrel ou re-export usa.
3. Garantir que `lib/vehicle/public-vehicle.ts` cobre todos os casos.

**Risco**: Baixo (zero importadores) → Médio (conflito de tipo precisa resolução).

---

### 2.6. `adService.ts` — Anúncios (mock) + boosts

**Propósito**: lista, pausa, ativa, deleta anúncios mock; opções de boost; registro de payment intent; aplicação de boost; métricas.

**Exports principais**:

- `listAdsByUser()`, `getAdById()`, `getAdByIdForUser()`
- `pauseAd()`, `activateAd()`, `deleteAd()`
- `getBoostOptions()`, `registerBoostPaymentIntent()`, `applyBoostToAd()`, `getAdBoostMetrics()`

**Importadores**:

| Arquivo                          | Uso                 |
| -------------------------------- | ------------------- |
| `lib/account/backend-account.ts` | `getBoostOptions()` |

**Equivalente em `lib/`**: parcial. `lib/ads/` existe para anúncios públicos (listagem, detalhe). Não cobre o painel.

**Sobreposição**: baixa em superfície (públicos vs painel) mas tipos podem conflitar. Verificar `BaseAdData` em `components/ads/AdCard.tsx`.

**Destino canônico**: `lib/ads/dashboard-ad-store.ts` (anúncios do painel) + `lib/ads/boost.ts` (opções, intent, aplicação, métricas).

**Risco**: Médio. 1 importador direto, mas:

- Domínio de **monetização** (boost = pagamento real).
- `applyBoostToAd()` muta estado de anúncio — atomicidade importa.
- Migração precisa testes de painel (`/dashboard/meus-anuncios`, `/impulsionar/[adId]`).

---

### 2.7. `authService.ts` — Orquestração de autenticação

**Propósito**: login local + backend, registro, recuperação de senha, normalização de payload, tipos de auth, alias de funções (`signUp`, `signup`, `createUser`, `createAccount`).

**Exports principais**:

- `authenticateUser()`, `registerUser()`, `register()`, `login()`
- `requestPasswordReset()`, `resetPassword()`
- `getAuthUserById()`, `getLocalEmailByUserId()`
- Tipos: `AuthUser`, `AuthSession`, `AuthenticatedSession`, `BackendAuthError`
- Default export: `authService` (objeto com todos métodos)

**Importadores**:

| Arquivo                                 | Uso                      |
| --------------------------------------- | ------------------------ |
| `app/api/auth/login/route.ts`           | `authenticateUser()`     |
| `app/api/auth/register/route.ts`        | `registerUser()`         |
| `app/api/auth/forgot-password/route.ts` | `requestPasswordReset()` |
| `app/api/auth/reset-password/route.ts`  | `resetPassword()`        |

Internamente: usa `planStore.getUserById()`.

**Equivalente em `lib/`**: parcial. `lib/auth/` tem:

- `lib/auth/jwt-access.ts`
- `lib/auth/redirects.ts`
- `lib/auth/refresh-backend-tokens.ts`

São helpers de token (edge middleware) — escopo diferente do `authService` (orquestração runtime).

**Sobreposição**: 🚨 **SIGNIFICATIVA**. Refresh token aparece em ambos (com regras diferentes para edge vs runtime). Risco de divergência.

**Destino canônico**: consolidar tudo em `lib/auth/`:

- `lib/auth/login-orchestrator.ts` (`authenticateUser`, `login`, `BackendAuthError`)
- `lib/auth/register-orchestrator.ts` (`registerUser`, `register`, aliases)
- `lib/auth/password-recovery.ts` (`requestPasswordReset`, `resetPassword`)
- `lib/auth/types.ts` (consolidar `AuthUser`, `AuthSession`)
- Aliases (`signUp`, `signup`, `createUser`, `createAccount`) — **avaliar se ainda são usados**; se não, remover no checklist §13.

**Risco**: **Alto**. 4 API routes críticas dependem disso. Migração 0.4D requer:

- Testes E2E auth completos antes (cobertura cobrindo `/login`, `/cadastro`, `/recuperar-senha`).
- Manter aliases e default export até confirmar zero usos externos.
- Code review obrigatório antes de mergear.

---

### 2.8. `sessionService.ts` — HMAC-SHA256 + cookies de sessão

**Propósito**: criação/validação de tokens via HMAC-SHA256, escrita de cookies `cnc_session` / `cnc_at` / `cnc_rt`, leitura em NextRequest / Server Components / cookieStore, merge com headers de refresh middleware.

**Exports principais**:

- `createSessionToken()`, `applySessionCookiesToResponse()`
- `getSessionDataFromCookieValue()`, `getSessionUserFromCookieValue()`
- `getSessionUserFromRequest()`, `getSessionDataFromRequest()`
- `mergeMiddlewareSessionTokens()`, `getSessionDataFromCookieStore()`
- `getSessionCookieOptions()`, `getClearSessionCookieOptions()`
- `applyUnauthorizedWithSessionCleanup()`, `applyPrivateNoStoreHeaders()`
- Constantes: `AUTH_COOKIE_NAME`, `AUTH_ACCESS_COOKIE_NAME`, `AUTH_REFRESH_COOKIE_NAME`
- Tipos: `SessionUser`, `SessionData`

**Importadores** (17 — o arquivo mais conectado do projeto):

| Categoria      | Arquivos                                                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API routes (9) | `/api/admin/[...path]`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/register`, `/api/auth/verify-document`, `/api/dashboard/me`, `/api/painel/anuncios`, (test) `/api/dashboard/me/route.test.ts` |
| Pages (2)      | `/impulsionar/[adId]`, `/login`                                                                                                                                                                                         |
| `lib/` (6)     | `lib/account/backend-account.ts`, `lib/account/dashboard-session.ts`, `lib/http/bff-session.ts`, `lib/http/bff-session.test.ts`, `lib/session/ensure-backend-session.ts`, `lib/session/ensure-backend-session.test.ts`  |

**Equivalente em `lib/`**: 🚨 **SIM**, `lib/session/session-cookie-edge.ts` espelha lógica HMAC para uso em middleware (edge runtime). **Código duplicado**.

**Sobreposição**: 🚨 **CRÍTICA**. Dois arquivos implementam HMAC-SHA256 com risco de divergência. Se um for atualizado e outro não, sessões válidas em runtime podem ser inválidas no edge (ou vice-versa).

**Destino canônico**: consolidar em `lib/session/`:

- `lib/session/session-cookie.ts` (lógica core HMAC, runtime)
- `lib/session/session-cookie-edge.ts` (mantém compat edge, importa core quando possível)
- `lib/session/cookie-options.ts` (`getSessionCookieOptions`, `getClearSessionCookieOptions`)
- `lib/session/response-helpers.ts` (`applySessionCookiesToResponse`, `applyUnauthorizedWithSessionCleanup`, `applyPrivateNoStoreHeaders`)
- `lib/session/request-readers.ts` (`getSessionDataFromRequest`, `getSessionDataFromCookieStore`, `getSessionUserFromRequest`)
- `lib/session/middleware-merge.ts` (`mergeMiddlewareSessionTokens`)

**Risco**: **Crítico**. É o último PR de migração (0.4D, depois de auth) por motivo: se quebrar, **toda área autenticada do site morre**.

**Pré-requisitos** (do diagnóstico §15):

- Testes de login, cadastro, cookies, sessão, favoritos, dashboard, publicação, isolamento de dados — **todos passando** antes de tocar.

---

### 2.9. `sessionService.test.ts`

Testes de unit do `sessionService`. Acompanha o arquivo na migração 0.4D — atualizar imports junto.

---

## 3. Plano de migração (4 sub-PRs)

### PR 0.4A — Inventário e contrato (este documento)

✅ **Entregue agora**. Zero mudança funcional. Estabelece regra "novas integrações vão para `lib/`".

### PR 0.4B — Baixo risco

**Domínios**: `marketService`, `planService`, `planStore`.

**Sequência interna**:

1. `marketService.ts` → `lib/market/` (4 importadores — atenção a 3 componentes suspeitos)
2. `planService.ts` → `lib/plans/plan-fetch.ts` (1 importador)
3. `planStore.ts` → split em 3:
   - `lib/plans/plan-store.ts`
   - `lib/account/subscription-store.ts`
   - `lib/validation/cpf-cnpj.ts`

**Pré-requisito**: PR A mergeado.

**Teste**: `npm run build && npm run typecheck && npm run test`. E2E não obrigatório (não afeta auth nem detalhe).

**Risco**: Baixo a Médio.

### PR 0.4C — Domínio de anúncios e veículos

**Domínios**: `aiService`, `vehicleService`, `adService`.

**Sequência interna**:

1. `aiService.ts` → `lib/ai/` (avaliar mover cache para Redis)
2. `vehicleService.ts` → **deletar** após confirmar zero uso (tipo `VehicleDetail` consolidado em `lib/vehicle/public-vehicle.ts`)
3. `adService.ts` → `lib/ads/dashboard-ad-store.ts` + `lib/ads/boost.ts`

**Pré-requisito** (do diagnóstico §15):

- Testes E2E cobrindo:
  - Home (`main-flow.spec.ts`)
  - Catálogo (snapshot de rotas + e2e)
  - Comprar por cidade
  - Detalhe do veículo (`vehicle-detail-premium.spec.ts`)
  - Publicação de anúncio (`10-login-ad-publish.spec.ts`, `publish-full-surface.spec.ts`)
- Snapshot automatizado de rotas (PR B) operacional.

**Risco**: Médio a Alto. Inclui página `/veiculo/[slug]` que é a #1 de conversão.

### PR 0.4D — Auth e sessão (último)

**Domínios**: `authService`, `sessionService` + test.

**Sequência interna**:

1. `authService.ts` → split em `lib/auth/{login,register,password-recovery,types}.ts`
2. `sessionService.ts` → split em `lib/session/{session-cookie,cookie-options,response-helpers,request-readers,middleware-merge}.ts`
3. Atualizar `sessionService.test.ts` → `lib/session/__tests__/`
4. Confirmar zero imports remanescentes em `services/`
5. **Deletar pasta `frontend/services/`**

**Pré-requisito** (do diagnóstico §15):

- Testes específicos de login, cadastro, cookies (httpOnly/secure/sameSite/expiração), sessão (refresh token), favoritos, dashboard, publicação, isolamento entre usuários (`user-isolation-api.spec.ts`).
- `AUTH_SESSION_SECRET` confirmado em produção (Trilha 2 T2.9).
- Code review completo antes de mergear.

**Risco**: **Crítico**. Quebra aqui = todo o site logado quebra.

---

## 4. Sobreposições críticas — resumo

| Conflito                                                                                               | Severidade | Resolução em qual sub-PR                                |
| ------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------- |
| `vehicleService.VehicleDetail` ≠ `lib/vehicle/public-vehicle.VehicleDetail`                            | Alta       | 0.4C — consolidar em `lib/vehicle/public-vehicle.ts`    |
| Lógica HMAC-SHA256 duplicada (`sessionService.ts` vs `lib/session/session-cookie-edge.ts`)             | Crítica    | 0.4D — extrair core compartilhado                       |
| Refresh token (`authService.ts` vs `lib/auth/refresh-backend-tokens.ts`)                               | Alta       | 0.4D — definir owner único                              |
| Tipo `SubscriptionPlan` duplicado em `planStore.ts` e usado em `lib/account/backend-account.ts`        | Média      | 0.4B — exportar de `lib/plans/` e atualizar imports     |
| Tipo `SessionData` em `sessionService.ts` referenciado por `lib/account/`, `lib/http/`, `lib/session/` | Média      | 0.4D — single source of truth em `lib/session/types.ts` |

---

## 5. Itens fora do escopo de migração

Ficam **fora** dos PRs 0.4A–D:

- **Refactor de `app/veiculo/[slug]/page.tsx` (456 linhas)** — refactor de extração de AI logic é precondição do **PR I (detalhe)**, não da migração `services/`. Pode acontecer em paralelo (independente).
- **Decisão de mover `aiService` boost cache para Redis** — discussão arquitetural, pode ser deferida se o tráfego atual não exige.
- **Componentes `common/` suspeitos** (`RegionalEntryHub`, `FAQSection`, `StatsSection`) — vão pelo PR C com checklist §13. Se forem deletados, a migração de `marketService` simplifica.

---

## 6. Verificação final do PR 0.4A

- [x] Inventário completo dos 9 arquivos
- [x] Importadores listados por categoria
- [x] Equivalentes em `lib/` mapeados
- [x] Sobreposições críticas identificadas
- [x] Destino canônico de cada arquivo definido
- [x] Risco classificado
- [x] Sequência de sub-PRs justificada
- [ ] Regra "novas integrações em `lib/`" propagada para `PROJECT_RULES.md` (PR A)

---

**Fim do inventário.**
