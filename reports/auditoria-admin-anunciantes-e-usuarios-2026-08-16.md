# AUDITORIA — ADMIN ANUNCIANTES / USUÁRIOS

Data: 2026-08-16
Escopo: somente leitura. Nenhum código, migration, rota ou query foi alterado.

---

## STATUS

**CONCLUÍDA**

---

## REPOSITÓRIO

- **branch:** `main`
- **HEAD:** `086a1e4d9693a54aab8bf2eb3e4aec844c1b2804` (`merge: phase 3.1 whatsapp visit handoff`)
- **working tree:** limpo, exceto 1 arquivo não rastreado — `reports/fase-4-0-auditoria-venda-para-lojas-2026-08-15.md` (relatório da auditoria anterior). Nenhum arquivo modificado.
- **commits locais à frente de `origin/main`:** nenhum (`git log origin/main..HEAD` vazio).

---

## ROTA ATUAL

| Camada | Arquivo | Função |
|---|---|---|
| frontend (lista) | `frontend/app/admin/anunciantes/page.tsx` | `AdminAnunciantes()` |
| frontend (detalhe) | `frontend/app/admin/anunciantes/[id]/page.tsx` | `AdminAnuncianteDetalhe()` |
| guard de shell | `frontend/app/admin/layout.tsx` | `AdminLayout()` → `requireAdminSession()` |
| client HTTP | `frontend/lib/admin/api.ts` | `adminApi.advertisers.list()` → `adminFetch()` |
| hook | `frontend/lib/admin/useAdmin.ts` | `useAdminFetch()` |
| BFF (proxy) | `frontend/app/api/admin/[...path]/route.ts` | `proxy()` |
| guard do BFF | `frontend/lib/admin/server-admin-session.ts` | `assertAdminSession()` / `requireAdminSession()` |
| backend (rota) | `src/modules/admin/admin.routes.js:189-200` | `GET /advertisers` |
| backend (auth) | `src/shared/middlewares/auth.middleware.js` + `src/shared/middlewares/role.middleware.js` | `authMiddleware` + `requireAdmin()` |
| service | `src/modules/admin/advertisers/admin-advertisers.service.js:16` | `listAdvertisers()` (passa-fio) |
| repository | `src/modules/admin/advertisers/admin-advertisers.repository.js:4-46` | `listAdvertisers()` |

### FLUXO

```
browser (/admin/anunciantes)
  → AdminLayout (server) → requireAdminSession()   [redirect se não-admin]
  → page.tsx → useAdminFetch → adminApi.advertisers.list({limit:30, offset, ...filtros})
  → GET /api/admin/advertisers?limit=30&offset=0[&search=...][&status=...]   (BFF Next)
  → route.ts#proxy → assertAdminSession() → Bearer accessToken
  → GET  {BACKEND}/api/admin/advertisers?...                                 (Express)
  → authMiddleware → requireAdmin()
  → admin.routes.js GET /advertisers  → advertisersService.listAdvertisers
  → admin-advertisers.repository.js#listAdvertisers
  → PostgreSQL
```

---

## FONTE DE VERDADE ATUAL

**Resposta à pergunta central da seção 3: opção (B) — a página lista TODOS os `advertisers`.**

Não é (A) users, não é (C) "users que possuem advertiser" (o efeito prático é igual, mas a tabela inicial é `advertisers`, o que muda tudo na hora de decidir arquitetura), e não é (D) "users que possuem ads" (o JOIN em `ads` é `LEFT`).

SQL real (`admin-advertisers.repository.js:16-33`), verbatim:

```sql
SELECT
   adv.id, adv.name, adv.email, adv.phone, adv.company_name,
   adv.status, adv.plan, adv.user_id, adv.city_id,
   adv.suspended_at, adv.blocked_at, adv.status_reason,
   adv.created_at, adv.updated_at,
   u.role AS user_role, u.document_type, u.email AS user_email,
   COUNT(a.id) FILTER (WHERE a.status = 'active')  AS active_ads_count,
   COUNT(a.id) FILTER (WHERE a.status != 'deleted') AS total_ads_count
 FROM advertisers adv
 LEFT JOIN users u ON u.id = adv.user_id
 LEFT JOIN ads   a ON a.advertiser_id = adv.id
 [WHERE adv.status = $1]
 GROUP BY adv.id, u.id
 ORDER BY adv.created_at DESC NULLS LAST
 LIMIT $n OFFSET $m
```

- **tabela inicial:** `advertisers` (`FROM advertisers adv`)
- **joins:** `LEFT JOIN users` (só para enriquecer: role, document_type, user_email) e `LEFT JOIN ads` (só para contar)
- **filtros:** apenas `adv.status = $1`, quando `status` vem na query
- **order:** `adv.created_at DESC NULLS LAST` — **não determinístico** (sem desempate por `id`)
- **pagination:** offset/limit

Count separado: `SELECT COUNT(*)::int AS total FROM advertisers adv [WHERE ...]` — **sem os JOINs**, e corretamente, porque o `where` só referencia `adv`. Este endpoint **não** tem o bug de "missing FROM-clause entry" que mordeu o `/comprar` na Fase 3; se um filtro por `users` for adicionado no futuro, o `countQuery` quebra — é o mesmo padrão.

---

## POR QUE USUÁRIOS NÃO APARECEM

- **causa:** a listagem começa em `FROM advertisers`. Quem não tem linha em `advertisers` é **estruturalmente invisível** — não existe cláusula a remover; a tabela de partida é a errada para a pergunta "quem tem conta no portal?".
- **arquivo:** `src/modules/admin/advertisers/admin-advertisers.repository.js`
- **função:** `listAdvertisers()`
- **linha:** 25 (`FROM advertisers adv`)
- **efeito:** contas que apenas se cadastraram, fizeram login, publicaram procura em Compradores Ativos ou nunca publicaram anúncio **não** têm linha em `advertisers` e portanto não aparecem em lugar nenhum do admin — nem nesta tela, nem em qualquer outra (não existe endpoint admin de `users`; ver §11).

Não é INNER JOIN, não é `WHERE EXISTS ads`, não é serializer. É a tabela raiz.

---

## USUÁRIOS SEM ANÚNCIOS JÁ APARECEM (seção 8)

Sim — e a observação do print está correta em invalidar a hipótese "precisa ter anúncio".

- **Pessoa precisa possuir advertiser mas pode ter zero ads?** Sim. `LEFT JOIN ads` + `COUNT(...) FILTER` produz `0` sem excluir a linha. Um advertiser com zero anúncios aparece com `ANÚNCIOS = 0`.
- **Advertiser permanece depois que todos os ads são apagados?** Sim. Nada apaga `advertisers`. O `DELETE FROM ads` do seed E2E (`scripts/e2e-seed.mjs`) é exatamente esse caso: cria advertiser e depois zera os anúncios.
- **Cadastro de determinada origem já cria advertiser?** Sim, mas **nenhum** deles é o cadastro de conta. Ver §ORIGENS abaixo.

Ou seja: o requisito real é **ter linha em `advertisers`**, e não "ter anúncio".

---

## USERS

Schema derivado das migrations (`002`, `009`, `012`, `018`, `020`). Não há colunas inventadas nesta lista.

| coluna | nullable | default | usada onde | serve p/ tela admin? |
|---|---|---|---|---|
| `id` BIGSERIAL | não | PK | tudo | sim (ID) |
| `email` TEXT | não (baseline) | — | login, sessão | sim (EMAIL) — índice único em `LOWER(email)` quando não há duplicados |
| `password_hash` / `password` | sim | — | `auth.service` (resolve em runtime) | **nunca** |
| `name` | sim | — | sessão, `advertisers.name` | sim (NOME) |
| `role` | sim | `'user'` | `requireAdmin()` | sim (papel: user/admin) |
| `plan` TEXT | sim | `'free'` | legado; snapshot em `advertisers.plan` | não — usar `plan_id` |
| `plan_id` TEXT FK→`subscription_plans` | sim | — | **fonte de verdade do plano efetivo** | sim |
| `document_type` | sim | — | `account_type` (CPF/CNPJ/pending), `requireDealerAccount` | sim (TIPO) |
| `document_number` | sim | — | cadastro | **PII sensível** — hoje nunca é lido pelo admin |
| `document_verified` | sim | `false` | `cnpj_verified` na sessão | sim |
| `phone`, `whatsapp` | sim | — | herdado por `advertisers` no ensure | PII — cuidado |
| `city` TEXT (texto livre) | sim | — | **nada decisório** (fallback removido na Fase 0.1) | fraco — não é `city_id` |
| `address` | sim | — | herdado por `advertisers` | PII |
| `email_verified` / `is_email_verified` | sim | `true` / — | login | sim |
| `failed_attempts` | sim | `0` | brute-force | operacional |
| `locked_until` | sim | — | **é o "bloqueio" de user** | sim (status derivado) |
| `email_verification_token/_expires`, `reset_token/_expires` | sim | — | fluxo de senha | **nunca expor** |
| `created_at`, `updated_at` | sim | `NOW()` | — | sim (CADASTRO) |

