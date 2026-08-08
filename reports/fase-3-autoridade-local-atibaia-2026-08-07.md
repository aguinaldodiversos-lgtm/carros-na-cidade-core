# Fase 3 — Autoridade local, profundidade temática e SEO programático

**Branch:** `codex/seo-phase3-local-authority-atibaia`
**Base:** `036dc458` (Fase 2B.1 fechada)
**Data:** 2026-08-07
**Deploy:** não feito. **Merge:** não feito.

---

## 1. Estado inicial

```text
branch base .... codex/seo-phase-2b1-sitemap-resilience
commit inicial . 036dc4589535fa5e2439ae8f3f210c6ee58fef9d
git status ..... clean (nothing to commit)
branch criada .. codex/seo-phase3-local-authority-atibaia
```

Nenhum `reset --hard`, nenhum `clean -fd`, nenhuma alteração descartada.

**Baseline de inventário (produção, `DATABASE_URL1`, leitura):**

| Métrica | Valor |
| --- | ---: |
| Anúncios ativos (total, todas as cidades) | 27 |
| Anúncios `deleted` | 20 |
| Cidades com inventário ativo | **1** (Atibaia-SP) |
| Anunciantes com estoque | **1** (Ittmotors) |

Esse é o fato que condiciona toda a fase: **o portal inteiro tem uma cidade viva e um lojista**. Cada decisão abaixo foi tomada contra esse número, não contra um cenário hipotético.

---

## 2. Auditoria da arquitetura existente

| Intenção | Rota | Indexável | Estoque mínimo | Sitemap |
| --- | --- | ---: | ---: | --- |
| Comprar carro na cidade | `/carros-em/[slug]` | sim (≥3) | 1 p/ existir, 3 p/ indexar | `cities.xml` (≥3) |
| Abaixo da FIPE na cidade | `/carros-baratos-em/[slug]` | sim (≥3) | 3 | `below-fipe.xml` (≥3) |
| Câmbio automático na cidade | `/carros-automaticos-em/[slug]` | **não** (decisão de produto) | — | não |
| Hub da cidade | `/cidade/[slug]` | sim | — | não (canônica é `/carros-em`) |
| Marca na cidade | `/cidade/[slug]/marca/[brand]` | sim (≥3) | 3 | `brands.xml` (≥3) |
| Modelo na cidade | `/cidade/[slug]/marca/[brand]/modelo/[model]` | sim (≥3) | 3 | `models.xml` (≥3) |
| Oportunidades na cidade | `/cidade/[slug]/oportunidades` | sim | — | `opportunities.xml` |
| Abaixo da FIPE (hub) | `/cidade/[slug]/abaixo-da-fipe` | sim | — | não |
| Região | `/carros-usados/regiao/[slug]` | flag `REGIONAL_PAGE_INDEXABLE` | — | `regiao/[state].xml` |
| Estado | `/carros-usados/[uf]` | decisão de produto (noindex) | — | não |
| Loja | `/lojas/[slug]` | sim (se tem anúncio ativo) | 1 | não |
| FIPE + cidade | `/tabela-fipe/[cidade]` | sim | — | `content.xml` |
| Veículo | `/veiculo/[slug]` | sim | — | `vehicles.xml` |
| Blog | `/blog/[slug]` | sim | — | `blog.xml` |
| Simulador | `/simulador-financiamento` | sim | — | `core.xml` |

**Nenhuma rota nova foi criada nesta fase.** As rotas de marca e modelo já existiam e estavam corretas em forma; o que estava errado era o **critério de agrupamento** delas (ver §3).

Carroceria (`SUV em X`, `hatch em X`) e faixa de preço **não têm rota** e **não ganharam rota** — ver §9.

---

## 3. Taxonomia automotiva

### As quatro entidades e onde vive cada uma

| Entidade | Coluna | Exemplo real de produção |
| --- | --- | --- |
| Marca comercial | `ads.brand`, após `canonicalBrandLabel` | `GM - Chevrolet` → **Chevrolet** |
| Modelo comercial | **não existe coluna** — derivado | **Onix** |
| Versão / acabamento | **não existe coluna** | `SEDAN Plus LT` |
| Descrição FIPE | `ads.model` (inteira) | `ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.` |

Não existem `version`, `fipe_code`, `fipe_brand` nem `fipe_model` na tabela `ads` (`004_baseline_ads.sql`). Há apenas `fipe_reference_value` e `fipe_diff_percent`, que são **preço**, não taxonomia.

### `ads.model` pode ser usado diretamente como commercial model?

```text
NÃO
```

Evidência medida no inventário ativo de produção:

| Sinal | Resultado |
| --- | ---: |
| `model` contém espaço | **27 / 27** |
| `model` contém motorização (`\d\.\d`) | **27 / 27** |
| `model` sem espaço (nome comercial puro) | 0 / 27 |

Consequência concreta — um Chevrolet Onix com 6 anúncios em Atibaia era **quatro** entidades:

| `ads.model` (descrição FIPE) | Anúncios |
| --- | ---: |
| `ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.` | 2 |
| `ONIX HATCH LT 1.0 12V Flex 5p Mec.` | 2 |
| `ONIX SEDAN Plus LTZ 1.0 12V TB Flex Aut.` | 1 |
| `ONIX HATCH 1.0 12V Flex 5p Mec.` | 1 |

Com o limiar de indexação em 3, **nenhuma** das quatro qualificava. O `models.xml` de produção estava vazio enquanto havia um Onix com 6 anúncios na cidade.

