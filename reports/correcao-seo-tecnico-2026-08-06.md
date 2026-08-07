# Correção prioritária de SEO técnico — Carros na Cidade

Data: 2026-08-06 · Branch: `codex/fix-seo-routing-and-indexation`

---

## 1. Estado inicial

| Item | Valor |
| --- | --- |
| Branch de origem | `fix/redirect-onrender-para-dominio-canonico` |
| Commit de origem | `d26f7f42` — *feat(seo): rota /healthcheck dedicada* |
| Alterações locais | Nenhuma (`git status` limpo) |
| Stashes | 4 pré-existentes, **intocados** |
| Branch criada | `codex/fix-seo-routing-and-indexation` |

**Testes que já falhavam ANTES de qualquer alteração** (5 testes, 2 arquivos):

```
app/seguranca/page.copy.test.ts
  › contém o bloco "O que o Carros na Cidade faz na moderação"
  › declara explicitamente o que NÃO fazemos (Detran/vistoria/garantia)

app/carros-usados/regiao/[slug]/page.config.test.ts
  › INDEXABLE=true sozinha → index, mas canonical permanece para cidade-base
  › CANONICAL_SELF=true sozinha → canonical self, mas noindex permanece
  › ambas true (Fase D plena) → index + canonical self
```

Nenhum tem relação com esta correção. Continuam falhando, iguais, no fim.

Não houve `git reset --hard`, `git clean`, deploy ou merge.

---

## 2. Resumo das correções

O diagnóstico da auditoria estava certo: não há bloqueio de indexação. O que
existia era **um recurso com quatro endereços** e nenhum deles concordando sobre
qual é o verdadeiro.

A mesma cidade era servida por `/comprar?city_slug=X`, `/comprar/cidade/X`,
`/cidade/X` e `/carros-em/X`. O chrome global — header e rodapé, ou seja, *toda*
página do site — linkava a primeira, que só existe para redirecionar. A canônica
`/carros-em/X` não recebia link interno direto de lugar nenhum, e o Search
Console relatava "página alternativa com canônica diferente" para o conjunto.

Sete mudanças estruturais:

1. **Uma função monta URL territorial.** `getCanonicalCityPath` é a fonte única.
   Preserva sempre o slug recebido e devolve `null` para slug inválido — não
   existe cidade padrão em lugar nenhum do caminho.
2. **Os links internos apontam para o destino final.** 19 geradores corrigidos,
   incluindo os três de maior volume (CTA da home, busca da home, header/rodapé).
3. **`/comprar` virou página de verdade.** Era um redirector que resolvia estado
   por cookie — a mesma URL devolvia destinos diferentes por visitante, o que
   não é canonicalizável. Hoje é a vitrine nacional: 200, H1 próprio, canonical
   autorreferente, listando estados e cidades **com anúncio ativo**.
4. **As rotas legadas viraram 308 real, no middleware.** `/comprar/cidade/[slug]`,
   `/anuncios`, `/anuncios/[identifier]` e as versões parametrizadas de
   `/comprar`. No middleware porque `redirect()` em Server Component do Next 14.2
   comita **200 + meta refresh** — comprovado nesta validação, ver §8.
5. **Uma tabela decide o que cada parâmetro faz.** `lib/seo/query-policy.ts`.
   A regra anterior conhecia 11 parâmetros; o catálogo já usava 20.
6. **A paginação virou `<a href>`.** Era `<button onClick>`: a página 2 não
   existia para o Googlebot.
7. **O sitemap regional voltou a ser XML.** A causa estava no *nome da pasta*.

A regra territorial (`status='active'`) não foi tocada e ganhou teste dedicado.

---

## 3. Arquivos modificados

### Novos módulos

