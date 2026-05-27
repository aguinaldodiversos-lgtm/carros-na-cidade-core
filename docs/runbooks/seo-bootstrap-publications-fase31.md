# Fase 3.1 — Bootstrap de Publicações SEO (factual, sem IA)

> **Status:** PRONTO PARA DRY-RUN. Bloqueador local: Docker Desktop e Postgres
> :5433 estavam offline no momento da implementação — operador roda
> dry-run/apply diretamente via Render Shell de produção depois de validar
> testes verdes localmente.
>
> **Objetivo:** criar 4 publicações reais (factuais, sem IA) em
> `seo_publications` a partir dos 4 clusters elegíveis já existentes em
> `seo_cluster_plans`, reduzir issues `cluster_without_publication` no painel
> e validar PATCH end-to-end.

---

## 0. Pré-requisitos

- [x] Testes backend verde (`npx vitest run --exclude tests/integration/**` → 1624 passed)
- [x] Frontend `tsc --noEmit` verde
- [x] Frontend `npm run lint` verde
- [x] Frontend `npm run build` verde
- [x] Lint dos arquivos novos verde (apenas warning pré-existente em `admin-seo.repository.js#whereExpr`)

---

## 1. O que muda nesta entrega

| Arquivo | Mudança | Motivo |
|---|---|---|
| `src/modules/seo/constants/seo-status.js` | **NOVO** — enums congelados (`SCP_STATUS`, `SP_STATUS`, `CLUSTER_TYPES`, `SITEMAP_*_STATUSES`, `SITEMAP_BUCKET_TO_CLUSTER_TYPE`) | Source-of-truth única para filtros |
| `src/read-models/seo/sitemap-public.repository.js` | Filtros `IN ('planned','generated')` → `SITEMAP_ELIGIBLE_SCP_STATUSES` (`planned`, `published`, `generated` legado) | Sitemap mostra clusters após `markClusterPublished` |
| `src/modules/public/public-seo.service.js` | Mesma migração para `SCP_STATUS_FILTER` + `SP_STATUS_FILTER` | Unifica filtro canônico |
| `src/modules/admin/seo/admin-seo.repository.js` | Overview/sitemapCounts/sitemapRegionCounts/listIssues usam o filtro compartilhado; `listIssues` mapeia buckets via `SITEMAP_BUCKET_TO_CLUSTER_TYPE` (fix dos 6 buckets sempre vazios) | Painel reflete realidade |
| `src/modules/admin/seo/admin-seo.service.js` | `SITEMAP_INDEX` agora usa `CLUSTER_TYPES.CITY_*` reais; `local_seo` marcado como `fixed_paths: true` (vazio por design) | Mesmo fix de nome |
| `scripts/seo/bootstrap-publications.mjs` | **NOVO** — script CLI dry-run/apply com INSERT defensivo via introspecção, sem AI | Cria as 4 publicações factuais |
| `tests/modules/seo/seo-status.test.js` | **NOVO** — 13 testes de enums | Cobertura |
| `tests/scripts/bootstrap-publications.test.js` | **NOVO** — 24 testes (parseArgs, factual builder, schema defensivo, orquestração) | Cobertura |
| `tests/fixtures/seo/bootstrap-publications-fase31.sql` | **NOVO** — fixture LOCAL/TEST ONLY que reproduz o schema reduzido de prod (NUNCA roda automaticamente) | Reprodutibilidade do dry-run/apply local |
| `package.json` | `seo:bootstrap-publications` e `seo:bootstrap-cluster-plans` adicionados | Atalho `npm run …` |

**Sem migration. Sem DDL em runtime. Sem IA.**

---

## 1.1. Validação local (Docker Desktop + Postgres :5433)

Antes de qualquer dry-run em produção, o operador deve validar localmente:

```powershell
# 1. Subir Postgres de teste (Docker Desktop precisa estar rodando)
npm run integration:db:up
npm run integration:db:wait
npm run integration:db:prepare    # roda migrations oficiais

# 2. Aplicar fixture que reproduz o cenário pré-Fase 3.1
#    (DROP CASCADE em seo_cluster_plans / seo_publications — SÓ DB DE TESTE)
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5433/carros_na_cidade_test"
psql "$env:TEST_DATABASE_URL" -f tests/fixtures/seo/bootstrap-publications-fase31.sql

# 3. Dry-run com limit=4 contra DB local
$env:DATABASE_URL = $env:TEST_DATABASE_URL
node scripts/seo/bootstrap-publications.mjs --dry-run --limit=4

# 4. Apply local (valida idempotência re-rodando)
node scripts/seo/bootstrap-publications.mjs --apply --limit=4
node scripts/seo/bootstrap-publications.mjs --apply --limit=4   # 2ª vez: 0 created, mantém os 4
```

Esperado:
- Dry-run mostra 4 clusters elegíveis em `/carros-em/*` e `/carros-baratos-em/*`
- Apply cria 4 publicações; re-apply não duplica (ON CONFLICT path)
- Re-rodar dry-run após apply mostra `eligibleClusters: 0` (clusters promovidos para `published` e com publicação associada)

