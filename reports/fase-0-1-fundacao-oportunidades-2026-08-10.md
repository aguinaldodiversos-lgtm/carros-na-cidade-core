# Fase 0.1 — Fundação Segura para o Motor de Oportunidades

> Localização deste arquivo: o briefing sugeria `docs/opportunities/`, mas a
> convenção viva do repositório é `reports/fase-<n>-<slug>-<data>.md` — é onde
> estão os relatórios das Fases 2b1, 3, 4.2, 4.3 e 5.0, e é o diretório que o
> histórico usa para entregáveis de fase. `docs/` guarda contrato e runbook
> (docs/api, docs/database, docs/runbooks), não relatório datado. Seguimos a
> convenção do repo.

Data: 2026-08-10
Branch: `codex/opportunities-phase-0-1-foundation`

---

## 1. Estado inicial

| Item                          | Valor                                        |
| ----------------------------- | -------------------------------------------- |
| Branch de origem              | `main`                                       |
| HEAD inicial                  | `79f0b15ae9b2ff12ba75d69ac536927aa9fde9c7`   |
| HEAD do baseline da Fase 0    | `79f0b15ae9b2ff12ba75d69ac536927aa9fde9c7`   |
| Divergência desde a auditoria | **nenhuma** (`git log baseline..HEAD` vazio) |
| Working tree                  | limpo (sem alterações preexistentes)         |

A auditoria da Fase 0 continua válida integralmente: o repositório não avançou
desde então, então nenhuma conclusão precisou ser re-verificada por mudança de
código.

### Baseline de testes (antes de qualquer alteração)

| Suíte              | Comando                      | Resultado                                        |
| ------------------ | ---------------------------- | ------------------------------------------------ |
| Backend            | `npm test`                   | **VERDE** — 179 arquivos, 2401 testes, 1 skipped |
| Frontend           | `npm test --prefix frontend` | **5 falhas** — ver abaixo                        |
| Frontend typecheck | `npx tsc --noEmit`           | VERDE (exit 0)                                   |
| Backend lint       | `npm run lint`               | **11 erros** — ver abaixo                        |

#### BASELINE FAILURE — frontend (pré-existente, não atribuível à Fase 0.1)

- `app/seguranca/page.copy.test.ts` — 2 falhas (asserções sobre o texto da
  página de segurança).
- `app/carros-usados/regiao/[slug]/page.config.test.ts` — 3 falhas nas asserções
  sobre `REGIONAL_PAGE_INDEXABLE` / `CANONICAL_SELF`. **Flaky**: duas execuções
  do baseline deram 6 e 5 falhas, indicando vazamento de `process.env` entre
  workers paralelos do Vitest.

Nenhum dos dois toca auth, account, advertiser, localização ou dashboards.

#### BASELINE FAILURE — backend lint (pré-existente)

11 erros de `no-unused-vars` / `no-empty` / `no-useless-escape`, **todos em
`scripts/`**, nenhum em `src/`. Nenhum arquivo novo desta fase acrescentou erro
ou warning (verificado com `eslint` arquivo a arquivo).

---

## 2. Autorização profissional

### Problema

A distinção "pessoa física" x "lojista" existia em **um único lugar**: o cookie
`cnc_session`, lido por `requireLojistaDashboardSession` no layout de
`/dashboard-loja`. O backend já resolvia `req.user.account_type` a cada request
(`auth.middleware.js`, a partir de `users.document_type`), mas **nenhum guard
usava esse valor como autorização** — o único RBAC, `role.middleware.js`, só
conhece `role: user | admin`.

Consequência: um endpoint reservado a lojistas protegido só por `authMiddleware`
aceitaria conta `CPF` ou `pending` direto pela API, bastando um Bearer válido.

### Solução

`requireDealerAccount()` em `src/shared/middlewares/dealer.middleware.js`.

- Factory de middleware no mesmo formato de `requireRole()` / `requireAdmin()`,
  para que a composição em routers seja idêntica à já usada no projeto.
- **Autoridade exclusiva: `req.user.account_type`.** Cookie, body, query e
  header são ignorados.
- **Igualdade estrita** contra `"CNPJ"`. Sem `trim`, sem `toUpperCase`, sem
  sinônimos (`PJ`, `dealer`, `cnpj` minúsculo). O backend só emite três valores
  (`pending` | `CPF` | `CNPJ`); aceitar qualquer outra coisa seria inventar
  vocabulário que nenhum caminho de escrita produz.
- **Fail closed**: `account_type` ausente, nulo, vazio ou desconhecido nega.
- Status: 401 sem contexto autenticado; 403 autenticado e recusado.
- Resposta com `details.code = "DEALER_ACCOUNT_REQUIRED"` e sem qualquer
  referência a `document_type`, plano ou schema.

