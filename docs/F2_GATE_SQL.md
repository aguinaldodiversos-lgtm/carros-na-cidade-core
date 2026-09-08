# F2 — Gate de interpretação (R10 + instrução B)

**Nenhuma linha de código de F2 foi escrita.** Este documento existe para ser reprovado ou aprovado (“SQL OK”) antes disso.

Base: `origin/main @ a1532f4b`. Dados: snapshot de produção (`localhost:5434`), já com o rebuild da F1 e o backfill aplicados — 34 anúncios ativos (Atibaia 33, Bragança 1), `region_memberships` com 696.746 linhas.

---

## 1. R10 — o que vou tocar (10 linhas)

1. **Novos** — `src/modules/ads/search-policy/`: `candidate-scope.js`, `location-resolver.js`, `intent-resolver.js`, `scope-resolver.js`, `relaxations.js`, `facets-policy.js`, `policy-cache.js`, `search-context.js` (montagem do contexto + flag).
2. **Novo** — `src/modules/ads/search-policy/telemetry.js`: evento `search.executed` (§4.8) gravado em `analytics_events`.
3. **Alterado, sempre atrás da flag** — `src/modules/ads/filters/ads-filter.builder.js`: quando `SEARCH_POLICY_ENGINE` ≠ `off` e a origem está na allowlist, o WHERE de produto/território passa a vir de `buildCandidateScope`; caminho atual intocado com `off`.
4. **Alterado, atrás da flag** — `ads-filter.sort.js` e `ads-ranking.sql.js`: `sort=relevance` ganha a ordenação da §4.5 (peso comercial → distância → text_rank → recência → id). Demais `sort` intocados.
5. **Alterado, atrás da flag** — `ads-filter.facets.js`: facetas de veículo passam a usar o CandidateScope; faceta “Modelo” agrega `commercial_model`; self-excluding por faceta ativa.
6. **Alterado, atrás da flag** — `src/modules/ads/ads.routes.js` e o controller de `/api/ads/search`: allowlist de `origem`, `raio`, `escopo`, `origem_src`; resposta ganha `search_policy`, `chips`, `facets`, `relaxations`, `items[].explain` (§6).
7. **Alterado, atrás da flag** — `src/modules/regions/regions.service.js` (guard `rm.layer <= 2`) e `frontend/lib/buy/region-catalog-loader.ts` (re-sort em JS pós-paginação): removidos **apenas** no caminho v1.
8. **Alterado** — `src/modules/ads/ads.mutation-cache.js`: acrescenta os prefixos novos à invalidação já existente.
9. **Novos testes** — `tests/search-policy/`: paridade (8.1), ScopeResolver (8.3), ranking (8.4), LocationResolver (8.5), facetas (8.6), relaxações (8.7), flag/shadow (8.8), invariantes (8.10). Mais o cherry-pick único da fixture `ads-ranking-base-city-boost` de `wip/pre-f0-worktree`.
10. **NÃO vou tocar** — `middleware.ts` e `lib/middleware/*`, `shouldIndexLocalSeo`, canonical, sitemaps, H1, layout, shell 1600, gaveta mobile, header, pagamentos, `cache.middleware.js`, `ads.model`, `region-memberships.builder.js`, os guards `layer <= 3` da F1, e todo o `frontend/` de render (F3).

---

## 2. Contexto 1 — `/carros-em/braganca-paulista-sp`, BROWSE_CITY, sem filtros

### 2.1 Resolução

| Etapa            | Resultado                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------ |
| LocationResolver | origem `braganca-paulista-sp`, `location_source = CITY_PAGE`                               |
| IntentResolver   | nenhuma dimensão → `BROWSE_CITY`, `specificity = 0`, `target = 20`, `max_auto_radius = 75` |
| ScopeResolver    | sem `raio=` → `AUTO_RADIUS`                                                                |
| productScope     | vazio (só status + guard de anúncio sujo)                                                  |

### 2.2 Query 4 — liquidez (roda primeiro; define o território)

