# Fase 3 — Envio de Veículos ao Comprador

Data: 2026-08-11
Branch: `codex/opportunities-phase-3-vehicle-offers`

---

## Estado inicial

| | |
|---|---|
| branch de partida | `main`, working tree limpo |
| HEAD inicial | `8aaf3e08ae8ca76b88a263c5c1911ffbada0836c` |
| HEAD final | `03146aabefa2595b8968e07d0b8b7b8a045f6d0a` |
| commits | 6 |
| diff | 27 arquivos, +5.096 / −26 |

Fase 2 / 2.1 confirmada na `main` **por conteúdo**, não por SHA:
`src/modules/purchase-intents/**` (8 arquivos), `050_purchase_intents.sql`,
`frontend/app/dashboard/minhas-procuras/**` e
`frontend/app/dashboard-loja/oportunidades/compradores/**` presentes e funcionais.

### Baseline (antes de qualquer alteração)

| suíte | resultado |
|---|---|
| backend tests | 190 arquivos / 2.777 testes — **verde** |
| frontend tests | 190 verdes, **2 arquivos / 5 testes FALHANDO** |
| typecheck | verde |
| frontend lint | verde |
| backend lint | 233 problemas (11 erros, 222 avisos) |

**BASELINE FAILURE** (pré-existente, sem relação com esta fase, não corrigido):

- `app/seguranca/page.copy.test.ts` — 2 testes (copy de moderação)
- `app/carros-usados/regiao/[slug]/page.config.test.ts` — 3 testes (flags
  `REGIONAL_PAGE_INDEXABLE` / `CANONICAL_SELF`)

---

## Schema

**Migration nova:** `src/database/migrations/051_purchase_intent_offers.sql`
A `050_purchase_intents.sql` **não foi tocada** (confirmado por
`git diff main...HEAD -- .../050_purchase_intents.sql` → vazio).

```
purchase_intent_offers
  id                  BIGSERIAL PRIMARY KEY
  purchase_intent_id  BIGINT NOT NULL → purchase_intents(id) ON DELETE CASCADE
  dealer_user_id      BIGINT NOT NULL → users(id)            ON DELETE CASCADE
  ad_id               BIGINT NOT NULL → ads(id)              ON DELETE CASCADE
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()

  UNIQUE (purchase_intent_id, ad_id)
```

### Decisões que importam

**FK para `ads`: existe.** A 004 declara `ads.advertiser_id` sem FK por
compatibilidade com schemas legados — isso vale para uma coluna que aponta para
fora. Aqui é o inverso: referenciamos `ads(id)`, que é PRIMARY KEY desde a
baseline e existe em qualquer banco onde a aplicação roda. Não há caso legado em
que `ads.id` não seja único.

**`ON DELETE CASCADE` no `ad_id`** porque o projeto REALMENTE apaga linhas de
`ads` em manutenção (`scripts/cleanup-orphan-test-ads.mjs`, `scripts/e2e-seed.mjs`).
Com `NO ACTION` esses scripts passariam a falhar com violação de FK; com
`SET NULL` sobraria uma oferta que não aponta para veículo nenhum. Isto **não** é
o caso do anúncio vendido/pausado/bloqueado — esses não apagam linha, mudam
`ads.status`, e a oferta permanece no histórico marcada como indisponível.

**`dealer_user_id` guarda a CONTA, não o advertiser.** `advertisers.user_id` não
tem UNIQUE (verificado na Fase 0.1): gravar `advertiser_id` faria o limite ser
contado por linha de loja, e um lojista com duas linhas enviaria 6 veículos onde
o teto é 3.

**Sem coluna de status.** Nada de `active`/`withdrawn`/`accepted`/`rejected`.
Disponibilidade é lida de `ads.status` + status do advertiser **na hora da
consulta**. Um status próprio precisaria de alguém para escrevê-lo quando o carro
fosse vendido — ou seja, do cron que esta fase decidiu não ter — e o sintoma da
falta seria um card "disponível" apontando para um carro já vendido.

**Sem cópia do veículo.** Não existe `price`, `images`, `photos`, `mileage`,
`brand`, `model`, `year`, `title`, `slug`, `status` nem `dealer_name`. Teste de
integração falha se qualquer uma dessas colunas for adicionada.

### Índices

