# SEO Fase 4.1A — Correções de Integridade Pública e Malha Interna (P1-1 a P1-5)

**Data:** 2026-09-01
**Escopo:** somente os cinco P1 públicos comprovados na auditoria da Fase 4.
**Fora de escopo (intocado):** P1-6, `/admin/seo`, P2, P3, workers, thresholds,
migrations, `render.yaml`, schema, SEO copy das landings.

---

## 1. Base

```
Branch     codex/seo-4-1a-public-integrity-links
Base       ba9b135a4656a8a29f02255d1d149117d7a1bf50  (main, ff-only, confirmada)
Relatório  reports/seo-fase-4-auditoria-integridade-territorial-2026-08-31.md
```

Sem push, sem PR, sem merge, sem deploy. **Zero migration. Zero escrita em
produção.** Nenhum worker SEO foi ligado; o Pipeline B (planejamento) continua
dormente e deixou de ser fonte de qualquer endpoint público.

---

## 2. Princípio aplicado

O Pipeline A (estoque ativo em `ads`) continua sendo a única fonte de verdade
territorial. As cinco correções têm a mesma forma:

> **Onde havia um literal, passou a haver uma consulta ao estoque — e a ausência
> de estoque passou a ser representada por `null`, não por um valor inventado.**

Nenhuma implementação nova de elegibilidade foi criada. Onde já existia um
mecanismo (`getTerritorialRoutesForCity` + `isCityPublic`, usado pelo cabeçalho
desde 2026-08-05), ele foi **reusado** pelos consumidores que o ignoravam.

---

## 3. P1-1 — endpoint SEO legado usando tabela congelada

### Antes (produção, 2026-08-31)

```
GET https://carros-na-cidade-core.onrender.com/api/public/seo/sitemap.xml → 200
  <loc>…/carros-baratos-em/atibaia-sp</loc>
  <loc>…/carros-baratos-em/braganca-paulista-sp</loc>   ← 404 no site
  <loc>…/carros-em/atibaia-sp</loc>
  <loc>…/carros-em/braganca-paulista-sp</loc>           ← 404 no site
```

`public-seo.service.js#listEntries` lia `seo_cluster_plans LEFT JOIN
seo_publications` sem validação de estoque. Bragança tem 3 anúncios, todos
`deleted`.

### Depois (código novo, rodado contra o banco de PRODUÇÃO, somente leitura)

```
### /api/public/seo/sitemap.json — 6 URLs
  /carros-em/atibaia-sp                                  [city_home]        prio=0.8 cf=daily
  /carros-baratos-em/atibaia-sp                          [city_below_fipe]  prio=0.7 cf=daily
  /cidade/atibaia-sp/marca/fiat                          [city_brand]       prio=0.6 cf=weekly
  /cidade/atibaia-sp/marca/chevrolet                     [city_brand]       prio=0.6 cf=weekly
  /cidade/atibaia-sp/marca/volkswagen                    [city_brand]       prio=0.6 cf=weekly
  /cidade/atibaia-sp/marca/chevrolet/modelo/onix         [city_brand_model] prio=0.7 cf=weekly

### Bragança presente? NÃO
```

As seis URLs são exatamente as que a auditoria mediu como **200 + `index,
follow` + canonical self**.

**Contraprova (nada foi escrito):**

```
### seo_publications ainda contém:
  /carros-em/braganca-paulista-sp          status=published is_indexable=true
  /carros-baratos-em/braganca-paulista-sp  status=published is_indexable=true
```

As linhas órfãs continuam lá, intactas — elas simplesmente deixaram de governar
qualquer superfície pública. O saneamento delas é da Fase 4.1B, junto do painel.

### Como

- **Novo:** `sitemap-public.service.js#getPublicSitemapAllTypes()` — a composição
  das quatro famílias de estoque, com UM dono. `getPublicSitemapByRegion` foi
  refatorado para filtrar esse resultado em vez de repetir a composição.
- `public-seo.service.js` passou a consumir essa função. Não há SQL neste módulo.
- Contrato HTTP **preservado**: mesmas rotas, mesmo `content-type`, mesmos
  headers de cache/robots, mesmo shape `{ loc, lastmod, changefreq, priority }`.