**Não existem** em `users`: `status`, `last_login`, `city_id`, `is_test`/`is_e2e`, `deleted_at`. Isso é decisivo:

- **`users` NÃO tem coluna `status`.** O único estado negativo de uma conta é `locked_until > NOW()` (proteção anti-brute-force), que é temporário e automático — não é moderação. **Não existe hoje "bloquear usuário" no produto.**
- **`users` NÃO tem `last_login`** e **não existe tabela `login_attempts`** (grep confirmou: `logLoginAttempt` não persiste em tabela dedicada; só `refresh_tokens` existe, criada na migration 009). Uma coluna "ÚLTIMO ACESSO" na futura tela **não tem fonte de dados hoje**.

**roles:** `USER_ROLE` em `src/shared/constants/status.js` — apenas `user` e `admin`.

---

## ADVERTISERS

| coluna | observação |
|---|---|
| `id` BIGSERIAL | PK |
| `user_id` | **BIGINT no CREATE, TEXT no `ADD COLUMN IF NOT EXISTS`** (migration 003 linhas 8 e 21 divergem). Índice comum `advertisers_user_id_idx` — **NÃO é UNIQUE** |
| `city_id` BIGINT | NOT NULL no CREATE; obrigatório e validado contra `cities` na criação (Fase 0.1) |
| `name`, `slug` | `slug` obrigatório; gerado como `slugify(name-userId)` com retry em colisão |
| `email`, `company_name`, `phone`, `whatsapp`, `mobile_phone`, `telephone`, `telefone`, `address` | contato; as 3 últimas variantes de telefone são **legado morto** (nenhum caminho de escrita as usa) |
| `plan` TEXT | `DEFAULT 'free'` — **snapshot congelado na criação**, não é o plano efetivo |
| `status` TEXT | `DEFAULT 'active'`; `active` / `suspended` / `blocked` |
| `verified` BOOLEAN | `false` |
| `suspended_at`, `blocked_at`, `status_reason` | migration 014 |
| `created_at`, `updated_at` | — |

Respostas diretas:

- **`advertisers.user_id` é UNIQUE?** **Não.** Só `CREATE INDEX advertisers_user_id_idx` (não-único), migration 003:34. Confirmado também pelo comentário da Fase 0.1 em `purchase-intents.repository.js:303` ("não tem UNIQUE (nem nas migrations, nem em produção — verificado na Fase 0.1)").
- **Um user pode possuir vários advertisers?** **Sim, pelo schema.** O `ensureAdvertiserForUser` protege contra isso em runtime (advisory lock + `SELECT ... LIMIT 1` antes do INSERT), mas nada no banco impede. O código de Compradores Ativos já trata explicitamente o caso multi-linha (`listActiveAdvertisersByUserId`, sem `LIMIT`, com fail-closed em conflito).
- **Existe advertiser sem user?** Pelo schema sim (`user_id` NOT NULL no CREATE, mas o `ADD COLUMN` de bancos legados não impõe). A FK `advertisers_user_id_fkey` (migration 008, `ON DELETE RESTRICT`) é **condicional e tolerante a falha** — o bloco captura `WHEN OTHERS` e só emite `RAISE NOTICE`. Existe até um script de diagnóstico citado no arquivo: `scripts/report-advertiser-integrity.mjs`. O `getAdvertiserById` também trata `!advertiser.user_id` como caso real ("anunciante legado").
- **Existe user sem advertiser?** **Sim — é o caso comum, e é a causa desta auditoria.**

### QUANDO O ADVERTISER É CRIADO

Fonte única: `src/modules/advertisers/advertiser.ensure.service.js#ensureAdvertiserForUser` (idempotente, com `pg_advisory_xact_lock`).

Chamadores reais (grep exaustivo):

1. `src/modules/ads/ads.publish.eligibility.service.js:32` → `ensureAdvertiserForPublishing(userId, { cityId })` — **publicação do primeiro anúncio.** Único caminho de produção.
2. `scripts/e2e-seed.mjs` → `ensureAdvertiserForUser(userId, { cityId, source: "e2e-seed" })` — seed de testes.

Nada mais. Em particular, **`POST /api/account/plans/eligibility` deixou de criar advertiser na Fase 0.1** (comentário em `account.routes.js:50` e teste `tests/account/plans-eligibility-no-side-effect.test.js`).

**Cadastro de conta NÃO cria advertiser.** `auth.service.js#register` faz um único `INSERT INTO users` e emite sessão — nenhuma chamada ao ensure.

> **Achado adicional (código morto, risco latente):** `src/services/advertiser.service.js#getOrCreateAdvertiser(email)` faz `INSERT INTO advertisers (email, plan, status)` **sem `user_id`, sem `city_id` e sem `slug`** — exatamente a corrupção que a Fase 0.1 eliminou. É CommonJS (`require("../config/db")`), e o grep não encontrou **nenhum** importador. Está morto hoje; se alguém o revivesse, criaria advertisers órfãos e sem slug (que o `ensure` considera erro 500 de schema). Candidato a remoção numa varredura de código morto — ver [`project_dead_code_sweep`].

---

## ADS — RELAÇÃO

`ads.advertiser_id → advertisers.id` (índice `ads_advertiser_id_idx`). **Não existe `ads.user_id`.** Toda posse de anúncio é resolvida por `ads.advertiser_id → advertisers.user_id` (mesmo modelo usado em `ad-ownership.js` e nas ofertas da Fase 2).

Consequência estrutural: **anúncio não pode existir sem advertiser** — daí o `ensure` no pipeline de publicação.

---

## LIFECYCLE REAL

```
cadastro (POST /api/auth/register)
   └─> INSERT INTO users                    ← ÚNICA escrita
       advertiser: NÃO existe
       ads:        NÃO existem

login / navegação / notificações
   └─> nada é criado

Compradores Ativos (publicar procura, conta CPF ou pending)
   └─> INSERT INTO purchase_intents (buyer_user_id → users.id)
       advertiser: NÃO é criado, NÃO é exigido

publicar 1º anúncio
   └─> ads.publish.eligibility.service
        └─> ensureAdvertiserForPublishing(userId, { cityId: <cidade do anúncio> })
             └─> INSERT INTO advertisers  ← PRIMEIRA E ÚNICA criação em produção
        └─> INSERT INTO ads (advertiser_id)

           ▼
   a partir daqui a conta passa a existir em /admin/anunciantes
```

**Esse é o ponto exato em que uma pessoa "nasce" para o admin: a publicação do primeiro anúncio.** Antes disso ela é invisível para a operação, mesmo tendo conta, sessão, notificações e procuras ativas.

---

## ORIGENS DE CONTA

| origem | cria `users`? | cria `advertisers`? | cria `ads`? | tipo de conta | status inicial | aparece em /admin/anunciantes? |
|---|---|---|---|---|---|---|
| Cadastro público (`POST /api/auth/register`) | **sim** | não | não | `pending` se `document_type` vazio; senão CPF/CNPJ | `role='user'`, `plan='free'`, `email_verified=true` | **NÃO** |
| Cadastro PF (CPF informado) | sim | não | não | CPF | idem | **NÃO** |
| Cadastro PJ (CNPJ informado) | sim | não | não | CNPJ | idem | **NÃO** |
| Publicação do 1º anúncio | não (já existe) | **sim** (`ensureAdvertiserForPublishing`) | sim | herda | `advertisers.status='active'`, `verified=false`, `plan` = snapshot | **SIM** |
| Compradores Ativos (publicar procura) | não | **não** | não | CPF/pending | — | **NÃO** |
| Simulador de financiamento | não | não | não | — | — | — |
| Admin (`/admin/*`) | **não existe endpoint de criação de usuário** | não | não | — | — | — |
| `scripts/create-initial-admin.mjs` | sim | não | não | — | `role='admin'` | **NÃO** |
| `scripts/promote-admin.js` | não (promove) | não | não | — | `role='admin'` | **NÃO** |
| `scripts/e2e-seed.mjs` | **sim** (`cpf@carrosnacidade.com` + lojistas CNPJ) | **sim** (via ensure) | apaga e recria | CPF e CNPJ | `active` / também `suspended` e `blocked` de propósito | **SIM** |
| OAuth / social login | **não existe** no código | — | — | — | — | — |
| Mercado Pago | não cria conta; só `user_subscriptions` / `payments` | não | não | — | — | — |