| índice | serve |
|---|---|
| `purchase_intent_offers_intent_ad_key` (UNIQUE) | duplicidade / idempotência |
| `..._intent_created_idx` (intent, created_at DESC, id DESC) | listagem do comprador |
| `..._intent_dealer_idx` (intent, dealer, created_at DESC, id DESC) | contagem de vagas |

---

## Matching

Módulo **puro**: `src/modules/purchase-intents/purchase-intent-offers.matching.js`.
A **mesma** função monta a lista do lojista e revalida o POST — é isso que faz o
ataque de trocar `ad_id` no request não passar.

| | `specific_model` | `open_category` |
|---|---|---|
| marca | **rígida** (slug canônico) | livre |
| modelo comercial | **rígido** | livre |
| carroceria | — | **rígida** |
| câmbio | **rígido** | **rígido** |
| preço | **classifica**, não bloqueia | **rígido** (`<= max_price`) |

**Modelo comercial usa o helper canônico.** `ads.model` guarda a descrição FIPE
inteira ("HR-V EX 1.8 Flex 16V 5p Aut.") e a procura guarda o modelo comercial
("hr-v"). A redução é `deriveCommercialModel` — o mesmo helper das páginas
territoriais, não uma segunda heurística. É por isso que o casamento roda em JS e
não em SQL: `WHERE ads.model = pi.model` não casaria nada, e `LIKE '%onix%'`
casaria "Onix" com "Onix Plus".

**Taxonomia normalizada dos dois lados.** Câmbio e carroceria do anúncio passam
por `normalize*ForStorage` antes de comparar: um "Automático" acentuado de 2024
(dado legado real em produção) casa com a procura por `'automatico'`.

**Fail closed.** Modelo indeterminável, câmbio ilegível ou preço não numérico
recusam o anúncio — nunca "deixa passar".

**Ordenação:** dentro do orçamento → acima do orçamento → preço crescente → id
DESC como desempate estável (sem ele, dois anúncios de mesmo preço trocariam de
lugar entre carregamentos e o lojista clicaria no card errado).

`budget_relation` (`within_budget` | `above_budget` | `null`) vai no DTO dos dois
lados, com rótulos diferentes: "Dentro do orçamento" para o lojista, "Dentro do
**seu** orçamento" para o comprador.

---

## Dealer ownership

| guarda | onde |
|---|---|
| conta CNPJ | `requireDealerAccount()` no router (Fase 0.1) |
| advertiser operacional | SQL, `advertiserIsOperational()` |
| mesma cidade | `resolveDealerCityId()` — nunca vem do navegador |
| anúncio é do lojista | JOIN `ads → advertisers → advertisers.user_id = $2` |
| anúncio ACTIVE | `ad.status !== 'active'` → 409 `AD_NOT_ACTIVE` |

**Ataque cross-dealer.** O navegador manda `ad_id` e nada no request diz de quem
ele é. A posse é reconstruída no servidor pelo mesmo modelo de `ad-ownership.js`
(`ads.advertiser_id → advertisers.id → advertisers.user_id`). Anúncio de outra
loja não casa → **404**, sem confirmar que o anúncio existe. Nenhuma linha criada.

`advertiserIsOperational()` virou função (antes era constante com `$2` fixo) para
ser reusada com outro índice de parâmetro. Copiar a expressão de moderação para
um segundo lugar criaria duas versões da regra que decide quem fica no ar.

**A API de matching devolve SOMENTE anúncios do próprio lojista.** Nunca "todos
os compatíveis da cidade" — este produto não serve para enviar carro de
concorrente.

---

## Limite

**3 veículos DISPONÍVEIS por lojista, por procura.** É limite de produto
(anti-spam), não de plano.

"Disponíveis" é a palavra que importa: a contagem só inclui ofertas cujo anúncio
ainda está `ACTIVE` **e** cuja loja ainda está operacional. Um carro vendido
depois do envio **libera a vaga**; a relação permanece no histórico do comprador.
O limite existe para não monopolizar a tela do comprador com opções vivas, e um
carro vendido não ocupa tela.

### Concorrência

`withTransaction` + `SELECT ... FOR UPDATE` na linha de `purchase_intents`.

