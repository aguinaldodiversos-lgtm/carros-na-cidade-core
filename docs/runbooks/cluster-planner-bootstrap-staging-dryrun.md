# Dry-run Staging — Bootstrap de Cluster Plans

> **Status:** template pré-execução. Operador deve preencher §1–§7 após
> rodar os comandos no Render Shell de staging. **NÃO usar `--yes` neste
> runbook** — execução de persistência é runbook separado.
>
> **Política aplicada:** Opção A
> ([cluster-plan-brand-model-policy.md](./cluster-plan-brand-model-policy.md)).
> Bootstrap inicial persiste apenas `city_home` e `city_below_fipe`;
> `city_opportunities`, `city_brand` e `city_brand_model` são skipados
> porque suas páginas estão `noindex,follow` em produção.
>
> **Pré-requisito:** Fase 1 dos canonicals validada em produção
> ([territorial-canonical-phase1-prod-validation.md](./territorial-canonical-phase1-prod-validation.md))
> e transformer atualizado para Opção A
> ([cluster-planner-bootstrap.md §8](./cluster-planner-bootstrap.md)).
>
> **Fonte de cidades:** o planner tenta `city_scores JOIN cities` primeiro
> e cai no fallback `ads + cities` (`stage='seed'`) quando a primária
> retorna [] — ver
> [cluster-planner-bootstrap.md §9](./cluster-planner-bootstrap.md).
> Em ambientes onde `city_scores` ainda está vazia (caso atual em prod
> 2026-05-03), o `totalCities` do dry-run vem do fallback. Isso é
> esperado e seguro (read-only).

---

## 1. Ambiente

| Item | Valor |
|---|---|
| Serviço Render usado | _(ex.: `carros-na-cidade-core-staging` shell)_ |
| Banco staging | _(ex.: `cnc-staging` no Render Postgres; confirmar via `echo $DATABASE_URL \| sed 's/:[^@]*@/:***@/'`)_ |
| Data/hora de execução | _(UTC, ex.: `2026-05-03 14:32 UTC`)_ |
| Operador | _(Aguinaldo)_ |
| Versão do Node | _(saída de `node --version`; esperado >= v20)_ |
| Branch / commit do código no Render | _(saída de `git rev-parse --short HEAD` no shell do serviço)_ |
| Comando exato executado | `node scripts/seo/bootstrap-cluster-plans.mjs --dry-run --limit=3` |
| **Confirmação:** `--yes` foi usado? | **NÃO** |
| **Confirmação:** comando bateu em prod? | **NÃO** (somente staging) |

> ⚠️ Antes de rodar, confirmar com:
> ```bash
> echo $DATABASE_URL | sed 's/:[^@]*@/:***@/'
> ```
> O host deve ser o do banco de **staging**, não de prod. Se houver dúvida,
> **abortar**.

---

## 2. SQL antes do dry-run

Comandos a executar no shell de staging via `psql $DATABASE_URL`:

```sql
-- Q1: total de planos atuais
SELECT COUNT(*) AS total FROM seo_cluster_plans;

-- Q2: distribuição por cluster_type / status
SELECT cluster_type, status, COUNT(*) AS total
FROM seo_cluster_plans
GROUP BY cluster_type, status
ORDER BY cluster_type, status;

-- Q3: total de cidades disponíveis
SELECT COUNT(*) AS total FROM cities;

-- Q4: total de anúncios ativos
SELECT COUNT(*) AS total FROM ads WHERE status = 'active';

-- Q5: total de anúncios ativos com city_id (≠ NULL)
SELECT COUNT(*) AS total
FROM ads
WHERE status = 'active' AND city_id IS NOT NULL;
```

### Resultado

| # | Métrica | Valor encontrado | Esperado / sanity |
|---|---|---|---|
| Q1 | `seo_cluster_plans` total | _( )_ | 0 ou pequeno legado. Se >> 0, parar e investigar antes do dry-run. |
| Q2 | distribuição cluster_type × status | _( colar saída )_ | Tipos esperados: `city_home`, `city_below_fipe`, `city_opportunities`, `city_brand`, `city_brand_model`. Status: `planned`, `generated`, `published`. |
| Q3 | `cities` total | _( )_ | ~5570 (staging deve refletir prod). Se for muito baixo, top-N pode não ter cidades suficientes para `--limit=3`. |
| Q4 | `ads` ativos | _( )_ | Sanity: precisa ser > 0 para o **fallback** ads+cities encontrar cidades. |
| Q5 | `ads` ativos com `city_id` | _( )_ | Se `city_scores` estiver vazia, este é o universo elegível para o fallback. **Q5 = 0 → dry-run retorna `totalCities=0`**. |

### Diagnóstico complementar (decide se a primária ou o fallback será usado)

```sql
-- city_scores: fonte primária. Se > 0, o fallback NÃO é usado.
SELECT COUNT(*) AS total FROM city_scores;
```

