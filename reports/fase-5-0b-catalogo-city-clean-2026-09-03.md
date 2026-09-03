# Fase 5.0B — Catálogo territorial limpo

**Rota alterada:** `/carros-em/[slug]`
**Branch:** `codex/catalog-city-clean-desktop-grid`
**Base:** `main` @ `190df7a5`
**Data:** 2026-09-03
**Origem:** decisões tomadas sobre a auditoria `reports/fase-5-0-auditoria-estrutura-catalogo-2026-09-02.md`

---

## 1. O que mudou, em uma frase

`/carros-em/[slug]` passa a terminar em **cards → paginação → rodapé**, e ganha
uma quarta coluna de cards em telas de 1600px ou mais — sem que nenhuma outra
rota, nem o mobile, mude um pixel.

---

## 2. Escopo — o que foi tocado e o que não foi

**Alterado (10 arquivos, todos no frontend):**

| Arquivo | Natureza |
|---|---|
| `app/carros-em/[slug]/page.tsx` | remoção de 4 blocos do render + 2 loaders |
| `components/buy/BuyMarketplacePageClient.tsx` | flag `isCityVariant` |
| `components/buy/VehicleGrid.tsx` | variante de colunas |
| `components/buy/CatalogPagination.tsx` | prop `showSinglePage` |
| `lib/seo/local-seo-data.ts` | opção `onServiceFailure` |
| + 5 arquivos de teste/instrumentação | novos |

**Não tocado:** backend, schema, migrations, matching, Produto 1, Produto 2,
middleware, `limit`, paginação de servidor, sitemaps, SEO copy, admin UI.

Nenhum componente foi apagado do projeto. `NearbyRadiusSection`,
`CityAuthoritySection`, `CompactCitySeoBlock` e `FaqBlock` continuam existindo,
com seus testes; esta rota apenas deixou de montá-los.

---

## 3. Limits — inalterados (verificação explícita)

A fase marcou isso como CRÍTICO. Os três valores continuam em 50:

```
frontend/lib/search/ads-search-url.ts:4   PUBLIC_ADS_SEARCH_LIMIT_MAX = 50
frontend/lib/search/ads-search-url.ts:7   DEFAULT_COMPRAR_CATALOG_LIMIT = PUBLIC_ADS_SEARCH_LIMIT_MAX
frontend/lib/seo/query-policy.ts:60       DEFAULT_CATALOG_LIMIT = 50
```

O diff inteiro (989 inserções, 152 remoções) contém **uma única** linha com a
palavra `limit`: um comentário dentro de um teste. Nenhuma constante foi tocada.

---

## 4. O breakpoint saiu de medição, não de gosto

A fase proibiu trocar `lg:grid-cols-3` por `lg:grid-cols-4`. O motivo ficou
evidente na medição.

O card do catálogo tem **275px em qualquer desktop** — 1280, 1366, 1440, 1536 ou
1920 — porque o container é `max-w-7xl` (1280px) e não cresce. A largura
disponível para cards é sempre a mesma:

```
1280 − 64 (px-8) − 320 (sidebar) − 32 (gap-8) = 864px
```

Espremer 4 colunas nesses 864px dá **201px por card**. Não é estimativa: forcei
o container de volta a 1280px em runtime, com a quarta coluna ativa, e medi.

```
como está      : {"perRow":4,"card":281,"container":1600}
container 1280 : {"perRow":4,"card":201,"container":1600→1280}   ← 4 colunas espremidas
```

−27% de largura de card, com foto e título comprimidos. Rejeitado pela regra da
própria fase ("4 cards não podem virar 4 cards espremidos").

A quarta coluna só cabe se o **container crescer junto**:

```
≥1600px → container 1600 → (1600 − 64 − 320 − 32 − 60) / 4 = 281px por card
```

**281 > 275**: os cards ficam ligeiramente MAIORES do que hoje, não menores. Em
1440 e 1536 a conta não fecha (241px e 265px), e é por isso que essas larguras
continuam em 3 colunas.

