# EXPLAIN ANALYZE — F2 (snapshot local PG 18.6, 2026-09-08T14:27:30.446Z)

| contexto                | query                                                | planning ms | execution ms | shared hit |
| ----------------------- | ---------------------------------------------------- | ----------: | -----------: | ---------: |
| Bragança · BROWSE_CITY  | 1. liquidez por cidade (D7/E1, $2 = max_auto_radius) |       0.548 |        0.675 |        153 |
| Bragança · BROWSE_CITY  | 2. grid (dataQuery, página 1)                        |       5.066 |        1.547 |        464 |
| Bragança · BROWSE_CITY  | 3. count                                             |       0.316 |        0.056 |         23 |
| Bragança · BROWSE_CITY  | 4. facetas passivas (GROUPING SETS)                  |        0.56 |         0.18 |        159 |
| Bragança · SEARCH_MODEL | 1. liquidez por cidade (D7/E1, $2 = max_auto_radius) |       0.715 |        0.973 |        146 |
| Bragança · SEARCH_MODEL | 2. grid (dataQuery, página 1)                        |       1.091 |         0.11 |         19 |
| Bragança · SEARCH_MODEL | 3. count                                             |       0.322 |        0.052 |         19 |
| Bragança · SEARCH_MODEL | 4. facetas passivas (GROUPING SETS)                  |       0.551 |        0.072 |         19 |
| Bragança · SEARCH_MODEL | 5. relaxações (1 query, COUNT FILTER; total=0)       |       0.238 |        0.067 |         27 |
| Atibaia · BROWSE_CITY   | 1. liquidez por cidade (D7/E1, $2 = max_auto_radius) |       0.444 |        0.675 |        153 |
| Atibaia · BROWSE_CITY   | 2. grid (dataQuery, página 1)                        |       1.429 |        0.454 |        443 |
| Atibaia · BROWSE_CITY   | 3. count                                             |       0.258 |        0.037 |         14 |
| Atibaia · BROWSE_CITY   | 4. facetas passivas (GROUPING SETS)                  |       0.528 |         0.18 |        146 |
| Atibaia · SEARCH_MODEL  | 1. liquidez por cidade (D7/E1, $2 = max_auto_radius) |       0.432 |        0.757 |        146 |
| Atibaia · SEARCH_MODEL  | 2. grid (dataQuery, página 1)                        |       0.965 |        0.089 |         19 |
| Atibaia · SEARCH_MODEL  | 3. count                                             |       0.298 |        0.047 |         19 |
| Atibaia · SEARCH_MODEL  | 4. facetas passivas (GROUPING SETS)                  |       0.556 |        0.072 |         19 |
| Atibaia · SEARCH_MODEL  | 5. relaxações (1 query, COUNT FILTER; total=0)       |       0.259 |        0.076 |         27 |

### Bragança · BROWSE_CITY (/carros-em/braganca-paulista-sp)

perfil BROWSE_CITY · specificity 0 · location_source CITY_PAGE · geo_mode AUTO_RADIUS · required 18.34 → effective 25 km · reason LOW_LOCAL_LIQUIDITY · territory_city_count 8 · local 1

#### 1. liquidez por cidade (D7/E1, $2 = max_auto_radius) — planning 0.548 ms · execution 0.675 ms

```sql
SELECT c.id AS city_id, c.slug, rm.distance_km::float AS distance_km,
           COALESCE(cnt.n, 0)::int AS count
    FROM region_memberships rm
    JOIN cities c ON c.id = rm.member_city_id
    LEFT JOIN (
      SELECT a.city_id, COUNT(*)::int AS n
      FROM ads a
      LEFT JOIN cities c2             ON c2.id = a.city_id
      LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
      LEFT JOIN users u               ON u.id  = adv.user_id
      LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
      WHERE a.status = 'active'
        AND a.city_id IN (
          SELECT member_city_id FROM region_memberships
          WHERE base_city_id = $1 AND distance_km <= $2
        )
      GROUP BY a.city_id
    ) cnt ON cnt.city_id = c.id
    WHERE rm.base_city_id = $1 AND rm.distance_km <= $2
    ORDER BY rm.distance_km ASC, c.slug ASC
```

params: `[4800,75]`

```text
Sort  (cost=344.19..344.28 rows=38 width=37) (actual time=0.611..0.616 rows=76.00 loops=1)
  Sort Key: rm.distance_km, c.slug
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=153
  ->  Hash Left Join  (cost=152.64..343.19 rows=38 width=37) (actual time=0.094..0.587 rows=76.00 loops=1)
        Hash Cond: (c.id = cnt.city_id)
        Buffers: shared hit=153
        ->  Hash Join  (cost=74.41..264.77 rows=38 width=25) (actual time=0.041..0.517 rows=76.00 loops=1)
              Hash Cond: (c.id = rm.member_city_id)
              Buffers: shared hit=126
              ->  Seq Scan on cities c  (cost=0.00..175.72 rows=5572 width=19) (actual time=0.005..0.211 rows=5572.00 loops=1)
                    Buffers: shared hit=120
              ->  Hash  (cost=73.93..73.93 rows=38 width=14) (actual time=0.029..0.030 rows=76.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 12kB
                    Buffers: shared hit=6
                    ->  Index Scan using idx_region_memberships_base_dist on region_memberships rm  (cost=0.42..73.93 rows=38 width=14) (actual time=0.008..0.019 rows=76.00 loops=1)
                          Index Cond: ((base_city_id = '4800'::bigint) AND (distance_km <= '75'::numeric))
                          Index Searches: 1
                          Buffers: shared hit=6
        ->  Hash  (cost=78.22..78.22 rows=1 width=8) (actual time=0.047..0.048 rows=2.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 9kB
              Buffers: shared hit=27
              ->  Subquery Scan on cnt  (cost=78.18..78.22 rows=1 width=8) (actual time=0.044..0.046 rows=2.00 loops=1)
                    Buffers: shared hit=27
                    ->  GroupAggregate  (cost=78.18..78.21 rows=1 width=8) (actual time=0.044..0.045 rows=2.00 loops=1)
                          Group Key: a.city_id
                          Buffers: shared hit=27
                          ->  Sort  (cost=78.18..78.19 rows=1 width=4) (actual time=0.039..0.041 rows=34.00 loops=1)
                                Sort Key: a.city_id
                                Sort Method: quicksort  Memory: 25kB
                                Buffers: shared hit=27
                                ->  Nested Loop  (cost=0.43..78.17 rows=1 width=4) (actual time=0.017..0.033 rows=34.00 loops=1)
                                      Buffers: shared hit=27
                                      ->  Seq Scan on ads a  (cost=0.00..19.69 rows=34 width=8) (actual time=0.009..0.015 rows=34.00 loops=1)
                                            Filter: (status = 'active'::text)
                                            Rows Removed by Filter: 21
                                            Buffers: shared hit=19
                                      ->  Memoize  (cost=0.43..8.46 rows=1 width=8) (actual time=0.000..0.000 rows=1.00 loops=34)
                                            Cache Key: a.city_id
                                            Cache Mode: logical
                                            Hits: 32  Misses: 2  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                                            Buffers: shared hit=8
                                            ->  Index Scan using region_memberships_pkey on region_memberships  (cost=0.42..8.45 rows=1 width=8) (actual time=0.004..0.004 rows=1.00 loops=2)
                                                  Index Cond: ((base_city_id = '4800'::bigint) AND (member_city_id = a.city_id))
                                                  Filter: (distance_km <= '75'::numeric)
                                                  Index Searches: 2
                                                  Buffers: shared hit=8
Planning:
  Buffers: shared hit=30
Planning Time: 0.548 ms
Execution Time: 0.675 ms
```

#### 2. grid (dataQuery, página 1) — planning 5.066 ms · execution 1.547 ms

```sql
SELECT
      a.*,
      c.slug AS city_slug,
      c.name AS city_name,
      adv.name         AS seller_name,
      adv.company_name AS dealership_name,
      adv.id           AS dealership_id,
      u.document_type  AS account_type,

  GREATEST(
    (CASE WHEN a.highlight_until > NOW() THEN 4 ELSE 0 END),
    COALESCE(sp.weight, 1)
  )
 AS priority_tier,

  (
    a.below_fipe = true
    AND a.fipe_reference_value IS NOT NULL
    AND a.fipe_reference_value > 0
    AND a.price IS NOT NULL
    AND a.price > 0
    AND a.price <= a.fipe_reference_value * 0.9
  )
 AS opportunity,
      0 AS text_rank,
      COALESCE(rm.distance_km, 0)::float AS distance_km
    FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
    LEFT JOIN region_memberships rm ON rm.base_city_id = $3 AND rm.member_city_id = a.city_id
    WHERE a.status = 'active'
      AND a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id = $1 AND distance_km <= $2)
    ORDER BY
  GREATEST(
    (CASE WHEN a.highlight_until > NOW() THEN 4 ELSE 0 END),
    COALESCE(sp.weight, 1)
  )
 DESC,
      COALESCE(rm.distance_km, 0) ASC,
      a.created_at DESC,
      a.id ASC
    LIMIT $4
    OFFSET $5
```

params: `[4800,25,4800,20,0]`

