# Invariante territorial — uma cidade existe se, e somente se, tem anúncio ativo

**Status:** aceito · **Data:** 2026-08-05 · **Escopo:** todas as rotas públicas com escopo de cidade ou UF

---

## A regra

> **UMA CIDADE SÓ EXISTE A PARTIR DO MOMENTO EM QUE UM ANUNCIANTE PUBLICA UM ANÚNCIO NELA.**
>
> O conjunto de cidades públicas **NÃO é uma lista**. É o resultado de:
> `SELECT DISTINCT cidade FROM ads WHERE ativo`.
>
> As páginas nascem com o crescimento do site. Nenhuma cidade é pré-criada. Nenhuma rota pública valida slug contra catálogo de municípios.

Isto não é um filtro sobre uma lista existente — **é a definição do conjunto**. Se a implementação perguntar _"esse município existe?"_ em vez de _"essa cidade tem anúncio ativo?"_, está errada.

---

## Os dois eixos (a distinção que faltava)

O bug original nasceu de um número só (`SITEMAP_MIN_ADS=3`) governando duas perguntas diferentes.

| Eixo                                     | Pergunta              | De quem é a decisão                           | Limiar                               |
| ---------------------------------------- | --------------------- | --------------------------------------------- | ------------------------------------ |
| **Existir** (404 vs 200)                 | a cidade existe?      | do **anunciante** — ele publicou ali          | `CITY_EXISTS_MIN_ADS`, default **1** |
| **Indexar** (index vs noindex + sitemap) | vale disputar índice? | do **Google** — página com 1-2 carros é magra | `CITY_INDEX_MIN_ADS`, default **3**  |

### Tabela de decisão

| Anúncios ativos na cidade | HTTP    | robots            | Sitemap |
| ------------------------- | ------- | ----------------- | ------- |
| 0                         | **404** | —                 | fora    |
| 1–2                       | 200     | `noindex, follow` | fora    |
| ≥ 3                       | 200     | `index, follow`   | dentro  |

`follow` em **todos** os casos de 200: os links para os anúncios devem continuar sendo seguidos mesmo quando a página da cidade não é indexada.

### Por que os dois limiares não podem ser o mesmo número

Com limiar único em 3, cidade com 1–2 anúncios daria 404 e **os anúncios dela ficariam órfãos**: `/veiculo/<slug>` continua respondendo 200, mas nenhuma página de cidade linka para ele. O anunciante publica e o carro some da navegação. Isso é pior que o problema que o invariante corrige.

---

## Escopo do limiar: total da cidade vs recorte da rota

Rotas como `/carros-baratos-em/` e `/carros-automaticos-em/` são **recortes**: a cidade pode ter 5 anúncios e só 1 abaixo da FIPE.

- **Existência** segue o **total da cidade**. Senão, um recorte vazio derrubaria a cidade inteira.
- **Indexação** segue o **recorte da rota**. "Carros baratos em X" com um carro só é tão magra quanto qualquer outra página magra.

### Variante com zero resultados numa cidade que existe

Responde **200 + `noindex, follow`**, com estado vazio útil — nunca 404.

O invariante governa a **cidade**, não o recorte. Se a URL oscilasse 200↔404 conforme o perfil do estoque, o Google veria instabilidade e todo link interno para o recorte quebraria sempre que ele esvaziasse entre dois rastreamentos. A mesma lógica aplicada a filtros de busca levaria a 404 para qualquer combinação sem resultado, o que não faz sentido.

O estado vazio precisa **oferecer saída**: link para a listagem completa da cidade, para o mesmo recorte no estado (se houver estoque lá) e para anunciar.

---

## A única exceção: o wizard de anúncio

O vendedor escolhe **qualquer** município — é esse ato que cria a cidade. A lista de municípios (tabela `cities`, semeada do IBGE) é legítima **nesse ponto e só nele**.

|              | Catálogo de entrada         | Conjunto público                           |
| ------------ | --------------------------- | ------------------------------------------ |
| O que é      | os 5.570 municípios do IBGE | cidades com anúncio ativo                  |
| Fonte        | tabela `cities`             | `SELECT DISTINCT` sobre `ads`              |
| Endpoint     | `/api/public/cities/search` | `/api/public/cities/public-set`            |
| Quem consome | **só** o wizard             | rotas públicas, geradores de link, sitemap |

**Confundir as duas é o bug.** Até 2026-08-05, `/api/public/cities/search` servia tanto o wizard quanto o seletor público de cidades no header — e era por isso que um visitante conseguia navegar até uma cidade sem nenhum anúncio.

---

## Implementação

### Fonte única

`src/read-models/cities/public-city-set.service.js` → `getPublicCitySet()`

Deriva de `listActiveCityRows()` (`WHERE a.status = 'active' GROUP BY city HAVING COUNT(*) >= 1`). Servida em `GET /api/public/cities/public-set`, TTL 60s.

**Nenhum outro caminho decide se uma cidade existe.** O bug original existiu porque a regra foi aplicada rota a rota e duas ficaram de fora. Se sobrar mais de um lugar decidindo, o bug volta.

### Gate

`frontend/lib/middleware/city-existence-gate.ts`, executado no `middleware.ts`.

No middleware, e não na página, porque no Next 14.2.35 `notFound()` em server component — mesmo com `force-dynamic` — renderiza o body do not-found mas comita **HTTP 200** (soft-404), que o Google indexa. Mesmo contorno de `ad-detail-gate` e `territory-gate`.

Busca o **conjunto inteiro**, não um endpoint por slug: o tráfego a barrar é crawler varrendo milhares de slugs distintos. Por slug, o gate financiaria o próprio ataque.

### Fail-open

