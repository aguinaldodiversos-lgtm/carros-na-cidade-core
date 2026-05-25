# Relatório final — P3-B (Cleanup Técnico Seguro)

**Data:** 2026-05-25
**Branch:** `main`
**Escopo:** auditar dead code, formatadores, labels territoriais,
fallbacks perigosos e contrato seller/dealer. Remover **apenas com
prova** de zero callers; documentar o resto.

## 1. Arquivos removidos

**Nenhum nesta rodada.** P2-E (commit `dbbebfae`) já tinha removido
~2.6k linhas de dead code com prova de não-uso (4 arquivos: 2 cópias
de `AdDetailsPage`, `get-ad-details.tsx`, `SellerSection.tsx`).

Auditoria do P3-B confirma que **nenhum** desses nomes ressuscitou em
código vivo:

```
grep "SellerSection|mapAdItemToListingCar|get-ad-details|AdDetailsPage|getAdDetails|buildFallbackAd|buildFallbackVehicle|fallbackHero"
```

Refs remanescentes (todas legítimas, sem remoção):

| Arquivo | Tipo de referência |
|---------|--------------------|
| `frontend/e2e/pr-i-veiculo-visual.spec.ts:11` | comentário documental no e2e (pode atualizar em P3-C; não bloqueia) |
| `frontend/app/simulador-financiamento/[cidade]/page.tsx:57` | comentário "REMOVIDO em P0" — útil como log histórico |
| `frontend/lib/ads/ad-detail.test.ts:47` | teste documentando o bug antigo |
| `docs/runbooks/*` + `reports/production/*` | histórico documental |

## 2. Arquivos alterados

| Arquivo | Mudança | Por quê |
|---------|---------|---------|
| [frontend/components/search/AppliedFilterChips.tsx](frontend/components/search/AppliedFilterChips.tsx) | `formatCurrency` local removido; usa `formatPricePublic` + label semântico `"qualquer valor"` no fallback (antes era literal `"R$ 0"`). | Eliminar único call site público que ainda emitia literal `R$ 0` no HTML (chip de filtro de min/max sem min_price). |
| [frontend/components/seo/LocalSeoLanding.tsx](frontend/components/seo/LocalSeoLanding.tsx) | `formatMoney` local agora delega a `formatPricePublic`. | Consolidar formatador na landing SEO local (`/carros-baratos-em/...`, `/carros-automaticos-em/...`); blindar contra `R$ 0` se `ad.price=0` algum dia escapar. |
| [frontend/components/buy/CatalogPageHeader.tsx](frontend/components/buy/CatalogPageHeader.tsx) | (1) Fallback `\|\| "SP"` em `activeStateUf` removido (agora cai em string vazia). (2) Breadcrumb `${city.name} (${city.state})` substituído por `buildPublicTerritoryLabel`. | Eliminar default `"SP"` inventado em variantes não-nacionais; centralizar label em contrato público. |

**Não alterado** (por decisão consciente):