**Nenhuma origem além de publicar anúncio (e do seed E2E) cria advertiser.**

---

## COMPRADORES ATIVOS

- **`purchase_intents.buyer_user_id`** → `BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE` (migration `050_purchase_intents.sql:51`). Aponta **direto para `users`**, por decisão explícita documentada no próprio SQL: *"A procura pertence à CONTA do comprador, não a um advertiser: quem procura é pessoa física e pode nunca ter anunciado nada."*
- **Um buyer precisa de advertiser?** **Não.** `purchase-intents.routes.js` monta **sem** `requireDealerAccount` (comentário na linha 4: quem publica procura é conta CPF ou `pending`).
- **Esses usuários podem existir apenas em `users`?** **Sim — e é o caso projetado.**
- **`/admin/anunciantes` consegue enxergá-los?** **Não.** Não têm linha em `advertisers`. Um comprador ativo com 5 procuras publicadas é, para o admin, inexistente.
- **Lado lojista:** `purchase-intents.dealer.routes.js:35` usa `requireDealerAccount()`, que lê `req.user.account_type === 'CNPJ'` — derivado de `users.document_type`, **não** de `advertisers`. A área do lojista depende de `advertisers` apenas para resolver a cidade (`listActiveAdvertisersByUserId`).

---

## STATUS

Três conceitos distintos, hoje colapsados numa única coluna na tela:

| conceito | onde vive | valores | quem escreve |
|---|---|---|---|
| **status do anunciante** | `advertisers.status` | `active` / `suspended` / `blocked` (`ADVERTISER_STATUS`) | admin, via `PATCH /advertisers/:id/status` |
| **trava de segurança do usuário** | `users.locked_until` (timestamp) | — | automático (brute-force) |
| **status do anúncio** | `ads.status` | 10 valores (`AD_STATUS`) | dono + moderação |

**O que a tela atual mostra:** `advertisers.status` — a coluna STATUS = "Ativo" do print vem de `adv.status`, renderizada por `AdminStatusBadge`.

**`users` não tem status.** Portanto:

- **"users ativo + advertiser bloqueado"** → possível e comum (é o que o bloqueio administrativo faz hoje: a pessoa continua logando, mas a loja sai do ar).
- **"users bloqueado + advertiser ativo"** → **não é representável hoje**. Não há como suspender uma conta; só a loja.

> **Achado — divergência de interpretação de `advertisers.status` NULL/''.**
> Todo o resto do produto trata `status` NULL ou `''` como **ativo**, por decisão explícita e documentada: `COALESCE(NULLIF(BTRIM(adv.status), ''), 'active') = 'active'` em `purchase-intents.repository.js#advertiserIsOperational` e em `public-dealer.service.js:57`. O motivo: as migrations 003 e 012 re-adicionam a coluna com `ADD COLUMN IF NOT EXISTS ... DEFAULT 'active'`, e **DEFAULT não preenche linha preexistente** — logo, lojista legado legítimo pode ter `status` NULL.
> **O admin não segue essa regra.** `admin-advertisers.repository.js:10` filtra `adv.status = $1` **cru**. Consequência: filtrar STATUS="Ativo" na tela **esconde** anunciantes legados que o resto da plataforma considera ativos e que estão no ar publicamente. E no badge eles renderizam como o fallback cinza `—`. Divergência real, hoje mascarada porque produção é nova (1 cidade, 1 lojista).

---

## PLANO

- **fonte da coluna PLANO na LISTA:** `advertisers.plan` (TEXT, `DEFAULT 'free'`), lido cru em `admin-advertisers.repository.js:19` e renderizado em `page.tsx:118`.
- **Isso é um snapshot congelado.** `ensureAdvertiserForUser` grava `plan: account.raw_plan || "free"` **no momento da criação** e **nunca mais atualiza**. Nenhum fluxo de pagamento, concessão manual ou expiração escreve em `advertisers.plan`.
- **A fonte de verdade real é `users.plan_id`** (FK → `subscription_plans`), lida por `account.service.resolveCurrentPlan` e sincronizada tanto pelo webhook do Mercado Pago quanto pela concessão manual (`createGrant` / `revokeGrant` / `expireDueGrants`) — ver [`project_admin_plan_grant`].
- **O DETALHE já resolve certo:** `getAdvertiserById` chama `expireDueGrantsForUser` + `buildAdvertiserPlanInfo(user_id)`, devolvendo `effective_plan_id`, `effective_plan_name`, `plan_origin_kind` (`free`/`paid`/`grant`) e `plan_grant`.

> **Achado:** lista e detalhe do mesmo anunciante **podem discordar sobre o plano**. Um lojista com plano pago ou com cortesia ativa aparece como "free" na coluna PLANO da lista e como "Loja Profissional / Cortesia comercial" ao abrir o detalhe. Não é bug de query — é a coluna errada.

---

## CONTAGEM DE ANÚNCIOS

`admin-advertisers.repository.js:23-24`:

```sql
COUNT(a.id) FILTER (WHERE a.status = 'active')   AS active_ads_count
COUNT(a.id) FILTER (WHERE a.status != 'deleted') AS total_ads_count
```

A tela usa `adv.active_ads_count ?? adv.total_ads_count ?? "—"` (`page.tsx:120`).

- **Regra efetiva:** a coluna ANÚNCIOS mostra **apenas anúncios `active`**. Como `active_ads_count` é sempre um número (nunca `null` — `COUNT` devolve `0`), o `??` **nunca cai** para `total_ads_count`. O fallback é morto.
- Um anunciante com 8 anúncios pausados/vendidos/arquivados aparece como **"0"** — indistinguível de quem nunca publicou.
- `total_ads_count` usa `!= 'deleted'` em vez da lista canônica `AD_NON_DELETED_STATUSES` de `shared/constants/status.js`. Equivalente hoje, mas é literal solta (o projeto exige consumir a constante).
- Ambos os `COUNT` vêm de um **único** `LEFT JOIN ads` — não há multiplicação de linhas. Correto.

---

## BUSCA

> **ACHADO PRINCIPAL Nº 2 — o campo de busca não faz nada.**

- A UI declara o filtro em `page.tsx:58`: `{ key: "search", label: "Busca", placeholder: "Nome, email ou documento…" }`.
- O client envia: `adminFetch("advertisers", { params: { limit, offset, search: "..." } })` → a query string chega ao backend como `?search=joao`.
- **O backend descarta.** `admin.routes.js:192-196` monta `filters` com **apenas** `limit`, `offset` e `status`. `req.query.search` **nunca é lido** nesta rota (o grep por `search` em `admin.routes.js` só acerta a rota de **blog**, linha 837).
- O repositório **não tem** nenhum `ILIKE`, nenhum parâmetro de busca (grep por `search|ILIKE` em `src/modules/admin/advertisers/*.js`: zero ocorrências).

**Efeito real:** digitar qualquer coisa e clicar "Buscar" recarrega a mesma lista sem filtro algum. O usuário admin não recebe erro — recebe a lista inteira e conclui que "não filtrou direito" ou que "o registro não existe". Silencioso, exatamente o padrão que já custou caro neste projeto ([`feedback_silent_failure_hides_outage`]).

Detalhes acessórios:
- **colunas realmente buscadas:** nenhuma.
- **documento:** o placeholder promete "documento", mas `users.document_number` **nem sequer é selecionado** pela query. Buscar por documento exigiria JOIN + coluna nova.
- **telefone:** não buscável.
- **SQL injection:** não aplicável — não há concatenação de `search`. O `status`, esse sim, é parametrizado (`$1`) corretamente. A construção dinâmica de `WHERE` usa índices de placeholder, sem interpolar valor. **Sem risco de injeção.**