### A camada derivada

`src/shared/vehicle/commercial-model.js` (+ espelho em `frontend/lib/vehicle/commercial-model.ts`, fixtures compartilhadas em `commercial-model.fixtures.js`).

Escada de resolução, **heurística é o último degrau**:

1. **Overrides curados** — mapa `marca::primeiroToken`.
2. **Modelos compostos** — mapa de nomes multi-token do mercado BR (`Corolla Cross`, `Grand Siena`, `Range Rover Evoque`…), casados por prefixo.
3. **Heurística guardada** — primeiro token, com recusa explícita quando ele é motorização/válvula/porta/tração/combustível/câmbio, e com regra própria para modelo numérico.

**Contrato:** quando não é seguro decidir, devolve `null`. O anúncio some dos módulos e sitemaps de modelo, mas continua descoberto pela cidade e pela marca. Falhar fechado, nunca inventar.

**Por que os degraus 1 e 2 existem** — dois casos reais em que `model.split(" ")[0]` erra:

- `"5 Luxury 1.5 TB FWD"` (Omoda) → produziria a entidade **"5"** e o H1 *"Carros 5 usados em Atibaia"*. Resolvido por override: **Omoda 5**.
- `"Grand Siena Essence 1.6…"` → produziria **"Grand"**. Resolvido pelo mapa de compostos.

**Resultado medido:** dos 27 anúncios ativos, **0 ficaram sem modelo comercial derivável** (`unresolvedModelAds: 0`). Esse contador é exposto no payload de propósito: se crescer, a taxonomia precisa de override novo, e um zero silencioso esconderia o sinal.

Casing: token com dígito ou hífen é preservado (`HB20`, `HR-V`, `C3`, `T-Cross`); o resto vira title-case (`ONIX` → `Onix`, `KWID` → `Kwid`).

**Nenhuma migração de dados foi feita.** A camada é derivada e reversível.

---

## 4. CitySeoOverview

| Item | Onde |
| --- | --- |
| Endpoint | `GET /api/public/cities/:slug/seo-overview` (cache 60 s, `varyBy: params`) |
| Service | `src/read-models/cities/city-seo-overview.service.js` |
| Lógica pura | `src/read-models/cities/city-seo-overview.logic.js` |
| Queries | `src/read-models/cities/city-seo-overview.repository.js` |
| Loader SSR | `frontend/lib/seo/city-seo-overview.ts` |

**Dados:** cidade, estoque ativo, anunciantes ativos, abaixo-FIPE, automáticos/manuais, faixa de anos, faixa/mediana/média de preço, marcas canônicas, modelos comerciais, facetas (carroceria/combustível/câmbio), lojistas, cidades próximas com estoque, limiares vigentes, `unresolvedModelAds`, `updatedAt`.

**Custo:** 1 query de identidade + 5 agregações em paralelo + a cobertura de raio (que tem cache próprio de 300 s) + 1 query de contagem das vizinhas. **Nenhum N+1**: nada roda por anúncio, por marca ou por modelo. Todas as agregações são restritas a `status = 'active'` e à cidade — índice `ads_status_city_id_idx`.

**TTL 60 s**, igual ao da página de cidade, de propósito: um TTL maior faria dois blocos da mesma página discordarem sobre o mesmo número.

**Independência territorial:** tudo resolve a partir de `city.id`, obtido do slug pedido. Não existe cidade padrão, fallback nem slug fixo.

---

## 5. Atibaia — antes / depois

| Módulo | Antes | Depois |
| --- | --- | --- |
| Catálogo transacional | sim | sim (inalterado) |
| Bloco "Próximos, até X km" | sim | sim (inalterado) |
| `CompactCitySeoBlock` | h2 + parágrafo + chips `?brand=` | h2 + parágrafo (chips removidos, ver §12) |
| FAQ visível | 5 perguntas de processo | **11** (6 de inventário + 5 de processo) |
| **Mercado local** | — | **novo** |
| **Marcas com estoque** | — | **novo** |
| **Modelos mais anunciados** | — | **novo** |
| **Quem está anunciando** | — | **novo** |
| **Cidades próximas** | — | **novo** (não renderiza hoje — §11) |

Todos os módulos novos são **Server Components puros**: sem `"use client"`, sem `useState`/`useEffect`/`onClick`. Um teste de varredura trava isso.

---

## 6. Mercado local — dados calculados para Atibaia

Medido em runtime pelo endpoint contra o banco de produção (2026-08-07):

| Métrica | Valor |
| --- | ---: |
| Anúncios ativos | 27 |
| Anunciantes com estoque | 1 |
| Menor preço | R$ 58.500 |
| Maior preço | R$ 157.500 |
| **Mediana** | **R$ 72.500** |
| Média (não publicada — ver abaixo) | R$ 77.544 |
| Câmbio automático | 9 |
| Câmbio manual | 18 |
| Abaixo da FIPE | 8 |
| Faixa de ano | 2016 – 2027 |
| Marcas distintas | 9 |
| Modelos comerciais distintos | 15 |
| Anúncios sem modelo derivável | **0** |

**Portão de qualidade estatística** (`PRICE_STATS_MIN_SAMPLE = 5`): abaixo de 5 anúncios a estatística de preço não é publicável. Com 1 anúncio a "mediana" é o próprio preço com aparência de análise; com 3 ela é literalmente o anúncio do meio, e qualquer entrada ou saída a move inteira. Em 5 a mediana fica isolada dos dois extremos. Os números continuam no payload para relatório — o que muda é a permissão de publicar.

