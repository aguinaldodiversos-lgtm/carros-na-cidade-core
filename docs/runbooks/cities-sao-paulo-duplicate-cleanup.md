# Limpeza de duplicidade — São Paulo (cities)

> **Status:** runbook proposto, **não executado**. Nenhum `UPDATE` ou
> `DELETE` foi rodado por esta entrega. Operador segue a auditoria
> read-only de §2 antes de escolher um dos cenários A/B/C de §3.
>
> **Continuação de:** [cities-slug-cleanup-sao-paulo.md](./cities-slug-cleanup-sao-paulo.md).
> O cleanup ingênuo proposto naquele runbook (`UPDATE cities SET slug='sao-paulo-sp' WHERE id=1`)
> foi descartado: já existe `id=5278` ocupando esse slug, e há índice
> UNIQUE em `cities.slug`. UPDATE direto quebraria a constraint.

---

## 1. Problema

### 1.1 Duas linhas para a mesma cidade

```
+──────+──────────────+──────+──────────────────+
| id   | name         | state | slug             |
+──────+──────────────+──────+──────────────────+
| 1    | SÆo Paulo    | SP    | sæo-paulo        |  ← quebrado/duplicado
| 5278 | São Paulo    | SP    | sao-paulo-sp     |  ← correto, canônico
+──────+──────────────+──────+──────────────────+
```

- `id=1`: registro legado com encoding ruim (`Æ` em vez de `ã`/`a`),
  slug não-ASCII e sem sufixo de UF. Filtrado pelo regex
  [`VALID_SLUG_REGEX = /^[a-z0-9-]+-[a-z]{2}$/`](../../src/modules/seo/planner/cluster-plan-canonical-transform.js)
  no fallback do bootstrap.
- `id=5278`: registro canônico correto. **É o slug que o sitemap deveria
  usar quando São Paulo entrar.** Hoje não entra porque não tem ads
  ativos (a serem confirmados em §2.4).

### 1.2 Por que `UPDATE` direto não funciona

A tabela tem **índice UNIQUE em `slug`** (confirmar em §2.5). Tentar:

```sql
UPDATE cities SET slug='sao-paulo-sp' WHERE id=1;
```

falharia com `duplicate key value violates unique constraint "cities_slug_..."`,
porque `id=5278` já tem esse slug. Preciso **mesclar** as duas linhas em
vez de simplesmente renomear uma.

### 1.3 Anúncios apontando para o registro quebrado

Auditoria identificou 2 ads ativos com `city_id=1`:

| ad.id | title | hipótese |
|---|---|---|
| `80` | `Test Vehicle Test` | provavelmente teste (texto genérico) |
| `9` | `Carro teste (seed)` | claramente seed/teste (palavra "seed") |

**Hipótese forte:** ambos são lixo de seed/desenvolvimento. Confirmar em
§2.6. Se confirmado, cenário A de §3 aplica: despublicar os ads,
remover `id=1`. Nenhuma migração de dados real é necessária.

---

## 2. Checklist read-only (rodar ANTES de escolher cenário)

### 2.1 Confirmar as duas linhas em `cities`

```sql
SELECT id, name, state, slug
FROM cities
WHERE id IN (1, 5278)
   OR slug IN ('sæo-paulo', 'sao-paulo-sp')
ORDER BY id;
```

**Esperado:** exatamente 2 linhas (`id=1` e `id=5278`). Se aparecer um
terceiro registro, parar — escopo deste runbook é apenas as duas linhas
identificadas.

### 2.2 Volume de ads vinculados a cada `city_id`

```sql
SELECT
  city_id,
  COUNT(*) AS total_ads,
  COUNT(*) FILTER (WHERE status = 'active') AS active_ads,
  COUNT(*) FILTER (WHERE status <> 'active') AS inactive_ads
FROM ads
WHERE city_id IN (1, 5278)
GROUP BY city_id
ORDER BY city_id;
```

**Decisão por cenário:**

| Resultado | Cenário inicial provável |
|---|---|
| `city_id=1` tem 2 active (e §2.6 confirma "teste") | **A** — despublicar testes. |
| `city_id=1` tem ≥ 1 active e §2.6 mostra ad real | **B** — migrar `city_id`. |
| `city_id=1` tem ads em outras tabelas além de `ads` (§2.7) | **C** — merge complexo. |

