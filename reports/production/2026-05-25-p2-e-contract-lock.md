# Relatório final — P2-E (Contract Lock & Cleanup)

**Data:** 2026-05-25
**Branch / commit:** `main` / `dbbebfae`
**Escopo:** travar contrato público (formatadores, labels territoriais),
consolidar smoke, cleanup leve de dead code.

## 1. Arquivos alterados

| Arquivo | Mudança | Por quê |
|---------|---------|---------|
| [frontend/components/ads/AdCard.tsx](frontend/components/ads/AdCard.tsx) | `formatCurrency` local → `formatPricePublic`; `{city} ({state})` → `buildPublicTerritoryLabel`; remoção dos fallbacks `\|\| "São Paulo"` e `\|\| "SP"` no normalize. Substituí `normalized.city`/`state`/`price` por `locationLabel`/`priceLabel` pré-formatados. | Eliminar bug de "R$ 0" em card com preço ausente e "São Paulo (SP)" mostrado em anúncio sem city/state. |
| [frontend/lib/vehicle/public-vehicle.ts](frontend/lib/vehicle/public-vehicle.ts) | `formatPrice` e `deriveCityDisplay` locais agora delegam ao contrato. `buildFipeReference` cai pra `"Consulte"` quando ausente; `vehicle.price` cai pra `"Sob consulta"`. | Mesma motivação — fonte única no detalhe do veículo. |
| [frontend/lib/vehicle/related-ads.ts](frontend/lib/vehicle/related-ads.ts) | `formatBrl` local e `mapAdItemToListingCar` removidos. | Dead code (zero callers — provado via grep). |
| [frontend/app/veiculo/[slug]/page.tsx](frontend/app/veiculo/[slug]/page.tsx) | `safeText(..., "São Paulo")` / `..., "sao paulo")` substituídos por `cityNameFromVehicle(vehicle)` que não tem fallback hardcoded. | Title/keywords nunca mais mentem "São Paulo" quando city é ausente. |
| [frontend/lib/vehicle/public-vehicle.test.ts](frontend/lib/vehicle/public-vehicle.test.ts) | +6 testes (R$ 0 → "Sob consulta", null/zero, "Atibaia (SP)", uppercase de UF, neutro quando ambos ausentes). | Lock contra regressão futura. |
| [scripts/smoke/public-contract-smoke.mjs](scripts/smoke/public-contract-smoke.mjs) | **Novo.** Smoke consolidado portátil Node 20+. | Substitui combo de 2 .sh por uma única ferramenta multi-OS. |
| [docs/runbooks/public-contract-smoke-cron.md](docs/runbooks/public-contract-smoke-cron.md) | **Novo.** Runbook de como agendar (sem ativar). | "Pronto pra ativar quando justificar" sem comprometer orçamento. |

## 2. Formatadores removidos/substituídos

| Antes | Depois | Localização |
|-------|--------|-------------|
| `formatCurrency` em `AdCard` (parseNumber + Intl) | `formatPricePublic(item.price)` | linhas ~393–410 |
| `formatPrice` em `public-vehicle.ts` (retornava `"R$ 0"` fake) | `formatPricePublic(ad.price) ?? "Sob consulta"` | `adaptAdDetailToVehicle` |
| `formatBrl` local em `related-ads.ts` (só usado por `mapAdItemToListingCar`) | removido junto da função morta | — |

### Não tocados (e por quê)

| Local | Justificativa |
|-------|---------------|
| `frontend/components/painel/**` (Wizard, PlanSelector) | Privado, fluxo do anunciante. Fora do escopo P2-E. |
| `frontend/components/dashboard/**`, `app/admin/**`, `app/impulsionar/**` | Áreas autenticadas/admin. Decimal 2 casas é desejado lá. |
| `frontend/components/financing/FinancingLandingPageClient.tsx` | Simulador — `result.financedAmount` pode legitimamente ser zero, "R$ 0" como saída de cálculo é correto. |
| `frontend/components/common/FinancingSimulator.tsx` | Mesmo motivo (cálculo, não preço de anúncio). |
| `frontend/components/seo/LocalSeoLanding.tsx` | `avgPrice` e `ad.price` já têm null-check no caller; nenhum risco de "R$ 0". Marginal, **deixado para P3** se houver vontade de unificar. |
| `frontend/components/search/AppliedFilterChips.tsx` | Chip de filtro de min/max — não é preço de anúncio. |
| `frontend/lib/painel/publication-options-types.ts` (`formatBrlFromCents`) | Centavos → reais com 2 casas; semântica diferente. |

## 3. Labels territoriais centralizados

| Antes | Depois |
|-------|--------|
| `${normalized.city} (${normalized.state})` no AdCard | `normalized.locationLabel` (calculado por `buildPublicTerritoryLabel`) |
| `deriveCityDisplay` (cópia local em `public-vehicle.ts`) | Delega a `buildPublicTerritoryLabel` (mantida apenas como thin adapter) |
| `safeText(vehicle.city.split(" (")[0], "São Paulo")` (page do detalhe) | `cityNameFromVehicle(vehicle)` — sem fallback hardcoded |

### Já no contrato em rotas anteriores (P2-A/B/C/D)

`/`, `/comprar/estado/[uf]`, `/carros-em/[slug]`, `/carros-usados/regiao/[slug]`,
`/simulador-financiamento`, `/tabela-fipe`, `/anunciar` — já consumiam o
contrato via `normalizePublicAd` + `publicCatalogPageCopy`. Não houve
nada a centralizar lá nesta rodada.

## 4. Dead code removido / mantido

