# Cleanup de slug malformado — São Paulo (city.id=1)

> **Status:** runbook proposto, **não executado**. Nenhum `UPDATE` foi
> rodado por esta entrega. Operador deve seguir o checklist read-only
> abaixo antes de aplicar a correção.
>
> **Escopo cirúrgico:** uma única linha em `cities` (id=1). Nenhuma
> outra cidade é tocada. Nenhum efeito em layout, frontend, sitemap em
> código, canonical em código, robots, rotas, ranking, planos ou
> Página Regional.

---

## 1. Problema

Auditoria do bootstrap de cluster plans (2026-05-04) identificou registro
malformado em `cities`:

| Campo | Valor atual | Problema |
|---|---|---|
| `id` | `1` | — |
| `name` | `SÆo Paulo` | Caractere `Æ` (U+00C6, ligature) em vez de `ã` (U+00E3 LATIN SMALL LETTER A WITH TILDE). |
| `slug` | `sæo-paulo` | Não-ASCII (`æ` U+00E6) **e** sem sufixo de UF. |
| `state` | `SP` | OK. |

**Consequência operacional:** o slug não passa no padrão canônico
[`VALID_SLUG_REGEX = /^[a-z0-9-]+-[a-z]{2}$/`](../../src/modules/seo/planner/cluster-plan-canonical-transform.js)
que filtra o fallback do planner
([cluster-planner-bootstrap.md §9.4](./cluster-planner-bootstrap.md)).
Por isso, no dry-run e no commit do bootstrap (`--yes --limit=10`,
2026-05-04), São Paulo foi corretamente **excluída** do sitemap. Hoje
publicamos:

- `/carros-em/atibaia-sp` ✓
- `/carros-baratos-em/atibaia-sp` ✓
- `/carros-em/braganca-paulista-sp` ✓
- `/carros-baratos-em/braganca-paulista-sp` ✓

São Paulo só voltará a entrar no sitemap após o slug ser corrigido para
`sao-paulo-sp` (forma canônica ASCII + UF).

**Por que o dado está nesse estado:** provável encoding mismatch num
seed antigo (Latin1 → UTF-8 mal interpretado). Não foi reproduzido em
nenhum import recente; não há trigger conhecido criando linhas com
ligatura. Investigação de causa raiz fica para tarefa separada se o
problema reaparecer em outras cidades.

---

## 2. Checklist read-only (rodar ANTES de qualquer UPDATE)

### 2.1 Confirmar estado atual de id=1 e checar conflito com `sao-paulo-sp`

```sql
SELECT id, name, state, slug
FROM cities
WHERE id = 1
   OR slug = 'sao-paulo-sp'
ORDER BY id;
```

**Resultados possíveis:**

| Cenário | Linhas devolvidas | Decisão |
|---|---|---|
| **A — caminho feliz** | 1 linha (`id=1`, `slug='sæo-paulo'`); nenhuma com `slug='sao-paulo-sp'` | Aplicar UPDATE de §3. |
| **B — conflito** | 2 linhas: `id=1` + outra com `slug='sao-paulo-sp'` | **PARAR.** Outra cidade já reivindicou o slug alvo. Investigar duplicidade antes de qualquer UPDATE. |
| **C — já corrigido** | 1 linha (`id=1`, `slug='sao-paulo-sp'`) | Dado já está bom. Nada a fazer. Re-validar §6.2 para confirmar. |

> ⚠️ Se aparecer cenário B, **não** rodar o UPDATE. Abrir investigação
> separada para entender por que existem dois registros para São Paulo.
> Pode envolver merge de `ads.city_id`, ranking, etc — escopo grande.

### 2.2 Volume de anúncios vinculados a `city_id=1`

```sql
SELECT COUNT(*) AS total
FROM ads
WHERE city_id = 1;
```

| Resultado | Implicação |
|---|---|
| `0` | Cidade sem ads. UPDATE é trivial — nenhum efeito em sitemap (Atibaia/Bragança permanecem). |
| `1+` | UPDATE é seguro (não muda `id`, só `name`/`slug`); ads continuam vinculados. Após o cleanup, São Paulo passa a entrar no fallback do bootstrap (se `active_ads` > 0 e slug for canônico). |

### 2.3 Sample dos ads de São Paulo (auditoria visual)

```sql
SELECT id, title, status, city_id
FROM ads
WHERE city_id = 1
ORDER BY created_at DESC
LIMIT 10;
```

> Não é gate de decisão — é só sanity check para o operador ver se
> esses ads parecem reais (não são lixo de teste com caracteres
> estranhos refletindo o mesmo problema de encoding).

