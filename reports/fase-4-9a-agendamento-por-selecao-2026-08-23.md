# Fase 4.9A — Schema + backend do agendamento por seleção

| | |
|---|---|
| Branch | `codex/sale-request-whatsapp-recovery` |
| Base | `70932440` (main, contém `0c11cf29` homologado) |
| Migration | **061** — a única |
| Frontend | **nenhuma alteração** (é a 4.9B) |
| Arquivos alterados | **7** (2 de produção, 1 migration, 4 de teste) |

---

## 1. A migration 061

Troca o dono da agenda: ela deixa de pertencer à **solicitação** e passa a
pertencer à **seleção**.

```
UNIQUE (sale_request_id)  →  UNIQUE (selection_id)
```

Sete passos, nesta ordem:

1. `ADD COLUMN selection_id BIGINT` — nasce NULL para o backfill poder rodar;
2. chave candidata `UNIQUE (id, sale_request_id, advertiser_id)` em
   `sale_request_offer_selections` — alvo da FK do passo 4;
3. **o backfill, com recusa de adivinhar** (§2);
4. FK composta de **três** colunas;
5. índice novo entra **antes** de o antigo sair — a tabela nunca fica sem
   garantia de unicidade, nem por um comando;
6. `SET NOT NULL`;
7. índice de leitura por solicitação, para o histórico.

### Por que TRÊS colunas na FK, e não duas

O escopo aprovado dizia `(selection_id, sale_request_id)`. Isso prova que a
seleção é da mesma **solicitação** — mas não que é da mesma **loja**. Uma
inspeção poderia declarar `advertiser_id = A` apontando para a seleção da loja B,
e nada reclamaria.

A terceira coluna fecha isso sem trigger e sem código, e é o que torna o §12
uma prova estrutural em vez de uma regra de aplicação. A chave candidata que ela
exige é trivialmente única (`id` é PK), então não pode falhar — e é o mesmo
padrão que a própria 058 já usara em
`sale_request_inspections_id_request_advertiser_unique`.

```
FOREIGN KEY (selection_id, sale_request_id, advertiser_id)
REFERENCES sale_request_offer_selections (id, sale_request_id, advertiser_id)
```

Sem `ON DELETE`: seleção não é apagada (trilha append-only desde a 4.4), e
`CASCADE` removeria justamente a agenda que alguém consultaria para entender o
que aconteceu.

---

## 2. Backfill — e a recusa de adivinhar

Toda inspeção existente é anterior à 4.7 (os três writers estão em 409 desde
então), e antes da 4.7 a tabela de seleções tinha `UNIQUE (sale_request_id,
advertiser_id)`. Logo, o par identifica **uma** seleção.

Isso é uma afirmação sobre dados, e afirmação sobre dados se verifica. A
migration **conta** os candidatos e **aborta** se algum não for exatamente 1:

```sql
IF ambiguas > 0 THEN
  RAISE EXCEPTION 'migration 061 abortada: % inspeção(ões) sem seleção única. %'
    USING HINT = 'Resolva manualmente antes de reaplicar. Nao adivinhe a selecao.';
END IF;
```

Abortar é o comportamento certo: escolher por `min(id)` transformaria um caso
desconhecido numa agenda atribuída ao match errado, em silêncio e para sempre.

### Verificado contra os dados REAIS de produção (read-only)

```
inspection 1 (sale_request 1, advertiser 64)
  → selection 1 (sale_request 1, advertiser 64)     advertiser_coerente: true

ambíguas: 0
```

A única inspeção de produção casa sem ambiguidade, e o `advertiser_id` bate —
então a FK de três colunas também passa. **A migration não abortaria em
produção.**

---

## 3. Prova de que o agendamento NÃO foi modificado

O §2 pedia que a lógica do agendamento não mudasse. O diff sustenta isso:

| Arquivo | Alterado? |
|---|---|
| `sale-requests.inspection.validation.js` (516 linhas) | **não** |
| `sale-requests.inspection.constants.js` (238 linhas) | **não** |
| Regras de horário, disponibilidade, rodadas de slots | **não** |
| `sale_request_inspection_slots` (tabela, FKs, UNIQUE) | **não** |
| `insertSlots`, `markRoundPublished`, `listCurrentSlots`, `findCurrentSlot`, `confirmSlot`, `requestNewSlots` | **não** |
| Textos, notificações, concorrência do agendamento | **não** |

O que mudou no backend, e só isso:

**`sale-requests.inspection.repository.js`**

- `readInspectionRow` — passa a chegar à inspeção **pela seleção atual**;
- `readCurrentSelectionId` — **nova**, resolve o match vigente;
- `lockRequestForDealer` / `lockRequestForOwner` — devolvem `current_selection_id`;
- `createInspection` — grava `selection_id`; `ON CONFLICT (selection_id)`;
- `getInspectionForRequest` — passa pela seleção atual;
- `getInspectionForSelection` — **nova**, a leitura do histórico.

**`sale-requests.inspection.service.js`** — 11 linhas: passa `selectionId` na
criação, recusa cedo se não houver match vigente, e **remove 3 guards**.

### Por que `getInspectionForSelection` é uma função separada

`getInspectionForRequest` responde "qual é a agenda **vigente**?"; a nova
responde "qual foi a agenda **daquele** match?". Uma função só, com um parâmetro
decidindo entre as duas, é exatamente o tipo de função que um dia devolve a
agenda de um match morto para a tela do match vivo.

---

## 4. Os guards: 3 saem, 3 ficam

| Writer | Antes | Agora |
|---|---|---|
| `offerInspectionSlots` | 409 | **liberado** |
| `confirmInspectionSlot` | 409 | **liberado** |
| `requestNewInspectionSlots` | 409 | **liberado** |
| `completeInspection` | 409 | **409** |
| `submitPostInspectionDecision` | 409 | **409** |
| `decideFinalOffer` | 409 | **409** |

A ficha de avaliação e a proposta final continuam fora do produto. As colunas
`observed_*` e as duas tabelas de decisão não foram tocadas — há teste de schema
provando isso (§1 da suíte).

---

## 5. Os 16 cenários exigidos

Suíte nova: `tests/integration/sale-request-inspection-per-selection.integration.test.js`
— **14 testes, PostgreSQL real, banco criado e destruído por execução.**

| # | Cenário | Onde | |
|---|---|---|---|
| 1 | migration fresh | §1 — coluna, NOT NULL, índice antigo removido | ✅ |
| 2 | upgrade 060→061 | §2 — desfaz a 061, povoa como a 4.5, reaplica | ✅ |
| 3 | Loja A agenda | §3–§7 | ✅ |
| 4 | no_agreement | §3–§7 | ✅ |
| 5 | Loja B aceita | §3–§7 | ✅ |
| 6 | Loja B cria agenda própria | §3–§7 — duas linhas, uma por match | ✅ |
| 7 | agenda A não reaparece | §3–§7 + §15 | ✅ |
| 8 | A → no_agreement → rodada 2 → A de novo | §8–§10 | ✅ |
| 9 | agenda antiga não é reutilizada | §8–§10 — duas seleções, duas agendas | ✅ |
| 10 | nova selection de A recebe agenda nova | §8–§10 | ✅ |
| 11 | seleção de OUTRA solicitação | §11 — `23503` | ✅ |
| 12 | seleção incompatível (outra loja) | §12 — `23503` | ✅ |
| 13 | `UNIQUE (selection_id)` | §13 — `23505` | ✅ |
| 14 | concorrência na criação | §14 — duas simultâneas, UMA agenda | ✅ |
| 15 | leitura usa a seleção atual | §15 — 3 testes | ✅ |
| 16 | writers aposentados em 409 | §16 | ✅ |

### O teste do §2 é o único lugar onde o backfill pode ser provado