**Mudança observável de valor:** `priority` de `city_below_fipe` cai de 0.9 para
0.7. O 0.9 vinha de `seo_cluster_plans.money_page`, coluna que o pipeline de
estoque não tem. Preferimos perder o 0.9 a manter uma leitura da tabela congelada
só para preservá-lo — `priority` é dica que o Google ignora.

### Consumidores verificados antes de mexer

| consumidor | situação |
|---|---|
| `frontend/lib/seo/sitemap-client.ts#fetchPublicSitemap` | definido, **sem nenhum chamador** |
| `/sitemaps/*.xml` | usam `type/`, `region/`, `vehicles` — **não** o canônico |
| `listPublicSitemapEntriesByType/ByRegion` | exports **sem chamador** (repontados por segurança) |
| rotas | **preservadas** — nenhuma removida, conforme §3 do briefing |

---

## 4. P1-2 — fallback global `sao-paulo-sp`

### Antes (produção)

`FALLBACK_PUBLIC_CITY.slug = "sao-paulo-sp"`, cidade com **zero** anúncios
ativos. As seis rotas de cidade respondem 404. O Googlebot nunca carrega o
cookie `cnc_city`, então o crawler recebia **sempre** essa variante.

| página | links `sao-paulo-sp` distintos |
|---|---|
| `/` (home) | 5 |
| `/cidade/atibaia-sp/marca/chevrolet` | 5 |
| `/blog` | 20 (`/blog/sao-paulo-sp/...`) |
| `/blog/<post>` × 13 posts indexáveis | 8 cada = **104** |
| `/carros-em/atibaia-sp` | 0 (contexto resolvido pela própria rota) |

Os dois últimos casos **não estavam no relatório da Fase 4** — foram encontrados
ao percorrer a malha durante esta fase. São o mesmo defeito, no mesmo literal.

### Depois

**Nenhum literal de cidade sobrou em caminho de runtime.** Verificado por
conteúdo: as ocorrências restantes de `sao-paulo-sp` no frontend são comentários,
um placeholder de formulário do admin e o módulo morto `lib/market/market-data.ts`.

### Como — a cadeia inteira

**1. Backend, aditivo (sem migration):**
`public-city-set.service.js#pickPrimaryPublicCity()` → `primaryCity` no payload de
`/api/public/cities/public-set`. Derivado da MESMA passagem que monta `cities`.
Determinístico: maior estoque ativo; empate por `slug` ASC. `null` quando não há
cidade. Não depende de `Object.keys()`.

**2. Frontend, resolução no servidor:**
`lib/city/public-default-city.ts#resolvePublicDefaultCity()` — reusa
`fetchPublicCitySet()`, que já bate no endpoint com `revalidate: 60` e tag
`public-city-set`. **Nenhum cache novo, nenhum TTL novo, nenhuma consulta nova.**

**3. `app/layout.tsx`** — o ponto de estrangulamento do SSR:

```
pathname territorial → cookie → cidade pública primária → null
```

**4. `CityContext`** — `city` passou a ser `CityRef | null`. `null` deixou de ser
impossível: é como se representa "não há cidade". A cidade guardada que sai do
conjunto público agora vira `null` em vez de voltar para `sao-paulo-sp` (trocar
uma cidade 404 por outra).

**5. `site-navigation.ts`** — `citySlug || DEFAULT_PUBLIC_CITY_SLUG` removido. A
ausência cai no MESMO ramo de "cidade não é pública", que já existia e devolve
rotas-índice (`/comprar`, `/tabela-fipe`, `/blog`, `/simulador-financiamento`) —
todas 200.

**6. Consumidores** — o rodapé passou a propagar `isPublicCity`, o mesmo sinal
que o cabeçalho já usava. `SmartVehicleSearch` busca sem recorte de cidade em vez
de filtrar por uma cidade vazia. Blog (hub, categoria, post) usa a canônica
global `/blog/<slug>` quando não há cidade — `/blog/post/<slug>` **não é rota do
App Router** (verificado), o fallback antigo era 404.

