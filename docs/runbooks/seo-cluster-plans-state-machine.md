# State Machine — `seo_cluster_plans` & `seo_publications`

> **Coletado em:** 2026-05-03 contra `https://carros-na-cidade-core.onrender.com`
> (backend prod) e leitura de código.
> **Escopo:** continuação da Fase 1 da investigação em
> [sitemap-empty-investigation.md](./sitemap-empty-investigation.md).
> Esta migration (`022_seo_publications_is_indexable.sql`) corrige **somente
> o erro de schema confirmado**. Auditoria SQL em prod fica documentada como
> instrução para o operador rodar com acesso read-only — banco local não
> estava disponível neste ambiente (Docker offline, 5433 ECONNREFUSED).

---

## 1. Estado atual das tabelas

### 1.1 Confirmado pelos endpoints HTTP em prod

| Endpoint | HTTP | Body | Conclusão |
|---|---|---|---|
| `/api/public/seo/sitemap/type/city_home?limit=10` | 200 | `{"success":true,"data":[]}` | Tabela `seo_cluster_plans` existe; query roda; WHERE filtra tudo. |
| `/api/public/seo/sitemap/type/city_below_fipe` | 200 | `{"success":true,"data":[]}` | idem |
| `/api/public/seo/sitemap/type/city_brand` | 200 | `{"success":true,"data":[]}` | idem |
| `/api/public/seo/sitemap/type/city_brand_model` | 200 | `{"success":true,"data":[]}` | idem |
| `/api/public/seo/sitemap/region/SP` | 200 | `{"success":true,"data":[]}` | **SEM filtro de cluster_type, ainda vazio** — confirma que a tabela está vazia OU todos os registros têm `status` fora de `('planned','generated')`. Não é divergência por `cluster_type`. |
| `/api/public/seo/sitemap.json` | **500** | `{"message":"column sp.is_indexable does not exist","details":{"code":"42703",...}}` | `seo_publications` existe; coluna `is_indexable` não. **Esta migration corrige.** |
| `/api/public/seo/sitemap.xml` | 200 | 446 bytes — só `/` e `/anuncios` (fallback) | Controller catch-all (`sendCanonicalSitemapXml`) mascara o 500 acima devolvendo as 2 URLs estáticas de `buildFallbackEntries()`. |

### 1.2 Tabelas — origem em migrations oficiais

| Tabela | Migration que cria? | Existe em prod? | Observação |
|---|---|---|---|
| `seo_cluster_plans` | **❌ NENHUMA** (`grep -l seo_cluster_plans src/database/migrations/*.sql` → 0/21) | **SIM** (queries rodam sem erro de relation) | Criada out-of-band — sem trilha de auditoria de schema. |
| `seo_publications` | **❌ NENHUMA** | **SIM** (erro do 500 é "column does not exist", não "relation does not exist") | Mesma situação. Coluna `is_indexable` ausente até esta migration. |
| `cities` | ✅ `001_baseline_cities.sql` | SIM | OK. |
| `seo_city_metrics` | ✅ `015_seo_city_metrics_canonical.sql` | SIM | Não relacionada ao sitemap territorial. |

### 1.3 Auditoria SQL recomendada (read-only, prod)

Banco local não disponível neste ambiente. Operador deve rodar via Render
psql do serviço `carros-na-cidade-core`:

```sql
-- Sanity check geral
SELECT COUNT(*) AS plans_total FROM seo_cluster_plans;
SELECT COUNT(*) AS pubs_total FROM seo_publications;
SELECT COUNT(*) AS cities_total FROM cities;

-- Distribuição por tipo + status (a evidência mais importante)
SELECT cluster_type, status, COUNT(*)
FROM seo_cluster_plans
GROUP BY cluster_type, status
ORDER BY cluster_type, status;

-- Quando os registros foram criados (worker rodou alguma vez?)
SELECT MIN(created_at) AS first_plan,
       MAX(created_at) AS last_plan,
       MAX(updated_at) AS last_update
FROM seo_cluster_plans;

-- Schema atual de seo_publications (confirmar lista de colunas e se
-- is_indexable já foi adicionado por esta migration)
\d seo_publications

-- Após migration 022, verifique:
SELECT is_indexable, COUNT(*)
FROM seo_publications
GROUP BY is_indexable;

-- Sanity de cities (JOIN do sitemap depende disso)
SELECT COUNT(*) FROM cities;

-- Anúncios ativos por cidade (verifica se há motivo SEO pra ter URLs no sitemap)
SELECT COUNT(*) AS active_ads FROM ads WHERE status = 'active';
SELECT COUNT(*) AS active_ads_with_city FROM ads WHERE status = 'active' AND city_id IS NOT NULL;
```

