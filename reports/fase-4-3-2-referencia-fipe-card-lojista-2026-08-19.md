# Fase 4.3.2 — Diagnóstico e correção da Referência FIPE no card do lojista

Data: 2026-08-19
Branch: `codex/sale-requests-fipe-card-hardening` (a partir de `origin/main` @ `8bd2cbf4`)
Status: **não mergeada, não deployada**

---

## 1. Conclusão (causa raiz)

**O dado nunca faltou. O que faltava era HIERARQUIA VISUAL.**

`fipe_reference_value` estava correto em todas as cinco pontas auditadas — banco,
query, DTO, BFF e componente. O card renderizava o número o tempo todo, mas como
o **texto de menor tamanho e menor contraste do cartão** (11,5px, rótulo em
`#98A2B3`), numa linha solta abaixo dos chips de risco, hierarquicamente abaixo
da quilometragem e do estado geral — e, quando havia disputa, imediatamente ao
lado de "Maior proposta" em 15px negrito azul.

Num card de ~270px (grade de 4 colunas em 1440), o efeito prático é
indistinguível de campo ausente. Foi assim que o defeito chegou como "o card não
mostra o valor de referência".

Nenhuma correção de contrato, query ou DTO era necessária — e nenhuma foi feita.

---

## 2. Auditoria ponta a ponta (as cinco perguntas)

### A) O veículo real possui `fipe_reference_value` no banco? **SIM**

Consulta direta ao banco de produção (`DATABASE_URL1`, somente leitura):

```
id | brand | model   | year | status            | fipe_code | fipe_reference_value | fipe_reference_at
1  | BYD   | Dolphin | 2024 | receiving_offers  | 095009-2  | 137192.00            | 2026-08-18T03:05:36.900Z

total = 1   com_fipe = 1   (nenhuma linha NULL na tabela)
```

A única `sale_request` de produção tem snapshot resolvido, com código FIPE e
data — gravados no mesmo instante da criação. Não há caso legado NULL vivo hoje.

### B) O GET do feed devolve `fipe_reference_value`? **SIM**

O service REAL do lojista foi executado contra o banco de produção (leitura
apenas), a partir do `user_id` do lojista com loja ativa na cidade 4761:

```
--- FEED user 12 (adv 2) items=1 ---
{"id":"1","brand":"BYD","fipe_reference_value":"137192.00","fipe_reference_at":"2026-08-18T03:05:36.900Z"}
DETALHE: {"id":"1","fipe_reference_value":"137192.00","fipe_reference_at":"2026-08-18T03:05:36.900Z"}
```

Feed e detalhe devolvem **o mesmo valor**, com a mesma origem
(`serializeDetail` reusa `serializeSummary`).

Cadeia verificada linha a linha:

| Etapa | Arquivo | Situação |
|---|---|---|
| Formulário PF envia os códigos | `frontend/lib/sale-requests/evaluation.ts` (`toCreatePayload`) | `fipe_brand_code` / `fipe_model_code` / `fipe_year_code` no corpo — OK |
| BFF de publicação | `frontend/app/api/account/sale-requests/route.ts` | proxy transparente, não filtra campos — OK |
| Resolução server-side | `sale-requests.service.js` (`resolveFipeSnapshot`) | só `ok` + `confidence: "high"` vira coluna; corpo do cliente ignorado — OK |
| INSERT | `sale-requests.repository.js` | grava `fipe_reference_value` / `fipe_reference_at` — OK |
| Allowlist do lojista | `sale-requests.dealer.repository.js` (`DEALER_COLUMNS`) | inclui as duas colunas; `listOpenByCity` e `getOpenByIdForCity` usam a MESMA lista — OK |
| DTO | `sale-requests.dealer.service.js` (`serializeSummary`) | campo a campo, com as duas colunas — OK |
| BFF do lojista | `.../opportunities/sale-requests/[[...path]]/route.ts` | proxy transparente — OK |
| Tipos/consumo | `frontend/lib/sale-requests/dealer-api.ts` | sem mapper: o JSON chega inteiro ao componente — OK |

### C) O frontend recebe? **SIM** — não existe camada de mapeamento entre o BFF e o componente.

### D) `formatMoneyValue` retorna valor? **SIM** — `"137192.00"` → `R$ 137.192,00`.

### E) A condição visual está ocultando? **NÃO** — `{fipe ? ... : null}` avaliava
verdadeiro e o parágrafo era renderizado. A prova é a captura da tela real
(Playwright sobre a página real, dentro do shell real) antes da correção: o
número aparece, ilegível, entre os chips e o rodapé.

**Um efeito colateral real do `: null`**, porém, existia e foi corrigido: quando
o snapshot é NULL, a linha inteira **desaparecia sem explicação**, deixando um
card visivelmente diferente dos vizinhos sem dizer por quê.

---

## 3. O que foi alterado

### `frontend/components/account/DealerSaleOpportunityCard.tsx`

A referência passou de nota de rodapé a **âncora comercial**:

- rótulo `REFERÊNCIA FIPE` em micro-caixa-alta (o mesmo padrão de "Maior
  proposta"), e o valor em **15px negrito `#1D2440`** — o mesmo posto
  tipográfico dos valores de proposta;
- mudou para **dentro do bloco comercial** (o que fica após a linha divisória),
  **acima** da disputa: primeiro a âncora, depois os números que ela explica;
- o bloco agora existe **sempre** — antes ele só nascia quando havia proposta;
- quando `fipe_reference_value` é NULL, o card diz **"Não disponível"** em tom
  discreto, em vez de sumir com a linha.

Nada foi inventado: sem snapshot não há número, e o texto é o único honesto.
Nenhum uso de `ads.price`, nenhuma derivação por marca/modelo, nenhum zero,
nenhum "maior proposta como preço do veículo".

### Detalhe (`DealerSaleOpportunityDetail.tsx`) — **inalterado**

Já mostrava `Referência FIPE R$ 137.192,00 (ago de 2026)` com valor + mês, a
partir do mesmo snapshot do feed, e já tratava NULL com "Não informado".
Confirmado por captura da tela real. Não havia o que corrigir.

---

## 4. Provas

### Backend — `tests/sale-requests/sale-requests-fipe-reference.test.js` (novo, 3 testes)

Publica pelo **service do dono** (com provedor FIPE injetado) e lê pelo **router
do lojista**, sobre o mesmo fake-db. Prova **igualdade** entre as pontas, e não
"existe algo":

1. o valor gravado na publicação é o mesmo que chega ao feed **e** ao detalhe;
2. provedor fora do ar → coluna NULL → o lojista recebe `null` — nunca `0`,
   `"0.00"` ou `""`;
3. um `fipe_reference_value` fabricado no corpo da requisição é ignorado (o
   lojista vê o valor do provedor, não o do cliente).

Este arquivo existe porque os dois testes anteriores — o do service e o do feed —
passavam individualmente sem que nenhum provasse que era o **mesmo** valor.

*Verificação de que o teste morde*: zerando `fipe_reference_value` no DTO do
lojista, 2 dos 3 testes falham. Restaurado em seguida.

### Frontend — `DealerSaleOpportunities.test.tsx` (+3 testes)

- o valor tem elemento próprio (`dealer-card-fipe-value`) contendo **só o
  número** (se voltar a ser um `<span>` dentro da frase do rótulo, falha);
- sem referência: mostra "Não disponível", mantém o rótulo, e **não** contém
  `R$ 0`;
- a referência vem **antes** de "Maior proposta" na leitura do card.

### Playwright — `dealer-sale-opportunities-visual.spec.ts` (+2 testes: 390 e 1440)

Lê o **estilo computado** na página real: `font-size ≥ 14px` e luminância da cor
`< 110`. O estilo anterior (11,5px, `#98A2B3`) reprova nos dois cortes — ou seja,
a guarda pega exatamente a regressão que originou a fase, e não apenas a presença
do texto no DOM. A fixture ganhou uma linha **sem snapshot**, que a mesma suíte
usa para exigir "Não disponível" e a ausência de `R$ 0`.

*Verificação de que o teste morde*: revertendo o estilo do valor para
`text-[11.5px] text-[#98A2B3]`, os dois testes falham. Restaurado em seguida.

---

## 5. Gate executado

| Passo | Resultado |
|---|---|
| `vitest run tests/sale-requests` | **351 testes, 8 arquivos — verde** |
| `vitest run components/account/DealerSaleOpportunities*.tsx + DealerSaleOpportunityDetail + lib/sale-requests` | **97 testes — verde** |
| `npm run typecheck` (frontend) | verde |
| `npm run lint` (frontend) | verde, 0 warnings |
| `npm run build` (frontend) | verde, standalone verificado |
| Playwright `dealer-sale-opportunities-visual.spec.ts` | **26 testes — verde** (inclui os 2 novos, 390 e 1440) |

**Ressalva honesta:** rodar `vitest run components/account` inteiro (16 arquivos
em paralelo) falha 3–5 testes por execução, com **conjunto diferente a cada
rodada** (`PurchaseIntentForm`, `PurchaseIntentsPagination`, `SaleRequestForm`,
e ocasionalmente "erro mostra retry" deste feed). O mesmo comando na árvore
**limpa** (alterações guardadas em stash) falha 4 testes, também variando. É
flakiness de carga pré-existente do ambiente local, não regressão desta fase — os
arquivos afetados isoladamente passam 100%.

`prettier --check` acusa os três arquivos tocados, **igualmente antes e depois**
da alteração: é o débito legado de formatação já registrado (~170 arquivos), não
algo introduzido aqui. O arquivo novo está limpo.

---

## 6. Fora de escopo (não tocado)

`offers`, concorrência, store picker, escopo de cidade, privacidade,
migration 055, Produto 1, SEO, seleção de proposta e status da negociação —
nenhum arquivo dessas áreas foi alterado. O diff é de três arquivos de
frontend (um componente e dois de teste) mais um arquivo de teste de backend.

---

## 7. Observações para as próximas fases

1. **Não há linha legada com FIPE NULL em produção hoje** (1 de 1 tem snapshot).
   O caminho "Não disponível" existe para o dia em que o provedor cair durante
   uma publicação — `resolveFipeSnapshot` grava NULL de propósito nesse caso, e
   isso é a decisão certa: a publicação não pode morrer por causa de um terceiro.

2. **A resolução FIPE depende de um provedor externo sem cache persistente**
   (`fipe.provider.js` usa `Map` em memória, TTL 24h, que morre a cada deploy) e
   de `parallelum.com.br`. Um período de instabilidade dele produz solicitações
   NULL permanentes — o snapshot nunca é recalculado depois. Se isso passar a
   acontecer, o conserto é um reprocessamento em lote, não uma mudança de tela.

3. **"O dado está no DOM" não é o mesmo que "o lojista vê o dado".** O teste que
   já existia (`getByText(/92\.000,00/)`) passava durante todo o período do
   defeito. Foi preciso um teste que lê **estilo computado** para travar a
   correção — vale como padrão para os próximos números que carregam decisão
   comercial.
