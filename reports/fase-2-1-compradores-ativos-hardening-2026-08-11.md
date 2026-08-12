# Fase 2.1 — Hardening de Compradores Ativos

Data: 2026-08-11
Branch: `codex/opportunities-phase-2-purchase-intents`
Complemento de [`fase-2-compradores-ativos-2026-08-11.md`](./fase-2-compradores-ativos-2026-08-11.md).

## Estado inicial

- branch: `codex/opportunities-phase-2-purchase-intents`, sincronizada com `origin`
- HEAD inicial: `cc82e8329cf98eb3bee217e1bfb18a36895b2d41`
- working tree: limpo

Duas pendências registradas no relatório da Fase 2 e corrigidas aqui:

1. advertiser suspenso/bloqueado continuava recebendo demanda privada;
2. a API paginava por cursor, mas as telas carregavam só a primeira página.

## Advertiser status

Regra: **só loja com status operacional participa**. Reusa
`ADVERTISER_STATUS` de `src/shared/constants/status.js` — nada de `"active"` solto.

O filtro entra no **SQL**, nas duas consultas (resolução da cidade e fan-out), e não numa
checagem posterior do service: uma loja suspensa não deve nem chegar à camada que decide a
cidade.

```sql
COALESCE(NULLIF(BTRIM(adv.status), ''), 'active') = $2
```

### Por que NULL e '' contam como ACTIVE

`advertisers.status` nasce `NOT NULL DEFAULT 'active'` no `CREATE TABLE` da migration 003 —
mas as migrations 003 e 012 também a re-adicionam com
`ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'` para bancos legados, e **o DEFAULT não
preenche linha que já existia**. A própria 012 declara a leitura do projeto ao fazer o backfill
`status = COALESCE(NULLIF(status, ''), 'active')`, e `public-dealer.service.js:57` já usa
`COALESCE(adv.status, 'active') = 'active'`.

Tratar NULL como "não ativo" seria fail-closed no papel e um defeito na prática: trancaria para
fora lojistas legítimos cuja linha é anterior à coluna — estrago maior que o problema corrigido.
`suspended` e `blocked` são estados **explícitos**, sempre escritos por moderação.

> Descoberta durante o teste de integração: num banco **novo** a coluna é `NOT NULL`, então o
> caso NULL nem é inserível. Ele só existe em banco legado. O teste reproduz essa forma de
> propósito (`ALTER COLUMN status DROP NOT NULL`), como `migrations-compat` faz com
> `seedLegacyPartialSchema` — sem isso o ramo do `COALESCE` ficaria sem cobertura justamente no
> banco em que importa.

### Matriz verificada

| Cenário                                | Resultado                                  |
| -------------------------------------- | ------------------------------------------ |
| `active`                               | participa                                  |
| status ausente (NULL)                  | participa                                  |
| status vazio (`"  "`)                  | participa                                  |
| `suspended`                            | **não participa**                          |
| `blocked`                              | **não participa**                          |
| ativo Atibaia + **bloqueado** Bragança | Atibaia (bloqueado **não** cria conflito)  |
| ativo Atibaia + **suspenso** Bragança  | Atibaia                                    |
| ativo Atibaia + ativo Bragança         | **fail closed** (null)                     |
| duas linhas ativas na MESMA cidade     | Atibaia (não é conflito)                   |
| todas as lojas suspensas/bloqueadas    | **fail closed** — lista vazia, detalhe 404 |

O caso _ativo + bloqueado em outra cidade_ é o que a Fase 2.1 mais corrige: antes, a linha
bloqueada empatava com a ativa e trancava o lojista para fora da própria cidade operacional.

### Comportamento para a loja fora do ar

Ela **passa** por `requireDealerAccount` (é CNPJ) e mesmo assim:

- `GET` lista → `200` com lista **vazia**;
- `GET` detalhe → `404` `{ success: false, error: "not_found" }` — idêntico ao de oportunidade
  inexistente, então não confirma a existência da linha;
- fan-out → **não é notificada**.

