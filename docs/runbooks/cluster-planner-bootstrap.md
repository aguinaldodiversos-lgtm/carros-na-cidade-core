# Bootstrap do Cluster Planner

> **Status:** plano técnico, não implementação. Documenta como reconectar o
> "wire" desconectado entre o builder de cluster plans (em memória) e o
> persistor (que escreve em `seo_cluster_plans`), além de auditar se os
> paths gerados pelo planner estão alinhados com a Fase 1 dos canonicals
> antes de qualquer persistência.
>
> **Pré-requisitos desta investigação:**
> - [sitemap-empty-investigation.md](./sitemap-empty-investigation.md) — diagnóstico inicial.
> - [seo-cluster-plans-state-machine.md](./seo-cluster-plans-state-machine.md) — state machine + smoking gun de código.
> - [territorial-canonical-audit.md](./territorial-canonical-audit.md) — Fase 1 dos canonicals (commit `24009155`).
>
> **Trava absoluta:** este runbook não implementa, não roda worker, não muda
> dados. Apenas leitura de código + plano arquitetural.

---

## 1. Diagnóstico técnico

### 1.1 Builder × Persister × Caller — a desconexão

| Componente | Arquivo | Função | Faz o quê | Caller? |
|---|---|---|---|---|
| Engine principal | `src/brain/engines/cluster-planner.engine.js:7` | `runClusterPlannerEngine(limit=150)` | Chama `buildTopCitiesClusterPlans` e devolve | ✅ `cluster-planner.worker.js#runOnce` (linha 18) |
| **Builder** (em memória) | `src/modules/seo/planner/cluster-planner.service.js:59` | `buildTopCitiesClusterPlans(limit=100)` | Lista top cities → para cada uma chama `buildCityClusterPlan` (que monta clusters via `buildStageClusters`). **Devolve array. Nunca persiste.** | ✅ chamado pela engine |
| **Persistor** (escreve no DB) | `src/modules/seo/planner/cluster-plan.service.js:32` | `persistTopCityClusterPlans(limit=100)` | Mesma lógica do builder, mas chama `clusterPlanRepository.upsertClusterPlan` para cada cluster com `status: "planned"` e `stage: city.stage \|\| "discovery"` | ❌ **ZERO callers** (verificado abaixo) |
| Persistor por cidade | `src/modules/seo/planner/cluster-plan.service.js:4` | `persistCityClusterPlan(city)` | Persiste 1 cidade | ❌ **ZERO callers** |
| Repositório | `src/modules/seo/planner/cluster-plan.repository.js:3` | `upsertClusterPlan({...})` | `INSERT INTO seo_cluster_plans (...) ON CONFLICT (path) DO UPDATE` | ✅ chamado **só** pelos persistores órfãos |

**Comando para reproduzir o "ZERO callers":**

```bash
$ grep -rn "persistTopCityClusterPlans\|persistCityClusterPlan" src --include="*.js"
src/modules/seo/planner/cluster-plan.service.js:4:export async function persistCityClusterPlan(city) {
src/modules/seo/planner/cluster-plan.service.js:32:export async function persistTopCityClusterPlans(limit = 100) {
# → apenas as próprias declarações.
```

Mesmo com `RUN_WORKERS=true` no Render, o worker chama `runClusterPlannerEngine` → `buildTopCitiesClusterPlans` → tudo termina em memória. **Não é "worker desligado"; é "wire desconectado".**

### 1.2 Pipeline pretendido vs. real

```
┌─────────────────────────┐
│ cluster-planner.worker  │  RUN_WORKERS=true → cron 6h
└──────────┬──────────────┘
           │
           v
┌─────────────────────────┐
│ runClusterPlannerEngine │  brain/engines/cluster-planner.engine.js:7
└──────────┬──────────────┘
           │
           v
┌─────────────────────────┐
│ buildTopCitiesClusterPlans │  modules/seo/planner/cluster-planner.service.js:59
│    (BUILD em memória)      │  ❌ NÃO PERSISTE
└──────────┬─────────────────┘
           │
           v
   [array de plans]
           │
           ✗  ← morre aqui

— seo_cluster_plans nunca recebe inserts —

┌─────────────────────────┐
│ seo-publishing.worker   │  cron 6h
└──────────┬──────────────┘
           │
           v
┌─────────────────────────┐
│ runClusterExecutorEngine│  brain/engines/cluster-executor.engine.js
└──────────┬──────────────┘
           │
           v
┌──────────────────────────────────────┐
│ executeTopPendingClusters            │  modules/seo/publishing/cluster-executor.service.js:4
│  → listPendingClusterExecutions(...) │  ← lê seo_cluster_plans (vazia)
│  → publishClusterContent(...)        │  ← nunca executa porque não há row
│  → markClusterPublished              │  ← idem
└──────────────────────────────────────┘
           │
           v
   [zero publicações em seo_publications]
```

### 1.3 Quem lê `seo_cluster_plans` e por que sitemap fica vazio