```text
Limit  (cost=51.38..51.39 rows=1 width=1831) (actual time=1.370..1.374 rows=20.00 loops=1)
  Buffers: shared hit=464 read=2
  ->  Sort  (cost=51.38..51.39 rows=1 width=1831) (actual time=1.368..1.371 rows=20.00 loops=1)
        Sort Key: (GREATEST((CASE WHEN (a.highlight_until > now()) THEN 4 ELSE 0 END)::numeric, COALESCE(sp.weight, '1'::numeric))) DESC, (COALESCE(rm.distance_km, '0'::numeric)), a.created_at DESC, a.id
        Sort Method: quicksort  Memory: 97kB
        Buffers: shared hit=464 read=2
        ->  Nested Loop Left Join  (cost=16.71..51.37 rows=1 width=1831) (actual time=0.443..0.648 rows=34.00 loops=1)
              Buffers: shared hit=461 read=2
              ->  Nested Loop Left Join  (cost=16.29..42.78 rows=1 width=1766) (actual time=0.418..0.570 rows=34.00 loops=1)
                    Buffers: shared hit=325 read=2
                    ->  Nested Loop Left Join  (cost=16.15..42.51 rows=1 width=1772) (actual time=0.068..0.183 rows=34.00 loops=1)
                          Buffers: shared hit=261
                          ->  Nested Loop Left Join  (cost=15.87..36.56 rows=1 width=1744) (actual time=0.060..0.144 rows=34.00 loops=1)
                                Buffers: shared hit=159
                                ->  Hash Join  (cost=15.59..35.36 rows=1 width=1683) (actual time=0.043..0.067 rows=34.00 loops=1)
                                      Hash Cond: (a.city_id = region_memberships.member_city_id)
                                      Buffers: shared hit=23
                                      ->  Seq Scan on ads a  (cost=0.00..19.69 rows=34 width=1683) (actual time=0.018..0.028 rows=34.00 loops=1)
                                            Filter: (status = 'active'::text)
                                            Rows Removed by Filter: 21
                                            Buffers: shared hit=19
                                      ->  Hash  (cost=15.53..15.53 rows=5 width=8) (actual time=0.016..0.016 rows=8.00 loops=1)
                                            Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                            Buffers: shared hit=4
                                            ->  Index Scan using idx_region_memberships_base_dist on region_memberships  (cost=0.42..15.53 rows=5 width=8) (actual time=0.010..0.012 rows=8.00 loops=1)
                                                  Index Cond: ((base_city_id = '4800'::bigint) AND (distance_km <= '25'::numeric))
                                                  Index Searches: 1
                                                  Buffers: shared hit=4
                                ->  Nested Loop Left Join  (cost=0.28..1.18 rows=1 width=61) (actual time=0.002..0.002 rows=1.00 loops=34)
                                      Buffers: shared hit=136
                                      ->  Index Scan using advertisers_pkey on advertisers adv  (cost=0.14..0.63 rows=1 width=43) (actual time=0.001..0.001 rows=1.00 loops=34)
                                            Index Cond: (id = a.advertiser_id)
                                            Index Searches: 34
                                            Buffers: shared hit=68
                                      ->  Index Scan using users_pkey on users u  (cost=0.14..0.55 rows=1 width=26) (actual time=0.001..0.001 rows=1.00 loops=34)
                                            Index Cond: (id = adv.user_id)
                                            Index Searches: 34
                                            Buffers: shared hit=68
                          ->  Index Scan using cities_pkey on cities c  (cost=0.28..5.95 rows=1 width=32) (actual time=0.001..0.001 rows=1.00 loops=34)
                                Index Cond: (id = a.city_id)
                                Index Searches: 34
                                Buffers: shared hit=102
                    ->  Index Scan using subscription_plans_pkey on subscription_plans sp  (cost=0.13..0.25 rows=1 width=44) (actual time=0.011..0.011 rows=0.97 loops=34)
                          Index Cond: (id = u.plan_id)
                          Index Searches: 33
                          Buffers: shared hit=64 read=2
              ->  Index Scan using region_memberships_pkey on region_memberships rm  (cost=0.42..8.45 rows=1 width=14) (actual time=0.001..0.001 rows=1.00 loops=34)
                    Index Cond: ((base_city_id = '4800'::bigint) AND (member_city_id = a.city_id))
                    Index Searches: 34
                    Buffers: shared hit=136
Planning:
  Buffers: shared hit=219 read=13
Planning Time: 5.066 ms
Execution Time: 1.547 ms
```

#### 3. count — planning 0.316 ms · execution 0.056 ms

```sql
SELECT COUNT(*)::int AS total
    FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
    WHERE a.status = 'active'
      AND a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id = $1 AND distance_km <= $2)
```

params: `[4800,25]`

```text
Aggregate  (cost=35.37..35.38 rows=1 width=4) (actual time=0.038..0.039 rows=1.00 loops=1)
  Buffers: shared hit=23
  ->  Hash Join  (cost=15.59..35.36 rows=1 width=0) (actual time=0.025..0.036 rows=34.00 loops=1)
        Hash Cond: (a.city_id = region_memberships.member_city_id)
        Buffers: shared hit=23
        ->  Seq Scan on ads a  (cost=0.00..19.69 rows=34 width=8) (actual time=0.010..0.017 rows=34.00 loops=1)
              Filter: (status = 'active'::text)
              Rows Removed by Filter: 21
              Buffers: shared hit=19
        ->  Hash  (cost=15.53..15.53 rows=5 width=8) (actual time=0.009..0.009 rows=8.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 9kB
              Buffers: shared hit=4
              ->  Index Scan using idx_region_memberships_base_dist on region_memberships  (cost=0.42..15.53 rows=5 width=8) (actual time=0.006..0.007 rows=8.00 loops=1)
                    Index Cond: ((base_city_id = '4800'::bigint) AND (distance_km <= '25'::numeric))
                    Index Searches: 1
                    Buffers: shared hit=4
Planning:
  Buffers: shared hit=16
Planning Time: 0.316 ms
Execution Time: 0.056 ms
```

#### 4. facetas passivas (GROUPING SETS) — planning 0.56 ms · execution 0.18 ms

```sql
SELECT GROUPING(f0) AS g0, GROUPING(f1) AS g1, GROUPING(f2) AS g2, GROUPING(f3) AS g3, GROUPING(f4) AS g4, GROUPING(f5) AS g5, GROUPING(f6) AS g6, GROUPING(f7) AS g7, GROUPING(f8) AS g8, f0, f1, f2, f3, f4, f5, f6, f7, f8, COUNT(*)::int AS count
      FROM (
        SELECT width_bucket(a.price, ARRAY[40000,60000,80000,100000,150000,200000,300000]::numeric[]) AS f0, a.brand AS f1, a.commercial_model AS f2, ((a.year / 2) * 2) AS f3, COALESCE(a.transmission, a.gearbox, a.cambio) AS f4, a.body_type AS f5, a.fuel_type AS f6, width_bucket(a.mileage, ARRAY[20000,50000,80000,120000,200000]::numeric[]) AS f7,
  (CASE
    WHEN adv.id IS NOT NULL AND adv.id > 0 THEN 'dealer'
    WHEN UPPER(COALESCE(u.document_type, '')) = 'CNPJ' THEN 'dealer'
    ELSE 'private'
  END)
 AS f8
        FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
        WHERE a.status = 'active'
      AND a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id = $1 AND distance_km <= $2)
      ) x
      GROUP BY GROUPING SETS ((f0), (f1), (f2), (f3), (f4), (f5), (f6), (f7), (f8))
```

params: `[4800,25]`

```text
HashAggregate  (cost=36.99..37.34 rows=9 width=244) (actual time=0.137..0.145 rows=51.00 loops=1)
  Hash Key: (width_bucket(a.price, '{40000,60000,80000,100000,150000,200000,300000}'::numeric[]))
  Hash Key: a.brand
  Hash Key: a.commercial_model
  Hash Key: (((a.year / 2) * 2))
  Hash Key: (COALESCE(a.transmission, a.gearbox, a.cambio))
  Hash Key: a.body_type
  Hash Key: a.fuel_type
  Hash Key: (width_bucket((a.mileage)::numeric, '{20000,50000,80000,120000,200000}'::numeric[]))
  Hash Key: CASE WHEN ((adv.id IS NOT NULL) AND (adv.id > 0)) THEN 'dealer'::text WHEN (upper(COALESCE(u.document_type, ''::text)) = 'CNPJ'::text) THEN 'dealer'::text ELSE 'private'::text END
  Batches: 1  Memory Usage: 152kB
  Buffers: shared hit=159
  ->  Nested Loop Left Join  (cost=15.87..36.98 rows=1 width=204) (actual time=0.027..0.102 rows=34.00 loops=1)
        Buffers: shared hit=159
        ->  Hash Join  (cost=15.59..35.79 rows=1 width=176) (actual time=0.022..0.048 rows=34.00 loops=1)
              Hash Cond: (a.city_id = region_memberships.member_city_id)
              Buffers: shared hit=23
              ->  Seq Scan on ads a  (cost=0.00..20.11 rows=34 width=180) (actual time=0.012..0.033 rows=34.00 loops=1)
                    Filter: (status = 'active'::text)
                    Rows Removed by Filter: 21
                    Buffers: shared hit=19
              ->  Hash  (cost=15.53..15.53 rows=5 width=8) (actual time=0.008..0.008 rows=8.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=4
                    ->  Index Scan using idx_region_memberships_base_dist on region_memberships  (cost=0.42..15.53 rows=5 width=8) (actual time=0.005..0.006 rows=8.00 loops=1)
                          Index Cond: ((base_city_id = '4800'::bigint) AND (distance_km <= '25'::numeric))
                          Index Searches: 1
                          Buffers: shared hit=4
        ->  Nested Loop Left Join  (cost=0.28..1.18 rows=1 width=8) (actual time=0.001..0.001 rows=1.00 loops=34)
              Buffers: shared hit=136
              ->  Index Scan using advertisers_pkey on advertisers adv  (cost=0.14..0.63 rows=1 width=8) (actual time=0.000..0.001 rows=1.00 loops=34)
                    Index Cond: (id = a.advertiser_id)
                    Index Searches: 34
                    Buffers: shared hit=68
              ->  Index Scan using users_pkey on users u  (cost=0.14..0.55 rows=1 width=26) (actual time=0.000..0.000 rows=1.00 loops=34)
                    Index Cond: (id = adv.user_id)
                    Index Searches: 34
                    Buffers: shared hit=68
Planning:
  Buffers: shared hit=32
Planning Time: 0.560 ms
Execution Time: 0.180 ms
```