**7. `lib/city/city-default.ts` removido** — ficou órfão (nenhum importador) e
existia só para embalar o literal.

### Classificação dos consumidores (§7 do briefing)

| uso | classe | tratamento |
|---|---|---|
| `PublicFooter` → links territoriais | E (link) | `isPublicCity`; sem cidade, rotas-índice |
| `PublicHeader` → links territoriais | E | já usava `isPublicCity`; agora com `city` nullable |
| `SmartVehicleSearch` → destino de busca | B (precisa de cidade) | `null` = busca sem recorte |
| `/tabela-fipe`, `/simulador-financiamento` | D (redirect) | destino = cidade pública real; ver P1-3 |
| `/blog` → hub | B | cookie-se-público → primária → `null` |
| `CmsBlogPostArticle` → CTAs do post | E | idem |
| `PublicHeader`/`CityHeaderSelector`/`CityPickerModal` → rótulo | C (apresentação) | "Escolher cidade" em vez de cidade fictícia |
| `BlogHubServer` → copy e JSON-LD | C | cláusula territorial some; `about` só com cidade |

### Zero cidades públicas (§9)

Testado explicitamente. Com `public-set` vazio:

- nenhum slug é inventado;
- `getTerritorialRoutesForCity(null)` devolve as rotas-índice;
- `/tabela-fipe` e `/simulador-financiamento` redirecionam para `/comprar`;
- o chrome renderizado não emite NENHUM link com forma de cidade;
- o header mostra "Escolher cidade"; o hub do blog perde a cláusula territorial.

### Não é Atibaia hardcoded (§10)

`atibaia-sp` não aparece em nenhum caminho de runtime — só em testes, e2e,
smoke e comentários. A cidade padrão é **calculada**: hoje resolve Atibaia
porque Atibaia é a única com estoque; amanhã resolve o que o estoque disser.

---

## 5. P1-3 — `/tabela-fipe`

### Antes (produção)

```
GET /tabela-fipe → 200
  <title>Carros na Cidade | Marketplace automotivo regional</title>   ← layout raiz
  <link rel="canonical" href="https://www.carrosnacidade.com">        ← a HOME
  <meta name="robots" content="index, follow">
  corpo com NEXT_REDIRECT → /tabela-fipe/sao-paulo-sp                 ← 404
```

Listada em `core.xml`. Única violação de canonical entre as 53 URLs auditadas.

**Duas causas somadas:** (a) o destino sem cookie era uma cidade sem estoque;
(b) o `redirect()` de Server Component rodava depois de o shell do layout começar
a streamar, então a resposta saía **200** com a metadata do layout raiz
(`alternates: { canonical: "/" }`).

### Decisão

`/tabela-fipe` **não tem conteúdo próprio** — só escolhe cidade e redireciona.
Conforme §12 do briefing, não criamos landing editorial: tratamos como rota de
navegação.

1. **Removida do `core.xml`** — sitemap não pode conter redirect. Quem entra no
   sitemap é o DESTINO, `/tabela-fipe/[cidade]`, que já está em `content.xml`
   gateado por estoque ativo.
2. **`page.tsx` → `route.ts`** (Route Handler). Sem layout, sem streaming: o
   redirect sai como redirect de verdade.
3. **Destino resolvido** por `resolveTerritorialIndexTarget()`: cookie **se ainda
   for público** → cidade pública primária → `/comprar`.

### 307, não 308

O destino depende do cookie do visitante **e** do estoque vivo — pode ser
`/tabela-fipe/atibaia-sp` hoje e outra cidade amanhã. 308 diria ao Google que a
associação é definitiva e faria o navegador cachear o destino. **307** é a
semântica correta: temporário, revalidado a cada visita.

### Rotas irmãs (§13)

| rota | diagnóstico | ação |
|---|---|---|
| `/blog` | 200, canonical self (`/blog`), conteúdo próprio no HTML — **não viola** | **preservada.** Só o fallback de cidade foi corrigido (P1-2) |
| `/simulador-financiamento` | redirect com o MESMO destino quebrado, mas **não está em sitemap nenhum** e o destino é `noindex` por decisão de produto | corrigido o destino e a forma do redirect; **política de noindex intocada**, não reintroduzida em sitemap |

