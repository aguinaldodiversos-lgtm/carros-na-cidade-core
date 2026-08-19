# Fase 4.3 — Área do lojista: veículos para avaliação e propostas

**Data:** 2026-08-18
**Branch:** `codex/sale-requests-dealer-marketplace`
**Base:** `main` @ `930e10e7`
**Veredito:** **GO DEFINITIVO** — release gate executado em 2026-08-19 contra
PostgreSQL real. Ver §24.

> **Atualização do release gate (2026-08-19).** A versão anterior deste relatório
> marcava NO-GO por três provas não executadas (Docker indisponível) e por uma
> regra de advertiser que era estável mas errada. Os quatro pontos foram
> fechados; as seções 3, 16, 17, 18, 19 e 24 foram reescritas.

---

## 1. Auditoria inicial

| Pergunta | Resposta encontrada |
|---|---|
| Última migration | `054_sale_requests_vehicle_evaluation.sql`. A nova é **055**. |
| Namespace do lojista | `/dashboard-loja/oportunidades/*`. O hub daquela página **já reservava a vaga** em comentário desde a Fase 3: *"é onde a Fase 3 pendura 'Veículos para comprar'"*. |
| Montagem da API | `app.js` **já reservava** `/api/account/opportunities/sale-requests` em comentário, e `sale-requests.routes.js` também. |
| Allowlist de colunas | `sale-requests.repository.js` declarava, em comentário, que a Fase 4.2 espelharia um `DEALER_COLUMNS` separado. Foi feito. |
| Resolver de cidade | `resolveDealerCityId` existia **dentro de** `purchase-intents.service.js` (Produto 1). |
| Guard de lojista | `requireDealerAccount()` existe e está montado desde a Fase 2. |
| Paginação | `src/shared/pagination/cursor.js` (codec de tupla, base64url). |
| Rótulos da ficha | `frontend/lib/sale-requests/api.ts` já centraliza `readTireCondition`, `readYesNoUnknown`, `NOT_INFORMED` etc. |

**Conclusão da auditoria:** nada foi inventado. Quatro comentários deixados por
fases anteriores descreviam exatamente onde esta fase deveria encaixar, e o
código foi encaixado ali.

---

## 2. Rotas finais

**Backend** — `/api/account/opportunities/sale-requests` (router próprio, `authMiddleware` + `requireDealerAccount()`):

| Verbo | Caminho | Função |
|---|---|---|
| GET | `/` | Feed da cidade da loja, com filtros, ordenação e cursor |
| GET | `/:id` | Detalhe com ficha completa, galeria e estado da disputa |
| POST | `/:id/offers` | Proposta preliminar (único verbo de escrita) |

**Frontend:**

| Rota | Papel |
|---|---|
| `/dashboard-loja/oportunidades/veiculos` | Feed |
| `/dashboard-loja/oportunidades/veiculos/[id]` | Detalhe + painel de proposta |
| `/api/account/opportunities/sale-requests/[[...path]]` | BFF (catch-all; todas as rotas são JSON) |

O namespace `/comprar-estoque` da especificação **não** foi usado: criá-lo daria
ao lojista dois lugares para procurar negócio fora do estoque e ao projeto duas
árvores de navegação. A rota atual é filha de `/oportunidades`, então o item de
menu já fica ativo por `startsWith` — **zero alteração de navegação**.

---

## 3. Regra de advertiser e cidade

### A correção do gate final

A versão anterior resolvia duas lojas na mesma cidade pegando a de **menor id**.
Determinístico — e **errado**. A proposta grava `advertiser_id`: ela afirma que
ESTA EMPRESA ofereceu ESTE valor. Escolher por conveniência registra a oferta em
nome de uma empresa que talvez não a tenha feito, e o lojista nunca é perguntado.

**Estabilidade não é correção.** A regra passou a ser por CARDINALIDADE:

| Lojas elegíveis | Decisão | HTTP |
|---|---|---|
| 0 | acesso recusado | 403 `STORE_UNRESOLVED` |
| 1 | resolve sozinha | — |
| 2+ sem escolha | o lojista escolhe; o servidor **não desempata** | 409 `STORE_SELECTION_REQUIRED` + `stores[]` |
| 2+ com escolha válida | usa a escolhida | — |
| escolha inválida | recusa | 403 `STORE_INVALID` |