O lock é na procura, e não em `purchase_intent_offers`, porque o que precisa ser
serializado é "quantas vagas restam NESTA procura" — e não existe linha de oferta
para travar antes de a primeira ser criada (`FOR UPDATE` sobre zero linhas não
bloqueia ninguém).

**O índice único NÃO resolve este caso.** Quatro envios simultâneos de quatro
anúncios DIFERENTES produzem quatro linhas legítimas do ponto de vista da chave.
Sem o `FOR UPDATE`, os quatro leriam `count = 0` e inseririam quatro.

---

## Send vehicle

```
GET  /api/account/opportunities/purchase-intents/:id/matching-ads
POST /api/account/opportunities/purchase-intents/:id/offers    { "ad_id": N }
```

Ordem das verificações (§32):

1. cidade da loja + procura **ativa e não vencida** da mesma cidade, com `FOR UPDATE`
2. o anúncio é **do lojista**
3. **já foi enviado?** → resposta idempotente
4. o anúncio está **ACTIVE**
5. o anúncio **casa** com a procura
6. vagas disponíveis **< 3**
7. INSERT `ON CONFLICT DO NOTHING`

**O passo 3 vem antes do 4** de propósito: um retry sobre um anúncio que o lojista
enviou e depois marcou como vendido continua sendo o MESMO envio, e responder
"não está ativo" a quem já enviou com sucesso seria um erro para uma ação que deu
certo. A posse já foi provada no passo 2, então nada é revelado por esse caminho.

**E antes do 6** porque duplicado não consome vaga nova — recusar por "limite
atingido" um envio que já existe tiraria do lojista uma vaga que ele nunca usou.

Respostas: `201 { offer, created: true }` / `200 { offer, created: false,
already_sent: true }`. Retry legítimo nunca vira 500.

Códigos de domínio: `PURCHASE_INTENT_OFFER_LIMIT_REACHED`,
`..._AD_NOT_ELIGIBLE`, `..._AD_NOT_ACTIVE`, `..._INVALID_AD`.

**Procura encerrada ou vencida** não casa o SELECT travado → 404. O estado que
vale é o do banco no instante do envio, não o que o navegador carregou.

---

## Buyer

```
GET /api/account/purchase-intents/:id/offers
```

Posse **na query** (`JOIN purchase_intents ... AND pi.buyer_user_id = $2`).
Procura de outra pessoa → **404**, nunca "pertence a outro usuário".

**Card vivo.** Preço, foto, quilometragem e status vêm de `ads` no momento da
consulta. `R$ 98.900 → R$ 96.900` aparece no próximo fetch, sem job e sem
duplicação. `available` é computado na leitura (`ads.status = 'active'` **E**
advertiser operacional), nunca copiado.

**Sem N+1.** Uma query para as ofertas (JOIN com `ads`, `advertisers`, `cities`)
+ **uma** chamada em lote a `listVehicleImagesByAdIds` para todos os anúncios da
página. A imagem principal reusa a estratégia canônica de `ads.public-images.js`
(storage_key → R2 → proxy → legado) — nenhum parser novo.

**Indisponível preserva histórico.** `LEFT JOIN advertisers` de propósito: com
INNER JOIN, a remoção da linha da loja faria o card sumir da área do comprador.
Com LEFT ele continua lá, marcado como indisponível e **sem** o link público —
mandar o comprador para `/veiculo/{slug}` de um anúncio removido seria pior do
que dizer que o carro saiu.

Funciona com procura **encerrada ou vencida**: o que o comprador já recebeu é
histórico dele.

---

## Notification

**Evento REUTILIZADO**, não inventado: `purchase_intent.offer_received` já
existia em `NOTIFICATION_EVENT_TYPE` desde a Fase 1.

| campo | valor |
|---|---|
| recipient | `buyer_user_id` da própria procura (nunca do navegador) |
| title | "Nova opção para sua procura" |
| body | "Uma loja enviou um Honda HR-V para você." |
| action_path | `/dashboard/minhas-procuras/{intentId}` |
| idempotency_key | `purchase_intent:{id}:ad:{adId}:offer_received` |

Roda **depois do COMMIT** e é **best-effort**: a função nunca propaga erro.
Falha de aviso não desfaz o envio, porque a fonte de verdade é
`purchase_intent_offers` — o lojista continua vendo "Enviado" e o comprador vê o
card na próxima leitura.

