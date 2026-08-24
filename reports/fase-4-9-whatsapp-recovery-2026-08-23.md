# Fase 4.9 — WhatsApp como segunda opção + recuperação da negociação

**PARADA NA AUDITORIA (§2). Zero alteração de código.**

| | |
|---|---|
| Branch | `codex/sale-request-whatsapp-recovery` |
| Base SHA | `70932440ef0da47e44de75dca9764fd585afde5f` (main; contém `0c11cf29`) |
| HEAD | este relatório, e nada mais |
| Migrations criadas | **nenhuma** |
| Arquivos de produto alterados | **nenhum** |

O §2 manda: *"Se a auditoria encontrar qualquer discrepância entre o código atual
e esta descrição: PARAR e documentar antes de reconstruir qualquer fluxo."*

A auditoria encontrou uma discrepância que atinge o **pressuposto central** da
fase. Este relatório documenta, e para.

---

## Auditoria Fase 4.9

### O achado

> **Não existe sistema de agendamento no Produto 2.**
>
> A Fase 4.7 o removeu deliberadamente, e a Fase 4.8 homologou essa remoção.

O §2 pede para preservar "o sistema atual de agendamento da avaliação
presencial", com a lista de coisas a não tocar: horários, disponibilidade,
criação, confirmação, reagendamento. **Nada disso está em produção.** O que
existe é o handoff direto: aceitar a oferta libera nome, endereço e WhatsApp da
loja, e a avaliação é combinada fora da plataforma.

Isso não é uma leitura minha do histórico — está escrito no cabeçalho do próprio
componente, `SaleRequestHandoff.tsx:21-32`:

> *"O QUE ESTA TELA SUBSTITUIU — Escolher horário, ver a agenda, acompanhar a
> inspeção, comparar 'declarado × observado', receber proposta final e
> aceitá-la. Seis momentos que a plataforma tentava orquestrar e que agora
> acontecem entre duas pessoas, no WhatsApp (…). O que ficou: o nome da loja, o
> valor aceito, o endereço, um botão para falar com ela — e uma saída para
> quando não der certo."*

E o §2 desta fase também diz **"Não reativar sistema antigo"** — o que confirma
que reativar a agenda não é o que se quer. As duas frases só são compatíveis se
a agenda estivesse viva. Ela não está.

### Mapa do que existe hoje

| O que a fase pede | Onde está | Situação |
|---|---|---|
| Componente do handoff PF | `frontend/components/account/SaleRequestHandoff.tsx` | existe |
| **Componente do agendamento** | — | **não existe** (`SaleRequestInspection.tsx` foi deletado pela 4.7) |
| **CTA de agendamento** | — | **não existe** |
| Rotas/backend do agendamento | `sale-requests.inspection.service.js` etc. | existem, mas **todos os writers recusam com 409 `LEGACY_FLOW_RETIRED`** |
| Tela legada | `SaleRequestLegacyFlow.tsx` | **read-only** — só exibe o histórico de quem viveu o fluxo 4.5 |
| Endpoint de WhatsApp | `GET /api/account/sale-requests/:id/handoff/whatsapp` | existe |
| Helper de normalização | `normalizeWhatsappDigits` — `src/shared/utils/brPhone.js` | existe |
| `advertiser.whatsapp` | `sale-requests.handoff.repository.js:176` | existe |
| Endereço comercial | `handoff-address` (com fallback para cidade) | existe |
| Fluxo `no_agreement` | `handoff-no-agreement-cta` + append-only | existe |
| Tela de outras ofertas | `owner-handoff-failed` + cards `sale-request-proposal` | existe |
| Criação de nova rodada | `handoff-new-round-cta` + `POST /:id/rounds` | existe |
| Testes correspondentes | `SaleRequestHandoff.test.tsx` — **25 testes** | existem |

### Os três objetivos, conferidos um a um

**Objetivo 1 — "PRESERVAR integralmente o sistema atual de agendamento".**
Vazio: não há o que preservar. Nenhum arquivo de agendamento pode mudar nesta
fase porque nenhum participa do fluxo ativo.

