# Fase 4.4 — Propostas recebidas + seleção preliminar da loja
## + Fase 4.4.1 — Hardening de integridade referencial

**Data:** 2026-08-21
**Branch:** `codex/sale-request-owner-offer-selection` *(confirmada por
`git branch --show-current`; nenhuma outra branch com nome parecido existe,
local ou remota)*
**Base SHA:** `9f3ffd92ddf41b027ac8515787f35f8061f82751` (main, Fase 4.3.3 mergeada)

> **Veredito: GO técnico** para 4.4 **e** 4.4.1, com as ressalvas de ambiente da
> §Regressões (todas pré-existentes e comprovadamente alheias a estas fases).
>
> A seção **[Hardening 4.4.1](#hardening-441--a-integridade-passou-a-ser-do-banco)**
> está no fim deste documento. As seções 1–17 descrevem a 4.4 e continuam
> válidas — a 4.4.1 não redesenhou nada delas.

---

## 1. Auditoria read-only (§1)

Feita **antes** de qualquer alteração de código. O que foi encontrado, e o que
cada achado decidiu:

| Item auditado | Estado encontrado | Consequência para esta fase |
|---|---|---|
| Schema `sale_requests` | migration 052; `status` com `CHECK IN ('receiving_offers','cancelled')` | precisou de DROP/ADD do CHECK, não de tabela nova |
| Migration mais recente | `056_sale_request_minimum_accepted_price.sql` | a nova é a **057** |
| `sale_request_offers` (055) | APPEND-ONLY, sem `status`, sem `UNIQUE`, sem `updated_at` | preservada intacta; "proposta atual" é derivada |
| Repositório do dono | `sale-requests.repository.js`, allowlist `OWNER_COLUMNS`, posse no `WHERE`, `exec` injetável | padrão seguido no módulo novo |
| Repositório do lojista | `sale-requests.dealer.repository.js`, `DEALER_COLUMNS`, cidade no `WHERE`, **sem JOIN em `users`** | privacidade é estrutural; mantida |
| Service de ofertas | `createSaleOffer` com `withTransaction` + `SELECT … FOR UPDATE` em `sale_requests` | a seleção trava **a mesma linha** → §13 resolvido pelo mecanismo existente |
| DTO owner / dealer | montados campo a campo, nunca `...row` | serializadores novos seguem a mesma disciplina |
| Regra de cancelamento | `UPDATE … AND status='receiving_offers'`; sem match → **200 idempotente** | **defeito latente**: cancelar após seleção responderia sucesso falso → endurecido (§14) |
| `NOTIFICATION_EVENT_TYPE.SALE_REQUEST_BID_SELECTED` | **JÁ EXISTIA** (`"sale_request.bid_selected"`) | reutilizado; nenhum evento duplicado criado |
| `createUserNotification` | idempotente por `(recipient_user_id, idempotency_key)`; **NÃO aceitava exec/client** | estendido de forma retrocompatível (§22) |
| `SALE_REQUEST_CODE.NOT_CANCELLABLE` | existia **sem nenhum consumidor** desde a 4.1 | ganhou consumidor real nesta fase |
| Resolução advertiser/store | `resolveDealerStoreSelection` (cardinalidade 0/1/N) | inalterada |
| "Proposta atual" por advertiser | `findCurrentOfferForAdvertiser` = a **mais recente**, não a maior | é a **única** definição; reusada pela seleção |

**Dois achados não previstos pela especificação:**

1. **`tests/integration/sale-requests-schema.integration.test.js` estava vermelho
   desde a Fase 4.3** — a asserção "não existe tabela de lances" é de 17/08 e a
   migration 055 (`sale_request_offers`) é de 18/08. Corrigido nesta fase,
   preservando a intenção original (pegar tabela de fase futura sem writer).
2. **`users.plan` NOT NULL desde a migration 002** faz
   `migrations-compat.integration.test.js` falhar — pré-existente, sem relação
   com este trabalho (o diff não toca `users`).

---

## 2. Migration `057_sale_request_offer_selection.sql`

> **Atualizado pela 4.4.1.** Os itens 2 e 6 abaixo descrevem a forma FINAL, já
> endurecida. Os itens marcados *(4.4.1)* mudaram depois desta seção ter sido
> escrita — o raciocínio completo está na seção
> [Hardening 4.4.1](#hardening-441--a-integridade-passou-a-ser-do-banco).

Seis blocos, nesta ordem:

1. **Colunas** `selected_offer_id BIGINT` e `selected_offer_at TIMESTAMPTZ` em
   `sale_requests`. Ambas nullable, **sem DEFAULT** — um `DEFAULT NOW()` faria a
   data ser sobre a criação da linha, não sobre a decisão.
2. *(4.4.1)* **Chaves candidatas compostas** em `sale_request_offers`:
   `UNIQUE (id, sale_request_id)` e `UNIQUE (id, sale_request_id, advertiser_id)`.
   Não existem pela unicidade (a PK já a garante) — existem porque o PostgreSQL
   exige que o alvo de uma FK seja coberto **exatamente** por PK ou UNIQUE.
3. *(4.4.1)* **FK COMPOSTA** `sale_requests_selected_offer_fk`:
   `(selected_offer_id, id) → sale_request_offers (id, sale_request_id)`, **sem
   `ON DELETE`** (NO ACTION). Prova PERTENCIMENTO, não só existência: a FK
   simples aceitava selecionar a oferta de outra solicitação. `MATCH SIMPLE`
   (padrão) é obrigatório aqui — com `MATCH FULL`, toda linha sem seleção seria
   rejeitada.
   Consequência **aceita**: o banco recusa apagar `users`/`advertisers` de um
   lojista com proposta selecionada. Verificado que **não existe
   `DELETE FROM users` nem `DELETE FROM advertisers` em `src/`**.
4. **CHECK de status** — DROP/ADD, pelo padrão que a migration 030 descreve:
   `receiving_offers | offer_selected | cancelled`.
5. **CHECK de coerência** — bi-implicação:
   `offer_selected` ⟺ (`selected_offer_id` **e** `selected_offer_at` preenchidos).
   Torna **inexprimíveis** os três estados contraditórios. Entra sem `NOT VALID`
   porque toda linha legada satisfaz a segunda metade. **Inalterado pela 4.4.1.**
6. **Tabela `sale_request_offer_selections`** — append-only, com
   `UNIQUE (sale_request_id)`, `CHECK (amount_snapshot > 0)` e índice
   `(advertiser_id, selected_at DESC, id DESC)`.
   *(4.4.1)* Quatro FKs, **nenhuma com `ON DELETE`** — CASCADE numa trilha
   auditável a faria sumir em silêncio exatamente quando fosse consultada. Uma
   delas é **tripla**: `(offer_id, sale_request_id, advertiser_id) →
   sale_request_offers (id, sale_request_id, advertiser_id)`, e substitui a FK
   simples de `offer_id`.

**Sem `updated_at`, sem `status`, sem `cancelled_at`** — a tabela nunca sofre
UPDATE nem DELETE, e uma coluna dessas só poderia mentir.

### Por que estado *e* trilha

| Pergunta | Respondida por |
|---|---|
| "qual é a proposta escolhida **agora**?" | `sale_requests.selected_offer_id` (estado, caminho quente) |
| "o que **aconteceu**?" | `sale_request_offer_selections` (evento datado, valor congelado) |

Só o estado destruiria a segunda pergunta no dia em que uma fase permitisse
trocar de loja. Só o evento obrigaria as quatro leituras de tela a agregar o
histórico, com quatro chances de divergir.

---

## 3. Novo status

`offer_selected` — e não `selected`, que a 052 previu em comentário. "Selecionado"
sozinho não diz **o quê**, e a 4.5 vai selecionar outra coisa (a avaliação
presencial); um estado chamado `selected` obrigaria a fase seguinte a inventar
`selected_2` ou renomear valor em produção.

Cada um dos três estados tem writer real: o INSERT da publicação, a transação de
seleção, e `cancelForOwner`. Nenhum estado de fase futura foi criado.

---

## 4. Endpoint

```
POST /api/account/sale-requests/:id/select-offer
Body: { "offer_id": "18" }
```

- **POST, não PATCH** — a escolha é um fato novo (linha na trilha), não a edição
  de um campo. **200, não 201** — o recurso que o cliente conhece continua sendo
  a solicitação, e a resposta descreve o estado novo dela.
- Resposta: `{ success, selected: {...}, changed: boolean }`.
- **Só `offer_id` é lido do corpo.** `owner_user_id` sai do Bearer; `advertiser_id`
  e `amount` são derivados da própria oferta **dentro** da transação. O valor
  nunca vem do cliente — mandá-lo permitiria congelar na trilha um número que
  loja nenhuma ofereceu.
- Sem rate limit próprio: a transição é única, então do segundo request em diante
  a resposta é 200 idempotente ou 409, sem escrita e sem notificação.
- BFF: `frontend/app/api/account/sale-requests/[id]/select-offer/route.ts`
  (proxy puro, não lê nem reescreve o corpo).

---

## 5. A transação (§10)

`selectSaleRequestOffer` — **onze passos, uma única transação**, e a ordem é a regra:

1. `SELECT … FOR UPDATE` em `sale_requests`, já escopado ao **dono**;
2. não casou → **404** (não existe / é de outra pessoa — a mesma resposta);
3. `cancelled` → **409 `SALE_REQUEST_SELECTION_CLOSED`**;
4. `offer_selected` → mesma oferta: **200 idempotente**; outra: **409 `ALREADY_SELECTED`**;
5. carrega a oferta **provando** que é desta solicitação (`sale_request_id` no `WHERE`);
6. lê a proposta **atual** daquela loja (`findCurrentOfferForAdvertiser`, o mesmo helper do resto do domínio);
7. não é a atual → **409 `SALE_REQUEST_OFFER_STALE`** + `current_amount`;
8. INSERT na trilha (`ON CONFLICT (sale_request_id) DO NOTHING`);
9. UPDATE do estado (`AND owner_user_id` **e** `AND status='receiving_offers'` repetidos no `WHERE`);
10. notificação **no mesmo cliente**;
11. commit.

**Nenhuma leitura de critério acontece fora do lock.** O passo 4 vem antes do 5 de
propósito: um retry de rede sobre uma seleção bem-sucedida precisa responder
sucesso *antes* de qualquer revalidação — senão dependeria de a oferta continuar
sendo a atual, e a pessoa veria "esta proposta não é mais a atual" para uma ação
que já deu certo.

### Por que o lock é o mesmo da proposta

A proposta (4.3) trava `sale_requests` escopada à **cidade**; a seleção trava
`sale_requests` escopada ao **dono**. Como é a **mesma linha**, o PostgreSQL
serializa as duas — e é isso, e só isso, que torna o §13 impossível. Se cada lado
travasse uma linha diferente, as duas transações rodariam em paralelo.

---

## 6. Idempotência e detecção de obsolescência

| Cenário | Resposta |
|---|---|
| Retry da **mesma** seleção | **200**, `changed: false`, sem segunda trilha e sem segunda notificação |
| Dois retries **simultâneos** da mesma seleção | ambos **200**, um evento, uma notificação |
| Selecionar **outra** proposta depois | **409 `SALE_REQUEST_ALREADY_SELECTED`** |
| Oferta **obsoleta** da mesma loja | **409 `SALE_REQUEST_OFFER_STALE`** + `details.current_amount` |
| Oferta de **outra** solicitação / inexistente | **404 `SALE_REQUEST_OFFER_NOT_FOUND`** |
| Solicitação **cancelada** | **409 `SALE_REQUEST_SELECTION_CLOSED`** |
| `offer_id` ausente / malformado | **400**, `details.field = "offer_id"` |

O handler de 404 do router do dono passou a **propagar `details.code`** quando ele
existe. Sem isso `OFFER_NOT_FOUND` seria uma constante que nenhum cliente veria.
Os 404 sobre a **solicitação** continuam sem código e indistinguíveis entre si —
a propriedade que protege quem sonda ids permanece intacta.

---

## 7. Notificação (§21, §22)

- Evento **reutilizado**: `NOTIFICATION_EVENT_TYPE.SALE_REQUEST_BID_SELECTED`
  (`"sale_request.bid_selected"`) — já existia, nenhum duplicado criado.
- Destinatário: **`dealer_user_id` da oferta selecionada**. Concorrentes não
  recebem nada.
- Título: *"Sua proposta foi selecionada"*. Corpo: *"Uma proposta enviada por sua
  loja foi selecionada pelo proprietário."* Nenhum dado da PF; nenhuma promessa
  de conclusão.
- `actionPath`: `/dashboard-loja/oportunidades/veiculos/{id}`.
- Chave idempotente determinística:
  `sale-request:{requestId}:offer-selected:{offerId}`.

**Atomicidade real, não fingida.** `insertNotification(input, exec)` e
`createUserNotification(input, { exec })` ganharam um executor **opcional** —
retrocompatível: nenhum call site existente mudou, e os produtores best-effort da
Fase 2 continuam gravando fora de transação, como devem. A notificação da seleção
entra na **mesma** transação:

- rollback da seleção → **nenhuma** notificação persistida (provado por gatilho
  no PostgreSQL real);
- retry idempotente → **nenhuma** duplicata.

A troca aceita: uma falha de notificação derruba a seleção. É a troca certa — a
seleção pode ser refeita com um clique, e o aviso perdido não pode ser recuperado
por ninguém.

---

## 8. DTOs

### Owner (§23) — `proposals[]`

Allowlist explícita, montada campo a campo, **nunca `...row`**:

```
id · store_name · store_city · amount · created_at · is_highest
```

**Fora** (e a query nem seleciona `dealer_user_id` nem `note`):
`advertiser_id`, `dealer_user_id`, `note`, e-mail, telefone, CNPJ, documento,
histórico bruto de lances. Há teste de **igualdade de conjunto** nas chaves: uma
coluna nova acrescentada à query faz o teste falhar em vez de vazar.

`is_highest` é **derivado da posição** (a lista vem ordenada por `amount DESC,
id DESC`), para que marcação e ordenação nunca discordem.

Loja com `name` vazio (legado em produção) vira `"Loja parceira"` — nunca cai
para `advertiser_id`.

### Dealer (§24) — `is_selected` / `selected_amount` / `selected_at`

Presente em **todo** detalhe (`false` enquanto a disputa está aberta), para que a
tela não precise distinguir "não selecionada" de "campo ausente".

Chegar com `is_selected: true` já significa, **por construção da query**, que a
loja é a escolhida. Não há — e não deve passar a haver — campo dizendo *quem*
ganhou: a única resposta possível para quem recebe o bloco é "você".

---

## 9. Privacidade (§25)

| Verificação | Resultado |
|---|---|
| Payload do lojista sem `seller_*`, `owner_user_id`, WhatsApp, telefone, e-mail, CPF, endereço, documento | ✅ service + integração |
| Garantia **estrutural**: `DEALER_COLUMNS` não seleciona, e nenhuma query do módulo faz JOIN em `users` | ✅ inalterado |
| Payload do proprietário sem `advertiser_id`, `dealer_user_id`, `note`, e-mails das lojas | ✅ service + integração |
| Chaves da proposta = allowlist exata | ✅ igualdade de conjunto |
| Nada de contato revelado **depois** da seleção, dos dois lados | ✅ E2E varre o `innerText` da página inteira |
| Loja perdedora: 404 sem nenhuma palavra sobre o desfecho | ✅ |

---

## 10. Concorrência — PostgreSQL real

Suíte: `tests/integration/sale-request-offer-selection.integration.test.js` —
**33 testes, todos verdes**. Todos os cenários de corrida rodam em **loop com
jitter** (6 a 8 rodadas, `delayMs` variando quem chega primeiro ao lock), porque
uma única execução provaria um escalonamento só — o mais favorável.

| § | Cenário | Invariante provado |
|---|---|---|
| §12 | seleção × seleção (lojas diferentes) | exatamente **uma** vence; a outra recebe 409; **uma** linha na trilha; `selected_offer_id` **igual** ao `offer_id` da trilha; **uma** notificação |
| §13 | seleção × nova proposta da mesma loja | aumento primeiro → seleção cai com `OFFER_STALE`; seleção primeiro → proposta cai com `OFFER_CLOSED`. **Em nenhum desfecho** existe seleção apontando para oferta que já não é a atual |
| §14 | seleção × cancelamento | estado final é `offer_selected` **ou** `cancelled`, nunca um terceiro; se selecionou, o cancelamento devolve **409 `NOT_CANCELLABLE`** (não mais o sucesso silencioso); se cancelou, não há trilha nem notificação |
| §11 | dois retries simultâneos da mesma seleção | ambos 200, um evento, uma notificação |
| §22 | rollback | gatilho no `INSERT` de `user_notifications` derruba a transação → **estado, trilha e notificação somem juntos**, e a solicitação continua utilizável (retry funciona) |

### Teste por mutação do lock

A última seção executa **à mão** a mesma sequência **sem `FOR UPDATE`** e exige
que a violação apareça: as duas transações passam da checagem de estado, e a
arbitragem cai no `UNIQUE` do banco — a segunda morre com erro de constraint em
vez de um 409 legível. Sem essa prova, os testes acima poderiam estar passando
por sorte de escalonamento e continuariam passando no dia em que alguém removesse
o lock.

### Migration em banco povoado (§27.2)

Segundo banco temporário: roda migrations → **desfaz a 057** → insere dados
anteriores à regra (abertas *e* cancelada, com propostas) → **reaplica**. Prova
que o CHECK de coerência (adicionado **sem `NOT VALID`**, portanto varrendo a
tabela) não falha no primeiro banco com dados — que é o de produção.

---

## 11. UI

### Proprietário (§16, §17, §18)

- Seção **"Propostas recebidas"** posicionada **acima da ficha** — a ficha é o que
  a pessoa já preencheu; as propostas são a novidade e a única decisão dela.
- **Uma linha por loja**: nome comercial, cidade/UF, valor em destaque, selo
  "Maior proposta" na primeira, e o **mesmo botão, com o mesmo peso**, em todas.
  Nenhuma desabilitada, nenhuma "recomendada", nenhum aviso ao escolher a menor.
- **Diálogo acessível**: `role="dialog"`, `aria-modal`, `aria-labelledby` /
  `aria-describedby`, foco inicial em **"Voltar"** (a saída não destrutiva),
  `Escape` fecha, ciclo de Tab preso ao painel, foco devolvido ao botão que abriu.
  O valor é **repetido** no diálogo — no celular o cartão sai da tela entre tocar
  e confirmar.
- **Copy**: "novas propostas serão encerradas" + "Esta seleção é preliminar" + "o
  valor ainda poderá ser revisto após a avaliação presencial". Teste explícito
  proibindo *"venda concluída"*, *"oferta aceita"*, *"pagamento garantido"*,
  *"negócio fechado"*, *"parabéns"*.
- **Pós-seleção**: painel com loja, cidade, valor, selo **"Aguardando próxima
  etapa"**, e o texto explicativo. As perdedoras **somem**. O botão de cancelar
  **desaparece** (não fica desabilitado — a reversão não existe, e um botão inerte
  prometeria que existe).
- **Badge de status**: ganhou um terceiro tratamento, para não usar o mesmo cinza
  apagado de "Cancelada". O tom foi **medido, não escolhido no olho**: o primeiro
  candidato (`#EFF4FF`) computava `rgb(239,244,255)` contra um fundo de
  `rgb(242,243,247)` — três pontos de diferença em dois canais, e a pílula sumia,
  sobrando só o texto azul solto. `#D1E0FF` / `#1849a9` resolve as duas coisas
  (forma visível + ~6:1 de contraste no texto, sobre o mínimo de 4,5:1).

### Lojista (§19, §20)

- Loja **escolhida**: painel "Sua proposta foi selecionada" + valor selecionado +
  "Aguarde as próximas etapas pela plataforma". O **formulário não existe** — não
  está desabilitado. O subtítulo do cabeçalho e a linha de estado acompanham.
- Loja **perdedora**: **404**, o mesmo de sempre. A oportunidade sai do feed.

---

## 12. Screenshots

`reports/screenshots/fase-4-4/`

| Arquivo | O que mostra |
|---|---|
| `01-owner-propostas-desktop.png` | duas propostas atuais, selo "Maior proposta", botões iguais |
| `02-owner-propostas-mobile-390.png` | mesma seção em 390px, empilhada, sem overflow |
| `03-owner-dialogo-confirmacao.png` | diálogo na proposta **menor** (R$ 65.000), copy preliminar |
| `04-owner-dialogo-mobile-390.png` | diálogo em 390px |
| `05-owner-proposta-selecionada.png` | estado pós-seleção do proprietário |
| `06-lojista-selecionado.png` | tela read-only da loja escolhida |
| `08-owner-badge-selecionada.png` | recorte do badge de status, depois da correção de contraste |

Todas refletem o estado **final** do código, inclusive os dois ajustes de UI
feitos ao revisar as primeiras capturas (subtítulo do lojista escolhido e
contraste do badge).

> A sétima captura planejada (loja perdedora sem acesso) **não foi gerada**: o
> `loginRateLimit` (10 logins/IP a cada 15 min) esgotou durante a sessão de
> capturas. O cenário está coberto por teste de service, teste de integração
> PostgreSQL e pelo E2E — que verifica os dois lados: a tela de erro e o 404 da
> API.

---

## 13. Testes

### Unitários / service (§26) — `tests/sale-requests/sale-requests-offer-selection.test.js`

**37 testes**, contra os routers reais (dono **e** lojista, no mesmo app Express):

- uma proposta atual por advertiser; histórico não duplica na tela; histórico
  **permanece** no banco;
- ordenação por valor e marcação da maior; nome comercial e cidade;
- loja sem nome vira "Loja parceira" e **não** expõe id interno;
- pode selecionar a maior; **pode selecionar a menor** (§28); selecionar a menor
  não é erro;
- oferta de outra solicitação / inexistente / obsoleta / dono errado / cancelada;
- `offer_id` ausente e `offer_id` com prefixo numérico (`"2abc"` não age sobre a 2);
- retry idempotente; segunda seleção diferente → 409;
- notificação: destinatário certo, concorrente não notificado, chave determinística,
  copy sem promessa nem contato, `action_path` correto;
- pós-seleção: nenhum lojista propõe — **nem o selecionado**;
- lojista selecionado vê read-only; perdedor recebe 404 mudo; sem contato da PF;
- cancelamento após seleção → 409; cancelamento antes continua idempotente.

O `fake-db` foi estendido re-implementando de verdade — não simulando — o
`DISTINCT ON (advertiser_id)`, o `ON CONFLICT` do UNIQUE da trilha, as três
cláusulas do `WHERE` do UPDATE, a condição dupla de visibilidade do lojista e o
índice único de idempotência das notificações. Apagar qualquer uma dessas regras
do código de produção faz um teste **diferente** falhar.

### Integração PostgreSQL (§27) — 33 testes

Schema (colunas, tipos, ausência de DEFAULT, FKs, UNIQUE, os três CHECKs de
coerência), upgrade em banco povoado, caminho feliz, seleção da menor, igualdade
entre "proposta atual da lista" e "proposta atual da transação", todas as recusas,
idempotência sequencial e concorrente, as três corridas com jitter, atomicidade e
rollback da notificação, visibilidade pós-decisão, privacidade nos dois sentidos,
e o teste por mutação do lock.

### Componentes — `frontend/components/account/SaleRequestProposals.test.tsx`

**20 testes**: lista, ordem, selo único, todos os botões habilitados, estado
vazio, seção ausente em cancelada, diálogo (abre antes de agir, copy preliminar,
copy proibida, valor repetido, a11y, Escape, foco devolvido), envio (só id da
oferta — **valor não trafega**), seleção da menor sem atrito extra, estado
pós-seleção sem contato, botão de cancelar ausente, rótulo "Proposta selecionada",
e os dois caminhos de erro (obsoleta recarrega; outra fica no diálogo).

### E2E (§29) — `frontend/e2e/sale-request-offer-selection.spec.ts`

**1 teste, verde (1,5 min)**, backend real + PostgreSQL real + duas contas de loja:

1. loja A propõe 65.000; loja B propõe 67.000;
2. PF abre e vê **duas** propostas atuais, a maior primeiro e marcada;
3. PF escolhe **deliberadamente a menor**;
4. diálogo com a copy preliminar e sem promessa de conclusão;
5. estado vira "Proposta selecionada"; perdedoras somem; cancelar some;
6. **reload** confirma que o estado é do banco, não da tela;
7. **responsivo em 360 / 390 / 412 / 768 / 1024 / 1440 — zero overflow horizontal**
   (tolerância de 1px para arredondamento de subpixel);
8. loja A vê "Sua proposta foi selecionada", sem formulário; oportunidade fora do feed;
9. loja B recebe 404 na tela **e** na API; POST de proposta recusado;
10. varredura de contato em cada tela: nenhum e-mail, telefone ou WhatsApp.

---

## 14. Regressões

| Suíte | Resultado |
|---|---|
| `npm test` (backend, 210 arquivos) | ✅ **3395 passando**, 1 skip |
| `tests/sale-requests/` | ✅ **417 passando** |
| Integração da fase | ✅ **33 passando** |
| Integração vizinha (offers-concurrency, minimum-price, schema, concurrency 4.1) | ✅ **91 passando** após corrigir a asserção desatualizada da 4.3 |
| `frontend typecheck` | ✅ limpo |
| `frontend lint` | ✅ limpo |
| `backend lint` | 11 erros — **todos em `scripts/`**, nenhum em `src/`, pré-existentes |
| `frontend npm test` | 3227 passando / 6 falhas |

**As 6 falhas do frontend, uma a uma:**

- `app/seguranca/page.copy.test.ts` (2) e `app/carros-usados/regiao/[slug]/page.config.test.ts` (3):
  **pré-existentes**, domínios institucional e SEO regional, sem relação com este diff;
- `components/account/PurchaseIntentForm.test.tsx` (1): **passa isolado** —
  flakiness de timeout do `userEvent` sob carga paralela.

`components/account/SaleRequestProposals.test.tsx` e
`DealerSaleOpportunities.test.tsx` também exibiram essa flakiness numa rodada
paralela e **passam isolados** (2/2 arquivos, 100% dos testes).

**Integração de outros domínios** (`ads-*`, `migrations-compat`,
`seed-cities-geo`) falha ao rodar as 227 suítes em paralelo — dezenas de
`CREATE DATABASE` simultâneos. `migrations-compat` também falha **isolado**, com
`null value in column "plan" of relation "users"`: `users.plan` é NOT NULL desde a
**migration 002**, e este diff não toca `users`. **Pré-existente.**

**Uma correção de teste desatualizado foi feita**, e está declarada:
`sale-requests-schema.integration.test.js` afirmava que só existiam
`sale_requests` e `sale_request_images` — quebrado desde a Fase 4.3. A asserção
foi atualizada **preservando a intenção** (igualdade de conjunto, para pegar
tabela de fase futura sem writer) e documentando a linha do tempo.

---

## 15. Fase 4.3.3 preservada (§30)

Nenhuma decisão reaberta. Verificado por conteúdo:

`minimum_accepted_price` · recomendação de 15% · primeira proposta ≥ piso ·
seguintes > maior atual · FIPE no detalhe · card limpo · mobile compacto ·
escopo por cidade · resolução de loja · privacidade · `sale_request_offers`
append-only · `SELECT … FOR UPDATE` da proposta.

A única alteração no caminho da 4.3.3 foi **ampliar o comentário** da guarda
`status !== RECEIVING_OFFERS` (que já existia e já recusava) para explicar que ela
agora também cobre `offer_selected`. Zero mudança de comportamento para
solicitações abertas.

---

## 16. Dívidas e pontos de atenção

1. **Sétima captura não gerada** — `loginRateLimit`. Cenário coberto por três
   camadas de teste. Baixo impacto.
2. **O badge de status não tem teste de contraste.** A correção foi verificada
   com estilo **computado** no navegador (`rgb(209,224,255)` sobre
   `rgb(242,243,247)`), mas nada impede uma regressão futura: um teste de
   presença no DOM passaria com a pílula invisível, exatamente como passaria
   antes da correção. Um teste que trave o par fundo/texto computado resolveria —
   fora do escopo desta fase.
3. **`migrations-compat.integration.test.js` vermelho** (pré-existente,
   `users.plan` NOT NULL). Merece uma correção própria, fora desta fase.
4. **11 erros de lint em `scripts/`** (pré-existentes).
5. **Flakiness de `userEvent`** em testes de componente sob carga paralela —
   ambiente, não produto.
6. **Seed do E2E não popula `minimum_accepted_price`** (a solicitação semeada é
   "legada"). Correto para o teste de compatibilidade, mas o E2E não exercita a
   interação piso × seleção. Não há interação: o piso governa só a **abertura** da
   disputa.
7. **A seleção é terminal e o E2E não tem undo** — rodar o spec duas vezes sem
   `npm run e2e:prepare` falha no primeiro passo, com mensagem explicando por quê.
8. **Não implementado, por decisão da fase**: reabertura, troca de loja, recusa de
   proposta, proposta final, aceite, venda concluída, pagamento, comissão,
   agendamento, contato, chat, prazo. Nenhum estado sem writer foi criado.

---

## 17. Gate final (§32)

| # | Critério | Status |
|---|---|---|
| 1 | owner vê uma proposta atual por loja | ✅ service + PG + E2E |
| 2 | histórico não duplica propostas na tela | ✅ 3 lances → 2 linhas |
| 3 | owner pode selecionar qualquer proposta atual | ✅ |
| 4 | **proposta menor pode ser selecionada** | ✅ **service + PG + componente + E2E** |
| 5 | stale offer é recusada | ✅ 409 `OFFER_STALE` + valor atual |
| 6 | selection é atômica | ✅ 11 passos, uma transação |
| 7 | selection × selection serializada | ✅ 6 rodadas com jitter |
| 8 | selection × bid serializada | ✅ 8 rodadas com jitter |
| 9 | selection × cancel serializada | ✅ 8 rodadas com jitter |
| 10 | novas ofertas bloqueadas após seleção | ✅ inclusive a loja selecionada |
| 11 | selected dealer recebe notification única | ✅ chave determinística |
| 12 | rollback não deixa notification órfã | ✅ gatilho no PG real |
| 13 | selected dealer vê estado read-only | ✅ formulário ausente |
| 14 | losers perdem acesso | ✅ 404 mudo, tela e API |
| 15 | nenhum contato é revelado | ✅ varredura nos dois lados |
| 16 | PostgreSQL real verde | ✅ 33/33 |
| 17 | E2E verde | ✅ 1/1 |
| 18 | responsive verde | ✅ 6 larguras, zero overflow |
| 19 | zero regressão nova | ✅ falhas remanescentes comprovadamente pré-existentes ou flakiness de ambiente |

### Veredito

**GO técnico.** Os 19 critérios estão atendidos. As falhas remanescentes de suíte
são pré-existentes (documentadas com data e causa) ou flakiness de execução
paralela — nenhuma introduzida por esta fase.

**NÃO MERGEADO. NÃO DEPLOYADO.** Branch `codex/sale-request-owner-offer-selection`,
aguardando revisão.

> Correção documental (4.4.1): esta linha dizia
> `codex/sale-request-offer-selection`, sem o `owner-`. Era erro de digitação do
> relatório, não uma segunda branch — `git branch --show-current` sempre
> respondeu `codex/sale-request-owner-offer-selection`, e nenhuma outra branch
> local ou remota com nome parecido existe.

### Antes do deploy

- rodar a **migration 057** (`npm run db:migrate`) — ela é aditiva e foi provada
  contra banco povoado;
- ciente de que a FK sem `ON DELETE` passa a **bloquear** a remoção manual de
  `users`/`advertisers` de um lojista com proposta selecionada (nenhum caminho da
  aplicação faz isso hoje).

---
---

# Hardening 4.4.1 — a integridade passou a ser do banco

**Escopo:** nenhuma funcionalidade nova. Duas invariantes que a 4.4 garantia
**principalmente pelo service** passaram a ser garantidas **também pelo
PostgreSQL**.

**Branch (real, verificada):** `codex/sale-request-owner-offer-selection`
**HEAD ao iniciar a 4.4.1:** `5f984a51833dff46736c62948263b87afaa00603`
**Working tree ao iniciar:** limpo, exceto os 4 arquivos untracked do usuário —
intocados do começo ao fim.

---

## 1. Pré-condição: a 057 ainda não é contrato (§1)

| Verificação | Resultado |
|---|---|
| `057` está em `origin/main`? | **Não** — `git log origin/main -- …057….sql` vazio |
| Branch existe no remoto? | **Não** — `git ls-remote --heads origin …` vazio |
| `origin/main…HEAD` | `0 2` — dois commits à frente, zero atrás |
| Produção (Render) tem a 057? | **Impossível**: o deploy roda migrations da main, e a branch nunca foi pushada |
| Ambientes com a 057 aplicada | apenas `carros_na_cidade_test` local, descartável (recriado por `npm run e2e:prepare`) |

**Conclusão:** a migration não saiu da branch e não é contrato publicado. Editada
**in-place**; nenhuma 058 criada. Uma 058 que consertasse a 057 deixaria as duas
no histórico para sempre, obrigando todo leitor futuro a ler a versão errada
antes de encontrar a certa. O cabeçalho da migration documenta essa janela e
declara que ela fecha no merge.

---

## 2. Auditoria do schema real (§2)

Inspecionado com `\d` e `pg_constraint` no banco de teste, **sem inferir tipos**.

**`sale_request_offers`** — `id BIGSERIAL PK`, `sale_request_id BIGINT`,
`dealer_user_id BIGINT`, `advertiser_id BIGINT`, `amount NUMERIC(14,2)`,
`note TEXT`, `created_at TIMESTAMPTZ`. Três índices (055). **Única chave:
`sale_request_offers_pkey (id)` — nenhuma UNIQUE composta existia.**

**`sale_requests`** — `selected_offer_fk` era **simples**
(`selected_offer_id → sale_request_offers(id)`), sem `ON DELETE`. CHECK de
coerência presente.

**`sale_request_offer_selections`** — `UNIQUE (sale_request_id)` e **quatro FKs,
todas `ON DELETE CASCADE`**.

Todos os ids envolvidos são `bigint` nas duas pontas — as FKs compostas casam sem
conversão.

---

## 3. Problema 1: "a oferta existe" não é "a oferta é desta solicitação"

A FK simples aceitava isto sem reclamar:

```sql
-- sale_requests id = 100 ; offer id = 900, sale_request_id = 200
UPDATE sale_requests
   SET selected_offer_id = 900, selected_offer_at = NOW(), status = 'offer_selected'
 WHERE id = 100;                                    -- aceito pela FK simples
```

### A solução: chaves candidatas compostas + FK composta

```sql
ALTER TABLE sale_request_offers
  ADD CONSTRAINT sale_request_offers_id_request_unique
  UNIQUE (id, sale_request_id);

ALTER TABLE sale_request_offers
  ADD CONSTRAINT sale_request_offers_id_request_advertiser_unique
  UNIQUE (id, sale_request_id, advertiser_id);

ALTER TABLE sale_requests
  ADD CONSTRAINT sale_requests_selected_offer_fk
  FOREIGN KEY (selected_offer_id, id)
  REFERENCES sale_request_offers (id, sale_request_id);
```

A FK carrega a **própria `sale_requests.id`** no lado esquerdo. Ler em voz alta:
*"a oferta que eu selecionei tem, como solicitação, EU MESMA"*. O estado inválido
deixou de ser proibido e passou a ser **inexprimível**.

Verificado no banco real:

```
ERROR:  insert or update on table "sale_requests" violates foreign key
        constraint "sale_requests_selected_offer_fk"
DETAIL: Key (selected_offer_id, id)=(2, 1) is not present in table
        "sale_request_offers".
```

### `MATCH SIMPLE` — a armadilha que quase entrou

O padrão do PostgreSQL dispensa a verificação quando **qualquer** coluna da FK é
NULL. Aqui isso é exatamente o desejado:

- `selected_offer_id` NULL → linha sem seleção, passa sem consultar o alvo;
- `selected_offer_id` cheio → as duas colunas são NOT NULL, par verificado inteiro.

**`MATCH FULL` faria o oposto do que se quer.** Ele exige todas nulas ou todas
não-nulas, e `sale_requests.id` **nunca** é nulo — toda solicitação sem seleção
seria rejeitada, e a migration morreria no primeiro banco com dados. Há **dois**
testes travando isso: um assertando `not.toMatch(/MATCH FULL/i)` na definição da
constraint, e outro inserindo uma solicitação sem seleção e exigindo sucesso.

---

## 4. Problema 2: FK por coluna aceita conjuntos que são ficção (§6, §7)

Com FKs separadas, esta linha de auditoria era aceita:

```
selection.sale_request_id = A
selection.offer_id        = <oferta da solicitação B>
selection.advertiser_id   = <uma loja qualquer>
```

Cada peça válida; o conjunto, ficção.

```sql
CONSTRAINT sale_request_offer_selections_offer_request_advertiser_fk
  FOREIGN KEY (offer_id, sale_request_id, advertiser_id)
  REFERENCES sale_request_offers (id, sale_request_id, advertiser_id)
```

### Por que a alternativa tripla foi escolhida (§7)

`advertiser_id` na trilha é **desnormalizado**, e desnormalização sem constraint é
o campo que diverge em silêncio. Uma trilha dizendo *"a loja X ganhou"* sobre um
lance da loja Y é um erro de auditoria indetectável — a auditoria é justamente
quem olharia ali. As três colunas são NOT NULL, então não há nuance de MATCH.

### Por que **duas** UNIQUE, e não uma (§4, §7)

O PostgreSQL exige que o alvo de uma FK seja coberto **exatamente** por PK ou
UNIQUE — não vale prefixo de índice nem subconjunto. São dois referenciadores com
formas diferentes:

| Referenciador | Colunas | Alvo necessário |
|---|---|---|
| `sale_requests` | `(selected_offer_id, id)` — **2** | `(id, sale_request_id)` |
| trilha | `(offer_id, sale_request_id, advertiser_id)` — **3** | `(id, sale_request_id, advertiser_id)` |

Uma UNIQUE tripla não serve de alvo para a FK de duas colunas; uma dupla não prova
o advertiser. `sale_requests` **não tem** advertiser, e criar
`selected_advertiser_id` só para casar uma chave seria inventar coluna para
satisfazer constraint.

**Duas é o menor modelo que expressa as duas invariantes** — não é "mais segurança
por precaução", que o §7 proíbe. Um teste assere `toHaveLength(2)`: nem uma a
menos (invariante sem alvo), nem uma a mais (índice único sem FK que o use é custo
de escrita sem contrapartida).

**Custo medido:** dois índices únicos a mais por INSERT numa tabela append-only que
cresce por lance — dezenas de linhas por solicitação, não milhões.

### FK simples de `offer_id`: **removida**

Seria estritamente mais fraca que a tripla e verificaria de novo o mesmo. Um teste
impede que ela volte "por segurança".

### FK direta de `advertiser_id`: **mantida**

Não é redundante com a tripla: a tripla garante **coerência** (bate com a oferta),
esta garante **existência** e é o que bloqueia diretamente o DELETE da loja, com o
nome certo no erro.

---

## 5. A trilha deixou de sumir por cascade (§8, §9)

**Antes:** as quatro FKs com `ON DELETE CASCADE`.
**Depois:** as quatro sem `ON DELETE` (NO ACTION).

O argumento original era sobre **renderização** — *"um evento sobre uma
solicitação apagada não pode ser descrito por tela nenhuma"*. Está errado de
premissa: esta tabela não existe para ser renderizada. Ela existe para responder
*"o que aconteceu?"* quando alguém contesta um negócio.

CASCADE numa trilha auditável é contradição em si: o registro desaparece **em
silêncio, sem log e sem erro**, exatamente no momento em que seria consultado.

`NO ACTION` e não `RESTRICT`: sem `DEFERRABLE` em jogo os dois se comportam igual,
e NO ACTION é o padrão — escrever RESTRICT sugeriria uma diferença de semântica
sendo explorada, e não há.

**LGPD/anonimização não foi implementada** (§9). Quando existir, será fluxo próprio
que decide o que preservar — não um `ON DELETE` herdado de FK.

---

## 6. Consequência real: o seed de E2E quebrou — e foi corrigido explicitamente

`scripts/e2e-seed.mjs` fazia `DELETE FROM sale_requests WHERE owner_user_id = …`
para ser idempotente. Com a trilha em NO ACTION, o DELETE passou a falhar:

```
error: update or delete on table "sale_requests" violates foreign key constraint
       "sale_request_offer_selections_sale_request_id_fkey"
```

**Isto não é um defeito do endurecimento — é o endurecimento funcionando.** E é
exatamente o "fluxo próprio" que o §9 descreve: a destruição de histórico passou a
exigir uma declaração explícita no código.

O seed ganhou um DELETE próprio da trilha, **escopado ao mesmo `owner_user_id`**
(nunca a tabela inteira), com o comentário explicando que um script de reset de
ambiente de teste está descartando a trilha que ele mesmo semeou.

Foi encontrado **rodando o E2E**, não por inspeção — a suíte pegou.

---

## 7. Testes novos (§13–§17)

Todos falam **SQL direto**; nenhum passa pelo service. É esse o ponto: prova-se
que o estado inválido é **inexprimível**, não que o sistema o recusa. A diferença
aparece no código de erro — `23503`, do PostgreSQL.

| § | Teste | Esperado | OK |
|---|---|---|---|
| 13-A | `UPDATE sale_requests` com offer de outra request | `23503` + estado intacto | ✅ |
| 13-B | `INSERT` na trilha com offer de outra request | `23503` + trilha vazia | ✅ |
| 13-C | combinação coerente nas duas tabelas | aceita | ✅ |
| — | MATCH SIMPLE: solicitação **sem** seleção | aceita | ✅ |
| 14 | trilha com advertiser diferente do da oferta | `23503` | ✅ |
| 14 | trilha com advertiser correto | aceita | ✅ |
| 15 | `DELETE` da oferta selecionada | `23503` + **trilha sobrevive** | ✅ |
| 15 | `DELETE` da solicitação | `23503` + trilha sobrevive | ✅ |
| 15 | `DELETE` do advertiser | `23503` + trilha sobrevive | ✅ |
| 15 | `DELETE` do usuário que **selecionou** | `23503` + trilha sobrevive | ✅ |
| 15 | `DELETE` do usuário **lojista** | `23503` + trilha sobrevive | ✅ |
| 15 | **contraste**: sem seleção, apagar a solicitação funciona | sucesso + offers em cascata | ✅ |
| 16 | upgrade povoado + constraints endurecidas presentes | as 4, sem MATCH FULL, `confdeltype='a'` | ✅ |
| 17 | caminho feliz e as **quatro igualdades** | fecham | ✅ |

Os testes de DELETE **não exigem nome de constraint** (§15): o que importa é o
efeito — o DELETE falha e a linha continua lá.

O teste de contraste importa tanto quanto os outros: prova que o endurecimento
travou **exatamente o que precisa ser preservado**, e não o banco inteiro.

### As quatro igualdades (§17)

Verificadas por JOIN, depois de uma seleção real da **menor** proposta:

1. `sale_requests.selected_offer_id` = `selections.offer_id`
2. `selections.sale_request_id` = `sale_requests.id`
3. `offer.sale_request_id` = `sale_requests.id`
4. `selections.advertiser_id` = `offer.advertiser_id`

E `amount = 65000.00` nas duas pontas — **o hardening não transformou a maior
proposta em regra** (§19).

---

## 8. O que NÃO mudou (§10, §11, §12)

`sale_request_offers` continua append-only — sem `status`, `updated_at`,
`deleted_at`, soft delete, UPDATE ou DELETE funcional. A definição de "proposta
atual" (a mais recente da loja) está intacta.

A regra funcional e a transação de onze passos estão **byte a byte iguais**: o
diff da 4.4.1 não toca **nenhum** arquivo de `src/modules/`.

**As duas camadas continuam (§12):** o service devolve erro semântico legível
(`SALE_REQUEST_OFFER_NOT_FOUND`, 404) e o banco torna o estado impossível. Nenhuma
validação foi removida do service porque "o banco agora garante" — um `23503` que
chegasse ao usuário seria um 500 sem mensagem útil.

---

## 9. Regressões da 4.4.1 (§21)

| Suíte | Antes (4.4) | Depois (4.4.1) |
|---|---|---|
| Integração da seleção | 33 ✅ | **50 ✅** (estável em 2 execuções) |
| Integração vizinha (4 suítes) | 91 ✅ | **91 ✅** |
| Backend `npm test` | 3395 ✅ | **3395 ✅** |
| Frontend afetado (17 arquivos) | ✅ | **✅** |
| `frontend typecheck` | ✅ | **✅** |
| `frontend lint` | ✅ | **✅** |
| `frontend build` | — | **✅** |
| `backend lint` | 11 erros em `scripts/` | **11 erros em `scripts/`** (baseline) |
| **E2E 4.4** (seleção) | 1 ✅ | **1 ✅** (9,5s, schema endurecido) |
| **E2E 4.3** (disputa) | não reexecutado | **2 ✅** |

O **E2E da 4.3 foi incluído de propósito**: a 4.4.1 adicionou duas UNIQUE em
`sale_request_offers`, que é justamente a tabela em que aquela fase escreve. Uma
regressão de escrita de proposta apareceria ali antes de qualquer outro lugar.
Ele também é o teste que confirma o `scripts/e2e-seed.mjs` corrigido — foi ele
que expôs a quebra do seed.

Concorrência **preservada e sem redução de jitter** (§18): seleção × seleção (6
rodadas), seleção × novo lance (8), seleção × cancelamento (8), retry simultâneo,
rollback da notificação, stale, e o teste por mutação do lock.

**§22 respeitado:** a asserção de schema da 4.4 não foi reaberta. As asserções que
ganharam linhas são as da própria suíte de seleção, por exigência legítima das
constraints novas.

---

## 10. Gate 4.4.1 (§24)

| # | Critério | Status |
|---|---|---|
| 1 | 057 não publicada e endurecida in-place | ✅ `git log origin/main` + `ls-remote` |
| 2 | banco impede `selected_offer` de outra request | ✅ `23503` |
| 3 | banco impede trilha apontando offer de outra request | ✅ `23503` |
| 4 | advertiser da trilha coerente com a offer | ✅ FK tripla |
| 5 | trilha não usa `ON DELETE CASCADE` | ✅ `confdeltype='a'` nas 4 |
| 6 | delete não apaga trilha | ✅ 5 cenários |
| 7 | CHECK `offer_selected` continua válido | ✅ inalterado |
| 8 | upgrade 056 → 057 com dados passa | ✅ + constraints verificadas |
| 9 | caminho feliz passa | ✅ 4 igualdades |
| 10 | proposta menor continua selecionável | ✅ service + PG + componente + E2E |
| 11 | stale detection funciona | ✅ |
| 12 | idempotência funciona | ✅ sequencial e concorrente |
| 13 | selection × selection | ✅ 6 rodadas |
| 14 | selection × bid | ✅ 8 rodadas |
| 15 | selection × cancel | ✅ 8 rodadas |
| 16 | rollback notification | ✅ gatilho no PG |
| 17 | mutation proof | ✅ |
| 18 | E2E verde | ✅ |
| 19 | nenhuma regressão nova | ✅ |
| 20 | UI inalterada funcionalmente | ✅ zero arquivo de UI no diff da 4.4.1 |

### Veredito 4.4.1: **GO técnico**

**NÃO MERGEADO. NÃO DEPLOYADO.**

### Antes do deploy — atualizado

- rodar a **migration 057 endurecida** (`npm run db:migrate`);
- ciente de que a remoção manual de `users`, `advertisers`, `sale_requests` ou
  `sale_request_offers` passa a ser **bloqueada** quando houver seleção. Nenhum
  caminho da aplicação faz isso; o único fluxo que precisava foi corrigido para
  declarar a destruição explicitamente (`scripts/e2e-seed.mjs`);
- quando existir política de LGPD/anonimização, ela precisará de um fluxo próprio
  — e a ausência de CASCADE é o que garante que ela seja escrita, em vez de
  acontecer por acidente.
