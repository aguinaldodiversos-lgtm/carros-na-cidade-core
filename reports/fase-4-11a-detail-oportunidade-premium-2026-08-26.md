# Fase 4.11A — Remodelagem premium da página de detalhe da oportunidade

**Data:** 2026-08-26
**Escopo:** `/dashboard-loja/oportunidades/veiculos/[id]` — a tela em que o lojista
avalia um veículo do fluxo "Venda seu carro para lojas" e envia a oferta.

---

## 1. Base

| item | valor |
|---|---|
| base (main) | `a062d1cc210e569572946c9536e20bc62f19dd38` |
| confirmada por | `git rev-parse HEAD` + `git pull --ff-only origin main` → *Already up to date* |
| 4.10A (moderação) | presente na base, **intacta** nesta fase |

## 2. Branch

`codex/dealer-opportunity-detail-premium`, criada a partir da main verificada.

Os quatro arquivos locais protegidos do usuário (3 imagens de referência em
`frontend/public/images/` e `reports/fase-4-0-auditoria-venda-para-lojas-2026-08-15.md`)
**não foram tocados**. Nenhum `git clean`, `git add .`, `git add -A`,
`git stash -u` ou `git reset --hard` foi executado.

## 3. HEAD

Dois commits, **2 à frente de `origin/main` e 0 atrás**:

| commit | conteúdo |
|---|---|
| `cdfd368ba0f4a6b159f7175c416b01c8e455cc75` | a fase inteira (código, testes, E2E, screenshots) |
| HEAD | este relatório |

O hash do HEAD não é fixado aqui de propósito: um documento que cita o próprio
commit muda o commit ao ser corrigido. Leia com `git rev-parse HEAD`.

**Não pushado, sem PR, sem merge, sem deploy.**

---

## 4. Auditoria do layout atual (antes)

| camada | arquivo | o que fazia |
|---|---|---|
| rota | `frontend/app/dashboard-loja/oportunidades/veiculos/[id]/page.tsx` | guarda de sessão + monta o componente |
| layout | `frontend/app/dashboard-loja/layout.tsx` | envolve TUDO em `AccountPanelShell` (menu lateral) |
| shell | `frontend/components/account/AccountPanelShell.tsx` | sidebar 260px + barra mobile + provider de notificações |
| tela | `frontend/components/account/DealerSaleOpportunityDetail.tsx` | 561 linhas, grade `1fr / 366px` |
| proposta | `frontend/components/account/DealerOfferPanel.tsx` | "Sua proposta", CTA "Enviar oferta" |
| ficha | `frontend/components/account/VehicleEvaluationSheet.tsx` | compartilhada com a tela do dono |

**Problemas observados:**

1. a página vivia dentro da moldura de dashboard — sidebar de 260px comendo
   largura numa tela que é de decisão, não de navegação;
2. o **valor mínimo** — o número que responde "vale a pena?" — estava em 12,5px,
   cinza, na última linha de um cartão chamado "Resumo do veículo";
3. galeria em `object-cover` numa moldura 16:10 — foto vertical perdia ~60% da
   altura;
4. a FIPE aparecia como rodapé de texto, sem diferença nem percentual;
5. três parágrafos de regra empilhados abaixo do CTA;
6. o mesmo botão chamava-se "Fazer oferta" no card do feed e "Enviar oferta" aqui.

---

## 5. Dados disponíveis (§52)

| Dado | Fonte | Já existe? | Onde era usado | Alteração |
|---|---|---|---|---|
| marca / modelo / ano | `sale_requests` | sim | cabeçalho | — |
| versão (descrição FIPE) | `sr.fipe_model_description` | sim | subtítulo | — |
| quilometragem | `sr.mileage` | sim | resumo | — |
| combustível / câmbio | `sr.fuel_type` / `sr.transmission` | sim | resumo | — |
| cidade | JOIN `cities` | sim | metadados | — |
| publicado há | `sr.created_at` | sim | metadados | — |
| **valor mínimo** | `sr.minimum_accepted_price` **→ agora da rodada** | sim | rodapé do resumo | **corrigido (§6)** |
| FIPE (valor + data) | `sr.fipe_reference_value` / `_at` | sim | rodapé do resumo | promovido a cartão |
| maior oferta / minha oferta / liderança | `DealerOfferState` | sim | painel | reordenado |
| ficha declarada (18 campos) | `sale_requests` (migration 054) | sim | `VehicleEvaluationSheet` | reusado como está |
| observações | `sr.known_issues` | sim | "Problemas informados" | renomeado + estado vazio |
| galeria | `sale_request_images` | sim | `Gallery` interno | reescrita |
| **portas / cor** | — | **NÃO EXISTEM** | — | **não inventados** |
| **placa / chassi** | — | não expostos (PII) | — | **não adicionados** |
| **favorito ("Salvar oportunidade")** | — | **não existe backend** | — | **não criado** |