**Objetivo 2 — "adicionar um botão de WhatsApp como SEGUNDA opção".**
**Já existe** — e é a opção *principal*, porque não há a outra. Conferido na
homologação da 4.8, captura `03-owner-handoff-whatsapp.png`:

```
OFERTA ACEITA
Loja Atibaia
R$ 65.000,00
Entre em contato com a loja para combinar a avaliação presencial do veículo.
ENDEREÇO DA LOJA — Av. Jerônimo de Camargo, 1200 — Alvinópolis, Atibaia - SP
[ Falar com a loja pelo WhatsApp ]
A avaliação, eventual revisão do valor e a negociação da compra são
realizadas diretamente entre você e a loja.
[ Não houve acordo com esta loja ]
```

Todos os requisitos §4–§7 já estão atendidos, inclusive os negativos:

- usa `advertisers.whatsapp` e **só** ele. O repositório documenta exatamente o
  risco do §4: *"o schema tem cinco colunas de contato por herança (migrations
  antigas), e usar qualquer uma delas como 'o WhatsApp' entregaria o número
  pessoal de um operador no lugar do canal comercial da loja"*;
- normalização pelo helper compartilhado, sem DDI duplicado;
- mensagem sem CPF, e-mail, ids ou **valor**;
- loja sem WhatsApp → 409 `STORE_WHATSAPP_UNAVAILABLE`, mensagem discreta na
  tela (`handoff-whatsapp-error`), endereço continua aparecendo, nada quebra.

**Objetivo 3A — "ver e aceitar outras ofertas anteriores".**
**Já existe.** Depois do `no_agreement`, o card `owner-handoff-failed` diz
*"Você pode aceitar outra oferta já recebida ou abrir uma nova rodada de
propostas"*, e as ofertas restantes voltam como cards com "Aceitar oferta" cada
uma. Provado no E2E da 4.7 (`toHaveCount(2)` após o no-agreement) e na captura
`06-owner-outras-ofertas.png`.

**Objetivo 3B — "republicar para receber novas ofertas".**
**Já existe**, e já é implementado como *round*, não como sale_request nova —
exatamente o que o §13 pede. O modal já traz o que o §14 descreve: piso atual,
input de novo piso (não obrigatório), a ressalva do histórico, Cancelar/Confirmar.

### Cobertura de teste

Os §21 e §23 pedem testes que **já existem**, entre os 25 de
`SaleRequestHandoff.test.tsx`:

```
mostra loja, valor, endereço e o botão de WhatsApp
o WhatsApp é resolvido no clique, e a tela apenas abre a URL recebida
loja sem WhatsApp mostra a mensagem do servidor, sem quebrar a tela
não existe agenda, inspeção, proposta final nem aceite final
mostra as OUTRAS ofertas, com o botão de aceitar em cada uma
oferece o separador 'ou' e o botão de nova rodada
sem outras ofertas, não há separador — a rodada nova é a única saída
o diálogo mostra o piso atual e nasce preenchido com ele
envia o piso NOVO
```

Mais o E2E `sale-request-handoff-rounds.spec.ts`, que percorre o §24 quase
inteiro — aceite, handoff, WhatsApp da Loja A, ausência do card de avaliação,
no_agreement, outras ofertas, resseleção, WhatsApp da Loja B, nova rodada — e
passou 3× verde na homologação da 4.8.

---

## O que sobra de real

Descontado o que já existe, resta **copy** — e só:

| # | Hoje | O que a 4.9 prefere | § |
|---|---|---|---|
| C1 | `handoff-new-round-cta` diz **"Receber novas ofertas"** | **"Republicar anúncio"** | §10, §13 |
| C2 | Título do diálogo: "Receber novas ofertas" / confirmar: "Iniciar nova rodada" | "Republicar anúncio" | §14 |
| C3 | As outras ofertas aparecem **direto**, sem botão intermediário | um caminho rotulado **"Ver outras ofertas"** | §10, §11 |
| C4 | Mensagem: "…gostaria de **combinar** a avaliação presencial." | "…gostaria de **falar sobre** a avaliação presencial." | §6 |