Ele exige uma inspeção **legada**, criada quando `selection_id` não existia. O
roteiro desfaz a 061 no banco de upgrade, insere a linha do jeito que a 4.5
inseria, reaplica a migration, e confere que a inspeção recebeu **a seleção
histórica correta** — não "uma qualquer".

### Uma armadilha que quase passou: o teste que não mordia

A primeira versão do §15 asseverava "depois da resseleção, a leitura devolve a
agenda da Loja B". Passava — e **continuou passando** quando mutei o repositório
para ignorar a seleção por completo.

O motivo: com **duas** agendas na tabela, um `LIMIT 1` sem `ORDER BY` devolve
qualquer uma, e naquela execução calhou de ser a certa. Um teste que acerta por
sorte metade das vezes não prova nada.

A versão que ficou é determinística: a Loja B é aceita e **não** agenda, então
existe **uma única linha** — a da Loja A. A leitura correta devolve `null`; a
leitura não escopada devolve a agenda da Loja A, sem ambiguidade de ordem
física. Verificado por mutação:

| Mutação | Resultado |
|---|---|
| `getInspectionForRequest` volta a filtrar por `sale_request_id` | ❌ vermelho |
| guard de `offerInspectionSlots` restaurado | ❌ vermelho |

---

## 6. Achado — `handoff_failed` mantém o ponteiro

A 4.7 decidiu **não** mexer em `selected_offer_id` quando o proprietário informa
que não houve acordo (`moveRequestStatus`, handoff.repository): o ponteiro
continua na oferta que falhou, porque é ela que a tela nomeia.

Consequência direta para a 4.9A: nesse estado a seleção "atual" é a que falhou, e
a agenda que o DTO devolve é a dela.

**Não é bug** — é o ponteiro fazendo o que a 4.7 mandou, e não mexi nisso porque
o §16 proíbe alterar `no_agreement`. Mas é uma **armadilha para a 4.9B**:

> A tela NÃO pode renderizar "avaliação agendada" ao lado de "não houve acordo".

Há um teste fixando esse comportamento, para que ele fique visível e não mude em
silêncio.

---

## 7. Testes que mudaram, e por quê

Nenhum foi enfraquecido para passar. Os quatro que mudaram, mudaram porque a
verdade mudou:

| Arquivo | Mudança |
|---|---|
| `sale-requests-legacy-flow.test.js` | "os SEIS recusam" → "os TRÊS da ficha recusam"; **+3 testes novos** provando que os do agendamento **não** respondem mais `LEGACY_FLOW_RETIRED` |
| `sale-request-legacy-flow.integration.test.js` | idem, na camada de integração |
| `fake-db.js` | `inspectionOf` passa pela seleção atual; `ON CONFLICT` por seleção; matcher da query nova |
| Fixtures das duas suítes | ganham `selection_id`, refletindo o banco **depois** da migration |

Duas correções de asserção minhas, não do produto: uma comparava contra um valor
que a própria fixture já semeava (`observed_mileage`), e o teste do guard-antes-
do-lock foi repontado para `completeInspection`, que continua aposentado — a
propriedade sob teste é a mesma.

---

## 8. Gates

| Gate | Resultado |
|---|---|
| `npm test` (backend completo) | ✅ **3446 passed**, 1 skipped (212 arquivos) |
| Integração do domínio (5 arquivos) | ✅ **146** |
| … incluindo a suíte nova | ✅ **14** |
| Concorrência 4.7 (seleção×seleção, ×rodada, rodada×rodada) | ✅ intacta |
| `vitest run components/account` (frontend) | ✅ 342 (17 arquivos) |
| `tsc --noEmit` | ✅ limpo |
| `next lint` | ✅ sem warnings |
| Teste por mutação (2 mutações) | ✅ as duas ficam vermelhas |
| Migration aplicada no Postgres local | ✅ `applied: 1` |
| Backfill contra dados de produção | ✅ 0 ambíguas, advertiser coerente |

Frontend não foi tocado: `git status` não lista nenhum arquivo de `frontend/`.

---