| Arquivo | Função | Problema anterior | Mudança | Resultado |
| --- | --- | --- | --- | --- |
| `lib/seo/canonical-city-path.ts` | `getCanonicalCityPath`, `buildCanonicalCityHref`, `isValidCanonicalCitySlug` | Quatro formatos de URL para a mesma cidade, montados à mão em 19 lugares | Fonte única, pura, server+client. Slug inválido → `null` | Todo link territorial sai de um lugar só; slug ruim não vira link quebrado nem doorway page |
| `lib/seo/query-policy.ts` | `SEO_QUERY_POLICY`, `decideSeoQueryPolicy` | Cada rota decidia sozinha sobre `sort`/`page`/`raio`/`utm` | Tabela declarativa por categoria (sorting/pagination/filter/tracking/territory) | Uma resposta só no portal para "este parâmetro indexa?" |
| `lib/middleware/canonical-redirects.ts` | 4 decisões puras de redirect | Redirects em `page.tsx` → 200 + meta refresh | Decisões puras consumidas pelo middleware | 308 HTTP real antes de qualquer HTML |
| `lib/buy/national-directory.ts` | `buildNationalDirectory` | `/comprar` não tinha conteúdo próprio | Deriva estados/cidades do conjunto de anúncios ativos | Vitrine nacional com dado real, sem segunda lista |

### Rotas

| Arquivo | Problema anterior | Mudança | Resultado |
| --- | --- | --- | --- |
| `app/comprar/page.tsx` | Redirector por cookie, sem canonical própria, default territorial fixo | Vitrine nacional 200 + canonical autorreferente | Destino final e indexável |
| `app/comprar/cidade/[slug]/page.tsx` | Catálogo COMPLETO duplicado + fallback territorial (servia estoque de outra cidade) | Só `permanentRedirect` + `noindex` | Deixou de competir com a canônica |
| `app/anuncios/page.tsx` | 200 canonicalizando para uma rota que redirecionava | `permanentRedirect("/comprar")` + `noindex` | Cadeia de canonical desfeita |
| `app/carros-em/[slug]/page.tsx` | `generateMetadata` **ignorava** `searchParams` | Passa `searchParams` para a política | `?raio=`, `?sort=`, `?seller_kind=` deixaram de ser páginas indexáveis |
| `app/comprar/estado/[uf]/page.tsx` | `noindex` por lista ad-hoc de filtros | Usa a política central | Mesma regra das demais vitrines |
| `app/sitemaps/regiao/[state]/route.ts` | Pasta `[state].xml` — segmento dinâmico inválido | Pasta `[state]`, sufixo removido no handler; UF inválida → 404 real | XML válido no lugar de HTML |
| `middleware.ts` | — | 5 pontos de redirect 308, todos depois dos gates de 404 | Status real, sem cadeia, 404 territorial preservado |

### Geradores de link corrigidos

`lib/site/site-navigation.ts` (header + rodapé) · `components/home/sections/HomeHero.tsx`
· `components/home/sections/HomeSearchCard.tsx` · `lib/search/build-home-comprar-url.ts`
· `lib/home/home-discovery.ts` · `lib/seo/local-seo-data.ts` · `lib/blog/blog-page.ts`
· `components/blog/*` (4 arquivos) · `components/fipe/FipePageClient.tsx`
· `components/financing/FinancingLandingPageClient.tsx`
· `components/vehicle/detail/VehicleDetailView.tsx`
· `components/search/TerritorialResultsPageClient.tsx` · `lib/city/CityContext.tsx`
· `lib/territory/territory-resolver.ts` · `app/sitemaps/_lib/transition-helpers.ts`
· `app/carros-usados/regiao/[slug]/region-faq-entries.ts` · `components/common/RegionalEntryHub.tsx`

Dois casos merecem destaque:

- **"Oportunidades abaixo da FIPE"** apontava para `/comprar?below_fipe=true&city_slug=X`,
  que não era página nenhuma — era um filtro sobre um redirect. Passou a apontar
  para `/carros-baratos-em/[slug]`, rota limpa, indexável e autocanônica.