**A média nunca é publicada.** Com 26 hatches de ~R$ 70 mil e um Omoda 5 de R$ 157.500, a média (R$ 77.544) descreve um carro que não existe no estoque. A mediana responde à mesma pergunta sem esse risco.

---

## 7. Marcas

| Marca | Ativos | Qualificada? (≥3) | URL |
| --- | ---: | ---: | --- |
| Fiat | 7 | **sim** | `/cidade/atibaia-sp/marca/fiat` |
| Chevrolet | 6 | **sim** | `/cidade/atibaia-sp/marca/chevrolet` |
| Volkswagen | 4 | **sim** | `/cidade/atibaia-sp/marca/volkswagen` |
| Citroën | 2 | não | (texto, sem link) |
| Honda | 2 | não | (texto, sem link) |
| Hyundai | 2 | não | (texto, sem link) |
| Renault | 2 | não | (texto, sem link) |
| Jeep | 1 | não | (texto, sem link) |
| Omoda | 1 | não | (texto, sem link) |

Marca abaixo do limiar **aparece na página com sua contagem, como texto**. O usuário continua vendo que há estoque daquela marca; a malha é que não gasta um link numa página que responderia `noindex`. Verificado em runtime: `/cidade/atibaia-sp/marca/jeep` → **200 + `noindex, follow`**.

Rótulos canônicos: `GM - Chevrolet` → Chevrolet, `VW - VolksWagen` → Volkswagen. A grafia interna da FIPE não aparece mais em anchor, title ou description.

---

## 8. Modelos

| Modelo comercial | Marca | Ativos | Qualificado? (≥3) | URL |
| --- | --- | ---: | ---: | --- |
| **Onix** | Chevrolet | **6** | **sim** | `/cidade/atibaia-sp/marca/chevrolet/modelo/onix` |
| Argo | Fiat | 2 | não | — |
| C3 | Citroën | 2 | não | — |
| HB20 | Hyundai | 2 | não | — |
| HR-V | Honda | 2 | não | — |
| Kwid | Renault | 2 | não | — |
| Mobi | Fiat | 2 | não | — |
| Pulse | Fiat | 2 | não | — |
| Fox | Volkswagen | 1 | não | — |
| Omoda 5 | Omoda | 1 | não | — |
| Polo | Volkswagen | 1 | não | — |
| Renegade | Jeep | 1 | não | — |
| Strada | Fiat | 1 | não | — |
| T-Cross | Volkswagen | 1 | não | — |
| Virtus | Volkswagen | 1 | não | — |

**Exatamente um modelo qualifica: Chevrolet Onix.** Nenhum limiar foi reduzido para conseguir esse número — ele apareceu porque as quatro descrições FIPE foram colapsadas na entidade certa.

Nenhuma página de modelo magra foi criada: os 14 modelos abaixo do limiar não viram landing, não entram no sitemap e não recebem link de malha.

**URLs antigas (descrição FIPE) continuam resolvendo** — não viram 404 —, mas caem no recorte de 1-2 anúncios, portanto `noindex` e fora do sitemap. Verificado: `/cidade/atibaia-sp/marca/chevrolet/modelo/onix-hatch-lt-1-0-12v-flex-5p-mec` → **200 + `noindex, follow`**, canonical autorreferente. Sem duplicata no índice.

---

## 9. Categorias

| Categoria | Estoque | Indexável? | Motivo |
| --- | ---: | ---: | --- |
| Abaixo da FIPE | 8 | **sim** | `/carros-baratos-em/atibaia-sp`, rota existente, no sitemap |
| Câmbio automático | 9 | **não** | `/carros-automaticos-em/[slug]` é `noindex` por decisão de produto anterior (grande sobreposição com a canônica da cidade). **Não reaberta**: não há evidência nova para revertê-la com uma cidade viva. |
| Câmbio manual | 18 | **não** | não existe rota; não foi criada |
| Hatch | 15 | **não** | qualifica pelo limiar (≥4), mas **não existe rota e não foi criada** |
| SUV | 7 | **não** | idem |
| Sedan | 4 | **não** | idem |
| Picape | 1 | **não** | não qualifica |
| Flex | 26 | **não** | combustível não tem superfície SEO própria; não recebe qualificação inventada |
| Híbrido | 1 | **não** | idem |
| Faixa de preço | — | **não** | não existe rota; não foi criada |

**Decisão explícita:** a infraestrutura de qualificação de categoria está pronta (limiar transversal, cálculo por faceta, tudo no payload), e **nenhuma rota de categoria foi criada**. Criar `/carros-suv-em/[slug]` com 7 anúncios de um único lojista seria criar URL porque é tecnicamente possível — o conteúdo seria um subconjunto da própria página da cidade. Quando houver mais de um lojista e volume por recorte, a decisão pode ser retomada com os dados na mão.

---

## 10. Lojas

| Loja | Ativos | URL | Relações internas |
| --- | ---: | --- | --- |
| Ittmotors | 27 | `/lojas/ittmotors-122` | cidade → loja (novo); loja → cidade (breadcrumb existente) |

A rede semântica cidade ↔ loja ↔ veículo está fechada para o único lojista real. O módulo expõe **apenas nome, slug e contagem** — nunca telefone, e-mail ou endereço. Publicar contato particular para ganhar sinal local seria expor dado pessoal por SEO; o repositório não seleciona essas colunas.