## 9. Invariantes que a 4.9A passa a garantir

1. **Uma agenda por match** — `UNIQUE (selection_id)`.
2. **A agenda é daquela solicitação E daquela loja** — FK de três colunas.
3. **A leitura vigente parte do ponteiro do match**, nunca de "a agenda desta
   solicitação".
4. **A mesma loja aceita duas vezes ganha duas agendas independentes** — e a
   velha não é reaproveitada nem alcançada.
5. **A agenda de um match encerrado não vaza para o match seguinte.**
6. **A ficha e a proposta final continuam aposentadas.**

---

## 10. Dívidas

**D1 — A 4.9B precisa tratar `handoff_failed`.** Ver §6. É a única armadilha
conhecida que a 4.9A deixa aberta, e ela é de tela.

**D2 — Dois vocabulários de "rodada" convivem.** `schedule_round` (rodadas de
horários, base 0) e `current_round_number` / `round_number` (rodadas de ofertas,
base 1). Nenhum está errado; juntos são uma armadilha de leitura. Não renomeei
nada nesta fase — seria mudança de schema fora do escopo.

**D3 — `getInspectionForSelection` ainda não tem consumidor.** Foi escrita para
a leitura de histórico da 4.9B. Uma função sem chamador é o padrão que as
migrations 030 e 052 documentam como problema; se a 4.9B não a usar, deve ser
removida.

---

## GO

Schema e backend prontos. A agenda pertence ao match, o banco prova isso sem
trigger, e o cenário A→B→A — que motivou a fase — tem teste contra PostgreSQL
real.

Nada de frontend, nenhuma migration além da 061, nenhuma monetização, e a ficha
de avaliação e a proposta final continuam fora do produto.

**NÃO PUSHADO. NÃO MERGEADO. NÃO DEPLOYADO.** Aguardando revisão antes da 4.9B.

---
---

# Checagem final de autorização do agendamento

Pergunta: **um match encerrado por `no_agreement` consegue continuar alterando a
agenda?**

Resposta: **não.** E o backend já bloqueava — nenhuma linha de produção foi
alterada nesta checagem.

| | |
|---|---|
| Código de produção alterado | **nenhum** (`git status -- src/` vazio) |
| Testes adicionados | **5** |
| Migration | intacta |
| `no_agreement`, rounds, WhatsApp, ficha, proposta final | intactos |

---

## 1. Auditoria antes de mexer (§3)

O padrão para "o estado não permite" já existia, e foi **reutilizado** — nenhum
código de erro novo foi inventado:

| Writer | Guard existente | Resposta em `handoff_failed` |
|---|---|---|
| `offerInspectionSlots` | `status !== OFFER_SELECTED` | **409** `INSPECTION_INVALID_STATE` |
| `requestNewInspectionSlots` | `status !== OFFER_SELECTED` | **409** `INSPECTION_INVALID_STATE` |
| `confirmInspectionSlot` | `status !== OFFER_SELECTED` | **409** `INSPECTION_ALREADY_SCHEDULED` |

Para a loja que deixou de ser o match, a recusa vem antes e é mais forte: o
`WHERE` de `lockRequestForDealer` junta por `selected_offer_id` **e**
`o.advertiser_id`, então a linha não casa e a resposta é **404** — o mesmo 404
indistinguível que a perdedora recebe desde a 4.4.

Os três guards estavam ali desde a 4.5. O que faltava era **prova**.

---

## 2. `handoff_failed` × os três writers (§2, §6)

Cenário: A oferta → PF aceita → A envia horários → PF informa `no_agreement` →
`handoff_failed`, com `selected_offer_id` **ainda apontando para a oferta de A**
(a premissa do §1).

| Tentativa | Resultado |
|---|---|
| `offerInspectionSlots` | ❌ 409 `INSPECTION_INVALID_STATE` |
| `requestNewInspectionSlots` | ❌ 409 `INSPECTION_INVALID_STATE` |
| `confirmInspectionSlot` | ❌ 409 `INSPECTION_ALREADY_SCHEDULED` |
| Nenhum erro de constraint vazando (`23xxx`) | ✅ |

