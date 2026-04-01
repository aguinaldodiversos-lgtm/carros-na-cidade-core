# Auditoria Técnica Completa — Carros na Cidade
**Data:** 2026-04-01  
**Escopo:** 390 arquivos JS (backend) + 236 arquivos TS/TSX (frontend) = 626 arquivos auditados  
**Stack:** Next.js 14 App Router · React · TypeScript · Tailwind · Node.js/Express · PostgreSQL · Redis/BullMQ

---

## Sumário Executivo

O portal possui uma arquitetura razoavelmente sólida no núcleo (modules/routes/services/repositories), mas acumula **dívida técnica significativa** em camadas transversais: código duplicado em múltiplas camadas, ausência quase total de testes, schema de banco sem migrations versionadas, mistura de responsabilidades em serviços e routes, e vários riscos de segurança de média e alta gravidade. Os problemas críticos mais urgentes envolvem (1) ausência de migrations de banco, (2) duplicação da lógica de planos/limites em três locais diferentes que já causou um bug de produção, (3) `painel/anuncios/route.ts` com lógica de descoberta de endpoint por tentativa e erro, e (4) imagens sem infraestrutura de armazenamento real.

**Nível de maturidade geral:** ⚠️ Médio-baixo para produção em escala.

---

## 1. Os 20 Problemas Mais Críticos (ordenados por impacto/urgência)