| Endpoint backend | Service | Repository | Tabela | Filtro |
|---|---|---|---|---|
| `GET /api/public/seo/sitemap/type/:type` | `read-models/seo/sitemap-public.service.js#getPublicSitemapByType` | `read-models/seo/sitemap-public.repository.js:3` `listSitemapByType` | `seo_cluster_plans scp JOIN cities c` | `scp.status IN ('planned','generated') AND scp.cluster_type = $1` |
| `GET /api/public/seo/sitemap/region/:state` | mesmo | `listSitemapByRegion` | mesmo | `scp.status IN ('planned','generated') AND c.state = $1` |
| `GET /api/public/seo/sitemap.json`, `/sitemap`, `/sitemap.xml` | `modules/public/public-seo.service.js#listEntries` | inline | `seo_cluster_plans LEFT JOIN seo_publications LEFT JOIN cities` | `scp.status IN ('published','planned') AND (sp.id IS NULL OR sp.is_indexable = TRUE)` |

Frontend `app/sitemaps/<x>.xml/route.ts` chama `fetchPublicSitemapByTypes([cluster_type], 50000)` que bate em `/api/public/seo/sitemap/type/<type>`. Como `seo_cluster_plans` está vazia, **toda a cadeia devolve `[]` → `<urlset></urlset>` (107 bytes)**.

Confirmado em prod via curl (2026-05-03):

```
/api/public/seo/sitemap/type/city_home          → HTTP 200 {"success":true,"data":[]}
/api/public/seo/sitemap/type/city_below_fipe    → HTTP 200 {"success":true,"data":[]}
/api/public/seo/sitemap/type/city_brand         → HTTP 200 {"success":true,"data":[]}
/api/public/seo/sitemap/type/city_brand_model   → HTTP 200 {"success":true,"data":[]}
/api/public/seo/sitemap/region/SP               → HTTP 200 {"success":true,"data":[]}
```

5 endpoints, 4 cluster_types diferentes, 1 região sem filtro de tipo — todos vazios. Confirma `seo_cluster_plans` vazia.

---

## 2. Paths que o planner gera HOJE × Fase 1 dos canonicals

A função `buildStageClusters` em [src/modules/seo/planner/cluster-planner.tasks.js:7](../../src/modules/seo/planner/cluster-planner.tasks.js) é a fonte ÚNICA dos paths que iriam para `seo_cluster_plans.path` se o persistor for ligado. Todos derivam de `base = /cidade/<city.slug>`.

| `cluster_type` | Path gerado pelo planner | Canônica intermediária Fase 1 ([territorial-canonical-audit.md §6](./territorial-canonical-audit.md)) | Alinhado? |
|---|---|---|---|
| `city_home` | `/cidade/[slug]` | **`/carros-em/[slug]`** | ❌ **DESALINHADO** — `/cidade/[slug]` está sob `noindex,follow` na Fase 1 e canonicaliza para `/carros-em/[slug]`. Persistir esse path no sitemap meteria URL noindex no XML. |
| `city_opportunities` | `/cidade/[slug]/oportunidades` | **`/carros-baratos-em/[slug]`** | ❌ **DESALINHADO** — mesma situação. Sitemap `opportunities.xml` está vazio por design pós-Fase 1. |
| `city_below_fipe` | `/cidade/[slug]/abaixo-da-fipe` | **`/carros-baratos-em/[slug]`** | ❌ **DESALINHADO** — Fase 1 adicionou override; URL antiga continua noindex. |
| `city_brand` | `/cidade/[slug]/marca/[brand]` | _(não tocado pela Fase 1)_ | ⚠️ **Não confirmado** — provavelmente self-canonical, mas a auditoria de prod cobriu só os 7 routes da §1 da Fase 1. Validar antes. |
| `city_brand_model` | `/cidade/[slug]/marca/[brand]/modelo/[model]` | _(não tocado pela Fase 1)_ | ⚠️ **Não confirmado** — idem. |

**Cadeia completa do que aconteceria se persister for ligado HOJE sem ajustar paths**, para `city_home` em Atibaia:

1. `persistTopCityClusterPlans` insere `seo_cluster_plans (path='/cidade/atibaia-sp', cluster_type='city_home', status='planned')`.
2. Frontend `cities.xml/route.ts` chama backend → recebe entry com `loc='/cidade/atibaia-sp'`.
3. Função `rewriteCityHomeEntries` (mesmo arquivo, linha 25) reescreve `/cidade/[slug]` → `/comprar/cidade/[slug]`. **Comentário do arquivo está desatualizado vs Fase 1** — diz que `/comprar/cidade/[slug]` é a canônica, mas Fase 1 (commit `24009155`) moveu canonical para `/carros-em/[slug]`.
4. Sitemap publica `/comprar/cidade/atibaia-sp`. Visitante segue link → página `/comprar/cidade/atibaia-sp` é `index, follow` mas declara `<link rel="canonical" href=".../carros-em/atibaia-sp">`.
5. Googlebot vê URL no sitemap canonicalizando para outra URL → desperdício de crawl budget + sinal contraditório (sitemap diz "indexe X", canonical diz "X é apenas variante de Y"). Pode até derrubar o ranking de `/carros-em/[slug]` enquanto Google decide.