---

## 6. P1-4 — home com 6 posts inexistentes

### Antes

`ContentCardsSection.tsx` trazia seis `href` hardcoded:
`/blog/compra-usado`, `/blog/tabela-fipe`, `/blog/financiamento`,
`/blog/checklist`, `/blog/vender-rapido`, `/blog/carro-cidade`.

Os **seis** respondem 404. `blog_posts` tem 13 posts publicados, nenhum com esses
slugs.

### Depois

Os cards saem da MESMA fonte que o hub e o `blog.xml`
(`fetchPublishedBlogPosts` → `/api/public/blog/posts`), na ordem que o backend já
devolve (mais recentes primeiro). Destino: a **canônica global** `/blog/<slug>` —
a mesma URL que o `blog.xml` publica.

- Menos posts que o limite → menos cards.
- **Zero posts → a seção some.** Sem fallback para os slugs antigos.
- Ícone escolhido pela **categoria** do post real (os seis ícones existiam
  presos a seis artigos fixos).

### Performance (§17)

Os posts **não** estavam no payload da home. Entraram no `Promise.all` que já
existia em `app/page.tsx` — **nenhum round-trip em série, nenhum fetch por card**
— e reusam o cache do blog (`revalidate: 300`, tag `public-blog`).

---

## 7. P1-5 — CTA inválida do hero

### Antes

```
GET /api/public/home/hero
  "key":"home_hero_3", "cta_url":"/abaixo da fipe", "image_alt":"Oportunidade"

HTML da home:  <a aria-label="Oportunidade" … href="/abaixo da fipe">  → 404
```

### Correção do diagnóstico da Fase 4

O relatório da auditoria afirmou que **não havia validação em ponto nenhum do
caminho**. Isso estava **errado**, e a correção importa para o plano:

**A validação de ESCRITA já existe** —
`src/modules/admin/home/admin-home.service.js#validateCtaUrl`. Ela já rejeita
espaço literal, control-chars, `javascript:`, `data:`, `//host` e caminho interno
malformado; o comentário dela **cita "/abaixo da fipe" pelo nome** como o caso
que a motivou.

O que aconteceu foi ordem cronológica: **a regra chegou depois do dado.** A linha
foi gravada antes, e nada no caminho de LEITURA questionava o valor.

### Depois

**Camada de escrita:** já correta — **nada alterado**. Verificada e documentada.

**Camada de leitura (nova):** `frontend/lib/home/cta-url.ts` — espelho da mesma
política. `HomeHero` passou a usar `sanitizeCtaUrl(slide.cta_url)` em vez de
`hasContent(...)`. Valor inválido é **descartado**, não "consertado": tentar
reparar `"/abaixo da fipe"` adivinharia a intenção do admin. Descartado, o
componente cai no destino canônico que já calculava
(`buildCanonicalCityHref(defaultCitySlug, "/comprar")`), que é sempre uma URL
pública válida.

**Isto conserta o site mesmo antes de o dado ser limpo.**

### Dado `home_hero_3` — instrução para DEPOIS do merge/deploy

**Não executado.** Nada foi escrito em produção.

O valor correto é **`cta_url = null`**: o banner "Oportunidade" quer levar às
ofertas abaixo da FIPE, e deixar nulo faz o componente derivar a canônica da
cidade detectada (`/carros-em/<cidade>` ou `/comprar`) — que é o comportamento
territorialmente correto e que se mantém quando a cidade muda.

Se a intenção for especificamente o recorte abaixo-da-FIPE, o valor válido é
`/comprar?below_fipe=true` (aceito pela validação de escrita, exatamente o
exemplo citado na mensagem de erro dela).

Como aplicar, pelo admin (`PATCH /api/admin/home/hero/3`), após o deploy:

```json
{ "cta_url": null, "reason": "SEO 4.1A: valor legado '/abaixo da fipe' gerava 404 na home" }
```

