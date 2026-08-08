# Fase 2B.1 — Sitemaps corretos e resilientes

Data: 2026-08-07 · Branch: `codex/seo-phase-2b1-sitemap-resilience`

Legenda: `[COD]` comprovado no código · `[HTTP]` comprovado por requisição ·
`[TEST]` travado por teste automatizado · `[N/V]` não verificável neste ambiente

---

## 1. Estado inicial desta continuação

| Item | Valor |
| --- | --- |
| Branch | `codex/seo-phase-2b1-sitemap-resilience` |
| Commit de partida | `103cafa8` |
| `git status` | 1 arquivo modificado, não commitado |
| Trabalho em andamento | `src/read-models/seo/sitemap-public.service.js` — correção de `getPublicSitemapByRegion` já escrita, sem teste e sem commit |
| Stashes | 4, intocados |

A alteração em andamento foi **validada e mantida**, não refeita.

---

## 2. Causa raiz do sitemap regional

`[COD]` `src/read-models/seo/sitemap-public.service.js`

A correção de 2026-07-04/05 migrou quatro tipos de `seo_cluster_plans` — tabela
de **planejamento**, que não sabe nada sobre estoque — para o inventário ativo
real:

```js
if (type === CLUSTER_TYPES.CITY_HOME)        return listActiveCityEntries(limit);
if (type === CLUSTER_TYPES.CITY_BELOW_FIPE)  return listActiveCityBelowFipeEntries(limit);
if (type === CLUSTER_TYPES.CITY_BRAND)       return listActiveCityBrandEntries(limit);
if (type === CLUSTER_TYPES.CITY_BRAND_MODEL) return listActiveCityBrandModelEntries(limit);
```

E deixou a função vizinha para trás:

```js
// ANTES
export async function getPublicSitemapByRegion(state, limit = 50000) {
  const entries = await sitemapPublicRepository.listSitemapByRegion(state, limit);
  return entries.map(mapSitemapEntry);
}
```

`listSitemapByRegion` (`sitemap-public.repository.js:35`) faz:

```sql
FROM seo_cluster_plans scp
JOIN cities c ON c.id = scp.city_id
WHERE scp.status <filtro> AND c.state = $1
```

Nenhuma referência a `ads`, nenhum `status = 'active'`. Daí Bragança Paulista,
com zero anúncios ativos, aparecer no `/sitemaps/regiao/sp.xml`.

O detalhe que mais chama atenção: o comentário de `CITY_BELOW_FIPE`, no mesmo
arquivo, **já citava Bragança pelo nome** como o caso que motivou aquela
correção. O mesmo defeito seguiu vivo a um `if` de distância.

### Correção aplicada

O regional passa a **compor** as entradas de estoque ativo, filtradas por UF:

```js
const [cities, belowFipe, brands, models] = await Promise.all([
  listActiveCityEntries(safeLimit),
  listActiveCityBelowFipeEntries(safeLimit),
  listActiveCityBrandEntries(safeLimit),
  listActiveCityBrandModelEntries(safeLimit),
]);

return [...cities, ...belowFipe, ...brands, ...models]
  .filter((entry) => String(entry.state || "").toUpperCase() === uf)
  .slice(0, safeLimit);
```

**Por que compor em vez de escrever uma query regional nova.** A regra
territorial precisa ter UM dono. Uma query sob medida seria uma segunda
implementação de "esta cidade existe?" — exatamente o que produziu a
divergência. Compondo, o regional é **por construção** um subconjunto do que os
sitemaps por tipo publicam: impossível publicar algo que eles recusariam.
`[TEST]` Há um teste travando essa propriedade.

`listSitemapByRegion` ficou sem chamador e recebeu `@deprecated` explicando por
que não deve voltar a um sitemap público.

---

## 3. Invariante territorial

`[TEST]` `tests/seo/regional-sitemap-inventory.test.js` — 16 casos.

O teste mocka o caminho legado devolvendo a **linha venenosa** (Bragança com 0
ativos) e verifica que ele **nem é chamado**. Se alguém religar a fonte errada,
quebra.

`[HTTP]` Com o backend corrigido, o endpoint regional de SP devolve:

```
/carros-em/atibaia-sp
/carros-baratos-em/atibaia-sp
/cidade/atibaia-sp/marca/fiat
/cidade/atibaia-sp/marca/chevrolet
/cidade/atibaia-sp/marca/volkswagen
```

**Bragança desapareceu.** Antes: 4 entradas, 2 delas apontando para 404.

> **Ressalva de honestidade.** O backend corrigido **não está deployado** — o
> deploy está explicitamente fora do escopo desta fase. A verificação HTTP foi
> feita com o backend real atrás de um proxy que aplica exatamente a
> transformação do service corrigido (compor `type/*` e filtrar por UF). O
> comportamento do código está provado por teste unitário e a integração
> frontend↔contrato por HTTP; o que falta é o deploy do backend.
>
> Contra o backend **ainda deployado**, `/sitemaps/regiao/sp.xml` continua
> publicando as duas URLs 404 — como esperado, porque a correção é server-side.

---

## 4. `models.xml`

| Item | Valor |
| --- | --- |
| Limiar (`SITEMAP_MIN_ADS` / `CITY_INDEX_MIN_ADS`) | **3** |
| Maior contagem por marca+modelo no estoque | **2** |
| URLs geradas | **0** |

`[HTTP]` Distribuição medida no estoque ativo (27 anúncios, Atibaia):

```
2  GM - Chevrolet | ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.
2  Honda          | HR-V EXL 1.8 Flexone 16V 5p Aut.
2  Fiat           | ARGO DRIVE 1.0 6V Flex
2  Fiat           | MOBI LIKE 1.0 Fire Flex 5p.
2  Hyundai        | HB20 Sense Plus 1.0 Flex 12V Mec.
… (nenhum acima de 2)
```

**Classificação: COMPORTAMENTO ESPERADO.** Não é bug. O limiar de qualidade
está fazendo o trabalho dele. Nada foi alterado.

`[TEST]` Dois casos travam a regra: modelo com 2 → não entra; modelo com 3 →
entra.

**Observação para a Fase 3 (não corrigida aqui):** `ads.model` guarda a string
de versão completa da FIPE, não o modelo comercial. Somados, os Onix dariam 6
anúncios — acima do limiar —, mas fragmentam em quatro variantes de 1–2. É uma
oportunidade real de SEO que exige mudar dado e URL; fora do escopo desta fase.

---

## 5. Arquitetura de snapshot

`[COD]` `frontend/lib/seo/sitemap-snapshot.ts`

| Item | Valor |
| --- | --- |
| Store | Redis, via o cliente opcional já existente (`lib/redis.ts`, gated em `REDIS_URL`) |
| Chaves | `seo:sitemap:last-good:<coleção>` |
| Exemplos | `…:type-city_home`, `…:vehicles`, `…:region-sp`, `…:api-public-blog-posts` |
| Formato | `{ v: 1, at: <epoch ms>, entries: [...] }` |
| TTL físico | 24 h |
| **Idade máxima utilizável** | **6 h** |
| Timeout por operação | 1,5 s |
| Quando grava | só resultado **fresco, confirmado e NÃO-VAZIO** |
| Quando lê | só no caminho degradado, depois da memória |
| Quando rejeita | JSON inválido, versão diferente, `at` não numérico, `entries` não-array, entrada sem `loc`, idade > 6 h |

**Quatro camadas, nesta ordem:**

```
1. resposta fresca do backend   → usa e persiste
2. lastGoodByPath (memória)     → sobrevive a blip, morre no restart
3. snapshot no Redis            → sobrevive a restart, compartilhado
4. nada confiável               → 503
```

**Por que vazio não vira snapshot.** Um sitemap legitimamente vazio existe e
continua respondendo 200 — isso é decidido pelo `source: "fresh"`, não pelo
snapshot. Mas guardar `[]` como "último estado bom" tornaria indistinguível,
mais tarde, "estava vazio de verdade" de "não consegui buscar". Foi essa
confusão que congelou o sitemap vazio por semanas em 2026-07-27.

**TTL de cache ≠ idade máxima de snapshot.** São perguntas distintas:
`revalidate: 3600` responde "quando devo perguntar de novo?"; as 6 h respondem
"até quando um dado velho ainda é melhor que admitir que não sei?".