Para `city_below_fipe`:
1. Persister grava `path='/cidade/atibaia-sp/abaixo-da-fipe'`.
2. Frontend `below-fipe.xml/route.ts` exibe sem rewrite.
3. Mas a Fase 1 fez essa URL canonicalizar para `/carros-baratos-em/atibaia-sp`.
4. Mesmo problema.

**Para `city_brand`/`city_brand_model`:** Fase 1 não cobriu. Auditoria pendente — provavelmente self-canonical (sem override no `app/cidade/[slug]/marca/[brand]/page.tsx` etc), mas validar antes.

---

## 3. Opções de correção

### Opção 1 — Correção cirúrgica na engine

Trocar a chamada em `cluster-planner.engine.js:7` para o persistor:

```js
// ANTES
const plans = await clusterPlannerService.buildTopCitiesClusterPlans(limit);

// DEPOIS (1 linha alterada + 1 import)
import * as clusterPlanService from "../../modules/seo/planner/cluster-plan.service.js";
const results = await clusterPlanService.persistTopCityClusterPlans(limit);
```

| Aspecto | Detalhe |
|---|---|
| Arquivos impactados | `src/brain/engines/cluster-planner.engine.js` (1 linha + 1 import) |
| Risco | **ALTO** — combinada com paths desalinhados (§2), persiste `/cidade/[slug]` etc no sitemap → regressão SEO descrita acima. |
| Benefício | Diff mínimo. Reaproveita `persistTopCityClusterPlans` exatamente como foi escrita. |
| Testes necessários | Unit test verificando que `runClusterPlannerEngine` agora persiste (mock do repository, asserir `upsertClusterPlan` foi chamado N vezes). |
| Migration? | Não. |
| Altera dados? | Sim — popula `seo_cluster_plans` com paths atuais (perigosos sem ajuste). |
| Rollback | Reverter o commit + `DELETE FROM seo_cluster_plans WHERE created_at >= '<timestamp>'` (operação destrutiva, requer cuidado). |

**Verdadeiramente seguro só se** os paths em `cluster-planner.tasks.js#buildStageClusters` forem ajustados ANTES para usar as canônicas Fase 1. Isso é mais código:

```diff
- {  cluster_type: "city_home",        path: base,                          ... }
+ {  cluster_type: "city_home",        path: `/carros-em/${city.slug}`,     ... }
- {  cluster_type: "city_opportunities", path: `${base}/oportunidades`,     ... }
- {  cluster_type: "city_below_fipe",  path: `${base}/abaixo-da-fipe`,      ... }
+ {  cluster_type: "city_below_fipe",  path: `/carros-baratos-em/${city.slug}`, ... }
+ //   (city_opportunities removido — canonicaliza pra below_fipe; sitemap.opportunities.xml é vazio por design)
```

Isso amplia o escopo do "1 linha" para uma reforma do builder. E ainda precisaria atualizar `rewriteCityHomeEntries` em `cities.xml/route.ts` (que reescreve `/cidade/[slug]` → `/comprar/cidade/[slug]`).

### Opção 2 — Script de bootstrap explícito (recomendada)

Criar comando standalone (`scripts/seo/bootstrap-cluster-plans.mjs`) que:
1. Lê top N cidades.
2. Constrói clusters via `buildTopCitiesClusterPlans`.
3. **Aplica transformação de path para alinhar com Fase 1** antes de persistir.
4. Persiste via `upsertClusterPlan`.
5. Faz dry-run primeiro (`--dry-run` flag).
6. Logga cada path antes de inserir.

```bash
# uso pretendido
node scripts/seo/bootstrap-cluster-plans.mjs --dry-run --limit=10  # Atibaia, Bragança, Mairiporã
node scripts/seo/bootstrap-cluster-plans.mjs --limit=10            # commit
node scripts/seo/bootstrap-cluster-plans.mjs --limit=200           # full
```

| Aspecto | Detalhe |
|---|---|
| Arquivos impactados | `scripts/seo/bootstrap-cluster-plans.mjs` (novo, ~80 linhas) + opcionalmente `package.json` (script) |
| Risco | **MÉDIO** — não muda fluxo automático; permite revisão manual antes de cada batch. Risco residual: persistir paths errados se a transformação for incorreta. Mitigado por dry-run. |
| Benefício | Reversível, auditável (logs por path), permite limitar volume inicial. **Não acopla a decisão de "como popular" à decisão arquitetural de "qual fluxo usar"**. |
| Testes necessários | (1) Unit test do path-transformer; (2) Integration test que roda o script em dry-run e verifica que NENHUMA escrita acontece; (3) Integration test smoke que roda commit em DB de teste e verifica `seo_cluster_plans` populada. |
| Migration? | Não. |
| Altera dados? | Sim, mas de forma controlada (operador decide quando rodar, em qual ambiente, com qual limit). |
| Rollback | `DELETE FROM seo_cluster_plans WHERE created_at >= '<timestamp>'` — mas como o script logga timestamp da execução, fica trivial deletar exatamente o que foi inserido. |