### 2.4 Schema de `cities` — confirmar colunas para o UPDATE

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'cities'
ORDER BY ordinal_position;
```

**O que verificar:**

| Coluna | UPDATE depende? |
|---|---|
| `id` | Sim, no `WHERE`. |
| `name` | Sim, é o que vamos setar. |
| `slug` | Sim, é o que vamos setar e usamos no `WHERE` para garantir idempotência. |
| `state` | Sim, no `WHERE` defensivo. |
| `updated_at` | **Se existir**, incluir `updated_at = NOW()` no SET. **Se não existir**, omitir essa cláusula do UPDATE. |

### 2.5 Garantia de idempotência adicional (opcional, recomendada)

```sql
-- Se uma constraint UNIQUE em slug existir, este SELECT confirma
-- que NÃO há linha com slug alvo (mesma info que 2.1, em formato diferente).
SELECT COUNT(*) AS conflitos
FROM cities
WHERE slug = 'sao-paulo-sp';
```

| Resultado | Decisão |
|---|---|
| `0` | OK, segue para §3. |
| `>= 1` | PARAR. Mesmo cenário B de §2.1. |

---

## 3. UPDATE proposto (NÃO aplicar nesta etapa)

> **Trava:** este runbook **não executa** o UPDATE. Operador aplica
> apenas após §2 confirmar cenário A.

### 3.1 Versão se `cities.updated_at` EXISTIR

```sql
BEGIN;

UPDATE cities
SET
  name = 'São Paulo',
  slug = 'sao-paulo-sp',
  updated_at = NOW()
WHERE id = 1
  AND slug = 'sæo-paulo'
  AND state = 'SP';

-- Confirmação manual antes de COMMIT:
SELECT id, name, state, slug, updated_at
FROM cities
WHERE id = 1;

-- Se a saída acima estiver correta:
COMMIT;
-- Se não:
-- ROLLBACK;
```

### 3.2 Versão se `cities.updated_at` NÃO existir

```sql
BEGIN;

UPDATE cities
SET
  name = 'São Paulo',
  slug = 'sao-paulo-sp'
WHERE id = 1
  AND slug = 'sæo-paulo'
  AND state = 'SP';

SELECT id, name, state, slug
FROM cities
WHERE id = 1;

COMMIT;
```

### 3.3 Por que essas cláusulas no `WHERE`?

| Cláusula | Propósito |
|---|---|
| `id = 1` | Targeting cirúrgico — apenas a linha problemática. |
| `slug = 'sæo-paulo'` | **Idempotência.** Se o UPDATE já rodou (e slug agora é `sao-paulo-sp`), o WHERE não bate em ninguém — `0 rows affected`, sem efeito. Re-rodar não duplica nem corrompe. |
| `state = 'SP'` | Defesa em profundidade. Se por algum acaso `id=1` virou outra coisa em algum ambiente, o UPDATE não toca. |

### 3.4 Linhas afetadas esperadas

`1` no caso normal. `0` se for re-execução (idempotente). Qualquer outro
valor é anomalia — `ROLLBACK` e investigar.

---

## 4. Risco de conflito

### 4.1 Conflito de UNIQUE

Se existe `UNIQUE INDEX cities_slug_key` (ou similar), o UPDATE falha
imediatamente com `duplicate key value violates unique constraint` se
já houver linha com `slug='sao-paulo-sp'`. **Esse é o comportamento
desejado** — a transação não comita, banco fica intocado.

Verificar a presença do índice antes:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'cities'
  AND indexdef ILIKE '%slug%';
```

### 4.2 Conflito de aplicação (FK em ads, leads, scores)

`ads.city_id = 1` continua valendo após o UPDATE — não tocamos `id`.
Mesma coisa para `city_scores.city_id`, `city_metrics.city_id`,
`city_targets.city_id` e qualquer outra FK. **UPDATE de `name`/`slug`
não invalida nenhuma referência.**

### 4.3 Cache / CDN

Como a página de São Paulo está hoje **fora do sitemap** (filtro do
fallback), não há URL pública canônica em circulação para ser
invalidada. Após o cleanup, o próximo dry-run/commit do bootstrap
incluirá `/carros-em/sao-paulo-sp` e `/carros-baratos-em/sao-paulo-sp`
naturalmente. Sem problema de cache.

### 4.4 SEO

Nenhuma URL pública é alterada (a antiga nunca esteve no sitemap). O
único efeito é uma URL nova entrar no próximo batch — comportamento
desejado.

---

## 5. Plano de rollback

Se algo der errado APÓS o COMMIT (improvável, mas defensivo):

```sql
-- Capturar timestamp ANTES de qualquer mudança (parte de §3):
SELECT NOW();
-- → ex.: '2026-05-04 22:00:00+00'

-- Se necessário reverter:
BEGIN;
UPDATE cities
SET
  name = 'SÆo Paulo',
  slug = 'sæo-paulo'
  -- updated_at = NOW()  -- só se existir a coluna
WHERE id = 1
  AND slug = 'sao-paulo-sp'
  AND state = 'SP';

SELECT id, name, state, slug FROM cities WHERE id = 1;
-- Se for o esperado:
COMMIT;
```

> ⚠️ Restaurar dado malformado é antinatural e só deve ser feito se
> houver evidência concreta de quebra. Em geral, manter a forma
> corrigida e seguir adiante.

