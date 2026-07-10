# Runbook — LAYER 3 (60–100 km) + validação do filtro de Distância

Objetivo: popular o `layer 3` em `region_memberships` para os stops **25/50/75/100 km**
do filtro de Distância (/comprar) corresponderem a raios reais e distintos, validar, e
comprovar que a **Página Regional (System B) segue intocada em ≤60 km**.

Branch: `feature/painel-filtros-v2`. **Só o passo 3 (`regions:build`) altera dados.**
Todo o resto é **[LEITURA]**.

Placeholders: `{BACKEND_URL}` = base do backend de prod · o `DATABASE_URL` de prod
você exporta no seu shell (não versionar).

---

## 0. Pré-requisitos  [LEITURA]
```bash
git fetch origin && git checkout feature/painel-filtros-v2
export DATABASE_URL='postgres://…PROD…'      # do painel do Render (seu lado)
psql "$DATABASE_URL" -c "select 1;"          # confirma conexão
```
**Ordem OBRIGATÓRIA de deploy (há janela — a query da Regional NÃO tem teto por
distância nem por layer; limita só pelo cap de 30 membros — ver §Como System B limita):**
1. **Mergeie + deploye a branch isolada `fix/regional-layer-guard` PRIMEIRO.** Ela só
   adiciona `AND rm.layer <= 2` em `findMembersFromMemberships`. **É NO-OP hoje** (sem
   linhas de layer 3, não filtra nada → Regional idêntica), seguro de subir sozinha.
2. **Só então** rode o rebuild (passo 3). No instante em que o layer 3 aparece, a
   Regional já o ignora. Sem o guard no ar, a Regional listaria vizinhas 60–100 km.
Para validar com blast radius mínimo, rode o rebuild só de **SP** (passo 3, opção B).

### Como System B limita HOJE (confirmado no código)
`src/modules/regions/regions.service.js` → `findMembersFromMemberships`:
`WHERE base_city_id=$1 AND member_city_id<>$1 ORDER BY layer, distance_km LIMIT 30`.
Ou seja: **cap de 30 membros, SEM `distance_km <= 60` e SEM filtro de layer** — depende
de a tabela só ter layers 1/2. Por isso o guard é necessário (não é inerte). A rota é
interna: `GET {BACKEND_URL}/api/internal/regions/:slug` com header `x-internal-token`.

---

## 1. Backup da tabela (rollback) — ANTES de qualquer escrita  [LEITURA do DB → arquivo]
```bash
pg_dump "$DATABASE_URL" --table=region_memberships --data-only --column-inserts \
  > region_memberships.backup.sql
wc -l region_memberships.backup.sql        # sanity: não vazio
```
Rollback (se necessário) está no passo 8.

---

## 2. Baseline ANTES (mostra a saturação atual: 75 ≡ 100)  [LEITURA]
```sql
-- Contagem por stop hoje (sem layer 3): 75 e 100 devem sair IGUAIS.
SELECT base.slug,
  COUNT(*) FILTER (WHERE rm.distance_km <= 25)  AS km25,
  COUNT(*) FILTER (WHERE rm.distance_km <= 50)  AS km50,
  COUNT(*) FILTER (WHERE rm.distance_km <= 75)  AS km75,
  COUNT(*) FILTER (WHERE rm.distance_km <= 100) AS km100,
  MAX(rm.distance_km) AS max_km
FROM cities base
JOIN region_memberships rm ON rm.base_city_id = base.id
WHERE base.slug IN ('sao-paulo-sp','campinas-sp','atibaia-sp','ribeirao-preto-sp')
  AND rm.member_city_id <> base.id AND rm.distance_km IS NOT NULL
GROUP BY base.slug ORDER BY base.slug;
```
Esperado ANTES: `km75 = km100` e `max_km ≈ 60`.

---

## 3. REBUILD — popular o layer 3   ⚠️ [ESCRITA/REBUILD — ÚNICO PASSO DESTRUTIVO]

**O que faz:** recalcula `region_memberships` (linhas não-self) por Haversine sobre
`cities.lat/long`, agora com layer 3 (60–100 km, cap `REGIONAL_LAYER3_MAX_MEMBERS=40`).
Transação por cidade-base, `ON CONFLICT DO UPDATE`, **idempotente**. A self-row (layer 0)
é preservada. Layers 1/2 (≤60 km) saem idênticos aos de hoje.

**Tempo:** ~poucos minutos (gargalo = I/O do Postgres, ~5570 cidades). Render free-tier
pode derrubar conexão longa — o script já retenta por UF; se falhar, retome com `--uf=`.