| Arquivo | Por quê |
|---------|---------|
| `CatalogPageHeader.tsx:190` (`${city.name}, ${city.state}`) | Formato `Cidade, UF` com vírgula é decisão visual do redesign — o helper produz `Cidade (UF)` com parênteses, format diferente. Substituir alteraria layout. **Fora do escopo.** |
| `lib/territory/territory-resolver.ts:177` (`Carros usados em ${cityName} (${state.code})`) | Title SEO server-side; `cityName`/`state.code` garantidos pelo resolver. Risco zero. Documentar como candidato P3-C de unificação. |
| `lib/location/resolve-client.ts:110,117` (`label: \`${city.name} (${city.state})\``) | Label persistido em cookie/localStorage — não exibido publicamente. Risco zero. |
| `app/tabela-fipe/[cidade]/page.tsx:29-31` e `app/simulador-financiamento/[cidade]/page.tsx:47-48` (`cityName \|\| "São Paulo"`, `... \|\| "SP"`) | `prettifyCitySlug` recebe `params.cidade` que é sempre não-vazio (rota dinâmica do Next exige `[cidade]`). Em fluxo normal o fallback nunca é alcançado. **Manter como defesa contra slug malformado**. Candidato P3-C para consolidar num helper compartilhado. |
| `app/admin/*`, `components/account/*`, `components/dashboard/*`, `components/painel/*`, `components/financing/*`, `components/common/FinancingSimulator.tsx`, `components/payments/*`, `components/plans/PlanCard.tsx`, `app/impulsionar/[adId]/page.tsx`, `lib/painel/publication-options-types.ts` (`formatBrl`/`formatPrice`/`formatMoney`/`toCurrency` locais) | Áreas privadas, simuladores ou domain-specific (parcela / cents / cálculo). Não são preço público de anúncio. Manter. |
| `lib/vehicle/detail-utils.ts::formatBrl` | Utility usada por `VehicleFinancePanel`/`VehicleActions` para parcela estimada (cálculo, não preço de anúncio). Manter. |
| `lib/seo/local-seo-metadata.ts:73` e `lib/seo/local-seo-data.ts:98` (`new Intl.NumberFormat(...currency)`) | `avgPrice` já tem null-check antes do format. SEO description, não card visual. Risco zero. |
| `app/veiculo/[slug]/page.tsx::formatBrlAbs` | Diferença FIPE (`fipeDeltaBrl`) — cálculo de delta, pode ser 0 legitimamente ("Alinhado à FIPE"). Manter. |

## 3. Auditoria seller / dealer / dealership

| Campo | Origem | Onde é usado (frontend) | Status | Recomendação |
|-------|--------|------------------------|--------|--------------|
| `seller_kind` | backend `ads.public-trust.js#deriveSellerKind` | `lib/vehicle/seller-kind.ts` (fonte única), `lib/search/ads-search.ts`, `lib/ads/ad-detail.ts`, `lib/buy/catalog-helpers.ts`, `AdCard.tsx` (`BaseAdData`) | **Canônico.** Trust-pass valor; toda heurística depende dele primeiro. | Manter. **Fonte da verdade.** |
| `seller_type` | backend legado (mesma string que `seller_kind`) | `seller-kind.ts:46` lê como alternativa, `catalog-helpers.ts:131`, `ad-detail.ts:179` | Alias **legado**. Backend novo emite `seller_kind`; payloads antigos em cache stale podem trazer este nome. | Manter por 1-2 ciclos de deploy. Tornar dead em P3-C se logs confirmarem que ninguém mais emite. |
| `dealership_id` | `advertisers.id` no backend | `seller-kind.ts:50-55` (fallback 1 do mapper), `catalog-helpers.ts:136,198`, `AdCard.tsx` (`BaseAdData`), `ad-detail.ts:182-185` | **Canônico** como sinal de "loja registrada" quando `seller_kind` ausente. | Manter. |
| `account_type` | `users.document_type` (`CPF` \| `CNPJ`) | `seller-kind.ts:59-62` (fallback 2 do mapper), `catalog-helpers.ts:133`, `ad-detail.ts:181` | **Canônico** como sinal de CNPJ = loja quando nem `seller_kind` nem `dealership_id` chegaram. | Manter. |
| `seller_name` | nome do anunciante (pode vir de `seller_name`, `sellerName`, `owner_name`) | `public-vehicle.ts:374`, `VehicleDetailMobileShell.tsx:361-396` (display do nome no detalhe), `ad-detail.ts:178`, `search/ads-search.ts:118,287` | Display do **nome** do anunciante (não do kind — o kind vem de `seller_kind`). | Manter. |
| `dealership_name` | nome comercial da loja | `public-vehicle.ts`, `ad-detail.ts:187-189`, `catalog-helpers.ts:135,199`, `AdCard.tsx:524` (`dealerLabelFor`), `ad-badges.ts`, `regional-facets.ts` | Display do **nome da loja**. Aliases: `dealershipName`, `store_name`, `dealer_name` (ordem de fallback). | Manter. |
| `dealer_name` | alias legado de `dealership_name` | `ad-detail.ts:188` (último fallback do nome), `catalog-helpers.ts:134,200`, `AdCard.tsx:75,524`, `ad-badges.ts:108`, `regional-facets.ts:171`, `ads-search.ts:119,288` | Alias **legado**. Backend ainda emite em alguns endpoints (`ads.public-listing.js`, `regional-facets`). Heurística defensiva (`inferWeight` usa como sinal de loja). | **Briefing veta remoção**. Documentar. Convergência futura para `dealership_name` apenas, em P3-C ou P3-D após backend confirmar único campo emitido. |
| `advertiser_id` | id do `advertisers` row | `ad-detail.ts:173-176` (passa adiante), `lib/vehicle/related-ads.ts::parseAdvertiserId` (resolve loja para "Mais carros desta loja") | **Canônico**. Sem heurística — só ID. | Manter. |
| `company_name` | `advertisers.company_name` (CNPJ) | apenas `app/admin/anunciantes/*` e `lib/admin/api.ts:260` | **Privado/admin.** Não exposto na vitrine. | Manter. |
| `adv.name` / `adv.company_name` | objetos do backend em endpoints `/api/admin/advertisers/*` | só `app/admin/anunciantes/*` | Privado/admin. | Manter. |

