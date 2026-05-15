# Runbook: Auditoria de qualidade de dados antes do SEO regional

## Por que existe

A Página Regional foi promovida a vitrine principal do portal (PR 2). O
canonical auto-referencial e a indexação SEO estão controlados por flags
(`REGIONAL_PAGE_CANONICAL_SELF`, `REGIONAL_PAGE_INDEXABLE`) e ainda
estão **OFF em produção** porque os dados precisam estar limpos antes:
um Googlebot lendo "DeployModel1775172829" como anúncio real numa página
regional indexada é um problema duradouro de credibilidade e SEO.

Este runbook descreve como rodar a auditoria read-only, interpretar os
relatórios, e planejar a limpeza em fases controladas — sem mexer em
produção até ter aprovação manual de cada item.

## Onde mora

- Detectores puros: `scripts/audit/lib/detect-*.mjs` (4 arquivos)
- Helpers compartilhados: `scripts/audit/lib/audit-shared.mjs`
- Scripts de auditoria (read-only): `scripts/audit/audit-production-*.mjs`
- Testes: `tests/audit/*.test.js` (75 testes, todos verdes)

## Princípios

1. **Read-only**: nenhum script aqui faz `UPDATE` ou `DELETE`. Apenas `SELECT`.
2. **PII redactada**: e-mails, CPFs, CNPJs e telefones viram `<email-redacted>`,
   `<cpf-redacted>` etc. antes de chegar em CSV/JSON.
3. **Out-of-band**: relatórios saem em `reports/audit/` (mesma convenção
   usada por `cleanup-orphan-test-ads.mjs`).
4. **Limites defensivos**: `--limit` tem hard cap em 50.000 linhas. Sem
   `--limit`, default é 1000.

## Como rodar no Render Shell

```bash
# Conectado na shell do service backend (acesso ao mesmo DATABASE_URL):
cd /app

# 1. Auditoria de anúncios suspeitos de teste + slugs ruins.
node scripts/audit/audit-production-ads-quality.mjs --limit=5000

# 2. Auditoria territorial — cidades malformadas + inconsistências ads vs cities.
node scripts/audit/audit-production-city-integrity.mjs

# 3. Auditoria de imagens — sem foto, legacy, placeholder, duplicatas.
node scripts/audit/audit-production-image-integrity.mjs --limit=5000

# Para amostra rápida (100 ads, sem extrair muito):
node scripts/audit/audit-production-ads-quality.mjs --sample

# Para CSV em vez de JSON:
node scripts/audit/audit-production-image-integrity.mjs --format=csv
```

Os relatórios saem em `reports/audit/<nome>-<timestamp>.json` (ou .csv).

## Flags suportadas (todas opcionais)

| Flag | Default | O que faz |
|---|---|---|
| `--limit=N` | 1000 | Cap de linhas (hard cap 50.000). |
| `--out=DIR` | `./reports/audit` | Diretório do relatório. |
| `--format=csv\|json` | `json` | Formato. |
| `--status=X` | `active` | Filtro por `ads.status`. |
| `--all-statuses` | off | Remove o filtro de status. |
| `--since-days=N` | off | Só anúncios criados nos últimos N dias. |
| `--sample` | off | Atalho: limit=100. |
| `--silent` | off | Suprime saída no console. |
| `--print-schema` | off | **Diagnóstico (PR 6)**: imprime as colunas detectadas em `information_schema.columns`, mostra quais o script vai usar (PRESENT) e quais estão ausentes (MISSING). Sai sem extrair dados. |

## Schema dinâmico (incidente PR 5 → PR 6)

Em produção, o script PR 5 falhou com `column "version" does not exist`
porque o SELECT assumia uma coluna que não existe na tabela `ads`. PR 6
corrige isso introspectando o schema antes de cada SELECT:

1. Cada script chama `fetchExistingColumns(pool, 'ads')` (e/ou
   `'cities'`) — lê `information_schema.columns` para a tabela.
2. `buildSafeColumnList(available, requested)` divide as colunas
   pedidas em PRESENT (existem) e MISSING (não existem).
3. O SELECT é montado SÓ com as PRESENT. As MISSING viram warning no
   console (`[audit-*] colunas OPCIONAIS ausentes: ...`) mas não
   abortam o script.
4. Cada script tem uma lista `REQUIRED_*` mínima — se uma coluna
   REQUIRED estiver ausente, aborta cedo com instrução clara para
   rodar `--print-schema`.