A referência visual mostra portas, cor, placa, chassi e "Salvar oportunidade".
Nenhum entrou: os dois primeiros não existem no contrato, os dois seguintes são
PII (§46), e o último exigiria backend novo que o §30 proíbe criar aqui.

`ano/modelo` virou apenas **"Ano"**: a solicitação guarda um único
`sale_requests.year`, e escrever "2024/2024" fabricaria um ano de modelo que
ninguém coletou.

---

## 6. Causa do valor mínimo ausente/errado — a descoberta desta fase

O piso **não estava ausente**: estava (a) visualmente rebaixado e (b) **errado
depois de uma republicação**.

**A cadeia auditada:**

```
sale_requests.minimum_accepted_price   (piso da RODADA 1, nunca atualizado)
sale_request_rounds.minimum_accepted_price  (piso da rodada CORRENTE)
        │
        ├── sale-requests.offers.service.js:210 → valida contra round.minimum   ✅
        └── sale-requests.dealer.repository.js:78 → projetava sr.minimum        ❌
```

A Fase 4.7 moveu o piso para a rodada. `openNewRound` insere uma linha em
`sale_request_rounds` com o piso novo e move `current_round_number` — **mas não
atualiza `sale_requests.minimum_accepted_price`**. O próprio comentário do
serviço de ofertas já dizia isso:

> `sale_requests.minimum_accepted_price` continua existindo e guarda o piso da
> rodada 1; ler dali agora seria aplicar o piso ANTIGO.

E era exatamente o que a leitura do lojista fazia. Depois de uma republicação que
baixou o mínimo de R$ 70.000 para R$ 62.500, **a tela pedia 70.000 numa disputa
que a API aceitava por 62.500**. Não havia erro, log nem exceção: o único jeito
de descobrir era ofertar.

**Correção** (`sale-requests.dealer.repository.js`):

```sql
LEFT JOIN sale_request_rounds rnd
  ON rnd.sale_request_id = sr.id
 AND rnd.round_number = sr.current_round_number
...
COALESCE(rnd.minimum_accepted_price, sr.minimum_accepted_price) AS minimum_accepted_price
```

- **`LEFT JOIN`, não `JOIN`**: um `JOIN` apagaria do feed qualquer solicitação sem
  rodada — o lojista veria menos veículos e ninguém receberia erro. Falha
  silenciosa é o modo errado.
- **`COALESCE` não ressuscita piso vencido**: `validateMinimumAcceptedPrice`
  lança em valor nulo, então nenhuma rodada ≥ 2 pode nascer sem piso. O único
  `NULL` possível é o da rodada 1 retrobackfillada pela migration 060 — que
  copiou o próprio `sr.minimum_accepted_price`. Nesse caso os dois lados são
  `NULL` e o resultado é `NULL`, que é a resposta certa.
- **Zero migration.** `sale_request_rounds` existe desde a 060, com backfill.

**Prova de que o teste pega a regressão** (não só de que passa): revertida a
projeção para `sr.minimum_accepted_price`, os testes falharam com
`expected '70000.00' to be '62500.00'` no detalhe **e** no feed. Restaurada,
voltaram a passar. O `projectDealer` do fake-db decide o piso **lendo o SQL**,
então apagar o JOIN do repository derruba o teste.

---

## 7. Arquitetura final

```
app/dashboard-loja/layout.tsx
  └── AccountPanelShell
        ├── isFocusModeRoute(pathname, basePath) → true
        │     └── <div data-panel-mode="focus">{children}</div>     ← sem sidebar
        └── (demais rotas) sidebar + barra mobile + provider

DealerSaleOpportunityDetail
  ├── ← Voltar para oportunidades / título / subtítulo
  └── grade  lg:[64fr 36fr]  xl:[68fr 32fr]
        ├── COLUNA ESQUERDA  (contents no mobile, block no desktop)
        │     ├── cartão veículo + OpportunityGallery
        │     ├── OpportunityVehicleInfo
        │     ├── VehicleEvaluationSheet  (compartilhada com a tela do dono)
        │     └── OpportunitySellerNotes  (+ pontos para avaliar)
        └── COLUNA DIREITA   (contents no mobile, sticky block no desktop)
              ├── DealerOfferPanel  → "Negociação"
              ├── OpportunityMarketReference
              └── OpportunitySafetyNotice
```