E nada mudou no banco. A asserção não conta linhas — compara uma **fotografia
completa** de `sale_request_inspections` + `sale_request_inspection_slots`
(`snapshotAgenda`), porque `schedule_round`, `confirmed_slot_id` e
`schedule_status` são exatamente os campos que um writer indevido alteraria
**sem mudar contagem nenhuma**.

A agenda encerrada continua no banco e continua presa à seleção que falhou —
aposentar um match não apaga histórico.

---

## 3. ACHADO — o beco que a 4.9A reabre

**`reportNoAgreement` exige `status === OFFER_SELECTED`.**

Confirmar um horário leva a solicitação a `inspection_scheduled`. De lá, o
proprietário **não consegue mais** informar que não houve acordo — e portanto não
consegue aceitar outra oferta nem abrir rodada nova. Fica preso.

Enquanto os três writers estavam aposentados, `inspection_scheduled` era
inalcançável e o beco não existia na prática. **A 4.9A devolve a agenda e, com
ela, o caminho até esse estado.**

Não corrigido aqui, por três razões: o §16 desta checagem proíbe alterar
`no_agreement`; decidir quais estados encerram um handoff é decisão de produto; e
a correção mínima (aceitar `inspection_scheduled` como estado encerrável) muda a
máquina de estados da 4.7, o que exige aprovação sua.

Há teste fixando o comportamento — `ACHADO — com horário confirmado, o handoff
não pode mais ser encerrado` — para que a decisão seja tomada de olhos abertos e
para que a regra não mude em silêncio.

> **Efeito colateral bom:** o ramo idempotente de `confirmInspectionSlot` (que
> responde `ok` antes do guard de status, para o duplo clique) é **inalcançável**
> em `handoff_failed` — ter um horário confirmado implica `inspection_scheduled`,
> e de lá não se chega a `handoff_failed`. A exceção que eu suspeitava não
> existe.

---

## 4. A → B (§4)

| Ator | Ação | Resultado |
|---|---|---|
| Loja A (encerrada) | `offerInspectionSlots` | ❌ **404** — a oportunidade deixou de existir para ela |
| Loja A | efeito no banco | **nenhum** (snapshot idêntico) |
| Loja B (aceita) | `offerInspectionSlots` | ✅ permitido |
| PF | `confirmInspectionSlot` | ✅ confirma — e o horário é **da Loja B** |

Provado no banco: os horários de cada loja ficam presos à **sua** seleção.

```
slots da Loja A  →  selection A
slots da Loja B  →  selection B
```

Nunca `agenda A → selection B`, nunca `agenda B → selection A`. E a única agenda
com `confirmed_slot_id` é a da Loja B.

---

## 5. A → rodada 2 → A (§5)

O cenário que motivou toda a fase.

```
selection A1 — rodada 1 — histórica  →  agenda A1
selection A2 — rodada 2 — atual      →  agenda A2
```

| Prova | |
|---|---|
| Duas seleções, **mesma loja** | ✅ |
| Sem aceite na rodada 2, A não agenda | ✅ recusado |
| `UNIQUE(selection_id)` permite as duas agendas | ✅ |
| A2 recebe o `selection_id` da selection A2 | ✅ |
| A1 continua presa à selection A1 | ✅ |
| A leitura da agenda vigente devolve **só A2** | ✅ |

O discriminador da última asserção é o **id** da agenda, e não o sub-estado —
que pode coincidir entre as duas e mascarar o defeito.

---

## 6. Leitura da agenda atual (§6, §15)

A leitura vigente parte de `selected_offer_id` → seleção atual → agenda daquela
seleção. Casos cobertos:

- match com agenda → devolve a agenda **daquele** match;
- match novo **sem** agenda → devolve `null`, e **não** a agenda da loja
  anterior (o caso determinístico, ver §7);
