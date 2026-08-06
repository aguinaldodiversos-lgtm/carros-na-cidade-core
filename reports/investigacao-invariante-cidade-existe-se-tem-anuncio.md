# Investigação — invariante "cidade existe ⟺ tem anúncio ativo"

**Data:** 2026-08-05
**Branch:** `feat/cidade-existe-se-tem-anuncio`
**Escopo:** diagnóstico. Nenhum código alterado. Sem push.

---

## Resumo executivo

O invariante está certo e a direção também. Mas **quatro premissas do briefing não batem com o que o código faz**, e uma delas muda o tamanho do problema para pior. Reporto antes de codar, como pedido.

O achado principal: **não existe lista de municípios nas rotas públicas.** A superfície não é 5.570 × 7 ≈ 39 mil — é **ilimitada**.

---

## Divergência 1 — a "lista" não existe (a mais importante)

O briefing afirma: *"PROVA DE QUE EXISTE UMA LISTA: `/tabela-fipe/cidade-inventada-zz` retorna 404. Algo valida contra catálogo de municípios."*

**A prova não sustenta a conclusão.** O 404 acontece porque **`zz` não é uma UF brasileira** — não porque a cidade não está num catálogo.

A única lista consultada pelas rotas é `BRAZIL_UFS` — **27 UFs** — em [territory-gate.ts:29](frontend/lib/middleware/territory-gate.ts:29). O próprio arquivo documenta a intenção, em três lugares: *"NÃO valida existência no banco"*.

### Medição em produção (hoje)

Comparei município **REAL sem anúncio** contra município **INVENTADO com UF válida**:

| Rota | `altaneira-ce` (real, 0 anúncios) | `cidade-inventada-sp` (não existe) |
| --- | --- | --- |
| `/comprar/cidade/` | 200 `noindex, follow` | 200 `noindex, follow` |
| `/carros-em/` | 200 `noindex, follow` | 200 `noindex, follow` |
| `/carros-baratos-em/` | 200 `noindex, follow` | 200 `noindex, follow` |
| `/carros-automaticos-em/` | 200 `noindex, follow` | 200 `noindex, follow` |
| `/tabela-fipe/` | 200 **`index, follow`** | 200 **`index, follow`** |
| `/simulador-financiamento/` | 200 `noindex, follow` | 200 `noindex, follow` |
| `/blog/` | 200 **`index, follow`** | 200 **`index, follow`** |

**Comportamento idêntico em todas as 7.**

Você definiu isso como "o teste mais importante" — *"se houver qualquer diferença, sobrou lista em algum lugar"*. Ele já passa hoje, mas pelo motivo oposto ao que você esperava: eles se comportam igual porque **não há lista nenhuma**, não porque a regra está aplicada.

### Consequência

A superfície indexável é qualquer string terminada em uma das 27 UFs: `asdf-sp`, `qualquer-coisa-rj`, `aaa-mg`. **Ilimitada.** Os 10.296 "rastreada, mas não indexada" do Search Console são o que o Google **já rastreou**, não o total possível.

Isso também significa que **não há lista para remover**. O trabalho é *adicionar* uma verificação onde hoje não existe nenhuma — o que é mais simples de raciocinar, mas exige cobrir todas as rotas, porque não há um ponto único herdado para interceptar.

---

## Divergência 2 — o limiar existente é ≥3, não ≥1

`SITEMAP_MIN_ADS=3` ([.env.example:165](.env.example)) governa hoje sitemap e `noindex`. Seu invariante diz **um** anúncio.

Isso não é detalhe de configuração: se eu implementar 404 reusando o limiar existente, **uma cidade com 1 ou 2 anúncios ativos passa a dar 404** — e os anúncios dela viram órfãos: `/veiculo/<slug>` continua 200, mas nenhuma página de cidade linka para ele, e o vendedor que pagou (ou publicou grátis) fica sem vitrine territorial.

**Recomendação: separar os dois eixos.**

| Eixo | Pergunta | Limiar |
| --- | --- | --- |
| **Existência** (404 vs 200) | a cidade existe? | **≥ 1** — seu invariante, literal |
| **Indexação** (index vs noindex) | vale indexar? | ≥ `SITEMAP_MIN_ADS` (3) — regra de SEO, já existente |

São perguntas diferentes. Misturar as duas num limiar só é o que produziria o 404 indevido.

---

## Divergência 3 — são ~17 rotas, não 7

Você suspeitou que a lista estivesse incompleta. Está. Enumerei o app router de verdade:

**Escopo de cidade (14):**

| Rota | No seu briefing? |
| --- | --- |
| `app/comprar/cidade/[slug]` | sim |
| `app/carros-em/[slug]` | sim |
| `app/carros-baratos-em/[slug]` | sim |
| `app/carros-automaticos-em/[slug]` | sim |
| `app/tabela-fipe/[cidade]` | sim |
| `app/simulador-financiamento/[cidade]` | sim |
| `app/blog/[cidade]` | sim |
| `app/cidade/[slug]/marca/[brand]` | sim |
| `app/cidade/[slug]/marca/[brand]/modelo/[model]` | sim |
| `app/blog/[cidade]/[slug]` | **não** |
| `app/blog/[cidade]/categoria/[categoria]` | **não** |
| `app/cidade/[slug]` | parcial |
| `app/cidade/[slug]/abaixo-da-fipe` | **não** |
| `app/cidade/[slug]/oportunidades` | **não** |

**Escopo de UF (3):**

| Rota | No seu briefing? |
| --- | --- |
| `app/carros-usados/regiao/[slug]` | sim |
| `app/carros-usados/[uf]` | **não** |
| `app/comprar/estado/[uf]` | **não** |
| `app/[uf]/regiao/[ancora]` | **não** — segmento dinâmico na RAIZ |

`app/comprar/[slug]` também existe; preciso confirmar se `[slug]` ali é cidade ou categoria antes de classificar.

---

## Divergência 4 — `/simulador-financiamento` está fora do gate

`/simulador-financiamento/cidade-inventada-zz` responde **200**, com UF inválida. Confirmei ao vivo. Essa rota nunca entrou no `territory-gate` — as outras seis bloqueiam UF falsa, ela não.

É a mesma classe de falha que `/comprar/cidade/` teve até 2026-07-28: rota territorial esquecida no gate vira superfície ilimitada sozinha.

---

## Respostas às cinco perguntas

### 1. Onde está a lista de municípios consultada hoje?

**Duas listas, nenhuma usada pelas rotas.**

**(a) Tabela `cities`** — catálogo IBGE completo (~5.570), populado por [scripts/seed-ibge-municipios.mjs](scripts/seed-ibge-municipios.mjs). Servida por `/api/public/cities/search`, sem nenhum filtro de anúncio.

Consumida por **dois** BFFs:
- [app/api/cities/search/route.ts](frontend/app/api/cities/search/route.ts) — **público**, alimenta o `CityHeaderSelector`
- [app/api/painel/cidades/search/route.ts](frontend/app/api/painel/cidades/search/route.ts) — **wizard**

Você escreveu: *"Se hoje a mesma lista serve o wizard e as rotas públicas, separe."* **É exatamente o caso.** Mesmo endpoint de backend, dois consumidores. Essa é a separação a fazer.

**(b) `citySeeds`** — ~41 cidades **hardcoded** em [lib/market/market-data.ts](frontend/lib/market/market-data.ts), expostas por `getStaticCitySlugs` / `isSupportedCitySlug` / `getCityProfile`.

**As rotas não consultam nenhuma das duas.** Validam só o formato do slug.

### 2. Existe função central de cidades públicas?

**Quase — e a query certa já existe.**

[territorial-inventory-sitemap.repository.js:18](src/read-models/seo/territorial-inventory-sitemap.repository.js:18) → `listActiveCityRows()`:

```sql
SELECT c.slug, c.state, COUNT(*)::int AS total, MAX(a.updated_at)
FROM ads a JOIN cities c ON c.id = a.city_id
WHERE a.status = 'active'
GROUP BY c.slug, c.state
HAVING COUNT(*) >= 1
```

Isso **é** o `SELECT DISTINCT cidade FROM ads WHERE ativo` do seu invariante, com `HAVING >= 1` inclusive. Mas hoje ela tem **um único consumidor**: o serviço de sitemap. É por isso que o sitemap já está correto (69 URLs, só Atibaia) enquanto as rotas não.

Não há equivalente no frontend, nem endpoint público dedicado. **Esta função é a semente do item 1 do seu plano** — o trabalho é promovê-la a fonte única e ligar todo mundo nela.

### 3. Quantas rotas com escopo de cidade existem?

~17 (tabela acima).

### 4. Onde estão os geradores de link?