**Não** verifica plano, assinatura ou entitlement. Nenhum `if (plan.id === ...)`
foi criado. A diferenciação comercial, quando existir, será um middleware
separado composto com este.

`src/modules/auth/**` **não foi tocado** — a expectativa do briefing se
confirmou: `authMiddleware` já entregava tudo que o guard precisa.

### Arquivos

- `src/shared/middlewares/dealer.middleware.js` (novo, 123 linhas)
- `tests/shared/dealer-middleware.test.js` (novo — 40 casos)
- `tests/shared/dealer-authorization-chain.test.js` (novo — 8 casos)

### Testes

O unitário cobre os seis cenários exigidos (CNPJ, CPF, pending, `account_type`
ausente, `req.user` ausente, valores inesperados) mais a asserção de que
cookie/body/header alegando lojista não concedem acesso.

O de cadeia é o que realmente importa e roda com as peças **reais**:
`authMiddleware` não mockado, token assinado pelo signer de verdade, só o `pool`
do Postgres substituído. Ele prova o que o unitário não podia:

1. `authMiddleware` de fato popula `req.user.account_type`;
2. os literais que ele emite a partir de `users.document_type` são exatamente os
   que o guard reconhece — trocar `"CNPJ"` por `"cnpj"` de um lado só fica
   vermelho;
3. o guard é **alcançado** (o handler protegido não roda antes dele);
4. um token legitimamente assinado com `account_type: "CNPJ"` e `role: "admin"`
   embutidos no payload **não promove ninguém** — quem manda é o banco.

Nenhuma rota de produção foi criada para testar: o router vive dentro do teste.

---

## 3. Cidade / advertiser

### Callers encontrados

Varredura completa (`ensureAdvertiserForUser|resolveCityIdForNewAdvertiser|ensureAdvertiserForPublishing`):

| Caller                            | Arquivo                                                  | Passava `cityId`? | Origem                                        | Precisa criar advertiser? |
| --------------------------------- | -------------------------------------------------------- | ----------------- | --------------------------------------------- | ------------------------- |
| Publicação de anúncio             | `src/modules/ads/ads.publish.eligibility.service.js:32`  | **SIM**           | `validated.city_id` (Zod, do próprio anúncio) | SIM                       |
| `POST /account/plans/eligibility` | `src/modules/account/account.routes.js:52`               | **NÃO**           | —                                             | **NÃO** (ver abaixo)      |
| Seed E2E                          | `scripts/e2e-seed.mjs:85`                                | NÃO               | —                                             | sim (fixture)             |
| Seed de anúncio                   | `scripts/seed-test-ad.mjs:36`                            | NÃO               | —                                             | sim (fixture)             |
| Teste de integração               | `tests/integration/ads-pipeline.integration.test.js:144` | **SIM**           | `shared.city.id`                              | teste                     |

A conclusão da Fase 0 foi **confirmada no código atual**, não assumida do
relatório: `/plans/eligibility` era o único caminho de produção sem cidade.

### Comportamento anterior

```
1) cityId explícito válido em cities
2) users.city (TEXT livre) → primeiro token → name ILIKE '%token%' ORDER BY id ASC LIMIT 1
3) SELECT id FROM cities ORDER BY id ASC LIMIT 1
```

Os degraus 2 e 3 decidiam a cidade sem ninguém ter dito qual era, sem log e sem
erro. O degrau 2 é busca parcial **sem UF**: `"São Paulo - SP"` vira o token
`"São"` e casa a primeira cidade que contenha `"São"` por ordem de id. Com
dezenas de municípios homônimos entre estados, é sorteio. O degrau 3 é uma
cidade default estrutural.

### Comportamento final

```
cityId explícito → inteiro positivo → existe em cities → retorna
qualquer outra coisa → AppError 400 ADVERTISER_CITY_REQUIRED + WARN(userId, reason)
```

- **Fallback textual removido?** Sim.
- **Fallback "primeira cidade" removido?** Sim.
- **Substituído por outro fallback?** Não.
- **Side effect de `/plans/eligibility` removido?** Sim.

O WARN existe porque falha silenciosa já custou caro neste projeto: se algum
fluxo legítimo chegar sem cidade, isso aparece no log no mesmo dia — não num
anúncio na cidade errada semanas depois.

### Por que remover o side effect era seguro

- `resolvePublishEligibility` lê `users` (documento/plano) e conta anúncios por
  `adv.user_id`. Sem linha em `advertisers`, o JOIN devolve 0 — que é a resposta
  **correta** para quem ainda não publicou.
- `docs/api/publish-eligibility.md` já dizia, desde antes desta fase, que
  advertiser _"não faz parte da elegibilidade de documento/plano"_.