O `AutoDealer` JSON-LD da página da loja já existia e continua sem inventar `rating`, `review`, horário ou telefone.

**Bug corrigido:** o `<title>` da loja vinha duplicado — `"Veículos da Ittmotors em Atibaia, SP | Carros na Cidade | Carros na Cidade"` — porque a página aplicava o sufixo que o `title.template` do RootLayout já aplica. Agora sai uma vez só; `openGraph`/`twitter`, que não passam pelo template, recebem o título completo.

---

## 11. Cidades próximas

| Cidade | Distância | Ativos | URL |
| --- | ---: | ---: | --- |
| — | — | — | — |

**A seção não renderiza hoje, e isso está correto.** A vizinhança geográfica de Atibaia existe (`region_memberships` + distância), mas **nenhuma cidade vizinha tem inventário ativo** — não há nenhuma outra cidade com anúncio ativo no banco inteiro. O módulo só lista cidade que satisfaz o limiar de cidade (≥3), ou seja, que tem superfície pública própria.

A lista é **derivada, nunca fixa**: sai do serviço de raio (coordenadas reais) cruzado com uma única query de contagem para todas as vizinhas. Quando a primeira cidade vizinha publicar 3 anúncios, a seção aparece sozinha.

O bloco é **visual e semanticamente separado** do catálogo e traz aviso explícito de que esses veículos não entram no total da cidade.

---

## 12. Internal linking

Grafo efetivo hoje (verificado no HTML servido):

```text
CITY  /carros-em/atibaia-sp
  → BRAND   /cidade/atibaia-sp/marca/{fiat, chevrolet, volkswagen}   (qualificadas)
  → MODEL   /cidade/atibaia-sp/marca/chevrolet/modelo/onix           (qualificado)
  → DEALER  /lojas/ittmotors-122
  → BELOW   /carros-baratos-em/atibaia-sp
  → VEHICLE /veiculo/{slug}                                          (catálogo)
  → NEARBY  (vazio — nenhuma vizinha com estoque)

BRAND  → CITY (breadcrumb) · VEHICLE · marca em cidades vizinhas
MODEL  → BRAND · CITY (breadcrumb) · VEHICLE
DEALER → CITY (breadcrumb) · VEHICLE
FOOTER (global) → CITY · MODEL qualificado
```

**Três links para `noindex` foram cortados nesta fase:**

1. `CompactCitySeoBlock` linkava marcas por `/carros-em/[slug]?brand=<nome cru FIPE>`. A política de query deduplica essa URL para a cidade limpa — o bloco de marcas da página gastava seus links num beco, e ainda vazava `GM - Chevrolet` para o anchor. Removido; a intenção passou para a canônica de marca.
2. **O rodapé** — chrome global, presente em toda página do site — linkava `…/modelo/<descrição FIPE>`, seis URLs de 1-2 anúncios, todas `noindex`. Agora agrega por modelo comercial e só publica o que qualifica: **seis links viraram um** (Chevrolet Onix).
3. O bloco de marcas da **página regional** repetia o padrão `?brand=`. Corrigido para a canônica de marca com rótulo canônico.

O caso 3 foi encontrado **pela varredura de testes**, não pela leitura — a suíte falhou apontando o arquivo e só ficou verde depois da correção real.

Estado final medido em `/carros-em/atibaia-sp`: **todo href de marca/modelo aponta para superfície `index,follow`**; nenhum contém `?`.

Todos os links são `<a href>` reais (via `<Link>`), nenhum depende de `onClick`/`router.push`.

---

## 13. Metadata

Exemplos finais, extraídos do HTML servido:

**Cidade**
```text
title:     Carros usados e seminovos em Atibaia - SP | Carros na Cidade
canonical: https://carrosnacidade.com/carros-em/atibaia-sp
robots:    index, follow
```

**Marca + cidade**
```text
title:     Chevrolet em Atibaia - SP | Carros na Cidade
canonical: https://carrosnacidade.com/cidade/atibaia-sp/marca/chevrolet
robots:    index, follow
```

**Modelo + cidade**
```text
title:     Chevrolet Onix usado em Atibaia - SP | Carros na Cidade
canonical: https://carrosnacidade.com/cidade/atibaia-sp/marca/chevrolet/modelo/onix
robots:    index, follow
```

**Categoria (abaixo da FIPE) + cidade**
```text
title:     Carros baratos e abaixo da FIPE em Atibaia - SP | Carros na Cidade
canonical: https://carrosnacidade.com/carros-baratos-em/atibaia-sp
robots:    index, follow
```

Três correções de metadata nesta fase:

- **Contagem fora do `<title>`.** Era `"Carros em Atibaia - SP — 27 anúncios"`. O número muda a cada publicação e a cada venda, e o Google guarda o title por ciclos de rastreio: ele nasce desatualizado. Além disso não é o que a pessoa digita. A contagem vive no corpo da página, onde é sempre atual. Um teste trava: nenhum title territorial contém dígito.
- **Grafia FIPE fora da description.** Saía `"Marcas frequentes: Fiat, GM - Chevrolet, VW - VolksWagen"` — a grafia interna da tabela vazando para o snippet de busca. Agora usa o rótulo canônico.
- **Faixa em vez de média.** `"Preço médio aproximado: R$ 77.544"` virou `"Preços de R$ 58.500 a R$ 157.500"`.