### Opção 3 — Reescrever worker para build + transform + persist + validate

Refatorar `cluster-planner.engine.js` para uma engine completa:
1. Build em memória (atual).
2. **Transformar paths** alinhando com Fase 1 (canônica intermediária por intent).
3. **Validar** cada path: regex de URL canônica, presença de cidade conhecida, etc.
4. Persistir só as válidas.
5. Logar métricas (planos válidos / inválidos / persistidos / atualizados).
6. Adicionar observabilidade (métricas Prometheus / structured logs).

| Aspecto | Detalhe |
|---|---|
| Arquivos impactados | `cluster-planner.engine.js` (reescrito) + novo `cluster-plan-transformer.js` + novo `cluster-plan-validator.js` + testes; possivelmente `cluster-planner.tasks.js` para parametrizar paths |
| Risco | **BAIXO** se feito com testes; **ALTO** se feito sem (escopo grande) |
| Benefício | Pipeline definitivo, observable, manutenível. Cobre Opção 1 + Opção 2 num só design. |
| Testes necessários | Cobertura unitária + integração + smoke contra DB de teste. ~500 LOC de teste. |
| Migration? | Não direto, mas pode justificar uma migration de seed inicial pós-deploy. |
| Altera dados? | Sim, controlado pela engine. |
| Rollback | Reverter commits + DELETE pontual. Requer rigor. |

---

## 4. Recomendação técnica

**Opção 2 (script de bootstrap explícito).**

**Justificativa principal:** os paths atuais em `buildStageClusters` estão **desalinhados com a Fase 1 dos canonicals** para 3 dos 5 cluster_types (§2). Opção 1 (1 linha) iria persistir esses paths e introduzir regressão SEO imediata. Opção 3 é overkill para a fase atual e mistura "ligar o pipeline" com "definir arquitetura final" — risco de paralisia por análise.

**Opção 2 desacopla as duas decisões:**
- "Como popular agora?" → script standalone, controlado, dry-run primeiro.
- "Qual fluxo automático usar a longo prazo?" → fica para depois, quando soubermos qual é a forma certa dos paths e qual é a frequência ideal.

**Sequência recomendada:**

1. Implementar Opção 2 (script de bootstrap com path-transform).
2. Validar em staging.
3. Rodar em prod manualmente uma vez (Fase 5 do roll-out abaixo).
4. **Só depois** decidir entre:
   - Opção 1 cirúrgica + ajuste prévio dos paths em `buildStageClusters` (se bootstrap manual ficar inviável recorrentemente).
   - Opção 3 reescrita (se o pipeline ganhar outras dimensões: refresh, regeneração, multi-tipo).

---

## 5. Plano de roll-out seguro

### Fase 0 — Auditoria SQL prévia (operador, read-only)

Rodar via Render Shell do `carros-na-cidade-core`, **sem alterar dados**:

```sql
SELECT COUNT(*) AS plans FROM seo_cluster_plans;
SELECT cluster_type, status, COUNT(*) FROM seo_cluster_plans
  GROUP BY cluster_type, status ORDER BY cluster_type, status;
SELECT MAX(created_at), MAX(updated_at) FROM seo_cluster_plans;
```

**Resultado esperado** (se Caminho A confirmado): `plans = 0` ou tabela com poucas linhas legadas. **Se for `> 0` significativo:** parar e reabrir investigação — pode haver seed manual antigo, dados de teste ou caminho de população desconhecido.

### Fase 1 — Implementar Opção 2 em staging (PR separado)

- Criar `scripts/seo/bootstrap-cluster-plans.mjs` com `--dry-run` e `--limit`.
- Implementar transformação de path para alinhar com Fase 1.
- Adicionar testes unitários do transformer e do dry-run.
- **NÃO** rodar em prod ainda.

### Fase 2 — Rodar planner em staging (dry-run)

```bash
# No Render Shell de staging
node scripts/seo/bootstrap-cluster-plans.mjs --dry-run --limit=3
```

Verificar log: cada path que SERIA inserido. Conferir alinhamento com Fase 1 (URLs `/carros-em/[slug]` e `/carros-baratos-em/[slug]`).

### Fase 3 — Commit em staging (3 cidades)

```bash
node scripts/seo/bootstrap-cluster-plans.mjs --limit=3
```

Validar com SQL:

```sql
SELECT cluster_type, path, status FROM seo_cluster_plans
  ORDER BY created_at DESC LIMIT 30;
```

### Fase 4 — Validar sitemaps em staging

```bash
curl -sSL https://staging.carrosnacidade.com/sitemaps/cities.xml | wc -c
# esperado: > 200 bytes (não mais o template vazio de 107)
curl -sSL https://staging.carrosnacidade.com/sitemaps/cities.xml | grep -oE '<loc>[^<]+</loc>' | head -5
# esperado: URLs /carros-em/<slug> (canônica Fase 1)
```

Verificar também `below-fipe.xml`, `brands.xml`, `models.xml`.

### Fase 5 — Rodar uma vez em produção, MANUAL, sem `RUN_WORKERS=true`