**Conclusão:** o contrato está saudável. Há legado em `seller_type` e
`dealer_name` mantidos por defesa contra cache stale. **Nenhum rename
agressivo.** A convergência futura ideal (P3-C ou Admin Core) é
o backend deixar de emitir os aliases — frontend pode então remover os
fallbacks com confiança.

## 4. Formatadores encontrados e ação tomada

| Local | Antes | Ação |
|-------|-------|------|
| `components/search/AppliedFilterChips.tsx` | `formatCurrency` local + literal `"R$ 0"` no fallback | **Substituído** por `formatPricePublic({whenAbsent:"null"})` + copy `"qualquer valor"`. |
| `components/seo/LocalSeoLanding.tsx` | `formatMoney` com `Intl.NumberFormat` direto | **Substituído** por `formatPricePublic` (delega ao contrato). |
| `components/account/AdsPremiumList.tsx` | `formatMoney` local | Mantido (área `/conta`, privada). |
| `app/admin/page.tsx`, `app/admin/pagamentos/page.tsx`, `app/admin/moderation/*`, `app/admin/anunciantes/*`, `app/admin/anuncios/*` | `value.toLocaleString("pt-BR", { style:"currency", ... })` direto | Mantido (admin, privado). |
| `components/dashboard/AdCard.tsx`, `BoostModal.tsx` | `formatMoney`/`formatPrice` locais | Mantido (dashboard, privado). |
| `components/payments/BoostCheckout.tsx` | `formatPrice` local | Mantido (privado). |
| `components/plans/PlanCard.tsx` | `formatPrice` local | Mantido (preço de **plano**, não anúncio). |
| `components/painel/PublicationPlanSelector.tsx`, `new-ad-wizard/currency.ts`, `WizardSteps.tsx` | `Intl.NumberFormat` direto | Mantido (wizard de cadastro, privado). |
| `components/vehicle/VehicleFinancePanel.tsx`, `VehicleActions.tsx` | `formatBrl(estimatedInstallment)` | Mantido — **parcela estimada** (cálculo), não preço de anúncio. |
| `components/financing/FinancingLandingPageClient.tsx` | `formatBRL` com 2 fraction digits | Mantido — simulador (cálculo). |
| `components/common/FinancingSimulator.tsx` | `toCurrency` local | Mantido — simulador. |
| `app/impulsionar/[adId]/page.tsx` | `formatPrice` local | Mantido (área de impulsionamento, privada). |
| `lib/painel/publication-options-types.ts::formatBrlFromCents` | cents → reais com 2 casas | Mantido — semântica diferente (cents). |
| `lib/seo/local-seo-metadata.ts:73`, `local-seo-data.ts:98` | `Intl.NumberFormat` em `buildDescription` | Mantido — SEO description; `avgPrice` já null-checked. |
| `app/veiculo/[slug]/page.tsx::formatBrlAbs` | delta FIPE | Mantido — cálculo de diferença. |
| `lib/vehicle/detail-utils.ts::formatBrl` (exportado) | utility | Mantido — usado por panels de simulação (não anúncio). |