O experimento acima é o que torna o alargamento do container **estrutural**: se
alguém remover `min-[1600px]:max-w-[1600px]` e mantiver a quarta coluna, o card
cai para 201px silenciosamente.

---

## 5. Geometria medida no navegador (bounding box real)

Medições sobre `next start` (build de produção), cidade Atibaia-SP, 27 anúncios:

| Viewport | Colunas | Card | Container |
|---|---|---|---|
| 390 × 844 (mobile) | 1 | 366 × 178 | 390 |
| 412 × 915 (mobile) | 1 | 388 × 178 | 412 |
| 768 × 1024 (tablet) | 2 | 352 × 542 | 768 |
| 1024 × 768 | 3 | 189 × 421 | 1024 |
| **1280 × 800** | **3** | **275 × 485** | 1280 |
| 1366 × 768 | 3 | 275 × 485 | 1280 |
| 1440 × 900 | 3 | 275 × 485 | 1280 |
| 1536 × 864 | 3 | 275 × 485 | 1280 |
| **1680 × 1050** | **4** | **281 × 490** | 1600 |
| **1920 × 1080** | **4** | **281 × 490** | 1600 |

A classe Tailwind no atributo `class` não prova nada sozinha — ela pode não ter
sido emitida no CSS. Verifiquei também o CSS gerado:

```css
@media (min-width:1600px){
  .min-\[1600px\]\:max-w-\[1600px\]{max-width:1600px}
  .min-\[1600px\]\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}
}
```

**Observação fora do escopo desta fase:** em 1024px o card cai para 189px, porque
`lg:` (1024) já pede 3 colunas num container de 1024. É comportamento anterior à
fase, não regressão — mas é a largura mais apertada da tabela e merece decisão de
produto em algum momento.

---

## 6. Fim da página: o que havia entre a listagem e o rodapé

Comparação entre a `main` e a branch, mesmo build local, mesma máquina, mesma
cidade. `gridBottom` é o pixel onde o grid de cards termina.

| | main | branch | Δ |
|---|---|---|---|
| **Desktop 1280** | | | |
| fim do grid | 4931px | **4931px** | **0** |
| topo do rodapé | 6683px | 5047px | −1636px |
| vão grid→rodapé | **1752px** | 116px | −1636px |
| altura da página | 7189px | 5553px | −1636px |
| **Mobile 390** | | | |
| fim do grid | 5448px | **5448px** | **0** |
| topo do rodapé | 7957px | 5628px | −2329px |
| vão grid→rodapé | **2509px** | 180px | −2329px |
| altura da página | 9545px | 7215px | −2329px |

O `gridBottom` idêntico nos dois builds é o dado central: **o catálogo não se
moveu um pixel**. Tudo que mudou está abaixo dele.

Os 2509px do mobile batem exatamente com a medição da auditoria da Fase 5.0.
No desktop a auditoria registrou 1704px e este build mediu 1752px — 48px de
diferença, que é a margem do próprio paginador que agora ocupa parte do vão.

Vão restante entre paginação e rodapé, medido no E2E: **48px**.

---

## 7. O que saiu do render — verificado no HTML servido

Contagem de ocorrências no HTML SSR das duas versões:

| Marcador | main | branch | |
|---|---|---|---|
| `"@type":"FAQPage"` | 2 | **0** | removido |
| `areaServed` | 2 | **0** | removido |
| `Distância (km)` | 1 | **0** | removido |
| `"@type":"CollectionPage"` | 2 | 2 | preservado |
| `"@type":"BreadcrumbList"` | 2 | 2 | preservado |
| `"@type":"ItemList"` | 4 | 4 | preservado |
| `Paginação do catálogo` | 0 | 1 | novo |
| links `/veiculo/` únicos | 27 | 27 | preservado |

Os seis `<h2>` que a `main` emitia depois do grid, e que saíram:

1. `O mercado de carros usados em Atibaia` — CityAuthoritySection → MarketOverview
2. `Marcas com carros à venda em Atibaia` — CityAuthoritySection → BrandDiscovery
3. `Modelos mais anunciados em Atibaia` — CityAuthoritySection → ModelDiscovery
4. `Quem está anunciando em Atibaia` — CityAuthoritySection → DealerDiscovery
5. `Sobre carros usados em Atibaia` — CompactCitySeoBlock
6. `Perguntas frequentes sobre comprar carro usado em Atibaia` — FaqBlock

O único `<h2>` que resta na página é `Filtros`, da sidebar.

**Ressalva honesta sobre o `NearbyRadiusSection`:** ele foi removido do código da
rota, mas em Atibaia **já não renderizava** — o bloco só aparece quando a cidade
tem poucos anúncios, e com 27 ele nunca era montado. O slider "Distância (km)",
no entanto, **aparecia** (1 ocorrência no HTML da `main`), controlando um bloco
que não existia naquela tela. Ou seja: nesta cidade o slider já era inerte antes
da fase; a mudança tornou isso explícito em vez de acidental.

HTML SSR: **305.592 → 248.955 bytes (−18,5%)**. Links internos únicos: 54 → 50.

---

## 8. FAQPage saiu junto com a FAQ — e por quê

O `FAQPage` só existia porque as mesmas perguntas eram renderizadas de forma
visível. Sem a FAQ na página, mantê-lo seria schema sem conteúdo correspondente,
que o Google trata como spam estrutural. Os dois saem juntos, sempre.

`areaServed` saiu pelo mesmo raciocínio: era montado de
`nearbyResult.coverageCities`, e declarar cobertura de vizinhança num schema cuja
página não mostra mais nenhuma cidade vizinha é afirmar o que a página não
sustenta.

`CollectionPage`, `ItemList` e `BreadcrumbList` ficam intactos — descrevem
exatamente o que continua na tela.

---

## 9. Mobile inalterado — prova por pixel

A fase foi categórica: mobile não muda. A prova é a comparação das capturas
`main` × branch, mesmo build local, mesmo navegador, mesmo viewport.

| Comparação | Pixels diferentes |
|---|---|
| Desktop 1280 × 900 (primeira dobra) | **0** — SHA-256 idêntico |
| Mobile 390 × 844 (primeira dobra) | 6 de 329.160 (0,0018%) |
| Mobile 390 página inteira | idênticas até a linha **5479**; diferem só abaixo |

O desktop em 1280 tem o **mesmo hash SHA-256** nos dois builds:
`bffb5285a37a31568f84949a94dc3b05a8287c21b96d13d0e40b87967f97d6dd`.

Os 6 pixels do mobile estão em `x=19` e `x=21` — a borda arredondada do card —
com delta máximo de 4 em 255, num tom já quase branco (227→231). É jitter de
antialiasing na renderização da foto, não deslocamento de layout: as linhas
(`y=517`, `y=707`) são as mesmas nas duas versões.

Na página inteira do mobile, a primeira linha com qualquer diferença é a **5480**
— exatamente onde o grid termina (5448) e começava o conteúdo removido. Acima
disso: zero diferenças. É literalmente o critério que o §22 da fase pediu.

Card mobile: **366 × 178 nos dois builds**. Card desktop: **275 × 485 nos dois
builds**.

---

## 10. Rotas irmãs — não-regressão medida

`BuyMarketplacePageClient` serve cinco rotas. Toda diferença desta fase passa por
uma única flag, `isCityVariant = variant === "cidade"`. Medição no mesmo
servidor, nas duas larguras críticas:

| Largura | Variante | Rota | Colunas | Card | Container |
|---|---|---|---|---|---|
| 1280 | cidade | `/carros-em/atibaia-sp` | 3 | 275 | 1280 |
| **1920** | **cidade** | `/carros-em/atibaia-sp` | **4** | **281** | **1600** |
| 1280 | nacional | `/comprar` | 3 | 275 | 1280 |
| 1920 | nacional | `/comprar` | **3** | **275** | **1280** |
| 1280 | estadual | `/carros-usados/sp` | 3 | 275 | 1280 |
| 1920 | estadual | `/carros-usados/sp` | **3** | **275** | **1280** |
| 1280 | estadual | `/comprar/estado/sp` | 3 | 275 | 1280 |
| 1920 | estadual | `/comprar/estado/sp` | **3** | **275** | **1280** |

