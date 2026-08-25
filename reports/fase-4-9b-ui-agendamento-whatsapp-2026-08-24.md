# Fase 4.9B — Restauração cirúrgica da UI de agendamento + WhatsApp como segunda opção

**Data:** 2026-08-24
**Branch:** `codex/sale-request-scheduling-ui-whatsapp`
**Base:** `b602c57718a35d8938137e84fe199441064ef361` (merge da 4.9A na `main`)

---

## 1. Branch

`codex/sale-request-scheduling-ui-whatsapp`, criada a partir da `main` com o
working tree limpo (só os quatro arquivos protegidos do usuário, intocados).

## 2. Base

`git merge-base --is-ancestor b602c577… HEAD` → verdadeiro. A `main` contém a
4.9A. Nenhum trabalho continuou na branch da 4.9A.

## 3. HEAD

Ver a seção **22 — Entrega**, ao fim deste relatório.

---

## 4. Auditoria Fase 4.9B

Auditoria **read-only**, feita antes de escrever qualquer linha de frontend.

### 4.1 O que JÁ EXISTE (e portanto não foi recriado)

| Camada | Item | Situação |
|---|---|---|
| Backend | `offerInspectionSlots`, `confirmInspectionSlot`, `requestNewInspectionSlots` | **Vivos.** A 4.9A removeu deles o `assertLegacyFlowRetired`. |
| Backend | Rotas `POST /:id/inspection/slots`, `/:id/inspection/confirm`, `/:id/inspection/request-slots` | Montadas. |
| Backend | `getInspectionForRequest` | Reescrita pela 4.9A: parte de `sr.selected_offer_id` → seleção vigente → `i.selection_id`. É o que faz a leitura ser **por match**. |
| Backend | `getInspectionForSelection` | Existe, separada, para a pergunta do histórico. |
| Backend | `GET /:id/handoff/whatsapp`, `reportNoAgreement`, `openNewRound` | Intactos da 4.7. |
| Backend | Códigos `INSPECTION_SLOT_STALE`, `INSPECTION_ALREADY_SCHEDULED`, `INSPECTION_STORE_LOCATION_REQUIRED` | Intactos. |
| Backend | Contrato de slots: **1 a 3**, ISO 8601 **com offset**, instantes distintos e futuros (`validateSlotRound` / `INSPECTION_SLOTS`) | Confirmado na auditoria — não foi inventado limite. |
| Frontend | `confirmInspectionSlot`, `requestNewInspectionSlots` (`lib/sale-requests/api.ts`) | **Sobreviveram à 4.7.** Não foi preciso recriar wrapper (§25). |
| Frontend | `offerInspectionSlots` (`lib/sale-requests/dealer-api.ts`) | Sobreviveu. |
| Frontend | BFF `/api/account/sale-requests/[id]/inspection/{confirm,request-slots}` | Existem. O lojista passa pelo catch-all `[[...path]]`. |
| Frontend | `formatSlot`, `localInputToIso`, `nowForInput`, `INSPECTION_SLOTS`, tipos `OwnerInspection`/`DealerInspection`/`InspectionSlot` (`lib/sale-requests/inspection.ts`) | Todos presentes. **Nenhum formatador novo foi escrito.** |
| Frontend | `INSPECTION_CODE` (espelho no `api.ts`) | Presente — a tela discrimina por código, nunca por texto. |
| Frontend | Card do handoff, WhatsApp, "Não houve acordo", "Ver outras ofertas", "Republicar" (`SaleRequestHandoff.tsx`) | Preservados (§6, §19, §20). |

### 4.2 O que PRECISAVA voltar

1. **A UI de propor horários** (lojista) — removida pela 4.7 junto com
   `DealerInspectionPanel.tsx`.
2. **A UI de escolher / pedir novos horários** (proprietário) — removida junto
   com `SaleRequestInspection.tsx`.
3. **A UI de horário confirmado**, nas duas pontas.
4. **O estado `inspection_scheduled` no card do proprietário.**
   `SaleRequestHandoff` devolvia `null` para ele: depois de confirmar um horário,
   a pessoa não veria **nada** — nem loja, nem valor, nem WhatsApp.