| Métrica | Valor | Implicação |
|---|---|---|
| `city_scores` total | _( )_ | `> 0` → primária usada (esperar `stage` real nas saídas). `= 0` → fallback usado (`stage='seed'`). |

---

## 3. Schema de `seo_cluster_plans`

Comando:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'seo_cluster_plans'
ORDER BY ordinal_position;
```

### Resultado e compatibilidade com `upsertClusterPlan`

`upsertClusterPlan` (em
[src/modules/seo/planner/cluster-plan.repository.js](../../src/modules/seo/planner/cluster-plan.repository.js))
faz `INSERT … ON CONFLICT (path) DO UPDATE` usando os campos abaixo. Cada
linha precisa existir no schema; tipos e nullability têm que ser compatíveis.

| Coluna | Tipo encontrado | Nullable | Default | Esperado | Compatível? |
|---|---|---|---|---|---|
| `id` | _( )_ | _( )_ | _( )_ | PK qualquer (não usado por upsert) | _( )_ |
| `city_id` | _( )_ | _( )_ | _( )_ | int / bigint, FK para `cities.id` | _( )_ |
| `cluster_type` | _( )_ | _( )_ | _( )_ | text / varchar | _( )_ |
| `path` | _( )_ | _( )_ | _( )_ | text **com UNIQUE/PK** (usado em `ON CONFLICT (path)`) | _( )_ |
| `brand` | _( )_ | _( )_ | _( )_ | text nullable | _( )_ |
| `model` | _( )_ | _( )_ | _( )_ | text nullable | _( )_ |
| `money_page` | _( )_ | _( )_ | _( )_ | boolean | _( )_ |
| `priority` | _( )_ | _( )_ | _( )_ | int / numeric | _( )_ |
| `status` | _( )_ | _( )_ | _( )_ | text (`planned` / `generated` / `published`) | _( )_ |
| `stage` | _( )_ | _( )_ | _( )_ | text (`discovery` / `expansion` / …) | _( )_ |
| `payload` | _( )_ | _( )_ | _( )_ | `jsonb` (cast `$10::jsonb` no INSERT) | _( )_ |
| `created_at` | _( )_ | _( )_ | _( )_ | timestamptz, default `NOW()` aceitável | _( )_ |
| `updated_at` | _( )_ | _( )_ | _( )_ | timestamptz, default `NOW()` aceitável | _( )_ |
| `last_generated_at` | _( )_ | _( )_ | _( )_ | timestamptz nullable (usado por `markClusterPlanGenerated`) | _( )_ |

### Verificação adicional do índice UNIQUE em `path`

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'seo_cluster_plans';
```

Esperado: existir índice `UNIQUE` ou constraint `PRIMARY KEY` cobrindo
`path`. Sem isso, `ON CONFLICT (path)` falhará no `--yes`.

| Índice encontrado | Cobre `path` UNIQUE? |
|---|---|
| _( colar saída )_ | _( sim / não )_ |

---

## 4. Output completo do dry-run

```bash
node scripts/seo/bootstrap-cluster-plans.mjs --dry-run --limit=3
```

```
( colar log completo aqui — incluir TODAS as linhas do prefixo
[bootstrap-cluster-plans], desde "iniciando" até "DRY-RUN concluído" )
```

---

## 5. Validação dos contadores

Política Opção A com `--limit=3`: 3 cidades × 5 cluster_types = 15 generated;
9 skipped (`opportunities` + `brand` + `brand_model` por cidade);
6 transformados/persistíveis (`home` + `below_fipe` por cidade); 0 erros.

| Métrica | Esperado | Encontrado | Match? |
|---|---|---|---|
| `totalCities` | 3 | _( )_ | _( )_ |
| `totalGenerated` | 15 | _( )_ | _( )_ |
| `totalSkipped` | 9 | _( )_ | _( )_ |
| `totalTransformed` | 6 | _( )_ | _( )_ |
| `totalToPersist` | 6 | _( )_ | _( )_ |
| `totalErrors` | 0 | _( )_ | _( )_ |
| `totalPersisted` | 0 (dry-run) | _( )_ | _( )_ |

> Se `totalCities < 3`: top-N do builder não retornou 3 cidades — checar
> `cities` populadas em staging. Se `totalErrors > 0`: ler `transformErrors`
> no log e abortar antes do `--yes`.

---

## 6. Validação dos paths (samples)

