# Fase 5.0B — Catálogo territorial limpo e largo

**Rota alterada:** `/carros-em/[slug]`
**Branch:** `codex/catalog-city-clean-desktop-grid`
**Base:** `main` @ `190df7a5`
**Data:** 2026-09-03
**Origem:** auditoria `reports/fase-5-0-auditoria-estrutura-catalogo-2026-09-02.md`, mais a
correção final de layout que trocou o alvo de "quarta coluna" por "shell largo".

---

## 1. O que mudou

`/carros-em/[slug]` termina em **cards → paginação → rodapé** e passou a usar um
**shell de desktop próprio, mais largo**, em vez da coluna central de 1280px que
as outras rotas usam. A quarta coluna de cards é consequência desse shell, não
uma troca de classe.

Nenhuma outra rota mudou. Mobile e tablet não mudaram.

---

## 2. A correção de rumo, registrada

A primeira versão desta fase colocou a quarta coluna em `min-[1600px]` mantendo o
container em `max-w-7xl` abaixo disso. Estava errado para o objetivo: em 1440 —
a largura de notebook mais comum — a página continuava com 3 cards de 275px,
presa à mesma coluna central de sempre.

A referência passada na revisão foi a página de resultados da Webmotors, e o que
se copiou dela foi o **princípio de largura**, não o desenho: a listagem usa a
largura útil da viewport. Refeito nesses termos, o alvo deixou de ser "em que
breakpoint cabe a quarta coluna" e passou a ser "quanto espaço a listagem pode
ocupar" — e a coluna caiu por consequência.

---

## 3. Os dois shells

| | histórico (4 rotas) | cidade (esta fase) |
|---|---|---|
| teto do container | `max-w-7xl` = 1280px | **1600px** |
| padding lateral (lg) | `px-8` = 32px | **`px-6` = 24px** |
| sidebar | `minmax(280px,320px)` | **296px** |
| gap sidebar → grid | `gap-8` = 32px | **`gap-5` = 20px** |
| gap entre cards (lg) | 20px | **16px** |

Toda diferença passa por uma única flag no componente compartilhado:

```tsx
const isCityVariant = variant === "cidade";
```

É o único ponto a inspecionar para saber o que muda e onde.

---

## 4. Geometria medida — a tabela pedida

`next start` de build de produção, Chromium, Atibaia-SP com 27 anúncios, todas as
medidas por `getBoundingClientRect` no navegador:

| viewport | container | sidebar | área do grid | colunas | card | margem externa |
|---|---|---|---|---|---|---|
| 390 (mobile) | 390 | — | 366 | 1 | **366 × 178** | 0 |
| 412 (mobile) | 412 | — | 388 | 1 | 388 × 178 | 0 |
| 768 (tablet) | 768 | — | 720 | 2 | **352 × 542** | 0 |
| 1024 | 1024 | 296 | 660 | 3 | 209 × 436 | 0 |
| **1280** | 1280 | 296 | 916 | **3** | **295 × 500** | 0 |
| **1366** | 1366 | 296 | 1002 | **3** | **323 × 521** | 0 |
| 1391 | 1391 | 296 | 1027 | 3 | 332 × 528 | 0 |
| **1392** | 1392 | 296 | 1028 | **4** | **245 × 463** | 0 |
| **1440** | 1440 | 296 | 1076 | **4** | **257 × 472** | 0 |
| **1536** | 1536 | 296 | 1172 | **4** | **281 × 490** | 0 |
| **1600** | 1600 | 296 | 1236 | **4** | **297 × 502** | 0 |
| **1920** | 1600 | 296 | 1236 | **4** | **297 × 502** | 160 |

Gap sidebar→grid: **20px** em todas. Gap entre cards: **16px** em todas.

Comparação com o shell histórico, na mesma cidade: o card era **275 × 485 em
qualquer desktop**, de 1280 a 1920, porque o container nunca crescia. Agora ele
varia de 245 a 332 conforme a largura realmente disponível.

---

## 5. De onde saiu 1392 — um número que ninguém escolheria

O breakpoint não foi escolhido, foi resolvido. É a largura em que o card de 4
colunas alcança os 245px de piso que a fase fixou:

```
(V − 48 padding − 296 sidebar − 20 gap − 48 gaps de card) / 4 ≥ 245
V ≥ 1392
```