### 4.3 O que CONTINUA aposentado

`completeInspection`, `submitPostInspectionDecision`, `decideFinalOffer` — os três
seguem com `assertLegacyFlowRetired` e respondem **409 `LEGACY_FLOW_RETIRED`**.
Nenhuma tela nova os alcança. Ficha observada, quilometragem lida, motor, câmbio,
pneus, suspensão, lataria, observações de inspeção, proposta final e aceite/recusa
da proposta final continuam fora do produto.

### 4.4 Duas armadilhas que a auditoria encontrou — e que não estavam no enunciado

**(a) O cartão "Histórico" apareceria em toda solicitação nova.**
`SaleRequestDetail` montava `SaleRequestLegacyFlow` sob a condição
`inspection || finalDecision`. A condição era correta **enquanto nenhuma inspeção
nova podia nascer**: entre a 4.7 e a 4.9A os três writers respondiam 409, então a
existência de uma inspeção *provava* que a linha era antiga.

Com a 4.9B, toda solicitação que marca um horário passa a ter `inspection`
preenchida — e cada uma ganharia, logo abaixo do painel de agendamento **vivo**,
um cartão dizendo *"Histórico — esta solicitação passou pelo fluxo anterior da
plataforma"*. Duas leituras opostas do mesmo agendamento, na mesma tela.

Corrigido para `inspection?.observed || finalDecision || ownerDecision` — o que
distingue de verdade o fluxo antigo é o que **só ele** produzia, e nenhum writer
vivo escreve ficha observada ou proposta final.

**(b) A agenda da loja A sobrevivia à resseleção no estado local do React.**
`SaleRequestProposals.onSelected` aplicava a resposta do POST sem limpar
`inspection`. Vindo de `handoff_failed`, esse estado ainda guardava a agenda da
loja A (o DTO a devolve, porque o ponteiro da seleção encerrada é preservado de
propósito). Corrigido: `setInspection(null)` + `setFinalDecision(null)` +
`setOwnerDecision(null)` na troca de match (§17).

---

## 5. Componentes novos

| Arquivo | Linhas | Papel |
|---|---|---|
| `frontend/lib/sale-requests/scheduling.ts` | ~110 | Só textos. Arquivo próprio porque `handoff.ts` guarda as frases da fase que **retirou** a agenda ("a plataforma não agenda visita") — encostar as duas coisas deixaria o arquivo se contradizendo. |
| `frontend/components/account/OwnerSchedulingPanel.tsx` | ~290 | Três estados: esperando a loja → escolher horário → horário confirmado. **Nada além disso.** |
| `frontend/components/account/DealerSchedulingPanel.tsx` | ~300 | Propor horários → aguardando escolha → horário confirmado (read-only). |

Nenhum dos três sabe o que é ficha de avaliação ou proposta final.

## 6. O que foi reaproveitado do legado

**Reaproveitado (por leitura, como referência de contrato e UX):**
`formatSlot`, `formatSlotShort`, `localInputToIso`, `nowForInput`,
`INSPECTION_SLOTS`, `InspectionSlot`, `OwnerInspection`, `DealerInspection`,
`StoreLocation`, `INSPECTION_CODE` e os três clients de API. Tudo isso já existia
em `lib/sale-requests/inspection.ts` e sobreviveu à 4.7.

**NÃO reaproveitado:** `DealerInspectionPanel.tsx` (771 linhas) e
`SaleRequestInspection.tsx`. Nenhum `git checkout` deles, nenhuma cópia parcial.
Eram componentes MISTOS — agenda + avaliação + proposta final —, e restaurá-los
inteiros era o caminho mais provável para reintroduzir os dois fluxos aposentados
sem ninguém perceber, no meio de 800 linhas.

## 7. Prova de que a avaliação NÃO voltou

Quatro provas independentes:

1. **Varredura de fonte (§22)** — `SaleRequestScheduling.test.tsx` lê os três
   arquivos novos e afirma que nenhum contém `completeInspection(`,
   `submitPostInspectionDecision(`, `decideFinalOffer(`, `observed_(`,
   `final_offer_decision(` nem `inspection/complete(`. A busca é por **chamada**
   e não por identificador solto: os cabeçalhos citam os três writers por nome ao
   explicar por que continuam aposentados, e uma varredura por identificador
   acusaria a própria justificativa.
   Há também a prova **positiva** (o painel do proprietário chama
   `confirmInspectionSlot(` e `requestNewInspectionSlots(`; o do lojista chama
   `offerInspectionSlots(`) — sem ela, as asserções negativas passariam por
   vacuidade depois de um rename.

2. **Varredura de DOM contextual (§23, §24)** — nos testes de componente, sobre o
   painel renderizado: `Registrar avaliação`, `Quilometragem lida`,
   `Estado geral observado`, `Registrar proposta final`, `Aceitar proposta final`,
   `Recusar proposta final`, `Observações da avaliação`.
   **"Motor", "Câmbio" e "Pneus" NÃO estão na lista, deliberadamente**: os três
   aparecem legitimamente na *ficha declarada pelo proprietário*, na mesma página
   (visível nas capturas 01, 04, 05, 07). Um termo com homônimo inocente vira
   alarme falso, e alarme falso é desativado na primeira vez que atrapalha.

3. **E2E** — a mesma varredura na tela real, nas duas contas, em cinco momentos
   do fluxo, mais a ausência dos testids dos painéis antigos
   (`dealer-inspection-form`, `dealer-inspection-mileage`, `dealer-decision-form`,
   `dealer-decision-amount`, `owner-final-decision-form`).

4. **Diff (§40)** — `completeInspection` e `submitPostInspectionDecision`
   aparecem em **2 linhas adicionadas**, ambas dentro de comentários que explicam
   por que continuam em 409. `decideFinalOffer`, `observed_`, `final_offer`,
   `Registrar avaliação` e `Registrar proposta final`: **zero** linhas
   adicionadas.

## 8. PF scheduling

- **Sem horários** → *"Aguardando a loja disponibilizar horários para avaliação."*
  \+ botão **Atualizar** (reusa o `onChanged` que a tela já tinha; **sem polling** — §9).
- **Com horários** → `fieldset`/`legend` + rádios com os horários formatados em
  pt-BR (`formatSlot`), **Confirmar horário** (desabilitado sem escolha) e
  **Pedir outros horários**.
- **Depois de pedir** → *"Aguardando novos horários da loja."*
- **Confirmado** → bloco verde *"Avaliação agendada"* + data/hora + a ressalva de
  que o WhatsApp continua servindo.
- `INSPECTION_SLOT_STALE` exibe a mensagem do servidor **e** dispara recarga.

## 9. Dealer scheduling

- **Oferta aceita, sem agenda** → formulário de 1 a 3 horários
  (`datetime-local` com `min` = agora), *+ Adicionar horário* até 3, *Remover*
  com `aria-label` individual.
- **Enviados** → lista dos horários + *"Aguardando a escolha do proprietário"*.
  O formulário **sai de cena**: publicar outra rodada agora invalidaria a lista
  que o proprietário pode estar olhando.
- **Proprietário pediu outros** → formulário volta, com o aviso âmbar.
- **Confirmado** → read-only: data/hora + *"O proprietário confirmou este horário
  para levar o veículo até sua loja."* Zero controles no painel (asserido:
  `queryAllByRole("button")` e `("textbox")` = 0). Nenhuma promessa de "próxima
  etapa no portal".
- **`handoff_failed`** → o painel devolve `null`.

O frontend **não reimplementa** a validação: converte `datetime-local` → ISO com
offset via `localInputToIso` e exibe a mensagem do servidor (inclusive a de
endereço comercial ausente, que traz o caminho para resolvê-lo).

## 10. WhatsApp

Endpoint **reutilizado** (`GET /:id/handoff/whatsapp`) — nenhum alternativo criado.
URL resolvida no servidor; a tela nunca monta `wa.me`. Mensagem inalterada.

- Botão presente em **todos** os estados vivos do match: sem horários, escolhendo,
  e **depois de confirmado** (§13).
- Passou a ser **secundário** (contorno azul) e o agendamento primário, separados
  por um "ou" — os dois caminhos, lado a lado (§1, §6).