**Para confirmar o schema antes de uma corrida real:**
```bash
node scripts/audit/audit-production-ads-quality.mjs --print-schema
node scripts/audit/audit-production-city-integrity.mjs --print-schema
node scripts/audit/audit-production-image-integrity.mjs --print-schema
```

Saída de `--print-schema` para `ads`:
```
=== Schema diagnostic: ads ===
  Colunas detectadas (24):
    advertiser_id, brand, city, city_id, created_at, description, ...
  Colunas pedidas pelo script (16):
    id, title, slug, status, brand, model, version, description, ...
  PRESENT (14): id, title, slug, status, brand, model, description, ...
  MISSING (2): version, dealership_id
```

As colunas REQUIRED de cada script:

| Script | REQUIRED (sem isso o script aborta) |
|---|---|
| `ads-quality` | `id`, `title`, `slug`, `status` |
| `city-integrity` (cities) | `id`, `name`, `slug`, `state` |
| `city-integrity` (ads) | `id`, `status` |
| `image-integrity` | `id`, `images` |

Todas as outras (brand, model, version, description, city_id, etc.) são
OPCIONAIS — ausência apenas reduz a cobertura do detector, mas não
quebra.

## Estrutura dos relatórios

### JSON (`--format=json`, default)

```json
{
  "audit": "ads-quality",
  "generatedAt": "2026-05-15T20:14:00.000Z",
  "summary": {
    "ads scanned": 5000,
    "test-suspect (high)": 12,
    "test-suspect (medium)": 7,
    "slug-issues (critical)": 0,
    "slug duplicates (groups)": 3
  },
  "findings": [
    {
      "kind": "test_ad_suspect",
      "id": 7849,
      "confidence": "high",
      "reasons": ["title:deploymodel", "model:deploymodel"],
      "reason_labels": ["Título contém 'DeployModel' (automation)", ...],
      "title": "DeployModel1775172829",
      "slug": "deploy-model-1775172829",
      ...
    }
  ]
}
```

### CSV (`--format=csv`)

Linha por finding, com headers derivados das chaves do primeiro registro.
PII já redactada. Pronto para abrir no Google Sheets para revisão manual.

## Plano de limpeza segura — fases A→F

### Fase A — Identificar (este PR)

**O que fazer:** rodar os 3 scripts em produção. Versar os relatórios em
um diretório acessível (ex.: storage interno, ou anexar ao runbook).

**Comando:**
```bash
node scripts/audit/audit-production-ads-quality.mjs
node scripts/audit/audit-production-city-integrity.mjs
node scripts/audit/audit-production-image-integrity.mjs
```

**Risco:** nenhum (read-only).

**Validação:** abrir o JSON resultante. Confirmar que `summary` faz
sentido (não retornou zero quando sabidamente há lixo, nem milhares
quando o portal é pequeno).

**Rollback:** N/A.

### Fase B — Revisar manualmente

**O que fazer:** olhar o relatório de `ads-quality` filtrando por
`confidence: "high"`. Verificar cada anúncio na UI (`/veiculo/<slug>`).
Para cada um, decidir:

- **Despublicar** (status → `removed`): claramente teste/automation.
- **Corrigir** (atualizar title/slug): real mas com texto ruim.
- **Manter**: falso positivo (anotar o motivo no relatório versionado).

**Risco:** baixo (decisão manual).

**Validação:** marcar cada finding com uma decisão antes de prosseguir.

**Rollback:** se classificou como "despublicar" mas era real, basta
voltar `status = 'active'`.

### Fase C — Despublicar anúncios claramente de teste

**O que fazer:** escrever script `scripts/audit/cleanup-test-ads.mjs`
seguindo o padrão de `scripts/cleanup-orphan-test-ads.mjs` existente:

- Lê o JSON da Fase B (com `decision: "unpublish"`)
- Default `--dry-run`, exige `--execute` explícito
- Usa `withTransaction` do `db.js`
- Snapshot pré-transação em arquivo separado para rollback
- Atualiza `status = 'archived_test'` em vez de DELETE (preserva
  evidência)

**Não fazer parte deste PR** — depende dos dados reais da Fase A/B.

**Comando previsto:**
```bash
node scripts/audit/cleanup-test-ads.mjs --decision-file=reports/audit/decisions-2026-05-15.json --dry-run
# revisar saída
node scripts/audit/cleanup-test-ads.mjs --decision-file=... --execute
```