**Risco System B:** nenhum se o backend com `layer<=2` já estiver no ar (ver passo 0).

```bash
# A) Nacional:
npm run regions:build

# B) Só SP (validação com blast radius mínimo — recomendado p/ o 1º teste):
node scripts/build-region-memberships.mjs --uf=SP
```
Confira no log a linha por UF: `… X layer 1, Y layer 2, Z layer 3` (Z deve ser > 0).

---

## 4. Validação: contagem por stop (crescente e distinta)  [LEITURA]
```sql
SELECT base.slug,
  COUNT(*) FILTER (WHERE rm.distance_km <= 25)  AS km25,
  COUNT(*) FILTER (WHERE rm.distance_km <= 50)  AS km50,
  COUNT(*) FILTER (WHERE rm.distance_km <= 75)  AS km75,
  COUNT(*) FILTER (WHERE rm.distance_km <= 100) AS km100
FROM cities base
JOIN region_memberships rm ON rm.base_city_id = base.id
WHERE base.slug IN ('sao-paulo-sp','campinas-sp','atibaia-sp','ribeirao-preto-sp')
  AND rm.member_city_id <> base.id AND rm.distance_km IS NOT NULL
GROUP BY base.slug ORDER BY base.slug;
```
✅ Critério: **km25 < km50 < km75 < km100** em cada linha (esperado c/ base nas coords
IBGE reais: SP ~12/30/49/70, Atibaia ~6/29/56/69, Ribeirão ~5/20/43/65).

---

## 5. Latência na faixa nova (layer 3) — EXPLAIN ANALYZE  [LEITURA]
Query REAL do /comprar (`getRadiusMembers`), em 75 e 100 km:
```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT m.slug, m.name, m.state, rm.distance_km
FROM cities base
JOIN region_memberships rm ON rm.base_city_id = base.id
JOIN cities m ON m.id = rm.member_city_id
WHERE base.slug = 'sao-paulo-sp' AND rm.distance_km IS NOT NULL AND rm.distance_km <= 75
ORDER BY rm.distance_km ASC;

EXPLAIN (ANALYZE, BUFFERS)
SELECT m.slug, m.name, m.state, rm.distance_km
FROM cities base
JOIN region_memberships rm ON rm.base_city_id = base.id
JOIN cities m ON m.id = rm.member_city_id
WHERE base.slug = 'sao-paulo-sp' AND rm.distance_km IS NOT NULL AND rm.distance_km <= 100
ORDER BY rm.distance_km ASC;
```
✅ Critério: `Execution Time` de poucos ms (o resultado é bounded: ≤ 12+18+40 = 70 linhas
por base, lookup por `base_city_id` indexado). **Se estourar (ex. >100ms) me traga o
plano — reavaliamos o stop de 100 / o cap.**

---

## 6. System B (Página Regional) intocado em ≤60 km  [LEITURA]
```sql
-- (a) COM o guard do backend novo (layer<=2) — o que a Regional realmente serve:
SELECT rm.layer, COUNT(*) AS n, MAX(rm.distance_km) AS max_km
FROM cities base JOIN region_memberships rm ON rm.base_city_id = base.id
WHERE base.slug = 'sao-paulo-sp' AND rm.member_city_id <> base.id AND rm.layer <= 2
GROUP BY rm.layer ORDER BY rm.layer;
-- ✅ só layer 1 e 2, MAX(max_km) <= 60. NENHUM layer 3.

-- (b) SEM o guard — prova que o layer 3 (60-100) existe e é o que o guard isola:
SELECT rm.layer, COUNT(*) AS n, MIN(rm.distance_km) AS min_km, MAX(rm.distance_km) AS max_km
FROM cities base JOIN region_memberships rm ON rm.base_city_id = base.id
WHERE base.slug = 'sao-paulo-sp' AND rm.member_city_id <> base.id
GROUP BY rm.layer ORDER BY rm.layer;
-- ✅ mostra layer 3 com min≈60 / max≈100 — a banda que a Regional deliberadamente ignora.
```

