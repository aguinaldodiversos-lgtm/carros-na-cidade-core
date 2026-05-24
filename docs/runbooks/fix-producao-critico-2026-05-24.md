# Correção crítica de produção — 2026-05-24

Engenheiro responsável: Aguinaldo (solo).
Briefing: confiabilidade pública do catálogo, territorialidade, detalhe e dados sujos.

---

## 1. Sumário executivo

| Área | Status | Risco prod |
|---|---|---|
| A — Detalhe sem fake fallback (404 real) | ✅ Código | baixo |
| B — Territorialidade (city_id Campinas/SP) | ✅ Diagnóstico + backfill seguro | médio (DML em ads) |
| C — Regional Atibaia/Campinas (facets) | ✅ Código | baixo |
| D — Dados sujos + SÆo Paulo | ✅ Guard backend + script SQL | médio (DML em cities/ads) |
| E — Preço truncado nos relacionados | ✅ Código | nenhum |
| F — /anunciar/novo loading infinito | ✅ Código | baixo |
| Testes unitários | ✅ 19 novos passando (8 backend + 11 frontend) | — |
| Smoke público (curl) | ✅ Script idempotente | — |

**Nenhuma alteração visual** (header, cards, footer, sidebar, bottom-nav, estilo premium). Só funcional.

---

## 2. Causa raiz por área

### A) Cards do catálogo → "Veículo não encontrado" R$ 0

**Causa raiz:** [`frontend/lib/ads/ad-detail.ts`](../../frontend/lib/ads/ad-detail.ts) tinha um `buildFallbackAd("Veículo não encontrado", price: null, city: "São Paulo")` que SEMPRE retornava quando nenhum dos 7 endpoints candidatos do backend (`/api/ads/:id`, `/ads/:slug`, etc.) respondia 200. Combinado com:

- [`frontend/app/anuncios/[identifier]/page.tsx`](../../frontend/app/anuncios/[identifier]/page.tsx) chamando `permanentRedirect(`/veiculo/${ad.slug || ad.id}`)` no fallback → redireciona para si mesmo.
- [`frontend/app/veiculo/[slug]/page.tsx`](../../frontend/app/veiculo/[slug]/page.tsx) tendo `buildFallbackVehicle(slug, ref)` próprio com price `"R$ 0"`, city `"São Paulo (SP)"`, dados de placeholder.

**Resultado em produção:** qualquer slug inválido (e até alguns válidos, quando o backend está com cache divergente) renderizava um veículo fake com R$ 0 e a cidade hardcoded "São Paulo".

**Fix:** `fetchAdDetail` agora retorna `null` quando nenhum candidato encontra o registro. As páginas chamam `notFound()` para emitir 404 real (com `dynamic = "force-dynamic"` para evitar o bug Next 14.2 de soft-404 sob ISR).

### B) /comprar/estado/sp mostra Campinas mas /carros-em/campinas-sp = 0

**Causa raiz:** o catálogo estadual filtra por `UPPER(COALESCE(a.state, c.state)) = 'SP'` (texto). O catálogo de cidade filtra por `c.slug = 'campinas-sp'` (via JOIN `cities c ON c.id = a.city_id`). Se um anúncio criado historicamente tem `a.city_id` apontando para uma cidade diferente (ex.: `id=1` = "SÆo Paulo" do seed antigo, ou NULL/órfão), ele aparece no estado mas SOME na cidade.

**Evidência:** [`src/modules/ads/filters/ads-filter.builder.js:99-127`](../../src/modules/ads/filters/ads-filter.builder.js). Catalogo estadual usa COALESCE tolerante, catálogo de cidade não.

**Fix:**
- BLOCO 3 do [`scripts/sql/2026-05-24-fix-producao-critico.sql`](../../scripts/sql/2026-05-24-fix-producao-critico.sql) lista ads com city_id incoerente.
- BLOCO 5 faz backfill SEGURO (idempotente) só onde `(a.city, a.state)` casa em **exatamente uma** cidade. Ambíguos (>1 match) ficam para revisão manual.
- O wizard novo já força o usuário a escolher cidade do autocomplete (`NewAdWizardClient.validateStep(4)`), então o problema é só dado histórico.

### C) Regional Atibaia/Campinas 0 ofertas ou timeout

**Causa raiz dupla:**

1. [`frontend/lib/search/ads-search.ts`](../../frontend/lib/search/ads-search.ts) — `fetchAdsFacets` só propagava `city_slug|city_id|city|state`, **NÃO `city_slugs`**. Em rotas regionais (multi-cidade) as facets ficavam vazias, desestabilizando a UI e levando a `0 ofertas`.
2. [`src/modules/ads/filters/ads-filter.schema.js`](../../src/modules/ads/filters/ads-filter.schema.js) — `AdsFacetFilterSchema` não incluía `city_slugs` no `.pick()`. Sobrevivia só via `passthrough()`, frágil para futuras refatorações.
3. [`src/modules/ads/filters/ads-filter.builder.js`](../../src/modules/ads/filters/ads-filter.builder.js) — `buildAdsFacetWhere` não tratava `city_slugs`. Mesmo com o frontend mandando, o SQL não consumia.

