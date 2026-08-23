# Fase 4.8 — Homologação final

MVP "Venda seu carro para lojas" · 2026-08-23

---

## 1. Escopo

Homologação. **Zero alteração funcional** — nenhum arquivo de produto foi tocado.
A fase validou deploy, migration, banco, fluxo, privacidade, rodadas e ausência
do fluxo aposentado, e decide GO/NO-GO do MVP.

Uma coisa mudou em relação ao roteiro: **o smoke funcional (§8–§22) não foi
executado em produção.** A justificativa está no §5.1 e é a que o próprio §7/§26
manda seguir — "se não for seguro executar uma etapa em produção, documentar e
validar por staging/local + evidência estrutural". Onde isso muda a força da
evidência, está dito linha a linha.

---

## 2. Commit/deploy homologado

| Item | Evidência |
|---|---|
| main local | `0c11cf292e273dfe79f2d76c32bfb7c25c93db96` (`git pull --ff-only` → *Already up to date*) |
| **Backend em produção** | `/health` → `"commit":"0c11cf292e273dfe79f2d76c32bfb7c25c93db96"` — **idêntico** |
| Saúde do backend | `{"ok":true,"status":"healthy","env":"production","version":"2.1.0"}` |
| Checks | `db: up`, `redis: disabled`, `antifraud_schema: ok`, latência 171 ms |
| Crash loop | Não — `uptime_s: 3011` (~50 min contínuos) |
| Frontend | `https://www.carrosnacidade.com` → 200, Next.js via Render/Cloudflare |
| Frontend ↔ backend | `/api/diag`: resolve `carros-na-cidade-core.onrender.com`, sondas `adsSearch_SP` e `publicHome` **200** |
| Migrations pendentes | Nenhuma (§3) |

**Verificação por CONTEÚDO, não por topologia**: a main contém `migration 060`,
`DealerHandoffPanel.tsx`, `SaleRequestHandoff.tsx`,
`sale-requests.handoff.service.js` e o spec da 4.7; e **não** contém
`SaleRequestInspection.tsx` nem os specs aposentados.

> **Nota de domínio.** O domínio real é **`carrosnacidade.com`** (apex e `www`,
> ambos 200). `carrosnacidade.com.br` é NXDOMAIN — não é uma queda, é outro
> domínio. Registrado aqui porque a primeira sondagem usou o `.com.br` e o `000`
> resultante parecia queda de produção.

---

## 3. Migration 060

Consultado no PostgreSQL de produção (`carros_na_cidade_db`), sessão com
`default_transaction_read_only = on`.

| Verificação | Resultado |
|---|---|
| `060_sale_request_rounds_handoff.sql` aplicada | ✅ **exatamente 1 vez** (id 156, 2026-08-24 01:21:24Z) |
| 058 preservada | ✅ id 154 |
| 059 preservada | ✅ id 155 |
| Duplicatas em `schema_migrations` | ✅ nenhuma |
| Total de migrations | 60 |
| `sale_request_rounds` | ✅ existe |
| `sale_request_handoff_outcomes` | ✅ existe |
| `sale_requests.current_round_number` | ✅ `integer NOT NULL` |
| `sale_request_offers.round_id` | ✅ `bigint NOT NULL` |
| `sale_request_offer_selections.round_id` | ✅ `bigint NOT NULL` |
| `handoff_failed` aceito | ✅ em `sale_requests_status_check` **e** em `sale_requests_selected_offer_coherence_check` |
| Dados históricos | ✅ nada destruído — as 9 tabelas do Produto 2 continuam lá, incluindo as do fluxo aposentado |

Constraints relevantes conferidas:

```
sale_request_rounds_request_number_unique      UNIQUE (sale_request_id, round_number)
sale_request_rounds_id_request_unique          UNIQUE (id, sale_request_id)
sale_request_rounds_number_check               CHECK (round_number >= 1)
sale_request_handoff_outcomes_outcome_check    CHECK (outcome = 'no_agreement')
sale_request_handoff_outcomes_selection_unique UNIQUE (selection_id)
sale_request_handoff_outcomes_selection_request_fk
    FK (selection_id, sale_request_id) → sale_request_offer_selections(id, sale_request_id)
sale_request_offer_selections_offer_round_fk
    FK (offer_id, sale_request_id, advertiser_id, round_id)
     → sale_request_offers(id, sale_request_id, advertiser_id, round_id)
sale_request_offer_selections_request_advertiser_round_unique
    UNIQUE (sale_request_id, advertiser_id, round_id)
```