Sufixo do site aplicado uma vez só em todas as rotas verificadas (o bug de duplicação estava na página da loja e foi corrigido).

---

## 14. Structured data

| Schema | Antes | Depois | Motivo |
| --- | --- | --- | --- |
| `CollectionPage` | 1 | 1 | inalterado |
| `ItemList` | **2** | **1** | eram dois na mesma URL, com contagens que não batiam (§ abaixo) |
| `BreadcrumbList` | 1 | 1 | inalterado |
| `FAQPage` | 1 (5 perguntas) | 1 (**11** perguntas) | 6 perguntas de inventário, todas visíveis no `FaqBlock` |
| `Place` / `PostalAddress` | 1 | 1 | inalterado |
| `WebSite` | 1 | 1 | inalterado |
| `AutoDealer` (página da loja) | 1 | 1 | inalterado — sem rating/review/horário inventados |

**ItemList duplicado (corrigido):** a página emitia o `CollectionPage.mainEntity` com 10 itens da amostra **e** um `ItemList` solto que declarava `numberOfItems: 27` listando 20. Dois schemas da mesma coleção, discordando entre si e da página. Sobrou um, dentro do `CollectionPage`, construído dos anúncios realmente renderizados, com `numberOfItems` igual ao número de itens listados (20 na página 1). Verificado no HTML: `ItemList` aparece **1×**, `n=20`, `itens=20`.

**FAQ ↔ schema:** as 11 perguntas vêm de uma única lista, consumida ao mesmo tempo pelo `FaqBlock` visível e pelo `FAQPage`. Um teste garante que o schema tenha exatamente as mesmas perguntas, na mesma ordem.

**Responsabilidade do portal:** a pergunta *"Os veículos são vendidos pelo Carros na Cidade?"* responde explicitamente que o portal **não vende, não intermedia pagamento e não garante o veículo**. A resposta de preço declara que a mediana é retrato do que está anunciado, **não uma avaliação de mercado**. Nenhuma afirmação de "oferta verificada", "garantia de preço" ou "melhor preço" foi adicionada.

---

## 15. Sitemap

**Nenhuma família nova foi criada.** O que mudou foi o critério de agrupamento de `models.xml`.

| Família | Limiar | Antes | Depois |
| --- | ---: | ---: | ---: |
| `cities.xml` | 3 | 1 | 1 |
| `brands.xml` | 3 | 3 | 3 |
| `models.xml` | 3 | **0** | **1** |
| `below-fipe.xml` | 3 | 1 | 1 |

`models.xml` estava vazio porque agrupava pela descrição FIPE (2+2+1+1, nenhuma ≥3). Agora agrupa por modelo comercial e publica `/cidade/atibaia-sp/marca/chevrolet/modelo/onix` (6 anúncios).

### Cross-check de todas as URLs sitemapadas

| Família | URLs | 200 | 404 | 3xx | noindex |
| --- | ---: | ---: | ---: | ---: | ---: |
| `cities.xml` | 1 | 1 | 0 | 0 | 0 |
| `brands.xml` | 3 | 3 | 0 | 0 | 0 |
| `models.xml` | 1 | 1 | 0 | 0 | 0 |
| `below-fipe.xml` | 1 | 1 | 0 | 0 | 0 |
| **Total** | **6** | **6** | **0** | **0** | **0** |

Todas com **canonical autorreferente**. Verificado em runtime, uma requisição por URL.

**Resiliência preservada:** nenhum `catch { entries = [] }` novo foi criado. O loader do overview distingue três estados — `ok`, `not_found` e `unavailable` — e loga em todos os caminhos de erro. Falha de backend **omite os módulos** em vez de renderizar "0 veículos em Atibaia", que seria informação falsa servida com cara de fato. Um teste de varredura trava isso.

Os limiares diferentes de existir (1) e indexar (3) foram preservados como estavam.

---

## 16. SSR / Googlebot

Requisições com `User-Agent: Googlebot/2.1`, servidor de produção local (`next build` + standalone), **sem executar JavaScript**. Confirmados no HTML inicial:

| Elemento | Presente |
| --- | --- |
| H1 (`Carros usados em Atibaia`) | sim |
| Contagem real (`Há 27 veículos anunciados em Atibaia`) | sim |
| Composição (`de 9 marcas diferentes`, `1 anunciante`) | sim |
| Faixa e mediana de preço | sim |
| `9 são automáticos` / `8 estão anunciados abaixo da tabela FIPE` | sim |
| `O modelo mais anunciado é o Chevrolet Onix, com 6 ofertas` | sim |
| Módulo de marcas (3 links + 6 chips de texto) | sim |
| Módulo de modelos | sim |
| Módulo de lojas | sim |
| Módulo de cidades próximas | **ausente por dado**, não por hydration |
| FAQ visível (11 perguntas) | sim |
| Breadcrumbs visíveis | sim |
| Canonical + robots | sim |
| `CollectionPage`, `ItemList`, `BreadcrumbList`, `FAQPage` | sim |

Nada da camada nova depende de hydration. Nenhum `SSR → skeleton → useEffect → fetch` foi introduzido.

Independência territorial verificada no mesmo servidor: **`/carros-em/braganca-paulista-sp` → HTTP 404**, porque Bragança não tem inventário ativo. Mesma implementação, dados próprios, zero vazamento de Atibaia.

---

## 17. Performance guardrail