`requireDealerAccount` **não foi alterado** (§13): status da LOJA é regra diferente de tipo da
CONTA.

## Fan-out

Mesmo predicado da resolução de cidade — de propósito. Se divergissem, a loja suspensa receberia
o aviso e bateria num 404 ao clicar.

| Cenário (Atibaia)                                   | Notificados                             |
| --------------------------------------------------- | --------------------------------------- |
| A `active`, B `suspended`, C `blocked`, D `active`  | **A e D** (2)                           |
| duas linhas `active` do mesmo usuário               | **1** (DISTINCT preservado)             |
| linha `active` + linha `suspended` do mesmo usuário | **1**                                   |
| cidade só com suspensa/bloqueada                    | **0** — e a procura publica normalmente |

O `JOIN users` do fan-out continua existindo **só** para validar CNPJ. A consulta de
oportunidades (a que responde ao lojista) segue sem tocar em `users`.

## Paginação PF e PJ

Contrato da API **intocado** (default 20, teto 50, `next_cursor`). O cursor continua **opaco**:
vem do backend e volta sem ser interpretado.

Hook único `usePaginatedIntents` para as duas telas — o comportamento é idêntico, e duas cópias
divergiriam na primeira correção (o `audit:clones` roda no CI).

| Comportamento                           | PF  | PJ  |
| --------------------------------------- | --- | --- |
| página 1 (sem cursor)                   | ✅  | ✅  |
| botão aparece só com `next_cursor`      | ✅  | ✅  |
| **append** (não substituição)           | ✅  | ✅  |
| dedup por id                            | ✅  | ✅  |
| erro na página 2 preserva a página 1    | ✅  | ✅  |
| retry no mesmo cursor                   | ✅  | ✅  |
| clique duplo → 1 request                | ✅  | ✅  |
| botão **some** com `next_cursor = null` | ✅  | ✅  |
| lista vazia não mostra botão            | ✅  | ✅  |

Decisões que valem registro:

- **botão explícito, sem scroll infinito** (§17): no celular o autoload dispara request ao rolar
  sem querer e briga com o botão voltar;
- **guarda de request em voo por `useRef`**, não pelo estado `loadingMore`: estado só chega ao DOM
  no próximo render, então dois cliques rápidos leriam o mesmo `false` e disparariam duas
  requests. O `disabled` continua existindo para o usuário — o ref é para a máquina;
- **erro parcial ≠ erro de tela**: só a falha da PRIMEIRA página vira estado de erro; a da página
  seguinte é uma mensagem discreta ao lado do botão, com a lista preservada;
- `<button>` real com `disabled` e `aria-busy` (§24) — nunca div clicável.

## Mobile

Medido no navegador real, com **navegação real** em cada largura (medir logo após redimensionar
devolve layout velho). Overflow conferido por `getBoundingClientRect` elemento a elemento, porque
`body { overflow-x: hidden }` esconde vazamento.

| Viewport | Overflow | Botão "Carregar mais"  |
| -------- | -------- | ---------------------- |
| 360×640  | 0        | 328×48 (largura total) |
| 390×844  | 0        | 358×48 (largura total) |
| 768×1024 | 0        | 220×48                 |
| 1440×900 | 0        | 220×48                 |

Fluxo real percorrido nas duas telas com 25 registros: 20 cards + botão → clique → **25 cards
únicos**, botão some. Sem duplicação (25 preços distintos).

> A criação em massa via API foi **barrada pelo próprio limitador** (5/min por usuário) — o guard
> da Fase 2 funcionando. Os 25 registros foram semeados direto no banco de teste.

## Testes

| Suíte                   | Fase 2                                        | Fase 2.1                             |
| ----------------------- | --------------------------------------------- | ------------------------------------ |
| backend `npm test`      | 190 arq. / 2756                               | **190 / 2777** ✅                    |
| backend lint            | 11 erros / 222 avisos (todos em `scripts/**`) | **idêntico** — BASELINE FAILURE      |
| frontend `npm run test` | 5 falhas / 2875                               | **5 falhas / 2894** (mesmas 2 rotas) |
| frontend typecheck      | verde                                         | **verde** ✅                         |
| frontend lint           | verde                                         | **verde** ✅                         |
| frontend build          | verde                                         | **verde** ✅                         |
| integração (PG real)    | 8/8                                           | **9/9** ✅                           |
| E2E (stack real)        | 2/2                                           | **2/2** ✅                           |