#### 5. relaxações — não executada (total 34 ≥ target 20; nenhuma variante)

### Bragança · SEARCH_MODEL (q=onix automático até 75 mil, origem=braganca-paulista-sp)

perfil SEARCH_MODEL · specificity 3 · location_source CITY_PAGE · geo_mode AUTO_RADIUS · required null → effective 150 km · reason AUTO_RADIUS_CAP_REACHED · territory_city_count 235 · local 0

#### 1. liquidez por cidade (D7/E1, $2 = max_auto_radius) — planning 0.715 ms · execution 0.973 ms

```sql
SELECT c.id AS city_id, c.slug, rm.distance_km::float AS distance_km,
           COALESCE(cnt.n, 0)::int AS count
    FROM region_memberships rm
    JOIN cities c ON c.id = rm.member_city_id
    LEFT JOIN (
      SELECT a.city_id, COUNT(*)::int AS n
      FROM ads a
      LEFT JOIN cities c2             ON c2.id = a.city_id
      LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
      LEFT JOIN users u               ON u.id  = adv.user_id
      LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
      WHERE a.status = 'active'
        AND LOWER(a.commercial_model) = LOWER($3)
        AND a.price <= $4
        AND (COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE $5)
        AND a.city_id IN (
          SELECT member_city_id FROM region_memberships
          WHERE base_city_id = $1 AND distance_km <= $2
        )
      GROUP BY a.city_id
    ) cnt ON cnt.city_id = c.id
    WHERE rm.base_city_id = $1 AND rm.distance_km <= $2
    ORDER BY rm.distance_km ASC, c.slug ASC
```

params: `[4800,150,"Onix",75000,"%automatico%"]`

```text
Sort  (cost=459.84..460.16 rows=129 width=37) (actual time=0.915..0.925 rows=235.00 loops=1)
  Sort Key: rm.distance_km, c.slug
  Sort Method: quicksort  Memory: 39kB
  Buffers: shared hit=146
  ->  Hash Left Join  (cost=264.29..455.31 rows=129 width=37) (actual time=0.128..0.797 rows=235.00 loops=1)
        Hash Cond: (c.id = cnt.city_id)
        Buffers: shared hit=146
        ->  Hash Join  (cost=235.43..425.79 rows=129 width=25) (actual time=0.074..0.690 rows=235.00 loops=1)
              Hash Cond: (c.id = rm.member_city_id)
              Buffers: shared hit=127
              ->  Seq Scan on cities c  (cost=0.00..175.72 rows=5572 width=19) (actual time=0.009..0.245 rows=5572.00 loops=1)
                    Buffers: shared hit=120
              ->  Hash  (cost=233.82..233.82 rows=129 width=14) (actual time=0.060..0.060 rows=235.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 20kB
                    Buffers: shared hit=7
                    ->  Index Scan using idx_region_memberships_base_dist on region_memberships rm  (cost=0.42..233.82 rows=129 width=14) (actual time=0.013..0.040 rows=235.00 loops=1)
                          Index Cond: ((base_city_id = '4800'::bigint) AND (distance_km <= '150'::numeric))
                          Index Searches: 1
                          Buffers: shared hit=7
        ->  Hash  (cost=28.85..28.85 rows=1 width=8) (actual time=0.049..0.051 rows=0.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 8kB
              Buffers: shared hit=19
              ->  Subquery Scan on cnt  (cost=28.82..28.85 rows=1 width=8) (actual time=0.049..0.050 rows=0.00 loops=1)
                    Buffers: shared hit=19
                    ->  GroupAggregate  (cost=28.82..28.84 rows=1 width=8) (actual time=0.049..0.049 rows=0.00 loops=1)
                          Group Key: a.city_id
                          Buffers: shared hit=19
                          ->  Sort  (cost=28.82..28.82 rows=1 width=4) (actual time=0.048..0.049 rows=0.00 loops=1)
                                Sort Key: a.city_id
                                Sort Method: quicksort  Memory: 25kB
                                Buffers: shared hit=19
                                ->  Nested Loop  (cost=0.42..28.81 rows=1 width=4) (actual time=0.046..0.047 rows=0.00 loops=1)
                                      Buffers: shared hit=19
                                      ->  Seq Scan on ads a  (cost=0.00..20.24 rows=1 width=8) (actual time=0.046..0.046 rows=0.00 loops=1)
                                            Filter: ((price <= '75000'::numeric) AND (COALESCE(transmission, gearbox, cambio, ''::text) ~~* '%automatico%'::text) AND (status = 'active'::text) AND (lower(commercial_model) = 'onix'::text))
                                            Rows Removed by Filter: 55
                                            Buffers: shared hit=19
                                      ->  Index Scan using region_memberships_pkey on region_memberships  (cost=0.42..8.45 rows=1 width=8) (never executed)
                                            Index Cond: ((base_city_id = '4800'::bigint) AND (member_city_id = a.city_id))
                                            Filter: (distance_km <= '150'::numeric)
                                            Index Searches: 0
Planning:
  Buffers: shared hit=30
Planning Time: 0.715 ms
Execution Time: 0.973 ms
```

#### 2. grid (dataQuery, página 1) — planning 1.091 ms · execution 0.11 ms

```sql
SELECT
      a.*,
      c.slug AS city_slug,
      c.name AS city_name,
      adv.name         AS seller_name,
      adv.company_name AS dealership_name,
      adv.id           AS dealership_id,
      u.document_type  AS account_type,

  GREATEST(
    (CASE WHEN a.highlight_until > NOW() THEN 4 ELSE 0 END),
    COALESCE(sp.weight, 1)
  )
 AS priority_tier,

  (
    a.below_fipe = true
    AND a.fipe_reference_value IS NOT NULL
    AND a.fipe_reference_value > 0
    AND a.price IS NOT NULL
    AND a.price > 0
    AND a.price <= a.fipe_reference_value * 0.9
  )
 AS opportunity,
      0 AS text_rank,
      COALESCE(rm.distance_km, 0)::float AS distance_km
    FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
    LEFT JOIN region_memberships rm ON rm.base_city_id = $6 AND rm.member_city_id = a.city_id
    WHERE a.status = 'active'
      AND a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id = $1 AND distance_km <= $2)
      AND LOWER(a.commercial_model) = LOWER($3)
      AND a.price <= $4
      AND (COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE $5)
    ORDER BY
  GREATEST(
    (CASE WHEN a.highlight_until > NOW() THEN 4 ELSE 0 END),
    COALESCE(sp.weight, 1)
  )
 DESC,
      COALESCE(rm.distance_km, 0) ASC,
      a.created_at DESC,
      a.id ASC
    LIMIT $7
    OFFSET $8
```

params: `[4800,150,"Onix",75000,"%automatico%",4800,20,0]`

```text
Limit  (cost=49.42..49.42 rows=1 width=1831) (actual time=0.051..0.052 rows=0.00 loops=1)
  Buffers: shared hit=19
  ->  Sort  (cost=49.42..49.42 rows=1 width=1831) (actual time=0.050..0.052 rows=0.00 loops=1)
        Sort Key: (GREATEST((CASE WHEN (a.highlight_until > now()) THEN 4 ELSE 0 END)::numeric, COALESCE(sp.weight, '1'::numeric))) DESC, (COALESCE(rm.distance_km, '0'::numeric)), a.created_at DESC, a.id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=19
        ->  Nested Loop  (cost=21.66..49.41 rows=1 width=1831) (actual time=0.047..0.048 rows=0.00 loops=1)
              Buffers: shared hit=19
              ->  Nested Loop Left Join  (cost=21.23..40.81 rows=1 width=1772) (actual time=0.047..0.048 rows=0.00 loops=1)
                    Buffers: shared hit=19
                    ->  Nested Loop Left Join  (cost=20.81..32.25 rows=1 width=1766) (actual time=0.047..0.048 rows=0.00 loops=1)
                          Buffers: shared hit=19
                          ->  Nested Loop Left Join  (cost=20.67..31.97 rows=1 width=1772) (actual time=0.046..0.048 rows=0.00 loops=1)
                                Buffers: shared hit=19
                                ->  Nested Loop Left Join  (cost=20.53..31.42 rows=1 width=1754) (actual time=0.046..0.047 rows=0.00 loops=1)
                                      Buffers: shared hit=19
                                      ->  Hash Right Join  (cost=20.25..23.11 rows=1 width=1726) (actual time=0.046..0.047 rows=0.00 loops=1)
                                            Hash Cond: (adv.id = a.advertiser_id)
                                            Buffers: shared hit=19
                                            ->  Seq Scan on advertisers adv  (cost=0.00..2.62 rows=62 width=43) (never executed)
                                            ->  Hash  (cost=20.24..20.24 rows=1 width=1683) (actual time=0.044..0.045 rows=0.00 loops=1)
                                                  Buckets: 1024  Batches: 1  Memory Usage: 8kB
                                                  Buffers: shared hit=19
                                                  ->  Seq Scan on ads a  (cost=0.00..20.24 rows=1 width=1683) (actual time=0.044..0.044 rows=0.00 loops=1)
                                                        Filter: ((price <= '75000'::numeric) AND (COALESCE(transmission, gearbox, cambio, ''::text) ~~* '%automatico%'::text) AND (status = 'active'::text) AND (lower(commercial_model) = 'onix'::text))
                                                        Rows Removed by Filter: 55
                                                        Buffers: shared hit=19
                                      ->  Index Scan using cities_pkey on cities c  (cost=0.28..8.30 rows=1 width=32) (never executed)
                                            Index Cond: (id = a.city_id)
                                            Index Searches: 0
                                ->  Index Scan using users_pkey on users u  (cost=0.14..0.55 rows=1 width=26) (never executed)
                                      Index Cond: (id = adv.user_id)
                                      Index Searches: 0
                          ->  Index Scan using subscription_plans_pkey on subscription_plans sp  (cost=0.13..0.25 rows=1 width=44) (never executed)
                                Index Cond: (id = u.plan_id)
                                Index Searches: 0
                    ->  Index Scan using region_memberships_pkey on region_memberships rm  (cost=0.42..8.45 rows=1 width=14) (never executed)
                          Index Cond: ((base_city_id = '4800'::bigint) AND (member_city_id = a.city_id))
                          Index Searches: 0
              ->  Index Scan using region_memberships_pkey on region_memberships  (cost=0.42..8.45 rows=1 width=8) (never executed)
                    Index Cond: ((base_city_id = '4800'::bigint) AND (member_city_id = a.city_id))
                    Filter: (distance_km <= '150'::numeric)
                    Index Searches: 0
Planning:
  Buffers: shared hit=55
Planning Time: 1.091 ms
Execution Time: 0.110 ms
```

