# Fase 4.3 — SEO/IA: estruturação semântica (anúncio, território, blog)

Data: 2026-06-10
Branch: main

## 1. Diagnóstico SEO/IA atual (auditoria)

O portal **já é maduro** em SEO. O que já existia e está **OK** (mantido):

- **/veiculo/[slug]**: `generateMetadata` com canonical/OG; JSON-LD Vehicle+Offer,
  FAQPage, WebPage e BreadcrumbList; **404 real** (não soft-404) para anúncio
  inexistente/inativo; dados via `getPublicAdAndVehicle`.
- **Páginas territoriais**: `/carros-em/[slug]` (canônica) com CollectionPage +
  BreadcrumbList + ItemList; `/carros-baratos-em` e `/carros-automaticos-em`
  (factory `createLocalSeoPage`, canonical/robots corretos — automáticos é
  noindex consolidando em /carros-em); `/carros-usados/[uf]` (ItemList);
  `/carros-usados/regiao/[slug]` (CollectionPage+Breadcrumb+ItemList+Place, atrás
  de flags). Helpers ricos em `lib/seo/*`.
- **Sitemaps**: índice `sitemap.xml` + core/content/cities/brands/models/
  opportunities/below-fipe/local-seo + regiao por estado; filtros de status e
  lastmod reais no backend (`sitemap-public.repository`). **robots.ts** permite
  `/blog/`, `/veiculo/`, territoriais; bloqueia `/api/`, `/dashboard`, etc.
- **Observabilidade SEO**: `publication-validator` + `GET /api/admin/seo/issues`
  (focado em `seo_publications`).

**Lacunas atacadas nesta fase:** (a) **blog não tinha sitemap**; (b) anúncio sem
score de qualidade SEO/IA; (c) sem alt automático de imagem; (d) JSON-LD do
veículo sem Product/ImageObject/AutoDealer; (e) sem auditoria SEO/IA de
anúncios/posts; (f) páginas de cidade sem FAQ.

## 2. Arquivos alterados/criados

**Backend (`src/`)**
- `modules/admin/ads/ad-seo-ai-score.js` — **novo**: `calculateAdSeoAiScore`,
  `buildAdImageAlt`, `countAdImages`, `scoreBand`.
- `modules/admin/ads/admin-ads.service.js` — `getAdById` agora anexa `seo_ai`.
- `modules/admin/seo/seo-ai-audit.js` — **novo**: `analyzeAds`,
  `analyzeBlogPosts`, `summarizeProblems` (puros).
- `scripts/seo/audit-seo-ai.mjs` — **novo**: CLI de auditoria (`--json`, `--limit`).

**Frontend (`frontend/`)**
- `lib/seo/blog-sitemap.ts` + `app/sitemaps/blog.xml/route.ts` + entrada no
  `app/sitemap.xml/route.ts` — **novo sitemap de blog**.
- `lib/seo/vehicle-image-alt.ts` — **novo**: alt automático + `splitCityState`.
- `lib/seo/vehicle-structured-data.ts` — **novo**: `buildVehicleJsonLd`.
- `app/veiculo/[slug]/page.tsx` — usa o builder (Product+Car+Offer+ImageObject+
  AutoDealer) e o alt no OG.
- `lib/seo/faq.ts` + `components/seo/FaqBlock.tsx` — **novo**: FAQ + FAQPage.
- `app/carros-em/[slug]/page.tsx` — monta FAQ visível + FAQPage.
- `lib/admin/api.ts` — tipo `AdSeoAi` em `AdDetail.seo_ai`.

## 3. JSON-LD implementado (§3)

`buildVehicleJsonLd` emite **um nó `["Product","Car"]`** (Brasil não tem
eligibility de Vehicle Listing — usamos Product/Offer/Car compatível):
- `brand` (Brand), `name`, `category`, `model`, `vehicleConfiguration` (versão),
  `vehicleModelDate`, `fuelType`, `vehicleTransmission`, `color`, `bodyType`,
  `mileageFromOdometer` (QuantitativeValue/KMT), `sku`, `areaServed` (City);
- `image[0]` como **ImageObject** com `caption` = alt; demais como URLs;
- `offers` = **Offer** (`priceCurrency` BRL, `price`, `availability` InStock,
  `itemCondition` **UsedCondition**, `url`, `seller`);
- `seller` = **AutoDealer** (nome, telefone, endereço, url da loja) quando loja;
  **Person** quando particular.
- Sem preço → Offer **sem** `price` (não inventa). Sem nome → retorna `null` (não
  emite schema inválido). FAQPage/WebPage/BreadcrumbList do veículo mantidos.

## 4. Score SEO/IA do anúncio (§4)

`calculateAdSeoAiScore(ad)` → `{ score 0-100, band, suggested_image_alt,
checklist[], missing[], recommendations[] }`. 19 critérios ponderados (soma 100):
título, marca/modelo, versão, ano, **preço (10)**, cidade, km, combustível,
câmbio, cor, **fotos 3+ (9)**, imagem principal, **descrição (8)**, FIPE, diff
FIPE, anunciante, contato, status ativo, frescor (updated_at ≤90d). Faixas:
0–49 **fraco**, 50–79 **aceitável**, 80–100 **pronto**. Exposto em
`GET /api/admin/ads/:id` (`ad.seo_ai`) com checklist e recomendações — tipado no
frontend (`AdSeoAi`). **Não promete ranking** — é "Qualidade SEO/IA do anúncio".