- A mesma doc listava quatro pontos de ensure; **dois deles (registro em
  `auth.service.js` e início de `getDashboardPayload`) já não existiam no
  código** — foram removidos em refactors anteriores sem quebrar nada. A doc é
  que ficou para trás. Isso é evidência direta de que o padrão "garantir
  advertiser por precaução" já vinha sendo desmontado com segurança.
- A UI já assume esse mundo: `/dashboard-loja/dados` mostra _"Publique um
  anúncio para criar o cadastro da loja"_ quando não há linha.

### Ajuste de idempotência (não previsto no briefing, necessário)

A resolução da cidade foi movida para **depois** da checagem de existência,
dentro da transação. Sem isso, `ensureAdvertiserForUser` deixaria de ser
idempotente: uma segunda chamada — que só quer o anunciante já existente — seria
recusada por não repetir um dado que não vai usar. A cidade passa a ser exigida
apenas no caminho de **criação**.

### Dados existentes

Nada foi tocado: sem backfill, sem mover loja, sem corrigir `city_id` já
gravado. A mudança só impede **novas** atribuições silenciosas.

### Arquivos

- `src/modules/advertisers/advertiser.ensure.service.js`
- `src/modules/account/account.routes.js`
- `scripts/e2e-seed.mjs`, `scripts/seed-test-ad.mjs` (passam cidade explícita)
- `docs/api/publish-eligibility.md`
- `tests/shared/advertiser-city-fail-closed.test.js` (novo — 21 casos)
- `tests/account/plans-eligibility-no-side-effect.test.js` (novo — 5 casos)
- `tests/ads/publish-supplies-explicit-city.test.js` (novo — 7 casos)

O teste de fail-closed **espiona o SQL emitido** e afirma que `ILIKE` e
`ORDER BY id ASC` nunca aparecem — inclusive nos cenários exatos em que os
fallbacks disparavam (`users.city = "Atibaia - SP"` preenchido, `cities`
populada). Um refactor que os reintroduzisse passaria num teste que só olhasse o
valor de retorno; aqui, não passa.

O teste de publicação roda a cadeia inteira sem mockar o meio
(`ensurePublishEligibility → ensureAdvertiserForPublishing →
ensureAdvertiserForUser → resolveCityIdForNewAdvertiser → INSERT`) e afirma
sobre o SQL: qual cidade foi consultada e qual `city_id` entrou no INSERT.

---

## 4. Integridade do banco

Auditoria **READ-ONLY** contra produção. Somente `SELECT`. Nenhuma constraint,
índice, migration ou correção de dado foi criada.

| Alvo     | Valor                                                                                 |
| -------- | ------------------------------------------------------------------------------------- |
| Variável | `DATABASE_URL1` (produção — **não** `DATABASE_URL`, que aponta para o banco de teste) |
| Database | `carros_na_cidade_db` (Render)                                                        |
| Versão   | PostgreSQL 18.3                                                                       |

### Volumetria

| Tabela        | Linhas                         |
| ------------- | ------------------------------ |
| `users`       | 119                            |
| `advertisers` | 61                             |
| `ads`         | 48 (28 `active`, 20 `deleted`) |
| `cities`      | 5.572                          |

### Duplicados e órfãos

| Verificação                      | Resultado                            |
| -------------------------------- | ------------------------------------ |
| `advertisers.user_id` duplicados | **0 linhas**                         |
| Órfãos `advertisers` → `users`   | 0                                    |
| Órfãos `ads` → `advertisers`     | 0                                    |
| Órfãos `advertisers` → `cities`  | 0                                    |
| Órfãos `ads` → `cities`          | 0                                    |
| `ads` com `advertiser_id` NULL   | 0                                    |
| `advertisers` com `city_id` NULL | **1** (pré-existente, não corrigido) |

A relação `users → advertisers` é **1:1 de fato** hoje (61 advertisers, zero
duplicados), ainda que não seja garantida pelo schema.

### Constraints REAIS (lidas de `pg_constraint` / `pg_indexes`, não inferidas)

| Relação                              | Existe?        | Definição real                                                                                |
| ------------------------------------ | -------------- | --------------------------------------------------------------------------------------------- |
| `advertisers.user_id → users.id`     | **SIM — duas** | `advertisers_user_id_fkey` (sem `ON DELETE`) **e** `fk_advertiser_user` (`ON DELETE CASCADE`) |
| `advertisers.city_id → cities.id`    | **NÃO**        | —                                                                                             |
| `ads.advertiser_id → advertisers.id` | **NÃO**        | —                                                                                             |
| `ads.city_id → cities.id`            | **NÃO**        | —                                                                                             |
| `UNIQUE (advertisers.user_id)`       | **NÃO**        | —                                                                                             |

Outras constraints relevantes encontradas: `advertisers_email_key`
UNIQUE(email); `advertisers_slug_idx` UNIQUE(slug); `ads_slug_unique` +
`idx_ads_slug_unique` (parcial); `users_email_key`, `users_email_lower_key`,
`idx_users_document_unique` (parcial em `document_number`);
`users.plan_id → subscription_plans.id`.