Medido: em 1392 o card dá exatamente **245px**; em 1391 a página fica em 3
colunas com card de 332px. Os dois casos estão travados por teste E2E, um de cada
lado do corte — é o limite inferior do breakpoint, que nenhum teste de classe
CSS consegue provar.

---

## 6. 1366 foi testado de verdade — e não passou

A fase pediu para testar 4 cards em 1366. Testei, e a resposta é não, pelo motivo
que a própria fase estabeleceu ("não aceitar card visualmente comprimido").

Em 1366 com a sidebar em 296px, a conta dá **238px por card** — 7px abaixo do
piso. Para chegar aos 245px a sidebar teria de cair para **270px ou menos**. E é
aí que a coisa quebra.

**A medição que decidiu.** Varri a largura da sidebar de 264 a 320 contando
elementos cujo conteúdo transborda a caixa (`scrollWidth > clientWidth`):

| sidebar | controles transbordando | "Limpar filtros" |
|---|---|---|
| 264 – 288px | **3** | 2 linhas |
| 292px | 2 | 2 linhas |
| **296px** | **0** | 2 linhas → 1 com `nowrap` |
| 320px (histórico) | 0 | 1 linha |

O que estoura é o botão **"Particulares (0)"** do filtro de vendedor: caixa de
103px para 111px de conteúdo, com a borda direita saindo cortada. Não é
subjetivo — dá para ver na captura, e o gate desta fase proíbe quebra de CTA.

**Conclusão:** 296px é o piso da sidebar, e com ele 1366 fica em 3 colunas. A
alternativa seria entregar 4 cards em 1366 com um filtro visivelmente quebrado.
Escolhi a sidebar íntegra e estou registrando a troca, não escondendo.

Se a decisão de produto for outra — 4 colunas em 1366 valem mais que o filtro de
vendedor inteiro — o caminho não é estreitar a sidebar e aceitar o estrago: é
mudar aquele controle (empilhar "Lojas"/"Particulares" em vez de lado a lado),
que é trabalho de outra fase porque o componente é compartilhado pelas 5 rotas.

---

## 7. `whitespace-nowrap` — a única linha tocada no componente compartilhado

Na faixa dos 296px o rótulo "Limpar filtros" quebrava em duas linhas e o
cabeçalho da sidebar ia de 37px para 62px de altura. Resolvido com
`whitespace-nowrap` no próprio botão, em `FilterSidebar`.

O diff nesse arquivo é **1 classe + comentário**. E o utilitário é
comprovadamente inerte para as outras quatro rotas: a varredura acima mostra que
em 320px o rótulo **já cabia em uma linha** (altura 37px) antes da mudança — e a
medição pós-mudança confirma 37px nas quatro. Nada a renderizar de diferente.

> Nota de processo: rodar o Prettier nesse arquivo reformatou 307 linhas, porque
> ele é um dos legados fora do padrão. Revertido — um componente compartilhado
> por 5 rotas não deve chegar à revisão com 300 linhas de ruído em volta de uma
> mudança de uma linha.

---

## 8. Limits — inalterados

```
frontend/lib/search/ads-search-url.ts:4   PUBLIC_ADS_SEARCH_LIMIT_MAX = 50
frontend/lib/search/ads-search-url.ts:7   DEFAULT_COMPRAR_CATALOG_LIMIT = PUBLIC_ADS_SEARCH_LIMIT_MAX
frontend/lib/seo/query-policy.ts:60       DEFAULT_CATALOG_LIMIT = 50
```

Nenhuma constante de `limit` aparece no diff.

---

## 9. Fim da página

| | main | branch (1440) |
|---|---|---|
| vão grid → rodapé (desktop) | **1752px** | 116px |
| vão grid → rodapé (mobile 390) | **2509px** | 180px |
| vão paginação → rodapé | — | **48px** |

Saíram do render (não do projeto) `NearbyRadiusSection`, `CityAuthoritySection`,
`CompactCitySeoBlock` e `FaqBlock` — seis `<h2>` no total:

1. `O mercado de carros usados em Atibaia` — MarketOverview
2. `Marcas com carros à venda em Atibaia` — BrandDiscovery
3. `Modelos mais anunciados em Atibaia` — ModelDiscovery
4. `Quem está anunciando em Atibaia` — DealerDiscovery
5. `Sobre carros usados em Atibaia` — CompactCitySeoBlock
6. `Perguntas frequentes sobre comprar carro usado em Atibaia` — FaqBlock