| # | Problema | Severidade | Área | Urgência |
|---|----------|-----------|------|----------|
| 1 | **Sem sistema de migrations** — o `MIGRATIONS_DIR` aponta para `src/infrastructure/database/migrations/` que **não existe**. `RUN_MIGRATIONS=false` está no `.env`. DDL em `payments.service.js` (linha 34) cria tabela em runtime. | 🔴 Crítica | DB | Imediata |
| 2 | **Lógica de limite de planos triplicada** — CPF=3/CNPJ=20 codificado em `create.controller.js:123`, `ads.plan-limit.service.js`, e `services/ads/limit.service.js`. Divergências silenciosas já causaram inconsistência. | 🔴 Crítica | Negócio | Imediata |
| 3 | **`painel/anuncios/route.ts` descobre endpoint por força bruta** — Itera 5 paths × 2 bases × 2 modos (multipart+JSON) = até 20 requisições HTTP para criar 1 anúncio. Sem auth verificada no BFF. Bypassa validação de plano. | 🔴 Crítica | Frontend/Segurança | Imediata |
| 4 | **Sem infraestrutura de armazenamento de imagens** — `image_url` retorna `/images/banner1.jpg` hardcoded em `account.service.js:341`. Upload de fotos no formulário de anúncio não tem backend de storage (S3/Cloudinary). | 🔴 Crítica | Produto | Imediata |
| 5 | **Duas implementações de JWT Strategy divergentes** — `src/modules/auth/jwt.strategy.js` (correto, com issuer/audience/type check) vs `src/modules/ads/auth/jwt.strategy.js` (sem issuer/audience, com secret hardcoded `super_secret_dev_key` como fallback). | 🔴 Crítica | Segurança | Imediata |
| 6 | **Cobertura de testes = 0%** — Apenas 1 arquivo de teste (`tests/config/env.test.js`) cobrindo 1 função utilitária. Nenhum teste de integração, nenhum teste de auth, nenhum teste de negócio. | 🔴 Crítica | Qualidade | Alta |
| 7 | **`wildcard **` em `next.config.ts` para imagens remotas** — `{ protocol: "https", hostname: "**" }` permite carregar imagens de qualquer hostname externo, abrindo para SSRF via Next.js Image Optimization e hospedagem de conteúdo malicioso. | 🔴 Crítica | Segurança | Alta |
| 8 | **`SELECT * FROM users` no login** — `auth.service.js:320` faz `SELECT *` incluindo `password_hash`, `locked_until`, `failed_attempts` e qualquer coluna sensível futura. Deve selecionar colunas explícitas. | 🔴 Alta | Segurança | Alta |
| 9 | **Rotas legadas em `src/routes/` sem mount** — 390+ arquivos JS no diretório `src/routes/` com controladores e lógica própria (`create.controller.js` com lógica de IA, plan-limit, etc.) que não são montados no `src/app.js`. São código morto ou remnante. O `src/app.js` só importa `routes/health.js` e `routes/metrics.js` desse diretório. | 🔴 Alta | Arquitetura | Alta |
| 10 | **Duas instâncias de sessão paralelas não integradas** — `auth.session.service.js` (cria sessão com `jwt.strategy.js` e insere em `refresh_tokens` sem `token_hash`) convive com `sessions/session.issuer.js` (que é o caminho canônico). `auth.service.js` usa só o canônico, mas `auth.session.service.js` está desatualizado e pode ser importado por módulos legados. | 🟠 Alta | Auth | Alta |
| 11 | **`AUTH_SESSION_SECRET` ausente no `.env`** — `sessionService.ts` usa fallback hardcoded `"cnc-dev-session-secret-local-only"` quando a variável não está definida. Em staging (sem `NODE_ENV=production`) a cookie de sessão pode ser forjada. | 🟠 Alta | Segurança | Alta |
| 12 | **`asyncHandler` triplicado** — Definição idêntica em `account.routes.js`, `auth.routes.js`, e `payments.routes.js`. Deveria ser exportado de `shared/middlewares`. | 🟡 Média | Manutenção | Média |
| 13 | **`getApiBaseUrl` com 9 implementações distintas** — Cada módulo de lib frontend reimplementa a resolução da URL do backend (`backend-account.ts`, `ad-detail.ts`, `analytics/public-events.ts`, `blog-page.ts`, `home/public-home.ts`, `leads/public-leads.ts`, `ads-search.ts`, `semantic-autocomplete.ts`, `territorial-public.ts`). Inclui URL hardcoded `https://carros-na-cidade-api.onrender.com` em `public-home.ts`. | 🟡 Média | Manutenção | Média |
| 14 | **`AdDetailsPage.tsx` duplicado** — `frontend/components/ads/AdDetailsPage.tsx` (870 linhas) e `frontend/lib/ads/components/ads/AdDetailsPage.tsx` (692 linhas) são versões divergentes do mesmo componente. | 🟡 Média | Manutenção | Média |
| 15 | **`dashboard_payload.stats.total_views` sempre zero** — `normalizeDashboardAd` hardcoda `views: 0` (linha 346 de `account.service.js`) sem consultar `ad_metrics`. O somatório de views no dashboard é sempre 0. | 🟡 Média | Produto | Média |
| 16 | **Arquivos de backend no diretório `frontend/`** — `frontend/ads.service.js`, `frontend/leadScoring.service.js`, `frontend/subscriberNotification.worker.js`, `frontend/subscribers.controller.js` são código Node.js/Express solto na raiz do Next.js. `ads.service.js` contém apenas `await queue.add(...)`. | 🟡 Média | Arquitetura | Média |
| 17 | **Dados mock/seed acessíveis em produção** — `frontend/lib/vehicle/public-vehicle.ts` importa e retorna `buyCars` de `car-data.ts` como fallback. `authService.ts` tem credenciais demo ativas em não-produção. Esses dados aparecem em páginas públicas quando o backend falha. | 🟡 Média | Produto/Segurança | Média |
| 18 | **`user_subscriptions` com PK composta `(user_id, plan_id, created_at)`** — A coluna `created_at` na PK é problemática: permite múltiplos registros para o mesmo (user, plan) e torna o upsert complexo. Não há `UNIQUE` em `(user_id, status='active')`. Pode gerar assinaturas duplicadas. | 🟡 Média | DB | Média |
| 19 | **52 workers com apenas `RUN_WORKERS=false` global** — O bootstrap registry permite ativar individualmente com `RUN_WORKER_*` env vars, mas o `.env` não documenta quais estão disponíveis. Workers duplicados existem em dois locais: `src/workers/*.worker.js` (flat) e `src/workers/seo/`, `src/workers/cities/`, `src/workers/growth/` (organizados). | 🟡 Média | Operações | Baixa |
| 20 | **`SELECT *` em múltiplos repositories** — `ads.repository.js`, `auth/sessions/refreshToken.repository.js`, `controllers/ads/show.controller.js`, `payments.service.js`, `seo-pages.repository.js` usam `SELECT *`, retornando colunas desnecessárias (incluindo dados sensíveis como hashes) e impossibilitando otimização de índices. | 🟡 Média | Performance | Média |

---

## 2. Arquitetura Geral

### 2.1 Separação de Camadas (Backend)

**Estado:** Parcialmente implementado.

```
src/
  modules/        ← arquitetura nova (ES modules, bem estruturada)
    auth/
    account/
    ads/
    payments/
    seo/
  controllers/    ← arquitetura legada (CommonJS require, ainda ativa)
  routes/         ← arquitetura legada (CommonJS require, NÃO montada no app.js)
  services/       ← mistura de antigo e novo
```