**Apêndice a preencher após o operador rodar acima:**

```
plans_total      = ?
pubs_total       = ?
cities_total     = ?
active_ads       = ?
plans by (cluster_type, status):
  ?
first_plan / last_plan / last_update:
  ?
```

---

## 2. State machine observada (do código)

Mapeada por leitura, não há documento canônico no projeto.

### 2.1 Escritores conhecidos

| Componente | Tabela | Status que grava | Observação |
|---|---|---|---|
| `src/modules/seo/planner/cluster-plan.repository.js#upsertClusterPlan` | `seo_cluster_plans` | default `'planned'` | Único caller que insere. Aceita override do parâmetro `status`. |
| `src/workers/seo/cluster-planner.worker.js#startClusterPlannerWorker` | (chama o anterior via `runClusterPlannerEngine`) | — | Roda só se `RUN_WORKERS=true`. Default desligado. |
| `src/modules/seo/publishing/content-publisher.repository.js#upsertSeoPublication` | `seo_publications` | default `'published'` | Default `isIndexable = true`. |
| `src/modules/seo/publishing/content-publisher.repository.js#markClusterPublished` | `seo_cluster_plans` | promove para `'published'` | Chamado após o publisher gravar com sucesso. |
| `src/modules/seo/publishing/publication-validator.service.js` | `seo_publications` (via audit) | grava `is_indexable: issues.length === 0` + `health_status: "healthy" \| "needs_review"` | Chamado pelo audit para revalidar publicações existentes. |

### 2.2 Status conhecidos no código

| Status | Onde aparece | Significado inferido |
|---|---|---|
| `planned` | Default do upsert do planner; aceito por ambos os SQLs do sitemap | "cluster identificado, sem conteúdo gerado ainda" |
| `generated` | Aceito SOMENTE em `sitemap-public.repository.js` (filtro `('planned','generated')`) | Nunca encontrado sendo GRAVADO no código — possivelmente legado de uma fase anterior do pipeline OU estado intermediário da engine de geração. |
| `published` | Default do publisher; grava via `markClusterPublished`; aceito SOMENTE em `public-seo.service.js` (filtro `('published','planned')`) | "cluster com conteúdo publicado" |
| `review_required` | Aparece em `public-seo.service.js#listEntries` no filtro de `seo_publications.status` (LEFT JOIN), não no `scp.status` | Estado da PUBLICAÇÃO (não do plano) — publicação que precisa de review humana. |

### 2.3 `is_indexable` (em `seo_publications`)

| Caller | Comportamento |
|---|---|
| `content-publisher.repository.js` (linha 17) | parâmetro JS default = `true` |
| `publication-validator.service.js` (linha 76) | `is_indexable: issues.length === 0` (TRUE quando não há issues) |
| `publication-audit.repository.js` (linha 36) | `UPDATE seo_publications SET is_indexable = $2` — sempre Boolean coerced |
| `public-seo.service.js` (linha 47) | filtro: `(sp.id IS NULL OR sp.is_indexable = TRUE)` — TRUE inclui no sitemap |
| `city-performance.repository.js` (linha 81) | `COUNT(*) FILTER (WHERE sp.is_indexable = true)` — métrica de "indexable_pages" |

**Default da migration 022 = `TRUE`** alinha com TODOS esses call sites. Default
`FALSE` excluiria silenciosamente todas as publicações pré-existentes do
sitemap até cada uma ser republicada — regressão grave.

---

## 3. Divergências encontradas

### 3.1 Schema drift entre os dois SQLs do backend

| Aspecto | `sitemap-public.repository.js` (`/sitemap/type/`, `/sitemap/region/`) | `public-seo.service.js` (`/sitemap.json`, `/sitemap.xml`) |
|---|---|---|
| Tabelas | `seo_cluster_plans scp JOIN cities c` | `seo_cluster_plans scp LEFT JOIN seo_publications sp LEFT JOIN cities c` |
| Filtro de status `scp` | `('planned', 'generated')` | `('published', 'planned')` |
| Referência a `is_indexable` | Não usa | `(sp.id IS NULL OR sp.is_indexable = TRUE)` |
| Filtro de status `sp` | n/a | `(sp.id IS NULL OR sp.status IN ('published','review_required'))` |
| `lastmod` | `scp.updated_at` apenas | `COALESCE(sp.updated_at, sp.published_at, scp.last_generated_at, scp.updated_at, scp.created_at)` |