Medição feita na **mesma pilha local** (mesmo backend, mesmo banco, mesmo inventário de 27 anúncios) para o commit base e para o branch — sem isso a comparação seria confundida por diferença de dados.

| Métrica | Antes (base `036dc458`) | Depois | Variação |
| --- | ---: | ---: | ---: |
| **HTML bruto** (`/carros-em/atibaia-sp`, Googlebot) | 278.839 B — **272,7 KB** | 305.559 B — **299,1 KB** | **+26,4 KB (+9,7%)** |
| **JS bruto** (soma dos 17 `<script src>`) | 619.497 B — **605,0 KB** | 619.497 B — **605,0 KB** | **0** |
| **CSS bruto** (2 stylesheets) | 143.044 B — **139,7 KB** | 143.044 B — **139,7 KB** | **0** |
| **Imagens** (`<img>` no HTML / assets novos) | 29 / — | 29 / — | **0 / 0 arquivos** |
| First Load JS — `/carros-em/[slug]` | 136 kB | 136 kB | **0** |
| Route JS — `/carros-em/[slug]` | 212 B | 212 B | **0** |
| First Load JS compartilhado | 87,3 kB | 87,3 kB | **0** |
| `ItemList` no documento | 2 | 1 | **−1** |

Medição pareada: mesmo servidor, mesmo backend, mesmo banco, mesmo inventário de 27 anúncios, mesmo `User-Agent`. O commit base foi reconstruído e servido na mesma máquina para produzir a coluna "Antes" — a árvore foi restaurada em seguida (`0 arquivos modificados`).

O HTML base medido (272,7 KB) bate com o ~273 KB do briefing, o que dá confiança na comparação.

**JS e CSS não cresceram nada — zero bytes.** É a consequência direta da escolha de arquitetura: todos os módulos novos são Server Components e o loader do overview é `server-only`, então nada deles entra no bundle. O build reporta os mesmos números byte a byte entre base e branch.

**Nenhum asset novo** (`git diff --stat 036dc458..HEAD -- frontend/public` é vazio). Os 2,46 MB de imagem do baseline não foram tocados: os módulos de marca e modelo usam texto e links, sem logos.

### Explicação dos +26,4 KB de HTML

O conteúdo único novo é menor que isso: o bloco de autoridade mede **~10,0 KB** e o `FAQPage` JSON-LD **~3,3 KB**. O fator é a serialização do App Router — conteúdo de Server Component aparece **duas a quatro vezes** no documento (markup + payload RSC; e o FAQ ainda uma vez no `FAQPage`):

| Trecho | Ocorrências no HTML |
| --- | ---: |
| `Há 27 veículos anunciados` | 3× |
| `Marcas com carros à venda em` | 2× |
| `Quantos carros estão anunciados` | 4× (markup + FAQ visível + JSON-LD + RSC) |

Ou seja: ~13 KB de conteúdo único → ~26 KB no documento. **Isso é inerente ao SSR do Next 14, não um defeito dos módulos** — é exatamente o preço de o Googlebot receber tudo sem executar JavaScript, que era o requisito. A alternativa (carregar via cliente) reduziria o HTML e violaria a Etapa 54.

Compensações no mesmo commit: a consolidação do `ItemList` removeu um schema duplicado, e o rodapé passou a emitir 1 link de modelo em vez de 6.

---

## 18. Testes

| Verificação | Resultado |
| --- | --- |
| `npm run lint` (backend) | 11 erros — **todos preexistentes**, em `scripts/` não tocados. `npx eslint` nos diretórios alterados: **0 erros** |
| `npx tsc --noEmit` (frontend) | **0 erros** |
| `npm run lint` (frontend) | **0 warnings, 0 erros** |
| `npm run build` (frontend) | **sucesso**, standalone verificado |
| `npm test` (backend) | **179 arquivos, 2401 testes — todos passando** |
| `npx vitest run` (frontend) | 184 arquivos, 2729 testes — **5 falhas, todas preexistentes** |
| Validação HTTP sem JS | 8 URLs, todas conforme (§15, §16) |

### Falhas preexistentes (confirmadas no commit base)

Rodei os dois arquivos com o frontend revertido para `036dc458`: **as mesmas 5 falhas aparecem lá**. Não foram introduzidas nesta fase e não foram corrigidas nela (estão fora do escopo).

- `app/seguranca/page.copy.test.ts` — 2 falhas (copy de moderação)
- `app/carros-usados/regiao/[slug]/page.config.test.ts` — 3 falhas (flags `REGIONAL_PAGE_INDEXABLE` / `CANONICAL_SELF`)

### Falhas novas

```text
nenhuma
```

### Testes adicionados nesta fase

| Arquivo | Cobre |
| --- | --- |
| `src/shared/vehicle/commercial-model.test.js` | 37 casos — fixtures reais de produção + guardas contra invenção |
| `frontend/lib/vehicle/commercial-model.test.ts` | 31 casos — espelho, **importa as mesmas fixtures** do backend |
| `src/read-models/cities/city-seo-overview.logic.test.js` | 23 casos — qualificação, portão estatístico, independência territorial |
| `src/read-models/cities/territorial-commercial-model.test.js` | 11 casos — resolução da rota + sitemap por entidade comercial |
| `frontend/components/seo/CityAuthoritySection.test.tsx` | 17 casos — duas cidades, qualificação, ausência de link para `noindex` |
| `frontend/lib/seo/local-authority-linking.test.ts` | 10 casos — varredura de internal linking + server-first + resiliência |
| `frontend/lib/seo/faq.test.ts` | +8 casos — FAQ data-driven, sincronia com o schema |
| `tests/read-models/inventory-facets.test.js` | reescrito — rodapé por entidade comercial |

