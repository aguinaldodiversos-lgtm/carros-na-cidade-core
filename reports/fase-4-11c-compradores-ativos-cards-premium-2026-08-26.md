# Fase 4.11C — Remodelagem premium da listagem "Compradores ativos"

**Data:** 2026-08-26
**Rota alvo:** `/dashboard-loja/oportunidades/compradores`

---

## 1. Base

`fa0effd84abcf95aa2d7c6ebdb9a9828fb72e4d9` — confirmado com `git rev-parse HEAD`
antes de criar a branch, e `git pull --ff-only origin main` respondeu
"Already up to date".

## 2. Branch

`codex/active-buyers-card-grid-premium`, criada a partir da base acima.

## 3. HEAD

Commit de implementação: **`71040c5e473d3215160cf9566194541d550de1ba`**
(`feat(compradores-ativos): a grade que o lojista lê antes de ler`).

27 arquivos, +4066 / −162. Este relatório é fechado por um commit `docs`
seguinte — um arquivo não pode conter o hash do commit que o cria.

`git rev-list --left-right --count origin/main...HEAD` → `0 1` no momento do
commit de implementação (nenhum commit atrás da main).

Os quatro arquivos locais protegidos do usuário
(`frontend/public/images/lojista-detalhe-veiculo-referencia.png`,
`frontend/public/images/lojista-oportunidades-veiculos-referencia.png`,
`frontend/public/images/vender-para-loja.png`,
`reports/fase-4-0-auditoria-venda-para-lojas-2026-08-15.md`) continuam
**intocados e não versionados**. Nenhum `git add .`, `git add -A`, `git clean`,
`git stash -u` ou `git reset --hard` foi executado.

---

## 4. Auditoria do feed (antes de codar)

| Camada | Arquivo |
| --- | --- |
| Rota (page) | `frontend/app/dashboard-loja/oportunidades/compradores/page.tsx` |
| Componente | `frontend/components/account/DealerOpportunitiesList.tsx` |
| Cliente HTTP | `frontend/lib/purchase-intents/api.ts` |
| BFF (proxy) | `frontend/app/api/account/opportunities/purchase-intents/[[...path]]/route.ts` |
| Rotas backend | `src/modules/purchase-intents/purchase-intents.dealer.routes.js` |
| Controller | `src/modules/purchase-intents/purchase-intents.controller.js` |
| Service | `src/modules/purchase-intents/purchase-intents.service.js` |
| Repository | `src/modules/purchase-intents/purchase-intents.repository.js` |
| Vocabulário | `src/modules/purchase-intents/purchase-intents.constants.js` |

**Estado encontrado (`listActiveByCity({ cityId, limit, cursor })`):**

- escopo: `pi.city_id = $1 AND pi.status = 'active' AND pi.expires_at > NOW()`;
- ordenação FIXA: `ORDER BY pi.created_at DESC, pi.id DESC`;
- paginação por cursor (tupla `(created_at, id)`), `limit + 1` sem `COUNT`;
- **zero filtros** e **zero contagem total**.

## 5. Campos disponíveis

| Dado | Campo real | No feed? | No card? | Filtrável? |
| --- | --- | --- | --- | --- |
| Modo da procura | `intent_type` | sim | sim (etiqueta) | **sim** (novo) |
| Marca | `brand` | sim | sim (título) | **sim** (novo, por `brand_slug`) |
| Modelo | `model` | sim | sim (título) | não (sem select próprio) |
| Carroceria | `body_type` | sim | sim (título + figura) | **sim** (novo) |
| Câmbio | `transmission` | sim | sim (critérios) | **sim** (novo) |
| Orçamento (teto) | `max_price` | sim | sim (destaque) | **sim** (novo, faixa) |
| Prazo de compra | `purchase_timeframe` | sim | sim (critérios) | **sim** (novo) |
| Cidade | `city{name,state,slug}` | sim | sim | não — resolvida no servidor |
| Publicação | `created_at` | sim | sim | ordenação |
| Validade | `expires_at` | sim | não | filtro implícito (`> NOW()`) |
| **Combustível** | **não existe** | — | — | — |
| **Faixa de ano** | **não existe** | — | — | — |
| **Entrada / parcela** | **não existe** | — | — | — |
| Identidade do comprador | **não sai do banco** | não | não | não |