| Componente | Estado | Fonte | Viola o invariante? |
| --- | --- | --- | --- |
| `CityHeaderSelector` | **vivo** | `/api/cities/search` (catálogo completo) | **sim** — deixa escolher qualquer município e faz `router.push` |
| `BrandNeighborCities` | **vivo** (montado em `cidade/[slug]/marca/[brand]/page.tsx:66`) | `getStaticCitySlugs` (41 hardcoded) | **sim** |
| `RegionalEntryHub` | **órfão** (sem importador) | `getStaticCitySlugs` | não roda |
| `TerritorialFooterLinks` | **órfão** (só citado em comentário) | — | não roda |

Aplicando a lição do módulo órfão: verifiquei importadores, não nomes. Dois dos quatro não rodam.

~40 arquivos tocam links de cidade — os quatro acima são os que emitem href hoje, mas a varredura do item 3 do seu plano precisa cobrir o resto (breadcrumbs, links cruzados entre variantes, sugestão na busca).

### 5. Há cache/ISR nessas rotas?

Todas as rotas de cidade são **`force-dynamic`** — sem ISR, sem página estagnada. Bom para o requisito 4.

Exceção: `app/cidade/[slug]/page.tsx` não declara `dynamic` nem `revalidate` — preciso confirmar o comportamento efetivo.

Resta o cache de **fetch** (BFF e `cacheGet` do backend, TTL 30–60s). Essa é a janela real entre "último anúncio sai" e "página vira 404" — documentável, provavelmente aceitável, mas medir antes de afirmar.

---

## Três decisões que preciso de você antes de codar

### A. Limiar de existência: 1 ou 3?

Recomendo **≥1 para existir** e manter **≥3 para indexar** (divergência 2). Se preferir um limiar único em 3, cidades com 1–2 anúncios somem e seus anúncios ficam órfãos — quero sua confirmação explícita antes.

### B. Variante filtrada com zero resultado é 404 ou 200?

`/carros-automaticos-em/atibaia-sp` é `noindex` **hoje mesmo com Atibaia tendo estoque**, porque não há automáticos suficientes. Pelo invariante literal, a **cidade** existe → 200. Minha leitura: variante vazia = 200 com estado vazio + `noindex`; 404 é só sobre a cidade. Confirma?

### C. `/blog/[cidade]` é rota DUAL

[app/blog/[cidade]/page.tsx](frontend/app/blog/[cidade]/page.tsx) resolve **post do CMS primeiro**, hub de cidade depois — e o próprio comentário registra que *"o hub aceita QUALQUER slug"*. Um 404 ingênuo por "cidade sem anúncio" mataria post legítimo cujo slug termine em `-uf`.

A regra ali tem que ser: post publicado → 200; senão cidade com anúncio → 200 hub; senão 404. Confirmo que é isso antes de implementar.

---

## Achados menores (mesmo escopo)

- **`/tabela-fipe/ALTANEIRA-CE` (maiúsculas)** — confirmado no briefing; 301 para minúsculas é o caminho certo, e o gate deve normalizar antes de decidir.
- **Título duplicado no blog** (`"... | Carros na Cidade | Carros na Cidade"`) — corrigível junto, independe do invariante.
- **`/tabela-fipe` e `/blog` são os únicos `index, follow`** para cidade vazia. São eles que realmente entram no índice; as outras cinco já saem `noindex`. Se houver necessidade de um paliativo antes do 404, é aí — mas o 404 resolve os dois.

---

## O que NÃO encontrei divergente

Confirmei e continua valendo:

- **Sitemap não alimenta.** Deriva de `listActiveCityRows`; 21 URLs de veículo e cidades só com estoque.
- **Descoberta é por link interno**, como você descreveu.
- **`force-dynamic`** nas rotas de cidade favorece o estado derivado do requisito 4.
- **404, não 410** — concordo integralmente: a cidade pode existir depois.
- **Encolher o site é o comportamento correto** — com o estoque concentrado em Atibaia, é o esperado.

---

## Plano proposto (após suas respostas)

1. `listActiveCityRows` → serviço + endpoint público cacheado curto; **fonte única**.
2. Gate no middleware para as ~17 rotas, consultando essa fonte (404 real; `notFound()` de página é soft-404 no Next 14.2).
3. Separar catálogo de entrada (wizard) de conjunto público (rotas + links): dois BFFs distintos, nomes que não se confundam.
4. Varrer geradores de link; `CityHeaderSelector` e `BrandNeighborCities` passam a consumir a fonte única.
5. Testes, incluindo o de regressão que você pediu: reintroduzir `index,follow` em `tabela-fipe`, ver falhar, restaurar.
6. Documentar o invariante em `docs/` com o texto do seu briefing.
