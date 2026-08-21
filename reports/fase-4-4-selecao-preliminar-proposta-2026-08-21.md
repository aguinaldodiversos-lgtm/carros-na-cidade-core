# Fase 4.4 — Propostas recebidas + seleção preliminar da loja

**Data:** 2026-08-21
**Branch:** `codex/sale-request-owner-offer-selection`
**Base SHA:** `9f3ffd92ddf41b027ac8515787f35f8061f82751` (main, Fase 4.3.3 mergeada)
**HEAD:** trabalho local, ainda **não commitado** — nada mergeado, nada deployado.

> **Veredito: GO técnico**, com as ressalvas de ambiente da §Regressões (todas
> pré-existentes e comprovadamente alheias a esta fase).

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

Cinco blocos, nesta ordem:

1. **Colunas** `selected_offer_id BIGINT` e `selected_offer_at TIMESTAMPTZ` em
   `sale_requests`. Ambas nullable, **sem DEFAULT** — um `DEFAULT NOW()` faria a
   data ser sobre a criação da linha, não sobre a decisão.
2. **FK** `sale_requests_selected_offer_fk → sale_request_offers(id)`, **sem
   `ON DELETE`** (NO ACTION). Decisão documentada: `CASCADE` apagaria a
   solicitação por causa de um satélite; `SET NULL` produziria um estado que o
   CHECK de coerência proíbe (o `DELETE` falharia mesmo assim, com diagnóstico
   pior). Consequência **aceita**: o banco recusa apagar `users`/`advertisers` de
   um lojista com proposta selecionada. Verificado que **não existe
   `DELETE FROM users` nem `DELETE FROM advertisers` em `src/`**.
3. **CHECK de status** — DROP/ADD, pelo padrão que a migration 030 descreve:
   `receiving_offers | offer_selected | cancelled`.
4. **CHECK de coerência** — bi-implicação:
   `offer_selected` ⟺ (`selected_offer_id` **e** `selected_offer_at` preenchidos).
   Torna **inexprimíveis** os três estados contraditórios. Entra sem `NOT VALID`
   porque toda linha legada satisfaz a segunda metade.
5. **Tabela `sale_request_offer_selections`** — append-only, com
   `UNIQUE (sale_request_id)`, `CHECK (amount_snapshot > 0)`, quatro FKs
   (`sale_requests`, `sale_request_offers`, `advertisers`, `users`), todas
   `ON DELETE CASCADE`, e índice `(advertiser_id, selected_at DESC, id DESC)`.

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
  prometeria que existe). O badge de status ganhou tratamento próprio (azul), para
  não usar o mesmo cinza apagado de "Cancelada".

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

> A sétima captura planejada (loja perdedora sem acesso) **não foi gerada**: o
> `loginRateLimit` (10 logins/IP a cada 15 min) esgotou durante a sessão de
> capturas. O cenário está coberto por teste de service, teste de integração
> PostgreSQL e pelo E2E. As capturas `05` e `06` foram tiradas **antes** dos dois
> ajustes finais de UI (subtítulo do lojista selecionado e cor do badge de
> status) — o conteúdo é o mesmo; só esses dois detalhes visuais mudaram depois.

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
2. **`05` e `06` são anteriores aos dois ajustes finais de UI** (subtítulo do
   lojista selecionado; cor do badge de status). Regerar quando a janela de login
   reabrir.
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

**NÃO MERGEADO. NÃO DEPLOYADO.** Branch `codex/sale-request-offer-selection`,
aguardando revisão.

### Antes do deploy

- rodar a **migration 057** (`npm run db:migrate`) — ela é aditiva e foi provada
  contra banco povoado;
- ciente de que a FK sem `ON DELETE` passa a **bloquear** a remoção manual de
  `users`/`advertisers` de um lojista com proposta selecionada (nenhum caminho da
  aplicação faz isso hoje).
