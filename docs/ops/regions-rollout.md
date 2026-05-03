# Roll-out: pipeline cidade → região

Runbook para popular `cities.latitude/longitude` e construir
`region_memberships` em produção pela primeira vez (ou após mudanças
no dataset IBGE/community fonte).

---

## TL;DR

1. Configurar `INTERNAL_API_TOKEN` no Render (uma vez).
2. Validar slugs em prod via psql read-only.
3. `npm run seed:cities-geo` no Render Shell.
4. `npm run regions:build` no Render Shell.
5. Smoke: `INTERNAL_API_TOKEN=… npm run smoke:regions` do laptop.

Tempo total esperado: **~5-10 minutos**, sendo ~3-5 min de execução do
`regions:build` (varia com tamanho do estoque de cidades por UF).

---

## Pré-requisitos

| Item | Verificação |
|---|---|
| Migration 020 aplicada | `SELECT 1 FROM subscription_plans LIMIT 1;` retorna 1 row. |
| Migration 021 aplicada | `\d region_memberships` mostra a tabela; `\d cities` mostra colunas `latitude` e `longitude`. |
| `cities` populado (5570 municípios IBGE) | `SELECT COUNT(*) FROM cities;` ≈ 5570. Se < 5000, rodar `npm run seed:cities` ANTES. |
| Acesso ao Render Shell | Painel Render → service `carros-na-cidade-core` → `Shell`. |
| Acesso ao DB de prod (read-only) | psql ou GUI com `DATABASE_URL` (Render → Environment). |
| Node 20+ no laptop do operador | `node --version` para rodar o smoke. |

---

## Etapa 0 — Configurar `INTERNAL_API_TOKEN`

Este token protege `/api/internal/regions/:slug` contra acesso público
(ver `src/modules/regions/regions.middleware.js` — sem token = 404).

**No laptop do operador**:

```bash
# Gera token de 64 chars hex (256 bits de entropia).
NEW_TOKEN=$(openssl rand -hex 32)
echo "$NEW_TOKEN"
```

**No painel do Render**:

1. Service `carros-na-cidade-core` → tab `Environment`.
2. `Add Environment Variable`:
   - Key: `INTERNAL_API_TOKEN`
   - Value: cola o `NEW_TOKEN`.
   - Sync: **OFF** (token não pode aparecer em logs/manifest).
3. Save Changes — Render redeploya automaticamente (~3 min).

**Guardar o token** em secret manager (1Password/Bitwarden/AWS Secrets).
Não commitar, não copiar para Slack, não logar.

---

## Etapa 1 — Validar slugs em prod

Antes de rodar `seed:cities-geo`, confirmar que os slugs em `cities`
seguem a convenção oficial do projeto: `slugify(nome) + '-' + uf` em
minúsculas, terminando em 2 letras.

**psql read-only**:

```sql
-- Total de cidades.
SELECT COUNT(*) AS total FROM cities;
-- Esperado: ~5570 (IBGE).

-- Slugs canônicos (formato esperado).
SELECT COUNT(*) AS canonical
FROM cities
WHERE slug ~ '^[a-z0-9-]+-[a-z]{2}$';
-- Esperado: muito próximo do total (≥ 99%).

-- Slugs malformados (suspeitos).
SELECT slug, name, state
FROM cities
WHERE slug !~ '^[a-z0-9-]+-[a-z]{2}$'
ORDER BY slug
LIMIT 50;
-- Esperado: vazio. Se houver linhas, NÃO rodar seed:cities-geo —
-- investigar o seed de origem (npm run seed:cities) primeiro.
```

**Critério de progresso**: `canonical / total ≥ 0.99`. Se < 0.99, parar.
A causa raiz típica é seed antigo com slugs sem sufixo de UF — corrigir
antes de avançar (rodar `seed:cities` ou ajustar manualmente).

---

## Etapa 2 — `npm run seed:cities-geo`

Popula `cities.latitude/longitude` a partir do dataset público
IBGE-derivado (`scripts/seed-cities-geo.mjs`).

**Render Shell**:

```bash
cd /opt/render/project/src
npm run seed:cities-geo
```