### 6(c) SERVIDO — diff da Página Regional real ANTES × DEPOIS  [LEITURA] ⭐
O SQL acima prova que os *dados* permitem o isolamento; este passo prova que o *código*
servido aplica o guard. Requer o guard já deployado (passo 0) e o header interno.
```bash
export INTERNAL_TOKEN='…'   # = INTERNAL_API_TOKEN do backend de prod
fetch_members () {  # $1 = slug da cidade-âncora
  curl -s -H "x-internal-token: $INTERNAL_TOKEN" \
    "{BACKEND_URL}/api/internal/regions/$1" \
   | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);const m=j.data?.members||[];console.log(m.map(x=>x.slug).sort().join("\n"));process.stderr.write("max_km="+Math.max(0,...m.map(x=>Number(x.distance_km)||0))+"\n")})'
}
# 1) ANTES do rebuild (guard já no ar):
for s in sao-paulo-sp campinas-sp atibaia-sp; do fetch_members "$s" > "regB.$s.antes"; done
# 2) … rode o passo 3 (rebuild) …
# 3) invalide o cache Redis (TTL 5 min) — senão a resposta vem cacheada:
#    redis-cli --scan --pattern 'internal:regions*' | xargs -r redis-cli del   # (ou espere 5 min)
# 4) DEPOIS do rebuild:
for s in sao-paulo-sp campinas-sp atibaia-sp; do fetch_members "$s" > "regB.$s.depois"; done
# 5) DIFF — critério: VAZIO (lista de vizinhas idêntica) em cada cidade:
for s in sao-paulo-sp campinas-sp atibaia-sp; do
  echo "== $s =="; diff "regB.$s.antes" "regB.$s.depois" && echo "IDÊNTICO ✅"
done
```
✅ Critério: `diff` vazio (lista de slugs idêntica) nas 3 cidades, e o `max_km=` impresso
no stderr ≤ 60 antes e depois. Isso comprova que a Regional SERVIDA aplica o `layer<=2`.

---

## 7. Captura HTTP viva — 4 stops distintos + default 50 km  [LEITURA]
Rode numa janela SEM rate-limit (429). Substitua `{BACKEND_URL}`.
```bash
# 4 stops: members deve crescer 25<50<75<100
for KM in 25 50 75 100; do
  printf "== km=%s == " "$KM"
  curl -s "{BACKEND_URL}/api/public/cities/sao-paulo-sp/radius?km=$KM" \
   | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log("radiusKm="+j.data?.radiusKm,"members="+(j.data?.members?.length))})'
done

# Carga SEM parâmetros → backend resolve 50 km (com RAIO_PADRAO_KM=50 no Render):
curl -s "{BACKEND_URL}/api/public/cities/sao-paulo-sp/radius" \
 | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log("default radiusKm="+j.data?.radiusKm)})'
```
✅ Critério: `members` estritamente crescente nos 4 stops; `default radiusKm = 50`.
(Ponta a ponta na página: abrir `{BACKEND_URL}`-frontend `/carros-em/sao-paulo-sp` sem
`?raio` → o SSR emite `?km=50` ao backend.)

---

## 8. Rollback (se algo sair errado)  [ESCRITA]
```bash
# Opção 1 — rebuild "sem layer 3" (teto volta a 60): remove as linhas 60-100.
REGIONAL_LAYER3_MAX_KM=60 node scripts/build-region-memberships.mjs   # +--uf=SP se aplicável

# Opção 2 — restaurar o backup do passo 1:
psql "$DATABASE_URL" -c "DELETE FROM region_memberships WHERE layer <> 0;"
psql "$DATABASE_URL" -f region_memberships.backup.sql
```
> **Env de rollback CONFIRMADA (lida pelo script):** `build-region-memberships.mjs` faz
> `const LAYER_3_MAX_KM = parseInt(process.env.REGIONAL_LAYER3_MAX_KM ?? "100") || 100`, e
> `classifyLayer` retorna 3 só p/ `60 < d <= LAYER_3_MAX_KM`. Verificado localmente: com
> `REGIONAL_LAYER3_MAX_KM=60`, Campinas (~90 km) sai do resultado e **nenhuma linha de
> layer 3 é gerada** (banda 60–60 = vazia) → o rebuild efetivamente remove o layer 3.

---

## Checklist p/ me devolver (eu interpreto e valido antes do merge)
- [ ] Passo 4: km25<km50<km75<km100 em todas as cidades.
- [ ] Passo 5: Execution Time (75 e 100 km) dentro do aceitável.
- [ ] Passo 6(a)+(b): System B só layer 1/2 (max ≤ 60 km); layer 3 existe nos dados (60–100).
- [ ] **Passo 6(c) SERVIDO: `diff` da Regional ANTES×DEPOIS vazio nas 3 cidades (max_km ≤ 60).**
- [ ] Passo 7: members crescente nos 4 stops + default radiusKm=50.
