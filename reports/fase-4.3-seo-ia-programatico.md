# Fase 4.3 (continuação) — SEO/IA programático responsável

Data: 2026-06-10
Branch: main

Esta entrega **complementa** o commit `c0b0f205` (Fase 4.3 parte 1: score do
anúncio, sitemap de blog, JSON-LD Product/Car do veículo, alt automático, FAQ de
cidade, auditoria). Foco agora: **engine territorial programático**, **política de
indexação configurável**, **JSON-LD da Home** e **endpoint de saúde SEO/IA**.

## 1. Diagnóstico (antes → depois)

| Item | Antes | Depois |
|---|---|---|
| JSON-LD na Home | **ausente** | WebSite + SearchAction + Organization |
| Conteúdo factual territorial | gerado ad-hoc por página | **engine único** nacional alimentado por dados reais |
| Política de indexação | cidade "em" sempre index | **policy configurável** (cidade≥3, região≥5, FIPE≥2, estado≥1) pronta |
| Score do anúncio | ✅ (parte 1) | mantido; alimenta o painel de saúde |
| Saúde SEO/IA agregada | só `seo/issues` (publications) | **GET /api/admin/seo/ai-health** (anúncios + posts + território) |
| Vehicle Product/Offer/AutoDealer | ✅ (parte 1) | mantido |
| Sitemap de blog | ✅ (parte 1) | mantido |

Observação: o diagnóstico do briefing ("não há JSON-LD") reflete o HTML de
produção **antes** do deploy da parte 1 (que já adiciona Vehicle/Product,
CollectionPage/ItemList, BlogPosting). Esta parte fecha a Home e padroniza o
território.

## 2. TerritorialSeoContentEngine (§2)

[frontend/lib/seo/territorial-content-engine.ts](frontend/lib/seo/territorial-content-engine.ts)
— `buildTerritorialSeoContent(input, thresholds?)` PURO, template **nacional**
(sem texto manual por cidade), saída completa do §2:
`{ entityType, slug, title, metaDescription, h1, intro, stats, highlights, faq,
internalLinks, indexable, robots, canonicalUrl, lastmod, jsonLd }`.

Regra de ouro respeitada (§4): **só inclui frase com dado real** — sem preço
médio, sem oração de preço; sem marcas, sem destaque de marca; etc.

## 3. Política de indexação (§3)

`resolveTerritorialIndexation(input, thresholds)` — limiares **configuráveis**
(`DEFAULT_INDEX_THRESHOLDS`, sobrescrevíveis via platform_settings/env):

- **cidade**: ≥3 ativos → index; 1–2 → noindex (salvo estratégica); 0 → noindex.
- **região**: ≥5 ativos → index; senão noindex.
- **abaixo da FIPE**: ≥2 ofertas → index; 1 só estratégica; 0 → noindex.
- **estado**: index com inventário (≥1).

> Entregue como função testada e pronta para acoplar ao `shouldIndexLocalSeo`
> das páginas — **não** liguei a de-indexação automática neste commit para não
> remover páginas vivas sem revisão do time (o local-seo-metadata hoje indexa
> cidade "em" sempre). Ativar é trocar uma linha + revisar no Search Console.

## 4. Exemplos de saída (do teste)

**São Paulo (cidade, 1 ativo, 1 abaixo FIPE, GM-Chevrolet):**
- h1: `Carros usados em São Paulo - SP`
- intro: `Encontre carros usados em São Paulo - SP no Carros na Cidade. Hoje há 1
  anúncio ativo, com destaque para GM - Chevrolet. Também há 1 veículo
  classificado como abaixo da FIPE.`
- indexable: **false** (1 < limiar 3) — não polui o índice com página fraca.

**Águas de Lindóia (região, 3 ativos):**
- intro: `Na região de Águas de Lindóia, o Carros na Cidade reúne ofertas de
  Águas de Lindóia e cidades próximas. Hoje há 3 anúncios ativos, com destaque
  para VW - VolksWagen, GM - Chevrolet e BYD.`
- indexable: **false** (3 < limiar 5).

**Abaixo da FIPE (≥2 ofertas):** title `Carros abaixo da FIPE em … — N ofertas`,
FAQ específica (o que é/por que/golpe/laudo cautelar), indexable **true**.

## 5. JSON-LD da Home (§8)