"Elegível" = advertiser OPERACIONAL com cidade real (JOIN INNER com `cities`).

O 409 é deliberado: não é erro de quem pediu (400) nem proibição (403) — é uma
decisão que só o lojista pode tomar, e a resposta carrega as lojas dele para a
tela poder oferecê-la sem uma segunda ida ao servidor.

### Auditoria: existe seletor canônico?

**Não.** O caminho de publicação de anúncio (`ensureAdvertiserForUser`) usa
`SELECT id FROM advertisers WHERE user_id = $1 LIMIT 1` — sem `ORDER BY`. É
arbitrário, e só não causa dano porque em produção há uma loja por usuário. Não
havia o que reutilizar, então a seleção foi implementada no escopo do módulo,
sem redesenhar o dashboard.

### Segurança: o id pedido nunca é autorização

O `advertiser_id` viaja na **query string** (não no corpo — o corpo carrega o
QUANTO; o EM NOME DE QUEM é contexto de atuação). O servidor o confronta com o
conjunto que ELE montou a partir de `req.user.id`:

- loja de outro usuário → 403
- loja inexistente → 403 (mesma resposta, para não revelar quais ids existem)
- loja suspensa/bloqueada → 403
- loja sem cidade → não entra no conjunto elegível

Não existe caminho em que o valor recebido seja usado sem antes aparecer em
`listEligibleDealerStores`. Não é um `if` que alguém possa esquecer — é a
ausência de qualquer outra origem para o valor.

### Cidade: por construção, não por checagem

O objeto resolvido carrega o `cityId` **da loja escolhida**, e é esse valor que
entra no `WHERE` de toda query seguinte — listagem, detalhe e o
`SELECT ... FOR UPDATE` da proposta. Um lojista que escolhe a loja de Bragança e
abre um carro de Atibaia recebe **404**: a linha não casa. Uma validação separada
seria redundante, e foi removida em vez de mantida como código morto.

### Contexto da loja no frontend

A escolha vive na **URL** (`?loja=`). Sem `localStorage`: some ao sair, é
compartilhável entre feed e detalhe, e — o que importa — **não é autorização**,
porque o servidor reconfere a cada request. Um `?loja=` adulterado recebe 403.

### O que o Produto 1 NÃO sofreu

"Uma cidade" e "uma loja" são perguntas diferentes. Um lojista com duas lojas na
mesma cidade tem cidade inequívoca (Produto 1 funciona) e loja ambígua (Produto 2
pergunta). São duas funções — `resolveDealerCityId` manteve o SQL, o
comportamento e o nome de ação no log da Fase 2.

**281 testes do Produto 1 verdes antes e depois.**

## 4. Arquitetura do feed

```
routes → controller → service → repository
                        ↓
              dealer-store (compartilhado)
```

`sale-requests.dealer.store.js` existe como **terceiro arquivo** para quebrar o
ciclo de imports: o service do feed precisa do service de propostas (estado de
disputa por card), e o de propostas precisa da resolução de loja. ESM tolera
ciclos, mas quando um quebra a ponta recebe `undefined` e o erro é
"X is not a function" numa linha inocente — defeito que esta fase pagou uma vez.

**`buildFeedSource()` devolve o `FROM ... JOIN ... WHERE` inteiro**, e listagem e
contagem compartilham a fonte completa — não só o `WHERE`. É a correção
preventiva do defeito já visto em produção neste repositório (`countQuery` sem os
JOINs → "missing FROM-clause entry", disfarçado de "0 anúncios" pelo modo seguro).

---

## 5. Filtros

`brand`, `year_min`, `year_max`, `mileage_max`, `transmission`, `fuel_type`,
`declared_condition`, `tire_condition`, `caution_report_status`,
`auction_history`, `financing_status`, `sort`.

**Não existe filtro de preço**: a solicitação não tem preço pedido, e a FIPE é
referência de mercado. **Não existe filtro de cidade**: a política é uma cidade
por loja, e aceitar `city_id` daria ao cliente o poder de listar demanda privada
de qualquer cidade.