### 2.3 Listar TODOS os ads de `city_id=1` (não só os 2 já conhecidos)

```sql
SELECT
  id,
  title,
  status,
  created_at,
  city_id,
  user_id,
  brand,
  model
FROM ads
WHERE city_id = 1
ORDER BY created_at DESC;
```

**Verificar visualmente:**
- `title` parece teste/seed ("test", "seed", "lorem", etc)?
- `user_id` é de uma conta de teste/dev (ex.: `dev@`, `seed@`)?
- `brand`/`model` são placeholders genéricos?
- `created_at` é antigo (pré-produção) ou recente?

### 2.4 Volume de ads em `city_id=5278` (referência canônica)

```sql
SELECT COUNT(*) AS total
FROM ads
WHERE city_id = 5278
  AND status = 'active';
```

**Resultado importa para o sitemap:**

| `total` | Implicação |
|---|---|
| `0` | Mesmo após cleanup, São Paulo (id=5278) só entra no sitemap se ganhar ad real. Hoje não entra de jeito nenhum. |
| `>= 1` | Após cleanup (e migração de §3.B se for o caso), São Paulo passa a aparecer no fallback do bootstrap. |

### 2.5 Confirmar índice UNIQUE em `cities.slug`

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'cities'
  AND indexdef ILIKE '%slug%'
ORDER BY indexname;
```

**Esperado:** ≥ 1 linha contendo `UNIQUE` ou `pkey`. Esta é a razão de
não conseguir fazer `UPDATE id=1 SET slug='sao-paulo-sp'`.

### 2.6 Identificar se os ads de `city_id=1` são teste

```sql
SELECT
  id,
  title,
  status,
  user_id,
  created_at,
  CASE
    WHEN LOWER(title) ~ '(test|teste|seed|lorem|dummy|fixture)' THEN 'sim_titulo'
    WHEN status = 'draft' THEN 'sim_draft'
    ELSE 'nao'
  END AS parece_teste
FROM ads
WHERE city_id = 1
ORDER BY id;
```

**Critério forte para "é teste":**
- `title` casa o regex de palavras de teste; OU
- `user_id` é uma conta marcada como `is_test` / `email LIKE '%@test%'`
  (ver §2.6.1); OU
- `status` é `draft` (nunca foi publicado).

### 2.6.1 Confirmar perfil dos donos dos ads (se houver tabela `users`)

```sql
SELECT u.id, u.email, u.created_at, a.id AS ad_id, a.title
FROM ads a
LEFT JOIN users u ON u.id = a.user_id
WHERE a.city_id = 1
ORDER BY a.id;
```

**O que olhar:** `u.email` com domínio de teste (`@example.com`,
`@test.com`, `@seed.local`), `u.created_at` muito antigo coincidindo
com seed inicial, ou `u.id` correspondendo a usuários conhecidos da
equipe.

### 2.7 Mapear OUTRAS tabelas que referenciam `city_id`

```sql
SELECT
  conrelid::regclass AS tabela,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE contype = 'f'
  AND pg_get_constraintdef(oid) ILIKE '%REFERENCES cities(id)%'
ORDER BY conrelid::regclass::text;
```

**Tabelas conhecidas a verificar (em ordem de prioridade):**

```sql
-- Lista expandida — para cada tabela que apareceu em pg_constraint:
SELECT 'city_scores' AS tabela, COUNT(*) AS rows FROM city_scores WHERE city_id IN (1, 5278)
UNION ALL SELECT 'city_metrics', COUNT(*) FROM city_metrics WHERE city_id IN (1, 5278)
UNION ALL SELECT 'city_targets', COUNT(*) FROM city_targets WHERE city_id IN (1, 5278)
UNION ALL SELECT 'seo_cluster_plans', COUNT(*) FROM seo_cluster_plans WHERE city_id IN (1, 5278)
UNION ALL SELECT 'seo_publications', COUNT(*) FROM seo_publications WHERE city_id IN (1, 5278)
-- ... acrescentar conforme §2.7 acima retornar tabelas
ORDER BY tabela;
```

**Resultado importa para definir o cenário:**

| Cenário | Critério |
|---|---|
| **A (testes)** | Apenas `ads` referencia `city_id=1`, com 1-2 linhas todas marcadas como teste em §2.6. |
| **B (ads reais)** | Apenas `ads` referencia `city_id=1`, mas alguma linha NÃO é teste. |
| **C (refs fortes)** | Outras tabelas (`city_scores`, `city_metrics`, `seo_cluster_plans`, etc.) também referenciam `city_id=1`. |

### 2.8 Confirmar schema de `cities` (colunas relevantes)

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'cities'
ORDER BY ordinal_position;
```