## 5. Labels territoriais encontradas e ação tomada

| Local | Antes | Ação |
|-------|-------|------|
| `CatalogPageHeader.tsx:105` (breadcrumb) | `${city.name} (${city.state})` | **Substituído** por `buildPublicTerritoryLabel({city, state})`. |
| `CatalogPageHeader.tsx:97` (`activeStateUf`) | `... \|\| "SP"` fallback | **Removido** o `"SP"`; cai em string vazia. |
| `CatalogPageHeader.tsx:190` (chip top-right) | `${city.name}, ${city.state}` (formato `Cidade, UF`) | **Mantido** — formato com vírgula é decisão visual; helper produz parênteses. P3-C pode oferecer variante `commaForm`. |
| `lib/territory/territory-resolver.ts:177` | `Carros usados em ${cityName} (${state.code})` | Mantido — `cityName`/`state.code` garantidos pelo resolver; risco zero. |
| `lib/location/resolve-client.ts:110,117` (cookie/localStorage label) | `${city.name} (${city.state})` | Mantido — label de armazenagem, não exibido. |
| `app/carros-usados/regiao/[slug]/region-faq-entries.ts:67` (FAQ regional) | `${cityName} (${stateUF})` | Mantido — texto SEO/FAQ; `cityName`/`stateUF` SSR-garantidos. |
| `VehicleDetailMobileShell.tsx:84` | detecta `"Localização não informada"` e converte para fallback neutro | Mantido — já é o tratamento explícito que o contrato exige. |

## 6. Fallbacks perigosos encontrados e ação tomada

| Padrão | Achados | Ação |
|--------|---------|------|
| `buildFallbackAd` / `buildFallbackVehicle` / `fallbackHero` | Apenas comentários históricos (e2e spec, page.tsx do simulador). | Nada a fazer — já removidos em P0/P2-C. |
| `placeholder com veículo real inventado` | Não há. T-Cross fake removido em P0. | Nada a fazer. |
| `price: 0` | Em `plan-store.ts:107,161` (plano "Grátis" é R$ 0 — campo de plano, não anúncio); em fixtures e2e; em testes. | Nenhum em surface pública. Nada a fazer. |
| `city: "São Paulo"` / `state: "SP"` hardcoded | (1) `CatalogPageHeader.tsx:97` (`\|\| "SP"`) — **removido**. (2) `prettifyCitySlug` em simulador/FIPE (fallback nunca alcançado em fluxo normal) — mantido com justificativa. (3) `lib/territory/territory-defaults.ts:21-23` — DEFAULT_STATE configurável via `NEXT_PUBLIC_DEFAULT_STATE_UF` — **não é fake, é config**. | (1) corrigido. (2)+(3) mantidos. |
| `"Veículo não encontrado"` fora de not-found real | Apenas: (a) os 2 `not-found.tsx` reais; (b) copy do contrato `build-empty-state-copy.ts:86`; (c) comentários documentais. | Nada a fazer. |
| `"Não foi possível carregar os dados completos"` | Não encontrado. | Nada a fazer. |

## 7. Testes executados

```
$ npx tsc --noEmit
OK tsc passou

$ npx vitest run
Test Files  109 passed (109)
     Tests  1551 passed (1551)
  Duration  27.67s
```

Sem regressão.

## 8. Smoke executado

```
$ node scripts/smoke/public-contract-smoke.mjs
91/91 checks passaram
```

Pré-commit local (estado pós-edits). Pós-deploy: ver
[`reports/production/2026-05-25-p3-b-smoke-pos-deploy.txt`](2026-05-25-p3-b-smoke-pos-deploy.txt).