A chave inclui o **anúncio**: retry do mesmo envio não duplica o aviso; um
anúncio diferente gera um aviso novo, que é o comportamento desejado.

---

## Privacy

| campo | na resposta do lojista |
|---|---|
| `buyer_user_id` | **não** |
| nome / e-mail / telefone / WhatsApp / CPF do comprador | **não** |

O service **precisa** do `buyer_user_id` para endereçar a notificação. Ele o lê
da procura travada e o usa numa única linha (`recipientUserId`). É a **única**
consulta do módulo que devolve essa coluna, e ela nunca entra em DTO.

Os serializadores são montados **campo a campo**, sem `...row` — um spread
devolveria de graça qualquer coluna nova adicionada à consulta depois.

**DTO do comprador é mínimo**: sem `dealer_user_id`, sem telefone, WhatsApp,
e-mail ou CNPJ da loja. Só o **nome público** — necessário porque a próxima fase
depende de o comprador saber de quem veio o carro.

**Corpo do POST**: só `ad_id`. `dealer_user_id`, `advertiser_id`,
`buyer_user_id`, `city_id`, `price` e mensagem são ignorados — teste explícito
manda todos e verifica que o dono gravado é o autenticado e o aviso foi para o
dono da procura.

Testes de regressão de privacidade: `JSON.stringify` da resposta não pode casar
`/buyer/i` nem `/email|phone|whatsapp|cpf|document/i` (3 testes de service, 2 de
componente, 1 de E2E).

---

## Mobile

**Auditoria estática de layout** (a execução em viewport real está pendente — ver
Pendências).

Todas as larguras fixas dos cards estão atrás de `sm:` (≥640px):
`sm:w-[168px]` na foto, `sm:min-w-[200px]` / `sm:min-w-[180px]` nos botões.

| viewport | comportamento |
|---|---|
| 360×640 | `flex-col`, foto `w-full h-40`, botão `w-full`; nenhuma largura fixa ativa |
| 390×844 | idem |
| 412×915 | idem |
| 768×1024 | `sm:flex-row` — 168px foto + 16px gap + 200px botão = 384px < 768 |
| 1024×768 | idem, com folga |
| 1440×900 | idem, com folga |

Proteções contra overflow: `min-w-0` + `break-words` no título (nome longo de
modelo não força largura), `flex-wrap` + `shrink-0` no badge (quebra em vez de
empurrar), `overflow-hidden` no contêiner da foto.

O E2E mede overflow no **documento** (`scrollWidth > clientWidth + 1`), não em
cada card: um card largo dentro de contêiner com scroll próprio não quebra a
experiência; a página rolando para o lado quebra.

---

## Tests

| suíte | baseline | agora | resultado |
|---|---|---|---|
| backend | 190 arq. / 2.777 | **192 arq. / 2.840** | ✅ verde, +63 testes |
| frontend | 190 verdes + 2 falhando | **192 verdes + 2 falhando** | ✅ mesmas 5 falhas de baseline |
| typecheck | verde | verde | ✅ |
| frontend lint | verde | verde | ✅ |
| frontend build | — | verde (standalone ok) | ✅ |
| backend lint | 233 (11 erros) | **233 (11 erros)** | ✅ idêntico |
| **integração PostgreSQL** | — | — | ⛔ **não executado** |
| **concorrência** | — | — | ⛔ **não executado** |
| **E2E** | — | — | ⛔ **não executado** |

**Nenhuma regressão nova.** As 5 falhas do frontend são exatamente as mesmas do
baseline, nos mesmos 2 arquivos, ambos sem relação com esta fase.

### Testes escritos nesta fase

| arquivo | testes | cobre |
|---|---|---|
| `purchase-intent-offers-matching.test.js` | 24 | §59 e §60 completos, com valores FIPE reais |
| `purchase-intent-offers-service.test.js` | 40 | posse, status, limite, idempotência, notificação, privacidade |
| `purchase-intent-offers-schema.integration.test.js` | 8 | FKs, UNIQUE, índices, ausência de cópia, CASCADE |
| `purchase-intent-offers-concurrency.integration.test.js` | 7 | **4 simultâneos → exatamente 3**, 5 rodadas |
| `DealerMatchingStock.test.tsx` | 19 | estados, clique duplo, limite, ausências |
| `ReceivedVehicles.test.tsx` | 17 | card vivo, indisponível, vazio, erro |
| `purchase-intent-offers.spec.ts` (E2E) | 4 | fluxo completo + cross-dealer + idempotência + mobile |