**Problema #9 (Crítico):** `src/routes/` e `src/controllers/` existem mas **não são montados** no `src/app.js` principal. O arquivo `src/routes/ads/index.js` define rotas com `auth = require("../../middlewares/auth")` (middleware legado), mas esse arquivo não é importado pelo app. Isso significa que:
- O módulo `create.controller.js` (com lógica de IA, plan-limit inline, SELECT *) está morto na prática.
- O arquivo `ads.service.js` na raiz do frontend (`frontend/ads.service.js`) contém `await queue.add("notifySubscribers", ad)` como único conteúdo — um fragmento abandonado.
- **Risco:** se alguém montar essa rota por engano, expõe lógica sem a validação atual do módulo `ads`.

**Recomendação:** Deletar `src/routes/` e `src/controllers/` inteiros ou mover o que for útil para `src/modules/`. Deletar `frontend/ads.service.js`, `frontend/leadScoring.service.js`, `frontend/subscriberNotification.worker.js`, `frontend/subscribers.controller.js`.

### 2.2 Dois Middlewares de Auth

| Middleware | Localização | Quem usa |
|-----------|------------|---------|
| **Novo (correto)** | `src/shared/middlewares/auth.middleware.js` | Todos os módulos em `src/modules/` |
| **Legado (deprecated)** | `src/middlewares/auth.js` | `src/routes/` (não montado) |

O middleware legado usa `jwt.verify` sem checar `type === "access"`, apenas verifica `HS256` e issuer/audience por padrão. Como as rotas que o usam não estão montadas, isso não é um risco ativo, mas é uma bomba-relógio.

### 2.3 Frontend: Organização de Libs e Componentes

A estrutura `frontend/lib/` mistura:
- Tipos (`dashboard-types.ts`, `search/ads-search.ts`)
- Funções de fetching (`backend-account.ts`, `ads/ad-detail.ts`, `home/public-home.ts`)
- Componentes React (`lib/ads/components/ads/AdDetailsPage.tsx`)
- Dados mock (`lib/car-data.ts`)
- SQL schema (`lib/db/schema.sql`)

**Recomendação:** Separar em `frontend/types/`, `frontend/api/` (fetchers), mover componentes para `frontend/components/`, remover dados mock para fixtures de teste.

---

## 3. Frontend

### 3.1 Server vs Client Components

**Bem feito:** Páginas de dashboard (`/dashboard/page.tsx`, `/dashboard-loja/page.tsx`) são Server Components que fazem o fetch seguro no servidor e passam `initialData` para o Client Component `DashboardClient`.

**Problema:** `/frontend/app/veiculo/[slug]/page.tsx` importa dados hardcoded de fallback:
```typescript
images: ["/images/banner1.jpg", "/images/banner2.jpg", "/images/hero.jpeg"],
```
Isso indica que a página de detalhe do veículo usa mock data quando o backend não responde.

### 3.2 `painel/anuncios/route.ts` (Problema #3 — Crítico)

Este BFF implementa descoberta de endpoint por força bruta:

```typescript
for (const base of bases) {          // 1-2 bases
  for (const path of candidatePaths) { // 5 paths: /ads, /api/ads, /public/ads, /dashboard/ads, /dealership/ads
    // tentativa multipart
    // tentativa JSON
  }
}
```

**Consequências:**
1. Até 20 requisições HTTP para criar 1 anúncio
2. Nenhuma verificação de sessão/token neste BFF — a autenticação depende dos headers repassados
3. Os 5 paths de candidatos incluem rotas inexistentes que retornarão 404 repetidamente
4. Bypassa completamente a verificação de limite de plano do módulo `ads`
5. Cria log de erros massivo

**Fix:** Usar `fetchBackendJson` de `backend-account.ts` com path fixo `/api/ads` e token de sessão.

### 3.3 Estado Global

Não há gerenciamento de estado global (Zustand, Jotai, Redux). Toda a lógica de estado está em `useState` local com `refreshDashboard()` em `DashboardClient.tsx`. Isso é adequado para a atual escala, mas precisará de refatoração ao crescer.

### 3.4 Acessibilidade

- Formulários em `LoginForm.tsx` e `RegisterPageClient.tsx` precisam de verificação de `aria-label` e `aria-describedby` para mensagens de erro.
- Botões de ação (toggle status, delete) em `DashboardClient` usam apenas texto; faltam `aria-label` descritivos.

### 3.5 Loading/Error Boundaries