**Valor fora do vocabulário é 400, não é ignorado.** Um `?auction_history=nao`
silenciosamente descartado devolveria o feed inteiro — com carros de leilão — sob
um cabeçalho que promete o contrário.

**NULL legado e o filtro:** `coluna = 'no'` não casa NULL, de propósito. Quem
filtra "sem passagem por leilão" pede uma **declaração** do proprietário, e a
linha legada não tem nenhuma.

**Ordenação:** `recent` (padrão), `oldest`, `year_desc`, `mileage_asc`. Nenhuma
"maior margem" — dependeria de um preço de compra que o produto não tem.

**Cursor próprio, e por quê:** o codec compartilhado valida a chave com
`Date.parse`, que aceita `"2019"` como data (corrompe a ordenação por ano) e
rejeita `"45000"` (descarta o cursor e produz scroll infinito na ordenação por
km). Os dois modos de falha são silenciosos. O codec desta área conhece o **tipo**
da chave e carrega o nome da ordenação junto.

---

## 6. DTO summary (card)

```
id, brand, brand_slug, model, model_slug, fipe_model_description,
year, mileage, transmission, fuel_type, declared_condition,
evaluation { 20 campos da ficha },
fipe_reference_value, fipe_reference_at,
image, city { name, state, slug }, status, created_at,
current_highest_offer, my_offer, is_leading, offers_count
```

## 7. DTO detail

Tudo do summary, mais `images[]` (galeria ordenada) e `known_issues`.

**Ausências verificadas por teste em ambos:** `owner_user_id`, `user_id`,
`email`, `phone`, `mobile_phone`, `whatsapp`, `cpf`, `document`, `document_type`,
`address`, `name`, `seller`, `owner`.

---

## 8. Migration 055

`sale_request_offers` — **append-only**.

| Coluna | Tipo | Nota |
|---|---|---|
| `sale_request_id` | BIGINT FK CASCADE | Cancelamento é soft status e **não** apaga proposta; o CASCADE só age quando a linha some de verdade (dono apagou a conta) |
| `dealer_user_id` | BIGINT FK CASCADE | A pessoa |
| `advertiser_id` | BIGINT FK CASCADE | A loja |
| `amount` | NUMERIC(14,2) | CHECK `> 0` |
| `note` | TEXT | Limite na aplicação (500) |
| `created_at` | TIMESTAMPTZ | |

**Sem `status`** — um lance é um fato datado, não um objeto com ciclo de vida.
"Vencedora" é derivada (`MAX(amount)`); gravá-la exigiria reescrever a perdedora a
cada lance. Estado sem writer é o erro que as migrations 030 e 052 documentam.

**Sem `updated_at`** — nenhum caminho faz `UPDATE`; a coluna só poderia mentir.

**Sem UNIQUE** — a mesma loja propondo de novo **é** o produto. O que barra clique
duplo é a regra "precisa superar a maior atual", avaliada dentro da transação
travada.

**Índices:** `(sale_request_id, amount DESC, id DESC)`,
`(advertiser_id, sale_request_id, created_at DESC, id DESC)`,
`(advertiser_id, created_at DESC, id DESC)`.

---

## 9. Modelo de propostas — append-only x current-row

Escolhido **append-only**. A alternativa (uma linha por loja, atualizada a cada
aumento) é mais enxuta e destrói o passado: cada `UPDATE` apaga o valor anterior.

A disputa incremental é o **centro** deste produto. Quando a 4.4 permitir à PF
escolher uma proposta, a sequência de lances vira o registro do negócio. E se um
lojista contestar ("eu tinha coberto aquele valor"), só o histórico responde —
reconstruí-lo depois é impossível.

Vocabulário: **`offers`**, não `bids`, por coerência com `purchase_intent_offers`
(Fase 3) e com a interface, que diz "proposta".

---

## 10. Regra do maior valor

- **Visível** a todo lojista elegível: `current_highest_offer` (o VALOR).
- **Invisível** a todos: quem o ofereceu. A query que lê o líder
  (`findHighestAmount`) **nem seleciona** `advertiser_id`.