```bash
# No Render Shell de prod, com confirmação humana
node scripts/seo/bootstrap-cluster-plans.mjs --dry-run --limit=5  # primeiro
node scripts/seo/bootstrap-cluster-plans.mjs --limit=5            # commit batch pequeno
```

### Fase 6 — Validar produção

Mesmas queries de Fase 4 contra `https://www.carrosnacidade.com`. Logo depois, validar Search Console: cobertura, "URLs descobertas via sitemap".

### Fase 7 — Só depois, decidir sobre worker recorrente

Opções:
- (a) Manter bootstrap manual periódico (operador roda quando há lote significativo de cidades novas).
- (b) Habilitar `RUN_WORKERS=true` no web E corrigir o wire (Opção 1 cirúrgica + paths já ajustados).
- (c) Worker dyno separado no Render rodando o script periodicamente.

Decisão fica para um runbook próprio depois que a Fase 6 confirmar que o pipeline manual funciona bem.

---

## 6. SQL de validação (read-only)

### Antes do bootstrap

```sql
-- Contagens
SELECT COUNT(*) FROM seo_cluster_plans;       -- esperado: 0 (ou pequeno legado)
SELECT COUNT(*) FROM seo_publications;        -- esperado: 0 (ou pequeno legado)
SELECT COUNT(*) FROM cities;                   -- esperado: ~5570

-- Estado bruto
SELECT cluster_type, status, COUNT(*) FROM seo_cluster_plans
  GROUP BY cluster_type, status ORDER BY cluster_type, status;
SELECT MIN(created_at), MAX(created_at), MAX(updated_at) FROM seo_cluster_plans;
```

### Depois do bootstrap

```sql
-- Quantos planos foram criados, por tipo
SELECT cluster_type, COUNT(*) FROM seo_cluster_plans
  GROUP BY cluster_type ORDER BY 2 DESC;

-- Sample de paths para auditoria visual (são canônicos da Fase 1?)
SELECT cluster_type, path FROM seo_cluster_plans
  ORDER BY priority DESC, created_at DESC LIMIT 20;

-- Timestamp do batch (útil para rollback pontual)
SELECT MAX(created_at) AS last_insert FROM seo_cluster_plans;
```

### Comparação path × canonical Fase 1 (sanity)

```sql
-- Quantos planos têm path FORA das canônicas Fase 1?
SELECT cluster_type, COUNT(*) FROM seo_cluster_plans
WHERE NOT (
     path LIKE '/carros-em/%'
  OR path LIKE '/carros-baratos-em/%'
  OR path LIKE '/carros-automaticos-em/%'
  OR path LIKE '/cidade/%/marca/%'
)
GROUP BY cluster_type;
-- Esperado pós-bootstrap: 0 linhas (tudo alinhado).
-- Se > 0: a transformação de path no script não cobriu algum tipo. Investigar.
```

### Sitemap XML pós-bootstrap

```bash
curl -sSL https://www.carrosnacidade.com/sitemaps/cities.xml \
  | grep -oE '<loc>[^<]+</loc>' \
  | head -5
# Esperado: <loc>https://www.carrosnacidade.com/carros-em/atibaia-sp</loc> etc

curl -sSL https://www.carrosnacidade.com/sitemaps/below-fipe.xml \
  | grep -oE '<loc>[^<]+</loc>' \
  | head -5
# Esperado: <loc>https://www.carrosnacidade.com/carros-baratos-em/atibaia-sp</loc>
```

---

## 7. Checklist de segurança

- ❌ **NÃO** rodar o script em prod sem antes rodar em staging com `--dry-run` e validar log.
- ❌ **NÃO** habilitar `RUN_WORKERS=true` antes de Fase 6 confirmada.
- ❌ **NÃO** persistir cluster com `path` NULL, vazio, ou que não case com regex de URL canônica.
- ❌ **NÃO** popular `cluster_type` em massa sem confirmar que o frontend route correspondente existe e está alinhado com Fase 1 (`city_brand` / `city_brand_model` precisam de auditoria adicional).
- ❌ **NÃO** rodar Fase 5 em prod num dia de tráfego pico — preferir madrugada / janela de baixa visitação para Search Console processar mudança gradualmente.
- ❌ **NÃO** incluir páginas com `<meta name="robots" content="noindex">` no sitemap (auto-protegido pela transformação se ela emite só canônicas Fase 1, mas validar).
- ❌ **NÃO** criar Página Regional junto deste roll-out — `regional-page-rollout.md` é trabalho separado.
- ❌ **NÃO** adicionar URLs manualmente em sitemap, mesmo via SQL direto (`INSERT INTO seo_cluster_plans VALUES (...)`). Sempre via script para garantir auditoria + transformação correta.
- ✅ **SIM** capturar timestamp antes de cada batch (`SELECT NOW();`) para rollback pontual via `DELETE WHERE created_at >= '<ts>'`.
- ✅ **SIM** começar com `--limit=3` em prod e expandir gradualmente. Atibaia / Bragança Paulista / Mairiporã (mesmas 3 do checklist de [regional-page-rollout.md §8](./regional-page-rollout.md)).
- ✅ **SIM** validar com `curl` em prod entre cada batch.
- ✅ **SIM** monitorar Search Console por 1 ciclo de re-crawl (~7 dias) entre batches grandes.