**Fix:** propagação ponta-a-ponta de `city_slugs` (frontend lib → schema Zod → builder SQL). Também adicionado warn em [`region-catalog-loader.ts`](../../frontend/lib/buy/region-catalog-loader.ts) quando `members` vem vazio (sinal para preencher `region_memberships`).

**Nota:** se `REGIONAL_PAGE_ENABLED=false` no Render (Fase A do runbook regional), `/carros-usados/regiao/*` continua retornando 404 by design. Não é bug — é flag de roll-out. Para liberar prod: `REGIONAL_PAGE_ENABLED=true` no painel do Render.

### D) Dados sujos: anúncios de teste + SÆo Paulo

**Causa raiz dado:** seed antigo + criação manual de anúncios de teste em produção (sem ambiente staging dedicado por muito tempo).

**Causa raiz código:** o backend não tinha guard nenhum impedindo anúncios com title `Teste alerta`, `DeployModel`, etc. de aparecerem na vitrine.

**Fix:**
- Constante `DIRTY_TEST_AD_GUARD_SQL` em [`ads-filter.builder.js`](../../src/modules/ads/filters/ads-filter.builder.js) aplicada por padrão em `NODE_ENV=production`. Cobre title/model/slug com `test|teste|seed|deploy|worker|alerta|fake|dummy|sample`. Desligável via `PUBLIC_TEST_AD_FILTER=disabled` para debug.
- BLOCO 1 do SQL script: reaponta ads de `cities.id=1` (encoding quebrado) para `cities.id=5278` (canonical São Paulo) e renomeia a linha id=1 para `"São Paulo (legado)"` com slug não-conflitante.
- BLOCO 2 do SQL: arquiva os anúncios de teste (status='archived_test', reversível).

### E) Preço dos cards relacionados R$ 104

**Causa raiz — double formatting:** [`frontend/lib/vehicle/related-ads.ts:21-65`](../../frontend/lib/vehicle/related-ads.ts) `mapAdItemToListingCar` mapeava `AdItem.price = 103900` para `ListingCar.price = "R$ 103.900"` (string formatada). Depois [`frontend/components/vehicle/mobile/VehicleDetailMobileShell.tsx:294`](../../frontend/components/vehicle/mobile/VehicleDetailMobileShell.tsx) passava esse `ListingCar` como `BaseAdData` para `<AdCard />`. O AdCard tem `parseNumber` que faz `Number(String("R$ 103.900").replace(/[^\d.-]/g, ""))` = `Number("103.900")` = **`103.9`** → reformata como **"R$ 104"**.

**Fix:** novo `mapAdItemToBaseAdData` em `related-ads.ts` retorna shape `BaseAdData` com `price` numérico. AdCard formata uma única vez. Bug eliminado na raiz (não tratei sintoma).

### F) /anunciar/novo "Carregando fluxo de anúncio..."

**Causa raiz dupla:**

1. [`NewAdWizardClient.tsx:589-595`](../../frontend/components/painel/NewAdWizardClient.tsx) gate `if (!dashboardFetchDone) return <Loading/>`. Se `fetch(/api/dashboard/me)` **travar** (backend down, CORS, proxy), o gate nunca libera.
2. Para 401 (deslogado), o código antigo seguia adiante e renderizava o wizard. Não havia redirect para login — o submit falharia depois.

**Fix:**
- **Watchdog 8s**: timer libera o gate mesmo se o fetch hang. Wizard renderiza com aviso "não confirmamos seu plano".
- **401 → redirect imediato** para `/login?next=/anunciar/novo` (preservando search params e localStorage do rascunho).

---

## 3. Arquivos alterados

### Frontend
- `frontend/lib/ads/ad-detail.ts` — removido `buildFallbackAd`; `fetchAdDetail: Promise<PublicAdDetail | null>`.
- `frontend/app/anuncios/[identifier]/page.tsx` — `notFound()` se null; `dynamic = "force-dynamic"`.
- `frontend/app/veiculo/[slug]/page.tsx` — removido `buildFallbackVehicle`, `slugToReadableText`, `buildCityVehicles` fallback. `notFound()` em ambas: `generateMetadata` e `Page`.
- `frontend/lib/search/ads-search.ts` — `fetchAdsFacets` propaga `city_slugs`.
- `frontend/lib/buy/region-catalog-loader.ts` — warn quando `members` vazio.
- `frontend/lib/vehicle/related-ads.ts` — novo `mapAdItemToBaseAdData`; tipo de retorno passa de `ListingCar[]` para `BaseAdData[]`.
- `frontend/components/painel/NewAdWizardClient.tsx` — watchdog 8s + redirect 401 para `/login?next=`.

### Backend
- `src/modules/ads/filters/ads-filter.builder.js` — `DIRTY_TEST_AD_GUARD_SQL` ativo em produção; `buildAdsFacetWhere` aceita `city_slugs` + `state`.
- `src/modules/ads/filters/ads-filter.schema.js` — `AdsFacetFilterSchema` inclui `city_slugs` explicitamente.