**Conjunto comum:** ambos aceitam `'planned'` em `scp.status`.
**`'generated'`** é exclusivo do repository público — **ninguém grava esse valor** pelo grep do código. Pode ser legado.
**`'published'`** é exigido pelo service canônico — promovido só após o publisher rodar com sucesso.

### 3.2 Frontend lê env diferente do resto do app

`frontend/lib/seo/sitemap-client.ts#getApiBaseUrl()` lê só `API_URL` ou
`NEXT_PUBLIC_API_URL`. O resto do frontend (`lib/env/backend-api.ts`) lê
5 chaves: `AUTH_API_BASE_URL`, `BACKEND_API_URL`, `CNC_API_URL`,
`API_URL`, `NEXT_PUBLIC_API_URL`. Se Render tiver só `BACKEND_API_URL`
configurado, sitemaps falham silenciosamente sem afetar o resto do
frontend. **Não é causa raiz dos sitemaps territoriais vazios** (porque
backend respondeu HTTP 200 com `data:[]` quando consultado direto), mas
é uma armadilha futura.

### 3.3 Comentários de `app/sitemaps/*.xml/route.ts` desatualizados vs Fase 1

`cities.xml` ainda reescreve `/cidade/[slug]` → `/comprar/cidade/[slug]`
quando a Fase 1 dos canonicals (commit `24009155`) já moveu canonical
para `/carros-em/[slug]`. Documentado em §8 da investigação anterior.

---

## 4. Hipótese final sobre sitemap territorial vazio

**Causa raiz mais provável (priorizada):**

1. **`seo_cluster_plans` está vazia em produção.** Confirmado indiretamente:
   - `/sitemap/type/<type>` para 4 tipos diferentes → todos `data:[]`.
   - `/sitemap/region/SP` (sem filtro de cluster_type) → `data:[]`.
   - O único filtro comum a esses 5 endpoints é `scp.status IN ('planned','generated')`.
     Se há registros de qualquer cluster_type com `status='planned'`, ao menos um endpoint
     retornaria. Nenhum retorna → tabela vazia ou 100% das linhas com status fora
     de `('planned','generated')`.

2. **`RUN_WORKERS=true` provavelmente não está configurado no web service** —
   `cluster-planner.worker.js` é o único caller de `upsertClusterPlan`. Sem
   essa env, `seo_cluster_plans` nunca recebe inserts.

3. **Schema drift de `is_indexable`** (esta migration corrige) — afeta
   `/sitemap.json` e `/sitemap.xml` canônicos, não os 4 sitemaps territoriais
   diretamente. Mas é causa raiz do `HTTP 500` confirmado em prod e o
   fallback de 2 URLs estáticas do `sendCanonicalSitemapXml`.

**Causa secundária possível (a confirmar quando o pipeline rodar):**

4. **Status drift `'generated'` vs `'published'`** — se o planner gravar
   `'generated'` (estado que ninguém parece gravar mas o filtro do
   repository público aceita), as URLs aparecem em `/sitemap/type/*` mas
   ficam ocultas em `/sitemap.json`. Validar quando houver dados reais na
   tabela.

**Causa pouco provável:**

5. **Cache CDN/Next stuck no vazio** — Cloudflare s-maxage=3600+swr=86400.
   Mesmo que `purge`, o backend ainda devolve `data:[]`, então é sintoma
   prolongado, não causa.

**Causa eliminada por evidência:**

- ❌ "Endpoint backend retorna erro de filtro/cluster_type" — endpoints
  retornam HTTP 200, sem erro de SQL ou de validação.
- ❌ "`seo_cluster_plans` não existe em prod" — query roda sem erro de
  relation, só de zero rows.

---

## 5. Próxima correção recomendada

