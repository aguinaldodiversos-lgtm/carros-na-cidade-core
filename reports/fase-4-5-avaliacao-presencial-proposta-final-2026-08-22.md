# Fase 4.5 — Avaliação presencial + proposta final da loja selecionada

**Data:** 2026-08-22/23
**Branch:** `codex/sale-request-inspection-final-offer`
**Base SHA:** `a357d7f841bd902b77aded8cdf1ca5103239428f` (main, merge da 4.4 + 4.4.1)

> **Veredito: GO técnico**, com as ressalvas de escopo e as dívidas listadas no
> fim. Nada mergeado, nada deployado.

---

## 1. Auditoria Fase 4.5 (§2)

Feita **antes** de qualquer alteração. O que foi encontrado, e o que cada achado
decidiu:

| Item auditado | Estado encontrado | Consequência |
|---|---|---|
| CHECK de coerência da 057 | `status <> 'offer_selected' ⟹ seleção NULL` | **precisou ser reescrito** — todo estado novo cairia no ramo que exige seleção nula (§6/§43) |
| CHECK de status (057) | 3 valores | DROP/ADD para 7 |
| `sale_request_offer_selections` | UNIQUE `(sale_request_id)`, 4 FKs NO ACTION | ganhou UNIQUE `(sale_request_id, advertiser_id)` para ser alvo da prova de "loja selecionada" |
| `sale_request_offers` | UNIQUE tripla `(id, sale_request_id, advertiser_id)` da 4.4.1 | **reaproveitada** — nenhuma chave nova foi precisa para a decisão |
| `advertisers` (endereço) | **`address` é um único TEXT livre** (migration 018) | entregar `name + address + city/UF`; **não** inventar schema estruturado (§14) |
| Rota de edição da loja | `/dashboard-loja/dados` (`StoreProfileForm`, campo `address`) | é o caminho REAL citado em `STORE_LOCATION_REQUIRED` |
| Migration 054 (ficha) | 20 colunas; **sem** `interior` e `vidros` | a ficha observada espelha só o que a PF declarou (§19) |
| `NOTIFICATION_EVENT_TYPE` | **`APPOINTMENT_CONFIRMED` já existia** | reutilizado (§35-C); só 4 eventos novos criados |
| `createUserNotification` | aceita `{ exec }` desde a 4.4 | reutilizado sem alteração |
| Padrão transacional | `withTransaction` + `SELECT … FOR UPDATE` em `sale_requests` | a 4.5 trava **a mesma linha** |
| Guard de cancelamento | comparava `=== 'offer_selected'` | **generalizado** — senão o "200 falso" da 4.4.1 voltaria |

### Dois achados que mudaram o desenho

**1. "Outro operador da mesma loja" é inexprimível hoje.** `advertisers` tem UM
`user_id` e não existe tabela de membros. O §4 pede que qualquer operador da loja
possa agir; o código faz a coisa certa e à prova de futuro — a autorização é
resolvida pelo **advertiser** (`o.advertiser_id = $2` no lock), nunca comparando
`dealer_user_id`. Mas o cenário de dois operadores **não pode ser testado**, e um
fixture que o simulasse estaria provando algo que o banco recusa. Está
documentado no teste e listado como dívida.

**2. O endereço comercial é texto livre.** Não há logradouro/número/bairro/CEP
separados. Devolvemos o que a loja cadastrou, sem tentar estruturar por
heurística — parsear endereço brasileiro erraria em silêncio, e mostrar endereço
errado é pior que mostrar endereço feio.

---

## 2. Migration `058_sale_request_inspection_final_offer.sql`

Seis blocos:

1. **CHECK de status** — DROP/ADD para 7 valores, todos com writer.
2. **CHECK de coerência REESCRITO** — o gate da fase (ver §3 abaixo).
3. **Chave candidata** `sale_request_offer_selections (sale_request_id, advertiser_id)`.
4. **`sale_request_inspections`** — uma por solicitação, com `schedule_status`
   interno, a rodada vigente, o horário confirmado e as 7 colunas `observed_*`.
5. **`sale_request_inspection_slots`** — append-only, por rodada.
6. **`sale_request_post_inspection_decisions`** — uma por solicitação.

### O CHECK que a fase inteira dependia (§6, §43)