- **Os três CTAs da home** montavam a URL por `URLSearchParams`, então escaparam
  da primeira varredura de fonte (que só procurava literais). A varredura ganhou
  regras para interpolação — ver §7.

---

## 4. Mapa final de URLs

Medido contra build de produção local (§8).

| URL de entrada | Status | Destino final ou canonical | Indexável |
| --- | ---: | --- | ---: |
| `/comprar` | 200 | canonical `/comprar` (autorreferente) | **sim** |
| `/comprar?city_slug=atibaia-sp` | 308 | `/carros-em/atibaia-sp` | — |
| `/comprar?city_slug=braganca-paulista-sp` | 308 | `/carros-em/braganca-paulista-sp` | — |
| `/comprar?state=mg` | 308 | `/comprar/estado/mg` | — |
| `/comprar/cidade/atibaia-sp` | 308 | `/carros-em/atibaia-sp` | — |
| `/comprar/cidade/atibaia-sp?sort=relevance` | 308 | `/carros-em/atibaia-sp` | — |
| `/comprar/cidade/braganca-paulista-sp?brand=Honda` | 308 | `/carros-em/braganca-paulista-sp?brand=Honda` | — |
| `/comprar/cidade/xpto-zz` | **404** | — (nunca redirect) | não |
| `/carros-em/atibaia-sp` | 200 | canonical `/carros-em/atibaia-sp` | **sim** |
| `/carros-em/atibaia-sp?sort=relevance` | 308 | `/carros-em/atibaia-sp` | — |
| `/carros-em/atibaia-sp?sort=price_asc` | 200 | canonical `/carros-em/atibaia-sp` | não |
| `/carros-em/atibaia-sp?raio=25` | 200 | canonical `/carros-em/atibaia-sp` | não |
| `/carros-em/atibaia-sp?utm_source=google` | 200 | canonical `/carros-em/atibaia-sp` | **sim** |
| `/carros-em/atibaia-sp?page=1` | 308 | `/carros-em/atibaia-sp` | — |
| `/carros-em/atibaia-sp?page=2` | 200 | canonical `/carros-em/atibaia-sp?page=2` | **sim** |
| `/carros-em/xpto-zz` | **404** | — | não |
| `/anuncios` | 308 | `/comprar` | — |
| `/anuncios/[identifier]` | 308 | `/veiculo/[slug]` | — |
| `/sitemap.xml` | 200 | `application/xml` | — |
| `/sitemaps/regiao/sp.xml` | 200 | `application/xml` | — |
| `/sitemaps/regiao/zz.xml` | **404** | `text/plain` | — |

Nenhuma cadeia: todos os redirects medidos têm **exatamente 1 salto**.

---

## 5. Política de parâmetros

Fonte: `lib/seo/query-policy.ts`.

| Parâmetro | Categoria | Robots | Canonical | Redirect |
| --- | --- | --- | --- | --- |
| `sort=relevance` | sorting (default) | index, follow | URL limpa | **308** → sem o parâmetro |
| `sort=price_asc\|price_desc\|newest\|recent` | sorting | noindex, follow | URL limpa | não |
| `page=1` / `0` / negativo / não-numérico | pagination | index, follow | URL limpa | **308** → URL limpa |
| `page>=2` | pagination | index, follow | **autorreferente com `?page=N`** | não |
| `limit` | pagination | index, follow | URL limpa | não |
| `raio`, `radius` | filter | noindex, follow | URL territorial limpa | não |
| `seller_kind` | filter | noindex, follow | URL territorial limpa | não |
| `opportunity` | filter | noindex, follow | URL territorial limpa | não |
| `priority_tier` | filter | noindex, follow | URL territorial limpa | não |
| `price_min`, `price_max`, `min_price`, `max_price` | filter | noindex, follow | URL territorial limpa | não |
| `year_min`, `year_max`, `mileage_max` | filter | noindex, follow | URL territorial limpa | não |
| `transmission`, `fuel`, `fuel_type`, `body_type` | filter | noindex, follow | URL territorial limpa | não |
| `q`, `brand`, `model`, `below_fipe`, `highlight_only` | filter | noindex, follow | URL territorial limpa | não |
| `utm_source/medium/campaign/content/term/id` | tracking | **inalterado** | URL limpa | **não** |
| `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid` | tracking | **inalterado** | URL limpa | **não** |
| `city_slug`, `city_id`, `city`, `state`, `city_slugs` | territory | noindex, follow | URL limpa | não (a rota trata) |
| *desconhecido* | tratado como filter | noindex, follow | URL limpa | não |