```sql
SELECT c.id, c.slug, c.name, c.state, rm.distance_km,
       COALESCE(cnt.n, 0) AS matching_ads
FROM region_memberships rm
JOIN cities c ON c.id = rm.member_city_id
LEFT JOIN (
  SELECT a.city_id, COUNT(*)::int AS n
  FROM ads a
  LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
  WHERE a.status = 'active'
    AND <DIRTY_TEST_AD_GUARD_SQL>
    AND a.city_id IN (
      SELECT member_city_id FROM region_memberships
      WHERE base_city_id = $1 AND distance_km <= $2
    )
  GROUP BY a.city_id
) cnt ON cnt.city_id = c.id
WHERE rm.base_city_id = $1 AND rm.distance_km <= $2
ORDER BY rm.distance_km ASC, c.slug ASC;
-- $1 = 4800 (braganca-paulista-sp)   $2 = 75
```

Resultado real (só as linhas com estoque; 82 cidades no total até 75 km):

| slug                 | distance_km | matching_ads | acumulado   |
| -------------------- | ----------- | ------------ | ----------- |
| braganca-paulista-sp | 0.00        | 1            | 1           |
| atibaia-sp           | 18.34       | 33           | **34 ≥ 20** |

`required_distance_km = 18.34` · `effective_radius_km = 25` (menor anel de `rings_auto` ≥ 18,34 e ≤ 75) · `expanded = true` · `reason = LOW_LOCAL_LIQUIDITY`.

Território resultante (`distance_km <= 25`): **8 slugs** — `braganca-paulista-sp`, `vargem-sp`, `atibaia-sp`, `pinhalzinho-sp`, `pedra-bela-sp`, `tuiuti-sp`, `bom-jesus-dos-perdoes-sp`, `piracaia-sp`.

Cache: `sp:liq:4800:BROWSE_CITY:<sha1(productScope)>`, TTL 900 s.

### 2.3 CandidateScope (compartilhado pelas queries 1, 2, 3 e 5)

```sql
WHERE a.status = 'active'
  AND <DIRTY_TEST_AD_GUARD_SQL>
  AND c.slug = ANY($1)
-- $1 = ['braganca-paulista-sp','vargem-sp','atibaia-sp','pinhalzinho-sp',
--       'pedra-bela-sp','tuiuti-sp','bom-jesus-dos-perdoes-sp','piracaia-sp']
```

### 2.4 Query 1 — grid

```sql
SELECT
  a.*, c.slug AS city_slug,
  adv.name AS seller_name, adv.company_name AS dealership_name, adv.id AS dealership_id,
  u.document_type AS account_type,
  COALESCE(adv.whatsapp, adv.mobile_phone, adv.phone) AS whatsapp_number,
  COALESCE(m.views,0) AS views, COALESCE(m.clicks,0) AS clicks,
  COALESCE(m.leads,0) AS leads, COALESCE(m.ctr,0) AS ctr,
  GREATEST((CASE WHEN a.highlight_until > NOW() THEN 4 ELSE 0 END),
           COALESCE(sp.weight, 1))                      AS priority_tier,
  COALESCE(rm.distance_km, 0)                           AS distance_km,
  a.fipe_diff_percent
FROM ads a
LEFT JOIN cities c              ON c.id  = a.city_id
LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
LEFT JOIN users u               ON u.id  = adv.user_id
LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
LEFT JOIN ad_metrics m          ON m.ad_id = a.id
LEFT JOIN region_memberships rm ON rm.base_city_id = $2 AND rm.member_city_id = a.city_id
WHERE a.status = 'active'
  AND <DIRTY_TEST_AD_GUARD_SQL>
  AND c.slug = ANY($1)
ORDER BY
  GREATEST((CASE WHEN a.highlight_until > NOW() THEN 4 ELSE 0 END),
           COALESCE(sp.weight, 1)) DESC,
  COALESCE(rm.distance_km, 0) ASC,
  a.created_at DESC,
  a.id ASC
LIMIT $3 OFFSET $4;
-- $1 = <os 8 slugs>   $2 = 4800   $3 = 50   $4 = 0
```

Sem `q`, o termo `text_rank DESC` **não** entra no ORDER BY (§4.5: “só quando q presente”). `hybrid_score` e `baseCityBoostExpr` saem do `relevance` no v1.

Ordem esperada: os 33 de Atibaia (peso 3,00, Loja Pro) vêm **antes** do único de Bragança (peso 1, PF sem plano), mesmo estando a 18 km. É a §4.5 aplicada — peso comercial é a chave primária, distância é o desempate.

### 2.5 Query 2 — count