**Output esperado** (logs):

```
[seed:cities-geo] Buscando fonte: https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/json/municipios.json
[seed:cities-geo] Cache atualizado em scripts/data/ibge-municipios.json (5570 entries).
[seed:cities-geo] Source: 5570 entries brutas, 5570 validas (0 invalidas), 5570 slugs unicos.
[seed:cities-geo] Resumo:
  cities no DB: 5570
  atualizadas:  5570
  ja populadas: 0 (idempotencia)
  sem match na fonte: 0 (cidades locais sem lat/long da fonte)
  extras na fonte:    0 (entries sem cidade local correspondente)
[seed:cities-geo] OK
```

**Validação SQL** (após o script terminar):

```sql
SELECT
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) AS missing,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS populated,
  COUNT(*) AS total
FROM cities;
-- Esperado: missing ≤ 50 (cidades sem match na fonte são raras),
-- populated próximo de 5570.
```

**Spot-check pontual**:

```sql
SELECT slug, latitude, longitude
FROM cities
WHERE slug IN (
  'sao-paulo-sp',     -- esperado: latitude ≈ -23.55, longitude ≈ -46.63
  'rio-de-janeiro-rj',-- esperado: latitude ≈ -22.91, longitude ≈ -43.17
  'brasilia-df',      -- esperado: latitude ≈ -15.78, longitude ≈ -47.93
  'porto-alegre-rs'   -- esperado: latitude ≈ -30.04, longitude ≈ -51.22
);
```

**Quando re-rodar `seed:cities-geo`**:

- Após `npm run seed:cities` ter inserido cidades novas (raro).
- Se o dataset upstream for atualizado (verificar > 30 dias do último
  cache local).
- Para forçar refresh em todas as cidades já populadas:
  `npm run seed:cities-geo -- --force`.

---

## Etapa 3 — `npm run regions:build`

Constrói `region_memberships` (vizinhança ≤ 60 km, layer 1 ≤ 30 km +
layer 2 entre 30-60 km).

**Render Shell**:

```bash
cd /opt/render/project/src
npm run regions:build
```

**Output esperado**:

```
[regions:build] AC: 22 cidades, 5 memberships layer 1, 11 layer 2
[regions:build] AL: 102 cidades, 280 memberships layer 1, 510 layer 2
…
[regions:build] SP: 645 cidades, 4200 memberships layer 1, 6800 layer 2
[regions:build] OK — 5570 cidades-base processadas, 35000 memberships layer 1 + 45000 layer 2 em 180.3s.
```

Tempo total varia por UF (SP/MG/PR levam mais por terem mais
municípios). Se passar de 10 min, abortar e investigar (provável
problema de I/O no DB).

**Validação SQL**:

```sql
-- Total memberships não-self.
SELECT COUNT(*) AS total_neighbors
FROM region_memberships
WHERE base_city_id != member_city_id;
-- Esperado: ~50k-100k.

-- Distribuição por layer.
SELECT layer, COUNT(*) AS rows
FROM region_memberships
WHERE base_city_id != member_city_id
GROUP BY layer
ORDER BY layer;
-- Esperado:
--   layer | rows
--   ------+--------
--       1 | ~30000-40000
--       2 | ~40000-60000

-- Cidades com vizinhança não-trivial (sanity check geográfico).
SELECT c.slug, COUNT(*) AS members
FROM region_memberships rm
JOIN cities c ON c.id = rm.base_city_id
WHERE rm.member_city_id != rm.base_city_id
GROUP BY c.slug
HAVING COUNT(*) > 0
ORDER BY members DESC
LIMIT 10;
-- Esperado: capitais e cidades médias do Sudeste no topo (com 25-30 membros).

-- NUNCA pode haver vizinhos cross-UF.
SELECT COUNT(*) AS cross_uf_violations
FROM region_memberships rm
JOIN cities c1 ON c1.id = rm.base_city_id
JOIN cities c2 ON c2.id = rm.member_city_id
WHERE rm.base_city_id != rm.member_city_id
  AND c1.state != c2.state;
-- Esperado: 0. Se > 0, há bug no worker (regra "nunca cruza UF" violada).
```