A FK de 4 colunas é a que prova que a seleção pertence à oferta **daquela loja
naquela rodada** — sem trigger.

> A tabela de seleções chama-se `sale_request_offer_selections`, não
> `sale_request_selections`. A primeira consulta usou o nome errado e devolveu
> `42P01`; o resultado só vale porque foi refeita.

---

## 4. Sanity check PostgreSQL

Produção, read-only. **Todas as invariantes do §6 passam.**

| # | Verificação | Resultado |
|---|---|---|
| 6.1 | offers com `round_id` NULL | **0** |
| 6.2 | selections com `round_id` NULL | **0** |
| 6.3 | offer ligada a round de outra request | **0** |
| 6.4 | selection ligada a round incompatível | **0** |
| 6.5 | `current_round_number < 1` | **0** |
| 6.6 | `round_number < 1` | **0** |
| 6.7 | duplicidade de round por request | **0** |
| 6.8 | request sem round nenhuma | **0** |
| 6.9 | `current_round_number` apontando para round inexistente | **0** |

Volumetria: **1** sale_request · **8** offers · **1** selection · **1** round ·
**0** handoff outcomes. O backfill da 060 está íntegro.

### 4.1 O único registro de produção é do fluxo APOSENTADO

```
sale_request #1 · status = inspection_scheduled · current_round_number = 1
selected_offer_id = 8 · seleção R$ 64.500,00 · advertiser 64 · Atibaia-SP
+ 1 sale_request_inspection (schedule_status='scheduled', slot confirmado,
  agendada para 2026-08-24 20:00) + 2 slots
```

É um registro da era 4.5, criado em 2026-08-18, anterior ao deploy da 4.7. Ele é
exatamente o caso para o qual o `SaleRequestLegacyFlow` foi escrito: continua
válido pelos CHECKs, continua legível, e os writers que o produziram agora
recusam com 409.

**Consequência para esta homologação: produção tem ZERO registros do fluxo novo.**
Não havia o que homologar observando dados existentes.

---

## 5. Publicação PF

**Executado localmente**, sobre o commit `0c11cf29` — o mesmo que está em
produção — com PostgreSQL real, backend real e Next real.

| §8 | Resultado |
|---|---|
| PF autenticada publica a solicitação | ✅ |
| Round 1 criada | ✅ `round_number = 1` |
| `current_round_number = 1` | ✅ |
| Nenhum dado 4.5/4.6 criado | ✅ `inspections=0, slots=0, post_decisions=0, final_decisions=0` |

### 5.1 Por que NÃO em produção — a decisão e as evidências

Três fatos, cada um bastaria:

1. **Os lojistas de Atibaia são reais.** São **53 advertisers** naquela cidade.
   Uma solicitação de teste apareceria no feed de todos os elegíveis. O §7 proíbe
   textualmente usar lojista real para oferta falsa.

2. **O dado de teste seria irremovível.** `cancelForOwner` só casa com
   `status = 'receiving_offers'`, e **não existe DELETE** — é soft por design
   (trilha auditável). Depois do primeiro aceite a solicitação **não pode mais
   ser cancelada** (a própria tela diz isso). Um smoke completo terminaria em
   `receiving_offers` na rodada 2 ou em `offer_selected`, e ficaria em produção
   para sempre. O §26 exige definir a remoção segura ANTES de criar o dado; ela
   não existe.

3. **O cenário de 3 lojas não é montável.** O handoff exige WhatsApp e endereço
   comercial, e **em Atibaia exatamente 1 das 53 lojas tem os dois** (ver §22.1).
   Loja B e Loja C teriam de ser criadas ou ter cadastro alterado — mexer em
   registro comercial real.