#### 3. count — planning 0.322 ms · execution 0.052 ms

```sql
SELECT COUNT(*)::int AS total
    FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
    WHERE a.status = 'active'
      AND a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id = $1 AND distance_km <= $2)
      AND LOWER(a.commercial_model) = LOWER($3)
      AND a.price <= $4
      AND (COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE $5)
```

params: `[4800,150,"Onix",75000,"%automatico%"]`

```text
Aggregate  (cost=28.81..28.82 rows=1 width=4) (actual time=0.039..0.039 rows=1.00 loops=1)
  Buffers: shared hit=19
  ->  Nested Loop  (cost=0.42..28.81 rows=1 width=0) (actual time=0.037..0.037 rows=0.00 loops=1)
        Buffers: shared hit=19
        ->  Seq Scan on ads a  (cost=0.00..20.24 rows=1 width=8) (actual time=0.037..0.037 rows=0.00 loops=1)
              Filter: ((price <= '75000'::numeric) AND (COALESCE(transmission, gearbox, cambio, ''::text) ~~* '%automatico%'::text) AND (status = 'active'::text) AND (lower(commercial_model) = 'onix'::text))
              Rows Removed by Filter: 55
              Buffers: shared hit=19
        ->  Index Scan using region_memberships_pkey on region_memberships  (cost=0.42..8.45 rows=1 width=8) (never executed)
              Index Cond: ((base_city_id = '4800'::bigint) AND (member_city_id = a.city_id))
              Filter: (distance_km <= '150'::numeric)
              Index Searches: 0
Planning:
  Buffers: shared hit=16
Planning Time: 0.322 ms
Execution Time: 0.052 ms
```

#### 4. facetas passivas (GROUPING SETS) — planning 0.551 ms · execution 0.072 ms

```sql
SELECT GROUPING(f0) AS g0, GROUPING(f1) AS g1, GROUPING(f2) AS g2, GROUPING(f3) AS g3, GROUPING(f4) AS g4, GROUPING(f5) AS g5, GROUPING(f6) AS g6, GROUPING(f7) AS g7, GROUPING(f8) AS g8, GROUPING(f9) AS g9, f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, COUNT(*)::int AS count
      FROM (
        SELECT width_bucket(a.price, ARRAY[40000,60000,80000,100000,150000,200000,300000]::numeric[]) AS f0, a.brand AS f1, a.commercial_model AS f2, ((a.year / 2) * 2) AS f3, COALESCE(a.transmission, a.gearbox, a.cambio) AS f4, a.body_type AS f5, a.fuel_type AS f6, width_bucket(a.mileage, ARRAY[20000,50000,80000,120000,200000]::numeric[]) AS f7,
  (CASE
    WHEN adv.id IS NOT NULL AND adv.id > 0 THEN 'dealer'
    WHEN UPPER(COALESCE(u.document_type, '')) = 'CNPJ' THEN 'dealer'
    ELSE 'private'
  END)
 AS f8, a.model AS f9
        FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
        WHERE a.status = 'active'
      AND a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id = $1 AND distance_km <= $2)
      AND LOWER(a.commercial_model) = LOWER($3)
      AND a.price <= $4
      AND (COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE $5)
      ) x
      GROUP BY GROUPING SETS ((f0), (f1), (f2), (f3), (f4), (f5), (f6), (f7), (f8), (f9))
```

params: `[4800,150,"Onix",75000,"%automatico%"]`

```text
HashAggregate  (cost=32.25..32.67 rows=10 width=280) (actual time=0.037..0.038 rows=0.00 loops=1)
  Hash Key: (width_bucket(a.price, '{40000,60000,80000,100000,150000,200000,300000}'::numeric[]))
  Hash Key: a.brand
  Hash Key: a.commercial_model
  Hash Key: (((a.year / 2) * 2))
  Hash Key: (COALESCE(a.transmission, a.gearbox, a.cambio))
  Hash Key: a.body_type
  Hash Key: a.fuel_type
  Hash Key: (width_bucket((a.mileage)::numeric, '{20000,50000,80000,120000,200000}'::numeric[]))
  Hash Key: CASE WHEN ((adv.id IS NOT NULL) AND (adv.id > 0)) THEN 'dealer'::text WHEN (upper(COALESCE(u.document_type, ''::text)) = 'CNPJ'::text) THEN 'dealer'::text ELSE 'private'::text END
  Hash Key: a.model
  Batches: 1  Memory Usage: 160kB
  Buffers: shared hit=19
  ->  Nested Loop Left Join  (cost=20.83..32.25 rows=1 width=236) (actual time=0.036..0.037 rows=0.00 loops=1)
        Buffers: shared hit=19
        ->  Nested Loop  (cost=20.69..31.70 rows=1 width=212) (actual time=0.036..0.037 rows=0.00 loops=1)
              Buffers: shared hit=19
              ->  Hash Right Join  (cost=20.26..23.12 rows=1 width=216) (actual time=0.036..0.036 rows=0.00 loops=1)
                    Hash Cond: (adv.id = a.advertiser_id)
                    Buffers: shared hit=19
                    ->  Seq Scan on advertisers adv  (cost=0.00..2.62 rows=62 width=8) (never executed)
                    ->  Hash  (cost=20.25..20.25 rows=1 width=212) (actual time=0.035..0.035 rows=0.00 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 8kB
                          Buffers: shared hit=19
                          ->  Seq Scan on ads a  (cost=0.00..20.25 rows=1 width=212) (actual time=0.034..0.034 rows=0.00 loops=1)
                                Filter: ((price <= '75000'::numeric) AND (COALESCE(transmission, gearbox, cambio, ''::text) ~~* '%automatico%'::text) AND (status = 'active'::text) AND (lower(commercial_model) = 'onix'::text))
                                Rows Removed by Filter: 55
                                Buffers: shared hit=19
              ->  Index Scan using region_memberships_pkey on region_memberships  (cost=0.42..8.45 rows=1 width=8) (never executed)
                    Index Cond: ((base_city_id = '4800'::bigint) AND (member_city_id = a.city_id))
                    Filter: (distance_km <= '150'::numeric)
                    Index Searches: 0
        ->  Index Scan using users_pkey on users u  (cost=0.14..0.55 rows=1 width=26) (never executed)
              Index Cond: (id = adv.user_id)
              Index Searches: 0
Planning:
  Buffers: shared hit=32
Planning Time: 0.551 ms
Execution Time: 0.072 ms
```

#### 5. relaxações (1 query, COUNT FILTER; total=0) — planning 0.238 ms · execution 0.067 ms

```sql
SELECT COUNT(*) FILTER (WHERE rm.distance_km <= $3 AND LOWER(a.commercial_model) = LOWER($4) AND a.price <= $5 AND (COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE $6))::int AS v0,
           COUNT(*) FILTER (WHERE rm.distance_km <= $7 AND LOWER(a.commercial_model) = LOWER($8) AND a.price <= $9)::int AS v1
    FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
    JOIN region_memberships rm ON rm.base_city_id = $1 AND rm.member_city_id = a.city_id
    WHERE a.status = 'active'
      AND rm.distance_km <= $2
```

params: `[4800,150,150,"Onix",87000,"%automatico%",150,"Onix",75000]`