---

## FILTRO STATUS

- **opções:** hardcoded em `page.tsx:14-18` — `active` / `suspended` / `blocked`, mais a opção `""` = "Todos" injetada por `AdminFiltersBar:41`. Não vêm do backend.
- **alinhamento:** batem com `ADVERTISER_STATUS` de `shared/constants/status.js` (duplicação literal no frontend, sem teste de sincronia — mesmo padrão de risco do catálogo de opcionais, que *tem* teste; ver [`project_vehicle_options`]).
- **coluna filtrada:** `advertisers.status`.
- **status vazio:** `adminFetch` remove params `""` antes de montar a query string (`api.ts:42`) e o backend faz `req.query.status || undefined` → cláusula `WHERE` inteiramente omitida. Comportamento correto ("Todos").
- **ressalva:** ver o achado de NULL/`''` em §STATUS — "Ativo" no filtro ≠ "ativo" no resto do produto.

---

## PAGINAÇÃO

- **tipo:** offset/limit (não é cursor).
- **limit:** `30` fixo no frontend (`page.tsx:20`); default do backend é `50`; o client tem `{ limit: 50, ...p }` — o `p.limit=30` sobrescreve. **Não há teto máximo:** `parseIntParam(req.query.limit, 50)` aceita qualquer inteiro ≥ 0, então `?limit=100000` é honrado pelo banco. Não é exploitable por não-admin (a rota é admin-only), mas é um pé no acelerador sem freio.
- **`limit=0`** passa na validação (`parsed >= 0`) e produz `LIMIT 0` — lista vazia, sem erro.
- **total count:** sim, query separada; alimenta `AdminPagination`.
- **UI:** `AdminPagination` **se auto-oculta quando `pages <= 1`** — com poucos registros em produção, a paginação simplesmente não aparece no print. Ela existe.
- **ORDER BY:** `adv.created_at DESC NULLS LAST` — **sem desempate**. Com `created_at` idêntico (import em lote, seed, migração) ou NULL, a ordem entre páginas é indefinida: registros podem repetir numa página e sumir de outra. É o clássico furo de paginação por offset sem chave estável. **Para uma lista de `users`, que vai crescer muito mais, isso deixa de ser teórico.**

---

## ORDENAÇÃO

- **atual:** `ORDER BY adv.created_at DESC NULLS LAST` (repository linha 30).
- Não há `ORDER BY` configurável pela UI; nenhuma coluna é clicável.
- **Serve para `users`?** Como default, sim (mais recente primeiro é o que a operação quer). Mas precisa de `, id DESC` como desempate para paginação determinística.

---

## AUTH ADMIN

Três camadas, todas server-side. Este é o ponto **mais bem resolvido** de toda a tela.

1. **Shell (server component):** `frontend/app/admin/layout.tsx` → `await requireAdminSession()` com `export const dynamic = "force-dynamic"`. Redireciona antes de renderizar qualquer filho. Também aplica `robots: { index: false, follow: false }`.
2. **BFF:** `frontend/app/api/admin/[...path]/route.ts#proxy` → `assertAdminSession(session)` em **todos** os métodos (GET/POST/PUT/PATCH/DELETE). Retorna 401 (não autenticado), 403 (não-admin) ou 503 (backend indisponível para validar). A role é resolvida chamando `/api/auth/me` no backend, com cache em memória de **30s** por `userId`.
3. **Backend:** `src/modules/admin/admin.routes.js:40-41` — `router.use(authMiddleware); router.use(requireAdmin());` aplicados **antes de qualquer rota**, para o router inteiro. `requireAdmin()` = `requireRole('admin')`, que exige `req.user` (401) e `role === 'admin'` (403).

**Um usuário comum consegue chamar diretamente o endpoint administrativo?** **Não.** Testado e verificado:
- Pelo BFF: barrado em `assertAdminSession` (403).
- Direto no backend Express: barrado por `requireAdmin()` (403), independentemente do BFF.
- `tests/admin/admin-routes-contract.test.js` cobre exatamente isso ("blocks regular user from admin endpoints") e passa — **executei a suíte**: 16 testes verdes. Confirmei também que `supertest` **está instalado** (o teste tem `if (!hasSupertest) return`, que o transformaria em no-op silencioso — não é o caso aqui).

`frontend/middleware.ts` **não** menciona `/admin`; a proteção não depende dele. `useAdminGuard()` existe em `useAdmin.ts` mas **não é usado** por esta página (o layout já cobre) — código órfão candidato à varredura de código morto.

Observação sobre o cache de 30s: revogar um admin leva até 30s para propagar no BFF/shell, mas o backend Express revalida a cada request. Aceitável.

---

## PII

**No payload da lista** (`/api/admin/advertisers`), o admin recebe:

| campo | origem | renderizado na tela? |
|---|---|---|
| `name` | `advertisers.name` | **sim** |
| `email` | `advertisers.email` | **sim** (completo, sem máscara) |
| `user_email` | `users.email` | não — **só no payload** |
| `phone` | `advertisers.phone` | não — **só no payload** |
| `company_name` | `advertisers` | sim |
| `document_type` | `users.document_type` | não — só no payload |
| `user_role` | `users.role` | não — só no payload |
| `city_id`, `user_id`, timestamps, `status_reason` | — | parcial |

**No detalhe** (`/api/admin/advertisers/:id`), a query é `SELECT adv.*` — devolve **todas** as colunas de `advertisers`, incluindo `whatsapp`, `mobile_phone`, `telephone`, `telefone` e `address`, mesmo as que a tela não mostra.

**O que NÃO é exposto (bom):** `document_number` (CPF/CNPJ) nunca é selecionado em nenhuma query do módulo admin de anunciantes; nenhum hash de senha; nenhum token de reset; nenhum IP; não há data de nascimento no schema.

**Riscos para a futura tela de usuários:** partir de `users` traz `document_number`, `password_hash`, `reset_token`, `email_verification_token` para perto do serializer. `SELECT *` em `users` seria um vazamento imediato de credenciais. **A futura tela deve usar lista explícita de colunas — nunca `SELECT *`.**

---

## DETALHE DO ANUNCIANTE

- **existe:** sim.
- **rota:** `/admin/anunciantes/[id]` (`frontend/app/admin/anunciantes/[id]/page.tsx`, 506 linhas). Página cheia, não modal/drawer. Acessada por clique na linha da tabela (`page.tsx:111`).
- **fonte de dados:** `GET /advertisers/:id` (+ plano efetivo resolvido), `GET /advertisers/:id/ads`, `GET /plans`.
- **ações disponíveis:** ver §AÇÕES.

Coexistência com um futuro `/admin/usuarios/[id]`: **viável sem duplicar**, desde que a divisão seja por domínio — identidade/conta no detalhe de usuário, operação comercial (loja, plano, anúncios, moderação) no detalhe de anunciante, com link cruzado entre os dois. As ações de anunciante **não** devem ser reimplementadas na tela de usuário.

---

## AÇÕES ADMINISTRATIVAS

| ação | endpoint | permissão | audit log | risco |
|---|---|---|---|---|
| Ativar anunciante | `PATCH /api/admin/advertisers/:id/status` `{status:"active"}` | `requireAdmin` | **sim** (`change_advertiser_status`) | baixo; limpa `suspended_at`/`blocked_at`/`status_reason` |
| Suspender | idem, `{status:"suspended", reason}` | `requireAdmin` | sim | **alto** — tira os anúncios do ar |
| Bloquear | idem, `{status:"blocked", reason}` | `requireAdmin` | sim | **alto** |
| Conceder plano manual | `POST /advertisers/:id/plan-grant` | `requireAdmin` | sim | médio — escreve `user_subscriptions` **e** `users.plan_id`; bloqueia sobrescrever assinatura paga viva |
| Revogar concessão | `POST /advertisers/:id/plan-grant/cancel` | `requireAdmin` | sim | médio — reverte `users.plan_id` |
| Listar anúncios do anunciante | `GET /advertisers/:id/ads` | `requireAdmin` | leitura | — |

**Não existe:** excluir anunciante, editar dados do anunciante, impersonar, editar/bloquear usuário, resetar senha, excluir conta. Nenhuma ação foi executada nesta auditoria.

