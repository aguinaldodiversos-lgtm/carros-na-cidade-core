# Fase 3.1 — Agendar Visita pelo WhatsApp

Data: 2026-08-13
Branch: `codex/opportunities-phase-3-1-whatsapp-visit`

---

## Estado inicial

| | |
|---|---|
| branch de partida | `main`, working tree limpo |
| HEAD inicial | `0af847d68a0193d4d13777f9e224fe7712782c6c` |
| HEAD final | `612fed254b7967d43dd8decb55376dbfbf0490cc` |
| commits | 4 |
| diff | 15 arquivos, +1.793 / −23 |

Fase 3 confirmada na `main` **por conteúdo**, não pela mensagem do merge:
`051_purchase_intent_offers.sql`, os quatro módulos
`purchase-intent-offers.*`, `ReceivedVehicles.tsx`, `offers.ts` e as duas
rotas de oferta montadas.

### Baseline (antes de qualquer alteração)

| suíte | resultado |
|---|---|
| backend tests | 192 arquivos / 2.841 testes — **verde** |
| frontend tests | 192 verdes, **2 arquivos / 5 testes FALHANDO** |
| typecheck | verde |
| frontend lint | verde |
| backend lint | 233 problemas (11 erros, 222 avisos) |

**BASELINE FAILURE** (pré-existente, sem relação com esta fase, não corrigido):
`app/seguranca/page.copy.test.ts` (2) e
`app/carros-usados/regiao/[slug]/page.config.test.ts` (3).

---

## Arquitetura

### Endpoint

```
POST /api/account/purchase-intents/:id/offers/:offerId/whatsapp
→ { url: "https://wa.me/5511988881111?text=..." }
```

Montado no router do **comprador** (`authMiddleware`). O caminho carrega os dois
ids porque a autorização precisa dos dois: a oferta tem de pertencer àquela
procura, e a procura ao usuário autenticado.

**POST e não GET**: a operação revela um dado de contato mediante ação explícita.
Um GET seria pré-carregável por prefetch do navegador e cacheável por engano —
exatamente o que §7 evita ao manter o telefone fora do DTO do card.

**Não existe rota de leitura equivalente.** O número só sai do servidor por aqui.

### Ownership

Toda a autorização vive no `WHERE` de uma única query, não num `if` do service:

```sql
WHERE o.id = $1                 -- a oferta pedida
  AND o.purchase_intent_id = $2 -- pertence ÀQUELA procura        (§40)
  AND pi.buyer_user_id = $3     -- a procura é de quem está pedindo (§39)
```

Qualquer combinação torta devolve zero linhas → **404**, sem distinguir motivos.

### Resolução do advertiser

`offer → ad → advertiser` (`a.advertiser_id`). Nunca "algum advertiser do
usuário": é o **anúncio** que determina qual loja enviou o veículo. `LEFT JOIN`
+ `adv.id IS NOT NULL` no predicado, para que anúncio órfão de loja seja "não
operacional" em vez de um NULL que o COALESCE de status transformaria em
`'active'` silenciosamente.

Status da loja pelo predicado canônico já existente
(`advertiserIsOperational()`), sem segunda interpretação de
`active`/`suspended`/`blocked`.

---

## WhatsApp

### Campo utilizado

```sql
COALESCE(adv.whatsapp, adv.mobile_phone, adv.phone)
```

**Não inventei precedência.** Esta é a convenção já repetida em quatro lugares —
`ads.repository.js:136`, `ads-filter.builder.js:341`, `leads.service.js:185` — e
documentada em `store-profile.service.js:15-17` como *"o número que o comprador
vê e usa (mesma fonte do serializer público)"*, com a tela "Dados da loja"
gravando em `advertisers.whatsapp`, que vence o COALESCE.

`advertisers` ainda tem `telefone` e `telephone`. Ficaram **de fora**: nenhum
caminho do produto as lê, e incluí-las inventaria uma quarta precedência que
faria esta rota discordar do botão de WhatsApp do anúncio público.

Nunca: telefone do comprador, telefone vindo do frontend, telefone de outro
advertiser do mesmo usuário.

### Normalização

`normalizeWhatsappDigits`, adicionada ao módulo canônico de telefone do backend
(`src/shared/utils/brPhone.js`).

**Por que não reusei `normalizeBrazilPhoneDigits`**, que já mora ali: as duas
respondem a perguntas diferentes.

| | contrato | motivo |
|---|---|---|
| `normalizeBrazilPhoneDigits` | 8 a 13 dígitos | **ingestão** (dealer-acquisition): dado parcial ainda é registro útil |
| `normalizeWhatsappDigits` | DDD + 8 ou 9 dígitos, ou `null` | **saída**: vira URL que alguém CLICA |