---

## Etapa 4 — Smoke test do endpoint

Valida que `/api/internal/regions/:slug` está saudável e bate com os
dados acabados de popular.

**Do laptop do operador** (NÃO do Render Shell — testar na ótica do BFF):

```bash
# Recupere o token do secret manager.
export INTERNAL_API_TOKEN=…

# Smoke padrão (slug=sao-paulo-sp).
npm run smoke:regions

# Smoke de outra cidade (override do slug por arg posicional).
INTERNAL_API_TOKEN=$INTERNAL_API_TOKEN node scripts/smoke-regions.mjs atibaia-sp
```

**Output esperado**:

```
[smoke:regions] API_BASE_URL=https://carros-na-cidade-core.onrender.com
[smoke:regions] slug=sao-paulo-sp (slug-inexistente=cidade-que-nao-existe-tt)

✓ GET /api/internal/regions/sao-paulo-sp com token correto → 200 + members não-trivial (members.length=27, layer 1+2 presentes)
✓ GET /api/internal/regions/sao-paulo-sp SEM token → 404 (anti-enumeração)
✓ GET /api/internal/regions/sao-paulo-sp com token errado → 404
✓ GET /api/internal/regions/cidade-que-nao-existe-tt com token correto → 404

Resumo: 4/4 passaram.
OK — endpoint regional saudável.
```

**Smoke alternativo via curl** (se preferir verificar manualmente):

```bash
# Esperado: 200 + payload com base + members[].
curl -sS -H "X-Internal-Token: $INTERNAL_API_TOKEN" \
  https://carros-na-cidade-core.onrender.com/api/internal/regions/sao-paulo-sp \
  | jq '.data.members | length'
# Output: número entre 12 e 30.

# Esperado: 404 (anti-enumeração).
curl -sS -o /dev/null -w "%{http_code}\n" \
  https://carros-na-cidade-core.onrender.com/api/internal/regions/sao-paulo-sp
# Output: 404

# Esperado: 404 (cidade desconhecida).
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "X-Internal-Token: $INTERNAL_API_TOKEN" \
  https://carros-na-cidade-core.onrender.com/api/internal/regions/cidade-fake-zz
# Output: 404
```

---

## Como reverter

Não há migration para reverter; apenas dados. Reverter é re-executar
SQL.

### Reverter `seed:cities-geo` (apagar lat/long)

```sql
UPDATE cities SET latitude = NULL, longitude = NULL;
```

Idempotente. Sem impacto em outras tabelas (lat/long em `cities` só é
lido pelo worker `regions:build`).

### Reverter `regions:build` (apagar vizinhança)

```sql
DELETE FROM region_memberships
WHERE base_city_id != member_city_id;
```

**Importante**: preservar a self-row (`base_city_id = member_city_id`,
layer 0) que veio da migration 021 — ela foi criada pelo backfill da
migration e a próxima execução de `regions:build` espera que ela exista
para todas as cidades.

Se quiser limpar TUDO (incluindo self-rows) e refazer do zero:

```sql
TRUNCATE region_memberships;

-- Recriar self-rows como a migration faz:
INSERT INTO region_memberships (base_city_id, member_city_id, distance_km, layer)
SELECT id, id, 0, 0 FROM cities
ON CONFLICT (base_city_id, member_city_id) DO NOTHING;
```

### Em caso de regressão pós-deploy

O endpoint `/api/internal/regions/:slug` não tem consumidor público
ainda (Página Regional não existe). **Reverter NÃO afeta usuários
finais.** Cache Redis (TTL 5 min) flusha sozinho.

---

## Quando re-rodar

| Gatilho | Ação |
|---|---|
| Trimestralmente (manutenção) | `npm run seed:cities-geo && npm run regions:build`. Cache > 30 dias força refetch da fonte. |
| Após `npm run seed:cities` (cidades novas) | `npm run seed:cities-geo && npm run regions:build`. Sem `--force` — só popula cidades novas. |
| Após mudança de schema em `cities` | Reavaliar — nova coluna pode requerer ajuste. |
| Após bump dos limiares de layer (worker) | `npm run regions:build` (NÃO precisa re-popular geo). |
| Após detecção de slug malformado | Corrigir em `cities` primeiro, depois `seed:cities-geo --force`. |