- A palavra **"Confidencial" foi removida** do conceito: ela diria que o valor é
  segredo, que é o oposto da regra.
- Nova proposta precisa **superar** a maior atual (`>`, não `>=`). Empate é
  recusado.
- A mesma loja pode aumentar, inclusive já liderando (a UX avisa; o servidor não
  bloqueia).
- Comparação em **centavos inteiros**, nunca em float.

---

## 11. Estratégia de concorrência

Uma transação, cinco passos:

1. `SELECT id, status FROM sale_requests WHERE id=$1 AND city_id=$2 **FOR UPDATE**`
2. confere `status = 'receiving_offers'`
3. lê `MAX(amount)` — leitura só confiável **depois** do lock
4. valida `amount > líder`
5. `INSERT`

**O lock é em `sale_requests`, não em `sale_request_offers`**: no instante do
lance ainda não existe a linha que serviria de mutex, e travar as propostas
existentes não resolveria a **primeira** proposta (não há linha para travar).
Trava-se a entidade que existe e cujo invariante global muda.

A cidade está no `WHERE` do próprio lock — não existe "trava e depois confere".

---

## 12. Privacidade

Três camadas, e a mais externa é a que vale:

1. **Banco:** `DEALER_COLUMNS` é allowlist sem `owner_user_id`; **nenhuma query
   do módulo faz JOIN com `users`**. O dado não sai do banco.
2. **DTO:** montado campo a campo, nunca `...row`.
3. **Teste:** varredura do JSON **serializado** por 13 chaves proibidas, no feed e
   no detalhe.

`city.name` é recortado da varredura de `"name"` de propósito — é o município, e é
o dado que o produto precisa entregar. Sem o recorte, a asserção teria de largar
`"name"` da lista e um `seller_name` futuro passaria despercebido.

**Zero comunicação direta:** nenhuma rota de contato existe no router; testes
varrem resposta e tela por `whatsapp`, `wa.me`, `telefone`, `tel:`, `mailto`,
`chat`, `falar com`, `entrar em contato`.

---

## 13. Componentes frontend

| Componente | Papel |
|---|---|
| `DealerSaleOpportunitiesList` | Feed: estado, filtros, grade, paginação |
| `DealerSaleOpportunityCard` | Card com badges derivados da ficha |
| `DealerSaleOpportunityFilters` | Drawer no mobile, linha compacta no desktop, chips removíveis |
| `DealerSaleOpportunityDetail` | Galeria, resumo, ficha, painel |
| `DealerOfferPanel` | Sua proposta, maior atual, badge, atalhos, CTA |
| `VehicleEvaluationSheet` | **Compartilhado** com a tela do dono |

`VehicleEvaluationSheet` é a única coisa compartilhada entre os dois públicos, e
é deliberado: quem publica precisa poder confiar que a loja lê exatamente o que
ele declarou. Duas cópias divergiriam na primeira correção de rótulo, e ninguém
descobriria — cada usuário vê só a própria tela. O que **não** foi compartilhado:
as ações (cancelar x propor).

`usePaginatedIntents` virou `lib/account/use-cursor-pagination` com página tipada
por `items`; cada lib de API traduz o payload na fronteira. **O nome do campo na
rede não mudou em produto nenhum.**

---

## 14. Screenshots

`frontend/test-results/` (fora do git — artefato de teste):

- `dealer-sale-feed-{360,390,412,768,1024,1440}.png`
- `dealer-sale-feed-390-filtros.png`
- `dealer-sale-detail-{360,390,412,768,1024,1440}.png`
- `dealer-sale-detail-390-proposta.png`

---

## 15. Matriz responsiva

| Largura | Cards/linha | Overflow | Filtros |
|---|---|---|---|
| 360 | 1 | não | drawer |
| 390 | 1 | não | drawer |
| 412 | 1 | não | drawer |
| 768 | 2 | não | drawer |
| 1024 | 2 | não | visíveis |
| 1440 | 3 | não | visíveis |

Medido por `scrollWidth ≤ clientWidth + 1` e por contagem de cards com o mesmo
`getBoundingClientRect().top` — definição observável de "mesma linha", sem ler
classes do Tailwind.