Sobre C3: hoje as ofertas restantes já ficam visíveis assim que o
`no_agreement` é confirmado. Trocar isso por um botão **acrescenta** um clique
entre a pessoa e a informação que ela precisa para decidir. Registro como
contraindicação, não como recusa — é decisão de produto.

C4 é cosmético: as duas frases dizem a mesma coisa, e a atual já está coberta
por teste.

**Nenhum desses quatro itens justifica sozinho uma fase.** Todos juntos são um
diff de copy em um arquivo e um de constantes.

---

## Prova de que nada mudou

```
$ git status --short
?? frontend/public/images/lojista-detalhe-veiculo-referencia.png
?? frontend/public/images/lojista-oportunidades-veiculos-referencia.png
?? frontend/public/images/vender-para-loja.png
?? reports/fase-4-0-auditoria-venda-para-lojas-2026-08-15.md
```

Os quatro arquivos protegidos do usuário seguem intocados e fora do Git. Nenhum
comando proibido foi usado. Nenhum arquivo de agendamento, schema, migration,
service ou repository foi aberto para escrita — a auditoria inteira foi leitura.

---

## GO/NO-GO

**NO-GO para implementar como especificado**, por impossibilidade do
pressuposto, não por defeito.

- Objetivo 1 é vazio — não há agendamento a preservar.
- Objetivos 2 e 3 já estão em produção desde a 4.7, homologados na 4.8.
- O §3 pede dois CTAs lado a lado ("Agendar avaliação" *ou* "WhatsApp"); o
  primeiro não existe, então o layout descrito não é construível sem
  **reativar o sistema antigo** — que o próprio §2 proíbe.

**Nada foi alterado.** A decisão sobre C1–C4, e sobre a pergunta maior — se a
agenda deve ou não voltar —, é do dono do produto.

**NÃO PUSHADO. NÃO MERGEADO. NÃO DEPLOYADO.** Aguardando revisão.

---
---

# Auditoria de restauração da AGENDA (2ª rodada)

Decisão de produto registrada: trazer de volta **somente o agendamento**,
mantendo aposentados a ficha de avaliação e a proposta final. Esta seção é
**read-only**. Nenhum código foi escrito.

## Resumo executivo

**É possível — mas exige migration, e o schema antigo NÃO protege o cenário que
você levantou.**

Duas descobertas mandam na decisão:

1. **`CREATE UNIQUE INDEX sale_request_inspections_request_uidx ON (sale_request_id)`**
   — viva em produção. É **uma inspeção por solicitação, para sempre**. O cenário
   "agenda A → não houve acordo → agenda B" **não é possível**: o INSERT da
   agenda B viola o índice.
2. **A FK que amarrava a inspeção à loja selecionada foi REMOVIDA pela 4.7**
   (`sale_request_inspections_selected_store_fk` — `count = 0` em produção).
   Hoje nada no banco prova que o `advertiser_id` da inspeção é o match atual.

Ou seja: a resposta ao seu item 9 é **não, o schema antigo não prova**. Como
você pediu, não improviso — a resposta é migration.

---

## 1. Arquivos que compunham o agendamento aprovado

Na revisão anterior à 4.7 (`3e9d68b4^`):

| Arquivo | Linhas | Papel |
|---|---|---|
| `frontend/components/account/SaleRequestInspection.tsx` | 1039 | UI do proprietário: escolher horário, pedir novos, **+ aceitar/recusar proposta final** |
| `frontend/components/account/DealerInspectionPanel.tsx` | 832 | UI do lojista: propor horários, **+ registrar avaliação, + proposta final** |
| `frontend/lib/sale-requests/inspection.ts` | 297 | tipos, `formatSlot`, `formatMoneyValue` |
| `frontend/app/api/.../inspection/confirm/route.ts` | — | BFF |
| `frontend/app/api/.../inspection/request-slots/route.ts` | — | BFF |
| `src/.../sale-requests.inspection.service.js` | 1036 | agenda **e** avaliação |
| `src/.../sale-requests.inspection.repository.js` | 639 | idem |
| `src/.../sale-requests.inspection.validation.js` | 516 | idem |
| `src/.../sale-requests.inspection.constants.js` | 238 | idem |
| `src/database/migrations/058_...sql` | — | schema |