---

## 8. Testes

### Novos (74 casos)

| arquivo | casos | trava |
|---|---|---|
| `tests/seo/canonical-sitemap-endpoint-inventory.test.js` | 6 | P1-1: Bragança fora; a fonte antiga **nem é consultada**; limiar; vazio; contrato |
| `frontend/lib/site/site-navigation.no-fallback-city.test.ts` | 12 | P1-2: nenhuma string produz `sao-paulo-sp`; rodapé = cabeçalho |
| `frontend/components/shell/chrome-no-dead-links.test.tsx` | 7 | **§23** — HTML RENDERIZADO sem link para cidade fora do conjunto |
| `frontend/lib/city/territorial-index-redirect.test.ts` | 8 | P1-3: cookie público, cookie morto, primária, zero cidades, backend fora |
| `frontend/lib/seo/core-sitemap-contract.test.ts` | 6 | §14: `core.xml` sem redirect/cidade/duplicata |
| `frontend/lib/home/home-content-cards.test.ts` | 9 | P1-4: posts reais, canônica, slugs mortos nunca, zero posts |
| `frontend/lib/home/cta-url.test.ts` | 25 | P1-5: aceita/rejeita, incluindo o valor real que quebrou |
| `frontend/lib/blog/blog-hub.test.ts` (estendido) | +4 | `buildBlogPostHref` sem cidade |

### A lacuna que o §23 fecha

`frontend/lib/seo/internal-links-sweep.test.ts` **já existia** e mesmo assim os
links mortos passaram: ele varre **construtores** de link, não HTML renderizado.
Os três defeitos nasceram na junção — um componente chamando o construtor com o
argumento errado. O teste novo monta header e rodapé de verdade e lê os `href`
do DOM, em seis cenários: Atibaia ativa, múltiplas cidades, conjunto vazio,
crawler sem cookie, cookie válido, cookie que perdeu estoque, e conjunto
indisponível. **Sem rede, sem servidor** — o conjunto é injetado por mock.

### Mutation testing (§24) — os testes foram PROVADOS

| mutação aplicada | resultado |
|---|---|
| `listPublicSitemapEntries` volta a ler o banco | **6/6 falham** ✓ |
| `getTerritorialRoutesForCity` volta a `\|\| "sao-paulo-sp"` | **6/12 falham** em `site-navigation` ✓ |
| `PublicFooter` volta a `?? DEFAULT_PUBLIC_CITY_SLUG` sem `isPublicCity` | **2/7 falham** em `chrome-no-dead-links` ✓ |

Todas revertidas e reconfirmadas verdes.

Registro honesto: o teste de chrome **não** pega a segunda mutação, porque
`isCityPublic === false` curto-circuita antes do slug. É defesa em profundidade
funcionando — e é por isso que os dois arquivos existem, não um só.

### Suítes

| suíte | resultado |
|---|---|
| `frontend typecheck` | **exit 0**, 0 erros |
| `frontend lint` (`--max-warnings 0`) | **exit 0** |
| `backend lint` — arquivos alterados | **0 erros** (1 warning `no-console` pré-existente) |
| `backend lint` — repo | 11 erros, **todos em `scripts/`**, nenhum arquivo tocado por esta fase |
| **backend tests** | **222 arquivos · 3621 passaram · 0 falhas** |
| **frontend tests** | 223 arquivos · **3513 passaram · 5 falharam** |

### As 5 falhas do frontend são PRÉ-EXISTENTES — provado

Baseline medido com `git stash` (só tracked), na `main` limpa, nos mesmos arquivos:

```
main limpa       →  5 failed | 12 passed   (17)
esta branch      →  5 failed | 12 passed   (17)   ← idêntico
```

| arquivo | falhas | relação com esta fase |
|---|---|---|
| `app/carros-usados/regiao/[slug]/page.config.test.ts` | 3 | nenhuma — flags regionais; nenhum módulo alterado no grafo |
| `app/seguranca/page.copy.test.ts` | 2 | nenhuma — copy de página institucional intocada |