**Verificar:**
- `is_active` existe? (decisão: marcar `id=1` como inativo em vez de
  deletar — opção em §3.A).
- `updated_at` existe? (decisão: incluir/omitir do `SET`).
- `deleted_at` (soft-delete) existe? (decisão alternativa: soft-delete
  do `id=1`).

---

## 3. Cenários e SQL proposto (NÃO executar)

### 3.A — Ads de `city_id=1` são testes (cenário esperado)

**Pré-condições (todas devem ser TRUE):**
- §2.6 mostrou todos os ads de `city_id=1` como `parece_teste != 'nao'`.
- §2.7 não retornou outras tabelas referenciando `city_id=1`.
- §2.5 confirmou índice UNIQUE em slug (não vamos colidir, mas é
  contexto importante).

**Plano:**
1. Despublicar/arquivar os ads de teste (sem deletar — conservador).
2. Opcionalmente marcar `cities.id=1` como `is_active=FALSE` (se a
   coluna existir) — fica fora de qualquer query pública mas preserva
   FK histórica.
3. **NÃO** mexer em `id=5278` — ele já está canônico.

**SQL proposto (cada bloco em transação separada, executar sob
supervisão):**

```sql
-- Passo A1: despublicar ads de teste (status='archived' ou
-- 'inactive' conforme convenção do projeto). Validar no schema antes
-- qual valor é o "morto" — em alguns projetos é 'paused', 'deleted',
-- 'inactive'. Verificar status admitidos:
--
-- SELECT DISTINCT status FROM ads;
--
-- Supondo 'archived':

BEGIN;

UPDATE ads
SET
  status = 'archived',
  updated_at = NOW()  -- omitir se a coluna não existir
WHERE city_id = 1
  AND status = 'active'
  AND id IN (
    -- listar IDs explicitamente para não pegar nada novo que possa
    -- ter aparecido entre §2.3 e a execução:
    9, 80
    -- ajustar lista após §2.3 confirmar quais IDs realmente existem
  );

-- Validar:
SELECT id, title, status, city_id FROM ads WHERE id IN (9, 80);
-- Esperado: ambos com status='archived'.

COMMIT;
-- ou ROLLBACK se algo divergir.
```

```sql
-- Passo A2 (opcional, só se cities.is_active existir): marcar id=1
-- como inativo. NUNCA deletar — preserva FK histórica de ads
-- arquivados.

BEGIN;

UPDATE cities
SET
  is_active = FALSE,
  updated_at = NOW()  -- omitir se não existir
WHERE id = 1
  AND slug = 'sæo-paulo'
  AND state = 'SP';

SELECT id, name, slug, is_active FROM cities WHERE id IN (1, 5278);
-- Esperado:
--   id=1     is_active=FALSE
--   id=5278  is_active=TRUE  (não tocado)

COMMIT;
```

**Rollback:**
```sql
-- A1 reverso (se ainda quisermos os ads ativos):
UPDATE ads SET status = 'active', updated_at = NOW()
WHERE id IN (9, 80) AND city_id = 1 AND status = 'archived';

-- A2 reverso:
UPDATE cities SET is_active = TRUE, updated_at = NOW()
WHERE id = 1;
```

---

### 3.B — Ads de `city_id=1` são reais (precisam ser preservados)

**Pré-condições:**
- §2.6 mostrou ≥ 1 ad com `parece_teste = 'nao'`.
- §2.7 não retornou outras tabelas (caso contrário, vai para §3.C).
- §2.5 confirmou UNIQUE em slug.

**Plano:**
1. **Migrar** `ads.city_id` de `1` para `5278` (a referência canônica).
2. Validar que nenhum ad ficou com `city_id=1`.
3. Após migração, opcionalmente desativar `id=1` (passo A2).
4. Re-rodar dry-run do bootstrap para conferir que São Paulo passa a
   entrar no sitemap.

**SQL proposto:**