O teste de concorrência importa `sendVehicleToBuyer` e o executa contra o banco
temporário, **em vez de** reescrever BEGIN/SELECT/INSERT à mão. SQL escrito no
teste provaria que o PostgreSQL sabe travar linha — que ninguém duvida — e
continuaria passando no dia em que alguém removesse a transação do service.

---

## Files changed

**Backend (novo)**
- `src/database/migrations/051_purchase_intent_offers.sql`
- `src/modules/purchase-intents/purchase-intent-offers.constants.js`
- `src/modules/purchase-intents/purchase-intent-offers.matching.js`
- `src/modules/purchase-intents/purchase-intent-offers.repository.js`
- `src/modules/purchase-intents/purchase-intent-offers.service.js`

**Backend (alterado)**
- `purchase-intents.controller.js` — 3 handlers
- `purchase-intents.routes.js` — `GET /:id/offers`
- `purchase-intents.dealer.routes.js` — `GET /:id/matching-ads`, `POST /:id/offers`
- `purchase-intents.repository.js` — `advertiserIsOperational()` como função
- `purchase-intents.service.js` — exporta `requireUserId`

**Frontend (novo)**
- `frontend/lib/purchase-intents/offers.ts`
- `frontend/components/account/DealerMatchingStock.tsx`
- `frontend/components/account/ReceivedVehicles.tsx`

**Frontend (alterado)**
- `DealerOpportunityDetail.tsx`, `PurchaseIntentDetail.tsx` — montam as seções
- `app/api/account/opportunities/purchase-intents/[[...path]]/route.ts` — POST

**Testes / seed**: 4 arquivos novos, 3 atualizados, `scripts/e2e-seed.mjs`.

### Reutilização (nada de lógica duplicada)

`deriveCommercialModel`, `canonicalBrandSlug`/`Label`,
`normalizeTransmissionForStorage`, `normalizeBodyTypeForStorage`,
`buildNormalizedPublicImages`, `listVehicleImagesByAdIds`, `AD_STATUS`,
`ADVERTISER_STATUS`, `withTransaction`, `createUserNotification`,
`NOTIFICATION_EVENT_TYPE`, `createBackendProxy`, `VehicleImage`,
`requireDealerAccount`, `resolveDealerCityId`, `parsePurchaseIntentId`,
`requireUserId`.

**`AdCard` NÃO foi reusado**, e é decisão consciente: ele carrega favoritos
(`useFavorites`), selos públicos de confiança (`resolvePublicAdBadges`) e
`buildAdHref` da rota pública. Montá-lo na área privada traria comportamento de
superfície pública para dentro do painel. O que foi reusado é `VehicleImage`, o
componente único de imagem, com todo o tratamento de R2/proxy/fallback.

---

## Protected domains untouched

Verificado por `git diff main...HEAD --name-only`: **nenhum** arquivo tocado em
sitemap, robots, canonical, SEO, payments, plans, subscriptions, workers, auth,
middlewares, leads, blog ou analytics.

- ❌ WhatsApp — não criado
- ❌ Agendar visita — não criado
- ❌ Chat / mensagem livre — não criado
- ❌ Leilão / lances / `sale_requests` — não criado
- ❌ Planos / paywall / entitlement / Mercado Pago — intocados
- ❌ SEO — intocado (o link "Ver anúncio" usa a rota pública existente)
- ❌ Nenhum botão morto ou "em breve"

Enviar um veículo **não** edita o anúncio: teste explícito compara `db.ads` antes
e depois e exige igualdade. Nenhuma query do módulo escreve em `ads`.

---

## Known debts

1. **Sem paginação em `/offers` e `/matching-ads`.** Ambas devolvem a lista
   inteira. Com teto de 3 por lojista e estoque de dezenas de carros, o payload é
   pequeno; se a cidade crescer, a listagem do comprador precisa de cursor (o
   índice `(intent, created_at DESC, id DESC)` já está lá).