- `handoff_failed` → devolve a agenda da seleção que falhou, porque o ponteiro
  continua nela. Fixado em teste, e é a armadilha nº 1 da 4.9B: **a tela não
  pode renderizar "avaliação agendada" ao lado de "não houve acordo"**.

Nenhum DTO foi alterado para deixar teste bonito (§6). A 4.9B decide o que
renderizar.

---

## 7. Mutações (§8)

| Mutação | Testes vermelhos | |
|---|---|---|
| Guard de status aceita `HANDOFF_FAILED` | `os TRÊS writers da agenda são recusados` | ✅ |
| `readInspectionRow` busca por `sale_request_id` | **5 testes**, incluindo `A → rodada 2 → A` e `A encerrada × B ativa` | ✅ |

A segunda mutação é a que o §8 exige explicitamente, e ela derruba o cenário §5
como previsto. Ambas foram revertidas na mesma execução; nenhuma foi commitada.

> Uma armadilha já registrada na 4.9A vale repetir: com **duas** agendas na
> tabela, um `LIMIT 1` sem `ORDER BY` acerta por sorte. O teste que garante
> detecção é o determinístico — Loja B aceita e **não** agenda, então existe uma
> linha só.

---

## 8. Regressões (§11)

| Suíte | Resultado |
|---|---|
| `sale-request-inspection-per-selection.integration` | ✅ **19** (era 14) |
| `sale-request-handoff-rounds.integration` | ✅ |
| `sale-request-offer-selection.integration` | ✅ |
| `sale-request-legacy-flow.integration` | ✅ |
| `sale-requests-schema.integration` | ✅ |
| **Integração do domínio, total** | ✅ **151** (era 146) |
| `tests/sale-requests` | ✅ **468** |
| Concorrência da 4.7 | ✅ intacta |

**`npm test` completo não foi repetido**, e o §11 permite: nenhum arquivo de
produção mudou — `git status -- src/` está vazio. As 3446 já haviam rodado
verdes no commit `241febda`, sobre exatamente o mesmo código de produção. Rodar
de novo exercitaria as mesmas linhas.

---

## GO FINAL — 4.9A

Todos os writers da agenda são bloqueados depois do `no_agreement`, com recusa
de domínio e sem tocar no banco. A loja anterior não escreve nada; a loja nova
opera normalmente; a mesma loja reaceita numa rodada seguinte ganha agenda
própria e não herda a antiga.

O backend já estava correto — esta checagem só provou, e o que faltava era
prova. **Nenhuma linha de produção foi alterada.**

Fica **uma pendência de produto** para decidir antes da 4.9B: o beco do §3.
Ela não viola o invariante do §1 e não bloqueia o schema/backend da 4.9A, mas
precisa de decisão sua — porque com a agenda de volta, um proprietário que
confirma horário e não fecha negócio hoje não tem saída pelo portal.

**NÃO PUSHADO. NÃO MERGEADO. NÃO DEPLOYADO.**

---
---

# Correção do beco após agendamento

O achado da checagem anterior, corrigido. Com a agenda de volta, encerrar o
handoff **depois** de marcar a visita passou a ser o caso normal — e a igualdade
`status === offer_selected` prendia o proprietário exatamente aí.

| | |
|---|---|
| Arquivos de produção alterados | **2** |
| Migration | **intacta** (061 não foi tocada) |
| Agendamento (validação, slots, repositories) | **intacto** |
| Frontend | **intacto** |

---

## 1. Auditoria antes de implementar (§11)

Não existia `ACTIVE_HANDOFF_STATUSES`. As listas próximas não servem:

| Lista | Por que não |
|---|---|
| `SALE_REQUEST_SELECTED_STATUSES` | ampla demais — inclui os seis legados |
| `SALE_REQUEST_SELECTABLE_STATUSES` | responde outra pergunta (onde se pode *aceitar*) |
| `SALE_REQUEST_LEGACY_STATUSES` | é o oposto, e alimenta a mensagem de recusa |

Criada a menor abstração correta, como allowlist explícita:

```js
export const SALE_REQUEST_ACTIVE_HANDOFF_STATUSES = Object.freeze([
  SALE_REQUEST_STATUS.OFFER_SELECTED,
  SALE_REQUEST_STATUS.INSPECTION_SCHEDULED,
]);
```

**Allowlist, e não `status !== 'cancelled'`.** Uma regra aberta reabriria de
brinde os seis estados do fluxo aposentado. Enumerar é o mesmo princípio de
todas as listas do arquivo: um estado novo criado por uma fase futura não entra
em nenhuma, e o erro aparece na hora.

> **`inspection_scheduled` está TAMBÉM em `SALE_REQUEST_LEGACY_STATUSES`.** Não é
> contradição: o estado passou a ter duas origens. Linhas anteriores à 4.7
> chegaram nele pela máquina antiga; linhas novas chegam pelo agendamento
> restaurado. Para *encerrar* o handoff as duas se comportam igual — e a lista
> legada continua servindo à mensagem dos outros estados e à tela somente-leitura.

---

## 2. O diff de produção

**`sale-requests.constants.js`** — a allowlist nova (+41 linhas, quase todas
comentário explicando por que a igualdade antiga estava certa e deixou de estar).

**`sale-requests.handoff.service.js`** — três linhas efetivas:

```diff
+  SALE_REQUEST_ACTIVE_HANDOFF_STATUSES,          // import

-  if (request.status !== SALE_REQUEST_STATUS.OFFER_SELECTED) {
+  if (!SALE_REQUEST_ACTIVE_HANDOFF_STATUSES.includes(request.status)) {

-      fromStatus: SALE_REQUEST_STATUS.OFFER_SELECTED,
+      fromStatus: request.status,
```

### Por que `fromStatus: request.status`

O `fromStatus` vai no `WHERE` do `UPDATE` — é ele que torna a transição única e
verificável. Trocá-lo por uma lista enfraqueceria a garantia; trocá-lo pelo
**estado lido sob o lock** mantém a disciplina intacta, agora sobre o valor que
de fato estava lá. Zero alteração no repositório.

---

## 3. Encerrar preserva a agenda (§2, §6)

O teste principal segue o roteiro: A oferta → PF aceita → A envia horários → PF
**confirma** um → `inspection_scheduled` → `reportNoAgreement`.

| Prova | |
|---|---|
| status final = `handoff_failed` | ✅ |
| outcome `no_agreement`, exatamente **1** | ✅ |
| `sale_request_inspections` inalterada | ✅ |
| slots inalterados | ✅ |
| `confirmed_slot_id` permanece | ✅ |
| `schedule_round` / `schedule_status` permanecem | ✅ |
| `selection_id` / `advertiser_id` permanecem | ✅ |
| a agenda continua presa à seleção histórica | ✅ |

A asserção de "nada mudou" não conta linhas: compara a **fotografia completa** de
inspeções + slots. Contagem não pegaria um `UPDATE` que altera uma linha sem
criar outra — e `confirmed_slot_id` e `schedule_round` são exatamente esses
campos.

**A agenda não é lixo: é histórico.** Só o match deixa de ser ativo.

---

## 4. Idempotência (§3)

Retry de `reportNoAgreement` em `handoff_failed` → **200 / `changed:false`**,
**um único** `sale_request_handoff_outcome`, snapshot idêntico. O guard de
idempotência roda antes do de estado, como já rodava — não foi tocado.

---

## 5. Recuperação depois do encerramento (§7)

Partindo de agenda **confirmada** e encerrada:

| Caminho | |
|---|---|
| **A.** PF aceita a Loja B | ✅ e B cria a **própria** agenda |
| **B.** PF abre nova rodada | ✅ `receiving_offers`, `current_round_number = 2` |

E no caminho A: a seleção de A permanece, a agenda de A permanece **com o
horário confirmado intacto**, a leitura vigente devolve a Loja B — nunca a A.

---