---

## Troubleshooting

### `[seed:cities-geo] Falha ao buscar fonte: HTTP 403/404/timeout`

Causa: GitHub raw rate-limited, fonte movida, ou rede do Render bloqueada.

Mitigação:
- Se cache local existe (mesmo stale): script cai automaticamente nele.
  Verificar `ls -la /opt/render/project/src/scripts/data/`.
- Se cache não existe e a fonte está fora: salvar manualmente o JSON
  de uma fonte alternativa em `scripts/data/ibge-municipios.json` e
  rerodar.

### `Sem fonte e sem cache em scripts/data/ibge-municipios.json`

Causa: primeira execução em ambiente sem rede.

Mitigação:
- `export CITIES_GEO_SOURCE_FILE=/path/to/local/fixture.json` e rerodar.
  Útil em ambientes air-gapped.

### `regions:build` levou > 10 min e não terminou

Causa: I/O do Postgres saturado (uma transação por cidade-base).

Mitigação:
- Verificar Render metrics (CPU/memory do DB).
- Abortar (Ctrl+C); o estado em `region_memberships` fica parcial mas
  consistente (cada base é uma transação isolada).
- Rerodar fora de horário de pico.

### Smoke retorna `members.length < 12`

Causa: cidade-base com poucos vizinhos < 60 km.

Mitigação:
- Se o slug for de capital: erro real. Investigar `regions:build` logs;
  rodar `regions:build --force` (se script tiver flag — hoje não tem;
  basta rerodar, é idempotente) ou repopular geo com `--force`.
- Se for cidade do interior pouco povoado: comportamento esperado.
  Rodar smoke com slug de capital: `node scripts/smoke-regions.mjs sao-paulo-sp`.

### Smoke retorna 404 com token correto

Causas possíveis:
1. Token no env do laptop ≠ token no Render (typo, copy-paste corrompido).
2. `INTERNAL_API_TOKEN` não está setado no service Render (verificar
   Environment tab — value não vazio).
3. Render ainda redeployando (esperar até deploy ficar `Live`).

### Smoke retorna 200 mas `data.members === []`

Causa: cidade-base existe mas `regions:build` ainda não processou.

Mitigação:
- Confirmar que `regions:build` rodou com sucesso (etapa 3).
- Verificar SQL: `SELECT COUNT(*) FROM region_memberships WHERE base_city_id = (SELECT id FROM cities WHERE slug = 'sao-paulo-sp') AND member_city_id != base_city_id;` — se 0, rodar build.

---

## Notas de segurança

- **Token rotation**: substituir `INTERNAL_API_TOKEN` no Render se
  vazar em log/clipboard. Cache Redis (`internal:regions:*`) NÃO chaveia
  pelo token; rotacionar não invalida cache, mas todas as chamadas com
  token antigo passam a 404 imediatamente.

- **Logs**: o middleware NUNCA loga o valor do token (verificar
  `regions.middleware.js`). Se acrescentar log de debug, sanitizar.

- **Endpoint não-público**: nunca expor `/api/internal/*` em CORS de
  domínio público. Verificar `src/app.js` — CORS é restrito a
  `carrosnacidade.com` + localhost.

- **Cache Redis**: TTL 5 min. Em caso de incidente (dados ruins
  populados), executar manualmente:
  `redis-cli --scan --pattern "internal:regions:*" | xargs redis-cli del`.

---

## Próximos passos (não desta etapa)

- BFF do frontend chamando `/api/internal/regions/:slug` para a
  futura Página Regional. Token no env do BFF, NUNCA exposto ao
  navegador.
- Cron diário/semanal de `regions:build` se cities crescer
  organicamente. Hoje é manual (ver "Quando re-rodar").
- Cache Redis com `cacheInvalidatePrefix("internal:regions")` no fim
  do `regions:build` para reflexo imediato pós-rerun.