`FAQPage` e `areaServed` saíram junto com o conteúdo que descreviam — schema sem
conteúdo correspondente é spam estrutural. `CollectionPage`, `ItemList` e
`BreadcrumbList` continuam intactos, com as mesmas contagens.

HTML SSR: **305.592 → 248.955 bytes (−18,5%)**. Os 27 links `/veiculo/`
permanecem.

**Ressalva:** o `NearbyRadiusSection` foi removido do código, mas em Atibaia já
não renderizava — ele só aparece em cidade com poucos anúncios. O slider
"Distância (km)", porém, **aparecia**, controlando um bloco que não existia
naquela tela. A mudança tornou explícito o que já era inerte.

---

## 10. Mobile inalterado — prova por pixel

| Comparação | Pixels diferentes |
|---|---|
| Mobile 390 — primeira dobra | 6 de 329.160 (0,0018%), delta máx **4/255** |
| Mobile 390 — página inteira | **idênticas até a linha 5479**; diferem só abaixo |
| Tablet 768 — card | 352 × 542 nos dois builds |

Os 6 pixels estão em `x=19` e `x=21` — a borda arredondada do card — nas mesmas
linhas (`y=517`, `y=707`) das duas versões. É antialiasing de foto, não
deslocamento.

Na página inteira do mobile, a primeira linha com qualquer diferença é a **5480**
— exatamente onde o grid termina (5448) e começava o conteúdo removido. Acima
disso, zero diferenças.

O teste unitário `VehicleGrid.columns.test.tsx` reforça isso por construção:
recorta de cada variante os utilitários que valem abaixo de `lg` e exige que
sejam **byte a byte iguais** entre `"default"` e `"wide"`.

---

## 11. Desktop 1280 MUDOU — e isso é intencional

Diferente da versão anterior desta branch, o desktop de 1280 **não é mais
pixel-idêntico** ao baseline. O shell largo vale de `lg:` para cima, então em
1280 a sidebar encolhe (320 → 296), o padding encolhe (32 → 24) e os cards
crescem: **275 → 295px**, ainda em 3 colunas.

Medido: a primeira linha com diferença é a **359** — o topo da faixa do catálogo.
Cabeçalho, breadcrumb, H1 e busca continuam idênticos.