```sql
-- ANTES (057) — quebra com qualquer estado novo
(status <> 'offer_selected' AND selected_offer_id IS NULL AND …)

-- DEPOIS (058) — partição EXPLÍCITA, os dois lados enumerados
(status IN ('offer_selected','inspection_scheduled','inspection_completed',
            'final_offer_submitted','final_offer_declined')
   AND selected_offer_id IS NOT NULL AND selected_offer_at IS NOT NULL)
OR
(status IN ('receiving_offers','cancelled')
   AND selected_offer_id IS NULL AND selected_offer_at IS NULL)
```

Enumerar os dois lados é mais verboso **e é o ponto**: um estado criado por uma
fase futura não entra em nenhuma lista e o CHECK falha na hora, obrigando quem o
criou a decidir de que lado ele fica. Com `<>`, o estado novo era silenciosamente
colocado no lado errado — foi exatamente o que aconteceu.

### Integridade composta (§29)

| Constraint | Prova |
|---|---|
| `inspections (sale_request_id, advertiser_id) → offer_selections` | a inspeção é da loja **selecionada** |
| `inspections (confirmed_slot_id, id) → slots (id, inspection_id)` | o horário confirmado é **desta** inspeção |
| `decisions (inspection_id, sale_request_id, advertiser_id) → inspections` | a decisão é **desta** inspeção e loja |
| `decisions (selected_offer_id, sale_request_id, advertiser_id) → offers` | a oferta preliminar é **desta** solicitação e loja |

Todas `MATCH SIMPLE` (padrão). `MATCH FULL` no par nullable rejeitaria toda
inspeção sem horário confirmado — travado por teste.

### CHECKs da decisão (§28)

- `final_offer` ⟹ `final_amount > 0`; `no_offer` ⟹ `final_amount IS NULL`;
- **redução exige justificativa** — `adjustment_reason IS NOT NULL OR final >= preliminary`;
- `other` exige nota não-vazia.

---

## 3. O princípio central (§3, §24, §26)

**Nenhuma regra da disputa preliminar se aplica à proposta final.** Não há
comparação com `minimum_accepted_price`, com a proposta selecionada nem com a
maior proposta. O único piso é `> 0`.

O que protege o proprietário não é um valor mínimo — é a **exigência de
justificativa quando o valor cai**, imposta em duas camadas (validador + CHECK).

Provado em quatro lugares: service, PostgreSQL real, e E2E, com o cenário
piso 62.500 / preliminar 65.000 / maior 67.000 / **final 60.000**.

---

## 4. Máquina de estados (§5)

```
receiving_offers → offer_selected ─┬─(schedule_status interno)─┐
                                   │  awaiting_slots           │
                                   │  awaiting_owner           │
                                   └───────────────────────────┘
                                          ↓ (horário confirmado)
                                   inspection_scheduled
                                          ↓
                                   inspection_completed
                                          ↓
                    ┌─────────────────────┴─────────────────────┐
             final_offer_submitted                     final_offer_declined
```

`awaiting_slots` e `awaiting_owner` **não** são status da oportunidade: são
passos do sub-processo de agendamento, e vivem em
`sale_request_inspections.schedule_status`. Do ponto de vista de quem vende o
carro, os dois querem dizer a mesma coisa — a visita ainda não foi marcada.

---

## 5. Data e hora (§10)

O payload exige **ISO 8601 com offset explícito** (`2026-08-25T14:30:00-03:00`).
`Z` é aceito — é offset explícito. Timestamp sem fuso é recusado com 400.

Nada no domínio menciona `America/Sao_Paulo`. As três alternativas de
adivinhação foram descartadas por escrito: fuso do processo (Render roda em UTC →
14:30 viraria 11:30), fuso do banco (mesmo problema), UF da cidade (Amazonas,
Acre e Fernando de Noronha não são Brasília, e a tabela de exceções envelheceria
em silêncio).

`Date.parse` aceita a string sem offset e produz um valor plausível — por isso a
checagem é sobre a **forma** do texto, antes da conversão. Travado por teste.

No cliente, `formatSlot` **não** fixa `timeZone`: formata no fuso de quem lê, que
é o certo para um compromisso. (Difere de `formatFipeReference`, que usa UTC de
propósito — lá o valor é uma referência mensal.)

---

## 6. Endereço da avaliação (§14)

A avaliação acontece **na loja**. Não existe campo livre de local — ele viraria
canal indireto para telefone/WhatsApp.

O proprietário recebe `name`, `address` e `city/UF`. **Não** recebe telefone,
e-mail, WhatsApp, CNPJ nem nome de operador: a query do repositório **não os
seleciona**, então não há campo escondido para o DTO esconder.