Só a cidade muda. As três irmãs mantêm 3 colunas, 275px e container 1280 em
1920px de viewport — o comportamento histórico.

**`/carros-usados/regiao/atibaia-sp` respondeu 503 nas duas larguras.** Não é
regressão: o próprio middleware nomeia a causa no header de resposta.

```
HTTP/1.1 503 Service Unavailable
x-middleware-regional: blocked-unavailable
x-middleware-regional-reason: missing-internal-api-token
```

É o gate fechando por falta de `INTERNAL_API_TOKEN` no meu `.env.local`. O 503
vem de `middleware.ts` — que roda **antes** do componente de página, e que este
diff não toca (o diff tem 10 arquivos, nenhum em `lib/middleware/` nem
`middleware.ts`). O arquivo da rota regional é byte a byte igual ao da `main`.

---

## 11. Paginação visível com uma página só

Com os blocos SEO fora, a listagem emendava direto no rodapé sem nenhum sinal de
fim. O paginador de página única é esse encerramento.

Com 27 anúncios e `limit` 50 há exatamente 1 página. Nesse estado o paginador é
**inerte**, verificado no HTML servido:

- **0** elementos `<a>` dentro do `<nav>`
- **nenhuma** ocorrência de `page=1`
- as duas setas renderizam como `<span>` desabilitado (`opacity-40`)
- o número atual é `<span aria-current="page">1</span>`

Não há URL paginada nova para o SEO tratar, nem link que leve a lugar nenhum.
O comportamento com 2+ páginas é o de sempre — coberto pelos 23 testes de
`CatalogPagination.test.tsx`, dos quais 17 já existiam e continuam verdes.

---

## 12. Resiliência: serviço de conteúdo fora ≠ cidade inexistente

`loadLocalSeoLanding` terminava em `catch { notFound(); }`. Esse loader alimenta
apenas metadata e JSON-LD — mas a falha dele derrubava a **página inteira**,
inclusive o catálogo transacional, que vem de outro loader e estava disponível.
Um blip de rede virava 404 numa cidade com 27 anúncios no ar.

A opção `onServiceFailure: "degrade"` separa as duas perguntas:

| Situação | Comportamento |
|---|---|
| cidade não existe | **404**, sempre, nos dois modos |
| serviço caiu + `"degrade"` | modelo mínimo, página **200** com `noindex` |
| serviço caiu + padrão | **404** (histórico, mantido para as landings irmãs) |

Só `/carros-em/[slug]` passa a opção. `/carros-baratos-em/` e
`/carros-automaticos-em/` seguem no comportamento anterior, porque não têm
catálogo próprio para servir — degradá-las serviria uma casca vazia.

O modo degradado devolve `totalAds: 0`, o que faz `shouldIndexLocalSeo` produzir
`noindex`: a página nunca afirma indexabilidade sem ter confirmado estoque.

Verificado em runtime: `/carros-em/cidade-fantasma-zz` → **404**.

---

## 13. Rede: 4 cargas paralelas viraram 2

Saíram do `Promise.all` da rota, junto com os blocos que alimentavam:

- `loadNearbyRadiusAds` — alimentava `NearbyRadiusSection`
- `loadCitySeoOverview` — alimentava `CityAuthoritySection`

Restam `loadSeoModel` (metadata + JSON-LD) e `loadCityCatalogData` (o catálogo).
`?raio=` deixou de ser lido na rota porque seu único consumidor era o bloco
"Próximos"; o parâmetro continua **preservado** nos hrefs de paginação e filtro,
então uma URL antiga com `?raio=` não perde o parâmetro ao navegar.