`brand_slug` é usado no `WHERE` mas **não** foi adicionado ao DTO: filtrar por
uma coluna não exige devolvê-la.

## 6. Modos de intenção — o achado que muda o §2/§3 do enunciado

O enunciado descreve três modos ("modelo específico", "categoria aberta", "cabe
no bolso"). **O domínio tem dois.**

`PURCHASE_INTENT_TYPE` (`purchase-intents.constants.js`) é um CHECK de dois
valores — `specific_model` e `open_category` — e `purchase_intents` não tem
coluna de entrada, parcela nem prazo de financiamento. **Não existe procura
"cabe no bolso" para etiquetar.**

Decisão, seguindo §3 ("usar o nome real do modo no domínio; não inferir pelo
texto") e §43 ("dados reais somente"): foram implementadas **duas** etiquetas.
A terceira não foi fabricada por heurística de texto — "se o título não tem
modelo, chama de cabe no bolso" daria ao lojista uma classificação que nenhum
comprador declarou. Criar o terceiro modo de verdade é trabalho de produto
(campo no formulário do comprador + migration + CHECK), não de uma fase de
layout. Registrado como dívida em **19**.

Nenhum quarto modo foi criado; matching, escopo e resultados permanecem
idênticos.

## 7. Filtros suportados

O backend **não tinha nenhum**. Como o §65 exige "filtros realmente funcionam"
e o §59 exige que cada filtro altere a consulta real, os filtros foram
implementados **de ponta a ponta**, seguindo a convenção já revisada do
Produto 2 (`sale-requests.dealer.validation.js` / `.dealer.repository.js`).

| Controle | Query string | Cláusula SQL |
| --- | --- | --- |
| Tipo de procura | `intent_type` | `pi.intent_type = $n` |
| Marca | `brand` | `pi.brand_slug = $n` (canonicalizado no servidor) |
| Carroceria | `body_type` | `pi.body_type = $n` (normalizador da publicação) |
| Câmbio | `transmission` | `pi.transmission = $n` (idem) |
| Prazo de compra | `purchase_timeframe` | `pi.purchase_timeframe = $n` |
| Orçamento de / até | `budget_min` / `budget_max` | `pi.max_price >= / <= $n` |
| Ordenar por | `sort` | `ORDER BY` via mapa congelado |

**Ordenação:** `recent` (padrão), `oldest`, `budget_desc`, `budget_asc` — todas
resolvidas no servidor. O cursor passou a carregar o NOME da ordenação
(`sort|key|id`): sem isso, trocar o seletor com uma página carregada compararia
`numeric` com `timestamptz` e o feed viraria **500** num caminho alcançável com
dois cliques.

**O que NÃO foi criado, e por quê:**

- **Combustível** — a referência visual traz o controle; `purchase_intents` não
  tem a coluna. Um `<select>` que abre, oferece "Flex/Gasolina/Diesel" e devolve
  a lista inteira é o pior tipo de controle: parece funcionar. (§11: "não criar
  botão falso".)
- **Faixa de ano** — mesma razão.
- **Cidade como seletor** — o escopo é resolvido no servidor a partir da loja e
  `parseDealerFeedFilters` **não lê** `city_id`. A cidade é etiqueta de texto
  (§12), lida da resposta.

Em lugar dos dois inexistentes entraram dois que existem e que a referência não
previa: **tipo de procura** (a distinção mais importante desta tela) e **prazo
de compra**.

**Valor desconhecido é 400, não é ignorado** — decisão herdada do Produto 2. Um
`?transmission=Manual ou automatico` engolido em silêncio devolveria a cidade
inteira sob um cabeçalho que promete um recorte. `limit` continua tolerante:
limite é transporte, filtro é promessa.

## 8. Arquitetura visual

```
AccountPanelShell (header global + sidebar — PRESERVADOS)
└── DealerOpportunitiesList
    ├── ← Oportunidades
    ├── header  ·  h1 + subtítulo  ·  "N oportunidades ativas" (direita)
    ├── ActiveBuyerFilters   (cidade fixa · 4 selects · Mais filtros · ordenar · chips)
    └── grid    ·  ActiveBuyerCard[]  →  ActiveBuyerArt
                ·  CardSkeleton[] | empty | error
```

Tela de **navegação**, não de foco: a sidebar continua montada (§9).

## 9. Ilustrações

`ActiveBuyerArt.tsx` — SVG **inline**, `viewBox 320×112`, família de 8
carrocerias (`hatch`, `sedan`, `suv`, `picape`, `coupe`, `minivan`, `wagon`,
`generic`), cada uma com silhueta, vidros e **posição de eixos** próprios.
Mesma linguagem gráfica da 4.11B (mancha de fundo, volume por gradiente, cantos
suaves) + a lupa azul que marca "procura".

**A regra que decide a figura:**

- `open_category` → desenha a carroceria **declarada**;
- `specific_model` → **genérico**. O CHECK da tabela obriga `body_type` a ser
  NULL nesse modo. Derivar "Gol → hatch" de uma tabela de nomes seria um palpite
  nosso apresentado como dado do comprador, e erraria em silêncio no primeiro
  modelo que muda de categoria entre gerações. (§7 prevê exatamente esse
  fallback.)

**IDs de gradiente:** `useId()` **por instância**, com os dois-pontos do React
removidos. O prefixo fixo da 4.11B basta quando a figura aparece uma vez; aqui
vinte cards montam vinte cópias, e `url(#…)` resolve pela PRIMEIRA ocorrência —
todas as lupas passariam a pintar com o gradiente da primeira, sem um único
aviso no console. Há teste de unicidade (jsdom) **e** no DOM real (E2E).

**Dois defeitos reais achados na comparação visual e corrigidos:**

1. `viewBox` 320×170 dentro de uma faixa de 104px fazia o SVG ser encaixado por
   ALTURA — sobravam barras laterais e o carro ficava com ~60% da largura
   disponível. Corrigido alinhando a proporção do `viewBox` à da faixa e
   trocando altura fixa por `w-full`.
2. As silhuetas iniciais eram indistinguíveis entre si. Refeitas variando teto,
   comprimento, traseira e distância entre eixos — que é como uma pessoa
   distingue carrocerias de relance.

## 10. Cards

Hierarquia: etiqueta → ilustração → título → critérios → divisória → orçamento →
cidade → publicação → CTA.

- **Etiqueta** (§18): azul "Compra específica" / verde "Categoria aberta", com
  `data-intent-type` e **texto**, nunca só cor.
- **Título** (§20/§21): `Volkswagen Gol` no modo específico; `SUV até R$ 90.000`
  no aberto. Sem ano (não existe faixa) e sem modelo inventado.
- **Critérios** (§23/§53): array filtrado e unido por "•" — campo ausente não
  entra, e a **linha inteira some** se não sobrar nada. Nada de `undefined`,
  `null`, "•" órfão ou "Não informado • Não informado".
- **Sem menu de três pontos** (§19): não existe nenhuma ação do lojista sobre a
  procura alheia. Fidelidade visual não justifica controle morto.
- **Sem favoritos** (§31): não há backend.
- **Altura uniforme / CTA alinhado** (§29/§32): `flex-col h-full` + envoltório
  `mt-auto pt-4`. Nada é truncado para caber.

## 11. Orçamento

`Até` (pequeno) + `R$ 55.000` (grande, azul). Nunca "Preço", "Valor do veículo"
nem `R$ 0` — sem valor utilizável o card diz **"Sem orçamento definido"**. Há
teste de que a palavra "preço" não aparece no card (§26).

`Intl` separa "R$" do número com **NBSP** (U+00A0); `toHaveTextContent` normaliza
e esconde isso, `toBe` não. Os testes normalizam explicitamente — uma asserção
ingênua falharia mostrando duas strings visualmente idênticas.

## 12. Privacidade (§44/§54)

Nada mudou no contrato, e há prova nova nas duas pontas:

- **Backend** — o payload é varrido atrás de `buyer_user_id`, `user_id`,
  `email`, `phone`, `whatsapp`, `cpf`, `document`, **com e sem filtro aplicado**;
  e `?city_id=2` na query continua sem efeito (a cidade sai de
  `resolveDealerCityId`).
- **Frontend** — prova **estrutural**: um payload adulterado com
  `buyer_name`/`buyer_phone`/`email`/`buyer_user_id` é renderizado e o
  `outerHTML` do card é varrido atrás dos valores. Pega o que uma asserção de
  rótulo não pega.

A allowlist `DEALER_COLUMNS` segue sem `buyer_user_id`, e a query segue sem
`JOIN users`.

## 13. Desktop

| Largura | Colunas | Largura útil do card |
| --- | --- | --- |
| 1440 | **3** | ~350px |
| 1280 | **3** | ~310px |
| 1024 | **2** | ~348px |

As colunas foram escolhidas contra a largura **real da área de conteúdo**, não a
do viewport: a partir de `lg` a sidebar de 260px do `AccountPanelShell` entra.
Em 1024, três colunas dariam ~225px por card — estreito demais para o orçamento
caber em uma linha.

## 14. Mobile / tablet

- **768** → 2 colunas (sem sidebar; ~350px por card).
- **412 / 390 / 360** → 1 coluna, CTA de 44px, padding 16px.
- **Filtros no mobile** (§36): escondidos atrás de "Filtros" com contagem do que
  está oculto; painel expansível, sem sidebar horizontal. Os avançados ficam
  montados no DOM e escondidos por CSS — `display:none` tira o controle do fluxo
  E da ordem de tabulação, e evita `id` duplicado que confundiria leitor de tela
  e teste.

Zero overflow horizontal em **360 / 390 / 412 / 768 / 1024 / 1280 / 1440**
(medido por `scrollWidth <= clientWidth + 1`).

## 15. Empty / loading / erro

- **Empty** (§39): estado próprio com ícone, e **texto diferente** quando há
  filtro ativo ("Nenhuma procura ativa com esses filtros" + como desfazer). A
  barra de filtros **continua montada** — sem ela, quem filtrou até esvaziar a
  tela não teria como voltar.
- **Loading** (§40): esqueleto que espelha elemento a elemento o card real. A
  primeira versão errava **51px** de altura (figura fixa em 104px + `pt-4` do CTA
  faltando) — **defeito real pego pelo gate geométrico do E2E** e corrigido; a
  tolerância foi então apertada de 28px para 8px.
- **Erro** (§41): "Não foi possível carregar as oportunidades." + mensagem +
  "Tentar novamente". Nunca vira "0 resultados": a contagem do cabeçalho some no
  erro, no carregamento **e** no zero.

**A contagem é contada, não estimada:** vem de `summary.total`, um `COUNT(*)`
sobre a MESMA fonte da listagem (mesmos filtros). `items.length` diria "20" para
uma cidade com 53 procuras. Se o payload vier sem o campo, o cabeçalho **omite**
em vez de cair para o tamanho da página.

## 16. Testes

**Backend — `tests/purchase-intents/purchase-intents-dealer-feed.test.js` (25 novos)**

Router real montado em Express, contra `fake-db` que **lê o SQL emitido**. Cobre:
contagem vs. página, filtros um a um, rótulo acentuado convergindo para o slug,
marca com prefixo FIPE, exclusão mútua marca×carroceria, bordas inclusivas da
faixa de orçamento, filtro que **não afrouxa** cidade nem validade, os seis
valores inválidos que devem dar 400, faixa invertida, `limit` tolerante, as
quatro ordenações, ordenação atravessando a paginação, cursor de outra ordenação
recomeçando (nunca 500), e privacidade.

> **Prova de mordida:** removendo `add("pi.transmission = $?", …)` do
> repository, **2 testes falham**. O `fake-db` foi escrito para extrair o índice
> do placeholder do próprio SQL — um fake que aplicasse filtros a partir de um
> objeto continuaria verde com o filtro apagado em produção.

**Frontend (60 + 20)**

- `ActiveBuyerArt.test.tsx` (18 novos): zero `<img>`/`<image>`/`background-image`
  e a única URL tolerada é o namespace do SVG; payload com `images`/`photos`/
  `image_url` não é consumido; figura por carroceria declarada e genérico no modo
  específico; unicidade de `id` com 20 cards; `url(#…)` contido no próprio SVG;
  sem dois-pontos no id; campos nulos; orçamento e títulos dos dois modos.
- `DealerOpportunities.test.tsx` (25): esqueleto no lugar do spinner, etiquetas
  por campo, contagem do servidor, cidade lida da resposta, cada filtro
  disparando request nova, chips, "Limpar filtros", barra montada no vazio,
  marcas que não somem do seletor, **ausência** de filtro de combustível/ano, e
  a varredura estrutural de PII.
- `PurchaseIntentsPagination.test.tsx` (20): atualizado para as duas assinaturas
  (comprador recebe cursor solto; lojista recebe objeto), sem afrouxar a
  asserção de "página 1 vai sem cursor".

## 17. E2E — `frontend/e2e/active-buyers-card-grid.spec.ts` (21 testes, verdes)

Página real dentro do shell real, feed interceptado por fixture.

- 7 larguras × (overflow + densidade de colunas), contando cards que
  compartilham o mesmo `top` — geometria, não classes Tailwind;
- **CTAs da mesma linha na mesma altura** (≤1px) com títulos de alturas
  diferentes na fixture — o gate só significa algo porque a fixture mistura
  "Fiat Argo" com "Chevrolet Tracker Premier Turbo 1.0" e uma procura sem linha
  de critérios;
- título longo **não truncado** (`scrollWidth`/`scrollHeight`);
- `id` duplicado no DOM real: zero;
- zero `<img>` e zero request de imagem disparada por card;
- filtros visíveis sem clique no desktop, atrás de botão no mobile;
- filtro e ordenação aparecendo na **query string real**; "Limpar filtros"
  refazendo a busca sem filtro;
- contagem do servidor; empty; erro que não vira "0 resultados"; esqueleto
  medido contra o card;
- sidebar e header preservados; nenhum canal de contato na tela.

## 18. Screenshots

`reports/screenshots/fase-4-11c/` — os dez pedidos pelo §62:

`01-buyers-desktop-1440.png` · `02-buyers-desktop-grid.png` ·
`03-buyers-specific-card.png` · `04-buyers-category-card.png` ·
`05-buyers-budget-card.png` · `06-buyers-mobile-390.png` ·
`07-buyers-tablet-768.png` · `08-buyers-filters.png` · `09-buyers-empty.png` ·
`10-buyers-loading.png`

## 19. Diferenças inevitáveis vs. a referência

| Referência | Entregue | Por quê |
| --- | --- | --- |
| Etiqueta "Cabe no bolso" | Não existe | O domínio tem 2 modos; não há coluna de entrada/parcela. Ver **6**. |
| Etiqueta "Urgente" | Não existe como etiqueta | `purchase_timeframe` aparece na linha de critérios ("O quanto antes"). Uma quarta etiqueta no mesmo canto disputaria espaço com a etiqueta de MODO, que é a informação estruturante. |
| Filtro "Combustível" | Substituído por "Prazo de compra" | Coluna inexistente. |
| Cidade como `<select>` | Etiqueta de texto | O backend recusa cidade vinda do cliente. |
| Menu "⋮" no card | Ausente | Nenhuma ação real. |
| Coração / favoritos | Ausente | Sem backend. |
| Logo do fabricante ao lado do título | Ausente | Não há acervo de logos; marca e modelo já estão no texto. |
| Fotos realistas de veículos | Ilustrações por carroceria | §4/§6/§35 — o card não pode sugerir que existe um veículo. |
| "Toyota Corolla" com etiqueta verde | — | Incoerência da própria referência (modelo específico com etiqueta de categoria). A referência é de **layout**; os dados vêm do feed real (§43). |

Estrutura, densidade (3 colunas em 1440), proporções, hierarquia tipográfica,
paleta, cantos, sombras, posição da etiqueta, destaque azul do orçamento e CTA
azul de largura total **seguem a referência**.

## 20. Dívidas

1. **Terceiro modo de procura ("cabe no bolso")** — exige campo no formulário do
   comprador, migration e CHECK. Só então a etiqueta laranja faz sentido.
2. **Combustível e faixa de ano na procura** — habilitariam os dois filtros da
   referência que hoje não existem.
3. **Filtro por modelo** — `model_slug` existe na tabela; falta um seletor
   dependente de marca (e decidir se vale, com 27 anúncios em produção).
4. **Estado dos filtros na URL** — hoje é estado de componente. Query params
   dariam link compartilhável e sobreviveriam ao refresh (§59 admite as duas
   arquiteturas; a atual não usa URL).
5. **Prettier** — 17 arquivos das pastas tocadas seguem fora do padrão,
   **inclusive os da 4.11B e do Produto 2**, que não foram alterados aqui. É a
   dívida repo-wide já conhecida; não foi mexida para não misturar reformatação
   com revisão de conteúdo.

## 21. Regressões verificadas

| Suíte | Resultado |
| --- | --- |
| Backend (exceto `tests/integration/**`) | **205 arquivos, 3374 testes verdes** |
| `tests/integration/**` | falham por `ECONNREFUSED ::1:5433` — **sem Postgres local**, ambiental |
| Frontend unit | **215 arquivos, 3435 verdes**; 2 arquivos falhos **pré-existentes** |
| `tsc --noEmit` | limpo |
| E2E 4.11C | 21/21 |
| E2E vizinhas (hub 4.11B, detalhe 4.11A, feed Produto 2) | 65/66 |

**Os falhos pré-existentes, provados:** `app/seguranca/page.copy.test.ts`,
`app/carros-usados/regiao/[slug]/page.config.test.ts` e o teste de copy da FIPE
em `dealer-sale-opportunities-visual.spec.ts` — para os três, **tanto o teste
quanto o arquivo-fonte que ele afirma** são byte-idênticos a `origin/main`
(verificado com `git diff --quiet origin/main -- <arquivo>`). Não podem ter sido
causados por esta branch.

**Intocados:** Produto 2 (`sale_requests`, ofertas, rodadas, seleção, handoff,
agendamento, WhatsApp) §46; hub 4.11B (`OpportunityHubMetrics`, endpoint
`summary`, SVGs do hub, "Como funciona") §47; moderação 4.10A
(`blocked`, `REVALIDATE_TOKEN`, `public-ads`, admin) §48; rota de detalhe da
oportunidade e matching §45. **Zero migration.**

---

## 22. GO / NO-GO

**GO**, com a ressalva de escopo da seção **6** explicitada: a fase entrega
**dois** modos de procura porque o domínio tem dois — a terceira etiqueta da
referência não foi fabricada.

| Gate (§65) | |
| --- | --- |
| main correta · hub 4.11B intacto · sidebar e header preservados | ✅ |
| grade · 3 cards em 1440 e 1280 · 2 em 1024 e 768 · 1 no mobile | ✅ |
| visual próximo da referência · alturas iguais · CTA alinhado | ✅ |
| etiqueta por modo · específica e categoria corretas | ✅ |
| "cabe no bolso" | ⚠️ **não existe no domínio** — ver 6 e 19 |
| orçamento real · nenhum preço inventado · cidade real · data relativa | ✅ |
| sem PII · sem fotografia · ilustração por categoria · SVG sem colisão | ✅ |
| filtros funcionam · nenhum filtro fake · limpar filtros funciona | ✅ |
| empty · loading sem CLS · erro ≠ "0 resultados" | ✅ |
| detalhe, matching, Produto 2 e 4.10A intactos · zero migration | ✅ |
| componentes, backend, E2E e responsividade verdes | ✅ |
| zero regressão nova | ✅ |

**Não houve push, PR, merge nem deploy.** Aguardando revisão.