### UNIQUE em `advertisers.user_id`

**0 duplicidades encontradas.** Mesmo assim, **nenhuma constraint foi criada**,
conforme a instrução. Registrado como:

> **CANDIDATO A HARDENING FUTURO** — `UNIQUE (advertisers.user_id)` é
> tecnicamente aplicável hoje (zero duplicados). Deve ser avaliada em migration
> separada, não misturada com a fundação dos novos produtos.

### O que permanece não comprovado

- Se a migration `008_advertisers_user_fk.sql` chegou a rodar: ela é guardada
  por `pg_get_constraintdef ILIKE 'FOREIGN KEY (user_id) REFERENCES users(id)%'`
  e retorna cedo se casar. Como `advertisers_user_id_fkey` já existe com essa
  forma, a migration é **no-op** em produção — e o `ON DELETE RESTRICT` que ela
  pretendia aplicar **não está lá**.

---

## 5. Geografia

| Métrica                                             | Valor                                                          |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `cities` total                                      | 5.572                                                          |
| `cities` sem latitude/longitude                     | **1**                                                          |
| Cidades efetivamente em uso (`ads` ∪ `advertisers`) | 7                                                              |
| Dessas, sem coordenadas                             | **1**                                                          |
| Cidades com anúncio **ativo**                       | **1** — `atibaia-sp` (id 4761, SP, com coordenadas, 28 ativos) |

### `region_memberships`

| Layer | Linhas | Significado               |
| ----- | ------ | ------------------------- |
| 0     | 5.572  | self-row (uma por cidade) |
| 1     | 29.880 | vizinhas próximas         |
| 2     | 66.377 | vizinhas intermediárias   |
| 3     | 5.652  | camada adicional          |

- Bases distintas: 5.572 (100% das cidades)
- Membros distintos: 5.572
- Distância: mín. 0 (self) — máx. **100 km**

### Cobertura da cidade ativa

`atibaia-sp` tem **1.932 cidades vizinhas** com `layer > 0`.

**Conclusão operacional:** a infraestrutura territorial para fan-out regional
**está pronta** — a tabela está populada muito além da self-row, cobre todas as
cidades, e a única cidade com estoque tem cobertura ampla. O fan-out do Produto
B ("avisar lojistas da região") pode ser feito com uma query indexada em
`region_memberships`, sem haversine ao vivo.

**Alerta de dimensionamento:** 1.932 vizinhas é um raio muito largo para
notificação. Isso é decisão de produto (qual layer usar), não de infraestrutura.
Nenhum raio foi alterado nesta fase.

---

## 6. Taxonomia

Medido sobre os **28 anúncios ativos** de produção.

### `body_type`

| Valor    | Total | Canônico? |
| -------- | ----- | --------- |
| `hatch`  | 15    | sim       |
| `suv`    | 8     | sim       |
| `sedan`  | 4     | sim       |
| `picape` | 1     | sim       |

**0 NULL, 0 vazio, 0 fora da lista canônica.**

### `transmission`

| Valor        | Total | Canônico? |
| ------------ | ----- | --------- |
| `manual`     | 19    | sim       |
| `automatico` | 9     | sim       |

**0 NULL, 0 valor inesperado.** Nenhum `cvt` no estoque atual.

> Isto **contradiz** um registro anterior do projeto que apontava dado ruim de
> câmbio (default antigo, "Manual" com 0 ativos). O backfill foi aplicado: hoje
> a distribuição é saudável e plausível.

### `fuel_type` (bônus)

`flex` 27, `hibrido` 1 — canônicos.

### Campos de matching — completude

| Campo          | Nulos/vazios em 28 ativos |
| -------------- | ------------------------- |
| `brand`        | 0                         |
| `model`        | 0                         |
| `body_type`    | 0                         |
| `transmission` | 0                         |
| `year`         | 0                         |
| `price`        | 0 inválidos               |
| `mileage`      | 0                         |

### Modelo comercial (`deriveCommercialModel`)

| Métrica                      | Valor    |
| ---------------------------- | -------- |
| Total de ativos              | 28       |
| Resolvidos                   | **28**   |
| `null`                       | **0**    |
| Percentual resolvido         | **100%** |
| Modelos comerciais distintos | 16       |

Clusters: Onix (6), C3 (2), Argo (2), Mobi (2), Pulse (2), HR-V (2), HB20 (2),
Kwid (2), Strada (1), Ecosport (1), Renegade (1), **Omoda 5** (1), Fox (1),
Polo (1), T-Cross (1), Virtus (1).

**Amostras `null`: nenhuma** (não há o que listar).