O caminho seguido é o que o §7 e o §26 mandam nesse caso: validar em ambiente
controlado sobre o commit idêntico, e sustentar com evidência estrutural
(migration, constraints, guards, banco).

---

## 6. Feed lojista

| §9 | Resultado |
|---|---|
| Oportunidade aparece para loja elegível | ✅ |
| Escopo por cidade | ✅ |
| Resolução de loja (`advertiser`) correta | ✅ a oferta grava o `advertiser_id` da loja escolhida pelo lojista, nunca a de menor id |
| Loja fora de escopo | ✅ 404 indistinguível |
| Regra territorial | não alterada |

Elegibilidade = conta CNPJ + advertiser na cidade. **Não exige WhatsApp nem
endereço** — ver §22.1.

---

## 7. Ofertas

| §10 | Resultado |
|---|---|
| Duas lojas ofertam (R$ 65.000 e R$ 63.500) | ✅ |
| Todas na round 1 | ✅ `round_id = 31` para as duas |
| Oferta atual por advertiser | ✅ |
| Maior marcada exatamente uma vez | ✅ |
| Identidade do concorrente não exposta | ✅ o valor líder é visível, quem o fez não |
| Aviso de compromisso antes de ofertar | ✅ "intenção real de compra", "revisar o valor ou desistir" |
| PII da PF | ✅ nenhuma |

Evidência: `01-owner-ofertas-local.png`.

---

## 8. Aceitar Oferta

CTA confirmado: **"Aceitar oferta"** — em todos os cards, inclusive o da oferta
menor, sem atrito extra e sem "recomendado".

Modal (`02-owner-modal-aceitar.png`), texto integral verificado:

- **"Aceitar oferta"** (título)
- "Você está aceitando a oferta de **Loja Atibaia** e vai seguir para a avaliação presencial com esta loja."
- "A oferta foi feita com base nas informações fornecidas no anúncio. Caso a avaliação presencial identifique **divergências relevantes**, defeitos não informados ou problemas documentais, a loja poderá **revisar o valor ou desistir da compra**."
- "Ao aceitar uma oferta, **você confirma sua intenção de vender** o veículo nas condições informadas no anúncio."
- **R$ 65.000,00**

Ausentes, como exige o §33: "preliminar", "sem compromisso", "simulação",
"estimativa", "manifestação de interesse".

Persistência após o aceite:

```
selection #81 · offer 119 · advertiser 3 · amount_snapshot 65000.00 · round 1
```

`selected_offer_id`, snapshot de valor, `round_id` e trilha — todos coerentes.

---

## 9. Handoff

Evidência: `03-owner-handoff-whatsapp.png`.

| §12 | Presente |
|---|---|
| Selo **OFERTA ACEITA** | ✅ |
| Nome da loja — "Loja Atibaia" | ✅ |
| Valor — R$ 65.000,00 | ✅ |
| **Endereço comercial** — "Av. Jerônimo de Camargo, 1200 — Alvinópolis, Atibaia - SP" | ✅ |
| Botão **"Falar com a loja pelo WhatsApp"** | ✅ |
| "Entre em contato com a loja para combinar a avaliação presencial do veículo." | ✅ |
| "A avaliação, eventual revisão do valor e a negociação da compra são realizadas **diretamente entre você e a loja**." | ✅ |
| CTA "Não houve acordo com esta loja" | ✅ |
| Chip de status | "Oferta aceita" (não mais "Proposta selecionada") |

---

## 10. WhatsApp

Gerado **no servidor** (`sale-requests.handoff.service.js:189`), nunca montado no
cliente.