### Testes (novos, todos verdes)
- `frontend/lib/search/ads-search.test.ts` — 4 cases.
- `frontend/lib/ads/ad-detail.test.ts` — 4 cases (cobre o null no miss).
- `frontend/lib/vehicle/related-ads.test.ts` — 3 cases (cobre o price numérico).
- `tests/ads/ads-filter-facet-city-slugs.test.js` — 4 cases.
- `tests/ads/ads-public-test-guard.test.js` — 4 cases.

### Scripts
- `scripts/sql/2026-05-24-fix-producao-critico.sql` — 5 blocos idempotentes (encoding, archive test, diagnósticos, backfill seguro).
- `scripts/smoke/public-territorial-smoke.sh` — smoke curl de 7 endpoints com critérios de aceite.

---

## 4. Como aplicar em produção

### 4.1 — Deploy do código (frontend + backend)

```bash
# do diretório do repo, na branch main:
git push origin main
# Render redeploya automaticamente (render.yaml).
```

### 4.2 — Mutações DML (ordem recomendada)

```bash
# 1. Conectar no banco de produção (Render shell ou psql local):
psql "$DATABASE_URL" -f scripts/sql/2026-05-24-fix-producao-critico.sql

# 2. Auditar o que mudou (já tem reports/cleanup/ existente):
node scripts/audit/audit-production-ads-quality.mjs --limit=5000
```

O script é idempotente: rodar mais de uma vez não causa efeito colateral, e cada bloco está em transação isolada com SELECTs antes/depois para validação.

### 4.3 — Habilitar Página Regional pública (opcional, fora deste fix)

Não habilitei automaticamente. Requer:

```
REGIONAL_PAGE_ENABLED=true
```

no painel do Render. Combinar com [`docs/runbooks/regional-page-rollout.md`](regional-page-rollout.md) se existir.

### 4.4 — Smoke pós-deploy

```bash
BASE_URL=https://carrosnacidade.com bash scripts/smoke/public-territorial-smoke.sh
```

Sai com código 1 se qualquer crítica falhar. Critérios de aceite cobertos:
- Cidade Atibaia/Campinas/Águas de Lindóia → 200.
- Detalhe inexistente → **404** (regressão histórica do fake fallback).
- Sem `'SÆo Paulo'` no HTML do `/comprar/estado/sp`.
- API `/api/ads/search?state=SP` → JSON `success:true`.

---

## 5. Antes / depois (evidências esperadas)

| URL | Antes | Depois |
|---|---|---|
| `/veiculo/anuncio-inexistente` | 200 OK + "Veículo não encontrado" R$ 0 SP | 404 real |
| `/anuncios/slug-fantasma` | 308 redirect para `/veiculo/slug-fantasma` (fake) | 404 real |
| `/carros-em/campinas-sp` | 0 ofertas (anúncios com city_id errado) | >0 após BLOCO 5 |
| `/carros-usados/regiao/atibaia-sp` (com flag on) | facets vazias → "0 ofertas" | facets populadas, listagem coerente |
| Card relacionado preço R$ 103.900 | exibia "R$ 104" | exibe "R$ 103.900" |
| `/comprar/estado/sp` HTML | continha "SÆo Paulo" | corrigido após BLOCO 1 |
| `/anunciar/novo` (deslogado) | "Carregando fluxo..." infinito | redirect imediato para `/login` |
| `/comprar/estado/sp` (com anúncio "Teste alerta") | aparecia | filtrado pelo `DIRTY_TEST_AD_GUARD_SQL` |

---

## 6. Trade-offs e decisões

- **`force-dynamic` em `/veiculo/[slug]`**: perdemos ISR mas evitamos soft-404 do Next 14.2 (idem `/carros-usados/regiao/[slug]` que já era `force-dynamic`). O detalhe é página de transação; consistência > latência marginal.
- **Sem fallback no `buildCityVehicles` quando o fetch de relacionados falha**: lista vazia é melhor que cards Toyota Corolla seed hardcoded com cidade errada.
- **Backfill de `ads.city_id` só nos unívocos**: ambíguos (>1 match em `(city, state)`) ficam para revisão manual. Auto-corrigir seria pior que o sintoma.
- **`DIRTY_TEST_AD_GUARD_SQL` no WHERE da listagem em vez de cron job**: complementar — o cron arquiva o registro, mas o WHERE protege mesmo que o cron atrase ou alguém crie novo seed.
- **Redirect 401 client-side em `/anunciar/novo`**: a página em si é `force-dynamic` e o `useEffect` no client é onde sabemos o auth state. Server-side redirect exigiria mover toda a hidratação para o server, fora do escopo do fix crítico.

---

## 7. Não fiz (fora de escopo crítico)

- Não habilitei `REGIONAL_PAGE_ENABLED=true` em produção. Decisão de roll-out do dono.
- Não criei painel admin para o `DIRTY_TEST_AD_GUARD_SQL` (toggleável via env é suficiente).
- Não escrevi e2e do redirect `/anunciar/novo` → `/login` (precisaria de Playwright + backend auth mockado; smoke manual cobre).
- Não removi `getAdDetails` (dead code em `get-ad-details.tsx`, sem callers).