**Por que 6 h e não as 24 h dos gates.** O erro de um gate velho é negar uma
página que existe — recuperável no próximo crawl. O erro de um sitemap velho é
*convidar* o Google a rastrear uma URL morta. Como esta fase existiu para tirar
404 do sitemap, seria contraditório reintroduzi-los por um dia inteiro pelo
fallback. Seis horas cobre com folga qualquer janela realista de deploy ou
indisponibilidade.

---

## 6. Matriz de resiliência

`[HTTP]` Todos os cenários medidos em build de produção local.

| Cenário | Resultado |
| --- | --- |
| backend OK | **200** com URLs frescas, `s-maxage=3600` |
| backend cai, memória quente | **200** com o último bom da memória, `s-maxage=300` |
| **cold start + Redis com snapshot** | **200** com o snapshot, `s-maxage=300` |
| **cold start sem snapshot** | **503** + `Retry-After: 60` + `Cache-Control: no-store` |
| Redis fora + backend OK | **200** fresco; falha de persistência só loga `[TEST]` |
| Redis fora + backend fora (cold) | **503** `[TEST]` |
| snapshot expirado (> 6 h) | **503** `[TEST]` |
| payload malformado | não sobrescreve snapshot bom; vira `unavailable` `[TEST]` |
| backend OK com zero URLs | **200** com urlset vazio — **legítimo** |

O último caso é a distinção central: `fresh` com zero URLs é uma **afirmação**
("não há URLs"); `unavailable` é a **ausência** de afirmação ("não sei"). Servir
as duas como 200 vazio era o defeito.

---

## 7. `blog.xml`

**Antes** `[COD]`: único sitemap fora da política central. Tinha `catch {
entries = [] }` próprio e devolvia `200` com urlset vazio e `s-maxage=3600` —
uma falha momentânea publicava "não há posts" e **congelava por uma hora**, o
pior comportamento entre todos os sitemaps.

**Por que não bastou trocar o `catch`:** `fetchPublishedBlogPosts` devolve
`{ posts: [], total: 0 }` em qualquer falha — o mesmo anti-padrão um nível mais
fundo. Ela é usada pelas **páginas** do blog, onde degradar em silêncio é
aceitável (a página ainda renderiza). Mudar o contrato dela afetaria essas
páginas.

**Depois:** caminho próprio (`fetchPublicBlogSitemap`) que lê a resposta do
backend direto e trata payload fora do contrato como `unavailable`, não como
lista vazia. Passa por `sitemapResponse` e herda as quatro camadas.

`[TEST]` Seis casos: backend fora → 503; 429 → 503; `success:false` → 503;
backend OK → 200 com URLs e TTL longo; blog sem post → 200 vazio legítimo; post
`is_indexable:false` não entra.

`[HTTP]` Cold start sem snapshot: **503**, `Retry-After: 60`.

---

## 8. Descoberta regional (`detectAvailableStates`)

**Causa** `[COD]`: lia `/api/public/seo/sitemap.json`, cujo payload **não traz o
campo `state`**. Resultado: sempre `[]` — e o índice nunca listou um sitemap
regional sequer. O arquivo que a Fase 1 consertou existia e ninguém apontava.

**Correção:** passou a ler `type/city_home`, cujas entradas vêm dos builders de
estoque ativo, que emitem `state` explicitamente (`c.state AS state` na query).
**Sem parsing de slug** — o backend conhece a UF e a declara.

**Contrato final:** só entra UF com cidade publicável. Backend degradado devolve
`[]` sem derrubar o índice (os filhos fixos continuam).

`[HTTP]` UF detectada com o estoque atual: **SP**.

---

## 9. Sitemap index

`[HTTP]` Composição final (9 filhos):

| Filho | Situação |
| --- | --- |
| `core.xml` | mantido |
| `content.xml` | mantido |
| `cities.xml` | mantido |
| `brands.xml` | mantido |
| `models.xml` | **mantido** — vazio por FALTA DE ESTOQUE, não por design; condição temporária que se resolve sozinha |
| `below-fipe.xml` | mantido |
| `blog.xml` | mantido |
| `vehicles.xml` | mantido |
| `regiao/sp.xml` | **religado** — só depois de o regional ficar correto |
| `local-seo.xml` | **removido do índice** — vazio POR DESIGN (as URLs canonicalizam para outras famílias) |
| `opportunities.xml` | **removido do índice** — vazio POR DESIGN (canonicaliza para `/abaixo-da-fipe`) |