```sql
SELECT COUNT(*)::int AS total
FROM ads a
LEFT JOIN cities c              ON c.id  = a.city_id
LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
LEFT JOIN users u               ON u.id  = adv.user_id
LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
WHERE a.status = 'active'
  AND <DIRTY_TEST_AD_GUARD_SQL>
  AND c.slug = ANY($1);
-- $1 = <os 8 slugs>   →  34
```

Os quatro JOINs são obrigatórios mesmo quando o WHERE não os cita: é a regra que já quebrou produção duas vezes (`adv` em 2026-05-24, `u`/`sp` em 2026-07-26).

`local_result_count` é a mesma query com `c.slug = ANY(ARRAY['braganca-paulista-sp'])` → **1**.

### 2.6 Query 3 — facetas

Sem filtro ativo, **nenhuma** faceta é self-excluding: todas usam o CandidateScope completo, numa query por dimensão.

```sql
SELECT a.commercial_model AS value, COUNT(*)::int AS count
FROM ads a
LEFT JOIN cities c ON c.id = a.city_id
LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
LEFT JOIN users u ON u.id = adv.user_id
LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
WHERE a.status = 'active' AND <DIRTY_TEST_AD_GUARD_SQL> AND c.slug = ANY($1)
  AND a.commercial_model IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC, 1 ASC;
```

Mesma forma para `a.brand`, `COALESCE(a.transmission, a.gearbox, a.cambio)`, `a.fuel_type`, `a.body_type`, `sellerKindExpr`, e para preço/ano com `width_bucket`.

Contagens reais no território de 25 km (34 anúncios):

| faceta              | opções (count)                                                                                                   | entropia | aberta? |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| commercial_model    | Onix 6, HB20 4, T-Cross/Pulse/C3/Mobi/Polo/Kwid/HR-V/Fox/Argo 2, Compass/Virtus/Ecosport/Strada/Civic/Renegade 1 | **3,87** | **sim** |
| brand               | Fiat 7, VW 7, GM 6, Hyundai 4, Honda 3, Citroën 2, Jeep 2, Renault 2, Ford 1                                     | **2,92** | **sim** |
| year (buckets de 2) | 2024–25 17, 2016–17 6, 2022–23 4, 2014–15 3, 2026–27 2, 2018–19 1, 2020–21 1                                     | **2,15** | **sim** |
| price (buckets §2)  | 40–60k 6, 60–80k 20, 80–100k 6, 100–150k 2                                                                       | 1,57     | não     |
| transmission        | manual 23, automatico 11                                                                                         | 0,91     | não     |
| seller_kind         | dealer 33, private 1                                                                                             | 0,19     | não     |

`open_max = 3` → abrem `commercial_model`, `brand` e `year`. **Preço fica fechado**, em “Mais filtros”. Ver divergência D6.

### 2.7 Query 5 — relaxações

`total_result_count = 34 ≥ target 20` → **não roda** (§4.7: só abaixo do target). `relaxations: []`.

### 2.8 JSON esperado

```json
"search_policy": {
  "version": "v1", "flag_mode": "v1",
  "profile": "BROWSE_CITY", "specificity": 0,
  "geo_mode": "AUTO_RADIUS",
  "origin_city": { "slug": "braganca-paulista-sp", "name": "Bragança Paulista", "state": "SP" },
  "location_source": "CITY_PAGE",
  "requested_radius_km": null,
  "required_distance_km": 18.34,
  "effective_radius_km": 25,
  "cities": [
    { "slug": "braganca-paulista-sp", "name": "Bragança Paulista", "state": "SP", "distance_km": 0,     "count": 1 },
    { "slug": "vargem-sp",            "name": "Vargem",            "state": "SP", "distance_km": 15.14, "count": 0 },
    { "slug": "atibaia-sp",           "name": "Atibaia",           "state": "SP", "distance_km": 18.34, "count": 33 },
    { "slug": "pinhalzinho-sp",       "name": "Pinhalzinho",       "state": "SP", "distance_km": 19.7,  "count": 0 },
    { "slug": "pedra-bela-sp",        "name": "Pedra Bela",        "state": "SP", "distance_km": 20.59, "count": 0 },
    { "slug": "tuiuti-sp",            "name": "Tuiuti",            "state": "SP", "distance_km": 21.49, "count": 0 },
    { "slug": "bom-jesus-dos-perdoes-sp", "name": "Bom Jesus dos Perdões", "state": "SP", "distance_km": 21.72, "count": 0 },
    { "slug": "piracaia-sp",          "name": "Piracaia",          "state": "SP", "distance_km": 21.73, "count": 0 }
  ],
  "rings": [
    { "radius_km": 0,  "label": "Apenas Bragança Paulista", "count": 1,  "url_params": { "raio": 0 } },
    { "radius_km": 25, "label": "25 km", "count": 34, "url_params": { "raio": 25 }, "auto": true },
    { "radius_km": 50, "label": "50 km", "count": 34, "url_params": { "raio": 50 } },
    { "radius_km": 75, "label": "75 km", "count": 34, "url_params": { "raio": 75 } }
  ],
  "local_result_count": 1,
  "total_result_count": 34,
  "target": 20,
  "expanded": true,
  "reason": "LOW_LOCAL_LIQUIDITY"
},
"chips": [
  { "key": "geo", "label": "Bragança Paulista · 25 km (automático)", "removable": false }
],
"relaxations": []
```