```sql
BEGIN;

-- Capturar timestamp pra rollback pontual:
SELECT NOW();
-- → ex: '2026-05-04 23:30:00+00'. ANOTAR.

-- Migração:
UPDATE ads
SET
  city_id = 5278,
  updated_at = NOW()  -- omitir se não existir
WHERE city_id = 1;

-- Validar contagens:
SELECT city_id, COUNT(*) FROM ads
WHERE city_id IN (1, 5278)
GROUP BY city_id;
-- Esperado: city_id=1 → 0 linhas; city_id=5278 → ads_anteriores + migrados.

-- Validar amostra dos migrados:
SELECT id, title, status, city_id FROM ads
WHERE id IN (9, 80, /* outros que vieram em §2.3 */)
ORDER BY id;
-- Esperado: city_id=5278 em todos.

COMMIT;
-- ou ROLLBACK se algo divergir.
```

**Após COMMIT, opcionalmente Passo A2** (desativar `cities.id=1`).

**Rollback:**
```sql
-- Volta os ads pra city_id=1, usando o timestamp capturado:
BEGIN;
UPDATE ads SET city_id = 1, updated_at = NOW()
WHERE city_id = 5278
  AND updated_at >= '2026-05-04 23:29:00'  -- margem de 1 min
  AND updated_at <  '2026-05-04 23:31:00';
COMMIT;
```

> ⚠️ Rollback de migração de `city_id` é **frágil** — depende do
> timestamp capturado e da margem. Se rodar `--yes` do bootstrap entre
> a migração e o rollback, `seo_cluster_plans` pode ter row criada que
> não casa mais com a realidade. **Não rodar bootstrap entre §3.B e
> eventual rollback.**

---

### 3.C — Há referências fortes em métricas/scores

**Pré-condições:**
- §2.7 retornou ≥ 1 tabela além de `ads` referenciando `city_id=1`
  (ex.: `city_scores`, `city_metrics`, `city_targets`,
  `seo_cluster_plans`, `seo_publications`).

**Plano:** **NÃO** este runbook. Merge de referências é trabalho com
escopo próprio:

1. Para cada tabela referenciante, decidir caso a caso:
   - Migrar referência (`UPDATE x SET city_id = 5278 WHERE city_id = 1`).
   - **OU** descartar (`DELETE FROM x WHERE city_id = 1`) se a row é
     vestígio de testes (city_metrics zerada, por exemplo).
2. Verificar se a tabela alvo tem UNIQUE composto incluindo `city_id`
   (ex.: `UNIQUE (city_id, period)` em métricas) — pode haver conflito
   se `city_id=5278` já tiver row para o mesmo período.
3. Cada migração precisa ter sua própria transação + rollback + smoke
   test.

**Abrir runbook próprio: `cities-merge-references-id1-to-id5278.md`.**
Não tentar resolver dentro deste runbook.

---

## 4. Recomendação executiva

### 4.1 Curto prazo (esta semana)

**Manter São Paulo FORA do sitemap até a limpeza acontecer.**

Já está fora hoje:
- `id=1` é filtrado pelo regex de slug canônico no fallback do bootstrap.
- `id=5278` não tem ads ativos (ou tem zero — confirmar §2.4) → não
  passa o filtro de `JOIN ads` no fallback.

Resultado: `cities.xml` e `below-fipe.xml` continuam mostrando só
Atibaia e Bragança. Sem regressão SEO.

### 4.2 Limpeza prioritária

1. **Confirmar §2.6:** os ads `id=80` e `id=9` (e quaisquer outros
   retornados em §2.3) são testes mesmo. Se confirmado, **cenário A**.
2. **Aplicar §3.A** em produção (despublicar ads de teste).
3. **Re-rodar dry-run** do bootstrap (`--limit=10`) e confirmar:
   - Nenhuma menção a `sæo`/`Æ`.
   - São Paulo (id=5278) ainda não aparece (porque agora tem 0 ads
     ativos depois de A1).
   - `totalErrors=0`.
4. Decidir em runbook **separado** se vale a pena marcar `id=1` como
   `is_active=FALSE` (passo A2). Não é urgente.

### 4.3 Quando São Paulo deveria entrar no sitemap

**Apenas quando houver ad real ativo em `city_id=5278`.** Anunciante
real, não seed. Até lá, é correto que a maior cidade do país NÃO
apareça no sitemap — preferimos vazio a publicar URL de uma cidade sem
estoque.