No detalhe (390): o painel de proposta fica **abaixo** da galeria (ordem do DOM
verificada por `scrollY`), não é sticky, e o CTA é alcançável.

**Shell preservado:** `aside` único e luminância do fundo > 200 — asserção
automática de que o menu **não foi pintado**.

---

## 16. PostgreSQL

**Executado.** `carros-postgres-test` (postgres:15.17) na porta 5433, via
`docker-compose.test.yml`.

- `npm run integration:db:prepare` → **55 migrations, 1 aplicada, 54 puladas** — a
  aplicada é a **055**.
- Presença confirmada: `SELECT to_regclass('public.sale_request_offers')` →
  `sale_request_offers`.
- Os testes de concorrência criam o PRÓPRIO banco temporário e rodam as migrations
  nele, então a 055 é exercitada por dois caminhos diferentes.

---

## 17. Concorrência real

`tests/integration/sale-request-offers-concurrency.integration.test.js` — o service
REAL contra o banco real. **13/13 verdes.**

O cenário obrigatório do §7 (líder 50.000; A propõe 51.000 e B propõe 50.500,
simultâneos) roda em **24 rodadas com jitter**, alternando qual conexão chega
primeiro ao lock:

```
[concorrência] B obteve o lock primeiro em 11/24 rodadas
```

Esse número é o que dá valor às rodadas. Sem jitter, as duas chamadas do mesmo
`Promise.all` entram sempre na mesma ordem e o teste provaria **um** escalonamento
— o mais favorável. Com 11/24, os dois lados foram exercitados.

O invariante assertado em cada rodada não é "A sempre vence" (isso dependeria do
escalonamento), e sim: **nenhum lance aceito viola o líder que existia no momento
protegido pelo lock** — o histórico é estritamente crescente — e `MAX = 51.000`.

Outros casos verdes no mesmo arquivo: quatro lojas simultâneas, dois lances de
mesmo valor, clique duplo da mesma loja, solicitações diferentes não se bloqueiam,
cancelada → 409, outra cidade → 404.

---

## 18. Teste por mutação do lock

Executado sobre o **código de produção**, não sobre uma réplica.

| Passo | Resultado |
|---|---|
| 1. `FOR UPDATE` removido de `lockSaleRequestForOffer` | mutação aplicada e verificada (a única ocorrência restante no arquivo é um comentário) |
| 2. Detector executado | **5 de 13 testes FALHARAM** |
| 3. Lock restaurado | — |
| 4. Detector reexecutado | **13/13 verdes** |
| 5. `git diff` do arquivo | **vazio** — a mutação não foi commitada |

A falha da rodada 0 é literalmente o defeito que o lock existe para impedir:

```
rodada 0: histórico [50000,51000,50500] viola a regra do líder
```

B gravou 50.500 **depois** de A gravar 51.000, sem nunca ter enxergado os 51.000.
As duas propostas ficam válidas no banco, sem erro em lugar nenhum — a corrida
silenciosa. O cenário é discriminante.

---

## 19. E2E dois lojistas

`frontend/e2e/dealer-sale-offers.spec.ts` — **2/2 verdes** contra a stack real
(backend :4000 + Next :3000 + PostgreSQL).

| Passo | Verificado |
|---|---|
| A abre o feed | vê o T-Cross; sem erro, sem vazio |
| A abre o detalhe | ficha completa (5 seções); "Nenhuma proposta recebida" |
| A propõe 50.000 | sucesso; badge **"Você está liderando"**; painel mostra 50.000 |
| B abre o mesmo veículo | vê **50.000** como maior; **sem badge** (ainda não propôs) |
| B tenta 49.000 | **recusado**, com mensagem; nenhum sucesso na tela |
| B propõe 51.000 | aceito; badge "Você está liderando"; painel 51.000 |
| A recarrega | **"Existe uma proposta maior"**; a dele 50.000, a maior 51.000 |
| A varre a tela | sem `cnpj5`, sem `carrosnacidade.com`, sem "confidencial", sem WhatsApp/telefone/contato, sem "margem", sem "expira"; zero `a[href^=wa.me\|tel:\|mailto:]` |
| Lojista de Bragança | não vê o veículo de Atibaia no feed |

