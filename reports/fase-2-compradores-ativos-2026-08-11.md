# Fase 2 — Compradores Ativos

Data: 2026-08-11
Branch: `codex/opportunities-phase-2-purchase-intents`

## Estado inicial

- branch de partida: `main`
- HEAD inicial: `3c44a05a02fbc21e63c5b7ba0f884550c6391f34` (`merge: phase 1 internal notifications`)
- working tree: limpo; `git pull --ff-only origin main` → *Already up to date*
- migration mais alta antes desta fase: `049_user_notifications.sql` (verificado por listagem, não assumido)

### Baseline medido ANTES de qualquer alteração

| Verificação | Resultado |
|---|---|
| backend `npm test` | 187 arquivos, 2591 passaram, 1 pulado — **verde** |
| backend `npm run lint` | **BASELINE FAILURE** — 233 problemas (11 erros, 222 avisos), todos em `scripts/**` |
| frontend `npm run test` | **BASELINE FAILURE** — 5 falhas / 2799 passaram |
| frontend `npm run typecheck` | verde |
| frontend `npm run lint` | verde |
| frontend `npm run build` | verde |

As falhas de baseline do frontend são de dois arquivos sem relação com esta fase:
`app/carros-usados/regiao/[slug]/page.config.test.ts` (3) e `app/seguranca/page.copy.test.ts` (2).
Nenhuma foi corrigida — estão fora do escopo.

## Arquitetura

```
COMPRADOR (PF)
     │ publica
     ▼
purchase_intents  ← FONTE DE VERDADE da visibilidade
     │ city_id
     ▼
LOJISTAS CNPJ DA MESMA CIDADE
     │
     ├─ "Compradores ativos"  (lê purchase_intents)
     └─ user_notifications    (apenas AVISA)
```

A visibilidade sai de `purchase_intents` (status + `expires_at` + `city_id`), nunca de
`user_notifications`. Se o fan-out falhar inteiro, a oportunidade continua aparecendo — o
contrário transformaria uma falha de aviso em perda de produto.

Não existe `purchase_intents → ads` nesta fase. O teste de schema **prova a ausência** de FK para
`ads`/`advertisers`/`plans`/`payments`/`leads`/`messages`.

## Schema

Migration: `src/database/migrations/050_purchase_intents.sql` (nova; a 049 não foi tocada).