> **As duas telas são mistas.** Nenhuma delas é "a tela do agendamento": cada
> uma junta agendamento **e** o que continua aposentado. Restaurar só a agenda é
> cirurgia dentro dos arquivos, não `git revert`.

## 2. O que a 4.7 removeu

```
D  frontend/components/account/SaleRequestInspection.tsx     (owner)
D  frontend/components/account/DealerInspectionPanel.tsx     (lojista)
D  tests/sale-requests/sale-requests-inspection.test.js            1248 linhas
D  tests/integration/sale-request-inspection-final-offer...js      1213 linhas
D  frontend/e2e/sale-request-inspection-final-offer.spec.ts
(+ os 4 arquivos da proposta final — permanecem aposentados)
```

**Nada do backend foi deletado.** Services, repositories, validações e
constantes seguem inteiros — 2.726 linhas, apenas com guard na entrada.

## 3. Endpoints de agenda ainda montados

```
POST /api/account/sale-requests/:id/inspection/confirm        -> confirmInspectionSlot
POST /api/account/sale-requests/:id/inspection/request-slots  -> requestNewInspectionSlots
```

Mais a rota do lojista para propor horários. As rotas **não foram desmontadas de
propósito**: um 404 faria uma aba antiga parecer falha de infra; o 409 conta a
verdade.

## 4. Writers bloqueados por `LEGACY_FLOW_RETIRED`

São **seis**, e eles se separam **exatamente** na linha que você quer:

| Writer | Local | Na restauração |
|---|---|---|
| `offerInspectionSlots` (loja propõe horários) | `inspection.service.js:355` | **desbloquear** |
| `confirmInspectionSlot` (PF escolhe horário) | `:519` | **desbloquear** |
| `requestNewInspectionSlots` (PF pede novos) | `:650` | **desbloquear** |
| `completeInspection` (registrar avaliação) | `:752` | permanece 409 |
| `submitPostInspectionDecision` (proposta final) | `:855` | permanece 409 |
| `decideFinalOffer` (aceite/recusa final) | `final-decision.service.js:230` | permanece 409 |

**3 saem, 3 ficam.** A divisão é limpa — é a melhor notícia desta auditoria.

## 5. Tabelas da 058 disponíveis

Todas vivas em produção:

| Tabela | Linhas em prod | Serve à agenda? |
|---|---|---|
| `sale_request_inspections` | 1 | **sim** (`schedule_*`, `confirmed_slot_id`, `scheduled_at`) |
| `sale_request_inspection_slots` | 2 | **sim** — `UNIQUE (inspection_id, round_no, starts_at)`, append-only |
| `sale_request_post_inspection_decisions` | 0 | não — proposta final |
| `sale_request_owner_final_decisions` | 0 | não — aceite final |

`sale_request_inspections` é **mista**: guarda a agenda **e** as colunas
`observed_*` da ficha. Todas as `observed_*` são **nullable**, e **não há
nenhuma CHECK** na tabela em produção (`contype='c'` ausente). Então dá para
usar a metade "agenda" sem nunca tocar na metade "ficha" — sem migration para
essa separação.

## 6. Estados usados só pelo agendamento

**Em `sale_requests.status`** (o CHECK já os aceita — sem migration):
`inspection_scheduled`, `inspection_completed`.

**Em `sale_request_inspections.schedule_status`** (aplicacional, sem CHECK):
`awaiting_slots` → `awaiting_owner` → `scheduled` → `completed`.

Com `completeInspection` aposentado, `completed` deixa de ser alcançável e a
máquina termina em `scheduled`. Coerente com o produto novo: a avaliação
acontece, mas fora daqui.

## 7. Dá para restaurar só os quatro passos?

**Sim, no backend. Parcialmente, no frontend.**