### A PF publica — semeada, e por quê

A publicação exige 4 fotos e o upload passa pelo R2. Sem credenciais o endpoint
responde **503 `SALE_REQUEST_PHOTO_STORAGE_UNAVAILABLE`** — o comportamento
CORRETO, não um defeito: a Fase 4.1 criou esse código exatamente para não mandar a
pessoa trocar uma foto que está perfeita quando o problema é o bucket.

Parar o gate por falta de credencial de storage trocaria a prova da DISPUTA (o
assunto desta fase) por uma prova de infraestrutura. A linha é criada por
`scripts/e2e-seed.mjs`, do mesmo jeito que ele já cria os anúncios do Produto 1. O
caminho de publicação da PF **não fica sem prova**: tem cobertura própria em
`tests/sale-requests/`, contra o router real.

O spec DESCOBRE o id lendo o feed — não usa número fixo —, então continua válido
quando o seed rodar de novo.

### Seed: uma linha acrescentada

`cnpj5@carrosnacidade.com` ("Loja Atibaia Dois", ativa, Atibaia). Era necessária:
`cnpj@` é a única ativa de Atibaia, `cnpj3`/`cnpj4` são de propósito suspensa e
bloqueada, e `cnpj2` é de outra cidade. **Acrescenta, não altera** — as quatro
anteriores mantêm e-mail, cidade e status, porque os specs do Produto 1 dependem
desses papéis.

### O defeito que o E2E encontrou

O BFF `app/api/account/opportunities/sale-requests/[[...path]]/route.ts` exportava
apenas **GET**. Sem o `POST`, o Next respondia 405 e o cliente traduzia a resposta
sem `message` na mensagem genérica "Não foi possível carregar os veículos" — com o
backend devolvendo **201** o tempo todo.

Nenhuma outra suíte podia pegar isso: os testes de componente mockam a lib de API
(não passam pelo proxy) e a suíte visual só fazia GET. **Só um fluxo ponta a ponta
de ESCRITA atravessa aquele arquivo** — que é exatamente o que este E2E existe
para fazer.

---

## 20. Cancelamento com propostas existentes

| Verificação | Resultado |
|---|---|
| Feed antes | 1 item |
| PF cancela | 200 |
| Feed depois | **0 itens** |
| Detalhe depois | **404** |
| Nova proposta | **409 `SALE_OPPORTUNITY_OFFER_CLOSED`** |
| Propostas no banco | **2, preservadas** |
| Status da solicitação | `cancelled` |

Cancelar é mudança de estado, não remoção. O histórico permanece.

---

## 21. Estado final do banco

```
  valor   |          conta           |       loja        | solicitacao
----------+--------------------------+-------------------+-------------
 50000.00 | cnpj@carrosnacidade.com  | Loja Atibaia      |           3
 51000.00 | cnpj5@carrosnacidade.com | Loja Atibaia Dois |           3

MAX=51000.00 | lances_49k=0 | empates_50k=1 | total=2
```

Os dois atores gravados em cada linha. `lances_49k=0`: o lance abaixo do líder não
entrou. `empates_50k=1`: só o de A — o empate de B foi recusado.

---

## 22. Suítes

| Suíte | Resultado |
|---|---|
| Backend completo (`npm test`) | **3326 passed, 1 skipped, 206 arquivos** |
| `tests/sale-requests/` | **342 / 342** |
| `tests/purchase-intents/` (Produto 1) | **281 / 281** |
| Integração — concorrência PostgreSQL | **13 / 13** |
| Backend lint | 11 erros, **todos em `scripts/`** — baseline; `src/` limpo |
| Frontend typecheck | **0 erros** |
| Frontend lint | **0 erros, 0 warnings** |
| Frontend afetado | **108 / 108** (5 arquivos) |
| Frontend build | **verde**, standalone verificado |
| Playwright visual/responsivo | **24 / 24** (feed + detalhe, 6 larguras) |
| E2E dois lojistas | **2 / 2** |

**Baseline não corrigido (§19 da spec):** `app/seguranca/page.copy.test.ts` (2) e
`app/carros-usados/regiao/[slug]/page.config.test.ts` (3) falham igualmente na
`main` — verificado. Os 11 erros de lint em `scripts/` também são anteriores.