---

## 5. Checklist de execução por cenário

### Antes de qualquer SQL de §3:
- [ ] §2.1 confirmou exatamente 2 linhas (`id=1` e `id=5278`).
- [ ] §2.2 contagens registradas.
- [ ] §2.3 todos os ads de `city_id=1` listados (não só os 2 conhecidos).
- [ ] §2.4 contagem de ads em `city_id=5278` registrada.
- [ ] §2.5 índice UNIQUE em `slug` confirmado.
- [ ] §2.6 cada ad classificado como teste/real.
- [ ] §2.7 outras tabelas referenciantes mapeadas (cenário A só vale
       se ZERO outras tabelas).
- [ ] §2.8 schema de `cities` confirmado (`is_active`, `updated_at`,
       `deleted_at` existem ou não).

### Cenário escolhido:
- [ ] **A** se §2.6 = todos teste e §2.7 = vazio.
- [ ] **B** se §2.6 = ≥ 1 real e §2.7 = vazio.
- [ ] **C** se §2.7 ≠ vazio → abrir runbook próprio, parar aqui.

### Pós-execução (apenas se A ou B foram aplicados):
- [ ] Validação imediata via `SELECT` (já dentro da transação).
- [ ] `COMMIT` (não `ROLLBACK`).
- [ ] Rodar `node scripts/seo/bootstrap-cluster-plans.mjs --dry-run --limit=10`.
- [ ] Verificar log: `totalErrors=0`, sem `sæo`, samples coerentes com a
       expectativa.
- [ ] Decidir se aplica passo A2 (`cities.id=1 → is_active=FALSE`) em
       runbook próprio.

---

## 6. Travas absolutas

- ❌ **NÃO** executar §3 sem completar §2.
- ❌ **NÃO** rodar `UPDATE cities SET slug='sao-paulo-sp' WHERE id=1`
      — quebra UNIQUE.
- ❌ **NÃO** `DELETE FROM cities WHERE id=1` sem antes resolver as FKs
      (preferir `is_active=FALSE`).
- ❌ **NÃO** estender este runbook para outras cidades duplicadas
      (cada caso é caso).
- ❌ **NÃO** rodar `bootstrap-cluster-plans.mjs --yes` durante a
      execução de §3 (risco de criar `seo_cluster_plans` com state
      intermediário).
- ❌ **NÃO** alterar layout, frontend, sitemap em código, canonical em
      código, robots, rotas, ranking, planos, Página Regional,
      RUN_WORKERS, env do Render.

---

## 6.5. Execução automatizada (recomendado em vez de §2 manual)

Para reduzir erro de cópia/colar no Render Shell, dois scripts
substituem o checklist manual:

### 6.5.1 Auditoria

```bash
# Read-only, apenas SELECTs:
node scripts/maintenance/audit-sao-paulo-duplicate.mjs

# Forçar relatório JSON em reports/sao-paulo-duplicate-audit.json:
node scripts/maintenance/audit-sao-paulo-duplicate.mjs --json
```

O script:
- Compara `cities` id=1 vs id=5278 vs qualquer outro com slug/nome
  parecido com São Paulo.
- Lista e classifica todos os ads de city_id=1 e city_id=5278 (regex
  de teste em `title` e `slug`).
- Verifica `city_metrics`, `events` (com flag `sensivel` se `paid` ou
  `price > 0`), `region_memberships`.
- Mapeia **dinamicamente** todas as FKs apontando para `cities(id)` via
  `pg_constraint` e conta linhas para id=1 e id=5278.
- Tolera tabelas/colunas ausentes (códigos `42P01`/`42703`) — degrada
  pra "missing" e segue.
- Imprime classificação final: **A**, **B**, **C** ou **D**.

**Saída esperada com o estado atual conhecido (paid event existente):**

```
[audit-sao-paulo] CENÁRIO RECOMENDADO: D
[audit-sao-paulo]   motivo: events sensíveis em city_id=1: 1
```

### 6.5.2 Dry-run da limpeza

```bash
# Só imprime os SQLs que seriam executados:
node scripts/maintenance/cleanup-sao-paulo-duplicate.mjs --scenario=archive-test-data
```