> **Tarefa:** Auditar `seo_cluster_plans` em produção via Render psql
> read-only e decidir entre 3 caminhos. Sem alterar código nesta etapa —
> só auditoria + decisão documentada.
>
> 1. **Conectar ao DB de prod via Render Shell** (`carros-na-cidade-core`),
>    rodar as queries em §1.3 deste runbook, preencher o apêndice.
>
> 2. **Decidir baseado nos resultados:**
>
>    **Caminho A — tabela vazia (`plans_total = 0`):**
>    - Causa: planner nunca rodou.
>    - Próxima ação (ainda sem alterar código): validar se
>      `RUN_WORKERS=true` está no painel Render do web service E/OU se
>      existe worker dyno separado.
>    - Se nenhum dos dois: criar runbook `cluster-planner-bootstrap.md`
>      com passos pra rodar o planner manualmente uma vez via Render Shell.
>
>    **Caminho B — tabela cheia mas todos com status fora de `('planned','generated')`:**
>    - Causa: status drift confirmado.
>    - Próxima ação: documentar a state machine real em runbook novo
>      `cluster-plan-status-machine.md` (transições reais, não inferidas)
>      e propor padronização de filtros entre os dois SQLs do backend.
>    - **NÃO** alterar dados em prod. Migration de status drift fica para
>      etapa futura, depois de discussão.
>
>    **Caminho C — tabela cheia com status válidos mas distribuição estranha:**
>    - Causa: filtros corretos, dados parciais. Investigar individualmente.
>    - Próxima ação: profilar entradas, verificar se `cluster_type` cobre
>      todas as cidades esperadas, etc. Análise dirigida.
>
> 3. **NÃO alterar:** frontend, layout, components, sitemap em código,
>    canonical em código, robots, rotas, ranking, planos, Página Regional,
>    `RUN_WORKERS`, planner, status drift. Apenas auditoria SQL read-only +
>    decisão documentada.
>
> **Antes de rodar:** ler `src/brain/engines/cluster-planner.engine.js`
> (responsável por gerar os planos) e `src/modules/seo/publishing/seo-publishing.worker.js`
> (responsável por promover `'planned'` → `'published'`) para entender o
> fluxo end-to-end antes de tocar qualquer dado em prod.

---

## Auditoria SQL de produção — 2026-05-03

### Ambiente

| Item | Valor |
|---|---|
| Serviço Render alvo | `carros-na-cidade-core` (web service backend) |
| Banco | Postgres do plano do mesmo serviço (string `DATABASE_URL` no painel — **não exposta**) |
| Migration `022_seo_publications_is_indexable.sql` aplicada? | **NÃO CONFIRMADO** (depende de `npm run db:migrate` ou `RUN_MIGRATIONS=true` no boot do serviço) |
| Quem deve rodar | Operador com Render Shell do `carros-na-cidade-core` |
| Quem rodou | **PENDENTE** — assistente NÃO tem acesso a este ambiente (sem `render` CLI, `psql` ou `DATABASE_URL` local; `.env` está fora do git por segurança, conforme commit `4250060`) |

### Status desta auditoria

**Esta seção foi pré-preenchida com evidência DETERMINÍSTICA de código + evidência indireta de prod via curl.** O resultado dos `SELECT`s reais ainda precisa ser colado pelo operador no apêndice abaixo, mas a conclusão operacional já é defensável **só com a evidência de código** — a auditoria SQL serve como sanity check.

### Evidência de código que torna o Caminho A determinístico

Trilha completa, sem dependência de SQL contra prod:

```
runClusterPlannerEngine(limit)        ← src/brain/engines/cluster-planner.engine.js
  └─> clusterPlannerService.buildTopCitiesClusterPlans(limit)
                                      ← src/modules/seo/planner/cluster-planner.service.js
        └─> for each city → buildCityClusterPlan(city)
                  └─> retorna clusters em MEMÓRIA, sem persistir
        └─> retorna array, sem persistir
  └─> retorna array, sem persistir

✗ Nenhuma chamada a clusterPlanRepository.upsertClusterPlan() neste fluxo.
```

As funções que efetivamente persistem em `seo_cluster_plans` existem mas estão **órfãs**:

```
src/modules/seo/planner/cluster-plan.service.js
  ├─ persistCityClusterPlan(city)        ← chama upsertClusterPlan ✓
  └─ persistTopCityClusterPlans(limit)   ← chama upsertClusterPlan ✓

grep -rn "persistTopCityClusterPlans\|persistCityClusterPlan" src --include="*.js"
→ retorna SOMENTE as próprias declarações.
→ ZERO callers no projeto inteiro.
```