O caso `Omoda 5` resolve corretamente — o override curado para modelo numérico
está funcionando contra dado real, não só contra fixture.

> **Nota de método:** a primeira medição foi feita com a assinatura errada
> (`deriveCommercialModel(brand, model)`) e produziu "100% resolvido" com
> clusters que eram nomes de **marca** (Fiat, Gm, Vw). A assinatura real é
> `deriveCommercialModel(rawModel, { brand })`. O número acima é da execução
> corrigida. Registrado porque o resultado errado era plausível e teria passado
> despercebido.

**Nada foi corrigido**: `ads.model` intacto, sem coluna `commercial_model`, sem
alteração de normalizadores, sem backfill.

---

## 7. Áreas privadas

### Antes

`/dashboard*` e `/dashboard-loja*` tinham como única proteção o `Disallow:` no
`robots.txt`. Nenhum header de cache, nenhum `X-Robots-Tag`, e — diferente de
`/admin` e `/painel/anuncios/*` — nenhum `robots: { index: false }` no metadata.

`Disallow` impede **rastrear**, não **indexar**: uma URL descoberta por link
externo pode entrar no índice sem conteúdo. E não diz nada a proxies/caches
intermediários sobre uma resposta que contém dados de uma pessoa específica.

### Depois

Via `headers()` em `frontend/next.config.mjs` (**não** no `middleware.ts`, que
carrega os gates territoriais sensíveis):

```
Cache-Control: private, no-store
X-Robots-Tag: noindex, nofollow, noarchive
```

Rotas afetadas: `/dashboard`, `/dashboard/:path*`, `/dashboard-loja`,
`/dashboard-loja/:path*` (duas entradas por prefixo para não depender do
comportamento de zero-ocorrências do `*` na raiz).

### Verificação em build de PRODUÇÃO

Em `next dev` o `Cache-Control` é sobrescrito pelo próprio Next, então a
checagem foi feita contra o **standalone de produção** (`npm run build` +
`node .next/standalone/server.js`):

| Rota                       | HTTP | Cache-Control       | X-Robots-Tag                   |
| -------------------------- | ---- | ------------------- | ------------------------------ |
| `/dashboard`               | 200  | `private, no-store` | `noindex, nofollow, noarchive` |
| `/dashboard/meus-anuncios` | 200  | `private, no-store` | `noindex, nofollow, noarchive` |
| `/dashboard-loja`          | 200  | `private, no-store` | `noindex, nofollow, noarchive` |
| `/dashboard-loja/suporte`  | 200  | `private, no-store` | `noindex, nofollow, noarchive` |
| `/`                        | 200  | _(default do Next)_ | **ausente**                    |
| `/comprar`                 | 200  | _(default do Next)_ | **ausente**                    |
| `/planos`                  | 200  | _(default do Next)_ | **ausente**                    |

**Nenhuma rota pública foi afetada.** Um teste percorre 13 rotas públicas
afirmando que nenhuma casa com os prefixos privados — um `source` largo demais
aqui desindexaria o site inteiro.

### Ajuste em teste existente

`next.config.headers.test.ts` afirmava
`sources.every(s => s.startsWith("/images/"))`. Essa asserção dizia mais do que
pretendia: o objetivo era "nenhuma **outra** rota recebe cache público de 1 ano".
Foi reescrita para afirmar a intenção diretamente (filtrar regras com
`max-age=31536000` e exigir que seja só `/images/:path*`), preservando a
proteção original.

---

## 8. Configuração de sessão

### `AUTH_SESSION_SECRET`

**NÃO COMPROVADO.**

- Declarada em `render.yaml` com `sync: false` — o valor é setado à mão no
  dashboard do Render e não vive no repositório.
- Ausente do `.env` local e de `frontend/env.local.example`.
- Não há como verificar daqui se está preenchida em produção.

Classificação: **P1 OPERACIONAL** — se estiver ausente, `getSessionSecret()` cai
num segredo efêmero por processo e **todas as sessões caem a cada deploy ou
restart**. O código loga `console.error` e segue.

Nenhum segredo foi criado, alterado ou impresso.

### Cookies (`cnc_session`, `cnc_at`, `cnc_rt`)

Todos usam `getSessionCookieOptions()`:

| Flag       | Valor                                                      |
| ---------- | ---------------------------------------------------------- |
| `httpOnly` | `true`                                                     |
| `secure`   | `process.env.NODE_ENV === "production"` → true em produção |
| `sameSite` | `"lax"`                                                    |
| `path`     | `"/"`                                                      |
| `maxAge`   | 604800 s (7 dias)                                          |

Nada foi alterado. `SameSite=Lax` é linha de base adequada contra CSRF em POST
cross-site.

### CSRF

Nenhuma arquitetura nova de CSRF foi criada — esta fase não introduz endpoint de
valor financeiro nem mutação dos produtos.