| §13 | Resultado |
|---|---|
| Formato | `https://wa.me/55XXXXXXXXXXX?text=…` — validado por regex no E2E |
| Campo de origem | `advertisers.whatsapp` da loja **aceita** |
| Normalização | `normalizeWhatsappDigits` — exige DDD + 8/9 dígitos |
| DDI | ✅ **não duplica**: já começando com `55` e sobrando 10–11 dígitos, devolve como está |
| Zero à esquerda | removido (é discagem interurbana) |
| Aponta para a Loja A | ✅ e muda com a resseleção (provado no smoke) |
| Contém "Carros na Cidade" | ✅ |
| Identifica o veículo | ✅ "…pelo meu {veículo}…" |
| CPF / e-mail / id interno / valor | ✅ **nenhum** — asserção `not.toMatch(/cpf\|@\|\d{5,}/i)` |
| Loja sem WhatsApp | 409 `STORE_WHATSAPP_UNAVAILABLE`, mensagem na tela, sem quebrar |
| Telefone cru em log | ✅ nunca — o log registra o motivo, não o número |

Mensagem: `Olá! Vim pelo Carros na Cidade. Aceitei a oferta de vocês pelo meu
{veículo} e gostaria de combinar a avaliação presencial.`

Nenhuma mensagem foi enviada a terceiros — apenas o link foi validado.

---

## 11. Privacidade antes/depois do match

### Antes (§14) — confirmado na tela e no código

A lista de propostas mostra **nome da loja, cidade e valor**. Nada além.
Verificado no `02-owner-modal-aceitar.png` e por teste de tela dedicado
(`SaleRequestProposals.test.tsx`, asserção adicionada no fechamento da 4.7:
`["whatsapp","telefone","e-mail","email"]` ausentes, `handoff-whatsapp` nulo).

O lojista, antes do aceite, não recebe telefone, WhatsApp, e-mail, CPF, endereço
residencial nem `user_id` da PF.

### Depois (§15)

| Quem | Recebe | Não recebe |
|---|---|---|
| PF ← Loja A | nome comercial, endereço comercial, WhatsApp comercial | — |
| Loja A ← PF | **nada** pelo portal | telefone, WhatsApp, e-mail, CPF |
| Lojas B e C | **nada** | 404 indistinguível na oportunidade |

O contato da PF só existe se **ela** abrir a conversa — e aí é ato dela, não do
portal. Provado na tela do lojista: `04-dealer-oferta-aceita.png` não contém
"whatsapp", "telefone", "e-mail" nem "cpf".

Depois do "não houve acordo", o canal **fecha**: `handoff-whatsapp` volta a ser
nulo (`SaleRequestHandoff.test.tsx:402`).

---

## 12. Loja selecionada

`04-dealer-oferta-aceita.png`:

- **"Sua oferta foi aceita"**
- **OFERTA ACEITA · R$ 65.000,00**
- "O proprietário recebeu os dados da sua loja para combinar a avaliação presencial."
- "A avaliação e eventual negociação passam a acontecer diretamente entre as partes."
- Painel **read-only**: zero `<form>`, `<input>`, `<select>`, `<textarea>`, `<button>`

---

## 13. Ausência do card "Registrar avaliação"

Conferido campo a campo na captura do lojista. **Nenhum** dos termos proibidos
aparece:

`registrar avaliação` · `avaliação confirmada para` · `quilometragem lida` ·
`estado geral observado` · `registrar proposta final` · `proposta final`

E os testids do painel antigo têm contagem **0**: `dealer-inspection-slot-form`,
`dealer-inspection-form`, `dealer-inspection-mileage`, `dealer-decision-form`,
`dealer-decision-amount`. Sem agenda, sem slots, sem proposta final.

> **Distinção que importa.** A tela do lojista MOSTRA "Motor", "Câmbio",
> "Suspensão", "Pneus", "Quilometragem" — sob o título **"Situação declarada pelo
> proprietário"**. É a ficha declarada (Fase 4.2), read-only, e não o formulário
> de inspeção removido. A diferença está no rótulo: *declarado* × *lido/observado*.
> Ler a captura sem essa distinção produziria um falso P1.

---

## 14. No agreement

`05-owner-sem-acordo.png`.

| §18 | Resultado |
|---|---|
| Modal "Confirma que não houve acordo" | ✅ |
| "não tiver prosseguido" | ✅ |
| Pede motivo / defeito / valor / culpa / observação | ✅ **não** — `input, textarea, select` → contagem **0** |
| Status | `handoff_failed` |
| Evento append-only | ✅ `outcome = 'no_agreement'`, sem coluna de motivo (o CHECK só admite esse valor) |
| Seleção anterior preservada | ✅ ver §15 |