Auditoria: `recordAdminAction` grava em `admin_actions` (admin_user_id, action, target_type, target_id, old_value, new_value, reason) e **nunca lança** — falha vira `logger.error`. Aceitável aqui (não deve bloquear a operação), mas significa que a trilha de auditoria é *best-effort*.

**Nota de arquitetura relevante para a futura tela:** as ações de plano são endereçadas por **`advertiserId`**, embora o alvo real da escrita seja **`users.plan_id` + `user_subscriptions.user_id`**. O service faz `findById(advertiserId)` só para descobrir o `user_id`. Ou seja, **hoje só se consegue conceder plano a quem tem advertiser** — um comprador ativo CPF sem loja não pode receber cortesia, mesmo que o modelo de dados suporte perfeitamente. É uma limitação de endereçamento na rota, não do domínio.

---

## MENU ADMIN

- **arquivo:** `frontend/components/admin/AdminTopbar.tsx`, constante `NAV` (linhas 6-21).
- **estrutura atual (14 itens, nesta ordem):** Dashboard · Moderação · Denúncias · Anúncios · Anunciantes · Comercial · SEO · Conteúdo · Blog · Chamados · Pagamentos · Métricas · Analytics · Configurações. (O "Admin" do canto direito não é item de menu — é o rótulo do avatar, linha 58.)
- **item ativo:** `isActive(href)` — `pathname === "/admin"` para o Dashboard; `pathname.startsWith(href)` para o resto. Funciona, mas é frágil por prefixo: um futuro `/admin/usuarios-teste` marcaria `/admin/usuarios` como ativo.
- **suporta novo item facilmente?** Sim — basta uma entrada no array. **Mas ver §MOBILE:** o 15º item agrava um problema que já existe.
- **onde "Usuários" deveria entrar futuramente:** **imediatamente antes de "Anunciantes"** (posição 5), formando o par identidade → operação: `… Anúncios · Usuários · Anunciantes · Comercial …`. Alternativa defensável: logo após "Dashboard", tratando-a como a visão-base de contas.

**Não adicionei nenhum item.**

---

## MOBILE

Avaliação **estrutural** (leitura de classes Tailwind). Não renderizei a página nos 5 breakpoints: `/admin` exige sessão de admin válida contra o backend, e obter credenciais para uma auditoria somente-leitura não se justifica. Onde digo "quebra", a evidência é a ausência de classe responsiva no código, não uma medição.

| largura | tabela | menu admin | filtros/busca | paginação |
|---|---|---|---|---|
| **360** | rola horizontalmente (OK: `overflow-x-auto`, `page.tsx:77`) | **quebra** | empilha (OK: `flex-wrap`) | OK |
| **390** | idem | **quebra** | OK | OK |
| **412** | idem | **quebra** | OK | OK |
| **768** | idem | **quebra** (14 itens não cabem) | OK | OK |
| **1440** | cabe inteira | OK | OK | OK |

Detalhamento:

- **Tabela — OK.** `<div className="overflow-x-auto">` envolve a `<table>`; as 8 colunas rolam dentro do card sem estourar o `body`. A coluna DATA tem `whitespace-nowrap`. Padrão correto e já reutilizável.
- **Menu admin — problema real e pré-existente.** `AdminTopbar` linha 33: `<div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-5">` e linha 41: `<nav className="flex items-center gap-1">`. **Não há `flex-wrap`, não há `overflow-x-auto`, não há `hidden md:flex`, não há hambúrguer, não há `shrink-0` nos itens.** Itens flex têm `min-width: auto` por padrão e não encolhem abaixo do conteúdo do texto, logo os 14 links estouram o container. Em telas estreitas isso produz **scroll horizontal na página inteira** (ou corte, conforme o `overflow` do ancestral) — o admin fica difícil de navegar no celular. Adicionar "Usuários" torna o 15º item; não cria o problema, mas piora.
- **Filtros — OK.** `AdminFiltersBar` usa `flex flex-wrap items-end gap-3`; os controles empilham. O input tem largura fixa `w-44` (176px), que cabe em 360px. O botão "Mais filtros" só aparece com >3 filtros — aqui há 2, então não aparece.
- **Paginação — OK.** `flex items-center justify-between`, textos curtos.

Para a futura tela de usuários: o padrão `overflow-x-auto` já resolve, e é o caminho de menor risco (mesma linguagem visual). Cards empilhados seriam mais legíveis no celular, mas criariam um segundo padrão de tabela no admin — não recomendo sem decisão de produto.

---

## TESTES EXISTENTES

| arquivo | testes | o que cobre |
|---|---|---|
| `tests/admin/admin-advertisers-service.test.js` | 6 | `changeAdvertiserStatus` (status inválido, não encontrado, suspensão + auditoria) e `getAdvertiserById`. **Repositório inteiramente mockado** |
| `tests/admin/admin-routes-contract.test.js` | 10 | Controle de acesso: usuário comum barrado; admin acessa `/ads`, `/advertisers`, `/payments`, `/metrics/*`… |
| `tests/admin/advertiser-plan-grant-service.test.js` | — | Concessão manual de plano |
| `tests/account/plans-eligibility-no-side-effect.test.js` | — | Prova que `/plans/eligibility` **não** cria advertiser (regressão da Fase 0.1) |
| `tests/ads/publish-supplies-explicit-city.test.js` | — | Publicação sempre envia `city_id` explícito ao `ensure` |
| `tests/admin/admin-dashboard-repository.test.js` | — | Overview/KPIs |

**Executei (somente leitura):**

```
tests/admin/admin-advertisers-service.test.js   ✓ 6 testes
tests/admin/admin-routes-contract.test.js       ✓ 10 testes
→ 2 arquivos, 16 testes, todos verdes
```

**Lacunas de cobertura relevantes:**
- **Zero testes para `listAdvertisers`** — nem do SQL, nem do contrato de filtros. É exatamente por isso que o parâmetro `search` pôde ser adicionado na UI e nunca implementado no backend sem nada quebrar.
- Nenhum teste de sincronia entre `STATUS_OPTIONS` (frontend) e `ADVERTISER_STATUS` (backend).
- Nenhum teste de paginação/ordenação determinística.
- Nenhum teste frontend da tabela de anunciantes.

---

## PERFORMANCE

Classificação: **ACEITÁVEL hoje, PROBLEMÁTICA em escala** — e o veredito muda para a futura tela de `users`.

Análise da query de listagem:
- **2 LEFT JOINs** (`users`, `ads`) + **GROUP BY adv.id, u.id** + 2 `COUNT(...) FILTER`.
- **Sem multiplicação de linhas:** um único join 1:N (`ads`), agregado pelo `GROUP BY`. `users` é 1:1. Correto.
- **Sem N+1:** uma query para dados + uma para o total. A `getAdvertiserById` do detalhe dispara 3 queries em `Promise.all` (`buildAdvertiserPlanInfo`) — aceitável para uma tela de detalhe.
- **Problema estrutural:** `LIMIT/OFFSET` é aplicado **depois** do `GROUP BY`. O Postgres precisa varrer `advertisers`, juntar **todos** os `ads` e agregar tudo, para só então descartar e devolver 30 linhas. Com 27 anúncios e 1 lojista em produção isso é instantâneo. Com dezenas de milhares de anúncios, cada abertura da tela agrega o catálogo inteiro.
- **OFFSET profundo** degrada linearmente (problema clássico) e, sem `ORDER BY` determinístico, também é incorreto.
- **`COUNT(*)` sem filtro** na tabela toda é seq scan — barato em `advertisers`, **caro em `users`**.

Para a futura `/admin/usuarios`, `users` será a maior tabela de contas do sistema, e replicar este padrão (identidade + N contadores agregados numa query só) é o caminho mais rápido para uma tela lenta. Ver §ARQUITETURA DA QUERY.

---

## ÍNDICES

Existentes e relevantes (todos verificados nas migrations):