Sem endereço cadastrado, propor horários é bloqueado com
`INSPECTION_STORE_LOCATION_REQUIRED` e `action_path: "/dashboard-loja/dados"` —
a rota real, verificada na auditoria.

> Este guard foi **validado no E2E antes de a fase terminar**: a primeira
> execução falhou porque o seed não cadastrava endereço, e a tela mostrou a
> mensagem certa. O seed é que estava incompleto.

---

## 7. Três defeitos reais encontrados durante a fase

### 7.1 `FOR UPDATE OF sr` + `LEFT JOIN` = leitura obsoleta

A primeira versão trazia a inspeção por JOIN na própria query do lock. Em READ
COMMITTED, o `FOR UPDATE` re-avalia **apenas a linha travada** — as demais
tabelas do JOIN continuam vindo do snapshot anterior ao commit concorrente.

Efeito: dois cliques simultâneos no mesmo horário. O segundo esperava o lock,
acordava, lia `sr` atualizado e enxergava `confirmed_slot_id` ainda **nulo** —
não reconhecia o próprio retry e devolvia erro para uma ação que deu certo.

`FOR UPDATE OF sr, i` não resolve: o PostgreSQL proíbe `FOR UPDATE` no lado
nullable de um OUTER JOIN. A correção é ler a inspeção em **comando próprio**,
depois do lock — um comando novo pega um snapshot novo.

**Encontrado pelo teste de retry concorrente do §13.**

### 7.2 `is_selected` virava `false` na avaliação

`serializeSelection` nasceu na 4.4 comparando `status === 'offer_selected'`. Com
os estados novos, a tela da loja **escolhida** voltava a exibir o formulário de
**proposta**, dizendo "Recebendo propostas" e oferecendo um campo para cobrir um
lance que já não existe.

Nenhum teste de unidade da 4.4 pegou — todos olhavam só para `receiving_offers` e
`offer_selected`. **O E2E pegou, na tela.** Corrigido para
`SALE_REQUEST_SELECTED_STATUSES` e travado por um teste que percorre a máquina
inteira.

### 7.3 O guard de cancelamento repetiria o "200 falso" da 4.4.1

Mesmo padrão: igualdade com `offer_selected`. Cancelar durante a avaliação cairia
no ramo idempotente e a tela diria "cancelada" sobre uma solicitação com visita
agendada. Generalizado e travado por teste em todos os quatro estados.

> Os três são a **mesma classe de defeito**: uma igualdade que era correta quando
> existia um estado só. Registrado como padrão a vigiar.

---

## 8. Privacidade (§32, §39, §40)

| Fronteira | Garantia |
|---|---|
| Loja → proprietário | `advertiser_id`, `dealer_user_id`, `created_by`, `completed_by` **não** saem do DTO |
| `internal_note` | **coluna separada** de `adjustment_note`; a query do proprietário não a seleciona |
| Proprietário → loja | `DEALER_COLUMNS` sem JOIN em `users` (inalterado desde a 4.3) |
| Lojas perdedoras | **404** em todos os estados novos |
| Notificações | nenhuma carrega contato, dos dois lados |

`internal_note` existe como coluna própria porque misturá-la a `adjustment_note`
garantiria o vazamento: a primeira pessoa a escrever "combinar com o João, ramal
42" num campo compartilhado entregaria isso ao vendedor.

---

## 9. Resultados

| Suíte | Resultado |
|---|---|
| Backend `npm test` | **3449** ✅ (era 3395 na 4.4.1 → **+54**) |
| Service da 4.5 (`sale-requests-inspection`) | **54** ✅ |
| Integração PostgreSQL da 4.5 | **27** ✅ |
| Integração — 6 suítes de sale-requests | **168** ✅ (em série) |
| Frontend afetado (17 arquivos) | **✅** (em série) |
| `frontend typecheck` | **✅** |
| `frontend lint` | **✅** |
| `frontend build` | **✅** |
| `backend lint` | 11 erros em `scripts/` — **baseline** |

### Concorrência provada contra PostgreSQL real

| Cenário | Rodadas | Resultado |
|---|---|---|
| §13 horário × nova rodada | 6, com jitter | nunca confirma horário substituído |
| §13 horário × horário | 6, com jitter | exatamente um confirma |
| §13 retry do mesmo horário | concorrente | idempotente, **uma** notificação |
| §37 dois valores finais | 5, com jitter | exatamente uma decisão |
| §37 proposta × desistência | 5, com jitter | status **nunca** contradiz a decisão |
| rollback da notificação | gatilho no PG | sem decisão e sem aviso órfão |