Três decisões que merecem justificativa:

- **Filtros não vão para o `robots.txt`.** Bloquear por Disallow impediria o
  Google de buscar a página — e sem buscar, ele não lê o `noindex` nem a
  canonical. Os filtros continuam rastreáveis e continuam funcionando para o
  usuário; só não entram no índice.
- **Tracking nunca é removido por redirect.** Um 308 que descarta `utm_*`
  apagaria a atribuição da campanha.
- **Parâmetro desconhecido conta como filtro, não como tracking.** Tracking
  mantém `index`; se o desconhecido caísse ali, qualquer `?foo=bar` inventado
  por crawler viraria página indexável nova — o mecanismo que produziu as 5.658
  "canônica diferente".

**Política de paginação.** Páginas 2+ são páginas próprias, indexáveis, com
canonical autorreferente incluindo `?page=N`. Canonicalizar toda a paginação
para a página 1 esconderia do índice os anúncios do fim da lista — e como o
catálogo é ordenado por relevância comercial, o fim da lista é o acervo mais
antigo, justamente quem mais depende de busca orgânica.

---

## 6. Sitemaps

**Removidas:** `/anuncios` (hoje 308) · qualquer `/comprar/cidade/[slug]` vindo
do rewrite de transição (hoje 308).

**Mantidas:** `/`, `/comprar`, `/blog`, `/planos`, `/tabela-fipe`.
`/comprar` ficou **porque deixou de redirecionar**. Se voltar a ser redirector,
sai junto — o teste em `lib/seo/sitemap-static.test.ts` documenta o critério.

**Contagem estática:** 6 → 5 URLs. Os sitemaps dinâmicos (cidades, marcas,
modelos, veículos, blog, abaixo-da-FIPE) não mudaram de fonte; o `cities.xml` já
emitia `/carros-em/[slug]` desde 2026-07-04.

**Sitemap regional.** `GET /sitemaps/regiao/sp.xml` respondia **200 `text/html`**
— a página de not-found, com a canonical da home. A causa não estava no handler:
a pasta se chamava `[state].xml`, e no App Router um segmento dinâmico precisa
ser a pasta inteira entre colchetes. `[state].xml` não fecha em `]`, então o Next
o tratava como literal e a rota nunca casava; a requisição caía em
`app/[uf]/regiao/[ancora]` (`uf="sitemaps"`, `ancora="sp.xml"`), que chama
`notFound()` — e no Next 14.2 isso comita 200 com HTML. Pasta renomeada para
`[state]`; UF inválida agora é 404 real em `text/plain`.

**`lastmod`.** Deixou de ser emitido no sitemap estático e no índice. Antes era
`new Date()` a cada request: o sitemap afirmava, em toda leitura, que a página
"Planos" tinha acabado de mudar. Um `lastmod` que muda sempre não é dado — é
ruído que ensina o Google a ignorar o campo, inclusive onde ele é verdadeiro
(anúncios e posts carregam `updated_at` real do backend). Sem data confiável,
omitir é a leitura honesta. O teste trava que duas leituras produzem XML idêntico.

---

## 7. Testes