| cluster_type | path original | path transformado | Decisão | Aprovado? |
|---|---|---|---|---|
| `city_home` | `/cidade/<slug-1>` | _( esperado: `/carros-em/<slug-1>` )_ | persistir | _( sim / não )_ |
| `city_below_fipe` | `/cidade/<slug-1>/abaixo-da-fipe` | _( esperado: `/carros-baratos-em/<slug-1>` )_ | persistir | _( sim / não )_ |
| `city_opportunities` | `/cidade/<slug-1>/oportunidades` | _( esperado: não aparece como sample — é skip )_ | skip | _( sim / não )_ |
| `city_brand` | `/cidade/<slug-1>/marca/<brand>` | _( esperado: não aparece como sample — é skip )_ | skip | _( sim / não )_ |
| `city_brand_model` | `/cidade/<slug-1>/marca/<brand>/modelo/<model>` | _( esperado: não aparece como sample — é skip )_ | skip | _( sim / não )_ |
| `city_home` | `/cidade/<slug-2>` | _( esperado: `/carros-em/<slug-2>` )_ | persistir | _( sim / não )_ |
| `city_below_fipe` | `/cidade/<slug-2>/abaixo-da-fipe` | _( esperado: `/carros-baratos-em/<slug-2>` )_ | persistir | _( sim / não )_ |

### Asserções negativas (devem ser TODAS verdadeiras)

| Asserção | Resultado |
|---|---|
| Nenhum sample contém `/cidade/<slug>/marca/` (sem `modelo/`) | _( pass / fail )_ |
| Nenhum sample contém `/cidade/<slug>/marca/<brand>/modelo/` | _( pass / fail )_ |
| Nenhum sample contém `/cidade/<slug>/oportunidades` como path transformado | _( pass / fail )_ |
| Nenhum sample contém `/comprar/cidade/` (canônica antiga pré-Fase 1) | _( pass / fail )_ |
| Todos os paths transformados começam com `/carros-em/` ou `/carros-baratos-em/` | _( pass / fail )_ |

---

## 7. Decisão

Marcar **uma** opção:

- [ ] **APROVADO** para rodar `--yes --limit=3` em staging em runbook próximo (todas as validações §2–§6 passaram; schema compatível; 6 paths transformados conferem com Opção A).
- [ ] **ADIAR** por **schema incompatível** — descrever coluna ausente / tipo divergente / falta de UNIQUE em `path`:
  > _( descrição )_
- [ ] **ADIAR** por **erro no dry-run** — colar mensagem do `transformErrors` ou exceção:
  > _( descrição )_
- [ ] **ADIAR** por **paths incorretos** — descrever divergência observada vs esperada:
  > _( descrição )_
- [ ] **ADIAR** por **falta de dados** em staging (Q3/Q4/Q5 baixos demais):
  > _( descrição )_

### Observações livres do operador

> _( opcional: qualquer coisa anômala observada — latência alta, warnings,
> samples não esperados, comportamento de `closeDatabasePool`, etc. )_

---

## 8. Próximo prompt recomendado

> **Só executar o prompt abaixo se §7 for APROVADO.** Caso contrário,
> abrir runbook de remediação para a causa do adiamento.

> **Tarefa:** Persistência controlada em **staging** (não prod) com `--yes --limit=3`.
>
> Pré-condições:
> - §7 deste runbook = **APROVADO**.
> - Capturar timestamp ANTES do batch para rollback pontual:
>   ```sql
>   SELECT NOW();   -- anotar no runbook de execução
>   ```
> - Confirmar via `echo $DATABASE_URL | sed 's/:[^@]*@/:***@/'` que ainda é
>   o banco de **staging**.
>
> Execução:
> ```bash
> node scripts/seo/bootstrap-cluster-plans.mjs --yes --limit=3
> ```
>
> Validação SQL após (esperado: 6 linhas novas em `seo_cluster_plans` com
> status `planned`):
> ```sql
> SELECT cluster_type, COUNT(*) FROM seo_cluster_plans
>   GROUP BY cluster_type ORDER BY cluster_type;
> -- esperado: city_home=3, city_below_fipe=3 (e nada de brand/brand_model/opportunities)
>
> SELECT cluster_type, path, status FROM seo_cluster_plans
>   ORDER BY created_at DESC LIMIT 10;
> -- esperado: paths /carros-em/<slug> e /carros-baratos-em/<slug>
>
> SELECT cluster_type, COUNT(*) FROM seo_cluster_plans
> WHERE NOT (path LIKE '/carros-em/%' OR path LIKE '/carros-baratos-em/%')
> GROUP BY cluster_type;
> -- esperado: 0 linhas (sanity Opção A)
> ```
>
> Plano de rollback se algo divergir:
> ```sql
> DELETE FROM seo_cluster_plans
> WHERE created_at >= '<timestamp do SELECT NOW() acima>'
>   AND created_at <  '<timestamp + margem de 5 minutos>';
> ```
>
> **TRAVAS:** não tocar prod, não habilitar `RUN_WORKERS`, não alterar
> código, não alterar layout/sitemap/canonical/robots/rotas/ranking/planos,
> não criar Página Regional. Apenas executar o `--yes` em staging e
> validar com SQL read-only.