---

## 14. Performance

Mesma máquina, `next start` de build de produção, backend de produção, 6
requisições seguidas por versão (a primeira, fria, descartada).

| Métrica | main | branch |
|---|---|---|
| HTML SSR | 305.592 B | **248.955 B (−18,5%)** |
| TTFB (mediana de 5 quentes) | 0,292 s | 0,317 s |
| TTFB (faixa) | 0,265–0,365 s | 0,278–0,509 s |
| Route size (build) | 212 B | 211 B |
| First Load JS | 136 kB | 136 kB |

**O TTFB não melhorou de forma mensurável** — as duas faixas se sobrepõem e a
diferença está dentro do ruído de medição desta máquina. Isso é esperado: as duas
chamadas de rede removidas batiam num backend com cache próprio e não dominavam o
tempo de resposta. Afirmar ganho de latência aqui seria ler ruído como sinal.

O ganho medido e real é de **bytes transferidos**: 56,6 KB a menos por
visualização de página.

**O ganho é de HTML/SSR, não de JavaScript de cliente.** Os quatro blocos
removidos eram Server Components — não havia bundle deles para economizar. Dizer
que a página "ficou mais leve no JS" seria falso; ela ficou mais leve no HTML
transferido e faz duas chamadas de rede a menos por request.

Depois da mudança, `/carros-em/[slug]` tem exatamente o mesmo First Load JS das
rotas irmãs (136 kB), o que é coerente: passou a montar o mesmo conjunto de
componentes de cliente que elas.

---

## 15. Testes

| Suíte | Arquivo | Testes |
|---|---|---|
| Variante de colunas | `components/buy/VehicleGrid.columns.test.tsx` | 6 (novo) |
| Paginação página única | `components/buy/CatalogPagination.test.tsx` | 23 (6 novos) |
| Resiliência SEO | `lib/seo/local-seo-data.resilience.test.ts` | 6 (novo) |
| Geometria E2E | `e2e/catalog-city-clean-grid.spec.ts` | 15 (novo) |

### Suíte completa do frontend

```
Test Files  2 failed | 225 passed (227)
     Tests  5 failed | 3549 passed (3554)
```

**As 5 falhas são anteriores a esta fase.** Rodei os dois arquivos com a `main`
em checkout e obtive exatamente o mesmo resultado:

```
main:   Test Files  2 failed (2)   Tests  5 failed | 12 passed (17)
branch: (mesmos 2 arquivos, mesmas 5 falhas)
```

São `app/seguranca/page.copy.test.ts` (2 falhas de copy ausente na página) e
`app/carros-usados/regiao/[slug]/page.config.test.ts` (3 falhas das flags
`REGIONAL_PAGE_INDEXABLE` / `CANONICAL_SELF`). Nenhum dos dois está no diff.

Verificações de tipo e estilo: `tsc --noEmit` limpo, `next lint --max-warnings 0`
limpo, `prettier --check` limpo nos 10 arquivos tocados.

Os testes de coluna existem por um motivo específico: eles falham se alguém
trocar a classe global e a quarta coluna vazar para as outras quatro rotas.
Asseguram que a diferença entre `"default"` e `"wide"` é *exatamente* a string
`min-[1600px]:grid-cols-4`, e que nenhuma variante emite `lg:`, `xl:` ou `2xl:`
com 4 colunas.

O E2E mede bounding box real porque a classe no atributo `class` não prova que o
navegador aplica a coluna — a regra pode não ter sido emitida no CSS, o container
pode não crescer, outra regra pode vencer.

---

## 16. Um erro que os testes quase esconderam

A primeira versão do teste "os blocos pós-catálogo não são mais montados" usava
strings plausíveis, deduzidas do **nome dos componentes**:

```
"Também na região de"                  (NearbyRadiusSection)
"Panorama do mercado"                  (CityAuthoritySection)
"Lojas e vendedores em"                (DealerDiscovery)
"Quantos carros usados estão à venda"  (FaqBlock)
```