Isso atende ao que a fase pediu para 1280 ("3 cards aceitável se 4 comprometerem
o card": 4 ali dariam 217px) e é coerente com o princípio — em 1280 a listagem
já ocupa a viewport inteira, e o ganho aparece como card maior em vez de coluna
extra.

---

## 12. Rotas irmãs — não-regressão medida

| largura | rota | container | sidebar | col | card | "Limpar filtros" |
|---|---|---|---|---|---|---|
| 1280 | `/carros-em/atibaia-sp` | **1280** | **296** | **3** | **295** | 37px |
| 1440 | `/carros-em/atibaia-sp` | **1440** | **296** | **4** | **257** | 37px |
| 1920 | `/carros-em/atibaia-sp` | **1600** | **296** | **4** | **297** | 37px |
| 1280 | `/comprar` | 1280 | 320 | 3 | 275 | 37px |
| 1440 | `/comprar` | 1280 | 320 | 3 | 275 | 37px |
| 1920 | `/comprar` | 1280 | 320 | 3 | 275 | 37px |
| 1280 / 1440 / 1920 | `/carros-usados/sp` | 1280 | 320 | 3 | 275 | 37px |
| 1280 / 1440 / 1920 | `/comprar/estado/sp` | 1280 | 320 | 3 | 275 | 37px |

As três irmãs mantêm container 1280, sidebar 320, 3 colunas e card de 275px em
**1920px de viewport** — o comportamento histórico, sem um pixel de diferença. E
a altura de 37px do "Limpar filtros" nas quatro rotas confirma que o
`whitespace-nowrap` não mudou nada para elas.

O script que produz essa tabela está versionado em
`frontend/scripts/fase-5-0b-rotas-irmas.mjs`.

**`/carros-usados/regiao/[slug]` respondeu 503** nas três larguras. Não é
regressão — o middleware nomeia a causa no header:

```
x-middleware-regional-reason: missing-internal-api-token
```

É o gate fechando por falta de `INTERNAL_API_TOKEN` no `.env.local` local. Roda
**antes** do componente de página, e este diff não toca `middleware.ts` nem
`lib/middleware/`.

---

## 13. Um efeito colateral que inspecionei e não é regressão

Com a sidebar em 296px, o seletor de ESTADO passou a mostrar `São` em vez de
`São Pa`. Recortei os dois builds no mesmo viewport para comparar: **os dois
truncam** — o de 320px cortava no meio da letra (`São Pa`), o de 296px corta no
limite da palavra (`São`). Nenhum dos dois mostra "São Paulo" inteiro.

A truncagem é anterior a esta fase e fica fora do escopo dela. Registrada aqui
para que não seja lida como estrago do shell novo.

---

## 14. Paginação visível com uma página só

Com 27 anúncios e `limit` 50 há exatamente 1 página, e o paginador é **inerte**:

- **0** elementos `<a>` dentro do `<nav>`
- **nenhuma** ocorrência de `page=1`
- as duas setas são `<span>` desabilitado
- o número atual é `<span aria-current="page">1</span>`

Ele existe porque, sem os blocos SEO, nada mais marcava o fim da listagem. O
comportamento com 2+ páginas é o de sempre.

---

## 15. Resiliência: serviço de conteúdo fora ≠ cidade inexistente

`loadLocalSeoLanding` terminava em `catch { notFound(); }` — e esse loader
alimenta só metadata e JSON-LD, mas derrubava a página inteira, inclusive o
catálogo, que vem de outro loader e estava no ar.

| Situação | Comportamento |
|---|---|
| cidade não existe | **404**, sempre |
| serviço caiu + `"degrade"` | modelo mínimo, **200** com `noindex` |
| serviço caiu + padrão | **404** (histórico, mantido nas landings irmãs) |

Verificado em runtime: `/carros-em/cidade-fantasma-zz` → **404**.

---

## 16. Rede e performance

Saíram do `Promise.all` da rota `loadNearbyRadiusAds` e `loadCitySeoOverview`:
4 cargas paralelas viraram 2.

| Métrica | main | branch |
|---|---|---|
| HTML SSR | 305.592 B | **248.955 B (−18,5%)** |
| TTFB (mediana de 5 quentes) | 0,292 s | 0,317 s |
| First Load JS | 136 kB | 136 kB |

**O TTFB não melhorou de forma mensurável** e as faixas se sobrepõem; as chamadas
removidas batiam em backend com cache e não dominavam o tempo. O ganho real é de
**56,6 KB por pageview**. O JS de cliente não mudou porque os blocos removidos
eram Server Components — dizer que "a página ficou mais leve no JS" seria falso.

---

## 17. Testes

| Suíte | Arquivo | Testes |
|---|---|---|
| Variante de colunas | `components/buy/VehicleGrid.columns.test.tsx` | 6 |
| Paginação página única | `components/buy/CatalogPagination.test.tsx` | 23 (6 novos) |
| Resiliência SEO | `lib/seo/local-seo-data.resilience.test.ts` | 6 |
| Geometria + sidebar E2E | `e2e/catalog-city-clean-grid.spec.ts` | **18** |

O E2E mede bounding box real, com **piso de largura por viewport**: sem isso, um
teste de "4 colunas" aceitaria 4 colunas de qualquer tamanho — inclusive as de
201px que a fase rejeitou. E travou o defeito da sidebar: um teste percorre todos
os descendentes procurando `scrollWidth > clientWidth`, que é o que um humano vê
como texto cortado, sem depender de conhecer os rótulos.

**Suíte completa do frontend:**

```
Test Files  2 failed | 225 passed (227)
     Tests  5 failed | 3549 passed (3554)
```

As 5 falhas são anteriores a esta fase — rodei os mesmos dois arquivos com a
`main` em checkout e obtive exatamente o mesmo resultado (`2 failed`,
`5 failed | 12 passed`). São `app/seguranca/page.copy.test.ts` e
`app/carros-usados/regiao/[slug]/page.config.test.ts`; nenhum está no diff.

`tsc --noEmit`, `next lint --max-warnings 0` e `prettier --check` limpos.
Playwright: **18 passed**.

---

## 18. Dois erros meus, registrados

**Asserções de ausência vacuosas.** A lista de "blocos removidos" usava strings
deduzidas do *nome* dos componentes ("Panorama do mercado", "Também na região
de"…). Quatro das cinco **nunca existiram no HTML**: `not.toContain` de algo que
jamais esteve lá é verde com ou sem a mudança. Descoberto ao comparar os `<h2>`
dos dois builds; a lista foi refeita a partir do HTML medido e o teste ganhou uma
contraprova (exige que H1 e cabeçalho de resultados continuem presentes).

**Seletor certo no elemento errado.** `main .grid` casava o grid de *layout*
(sidebar + conteúdo): media "2 cards por linha" em qualquer largura, com card de
624px. Não falhava — media outra coisa. O sinal foi o número absurdo. Corrigido
ancorando em `[data-variant="grid"]`, que aparece 27 vezes (= 27 anúncios) e só
como wrapper de card.

---

## 19. Decisões de produto registradas

- **Nenhum bloco substituto** foi criado: sem chips, sem "Explore em Atibaia".
  Os 5 links internos perdidos continuam publicados em `brands.xml`/`models.xml`.
- **1366 fica em 3 colunas** enquanto o filtro de vendedor precisar de 296px de
  sidebar (§6).
- **Teto de 1600px:** em 1920 sobram 160px de margem de cada lado. É o que a fase
  pediu ("max-width ~1560–1600px"); acima disso a linha de leitura ficaria longa
  demais.
- **1024px continua em 3 colunas** com card de 209px — comportamento anterior à
  fase, fora de escopo, mas é a largura mais apertada da tabela.

---

## 20. Evidências visuais

`reports/screenshots/fase-5-0b/` — 15 capturas da branch, 4 do baseline (`main`)
e os JSON com todas as medidas.

| Arquivo | O que mostra |
|---|---|
| `01-city-desktop-1280` (branch + baseline) | o antes e o depois em 1280 |
| `02-city-desktop-1366` | 3 colunas, card de 323px |
| `12-city-desktop-1392` | **o corte** — 4 colunas de 245px |
| `03-city-desktop-1440` | **o obrigatório** — 4 colunas de 257px |
| `04-city-desktop-1536` · `05-city-desktop-1600` · `06-city-desktop-1920` | 4 colunas |
| `07-…-1440-fullpage` · `08-…-1920-fullpage` | página inteira |
| `09/10-city-mobile-390` (branch + baseline) | base da comparação por pixel |
| `11-city-tablet-768` | 2 colunas, inalterado |
| `13-city-paginacao-desktop` · `14-city-footer-transition` | o fim da página |
| `15-…-1280-fullpage` (branch + baseline) | o antes/depois com os blocos SEO |

---

## 21. Como reproduzir

```bash
cd frontend && npm run build && npx next start -p 3000
```

```bash
cd frontend && node scripts/fase-5-0b-capture.mjs 3000 branch ../reports/screenshots/fase-5-0b
```

```bash
cd frontend && node scripts/fase-5-0b-rotas-irmas.mjs 3000
```

```bash
cd frontend && npx playwright test e2e/catalog-city-clean-grid.spec.ts --reporter=list
```

---

## 22. Gate

| | |
|---|---|
| 1440 mostra 4 cards | ✅ card 257px |
| cards com largura saudável | ✅ 245px no piso (1392), 257 em 1440, 297 em 1600+ |
| sidebar legível | ✅ zero transbordos em 296px; rótulo em 1 linha |
| sem compressão de título/preço | ✅ verificado nas capturas de 1392 a 1920 |
| sem quebra de CTA | ✅ travado por teste E2E de `scrollWidth` |
| 1366 testado de verdade | ✅ testado e **reprovado** — 3 colunas, com o porquê no §6 |
| 1536 e 1920 mostram 4 | ✅ 281px e 297px |
| mobile intacto | ✅ 6 pixels de antialiasing; idêntico até a linha 5479 |
| outras rotas intactas | ✅ 1280/320/3col/275px em 1920 |
| paginação intacta | ✅ inerte com 1 página, 0 links |
| limit 50 intacto | ✅ três constantes fora do diff |
| rodapé imediato após paginação | ✅ vão de 48px |

**Uma linha do gate não foi cumprida como pedida**: 1366 ficou em 3 colunas. O
§6 traz a medição que levou a isso e a alternativa, caso a decisão de produto
seja outra.

---

## 23. Estado da entrega

Branch `codex/catalog-city-clean-desktop-grid`, à frente de `origin/main`
(`190df7a5`).

**Não foi feito push, PR, merge nem deploy.** Aguardando revisão.