- Existe apenas `frontend/app/error.tsx` como Error Boundary global.
- **Nenhum** `loading.tsx` em subpastas. Sem Suspense. Todas as páginas de dashboard bloqueiam a renderização enquanto o fetch completa.

---

## 4. Backend

### 4.1 Módulo `auth`

**Bem feito:**
- Rotação de refresh token com detecção de reuse attack (`REFRESH_REUSE` → revoga todos os tokens da família)
- Brute-force protection: `failed_attempts` e `locked_until` no banco
- Rate limiting por IP em `/login` (10 req/15min)
- Hash de token com SHA-256 para armazenamento seguro em `refresh_tokens.token_hash`

**Problema #5 (Crítico):** Dois `jwt.strategy.js`:

```javascript
// src/modules/auth/jwt.strategy.js — CORRETO
if (!JWT_SECRET) throw new Error("JWT_SECRET não definido no .env");
// Valida issuer, audience, type === "access"

// src/modules/ads/auth/jwt.strategy.js — INCORRETO/LEGADO
const JWT_SECRET = process.env.JWT_SECRET || "super_refresh_secret_dev_key"; // FALLBACK PERIGOSO
// Não valida issuer, audience, type
```

O `auth.middleware.js` usa o correto. O legado pode ser importado acidentalmente.

**Problema #10 (Alto):** Dois serviços de sessão:
- `sessions/session.issuer.js` — canônico, usa `token.signer.js`, armazena `token_hash`, preserva `family_id`
- `auth.session.service.js` — legado, usa `jwt.strategy.js` diretamente, insere `token` sem `token_hash`, sem `family_id`

### 4.2 Módulo `account`