---

## 8. Uso da implementação Opção 2 (já entregue)

**Status:** implementado, mas **NÃO executado** em ambiente algum.
Comandos abaixo são **referência de uso** — não rodar sem antes ler §5
(roll-out) e §7 (segurança).

### Arquivos entregues

- [scripts/seo/bootstrap-cluster-plans.mjs](../../scripts/seo/bootstrap-cluster-plans.mjs) — script CLI standalone (default = dry-run; persistência exige `--yes` explícito).
- [src/modules/seo/planner/cluster-plan-canonical-transform.js](../../src/modules/seo/planner/cluster-plan-canonical-transform.js) — helper puro de transformação `cluster_type → path canônico Fase 1`.
- [src/modules/seo/planner/cluster-plan-canonical-transform.test.js](../../src/modules/seo/planner/cluster-plan-canonical-transform.test.js) — 20 testes unitários.
- [tests/scripts/bootstrap-cluster-plans.test.js](../../tests/scripts/bootstrap-cluster-plans.test.js) — 18 testes do script com mocks (zero acesso a DB/rede).

Engine (`cluster-planner.engine.js`) e worker (`cluster-planner.worker.js`)
**não foram alterados**. O script é uma ferramenta paralela ao fluxo automático.

### Comandos

```bash
# Dry-run (NÃO escreve em banco — comportamento default):
node scripts/seo/bootstrap-cluster-plans.mjs --dry-run --limit=3

# Execução sem flag também é dry-run (default fechado por segurança):
node scripts/seo/bootstrap-cluster-plans.mjs --limit=3

# Persistência (EXIGE --yes explícito):
node scripts/seo/bootstrap-cluster-plans.mjs --yes --limit=3

# Persistência com confirmação dupla:
node scripts/seo/bootstrap-cluster-plans.mjs --yes --dry-run   # --yes vence; persiste
```

### Aviso operacional

- ⚠️ **NÃO rodar com `--yes` em produção sem antes:** (a) rodar Fase 0 do
  roll-out (auditoria SQL read-only); (b) rodar dry-run em staging;
  (c) rodar com `--yes --limit=3` em staging e validar via curl; (d) só então
  rodar em prod com `--yes --limit=3` na janela de baixa visitação.
- ⚠️ Script **não** habilita worker recorrente. Cada batch é manual.
- ⚠️ Script aborta com exit code `1` se algum cluster falhar transformação,
  sem persistir lote parcial (fail-fast pré-validação).
- ⚠️ Após `--yes`, a tabela `seo_cluster_plans` recebe rows com `status='planned'`.
  Promoção para `'published'` continua dependendo do `cluster-executor.worker`
  (que opera em rows pendentes da tabela — fluxo separado).

### Saída esperada do dry-run (bootstrap Opção A)

> Política aplicada: ver
> [cluster-plan-brand-model-policy.md](./cluster-plan-brand-model-policy.md).
> Bootstrap inicial persiste **apenas** `city_home` e `city_below_fipe`.
> `city_opportunities`, `city_brand` e `city_brand_model` são **skipados**
> porque suas páginas estão `noindex,follow` em produção (sinal contraditório
> se entrarem no sitemap antes de auditoria de canonical).

Para `--limit=3`:

- 3 cidades × 5 cluster_types = **15 generated**
- **9 skipped** (`city_opportunities` + `city_brand` + `city_brand_model` por cidade)
- **6 transformados/persistíveis** (`city_home` + `city_below_fipe` por cidade)
- `city_home` sample: `/cidade/atibaia-sp` → `/carros-em/atibaia-sp`
- `city_below_fipe` sample: `/cidade/atibaia-sp/abaixo-da-fipe` → `/carros-baratos-em/atibaia-sp`
- `city_opportunities`: skipped
- `city_brand`: skipped
- `city_brand_model`: skipped

```
[bootstrap-cluster-plans] iniciando {"limit":3,"dryRun":true}
[bootstrap-cluster-plans] DRY-RUN: nenhuma escrita ao banco. Use --yes para persistir.
[bootstrap-cluster-plans] plans construídos em memória {"totalCities":3}
[bootstrap-cluster-plans] transformação concluída {"totalGenerated":15,"totalTransformed":6,"totalSkipped":9,"totalToPersist":6,"totalErrors":0}
[bootstrap-cluster-plans] sample: city_home /cidade/atibaia-sp → /carros-em/atibaia-sp
[bootstrap-cluster-plans] sample: city_below_fipe /cidade/atibaia-sp/abaixo-da-fipe → /carros-baratos-em/atibaia-sp
[bootstrap-cluster-plans] sample: city_home /cidade/braganca-paulista-sp → /carros-em/braganca-paulista-sp
[bootstrap-cluster-plans] sample: city_below_fipe /cidade/braganca-paulista-sp/abaixo-da-fipe → /carros-baratos-em/braganca-paulista-sp
... (até 10 amostras)
[bootstrap-cluster-plans] DRY-RUN concluído. 6 plans seriam persistidos. Re-rodar com --yes para persistir.
```

