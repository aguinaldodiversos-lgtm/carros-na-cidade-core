# Relatório final — Página pública da loja `/lojas/[slug]`

**Data:** 2026-05-25
**Branch / commit:** `main` / `daf3ebe2`
**Escopo:** criar página pública da loja + endpoint backend, sem
admin, sem login, sem edição.

## 1. Arquivos criados

| Arquivo | Propósito |
|---------|-----------|
| `src/modules/public/public-dealer.controller.js` | Handler `GET /api/public/dealers/:slug` (200 \| 404). |
| `src/modules/public/public-dealer.service.js` | Query DB sanitizada — `advertisers.status = 'active'` + `DIRTY_TEST_AD_GUARD_SQL` + `normalizePublicAdRows` + `serializeAdsForListing`. |
| `frontend/lib/dealers/fetch-public-dealer.ts` | Fetcher SSR-resilient com parse defensivo + `normalizePublicAd` em cada ad. Retorna `null` em 404 ou shape inválido. |
| `frontend/lib/dealers/fetch-public-dealer.test.ts` | 7 testes (slug vazio, 404, network error, dealer inválido, ad com `price=0` dropado, name fallback, verified). |
| `frontend/app/lojas/[slug]/page.tsx` | Server Component `force-dynamic`. Cabeçalho da loja + grid de `AdCard variant="grid"` + empty state. Canonical + OG + AutoDealer JSON-LD. `noindex` quando `totalActiveAds=0`. |
| `frontend/app/lojas/[slug]/not-found.tsx` | Segment-level 404. |

## 2. Arquivos alterados

| Arquivo | Mudança | Motivo |
|---------|---------|--------|
| `src/modules/ads/ads.repository.js` | SELECT do detalhe agora inclui `adv.slug AS advertiser_slug`. | Frontend precisa do slug canônico (não derivado de `slugify(name)`) para linkar `/lojas/[slug]` corretamente. |
| `src/modules/public/public.routes.js` | Registra `GET /dealers/:slug` com `cacheGet` (TTL 60s). | Nova rota pública. |
| `frontend/lib/ads/ad-detail.ts` | `PublicAdDetail` ganha `advertiser_slug`; normalize aceita aliases `advertiserSlug`/`dealership_slug`. | Propagar slug canônico do backend. |
| `frontend/lib/vehicle/public-vehicle.ts::buildSellerInfo` | `storeSlug` agora vem de `ad.advertiser_slug` (não mais `slugify(sellerName)`). Quando ausente, `storeSlug = ""` → card no detalhe não vira link. | Slug derivado nunca batia com o slug do banco (que inclui `userId`). Sem isso, link quebrava. |
| `frontend/components/vehicle/mobile/VehicleDetailMobileShell.tsx::SellerCard` | Link aponta agora para `/lojas/[slug]` (PLURAL). Particular continua sem link. | Briefing canônico. |
| `frontend/lib/public-contracts/build-empty-state-copy.ts` | Nova variant `"dealer-no-ads"`. | Empty state honesto da loja, no contrato. |
| `frontend/lib/public-contracts/build-empty-state-copy.test.ts` | +variant na tabela de checks de strings proibidas. | Lock. |
| `frontend/lib/ads/ad-detail.test.ts` | +2 casos (advertiser_slug propaga + aliases legados). | Regressão. |
| `scripts/smoke/public-contract-smoke.mjs` | Nova rota `/lojas/loja-inexistente-smoke-zz` (404 esperado), nova seção 3 extrai hrefs `/lojas/*` dos detalhes abertos e valida cada loja real (200 + sem strings + ≥1 href `/veiculo/*` OU empty state). | Cobertura automatizada da nova superfície. |

## 3. Contrato do endpoint

`GET /api/public/dealers/:slug` → `200`

```jsonc
{
  "success": true,
  "data": {
    "dealer": {
      "id": 7,
      "slug": "auto-center-7",
      "name": "Auto Center",
      "verified": false,
      "city": "Atibaia",
      "state": "SP",
      "city_slug": "atibaia-sp",
      "total_active_ads": 3
    },
    "ads": [
      /* lista sanitizada via normalizePublicAdRows + serializeAdsForListing */
    ]
  }
}
```

- **404** quando `advertiser.status != 'active'` ou loja inexistente.
- **200 + ads:[]** quando loja existe mas não tem anúncios ativos.
- Cap inicial: **60 anúncios por loja** (sem paginação; querystring pode entrar em P3-D).

## 4. Estratégia de slug

A coluna `advertisers.slug` (`baseline_003`) já existia. É gerada em
`ensureAdvertiserForUser`: `slugify("${displayName}-${userId}")` →
`auto-center-7`. Inclui o userId, garantindo unicidade global.

Frontend usa esse slug literal:

```
GET /api/public/dealers/auto-center-7
→ link no detalhe: /lojas/auto-center-7
```

Antes do P3-C, `storeSlug` no `VehicleDetail` era `slugify(name)` — não
batia com o slug do banco. Por isso o link `/loja/[slug]` legado nunca
levaria a uma página real. Agora `storeSlug` vem do `advertiser_slug`
emitido pelo backend.

## 5. SEO