- **Backend:** sim, e de forma limpa — os três writers da agenda não chamam os
  três da avaliação. Remover 3 guards basta.
- **Frontend:** não há componente para reviver inteiro. `SaleRequestInspection`
  (1039 linhas) e `DealerInspectionPanel` (832) misturam agenda com avaliação e
  proposta final. É preciso **extrair** a parte da agenda de cada uma — trabalho
  de recorte, com o risco de arrastar junto o que deve continuar morto.
- O E2E da 4.7 hoje **assere a AUSÊNCIA** de `dealer-inspection-slot-form`
  (`sale-request-handoff-rounds.spec.ts:302`). Esse teste passa a ser falso e
  precisa inverter.

## 8. Impacto das múltiplas seleções e rounds da 4.7

Aqui está o dano real, e ele tem duas faces.

**(a) Uma agenda por solicitação — bloqueio duro.**

```
sale_request_inspections_request_uidx  UNIQUE (sale_request_id)   [VIVA]
```

Loja A agenda. Não houve acordo. Loja B é aceita. O INSERT da agenda B **falha**
com violação de unicidade. Não é um risco de vazamento: é a funcionalidade
inteira que não existe.

**(b) Colisão de vocabulário — duas coisas chamadas "round".**

| Coluna | Significa | Começa em |
|---|---|---|
| `sale_requests.current_round_number` | rodada de **OFERTAS** (4.7) | 1 |
| `sale_request_rounds.round_number` | idem | 1 |
| `sale_request_inspections.schedule_round` | rodada de **HORÁRIOS** propostos | 0 |
| `sale_request_inspection_slots.round_no` | idem | 1 |

Duas máquinas de "rodada" no mesmo domínio, com bases diferentes. Nenhuma delas
está errada; juntas, são uma armadilha de leitura para quem for manter isso.

## 9. Como garantir que a agenda pertence ao MATCH ATUAL

**O schema antigo NÃO prova.** Duas lacunas independentes:

1. Não existe `selection_id` nem `round_id` em `sale_request_inspections`. O
   vínculo é `(sale_request_id, advertiser_id)` — e nada mais.
2. A FK que provava "este advertiser é a loja selecionada"
   (`sale_request_inspections_selected_store_fk`) **foi removida pela 4.7**.
   Confirmado em produção: `count = 0`.

E há um caso pior que o seu A→B, que filtrar por `advertiser_id` **não** cobre:

> Loja A aceita → agenda A → não houve acordo → nova rodada → **Loja A aceita de
> novo**. A linha antiga de A ressurge e é lida como a agenda do match NOVO,
> com um horário combinado para um negócio que já morreu.

Como você pediu para não improvisar, o desenho correto é explícito:

```sql
-- migration 061 (necessária)
ALTER TABLE sale_request_inspections ADD COLUMN selection_id BIGINT;

-- backfill: 1 linha em produção, e ela casa sem ambiguidade
--   inspection(sale_request 1, advertiser 64) <-> selection #1(sale_request 1, advertiser 64)

ALTER TABLE sale_request_inspections
  ADD CONSTRAINT sale_request_inspections_selection_fk
  FOREIGN KEY (selection_id, sale_request_id)
  REFERENCES sale_request_offer_selections (id, sale_request_id);

DROP INDEX sale_request_inspections_request_uidx;                    -- 1 por solicitação
CREATE UNIQUE INDEX ... ON sale_request_inspections (selection_id);  -- 1 por SELEÇÃO

ALTER TABLE sale_request_inspections ALTER COLUMN selection_id SET NOT NULL;
```

O alvo `(id, sale_request_id)` **já existe** como
`sale_request_offer_selections_id_request_unique` — a FK composta é declarável
sem criar chave nova. Com `UNIQUE(selection_id)`, A e B ganham agendas
independentes, e a de A nunca é alcançável pelo match de B, porque a leitura
parte de `selected_offer_id` → seleção atual → agenda daquela seleção.

## 10. Migrations necessárias