(Output real depende do estado de produção — N de cidades × 5 cluster_types
gerados por cidade − 3 skips por cidade no bootstrap inicial Opção A.)

### Plano de rollback

Cada execução com `--yes` pode ser revertida via `DELETE` pontual usando
o timestamp do batch. Antes de cada `--yes`:

```sql
-- Capturar timestamp ANTES do batch:
SELECT NOW();
-- → ex.: '2026-05-04 10:23:45.123+00'
```

Após o batch, se for necessário reverter:

```sql
-- DELETE pontual baseado no timestamp capturado:
DELETE FROM seo_cluster_plans
WHERE created_at >= '2026-05-04 10:23:45'
  AND created_at <  '2026-05-04 10:30:00';  -- ajustar margem ao tempo real do batch
```

⚠️ Se rodar `--yes` SEM capturar timestamp antes, rollback fica impreciso —
operação manual com `WHERE` baseado em path/cluster_type, com risco de
deletar a mais. **Sempre capturar o timestamp.**

⚠️ Como `upsertClusterPlan` é UPSERT por `path`, re-rodar `--yes` no mesmo
batch é **idempotente** — atualiza `updated_at` mas não duplica linhas.

---

## 9. Fonte de cidades — primária × fallback

`buildTopCitiesClusterPlans` chama
[`listTopCitiesForClusterPlanning`](../../src/modules/seo/planner/cluster-planner.repository.js)
que opera em **duas fases**:

### 9.1 Fonte primária (preferencial)

```sql
SELECT cs.city_id, c.name, c.state, c.slug, cs.stage,
       cs.territorial_score, cs.ranking_priority, cs.total_ads, cs.total_leads
FROM city_scores cs
JOIN cities c ON c.id = cs.city_id
ORDER BY cs.ranking_priority DESC, cs.territorial_score DESC
LIMIT $1
```

`city_scores` é a fonte canônica do ranking territorial — alimentada pelo
pipeline de scoring (worker próprio, fora do escopo deste runbook). Em
regime estável, **só** essa fonte é consultada.

### 9.2 Fallback (bootstrap inicial — só quando a primária retorna [])

```sql
SELECT
  c.id AS city_id, c.name, c.state, c.slug,
  'seed'::text AS stage,
  COUNT(a.id)::int AS active_ads
FROM cities c
JOIN ads a ON a.city_id = c.id
WHERE a.status = 'active'
  AND a.city_id IS NOT NULL
  AND c.slug IS NOT NULL
  AND c.slug <> ''
GROUP BY c.id, c.name, c.state, c.slug
ORDER BY COUNT(a.id) DESC, c.id ASC
LIMIT $1
```

**Por que existe:** auditoria de produção (2026-05-03) revelou
`city_scores=0`, `city_targets=0`, `city_metrics` com 1 linha zerada.
Sem o fallback, o dry-run retornava `totalCities=0` mesmo com 16 ads
ativos e 5572 cidades. O fallback usa cardinalidade de `ads` como proxy
de "cidade com conteúdo real" para destravar o bootstrap inicial.

**Quando deixa de ser usado:** assim que `city_scores` for alimentada
(>= 1 linha), o fallback nunca mais é tocado em runtime — a fonte
primária vence. Não há flag, não há toggle: a presença de dados em
`city_scores` é o sinal.

### 9.3 Shape devolvido (compatível entre as duas fontes)

| Campo | Primária (city_scores) | Fallback (ads+cities) |
|---|---|---|
| `city_id` | `cs.city_id` | `c.id` |
| `name` | `c.name` | `c.name` |
| `state` | `c.state` | `c.state` |
| `slug` | `c.slug` | `c.slug` |
| `stage` | `cs.stage` (real) | `'seed'` (fixo) |
| `territorial_score` | `cs.territorial_score` | `active_ads` (proxy) |
| `ranking_priority` | `cs.ranking_priority` | `active_ads` (proxy) |
| `total_ads` | `cs.total_ads` | `active_ads` |
| `total_leads` | `cs.total_leads` | `0` |

`buildCityClusterPlan`/`buildStageClusters` consomem só `city_id`,
`slug`, `stage`. Os demais campos são preenchidos para auditoria + para
quando o scoring real assumir.

### 9.4 Filtro de slug canônico (defesa em camadas)

Dry-run real em prod (2026-05-04) revelou São Paulo com slug
`sæo-paulo` (não-ASCII). Sem filtro, o script teria gerado
`/carros-em/sæo-paulo` e `/carros-baratos-em/sæo-paulo` — URLs
impublicáveis em sitemap.

**Fix aplicado (defesa em camadas):**

1. **SQL do fallback** filtra slug por regex POSIX:
   ```sql
   AND c.slug ~ '^[a-z0-9-]+-[a-z]{2}$'
   ```
   Slugs malformados nunca chegam ao service.

2. **Transformer** valida formato pós-`requireNonEmpty`. Se `city_scores`
   um dia trouxer slug ruim, o transformer lança e o script aborta o
   batch inteiro (fail-fast pré-persist).