**Implicação:** mesmo que `RUN_WORKERS=true` esteja configurado no Render, o `cluster-planner.worker` chama `runClusterPlannerEngine`, que chama `buildTopCitiesClusterPlans`, que constrói clusters em memória e os retorna sem nunca tocar `seo_cluster_plans`. O fluxo automático **nunca persiste** — não é questão de "worker desligado", é questão de "wire desconectado" entre build e persist.

Isso explica todas as evidências indiretas:
- `/api/public/seo/sitemap/type/<type>` → `data:[]` para 4 tipos diferentes
- `/api/public/seo/sitemap/region/SP` (sem filtro de tipo) → `data:[]`
- HTTP 200 sem erro de relation → tabela existe, query roda, zero rows

### Tabelas encontradas

> **PENDENTE — operador deve preencher após rodar `\d` ou `information_schema.tables` via Render Shell.**

| Tabela | Existe? | Total de registros | Observações |
|---|---|---|---|
| `seo_cluster_plans` | _(esperado: SIM)_ | _(esperado: 0 ou pequeno)_ | Aparentemente vazia. Backend devolve `data:[]` em todos os endpoints. |
| `seo_publications` | _(esperado: SIM)_ | _(operador rodar)_ | Coluna `is_indexable` ausente até migration 022 ser aplicada. |
| `cities` | _(esperado: SIM)_ | _(esperado: ~5570)_ | OK, alimentado por seed IBGE. |
| `ads` | _(esperado: SIM)_ | _(operador rodar)_ | OK, dados reais de produção. |

**Queries a rodar (copia-cola no Render Shell):**

```sql
-- 1. Existência das 4 tabelas
SELECT table_name
FROM information_schema.tables
WHERE table_schema = current_schema()
  AND table_name IN ('seo_cluster_plans', 'seo_publications', 'cities', 'ads')
ORDER BY table_name;

-- 2. Schema de seo_cluster_plans e seo_publications
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name IN ('seo_cluster_plans', 'seo_publications')
ORDER BY table_name, ordinal_position;

-- 3. Contagens
SELECT COUNT(*) AS total FROM seo_cluster_plans;
SELECT COUNT(*) AS total FROM seo_publications;
SELECT COUNT(*) AS total FROM cities;
SELECT COUNT(*) AS total_active_ads FROM ads WHERE status = 'active';
SELECT COUNT(*) AS total_active_ads_with_city FROM ads WHERE status = 'active' AND city_id IS NOT NULL;
```

### Distribuição `seo_cluster_plans` (cluster_type × status)

> **PENDENTE — operador rodar a query abaixo e colar o resultado.**

```sql
SELECT cluster_type, status, COUNT(*) AS total
FROM seo_cluster_plans
GROUP BY cluster_type, status
ORDER BY cluster_type, status;
```

| cluster_type | status | total |
|---|---|---|
| _(esperado: vazio — nenhuma linha)_ | _—_ | _—_ |

**Por que esperamos vazio:** ver §"Evidência de código" acima — o fluxo automático não persiste.

### Datas (sinal se o pipeline rodou alguma vez)

> **PENDENTE — operador rodar:**

```sql
SELECT MIN(created_at) AS first_plan,
       MAX(created_at) AS last_plan,
       MAX(updated_at) AS last_update
FROM seo_cluster_plans;
```

| Métrica | Valor real |
|---|---|
| MIN(created_at) | _operador preencher_ |
| MAX(created_at) | _operador preencher_ |
| MAX(updated_at) | _operador preencher_ |

Se todos `NULL`: tabela vazia (esperado).
Se há datas mas a tabela só tem poucas linhas: pode haver dados antigos de seed manual ou teste — investigar amostra.

### Distribuição `seo_publications.is_indexable`

> **Só rodar APÓS aplicar a migration 022.** Antes da migration, esta query falha com `column "is_indexable" does not exist`.

```sql
SELECT is_indexable, COUNT(*) AS total
FROM seo_publications
GROUP BY is_indexable
ORDER BY is_indexable;
```

| is_indexable | total |
|---|---|
| _(esperado pós-migration: TRUE = todas as linhas legadas, FALSE = 0)_ | _operador preencher_ |

### Amostra de `seo_cluster_plans` (se houver dados)

```sql
SELECT id, cluster_type, status, path, city_id, created_at, updated_at
FROM seo_cluster_plans
ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
LIMIT 20;
```

> **PENDENTE — operador rodar.** Se vazio, confirma Caminho A. Se há linhas com status diferente de `('planned','generated','published')`, indica Caminho B.