---

## 15. Resseleção

`06-owner-outras-ofertas.png`, `07-owner-nova-selecao.png`.

As outras ofertas reaparecem; a PF aceita a Loja B. Trilha reconstruída
**direto do banco** (§20):

```
Seleção #81 · offer 119 · advertiser 3 · R$ 65.000,00 · round 1 · 23:27:24
   └── handoff_outcome #29 · no_agreement · 23:27:32
Seleção #82 · offer 118 · advertiser 7 · R$ 63.500,00 · round 1 · 23:27:35
   └── handoff_outcome #30 · no_agreement · 23:27:41
```

Nada apagado, nada reescrito. As duas seleções coexistem, em ordem, com
`amount_snapshot` próprio. A Loja A deixa de ser o match atual e volta a 404; a
Loja B passa a ver `dealer-handoff-accepted` com R$ 63.500.

---

## 16. Nova rodada

`08-owner-round-2.png`.

```
round #31 · round_number 1 · minimum NULL
round #32 · round_number 2 · minimum 58000.00
sale_requests.current_round_number = 2
```

O piso novo pertence **somente** à rodada 2 — a rodada 1 continua com o piso que
tinha. Histórico preservado.

---

## 17. Isolamento entre rounds

Esta é a invariante que o §22 exige, e ela foi provada **no banco**, não só na
tela:

```
round 1 → offer 118 (advertiser 7, R$ 63.500)
          offer 119 (advertiser 3, R$ 65.000)
round 2 → offer 120 (advertiser 3, R$ 58.000)

ofertas cruzando de rodada: 0
```

O **advertiser 3 ofertou nas duas rodadas e ganhou uma LINHA por rodada** — é
exatamente o que o escopo `sale_request + advertiser + round` promete. Nenhuma
oferta da rodada 1 virou oferta atual da rodada 2. Ao abrir a rodada 2, a lista
de propostas atuais foi a **zero** e mostrou o estado vazio.

---

## 18. Legacy 4.5/4.6

Os **seis** writers aposentados têm guard, e o guard lança **409
`LEGACY_FLOW_RETIRED`**:

| Writer | Guard |
|---|---|
| `offerInspectionSlots` | `inspection.service.js:355` |
| `confirmInspectionSlot` | `inspection.service.js:519` |
| `requestNewInspectionSlots` | `inspection.service.js:650` |
| `completeInspection` | `inspection.service.js:752` |
| `submitPostInspectionDecision` | `inspection.service.js:855` |
| `decideFinalOffer` | `final-decision.service.js:230` |

Em **produção**, sem sessão, as rotas legadas respondem **401** — nunca 200:

```
401  POST /api/account/sale-requests/1/inspection/confirm
401  POST /api/account/sale-requests/1/final-offer-decision
```

E a UI implantada não oferece nenhum caminho para elas (§13). Os 409 em si são
provados por integração/unidade (`sale-requests-legacy-flow`,
`sale-request-legacy-flow.integration`), sem disparar writers contra produção —
como o §17 permite.

---

## 19. Console/network/logs

**Console (produção, visitante deslogado).** Único erro em `/` e `/comprar`:

```
GET /api/auth/me → 401
```

É a sondagem de sessão de quem não está logado — baseline conhecido, não é
defeito. Todo o resto: 200/204, incluindo `POST /api/analytics/events → 204` e
`GET /api/cities/public-set → 200`. Sem erro de hidratação, sem loop de requests,
sem 5xx, sem endpoint antigo chamado pela UI nova.

**Logs do backend durante o smoke.** A trilha bate exatamente com o fluxo:

```
3× sale_request.offer_created      2× sale_request.offer_selected
2× sale_request.handoff_no_agreement  1× sale_request.open_round
1× sale_request.handoff_whatsapp   3× sale_request.dealer_detail
```

Zero exception, zero FK violation, zero CHECK violation, zero duplicate key,
zero deadlock, zero unhandled rejection, zero 500 no domínio de sale-requests.

