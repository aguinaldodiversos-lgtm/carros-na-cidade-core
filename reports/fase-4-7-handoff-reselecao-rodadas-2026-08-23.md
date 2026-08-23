# Fase 4.7 — Handoff direto, resseleção e rodadas de ofertas

**Data:** 2026-08-23
**Branch:** `codex/sale-request-handoff-rounds`
**Base (SHA):** `9f964385447b7ccb252c2044ba94709a047720b2` (merge da Fase 4.6, PR #43)
**Status:** implementada, testada, **não mergeada e não deployada**

---

## 1. Sumário

O papel da plataforma passa a terminar no **MATCH**:

```
proprietário publica → lojistas ofertam → proprietário ACEITA uma oferta →
o portal libera os dados comerciais da loja → as duas partes combinam a
avaliação presencial direto, fora daqui
```

Avaliação presencial, laudo, agenda, proposta final, aceite da proposta final,
pagamento, transferência e arbitragem **saem da experiência ativa**. Nada é
apagado: as estruturas das Fases 4.5 e 4.6 viram legado e continuam legíveis.

Se a negociação não prosperar, o proprietário informa apenas **"não houve
acordo"** — sem motivo, sem valor, sem culpa — e ganha duas saídas: aceitar
**outra oferta** já recebida, ou abrir uma **nova rodada** com outro piso.

---

## 2. Auditoria Fase 4.7

### Migrations mapeadas

| # | O que criou | Relevante para a 4.7 |
|---|---|---|
| 055 | `sale_request_offers` (append-only, `ON DELETE CASCADE`) | ganha `round_id` |
| 056 | `sale_requests.minimum_accepted_price` (nullable p/ legado) | o piso migra para a rodada |
| 057 | `selected_offer_id/at`, `sale_request_offer_selections` **UNIQUE(sale_request_id)**, FK tripla | a UNIQUE precisa evoluir |
| 058 | inspeções, horários, decisão pós-inspeção; CHECK de status com 7 valores; **UNIQUE(sale_request_id, advertiser_id)** nas seleções | legado; a UNIQUE bloqueia resseleção |
| 059 | `sale_request_owner_final_decisions`; FK de 5 colunas; CHECK com 9 valores | legado |

### Comparações de status — a varredura

`status ===`, `status !==`, `= ANY(...)`, `switch`:

| Local | Forma antes | Ação na 4.7 |
|---|---|---|
| `selection.repository.markOfferSelected` | `AND status = 'receiving_offers'` | **→ `= ANY(SELECTABLE)`** — a igualdade recusaria TODA resseleção |
| `selection.service` (guard já-selecionado) | `=== OFFER_SELECTED` | **mantido** — passou a significar "handoff ATIVO" |
| `service.getMySaleRequest` (propostas) | `=== RECEIVING_OFFERS` | **→ `SELECTABLE.includes`** — sem isso a tela de resseleção fica vazia |
| `offers.service` (aceitar lance) | `!== RECEIVING_OFFERS` | mantido |
| `dealer.repository` (feed / visibilidade) | `= $2` / `= ANY(SELECTED)` | mantido; `handoff_failed` entra na lista |
| `SALE_REQUEST_SELECTED_STATUSES` | 8 estados | **+ `handoff_failed`** |

**Achado principal:** a 4.4 escreveu `status = 'receiving_offers'` no `WHERE` do
`UPDATE` de seleção. Estava certo quando só havia uma escolha possível por
solicitação — e recusaria em silêncio (`rowCount = 0` → 409) toda resseleção
desta fase. É exatamente a classe de defeito que as 4.5 e 4.6 já pagaram.

### WhatsApp — schema real

`advertisers` tem **cinco** colunas de contato por herança: `phone`, `whatsapp`,
`mobile_phone`, `telephone`, `telefone`. A 4.7 usa **`whatsapp`** — é o campo que
a loja preenche em `/dashboard-loja/dados` sabendo que é público. Usar qualquer
das outras entregaria o número pessoal de um operador.

`normalizeWhatsappDigits` (`src/shared/utils/brPhone.js`) é reusado: contrato
estrito de SAÍDA (celular brasileiro completo ou `null`), o mesmo que o Produto 1
usa. Nenhum campo foi inventado.

---

## 3. Modelo anterior × modelo novo

```
ANTES (4.6)                          AGORA (4.7)
───────────────────────────          ─────────────────────────────
receiving_offers                     receiving_offers
  ↓ selecionar                         ↓ ACEITAR OFERTA
offer_selected                       offer_selected  ── handoff direto
  ↓ loja propõe horários               │              (WhatsApp + endereço)
inspection_scheduled                   │
  ↓ loja registra avaliação            ├─ deu certo → nada a registrar
inspection_completed                   │
  ↓ loja propõe valor final            └─ não houve acordo
final_offer_submitted                       ↓
  ↓ PF aceita/recusa                  handoff_failed
final_offer_accepted / rejected          ↙        ↘
                                  nova seleção   nova rodada
                                       ↓              ↓
                                offer_selected   receiving_offers (rodada N+1)
```

Não existe estado de SUCESSO, e a ausência é deliberada (§31): o portal não sabe
se a venda aconteceu. `sold`, `sale_completed` e `deal_closed` continuam não
existindo.

---

## 4. Por que a avaliação saiu do portal

O lojista já tem processo, planilha e olho treinado. Pedir que redigitasse
quilometragem, motor, câmbio, suspensão, pneus e lataria dentro do sistema era
trabalho sem contrapartida: o proprietário não decidia nada com aqueles dados, e
a plataforma não arbitra a negociação. O que restava era um formulário longo
entre duas pessoas que já iam se falar de qualquer jeito.

---

## 5. Componentes removidos (§33)

| Arquivo | Linhas | Por quê |
|---|---|---|
| `DealerInspectionPanel.tsx` | 771 | continha os TRÊS formulários: horários, **Registrar avaliação**, proposta final |
| `SaleRequestInspection.tsx` | 582 | escolher horário, pedir novos, ver proposta final |

Substituídos por:

| Arquivo | Linhas | O que faz |
|---|---|---|
| `DealerHandoffPanel.tsx` | ~100 | "Sua oferta foi aceita" + valor. Read-only, zero `<button>` |
| `SaleRequestHandoff.tsx` | ~560 | card do handoff, "não houve acordo", nova rodada |
| `SaleRequestLegacyFlow.tsx` | ~150 | leitura do que o fluxo antigo registrou |

**Nenhuma tabela, migration ou linha de dado foi apagada** (§33).

---

## 6. Endpoints legados (§32)

Um guard compartilhado — `sale-requests.legacy-flow.js` — recusa os **seis**
writers com 409 `SALE_REQUEST_LEGACY_FLOW_RETIRED`:

`offerInspectionSlots`, `confirmInspectionSlot`, `requestNewInspectionSlots`,
`completeInspection`, `submitPostInspectionDecision`, `decideFinalOffer`.

**As rotas continuam montadas.** Um 404 de rota faria uma tela antiga ainda
aberta parecer erro de infraestrutura; o 409 com código próprio conta a verdade.

**Por que os seis, e não só a entrada:** bastaria bloquear `offerInspectionSlots`
para nenhuma solicitação nova entrar na máquina. Mas a UI dos passos seguintes
também sumiu, e deixar `completeInspection` alcançável manteria vivo um caminho
de escrita que nenhuma tela chama.

**As LEITURAS continuam intactas** — os DTOs seguem servindo inspeção e proposta
final para as linhas que já as têm.

---

## 7. Migration 060

`060_sale_request_rounds_handoff.sql`

1. **`sale_request_rounds`** — `UNIQUE (sale_request_id, round_number)`,
   `UNIQUE (id, sale_request_id)` (alvo de FK). O piso mora aqui.
   `ON DELETE CASCADE` para `sale_requests` — ver §11 abaixo.
2. **Backfill** — rodada 1 para toda solicitação, com o piso dela.
3. **`sale_requests.current_round_number`** `INTEGER NOT NULL DEFAULT 1`.
4. **`sale_request_offers.round_id`** — backfill, `SET NOT NULL`, FK composta
   `(round_id, sale_request_id)` com `ON DELETE CASCADE`; UNIQUE de 4 colunas.
5. **`sale_request_offer_selections.round_id`** — backfill, `NOT NULL`, FK de
   **4 colunas**; a `UNIQUE(sale_request_id)` sai e entra
   `UNIQUE(sale_request_id, offer_id)`.
6. **`handoff_failed`** no CHECK de status (os 9 anteriores permanecem).
7. **CHECK de coerência** com partição explícita, incluindo `handoff_failed`.
8. **`sale_request_handoff_outcomes`** — append-only, `UNIQUE(selection_id)`,
   FK composta, `outcome` com CHECK de UM valor.

### Por que `current_round_number` é um INTEIRO, não um ponteiro

A solicitação nasce **antes** da rodada dela. Um `current_round_id` `NOT NULL`
com FK falharia no próprio INSERT de criação sem `DEFERRABLE`. Um número resolve
sem constraint diferida: o par `(id, current_round_number)` casa a UNIQUE das
rodadas, e o `DEFAULT 1` faz toda solicitação nova nascer na rodada 1.

O que segura a coerência é a transação de criação (grava os dois juntos) e o fato
de que **toda oferta e toda seleção carregam `round_id` provado por FK composta**
— um ponteiro para rodada inexistente não conseguiria receber nada.

---

## 8. Backfill (§49) — verificado sobre banco povoado

O teste de upgrade 059 → 060 popula **os nove estados** da 4.6, com ofertas e
seleções, e reaplica a migration. Verificado:

- todos os 9 estados **sobrevivem** com a seleção como estava;
- `current_round_number = 1` em todos;
- **zero** ofertas ou seleções com `round_id` nulo;
- **zero** ofertas cuja rodada pertence a outra solicitação;
- um estado novo SEM seleção continua sendo recusado (23514).

---

## 9. Selection history (§26, §27)

`UNIQUE (sale_request_id)` → `UNIQUE (sale_request_id, offer_id)`.

A invariante que continua verdadeira: **a mesma oferta é aceita no máximo uma
vez**. "No máximo um match ATUAL" não vive mais na trilha — vive em
`sale_requests.selected_offer_id`, que é **uma coluna** e portanto
estruturalmente única. Tentar espremer as duas responsabilidades na mesma
constraint foi o que tornou a antiga insuficiente.

### A relaxação deliberada

`sale_request_inspections_selected_store_fk` (058) foi **removida**, junto com o
alvo dela, `UNIQUE(sale_request_id, advertiser_id)`.

Motivo: com histórico de seleções, aquela UNIQUE proibiria um caminho legítimo —
Loja A aceita na rodada 1, sem acordo, oferta de novo na rodada 2 e é aceita de
novo. E a proposição "a loja da inspeção é A loja selecionada" deixou de ser bem
definida quando passou a existir mais de uma seleção.

Substituída por `UNIQUE(sale_request_id, advertiser_id, round_id)`. A inspeção
mantém FK para `sale_requests`, para `advertisers`, a do horário confirmado e
toda a cadeia da decisão pós-inspeção. **Há teste dedicado** provando que a
remoção é visível e que o resto continua de pé.

---

## 10. "Não houve acordo" (§17, §28)

`sale_request_handoff_outcomes`: append-only, um por seleção, **um único valor**
(`no_agreement`).

Não registra motivo, valor renegociado nem culpa. Testado: mesmo que o cliente
mande `reason`, `blamed` e `final_amount`, a linha gravada tem exatamente seis
colunas e nenhum vestígio do que foi enviado.

**Não notifica a loja** (§46 permite): ela participou da negociação e já sabe o
que aconteceu. Um aviso do portal contando o desfecho de uma conversa que ele não
presenciou — baseado no relato de uma das partes — seria tomar lado.

A seleção anterior **permanece**, e o ponteiro continua apontando para ela: é o
que a tela mostra enquanto o proprietário decide.

---

## 11. `ON DELETE`: o que cascateia e o que bloqueia

| Tabela | Cascade? | Por quê |
|---|---|---|
| `sale_request_rounds` | **SIM** | contêiner de ofertas, não decisão. Sem cascade, apagar uma solicitação sem seleção — caminho legítimo — passaria a falhar com 23503 |
| `sale_request_offers` → rounds | **SIM** | acompanha a rodada; sem isso o DELETE morreria numa ordem de cascata que o PostgreSQL escolhe sozinho |
| `sale_request_offer_selections` | NÃO | trilha auditável (4.4.1) |
| `sale_request_handoff_outcomes` | NÃO | trilha auditável |

Isso **não** contradiz a 4.4.1: a regra de lá é sobre registro de DECISÃO. Uma
rodada não é decisão de ninguém.

Consequência: `scripts/e2e-seed.mjs` ganhou o DELETE explícito de
`sale_request_handoff_outcomes` (e a criação da rodada 1 na publicação simulada).

---

## 12. WhatsApp (§14, §15)

Endpoint dedicado — `GET /:id/handoff/whatsapp` — no padrão do Produto 1:

- a URL é montada **no servidor**; a tela nunca monta `wa.me`;
- resposta **mínima**: `{ url }`. Sem telefone em campo separado;
- o número **não** trafega no DTO do detalhe — sai uma vez, quando a pessoa
  decide falar com a loja, e o acesso vai para o log de domínio;
- `normalizeWhatsappDigits` compartilhado; loja sem número utilizável devolve 409
  com código próprio, e a tela mostra o endereço como alternativa.

Mensagem: `Olá! Vim pelo Carros na Cidade. Aceitei a oferta de vocês pelo meu
{Marca Modelo Ano} e gostaria de combinar a avaliação presencial.`

**Sem** CPF, e-mail, id interno — e **sem o valor**: a loja sabe quanto ofereceu,
e escrever o número numa mensagem que a pessoa assina transformaria a abertura da
conversa numa cobrança. Testado por regex sobre a mensagem decodificada.

### Privacidade

| Momento | Proprietário vê | Loja vê |
|---|---|---|
| antes do aceite | nome + cidade da loja | nada da PF |
| **depois do aceite** | + endereço comercial + **WhatsApp** | **nada da PF** |
| lojas não escolhidas | — | **404** |

`getSelectedStoreContact` é a **única** query do Produto 2 que seleciona um canal
de contato. Nenhuma query da fase faz JOIN com `users`.

---

## 13. Concorrência (§41, §42, §43) — PostgreSQL real

As três ações travam a **mesma linha** de `sale_requests`. Cada cenário roda 5
rodadas com jitter:

| Cenário | Invariante verificada |
|---|---|
| resseleção × resseleção | exatamente uma vence; **2** seleções no total (nunca 3); ponteiro = última linha da trilha |
| resseleção × nova rodada | exatamente uma vence; **nunca** rodada 2 aberta com seleção da rodada 1 |
| nova rodada × nova rodada | só existe **uma** rodada 2; o piso persistido é o da vencedora, nunca uma mistura |
| dois "não houve acordo" | ambos bem-sucedidos, **um** evento |

**Teste por mutação do lock (4.4) adaptado.** Ele dependia da `UNIQUE` removida
por esta fase. Em vez de deletá-lo, a mutação passou a remover **apenas o
`FOR UPDATE`**, mantendo o guard de status no `UPDATE` — como o service real faz.
A prova ficou mais forte: não é "o banco arbitra com um 500", é "exatamente uma
transição vence, mesmo sem lock, porque o próprio UPDATE re-avalia o estado".

---

## 14. Idempotência (§44)

| Ação | Retry |
|---|---|
| "não houve acordo" | 200, `changed: false`, sem segundo evento |
| mesma seleção | 200 idempotente (herdado da 4.4) |
| nova rodada | **409** — dupla defesa: `current_round_number = novo - 1` e `fromStatus` |

O 409 na rodada é deliberado: o segundo request PEDIU algo diferente
(possivelmente outro piso), e responder 200 esconderia que o valor foi ignorado.

---

## 15. Testes

### Backend

| Suíte | Resultado |
|---|---|
| `npm test` (completo) | ✅ **3446 passed**, 1 skipped (212 arquivos) |
| `tests/sale-requests` | ✅ 468 (13 arquivos) |
| `sale-requests-schema.integration` | ✅ 44 |
| `sale-request-offer-selection.integration` (4.4) | ✅ 50 |
| `sale-request-legacy-flow.integration` (**novo**) | ✅ 12 |
| `sale-request-handoff-rounds.integration` (**novo**) | ✅ 25 |

### Frontend

| Item | Resultado |
|---|---|
| `vitest run` | ✅ 3254 passed / **5 falhas pré-existentes** |
| `components/account` | ✅ 340 |
| `tsc --noEmit` | ✅ limpo |
| `next lint` | ✅ sem warnings |
| `npm run build` | ✅ standalone verificado |
| E2E 4.7 | ✅ passou |

---

## 16. §58 — a classificação dos testes do fluxo aposentado

Nenhum teste foi excluído para ficar verde. Cada um foi classificado:

| Suíte removida | Testes | Substituída por | Testes |
|---|---|---|---|
| `sale-requests-inspection.test.js` (4.5) | 54 | `sale-requests-legacy-flow.test.js` | 15 |
| `sale-requests-owner-final-decision.test.js` (4.6) | 46 | (idem) | |
| `sale-request-inspection-final-offer.integration` (4.5) | 27 | `sale-request-legacy-flow.integration` | 12 |
| `sale-request-owner-final-decision.integration` (4.6) | 32 | (idem) | |
| `SaleRequestFinalDecision.test.tsx` (4.6 UI) | 24 | `SaleRequestHandoff.test.tsx` | 24 |
| `sale-request-inspection-final-offer.spec.ts` (E2E) | 1 | `sale-request-handoff-rounds.spec.ts` | 1 |
| `sale-request-owner-final-decision.spec.ts` (E2E) | 1 | (idem) | |
| `sale-request-offer-selection.spec.ts` (4.4, E2E) | 1 | `sale-request-handoff-rounds.spec.ts` + §23.3 | 2 |
| **TOTAL** | **186** | | **66** |

**A soma é 185, e não 184.** Conferido no Git, contando as declarações de teste
na revisão anterior à remoção (`3e9d68b4^`), arquivo por arquivo:

```bash
git show '3e9d68b4^:<arquivo>' | grep -cE '^s*(it|test)(.(only|skip|todo|concurrent))?('
```

54 + 46 + 27 + 32 + 24 + 1 + 1 = **185** nas sete primeiras linhas; com a oitava
(o E2E da 4.4, aposentado no fechamento do gate — §23) o total é **186**. A
contagem estática vale como contagem
de execução porque nenhuma das suítes usa `it.each`/`describe.each`, nenhuma
declara teste dentro de laço (todas as declarações estão em indentação 2, dentro
de um único `describe`) e nenhuma tem `it.skip`/`it.only`.

**De onde saía 184.** Os dois E2E aposentados valem **1 teste cada**, e a segunda
linha traz `(idem)` na coluna "Substituída por" — somar a tabela tratando as duas
linhas de E2E como uma só dá exatamente 184. As duas são remoções distintas:
`sale-request-inspection-final-offer.spec.ts` e
`sale-request-owner-final-decision.spec.ts` são arquivos diferentes, ambos
deletados por `3e9d68b4`. (Cada um tem 3 ocorrências de `test…(` no fonte, mas
duas são `test.skip(…)` de guarda de ambiente — não são testes.)

A classificação A/B/C abaixo não muda.

**A. invariantes ainda válidos** → PORTADOS: as tabelas e FKs das 058/059
continuam existindo (teste dedicado), os estados legados continuam satisfazendo o
CHECK, o guard de cancelamento cobre todos os estados pós-seleção, losers 404.

**B. comportamento legacy** → PORTADO: os DTOs continuam servindo inspeção e
proposta final; `internal_note` continua sem atravessar.

**C. comportamento removido** → substituído pela prova de que cada writer
**recusa** com 409 e código próprio, e de que nenhum deles escreve linha nenhuma.

**A 4.4 (`sale-request-offer-selection.spec.ts`) entra na mesma grade**, e cai
inteira em **A + B** — nada dela é "comportamento removido" sem substituto. A
máquina de produto que ela exercitava (seleção preliminar → avaliação no portal)
deixou de existir; as invariantes que sobreviveram estão mapeadas uma a uma no
§23.3, e as duas que não tinham equivalente explícito ganharam asserção nova
antes da remoção. Nenhuma asserção de privacidade foi afrouxada — duas foram
**acrescentadas**.

### Testes ADAPTADOS (não removidos)

- `SaleRequestProposals.test.tsx`: "diz que a seleção é PRELIMINAR" → **invertido**
  para exigir a copy de compromisso e proibir "preliminar"/"sem compromisso";
- `DealerSaleOpportunityDetail.test.tsx`: "avaliação presencial" saiu da lista de
  frases proibidas (agora ela aparece para dizer que acontece FORA da plataforma);
- `sale-request-offer-selection.integration`: assertivas de schema atualizadas
  para a UNIQUE nova, a FK de 4 colunas e a terceira chave candidata.

---

## 17. Responsive (§56)

Larguras **360, 390, 412, 768, 1024, 1440**, verificadas dentro do E2E em seis
momentos (lista de ofertas, handoff ativo, outras ofertas, rodada 2, tela do
lojista). Asserção: `documentElement.scrollWidth <= clientWidth + 1`.
**Zero overflow horizontal.**

---

## 18. Screenshots (§57)

`reports/screenshots/fase-4-7/` — as 10 exigidas, geradas pelo E2E contra banco
real:

```
01-owner-ofertas.png                      06-owner-outras-ofertas.png
02-owner-modal-aceitar-oferta.png         07-owner-segunda-oferta-aceita.png
03-owner-oferta-aceita-whatsapp.png       08-owner-modal-nova-rodada.png
04-dealer-oferta-aceita-sem-avaliacao.png 09-owner-round-2.png
05-owner-modal-sem-acordo.png             10-mobile-390-handoff.png
```

**A captura 04 comprova visualmente o critério obrigatório do §8:** a tela do
lojista com a oferta aceita mostra apenas "Sua oferta foi aceita / R$ 65.000,00 /
O proprietário recebeu os dados da sua loja". **Não há card "Registrar
avaliação"**, nem quilometragem lida, nem motor/câmbio/suspensão/pneus/lataria,
nem observações, nem proposta final.

---

## 19. Um defeito que a revisão da tela pegou

A primeira versão renderizava **dois** cartões empilhados no estado
`offer_selected`: o painel "Proposta selecionada" da 4.4 (com "Aguardando
próxima etapa" e "as próximas etapas de avaliação serão disponibilizadas aqui")
**e** o card de handoff novo, dizendo a mesma loja e o mesmo valor logo abaixo.

Os testes passavam — cada componente estava correto isoladamente. O que a captura
mostrou foi a composição: uma tela prometendo etapas que a fase acabara de
remover, imediatamente acima do card que explica que elas não existem.

Corrigido suprimindo o painel antigo em `offer_selected` e `handoff_failed`
(ele sobrevive para os estados legados), e o rótulo de status passou de "Proposta
selecionada" para "Oferta aceita", alinhado ao CTA do §3.

---

## 20. Regressões

**Zero regressão nova.** As falhas remanescentes são pré-existentes e provadas:

| Suíte | Falhas | Prova |
|---|---|---|
| `app/seguranca/page.copy.test.ts` | 2 | falham igual em `origin/main` limpo (verificado em worktree na fase anterior) |
| `app/carros-usados/regiao/[slug]/page.config.test.ts` | 3 | idem |
| `migrations-compat.integration` | 3 | backfill legado de `users.plan` (migration 020); verificado sem a 060 na fase anterior |

---

## 21. Dívidas

1. ~~**`frontend/e2e/sale-request-offer-selection.spec.ts` precisa de um ajuste
   que NÃO foi feito.**~~ **RESOLVIDO** — o spec foi **aposentado** (§23.3). O
   passo 7 chegou a ser adaptado, mas a auditoria do gate mostrou que ele não era
   a única incompatibilidade: alinhar o passo 5 exigiria afrouxar uma asserção de
   privacidade. As 16 invariantes do arquivo estão mapeadas no §23.3.1, e as duas
   sem equivalente ganharam teste novo antes da remoção.

2. **`WHATSAPP_BASE_URL` está duplicado** entre
   `purchase-intent-offers.constants.js` (Produto 1) e
   `sale-requests.handoff.constants.js`. O §48 proíbe tocar no Produto 1 nesta
   fase; os dois literais deveriam subir para `src/shared/`.

3. **`SALE_REQUEST_POST_DECISION_STATUSES` continua sem consumidor** — herdado da
   4.5, registrado desde a 4.6.

4. **Rodar dois E2E na mesma janela de 15 min estoura o `loginRateLimit`.** O
   limitador **não foi enfraquecido** (§59). O spec da 4.7 usa um
   `BrowserContext` por conta (3 logins); entre specs, reiniciar o backend (store
   em memória) ou aguardar a janela.

5. **`npm run build` no diretório `frontend` derruba um dev server ativo** (ambos
   escrevem em `.next`). Não é da fase; custou uma execução de E2E. **E um
   `next dev` recém-subido é frio**: a primeira execução do E2E paga os compiles
   e pode estourar os timeouts de 60 s — gastando o seed sem provar nada
   (observado no fechamento do gate, §23.5).

---

## 22. GO / NO-GO

| # | Critério | |
|---|---|---|
| 1 | main contém a 4.6 (`9f964385`) | ✅ |
| 2 | migration 060 fresh verde | ✅ |
| 3 | upgrade 059 → 060 verde | ✅ |
| 4 | registros legados preservados (9 estados) | ✅ |
| 5 | round 1 backfill correto | ✅ |
| 6 | offers pertencem a round | ✅ NOT NULL + FK composta |
| 7 | selections pertencem a round | ✅ FK de 4 colunas |
| 8 | múltiplas selections preservam histórico | ✅ |
| 9 | CTA continua "Aceitar oferta" | ✅ |
| 10 | aviso de compromisso visível | ✅ |
| 11 | aviso de divergência presencial visível | ✅ |
| 12 | **card "Registrar avaliação" NÃO existe** | ✅ testes + captura 04 |
| 13 | agenda interna não existe | ✅ |
| 14 | inspeção não existe no novo fluxo | ✅ |
| 15 | proposta final não existe no novo fluxo | ✅ |
| 16 | owner final decision não existe no novo fluxo | ✅ |
| 17 | PF recebe WhatsApp só da loja aceita | ✅ |
| 18 | PF recebe endereço comercial real | ✅ |
| 19 | losers continuam sem contato (404) | ✅ |
| 20 | dealer não recebe seller PII | ✅ |
| 21 | `no_agreement` funciona | ✅ |
| 22 | `no_agreement` não exige motivo | ✅ |
| 23 | outra oferta anterior pode ser aceita | ✅ |
| 24 | primeira seleção permanece | ✅ |
| 25 | nova seleção vira current match | ✅ |
| 26 | nova rodada funciona | ✅ |
| 27 | novo minimum pertence à nova rodada | ✅ |
| 28 | ofertas antigas não contaminam a rodada nova | ✅ |
| 29 | selection × selection protegido | ✅ 5 rodadas |
| 30 | selection × new round protegido | ✅ 5 rodadas |
| 31 | new round × new round protegido | ✅ 5 rodadas |
| 32 | idempotência verde | ✅ |
| 33 | notifications atômicas | ✅ (herdado; a 4.7 não adiciona) |
| 34 | PostgreSQL real verde | ✅ 131 testes |
| 35 | E2E principal verde | ✅ |
| 36 | E2E nova rodada verde | ✅ (mesmo spec) |
| 37 | responsive 6 larguras verde | ✅ |
| 38 | screenshots completas | ✅ 10/10 |
| 39 | nenhum arquivo local do usuário no commit | ✅ |
| 40 | zero regressão nova | ✅ pré-existentes provadas |
| 41 | monetização não implementada | ✅ |

## **GO**

Dívida nº 1 encerrada. O E2E da 4.4 exercitava uma máquina de produto que a 4.7
substituiu de propósito; foi aposentado com a cobertura conferida invariante a
invariante (§23.3.1), e as duas lacunas reais foram fechadas com teste antes da
remoção. Nenhuma asserção de privacidade foi afrouxada — duas foram acrescentadas.

**NÃO MERGEADO. NÃO DEPLOYADO.** Aguardando revisão.

---

## 23. Fechamento do gate — E2E da 4.4 e contagem

### 23.1 Preservação do arquivo local do usuário

`frontend/e2e/sale-request-offer-selection.spec.ts` tinha modificação local não
commitada. **Antes de qualquer escrita**, a versão local foi salva três vezes:

| Cópia | Endereço | Prova |
|---|---|---|
| Arquivo byte-a-byte, fora do repo | `…/scratchpad/backup-4-7/…LOCAL` | `sha256 603cac7f…b714e` (idêntico ao original) |
| `git diff` da versão local | `…/scratchpad/backup-4-7/local.diff` | 2.560 bytes |
| Blob no object DB do Git | `7a577bbba1a1b60c6e7723b8ac70b4e071d0725c` | `git cat-file -p` devolve o mesmo sha256 |

Recuperação: `git cat-file -p 7a577bbb > <destino>`.

Nenhum comando proibido foi usado (`git clean`, `git add .`, `git add -A`,
`git stash -u`, `git reset --hard`).

### 23.2 O que foi registrado no commit

O commit **não descarta** a alteração privada: ela é a BASE. A mudança do usuário
(o comentário reescrito explicando que a troca é de PRODUTO, e a remoção da
asserção de valor) foi preservada; só mudou o que a 4.7 tornou impossível —
o testid, a copy, e a parte do comentário que descrevia o painel da 4.5 como
estado atual.

```
- const selectedPanel = page.getByTestId("dealer-inspection-slot-form");
+ const selectedPanel = page.getByTestId("dealer-handoff-accepted");
  await expect(selectedPanel).toBeVisible({ timeout: 60_000 });
- await expect(selectedPanel).toContainText("Sua proposta foi selecionada");
+ await expect(selectedPanel).toContainText("Sua oferta foi aceita");
```

A asserção nova está **certa**: é literalmente a que o spec da 4.7 já faz
(`sale-request-handoff-rounds.spec.ts:287-290`), e aquele spec passa. O painel
renderiza sob `opportunity.is_selected`, que é exatamente o estado que o teste
da 4.4 alcança.

### 23.3 ACHADO — o passo 7 não era a única incompatibilidade

Com o passo 7 corrigido, **o spec da 4.4 continuava vermelho**, e falhava ANTES
dele, no passo 4 (linha 204). Levantamento completo:

| Passo | Asserção da 4.4 | Estado na 4.7 |
|---|---|---|
| 4 | `"Selecionar esta proposta?"` | copy virou **"Aceitar oferta"** |
| 4 | `"novas propostas serão encerradas"` | reescrita |
| 4 | `"Esta seleção é preliminar"` | **proibida** — a 4.7 exige que "preliminar" não volte |
| 5 | `"Aguardando próxima etapa"` | some no modo `compact`; há teste exigindo a ausência |
| 5 | status `"Proposta selecionada"` | virou **"Oferta aceita"** (`lib/sale-requests/api.ts:318`) |
| 5 | `expectNoContactLeak` (lista estrita) | **conflita** — o handoff mostra `handoff-whatsapp` de propósito |
| 7 | painel da loja escolhida | testid removido pela 4.7 |

Alinhar o passo 5 exigiria afrouxar uma asserção de privacidade. **Não foi
feito.** O spec foi **aposentado** — é a 8ª remoção do §16.

### 23.3.1 A tabela de cobertura — invariante a invariante

Nada foi removido sem substituto. Cada invariante ainda válida do spec antigo,
com onde ela é provada agora:

| # | Invariante da 4.4 | Cobertura equivalente | Camada |
|---|---|---|---|
| 1 | duas lojas propõem no mesmo carro | `sale-request-handoff-rounds.spec.ts:200-201` | E2E |
| 2 | o dono vê as DUAS propostas atuais | `…rounds.spec.ts:206` (`toHaveCount(2)`) | E2E |
| 3 | a maior é marcada **uma vez** e a ordem vem do servidor | `SaleRequestProposals.test.tsx:176-177` | tela |
| 4 | **nenhum contato antes do match** | `SaleRequestProposals.test.tsx` — **teste NOVO** (§23.3.2) | tela |
| 5 | **a MENOR pode ser escolhida** (§28) | `SaleRequestProposals.test.tsx:390` (tela) · `sale-requests-offer-selection.test.js:381` · `sale-requests-handoff-rounds.test.js:254` · `sale-request-offer-selection.integration.test.js:825` e `:1654` | tela + serviço + 2× integração |
| 6 | o clique não decide sozinho — o diálogo vem antes | `SaleRequestProposals.test.tsx:222` | tela |
| 7 | o diálogo não promete conclusão | `…rounds.spec.ts:230-234` + `SaleRequestProposals.test.tsx:249` (copy **invertida** pela 4.7) | E2E + tela |
| 8 | as perdedoras somem depois da decisão | `SaleRequestProposals.test.tsx:411` | tela |
| 9 | o estado vem do BANCO (reload) | `…rounds.spec.ts:250, 344, 361` | E2E |
| 10 | responsivo nas 6 larguras, sem overflow | `…rounds.spec.ts` `VIEWPORTS` = as mesmas 6 | E2E |
| 11 | a loja escolhida sabe que ganhou, em leitura | `…rounds.spec.ts:287-292` | E2E |
| 12 | **o formulário de proposta não existe** para a escolhida | `SaleRequestHandoff.test.tsx` — **teste NOVO** (§23.3.2) | tela |
| 13 | nenhum dado do dono chega à loja | `…rounds.spec.ts:312-314` + `SaleRequestHandoff.test.tsx:658` | E2E + tela |
| 14 | a solicitação decidida sai do feed | `sale-request-offer-selection.integration.test.js:1292` | integração |
| 15 | a perdedora leva **404**, sem saber que perdeu | `…rounds.spec.ts:385` + `sale-requests-legacy-flow` | E2E + serviço |
| 16 | a perdedora **não consegue propor** (409/404) | `sale-requests-offer-selection.test.js:623-645` (§15: nem a perdedora nem a própria escolhida; 409 + código + **nenhuma linha gravada**) | serviço |

As linhas 4 e 12 eram as únicas **sem equivalente explícito**. Foram fechadas
antes da remoção, e só então o spec saiu.

### 23.3.2 As duas asserções novas — e a prova de que elas mordem

```
SaleRequestHandoff.test.tsx
  + "o formulário de proposta NÃO existe — não está desabilitado"
    queryByTestId("dealer-offer-panel")  → null
    queryByTestId("dealer-offer-amount") → null

SaleRequestProposals.test.tsx
  + "a lista de propostas não entrega contato NENHUM antes do match"
    ["whatsapp", "telefone", "e-mail", "email"] ausentes do container
    queryByTestId("handoff-whatsapp") → null
```

A #12 era **estruturalmente** garantida — `DealerSaleOpportunityDetail.tsx:480`
escolhe com um ternário ENTRE o painel de handoff e o de proposta, nunca os dois
— mas garantia estrutural não avisa ninguém quando alguém troca o ternário por
dois blocos independentes.

A #4 é a que importa para privacidade: a 4.7 reduziu o `FORBIDDEN_CONTACT` do
E2E aos dois e-mails semeados, porque depois do match o WhatsApp da loja aparece
de propósito. **A lista estrita continua valendo antes do match**, e agora tem
teste dizendo isso — o que o spec aposentado provava no passo 2.

**Prova de que as duas mordem** (teste por mutação; as duas foram revertidas):

| Mutação | Resultado |
|---|---|
| `queryByTestId("dealer-offer-panel")` → `"dealer-handoff-accepted"` (testid que EXISTE) | ❌ vermelho |
| `store_name: "Prime Veículos"` → `"Prime Veículos telefone"` | ❌ vermelho |

Sem isto as duas seriam asserções que passam sem nunca poder falhar.

### 23.4 Contagem

**186.** A tabela do §16 somava 185 nas sete linhas originais — confirmado pelo
Git, com método e origem do 184 no §16 — e a aposentadoria do E2E da 4.4 é a
oitava remoção, +1 teste. Substituídos: 66 (64 + as duas asserções novas).

### 23.5 Gates re-executados

| Gate | Resultado |
|---|---|
| `tests/sale-requests` | ✅ 468 (13 arquivos) |
| `sale-request-offer-selection.integration` | ✅ 50 |
| `sale-request-handoff-rounds.integration` + `legacy-flow` | ✅ 37 (25 + 12) |
| `vitest run components/account` (frontend) | ✅ 340 (17 arquivos) |
| `tsc --noEmit` | ✅ limpo |
| `next lint` | ✅ sem warnings |
| `npm run build` | ✅ standalone verificado |
| E2E 4.7 (`sale-request-handoff-rounds.spec.ts`) | ✅ passou |
| `SaleRequestHandoff` + `SaleRequestProposals` (asserções novas) | ✅ 48 |
| Teste por mutação das duas asserções novas | ✅ as duas ficam vermelhas (§23.3.2) |
| E2E 4.4 (`sale-request-offer-selection.spec.ts`) | ⊘ **aposentado** (§23.3) |

O E2E da 4.7 foi rodado **três vezes**, cada uma com seed novo: 20,7 s / 20,2 s
verdes. A execução vermelha do meio foi **servidor `next dev` frio** — 52,3 s, os
primeiros compiles estourando timeouts de 60 s. Não é defeito de produto, mas
custa uma execução: **aqueça o dev server antes do primeiro E2E**, ou a primeira
rodada some com o seed sem provar nada. Some-se isto à dívida nº 5.

**Por que não repetir os 3446.** As duas correções tocam **dois arquivos**: um
spec de Playwright (que o `vitest` não coleta) e um `.md`. Nenhum código de
produção mudou — `git diff --stat` confirma. As suítes acima cobrem toda a
superfície adjacente e foram re-executadas mesmo assim; repetir a suíte completa
não exercitaria nenhuma linha diferente.

**`loginRateLimit` não foi enfraquecido.** Rodar E2E em série estoura os
10 logins/15 min por IP e o spec **pula** (não falha) com 429 — foi o que
aconteceu em duas execuções intermediárias. A saída foi **reiniciar o backend**
entre os specs, o que limpa o store em memória sem tocar em `windowMs`/`max`.
A primeira falha do E2E da 4.4 foi reproduzida com orçamento limpo: é real.