```text
Aggregate  (cost=78.20..78.22 rows=1 width=8) (actual time=0.051..0.051 rows=1.00 loops=1)
  Buffers: shared hit=27
  ->  Nested Loop  (cost=0.43..78.17 rows=1 width=90) (actual time=0.014..0.033 rows=34.00 loops=1)
        Buffers: shared hit=27
        ->  Seq Scan on ads a  (cost=0.00..19.69 rows=34 width=92) (actual time=0.006..0.012 rows=34.00 loops=1)
              Filter: (status = 'active'::text)
              Rows Removed by Filter: 21
              Buffers: shared hit=19
        ->  Memoize  (cost=0.43..8.46 rows=1 width=14) (actual time=0.000..0.000 rows=1.00 loops=34)
              Cache Key: a.city_id
              Cache Mode: logical
              Hits: 32  Misses: 2  Evictions: 0  Overflows: 0  Memory Usage: 1kB
              Buffers: shared hit=8
              ->  Index Scan using region_memberships_pkey on region_memberships rm  (cost=0.42..8.45 rows=1 width=14) (actual time=0.003..0.003 rows=1.00 loops=2)
                    Index Cond: ((base_city_id = '4800'::bigint) AND (member_city_id = a.city_id))
                    Filter: (distance_km <= '150'::numeric)
                    Index Searches: 2
                    Buffers: shared hit=8
Planning:
  Buffers: shared hit=16
Planning Time: 0.238 ms
Execution Time: 0.067 ms
```

### Atibaia · BROWSE_CITY (/carros-em/atibaia-sp)

perfil BROWSE_CITY · specificity 0 · location_source CITY_PAGE · geo_mode AUTO_RADIUS · required 0 → effective 0 km · reason LOCAL_LIQUIDITY_OK · territory_city_count 1 · local 33

#### 1. liquidez por cidade (D7/E1, $2 = max_auto_radius) — planning 0.444 ms · execution 0.675 ms

```sql
SELECT c.id AS city_id, c.slug, rm.distance_km::float AS distance_km,
           COALESCE(cnt.n, 0)::int AS count
    FROM region_memberships rm
    JOIN cities c ON c.id = rm.member_city_id
    LEFT JOIN (
      SELECT a.city_id, COUNT(*)::int AS n
      FROM ads a
      LEFT JOIN cities c2             ON c2.id = a.city_id
      LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
      LEFT JOIN users u               ON u.id  = adv.user_id
      LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
      WHERE a.status = 'active'
        AND a.city_id IN (
          SELECT member_city_id FROM region_memberships
          WHERE base_city_id = $1 AND distance_km <= $2
        )
      GROUP BY a.city_id
    ) cnt ON cnt.city_id = c.id
    WHERE rm.base_city_id = $1 AND rm.distance_km <= $2
    ORDER BY rm.distance_km ASC, c.slug ASC
```

params: `[4761,75]`

```text
Sort  (cost=344.19..344.28 rows=38 width=37) (actual time=0.638..0.643 rows=82.00 loops=1)
  Sort Key: rm.distance_km, c.slug
  Sort Method: quicksort  Memory: 29kB
  Buffers: shared hit=153
  ->  Hash Left Join  (cost=152.64..343.19 rows=38 width=37) (actual time=0.069..0.621 rows=82.00 loops=1)
        Hash Cond: (c.id = cnt.city_id)
        Buffers: shared hit=153
        ->  Hash Join  (cost=74.41..264.77 rows=38 width=25) (actual time=0.029..0.561 rows=82.00 loops=1)
              Hash Cond: (c.id = rm.member_city_id)
              Buffers: shared hit=126
              ->  Seq Scan on cities c  (cost=0.00..175.72 rows=5572 width=19) (actual time=0.003..0.212 rows=5572.00 loops=1)
                    Buffers: shared hit=120
              ->  Hash  (cost=73.93..73.93 rows=38 width=14) (actual time=0.023..0.024 rows=82.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 12kB
                    Buffers: shared hit=6
                    ->  Index Scan using idx_region_memberships_base_dist on region_memberships rm  (cost=0.42..73.93 rows=38 width=14) (actual time=0.007..0.016 rows=82.00 loops=1)
                          Index Cond: ((base_city_id = '4761'::bigint) AND (distance_km <= '75'::numeric))
                          Index Searches: 1
                          Buffers: shared hit=6
        ->  Hash  (cost=78.22..78.22 rows=1 width=8) (actual time=0.037..0.038 rows=2.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 9kB
              Buffers: shared hit=27
              ->  Subquery Scan on cnt  (cost=78.18..78.22 rows=1 width=8) (actual time=0.036..0.038 rows=2.00 loops=1)
                    Buffers: shared hit=27
                    ->  GroupAggregate  (cost=78.18..78.21 rows=1 width=8) (actual time=0.036..0.037 rows=2.00 loops=1)
                          Group Key: a.city_id
                          Buffers: shared hit=27
                          ->  Sort  (cost=78.18..78.19 rows=1 width=4) (actual time=0.031..0.033 rows=34.00 loops=1)
                                Sort Key: a.city_id
                                Sort Method: quicksort  Memory: 25kB
                                Buffers: shared hit=27
                                ->  Nested Loop  (cost=0.43..78.17 rows=1 width=4) (actual time=0.013..0.029 rows=34.00 loops=1)
                                      Buffers: shared hit=27
                                      ->  Seq Scan on ads a  (cost=0.00..19.69 rows=34 width=8) (actual time=0.007..0.014 rows=34.00 loops=1)
                                            Filter: (status = 'active'::text)
                                            Rows Removed by Filter: 21
                                            Buffers: shared hit=19
                                      ->  Memoize  (cost=0.43..8.46 rows=1 width=8) (actual time=0.000..0.000 rows=1.00 loops=34)
                                            Cache Key: a.city_id
                                            Cache Mode: logical
                                            Hits: 32  Misses: 2  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                                            Buffers: shared hit=8
                                            ->  Index Scan using region_memberships_pkey on region_memberships  (cost=0.42..8.45 rows=1 width=8) (actual time=0.003..0.003 rows=1.00 loops=2)
                                                  Index Cond: ((base_city_id = '4761'::bigint) AND (member_city_id = a.city_id))
                                                  Filter: (distance_km <= '75'::numeric)
                                                  Index Searches: 2
                                                  Buffers: shared hit=8
Planning:
  Buffers: shared hit=30
Planning Time: 0.444 ms
Execution Time: 0.675 ms
```

#### 2. grid (dataQuery, página 1) — planning 1.429 ms · execution 0.454 ms

```sql
SELECT
      a.*,
      c.slug AS city_slug,
      c.name AS city_name,
      adv.name         AS seller_name,
      adv.company_name AS dealership_name,
      adv.id           AS dealership_id,
      u.document_type  AS account_type,

  GREATEST(
    (CASE WHEN a.highlight_until > NOW() THEN 4 ELSE 0 END),
    COALESCE(sp.weight, 1)
  )
 AS priority_tier,

  (
    a.below_fipe = true
    AND a.fipe_reference_value IS NOT NULL
    AND a.fipe_reference_value > 0
    AND a.price IS NOT NULL
    AND a.price > 0
    AND a.price <= a.fipe_reference_value * 0.9
  )
 AS opportunity,
      0 AS text_rank,
      COALESCE(rm.distance_km, 0)::float AS distance_km
    FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
    LEFT JOIN region_memberships rm ON rm.base_city_id = $3 AND rm.member_city_id = a.city_id
    WHERE a.status = 'active'
      AND a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id = $1 AND distance_km <= $2)
    ORDER BY
  GREATEST(
    (CASE WHEN a.highlight_until > NOW() THEN 4 ELSE 0 END),
    COALESCE(sp.weight, 1)
  )
 DESC,
      COALESCE(rm.distance_km, 0) ASC,
      a.created_at DESC,
      a.id ASC
    LIMIT $4
    OFFSET $5
```

params: `[4761,0,4761,20,0]`

