# Fix — frontend emitia noindex em cluster com estoque (data.filters)

**Data:** 2026-06-26
**Escopo:** SEO técnico / regra de robots no frontend. **Sem layout, sem cards, sem rota nova, sem sitemap, sem canonical, sem regra de estoque, sem Mercado Pago.**

---

## 1. Causa raiz exata

**Não era token, fetch, API base nem fallback.** O SSR busca o backend com **sucesso (200)** e recebe `robots:"index,follow", activeCount:1, indexable:true`. O `noindex` era gerado **localmente** por `shouldIndexTerritorialPage`.

A função decidia "variante filtrada → noindex" iterando sobre **`data.filters`** — mas esse campo é o **eco dos filtros INTERNOS que o backend aplica**, não os filtros do usuário. O backend retorna, para a URL limpa:

```json
"filters": {"page":1,"limit":24,"sort":"relevance","brand":"Fiat",
            "model":"ARGO DRIVE 1.0 6V Flex","city_slug":"atibaia-sp",
            "free_query_meta":{"original_q":null,"parsed":false,"safe":true}}
```

`shouldIndexTerritorialPage` via `data.filters` encontrava `sort:"relevance"` (→ noindex), `limit:24` (chave fora do allow-list → noindex) e `free_query_meta` (objeto → noindex). Resultado: **toda** página de cluster com estoque saía `noindex` — mesmo na URL limpa. O canonical continuava self (`data.seo.canonicalPath`), por isso o sintoma era exatamente `noindex,follow` + canonical self.

### Por que não era o caminho de fallback/429
O fallback (`buildEmptyTerritorialPayload`) produziria sections vazias; a página renderiza o veículo. E o backend responde 200 para UA de navegador/Googlebot/interno (uma chamada SSR fica sob o cap). Logo: dados válidos **rejeitados** pela regra, não fetch falho.

### Diagnóstico do que NÃO era
| Hipótese | Veredito |
|---|---|
| INTERNAL_API_TOKEN ausente/dessincronizado | Não é a causa do noindex determinístico (SSR recebe 200 com dados). Continua sendo hardening válido da rodada anterior. |
| Fetch sem header interno | `ssrResilientFetch` injeta UA+token em server-side (`buildInternalBackendHeaders`). |
| API base errada | Backend respondeu 200 com o payload correto. |
| Fallback 429 | Não — payload renderiza o veículo; canonical = data.seo, não derivado de rota. |
| searchParams | **Era o conceito certo, fonte errada:** a decisão olhava `data.filters` (eco interno) em vez do `searchParams` real da URL. |

---

## 2. Correção

A decisão de "variante filtrada → noindex" passou a usar o **`searchParams` REAL da URL**, não `data.filters`.

`frontend/lib/seo/territorial-seo.ts`:
- nova `isFilteredSearchView(searchParams)`: URL limpa → indexável; `?sort=`/`?order=` → noindex; `?page>1` → noindex; qualquer outro filtro de query → noindex; **params de tracking** (`utm_*`, `gclid`, `fbclid`, `ref`, …) são ignorados (não derrubam index).
- `shouldIndexTerritorialPage(data, searchParams?)`: mantém as travas de estoque vindas do backend (`robots`/`indexable`/`hasActiveInventory`/`activeCount`/`noindexReason`) e troca o loop de `data.filters` por `isFilteredSearchView`.
- `buildTerritorialMetadata(data, mode, { …, searchParams })`: novo `searchParams` repassado.

Páginas:
- `cidade/[slug]/marca/[brand]/page.tsx` e `.../modelo/[model]/page.tsx`: passam `searchParams` → **URL limpa com estoque vira `index,follow`**.
- `cidade/[slug]/page.tsx` e `cidade/[slug]/abaixo-da-fipe/page.tsx`: ganham **`forceNoindex: true`** explícito. Essas duas são canônicas-de-transição (apontam para `/carros-em/[slug]` e `/carros-baratos-em/[slug]`) e **permanecem noindex,follow por design** — antes dependiam, por acidente, do mesmo bug de `data.filters`. Agora o noindex é explícito e robusto (comportamento idêntico ao anterior; coberto por `territorial-canonical-transition.test.ts`).

`data.filters` continua no payload (o client usa para a UI) — apenas não decide mais indexação.

---