| tabela | índice | tipo |
|---|---|---|
| `users` | `users_email_lower_key` em `LOWER(email)` | **UNIQUE** — mas só se não houver duplicados no momento da migration; senão cai para `users_email_lower_idx` **não-único** (migration 002:38-52) |
| `users` | `users_plan_id_idx` (`plan_id`) | comum (020:131) |
| `users` | `users_email_verification_token_idx`, `users_reset_token_idx` | parciais (012) |
| `advertisers` | `advertisers_user_id_idx` (`user_id`) | **comum — NÃO único** (003:34) |
| `advertisers` | `advertisers_slug_idx`, `advertisers_city_id_idx` | comuns |
| `ads` | `ads_advertiser_id_idx`, `ads_status_city_id_idx`, `ads_created_at_idx`, `ads_slug_idx` | comuns (004:57-60) |

**Ausentes e que importam para as decisões desta auditoria:**
- **`users.created_at`** — não existe índice. É exatamente o `ORDER BY` que uma tela de usuários usaria. (`ads` tem o equivalente; `users` não.)
- **`users.role`** — sem índice (irrelevante em baixa cardinalidade, mas relevante se a tela filtrar por admin).
- **`advertisers.created_at`** — sem índice; é o `ORDER BY` da tela atual.
- **`advertisers.status`** — sem índice; é o único filtro da tela atual.
- **UNIQUE em `advertisers.user_id`** — ausente, com as consequências descritas em §ADVERTISERS.

Nenhum índice foi criado.

---

## CONTAS E2E/TESTE

- **Como são criadas:** `scripts/e2e-seed.mjs`, executado manualmente/por CI contra o banco de teste. Cria `cpf@carrosnacidade.com` (senha fixa `123456`, `document_type='cpf'`, `role='user'`) e, desde as Fases 2/2.1, lojistas CNPJ em cidades diferentes — deliberadamente incluindo um **suspenso** e um **bloqueado**, para provar que a moderação corta acesso.
- **Como são identificadas:** **não são.** Não existe coluna `is_test`, flag, `metadata`, nem convenção de domínio de e-mail imposta por código. A única "marca" é o e-mail literal `cpf@carrosnacidade.com` e nomes como "E2E CPF Demo" — convenção humana, não dado estruturado.
- **Cleanup:** o seed é idempotente (`UPDATE` e, se `rowCount === 0`, `INSERT`) e apaga os `ads` do usuário E2E. **Não apaga contas.**
- **Ambiente:** o script força `DATABASE_URL` a partir de uma conexão passada. ⚠️ Vale lembrar o footgun já registrado ([`project_database_url_localhost_footgun`]): produção é `DATABASE_URL1`, e `db.js` lê `DATABASE_URL`. Um seed rodado sem cuidado escreve no banco errado.
- **Uma futura `/admin/usuarios` mostraria essas contas?** **Sim, todas** — não há como distingui-las por dado.

**Opções futuras (não decidir agora, e não ocultar silenciosamente):**
1. **Mostrar todos** (mais honesto; o admin vê a realidade do banco). Recomendado como default.
2. Filtro opcional "ocultar contas de teste", baseado numa **lista de e-mails/padrões versionada em constante** — sem coluna nova, reversível.
3. Coluna `users.is_test` — solução limpa, mas exige migration e disciplina de escrita em todos os seeds. Só vale se contas de teste virarem rotina em produção.

Ocultar por heurística sem sinalizar na UI seria repetir o padrão de falha silenciosa que já custou caro neste projeto.

---

## ADMINISTRADORES

- **Mesma tabela?** **Sim.** Admin é `users.role = 'admin'`. Não há tabela separada, nem `admin_users`.
- Criados por `scripts/create-initial-admin.mjs` (a partir de env) ou `scripts/promote-admin.js`. **Não existe UI para promover/rebaixar admin.**
- O dashboard **já conta** admins: `admin-dashboard.repository.js:23-28` faz `COUNT(*) FILTER (WHERE role='admin') AS admins` e `FILTER (WHERE role='user' OR role IS NULL) AS regular`. Ou seja, **o número total de usuários já é visível no admin — mas não a lista.** É a prova mais curta de que a lacuna é de listagem, não de acesso a dados.
- **A futura tela deve listá-los?** Sim, e **com badge de papel visível**. Esconder admins criaria uma classe invisível de contas privilegiadas — pior para auditoria.
- **Risco de ação administrativa sobre admins:** hoje inexistente (não há ações sobre `users`). Se a futura tela ganhar ações (bloquear, resetar), é **obrigatório** um guard contra auto-bloqueio e contra rebaixar o último admin. Registrar agora, implementar depois.

---

## RISCO DE ALTERAR `/admin/anunciantes`

Mapeamento de dependências (grep exaustivo por `api/admin/advertisers` e `admin/anunciantes` em `frontend/`, `src/`, `scripts/`, `tests/`):

| consumidor | arquivo | tipo |
|---|---|---|
| Tabela da própria página | `frontend/app/admin/anunciantes/page.tsx:111` | navegação para o detalhe |
| Detalhe → volta | `frontend/app/admin/anunciantes/[id]/page.tsx:144` | navegação |
| **Dashboard admin** | `frontend/app/admin/page.tsx:162` | card "Anunciantes" + botão "ver todos" — **consome o mesmo endpoint de lista** |
| Menu | `frontend/components/admin/AdminTopbar.tsx:11` | link |
| Teste de contrato | `tests/admin/admin-routes-contract.test.js:91` | espera 200 |

- **Outras páginas linkam para ela?** Sim: o Dashboard (card + "ver todos").
- **APIs usadas fora do admin?** **Não.** `/api/admin/*` é montado atrás de `requireAdmin` e nenhum código público, worker, script ou relatório o consome.
- **Relatórios usam o endpoint?** Não. `admin-reports.*` tem repositório próprio.
- **Métricas dependem da query?** Não. `admin-dashboard.repository` e `admin-metrics.repository` têm SQL próprio (inclusive o `COUNT` de `users`).
- **Ações comerciais dependem do advertiser?** **Sim, e fortemente.** Concessão de plano, status/moderação de loja, ofertas da Fase 2, resolução de cidade do lojista e `ads.advertiser_id` — todos endereçados por `advertiserId`. O conceito de anunciante é **carga viva**, não legado.

**Conclusão de risco:** o blast radius de mexer nesta rota é pequeno em número de consumidores (4), mas o **conceito** que ela expõe é central para o produto. Alterar a *tabela raiz* da listagem existente (de `advertisers` para `users`) romperia o endereçamento por `advertiserId` de todas as ações comerciais — as ações passariam a receber um `userId` e teriam de resolver o advertiser (que pode não existir, ou ser mais de um). **Custo alto, ganho nenhum.** Criar uma superfície nova é estritamente mais barato e mais seguro.

---

## RECOMENDAÇÃO DE ARQUITETURA

**Opção (C): manter `/admin/anunciantes` e criar `/admin/usuarios` como tela nova.**

Rejeitadas, com motivo:
- **(A) Substituir** — destrói a operação comercial. As ações de plano/moderação são endereçadas por `advertiserId` e o detalhe do anunciante resolve plano efetivo, anúncios e concessões. Nada disso tem equivalente em `users`.
- **(B) Transformar/renomear** — colapsa dois conceitos que o próprio código separa com rigor (a migration 050 documenta a distinção em prosa: *"a procura pertence à CONTA do comprador, não a um advertiser"*). Além disso, `advertisers.user_id` **não é UNIQUE**: a relação é 1:N, então "uma linha por usuário" e "uma linha por anunciante" **não são a mesma lista** nem podem ser reconciliadas numa tela só sem mentir sobre uma das duas.
- **(D)** — não há solução melhor evidente no código.

A preferência conceitual do briefing está **confirmada pelo código**:

```
/admin/usuarios     = TODAS as contas          → FROM users
/admin/anunciantes  = subconjunto com loja     → FROM advertisers  (como já é)
```

**Decisões de arquitetura recomendadas:**

- **`/admin/anunciantes`: MANTER.** Sem redirect, sem renomear. É a tela de operação comercial e continua correta para o que faz.
- **`/admin/usuarios`: CRIAR.**
- **fonte de verdade:** `FROM users`, com colunas **explicitamente enumeradas** (jamais `SELECT *` — ver §PII). `LEFT JOIN` opcional para os agregados de atividade.
- **novo endpoint backend:** `GET /api/admin/users` em módulo próprio (`src/modules/admin/users/`), seguindo o padrão routes → service → repository já estabelecido. Herda `authMiddleware` + `requireAdmin()` automaticamente por estar sob `admin.routes.js`. **Nenhuma migration é necessária** para a listagem básica.
- **link cruzado:** no detalhe do usuário, se houver advertiser, um link para `/admin/anunciantes/[id]`. As ações comerciais **permanecem** onde estão.
- **corrigir junto (ou antes):** a busca morta em `/admin/anunciantes`. Copiar o padrão da tela atual significaria copiar um campo que não funciona.

