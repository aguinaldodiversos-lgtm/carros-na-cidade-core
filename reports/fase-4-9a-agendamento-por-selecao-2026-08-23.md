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