```text
Limit  (cost=41.08..41.09 rows=1 width=1831) (actual time=0.365..0.368 rows=20.00 loops=1)
  Buffers: shared hit=443
  ->  Sort  (cost=41.08..41.09 rows=1 width=1831) (actual time=0.364..0.366 rows=20.00 loops=1)
        Sort Key: (GREATEST((CASE WHEN (a.highlight_until > now()) THEN 4 ELSE 0 END)::numeric, COALESCE(sp.weight, '1'::numeric))) DESC, (COALESCE(rm.distance_km, '0'::numeric)), a.created_at DESC, a.id
        Sort Method: quicksort  Memory: 95kB
        Buffers: shared hit=443
        ->  Nested Loop Left Join  (cost=5.74..41.07 rows=1 width=1831) (actual time=0.058..0.239 rows=33.00 loops=1)
              Buffers: shared hit=443
              ->  Nested Loop Left Join  (cost=5.31..32.48 rows=1 width=1766) (actual time=0.047..0.182 rows=33.00 loops=1)
                    Buffers: shared hit=311
                    ->  Nested Loop Left Join  (cost=5.18..32.21 rows=1 width=1772) (actual time=0.038..0.138 rows=33.00 loops=1)
                          Buffers: shared hit=245
                          ->  Nested Loop Left Join  (cost=4.90..26.26 rows=1 width=1744) (actual time=0.033..0.105 rows=33.00 loops=1)
                                Buffers: shared hit=146
                                ->  Nested Loop  (cost=4.62..25.07 rows=1 width=1683) (actual time=0.024..0.042 rows=33.00 loops=1)
                                      Buffers: shared hit=14
                                      ->  Index Scan using idx_region_memberships_base_dist on region_memberships  (cost=0.42..8.45 rows=1 width=8) (actual time=0.008..0.009 rows=1.00 loops=1)
                                            Index Cond: ((base_city_id = '4761'::bigint) AND (distance_km <= '0'::numeric))
                                            Index Searches: 1
                                            Buffers: shared hit=4
                                      ->  Bitmap Heap Scan on ads a  (cost=4.19..16.57 rows=5 width=1683) (actual time=0.013..0.019 rows=33.00 loops=1)
                                            Recheck Cond: ((city_id = region_memberships.member_city_id) AND (status = 'active'::text))
                                            Heap Blocks: exact=9
                                            Buffers: shared hit=10
                                            ->  Bitmap Index Scan on idx_ads_city_id_status  (cost=0.00..4.19 rows=5 width=0) (actual time=0.007..0.008 rows=33.00 loops=1)
                                                  Index Cond: ((city_id = region_memberships.member_city_id) AND (status = 'active'::text))
                                                  Index Searches: 1
                                                  Buffers: shared hit=1
                                ->  Nested Loop Left Join  (cost=0.28..1.18 rows=1 width=61) (actual time=0.001..0.002 rows=1.00 loops=33)
                                      Buffers: shared hit=132
                                      ->  Index Scan using advertisers_pkey on advertisers adv  (cost=0.14..0.63 rows=1 width=43) (actual time=0.001..0.001 rows=1.00 loops=33)
                                            Index Cond: (id = a.advertiser_id)
                                            Index Searches: 33
                                            Buffers: shared hit=66
                                      ->  Index Scan using users_pkey on users u  (cost=0.14..0.55 rows=1 width=26) (actual time=0.000..0.000 rows=1.00 loops=33)
                                            Index Cond: (id = adv.user_id)
                                            Index Searches: 33
                                            Buffers: shared hit=66
                          ->  Index Scan using cities_pkey on cities c  (cost=0.28..5.95 rows=1 width=32) (actual time=0.001..0.001 rows=1.00 loops=33)
                                Index Cond: (id = a.city_id)
                                Index Searches: 33
                                Buffers: shared hit=99
                    ->  Index Scan using subscription_plans_pkey on subscription_plans sp  (cost=0.13..0.25 rows=1 width=44) (actual time=0.001..0.001 rows=1.00 loops=33)
                          Index Cond: (id = u.plan_id)
                          Index Searches: 33
                          Buffers: shared hit=66
              ->  Index Scan using region_memberships_pkey on region_memberships rm  (cost=0.42..8.45 rows=1 width=14) (actual time=0.001..0.001 rows=1.00 loops=33)
                    Index Cond: ((base_city_id = '4761'::bigint) AND (member_city_id = a.city_id))
                    Index Searches: 33
                    Buffers: shared hit=132
Planning:
  Buffers: shared hit=55
Planning Time: 1.429 ms
Execution Time: 0.454 ms
```

#### 3. count — planning 0.258 ms · execution 0.037 ms

```sql
SELECT COUNT(*)::int AS total
    FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
    WHERE a.status = 'active'
      AND a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id = $1 AND distance_km <= $2)
```

params: `[4761,0]`

```text
Aggregate  (cost=25.07..25.08 rows=1 width=4) (actual time=0.024..0.024 rows=1.00 loops=1)
  Buffers: shared hit=14
  ->  Nested Loop  (cost=4.62..25.07 rows=1 width=0) (actual time=0.013..0.021 rows=33.00 loops=1)
        Buffers: shared hit=14
        ->  Index Scan using idx_region_memberships_base_dist on region_memberships  (cost=0.42..8.45 rows=1 width=8) (actual time=0.004..0.005 rows=1.00 loops=1)
              Index Cond: ((base_city_id = '4761'::bigint) AND (distance_km <= '0'::numeric))
              Index Searches: 1
              Buffers: shared hit=4
        ->  Bitmap Heap Scan on ads a  (cost=4.19..16.57 rows=5 width=8) (actual time=0.008..0.014 rows=33.00 loops=1)
              Recheck Cond: ((city_id = region_memberships.member_city_id) AND (status = 'active'::text))
              Heap Blocks: exact=9
              Buffers: shared hit=10
              ->  Bitmap Index Scan on idx_ads_city_id_status  (cost=0.00..4.19 rows=5 width=0) (actual time=0.004..0.004 rows=33.00 loops=1)
                    Index Cond: ((city_id = region_memberships.member_city_id) AND (status = 'active'::text))
                    Index Searches: 1
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=16
Planning Time: 0.258 ms
Execution Time: 0.037 ms
```

#### 4. facetas passivas (GROUPING SETS) — planning 0.528 ms · execution 0.18 ms

```sql
SELECT GROUPING(f0) AS g0, GROUPING(f1) AS g1, GROUPING(f2) AS g2, GROUPING(f3) AS g3, GROUPING(f4) AS g4, GROUPING(f5) AS g5, GROUPING(f6) AS g6, GROUPING(f7) AS g7, GROUPING(f8) AS g8, f0, f1, f2, f3, f4, f5, f6, f7, f8, COUNT(*)::int AS count
      FROM (
        SELECT width_bucket(a.price, ARRAY[40000,60000,80000,100000,150000,200000,300000]::numeric[]) AS f0, a.brand AS f1, a.commercial_model AS f2, ((a.year / 2) * 2) AS f3, COALESCE(a.transmission, a.gearbox, a.cambio) AS f4, a.body_type AS f5, a.fuel_type AS f6, width_bucket(a.mileage, ARRAY[20000,50000,80000,120000,200000]::numeric[]) AS f7,
  (CASE
    WHEN adv.id IS NOT NULL AND adv.id > 0 THEN 'dealer'
    WHEN UPPER(COALESCE(u.document_type, '')) = 'CNPJ' THEN 'dealer'
    ELSE 'private'
  END)
 AS f8
        FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
        WHERE a.status = 'active'
      AND a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id = $1 AND distance_km <= $2)
      ) x
      GROUP BY GROUPING SETS ((f0), (f1), (f2), (f3), (f4), (f5), (f6), (f7), (f8))
```

params: `[4761,0]`

```text
HashAggregate  (cost=26.33..26.68 rows=9 width=244) (actual time=0.128..0.136 rows=51.00 loops=1)
  Hash Key: (width_bucket(a.price, '{40000,60000,80000,100000,150000,200000,300000}'::numeric[]))
  Hash Key: a.brand
  Hash Key: a.commercial_model
  Hash Key: (((a.year / 2) * 2))
  Hash Key: (COALESCE(a.transmission, a.gearbox, a.cambio))
  Hash Key: a.body_type
  Hash Key: a.fuel_type
  Hash Key: (width_bucket((a.mileage)::numeric, '{20000,50000,80000,120000,200000}'::numeric[]))
  Hash Key: CASE WHEN ((adv.id IS NOT NULL) AND (adv.id > 0)) THEN 'dealer'::text WHEN (upper(COALESCE(u.document_type, ''::text)) = 'CNPJ'::text) THEN 'dealer'::text ELSE 'private'::text END
  Batches: 1  Memory Usage: 152kB
  Buffers: shared hit=146
  ->  Nested Loop Left Join  (cost=4.90..26.32 rows=1 width=204) (actual time=0.023..0.094 rows=33.00 loops=1)
        Buffers: shared hit=146
        ->  Nested Loop  (cost=4.62..25.13 rows=1 width=176) (actual time=0.018..0.043 rows=33.00 loops=1)
              Buffers: shared hit=14
              ->  Index Scan using idx_region_memberships_base_dist on region_memberships  (cost=0.42..8.45 rows=1 width=8) (actual time=0.004..0.005 rows=1.00 loops=1)
                    Index Cond: ((base_city_id = '4761'::bigint) AND (distance_km <= '0'::numeric))
                    Index Searches: 1
                    Buffers: shared hit=4
              ->  Bitmap Heap Scan on ads a  (cost=4.19..16.63 rows=5 width=180) (actual time=0.013..0.034 rows=33.00 loops=1)
                    Recheck Cond: ((city_id = region_memberships.member_city_id) AND (status = 'active'::text))
                    Heap Blocks: exact=9
                    Buffers: shared hit=10
                    ->  Bitmap Index Scan on idx_ads_city_id_status  (cost=0.00..4.19 rows=5 width=0) (actual time=0.004..0.005 rows=33.00 loops=1)
                          Index Cond: ((city_id = region_memberships.member_city_id) AND (status = 'active'::text))
                          Index Searches: 1
                          Buffers: shared hit=1
        ->  Nested Loop Left Join  (cost=0.28..1.18 rows=1 width=8) (actual time=0.001..0.001 rows=1.00 loops=33)
              Buffers: shared hit=132
              ->  Index Scan using advertisers_pkey on advertisers adv  (cost=0.14..0.63 rows=1 width=8) (actual time=0.000..0.001 rows=1.00 loops=33)
                    Index Cond: (id = a.advertiser_id)
                    Index Searches: 33
                    Buffers: shared hit=66
              ->  Index Scan using users_pkey on users u  (cost=0.14..0.55 rows=1 width=26) (actual time=0.000..0.000 rows=1.00 loops=33)
                    Index Cond: (id = adv.user_id)
                    Index Searches: 33
                    Buffers: shared hit=66
Planning:
  Buffers: shared hit=32
Planning Time: 0.528 ms
Execution Time: 0.180 ms
```

#### 5. relaxações — não executada (total 33 ≥ target 20; nenhuma variante)

### Atibaia · SEARCH_MODEL (q=onix automático até 75 mil, origem=atibaia-sp)

perfil SEARCH_MODEL · specificity 3 · location_source CITY_PAGE · geo_mode AUTO_RADIUS · required null → effective 150 km · reason AUTO_RADIUS_CAP_REACHED · territory_city_count 223 · local 0

#### 1. liquidez por cidade (D7/E1, $2 = max_auto_radius) — planning 0.432 ms · execution 0.757 ms