Na primeira execução completa apareceram mais 2 falhas
(`PurchaseIntentForm`, `SaleRequestScheduling`), ambas por **timeout de 5 s sob
carga**. Rodadas isoladamente passam nas duas pontas (52/52 na `main` e 52/52
aqui): são flaky de máquina, não regressão.

Um teste de contrato precisou ser **atualizado**, e é legítimo:
`tests/cities/public-city-set.test.js` afirmava o shape exato de
`buildPublicCitySet` com `toEqual`. `primaryCity: null` entrou no contrato.

---

## 9. Evidência local (§32)

Build de produção local (`next build && next start`, porta 3000) apontando para o
backend de produção (somente GETs). O backend em produção **ainda é a versão
anterior**, sem `primaryCity` — o que tornou a verificação mais forte, não mais
fraca: ver §9.4.

### 9.1 Links internos por página — varredura de TODOS os `href`

Cada link interno distinto foi requisitado e teve o status conferido.

```
===== /  — 44 links internos distintos =====
  404 / erro ........ 0 ✓
  redirects ......... /tabela-fipe → 307 → /tabela-fipe/atibaia-sp
                      /simulador-financiamento → 307 → /simulador-financiamento/atibaia-sp
  noindex (legítimo, preservado) ... 2

===== /cidade/atibaia-sp/marca/chevrolet — 38 links =====
  404 / erro ........ 0 ✓
  noindex (legítimo, preservado) ... 7

===== /blog — 44 links =====
  404 / erro ........ 0 ✓

===== /blog/ipva-2025-entenda-tudo — 29 links =====
  404 / erro ........ 0 ✓

===== /carros-em/atibaia-sp — 57 links =====
  404 / erro ........ 0 ✓

===== /carros-baratos-em/atibaia-sp — 35 links =====
  404 / erro ........ 0 ✓
```

**Antes → depois** (as mesmas páginas, medidas em produção em 2026-08-31):

| página | 404 antes | 404 agora |
|---|---|---|
| `/` | 13 | **0** |
| `/cidade/atibaia-sp/marca/chevrolet` | 6 | **0** |
| `/blog` | 20 | **0** |
| `/blog/<post>` | 8 | **0** |
| `/carros-em/atibaia-sp` | 0 | **0** |

### 9.2 Os `noindex` legítimos foram PRESERVADOS (§22)

A correção não transformou `noindex` válido em erro. Continuam linkados e
`noindex, follow`, como antes: `/simulador-financiamento/atibaia-sp`,
`/anunciar/novo`, `/cidade/atibaia-sp`, `/cidade/atibaia-sp/abaixo-da-fipe`,
`/carros-automaticos-em/atibaia-sp` e os quatro modelos da taxonomia FIPE
antiga. Nada disso é defeito desta fase; são políticas de transição
deliberadas.

### 9.3 Redirects reais e `core.xml`

```
/tabela-fipe            → HTTP 307  Location: /tabela-fipe/atibaia-sp
   redirect HTTP real? SIM ✓   corpo com NEXT_REDIRECT? NÃO ✓
   destino → HTTP 200 ✓

/simulador-financiamento → HTTP 307  Location: /simulador-financiamento/atibaia-sp
   redirect HTTP real? SIM ✓   corpo com NEXT_REDIRECT? NÃO ✓
   destino → HTTP 200 ✓

core.xml → HTTP 200 · 4 URLs
   /  ·  /comprar  ·  /blog  ·  /planos
   contém /tabela-fipe? NÃO ✓
```

### 9.4 Um achado da própria verificação: independência de ordem de deploy

Na primeira rodada, `/tabela-fipe` respondeu `307 → /comprar` em vez de
`307 → /tabela-fipe/atibaia-sp`. Causa: o backend em produção ainda não emite
`primaryCity` (é a mudança desta branch, não deployada). O comportamento estava
**correto** — degradou para uma rota 200 em vez de chutar um slug —, mas criava
uma dependência de ORDEM DE DEPLOY: subir o frontend antes do backend deixaria as
rotas-índice apontando para `/comprar` até o outro serviço subir.

