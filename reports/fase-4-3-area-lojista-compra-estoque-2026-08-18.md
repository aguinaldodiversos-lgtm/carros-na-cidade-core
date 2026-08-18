# Fase 4.3 — Área do lojista: veículos para avaliação e propostas

**Data:** 2026-08-18
**Branch:** `codex/sale-requests-dealer-marketplace`
**Base:** `main` @ `930e10e7`
**Veredito:** **NO-GO** — um critério obrigatório não pôde ser executado neste
ambiente. Ver §24.

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

Promovida para `src/shared/account/dealer-store.js`. **Uma** implementação serve
aos dois produtos.

**Fail closed** (devolve `null` → 403 na área do lojista):

- nenhum advertiser;
- nenhum advertiser ATIVO (`COALESCE(NULLIF(BTRIM(status),''),'active')`);
- advertiser sem `city_id`;
- **mais de uma cidade distinta** entre os advertisers ativos.

**Multi-advertiser — a regra explícita que faltava:**

| Situação | Decisão | Por quê |
|---|---|---|
| Cidades **diferentes** | `null` → 403 | Escolher "a primeira" seria sortear de que cidade o lojista é, e o sorteio mudaria entre deploys |
| **Mesma** cidade, N linhas | a de **menor `id`** | A cidade — que governa a visibilidade — é inequívoca; resta escolher qual linha REPRESENTA a loja. `MIN(id)` é a mais antiga: estável entre requests, deploys e réplicas |
| Loja bloqueada em outra cidade | ignorada | Filtrada no SQL, não entra no conjunto — não vira conflito |

A ordenação vem do SQL (`ORDER BY adv.id ASC`), não de um `sort` em JS.

`resolveDealerCityId` continua exportado do Produto 1, delegando, com o mesmo
nome de ação no log. **281 testes do Produto 1 verdes antes e depois.**

---

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

**Não executado.** Ver §24.

- `docker compose -f docker-compose.test.yml` indisponível: o Docker Desktop
  falha ao iniciar neste ambiente (`initializing Inference manager ... The file
  cannot be accessed by the system`).
- Existe um PostgreSQL local na porta 5432, mas a credencial do `.env`
  (`TEST_DATABASE_URL`, porta 5433) não autentica nele.

O arquivo de integração está escrito e sintaticamente válido:
`tests/integration/sale-request-offers-concurrency.integration.test.js`.

---

## 17. E2E dois lojistas

`frontend/e2e/dealer-sale-offers.spec.ts` — escrito, tipado e listado pelo
Playwright (2 testes). **Não executado** (exige `npm run e2e:prepare`, que exige
Docker).

Cobre o §61 literalmente: PF publica → A vê e propõe 50.000 → B vê 50.000, tenta
49.000 (recusa), propõe 51.000 (aceita) → A recarrega, vê 51.000 como maior e
50.000 como a sua, e a identidade de B não aparece.

Segundo teste: lojista de outra cidade não vê o veículo.

---

## 18. Teste por mutação do lock

Última seção do arquivo de integração. Executa **à mão** a mesma sequência **sem**
`FOR UPDATE`, com uma janela de 60 ms entre ler e escrever, e **exige que a
violação apareça**:

```js
expect(
  violates,
  "a versão SEM lock respeitou a regra — o cenário não é discriminante, e os
   testes de concorrência acima estão dando confiança falsa"
).toBe(true);
```

Não testa o produto: testa o **teste**. Nada é commitado como mutação — a versão
sem lock existe só dentro daquela função.

**Não executado** pelo mesmo motivo do §16.

---

## 19. Suítes

| Suíte | Resultado |
|---|---|
| Backend afetado (`tests/sale-requests/`) | **330 / 330** |
| Backend afetado (`tests/purchase-intents/`) | **281 / 281** |
| Backend completo (`npm test`) | **3308 passed, 1 skipped, 206 arquivos** |
| Backend lint | 11 erros — **todos em `scripts/`**, nenhum arquivo desta fase; `src/` limpo |
| Frontend typecheck | **0 erros** |
| Frontend lint | **0 erros, 0 warnings** |
| Frontend afetado | Feed 23/23 · Detalhe 29/29 · Produto 1 49/49 |
| Frontend completo | 3186–3192 passed; ver a nota abaixo |
| Frontend build | **verde**, standalone verificado |
| Playwright visual/responsivo | **24 / 24** (feed + detalhe, 6 larguras cada) |
| Integração PostgreSQL | **não executado** (§16) |
| E2E dois lojistas | **não executado** (§17) |

**Armadilha de ambiente encontrada no caminho.** A primeira execução da matriz
visual do DETALHE falhou em 9 dos 24 casos com página em branco. Causa: `npm run
build` foi executado com o `next dev` ligado, e o build sobrescreveu `.next/` —
o dev server perdeu os chunks e passou a devolver 500 em toda rota **nova**
(`Cannot find module './vendor-chunks/next.js'`). O feed, já compilado antes,
continuou respondendo 200, o que fazia o sintoma parecer um defeito só do
detalhe. Depois de `rm -rf .next` e reinício do dev server: **24/24**.