O script:
- Aborta se `--scenario` ausente.
- Aborta se cenário desconhecido.
- Re-valida invariantes (slug atual de id=1 e id=5278; ads esperados
  ainda `active` e em `city_id=1`; ausência de `events.paid`; ausência
  de `region_memberships` referenciando id=1).
- Em dry-run, imprime SQL + params de cada step e retorna sem tocar
  banco.

### 6.5.3 Execução real (NÃO rodar agora)

```bash
# Só após aprovação explícita E classificação A confirmada:
node scripts/maintenance/cleanup-sao-paulo-duplicate.mjs --scenario=archive-test-data --yes
```

Mesmo com `--yes`, o script **aborta antes do BEGIN** se detectar:
- Evento sensível (paid / price > 0) em `city_id=1`.
- `region_memberships` referenciando `city_id=1`.

### 6.5.4 Cleanup confirmado de dados de teste (cenário D resolvido manualmente)

> **Pré-requisito:** auditoria classificou D, **operador confirmou**
> que o evento `id=4` ('FeirÆo de Seminovos', paid, R$ 499) é teste
> operacional de IA (não pagamento real) E os ads `id IN (9, 80)` são
> seed/teste E `region_memberships` autoref `1→1` é seed quebrado.

Comandos:

**Dry-run obrigatório primeiro** — imprime SQL planejado, snapshot
JSON em `reports/sao-paulo-cleanup-snapshot-<ts>.json`, e SQL de
rollback manual:

```bash
node scripts/maintenance/cleanup-sao-paulo-duplicate.mjs \
  --scenario=confirmed-test-data-cleanup \
  --confirm-event-id=4 \
  --confirm-broken-city-id=1 \
  --confirm-canonical-city-id=5278
```

**Execução real, somente após aprovação do dry-run:**

```bash
node scripts/maintenance/cleanup-sao-paulo-duplicate.mjs \
  --scenario=confirmed-test-data-cleanup \
  --confirm-event-id=4 \
  --confirm-broken-city-id=1 \
  --confirm-canonical-city-id=5278 \
  --yes
```

**O que faz dentro de uma única transação (BEGIN/COMMIT, ROLLBACK em erro):**

| # | Operação | Tabela | Tipo |
|---|---|---|---|
| 1 | `status='cancelled', payment_status='test_cancelled', price=0` | `events` (id=4) | UPDATE |
| 2 | `status='archived'` | `ads` (id IN (9,80)) | UPDATE |
| 3 | `DELETE` linha autorreferente quebrada (base=1, member=1, dist=0) | `region_memberships` | DELETE |
| 4 | `DELETE` métricas zeradas | `city_metrics` (city_id=1) | DELETE |
| 5 | `DELETE` city_status='exploring' score=0 | `city_status` (city_id=1) | DELETE |
| 6 | `is_active=false` (NÃO deleta) | `cities` (id=1) | UPDATE |

**O que o script NÃO faz:**

- ❌ NÃO deleta fisicamente `cities.id=1`.
- ❌ NÃO altera `cities.id=5278` (confirmado por teste de regressão).
- ❌ NÃO tenta `slug='sao-paulo-sp'` em id=1 (quebraria UNIQUE).
- ❌ NÃO mexe em outras cidades.
- ❌ NÃO toca `seo_cluster_plans`, `seo_publications`, `leads`,
   `dealer_leads`, `event_queue`, `city_scores` — pré-condição #8 abortaria.

**8 categorias de pré-condição checadas antes do BEGIN:**

1. `cities.id=1` ainda tem slug='sæo-paulo', state='SP', is_active=true.
2. `cities.id=5278` tem slug='sao-paulo-sp', state='SP', ibge_code=3550308, is_active=true.
3. Apenas ads `id IN (9, 80)` ativos em city_id=1, ambos batem regex de teste.
4. Evento `id=4` em city_id=1 com title/status/payment_status/price exatos; `payment_id` NULL/vazio se a coluna existir; CHECK constraint em `events.status` permite 'cancelled' (e em `payment_status` permite 'test_cancelled') — se não permitir, aborta com instrução manual.
5. `city_metrics` city_id=1 com ≤1 linha, todas métricas da whitelist == 0.
6. `city_status` city_id=1 com ≤1 linha, status='exploring', score=0.
7. `region_memberships` exatamente 1 linha autorreferente 1→1 com distance_km=0; sem outras linhas referenciando city_id=1; `5278→5278` existe.
8. Zero linhas em `seo_cluster_plans`, `seo_publications`, `leads`, `dealer_leads`, `event_queue`, `city_scores` para city_id=1.