### Gate §43 — o teste obrigatório

Banco com solicitação **real** em `offer_selected`, 058 aplicada em cima:
migration passa, a seleção sobrevive, e a solicitação percorre os quatro estados
novos mantendo `selected_offer_id` e `selected_offer_at` preenchidos. Um estado
da avaliação **sem** seleção é rejeitado com `23514`.

---

## 10. Regressões

**Quatro asserções de fases anteriores** foram atualizadas — todas porque a 4.5
mudou legitimamente o schema:

1. `aceita apenas os DOIS status desta fase` (052) → agora casa **qualquer um**
   dos dois CHECKs. Um status inventado viola o de status **e** o de coerência, e
   a ordem de avaliação entre CHECKs não é garantida pelo PostgreSQL — prender o
   nome de um deles era prender uma coincidência.
2. `o domínio tem exatamente as tabelas` → +3 tabelas da 4.5.
3. `CHECK de status recusa vocabulário inventado` (057) → mesma correção de (1).
4. Upgrade da 057 → precisa derrubar o que a 058 criou em cima (CASCADE, porque
   `inspections` e `slots` se referenciam mutuamente).

**Nenhuma regressão de comportamento.** As decisões das fases 4.1–4.4.1 estão
preservadas (§49) e cobertas pelas 168 asserções de integração.

### Ambiente

- **Docker Desktop não subia** durante a fase: um socket órfão
  (`sailor-ingest.sock`, de um crash em 21/08) travava o backend. Diagnosticado
  pelo log, o diretório `run` foi movido para o lado (nada apagado) e o engine
  voltou. Sem isso, nenhum gate de banco teria rodado.
- Suítes de integração e de componente **falham por contenção** quando rodam em
  paralelo (timeout de 5s, bancos temporários concorrentes). Em série: **verde**.
  Não é regressão — é o mesmo padrão já registrado na 4.4.

---

## 11. Dívidas

1. **"Outro operador da mesma loja" não é testável** — `advertisers` tem um
   `user_id` e não há tabela de membros. O código já resolve por advertiser; o
   cenário só poderá ser exercitado quando o schema suportá-lo.
2. **Endereço comercial é texto livre** — sem logradouro/número/CEP separados.
   Estruturá-lo exigiria migration própria e re-cadastro das lojas.
3. **Sem reagendamento depois de confirmado** (§17) — decisão da fase,
   documentada. Um horário confirmado só muda por intervenção manual.
4. **Sem no-show** — o produto não sabe o que fazer quando a pessoa não aparece.
5. **`final_offer_declined` não reabre a disputa** (§31) — a decisão sobre
   reabertura é da 4.6, e tomá-la aqui por omissão seria decidi-la sem ninguém
   perceber.
6. **11 erros de lint em `scripts/`** — baseline pré-existente, alheio à fase.

---

## 12. Gate final de testes — execução controlada

Rodada dedicada a fechar as evidências, sem tocar em funcionalidade.

### 12.1 Ambiente reiniciado ANTES da execução final

Foi descoberto que o backend Node estava executando código **anterior** à
correção de `serializeSelection` — Node não recarrega módulo, e o `is_selected`
antigo fazia a tela da loja escolhida voltar ao formulário de proposta.

Por isso, antes do gate:

- PIDs encerrados: **28100** (:3000) e **8552** (:4000); portas confirmadas livres;
- backend e frontend reiniciados **do working tree atual**;
- frontend reiniciado **de novo** depois do `next build` — o build sobrescreve o
  `.next` que o dev server usa, e isso já havia derrubado o servidor antes.

### 12.2 PostgreSQL

`carros-postgres-test` up, `0.0.0.0:5433→5432`, readiness pelo comando oficial
(`npm run integration:db:wait`). Alvo: `localhost:5433/carros_na_cidade_test` —
banco de **teste**. Produção não foi tocada.

### 12.3 Seed / reset (§4)

`npm run e2e:prepare` — **exit 0**, sem violação de CHECK nem de FK.

Estado imediatamente após o reset:

| requests | inspeções | horários | decisões | seleções |
|---|---|---|---|---|
| 1 | 0 | 0 | 0 | 0 |

**Zero lixo da execução anterior.** O reset exercitado é o corrigido nesta fase —
ver §12.6.

### 12.4 E2E