### COMPONENTES REUTILIZÁVEIS

Reaproveitáveis **como estão**, sem qualquer acoplamento a advertiser (verificado lendo cada um):

| componente | por quê |
|---|---|
| `AdminLayout` (`app/admin/layout.tsx`) | guard genérico; a nova rota herda automaticamente por ser filha de `/admin` |
| `AdminTopbar` | basta uma entrada no array `NAV` |
| `AdminFiltersBar` | totalmente genérico (recebe `FilterDef[]`) |
| `AdminPagination` | genérico (`total`/`limit`/`offset`) |
| `AdminLoadingState` / `AdminErrorState` / `AdminEmptyState` | genéricos |
| `AdminStatusBadge` | genérico via `MAP`, com fallback cinza. **Precisará de novas chaves** se "status de usuário" for um conceito derivado (`locked`, `pending`, `admin`) — hoje o MAP não tem essas chaves e cairia no fallback |
| `useAdminFetch` | genérico |
| `adminFetch` + `extractAdminApiErrorMessage` (`lib/admin/api.ts`) | genéricos; adicionar `adminApi.users.*` ao mesmo objeto |
| BFF `app/api/admin/[...path]/route.ts` | **catch-all — já cobre `/api/admin/users` sem nenhuma alteração** |
| Padrão `overflow-x-auto` na tabela | copiar |

### COMPONENTES ESPECÍFICOS DE ADVERTISER — NÃO REUTILIZAR

- `AdvRow` / `AdvDetail` (tipos em `lib/admin/api.ts`) — modelam a loja, não a conta.
- `adminApi.advertisers.*` — endereçado por `advertiserId`.
- A tabela de `anunciantes/page.tsx` — as colunas EMPRESA, PLANO e ANÚNCIOS são conceitos de loja. **Copiar esse arquivo herdaria a busca quebrada e o `plan` congelado.**
- Todo o painel de plano/concessão do `[id]/page.tsx` (`REASON_OPTIONS`, `DURATION_OPTIONS`, diálogos de grant/revoke) — pertence ao domínio comercial.
- `STATUS_OPTIONS` de anunciante (`active`/`suspended`/`blocked`) — **não** se aplica a `users`, que não tem coluna de status.

---

## FUTURA LISTAGEM DE USUÁRIOS — CAMPOS CONFRONTADOS COM O SCHEMA REAL

| coluna proposta | existe no schema? | fonte | veredito |
|---|---|---|---|
| ID | sim | `users.id` | ✅ direto |
| NOME | sim | `users.name` (nullable) | ✅ direto, com fallback |
| EMAIL | sim | `users.email` | ✅ direto — **decidir mascaramento** (a tela atual mostra completo) |
| TIPO | sim | derivado de `users.document_type` | ✅ `pending` / `CPF` / `CNPJ` — usar a **mesma** derivação de `buildSessionUser`/`ACCOUNT_TYPE`, não uma nova |
| CIDADE | **parcialmente** | `users.city` é **TEXT livre**, sem FK, sem `city_id` | ⚠️ dado fraco e não confiável — a Fase 0.1 removeu deliberadamente qualquer decisão baseada nele. Alternativa real: cidade do **advertiser** (`advertisers.city_id`) ou da **procura** (`purchase_intents.city_id`), ambas com FK — mas aí não é "a cidade do usuário", é "a cidade da atividade dele". **Rotular com precisão ou omitir** |
| ATIVIDADE | derivável | contadores de `advertisers` / `ads` / `purchase_intents` | ⚠️ ver §ARQUITETURA DA QUERY — custo |
| STATUS | **NÃO EXISTE** | não há `users.status` | ❌ **só é possível derivar**: `locked_until > NOW()` → "Bloqueado (segurança)"; `email_verified=false` → "E-mail não verificado"; `role='admin'` → "Admin". Um badge "Ativo" cru seria **fabricar um dado que o banco não tem** |
| CADASTRO | sim | `users.created_at` | ✅ direto (sem índice — ver §ÍNDICES) |
| PLANO (extra) | sim | `users.plan_id` → `subscription_plans.name` | ✅ **é o dado certo**, ao contrário de `advertisers.plan` da tela atual |
| ÚLTIMO ACESSO | **NÃO EXISTE** | sem `last_login`, sem `login_attempts` | ❌ não implementável sem migration + escrita no login |

---

## ATIVIDADE DO USUÁRIO — RELAÇÕES EXISTENTES HOJE

```
users (id)
  ├── advertisers.user_id        (1:N — SEM UNIQUE)  → criado só ao publicar o 1º anúncio
  │     └── ads.advertiser_id    (1:N)               → ads NÃO tem user_id
  │           ├── leads.ad_id / leads.seller_id      (migration 043/047)
  │           └── ad_events.ad_id                    (migration 044)
  ├── purchase_intents.buyer_user_id  (1:N, FK, ON DELETE CASCADE)  → migration 050
  │     └── purchase_intent_offers    (migration 051)
  ├── user_subscriptions.user_id      (1:N — ledger de plano; source='admin_grant' p/ cortesia)
  ├── users.plan_id → subscription_plans.id          (plano EFETIVO)
  ├── user_notifications              (migration 049)
  ├── support_tickets                 (migrations 045/046)
  └── refresh_tokens                  (migration 009)

FUTURO (Fase 4.0 — venda para lojas):
  └── sale_requests.<user>   → NÃO EXISTE AINDA (não há migration 052+; última é 051)
```

Todas as relações necessárias para uma futura visão de atividade **já existem**. Nenhum agregador foi implementado.

---

## ARQUITETURA DA QUERY (seção 35)

**Recomendação: query de identidade simples na LISTA + agregações no DETALHE.**

Trade-offs à luz do código atual:

- **1 query monstruosa** (users + LEFT JOIN advertisers + LEFT JOIN ads + LEFT JOIN purchase_intents + COUNTs + GROUP BY): é a extrapolação natural do que `listAdvertisers` já faz — e é justamente onde o padrão atual **não escala** (§PERFORMANCE). Pior: com `advertisers.user_id` **sem UNIQUE**, um `LEFT JOIN advertisers` **multiplica linhas** — um usuário com 2 lojas apareceria 2×, ou os `COUNT`s de `ads` seriam inflados pelo produto cartesiano. Seria preciso `COUNT(DISTINCT ...)` ou subqueries — exatamente o tipo de complexidade que o briefing pede para evitar.
- **Identidade + agregação separada:** a lista faz `SELECT <colunas> FROM users [LEFT JOIN subscription_plans] ORDER BY created_at DESC, id DESC LIMIT/OFFSET` — rápida, previsível, sem risco de multiplicação. O detalhe (`/admin/usuarios/[id]`) faz as contagens de atividade em queries dedicadas (o padrão que `getAdvertiserById` **já usa** com `Promise.all` em `buildAdvertiserPlanInfo`).

Se um contador na lista for exigido pelo produto, a forma segura é **subquery escalar** (`(SELECT COUNT(*) FROM advertisers adv WHERE adv.user_id = u.id) AS stores_count`), que não multiplica linhas — nunca `LEFT JOIN` + `GROUP BY` sobre uma relação 1:N sem UNIQUE.

**A arquitetura atual não oferece solução melhor** — oferece justamente o contra-exemplo.

---

## DEPENDÊNCIAS COM FASE 4

- **Fase 4.0 (venda para lojas):** `sale_requests` **ainda não existe** (a última migration é `051_purchase_intent_offers.sql`; nenhum `sale_request` em migrations ou módulos — apenas os 3 eventos pré-reservados). A auditoria da Fase 4.0 já concluiu que a entidade **não pode** morar em `ads` (RLS exige advertiser que PF não tem). Isso **reforça** a recomendação desta auditoria: a Fase 4.0 vai produzir mais uma classe de pessoa que existe em `users` sem existir em `advertisers`. Sem `/admin/usuarios`, essas pessoas nascerão invisíveis para a operação — repetindo o problema hoje observado com os compradores ativos.
- **Fase 2/2.1 (Compradores Ativos):** já produz o mesmo tipo de conta invisível. `purchase_intents` é a fonte de verdade e aponta direto para `users`.
- **`resolveDealerCityId`:** a auditoria da Fase 4.0 recomendou promovê-lo antes da 4.2; nada nesta auditoria conflita com isso.
- **Concessão manual de plano:** endereçada por `advertiserId` (§AÇÕES). Se o produto quiser dar cortesia a um comprador ativo sem loja, será preciso um endpoint endereçado por `userId` — decisão para a fase de desenho, não para agora.