---

### Conclusão operacional

**Caminho escolhido: A (`seo_cluster_plans` vazia).**

**Confiança:** **ALTA** — apoiada em:
1. **Evidência determinística de código** (callers órfãos de `persistTopCityClusterPlans`/`persistCityClusterPlan`).
2. **Evidência indireta de prod via curl** (5 endpoints diferentes, todos `data:[]`).
3. **Migrations não criam a tabela** (criada out-of-band → sem garantia de seed inicial).

**Caveat:** confirmação 100% requer o operador rodar `SELECT COUNT(*) FROM seo_cluster_plans;` no Render Shell. Se o resultado for `> 0`, reavaliar para Caminho B ou C — mas isso seria evidência **contraditória** ao código (alguém populou a tabela manualmente em algum momento, fora do fluxo).

**Causa raiz:** o fluxo automático tem **dois bugs encadeados**:
- (i) a função `persistTopCityClusterPlans` em `cluster-plan.service.js` está implementada mas órfã (zero callers);
- (ii) a engine `runClusterPlannerEngine` chama o builder em memória (`buildTopCitiesClusterPlans`) em vez do persistor (`persistTopCityClusterPlans`).

**Próximo passo (sem alterar código nesta etapa):**
- Operador roda os SQLs acima e cola os resultados num PR de docs (atualizando este apêndice).
- Em paralelo, criar runbook novo `cluster-planner-bootstrap.md` documentando como reconectar o "wire" desconectado entre build e persist (fix de 1 linha em `cluster-planner.engine.js` OU 1 linha em `cluster-planner.worker.js`), com plan de roll-out (rodar manualmente uma vez em staging → validar `seo_cluster_plans` populada → confirmar sitemap territorial volta a ter URLs → ligar fix em prod).

---

## Próximo prompt recomendado

> **Tarefa:** Documentar a correção do "wire" desconectado entre o builder e o persistor de `seo_cluster_plans`, **sem implementar a correção**. Criar runbook novo `docs/runbooks/cluster-planner-bootstrap.md` cobrindo:
>
> 1. Diagnóstico exato com citações de linha:
>    - `src/brain/engines/cluster-planner.engine.js:7` chama `buildTopCitiesClusterPlans` (não persiste).
>    - `src/modules/seo/planner/cluster-plan.service.js:32-63` define `persistTopCityClusterPlans` (persiste, mas órfão).
>    - `grep -rn "persistTopCityClusterPlans\|persistCityClusterPlan" src --include="*.js"` retorna apenas as próprias declarações.
>
> 2. Opções de correção (analisar trade-offs, sem implementar):
>    - **Opção 1:** trocar a chamada na engine para `persistTopCityClusterPlans` (1 linha; mais cirúrgico).
>    - **Opção 2:** adicionar `await persistCityClusterPlan(city)` no loop em `buildTopCitiesClusterPlans` (mistura responsabilidades).
>    - **Opção 3:** criar nova engine `persistClusterPlansEngine` e ajustar worker (mais código, separação clara).
>
>    Recomendar Opção 1 com justificativa.
>
> 3. Plano de roll-out de 4 fases:
>    - Fase 1 — fix de 1 linha + teste unitário verificando que `runClusterPlannerEngine` agora persiste.
>    - Fase 2 — rodar manualmente em staging (Render Shell: `node -e 'import("./src/brain/engines/cluster-planner.engine.js").then(m => m.runClusterPlannerEngine(50))'`); validar `seo_cluster_plans` populada; validar `/api/public/seo/sitemap/type/city_home` retorna `data:[...]`.
>    - Fase 3 — deploy em prod sem ligar `RUN_WORKERS` ainda; rodar 1x manual via Render Shell; validar.
>    - Fase 4 — só depois habilitar `RUN_WORKERS=true` (intervalo padrão 6h) ou migrar workers para dyno separado.
>
> 4. **NÃO alterar:** frontend, layout, components, sitemap em código, canonical em código, robots, rotas, ranking, planos, Página Regional, RUN_WORKERS em prod, dados em prod, código backend nesta etapa. Apenas markdown novo + decisão arquitetural documentada.
>
> 5. **Antes de escrever o runbook:** o operador deve idealmente rodar os SQLs de §"Tabelas encontradas"/"Distribuição" deste runbook e colar os resultados aqui — para confirmar Caminho A (e descartar a possibilidade remota de seed manual antigo).