Todas as oito distâncias foram lidas do snapshot, não estimadas.

O anel de 150 km **não** é listado: `max_auto_radius` de BROWSE_CITY é 75. Ver divergência D5.

---

## 3. Contexto 2 — `/comprar?q=onix automático até 75 mil&origem=atibaia-sp`

### 3.1 Resolução

| Etapa            | Resultado                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LocationResolver | `origem=atibaia-sp` na URL → origem `atibaia-sp`. `location_source = USER_SELECTED` (ver divergência D1). O texto **não** move a origem: `"automático"` não casa nenhum `explicit_query_patterns` |
| Product resolver | `commercial_model = "Onix"`, `transmission = "automatico"`, `price_max = 75000`, `q` residual **vazio**                                                                                           |
| IntentResolver   | dimensões {commercial_model, transmission, price_max} → `specificity = 3`; commercial_model sem ano → **`SEARCH_MODEL`**, `target = 12`, `max_auto_radius = 150`                                  |
| ScopeResolver    | sem `raio=` → `AUTO_RADIUS`                                                                                                                                                                       |

### 3.2 productScope (sem território)

```sql
  AND LOWER(a.commercial_model) = LOWER($n)                              -- 'Onix'
  AND COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE $n         -- '%automatico%'
  AND a.price <= $n                                                      -- 75000
```

Igualdade case-insensitive na coluna, não tsvector; `commercial_model IS NULL` fica fora — conforme sua instrução.

### 3.3 Query 4 — liquidez

Mesma forma da §2.2, com `$1 = 4761` (atibaia-sp), `$2 = 150` e o productScope acima dentro da subconsulta.

**Resultado real: nenhuma cidade com `matching_ads > 0`.** Acumulado nunca atinge 12 → `effective_radius_km = 150`, `reason = AUTO_RADIUS_CAP_REACHED`, `required_distance_km = null`.

Território (`distance_km <= 150` a partir de Atibaia): **223 cidades**. Ver divergência D3.

Causa nos dados: os 6 Onix ativos são todos de Atibaia e nenhum satisfaz as três condições —

| id  | câmbio         | preço      | ano  |
| --- | -------------- | ---------- | ---- |
| 84  | manual         | 70.900     | 2025 |
| 93  | manual         | 74.900     | 2025 |
| 100 | manual         | 74.900     | 2025 |
| 109 | manual         | 77.900     | 2025 |
| 85  | manual         | 78.900     | 2025 |
| 99  | **automatico** | **78.900** | 2023 |

O único automático custa 78.900 (acima de 75.000); os três dentro do preço são manuais.

### 3.4 Queries 1 e 2 — grid e count

Idênticas às §2.4/§2.5, com o productScope acrescentado ao WHERE e `$city_slugs` = os 223 slugs. `total_result_count = 0`, `local_result_count = 0`, grid vazio.

### 3.5 Query 3 — facetas (self-excluding)

Três filtros ativos → **três** queries extras, cada uma sem o próprio filtro:

```sql
-- faceta Câmbio: CandidateScope SEM transmission
WHERE a.status='active' AND <guard> AND c.slug = ANY($1)
  AND LOWER(a.commercial_model) = LOWER($2) AND a.price <= $3
GROUP BY COALESCE(a.transmission, a.gearbox, a.cambio);
-- → manual 3, automatico 0 (não emitida: count 0)

-- faceta Preço: CandidateScope SEM price
  AND LOWER(a.commercial_model) = LOWER($2)
  AND COALESCE(a.transmission,a.gearbox,a.cambio,'') ILIKE $3
-- → 1 anúncio no bucket 60–80k

-- faceta Modelo: CandidateScope SEM commercial_model
  AND COALESCE(a.transmission,a.gearbox,a.cambio,'') ILIKE $2 AND a.price <= $3
```