Qualquer falha aborta antes do BEGIN.

**Snapshot e rollback manual:**

Antes de qualquer escrita (mesmo no dry-run, para o operador
revisar), o script captura JSON com todas as linhas afetadas em:

```
reports/sao-paulo-cleanup-snapshot-<timestamp>.json
```

E imprime SQL de rollback manual (UPDATE/INSERT inversos com valores
capturados) que o operador pode copiar/colar no `psql` em emergência.

### 6.5.5 Validação pós-cleanup

```bash
node scripts/maintenance/audit-sao-paulo-duplicate.mjs --json
```

**Esperado:**
- `events city_id=1`: 1 linha com `status='cancelled'`, `payment_status='test_cancelled'`, `price=0` → `sensivel=false`.
- `ads city_id=1`: 0 ativos (2 com `status='archived'`).
- `city_metrics city_id=1`: 0 linhas (ou seja, sem registro).
- `city_status city_id=1`: 0 linhas.
- `region_memberships city_id=1`: 0 linhas.
- `cities.id=1`: `is_active=false` (preservado, não deletado).
- `cities.id=5278`: intacto.
- `classification.scenario`: deixa de ser **D** — pode virar `indefinido` (sem ads ativos para classificar) ou cair em outro caminho. O importante é que **não há mais bloqueador** para São Paulo entrar no sitemap quando `cities.id=5278` ganhar ads ativos reais.

> **Recomendação atual** (com base no que já sabemos: existe evento paid
> `FeirÆo de Seminovos` e `region_memberships` apontando para id=1):
> **NÃO executar `--yes` neste momento.** A classificação é D — exige
> decisão manual antes de qualquer alteração. O cenário
> `archive-test-data` foi projetado para o caso A, e o script vai se
> recusar a executar enquanto refs fortes existirem.

---

## 7. Próximo passo recomendado

> **Tarefa:** Rodar **§6.5.1** (auditoria automatizada) no Render Shell
> de produção:
>
> ```bash
> node scripts/maintenance/audit-sao-paulo-duplicate.mjs --json
> ```
>
> Anexar saída completa do console + conteúdo de
> `reports/sao-paulo-duplicate-audit.json` (se a pasta existir) na
> próxima conversa. Com base no campo `classification.scenario`
> (esperado: **D** dado o paid event conhecido), decidir entre:
>
> - **D confirmado**: abrir runbook próprio para tratar o evento paid
>   e as `region_memberships` antes de qualquer cleanup.
> - **C**: abrir runbook próprio para merge de referências.
> - **B**: prompt para `--scenario=merge-to-canonical` (a ser implementado).
> - **A**: prompt para `--scenario=archive-test-data --yes` (script
>   atual já bloqueia se refs fortes voltarem a aparecer).
>
> Em qualquer dos casos, **NÃO** rodar `cleanup-...mjs --yes` neste
> momento.
>
> **Travas:** apenas leitura. Sem `UPDATE`/`DELETE`/`--yes`. Sem
> bootstrap de cluster plans. Sem mudanças em layout/sitemap/canonical/
> robots/rotas/ranking/planos/Página Regional.

---

## 7.A. Próximo passo manual (alternativa, se script não rodar)

> **Tarefa:** Executar **somente §2** (auditoria read-only manual)
> no Render Shell. Reportar:
>
> - §2.1: as 2 linhas estão lá (sem terceira)?
> - §2.2: contagens de ads por `city_id` (1 vs 5278).
> - §2.3: lista completa dos ads de `city_id=1` (id, title, status,
>   user_id, created_at).
> - §2.4: contagem de ads ativos em `city_id=5278`.
> - §2.5: índice UNIQUE em `slug` confirmado?
> - §2.6: cada ad classificado como `parece_teste`.
> - §2.7: lista de outras tabelas referenciando `city_id=1`.
> - §2.8: existem `is_active` / `updated_at` / `deleted_at`?
>
> Com essas 8 respostas, o próximo prompt escolhe entre A, B ou C e
> propõe o SQL de §3 para execução supervisionada.
>
> **Travas:** apenas `SELECT`. Sem `UPDATE`, sem `DELETE`, sem
> `--yes` em script algum.