**Recomendação registrada para a fase de lances:** ao criar
`POST .../bids`, revisar se `SameSite=Lax` basta ou se o fluxo exige token CSRF
explícito + idempotency key, dado que o lance é mutação de valor com competição.

---

## 9. Testes executados

| Comando                                     | Resultado                                     | Tempo  |
| ------------------------------------------- | --------------------------------------------- | ------ |
| `npm test` (backend, baseline)              | 179 arquivos / 2401 testes — VERDE            | 28,6 s |
| `npm test` (backend, final)                 | **184 arquivos / 2482 testes — VERDE**        | 23,8 s |
| `npm test --prefix frontend` (baseline)     | 5 falhas em 2 arquivos                        | 71,9 s |
| `npm test --prefix frontend` (final)        | **as MESMAS 5 falhas, nos MESMOS 2 arquivos** | —      |
| `npx tsc --noEmit` (frontend)               | VERDE (exit 0)                                | —      |
| `npm run lint` (backend)                    | 11 erros pré-existentes (todos em `scripts/`) | —      |
| `npx next lint --max-warnings 0` (frontend) | **VERDE** — 0 warnings, 0 erros               | —      |
| `npm run build` (frontend)                  | **VERDE** + postbuild standalone OK           | —      |

### Falhas novas

**Nenhuma.** As falhas do frontend são idênticas ao baseline, arquivo por
arquivo e nome de teste por nome de teste.

### Testes novos: +81 casos no backend, +7 no frontend

- `tests/shared/dealer-middleware.test.js` — 40
- `tests/shared/dealer-authorization-chain.test.js` — 8
- `tests/shared/advertiser-city-fail-closed.test.js` — 21
- `tests/ads/publish-supplies-explicit-city.test.js` — 7
- `tests/account/plans-eligibility-no-side-effect.test.js` — 5
- `frontend/next.config.headers.test.ts` — +7 (política de área privada)

### E2E — não executado, com motivo

`e2e/dashboard-login-pf-pj.spec.ts` exige Postgres de teste (porta 5433, via
Docker). **Docker Desktop não está em execução neste ambiente** e a porta 5433
está fechada; o banco local em 5432 não é o banco de teste do projeto. Os
próprios specs têm `test.skip` para essa condição.

Compensação — verificação manual equivalente com o **mock backend do repo**
(`e2e/mock-backend`), sem tocar banco nenhum:

| Cenário                          | Resultado                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/login` (PF)      | 200, `type: "CPF"`, `redirect_to: "/dashboard"` ✓                                                         |
| Sessão PF em `/dashboard`        | painel renderiza ("Meus anúncios", "Novo anúncio", "Trocar senha") ✓                                      |
| Sessão PF em `/dashboard-loja`   | **nenhum** conteúdo de lojista renderizado ("Dados da loja", "Plano e cobranças", "Mensagens" ausentes) ✓ |
| Sem sessão em `/dashboard`       | redireciona para login ✓                                                                                  |
| Headers privados com sessão real | `X-Robots-Tag` presente ✓                                                                                 |

O caminho PJ → `/dashboard-loja` **não pôde ser exercitado no modo mock** por
limitação pré-existente do fixture (ver P3-3).

---

## 10. Arquivos alterados

**Novos (6)**

- `src/shared/middlewares/dealer.middleware.js`
- `tests/shared/dealer-middleware.test.js`
- `tests/shared/dealer-authorization-chain.test.js`
- `tests/shared/advertiser-city-fail-closed.test.js`
- `tests/ads/publish-supplies-explicit-city.test.js`
- `tests/account/plans-eligibility-no-side-effect.test.js`

**Modificados (7)**

- `src/modules/advertisers/advertiser.ensure.service.js` — resolver fail-closed
- `src/modules/account/account.routes.js` — remoção do side effect
- `scripts/e2e-seed.mjs`, `scripts/seed-test-ad.mjs` — cidade explícita
- `frontend/next.config.mjs` — headers das áreas privadas
- `frontend/next.config.headers.test.ts` — asserção corrigida + política nova
- `docs/api/publish-eligibility.md` — doc alinhada ao comportamento real

Total: 13 arquivos, +1344 / −69.

---

## 11. Arquivos deliberadamente não alterados

Confirmado por `git diff main...HEAD --name-only` sobre cada caminho — retorno
vazio:

- `src/modules/ads/**`
- `src/modules/public/**`
- `src/modules/seo/**`
- `src/modules/payments/**`
- `src/shared/constants/status.js`
- `src/modules/auth/**` (JWT, refresh, rotação, token)
- `frontend/middleware.ts`
- `frontend/app/sitemaps/**`, `frontend/app/sitemap.xml/**`
- `frontend/services/sessionService.ts` (formato do cookie)
- `src/database/migrations/**` (nenhuma migration criada ou editada)

Também não tocados: planos, Mercado Pago, `notification.worker.js` (mantido
morto e intocado), `notification_queue` (não criada).

---

## 12. Achados novos

### P1

**P1-1 — `AUTH_SESSION_SECRET` não comprovada em produção.** Operacional. Se
ausente, todas as sessões caem a cada deploy. Verificar no dashboard do Render.
Não corrigível daqui sem criar segredo, o que a fase proíbe.

### P2

**P2-1 — FK duplicada em `advertisers.user_id` com semânticas de DELETE
conflitantes.** Existem duas: `advertisers_user_id_fkey` (sem `ON DELETE`, ou
seja `NO ACTION`) e `fk_advertiser_user` (`ON DELETE CASCADE`). Uma bloqueia a
remoção do usuário, a outra manda apagar o anunciante junto. O comportamento
efetivo de `DELETE FROM users` fica dependente de ordem de avaliação. Nenhuma
foi removida nesta fase (mexer em integridade de tabela central não pertence a
esta fundação). Relevante para os novos produtos, que vão referenciar `users` e
`advertisers` ao mesmo tempo.

**P2-2 — Migration `008_advertisers_user_fk.sql` é no-op em produção.** O guard
casa a FK já existente e retorna antes de aplicar o `ON DELETE RESTRICT` que ela
pretendia. Explica P2-1.

**P2-3 — `redirect()` em layout do Next 14.2 devolve HTTP 200.** Verificado:
sessão PF em `/dashboard-loja` responde **200** com marcador `NEXT_REDIRECT` no
corpo, não 307/308. É a mesma classe de soft-status já documentada no
`middleware.ts` para `notFound()`. **Não há vazamento de dados** (o shell de
lojista não renderiza — confirmado por asserção sobre 4 marcadores), mas o gate
PF/PJ do frontend **não é uma fronteira HTTP**. Isto reforça, com evidência
empírica, por que `requireDealerAccount` no backend era P0.

**P2-4 — 1 `advertiser` com `city_id` NULL em produção.** Pré-existente. Não
corrigido (a fase proíbe backfill). Precisa de decisão antes de qualquer fan-out
territorial que assuma cidade não-nula.

### P3

**P3-1 — `advertisers_slug_idx` é UNIQUE em produção, mas a migration `003` o
cria como índice NÃO-único.** Divergência schema real ↔ migrations. Explica (e
justifica) o retry de 8 tentativas contra `23505` em `ensureAdvertiserForUser`.

**P3-2 — Colunas de id/FK são `integer` em produção**, enquanto as migrations
declaram `BIGSERIAL`/`BIGINT` (`users.id`, `advertisers.id`, `advertisers.user_id`,
`advertisers.city_id`, `ads.id`, `ads.advertiser_id`, `ads.city_id`, `cities.id`).
Sem risco imediato no volume atual; relevante ao desenhar as FKs dos produtos
novos, que precisam casar o tipo real.

**P3-3 — O mock backend de E2E emite `account_type`, contrato real usa `type`.**
`e2e/mock-backend/server.ts` responde `user.account_type: "cnpj"`, mas
`services/authService.ts` lê `payload.type ?? payload.document_type ??
payload.documentType`. Resultado: no modo mock, **um login CNPJ vira `type:
"CPF"` e é redirecionado para `/dashboard`**. O modo mock não consegue exercitar
o contrato PJ → `/dashboard-loja`. Pré-existente (nenhum arquivo de auth foi
tocado nesta fase). Corrigir antes de confiar no `test:e2e:mock` para regressão
de perfil.

**P3-4 — `page.config.test.ts` da rota regional é flaky** (5 ou 6 falhas entre
execuções), indicando vazamento de `process.env` entre workers do Vitest.

---

## 13. Pendências antes do Produto B (venda para lojistas)

1. **Domínio de notificações internas** (fase seguinte) — o fan-out
   `sale_request.created` depende dele. `notification_queue` continua fantasma e
   intocada.
2. **Decidir o layer de `region_memberships`** para o fan-out. `atibaia-sp` tem
   1.932 vizinhas com `layer > 0`; notificar todas é ruído. Decisão de produto.
3. **Resolver P2-1** (FK duplicada) antes de criar FKs novas apontando para
   `advertisers`/`users`.
4. **Decidir sobre `UNIQUE (advertisers.user_id)`** — hoje é seguro aplicar (0
   duplicados). Enquanto não existir, os objetos novos devem carregar
   `advertiser_id` **e** `advertiser_user_id`, como a Fase 0 propôs.
5. **Concorrência de lances** — `withTransaction` + `SELECT ... FOR UPDATE` já
   estão disponíveis; nada foi implementado.
6. **Tipos das FKs** (P3-2): usar `integer` para casar o schema real.

## 14. Pendências antes do Produto A (intenção de compra)

1. **`requireDealerAccount` precisa ser montado** nos routers de oportunidade —
   ele existe e está testado, mas **não está em nenhuma rota** (correto: não há
   rota ainda). É o primeiro passo do primeiro endpoint.
2. **Endpoint enxuto de estoque do lojista** (`ads` ativos da própria loja) —
   não criado, conforme escopo.
3. **Matching por modelo comercial está VIABILIZADO**: 100% dos ativos resolvem,
   `body_type` e `transmission` estão 100% canônicos e sem nulos. O matching
   rígido dos modos A e B do briefing é seguro contra o dado real de hoje.
4. **`cvt` não existe no estoque atual** — a UI de filtro de transmissão deve
   lidar com opção sem resultado.
5. **Decisão de produto**: conta `pending` pode publicar intenção de compra?
   (levantada na Fase 0, ainda aberta).

---

## 15. Veredito

# GO

Critérios da seção 73 do briefing:

| Critério                                            | Status                                                 |
| --------------------------------------------------- | ------------------------------------------------------ |
| `requireDealerAccount` existe                       | ✅                                                     |
| CPF é bloqueado                                     | ✅ (403, unitário + cadeia real)                       |
| `pending` é bloqueado                               | ✅ (403)                                               |
| CNPJ é permitido                                    | ✅ (200, handler alcançado)                            |
| Guard usa contexto backend, não cookie              | ✅ (teste com token forjado carregando `account_type`) |
| Nenhuma alteração em JWT                            | ✅ (`src/modules/auth/**` sem diff)                    |
| Nenhuma alteração no formato da sessão              | ✅ (`sessionService.ts` sem diff)                      |
| Todos os callers de advertiser mapeados             | ✅ (5 callers, tabela na seção 3)                      |
| Nenhum caminho novo depende de fallback territorial | ✅                                                     |
| Fallback "primeira cidade" eliminado                | ✅ (removido, não isolado)                             |
| Publicação normal continua funcionando              | ✅ (teste da cadeia real até o INSERT)                 |
| Banco auditado read-only                            | ✅ (produção, somente SELECT)                          |
| Duplicidades não corrigidas silenciosamente         | ✅ (0 encontradas; nada tocado)                        |
| Nenhuma constraint estrutural criada                | ✅                                                     |
| `region_memberships` verificado                     | ✅ (107.481 linhas, 5.572 bases, até 100 km)           |
| `body_type` medido                                  | ✅ (4 valores, 100% canônicos)                         |
| `transmission` medido                               | ✅ (2 valores, 100% canônicos)                         |
| `deriveCommercialModel` medido                      | ✅ (28/28 = 100%)                                      |
| Dashboards com política de cache/indexação          | ✅ (verificado em build de produção)                   |
| Rotas públicas não afetadas                         | ✅ (7 rotas conferidas + teste de 13)                  |
| Testes PF verdes                                    | ✅ (login PF → `/dashboard`, painel renderiza)         |
| Testes CNPJ verdes                                  | ⚠️ **parcial** — ver abaixo                            |
| Build verde                                         | ✅                                                     |
| Lint verde                                          | ✅ (frontend 0; backend sem erro novo)                 |
| Typecheck verde                                     | ✅                                                     |
| `ads` não alterado                                  | ✅                                                     |
| SEO / sitemap não alterados                         | ✅                                                     |
| Pagamentos / planos não alterados                   | ✅                                                     |
| Nenhum produto novo implementado                    | ✅                                                     |

### A única ressalva

O trajeto **CNPJ → `/dashboard-loja` não foi exercitado ponta a ponta** nesta
máquina: o E2E que o cobre exige Postgres de teste via Docker, que não está
disponível aqui, e o modo mock não serve por causa do P3-3 (fixture emite
`account_type` em vez de `type`).

Isso **não** é NO-GO pelos critérios da seção 74, porque:

- nenhum arquivo do caminho de login/sessão foi tocado (`git diff` vazio para
  `src/modules/auth/**`, `frontend/services/sessionService.ts`,
  `frontend/lib/auth/**`);
- o gate de `/dashboard-loja` (`session.type !== "CNPJ"`) não foi alterado;
- o lado PF do mesmo contrato foi verificado e está íntegro, incluindo o gate
  que barra PF no painel de lojista;
- as 2482 asserções do backend e o build de produção estão verdes.

**Ação recomendada antes do merge:** rodar `npm run test:e2e:dashboard` com
Docker ativo (`npm run integration:db:up && npm run e2e:prepare`) para fechar
essa lacuna com evidência, em vez de com raciocínio.

### Próxima fase recomendada

**Fase 1 — sistema de notificações internas** (domínio novo `user_notifications`,
sem reviver `notification_queue` nem o worker legado), conforme a seção 30 da
auditoria da Fase 0.
