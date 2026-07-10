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
**Ordem ideal de deploy:** publique o **backend desta branch (com o guard `layer<=2`)
ANTES** de rodar o rebuild — assim a Página Regional já ignora o layer 3 no instante em
que os dados aparecem. Se rodar o rebuild com o backend antigo (main) ainda no ar, há
uma **janela** em que a Regional listaria vizinhas 60–100 km até você mergear/deployar.
Para validar com blast radius mínimo, rode o rebuild só de **SP** (passo 3, opção B).

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

---

## Checklist p/ me devolver (eu interpreto e valido antes do merge)
- [ ] Passo 4: km25<km50<km75<km100 em todas as cidades.
- [ ] Passo 5: Execution Time (75 e 100 km) dentro do aceitável.
- [ ] Passo 6(a): System B só layer 1/2, max ≤ 60 km.
- [ ] Passo 7: members crescente nos 4 stops + default radiusKm=50.