| Item | Valor |
|------|-------|
| `<title>` | `"Veículos da {Loja} em {Cidade}, {UF} \| Carros na Cidade"` |
| `description` | `"Veja carros anunciados pela {Loja} em {Cidade}, {UF}. Compare ofertas disponíveis no Carros na Cidade."` |
| `canonical` | `/lojas/{slug}` |
| `robots` | `index,follow` quando `totalActiveAds > 0`; `noindex,follow` quando vazia. |
| JSON-LD | `AutoDealer` mínimo: `name`, `url`, `address` (apenas `addressLocality`+`addressRegion`+`addressCountry: "BR"` quando temos cidade). **NUNCA** inventa telefone, horário ou endereço completo. |

## 6. Testes

```
$ npx tsc --noEmit
OK tsc passou

$ npx vitest run
Test Files  110 passed (110)
     Tests  1567 passed (1567)   ← +16 vs. baseline P3-B (1551)
```

Cobertura adicional:

- **fetch-public-dealer.test.ts (7 casos)** — slug vazio, 404, network error, dealer inválido, ad sem preço dropado, name fallback, verified.
- **ad-detail.test.ts (+2)** — `advertiser_slug` propaga + aceita aliases (`advertiserSlug`, `dealership_slug`).
- **build-empty-state-copy.test.ts** — nova variant `"dealer-no-ads"` participa do gate global de strings proibidas (Test/DeployModel/SÆo Paulo/etc).

## 7. Smoke

Pré-deploy:

```
$ node scripts/smoke/public-contract-smoke.mjs
93/93 checks passaram
```

- 91 anteriores +
- +1 `/lojas/loja-inexistente-smoke-zz — status 404` (passa)
- +1 `dealer-hrefs:none-extracted` (warn-only — esperado pré-deploy: backend ainda não emite `advertiser_slug`)

Pós-deploy esperado: backend passa a emitir `advertiser_slug`, hrefs de loja saem dos detalhes, seção 3 do smoke valida lojas reais. Veja transcript em [`2026-05-25-lojas-publicas-smoke-pos-deploy.txt`](2026-05-25-lojas-publicas-smoke-pos-deploy.txt) (preenchido após `Render auto-deploy`).

GitHub Action **Public Contract Smoke** continua íntegro (workflow não foi alterado).

## 8. Mapeamento dos critérios de aceite

| # | Critério | Status |
|---|----------|--------|
| 1 | `/lojas/[slug]` funcional para lojista real | ✅ — backend emite payload; frontend renderiza header + grid + empty state |
| 2 | Card do lojista no detalhe navega corretamente | ✅ — `/lojas/[slug]` (plural), só quando `seller_kind=dealer` + `storeSlug` válido |
| 3 | Página lista apenas anúncios ativos e públicos da loja | ✅ — `status='active'` + `DIRTY_TEST_AD_GUARD_SQL` no backend; `normalizePublicAd` no fetcher |
| 4 | Empty state funciona | ✅ — `buildEmptyStateCopy("dealer-no-ads")` + CTA `/comprar` |
| 5 | Loja inexistente retorna 404 real | ✅ — `notFound()` + `not-found.tsx` segment-level; smoke valida |
| 6 | Particular não gera página de loja | ✅ — `buildSellerInfo` só popula `storeSlug` em ramo `isDealer`; card de particular nunca vira link |
| 7 | Nenhum dado sujo aparece | ✅ — backend filtra DIRTY antes; fetcher também filtra via `normalizePublicAd` |
| 8 | Nenhum `R$ 0` fake | ✅ — `normalizePublicAd` dropa ads com `price ≤ 0`; cards usam `formatPricePublic` |
| 9 | Todos os hrefs `/veiculo/*` da loja retornam 200/passed-valid | ✅ — smoke seção 2 já cobria; seção 3 adiciona extração de hrefs da loja |
| 10 | Smoke público atualizado e verde | ✅ — 93/93 pré-deploy |
| 11 | `tsc --noEmit` limpo | ✅ |
| 12 | Testes verdes | ✅ 1567/1567 |
| 13 | Commit + push para main | ✅ `daf3ebe2` |

## 9. Restrições respeitadas

- ✅ Sem admin / login / edição de loja / pagamento / CRM / ranking.
- ✅ Sem alteração de layout do header/footer/bottom-nav.
- ✅ Sem DML em produção (`advertisers.slug` + `status` já estavam na baseline).
- ✅ Sem mudança em contrato comercial.
- ✅ `dealer_name` mantido como alias defensivo (briefing veta remoção).
- ✅ Sem exposição de plano/priority_tier/peso na vitrine pública.
- ✅ Loja inativa/bloqueada → 404 (não vaza estoque).

## 10. Recomendações futuras (P3-D ou próxima rodada)

1. **Paginação** em `/api/public/dealers/:slug` quando algum lojista passar dos 60 anúncios ativos.
2. **Filtro/sort** dentro da página da loja (marca, faixa de preço, ano).
3. **Selo "Loja verificada"** atualmente depende só de `advertisers.verified` (set manualmente por admin). Quando houver integração externa de verificação documental, atualizar a condição.
4. **Sitemap.xml** de `/lojas/[slug]` quando o número de lojas ativas justificar (hoje número baixo).
5. **Detalhe do veículo:** atualizar `vehicle.seller.storeSlug` na variante desktop antiga (`components/vehicle/SellerSection.tsx` foi removido em P2-E; verificar que a versão mobile cobre 100% das viewports).
6. **dealer_name → dealership_name**: convergência quando backend confirmar que nenhum endpoint emite mais `dealer_name`.