### Removido (zero callers — provado via grep + tsc)

| Arquivo | Tamanho | Como provei |
|---------|---------|-------------|
| `frontend/components/ads/AdDetailsPage.tsx` | ~620 linhas | Grep `from.*ads/AdDetailsPage` retornou só self. |
| `frontend/lib/ads/components/ads/AdDetailsPage.tsx` | ~530 linhas | Idem (duplicata legada). |
| `frontend/lib/ads/get-ad-details.tsx` | ~660 linhas | Único caller era esses dois dead files. |
| `frontend/components/vehicle/SellerSection.tsx` | ~210 linhas | Grep `SellerSection` só achou self-references. |
| `frontend/lib/vehicle/related-ads.ts::mapAdItemToListingCar` | ~50 linhas | Grep só achou self. Removido junto do `formatBrl` auxiliar. |
| `frontend/lib/ads/components/` (pasta vazia) | — | Limpa após remoção. |

Total: **~2.6k linhas** de código morto fora.

### Mantido com justificativa (P3 candidates)

| Item | Razão de manter |
|------|-----------------|
| `dealer_name` fallback em `AdCard.tsx:524`, `regional-facets.ts:171`, `ads-search.ts:288`, `catalog-helpers.ts:200`, `ad-badges.ts:108`, `ad-detail.ts:188` | Coluna legítima do payload (backend `users.business_name`). Backend ainda emite — não é defensivo "morto", é coalescência válida. Migrar para `dealership_name` em P3 quando backend convergir 100%. |
| `getAdDetails` referência em `scripts/project-audit.mjs:965` | Regex de auditoria que enumera nomes históricos. Não bloqueia. |

## 5. Smoke público

### Script

`scripts/smoke/public-contract-smoke.mjs` — Node 20+ portátil, zero deps.

### Comando padrão

```bash
node scripts/smoke/public-contract-smoke.mjs                 # prod
node scripts/smoke/public-contract-smoke.mjs --json          # CI-friendly
node scripts/smoke/public-contract-smoke.mjs --base=URL      # staging
```

### Resultado pré-deploy (commit `e0eba26d`)

```
70/70 checks passaram
```

- 15 rotas críticas: HTTP esperado, sem strings proibidas, sem fallback fake.
- Hrefs `/veiculo/*` extraídos de 5 rotas-catálogo (Home + Estado + Cidade + Regional).
- 8 detalhes abertos, todos com `x-middleware-ad: passed-valid` e zero hits proibidos.

### Resultado pós-deploy (commit `dbbebfae`)

Ver seção 7 abaixo.

## 6. Smoke pronto para cron (não ativado)

[docs/runbooks/public-contract-smoke-cron.md](docs/runbooks/public-contract-smoke-cron.md)
cobre três receitas:

- **A — Render Scheduled Job** (recomendado se já temos plano Render compatível).
- **B — GitHub Actions** com `*/30 * * * *` (custo estimado ~US$11/mês).
- **C — cron externo** (zero custo, sem HA).

Critérios propostos para ativar (todos precisam bater):

1. >1 incidente público em 30 dias com causa raiz "contrato quebrou e ninguém viu".
2. Time > 1 dev (escala enquanto solo).
3. Orçamento aprovado.

## 7. Resultado pós-deploy

Smoke rodado contra `https://www.carrosnacidade.com` ~7 min após push do
commit `dbbebfae`:

```
70/70 checks passaram
```

Transcript completo em
[reports/production/2026-05-25-p2-e-smoke-pos-deploy.txt](reports/production/2026-05-25-p2-e-smoke-pos-deploy.txt).

Highlights:

- 15 rotas críticas, todas com status esperado (200 ou 404 conforme contrato).
- Strings proibidas: zero hits em qualquer rota 200.
- Hrefs `/veiculo/*` extraídos: 5 catalog routes geraram amostra de 7 anúncios distintos; todos com `x-middleware-ad: passed-valid` e sem fallback fake / R$ 0 / São Paulo hardcoded.
- Falhas críticas: **0**.

## 8. Critérios de aceite

| # | Critério | Status |
|---|----------|--------|
| 1 | `formatPricePublic` usado nas superfícies públicas seguras | ✅ AdCard + public-vehicle |
| 2 | Nenhum preço público com double-formatting | ✅ AdCard usa label pronto |
| 3 | Nenhum `R$ 0` fake | ✅ teste cobre + smoke checa regex |
| 4 | `buildPublicTerritoryLabel` nas superfícies seguras | ✅ AdCard + public-vehicle |
| 5 | Nenhuma cidade `São Paulo/SP` hardcoded indevida | ✅ fallbacks removidos em 3 lugares |
| 6 | Smoke consolidado cobrindo as 15 rotas | ✅ `public-contract-smoke.mjs` |
| 7 | Smoke pronto para cron/documentado | ✅ runbook publicado, não ativado |
| 8 | 0 falhas críticas em produção | ✅ pré-deploy 70/70; pós-deploy veja §7 |
| 9 | Testes verdes | ✅ 1551/1551 vitest + tsc limpo |
| 10 | Relatório final | ✅ este documento |

## 9. Restrições respeitadas

- ✅ Sem mudança visual (apenas `priceLabel`/`locationLabel` no AdCard — texto idêntico ao anterior em ads válidos; só muda quando o preço/cidade está ausente, e nesse caso melhora "R$ 0" → "Sob consulta").
- ✅ Sem mudança em contrato comercial.
- ✅ Sem feature nova.
- ✅ Sem DML em produção.
- ✅ Sem fallback fake reaberto (o contrato veta).