| Campo | Tipo | Nota |
|---|---|---|
| `id` | `BIGSERIAL PK` | |
| `buyer_user_id` | `BIGINT NOT NULL` | FK → `users(id)` **ON DELETE CASCADE** |
| `city_id` | `BIGINT NOT NULL` | FK → `cities(id)`, sem `ON DELETE` (NO ACTION) |
| `intent_type` | `TEXT NOT NULL` | CHECK `specific_model \| open_category` |
| `brand`, `brand_slug` | `TEXT` | só em `specific_model` |
| `model`, `model_slug` | `TEXT` | modelo **comercial**, nunca a descrição FIPE |
| `body_type` | `TEXT` | só em `open_category` |
| `transmission` | `TEXT NOT NULL` | slug canônico dos anúncios |
| `max_price` | `NUMERIC(14,2) NOT NULL` | CHECK `> 0`; mesma convenção de `ads.price` |
| `purchase_timeframe` | `TEXT NOT NULL` | CHECK com as 3 opções |
| `status` | `TEXT NOT NULL DEFAULT 'active'` | CHECK `active \| closed` |
| `expires_at` | `TIMESTAMPTZ NOT NULL` | `NOW() + 30 dias`, calculado pelo BANCO |
| `created_at`, `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

**CHECK de FORMA** (`purchase_intents_shape_check`): `specific_model` exige marca+modelo e proíbe
carroceria; `open_category` exige carroceria e proíbe marca/modelo. É o invariante de que a Fase 3
vai depender ao casar procura com estoque.

Índices:
- `purchase_intents_buyer_created_idx (buyer_user_id, created_at DESC, id DESC)`
- `purchase_intents_city_active_idx (city_id, expires_at, created_at DESC, id DESC) WHERE status = 'active'` — **parcial**

`expires_at` é calculado no SQL (`NOW() + ($n || ' days')::interval`) e não em JS: o relógio que vale
é o do Postgres, o mesmo que a leitura do lojista compara.

## Buyer

Pode publicar quem **não** é CNPJ — inclui `pending`. Não há exigência de CPF verificado (o cadastro
atual não pede documento, e exigir aqui aumentaria atrito). CNPJ recebe **403
`PURCHASE_INTENT_BUYER_ONLY`**.

Posse: toda leitura e escrita carregam `buyer_user_id` na cláusula `WHERE`. Não existe
`SELECT` → `if` em JS. `buyer_user_id` **nunca** vem do corpo — sai de `req.user.id`.

## Cidade

- escolhida explicitamente, com `id` real do catálogo;
- o seletor usa `/api/painel/cidades/search` (catálogo completo) e **não** `/api/cities/search`, que é
  filtrado a cidades com anúncio ativo — justamente o comprador que este produto atende ficaria sem
  encontrar a própria cidade;
- existência conferida no banco antes de gravar; ausente/inválida → 400 `PURCHASE_INTENT_CITY_REQUIRED`;
- **zero fallback**: sem `users.city`, sem cookie territorial, sem "primeira cidade", sem
  geolocalização, sem `useCity()` (cujo `cityId` é nulo com frequência e cujo `state` cai para "SP").

## Dealer

- guarda: `authMiddleware` + **`requireDealerAccount()`** — primeira montagem em rota de produção
  (existia desde a Fase 0.1 sem estar em caminho nenhum);
- cidade resolvida no servidor a partir do advertiser; **nunca** aceita do cliente;
- **fail closed** devolvendo `null` (lista vazia / 404) quando: não há advertiser; o advertiser não
  tem `city_id`; ou há **mais de uma cidade distinta** entre os advertisers do mesmo usuário
  (`advertisers.user_id` não tem UNIQUE). Linhas duplicadas na MESMA cidade não são conflito.

### Privacidade

A projeção do lojista é **allowlist montada campo a campo**, não `SELECT *` com remoção depois:

```
id, intent_type, brand, model, body_type, transmission,
max_price, purchase_timeframe, created_at, expires_at, city{name,state,slug}
```

A query do lojista **não faz JOIN em `users`** — o dado do comprador não é filtrado, ele não é lido.
Teste dedicado trava o conjunto EXATO de chaves (não uma lista de proibidos) e verifica que o SQL não
contém `JOIN users`, `buyer_user_id` nem `SELECT *`.

## Notificações

- evento: `purchase_intent.created`, adicionado a `NOTIFICATION_EVENT_TYPE`
  (única alteração no módulo da Fase 1);
- destinatários: `SELECT DISTINCT adv.user_id ... WHERE adv.city_id = $1 AND LOWER(BTRIM(u.document_type)) = 'cnpj'`
  — `DISTINCT` porque advertiser duplicado geraria dois avisos;
- idempotência: `purchase_intent:{id}:created`, **igual para todos** os destinatários. O índice único
  é `(recipient_user_id, idempotency_key)`, então a mesma chave em usuários diferentes gera linhas
  diferentes;
- `action_path`: `/dashboard-loja/oportunidades/compradores/{id}` — já coberto pela allowlist
  existente (`/dashboard-loja`), sem ampliar nada;
- **falha não bloqueia**: `try/catch` POR DESTINATÁRIO (um destinatário problemático não aborta os
  demais) e um `catch` externo que apenas registra. A procura permanece publicada e visível.

## PF Frontend

| Rota | Conteúdo |
|---|---|
| `/dashboard/minhas-procuras` | listagem + estados vazio/carregando/erro |
| `/dashboard/minhas-procuras/nova` | formulário (os dois modos na mesma página) |
| `/dashboard/minhas-procuras/[id]` | detalhe + encerrar (com confirmação) |

Menu: item **"Minhas procuras"** no `AccountPanelShell` existente (lista plana — o `NavItem` não tem
campo de seção e dar suporte a cabeçalho exigiria mexer no tipo e nos dois laços de render, ou seja,
redesenhar o shell para acomodar um item).

O formulário reduz a lista da FIPE a modelos **comerciais** com `deriveCommercialModel` (os 547
modelos VW viraram 40 opções, verificado ao vivo) e envia a **descrição FIPE representativa** — não o
rótulo já reduzido, que quebraria "Omoda 5".

## PJ Frontend

| Rota | Conteúdo |
|---|---|
| `/dashboard-loja/oportunidades` | hub (um card: Compradores ativos) |
| `/dashboard-loja/oportunidades/compradores` | listagem |
| `/dashboard-loja/oportunidades/compradores/[id]` | detalhe |

Menu: item **"Oportunidades"** (ícone `users`, que já existia sem uso). O hub existe como página
própria porque é onde a Fase 3 pendura "Veículos para comprar" — criá-lo depois custaria mudar
navegação, menu e todos os `action_path` já gravados.

Nenhum botão morto: sem "Enviar veículo", sem WhatsApp, sem "em breve".

## Mobile

Medido no navegador real, com **navegação real** em cada largura (medir logo após redimensionar dá
layout velho — foi o que aconteceu na primeira tentativa e produziu um falso positivo de vazamento).
`body { overflow-x: hidden }` esconde vazamento, então a medição é por `getBoundingClientRect` de cada
elemento, não por scrollbar.

| Viewport | Resultado |
|---|---|
| 360×640 | 0 elementos fora da viewport em todas as 6 rotas; `scrollWidth` = 360 |
| 768×1024 | 0 vazamentos; marca/modelo lado a lado (2 colunas a partir de `sm`) |

Alturas de toque no formulário a 360px: selects/inputs **48px**, CTA **48px** e largura total
(328px = 360 − 32 de padding). UF empilha acima de Cidade no mobile.

## Segurança — verificado contra backend real

| Cenário | Resultado |
|---|---|
| PF A lê/encerra procura de PF B | **404** (`{success:false,error:"not_found"}`), nada muda |
| id malformado (`abc`, `1.5`, `-1`, `0`) | **404**, nunca 400 |
| CPF/`pending` na API do lojista | **403 `DEALER_ACCOUNT_REQUIRED`**, sem nenhuma query |
| CNPJ publicando procura | **403 `PURCHASE_INTENT_BUYER_ONLY`** |
| Lojista de Bragança lista Atibaia | lista vazia; id direto → **404**; 0 notificações |
| Query string `?city_id=1` do lojista de Bragança | ignorada — a query usa a cidade do advertiser |
| PII na resposta do lojista | ausente (allowlist exata; sem `JOIN users`) |
| Fallback territorial | inexistente |

## Testes

| Suíte | Antes | Depois |
|---|---|---|
| backend `npm test` | 187 arq. / 2591 | **190 arq. / 2756** — verde |
| backend lint | 11 erros (todos em `scripts/**`) | **11 erros — idêntico**, nenhum no código novo |
| frontend `npm run test` | 5 falhas / 2799 | **5 falhas / 2875** — mesmas 2 rotas de baseline |
| frontend typecheck | verde | **verde** |
| frontend lint | verde | **verde** |
| frontend build | verde | **verde** (6 rotas novas, todas dinâmicas) |

Novos testes (241 no total):

- `tests/purchase-intents/purchase-intents-validation.test.js` — 91
- `tests/purchase-intents/purchase-intents-service.test.js` — 40
- `tests/purchase-intents/purchase-intents-routes.test.js` — 34
- `tests/integration/purchase-intents-schema.integration.test.js` — 8 (**PostgreSQL real**)
- `frontend/lib/purchase-intents/api.test.ts` — 24
- `frontend/components/account/PurchaseIntents.test.tsx` — 17
- `frontend/components/account/PurchaseIntentForm.test.tsx` — 15
- `frontend/components/account/DealerOpportunities.test.tsx` — 12
- `frontend/components/account/AccountPanelShell.nav.test.tsx` — 8
- `frontend/e2e/purchase-intents.spec.ts` — 2 (**Playwright, executado e verde**)

O `fake-db.js` dos testes de backend **re-implementa** escopo por dono, escopo por cidade, filtro de
`expires_at` e o `ON CONFLICT DO NOTHING` — não devolve linha pronta. Apagar o `AND buyer_user_id`
do repository faz o teste de IDOR falhar; um mock ingênuo não faria.

### Integração real (Docker Postgres 15)

`npx vitest run tests/integration/purchase-intents-schema.integration.test.js` — 8/8 verdes. Prova:
tabela e colunas, FK CASCADE para `users`, FK para `cities` (e que ela **recusa** cidade inexistente),
**ausência** de FK para ads/advertisers/plans/payments/leads/messages, os dois índices (o da cidade
parcial), os CHECKs de vocabulário e o CHECK de forma recusando linha meio-preenchida nos dois modos,
e o CASCADE ao apagar o usuário.

### E2E

`npm run e2e:prepare` foi estendido de forma **aditiva** com dois lojistas CNPJ (Atibaia e Bragança).
Verificado que `full-flow.spec.ts` — o único spec que o CI roda — produz **exatamente o mesmo
resultado** com e sem a alteração (3 passaram / 6 pulados, mesmos testes), comparando com `git stash`.

### Verificação manual no navegador

Stack completa (Postgres + backend :4000 + Next :3000). Ciclo percorrido de ponta a ponta:
publicação pelo formulário real (com FIPE real) → card "Volkswagen T-Cross | Automático | Até
R$ 95.000 | Atibaia - SP | Ativa" → lojista de Atibaia vê e recebe a notificação
("Uma pessoa está procurando Volkswagen T-Cross automático em Atibaia.") → lojista de Bragança não vê
(0 na lista, 404 no id, 0 notificações) → PF encerra → lojista perde acesso na hora, PF mantém o
histórico como "Encerrada".

## Arquivos alterados

**Novos**
- `src/database/migrations/050_purchase_intents.sql`
- `src/modules/purchase-intents/` (constants, validation, repository, service, controller, routes,
  dealer.routes, rate-limit)
- `tests/purchase-intents/` (fake-db + 3 suítes)
- `tests/integration/purchase-intents-schema.integration.test.js`
- `frontend/lib/purchase-intents/api.ts` (+ teste)
- `frontend/lib/http/bff-proxy.ts`
- `frontend/app/api/account/purchase-intents/[[...path]]/route.ts`
- `frontend/app/api/account/opportunities/purchase-intents/[[...path]]/route.ts`
- `frontend/app/dashboard/minhas-procuras/` (3 páginas)
- `frontend/app/dashboard-loja/oportunidades/` (3 páginas)
- `frontend/components/account/` (PurchaseIntentCityField, PurchaseIntentForm, PurchaseIntentsList,
  PurchaseIntentDetail, DealerOpportunitiesList, DealerOpportunityDetail + 4 testes)
- `frontend/e2e/purchase-intents.spec.ts`

**Modificados (4)**
- `src/app.js` — 2 imports + 2 montagens + mapa de prefixos do cabeçalho
- `src/modules/notifications/notifications.constants.js` — +1 constante de evento
- `frontend/components/account/AccountPanelShell.tsx` — +1 item por painel, +1 ícone
- `scripts/e2e-seed.mjs` — +2 lojistas CNPJ (aditivo)

## Arquivos NÃO alterados

`src/modules/ads/**`, `src/modules/public/**`, `src/modules/payments/**`, `src/modules/seo/**`,
workers, Mercado Pago, planos, JWT/refresh, sitemaps, middleware SEO, gate territorial público,
`requireDealerAccount` (montado, não modificado), `advertiser.ensure.service.js`, migration 049.

## Débitos conhecidos

1. **Advertiser suspenso/bloqueado continua recebendo oportunidade.** Não há filtro por
   `advertisers.status` — decisão consciente, alinhada ao §50 (não filtrar por plano/estoque), mas
   `suspended`/`blocked` é caso diferente e provavelmente deve entrar na Fase 3.
2. **O E2E novo não roda no CI.** O job de e2e executa apenas `full-flow.spec.ts`. Rodar
   `purchase-intents.spec.ts` exige mudar o workflow — fora do escopo desta fase.
3. **O teste de schema também não roda no CI** (`ci:integration-ads` tem caminho fixo para
   `ads-pipeline.integration.test.js`). Mesmo débito já existente da migration 049.
4. **Sem paginação na UI.** A API pagina por cursor (default 20, teto 50) nas duas pontas, mas as
   telas carregam só a primeira página. Com o volume atual não é visível; vira necessário quando uma
   cidade passar de 20 procuras ativas.
5. **`advertisers.user_id` continua sem UNIQUE.** O código falha fechado diante de cidades
   conflitantes, mas a constraint em si é dívida da Fase 0.1 e exige auditoria própria.
6. **Cabeçalho público vaza a 360px** em rotas pré-existentes — não é regressão desta fase e não foi
   tocado (confirmado em rota não modificada).

## GO / NO-GO para Fase 3

**GO.**

A entidade `purchase_intent` está isolada, validada nas duas pontas, com invariante de forma garantido
pelo banco e taxonomia (marca canônica, modelo comercial, câmbio/carroceria em slug) já no formato que
o matching da Fase 3 vai consumir. Nada de `purchase_intent_offers`, `ad_id`, envio de veículo,
WhatsApp, leilão ou matching foi criado.