| Comando | Resultado |
| --- | --- |
| `npm run lint` (frontend) | ✅ sem warnings nem erros |
| `npx tsc --noEmit` (frontend) | ✅ sem erros |
| `npm run build` (frontend) | ✅ build + standalone verificado |
| `npx vitest run` (frontend) | **2522 passaram, 5 falharam** |
| `npx vitest run tests/seo/territorial-existence-rule.test.js` | ✅ 17 passaram |

**Falhas novas: nenhuma.** As 5 falhas são exatamente as 5 pré-existentes de §1.

Cobertura acrescentada (~200 testes novos):

| Arquivo | O que trava |
| --- | --- |
| `lib/seo/canonical-city-path.test.ts` | Slug preservado; 4 cidades diferentes; slug inválido → `null` |
| `lib/seo/query-policy.test.ts` | 33 parâmetros classificados; idempotência da normalização |
| `lib/seo/territorial-canonical-contract.test.ts` | Canonical/robots por tipo de query; página 2+; Atibaia nunca canonicaliza para Bragança |
| `lib/seo/internal-links-sweep.test.ts` | **Varredura de fonte** — nenhum arquivo pode reintroduzir a rota legada |
| `lib/seo/sitemap-static.test.ts` | Só destinos finais; `lastmod` nunca artificial |
| `lib/middleware/canonical-redirects.test.ts` | 43 casos de redirect, sem cadeia e sem cidade fixa |
| `lib/middleware/canonical-redirects-reachability.test.ts` | **O middleware CHEGA a chamar** cada decisão, na ordem certa |
| `components/buy/CatalogPagination.test.tsx` | `<a href>`, `aria-current`, sem `page=1`, sem página inválida |
| `app/sitemaps/regional-route.test.ts` | XML válido; **estrutura de pasta**; UF inválida → 404 |
| `lib/buy/national-directory.test.ts` | Só cidade com anúncio ativo entra |
| `tests/seo/territorial-existence-rule.test.js` | `status='active'` na origem; nenhum outro status ativa cidade |

Três escolhas de método que valem registro:

1. **Duas cidades em todo caso territorial** (`atibaia-sp` e `braganca-paulista-sp`).
   Com uma cidade só, um retorno fixo passaria em todos os testes.
2. **Teste de alcance no middleware.** A lição de 2026-08-06 é que função pura
   correta + teste unitário verde não provam que o middleware chega a chamá-la.
   O guard da Página Regional retorna cedo, então a normalização de query do fim
   do middleware é inalcançável para `/carros-usados/regiao/[slug]` — a chamada
   é repetida lá dentro e há teste cobrindo exatamente esse ponto.
3. **Varredura de fonte, não teste por componente.** O defeito não era um link
   errado, eram dezenove. A varredura **já pagou duas vezes**: pegou
   `lib/blog/blog-page.ts`, que tinha ficado para trás, e depois — quando
   ampliada para interpolação — pegou os três CTAs da home, que montavam a URL
   via `URLSearchParams` e escapavam da busca por literal.

---

## 8. Evidências HTTP

Build de produção local (`npm run build` + standalone), backend público real
(27 anúncios ativos em Atibaia-SP), User-Agent de navegador.

```
URL                                              status  destino                              chain
/                                                200     —                                    —
/comprar                                         200     —                                    —
/comprar?city_slug=atibaia-sp                    308     /carros-em/atibaia-sp                1 salto
/comprar?city_slug=braganca-paulista-sp          308     /carros-em/braganca-paulista-sp      1 salto
/comprar?state=mg                                308     /comprar/estado/mg                   1 salto
/comprar/cidade/atibaia-sp                       308     /carros-em/atibaia-sp                1 salto
/comprar/cidade/atibaia-sp?sort=relevance        308     /carros-em/atibaia-sp                1 salto
/comprar/cidade/braganca-paulista-sp?brand=Honda 308     /carros-em/...?brand=Honda           1 salto
/comprar/cidade/xpto-zz                          404     —                                    —
/anuncios                                        308     /comprar                             1 salto
/carros-em/atibaia-sp                            200     —                                    —
/carros-em/atibaia-sp?sort=relevance             308     /carros-em/atibaia-sp                1 salto
/carros-em/atibaia-sp?sort=price_asc             200     —                                    —
/carros-em/atibaia-sp?page=1                     308     /carros-em/atibaia-sp                1 salto
/carros-em/atibaia-sp?page=2                     200     —                                    —
/carros-em/xpto-zz                               404     —                                    —
/sitemap.xml                                     200     application/xml; charset=utf-8       —
/sitemaps/regiao/sp.xml                          200     application/xml; charset=utf-8       —
/sitemaps/regiao/zz.xml                          404     text/plain; charset=utf-8            —
```