Um número de 8 dígitos passa no primeiro e produziria `wa.me/5512345678` — abre
o WhatsApp numa conversa inexistente. O comprador acha que falou com a loja e
fica esperando resposta. Pior que dizer "esta loja não tem WhatsApp".

É **byte-a-byte a regra do frontend** (`normalizeBrazilPhone` em
`detail-utils.ts`), que já constrói os `wa.me` do anúncio público. Se divergissem,
o mesmo telefone geraria link no catálogo e nenhum na área do comprador.

**Também auditado e descartado:** `src/shared/utils/whatsappNormalizer.js` —
CommonJS (`module.exports`) num projeto ESM, **zero importadores**, e lança
exceção em vez de devolver `null`. É código morto; ver Pendências.

### DDI

Números são gravados **sem DDI** (o formulário pede "(11) 99999-9999"), e a
aplicação já assume Brasil (`BRAZIL_COUNTRY_CODE` no frontend). O 55 entra na
**leitura**, nunca na escrita — o dado no banco continua como o lojista digitou.

Não duplica: quando os dígitos já começam com 55 **e** o que sobra tem 10 ou 11
dígitos, o valor é devolvido como está.

```
(11) 99999-9999      → 5511999999999
+55 (11) 99999-9999  → 5511999999999   (não 555511999999999)
55 11 99999-9999     → 5511999999999
11 99999-9999        → 5511999999999
011 99999-9999       → 5511999999999   (zero de interurbano descartado)
(55) 9999-9999       → 555599999999    (DDD 55, não DDI — 8 dígitos sobrando)
99999999             → null
```

### URL e mensagem

```
https://wa.me/{digits}?text={encodeURIComponent(message)}
```

Domínio **oficial**, o mesmo de `buildVehicleWhatsappHref`. Sem encurtador e sem
domínio intermediário — um redirecionador no meio veria quem conversa com quem.

```
Olá! Recebi pelo Carros na Cidade a opção do Honda HR-V 2020 e gostaria de
agendar uma visita para conhecer o veículo.
```

Nome do veículo: `vehicleNameOf(ad)` (marca canônica + modelo comercial, os
**mesmos helpers do card**) + `ads.year`.

**Não usa `ads.title`**: é texto livre e já aparece em produção com preço,
telefone e "ACEITO TROCA" dentro — seria pôr palavra estranha na boca do
comprador, que assina a mensagem. **Não usa a descrição FIPE inteira**: traz a
versão, mas transformaria a frase num despejo de catálogo.

**Desvio consciente do exemplo da spec:** ela mostra "Honda HR-V EX 2020" (com
versão). `ads` não tem coluna `version`, e as duas fontes que teriam o "EX" são
justamente as descartadas acima. Ficou "Honda HR-V 2020".

"gostaria de agendar" e nunca "visita agendada" — nada foi agendado.

---

## Security

| ataque | resultado |
|---|---|
| comprador B pede a oferta de A | **404**, sem telefone nem nome da loja na resposta |
| oferta de outra procura do MESMO comprador | **404** |
| oferta inexistente | **404** |
| id torto (`abc`, `12abc`, `-1`, `0`) | **404**, não 500 |
| sessão inválida | **401** |
| anúncio `paused`/`blocked`/`archived`/`rejected`/`deleted`/`sold` | **409** `PURCHASE_INTENT_OFFER_UNAVAILABLE` |
| loja `suspended`/`blocked` | **409**, mesmo código |
| loja sem número utilizável | **409** `DEALER_WHATSAPP_UNAVAILABLE` |
| `{ url, redirect, phone }` no corpo | **ignorado** — destino inalterado |

**Open redirect: fechado por construção.** `resolveOfferWhatsapp` não tem
parâmetro de corpo. Não existe campo do cliente que possa influenciar o destino,
e isso é mais forte que uma allowlist de domínio: não há o que validar. O
controller também não lê nem repassa `req.body`.

Reforço extra: mesmo um número gravado como `11999999999@evil.com/?x=#y`
continua produzindo host `wa.me` — a normalização mantém só dígitos. E o cliente
recusa qualquer URL que não comece com `https://wa.me/`.

**Anúncio pausado e loja bloqueada compartilham o código de propósito.**
Distinguir contaria ao comprador uma decisão de moderação que não é da conta
dele; para ele o efeito é idêntico. Teste trava que as duas mensagens são iguais
e que nenhuma diz "bloqueada"/"suspensa"/"moderação".

---

## Privacy

**Antes do clique:** o DTO de `listReceivedOffers` não tem `whatsapp`, `phone`,
`telefone`, `telephone` nem `mobile_phone`. Teste de regressão faz
`JSON.stringify` da resposta e recusa qualquer um desses. O E2E confere o mesmo
no payload cru da rota real.

**Depois do clique:** só a `url`. A resposta tem exatamente uma chave —
verificado com `Object.keys(result)`. Não há campo `phone`/`dealer` para alguém
logar ou renderizar por engano.