## 6. A → rodada 2 → A, via agenda confirmada (§8)

O cenário crítico, agora percorrendo o caminho novo:

- A1 **intacta** — comparação do JSON da linha inteira, antes e depois;
- A2 independente, com o `selection_id` da seleção nova;
- leitura vigente = **A2**, discriminada por **id** (não por sub-estado, que
  pode coincidir e mascarar o defeito);
- a agenda antiga nunca ressurge.

---

## 7. Concorrência: confirmar × encerrar (§9)

Cinco execuções com jitter de **0, 3, 9, 17 e 25 ms**. As duas transações travam
a mesma linha de `sale_requests`, então serializam — e os dois entrelaçamentos
são legítimos.

O que o teste garante é o **invariante**, não o vencedor:

- se `reportNoAgreement` concluiu com sucesso → estado final **é**
  `handoff_failed`;
- o estado final é sempre um dos dois esperados, nunca um terceiro;
- terminando em `handoff_failed`, **nenhum writer de agenda posterior vence** —
  e o snapshot prova que não escreveu;
- **no máximo um** outcome, nunca dois.

---

## 8. A allowlist não foi ampliada demais (§10)

Os sete estados proibidos continuam recusando com **409
`SALE_REQUEST_HANDOFF_NOT_ACTIVE`**, e nenhum grava desfecho:

```
receiving_offers · cancelled · inspection_completed
final_offer_submitted · final_offer_declined
final_offer_accepted · final_offer_rejected
```

Mais uma asserção direta sobre a constante: a allowlist tem **exatamente dois**
estados. É ela que falha se alguém acrescentar um terceiro sem pensar.

---

## 9. Mutações (§12)

| Mutação | Vermelhos | |
|---|---|---|
| **A** — remove `inspection_scheduled` da allowlist | **6**, incluindo o teste principal do §6, os dois de recuperação e o de rodada 2 | ✅ |
| **B** — admite `inspection_completed` | **2** — os dois do §10 | ✅ |

Ambas revertidas na mesma execução; nenhuma commitada. `git diff` da constante
mostra só as +41 linhas legítimas.

---

## 10. Regressão (§13)

| Gate | Resultado |
|---|---|
| Suíte da 4.9A (`inspection-per-selection`) | ✅ **30** (era 19) |
| Integração do domínio, total | ✅ **162** (era 151) |
| `tests/sale-requests` | ✅ **469** (era 468) |
| **`npm test` completo** | ✅ **3447 passed**, 1 skipped (212 arquivos) |
| Concorrência da 4.7 | ✅ intacta |
| `tsc --noEmit` / `next lint` | ✅ / ✅ |
| Os 3 writers de agenda em `handoff_failed` | ✅ continuam bloqueados |

Este último merece ênfase: **corrigir a saída não abriu a entrada**. Depois do
`no_agreement`, `offerInspectionSlots`, `confirmInspectionSlot` e
`requestNewInspectionSlots` continuam recusando com 409, e o snapshot do banco
continua idêntico.

---

## Dívida atualizada

**D1 — RESOLVIDA.** Era o beco. A 4.9B não precisa mais tratá-lo como bloqueio;
continua precisando decidir o que a tela renderiza em `handoff_failed` quando
existe uma agenda histórica (**não pode** mostrar "avaliação agendada" ao lado de
"não houve acordo").

**D2** (dois vocabulários de "rodada") e **D3** (`getInspectionForSelection` sem
consumidor) seguem abertas, inalteradas.

---

## GO FINAL — 4.9A

O beco fechou com a menor alteração possível: uma allowlist e duas linhas de
guard. A agenda sobrevive ao encerramento como histórico auditável, a
recuperação (outra oferta / nova rodada) funciona a partir de agenda confirmada,
a concorrência mantém o invariante sob jitter, e nenhum estado legado foi
reaberto.

Backend da 4.9A fechado. **Pronto para a 4.9B.**

**NÃO PUSHADO. NÃO MERGEADO. NÃO DEPLOYADO.**