- E2E confere `^https://wa\.me/55\d{10,11}\?text=`, exige "Carros na Cidade" e
  "T-Cross" na mensagem e proíbe CPF/e-mail/números longos.

### §8 — loja sem WhatsApp

Tratamento **discreto**, não um erro: texto cinza, sem `role="alert"`, sem caixa
vermelha. Exibe a mensagem do servidor quando ela existe (ela costuma dizer o que
fazer em seguida) e cai na frase canônica *"WhatsApp não disponível para esta
loja."* quando não. **O agendamento pelo portal continua inteiro ao lado** — há
teste afirmando que os 3 horários e o botão de confirmar seguem lá.

> **Mudança de comportamento herdada.** O teste da 4.7 esperava
> `handoff-whatsapp-error` (caixa vermelha, `role="alert"`). Fazia sentido quando
> o WhatsApp era o **único** caminho depois do aceite. Agora não é. O teste foi
> atualizado, com o motivo registrado nele.

## 11. no_agreement

Preservado e **disponível nos dois estados vivos** — `offer_selected` **e**
`inspection_scheduled` (§36). O CTA **não** some quando há horário confirmado: é
o gate herdado da 4.9A, e o E2E o exercita exatamente nesse ponto (encerra o
handoff **com a agenda já confirmada**).

O frontend não tenta apagar agenda, slot nem appointment (§16) — só reflete o
match encerrado.

### §15 — `handoff_failed` com agenda histórica

O caso mais perigoso da fase. A 4.9A preserva a agenda e **mantém**
`selected_offer_id` apontando para a seleção que falhou, então o DTO de
`handoff_failed` **traz** `inspection.state = "scheduled"` com `scheduled_at`
real. Todo o dado necessário para pintar "Avaliação agendada" está presente; só o
status diz que aquilo acabou.

O guard é de **roteamento**: `SaleRequestHandoff` testa `handoff_failed`
**primeiro**, antes de qualquer coisa olhar para `inspection`. Nenhuma decisão da
árvore consulta a inspeção — quem manda é o status.

O E2E **prova que o cenário é real** antes de asserir a ausência: lê o DTO e
exige `inspection.scheduled_at` presente. Sem essa linha, as asserções seguintes
passariam trivialmente caso o backend simplesmente omitisse a inspeção.

## 12. Resseleção A → B

- Backend: a leitura parte de `selected_offer_id` → seleção vigente →
  `i.selection_id`. A agenda de A é **inalcançável** a partir do match de B.
- Frontend: estado local limpo na troca (§4.4-b).
- E2E: o match de B nasce em *"Aguardando a loja disponibilizar horários"*,
  `currentScheduledAt` = `null`, a loja A recebe **404**, a loja B ganha o
  formulário, e o **WhatsApp muda de número** (asserido: `urlB ≠ urlA`).

## 13. Round 2 — mesma loja

O cenário que filtrar por `advertiser_id` **não** resolveria: duas inspeções com
o mesmo `sale_request_id` e o mesmo `advertiser_id`, distinguidas só pelo
`selection_id`.

Coberto em **três camadas**:
1. **Integração (4.9A, já na `main`)** — `A1 não reaparece; A2 recebe agenda
   própria; a leitura devolve só A2` e `A1 intacta, A2 independente, leitura
   vigente = A2`. Executados e **verdes** nesta fase.
2. **Componente** — `§18 — mostra a agenda A2 e nunca a A1`, distinguindo pelo
   **instante** (02/09 às 16:00 × 25/08 às 14:00), não pelo id da loja.
3. **E2E** — teste próprio, com rodada real: A agenda A1 → não houve acordo →
   nova rodada → A oferta de novo → é aceita → agenda A2. Afirma
   `scheduledA2 ≠ scheduledA1`, que o rótulo de A1 **não** está na tela do
   proprietário nem na do lojista, e que o de A2 está.

## 14. Privacidade

Sem mudança de contrato. As garantias continuam estruturais no backend, e o E2E
reconfere na tela:

- `expectNoContactLeak` em cinco momentos: nem `cpf@…` nem `cnpj@…` aparecem.
- Loja perdedora: **404** na oportunidade inteira.
- Nada do proprietário chega ao lojista — nem nome, nem contato, nem endereço.
- A mensagem do WhatsApp não carrega CPF, e-mail, id interno nem valor.
- Nenhum campo de texto livre foi criado (nem em "pedir novos horários", §12).