Novos testes (+56):

- `purchase-intents-service.test.js` — +21 (status, mixed rows, conflito só entre ativas, fan-out)
- `purchase-intents-routes.test.js` — +6 (HTTP: lista vazia, 404, predicado no SQL)
- `purchase-intents-schema.integration.test.js` — +1 (predicado contra Postgres real, **importado**
  do repository em vez de copiado — copiar deixaria o teste passar depois de o código mudar)
- `PurchaseIntentsPagination.test.tsx` — +20 (10 cenários × PF e PJ)
- E2E — cobertura de suspenso e bloqueado na mesma cidade

### Nota honesta sobre uma falha intermitente

Numa das quatro execuções da suíte completa apareceu uma **6ª** falha em
`lib/painel/upload-draft-photos-direct-r2.test.ts` (`isR2ConfiguredInBff`). Investigado:

- passa isoladamente (2/2);
- **não** reapareceu em duas execuções completas seguintes (5 falhas, o conjunto de baseline);
- não existe no baseline verificado com `git stash`;
- o arquivo lê `process.env` — mesma classe de vazamento entre workers que já causa as 5 falhas
  conhecidas.

Conclusão: flake de ambiente, não regressão da Fase 2.1. Registrado por transparência, não
corrigido (fora do escopo).

## Arquivos alterados

**Novos (3)**

- `frontend/lib/purchase-intents/use-paginated-intents.ts`
- `frontend/components/account/LoadMoreButton.tsx`
- `frontend/components/account/PurchaseIntentsPagination.test.tsx`

**Modificados (12)**

- `src/modules/purchase-intents/purchase-intents.repository.js` — predicado de status nas 2 queries
- `src/modules/purchase-intents/purchase-intents.service.js` — call site + doc do fail closed
- `frontend/lib/purchase-intents/api.ts` — cursor nos dois fetchers
- `frontend/components/account/PurchaseIntentsList.tsx` / `DealerOpportunitiesList.tsx` — hook + botão
- testes: `fake-db.js`, `purchase-intents-service.test.js`, `purchase-intents-routes.test.js`,
  `purchase-intents-schema.integration.test.js`, `DealerOpportunities.test.tsx`
- `scripts/e2e-seed.mjs` + `frontend/e2e/purchase-intents.spec.ts` — lojistas suspenso/bloqueado

## Domínios não alterados

`ads`, `SEO`, `payments`, `plans`, auth internals, workers, `requireDealerAccount`, migration 050
(nenhuma migration nova foi necessária), contrato da API de paginação, formulário, navegação,
filtro territorial, expiração, close, privacidade.

## Pendências remanescentes

1. **O E2E e o teste de schema continuam fora do CI** — o job roda só `full-flow.spec.ts` e
   `ads-pipeline.integration.test.js`. Débito herdado da migration 049.
2. **`advertisers.user_id` continua sem UNIQUE** — o código falha fechado, mas a constraint exige
   auditoria própria.
3. **Não há UI para o admin suspender/reativar loja no contexto de oportunidades** — a regra lê
   `advertisers.status`, que hoje é escrito pelo fluxo administrativo existente.
4. **5 falhas de baseline no frontend** permanecem (2 arquivos, sem relação com esta fase).

## Veredito

**GO para merge da Fase 2.**

As duas pendências que bloqueavam o merge estão fechadas, com cobertura em quatro níveis
(unidade, HTTP, Postgres real e E2E na stack completa) e verificação manual no navegador em quatro
viewports. Nenhuma regressão: backend cresceu de 2756 para 2777 testes verdes e o frontend manteve
exatamente o mesmo conjunto de falhas de baseline.