**Risco:** médio (modifica produção). Mitigado por dry-run + snapshot +
`archived_test` em vez de DELETE.

**Rollback:** `UPDATE ads SET status = 'active' WHERE id IN (...)`
restaurando do snapshot.

### Fase D — Corrigir city_slug/state

**O que fazer:** para findings de `city_malformed` (severity high) e
`ad_city_inconsistency` (medium), aplicar `suggestedSlug` do detector.

- Script de correção separado, gated por `--execute`.
- **NÃO criar cidade nova** automaticamente. Se a cidade não existe,
  marca para revisão manual no admin.
- Cada UPDATE em uma transação por cidade, com WHERE pelo id antigo
  para evitar afetar mais que esperado.

**Não fazer parte deste PR.**

**Comando previsto:**
```bash
node scripts/audit/cleanup-city-integrity.mjs --decision-file=... --dry-run
```

**Risco:** médio. Mudar `cities.slug` afeta URLs públicas → exige
redirect 301 da URL antiga.

**Rollback:** snapshot pré-transação. Cuidado adicional: se a URL antiga
já está indexada, deixar redirect 301 permanente em vez de reverter.

### Fase E — Tratar imagens ausentes

**O que fazer:** para findings de `image_issue` severity critical
(no_images) ou high (cover_is_placeholder), decidir:

- **Despublicar temporariamente** (`status = 'pending_photo'`): permite
  ao vendedor reupar sem perder o anúncio.
- **Migrar imagem** (legacy `/uploads/` → R2): usar script existente
  `scripts/migrate-legacy-ad-images-to-r2.mjs` com `--ad-id=<id>` para
  individual ou `--execute` em lote.
- **Manter** com placeholder: aceitável para mercado de baixa liquidez.

**Não fazer parte deste PR.** Já existe infra de migração R2.

**Risco:** baixo a médio. Reverter status é trivial.

### Fase F — Validar páginas regionais

**O que fazer:** após fases C-E, validar manualmente:

1. `/comprar/estado/sp` — sem anúncios de teste visíveis na grade.
2. `/carros-usados/regiao/atibaia-sp` — sem placeholder na capa, sem
   "DeployModel" no título.
3. `/comprar/cidade/atibaia-sp` — idem.
4. Home — bloco "Explore por região" com nomes corretos sem mojibake.

Depois rodar os 3 scripts de auditoria novamente. Comparar o `summary`
antes/depois — esperar drop substancial em `confidence: "high"` e
`severity: "critical"`.

**Só então** considerar ligar `REGIONAL_PAGE_INDEXABLE=true` em
staging. Não em produção até PR 6.

## Riscos cross-fase

| Risco | Mitigação |
|---|---|
| Falso positivo em "test_ad_suspect" | Confidence buckets — `low` é dica, não auto-fix. Revisão manual obrigatória antes de despublicar. |
| Cliente real com slug "TESTE" | Detectado mas requer revisão (motorista que digitou "TESTE DRIVE" no título — improvável mas possível). |
| Coordenada faltante mas anúncio real | Detector flagra `city_missing_coords` separado; sem impacto se o anúncio existe em outra cidade. |
| Imagem `/uploads/` ainda funcional | Script só audita; migração só com `migrate-legacy-ad-images-to-r2.mjs --execute`. |
| Mojibake em nome de cidade | Detector flagra; correção pode ser manual ou via UPDATE com `convert_from(convert_to(name, 'LATIN1'), 'UTF8')` — testar em staging primeiro. |

## Próximo passo recomendado

1. Rodar este PR (apenas tooling — sem efeito em prod).
2. Em uma janela de manutenção, executar os 3 scripts read-only em
   produção (Render Shell). Salvar os relatórios.
3. Revisar manualmente os findings high/critical (Fase B).
4. Implementar PR 6 com os scripts de correção (Fases C, D, E),
   seguindo o padrão `--dry-run`/`--execute` do
   `cleanup-orphan-test-ads.mjs` existente.
5. Após dados limpos, considerar ativar `REGIONAL_PAGE_CANONICAL_SELF`
   em staging.

## Status atual

- Detectores: ✅ implementados, 75 testes verdes
- Scripts: ✅ implementados, `node --check` passa
- Runbook: ✅ este documento
- Execução em produção: ❌ pendente (próximo passo, exige acesso ao
  Render Shell)
- Scripts de correção (Fases C-E): ❌ não implementados (escopo do PR 6)