Fica registrado porque o modo de falha é enganoso — a rota antiga funciona, a
nova não, e nada no código mudou.

**Nota sobre o frontend completo.** Duas classes de falha, nenhuma delas
regressão desta fase:

1. **Pré-existentes na main** — `app/seguranca/page.copy.test.ts` (2) e
   `app/carros-usados/regiao/[slug]/page.config.test.ts` (3). Verificado:
   falham igual em `main`, com o mesmo número de casos.
2. **Instabilidade por carga** — `PurchaseIntentForm`, `SaleRequestForm` e dois
   dos meus (`DealerSaleOpportunities`, `DealerSaleOpportunityDetail`) falham de
   forma **não determinística** na corrida completa (timeouts de 5–6 s) e passam
   **todos** isoladamente. O conjunto de arquivos que falha muda entre execuções.

---

## 20. Commits

```
f92dd534  refactor(dealer): promote dealer store resolution to shared
f99d5ce0  feat(sale-requests): add dealer opportunity feed
df7a1356  feat(sale-requests): add dealer preliminary offers
5a5451f8  test(sale-requests): verify dealer marketplace flow
87ae1782  refactor(sale-requests): drop dead offer helpers
<este>    docs(sale-requests): record phase 4.3 release gate
```

## 21. Branch

`codex/sale-requests-dealer-marketplace`

## 22. Ahead / behind

Ahead de `origin/main`. **Não mergeada. Não deployada.**

---

## 23. Pendências

| # | Pendência | Gravidade |
|---|---|---|
| P1 | **Teste de concorrência real não executado.** Bloqueia o GO. | Alta |
| P2 | **Teste por mutação do lock não executado.** Sem ele, não se sabe se o cenário de concorrência é discriminante. | Alta |
| P3 | **E2E dois lojistas não executado.** | Alta |
| P4 | Instabilidade da suíte de frontend sob carga (§19, item 2). Não é desta fase, mas piorou com mais dois arquivos jsdom. Vale investigar `poolOptions`/`maxConcurrency` do Vitest. | Média |
| P5 | Duas suítes de frontend já vermelhas na `main` (§19, item 1). | Média — pré-existente |
| P6 | 11 erros de lint em `scripts/` na `main`. | Baixa — pré-existente |
| P7 | A migration 055 **não foi aplicada** em banco nenhum. Precisa de release gate PostgreSQL antes de qualquer deploy. | Alta |

---

## 24. Veredito

# NO-GO

O código está completo e as suítes que **podem** rodar neste ambiente estão
verdes. O que impede o GO não é defeito conhecido — é **ausência de prova** em
três critérios que a própria especificação marcou como P0:

- §57 teste concorrente real (P1);
- §57 teste por mutação do lock (P2);
- §61 E2E com dois lojistas (P3);

e mais o release gate da migration (P7).

Declarar GO com esses quatro em aberto seria afirmar sobre serialização de
dinheiro exatamente o que não foi verificado. A regra da maior oferta está
implementada com `SELECT ... FOR UPDATE` e testada contra um fake que **não
serializa nada** — e o próprio comentário do arquivo de teste diz que um service
sem transação passaria naqueles casos.

**Para virar GO**, com PostgreSQL disponível:

```bash
npm run integration:db:up && npm run integration:db:wait
npx vitest run tests/integration/sale-request-offers-concurrency.integration.test.js
npm run e2e:prepare
npx playwright test e2e/dealer-sale-offers.spec.ts
```

Se os três passarem — incluindo a asserção de mutação, que **precisa** ver a
violação aparecer sem o lock —, os critérios restantes já estão satisfeitos e o
veredito muda.

---

## Checklist de GO

- [x] feed só mostra same-city eligible requests
- [x] multi-advertiser determinístico
- [x] nenhuma PII PF
- [x] sem WhatsApp
- [x] sem contato
- [x] cancelled fora do feed
- [x] filtros funcionam
- [x] cursor funciona
- [x] detalhe completo
- [x] NULL ≠ unknown
- [x] fotos ordenadas
- [x] FIPE correta (bug de fuso corrigido)
- [x] primeira proposta funciona
- [x] líder atual visível
- [x] identidade concorrente invisível
- [x] abaixo/igual líder recusado
- [x] aumento aceito
- [ ] **lock concorrente comprovado** ← P1
- [ ] **teste por mutação do lock funciona** ← P2
- [x] sem timer
- [x] sem estados futuros
- [x] mobile sem overflow
- [x] desktop segue shell atual
- [x] menu lateral NÃO foi pintado
- [x] testes verdes (os executáveis)
- [x] build verde
- [ ] **E2E dois dealers verde** ← P3
- [x] zero regressão nova