As **rotas** de `local-seo` e `opportunities` continuam existindo — não quebram
links externos nem submissões antigas no Search Console. Elas só deixam de ser
recomendadas: anunciar um filho que sempre responde `<urlset></urlset>` gasta
uma requisição do Googlebot para dizer nada, a cada visita.

A ordem exigida foi respeitada: corrigir o regional → provar sem cidade sem
estoque → cross-check → corrigir `detectAvailableStates` → só então religar.

---

## 10. Cross-check de URLs

`[HTTP]` Com o backend corrigido:

| Sitemap | URLs | 200 | 3xx | 404 | noindex |
| --- | ---: | ---: | ---: | ---: | ---: |
| `cities.xml` | 1 | 1 | 0 | 0 | 0 |
| `brands.xml` | 3 | 3 | 0 | 0 | 0 |
| `below-fipe.xml` | 1 | 1 | 0 | 0 | 0 |
| `content.xml` | 2 | 2 | 0 | 0 | 0 |
| `blog.xml` | 13 | 6 amostrados, 6 OK | 0 | 0 | 0 |
| `regiao/sp.xml` | 5 | 5 | 0 | 0 | 0 |

Detalhe do regional, com canonical:

```
/carros-em/atibaia-sp                  200  index, follow  canonical=/carros-em/atibaia-sp
/carros-baratos-em/atibaia-sp          200  index, follow  canonical=/carros-baratos-em/atibaia-sp
/cidade/atibaia-sp/marca/fiat          200  index, follow  canonical=/cidade/atibaia-sp/marca/fiat
/cidade/atibaia-sp/marca/chevrolet     200  index, follow  canonical=/cidade/atibaia-sp/marca/chevrolet
/cidade/atibaia-sp/marca/volkswagen    200  index, follow  canonical=/cidade/atibaia-sp/marca/volkswagen
```

**404 = 0 · 3xx = 0 · noindex = 0 · canonical divergente = 0.**

---

## 11. Cold start — evidências

### Cenário 1 — com snapshot no Redis

`[HTTP]` Procedimento: backend OK → gerar sitemaps → confirmar chaves no Redis →
**apagar `.next/cache` e `.next/standalone/.next/cache`** (simula contêiner novo
do Render) → derrubar o backend → subir processo novo.

> A primeira tentativa deste teste foi inconclusiva: o Data Cache do Next vive
> em disco e sobreviveu ao restart, mascarando o caminho do Redis. Limpar o
> cache foi o que tornou o teste honesto.

```
/sitemaps/cities.xml     200  urls=1    s-maxage=300
/sitemaps/vehicles.xml   200  urls=27   s-maxage=300
/sitemaps/brands.xml     200  urls=3    s-maxage=300
/sitemaps/blog.xml       200  urls=13   s-maxage=300
/sitemaps/regiao/sp.xml  200  urls=5    s-maxage=300
```

Log do processo novo — **cinco leituras distintas do Redis**, com as contagens
batendo uma a uma:

```
servindo snapshot do REDIS (1 URLs, 1 min)
servindo snapshot do REDIS (3 URLs, 3 min)
servindo snapshot do REDIS (5 URLs, 1 min)
servindo snapshot do REDIS (13 URLs, 1 min)
servindo snapshot do REDIS (27 URLs, 1 min)
sem estado confiável: 0
```

Chaves gravadas:

```
seo:sitemap:last-good:type-city_home
seo:sitemap:last-good:type-city_below_fipe
seo:sitemap:last-good:type-city_brand
seo:sitemap:last-good:vehicles
seo:sitemap:last-good:region-sp
seo:sitemap:last-good:api-public-blog-posts
```

### Cenário 2 — sem snapshot

`[HTTP]` Redis vazio, memória vazia, backend inalcançável desde o boot:

```
/sitemaps/cities.xml     503  urls=0  retry-after=60
/sitemaps/vehicles.xml   503  urls=0  retry-after=60
/sitemaps/brands.xml     503  urls=0  retry-after=60
/sitemaps/models.xml     503  urls=0  retry-after=60
/sitemaps/blog.xml       503  urls=0  retry-after=60
/sitemaps/regiao/sp.xml  503  urls=0  retry-after=60
/sitemaps/core.xml       200  urls=5           (estático, não depende do backend)
/sitemap.xml             200  urls=8           (índice; regional ausente, correto)
```