**Na tela:** nenhum telefone, antes ou depois. O número existe apenas dentro da
URL entregue ao `window.open` — teste confere que `container.textContent` nunca
casa `/5511999999999/` nem um padrão de telefone.

**Do lado do lojista:** nada mudou. Ele continua sem nome, telefone, e-mail, CPF
ou WhatsApp do comprador. O comprador é quem inicia o contato — e o portal não
avisa o lojista, porque a própria mensagem já é o aviso.

**Log:** o valor cru do telefone nunca é logado, nem quando inválido.

---

## Frontend

| aspecto | |
|---|---|
| CTA principal | "Agendar visita pelo WhatsApp" (verde), **antes** de "Ver anúncio" |
| elemento | `<button type="button">` real — a ação chama a API antes de navegar |
| loading | "Abrindo WhatsApp…" + `disabled` |
| clique duplo | `whatsappPendingId` — uma resolução ativa por vez |
| indisponível | botão **não é renderizado** |
| abertura | `window.open(url, "_blank", "noopener,noreferrer")` |

**A URL é pedida a cada clique**, nunca guardada no card — é assim que um veículo
pausado há dez minutos deixa de abrir conversa.

**Sem detecção de user-agent** (§28): o link oficial resolve app no celular e Web
no desktop; adivinhar criaria um caminho errado para algum dispositivo não
testado.

**Três erros, três textos.** `OffersApiError` preserva o código de domínio —
casar mensagem em pt-BR com regex quebraria no dia em que alguém corrigisse uma
vírgula no backend.

| código | texto | efeito extra |
|---|---|---|
| `OFFER_UNAVAILABLE` | "Este veículo não está mais disponível." | **recarrega a lista** |
| `DEALER_WHATSAPP_UNAVAILABLE` | "Esta loja não possui WhatsApp disponível para contato no momento." | — |
| outro | "Não foi possível abrir o WhatsApp da loja. Tente novamente." | — |

O erro é **por card**, não da seção: com mensagem global, quem tem três veículos
não saberia qual falhou. O card nunca é desmontado e o botão volta a ficar
clicável.

---

## Mobile

Auditoria estática + E2E em 390×844.

Os dois CTAs são `w-full` no mobile e empilham (`flex-col`); as larguras fixas
(`sm:min-w-[240px]` e `sm:min-w-[160px]`) só valem a partir de `sm` (≥640px).

| viewport | comportamento |
|---|---|
| 360×640 | empilhados, largura total, nenhuma largura fixa ativa |
| 390×844 | idem — **verificado no E2E**, sem overflow |
| 412×915 | idem |
| 768×1024 | lado a lado: 240 + 8 + 160 = 408px, folga confortável |
| 1440×900 | idem |

O E2E mede overflow no **documento** (`scrollWidth > clientWidth + 1`).

---

## Tests

| suíte | baseline | agora | resultado |
|---|---|---|---|
| backend | 192 arq. / 2.841 | **194 arq. / 2.881** | ✅ +40 |
| frontend | 192 verdes + 2 falhando | **192 verdes + 2 falhando** | ✅ mesmas 5 do baseline |
| integração PostgreSQL | 19 | **23** | ✅ +4 |
| E2E | 2 | **2** (com asserções novas) | ✅ duas execuções limpas |
| typecheck | verde | verde | ✅ |
| frontend lint | verde | verde | ✅ |
| frontend build | — | verde (standalone ok) | ✅ |
| backend lint | 233 (11 erros) | **233 (11 erros)** | ✅ idêntico |

**Nenhuma regressão nova.**

### Cobertura desta fase (66 casos)

| arquivo | testes | cobre |
|---|---|---|
| `brPhone.whatsapp.test.js` | 9 | §37 completo, DDI sem duplicata, "(55)" que é DDD, comparação com o normalizador de ingestão |
| `purchase-intent-offers-whatsapp.test.js` | 31 | IDOR nos dois eixos, precedência, todos os status, sem-WhatsApp, open redirect, fronteiras |
| `...-concurrency.integration.test.js` | +4 | a query real executa; precedência mexendo nas colunas de verdade; IDOR e estado no PostgreSQL |
| `ReceivedVehicles.test.tsx` | +11 (26 total) | CTA, ordem, loading, clique duplo, os três erros, telefone ausente |
| `purchase-intent-offers.spec.ts` | 2 | URL real com número exato + mensagem, e o mesmo no mobile |

**Nenhum teste abre o WhatsApp de verdade** (§53). No jsdom `window.open` é
espionado; no E2E ele é substituído dentro da página por uma função que guarda a
URL — o clique segue o caminho real (pede ao backend, recebe, chama `open`), só o
último passo é observado em vez de executado.