2. **`PURCHASE_INTENT_OFFER_SCAN_LIMIT = 500`.** O casamento roda em JS, então o
   estoque ativo do lojista é lido e filtrado na aplicação. Quando o teto é
   atingido o service **loga** (`scan_truncated`) — corte silencioso faria a lista
   parecer completa. Se o log aparecer, o teto sobe ou o casamento desce para SQL.

3. **`vehicle_images` não é exercitada nos testes de service.** O fake devolve
   "tabela não existe" e o caminho cai no fallback de `ads.images` — que é o
   caminho real de produção hoje. O ramo `storage_key → R2` continua coberto só
   pelos testes do módulo de anúncios.

4. **Sem `revalidateTag` ao enviar.** Não é necessário nesta fase (a área privada
   é `no-store`), mas fica registrado junto da dívida equivalente da auditoria de
   anúncio bloqueado.

5. **Retirada pelo lojista não existe.** Sem coluna de status, o lojista não tem
   como "desenviar". Quando o produto pedir, entra em migration própria com a
   regra escrita junto — e não como coluna especulativa agora.

---

## Verdict

# NO-GO — pendente de execução dos testes de banco

**Não há defeito conhecido no código.** Todo o escopo da fase está implementado e
todas as suítes executáveis nesta máquina estão verdes, sem regressão nova.

O bloqueio é **de ambiente**: o Docker Desktop está instalado e com processo
ativo, mas a distro WSL `docker-desktop` permaneceu `Stopped` durante toda a
sessão (~60 verificações) e o CLI `docker` trava sem responder. O Postgres local
na porta 5432 recusou autenticação com a credencial documentada em `.env.test`.

Sem banco não foi possível executar:

- `purchase-intent-offers-schema.integration.test.js`
- **`purchase-intent-offers-concurrency.integration.test.js`** — o §68 marca este
  teste como **obrigatório para GO**
- `e2e/purchase-intent-offers.spec.ts`

Os três estão **escritos e commitados**. Marcá-los como "passariam" seria
exatamente o tipo de afirmação que a especificação proíbe.

### Para fechar o GO

```bash
npm run e2e:prepare
npx vitest run tests/integration/purchase-intent-offers-schema.integration.test.js tests/integration/purchase-intent-offers-concurrency.integration.test.js
cd frontend && npx playwright test e2e/purchase-intent-offers.spec.ts
```

Com as três verdes, todos os demais critérios do §95 já estão satisfeitos e o
veredito vira **GO**.

### Checklist §95

| critério | |
|---|---|
| `purchase_intent_offers` existe | ✅ |
| migration nova (051) | ✅ |
| 050 não alterada | ✅ |
| FK purchase_intent (CASCADE) | ✅ |
| FK ad comprovada | ✅ (`ads.id` é PK desde a baseline) |
| UNIQUE intent+ad | ✅ |
| não copia price/photos/etc. | ✅ |
| specific_model rígido por marca/modelo/câmbio | ✅ |
| preço pode ficar acima em specific_model | ✅ |
| `budget_relation` funciona | ✅ |
| open_category rígido por body/câmbio/preço | ✅ |
| modelo comercial usa helper canônico | ✅ |
| somente anúncios do próprio dealer | ✅ |
| somente anúncios active | ✅ |
| dealer suspended/blocked não envia | ✅ |
| cross-city protegido | ✅ |
| intent closed/expired não recebe | ✅ |
| limite 3 / quarto bloqueado | ✅ (unitário) |
| indisponível libera vaga | ✅ (unitário) |
| **4 simultâneos → exatamente 3** | ⛔ **não executado** |
| duplicado gera 1 row / retry idempotente | ✅ (unitário) |
| comprador recebe notificação / retry não duplica | ✅ |
| falha da notificação não desfaz envio | ✅ |
| PF só vê offers das próprias procuras | ✅ |
| dealer não recebe PII do comprador | ✅ |
| card usa dados atuais / preço e foto vivos | ✅ |
| vendido → indisponível; advertiser bloqueado → indisponível | ✅ |
| "Ver anúncio" só quando disponível | ✅ |
| PJ envia no mobile / PF vê no mobile / zero overflow | ⚠️ auditoria estática |
| nenhum WhatsApp/chat/leilão | ✅ |
| planos, payments, SEO intocados | ✅ |
| testes sem regressão nova | ✅ |
| typecheck / lint / build verdes | ✅ |