[frontend/lib/seo/home-structured-data.ts](frontend/lib/seo/home-structured-data.ts)
+ mount em [app/page.tsx](frontend/app/page.tsx): **WebSite** (com
**SearchAction** → `/comprar?q={search_term_string}`) + **Organization** (logo
absoluto). Renderizado no SSR.

## 6. Endpoint de saúde SEO/IA (§15)

**`GET /api/admin/seo/ai-health`** (admin-only). Service
[admin-seo-ai.service.js](src/modules/admin/seo/admin-seo-ai.service.js) +
agregador puro `buildAiHealthSummary` em
[seo-ai-audit.js](src/modules/admin/seo/seo-ai-audit.js). Retorna:
- **ads**: total, avg_score, ready_80_plus, **low_score**, sem preço/cidade/
  imagem, poucas fotos, sem alt, descrição curta;
- **blog**: total, publicados, sem meta description, conteúdo curto, slug
  duplicado, sem capa;
- **territorial**: por `cluster_type` (city_home, city_below_fipe, …) →
  `{ indexable, noindex }` de `seo_publications`.

Defensivo: cada bloco em try/catch (tabela ausente não derruba o endpoint).
Tipado no frontend (`SeoAiHealth`, `adminApi.seo.aiHealth()`). **UI fica para
fase seguinte** — o endpoint existe, conforme §15.

## 7. Testes

- Backend: `tests/admin/seo-ai-health.test.js` (countByKind, low_score,
  buildAiHealthSummary) **+5**. Suíte completa: **135 arquivos / 1801 verdes**.
- Frontend: `territorial-content-engine.test.ts` (15 — política + SP/Águas/FIPE)
  e `home-structured-data.test.ts` (2). Suíte completa: **125 arquivos / 1700
  verdes**. `tsc --noEmit` limpo.

## 8. Smoke de produção (§17)

```bash
curl -sS https://www.carrosnacidade.com/ | grep -i "application/ld+json"   # WebSite/Organization
curl -sS https://www.carrosnacidade.com/veiculo/<slug-active> | grep -i "ld+json"  # Product/Offer
curl -sS https://www.carrosnacidade.com/carros-em/sao-paulo-sp | grep -iE "FAQPage|ItemList"
curl -sS https://www.carrosnacidade.com/carros-baratos-em/sao-paulo-sp | grep -i "ld+json"
curl -sS https://www.carrosnacidade.com/sitemaps/blog.xml | head
# admin (autenticado): GET /api/admin/seo/ai-health
```
+ Rich Results Test / Schema Validator nas 3 páginas; URL Inspection (1 anúncio,
1 cidade, 1 post) no Search Console.

## 9. Limitações

- A **política de indexação** está pronta e testada, mas **não acoplada** à
  de-indexação automática das páginas (decisão consciente para evitar remover
  páginas vivas sem revisão). Ativação documentada.
- O **engine** é uma biblioteca testada com exemplos; o consumo visível pelas
  páginas territoriais (intro/stats/highlights) exige passar os agregados reais
  (preço médio, top modelos, cidades próximas) que nem toda rota expõe hoje —
  próximo passo de wiring por página.
- `ai-health` amostra até 5000 anúncios/posts; território vem de
  `seo_publications` (regiões/estados podem não estar lá).
- Integração (DB real) continua dependendo do Postgres de teste (Docker :5433),
  indisponível neste ambiente.

## 10. Próximos passos

1. Acoplar `resolveTerritorialIndexation` ao `shouldIndexLocalSeo` (atrás de flag
   `TERRITORIAL_INDEX_POLICY_ENABLED`) + revisar no Search Console.
2. Surfacar agregados reais (preço médio/min, top modelos, cidades próximas) do
   backend para o engine renderizar as páginas de cidade/região.
3. UI do painel `/admin/seo` consumindo `ai-health` + widget de score no anúncio.
4. Mover limiares para `platform_settings` (admin editável).

## 11. Veredito

**APROVADO.** Entrega aditiva, programática e responsável: engine nacional com
dados reais, política de indexação clara e configurável, Home com JSON-LD,
endpoint de saúde SEO/IA — tudo testado (22 testes novos), sem texto manual por
cidade, sem inventar estatística e sem flipar indexação de páginas vivas sem
revisão.