**Não pular esta etapa.** Não rodar a fixture em prod sob nenhuma circunstância.

---

## 2. Política de status reconciliada

Antes da Fase 3.1 havia 4 filtros diferentes consumindo `scp.status`:

| Local | Filtro antigo | Filtro novo |
|---|---|---|
| `sitemap-public.repository.js` (3 fns) | `('planned','generated')` | `SITEMAP_ELIGIBLE_SCP_STATUSES` = `('planned','published','generated')` |
| `public-seo.service.js#listEntries` | `('published','planned')` | mesma constante |
| `admin-seo.repository.js#overviewSummary` | `('planned','generated')` | mesma constante |
| `admin-seo.repository.js#sitemapCounts/RegionCounts` | `('planned','generated')` | mesma constante |
| `admin-seo.repository.js#listIssues` (sql 4) | `('planned','generated')` | mesma constante |

Resultado: depois do `markClusterPublished` (quando publicação é criada) o cluster sai do estado `planned` mas **continua** aparecendo no sitemap territorial e no canônico (filtros unificados).

`generated` mantido como legado (zero linhas com esse valor em prod hoje, mas a transição é segura). `generating` (transiente) e `failed`/`archived` continuam fora do sitemap.

---

## 3. Como rodar o dry-run em produção

> **NUNCA passe `--apply` antes do dry-run ser revisado.**

No Render Shell do service `carros-na-cidade-core` (backend):

```bash
cd $RENDER_SRC_ROOT 2>/dev/null || cd /opt/render/project/src

# Sanity
git log -1 --oneline                    # bate com o último deploy?
test -f scripts/seo/bootstrap-publications.mjs && echo OK || echo FALTANDO

# DRY-RUN
node scripts/seo/bootstrap-publications.mjs --dry-run --limit=4 2>&1 | tee /tmp/bootstrap-pub-dryrun.log
```

**O que esperar no output (resumo final em JSON):**

```json
{
  "ok": true,
  "dryRun": true,
  "detectedColumns": ["cluster_plan_id", "id", "is_indexable", "path", "status", "title", "updated_at"],
  "omittedSample": ["excerpt", "content_provider", "content_stage", "is_money_page", "health_status", "..."],
  "totals": {
    "eligibleClusters": 4,
    "prepared": 4,
    "skipped": 0,
    "created": 0
  },
  "previews": [
    { "cluster_id": 1, "path": "/carros-em/...-sp", "title": "Carros usados em ...", "is_indexable": true },
    ...
  ]
}
```

**Valide antes do apply:**

- [ ] `totals.eligibleClusters === 4`
- [ ] Todos os `path` começam com `/carros-em/` ou `/carros-baratos-em/`
- [ ] Todos os `title` mencionam cidade real (não "cidade", "undefined", etc.)
- [ ] Todos os `is_indexable === true` (ou se algum vier `false`, justificar — falta de anúncios no DB pode levar `wordCount < 60` → noindex automático)
- [ ] `omittedSample` reflete o schema reduzido conhecido — `content_provider`, `content_stage`, etc. estão omitidos sem erro

Cole o JSON resumo aqui antes de prosseguir.

---

## 4. Como rodar o apply em produção

**Só rode após dry-run aprovado.** O script é idempotente (UPSERT ON CONFLICT path) — re-rodar é seguro.

```bash
cd $RENDER_SRC_ROOT 2>/dev/null || cd /opt/render/project/src

# APPLY — escreve em seo_publications
node scripts/seo/bootstrap-publications.mjs --apply --limit=4 2>&1 | tee /tmp/bootstrap-pub-apply.log
```

**O que esperar:**

```json
{
  "ok": true,
  "dryRun": false,
  "totals": {
    "eligibleClusters": 4,
    "prepared": 4,
    "skipped": 0,
    "created": 4,
    "failures": 0
  },
  "created": [
    { "publication_id": ..., "cluster_id": ..., "path": "/carros-em/...", "is_indexable": true },
    ...
  ]
}
```

**Se houver `failures.length > 0`:** cole o JSON inteiro aqui antes de tentar de novo. O script NÃO aborta lote parcial — quem falha entra em `failures`, quem sucede já está persistido.

---

## 5. Validação pós-apply (operador roda no Render Shell)

```bash
# Confirma contagem
psql "$DATABASE_URL" -c "SELECT COUNT(*) AS pubs_total, COUNT(*) FILTER (WHERE is_indexable) AS indexable FROM seo_publications;"

# Lista paths criados
psql "$DATABASE_URL" -c "SELECT id, path, title, status, is_indexable, updated_at FROM seo_publications ORDER BY updated_at DESC LIMIT 10;"

# Confirma promoção dos clusters
psql "$DATABASE_URL" -c "SELECT status, COUNT(*) FROM seo_cluster_plans GROUP BY status ORDER BY status;"
```

Esperado:
- `pubs_total >= 4`
- Cada `path` casa um cluster_plan
- `seo_cluster_plans` agora tem clusters com `status='published'`

---

## 6. Validação do painel admin (curl ou navegador)