Testes que travam regressões específicas desta fase:

- as 4 descrições FIPE do Onix **têm** de colapsar num slug só (e o slug ingênuo tem de ser diferente — prova de que o bug era real);
- `models.xml` com essas 4 linhas tem de produzir **1** entrada, não 0;
- Bragança tem de renderizar os números de Bragança e nenhum link para Atibaia;
- nenhum arquivo do frontend pode montar href com `?brand=` nem slug de modelo a partir de `brandModelSlug(ad.model)`;
- `CityAuthoritySection` não pode virar Client Component;
- o loader do overview não pode ter `catch` que devolva lista vazia sem logar;
- nenhum title territorial pode conter dígito.

A varredura de linking tem uma **guarda contra falso verde**: ela afirma que enxerga os arquivos antes de afirmar que não encontrou infração — no Windows `path.relative` devolve `\`, e sem normalizar, um `endsWith("lib/seo/…")` nunca casaria, transformando a varredura num teste que passa sem ler nada.

---

## 19. Commits

| Hash | Mensagem |
| --- | --- |
| `f9478082` | `feat(seo): normalize commercial model taxonomy` |
| `6d010a4d` | `feat(seo): add city market overview read model` |
| `82613f0d` | `feat(seo): add local authority modules to the city page` |
| `c8d2f92e` | `feat(seo): resolve model surfaces by commercial entity` |
| `32af8dc6` | `feat(seo): make city metadata and FAQ answer with real inventory` |
| `c0252069` | `fix(seo): stop linking the whole site to noindex model pages` |
| `d8ee2499` | `test(seo): cover local authority qualification and linking rules` |
| `75456755` | `fix(seo): emit a single ItemList per city page` |

36 arquivos, +3.736 / −208.

---

## 20. Qualidade do inventário (Etapas 48-49)

Relatório apenas — **nenhum anúncio foi bloqueado, despriorizado ou reordenado**.

Sete sinais que determinam capacidade orgânica: foto de capa, galeria (≥5), descrição com texto real (≥120 caracteres), quilometragem, referência FIPE, carroceria e câmbio. Marca, modelo, ano e preço ficam de fora porque são obrigatórios na publicação — não discriminam nada.

| Sinal | Cobertura |
| --- | ---: |
| Foto de capa | 27/27 — 100% |
| Galeria ≥5 fotos | 27/27 — 100% |
| Quilometragem | 27/27 — 100% |
| Referência FIPE | 27/27 — 100% |
| Carroceria | 27/27 — 100% |
| Câmbio | 27/27 — 100% |
| **Descrição ≥120 caracteres** | **20/27 — 74%** |

**Completude média: 96%.** O inventário é bom. A única lacuna material são **7 anúncios com descrição curta ou vazia** (IDs 113, 111, 108, 104, 107, 105, 106) — um deles com 0 caracteres e outro com 28. É a alavanca mais barata disponível: são sete textos, do mesmo lojista.

Comando: `node scripts/seo/audit-vehicle-taxonomy.mjs --city atibaia-sp --quality`

---

## 21. Plano de autoridade externa

### O CÓDIGO CONSEGUE FAZER (já feito ou pronto para fazer)

- Página municipal com dados reais, entidades de marca e modelo, lojista e FAQ — **feito**.
- Malha interna que só aponta para superfície indexável — **feito**.
- Sitemaps que refletem estoque real e entidade correta — **feito**.
- Escala automática para qualquer cidade: quando a segunda cidade tiver 3 anúncios, ela ganha página, sitemap, marcas, modelos e passa a aparecer na seção de cidades próximas de Atibaia — **sem nenhuma alteração de código**.
- Relatório de completude para priorizar melhoria de anúncio — **feito**.
- Página de loja pública que o lojista pode linkar do próprio site — **já existe** (`/lojas/ittmotors-122`).

### A OPERAÇÃO / O NEGÓCIO PRECISA FAZER

Nada abaixo é executável por código, e nada foi executado.

1. **Estoque é o gargalo, não SEO.** Uma cidade e um lojista limitam o teto do que qualquer técnica pode entregar. A prioridade comercial é a segunda e a terceira loja em Atibaia; a segunda cidade vem depois.
2. **Link do site do lojista.** Pedir ao Ittmotors um link para `/lojas/ittmotors-122` a partir do site/Instagram/Google Business dele. É o backlink mais natural que existe: ele descreve o próprio estoque.
3. **Associação comercial e imprensa regional.** ACE/CDL de Atibaia, jornais e portais locais. Pauta possível: os dados de mercado que a página agora calcula (faixa de preço, marcas com mais oferta) — é conteúdo original, verificável e local.
4. **Google Business Profile** das lojas parceiras, com link para a página da loja no portal.
5. **Eventos e feiras locais** de veículo — presença gera menção.
6. **Conteúdo editorial de apoio** (Etapa 32): "como comprar usado com segurança em Atibaia", "como comparar preço com a FIPE", "documentos para transferência". O blog já existe; os artigos precisam ser escritos por pessoa. **Nada foi publicado automaticamente.**
7. **Não fazer:** comprar backlink, criar rede de sites, fabricar review, inventar parceria, listar "melhores oficinas de Atibaia" sem pesquisa verificável.

---

## 22. Plano de Search Console

Nada foi configurado. Plano de acompanhamento:

### Grupos de consulta a segmentar

| Grupo | Filtro de consulta | O que a métrica responde |
| --- | --- | --- |
| Marca territorial | contém `carros na cidade` | reconhecimento do portal |
| Cidade genérica | contém `atibaia` + (`carro`, `carros`, `veículo`, `seminovo`, `usado`) | a aposta principal |
| Marca + cidade | contém `atibaia` + (`fiat`, `chevrolet`, `volkswagen`) | as 3 páginas de marca |
| Modelo + cidade | contém `atibaia` + `onix` | a única página de modelo |
| Abaixo da FIPE + cidade | contém `atibaia` + (`fipe`, `barato`, `abaixo`) | `/carros-baratos-em/` |
| Automático + cidade | contém `atibaia` + `automático` | mede a demanda real da intenção que hoje é `noindex` — é o dado que decide se aquela decisão deve ser revista |

### Páginas a acompanhar individualmente

```text
/carros-em/atibaia-sp
/carros-baratos-em/atibaia-sp
/cidade/atibaia-sp/marca/fiat
/cidade/atibaia-sp/marca/chevrolet
/cidade/atibaia-sp/marca/volkswagen
/cidade/atibaia-sp/marca/chevrolet/modelo/onix
/lojas/ittmotors-122
```

### Métricas, por grupo e por página

`impressions`, `clicks`, `CTR`, `average position` — semanal.

### Cobertura (Indexação)

| Indicador | O que observar |
| --- | --- |
| Páginas indexadas | tem de subir de 5 para 6 (entrada do Onix) |
| Páginas rastreadas / não indexadas | as URLs de descrição FIPE devem aparecer aqui — é o comportamento esperado, não um problema |
| "Canônica diferente da escolhida pelo usuário" | tem de **cair** — os links para `?brand=` e para descrição FIPE eram parte dessa massa |
| Enviadas no sitemap × indexadas | 6 enviadas; qualquer divergência é sinal de regressão |
| Rastreamento (Crawl Stats) | o rodapé deixou de gastar rastreio em 6 URLs `noindex` por página — o orçamento deve migrar para as páginas úteis |

### Primeira leitura confiável

Não antes de **4 semanas** após o deploy. Antes disso os números refletem o rastreio, não o desempenho.

---

## CHECKLIST FINAL

| # | Pergunta | Resposta |
| ---: | --- | --- |
| 1 | A página de Atibaia ficou mais rica em dados reais? | **SIM** |
| 2 | Nenhum dado de outra cidade é usado como fallback? | **SIM** |
| 3 | Estatísticas usam somente `active`? | **SIM** |
| 4 | Marcas possuem threshold central? | **SIM** |
| 5 | Modelos comerciais foram diferenciados de versão FIPE? | **SIM** |
| 6 | Nenhuma página de modelo thin foi criada? | **SIM** |
| 7 | Categorias só existem quando qualificadas? | **SIM** |
| 8 | Lojas estão semanticamente conectadas à cidade? | **SIM** |
| 9 | Cidades próximas só incluem cidades públicas? | **SIM** |
| 10 | Links SEO são anchors reais? | **SIM** |
| 11 | Nenhum link principal aponta para landing `noindex`? | **SIM** |
| 12 | Breadcrumbs estão coerentes? | **SIM** |
| 13 | Metadata é única? | **SIM** |
| 14 | Não houve keyword stuffing? | **SIM** |
| 15 | FAQ visível corresponde ao schema? | **SIM** |
| 16 | Nenhuma nova URL sitemapada é 404/3xx/noindex? | **SIM** |
| 17 | SSR continua completo? | **SIM** |
| 18 | JS não cresceu materialmente por causa dos módulos SEO? | **SIM** — cresceu 0 |
| 19 | Não foram criadas doorway pages? | **SIM** |
| 20 | Não houve hardcode territorial de Atibaia? | **SIM** |
| 21 | A implementação escala para outras cidades? | **SIM** |
| 22 | Nenhum threshold foi reduzido apenas para gerar páginas? | **SIM** |
| 23 | Nenhuma afirmação comercial não comprovada foi adicionada? | **SIM** |
| 24 | Nenhum backlink artificial foi criado? | **SIM** |
| 25 | Nenhuma regressão nova foi introduzida? | **SIM** |

---

## Pendências conhecidas (fora do escopo desta fase)

1. **5 testes preexistentes falhando** (`/seguranca` copy, flags da página regional) — não introduzidos aqui, não corrigidos aqui.
2. **`/carros-automaticos-em/[slug]` permanece `noindex`** por decisão de produto anterior. Com 9 automáticos em Atibaia o recorte qualifica pelo limiar; a decisão deve ser retomada com dados de Search Console (§22), não por opinião.
3. **7 anúncios com descrição curta ou vazia** — maior alavanca isolada de qualidade do inventário.
4. **Rotas de carroceria e faixa de preço não criadas** — decisão consciente (§9); infraestrutura de qualificação pronta.
5. **`SITEMAP_PUBLIC_ENABLED`** continua fora do `render.yaml`, como o resto da config crítica não versionada.

---

## VEREDITO FINAL

```text
FASE 3 CONCLUÍDA — PRONTA PARA VALIDAÇÃO SEO EM PRODUÇÃO
```

Sem deploy. Sem merge.