Corrigido: `parsePrimaryCity` passou a **derivar** a cidade primária do próprio
mapa `cities` quando o campo não vem, com a regra idêntica à do backend (maior
estoque; empate por slug ASC). Não é consulta nova nem segunda fonte de verdade —
é uma redução do payload que já chegou. O campo do backend mantém precedência.

A saída acima é da rodada DEPOIS dessa correção, ainda contra o backend antigo:
`/tabela-fipe` resolve `atibaia-sp` corretamente. **A ordem de deploy deixou de
importar.**

### 9.5 CTA do hero

```
href do slide "Oportunidade": ["/comprar"]
algum href com "/abaixo da fipe"? NÃO ✓
```

A string crua ainda aparece no payload RSC (`cta_url:"/abaixo da fipe"`) porque é
o dado que o backend envia e que o componente **descarta** — nenhum `href` do HTML
a contém. Isso é a prova de que a validação de leitura está agindo sobre o dado
real de produção.

### 9.6 P1-1 contra o banco de produção

Executado em §3: o código novo, sem mocks, em sessão read-only. 6 URLs, todas
Atibaia; Bragança ausente; linhas do banco intactas.

### 9.7 Ressalva de método

`REGIONAL_PAGE_ENABLED` não estava no `.env.local` da primeira rodada, e por isso
`/carros-usados/regiao/atibaia-sp` aparecia como 404 local — em produção essa URL
responde **200** (conferido). Com a flag ligada, como em produção, o resultado é o
mostrado acima: zero 404 em todas as seis páginas. Registrado para que ninguém
leia aquele 404 intermediário como regressão.

---

## 10. Produção AINDA NÃO foi corrigida (§33)

**Nada foi deployado.** Enquanto esta branch não for mergeada e publicada,
`https://www.carrosnacidade.com` continua exibindo todos os defeitos medidos na
auditoria:

| superfície | produção HOJE | build local desta branch |
|---|---|---|
| `/api/public/seo/sitemap.xml` | 4 URLs, 2 de Bragança (404) | 6 URLs, zero Bragança |
| home | 13 links 404 | 0 |
| página de marca | 6 links 404 | 0 |
| `/blog` | 20 links sob prefixo 404 | 0 |
| `/blog/<post>` (×13) | 8 links 404 cada | 0 |
| `/tabela-fipe` | 200 + canonical `/` + destino 404 | 307 real + destino 200 |
| `core.xml` | contém `/tabela-fipe` | não contém |
| `home_hero_3` | `href="/abaixo da fipe"` | descartado na leitura |

A linha `home_hero_3` continua com o valor inválido no banco — a correção de
código o neutraliza; a limpeza do dado é a instrução da §7 acima, para depois do
deploy.

---

## 11. Dívidas registradas (não corrigidas nesta fase)

| # | item | por quê ficou |
|---|---|---|
| D1 | `seo_publications`/`seo_cluster_plans` de Bragança seguem `published + is_indexable` | §5 do briefing proíbe escrita; some com o painel na 4.1B |
| D2 | `buildFallbackEntries()` do sitemap canônico ainda emite `/anuncios` (308) quando não há estoque | pré-existente, fora dos P1-1..P1-5; mascara o vazio |
| D3 | `listPublicSitemapEntriesByType/ByRegion` seguem exportados sem chamador | §3 pede cautela ao remover superfície |
| D4 | `frontend/lib/market/market-data.ts` tem `sao-paulo-sp` fixo | módulo morto (não montado em página nenhuma) |
| D5 | P1-6 (limiares em dois processos, env fora do `render.yaml`) | explicitamente fora do escopo |
| D6 | `prettifyCitySlug("")` ainda tem "São Paulo" como default interno | contornado nos consumidores; a assinatura tem outros chamadores |

---

## 12. GO / NO-GO