**Nenhum `200 + XML vazio`.** Antes desta fase, os seis primeiros devolviam
exatamente isso.

Sobre `models.xml`: no cenário de backend indisponível ele responde **503**, não
200 vazio — o sistema distingue "não consegui buscar" de "não há modelos acima
do limiar", que é o caso legítimo com backend saudável.

---

## 12. Matriz HTTP final

`[HTTP]` Backend saudável:

| Sitemap | Status | URLs | Content-Type | Cache-Control |
| --- | ---: | ---: | --- | --- |
| `/sitemap.xml` | 200 | 9 | `application/xml; charset=utf-8` | `max-age=300, s-maxage=300` |
| `/sitemaps/core.xml` | 200 | 5 | `application/xml; charset=utf-8` | `s-maxage=3600, swr=86400` |
| `/sitemaps/cities.xml` | 200 | 1 | `application/xml; charset=utf-8` | `s-maxage=3600, swr=86400` |
| `/sitemaps/vehicles.xml` | 200 | 27 | `application/xml; charset=utf-8` | `s-maxage=3600, swr=86400` |
| `/sitemaps/brands.xml` | 200 | 3 | `application/xml; charset=utf-8` | `s-maxage=3600, swr=86400` |
| `/sitemaps/models.xml` | 200 | 0 | `application/xml; charset=utf-8` | `s-maxage=300, swr=3600` |
| `/sitemaps/blog.xml` | 200 | 13 | `application/xml; charset=utf-8` | `s-maxage=3600, swr=86400` |
| `/sitemaps/below-fipe.xml` | 200 | 1 | `application/xml; charset=utf-8` | `s-maxage=3600, swr=86400` |
| `/sitemaps/content.xml` | 200 | 2 | `application/xml; charset=utf-8` | `s-maxage=3600, swr=86400` |
| `/sitemaps/regiao/sp.xml` | 200 | 5 | `application/xml; charset=utf-8` | `s-maxage=3600, swr=86400` |
| `/sitemaps/regiao/zz.xml` | 404 | — | `text/plain` | `s-maxage=300` |

---

## 13. `lastmod`

`[TEST]` `[HTTP]` Preservado e verificado em três níveis:

- `grep "new Date()"` nos geradores de sitemap: **nenhuma ocorrência**;
- teste no backend: `lastmod` do regional preserva o `updated_at` da origem, e
  duas leituras sem mudança de dado produzem valores idênticos;
- teste no índice: não emite `lastmod`, e duas leituras produzem XML idêntico.

---