## 15. Acessibilidade

- **Escolha de horário:** `fieldset` + `legend` + `input[type=radio]` com `name`
  compartilhado e `label htmlFor` — o leitor de tela anuncia a pergunta antes de
  cada opção.
- **Formulário do lojista:** `fieldset` com `legend` (`sr-only`), `label htmlFor`
  por campo, `aria-label` individual em cada botão *Remover* (sem ele seriam três
  botões idênticos).
- **Erros:** `role="alert"` — o retorno é imediato, em resposta a um clique.
- **Aviso de WhatsApp indisponível:** deliberadamente **sem** `role="alert"` —
  não é erro.
- `fieldset disabled` durante o envio desabilita todo o grupo de uma vez.
- Diálogos: os da 4.7, com focus trap, `Escape`, `aria-modal` e devolução de foco.

## 16. Responsivo

360 / 390 / 412 / 768 / 1024 / 1440, em **oito** pontos do fluxo. Zero overflow
horizontal (tolerância de 1px). CTAs empilhados no mobile. Captura
`11-mobile-390-duas-opcoes.png`.

## 17. E2E

`frontend/e2e/sale-request-scheduling-whatsapp.spec.ts` — **2 testes, 2 verdes**,
banco real + backend real + frontend real.

- **Teste 1** (§32 + §33): ofertas → aceite → duas opções → lojista propõe 3 →
  PF vê os 3 → **pede novos** → lojista publica rodada 2 → PF confirma → status
  `inspection_scheduled` → lojista vê confirmado, read-only → **não houve acordo
  com agenda confirmada** → §15 → outras ofertas → republicar → resseleção A→B →
  agenda B.
- **Teste 2** (§34): rodada 2 com a mesma loja.

Cada teste **re-semeia** (`test.beforeEach` → `scripts/e2e-seed.mjs`). Sem isso o
segundo a rodar encontrava a solicitação já consumida pelo primeiro e falhava com
uma mensagem sobre o *fixture*, não sobre o produto.

**§38 — rate limit não foi enfraquecido.** `windowMs` e `max` intocados. Um
`BrowserContext` por conta; 5 logins no arquivo inteiro (3 + 2). Para limpar a
janela entre execuções, o backend local foi **reiniciado** — o store é em memória.

## 18. Screenshots

`reports/screenshots/fase-4-9b/` — 11 arquivos, todos distintos:

| Arquivo | Prova |
|---|---|
| `01-owner-oferta-aceita-duas-opcoes.png` | **§1** — "Aguardando a loja disponibilizar horários" + **Atualizar** *e* "Falar com a loja pelo WhatsApp", separados por "ou". Os dois caminhos coexistem. |
| `02-dealer-propor-horarios.png` | Formulário de horários, sem nada de avaliação. |
| `03-owner-escolher-horario.png` | Três horários em pt-BR + confirmar + pedir outros. |
| `04-owner-avaliacao-agendada-whatsapp.png` | **§13** — "Sexta-feira, 28/08 às 16:00", endereço, **WhatsApp ainda presente**, "Não houve acordo" ainda presente. |
| `05-dealer-horario-confirmado.png` | **§14** — read-only, zero formulário. |
| `06-owner-pedir-novos-horarios.png` | "Aguardando novos horários da loja" (capturada **depois** do clique). |
| `07-owner-handoff-failed-sem-agenda-ativa.png` | **§15** — status "Negociação não concluída", zero "Avaliação agendada", com a agenda ainda no banco. |
| `08-owner-outras-ofertas.png` | **§19** — recorte do bloco: duas lojas, dois "Aceitar oferta". |
| `09-owner-republicar.png` | **§20** — diálogo de nova rodada. |
| `10-owner-segunda-loja-agenda.png` | **§33** — agenda da loja B. |
| `11-mobile-390-duas-opcoes.png` | **§28** — mobile, CTAs empilhados. |

## 19. Regressões