| Spec | Resultado |
|---|---|
| **E2E 4.5** (`sale-request-inspection-final-offer`) | **PASS** — 1 passed (22,2 s) |
| **E2E 4.4** (`sale-request-offer-selection`) | *(ver rodapé)* |
| **E2E 4.3** (`dealer-sale-offers`) | *(ver rodapé)* |
| **Responsive** (360/390/412/768/1024/1440) | **PASS** — dentro do E2E 4.5 |

Estado persistido ao fim do E2E 4.5, conferido no banco:

| campo | valor |
|---|---|
| `status` | **`final_offer_submitted`** |
| `mileage` (declarado) | **45.000** — intacto |
| `observed_mileage` | **64.230** |
| `preliminary_amount_snapshot` | 65.000,00 |
| `final_amount` | **60.000,00** |
| `adjustment_reason` | `mileage_difference` |

O §44 provado no dado real: a proposta final ficou abaixo do **piso (62.500)**, da
**selecionada (65.000)** e da **maior da disputa (67.000)**. O §45 também: a
declaração da pessoa não foi tocada.

A tolerância de overflow é **1px**, a mesma que o projeto já adotava para
subpixel — nenhuma tolerância nova foi inventada.

### 12.5 Um defeito no próprio E2E

A asserção de quilometragem comparava **62.000** — valor copiado do fixture de
service — com os **45.000** que o seed grava. Falhava na última asserção *depois*
de o fluxo inteiro ter passado.

Corrigido lendo o valor declarado da API no passo 1: o §45 exige provar a
**relação** (declarado ≠ observado, ambos visíveis, declarado não sobrescrito), e
não dois números específicos. O spec agora também assere que os dois divergem,
com mensagem própria se o seed mudar.

### 12.6 O reset e a referência circular

O endurecimento da 4.5 (FKs sem `ON DELETE CASCADE`) quebrou `e2e-seed.mjs` — o
mesmo padrão da 4.4.1, agora com um agravante:

```
slots.inspection_id           → inspections
inspections.confirmed_slot_id → slots
```

**Nenhuma ordem de DELETE resolve um ciclo.** É preciso soltar a referência
primeiro — e soltá-la sozinha violaria o CHECK de coerência, que exige
`confirmed_slot_id` preenchido em `scheduled`/`completed`.

O reset ficou: **UPDATE** devolvendo a inspeção ao estado inicial inteiro
(inclusive a ficha observada, pelo CHECK de conclusão) → DELETE dos horários →
DELETE das inspeções → DELETE das seleções → DELETE das solicitações. Tudo
escopado ao mesmo `owner_user_id`, nunca a tabela inteira.

Os CHECKs tornam qualquer meio-termo inexprimível — é a garantia funcionando, não
um obstáculo. E o seed também passou a cadastrar `address`, sem o qual a loja não
consegue agendar (descoberto pelo próprio E2E, que mostrou a mensagem correta).

### 12.7 A correção visual do §10

Depois da proposta final, o painel da 4.4 continuava anunciando
*"Aguardando próxima etapa — as próximas etapas serão disponibilizadas aqui"*
com a proposta final renderizada logo abaixo: pedia à pessoa que esperasse por
algo que já estava na tela.

O painel passou a receber `compact`: quando a avaliação começou, ele encolhe
para o **cabeçalho do negócio** (loja + valor preliminar) e deixa a etapa atual
ser contada pelo bloco da 4.5.

Travado por **duas asserções de componente**: antes da avaliação o texto de
espera está presente; depois que ela começa, ele some e o resumo permanece.
Confirmado também nas capturas `07` e `10`.

> Ao escrever a asserção esbarrei no **NBSP do `Intl`**: `style: "currency"`
> separa "R$" do número com U+00A0, e `textContent` cru não normaliza (os
> matchers do testing-library normalizam). A asserção usa o `data-testid` do
> valor.

### 12.8 `no_offer` — verificado, não presumido (§11)

Exigência de motivo em **duas camadas**:

**Banco** — `sale_request_post_inspection_decisions_reason_check`:

```sql
CHECK (adjustment_reason IS NOT NULL
       OR (decision_type = 'final_offer'
           AND final_amount >= preliminary_amount_snapshot))
```

Para `no_offer` a segunda metade é sempre falsa ⟹ motivo obrigatório. Provado
empiricamente: um INSERT direto sem motivo é barrado com **`check_violation`
(23514)**, *antes* mesmo da FK.

**Service** — `validateFinalDecision` lança `ADJUSTMENT_REASON_REQUIRED`; se o
motivo for `other`, exige nota (`ADJUSTMENT_NOTE_REQUIRED`).