Quatro dessas cinco strings **nunca existiram no HTML** — nem antes nem depois.
`not.toContain` de algo que jamais esteve lá é verde com ou sem a mudança: o
teste passava por vacuidade e não teria detectado se os blocos continuassem na
página.

Só percebi ao comparar os `<h2>` reais dos dois builds. Os títulos verdadeiros
são outros ("O mercado de carros usados em Atibaia", "Sobre carros usados em
Atibaia", …), e cada um aparecia 2 a 4 vezes no baseline. A lista foi refeita a
partir do HTML medido, e o teste ganhou uma contraprova: ele exige que o H1 e o
cabeçalho de resultados **continuem presentes**, para que uma página vazia não
faça as seis ausências passarem por engano.

---

## 17. Decisões de produto registradas

- **Nenhum bloco substituto foi criado.** Sem chips, sem "Explore em Atibaia",
  sem "conteúdo relacionado". A fase foi explícita: catálogo limpo > conteúdo SEO
  visual pós-listagem.
- **Os 5 links internos perdidos** (marcas/modelos daquela cidade) continuam
  publicados em `brands.xml` e `models.xml`. A malha para o crawler não depende
  do bloco visual.
- **1024px continua em 3 colunas** com card de 189px. Comportamento anterior à
  fase, mantido por estar fora do escopo.

---

## 18. Evidências visuais

Em `reports/screenshots/fase-5-0b/` — 10 capturas da branch, 4 do baseline
(`main`), e os JSON com todas as medidas de bounding box das duas versões.

| Arquivo | O que mostra |
|---|---|
| `01-city-desktop-1280__branch` / `__baseline` | primeira dobra em 1280 — **hash SHA-256 idêntico** |
| `02-city-desktop-1440__branch` | 3 colunas em 1440 |
| `03-city-desktop-1920-4-colunas__branch` | as 4 colunas, cards de 281px |
| `04-city-desktop-1280-fullpage__branch` / `__baseline` | página inteira, antes e depois |
| `05-city-desktop-1920-fullpage__branch` | página inteira em 4 colunas |
| `06-city-mobile-390__branch` / `__baseline` | mobile, primeira dobra |
| `07-city-mobile-390-fullpage__branch` / `__baseline` | mobile inteiro — base da comparação por pixel |
| `08-city-tablet-768__branch` | 2 colunas no tablet |
| `09-city-paginacao-desktop__branch` | recorte do paginador `‹ 1 ›` |
| `10-city-footer-transition__branch` | **cards → paginação → rodapé**, o objeto da fase |
| `medidas__branch.json` / `medidas__baseline.json` | medidas cruas de cada viewport |

O script que produz tudo isso está versionado em
`frontend/scripts/fase-5-0b-capture.mjs` e roda contra qualquer `next start`
(`node scripts/fase-5-0b-capture.mjs <porta> <rótulo> <saída>`), então a
comparação pode ser refeita a qualquer momento.

---

## 19. Como reproduzir a verificação

```bash
cd frontend && npm run build && npx next start -p 3000
```

```bash
cd frontend && npx playwright test e2e/catalog-city-clean-grid.spec.ts --reporter=list
```

```bash
cd frontend && npx vitest run components/buy/VehicleGrid.columns.test.tsx components/buy/CatalogPagination.test.tsx lib/seo/local-seo-data.resilience.test.ts
```

Para refazer a comparação com o baseline: `git checkout main`, rebuild, subir na
mesma porta e rodar o script de captura com o rótulo `baseline`.

---

## 20. Estado da entrega

Dois commits na branch `codex/catalog-city-clean-desktop-grid`, à frente de
`origin/main` em `190df7a5`:

| Commit | Assunto |
|---|---|
| `1aea9584` | `feat(catalogo)` — a mudança |
| `ee9b0d57` | `test(catalogo)` — correção das asserções vacuosas (§16) |

**Não foi feito push, PR, merge nem deploy.** Aguardando revisão.