```sql
SELECT c.id AS city_id, c.slug, rm.distance_km::float AS distance_km,
           COALESCE(cnt.n, 0)::int AS count
    FROM region_memberships rm
    JOIN cities c ON c.id = rm.member_city_id
    LEFT JOIN (
      SELECT a.city_id, COUNT(*)::int AS n
      FROM ads a
      LEFT JOIN cities c2             ON c2.id = a.city_id
      LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
      LEFT JOIN users u               ON u.id  = adv.user_id
      LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
      WHERE a.status = 'active'
        AND LOWER(a.commercial_model) = LOWER($3)
        AND a.price <= $4
        AND (COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE $5)
        AND a.city_id IN (
          SELECT member_city_id FROM region_memberships
          WHERE base_city_id = $1 AND distance_km <= $2
        )
      GROUP BY a.city_id
    ) cnt ON cnt.city_id = c.id
    WHERE rm.base_city_id = $1 AND rm.distance_km <= $2
    ORDER BY rm.distance_km ASC, c.slug ASC
```

params: `[4761,150,"Onix",75000,"%automatico%"]`

```text
Sort  (cost=459.84..460.16 rows=129 width=37) (actual time=0.714..0.722 rows=223.00 loops=1)
  Sort Key: rm.distance_km, c.slug
  Sort Method: quicksort  Memory: 38kB
  Buffers: shared hit=146
  ->  Hash Left Join  (cost=264.29..455.31 rows=129 width=37) (actual time=0.085..0.665 rows=223.00 loops=1)
        Hash Cond: (c.id = cnt.city_id)
        Buffers: shared hit=146
        ->  Hash Join  (cost=235.43..425.79 rows=129 width=25) (actual time=0.048..0.581 rows=223.00 loops=1)
              Hash Cond: (c.id = rm.member_city_id)
              Buffers: shared hit=127
              ->  Seq Scan on cities c  (cost=0.00..175.72 rows=5572 width=19) (actual time=0.003..0.202 rows=5572.00 loops=1)
                    Buffers: shared hit=120
              ->  Hash  (cost=233.82..233.82 rows=129 width=14) (actual time=0.043..0.043 rows=223.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 19kB
                    Buffers: shared hit=7
                    ->  Index Scan using idx_region_memberships_base_dist on region_memberships rm  (cost=0.42..233.82 rows=129 width=14) (actual time=0.006..0.026 rows=223.00 loops=1)
                          Index Cond: ((base_city_id = '4761'::bigint) AND (distance_km <= '150'::numeric))
                          Index Searches: 1
                          Buffers: shared hit=7
        ->  Hash  (cost=28.85..28.85 rows=1 width=8) (actual time=0.034..0.036 rows=0.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 8kB
              Buffers: shared hit=19
              ->  Subquery Scan on cnt  (cost=28.82..28.85 rows=1 width=8) (actual time=0.034..0.035 rows=0.00 loops=1)
                    Buffers: shared hit=19
                    ->  GroupAggregate  (cost=28.82..28.84 rows=1 width=8) (actual time=0.034..0.035 rows=0.00 loops=1)
                          Group Key: a.city_id
                          Buffers: shared hit=19
                          ->  Sort  (cost=28.82..28.82 rows=1 width=4) (actual time=0.034..0.034 rows=0.00 loops=1)
                                Sort Key: a.city_id
                                Sort Method: quicksort  Memory: 25kB
                                Buffers: shared hit=19
                                ->  Nested Loop  (cost=0.42..28.81 rows=1 width=4) (actual time=0.033..0.033 rows=0.00 loops=1)
                                      Buffers: shared hit=19
                                      ->  Seq Scan on ads a  (cost=0.00..20.24 rows=1 width=8) (actual time=0.032..0.033 rows=0.00 loops=1)
                                            Filter: ((price <= '75000'::numeric) AND (COALESCE(transmission, gearbox, cambio, ''::text) ~~* '%automatico%'::text) AND (status = 'active'::text) AND (lower(commercial_model) = 'onix'::text))
                                            Rows Removed by Filter: 55
                                            Buffers: shared hit=19
                                      ->  Index Scan using region_memberships_pkey on region_memberships  (cost=0.42..8.45 rows=1 width=8) (never executed)
                                            Index Cond: ((base_city_id = '4761'::bigint) AND (member_city_id = a.city_id))
                                            Filter: (distance_km <= '150'::numeric)
                                            Index Searches: 0
Planning:
  Buffers: shared hit=30
Planning Time: 0.432 ms
Execution Time: 0.757 ms
```

#### 2. grid (dataQuery, página 1) — planning 0.965 ms · execution 0.089 ms

```sql
SELECT
      a.*,
      c.slug AS city_slug,
      c.name AS city_name,
      adv.name         AS seller_name,
      adv.company_name AS dealership_name,
      adv.id           AS dealership_id,
      u.document_type  AS account_type,

  GREATEST(
    (CASE WHEN a.highlight_until > NOW() THEN 4 ELSE 0 END),
    COALESCE(sp.weight, 1)
  )
 AS priority_tier,

  (
    a.below_fipe = true
    AND a.fipe_reference_value IS NOT NULL
    AND a.fipe_reference_value > 0
    AND a.price IS NOT NULL
    AND a.price > 0
    AND a.price <= a.fipe_reference_value * 0.9
  )
 AS opportunity,
      0 AS text_rank,
      COALESCE(rm.distance_km, 0)::float AS distance_km
    FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
    LEFT JOIN region_memberships rm ON rm.base_city_id = $6 AND rm.member_city_id = a.city_id
    WHERE a.status = 'active'
      AND a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id = $1 AND distance_km <= $2)
      AND LOWER(a.commercial_model) = LOWER($3)
      AND a.price <= $4
      AND (COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE $5)
    ORDER BY
  GREATEST(
    (CASE WHEN a.highlight_until > NOW() THEN 4 ELSE 0 END),
    COALESCE(sp.weight, 1)
  )
 DESC,
      COALESCE(rm.distance_km, 0) ASC,
      a.created_at DESC,
      a.id ASC
    LIMIT $7
    OFFSET $8
```

params: `[4761,150,"Onix",75000,"%automatico%",4761,20,0]`

```text
Limit  (cost=49.42..49.42 rows=1 width=1831) (actual time=0.040..0.041 rows=0.00 loops=1)
  Buffers: shared hit=19
  ->  Sort  (cost=49.42..49.42 rows=1 width=1831) (actual time=0.039..0.040 rows=0.00 loops=1)
        Sort Key: (GREATEST((CASE WHEN (a.highlight_until > now()) THEN 4 ELSE 0 END)::numeric, COALESCE(sp.weight, '1'::numeric))) DESC, (COALESCE(rm.distance_km, '0'::numeric)), a.created_at DESC, a.id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=19
        ->  Nested Loop  (cost=21.66..49.41 rows=1 width=1831) (actual time=0.036..0.037 rows=0.00 loops=1)
              Buffers: shared hit=19
              ->  Nested Loop Left Join  (cost=21.23..40.81 rows=1 width=1772) (actual time=0.036..0.037 rows=0.00 loops=1)
                    Buffers: shared hit=19
                    ->  Nested Loop Left Join  (cost=20.81..32.25 rows=1 width=1766) (actual time=0.036..0.037 rows=0.00 loops=1)
                          Buffers: shared hit=19
                          ->  Nested Loop Left Join  (cost=20.67..31.97 rows=1 width=1772) (actual time=0.036..0.037 rows=0.00 loops=1)
                                Buffers: shared hit=19
                                ->  Nested Loop Left Join  (cost=20.53..31.42 rows=1 width=1754) (actual time=0.036..0.037 rows=0.00 loops=1)
                                      Buffers: shared hit=19
                                      ->  Hash Right Join  (cost=20.25..23.11 rows=1 width=1726) (actual time=0.036..0.037 rows=0.00 loops=1)
                                            Hash Cond: (adv.id = a.advertiser_id)
                                            Buffers: shared hit=19
                                            ->  Seq Scan on advertisers adv  (cost=0.00..2.62 rows=62 width=43) (never executed)
                                            ->  Hash  (cost=20.24..20.24 rows=1 width=1683) (actual time=0.035..0.035 rows=0.00 loops=1)
                                                  Buckets: 1024  Batches: 1  Memory Usage: 8kB
                                                  Buffers: shared hit=19
                                                  ->  Seq Scan on ads a  (cost=0.00..20.24 rows=1 width=1683) (actual time=0.035..0.035 rows=0.00 loops=1)
                                                        Filter: ((price <= '75000'::numeric) AND (COALESCE(transmission, gearbox, cambio, ''::text) ~~* '%automatico%'::text) AND (status = 'active'::text) AND (lower(commercial_model) = 'onix'::text))
                                                        Rows Removed by Filter: 55
                                                        Buffers: shared hit=19
                                      ->  Index Scan using cities_pkey on cities c  (cost=0.28..8.30 rows=1 width=32) (never executed)
                                            Index Cond: (id = a.city_id)
                                            Index Searches: 0
                                ->  Index Scan using users_pkey on users u  (cost=0.14..0.55 rows=1 width=26) (never executed)
                                      Index Cond: (id = adv.user_id)
                                      Index Searches: 0
                          ->  Index Scan using subscription_plans_pkey on subscription_plans sp  (cost=0.13..0.25 rows=1 width=44) (never executed)
                                Index Cond: (id = u.plan_id)
                                Index Searches: 0
                    ->  Index Scan using region_memberships_pkey on region_memberships rm  (cost=0.42..8.45 rows=1 width=14) (never executed)
                          Index Cond: ((base_city_id = '4761'::bigint) AND (member_city_id = a.city_id))
                          Index Searches: 0
              ->  Index Scan using region_memberships_pkey on region_memberships  (cost=0.42..8.45 rows=1 width=8) (never executed)
                    Index Cond: ((base_city_id = '4761'::bigint) AND (member_city_id = a.city_id))
                    Filter: (distance_km <= '150'::numeric)
                    Index Searches: 0
Planning:
  Buffers: shared hit=55
Planning Time: 0.965 ms
Execution Time: 0.089 ms
```