Único erro no log: `[auth] falha ao persistir login_logs — relation "login_logs"
does not exist`. **É lacuna do banco de TESTE local**: conferido em produção,
`login_logs` **existe**. Não é defeito da 4.7/4.8 (ver Dívida D2).

---

## 20. Responsive

`expectNoHorizontalOverflow` roda em **360, 390, 412, 768, 1024 e 1440 px** nos
estados: ofertas recebidas, handoff ativo, outras ofertas e rodada 2. Tolerância
de 1px para arredondamento fracionário. **Zero overflow horizontal.**

`09-mobile-390.png` confirma o handoff em 390 px: tudo empilhado, CTA de WhatsApp
em largura total, endereço legível, "Não houve acordo" acessível.

---

## 21. Product 1 smoke

Produção, sem alterar nada:

| Rota | |
|---|---|
| `/` | 200 |
| `/comprar` | 200 |
| `/cidade/atibaia-sp` | 200 |
| `/simulador-financiamento` | 200 |
| `/blog` | 200 |
| `/api/ads/search?state=SP` (via diag) | 200 |
| `/api/public/home` (via diag) | 200 |

Rota compartilhada de intenção de compra (`/dashboard/minhas-procuras`,
`/dashboard-loja/oportunidades/compradores`) continua montada e protegida.
Nenhuma regressão do Produto 1.

> `/simulador` devolve 404 — a rota é `/simulador-financiamento`. Erro da minha
> primeira sondagem, não regressão.

---

## 22. Segurança

Produção, sem sessão — **todos 401**, nenhum 200:

```
401  GET  /api/account/sale-requests/1/handoff/whatsapp
401  POST /api/account/sale-requests/1/handoff/no-agreement
401  POST /api/account/sale-requests/1/rounds
401  GET  /api/account/sale-requests/1
401  GET  /api/account/opportunities/sale-requests
```

| Item | Resultado |
|---|---|
| Auth em todos os endpoints novos | ✅ |
| Owner scope / dealer scope | ✅ identidade sai de `req.user.id`; o advertiser é reconfrontado no servidor |
| 404 indistinguível para quem perdeu | ✅ o corpo não conta que outra loja ganhou |
| Validação de rodada atual | ✅ FK de 4 colunas + UNIQUE por rodada |
| WhatsApp server-generated | ✅ |
| IDs sensíveis no frontend | ✅ o `advertiser_id` devolvido é o das lojas do próprio usuário e não autoriza nada |
| Página privada sem sessão | ✅ shell de 15 KB que redireciona para login — **zero** vazamento: nenhuma ocorrência de valor, `sale_request`, `advertiser`, `whatsapp` ou `T-Cross` |
| Nenhum pentest destrutivo | ✅ |

Nenhuma superfície pública/SEO foi criada: `robots.txt` já nega `/dashboard` e
`/dashboard-loja`; o índice de sitemaps tem 9 entradas e **nenhuma** de
sale_requests, rounds ou offers; `blog_posts` não tem slug do produto; `ads` não
tem coluna ligando a `sale_requests`.

---

## 23. Bugs encontrados

**Nenhum P0. Nenhum P1. Nenhum P2 de código.**

| # | Achado | Grau | Situação |
|---|---|---|---|
| A1 | **Cobertura comercial das lojas** — o handoff promete nome + endereço + WhatsApp, mas só **5 de 61** lojas em produção têm WhatsApp *e* endereço; **em Atibaia, 1 de 53**. A elegibilidade para ofertar **não** exige esses campos, então uma loja incompleta pode ofertar, ser aceita, e entregar um handoff degradado. | **P2 operacional** (não é defeito de código) | Aberto — ver Dívida D1 |
| A2 | `login_logs` não existe no banco de TESTE local → 3 erros de log por execução | P3 ambiente | Aberto — D2. **Produção tem a tabela.** |
| A3 | Primeira execução do E2E com `next dev` frio estoura timeout e consome o seed | P3 ambiente | Conhecido desde a 4.7 (dívida nº 5) |