O E2E valida o número **exato** da Loja Atibaia (`5511988881111`) e confere que
não é o de Bragança. O seed dá um WhatsApp diferente a cada lojista justamente
para que isso prove que o contato sai do advertiser **do anúncio**.

---

## Migrations

**Nenhuma criada.** Conforme §6 e §56 — o botão inicia contato externo e não
precisa de persistência nova. Não foram criadas `appointments`, `conversations`,
`messages`, `whatsapp_sessions` nem `visit_requests`.

A única alteração de dados foi no **seed de E2E**, que passou a gravar
`advertisers.whatsapp` nos lojistas de teste — sem número, o CTA responderia
`DEALER_WHATSAPP_UNAVAILABLE` e o E2E não teria o que validar.

---

## Protected domains

`git diff main...HEAD --name-only` não toca nenhum arquivo de sitemap, robots,
canonical, SEO, payments, plans, subscriptions, Mercado Pago, workers, catálogo
público, Produto 2, leilão/lances, leads ou auth internals.

- ❌ chat interno / caixa de mensagem — não criado (teste trava `queryByRole("textbox")`)
- ❌ agendamento interno (data, hora, status da visita) — não criado
- ❌ notificação ao lojista — não criada (o WhatsApp é o aviso; duplicar seria ruído)
- ❌ analytics / `ad_events` / lead tracking — intocados
- ❌ telefone cru no card — não adicionado

---

## Pendências

1. **`src/shared/utils/whatsappNormalizer.js` é código morto.** CommonJS num
   projeto ESM, zero importadores, e lança exceção em vez de devolver `null`.
   Não foi removido por estar fora do escopo — mas é uma armadilha: alguém pode
   importá-lo achando que é o helper canônico (e falharia no load). Merece um
   `git rm` numa limpeza própria.

2. **`frontend/test-results/.last-run.json` é rastreado e não está em nenhum
   `.gitignore`.** É estado de execução do Playwright, reescrito a cada rodada;
   sujou o diff desta fase e já tinha sujado o da Fase 3 (`7442976d`). O conserto
   (`git rm --cached` + `.gitignore`) é mudança de infraestrutura de teste.

3. **404 operacional sai com `Cache-Control: public, max-age=60`.** O
   `error.middleware.js` marca assim todo 404 operacional, e o header privado do
   controller só é aplicado no caminho de sucesso. O corpo não tem dado
   (`{success:false,error:"not_found"}`) e respostas de POST não são cacheadas
   por padrão, então o risco é baixo — mas o comportamento é do módulo inteiro
   desde a Fase 2, não desta fase, e mexer nele afeta outras rotas.

4. **Sem métrica de "WhatsApp iniciado".** Deliberado (§34): não ampliei a fase
   para analytics. Quando o produto quiser medir, entra em fase própria, depois
   de auditar a infraestrutura existente.

---

## Verdict

# GO

Todos os critérios do §61 verificados, com os testes de banco e E2E executados
de verdade.

| critério | |
|---|---|
| botão só para veículo disponível | ✅ |
| comprador dono da procura | ✅ 404 caso contrário |
| offer pertence àquela procura | ✅ 404 caso contrário |
| número não vem do frontend | ✅ função não aceita corpo |
| advertiser vem do anúncio da offer | ✅ |
| advertiser precisa estar operacional | ✅ predicado canônico |
| anúncio precisa continuar ACTIVE | ✅ reconferido no clique |
| contato resolvido server-side | ✅ |
| telefone não exposto no DTO | ✅ teste de regressão + E2E |
| domínio oficial do WhatsApp | ✅ `wa.me` |
| nenhum open redirect | ✅ por construção |
| número normalizado / DDI não duplica | ✅ 9 testes |
| mensagem contextual e URL-encoded | ✅ |
| outro PF → 404 / offer de outra intent → 404 | ✅ unitário + PostgreSQL real |
| dealer bloqueado / anúncio paused não fornecem | ✅ |
| ausência de WhatsApp → código de domínio | ✅ `DEALER_WHATSAPP_UNAVAILABLE` |
| clique duplo não abre duas conversas | ✅ |
| mobile sem overflow | ✅ E2E 390×844 |
| E2E valida URL, sem chamar WhatsApp real | ✅ |
| nenhuma migration | ✅ |
| nenhum chat / appointment / analytics novo | ✅ |
| SEO, payments, plans, Produto 2 intocados | ✅ |
| testes sem regressão / typecheck / lint / build | ✅ |

### Reproduzir

```bash
npm run e2e:prepare
npx vitest run tests/integration/purchase-intent-offers-schema.integration.test.js tests/integration/purchase-intent-offers-concurrency.integration.test.js
```

```bash
cd frontend && PW_START_SERVER=1 npx playwright test e2e/purchase-intent-offers.spec.ts
```