#### 3. count — planning 0.298 ms · execution 0.047 ms

```sql
SELECT COUNT(*)::int AS total
    FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
    WHERE a.status = 'active'
      AND a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id = $1 AND distance_km <= $2)
      AND LOWER(a.commercial_model) = LOWER($3)
      AND a.price <= $4
      AND (COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE $5)
```

params: `[4761,150,"Onix",75000,"%automatico%"]`

```text
Aggregate  (cost=28.81..28.82 rows=1 width=4) (actual time=0.034..0.035 rows=1.00 loops=1)
  Buffers: shared hit=19
  ->  Nested Loop  (cost=0.42..28.81 rows=1 width=0) (actual time=0.033..0.033 rows=0.00 loops=1)
        Buffers: shared hit=19
        ->  Seq Scan on ads a  (cost=0.00..20.24 rows=1 width=8) (actual time=0.032..0.033 rows=0.00 loops=1)
              Filter: ((price <= '75000'::numeric) AND (COALESCE(transmission, gearbox, cambio, ''::text) ~~* '%automatico%'::text) AND (status = 'active'::text) AND (lower(commercial_model) = 'onix'::text))
              Rows Removed by Filter: 55
              Buffers: shared hit=19
        ->  Index Scan using region_memberships_pkey on region_memberships  (cost=0.42..8.45 rows=1 width=8) (never executed)
              Index Cond: ((base_city_id = '4761'::bigint) AND (member_city_id = a.city_id))
              Filter: (distance_km <= '150'::numeric)
              Index Searches: 0
Planning:
  Buffers: shared hit=16
Planning Time: 0.298 ms
Execution Time: 0.047 ms
```

#### 4. facetas passivas (GROUPING SETS) — planning 0.556 ms · execution 0.072 ms

```sql
SELECT GROUPING(f0) AS g0, GROUPING(f1) AS g1, GROUPING(f2) AS g2, GROUPING(f3) AS g3, GROUPING(f4) AS g4, GROUPING(f5) AS g5, GROUPING(f6) AS g6, GROUPING(f7) AS g7, GROUPING(f8) AS g8, GROUPING(f9) AS g9, f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, COUNT(*)::int AS count
      FROM (
        SELECT width_bucket(a.price, ARRAY[40000,60000,80000,100000,150000,200000,300000]::numeric[]) AS f0, a.brand AS f1, a.commercial_model AS f2, ((a.year / 2) * 2) AS f3, COALESCE(a.transmission, a.gearbox, a.cambio) AS f4, a.body_type AS f5, a.fuel_type AS f6, width_bucket(a.mileage, ARRAY[20000,50000,80000,120000,200000]::numeric[]) AS f7,
  (CASE
    WHEN adv.id IS NOT NULL AND adv.id > 0 THEN 'dealer'
    WHEN UPPER(COALESCE(u.document_type, '')) = 'CNPJ' THEN 'dealer'
    ELSE 'private'
  END)
 AS f8, a.model AS f9
        FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
        WHERE a.status = 'active'
      AND a.city_id IN (SELECT member_city_id FROM region_memberships WHERE base_city_id = $1 AND distance_km <= $2)
      AND LOWER(a.commercial_model) = LOWER($3)
      AND a.price <= $4
      AND (COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE $5)
      ) x
      GROUP BY GROUPING SETS ((f0), (f1), (f2), (f3), (f4), (f5), (f6), (f7), (f8), (f9))
```

params: `[4761,150,"Onix",75000,"%automatico%"]`

```text
HashAggregate  (cost=32.25..32.67 rows=10 width=280) (actual time=0.037..0.038 rows=0.00 loops=1)
  Hash Key: (width_bucket(a.price, '{40000,60000,80000,100000,150000,200000,300000}'::numeric[]))
  Hash Key: a.brand
  Hash Key: a.commercial_model
  Hash Key: (((a.year / 2) * 2))
  Hash Key: (COALESCE(a.transmission, a.gearbox, a.cambio))
  Hash Key: a.body_type
  Hash Key: a.fuel_type
  Hash Key: (width_bucket((a.mileage)::numeric, '{20000,50000,80000,120000,200000}'::numeric[]))
  Hash Key: CASE WHEN ((adv.id IS NOT NULL) AND (adv.id > 0)) THEN 'dealer'::text WHEN (upper(COALESCE(u.document_type, ''::text)) = 'CNPJ'::text) THEN 'dealer'::text ELSE 'private'::text END
  Hash Key: a.model
  Batches: 1  Memory Usage: 160kB
  Buffers: shared hit=19
  ->  Nested Loop Left Join  (cost=20.83..32.25 rows=1 width=236) (actual time=0.036..0.037 rows=0.00 loops=1)
        Buffers: shared hit=19
        ->  Nested Loop  (cost=20.69..31.70 rows=1 width=212) (actual time=0.035..0.036 rows=0.00 loops=1)
              Buffers: shared hit=19
              ->  Hash Right Join  (cost=20.26..23.12 rows=1 width=216) (actual time=0.035..0.036 rows=0.00 loops=1)
                    Hash Cond: (adv.id = a.advertiser_id)
                    Buffers: shared hit=19
                    ->  Seq Scan on advertisers adv  (cost=0.00..2.62 rows=62 width=8) (never executed)
                    ->  Hash  (cost=20.25..20.25 rows=1 width=212) (actual time=0.034..0.035 rows=0.00 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 8kB
                          Buffers: shared hit=19
                          ->  Seq Scan on ads a  (cost=0.00..20.25 rows=1 width=212) (actual time=0.034..0.034 rows=0.00 loops=1)
                                Filter: ((price <= '75000'::numeric) AND (COALESCE(transmission, gearbox, cambio, ''::text) ~~* '%automatico%'::text) AND (status = 'active'::text) AND (lower(commercial_model) = 'onix'::text))
                                Rows Removed by Filter: 55
                                Buffers: shared hit=19
              ->  Index Scan using region_memberships_pkey on region_memberships  (cost=0.42..8.45 rows=1 width=8) (never executed)
                    Index Cond: ((base_city_id = '4761'::bigint) AND (member_city_id = a.city_id))
                    Filter: (distance_km <= '150'::numeric)
                    Index Searches: 0
        ->  Index Scan using users_pkey on users u  (cost=0.14..0.55 rows=1 width=26) (never executed)
              Index Cond: (id = adv.user_id)
              Index Searches: 0
Planning:
  Buffers: shared hit=32
Planning Time: 0.556 ms
Execution Time: 0.072 ms
```

#### 5. relaxações (1 query, COUNT FILTER; total=0) — planning 0.259 ms · execution 0.076 ms

```sql
SELECT COUNT(*) FILTER (WHERE rm.distance_km <= $3 AND LOWER(a.commercial_model) = LOWER($4) AND a.price <= $5 AND (COALESCE(a.transmission, a.gearbox, a.cambio, '') ILIKE $6))::int AS v0,
           COUNT(*) FILTER (WHERE rm.distance_km <= $7 AND LOWER(a.commercial_model) = LOWER($8) AND a.price <= $9)::int AS v1
    FROM ads a
    LEFT JOIN cities c              ON c.id  = a.city_id
    LEFT JOIN advertisers adv       ON adv.id = a.advertiser_id
    LEFT JOIN users u               ON u.id  = adv.user_id
    LEFT JOIN subscription_plans sp ON sp.id = u.plan_id
    JOIN region_memberships rm ON rm.base_city_id = $1 AND rm.member_city_id = a.city_id
    WHERE a.status = 'active'
      AND rm.distance_km <= $2
```

params: `[4761,150,150,"Onix",87000,"%automatico%",150,"Onix",75000]`

```text
Aggregate  (cost=78.20..78.22 rows=1 width=8) (actual time=0.058..0.059 rows=1.00 loops=1)
  Buffers: shared hit=27
  ->  Nested Loop  (cost=0.43..78.17 rows=1 width=90) (actual time=0.017..0.038 rows=34.00 loops=1)
        Buffers: shared hit=27
        ->  Seq Scan on ads a  (cost=0.00..19.69 rows=34 width=92) (actual time=0.008..0.014 rows=34.00 loops=1)
              Filter: (status = 'active'::text)
              Rows Removed by Filter: 21
              Buffers: shared hit=19
        ->  Memoize  (cost=0.43..8.46 rows=1 width=14) (actual time=0.000..0.000 rows=1.00 loops=34)
              Cache Key: a.city_id
              Cache Mode: logical
              Hits: 32  Misses: 2  Evictions: 0  Overflows: 0  Memory Usage: 1kB
              Buffers: shared hit=8
              ->  Index Scan using region_memberships_pkey on region_memberships rm  (cost=0.42..8.45 rows=1 width=14) (actual time=0.004..0.004 rows=1.00 loops=2)
                    Index Cond: ((base_city_id = '4761'::bigint) AND (member_city_id = a.city_id))
                    Filter: (distance_km <= '150'::numeric)
                    Index Searches: 2
                    Buffers: shared hit=8
Planning:
  Buffers: shared hit=16
Planning Time: 0.259 ms
Execution Time: 0.076 ms
```