| Suíte | Resultado |
|---|---|
| Componente 4.9B (novo) | **37/37 verdes** |
| Frontend completo | **3.293 verdes / 5 falhas** — as 5 são **pré-existentes** (ver abaixo). 207 de 209 arquivos verdes. |
| Backend `tests/sale-requests` | **469/469 verdes** (13 arquivos) |
| Integração `sale-request-inspection-per-selection` | **verde** |
| Integração `sale-request-handoff-rounds` | **verde** |
| Integração `sale-request-legacy-flow` | **verde** |
| Integração `sale-request-offer-selection` | **50/50 verdes** |
| E2E 4.9B | **2/2 verdes** |

**§37 — `npm test` completo não foi repetido, e o critério foi cumprido:**
`git diff --stat -- src/` é **vazio**. Zero linhas de backend alteradas.

### As 5 falhas pré-existentes

- `app/seguranca/page.copy.test.ts` (2) — varredura de fonte esperando um bloco de
  moderação que não existe na página. Verificada a causa: nada a ver com
  sale-requests.
- `app/carros-usados/regiao/[slug]/page.config.test.ts` (3) — flags de SEO
  regional.

Nenhum dos dois tem caminho de import para os arquivos deste diff (que são todos
de `sale-requests`). **Não foram introduzidas por esta fase e não foram
corrigidas aqui** — estão fora do escopo.

### Dois testes da 4.7 foram ATUALIZADOS (mudança de comportamento intencional)

1. `SaleRequestHandoff.test.tsx` — "loja sem WhatsApp": de
   `handoff-whatsapp-error` para `handoff-whatsapp-unavailable`. Exigido pelo §8.
2. `SaleRequestProposals.test.tsx` — "o painel PARA de dizer 'aguardando'": a
   âncora passou de `sale-request-selected-offer` para `owner-handoff`. O card de
   handoff passou a cobrir `inspection_scheduled` e já traz loja, valor e
   endereço; manter os dois empilharia dois cartões com a mesma loja e o mesmo
   valor. **As afirmações dos dois testes seguem as mesmas** — só o alvo mudou, e
   o motivo está escrito dentro deles.

## 20. Dívidas e limitações

1. **Sem reagendamento.** Confirmado um horário, não há "trocar horário" — o
   backend responde 409 `ALREADY_SCHEDULED`. A saída existente é "Não houve
   acordo" (que perde o match) ou o WhatsApp. Limitação herdada da 4.5,
   **preservada de propósito**: mexer nisso seria redesenhar o backend (§43).
2. **Sem atualização automática.** O proprietário aperta **Atualizar** (ou
   recarrega) para ver horários novos. Escolha explícita do §9. Um polling só se
   justificaria com um custo/benefício que este volume não sustenta.
3. **`dealer-api.ts` ainda exporta `completeInspection`.** Client morto deixado
   pela 4.7. Não é alcançável por UI e o endpoint responde 409. **Não removido
   aqui** para manter o diff no escopo (§41) — candidato à varredura de código
   morto já registrada como pendência do projeto.
4. **Notificações de agenda voltaram a ser emitidas** (`SLOTS_OFFERED`,
   `SLOTS_REQUESTED`, `APPOINTMENT_CONFIRMED`) — comportamento da 4.9A, não desta
   fase. Vale saber que o sino volta a receber esses eventos.
5. **Fuso do lojista × do proprietário.** `formatSlot` formata no fuso de quem lê
   (correto e deliberado). Um lojista em Atibaia e um proprietário em Manaus veem
   horas de parede diferentes para o mesmo instante — que é o comportamento certo,
   mas nunca foi exercitado em produção.

---

## 21. GO / NO-GO

### **GO**