---

## 6. Validação pós-UPDATE

### 6.1 Confirmar dado novo

```sql
SELECT id, name, state, slug
FROM cities
WHERE id = 1;
```

**Esperado:**

| id | name | state | slug |
|---|---|---|---|
| `1` | `São Paulo` | `SP` | `sao-paulo-sp` |

Verificar visualmente que o `name` aparece com `ã` (U+00E3) — se ainda
aparecer `Æ`, o terminal/cliente psql está com problema de encoding,
mas o dado pode estar correto. Confirmar via:

```sql
SELECT id, encode(name::bytea, 'hex') AS name_hex, length(name) AS chars
FROM cities WHERE id = 1;
-- Esperado: hex contendo 'c3a3' (ã em UTF-8) em vez de 'c386' (Æ)
```

### 6.2 Re-rodar dry-run do bootstrap

> **Trava:** apenas `--dry-run`. **Sem `--yes` neste passo.**

```bash
node scripts/seo/bootstrap-cluster-plans.mjs --dry-run --limit=10
```

**Esperado:**

- `totalCities` aumenta (3 cidades válidas: Atibaia, Bragança, **São Paulo**).
- Samples incluem:
  - `city_home /cidade/sao-paulo-sp → /carros-em/sao-paulo-sp`
  - `city_below_fipe /cidade/sao-paulo-sp/abaixo-da-fipe → /carros-baratos-em/sao-paulo-sp`
- Nenhum sample contém `sæo-paulo` ou `sæo`.
- `totalErrors=0`.
- `totalToPersist` aumenta para 6 (3 cidades × 2 persistíveis).

### 6.3 Diagnóstico paralelo (descobrir outras cidades com mesmo problema)

```sql
SELECT id, slug, name, state
FROM cities
WHERE slug IS NOT NULL
  AND slug <> ''
  AND slug !~ '^[a-z0-9-]+-[a-z]{2}$'
ORDER BY id;
```

| Resultado | Implicação |
|---|---|
| `0 rows` | São Paulo era um caso isolado. Cleanup completo. |
| `>= 1` | Outras cidades têm slug malformado. Cada uma exige investigação própria — repetir este runbook por linha (cada caso pode ter sua própria nuance: encoding diferente, ausência de UF, slug uppercase, etc.). |

---

## 7. Checklist final de execução

> Operador marca cada item antes de avançar.

- [ ] §2.1 retornou cenário A (1 linha, `id=1`, sem conflito com `sao-paulo-sp`).
- [ ] §2.2 anotado (volume de ads vinculados, `0` ou `>= 1`).
- [ ] §2.3 amostra de ads parece real (sem ads-lixo com encoding ruim).
- [ ] §2.4 confirma se `updated_at` existe — escolher §3.1 ou §3.2.
- [ ] §2.5 retornou `conflitos = 0`.
- [ ] §3 executado dentro de `BEGIN`/`COMMIT` no Render Shell de produção
       (não staging — dado malformado está em prod e ambos têm que ficar
       coerentes; staging também precisa do mesmo fix se o estado do
       banco for replicado).
- [ ] §6.1 confirmou `name='São Paulo'`, `slug='sao-paulo-sp'`.
- [ ] §6.2 dry-run mostrou São Paulo entrando, `totalErrors=0`,
       nenhum `sæo-paulo` em sample.
- [ ] §6.3 confirmou que não há outras cidades quebradas (ou abriu
       runbook próprio se houver).

---

## 8. Travas absolutas

- ❌ **NÃO** rodar o UPDATE sem antes completar §2 (cenário A confirmado).
- ❌ **NÃO** rodar o UPDATE em staging sem ter rodado em prod primeiro
      (ou simultaneamente sob janela controlada). Divergência de slug
      entre ambientes pode mascarar bugs futuros.
- ❌ **NÃO** estender este runbook para corrigir outros municípios.
      Cada caso de slug malformado exige investigação própria.
- ❌ **NÃO** rodar `bootstrap-cluster-plans.mjs --yes` neste runbook.
      A persistência do batch novo (com São Paulo incluído) é decisão
      de outro prompt.
- ❌ **NÃO** alterar layout, frontend, sitemap em código, canonical em
      código, robots, rotas, ranking, planos comerciais, Página
      Regional, RUN_WORKERS, env do Render.

---

## 9. Próximo passo recomendado

> **Tarefa:** Executar §2 (read-only) no Render Shell de produção.
> Reportar:
> - Resultado de §2.1: cenário A, B ou C?
> - Resultado de §2.2: quantos ads em `city_id=1`?
> - Resultado de §2.4: existe `updated_at` em `cities`?
> - Resultado de §2.5: `conflitos = ?`
>
> **Não executar §3 ainda.** A decisão de aplicar o UPDATE será feita
> em prompt seguinte, após §2 confirmar cenário A.
>
> Travas: somente `SELECT`. Sem `UPDATE`, sem `INSERT`, sem `DELETE`,
> sem `--yes` em script algum.