As demais facetas usam o CandidateScope completo e devolvem 0 opções → não são emitidas (§5.1), exceto as que têm filtro ativo, que aparecem para permitir remoção.

### 3.6 Query 5 — relaxações

`total 0 < target 12` → roda. Uma query, agregação condicional sobre o território mais amplo:

```sql
SELECT
  COUNT(*) FILTER (WHERE LOWER(a.commercial_model)=LOWER($2) AND a.price <= $3)                              AS r_transmission,
  COUNT(*) FILTER (WHERE LOWER(a.commercial_model)=LOWER($2)
                     AND COALESCE(a.transmission,a.gearbox,a.cambio,'') ILIKE $4 AND a.price <= $5)          AS r_price_max
FROM ads a
LEFT JOIN cities c ON c.id = a.city_id
LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
WHERE a.status='active' AND <DIRTY_TEST_AD_GUARD_SQL> AND c.slug = ANY($1);
-- $1 = <223 slugs>  $2 = 'Onix'  $3 = 75000  $4 = '%automatico%'  $5 = 87000
```

Resultado real: `r_transmission = 3` (delta **+3**), `r_price_max = 1` (delta **+1**).
`radius`: já em 150 km, o máximo → **não gerada** (§4.7).
Ordem por delta DESC: `[transmission, price_max]`. Cache `sp:relax:<sha1>`, TTL 60 s.

`price_max` relaxado = `ceil(75000 × 1,15 / 1000) × 1000` = **87.000**. Ver divergência D4.

### 3.7 JSON esperado

```json
"search_policy": {
  "version": "v1", "flag_mode": "v1",
  "profile": "SEARCH_MODEL", "specificity": 3,
  "geo_mode": "AUTO_RADIUS",
  "origin_city": { "slug": "atibaia-sp", "name": "Atibaia", "state": "SP" },
  "location_source": "USER_SELECTED",
  "requested_radius_km": null,
  "required_distance_km": null,
  "effective_radius_km": 150,
  "cities": [ "… 223 cidades, todas com count 0 …" ],
  "rings": [
    { "radius_km": 0,   "label": "Apenas Atibaia", "count": 0, "url_params": { "raio": 0 } },
    { "radius_km": 25,  "label": "25 km",  "count": 0, "url_params": { "raio": 25 } },
    { "radius_km": 50,  "label": "50 km",  "count": 0, "url_params": { "raio": 50 } },
    { "radius_km": 75,  "label": "75 km",  "count": 0, "url_params": { "raio": 75 } },
    { "radius_km": 150, "label": "150 km", "count": 0, "url_params": { "raio": 150 }, "auto": true }
  ],
  "local_result_count": 0,
  "total_result_count": 0,
  "target": 12,
  "expanded": true,
  "reason": "AUTO_RADIUS_CAP_REACHED"
},
"chips": [
  { "key": "commercial_model", "label": "Onix",            "remove_params": ["commercial_model"] },
  { "key": "transmission",     "label": "Automático",      "remove_params": ["transmission"] },
  { "key": "price",            "label": "até R$ 75 mil",   "remove_params": ["price_max"] },
  { "key": "geo",              "label": "Atibaia · 150 km (automático)", "removable": true }
],
"relaxations": [
  { "dimension": "transmission", "label": "aceitar câmbio manual",     "delta": 3, "url_params": { "transmission": null } },
  { "dimension": "price_max",    "label": "subir o teto para R$ 87 mil","delta": 1, "url_params": { "price_max": 87000 } }
],
"items": []
```

---

## 4. Divergências e decisões que preciso que você confirme

