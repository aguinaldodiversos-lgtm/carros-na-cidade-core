# Fase 4.6 — Decisão do proprietário sobre a proposta final

**Data:** 2026-08-23
**Branch:** `codex/sale-request-owner-final-decision`
**Base (SHA):** `830390c943b03ad8091f9a5f5d6e25259fc1382d` (merge da Fase 4.5, PR #42)
**Status:** implementada, testada, **não mergeada e não deployada**

---

## Sumário

A Fase 4.5 terminou com a solicitação em `final_offer_submitted`: a loja selecionada
viu o carro, registrou a inspeção e apresentou um valor final. A bola voltou para
quem está vendendo — e não havia caminho para responder.

Esta fase cria a resposta, e só ela:

```
final_offer_submitted
        ↓
   PF decide
    ↙       ↘
ACEITA     RECUSA
  ↓           ↓
final_offer_accepted   final_offer_rejected
```

**`final_offer_accepted` significa uma coisa: o proprietário aceitou a proposta
comercial final.** Não significa veículo vendido, pagamento realizado,
transferência concluída, contrato assinado nem negócio liquidado. Nenhuma dessas
coisas existe neste produto, e há teste percorrendo o texto renderizado à procura
das frases que as afirmariam.

---

## Auditoria Fase 4.6

Leitura completa antes de escrever qualquer linha. O que foi encontrado:

### Migration mais recente

`058_sale_request_inspection_final_offer.sql` — confirmado por listagem, não
presumido. A nova é a **059**.

### Estados atuais de `sale_requests.status`

Sete, todos com writer real: `receiving_offers`, `offer_selected`,
`inspection_scheduled`, `inspection_completed`, `final_offer_submitted`,
`final_offer_declined`, `cancelled`.

### CHECK de coerência da seleção (058)

Partição **explícita**, com as duas listas enumeradas:

```sql
(status IN ('offer_selected','inspection_scheduled','inspection_completed',
            'final_offer_submitted','final_offer_declined')
 AND selected_offer_id IS NOT NULL AND selected_offer_at IS NOT NULL)
OR
(status IN ('receiving_offers','cancelled')
 AND selected_offer_id IS NULL AND selected_offer_at IS NULL)
```

A 057 usava `status <> 'offer_selected'` e a 058 teve de reescrevê-la — todo estado
novo caía automaticamente do lado "sem seleção". A 059 mantém a forma de duas
listas pelo mesmo motivo.

### Tabelas e UNIQUEs existentes

| Tabela | UNIQUE relevante |
|---|---|
| `sale_request_offer_selections` | `(sale_request_id)`, `(sale_request_id, advertiser_id)` |
| `sale_request_inspections` | `(sale_request_id)`, `(id, sale_request_id, advertiser_id)` |
| `sale_request_inspection_slots` | `(inspection_id, round_no, starts_at)`, `(id, inspection_id)` |
| `sale_request_post_inspection_decisions` | `(sale_request_id)` — índice único |

`sale_request_post_inspection_decisions` tem `decision_type IN ('final_offer','no_offer')`,
`final_amount` NOT NULL e `> 0` apenas quando `final_offer`, e
`preliminary_amount_snapshot > 0`.

### Acesso

- **Owner detail**: `getByIdForOwner` com `owner_user_id` no `WHERE`.
- **Dealer detail**: `getVisibleByIdForCity` — `status = 'receiving_offers'` OR
  (`status = ANY(SALE_REQUEST_SELECTED_STATUSES)` AND `sel.advertiser_id = $5`).
  Lojas perdedoras não casam a linha → 404.

### Guard de cancelamento

`cancelMySaleRequest` usa `SALE_REQUEST_SELECTED_STATUSES.includes(row.status)` —
**lista, não igualdade** (consertado na 4.4.1, generalizado na 4.5).

### Eventos de notificação existentes

`sale_request.bid_received`, `.outbid`, `.bid_selected`,
`.inspection_slots_offered`, `.inspection_slots_requested`,
`.final_offer_submitted`, `.final_offer_declined`, `appointment.confirmed`.
**Nenhum serve** para a resposta do proprietário — `bid_selected` é a escolha
preliminar (outro fato, outro momento, outro destinatário-alvo).

### Padrões confirmados

- `withTransaction(async (exec) => ...)`;
- `createUserNotification(input, { exec })`;
- `SELECT ... FOR UPDATE` sobre `sale_requests`, com leituras de critério em
  comandos **próprios** depois do lock (READ COMMITTED re-avalia só a linha travada);
- códigos de erro estáveis por `code`, nunca por parsing de mensagem.

### Busca pela classe de bug da 4.5 — "igualdade que envelhece"

Varredura de `status === `, `status !== `, `IN (...)` e arrays de status em todo o
domínio. Resultado:

| Local | Forma | Cresce com a máquina? |
|---|---|---|
| `sale-requests.service.js` (cancel guard) | `SELECTED_STATUSES.includes` | ✅ |
| `sale-requests.service.js` (DTO owner) | `SELECTED_STATUSES.includes` ×2 | ✅ |
| `sale-requests.dealer.service.js` (`serializeSelection`) | `SELECTED_STATUSES.includes` | ✅ |
| `sale-requests.dealer.repository.js` (visibilidade) | `= ANY(SELECTED_STATUSES)` | ✅ |
| `sale-requests.dealer.service.js` (leitura 4.5) | `=== RECEIVING_OFFERS` | ✅ (nega o único estado sem inspeção) |
| `frontend api.ts STATUS_LABEL` | `Record<SaleRequestStatus, string>` | ✅ (não compila sem o rótulo novo) |

**Todos já usavam a lista.** Bastou acrescentar os dois estados a
`SALE_REQUEST_SELECTED_STATUSES` para que os seis pontos crescessem juntos — e há
teste de regressão percorrendo a lista inteira para provar que cresceram.

**Achado que exigiu correção:** o E2E da 4.5 afirmava que os botões "Aceitar" e
"Recusar" **não podiam existir** na tela. Era verdade enquanto o desfecho não
existia. A asserção foi **invertida**, não removida — o arquivo continua provando
que a 4.5 termina *aguardando*, com a decisão disponível e não tomada.

**Segundo achado:** o `scripts/e2e-seed.mjs` apaga as solicitações do owner, e
nenhuma FK da 4.6 cascateia. Sem um `DELETE` explícito da nova trilha, reexecutar
o seed depois de uma decisão falharia com violação de FK. O DELETE foi acrescentado
seguindo o padrão já documentado no próprio script.

---

## Decisão de produto: a recusa NÃO reabre a disputa (§3)

`final_offer_rejected` é **terminal**. `final_offer_declined` continua terminal.

Um `UPDATE ... SET status = 'receiving_offers'` deixaria seis perguntas sem
resposta no banco:

1. a seleção antiga ainda vale?
2. os lances antigos voltam a valer?
3. uma loja nova pode ser selecionada, com o `UNIQUE(sale_request_id)` de seleção
   já ocupado?
4. a inspeção anterior pertence a qual rodada?
5. a proposta final anterior pertence a qual ciclo?
6. a decisão recém-gravada some, ou fica?

Nenhuma se resolve com um status; todas se resolvem com um conceito de **rodada**,
que é uma fase inteira. Improvisá-la aqui produziria exatamente o estado ambíguo
que as migrations 057 e 058 tiveram de consertar depois.

A tela diz que uma nova negociação **poderá** ser iniciada posteriormente, e não
cria CTA nenhum para isso — um botão que levasse a lugar nenhum seria pior que a
ausência dele.

---

## Migration 059

`src/database/migrations/059_sale_request_owner_final_decision.sql`

### 1. Dois estados novos

`final_offer_accepted`, `final_offer_rejected`. Cada um com writer real (os dois
ramos de `decideFinalOffer`). Não foram criados `sold`, `completed`,
`deal_closed`, `payment_pending`, `awaiting_payment` nem `documentation_pending`.

### 2. CHECK de coerência com partição explícita

Os dois estados entram na lista **com** seleção — chegar a qualquer um deles exige
ter passado por `offer_selected`. `receiving_offers` e `cancelled` continuam sem.

### 3. O UNIQUE que carrega a prova

```sql
ALTER TABLE sale_request_post_inspection_decisions
  ADD CONSTRAINT sale_request_post_inspection_decisions_offer_identity_unique
  UNIQUE (id, sale_request_id, advertiser_id, decision_type, final_amount);
```

`id` já é PK, então isto não restringe nada de novo — existe para ser **alvo** da
FK composta, como `sale_request_inspections_id_request_advertiser_unique` na 058.

### 4. A trilha

```sql
CREATE TABLE sale_request_owner_final_decisions (
  id BIGSERIAL PRIMARY KEY,
  sale_request_id BIGINT NOT NULL,
  post_inspection_decision_id BIGINT NOT NULL,
  advertiser_id BIGINT NOT NULL,
  post_inspection_decision_type TEXT NOT NULL,   -- CHECK = 'final_offer'
  decision_type TEXT NOT NULL,                   -- CHECK IN ('accepted','rejected')
  final_amount_snapshot NUMERIC(14,2) NOT NULL,  -- CHECK > 0
  decided_by_user_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ... ON sale_request_owner_final_decisions (sale_request_id);
```

Sem `updated_at`, sem `deleted_at`, sem `status`, **sem coluna de motivo**.
Append-only. Nenhum índice "por segurança": `advertiser_id` não ganhou um porque
nenhuma query desta fase varre a loja inteira.

---

## Integridade — o que a FK prova, e o §10

O §10 permitia parar na prova parcial e documentar a limitação. **Não foi
necessário**: a prova completa cabe numa FK, sem trigger.

```sql
FOREIGN KEY (post_inspection_decision_id, sale_request_id, advertiser_id,
             post_inspection_decision_type, final_amount_snapshot)
REFERENCES sale_request_post_inspection_decisions
            (id, sale_request_id, advertiser_id, decision_type, final_amount)
```

A técnica é **redundância controlada**: a filha guarda cópias de `decision_type` e
do valor; um CHECK fixa a cópia do tipo em `'final_offer'`; a FK obriga as cópias a
casarem com a linha-pai.

O que o **banco** — e não uma promessa do service — passa a garantir:

| Garantia | Mecanismo |
|---|---|
| pertence à mesma solicitação | colunas 2 da FK |
| pertence ao advertiser selecionado | coluna 3 da FK |
| a origem é `final_offer`, nunca `no_offer` | CHECK fixa `'final_offer'` + FK exige igualdade com o pai |
| `final_amount > 0` | transitivo: o CHECK do pai já garante para toda linha `final_offer` |
| **o snapshot é EXATAMENTE o valor apresentado** | coluna 5 da FK |

**MATCH SIMPLE (o default) enforça integralmente aqui** porque *toda* coluna do
lado filho é `NOT NULL` — a válvula de escape do MATCH SIMPLE só se abre com coluna
filha nula. `MATCH FULL` seria pior, não melhor: ele governa nulos no filho, e não
há nenhum. Há teste asserindo as duas coisas (`NOT MATCH FULL` e as 5 colunas
`is_nullable = 'NO'`).

`final_amount` é NULL nas linhas `no_offer` do pai — inofensivo: NULLs são
distintos num índice único, e como o filho nunca é nulo, essas linhas simplesmente
ficam inalcançáveis. Que é o desejado.

**Sem CASCADE em nenhuma FK.** Apagar a solicitação com trilha registrada é
recusado (23503) — testado, inclusive com asserção sobre `confdeltype = 'a'`.

---

## O valor não vem do cliente (§8, §35)

O endpoint recebe **apenas**:

```json
{ "decision": "accepted" }
```

`final_amount`, `preliminary_amount`, `advertiser_id` e `owner_user_id` enviados
pelo cliente não são "ignorados por validação" — **não existe código no caminho
que os leia**.

Três camadas independentes:

1. **service** — copia `finalOffer.final_amount`, lido da proposta final travada;
2. **repository** — escreve o literal `'final_offer'` da constante; não há
   parâmetro para o service influenciá-lo;
3. **banco** — a FK de 5 colunas recusa qualquer par (tipo, valor) divergente.

Provado nos dois níveis:

- **unit** — corpo com `final_amount: 1`, `preliminary_amount: 1` e
  `advertiser_id` da OUTRA loja: a trilha grava `60000.00` e a loja selecionada.
  Mutação de verificação: alterar o service para `body?.final_amount ?? ...` faz o
  teste falhar (confirmado).
- **PostgreSQL** — `INSERT` cru com `final_amount_snapshot = 1.00` → **23503**.

---

## Autorização (§12)

Somente o `owner_user_id` da solicitação decide. A posse está no `WHERE` do lock —
linha de outra pessoa não casa.

| Quem | Resposta |
|---|---|
| dono | 200 |
| outra PF | **404**, corpo `{ success: false, error: "not_found" }` — sem mensagem, sem campo, sem id |
| lojista (mesmo o selecionado) | 404 (a rota é do dono; o `owner_user_id` não casa) |
| sem sessão | 401 |

`owner_user_id` no corpo não muda nada.

---

## Idempotência e concorrência

### Idempotência (§16)

| Sequência | Resposta |
|---|---|
| `accepted` → `accepted` | 200, `changed: false` |
| `rejected` → `rejected` | 200, `changed: false` |
| `accepted` → `rejected` | **409** `OWNER_FINAL_DECISION_ALREADY_DECIDED` |
| `rejected` → `accepted` | **409** |

Uma linha na trilha, uma notificação, nos quatro casos.

O retry é checado **antes** do estado — depois de aceitar o status já não é
`final_offer_submitted`, e a ordem inversa faria o retry legítimo receber "esta
solicitação não tem proposta final para responder", que é falso e assustador.

### Concorrência (§17, §36) — PostgreSQL real

**`accepted` × `rejected`, 6 rodadas com jitter.** Invariante verificada a cada
rodada:

```
COUNT(trilha) = 1
status = final_offer_accepted  ⇔  decision_type = accepted
status = final_offer_rejected  ⇔  decision_type = rejected
exatamente 1 vencedora (changed: true), exatamente 1 com 409
exatamente 1 notificação, do tipo correspondente à vencedora
```

**Nunca a combinação cruzada.** Nenhuma constraint do banco poderia recusá-la (são
tabelas diferentes); quem a impede é o lock **mais** o mapa único
`STATUS_BY_DECISION`, do qual saem tanto o `decision_type` do INSERT quanto o
`toStatus` do UPDATE. Dois ternários independentes seriam o caminho para a
divergência; com o mapa, a combinação cruzada é *inexprimível*, não apenas proibida.

**`accepted` × `accepted`, 4 rodadas com jitter.** Ambas semanticamente
bem-sucedidas — uma `changed: true`, outra `changed: false` —, uma linha, uma
notificação. Um 409 aqui seria defeito: é o cenário do duplo clique.

Três redes independentes: o **LOCK** serializa, o **UNIQUE** de `sale_request_id`
impede a segunda linha, o **`fromStatus`** no UPDATE impede a segunda transição.

---

## Transação (§18)

`withTransaction` + `SELECT ... FOR UPDATE` na mesma linha de `sale_requests` das
fases anteriores. O lock é sobre a linha e **só** ela, sem JOIN: as três leituras de
critério (proposta final, decisão existente, destinatário) são comandos próprios,
executados depois — em READ COMMITTED o `FOR UPDATE` re-avalia apenas a linha
travada, e um JOIN traria as demais do snapshot anterior ao commit concorrente.

Ordem: lock owner-scoped → 404 → retry/409 → estado → proposta final →
prova `decision_type = 'final_offer'` → deriva valor → INSERT trilha → UPDATE status
→ notificação com o **mesmo `exec`** → commit.

Nenhum critério avaliado fora do lock.

---

## Notificações (§19)

Eventos existentes auditados primeiro; nenhum servia. **Dois novos**, o mínimo:

- `sale_request.final_offer_accepted` → "Proposta final aceita"
- `sale_request.final_offer_rejected` → "Proposta final não aceita"

- **Destinatário**: `dealer_user_id` da proposta preliminar selecionada — a mesma
  convenção determinística da 4.5. É **endereçamento, não autorização**: quem tem
  direito de agir é o advertiser inteiro.
- **Lojas perdedoras não são notificadas** (testado).
- **Chave de idempotência determinística**:
  `sale-request:{id}:owner-final-decision:{decision}`.
- **Na mesma transação.** Provado por contradição: um CHECK temporário em
  `user_notifications` que recusa o evento faz a decisão **inteira** ser revertida —
  sem trilha, status inalterado. Removida a barreira, a mesma decisão passa.
- **Payload**: apenas `{ final_amount }` — o fato de negócio, que a loja já conhece
  porque o propôs. Varredura do objeto serializado inteiro contra
  telefone/WhatsApp/e-mail/CPF/CNPJ/endereço.
- **Nenhum texto afirma venda concluída** (teste dedicado).

---

## Privacidade (§31)

| Garantia | Como |
|---|---|
| zero contato direto | nenhuma query da fase faz JOIN com `users` ou seleciona `advertisers.email/phone/whatsapp` |
| `internal_note` nunca sai | a query do repositório não a seleciona — não é o DTO que omite |
| owner PII para o lojista | DTO do lojista tem 2 chaves: `type`, `decided_at` |
| ids internos | `advertiser_id`, `decided_by_user_id`, `post_inspection_decision_id` e o `id` da linha não são selecionados |
| loser 404 | mantido nos dois estados novos (unit + PG real) |

Testes de **igualdade de conjunto de chaves** nos dois DTOs, mais varredura por
regex do JSON inteiro.

---

## Endpoint e UI

### Backend

```
POST /api/account/sale-requests/:id/final-offer-decision
Body: { "decision": "accepted" | "rejected" }
```

POST e não PATCH — é um fato novo auditável, não edição de campo. **Um** endpoint
para as duas respostas: são o mesmo fato de domínio com valores opostos, na mesma
linha, transação, UNIQUE e idempotência. Duas rotas duplicariam guard, lock e
idempotência, e a segunda cópia é onde o `fromStatus` acaba esquecido.

Sem rate limit próprio, pela mesma razão do `select-offer`: a partir do segundo
request a resposta é 200 idempotente ou 409, sem escrita e sem notificação.

BFF: `frontend/app/api/account/sale-requests/[id]/final-offer-decision/route.ts` —
repassa o corpo sem ler nem reescrever.

### Owner — antes da decisão (§20)

Painel da 4.5 preservado inteiro (preliminar / final / diferença / motivo /
"Você informou × A loja encontrou") e, ao final:

`[ Recusar proposta ]  [ Aceitar proposta ]`

Aceitar é primária (azul cheio, primeiro no DOM); Recusar é secundária (contorno).
**Não é vermelho destrutivo**: recusar não apaga nada, e tratar uma escolha
comercial legítima como acidente iminente seria errado.

### Confirmação (§21, §22)

`role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`, `Escape`,
ciclo de Tab, foco inicial em "Voltar" (a saída não destrutiva), foco devolvido ao
gatilho. Mesmo padrão da 4.4.

**Aceite** — valor em destaque, loja nomeada, e a ressalva:

> Esta etapa registra sua decisão comercial. Pagamento e transferência do veículo
> não fazem parte desta confirmação.

**Recusa** — valor, e:

> Esta solicitação será encerrada neste fluxo e não voltará automaticamente a
> receber propostas.

**Sem campo de motivo.** Teste assere zero `input`, `textarea` e `select` no
diálogo.

### Owner — depois (§23, §24)

Aceite: "Proposta final aceita", loja, valor, e

> Sua decisão foi registrada. A proposta aceita ainda não representa pagamento,
> transferência ou venda concluída.

Recusa: "Proposta final recusada", valor, "Esta solicitação foi encerrada neste
fluxo." + "Uma nova negociação poderá ser iniciada posteriormente." — **sem CTA de
reabertura**.

Os botões **somem**, não ficam desabilitados: um botão cinza sugere que a ação
volta a ser possível. Histórico (comparação e ficha observada) permanece visível.

### Dealer (§25, §26)

Aceite: "Proprietário aceitou sua proposta final" + valor + "A decisão comercial
foi registrada pela plataforma." Recusa: "Proposta final não aceita" + texto
neutro. Read-only nos dois: sem nova proposta, edição, chat, contato ou nova
avaliação. O subtítulo da página também passou a refletir o desfecho — "as próximas
etapas serão informadas por aqui" prometia um seguimento que, depois da resposta,
não existe.

---

## `final_offer_declined` (§27)

Continua terminal e **não** vira decisão artificial do proprietário. Aceitar ou
recusar algo que não existe é recusado com 409 e mensagem própria:

> A loja encerrou a avaliação sem apresentar proposta final, então não há proposta
> para responder.

Mensagem separada de propósito: um "estado inválido" genérico faria a pessoa
procurar uma proposta que nunca foi feita.

---

## Cancelamento (§28)

O guard usa `SALE_REQUEST_SELECTED_STATUSES`, que cresceu com os dois estados
novos. Cancelar depois de decidir → **409** `SALE_REQUEST_NOT_CANCELLABLE`, nunca
um 200 falso.

Teste percorre **todos** os estados pós-seleção, não só os novos: o defeito da 4.5
não foi um estado esquecido, foi uma *lista* que parou de acompanhar a máquina.

---

## Testes

### Service / unit — `tests/sale-requests/sale-requests-owner-final-decision.test.js`

**46 testes.** Aceite, recusa, autorização (404 para outra PF, 404 para lojista,
401 sem sessão), valor sem client, pré-condições, idempotência, 409 oposto,
notificações, DTOs owner e dealer, loser 404, cancelamento pós-decisão, e a
varredura da máquina de estados.

**Mutações de verificação** (para provar que os testes mordem):

| Mutação | Resultado |
|---|---|
| service passa a ler `body.final_amount` | 1 teste falha ✅ |
| remover os 2 estados de `SELECTED_STATUSES` | 8 testes falham ✅ |

### PostgreSQL real — `tests/integration/sale-request-owner-final-decision.integration.test.js`

**32 testes.** Schema da 059, upgrade 058→059 sobre banco povoado com **todos** os
7 estados da 4.5, CHECKs (23514), FK composta e nullability, os dois caminhos pelos
services reais, integridade cruzada por SQL cru (23503 ×3), UNIQUE (23505),
ausência de CASCADE, idempotência, **concorrência com jitter**, rollback da
notificação, DTOs e cancel guard.

### Frontend — `frontend/components/account/SaleRequestFinalDecision.test.tsx`

**24 testes.** Painel, hierarquia dos botões, diálogos (a11y completa), envio
apenas da decisão, estados pós-decisão, erros 409, `final_offer_declined`, e a
**varredura de copy proibida**.

**Mutação de verificação:** trocar o rótulo `accepted` por "Venda concluída" faz 2
testes falharem ✅ — inclusive com o recorte das ressalvas ativo.

### E2E

- `frontend/e2e/sale-request-owner-final-decision.spec.ts` — **novo**, verde
- `frontend/e2e/sale-request-inspection-final-offer.spec.ts` — **atualizado**, verde

---

## Uma armadilha que valeu a pena registrar

**A varredura de copy proibida acusava a própria ressalva.**

A ressalva do aceite contém a frase "venda concluída" — para **negá-la**: "ainda
não representa pagamento, transferência ou venda concluída". Uma busca ingênua
pelas frases proibidas acusava justamente o texto que existe para impedir a leitura
errada, e a "correção" óbvia teria sido apagar a ressalva.

Solução: as ressalvas são recortadas do texto **pelo valor exportado** (não por
literal copiado) antes da varredura, e cada teste que recorta verifica **também**
que a ressalva estava lá. Reescrever a ressalva no módulo compartilhado mantém o
teste funcionando; qualquer frase nova que afirme conclusão continua sendo pega —
confirmado por mutação.

**Segunda:** `Intl.NumberFormat` em pt-BR separa "R$" do número com **NBSP**, não
com espaço comum. `expected 'R$ 60.000,00' to be 'R$ 60.000,00'` — duas strings
visualmente idênticas. Helper `money()` normaliza.

---

## Responsive (§37)

Larguras **360, 390, 412, 768, 1024, 1440**, verificadas dentro do E2E em cinco
momentos (painel antes da decisão, depois do aceite, depois da recusa, e as duas
telas do lojista). Asserção: `documentElement.scrollWidth <= clientWidth + 1`.
**Zero overflow horizontal.**

Nota: a tabela "Você informou × A loja encontrou" tem `overflow-x-auto` +
`min-w-[420px]` próprios (herdado da 4.5) — rola dentro do próprio contêiner a
360/390px, que é o padrão correto e não produz overflow de página.

---

## Screenshots (§42)

`reports/screenshots/fase-4-6/` — as 8 exigidas, todas geradas pelo E2E contra
banco real:

```
01-owner-proposta-final-com-acoes.png
02-owner-modal-aceite.png
03-owner-aceita-desktop.png
04-owner-aceita-mobile-390.png
05-dealer-proposta-aceita.png
06-owner-modal-recusa.png
07-owner-proposta-recusada.png
08-dealer-proposta-nao-aceita.png
```

---

## Regressões (§39)

| Suíte | Resultado |
|---|---|
| `npm test` (backend completo) | ✅ 212 arquivos, **3495 passed**, 1 skipped |
| `tests/sale-requests` | ✅ 517 passed (13 arquivos) |
| `sale-requests-schema.integration` | ✅ 44 passed |
| `sale-request-offer-selection.integration` (4.4) | ✅ 50 passed |
| `sale-request-inspection-final-offer.integration` (4.5) | ✅ 27 passed |
| `sale-request-owner-final-decision.integration` (4.6) | ✅ **32 passed** |
| frontend `vitest run` | ✅ 3254 passed / 5 falhas **pré-existentes** |
| frontend `tsc --noEmit` | ✅ limpo |
| frontend `next lint` | ✅ sem warnings ou erros |
| frontend `npm run build` | ✅ standalone verificado |
| E2E 4.5 | ✅ passou |
| E2E 4.6 | ✅ passou |

Integrações rodadas **em série** (o ambiente já demonstrou contenção em paralelo).

### As falhas pré-existentes, provadas

**Frontend (5):** `app/seguranca/page.copy.test.ts` (2) e
`app/carros-usados/regiao/[slug]/page.config.test.ts` (3). Verificadas em um
worktree limpo em `origin/main` — **as mesmas 5 falham lá**. Nada a ver com a 4.6.

**`migrations-compat.integration` (3):** falhas de backfill legado de `users.plan`
(migration 020). Verificado removendo temporariamente a 059 do diretório de
migrations — **as mesmas 3 falham sem ela**.

**Zero regressão nova.**

---

## Dívidas e observações

1. **`SALE_REQUEST_POST_DECISION_STATUSES` continua sem consumidor em runtime.**
   Herdado assim da 4.5. Foi mantido semanticamente correto (agora com os quatro
   estados pós-decisão da loja) e documentado como dívida em vez de removido em
   silêncio. Quem decide comportamento hoje é `SALE_REQUEST_SELECTED_STATUSES` e
   `SALE_REQUEST_OWNER_DECIDED_STATUSES`.

2. **Rodar os dois E2E na mesma janela de 15 min estoura o `loginRateLimit`**
   (4.5 usa ~6 logins, 4.6 usa 3, cap = 10/IP/15min). O limitador **não foi
   enfraquecido**. Procedimento: reiniciar o backend entre os dois specs (o store
   é em memória) ou aguardar a janela. O spec da 4.6 já minimiza o custo usando
   **um `BrowserContext` por conta** — 3 logins em vez de 11.

3. **`sale_request_owner_final_decisions` sem CASCADE** é intencional. O seed de
   E2E ganhou o DELETE explícito; qualquer outro reset de ambiente precisará do
   mesmo.

4. **Reabertura da disputa não existe.** Se for desejada, exige fase própria com
   conceito de rodada/ciclo — ver §3 acima e o cabeçalho da migration 059.

---

## GO / NO-GO

| # | Critério | |
|---|---|---|
| 1 | main contém a 4.5 (`830390c9`) | ✅ |
| 2 | migration 059 fresh verde | ✅ |
| 3 | upgrade 058 → 059 verde | ✅ |
| 4 | estados antigos preservados (todos os 7) | ✅ |
| 5 | `final_offer_accepted` exige seleção | ✅ 23514 |
| 6 | `final_offer_rejected` exige seleção | ✅ 23514 |
| 7 | owner decision é append-only | ✅ sem updated_at/deleted_at/status |
| 8 | owner decision única por request | ✅ UNIQUE + 23505 |
| 9 | amount vem do banco, não do browser | ✅ service + repo + FK |
| 10 | owner pode aceitar | ✅ |
| 11 | owner pode rejeitar | ✅ |
| 12 | PF errada recebe 404 | ✅ indistinguível |
| 13 | `final_offer_declined` não pode ser aceito | ✅ 409 |
| 14 | same-decision retry idempotente | ✅ |
| 15 | opposite-decision retry = 409 | ✅ |
| 16 | accepted × rejected serializado | ✅ 6 rodadas com jitter |
| 17 | estado e trilha nunca divergem | ✅ mapa único |
| 18 | notification atômica | ✅ rollback provado |
| 19 | notification idempotente | ✅ chave determinística |
| 20 | seller/dealer PII protegida | ✅ |
| 21 | losers continuam 404 | ✅ nos dois estados |
| 22 | nenhuma disputa reaberta | ✅ |
| 23 | dados de inspeção intactos | ✅ `to_jsonb` antes/depois |
| 24 | proposta final imutável | ✅ |
| 25 | cancelamento não cria falso sucesso | ✅ 409 |
| 26 | copy não afirma venda concluída | ✅ testado + mutação |
| 27 | PostgreSQL real verde | ✅ 32/32 |
| 28 | regressão 4.5 verde | ✅ unit + integração + E2E |
| 29 | E2E 4.6 verde | ✅ |
| 30 | responsive verde | ✅ 6 larguras |
| 31 | screenshots geradas | ✅ 8/8 |
| 32 | zero regressão nova | ✅ pré-existentes provadas |

## **GO**

Com a ressalva do item 2 das dívidas (procedimento de execução dos dois E2E) e
sem alterar o gate: nenhum critério depende dela.

**NÃO MERGEADO. NÃO DEPLOYADO.** Aguardando revisão.