**Uma: `061`.** Sem ela, o item (a) do §8 torna a funcionalidade impossível e o
item 9 fica sem prova estrutural.

Não são necessárias migrations para: os estados de `sale_requests` (o CHECK já
aceita `inspection_scheduled`), as tabelas de slots, nem para separar agenda de
ficha (colunas `observed_*` nullable, sem CHECK).

## 11. Testes que voltariam ou mudariam

| Suíte | Situação |
|---|---|
| `tests/sale-requests/sale-requests-inspection.test.js` (1248 linhas, 54 testes) | recuperar **parcialmente** — só a parte de agenda |
| `sale-request-inspection-final-offer.integration.test.js` (1213 linhas, 27) | idem, só a agenda |
| `sale-requests-legacy-flow.test.js` (15) | **inverter** o que hoje prova 409 nos 3 writers da agenda |
| `sale-request-legacy-flow.integration.test.js` (12) | idem |
| `SaleRequestHandoff.test.tsx` — *"não existe agenda, inspeção, proposta final nem aceite final"* | **inverter** |
| `SaleRequestHandoff.test.tsx` — *"os testids do painel antigo não existem mais"* | remover `dealer-inspection-slot-form` da lista |
| `sale-request-handoff-rounds.spec.ts:302` | **inverter** a asserção de ausência |
| Novo: agenda pertence à seleção ATUAL | criar — é a prova do item 9 |
| Novo: A→B→A (mesma loja reaceita) não herda agenda velha | criar |

> **Atenção ao §22 do seu roteiro.** Ele pede "zero alteração semântica" nos
> testes do agendamento. Não é alcançável: os testes que existem hoje provam que
> a agenda **não existe**. Restaurá-la exige invertê-los. Isso é correto, mas é o
> oposto do que o §22 previa — porque o §22 também partia de que a agenda estava
> viva.

## 12. Tamanho e risco

| | |
|---|---|
| Migration | ~120 linhas (061) |
| Backend | ~250–350 linhas (3 guards + `selection_id` atravessando repo/service/validação) |
| Frontend — proprietário | ~400–500 linhas extraídas das 1039 |
| Frontend — lojista | ~250–350 linhas extraídas das 832 |
| Handoff (CTA duplo) | ~40 linhas |
| Testes | ~800–1200 linhas recuperadas/adaptadas/novas |
| E2E | 1 spec novo + 1 inversão |
| **Total** | **~15–25 arquivos, ~2.000–2.500 linhas** |

**Risco: MÉDIO-ALTO.** Não pelos guards — essa parte é limpa. Pelos três pontos
abaixo:

1. **Migration sobre schema homologado.** A 060 acabou de ser homologada em
   produção. Trocar o índice de unicidade de `sale_request_inspections` é a
   primeira alteração destrutiva (`DROP INDEX`) do módulo. Tem 1 linha real para
   migrar — o risco é baixo em volume e alto em atenção.
2. **Recorte dentro de arquivos mistos.** Puxar a agenda de dentro de duas telas
   que também continham a ficha e a proposta final é exatamente o movimento que
   pode reintroduzir, sem querer, um campo do §8.
3. **Inversão de testes que hoje protegem a remoção.** Cada asserção invertida é
   uma proteção a menos contra o retorno acidental da ficha. Precisam ser
   invertidas com precisão cirúrgica — o teste de ausência do card de avaliação
   **não** pode ser afrouxado junto.

Isto **não é** o "diff pequeno" que o §30 previa. É uma fase do porte da 4.5 ou
da 4.7.

---

## O que NÃO muda

Preservados como estão, sem toque: **WhatsApp como segunda opção**, **ver outras
ofertas**, **republicar / nova rodada**, `no_agreement` append-only, rounds de
oferta, e os três writers da ficha/proposta final continuando em 409.

## Parada para decisão

Nenhum código escrito. Nenhuma migration criada. Worktree limpo, os quatro
arquivos protegidos intocados.

Falta sua decisão sobre a **migration 061** — sem ela, o cenário A→B que você
levantou não é implementável, e o item 9 fica sem prova estrutural.