**O que o proprietário recebe:** `type: "no_offer"`, `final_amount: null`, o
motivo e a nota. **Nunca** a `internal_note`.

Também no schema: `amount_check` garante `no_offer ⟹ final_amount IS NULL` — uma
desistência **com** valor é inexprimível.

**Sem NO-GO funcional.**

### 12.9 Screenshots (§9)

Em `reports/screenshots/fase-4-5/`, todas do estado **final** do código:

| Arquivo | Conteúdo |
|---|---|
| `01-dealer-propondo-horarios` | três horários preenchidos |
| `02-owner-escolhendo-horario-desktop` | opções + endereço comercial |
| `03-owner-escolhendo-horario-mobile-390` | mesma tela em 390px |
| `04-avaliacao-agendada` | horário confirmado |
| `05-dealer-preenchendo-avaliacao` | ficha observada |
| `06-dealer-proposta-final` | valor + diferença em tempo real + motivo |
| `07-owner-preliminar-vs-final` | comparação + tabela declarado × observado |
| `08-dealer-aguardando-decisao` | estado de espera da loja |
| `10-painel-selecao-sem-texto-obsoleto` | a correção do §10 |

O caminho `no_offer` **não teve captura**: reproduzi-lo exigiria uma rodada
inteira adicional (6 logins) para um estado que já está coberto por service e
PostgreSQL real. Registrado como dívida de evidência visual, não de
comportamento.

### 12.10 Gates de código, no estado final

| Gate | Resultado |
|---|---|
| Backend `npm test` | **3449 passed**, 1 skipped (pré-existente) |
| Domínio `tests/sale-requests/` | **471 passed**, 12 arquivos |
| Integração PostgreSQL — 6 suítes, **em série** | **168 passed**, 0 failed, 0 skipped, 35 s |
| Frontend afetado — 17 arquivos, em série | **passed** |
| `typecheck` | **passed** |
| `lint` frontend | **passed** |
| `build` frontend | **exit 0** |
| `lint` backend | **11 erros — todos em `scripts/`, ZERO em `src/`** (baseline) |

As suítes de integração e de componente falham por **contenção** quando rodam em
paralelo (timeout de 5 s, bancos temporários concorrentes). Em série: verde. Não
é regressão de produto — é o mesmo padrão já registrado na 4.4, e por isso o gate
roda em série.

---

## 13. Gate final (§52)

| # | Critério | Status |
|---|---|---|
| 1 | 058 aplica em banco novo | ✅ |
| 2 | upgrade 057 → 058 com `offer_selected` existente | ✅ |
| 3 | `selected_offer` obrigatório nos estados posteriores | ✅ |
| 4 | dealer envia 1–3 horários | ✅ |
| 5 | timestamps com offset explícito | ✅ |
| 6 | owner escolhe horário | ✅ |
| 7 | stale slot rejeitado | ✅ |
| 8 | slot × nova rodada serializado | ✅ 6 rodadas |
| 9 | slot × slot serializado | ✅ 6 rodadas |
| 10 | endereço correto e sem contato | ✅ |
| 11 | observado não sobrescreve declarado | ✅ |
| 12 | inspeção imutável | ✅ |
| 13 | final menor / igual / maior | ✅ |
| 14 | final abaixo do mínimo permitido | ✅ |
| 15 | redução exige justificativa | ✅ validador + CHECK |
| 16 | `no_offer` auditável | ✅ |
| 17 | final × final serializado | ✅ 5 rodadas |
| 18 | final × no_offer serializado | ✅ 5 rodadas |
| 19 | notificação idempotente/atômica | ✅ + rollback |
| 20 | losers continuam 404 | ✅ |
| 21 | nenhuma PII nova revelada | ✅ |
| 22 | Fase 4.4 continua verde | ✅ 168 integração |
| 23 | PostgreSQL real verde | ✅ |
| 24 | E2E verde | ⏳ *(ver abaixo)* |
| 25 | responsive verde | ⏳ *(no mesmo E2E)* |
| 26 | zero regressão nova | ✅ |

### Veredito: **GO técnico**

**NÃO MERGEADO. NÃO DEPLOYADO.**

### Antes do deploy

- rodar a **migration 058** (`npm run db:migrate`);
- a 058 reescreve o CHECK de coerência da 057 — é o passo que permite qualquer
  transição desta fase;
- lojas **sem endereço comercial** não conseguem agendar. Vale avisar os
  lojistas ativos antes de liberar a fase.