`getDashboardPayload` executa **5 queries** sequenciais/paralelas:
1. `getAccountUser` (1 query)
2. `listOwnedAds` (1 query, paralelo com #1)
3. `queryPlansFromDatabase` (1 query, sequencial após #1+#2)
4. `getCurrentPlanIdFromDatabase` (1 query)
5. `hasSubscriptionHistory` (1 query)

Queries 3, 4 e 5 são sequenciais e poderiam ser paralelizadas com `Promise.all`. Queries 4 e 5 podem ser fundidas em uma única query com `LEFT JOIN`.

**Problema #15 (Médio):** `views: 0` hardcoded em `normalizeDashboardAd`. A tabela `ad_metrics` existe e é consultada em busca, mas não no dashboard.

### 4.3 Módulo `payments`

**Problema #1 (Crítico — DDL em runtime):**
```javascript
// payments.service.js:34
await ensurePaymentsSchema(); // CREATE TABLE IF NOT EXISTS payment_intents (...)
```
Executado em cada requisição de checkout. Deve ser movido para migration.

O schema em `frontend/lib/db/schema.sql` define as mesmas tabelas — é o único arquivo SQL do projeto, mas não está no sistema de migrations.

### 4.4 Módulo `ads`

**Problema #2 (Crítico — Lógica de limite triplicada):**

| Local | Lógica | Estado |
|-------|--------|--------|
| `src/modules/ads/ads.plan-limit.service.js` | `{ free: 3, start: 20, pro: null }` por `user.plan` | Módulo atual |
| `src/services/ads/limit.service.js` | CNPJ=20, CPF=3 por `document_type` | Serviço legado |
| `src/controllers/ads/create.controller.js:123` | `cnpj ? 20 : 3` inline | Rota não montada |
| `src/modules/account/account.service.js` | `getFreeLimit()` CPF=3, CNPJ verified=20 | Dashboard |

Nenhum desses serviços é chamado pelo `src/modules/ads/ads.routes.js` atual:
```javascript
// ads.routes.js — sem verificação de limite ao criar!
router.post("/", authMiddleware, validateCreateAdPayload, async (req, res) => {
  const ad = await adsService.create(req.body, req.user);
  // adsService.create → ads.panel.service.js → ads.repository.js — sem checkAdLimit()
```

**Isso significa que o módulo moderno de criação de anúncios não verifica limites de plano.**

---

## 5. Autenticação, Sessão e Segurança

### 5.1 Fluxo de Sessão

```
Browser → POST /api/auth/login (Next.js BFF)
  → authService.ts → authenticateAgainstBackend()
  → POST /api/auth/login (Express backend)
  → auth.service.js:login() → issueSession() → signAccessToken + signRefreshToken
  ← { accessToken, refreshToken, user }
  → createSessionToken() (HMAC-SHA256, 7 dias)
  → Set-Cookie: cnc_session (httpOnly, sameSite=lax)
```

**Vulnerabilidade #7 (Crítico):** `next.config.ts` tem `hostname: "**"` em `remotePatterns`. Qualquer URL externa pode ser otimizada pelo Image Optimization de Next.js, expondo o servidor a:
- SSRF (Server-Side Request Forgery via `/next/image?url=http://internal-host`)
- Uso de bandwidth para hospedar imagens de terceiros

**Fix imediato:**
```javascript
remotePatterns: [
  { protocol: "https", hostname: "cdn.carrosnacidade.com" },
  { protocol: "https", hostname: "*.cloudinary.com" },
]
```

### 5.2 CSRF

O cookie usa `sameSite: "lax"`, que protege contra CSRF para navegações top-level (GET). Mutations (POST, PATCH, DELETE) via AJAX com cookies de sessão são protegidas por `sameSite=lax` apenas se a origem for o próprio site. Não há token CSRF explícito, mas a arquitetura BFF (Next.js Route Handlers) e `credentials: "include"` em `fetch` mitiga parcialmente o risco em browsers modernos.

**Risco residual:** Requisições cross-origin de `<form>` com método POST sem token CSRF (formulários legados).

### 5.3 Webhook de Pagamentos

`verifyWebhookSignature` em `payments.service.js` implementa corretamente a validação HMAC do Mercado Pago. **Porém**, `MP_WEBHOOK_SECRET` não está no `.env` — sem ele, a validação é pulada com `return true`. Em produção, pagamentos falsos podem ser processados.

### 5.4 Autenticação no BFF (`painel/anuncios`)

O BFF de criação de anúncios passa os headers `Authorization` e `Cookie` do request para o backend — **mas não verifica** se o usuário está autenticado antes de disparar as tentativas. Se chamado sem cookie, tenta 20 endpoints sem autenticação.

---

## 6. Modelagem de Dados

### 6.1 Tabelas Identificadas (por queries no código)

| Tabela | Observações |
|--------|------------|
| `users` | `id, email, password_hash, document_type, document_verified, plan, failed_attempts, locked_until` |
| `ads` | `id, user_id, advertiser_id, title, price, brand, model, year, city_id, status, slug, search_vector, highlight_until, weight, priority` |
| `refresh_tokens` | `id, user_id, token, token_hash, family_id, expires_at, revoked, revoked_at` |
| `subscription_plans` | Definida no schema.sql |
| `user_subscriptions` | `user_id, plan_id, created_at (PK composta), status, expires_at, payment_id` |
| `payments` | `id, user_id, plan_id, mercado_pago_id, status, amount` |
| `payment_intents` | Criada inline em `ensurePaymentsSchema()` |
| `cities` | `id, slug` (referenciada em JOINs) |
| `ad_metrics` | `ad_id, views, clicks, leads, ctr` (materialized view ou tabela) |

### 6.2 Ausência de Migrations (Problema #1)

**`src/infrastructure/database/migrations/` não existe.** O sistema de migrations está implementado mas sem arquivos. O schema real do banco não está documentado no repositório. Qualquer deploy em ambiente novo requer reconstituição manual do schema.

**`frontend/lib/db/schema.sql`** define apenas 4 tabelas auxiliares de billing — está no lugar errado (frontend) e não é usado pelo sistema de migrations.

### 6.3 PK Composta em `user_subscriptions` (Problema #18)

```sql
primary key (user_id, plan_id, created_at)
```

Consequências:
- Um usuário pode ter N linhas para o mesmo (user_id, plan_id) com `created_at` diferentes
- A query de assinatura ativa busca por `ORDER BY created_at DESC LIMIT 1` — não garante unicidade
- O `upsert` em `payments.service.js` busca por `payment_id` (nullable) para fazer UPDATE

**Fix:** `primary key (id SERIAL)` + `UNIQUE (user_id)` com constraint parcial `WHERE status = 'active'`, ou pelo menos `UNIQUE (user_id, plan_id)`.

### 6.4 Ausência de Foreign Keys Explícitas

`ads.user_id` não tem FK explícita para `users.id` no schema documentado. `payment_intents.user_id`, `payment_intents.ad_id` igualmente. Isso permite orphan records.

### 6.5 Ausência de Índices Documentados

Nenhum `CREATE INDEX` no codebase. As seguintes colunas são filtradas frequentemente sem índice comprovado:
- `ads.status` (WHERE status = 'active')
- `ads.user_id` (WHERE user_id = $1)
- `ads.city_id` + `ads.brand` + `ads.model` (filtros combinados)
- `ads.search_vector` (GIN index presumido mas não documentado)
- `refresh_tokens.token_hash` (query principal de rotação)
- `user_subscriptions.user_id, status` (query de plano ativo)

---

## 7. Duplicação e Redundância de Código

### 7.1 Mapa de Duplicações

| Artefato Duplicado | Instâncias | Risco |
|-------------------|-----------|-------|
| Lógica de limite de plano | 4 locais | 🔴 Bug ativo |
| `getApiBaseUrl()` | 9 implementações | 🟠 Inconsistência de URL |
| `jwt.strategy.js` | 2 implementações | 🔴 Segurança |
| `AdDetailsPage.tsx` | 2 componentes (870+692 linhas) | 🟡 Manutenção |
| `asyncHandler` | 3 definições inline | 🟡 Manutenção |
| `slugify.js` | 2 versões (com/sem truncate) | 🟡 Inconsistência |
| `auth.session.service.js` vs `session.issuer.js` | 2 serviços | 🟠 Segurança |
| Planos em `DEFAULT_PLANS` | 3 locais (account.service, planStore.ts, authService mock) | 🟠 Inconsistência |
| Header component | `components/Header.tsx` re-exporta `layout/Header.tsx`; `shell/PublicHeader.tsx` separado | 🟡 Confusão |
| CarCard/VehicleCard | `components/ads/CarCard.tsx`, `components/common/VehicleCard.tsx`, `components/home/HomeVehicleCard.tsx` | 🟡 Manutenção |

### 7.2 Dados Mock em Caminhos de Produção

`frontend/lib/vehicle/public-vehicle.ts` usa `buyCars` (array hardcoded de 3 veículos) como resultado real de funções exportadas. Isso significa que páginas de catálogo retornam dados falsos quando o backend não está configurado:

```typescript
// public-vehicle.ts:387-404
return buyCars
  .filter(...)
  .map(...)
```

### 7.3 Credenciais Demo Locais

`authService.ts` define `LOCAL_DEMO_CREDENTIALS` com emails e senhas de desenvolvimento. Embora guarde com `process.env.NODE_ENV !== "production"`, em staging (NODE_ENV=development), essas credenciais estão ativas.

---

## 8. Tipagem e Contratos

### 8.1 Contrato Frontend↔Backend

| Campo | Backend retorna | Frontend espera | Problema |
|-------|----------------|-----------------|---------|
| Token de acesso | `accessToken` | `accessToken \| access_token \| token \| jwt` | Excesso de normalização indica contrato instável |
| Tipo de conta | `document_type` ("cpf"/"cnpj") | `document_type \| documentType \| type` | Backend inconsistente |
| ID do usuário | `id` ou `user_id` | `id \| user_id` | Dois campos para o mesmo conceito |
| Refresh token | `refreshToken` | `refreshToken \| refresh_token` | camelCase vs snake_case misturado |

O `authService.ts` normaliza 4-5 chaves alternativas para o mesmo campo — sinal de que o backend já retornou essas formas em diferentes épocas.

### 8.2 `BackendRefreshResponse` Duplicado

Definido em `backend-account.ts` E em `app/api/auth/refresh/route.ts` com estrutura idêntica. Deve ser exportado de um arquivo de tipos compartilhado.

### 8.3 Uso de `any`

Apenas 1 ocorrência explícita (`fipe-provider.ts:33`). A ausência de `any` é positiva, mas há uso de `Record<string, unknown>` como workaround em vários locais que merece tipagem mais precisa.

---

## 9. Performance e Escalabilidade

### 9.1 Dashboard: 5 Queries por Requisição

`getDashboardPayload` executa sequencialmente:
```
Promise.all([getAccountUser, listOwnedAds])   → 2 queries paralelas
  └→ resolveCurrentPlan
       ├→ queryPlansFromDatabase              → 1 query (pode ser cacheada por TTL)
       ├→ getCurrentPlanIdFromDatabase        → 1 query
       └→ hasSubscriptionHistory              → 1 query
```

As últimas 3 queries poderiam ser uma única query com CTE ou JOIN.

### 9.2 Search: Full Text Search com `search_vector`

O builder usa `plainto_tsquery('portuguese', $N)` + `ts_rank`. A presença de `a.search_vector` na query indica um tsvector gerado. Sem a definição do índice GIN documentada, é impossível confirmar que o índice existe no banco de produção.

### 9.3 Cache Strategy

**Backend:** Cache Redis com `cacheGet` middleware em rotas de busca/autocomplete. TTL razoável (20s autocomplete, 60s listagem). Invalidação por prefixo usa `SCAN` (OK para desenvolvimento, usar keyspace tags em escala).

**Frontend:** 
- FIPE API: `s-maxage=86400` ✅
- Dashboard: `force-dynamic` / `no-store` ✅ (necessário para dados de usuário)
- Páginas públicas (`/anuncios`): `revalidate = 60` — ISR ✅

**Problema:** `lib/home/public-home.ts` tem URL hardcoded `https://carros-na-cidade-api.onrender.com` como fallback. Em ambiente de staging apontando para prod, mudanças de dados afetam staging.

### 9.4 Next.js Image com Wildcard

`hostname: "**"` desabilita o cache de CDN por hostname para imagens. Cada imagem de qualquer domínio é processada como nova, sem possibilidade de configurar headers de cache por origem.

### 9.5 Workers: 52 Arquivos, Muitos Duplicados

```
src/workers/seo.worker.js          ← flat
src/workers/seo/seo.worker.js      ← organizado (mesma função?)
src/workers/growth.processor.js
src/workers/growthBrain.worker.js
src/workers/growth/growth-brain.worker.js  ← terceira versão?
```

Existe duplicação de workers com lógica potencialmente divergente. Com `RUN_WORKERS=false` isso não impacta produção hoje, mas ao habilitar workers pode haver conflitos.

---

## 10. Qualidade de Código e Manutenção

### 10.1 Arquivos Grandes

| Arquivo | Linhas | Problema |
|---------|--------|---------|
| `frontend/services/authService.ts` | 622 | Mistura auth local, backend auth, register, password reset, login aliases |
| `frontend/components/ads/AdDetailsPage.tsx` | 870 | Um único componente com formulário de contato, galeria, detalhes, relacionados |
| `src/modules/payments/payments.service.js` | 806 | DDL + lógica de negócio + integração MP + webhook em um arquivo |
| `frontend/services/planStore.ts` | ~400 | Dados mock + tipos + lógica de validação + store |

### 10.2 Console.log em Produção

96 ocorrências de `console.log/warn/error` em módulos de produção. O backend tem `shared/logger.js` (estruturado, Pino) — deve substituir todos os `console.*`.

### 10.3 Comentários de Dívida Técnica Explícita

```javascript
// auth.service.js:201
// ATENÇÃO: a verificação de e-mail está temporariamente desabilitada no login
// Quando o fluxo de e-mail for ativado: remover o comentário abaixo

// auth.session.service.js:1
// DEPRECATED: Use src/modules/auth/sessions/session.issuer.js
```

Esses TODO/ATENÇÃO acumulados indicam features incompletas entregues em produção.

---

## 11. Testabilidade

**Cobertura atual: ~0%**

- 1 arquivo de teste (`tests/config/env.test.js`, 3 casos)
- Framework configurado (Vitest) ✅
- Sem testes para: auth, dashboard, payments, ad creation, plan limits
- Sem mocks de banco ou `pg`
- Sem fixtures de dados
- Nenhuma integração de CI que execute testes

---

## 12. Dívida Técnica Consolidada

### Dívida Crítica (bloqueia escala ou produção segura)
1. Ausência de migrations → impossível reproduzir schema em novo ambiente
2. Lógica de plano duplicada → bugs de produção silenciosos
3. JWT strategy legada com secret hardcoded → risco de bypass de auth
4. `payment_intents` criada em runtime → DDL em hot path
5. Imagens sem storage real → produto incompleto

### Dívida Alta (risco de incidente)
6. `AUTH_SESSION_SECRET` sem fallback seguro em staging
7. `wildcard **` em next.config → SSRF
8. `SELECT *` em queries de login → exposição de dados sensíveis
9. Webhooks de pagamento sem `MP_WEBHOOK_SECRET` → fraude possível
10. Rotas legadas não montadas, mas presentes → confusão de onboarding

### Dívida Média (impacta manutenção e crescimento)
11. 9 implementações de `getApiBaseUrl`
12. `AdDetailsPage` duplicado em 1562 linhas totais
13. `asyncHandler` triplicado
14. Sem loading/error boundaries nas rotas privadas
15. Dados mock em caminhos de produção
16. `total_views = 0` no dashboard
17. PK composta problemática em `user_subscriptions`

---

## 13. Plano de Refatoração por Fases

### Fase 1 — Segurança e Estabilidade (1-2 semanas)

**Objetivo:** Eliminar riscos de segurança ativos e garantir integridade do banco.

| Tarefa | Arquivo(s) | Prioridade |
|--------|-----------|-----------|
| Criar `src/infrastructure/database/migrations/` com todas as tabelas documentadas | Novo | 🔴 |
| Mover `ensurePaymentsSchema()` para migration | `payments.service.js` | 🔴 |
| Deletar `src/modules/ads/auth/jwt.strategy.js` | Deleção | 🔴 |
| Adicionar `AUTH_SESSION_SECRET` ao `.env.example` e validação no startup | `sessionService.ts` | 🔴 |
| Adicionar `MP_WEBHOOK_SECRET` ao `.env.example` e bloquear webhook sem secret | `payments.service.js` | 🔴 |
| Restringir `remotePatterns` em `next.config.ts` | `next.config.ts` | 🔴 |
| Trocar `SELECT * FROM users` por colunas explícitas no login | `auth.service.js` | 🟠 |
| Deletar arquivos de backend no frontend | `frontend/*.js` | 🟠 |

### Fase 2 — Consolidação de Lógica de Negócio (2-3 semanas)

**Objetivo:** Eliminar duplicações que causam bugs.

| Tarefa | Arquivo(s) |
|--------|-----------|
| Criar `src/shared/utils/plan-limits.js` com única fonte de verdade | Novo |
| Importar e usar em `ads.panel.service.js`, remover de `create.controller.js` e `services/ads/limit.service.js` | Múltiplos |
| Deletar `src/routes/` e `src/controllers/` (ou arquivar em branch) | Deleção |
| Deletar `auth.session.service.js` | Deleção |
| Criar `src/shared/middlewares/asyncHandler.js` e remover inline | 3 routes |
| Centralizar `getApiBaseUrl` em `frontend/lib/api-base.ts` | 9 arquivos |
| Escolher um `AdDetailsPage` canônico e deletar o outro | 2 componentes |
| Corrigir `normalizeDashboardAd` para buscar views de `ad_metrics` | `account.service.js` |

### Fase 3 — Qualidade e Testabilidade (3-4 semanas)

**Objetivo:** Cobertura de testes mínima e observabilidade.

| Tarefa | Cobertura Alvo |
|--------|---------------|
| Testes de integração: fluxo de login/refresh/logout | auth |
| Testes unitários: validação de plano, limite de ads | account/plan |
| Testes de integração: criação de anúncio | ads |
| Testes de webhook: assinatura MP | payments |
| Testes E2E (Playwright): login → dashboard → criar anúncio | E2E crítico |
| Substituir `console.*` por `logger.*` | 96 ocorrências |
| Adicionar `loading.tsx` em `/dashboard`, `/dashboard-loja` | UX |

### Fase 4 — Produto e Escalabilidade (4-6 semanas)

| Tarefa |
|--------|
| Implementar storage de imagens (Cloudflare R2 / Cloudinary) |
| Adicionar índices GIN/B-tree no banco (migrations) |
| Parallelizar queries no `getDashboardPayload` |
| Implementar `generateStaticParams` para páginas de veículo populares |
| Corrigir PK de `user_subscriptions` com migration |
| Configurar CI com testes obrigatórios antes de merge |
| Remover dados mock de caminhos de produção |

---

## 14. Apêndice: Checklist de Segurança

- [x] JWT com issuer/audience/type validados (módulo canônico)
- [x] Refresh token rotation com reuse detection
- [x] Brute-force protection (failed_attempts + locked_until)
- [x] Rate limiting em /login (10 req/15min)
- [x] CORS configurado com allowlist
- [x] Helmet habilitado
- [x] httpOnly cookies para sessão
- [x] Webhook signature validation (quando `MP_WEBHOOK_SECRET` configurado)
- [ ] **AUTH_SESSION_SECRET** sem fallback seguro em staging
- [ ] **JWT strategy legada** com secret hardcoded
- [ ] **Wildcard hostname** em Next.js image remotePatterns
- [ ] **MP_WEBHOOK_SECRET** ausente no .env
- [ ] **SELECT \*** em login retorna dados sensíveis
- [ ] **CSRF token** explícito ausente (mitigado parcialmente por sameSite=lax)
- [ ] **File upload** sem validação de tipo/tamanho no backend
- [ ] **Storage de imagens** inexistente (arquivos ficam em memória/perdidos)

---

*Auditoria realizada em 2026-04-01. Total de arquivos analisados: 626. Principais ferramentas: análise estática de código, leitura de queries SQL, revisão de fluxos de autenticação e lógica de negócio.*