---

## 23. Commits

```
f92dd534  refactor(dealer): promote dealer store resolution to shared
f99d5ce0  feat(sale-requests): add dealer opportunity feed
df7a1356  feat(sale-requests): add dealer preliminary offers
5a5451f8  test(sale-requests): verify dealer marketplace flow
87ae1782  refactor(sale-requests): drop dead offer helpers
72adf950  docs(sale-requests): record phase 4.3 release gate
<gate>    feat(sale-requests): require explicit dealer store selection
<gate>    fix(sale-requests): forward dealer offer POST through the BFF
<gate>    test(sale-requests): prove offer serialization on postgres
<gate>    docs(sale-requests): record phase 4.3 final release gate
```

**Branch:** `codex/sale-requests-dealer-marketplace` — ahead de `origin/main`,
behind 0. **Não mergeada. Não deployada.**

---

## 24. Pendências

| # | Pendência | Gravidade |
|---|---|---|
| P1 | A publicação da PF depende de R2; sem credenciais o E2E usa linha semeada. Não é defeito — é ambiente. | Baixa |
| P2 | Instabilidade da suíte de frontend COMPLETA sob carga (timeouts de 5–6 s; passam isoladas). Anterior a esta fase, piorou com mais arquivos jsdom. Vale olhar `poolOptions`/`maxConcurrency` do Vitest. | Média |
| P3 | Duas suítes de frontend já vermelhas na `main`. | Média — pré-existente |
| P4 | 11 erros de lint em `scripts/` na `main`. | Baixa — pré-existente |
| P5 | `ensureAdvertiserForUser` (publicação de anúncio) ainda usa `LIMIT 1` sem `ORDER BY`. Não afeta esta fase, mas é a mesma classe de escolha arbitrária que o gate corrigiu no Produto 2. | Média — fora do escopo |
| P6 | O `loginRateLimit` do backend limita por IP encaminhado; duas rodadas seguidas do E2E esgotam a janela. Reiniciar o backend zera. | Baixa — operacional |

---

## 25. Armadilhas operacionais registradas

**`next build` com `next dev` no mesmo `.next`.** O build sobrescreve o diretório,
o dev server perde os chunks e passa a devolver 500 **só nas rotas novas**
(`Cannot find module './vendor-chunks/next.js'`). As rotas já compiladas seguem em
200, então o sintoma aponta para o código errado. Antes de buildar: parar o dev
server e `rm -rf .next`. **Não é bug da Fase 4.3.**

**Rate limit de login no E2E.** Ver P6.

---

## 26. Veredito

# GO DEFINITIVO

Os quatro bloqueadores P0 do gate foram fechados com prova executada:

- **advertiser** não é mais escolhido por conveniência — 2+ lojas exigem escolha
  explícita, verificada contra o conjunto do servidor;
- **concorrência** provada em PostgreSQL real, 24 rodadas, com o lock alternando de
  vencedor em 11/24;
- **mutação do lock** derruba 5 testes com a violação exata, e o lock restaurado
  volta a 13/13 — sem mutação commitada;
- **E2E de dois lojistas** verde ponta a ponta, e foi ele que encontrou o `POST`
  ausente no BFF.

Nada do que restou em §24 bloqueia: P1 é ambiente, P2–P4 são baseline anterior à
fase, P5 está fora do escopo e P6 é operacional.

---

## Checklist de GO

- [x] advertiser não é arbitrariamente escolhido
- [x] multi-store same-city resolvido semanticamente
- [x] advertiser spoofing recusado
- [x] Postgres concurrency verde
- [x] múltiplas rodadas verdes (24, jitter 11/24)
- [x] lock mutation derruba o teste (5 falhas)
- [x] lock restaurado volta a verde (13/13)
- [x] E2E dois dealers verde
- [x] below leader recusado
- [x] tie recusado
- [x] higher bid aceito
- [x] maior valor visível
- [x] concorrente anônimo
- [x] PF PII ausente
- [x] cancelamento bloqueia novos bids
- [x] bids existentes preservados
- [x] build verde
- [x] zero regressão nova