> UI: o dado já trafega tipado pelo BFF admin (`/api/admin/[...path]`). Falta
> apenas o widget visual no detalhe do anúncio (próximos passos).

## 5. Páginas territoriais + FAQ (§5/§6/§7)

- FAQ **visível** na cidade (`/carros-em/[slug]`): 5 perguntas reais e
  city-contextuais (encontrar carros, compra segura, abaixo da FIPE,
  documentação, antes de fechar) via `buildCityFaqEntries` + `FaqBlock`.
- **FAQPage só é emitido porque está visível** (`buildFaqPageJsonLd` → `null`
  quando vazio) — regra do §6 respeitada.
- `buildBelowFipeFaqEntries` (o que é/por que/golpe/laudo cautelar) pronto para
  montar na página abaixo-da-FIPE (factory). Os demais blocos territoriais
  (H1, contagem, top marcas, ItemList, breadcrumb) já existiam e foram mantidos.

## 6. Imagens (§12)

`buildVehicleImageAlt` gera **"[Marca] [Modelo] [Ano] usado em [Cidade] - [UF]"**
(editável depois). Usado no OG do veículo e no `caption` do ImageObject. Há um
espelho no backend (`buildAdImageAlt`) para a auditoria.

## 7. Sitemaps e lastmod (§10)

**Lacuna corrigida:** novo `/sitemaps/blog.xml` lista os posts **published** do
CMS (`/blog/<slug>`), `lastmod = updated_at` (→ published_at), **exclui
não-indexáveis** e slugs inválidos; adicionado ao índice `sitemap.xml`. ISR 1h +
tag `public-blog` (publicar/despublicar revalida).

## 8. Observabilidade SEO/IA (§14)

`scripts/seo/audit-seo-ai.mjs` (somente leitura) varre anúncios ativos e posts
CMS e reporta: anúncio sem preço/cidade/imagem (alta), poucas fotos/descrição
curta (baixa), post publicado sem meta description/conteúdo curto/sem capa, slug
inválido, **slug duplicado** (alta). Imprime score médio e nº de anúncios
"prontos" (80+). `--json` para integração.

## 9. Testes (§15)

Todos os artefatos puros têm teste:
- Backend: `tests/admin/ad-seo-ai-score.test.js` (score, alt, contagem de imagem,
  faixas, frescor) e `tests/admin/seo-ai-audit.test.js` (analisadores). **+24**.
- Frontend: `vehicle-image-alt`, `vehicle-structured-data` (Product/Offer/
  ImageObject/AutoDealer/Person, sem-preço, sem-nome→null), `faq`
  (FAQPage só com conteúdo), `blog-sitemap` (noindex/lastmod/slug). **+24**.
- Suítes completas backend e frontend verdes; `tsc --noEmit` do frontend limpo.

## 10. Smoke de produção (§16)

```bash
# A) Anúncio — JSON-LD Product/Offer
curl -sS https://www.carrosnacidade.com/veiculo/<slug> | grep -i "application/ld+json"
#    Validar Product + Offer (UsedCondition) no Rich Results Test.
# B) Cidade — FAQPage + ItemList
curl -sS https://www.carrosnacidade.com/carros-em/atibaia-sp | grep -iE "FAQPage|ItemList"
# C) Sitemap de blog (novo)
curl -sS https://www.carrosnacidade.com/sitemaps/blog.xml | head
curl -sS https://www.carrosnacidade.com/sitemap.xml | grep -i "blog.xml"
# D) Auditoria
node scripts/seo/audit-seo-ai.mjs --json
```
+ URL Inspection (Search Console) em 1 anúncio, 1 cidade e 1 post; conferir
rendered HTML e solicitar recrawl.

## 11. Limitações

- **Score no admin**: backend pronto e tipado; falta o widget visual no detalhe
  do anúncio (UI).
- **alt persistido**: o alt é gerado on-the-fly; não há coluna `alt` em
  `vehicle_images` (geração automática + edição manual exigiria migration).
- **FAQ de cidade**: o texto é city-contextual mas estruturalmente parecido entre
  cidades — trade-off consciente entre §7 (ter FAQ) e §9 (evitar duplicado em
  escala). Monitorar no Search Console; se necessário, restringir a cidades com
  inventário.
- **Sitemap de blog**: limitado a 50 posts (cap do endpoint público) — suficiente
  hoje; paginar quando o blog crescer.
- **FAQ abaixo-da-FIPE**: helper pronto, ainda não montado (página é factory).

## 12. Próximos passos

1. Widget "Qualidade SEO/IA" no `/admin/anuncios/[id]` consumindo `ad.seo_ai`.
2. Montar `buildBelowFipeFaqEntries` na página abaixo-da-FIPE.
3. Coluna `alt` em `vehicle_images` (default = alt automático, editável).
4. Agendar `audit-seo-ai.mjs` (cron) e/ou expor um painel admin SEO/IA.

## 13. Veredito

**APROVADO.** Fase aditiva e de baixo risco sobre uma base de SEO já madura:
preenche as lacunas concretas (score do anúncio, sitemap de blog, alt automático,
Product/ImageObject/AutoDealer, FAQ de cidade, auditoria SEO/IA) com 48 testes
novos, sem texto em massa/spam, sem schema sem conteúdo visível e sem quebrar as
regras de canonical/robots/noindex existentes.