### Conteúdo servido

```
/comprar
  canonical : /comprar                      robots : index, follow
  h1        : Carros usados e seminovos à venda no Brasil
  título    : Comprar carros usados e seminovos no Brasil
  conteúdo  : "São 27 anúncios ativos em 1 cidade."
              seções "Estados com anúncios ativos" + "Cidades com anúncios ativos"

/carros-em/atibaia-sp
  canonical : /carros-em/atibaia-sp         robots : index, follow
  h1        : Carros usados em Atibaia      anúncios no HTML : 27 links /veiculo/

/carros-em/atibaia-sp?sort=price_asc
  canonical : /carros-em/atibaia-sp         robots : noindex, follow

/carros-em/atibaia-sp?raio=25
  canonical : /carros-em/atibaia-sp         robots : noindex, follow

/carros-em/atibaia-sp?utm_source=google
  canonical : /carros-em/atibaia-sp         robots : index, follow

/carros-em/atibaia-sp?page=2
  canonical : /carros-em/atibaia-sp?page=2  robots : index, follow
```

### Paginação no HTML (`?limit=10&page=2`)

```html
<a rel="prev" aria-label="Página anterior" href="/carros-em/atibaia-sp?limit=10">
<a aria-label="Página 1" href="/carros-em/atibaia-sp?limit=10">1</a>
<span aria-current="page">2</span>
<a aria-label="Página 3" href="/carros-em/atibaia-sp?limit=10&amp;page=3">3</a>
<a rel="next" aria-label="Próxima página" href="/carros-em/atibaia-sp?limit=10&amp;page=3">
```

Links reais, `rel=prev`/`rel=next`, `aria-current` na atual, página 1 sem
`page=1`. Funciona sem JavaScript.

### O bug do meta refresh, capturado

Com o gate do anúncio desligado (ambiente local sem `INTERNAL_API_TOKEN`), a
requisição chega ao `page.tsx` — e a resposta é:

```
HTTP/1.1 200 OK
<meta http-equiv="refresh" content="0;url=/veiculo/gm-chevrolet-onix-..."/>
```

Isto é exatamente o que a auditoria descreveu e a razão de os redirects terem
sido movidos para o middleware: `permanentRedirect()` em Server Component do
Next 14.2 comita **200 com meta refresh**, que o Googlebot não trata como
redirect. Com o gate ativo, o middleware emite 308 antes de qualquer HTML.

---

## 9. Commits

| Hash | Mensagem |
| --- | --- |
| `0465d4d8` | fix(seo): centralize canonical city paths |
| `4a494289` | fix(seo): point territorial links to canonical routes |
| `6ce49609` | fix(seo): centralize query parameter policy |
| `6599a3a5` | fix(seo): replace legacy city pages with permanent redirects |
| `7c4d6c23` | fix(seo): correct comprar and anuncios routing |
| `aa4cd286` | fix(seo): make catalog pagination crawlable |
| `4a4e7a17` | fix(seo): remove non-canonical sitemap entries |
| `96698824` | fix(seo): repair regional sitemap XML routing |
| `035b5426` | test(seo): cover routes parameters pagination and sitemaps |
| `354c0048` | fix(seo): route home CTAs straight to the canonical city |

---