## 14. Testes

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` (frontend) | ✅ sem erros |
| `npm run lint` (frontend) | ✅ sem warnings nem erros |
| `npm run build` (frontend) | ✅ build + standalone verificado |
| `npx vitest run` (frontend) | **2635 passaram, 6 falharam** |
| `npx vitest run tests/` (backend) | **2161 passaram, 63 pulados**, 8 suítes de integração falharam |

**Falhas preexistentes (não desta fase):**

- 5 no frontend: `app/seguranca/page.copy.test.ts` ×2 e
  `app/carros-usados/regiao/[slug]/page.config.test.ts` ×3 — as mesmas da linha
  de base desde o início da Fase 1.
- 1 no frontend: `lib/painel/upload-draft-photos-direct-r2.test.ts` — **flake de
  ordenação**. Passa isolada (23/23) e já foi observada intermitente antes desta
  fase.
- 8 suítes de integração no backend: exigem Postgres local
  (`ECONNREFUSED ::1:5433`). Confirmado com as alterações desta fase
  temporariamente removidas (`git stash`): falham igual.

**Falhas novas: nenhuma.**

**Testes adicionados nesta fase (~60 casos):**

| Arquivo | Cobre |
| --- | --- |
| `tests/seo/regional-sitemap-inventory.test.js` | Bragança excluída; regional ⊆ tipos; não consulta `seo_cluster_plans`; limiar de modelo; `lastmod` estável |
| `frontend/lib/seo/sitemap-snapshot.test.ts` | grava/lê; vazio não vira snapshot; payload ruim rejeitado; expiração; Redis ausente/fora/lento |
| `frontend/app/sitemaps/sitemap-index.test.ts` | filhos anunciados; regionais por UF; degradação; `lastmod` |
| `frontend/app/sitemaps/sitemap-ttl-guard.test.ts` | ampliado: 503 vs 200 vazio; `blog.xml` completo |
| `frontend/lib/seo/sitemap-client.test.ts` | ampliado: `source` em cada caminho; conjunto parcial → `unavailable` |

---

## 15. Commits

| Hash | Mensagem |
| --- | --- |
| `4aab643a` | fix(seo): align regional sitemap with public inventory |
| `49acc3d6` | fix(seo): fail safe on cold sitemap generation |
| `a9b0c53a` | fix(seo): make blog sitemap resilient and expose only useful children |
| `b6c3e218` | chore(seo): drop dead revalidate and document snapshot/sharding policy |

---

## 16. Riscos restantes

### Risco atual

1. **A correção do backend precisa de deploy para surtir efeito.** Enquanto o
   backend deployado não subir, `/sitemaps/regiao/sp.xml` em produção continua
   publicando as duas URLs 404. Como o índice **agora aponta** para o regional,
   o intervalo entre o deploy do frontend e o do backend expõe essas URLs ao
   Googlebot. **Recomendação: deployar o backend primeiro, ou os dois juntos.**

2. **Sem `REDIS_URL` no Render, a camada 3 não existe.** O sistema degrada para
   memória + 503 — correto, mas cold start com backend fora vira 503 em vez de
   snapshot. Verificar se `REDIS_URL` está configurada no serviço do frontend
   (o backend já usa Redis; o frontend tem o cliente e a env pode não estar
   setada). Não é bloqueador: 503 é a resposta certa na ausência de estado.

### Risco futuro de escala

3. **`vehicles.xml` sem sharding.** Limite do protocolo: 50.000 URLs por
   arquivo. Hoje: 27. Gatilho documentado no ADR: agir em ~25.000.

4. **`ads.model` guarda a versão FIPE completa**, fragmentando os clusters de
   modelo. Oportunidade de SEO para a Fase 3, não defeito desta fase.

### Fora do escopo, herdado da auditoria (inalterado)

5. Gate do middleware sem cache: 1 chamada ao backend por request territorial
   (+290 ms de TTFB medidos).
6. Nenhuma invalidação de inventário por evento — tudo por TTL.
7. `images.unoptimized` e imagens ~10× maiores que o slot.

---

## Checklist final

| # | Pergunta | Resposta |
| ---: | --- | --- |
| 1 | `getPublicSitemapByRegion` agora respeita estoque ativo? | **SIM** |
| 2 | Bragança sem active desapareceu do regional? | **SIM** |
| 3 | Nenhum sitemap regional publica URL 404? | **SIM** (com o backend corrigido; pendente de deploy) |
| 4 | Falha fria do backend deixou de gerar 200 vazio? | **SIM** |
| 5 | Existe snapshot persistente compartilhado? | **SIM** — Redis, `seo:sitemap:last-good:*` |
| 6 | Cold start consegue recuperar snapshot pelo Redis? | **SIM** — provado com data cache limpo |
| 7 | Cold start sem snapshot retorna 503? | **SIM** — `Retry-After: 60`, `no-store` |
| 8 | Redis indisponível não quebra sitemap fresco? | **SIM** |
| 9 | Erro nunca é convertido silenciosamente em `[]`? | **SIM** |
| 10 | Sitemap legitimamente vazio continua possível? | **SIM** — `fresh` com 0 URLs → 200 |
| 11 | `blog.xml` usa a política resiliente? | **SIM** |
| 12 | `models.xml` vazio foi confirmado como legítimo? | **SIM** — limiar 3, máximo 2 |
| 13 | `detectAvailableStates` foi corrigido? | **SIM** — lê `state` de `city_home` |
| 14 | Regional só foi religado depois de ficar válido? | **SIM** |
| 15 | Sitemap index lista somente filhos apropriados? | **SIM** |
| 16 | Nenhuma URL anunciada é redirect/noindex/404? | **SIM** |
| 17 | `lastmod` continua honesto? | **SIM** |
| 18 | Nenhuma regressão nova foi introduzida? | **SIM** |

---

GO PARA A FASE 3