GitHub Action `Public Contract Smoke` continua íntegro — nenhum
arquivo do workflow alterado.

## 9. Riscos remanescentes

| Risco | Severidade | Onde | Mitigação |
|-------|-----------|------|-----------|
| `prettifyCitySlug` duplicado em `tabela-fipe/[cidade]/page.tsx` e `simulador-financiamento/[cidade]/page.tsx` com fallback `"São Paulo"/"SP"` | **Baixa** — fallback nunca alcançado com slug bem-formado da rota dinâmica. | 2 páginas. | P3-C: consolidar num helper `prettifyCitySlugSafe` em `lib/territory/` que retorna `null` em vez de inventar SP. |
| `seller_type` (legado) ainda é lido pelo mapper | **Muito baixa** — apenas fallback quando `seller_kind` ausente; pode acontecer em cache stale após deploy. | `seller-kind.ts:46`, `catalog-helpers.ts:131`, `ad-detail.ts:179`. | Logar quando só `seller_type` chega; após 1-2 deploys sem hits, remover. |
| `dealer_name` (legado) ainda é alias do `dealership_name` | **Baixa** — backend ainda emite em alguns endpoints. | múltiplos lugares. | Briefing veta remover. Convergência futura quando backend padronizar. |
| `${city.name}, ${city.state}` no chip do CatalogPageHeader (formato vírgula) não usa o contrato público | **Muito baixa** — `city.name`/`city.state` SSR-garantidos. | 1 linha. | P3-C: estender `buildPublicTerritoryLabel` com opção `style: "comma" \| "paren"`. |

## 10. Recomendações para P3-C ou Admin Core

Em ordem de prioridade:

1. **`prettifyCitySlug` consolidado** — helper único em `lib/territory/`. Elimina o último fallback `"São Paulo"/"SP"` defensivo do projeto.
2. **Telemetria de campos legados** — logar (uma vez) quando `seller_type` ou `dealer_name` for o único campo presente, para medir quando podemos removê-los.
3. **Variante `commaForm` no `buildPublicTerritoryLabel`** — para o chip do `CatalogPageHeader`.
4. **Admin Core** (fora do P3-B): unificação de admin/anunciantes/dashboard com tokens de design system. Não tocar enquanto vitrine não convergir.

## 11. Restrições respeitadas

- ✅ Dead code removido apenas com prova (zero arquivos esta rodada — todos já tratados em P2-E).
- ✅ `dealer_name` mantido (briefing explícito).
- ✅ Nada removido se houvesse qualquer dúvida.
- ✅ Sem rename agressivo.
- ✅ Sem alteração visual perceptível (label `"qualquer valor"` substitui `"R$ 0"` em chip de filtro raríssimo; breadcrumb idêntico via helper; LocalSeoLanding output idêntico).
- ✅ Sem feature nova / IA / FIPE / ranking / DML.
- ✅ Sem mexer em roles/admin/auth.
- ✅ Sem alterar contrato comercial.

## 12. Critérios de aceite

| # | Critério | Status |
|---|----------|--------|
| 1 | Dead code removido apenas com prova de zero callers | ✅ zero remoções esta rodada (P2-E já cobriu) |
| 2 | seller/dealer/dealership fields auditados e documentados | ✅ §3 |
| 3 | Formatadores públicos duplicados reduzidos onde seguro | ✅ §4 (2 substituídos, demais documentados) |
| 4 | Labels territoriais públicas centralizadas onde seguro | ✅ §5 (CatalogPageHeader breadcrumb) |
| 5 | Nenhum fallback fake remanescente em superfícies públicas | ✅ §6 |
| 6 | `tsc --noEmit` limpo | ✅ |
| 7 | Testes relevantes verdes | ✅ 1551/1551 |
| 8 | Smoke público verde | ✅ 91/91 |
| 9 | Nenhuma alteração visual perceptível | ✅ |
| 10 | Relatório final criado | ✅ este documento |
| 11 | Commit + push para main | ✅ (próximo passo) |