**A1 não bloqueia o GO** porque o produto degrada com elegância e isso é testado:
sem WhatsApp → 409 com mensagem na tela, sem quebrar; sem endereço → o bloco cai
para a cidade. Mas é o risco de lançamento mais concreto que esta homologação
encontrou, e é de **dado/operação**, não de engenharia.

---

## 24. Evidências

`reports/screenshots/fase-4-8/` — **9 capturas**, todas do ambiente de
homologação local sobre o commit `0c11cf29`:

```
01-owner-ofertas-local.png     ofertas recebidas, aviso de compromisso, CTA igual para as duas
02-owner-modal-aceitar.png     modal "Aceitar oferta" com as três ressalvas do §3
03-owner-handoff-whatsapp.png  OFERTA ACEITA + loja + valor + endereço + WhatsApp
04-dealer-oferta-aceita.png    "Sua oferta foi aceita", sem card de avaliação
05-owner-sem-acordo.png        modal sem campo de motivo
06-owner-outras-ofertas.png    as outras ofertas de volta
07-owner-nova-selecao.png      segunda oferta aceita, histórico da primeira
08-owner-round-2.png           rodada 2, lista vazia
09-mobile-390.png              handoff em 390 px
```

O `01` mantém o sufixo `-local` de propósito: o §38 pedia
`01-owner-ofertas-producao.png`, e nomear um arquivo local de "produção" seria
uma evidência que mente. As outras seguem os nomes do §38.

Nenhuma captura contém CPF, telefone privado, e-mail privado, token ou secret.
As contas são as do seed de homologação ("E2E CPF Demo", "Loja Atibaia").

Dados brutos das consultas read-only ficaram no scratchpad da sessão
(`prod-audit*.txt`, `local-verify.txt`), fora do repositório.

---

## 25. Dívidas

**D1 — Cobertura comercial das lojas (A1).** Antes de abrir o MVP a usuários
reais, decidir uma das duas: (a) exigir WhatsApp + endereço para a loja ficar
elegível a ofertar; ou (b) avisar o lojista, no momento da oferta, que sem esses
campos o proprietário não conseguirá contatá-lo. Hoje não há nem exigência nem
aviso. **É a única dívida que toca o valor central do produto.**

**D2 — `login_logs` ausente no banco de teste.** Faz toda execução local cuspir
erro que não é do produto. Custa atenção em toda depuração futura.

**D3 — O registro legado de produção (`sale_request #1`).** Continua em
`inspection_scheduled`, com inspeção agendada para 2026-08-24. A UI legada é
read-only e os writers recusam com 409, mas **a tela dele não foi verificada em
produção** (exigiria a sessão daquele proprietário). Recomendo abrir uma vez com
a conta dona e confirmar que ela lê o histórico sem oferecer ação.

**D4 — Sem ambiente de staging.** É a causa raiz de o §8–§22 não ter rodado em
produção. Um staging com banco próprio tornaria esta fase inteiramente
executável do jeito que o roteiro pedia.

**D5 — Herdadas da 4.7**: `WHATSAPP_BASE_URL` duplicado entre Produto 1 e
Produto 2; `SALE_REQUEST_POST_DECISION_STATUSES` sem consumidor; `npm run build`
derruba dev server ativo; dev server frio queima a primeira execução de E2E.

---

## 26. GO/NO-GO

### Regressão executada nesta fase

| Gate | Resultado |
|---|---|
| `tests/sale-requests` | ✅ 468 (13 arquivos) |
| Integração (seleção + handoff/rounds + legacy + schema) | ✅ **131** (4 arquivos) |
| §28 concorrência — resseleção × resseleção | ✅ |
| §28 concorrência — resseleção × nova rodada | ✅ |
| §28 concorrência — nova rodada × nova rodada | ✅ |
| §28 concorrência — seleção × seleção / × nova proposta / × cancelamento | ✅ |
| E2E do fluxo homologado | ✅ **3 execuções verdes** com seed novo |

`loginRateLimit` **não foi enfraquecido** (§29): 10 logins / 15 min por IP
seguem valendo. Entre execuções, o backend foi reiniciado — o store é em
memória, e reiniciar limpa o estado sem tocar em `windowMs`/`max`.

Nenhum teste de carga foi feito em produção (§27).