## 10. Riscos restantes (fora do escopo desta etapa)

1. **`INTERNAL_API_TOKEN` precisa estar presente no BUILD, não só no runtime.**
   O Next inlina `process.env` no bundle do middleware em tempo de build. Sem a
   variável no ambiente de build, os gates territoriais e o alias de anúncio
   ficam permanentemente em `pass-unavailable` — fail-open silencioso. Vale
   conferir no Render antes do deploy. *(Descoberto durante esta validação.)*

2. **Fallback territorial ainda existe em `city-catalog-loader`.** Foi removido
   do caminho de `/comprar/cidade/[slug]` porque a rota virou redirect, mas a
   opção `applyTerritoryFallback` continua no loader. Nenhuma rota pública a usa
   com `true` hoje.

3. **`components/search/VehicleSearchResultsPage.tsx` ficou órfão** — era usado
   só por `/anuncios`, agora um redirect. Não removido: Part 12 veta varredura
   ampla de código morto. Entra na pendência já registrada de `knip`/`ts-prune`.

4. **`components/common/RegionalEntryHub.tsx` continua sem consumidor.** Links
   corrigidos por higiene, mas o componente é morto.

5. **`/comprar` não aceita filtros.** A vitrine nacional é um diretório; um
   `/comprar?q=civic` renderiza o diretório e ignora o `q`. A busca da home
   agora vai direto para a cidade, então o caso só aparece com URL montada à
   mão. Se a busca nacional virar produto, é outra etapa.

6. **`/cidade/[slug]` continua respondendo 200 `noindex`** canonicalizando para
   `/carros-em/[slug]`. Não é competidora (é noindex), mas é mais uma família
   territorial viva. Consolidá-la em 308 é decisão de produto.

7. **Página estadual `/comprar/estado/[uf]` canonicaliza para `/carros-usados/[uf]`**
   sem 301. Herdado do briefing de 2026-05-20, que condicionou o redirect a
   validação de produção.

8. **As 5 falhas de teste pré-existentes** (§1) seguem abertas.

---

## 11. Veredito final

| Pergunta | Resposta |
| --- | --- |
| Todos os links territoriais apontam para `/carros-em/[slug]`? | **Sim.** 19 geradores corrigidos, varredura de fonte impede regressão. Exceções são gates e redirects, que precisam reconhecer o pathname legado. |
| `/comprar` deixou de funcionar como soft redirect? | **Sim.** 200, H1/title/description próprios, canonical autorreferente, conteúdo derivado do inventário ativo. |
| `/comprar/cidade/[slug]` deixou de competir com a URL canônica? | **Sim.** 308 real no middleware, sem cadeia, preservando o slug. A página só redireciona e é `noindex`. |
| `/anuncios` deixou de formar cadeia de canonical? | **Sim.** 308 direto para `/comprar`, e saiu do sitemap. |
| Ordenações estão controladas? | **Sim.** `sort=relevance` normaliza por 308; demais ordenações são `noindex,follow` com canonical limpa. |
| Filtros arbitrários estão noindex? | **Sim.** Inclusive `raio`, `seller_kind`, `opportunity` e `priority_tier`, que a regra anterior não enxergava. |
| A paginação possui links HTML? | **Sim.** `<a href>` com `rel=prev`/`next` e `aria-current`, verificado no HTML servido. |
| Os sitemaps possuem apenas destinos finais? | **Sim.** `/anuncios` removido; `/comprar` mantido por ter virado destino final; `lastmod` artificial eliminado. |
| O sitemap regional retorna XML válido? | **Sim.** 200 `application/xml` para UF válida, 404 `text/plain` para UF inválida. |
| A regra de criação de cidade por anúncio ativo foi preservada? | **Sim.** Intocada e agora com teste dedicado: `status='active'` na origem, nenhum outro status ativa cidade, UF derivada das mesmas cidades. |

**Não houve deploy. Não houve merge.**