**Padrão aceito** (definido em
[`VALID_SLUG_REGEX`](../../src/modules/seo/planner/cluster-plan-canonical-transform.js)):

```
^[a-z0-9-]+-[a-z]{2}$
```

| Slug | Aceito? |
|---|---|
| `atibaia-sp` | ✅ |
| `braganca-paulista-sp` | ✅ |
| `sæo-paulo` | ❌ não-ASCII |
| `sao-paulo` | ❌ sem UF |
| `são-paulo-sp` | ❌ acento |
| `Atibaia-SP` | ❌ uppercase |

**Cleanup do dado de São Paulo (e potencialmente outras cidades) fica
para runbook próprio** (`cities-slug-cleanup.md`). Bootstrap não toca
banco — só filtra leitura.

### 9.5 Outras limitações conhecidas do fallback

- **Ranking é proxy local.** Ordenação por `COUNT(active_ads)` ignora
  fatores que `city_scores` consideraria (leads, sazonalidade, score
  territorial). Isso é aceitável no bootstrap (≤ poucas dezenas de
  cidades reais com anúncios), mas vira ruim em escala.
- **`stage='seed'` força brand/model limits baixos**
  ([cluster-planner.service.js:10](../../src/modules/seo/planner/cluster-planner.service.js)).
  Aceitável: brand/model são skipados pelo transformer Opção A
  ([cluster-plan-brand-model-policy.md](./cluster-plan-brand-model-policy.md))
  de qualquer jeito; só `city_home` e `city_below_fipe` chegam ao DB.

### 9.5 Migração futura para fonte primária

Quando `city_scores` for alimentada:

1. Rodar `SELECT COUNT(*) FROM city_scores;` — se > 0, fallback fica
   inerte automaticamente.
2. Re-executar `bootstrap-cluster-plans.mjs --dry-run --limit=N` e
   conferir que samples vêm com `stage` real (`discovery` / `expansion`
   / `dominance`), não mais `seed`.
3. Considerar remover o fallback quando o scoring estiver garantido em
   prod (decisão pra runbook próprio; manter por enquanto como rede de
   segurança).

---

## 10. Próximo prompt recomendado

> **Tarefa:** Implementar a **Opção 2** (script de bootstrap explícito) deste runbook. Criar:
>
> 1. `scripts/seo/bootstrap-cluster-plans.mjs` — script standalone que:
>    - Aceita flags: `--dry-run` (default false), `--limit=<N>` (default 5), `--yes` (confirmação).
>    - Importa `clusterPlannerService.buildTopCitiesClusterPlans(limit)`.
>    - Para cada cluster, aplica `transformPathToCanonicalPhase1(cluster)` (helper novo).
>    - Em dry-run: loga cada `{cluster_type, originalPath, transformedPath, action}` e retorna sem escrever.
>    - Em commit: chama `clusterPlanRepository.upsertClusterPlan({...cluster, path: transformedPath})`.
>    - Loga totais ao final.
>
> 2. `src/modules/seo/planner/cluster-plan-canonical-transform.js` — helper puro:
>    - Mapping `cluster_type → canonical path template`.
>    - `city_home` → `/carros-em/{slug}`.
>    - `city_below_fipe` → `/carros-baratos-em/{slug}`.
>    - `city_opportunities` → `null` (skip — canonicaliza pra below_fipe; não persistir até definição).
>    - `city_brand` → `/cidade/{slug}/marca/{brand_slug}` (preservar; não foi tocado pela Fase 1).
>    - `city_brand_model` → `/cidade/{slug}/marca/{brand_slug}/modelo/{model_slug}` (idem).
>    - Retorna `null` quando o cluster não deve ser persistido (caller pula).
>    - Throw em path inválido (slug vazio, brand undefined, etc) — falha rápida, sem entrada lixo no DB.
>
> 3. **Testes**:
>    - Unit test do transformer cobrindo cada `cluster_type`, slug com caracteres especiais (encodeURIComponent), brands com espaço, modelos vazios.
>    - Integration test do script em modo `--dry-run` contra DB de teste — verifica que `seo_cluster_plans` continua vazia.
>    - Integration test do script em modo commit — verifica que rows aparecem com paths transformados, não originais.
>
> 4. **NÃO alterar:** `cluster-planner.engine.js`, `cluster-planner.worker.js`, frontend, layout, components, sitemap em código, canonical em código, robots, rotas, ranking, planos, Página Regional, `RUN_WORKERS`, env. Apenas o script novo + helper + testes.
>
> 5. **Antes de rodar em qualquer ambiente:** este PR só CRIA o código. A execução do script em staging fica para Fase 2 do roll-out (próximo prompt). Documentar no PR description: "este PR não popula nada; é apenas a ferramenta."
>
> 6. **Pré-requisito ideal (não bloqueante):** operador roda os SQLs da Fase 0 do roll-out (§5) no Render Shell antes do merge. Se confirmar `seo_cluster_plans` realmente vazia, segue. Se contradisser, parar e reavaliar.