**Nenhum domínio protegido foi tocado:** `/comprar`, `/carros-em`, SEO, sitemap, pagamentos, Mercado Pago, Compradores Ativos, `purchase_intents`, `purchase_intent_offers`, WhatsApp Fase 3.1, ads públicos, Produto 2 e Fase 4 foram apenas **lidos**.

---

## RISCOS

1. **Vazamento de PII na tela nova.** Partir de `users` coloca `document_number`, `password_hash`, `reset_token` e `email_verification_token` no alcance de um `SELECT *`. **Mitigação obrigatória:** lista explícita de colunas no repositório + teste que falhe se colunas sensíveis aparecerem no payload.
2. **Multiplicação de linhas por `advertisers.user_id` sem UNIQUE.** Qualquer `LEFT JOIN advertisers` na listagem de usuários duplica registros silenciosamente. É o mesmo tipo de armadilha do `countQuery` da Fase 3 ([`project_countquery_missing_joins`]).
3. **Fabricar "STATUS" para usuário.** `users` não tem status. Um badge "Ativo" hardcoded seria um dado inventado na tela — o oposto do princípio de falhar alto adotado na Fase 0.1.
4. **Paginação não determinística** herdada do padrão atual (`ORDER BY created_at DESC` sem desempate). Em `users` — tabela que crescerá muito mais — produz registros repetidos/omitidos entre páginas.
5. **Contas de teste indistinguíveis** poluindo a operação sem sinalização (§CONTAS E2E).
6. **Menu admin já quebrado no mobile**; o 15º item piora.
7. **Copiar `anunciantes/page.tsx` como template** herdaria a busca morta, o `plan` congelado e o fallback `??` inútil da contagem.
8. **Risco operacional de auditoria/manutenção:** `DATABASE_URL` vs `DATABASE_URL1` ([`project_database_url_localhost_footgun`]) — qualquer script de verificação contra banco precisa confirmar o alvo antes.

---

## PENDÊNCIAS (documentadas, NÃO corrigidas)

| # | achado | arquivo | gravidade |
|---|---|---|---|
| 1 | **Busca de anunciantes não faz nada** — UI envia `search`, backend descarta | `admin.routes.js:192-196` + `page.tsx:58` | **alta** (falha silenciosa em ferramenta de operação) |
| 2 | Coluna PLANO da lista usa `advertisers.plan` (snapshot congelado) e **discorda do detalhe**, que resolve `users.plan_id` | `admin-advertisers.repository.js:19` | **alta** (decisão comercial sobre dado errado) |
| 3 | Filtro de status usa `adv.status = $1` cru, divergindo do `COALESCE(NULLIF(BTRIM(...)),'active')` usado no resto do produto — esconde legado ativo | `admin-advertisers.repository.js:10` | média |
| 4 | `ORDER BY adv.created_at DESC` sem desempate por `id` → paginação não determinística | `admin-advertisers.repository.js:30` | média |
| 5 | Contagem ANÚNCIOS só conta `active`; fallback `?? total_ads_count` é **código morto** (`COUNT` nunca é `null`) | `page.tsx:120` | média |
| 6 | `src/services/advertiser.service.js#getOrCreateAdvertiser` insere advertiser **sem `user_id`/`city_id`/`slug`** — órfão, sem importadores | `src/services/advertiser.service.js` | média (latente) |
| 7 | `limit` sem teto máximo (`?limit=999999` é honrado); `limit=0` aceito | `admin.routes.js:193` | baixa |
| 8 | `AdminTopbar` sem `flex-wrap`/`overflow-x-auto`/hambúrguer → menu estoura no mobile | `AdminTopbar.tsx:33,41` | média (UX) |
| 9 | `useAdminGuard()` não é usado por nenhuma página (layout server-side já cobre) — órfão | `lib/admin/useAdmin.ts:8` | baixa |
| 10 | `STATUS_OPTIONS` duplica `ADVERTISER_STATUS` sem teste de sincronia | `page.tsx:14` | baixa |
| 11 | Zero cobertura de teste para `listAdvertisers` (foi o que permitiu o achado #1 passar) | `tests/admin/` | média |
| 12 | Sem índice em `users.created_at` / `advertisers.created_at` / `advertisers.status` | migrations | baixa hoje |
| 13 | `advertisers.user_id` sem UNIQUE; FK da migration 008 é condicional e engole erro (`WHEN OTHERS` → `RAISE NOTICE`) | `003:34`, `008` | média (estrutural) |
| 14 | `advertisers.user_id` declarada BIGINT no `CREATE` e TEXT no `ADD COLUMN` da mesma migration | `003_baseline_advertisers.sql:8,21` | baixa (latente) |
| 15 | Placeholder promete busca por "documento", mas `document_number` nem é selecionado | `page.tsx:58` | baixa |

Nada disso foi corrigido — esta auditoria é somente leitura.

---

## RECOMENDAÇÃO FINAL

**GO** para desenhar a implementação de `/admin/usuarios`.

A lacuna é real, mensurável e já tem consequência de produto: o Dashboard admin **já exibe o total de usuários** (`COUNT(*) FROM users`), mas não existe nenhuma superfície que os **liste** — nem endpoint, nem tela. Toda pessoa que se cadastrou e ainda não publicou anúncio (inclusive todo comprador ativo com procuras publicadas) é invisível para a operação. A Fase 4.0 vai multiplicar essa classe de conta.

O caminho é aditivo e de baixo risco: **nova rota, novo módulo backend, zero migration para o escopo básico, zero alteração em `/admin/anunciantes`, zero impacto em domínios protegidos.** O BFF catch-all e todos os componentes de shell/tabela/filtro/paginação já servem sem modificação.

Duas condições que eu trataria como parte do desenho, não como polimento posterior:

1. **Nada de `SELECT *` em `users`** — a tabela guarda hash de senha e tokens de reset.
2. **Não inventar "STATUS" para usuário** — derivar de `locked_until` / `email_verified` / `role` e rotular com honestidade, ou não ter a coluna.

E uma recomendação de sequência: **corrigir a busca morta (#1) e a coluna PLANO (#2) de `/admin/anunciantes` antes ou junto** — não por escopo, mas porque a tela nova será construída a partir desse template, e copiá-lo hoje é copiar dois defeitos.

---

### PRINCÍPIO FINAL — as duas respostas

**"Por que uma pessoa que criou conta no Carros na Cidade não aparece em `/admin/anunciantes`?"**

Porque `advertisers` é uma tabela de **lojas**, não de contas, e uma loja só passa a existir no instante em que a pessoa publica o **primeiro anúncio** — `ensureAdvertiserForPublishing` em `src/modules/ads/ads.publish.eligibility.service.js:32`, o único chamador de produção. O cadastro (`auth.service.js#register`) faz um único `INSERT INTO users` e nada mais. Como a listagem administrativa parte de `FROM advertisers adv` (`admin-advertisers.repository.js:25`), quem nunca publicou não tem linha para ser listada. Não é filtro, não é JOIN, não é serializer: é a tabela de partida.

**"Qual é a arquitetura mais segura para o admin ver TODAS as contas sem destruir o conceito de anunciante?"**

Uma superfície **nova e paralela** — `/admin/usuarios` com `FROM users` e colunas explícitas — deixando `/admin/anunciantes` intacta com `FROM advertisers`. Os dois conceitos são 1:N (`advertisers.user_id` não é UNIQUE) e carregam responsabilidades diferentes: identidade/conta de um lado, operação comercial (plano, moderação, anúncios, ofertas) do outro. Fundi-los obrigaria a mentir sobre uma das duas listas e quebraria o endereçamento por `advertiserId` de todas as ações comerciais existentes. Separá-los custa um módulo backend novo, nenhuma migration e nenhum risco para os domínios protegidos.