| # | critério | resultado | evidência |
|---|---|---|---|
| 1 | Pipeline A continua fonte de verdade | ✅ | endpoint canônico agora compõe `getPublicSitemapAllTypes()` |
| 2 | Nenhum worker SEO foi ligado | ✅ | `bootstrap.registry.js` e `.env` intocados |
| 3 | Endpoint legado não usa publicação stale | ✅ | teste prova que `db.query` **nem é chamado** |
| 4 | Bragança não aparece no endpoint público | ✅ | rodado contra o banco de produção: 6 URLs, zero Bragança |
| 5 | Fallback `sao-paulo-sp` eliminado do runtime | ✅ | 0 ocorrências em caminho de runtime; 0 links em 6 páginas |
| 6 | Nenhum fallback Atibaia hardcoded criado | ✅ | cidade é calculada do estoque; `atibaia-sp` só em teste/e2e/smoke |
| 7 | Zero cidades degrada sem 404 inventado | ✅ | 8 testes de `resolveTerritorialIndexTarget` + 7 de chrome renderizado |
| 8 | `/tabela-fipe` deixa de ser URL indexável inconsistente | ✅ | fora do `core.xml`; 307 real; destino 200 |
| 9 | `core.xml` sem redirect/noindex/404 | ✅ | 4 URLs, teste de contrato dedicado |
| 10 | Home sem os 6 slugs mortos | ✅ | 0 links `/blog/<slug morto>` |
| 11 | Hero sem CTA inválida | ✅ | `href="/comprar"`; nenhum href com espaço |
| 12 | CTA validada na escrita | ✅ | já existia (`admin-home.service.js`); verificado, **não alterado** |
| 13 | CTA validada/defensiva na leitura | ✅ | `lib/home/cta-url.ts` + 25 testes |
| 14 | Home sem links 404 dos P1 | ✅ | 44 links, 0 quebrados |
| 15 | Página de marca sem links 404 | ✅ | 38 links, 0 quebrados |
| 16 | Canonical territorial intacto | ✅ | nenhum arquivo de canonical territorial tocado |
| 17 | Sitemaps territoriais intactos | ✅ | `cities/brands/models/below-fipe/regiao` não alterados |
| 18 | robots intacto | ✅ | `app/robots.ts` não tocado |
| 19 | Thresholds intactos | ✅ | `city-thresholds.js` / `sitemap-min-ads.ts` não tocados |
| 20 | Zero migration | ✅ | `src/database/migrations/` intocado |
| 21 | Zero escrita em produção | ✅ | só sessões `SET default_transaction_read_only = on` |
| 22 | typecheck | ✅ | exit 0 |
| 23 | lint | ✅ | frontend exit 0; backend 0 erros nos arquivos tocados |
| 24 | testes backend | ✅ | 3621 passaram, 0 falhas |
| 25 | testes frontend | ✅ | 3513 passaram; as 5 falhas são pré-existentes (baseline igual na `main`) |
| 26 | E2E | ⚠️ | **não executado** — ver ressalva abaixo |
| 27 | Nenhuma regressão nova | ✅ | baseline comparado arquivo a arquivo |

### Ressalva sobre E2E

A suíte Playwright **não foi executada**. Ela exige `PW_START_SERVER=1` com
servidor próprio e banco de teste semeado (`npm run e2e:prepare`), e sem isso
falha 100% no `goto` — um vermelho ambiental que não diria nada sobre esta
mudança. No lugar dela, a cobertura equivalente foi obtida de duas formas mais
direcionadas: o teste novo de **HTML renderizado** (`chrome-no-dead-links`) e a
varredura HTTP real contra o build local (§9). Se o E2E for requisito de gate,
ele precisa rodar com o ambiente preparado antes do merge.

### Veredito

**GO para revisão** — as cinco correções estão implementadas, provadas por teste
(incluindo mutation testing) e verificadas por HTTP contra um build real.

**NO-GO para deploy sem revisão humana**, por três motivos explícitos:

1. O E2E não rodou (acima).
2. `CityContext.city` passou a ser `CityRef | null` — mudança de tipo que
   atravessa o chrome do site. Typecheck e testes cobrem, mas merece um olhar
   humano na experiência real do header/rodapé/picker.
3. O dado `home_hero_3` continua inválido no banco; a limpeza é manual e
   pós-deploy (§7).

**PARADO PARA REVISÃO.** Sem push, sem PR, sem merge, sem deploy.