| #      | Ponto                                                 | O que o prompt diz                                                                    | O que proponho                                                                                    | Por quê                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | `origem=` sem `origem_src`                            | §4.2 define `USER_SELECTED` como “`origem=` … o frontend marca com `origem_src=user`” | Tratar `origem=` sozinho como `USER_SELECTED`                                                     | O parâmetro só existe porque alguém o escolheu; sem isso a URL do seu exemplo não teria origem                                                                                                                                                                                                                                                           |
| **D2** | Correção do parser (§4.2, l.379) e do sinônimo `"at"` | §4.2 manda corrigir `ads-free-query.parser.js`                                        | Corrigir **dentro do caminho v1** (resolver próprio), deixando o parser legado intocado com `off` | Corrigir no parser compartilhado muda o comportamento com a flag `off` e viola R4. Os dois defeitos são reais e verificados: `"onix automático até 75 mil"` resolve hoje para **Icó-CE** (a cidade “Icó” casa como substring de “automáti**co**”), e `"at"` é sinônimo de automático por substring, então **“atibaia” e “fiat” também viram automático** |
| **D3** | Território como `c.slug = ANY($1)`                    | §4.1 é normativo                                                                      | Manter, mas medir: são **223 slugs** para 150 km e **82** para 75 km                              | Alternativa `a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id=$1 AND distance_km<=$2)` evita trafegar o array e usa o índice novo. Se preferir, troco                                                                                                                                                                      |
| **D4** | Degrau de preço                                       | §4.7 dá a fórmula `ceil(price_max × 1,15 / 1000) × 1000`; §8.7 diz “price_max 80000”  | Seguir a **fórmula** → 87.000                                                                     | 75.000 × 1,15 = 86.250 → 87.000. O 80.000 do §8.7 não sai da fórmula                                                                                                                                                                                                                                                                                     |
| **D5** | Quais anéis listar                                    | §6 mostra 0/25/50/75                                                                  | Listar só os anéis `≤ max_auto_radius` do perfil                                                  | BROWSE_CITY (75) → 4 anéis; SEARCH_MODEL (150) → 5. Oferecer 150 km num perfil cujo teto é 75 seria um clique que o motor não honra                                                                                                                                                                                                                      |
| **D6** | Preço fecha em “Mais filtros”                         | §5.2 escolhe as 3 maiores entropias                                                   | Cumprir a regra, mas registro o efeito                                                            | Com o estoque atual, preço (1,57) perde para modelo (3,87), marca (2,92) e ano (2,15). Se preço deve abrir sempre, é regra de produto e eu mudo                                                                                                                                                                                                          |
| **D7** | Query de liquidez                                     | §4.4 dá `LEFT JOIN ads a ON …` inline                                                 | Subconsulta agregada por `city_id`                                                                | O guard de anúncio sujo referencia `adv.name`; inline, o `adv` não está disponível na condição do LEFT JOIN. É o mesmo modo de falha do `countQuery` de 2026-07-26                                                                                                                                                                                       |
| **D8** | Números do §8.7                                       | “transmission delta 5” e “price 80000 delta 1”                                        | Fixar o teste nos valores reais: **transmission +3**, **price_max 87000 +1**                      | Medido no snapshot. Os 6 Onix estão listados na §3.3                                                                                                                                                                                                                                                                                                     |

---

## 5. Cache (instrução A) — desenho, sem código

`src/modules/ads/search-policy/policy-cache.js`, sem tocar em `cache.middleware.js` e sem dependência nova:

- **Com Redis** (`getRedis()` não-nulo): `GET`/`SET … EX <ttl>`, chaves `sp:liq:*` e `sp:relax:*`.
- **Sem Redis**: LRU em memória do processo, **máximo 500 chaves**, TTL respeitado por carimbo de tempo por entrada (`Map` com reinserção no acesso; expira na leitura e por evicção do mais antigo ao passar de 500). Sem `setInterval` — nada mantém o processo vivo.
- **TTL**: liquidez 900 s, relaxações 60 s (§2).
- **Invalidação**: `ads.mutation-cache.js` já chama `cacheInvalidatePrefix` no ponto de mutação de anúncio; acrescento os dois prefixos ali, e no modo memória a limpeza é por prefixo no `Map`.
- **Nos testes**: LRU em memória (o CI não sobe Redis). **Em produção hoje**: também LRU em memória — `/health` reporta `redis: disabled`, então cada instância mantém seu próprio cache, que se perde a cada deploy. O relatório de F2 declarará isso outra vez, com a medição de §10.

---

## 6. O que falta antes de eu escrever código

1. Seu **“SQL OK”**.
2. Decisão nas oito divergências da §4 (D1–D8).
3. `docs/Search_Policy_Engine_v2_1_Consolidado.md` em `origin/main` — verificado de novo agora, **continua ausente**. Faço a releitura de 5 linhas assim que aparecer; onde conflitar, o prompt vence.