| # | Critério | Situação |
|---|---|---|
| 1 | `main` contém a 4.9A | ✅ `b602c577` é ancestral de HEAD |
| 2 | Migration 061 não alterada | ✅ `git diff --exit-code` limpo |
| 3 | Nenhuma migration nova | ✅ última é a 061 |
| 4 | Backend de agenda não redesenhado | ✅ `git diff -- src/` vazio |
| 5 | PF agenda pelo portal | ✅ componente + E2E |
| 6 | Lojista propõe horários | ✅ componente + E2E |
| 7 | PF pede novos horários | ✅ componente + E2E (§35 completo) |
| 8 | PF confirma horário | ✅ componente + E2E |
| 9 | Horário confirmado aparece | ✅ capturas 04 e 05 |
| 10 | WhatsApp como segunda opção | ✅ captura 01 |
| 11 | WhatsApp não substitui agenda | ✅ caminhos independentes |
| 12 | WhatsApp após agendamento | ✅ captura 04 + teste |
| 13 | Loja sem WhatsApp não quebra agenda | ✅ teste §8 |
| 14 | "Registrar avaliação" ausente | ✅ 4 provas (seção 7) |
| 15 | Formulário de avaliação ausente | ✅ idem |
| 16 | Proposta final ausente | ✅ idem |
| 17 | Writers aposentados sem UI | ✅ teste de fonte §22 |
| 18 | `no_agreement` em `offer_selected` | ✅ |
| 19 | `no_agreement` em `inspection_scheduled` | ✅ E2E, com agenda confirmada |
| 20 | `handoff_failed` sem agenda ativa | ✅ captura 07 + DTO comprovadamente carregado |
| 21 | "Ver outras ofertas" funciona | ✅ captura 08 |
| 22 | "Republicar anúncio" funciona | ✅ captura 09 |
| 23 | Resseleção A→B só mostra agenda B | ✅ E2E |
| 24 | A round1 → A round2 mostra só A2 | ✅ 3 camadas |
| 25 | WhatsApp acompanha o match atual | ✅ `urlB ≠ urlA` |
| 26 | Seller PII protegida | ✅ |
| 27 | Losers sem contato | ✅ 404 |
| 28 | Mobile sem overflow | ✅ 6 larguras × 8 pontos |
| 29 | Component tests verdes | ✅ 37/37 |
| 30 | Integração relevante verde | ✅ 4 arquivos |
| 31 | E2E principal verde | ✅ 2/2 |
| 32 | Screenshots completas | ✅ 11/11 distintas |
| 33 | Zero regressão nova | ✅ 5 falhas pré-existentes, causa verificada |

**Ressalva honesta:** o `npm test` completo do backend **não** foi executado —
e, pelo §37, não precisava: nenhuma linha de `src/` mudou. Foram executados os
469 testes de `tests/sale-requests` e os 4 arquivos de integração do domínio.

---

## 22. Entrega

| | |
|---|---|
| **HEAD** | commit único sobre `b602c577`. O hash é reportado na entrega da task — gravá-lo aqui dentro é autorreferente: cada `--amend` para corrigi-lo produz um hash novo. Confira com `git rev-parse HEAD`. |
| **Parent** | `b602c57718a35d8938137e84fe199441064ef361` |
| **Branch** | `codex/sale-request-scheduling-ui-whatsapp` |
| **Ahead / behind `origin/main`** | **1 à frente, 0 atrás** (`rev-list --left-right --count` = `0  1`) |
| **Arquivos** | 24 (12 de produto/teste, 1 relatório, 11 capturas) |
| **Diff** | `3361 insertions(+), 25 deletions(-)` — as capturas respondem pela maior parte |
| **Código (sem capturas nem relatório)** | ~1.400 linhas, das quais ~700 são os 3 componentes novos e ~700 os testes |

### Migration 061 intacta

```
git diff --exit-code -- src/database/migrations/061_sale_request_inspection_per_selection.sql
→ exit 0 (nenhuma diferença)
```

Última migration do diretório: **061**. Nenhuma 062 criada.
`git diff --stat -- src/` → **vazio**.

### Arquivos protegidos do usuário

Os quatro continuam **untracked e intocados**:
`frontend/public/images/{lojista-detalhe-veiculo-referencia,
lojista-oportunidades-veiculos-referencia, vender-para-loja}.png` e
`reports/fase-4-0-auditoria-venda-para-lojas-2026-08-15.md`.

Nenhum `git add .`, `git add -A`, `git clean`, `git stash -u` ou `git reset --hard`
foi executado — o stage foi montado nomeando arquivo por arquivo.

### Não executado (§44)

**Sem push. Sem PR. Sem merge. Sem deploy.** O commit existe apenas localmente.

---

**PARADO PARA REVISÃO.**