```bash
# Substitua $TOKEN por JWT admin válido
curl -sS -H "Authorization: Bearer $TOKEN" https://carros-na-cidade-core.onrender.com/api/admin/seo/overview | jq '.publications, .clusters'
curl -sS -H "Authorization: Bearer $TOKEN" https://carros-na-cidade-core.onrender.com/api/admin/seo/publications | jq '.total, .data[0:2]'
curl -sS -H "Authorization: Bearer $TOKEN" https://carros-na-cidade-core.onrender.com/api/admin/seo/issues | jq '[.[] | select(.kind=="cluster_without_publication")] | length'
```

Esperado:
- `publications.total >= 4`
- `data` lista as 4 publicações
- `cluster_without_publication` issues reduzem para `0` (ou ≤ 4, dependendo de quantos clusters foram processados)
- `empty_sitemap_bucket` reduz: `cities` e `below_fipe` deixam de aparecer como vazios

---

## 7. Smoke público

```bash
# Cada URL deve retornar HTTP 200 (não 404, não soft-404)
for path in /carros-em/atibaia-sp /carros-baratos-em/atibaia-sp /carros-em/jundiai-sp /carros-baratos-em/jundiai-sp; do
  echo "=== $path ==="
  curl -sS -o /dev/null -w "HTTP %{http_code}\n" "https://www.carrosnacidade.com$path"
done

# Rotas estratégicas que devem continuar 200
for path in / /comprar /carros-em/sao-paulo-sp /carros-usados/sp /tabela-fipe/sao-paulo-sp /simulador-financiamento/sao-paulo-sp; do
  curl -sS -o /dev/null -w "%{http_code} $path\n" "https://www.carrosnacidade.com$path"
done
```

(Substituir slugs reais conforme cidades cadastradas — se Atibaia/Jundiaí não forem os 2 primeiros do `listEligibleClusterPlans`, ajustar.)

---

## 8. Validação de mutation com revert

Testar PATCH end-to-end no admin:

```bash
PUB_ID=<pegar do passo 6>

# Marcar noindex
curl -sS -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_indexable": false, "reason": "Validação Fase 3.1 — smoke de PATCH"}' \
  https://carros-na-cidade-core.onrender.com/api/admin/seo/publications/$PUB_ID

# Verificar admin_actions
curl -sS -H "Authorization: Bearer $TOKEN" \
  https://carros-na-cidade-core.onrender.com/api/admin/seo/publications/$PUB_ID | jq '.history[0]'

# Revert — marcar indexable de novo
curl -sS -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_indexable": true, "reason": "Revert da validação Fase 3.1"}' \
  https://carros-na-cidade-core.onrender.com/api/admin/seo/publications/$PUB_ID
```

Esperado: `history[0].action === "mark_seo_noindex"` no primeiro PATCH, `mark_seo_indexable` no segundo, ambos com `reason` salvo e `old_value`/`new_value` corretos.

---

## 9. Rollback (se algo der errado)

Caso necessário, basta deletar as publicações criadas e rebaixar os clusters:

```sql
-- IDs vindos do output do apply (campo `created`)
DELETE FROM seo_publications WHERE id IN (<ids>);

-- Rebaixar clusters promovidos
UPDATE seo_cluster_plans
SET status = 'planned',
    last_generated_at = NULL,
    updated_at = NOW()
WHERE id IN (<cluster_ids>);
```

O script é idempotente — re-rodar `--apply` depois disso recria.

---

## 10. Limitações conhecidas

1. **Conteúdo factual genérico.** Sem AI, o conteúdo é descritivo curto (~80-100 palavras) baseado em contagens de DB. Cumpre o mínimo (60 palavras → `is_indexable=true`) mas não substitui geração full pelo orquestrador.
2. **Schema reduzido em prod.** `excerpt`, `health_status`, `publication_type`, `content_provider`, `content_stage`, `is_money_page` provavelmente ausentes. INSERT defensivo omite — visível no `omittedSample` do resumo.
3. **Sitemap territorial usa `/carros-em/`** (canônica intermediária Fase 1), não `/comprar/cidade/[slug]`. Rota deve estar 200 — caso contrário, o smoke do passo 7 falha e a publicação precisa ser noindex.
4. **`generating` (in-progress) ainda é gravado por `cluster-executor.repository.js:33`** quando o worker oficial roda — não afeta esta fase (script direto não usa esse caminho).
5. **City snapshot lê `advertiser_id` via DISTINCT** — não bate exatamente com o número usado em `city-public.repository.js` (que conta `advertisers` filtrado por `advertisers.city_id`). Diferença esperada se o anunciante mora em outra cidade que o anúncio.

---

## 11. Próxima fase recomendada (Fase 3.2)

1. **Aumentar limit para 20-50** após validar 4 estáveis por 7 dias.
2. **Migrar `cluster-executor.repository.js:33`** para gravar `generating` apenas como label transiente que o sitemap NÃO filtra (ou unificar para `planned`).
3. **Migration formal** (`023_seo_publications_canonical_columns.sql`) para oficializar colunas opcionais — só depois de Search Console confirmar indexação das 4 primeiras.
4. **Liga `RUN_WORKERS=true`** e habilita worker oficial após Search Console aceitar as 4.
