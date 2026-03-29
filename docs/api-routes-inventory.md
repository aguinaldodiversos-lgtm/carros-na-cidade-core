# Inventário da API HTTP — produção vs legado

**Anúncios (mapa + política de um único caminho):** `src/modules/ads/README.md` (seção “Resumo operacional”). Integrações não montadas: `src/modules/integrations/README.md`.

**Última revisão:** consolidação de duplicidades (eventos de anúncio + remoção de legado morto `routes/ads`, `controllers/ads`, `routes/payments.js`).

**Entrypoint HTTP:** apenas `src/index.js` → `import app from "./app.js"`. Não há outro servidor Express montando rotas no repositório.

**Processos separados (não são a API REST principal):**

- `npm run workers` → `src/workers/bootstrap.js` (filas/jobs; não expõe o mesmo `app`).

---

## 1. Rotas oficiais (montadas em `src/app.js`)

Todas as integrações novas devem usar **exclusivamente** estes prefixos e módulos em `src/modules/`.

### Raiz e probes

| Método | Caminho | Origem |
|--------|---------|--------|
| `HEAD` | `/` | `app.js` |
| `GET` | `/` | `app.js` (JSON meta) |
| `GET` | `/health/meta` | `app.js` |

### Infra

| Método | Caminho | Router |
|--------|---------|--------|
| `GET` | `/health` | `src/routes/health.js` |
| `GET` | `/metrics` | `src/routes/metrics.js` |

### `/api/public` — `src/modules/public/public.routes.js`

| Método | Caminho | Notas |
|--------|---------|--------|
| `GET` | `/api/public/home` | |
| `GET` | `/api/public/cities/resolve` | |
| `GET` | `/api/public/cities/search` | |
| `GET` | `/api/public/cities/by-id/:id` | |
| `GET` | `/api/public/cities/:slug` | |
| `GET` | `/api/public/cities/:slug/brand/:brand` | |
| `GET` | `/api/public/cities/:slug/brand/:brand/model/:model` | |
| `GET` | `/api/public/cities/:slug/opportunities` | |
| `GET` | `/api/public/cities/:slug/below-fipe` | |

### `/api/public/seo` — `src/modules/public/public-seo.routes.js`

Prefixo efetivo: `/api/public/seo` (montado em `app.use("/api/public/seo", publicSeoRoutes)`).

| Método | Caminho completo (exemplos) |
|--------|-----------------------------|
| `GET` | `/api/public/seo/sitemap`, `/sitemap/type/:type`, `/sitemap/region/:state`, `/internal-links`, `/sitemap.xml` |

### `/api/auth` — `src/modules/auth/auth.routes.js`

Inclui: `POST /login`, `/refresh`, `/logout`, `/register`, `/verify-document`, `/forgot-password`, `/password/forgot`, `/reset-password`, `/password/reset`, `/verify-email`, `/email/verify`, `/email/resend`, `GET /me`, etc.

### `/api/account` — `src/modules/account/account.routes.js`

Planos públicos `GET /api/account/plans` (antes do `authMiddleware`); demais rotas exigem JWT.

### `/api/payments` — `src/modules/payments/payments.routes.js`

`POST /create`, `/subscription`, `/webhook`; `GET /webhook`.

### `/api/leads` — `src/modules/leads/leads.routes.js`

Ex.: `POST /whatsapp`.

### `/api/ads` — `src/modules/ads/ads.routes.js`

Inclui: `GET /facets`, `/search`, `/`, `GET /:identifier`, `POST /`, `PUT/DELETE /:id`, mais autocomplete.

### Eventos de anúncio (`ad_events`)

| URL | Router | Implementação |
|-----|--------|----------------|
| `POST /api/ads/event` | `ads.events.routes.js` | `ad-events.ingest.js` → `recordAdEvent` |
| `POST /api/events` | `events.routes.js` | **Mesmo handler** (`recordAdEvent`) |

O frontend usa **`/api/ads/event`**. `POST /api/events` permanece por compatibilidade; qualquer mudança na regra de insert deve ser feita só em `src/modules/ads/ad-events.ingest.js`.

---

## 2. Legado não montado em produção

Os roteadores CommonJS que viviam em `src/routes/*` (exceto `health.js` / `metrics.js`) foram **removidos** — não havia import em `app.js`; duplicavam `src/modules/*`.

### `src/controllers/` — não usados pela API oficial (`app.js`)

Nenhum arquivo em `src/controllers/` é importado por `src/modules/**` (a API oficial usa controllers/services dentro de `modules/`).

Pasta `controllers/ads/` foi **removida** (duplicava o módulo oficial). Restantes: `auth/*`, `analytics/*`, `alerts/*`, `integrations/createAdFromApi.controller.js`.

### `src/middlewares/` (legado CommonJS)

Usados só pelos roteadores legado (`auth`, `apiTokenAuth`, etc.), não pelo pipeline ESM de `app.js`.

### `src/legacy/services-ads/` — CommonJS morto para o servidor atual

Código antigo de criação de anúncio, limites e IA de texto (**não importado** por `app.js` nem por `modules/*`). Mantido só como referência; o caminho ativo é **`src/modules/ads/`** (ver `src/modules/ads/README.md`).

A pasta `src/services/ads/` ficou apenas com `README.LEGACY.md` apontando para `legacy`.

### `src/modules/integrations/` — router ESM **não montado**

Detalhes e comparação com o legado CommonJS: `src/modules/integrations/README.md` (nada disso em `app.js` até registro explícito).

---

## 3. Política para novas correções

1. **Novas features e correções de API:** usar somente `src/modules/**` e montar em `src/app.js` se for rota HTTP nova.
2. **Não adicionar** rotas em `src/routes/*` além de `health.js` / `metrics.js`; não estender `src/controllers/*` sem plano de migração para `modules/`.
3. **Eventos de anúncio:** alterar apenas `ad-events.ingest.js`; manter os dois URLs (`/api/ads/event` e `/api/events`) ou remover o alias numa fase futura com aviso aos clientes.
4. **Legado restante:** `src/controllers/*`, `src/middlewares/*` (CommonJS), `src/legacy/*` — não montados em `app.js` até migração explícita.

---

## 4. Referência rápida — ordem de montagem em `app.js`

A ordem importa para rotas dinâmicas: rotas mais específicas em `ads.routes.js` (`/search`, `/facets`, …) vêm antes de `GET /:identifier`.