### Checklist do §39

| | Gate | | Onde |
|---|---|---|---|
| ✅ | deploy contém Fase 4.7 | | **produção** (`/health` commit idêntico) |
| ✅ | migration 060 aplicada | | **produção** |
| ✅ | backend saudável | | **produção** |
| ✅ | frontend saudável | | **produção** |
| ✅ | banco sem incoerência da 060 | | **produção** (9/9 sanity zeradas) |
| ✅ | PF consegue publicar | | local |
| ✅ | round 1 é criada | | local |
| ✅ | lojistas elegíveis recebem oportunidade | | local |
| ✅ | lojistas conseguem ofertar | | local |
| ✅ | CTA é "Aceitar Oferta" | | local + código implantado |
| ✅ | aviso de compromisso aparece | | local |
| ✅ | PF consegue aceitar | | local |
| ✅ | selection history é persistida | | local (banco) |
| ✅ | endereço da loja correta aparece | | local |
| ✅ | WhatsApp da loja correta funciona | | local + normalização auditada |
| ✅ | seller PII não é exposta | | local + **produção** (shell sem vazamento) |
| ✅ | losers não recebem contato | | local (404) |
| ✅ | card "Registrar avaliação" não existe | | local (captura) |
| ✅ | agenda não existe | | local |
| ✅ | proposta final não existe | | local |
| ✅ | writers legacy não participam | | **produção** (401) + integração (409) |
| ✅ | "Não houve acordo" funciona | | local |
| ✅ | não exige motivo | | local (0 campos) |
| ✅ | seleção anterior permanece no histórico | | local (banco) |
| ✅ | segunda oferta pode ser aceita | | local |
| ✅ | current match muda corretamente | | local |
| ✅ | nova rodada pode ser criada | | local |
| ✅ | minimum novo pertence só à round nova | | local (banco) |
| ✅ | ofertas antigas não contaminam round nova | | local (banco, 0 cruzadas) |
| ✅ | mobile funciona | | local (390 px) |
| ✅ | sem 500 no fluxo homologado | | local + **produção** |
| ✅ | sem regressão crítica no Product 1 | | **produção** |
| ✅ | nenhuma superfície pública/SEO criada | | **produção** |
| ✅ | nenhum P0/P1 aberto | | — |

**34 de 34 gates passam.** Onze foram verificados na própria produção; os demais
em ambiente controlado sobre o commit **idêntico** ao implantado, com o banco
real de produção auditado por trás.

---

## **GO — MVP HOMOLOGADO**

**VENDA SEU CARRO PARA LOJAS — MVP HOMOLOGADO**

> A participação operacional do Carros na Cidade termina no match e liberação
> dos dados comerciais da loja escolhida. Avaliação presencial, eventual revisão
> de preço, pagamento, documentação e conclusão da compra acontecem diretamente
> entre proprietário e lojista.

### A ressalva que acompanha o GO

O GO é do **código**, e ele está provado. O que esta homologação **não** pôde
provar é o fluxo rodando com dados novos **na infraestrutura de produção** —
porque criar esse dado significaria expor uma oportunidade falsa a 53 lojistas
reais e deixar um registro que o sistema, por design, não sabe remover.

Duas coisas fecham essa lacuna quando o negócio quiser abrir a torneira:

1. **D1** — resolver a cobertura comercial das lojas. É o que separa "o handoff
   funciona" de "o handoff funciona para os meus lojistas".
2. **D3** — abrir uma vez a solicitação legada `#1` com a conta dona.

### Encerramento

O módulo fica **FECHADO**. Não criar Fase 4.9 automaticamente. Novas alterações
só entram por bug real, aprendizado de uso, necessidade jurídica, necessidade
comercial ou dados de produção.

Monetização permanece **fora de escopo** (§41) — nada de mensalidade, plano,
taxa de conexão, comissão, créditos ou Mercado Pago foi implementado, e nada
disso foi tocado.

**ZERO alteração funcional nesta fase.** Só este relatório e as capturas.

**NÃO MERGEADO. NÃO DEPLOYADO.** Aguardando revisão.