## 3. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `frontend/lib/seo/territorial-seo.ts` | `shouldIndexTerritorialPage` usa `searchParams` (não `data.filters`); `buildTerritorialMetadata` aceita `searchParams`; `isFilteredSearchView` + ignore-list de tracking |
| `frontend/app/cidade/[slug]/marca/[brand]/page.tsx` | passa `searchParams` → index na URL limpa |
| `frontend/app/cidade/[slug]/marca/[brand]/modelo/[model]/page.tsx` | idem |
| `frontend/app/cidade/[slug]/page.tsx` | `forceNoindex: true` explícito (preserva noindex de transição) |
| `frontend/app/cidade/[slug]/abaixo-da-fipe/page.tsx` | `forceNoindex: true` explícito (preserva noindex de transição) |
| `frontend/lib/seo/territorial-seo.test.ts` | + bloco reproduzindo o bug (payload com eco interno → index na URL limpa) e a matriz searchParams |
| `frontend/lib/seo/territorial-canonical-transition.test.ts` | comentário atualizado (noindex agora vem de `forceNoindex`) |

**Layout/cards/canonical/estoque/Mercado Pago:** intocados.

---

## 4. Testes

```
npx vitest run lib/seo lib/search lib/middleware  → 399 passed (22 files)
npx tsc --noEmit                                  → OK
```

Cobertura nova (`territorial-seo.test.ts`):
- payload fiel ao backend (com `sort:"relevance"`, `limit:24`, `free_query_meta`) + URL limpa → **index,follow** (reproduz e prova o fix);
- `?sort=price` / `?page=2` / `?cor=preto` → **noindex**; `?page=1` → index; `utm_*`/`gclid`/`fbclid` → index.
Regressão (`territorial-canonical-transition.test.ts`, 14 testes): `/cidade/[slug]` e `/abaixo-da-fipe` **permanecem noindex,follow** (agora via `forceNoindex`).

---

## 5. Smoke final (pós-deploy do frontend)

```bash
# A. Página COM estoque (URL limpa) → index,follow + canonical self
curl -sSL -A "Mozilla/5.0" \
  "https://www.carrosnacidade.com/cidade/atibaia-sp/marca/fiat/modelo/argo-drive-1-0-6v-flex" \
  | grep -oE '<meta name="robots"[^>]*>|<link rel="canonical"[^>]*>'
# esperado:
#   <meta name="robots" content="index, follow"/>
#   <link rel="canonical" href="https://www.carrosnacidade.com/cidade/atibaia-sp/marca/fiat/modelo/argo-drive-1-0-6v-flex"/>

# B. Variante filtrada → noindex (canonical continua self limpo)
curl -sSL -A "Mozilla/5.0" \
  "https://www.carrosnacidade.com/cidade/atibaia-sp/marca/fiat/modelo/argo-drive-1-0-6v-flex?sort=price" \
  | grep -oE '<meta name="robots"[^>]*>'   # esperado: noindex, follow

# C. SEM estoque → noindex,follow ou 404, canonical nunca = home
curl -sSL -A "Mozilla/5.0" \
  "https://www.carrosnacidade.com/cidade/atibaia-sp/marca/ferrari/modelo/enzo" \
  | grep -oE '<meta name="robots"[^>]*>|<link rel="canonical"[^>]*>'
```

> Use `-A "Mozilla/5.0"`. `curl` pelado é cortado pelo bot-blocker (UA `curl/`), não reflete o SSR.

---

## 6. Riscos remanescentes

1. **Token (rodada anterior):** com `INTERNAL_API_TOKEN` dessincronizado e tráfego alto, o SSR ainda pode tomar 429 esporádico e cair no fallback noindex. Recomendação mantida: sincronizar o token no Render. Agora, porém, a URL limpa com estoque indexa de forma determinística (não dependia do token).
2. **`?page=1` explícito** é tratado como URL limpa (index) — correto; o canonical já é a URL sem query.
3. **`SITEMAP_PUBLIC_ENABLED=false`** inalterado (fora de escopo).

---

## 7. Critério de aprovação

Atendido: a **página pública do frontend** (não só o endpoint) retorna `index,follow` + canonical self para cidade+marca+modelo com estoque ativo na URL limpa; variantes filtradas e páginas sem estoque permanecem `noindex`/404; **sem alteração de layout**. Pendente apenas o deploy do frontend.