**`display: contents`** é o que resolve dois requisitos contraditórios: no
desktop as colunas precisam ser **independentes** (numa grade comum, "Informações
do veículo" e "Referência de mercado" dividiriam linha e a menor ganharia um vão);
no celular a ordem precisa ser **entrelaçada** (§37 manda a negociação subir para
antes da ficha). O invólucro se dissolve no celular — os filhos viram itens
diretos do flex e as classes `order-*` funcionam — e volta a existir no desktop.

---

## 8. Desktop

- container `max-w-[1480px]`;
- duas colunas: **64/36 em ≥1024**, **68/32 em ≥1280** (§6/§41);
- medido no navegador em 1440: coluna esquerda ocupa **~66%** do conjunto;
- painel de negociação **sticky** em `top-20` (80px = cabeçalho de 64px + 16px);
- sem overflow horizontal em 1024, 1280 e 1440.

## 9. Mobile

Ordem verificada **por posição vertical no navegador** (não pela ordem do DOM —
com `order-*` sobre `display: contents` as duas divergem de propósito):

`galeria → negociação → FIPE → informações → condição → observações`

- foto principal quase largura total, `aspect-16/10`;
- miniaturas em faixa de rolagem horizontal, largura fixa (nunca espremidas);
- **sticky desligado**: no celular ele cobriria a ficha;
- sem overflow em 360 / 390 / 412, com o CTA e o campo monetário medidos
  individualmente (o `scrollWidth` do documento sozinho não pegaria um botão que
  estoura dentro de um pai com `overflow`).

## 10. Sidebar removida

Só no detalhe. `lib/account/focus-routes.ts` é uma função pura; o shell faz
**retorno antecipado** em vez de esconder por CSS — assim o `<aside>`, o
`AccountPlanCard` e o `AccountNotificationsProvider` **não são montados**, e as
duas requests que eles fariam não acontecem numa tela que não mostra nenhum dos dois.

A prova é em dois níveis, de propósito: a tabela de casos do predicado **e** a
montagem do shell real nas duas rotas procurando `<aside>` no DOM. O primeiro
sozinho ficaria verde se alguém esquecesse de chamar a função.

A listagem (`/oportunidades/veiculos`) **fica de fora** do modo foco: ela não foi
redesenhada nesta fase, e sem menu o lojista ficaria sem saída de uma tela de
navegação.

## 11. Galeria

O problema real: as fotos vêm do celular do proprietário — deitadas, em pé, muito
perto, com o carro encostado numa borda.

**Solução: duas camadas da mesma imagem.** Fundo em `object-cover` + `blur` +
opacidade (preenche a moldura com as cores da própria foto, sem faixa vazia);
frente em **`object-contain`** (veículo inteiro, em qualquer proporção, sem corte
e sem deformação). Uma URL, duas camadas, zero request extra.

Controles: contador `1 / 6`, setas com `aria-label`, teclado (← →), miniaturas com
estado ativo, `alt` numerado, e **"+N" que REVELA** as fotos restantes — um
contador decorativo esconderia dez fotos atrás de um número.

**Bug encontrado e corrigido durante a fase:** o `scrollIntoView` que traz a
miniatura ativa para a vista rolava a **página** 40px na carga (`block: "nearest"`
rola o ancestral rolável mais próximo, que é a página quando a faixa está abaixo
da dobra). O sintoma era o "← Voltar para oportunidades" nascer enfiado atrás do
cabeçalho fixo — parecia margem errada, não rolagem. Um guarda de "já montou"
**não resolveu**: o StrictMode do React 18 roda o efeito duas vezes em
desenvolvimento e a segunda execução gastava a flag. A correção é um guarda de
**valor** (só rola quando o índice mudou de fato).

Descoberto pela captura de tela; provado pela medida (topo do link 61px contra
rodapé do cabeçalho 69px). Nenhum teste de componente veria: jsdom não tem
rolagem nem cabeçalho fixo.

## 12. Valor mínimo

Primeiro bloco da coluna direita, **30/32px, azul da marca**, com a linha
"Valor declarado pelo proprietário como mínimo aceito nesta rodada".

Dois `data-testid` aninhados: `dealer-detail-minimum` é o **bloco** (existe
sempre) e `dealer-offer-minimum` é o **valor** (só quando há piso real). É o que
permite provar "o mínimo aparece" e "não há número inventado quando ele falta"
sem que as duas respostas se atrapalhem.

Ausente → **"Não informado"** (§55). Nunca `R$ 0,00`, nunca travessão isolado,
nunca "Última avaliação" ou "Preço estimado".

## 13. Ofertas

| estado | tela |
|---|---|
| sem ofertas | "Nenhuma oferta recebida ainda." |
| sem oferta minha | "Você ainda não fez uma oferta." |
| liderando | `✓ Você está liderando` (verde, sem nome) |
| superado | `⚠ Existe uma proposta maior` (âmbar, sem nome) |

Ausência virou **frase** (§22): o travessão anterior dizia a verdade mas obrigava
a interpretar — "—" tanto podia ser "você não ofertou" quanto "não carregou".

**Validações, incrementos e envio: inalterados.** A mesma ordem de barreiras do
backend (piso com `>=` enquanto não há oferta; líder com `>` a partir da
primeira), o mesmo `submitSaleOffer`, o mesmo tratamento de 409 com líder
atualizado. Só a apresentação mudou.

CTA: **"Fazer oferta"** (§29). O card do feed já dizia "Fazer oferta" e o detalhe
dizia "Enviar oferta" — a mesma ação com dois nomes no mesmo fluxo. Alinhar pelo
primeiro custou uma string; alinhar pelo segundo custaria mexer no card, no teste
do card e no E2E do feed. Nenhum teste dependia de "Enviar oferta" (ocorrência
única no projeto).

## 14. FIPE

Cartão "Referência de mercado": valor + época (`Referência FIPE (mai/2026)`),
etiqueta de percentual, e duas linhas — **Diferença para a FIPE** e **Diferença
percentual**.

`fipeComparison()` é a **única** conta; `fipeDistance()` (a distância da oferta,
no painel) delega para ela. Centavos inteiros, percentual com uma casa.
`74200 − 62500 = R$ 11.700,00` e `15,8% abaixo`. Cinco cenários testados
(FIPE > piso, FIPE = piso, FIPE < piso, FIPE nulo, piso nulo) + FIPE zero
(divisão por zero → `null`) + centavos.

**Nunca "margem", "lucro" ou "rentabilidade"** (§34) — há teste varrendo o
documento por esses termos. Preparação, impostos, garantia, tempo de pátio e
preço real de revenda não estão calculados em lugar nenhum deste sistema.

O rótulo da distância no painel virou **"Distância da sua oferta para a FIPE"**:
com as duas comparações na mesma tela, "distância para a FIPE" sem dono seria
lida como a mesma conta.

## 15. Condição declarada

`VehicleEvaluationSheet` **reusada como está** — é o mesmo componente da tela do
dono, e é isso que garante que a loja lê exatamente o que o proprietário
declarou. Ela já tratava `null` como "Não informado" e distinguia `'unknown'`
("Não sei informar") de ausência (§16). Nenhum campo inventado.

Só o **título externo** é novo: "Condição declarada pelo vendedor" — fica fora do
componente porque na tela do dono não existe "vendedor": ele é o vendedor.

**"Pontos para avaliar"** (§19) em `lib/sale-requests/opportunity-review-points.ts`,
módulo puro. Cada ponto é ou a repetição de uma declaração, ou a aplicação de um
limiar numérico **declarado em constante exportada**:

- `HIGH_MILEAGE_KM = 150.000` — "Quilometragem acima de 150.000 km";
- `FEW_PHOTOS_THRESHOLD = 4` — "Poucas fotos disponíveis (N)";
- laudo ausente / "não sei" / "não possui" → **a mesma frase** ("Sem laudo
  cautelar informado"); laudo COM resultado **não vira alerta**;
- leilão, sinistro, financiamento, pneus, motor/câmbio/suspensão → repetição da
  declaração, sempre com "declarado pelo proprietário".

Veículo sem apontamentos **não recebe "tudo certo"** — recebe silêncio, e o bloco
sai da tela. Um selo de aprovação é o que o §17 proíbe. **Zero score, zero nota,
zero medidor** (§20), com teste varrendo o documento por "atratividade",
"excelente oportunidade", "baixo risco", "compra segura", "veículo verificado".

## 16. Privacidade

Nada novo. O `DEALER_COLUMNS` continua sem `owner_user_id` e sem JOIN com
`users` — o vazamento é **estruturalmente impossível**, não escondido no DTO.

Testes: varredura do documento por `placa`, `chassi`, `renavam` e varredura do
**payload da rede** por `owner_user_id`, `cpf`, `email`, `whatsapp`, `phone`.

## 17. Componentes

| novo | responsabilidade |
|---|---|
| `opportunity/OpportunityGallery.tsx` | galeria (contain sobre fundo borrado, setas, teclado, +N) |
| `opportunity/OpportunityVehicleInfo.tsx` | grade compacta de 5 dados |
| `opportunity/OpportunityMarketReference.tsx` | FIPE + diferença + percentual |
| `opportunity/OpportunitySellerNotes.tsx` | observações + pontos para avaliar |
| `opportunity/OpportunitySafetyNotice.tsx` | "Avalie com atenção" |
| `lib/account/focus-routes.ts` | predicado do modo foco |
| `lib/sale-requests/opportunity-review-points.ts` | inferências objetivas |

`DealerSaleOpportunityDetail.tsx` ficou em composição: 561 → ~400 linhas, sem
nenhuma regra de negócio dentro.

## 18. Testes

| suíte | resultado |
|---|---|
| backend `tests/sale-requests/` | **474 passando** (13 arquivos) — 5 novos |
| frontend `components/account/` | **431 passando** (20 arquivos) — 42 novos |
| frontend completo | 3383 passando / 5 falhas **pré-existentes** |
| backend completo | 3332 passando / falhas só em `tests/integration/*` |
| typecheck | limpo |
| lint (`--max-warnings 0`) | limpo |

**Falhas pré-existentes, fora do diff desta fase:**

1. `app/seguranca/page.copy.test.ts` (2) — espera copy de moderação
   ("moderação dos anúncios", "NÃO fazemos") que nunca foi escrita em
   `app/seguranca/page.tsx`. Resíduo da 4.10A;
2. `app/carros-usados/regiao/[slug]/page.config.test.ts` (3) — flags
   `REGIONAL_PAGE_INDEXABLE` / `CANONICAL_SELF`;
3. `tests/integration/*` — exigem PostgreSQL em `127.0.0.1:5433`
   (`ECONNREFUSED`);
4. 12 *unhandled rejections* de `SaleRequestForm.tsx:179`
   (`target.scrollIntoView is not a function` em jsdom) — arquivo não tocado.

**Testes atualizados** (encodavam o layout antigo, intenção preservada):

- subtítulo → "…declaradas **pelo vendedor** e envie sua oferta.";
- lista de grupos → "Informações do veículo" e "Condição declarada pelo vendedor"
  no lugar de "Resumo do veículo" / "Situação declarada pelo proprietário";
- FIPE → rótulo e valor agora são elementos distintos;
- ausência de oferta → frases no lugar de travessão (a asserção que importa,
  "nunca R$ 0,00", ficou mais forte);
- rótulo da distância;
- `SaleRequestHandoff.test.tsx`: o termo solto **"observações"** virou
  **"observações da avaliação"**. A varredura pelo termo cru passou a acusar o
  cartão legítimo "Observações declaradas pelo proprietário"; o nome completo do
  campo aposentado continua provando o que o teste existe para provar.

## 19. E2E

`frontend/e2e/dealer-opportunity-detail-premium.spec.ts` — **17 testes, todos
passando**, no Chromium com o Next real.

Prova **geometria**, que jsdom não tem: `position: sticky`, `display: contents`,
`object-fit` e ordem visual dependem de layout.

- sem `<aside>`, com cabeçalho global, voltar funciona e a listagem recupera a barra;
- duas colunas com a esquerda entre 60% e 75%;
- **sticky medido pelo curso disponível**, não por um `scrollTo` fixo: a coluna só
  flutua enquanto sobra caminho (altura da grade − altura da coluna), e um número
  fixo cai fora dele conforme o conteúdo. Assertiva tripla: deslocou menos que a
  rolagem, continua abaixo do cabeçalho, não invade a coluna esquerda;
- `object-fit` lido do **estilo computado**, não da classe do Tailwind, e a área
  pintada conferida contra a proporção de ORIGEM (3:4), que é o sintoma do corte;
- link de voltar medido contra o rodapé do cabeçalho (foi o que pegou o bug da §11);
- ordem mobile por **posição vertical**;
- overflow em 7 larguras (360/390/412/768/1024/1280/1440), com CTA e campo
  monetário medidos à parte;
- oferta ponta a ponta: incremento preenche → submit → `amount: "62000.00"` no
  corpo → liderança atualizada sem segunda request;
- PII na tela **e** no payload da rede.

Fixtures com fotos de proporções reais (3:4, 16:9, 1:1, 3:1) em SVG data-URI —
um PNG 1×1 transparente não tem proporção para ser cortada.

## 20. Screenshots

`reports/screenshots/fase-4-11a/` — as 10 pedidas pelo §62, geradas pelo E2E:

```
01-detail-desktop-top.png          06-detail-mobile-negotiation-390.png
02-detail-desktop-negotiation.png  07-detail-mobile-condition-390.png
03-detail-desktop-condition.png    08-detail-tablet-768.png
04-detail-desktop-scroll-sticky.png 09-detail-no-offers.png
05-detail-mobile-top-390.png       10-detail-current-leader.png
```

## 21. Dívidas

1. **A tela do DONO ainda lê `sr.minimum_accepted_price`.** A correção da rodada
   foi aplicada em `sale-requests.dealer.repository.js` (lojista). O repositório
   do dono (`sale-requests.repository.js`) não foi auditado nesta fase — fora do
   escopo do §2, mas provavelmente tem o mesmo desvio depois de uma republicação.
   **Vale auditar antes da próxima fase.**
2. **`app/seguranca/page.copy.test.ts` vermelho na main** — copy de moderação
   prometida pela 4.10A e nunca escrita. Dois testes.
3. **`page.config.test.ts` de região** — 3 testes vermelhos ligados a flags de SEO.
4. **`SaleRequestForm.tsx:179`** — `scrollIntoView` sem guarda, gera 12 unhandled
   rejections na suíte. Mesmo defeito que corrigi na galeria nova.
5. **Portas e cor** não existem no formulário de publicação. Se o produto quiser a
   ficha da referência visual, é fase de coleta — não de UI.
6. **"Salvar oportunidade"** não existe. Criar exigiria tabela, rota e migration.
7. **`ano/modelo`**: só há um ano. Se importar, é coluna nova.

## 22. GO / NO-GO

**GO.**

| gate (§64) | |
|---|---|
| sidebar removida somente no detalhe | ✅ predicado + shell montado |
| sidebar continua nas telas de dashboard | ✅ testado em 2 rotas |
| header global preservado | ✅ E2E |
| voltar para oportunidades funciona | ✅ E2E navega e a barra volta |
| desktop usa largura ampliada | ✅ `max-w-[1480px]` |
| duas colunas profissionais | ✅ 64/36 e 68/32, medido |
| negociação sticky no desktop | ✅ medido pelo curso |
| layout vira uma coluna no mobile | ✅ ordem por posição |
| galeria não corta veículo | ✅ `object-fit` computado + área pintada |
| thumbnails funcionam | ✅ + "+N" revela |
| valor mínimo aparece | ✅ |
| valor mínimo é da rodada atual | ✅ **e a regressão foi provada** |
| sem traço no lugar do mínimo | ✅ |
| maior oferta / sua oferta corretas | ✅ |
| ausência de oferta não vira R$ 0 | ✅ |
| FIPE aparece quando disponível | ✅ |
| diferença e percentual corretos | ✅ 7 cenários |
| não usa "margem de lucro" | ✅ varredura |
| condição usa somente dados reais | ✅ componente compartilhado |
| null vira "Não informado" | ✅ |
| nenhuma informação inventada | ✅ |
| nenhuma PII nova | ✅ tela + payload |
| offer submit / increments intactos | ✅ |
| rounds / selection / no_agreement / scheduling / WhatsApp intactos | ✅ nenhum arquivo tocado |
| moderação 4.10A intacta | ✅ nenhum arquivo tocado |
| desktop 1280/1440 sem overflow | ✅ |
| tablet sem quebra | ✅ |
| mobile 360/390/412 sem overflow | ✅ |
| acessibilidade básica | ✅ foco visível, aria-label, teclado, glifo + cor |
| testes verdes | ✅ (falhas restantes são pré-existentes e fora do diff) |
| E2E verde | ✅ 17/17 |
| nenhuma regressão nova | ✅ |
| **zero migration** | ✅ **nenhuma criada nem necessária** |