Backend indisponível → **passa**. Falhar fechado transformaria uma queda de backend em 404 no site inteiro — trocaria um problema de SEO por uma queda. Payload malformado também é tratado como indisponível: conjunto vazio significaria "nenhuma cidade existe".

O header `x-cnc-city-gate-unavailable` marca esses casos. **Se ele aparecer em volume, o invariante está desligado na prática.**

### Ordem no middleware

1. `territory-gate` (estrutural, sem I/O): slug cuja UF final não é UF brasileira real → 404 de graça.
2. `city-existence-gate` (com I/O): cidade fora do conjunto → 404.

O estrutural primeiro evita o fetch para lixo óbvio.

---

## Rotas cobertas

Lista exaustiva. **Ao criar rota territorial nova, ela entra no gate no mesmo PR** — o bug original é literalmente que `tabela-fipe` e `blog` ficaram de fora e serviam `index,follow` para qualquer slug terminado em UF válida.

| Rota                                                                                        | Família no gate           |
| ------------------------------------------------------------------------------------------- | ------------------------- |
| `/comprar/cidade/[slug]`                                                                    | `comprar-cidade`          |
| `/carros-em/[slug]`                                                                         | `carros-em`               |
| `/carros-baratos-em/[slug]`                                                                 | `carros-baratos-em`       |
| `/carros-automaticos-em/[slug]`                                                             | `carros-automaticos-em`   |
| `/tabela-fipe/[cidade]`                                                                     | `tabela-fipe`             |
| `/simulador-financiamento/[cidade]`                                                         | `simulador-financiamento` |
| `/cidade/[slug]` e sub-rotas (`/marca/…`, `/modelo/…`, `/abaixo-da-fipe`, `/oportunidades`) | `cidade`                  |
| `/blog/[cidade]` e sub-rotas                                                                | `blog` (ver ressalva)     |

### Rotas com escopo de UF

Mesmo invariante, um nível acima: **UF sem nenhum anúncio no estado inteiro também não existe.**

| Rota                           | Família no gate        | De onde vem a UF         |
| ------------------------------ | ---------------------- | ------------------------ |
| `/carros-usados/[uf]`          | `carros-usados-uf`     | segmento direto          |
| `/comprar/estado/[uf]`         | `comprar-estado`       | segmento direto          |
| `/[uf]/regiao/[ancora]`        | `uf-regiao`            | segmento direto (raiz)   |
| `/carros-usados/regiao/[slug]` | `carros-usados-regiao` | sufixo do slug da âncora |

Sem isso, trocaríamos 5.570 páginas de cidade por 27 de estado — melhor, mas ainda conteúdo vazio indexável. Pior: a página de UF **linka de volta para cidades**, reabrindo o ciclo de descoberta que o gate de cidade fecha.

A UF é agregada na mesma passagem que monta as cidades (`buildPublicCitySet`), a partir de `row.state` com fallback no sufixo do slug. **Não é uma segunda fonte de verdade** — foi a existência de fontes paralelas que causou o bug original.

**Por que `/carros-usados/regiao/[slug]` é gateado por UF e não pela cidade âncora:** a região pode conter vizinhas com estoque mesmo quando a âncora não tem. Gatear pela âncora mataria região legítima. Pela UF é seguro — estado sem nenhum anúncio não pode ter região com estoque.

**Compatibilidade entre deploys:** se o frontend subir antes do backend, o payload não traz `ufs`. Nesse caso o gate **deriva** o agregado do sufixo dos slugs de cidade, em vez de tratar como vazio — derivar vazio 404aria todas as UFs durante a janela entre os dois deploys.

### Ressalva: `/blog/[cidade]` é DUAL

A rota resolve **primeiro** um post publicado do CMS e só depois o hub de cidade. Um post chamado `melhores-suvs-2026` não pode levar 404 por não ser cidade.

O gate só trata como cidade o slug com **forma de cidade** (termina em `-<2 letras>`). Post cujo slug termine assim seria colisão com cidade — caso que o admin do blog já trata como conflito a evitar.

---

## Consequências aceitas

- **O site encolhe.** Com o estoque concentrado em Atibaia, sobram poucas cidades. É o comportamento correto.
- **"Não indexadas" no Search Console vai SUBIR antes de cair**, porque 404 conta como não indexada. Esperado, não regressão.
- **A saída do índice leva semanas a meses.** Não há atalho.

### O que NÃO fazer

- **Ferramenta de remoção do Search Console** — paliativo de 6 meses que não toca a causa.
- **Redirecionar para o estado ou a home** — vira soft-404.
- **410 em vez de 404** — 410 afirma "não volta". A cidade pode existir amanhã, quando alguém anunciar lá. **404 é o status correto justamente porque é reversível.**

---

## Estado derivado, nunca cache estagnado

- Último anúncio sai do ar → a página passa a 404 **sozinha**.
- Primeiro anúncio entra → a página passa a existir **sozinha**.

Nenhum passo manual, nenhuma lista a atualizar.

**Janela:** as rotas de cidade são `force-dynamic` (sem ISR). O atraso vem do TTL de 60s do conjunto no data cache do Edge, somado ao TTL de 60s do `cacheGet` no backend — **até ~2 minutos** entre o fato e a mudança de status. Aceitável para uma decisão de 404; encurtar aumentaria a carga sob crawl sem ganho real.

---

## Ver também

- `reports/investigacao-invariante-cidade-existe-se-tem-anuncio.md` — o diagnóstico que originou este ADR, incluindo a descoberta de que **não existia lista de municípios** nas rotas (a superfície era ilimitada, não 5.570 × 7).
- `frontend/lib/middleware/city-existence-gate.ts` — o gate.
- `src/read-models/cities/public-city-set.service.js` — a fonte única.
- `src/read-models/cities/city-thresholds.js` — os dois limiares.
