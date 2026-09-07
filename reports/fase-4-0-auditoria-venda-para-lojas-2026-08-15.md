# Fase 4.0 — Auditoria técnica e arquitetura

## Produto 2 — "Venda seu carro para lojas"

**Data de execução:** 2026-08-15
**Natureza:** auditoria + modelagem + desenho. **Nenhum arquivo de produto foi alterado.**

---

## 1. Estado do repositório

```
branch:        main
HEAD:          086a1e4d9693a54aab8bf2eb3e4aec844c1b2804
working tree:  clean
```

Últimos commits:

```
086a1e4d merge: phase 3.1 whatsapp visit handoff
8531e17a merge: restore national catalog on comprar
2feedd23 docs(comprar): record national catalog hotfix
f604dc72 test(comprar): cover national catalog and mobile flow
85e15574 fix(comprar): restore national vehicle catalog
```

### Presença do Produto 1 na main — confirmada por conteúdo

| Item | Evidência |
|---|---|
| `purchase_intents` | `src/database/migrations/050_purchase_intents.sql` |
| `purchase_intent_offers` | `src/database/migrations/051_purchase_intent_offers.sql` |
| `user_notifications` | `src/database/migrations/049_user_notifications.sql` |
| Dashboard PF | `frontend/app/dashboard/minhas-procuras/{page,nova,[id]}` |
| Dashboard PJ | `frontend/app/dashboard-loja/oportunidades/compradores/{page,[id]}` |
| Hub de oportunidades | `frontend/app/dashboard-loja/oportunidades/page.tsx` |
| Guarda de lojista montada | `purchase-intents.dealer.routes.js:35` — `requireDealerAccount()` |
| Teste de concorrência real | `tests/integration/purchase-intent-offers-concurrency.integration.test.js` |

**Superfície do Produto 2 hoje: zero.** `sale_request` aparece em 9 arquivos, todos
notificação/relatório/teste — nenhum código de produto. Não há nada a duplicar nem a
resgatar.

---

## 2. Benchmark — o que foi extraído e o que foi descartado

**Mecânicas adotadas:** cadastro estruturado pela PF → distribuição a lojas elegíveis →
ofertas preliminares competindo por valor → escolha pela PF → avaliação presencial →
confirmação/ajuste/recusa → aceite ou recusa da PF → negociação fora do portal.

**Mecânicas descartadas (confirmadas como requisito):** cronômetro, leilão com prazo,
Auto Bid, Compre Já, chat interno, escrow, pagamento pelo portal, comissão por veículo,
transferência documental, WhatsApp API, inspeção pelo portal, alcance nacional.

Consequência arquitetural direta de "sem cronômetro" (§34): **não existe estado
`expired`, `auction_closed` nem job de expiração.** A solicitação permanece
`receiving_offers` até uma ação humana. Isso é coerente com a decisão já tomada na
migration 050, que derivou expiração de `expires_at` em vez de persistir status — só que
aqui nem `expires_at` existe. Ver o risco R-3.

---

## 3. Conta PF — quem pode publicar

`authMiddleware` (`src/shared/middlewares/auth.middleware.js:61-67`) deriva
`req.user.account_type` de `users.document_type` a cada request, consultando o banco pelo
`id` do access token:

```
document_type NULL ou ""      → "pending"
document_type == "cnpj"       → "CNPJ"
qualquer outro valor não-vazio → "CPF"
```

| Pergunta | Resposta | Fundamento |
|---|---|---|
| Quem pode publicar? | `CPF` **e** `pending` | Mesma regra por exclusão de `assertBuyerAccount` (`purchase-intents.service.js:73-82`) |
| Conta CNPJ deve ser impedida? | **Sim**, 403 | O lojista tem a área dele; deixá-lo publicar criaria oportunidade que os concorrentes da cidade veriam |
| `pending` pode publicar? | **Sim** | Exigir CPF verificado adiciona atrito num cadastro que hoje não pede documento. O produto precisa de vendedores |
| Como identificar PF server-side? | `req.user.account_type !== "CNPJ"` | Única fonte de autoridade; nunca cookie `cnc_session`, corpo ou header |
| Como provar ownership? | `owner_user_id` no `WHERE` de toda query | Regra de ouro herdada de `purchase-intents.repository.js:1-16` |
| Proteção contra IDOR | 404 (nunca 403) + posse dentro da query | `getMyPurchaseIntent` já faz isso; distinguir motivos confirma existência do id |

**Recomendação:** criar `requireBuyerAccount()` em `src/shared/middlewares/dealer.middleware.js`
(mesmo arquivo, vocabulário `ACCOUNT_TYPE` já declarado lá), simétrico a
`requireDealerAccount()`, em vez de repetir `assertBuyerAccount` dentro de cada service.
Hoje a regra vive num `function` privado do Produto 1; o Produto 2 precisaria copiá-la —
e duas definições de "quem é PF" divergem na primeira correção.

---

## 4. `ads` vs entidade própria — a decisão central

### Opção A — usar `ads`

Bloqueada por **quatro obstáculos concretos**, não por preferência estética:

**A.1 — RLS exige advertiser.** `017_ads_rls_owner_policy.sql:28-50` cria
`ads_write_owner`, que autoriza escrita via
`ads.advertiser_id → advertisers.user_id = current_setting('app.current_user_id')`.
Uma PF vendendo o carro dela **não tem advertiser**. As duas saídas são ruins:

- criar uma linha em `advertisers` para cada PF — e `advertisers` é a tabela que
  governa a elegibilidade de lojista no Produto 1 (`listActiveAdvertisersByUserId`,
  `resolveDealerCityId`) e a superfície pública `/loja/[slug]`. Poluí-la com pessoas
  físicas contamina o domínio que mais precisa estar limpo;
- deixar `advertiser_id NULL` — o que quebra ownership inteiro, porque
  `ad-ownership.js` resolve posse justamente por esse caminho.

**A.2 — o CHECK de status é uma lista auditada de 6 valores.**
`030_ads_status_check_canonical.sql:64-73` restringe `ads.status` a
`active | pending_review | paused | rejected | blocked | deleted`, e a própria migration
documenta que `draft`, `sold` e `expired` foram **deixados de fora por não terem caminho
de escrita**. Um `sale_request` precisaria de um sétimo valor — ou seja, uma migration
alterando a constraint da tabela mais protegida do sistema, antes de escrever uma linha
de produto.

**A.3 — as colunas obrigatórias não descrevem o objeto.** Pelo `CREATE TABLE` da
baseline (`004_baseline_ads.sql:8-32`), são `NOT NULL`: `title`, `price`, `brand`,
`model`, `year`, `mileage`, `slug`, `status`, `plan`. Uma solicitação de venda **não tem
preço** — o preço é exatamente o que as lojas vão disputar — e não tem título nem slug.
Preencher `price = 0` propaga para `below_fipe`, ranking, `priority_tier` e
`fipe_diff_percent`. Inventar um slug cria chave em uma tabela cujo slug alimenta
`/veiculo/[slug]`.

**A.4 — o isolamento seria uma propriedade de N call sites, não uma garantia.** A
auditoria de anúncio bloqueado confirmou que toda superfície pública filtra
`status = 'active'`. Isso torna um status novo invisível **hoje**, por convenção. Mas
nada no banco impede a próxima query de esquecer o filtro, e o repositório já registra
esse modo de falha duas vezes: os JOINs faltantes no `countQuery`
(`seller_kind`/`priority_tier`) e os filtros da Fase 3 que não foram varridos nos
consumidores. Somem-se o trigger de `search_vector` (`019`) e as colunas de risco/SEO
(`025`, `032`, `037`), todos disparando sobre linhas que não são anúncio.

**Veredicto A: rejeitada.**

### Opção C — abstração compartilhada de veículo

Uma tabela `vehicles` com `ads` e `sale_requests` apontando para ela. Rejeitada por
custo/benefício: exigiria migrar 27 anúncios de produção e reescrever a camada de query
de `ads` — a mais exercitada e mais protegida do sistema — para entregar um Produto 2
que ainda não tem um único usuário. É a refatoração certa **depois** de o produto existir
e provar volume, não antes. Além disso, os dois objetos divergem no essencial: `ads` tem
preço definido pelo dono; `sale_request` tem preço descoberto por disputa.

**Veredicto C: rejeitada agora, reavaliar após 4.5.**

### Opção B — entidade independente `sale_requests` — **RECOMENDADA**

| Critério | A (`ads`) | B (`sale_requests`) | C (abstração) |
|---|---|---|---|
| Isolamento de `/comprar`, sitemap, SEO | por convenção | **estrutural** (tabela que nenhuma query pública conhece) | por convenção |
| Risco sobre domínio protegido | alto (RLS, CHECK, trigger) | **nenhum** | muito alto |
| Manutenção | acopla dois lifecycles | **independente** | melhor no longo prazo |
| Mídia | herda `ads.images` e seus 3 scripts de reparo | **nasce em `storage_key`** | herdaria o legado |
| Lifecycle | conflita (6 status auditados) | **próprio** | conflita |
| SEO | risco permanente | **zero por construção** | risco |
| Performance | tabela quente fica maior | **isolada** | JOIN a mais em tudo |
| Complexidade | baixa na 1ª hora, alta depois | **média e estável** | alta imediata |

**Recomendação final: Opção B.** É a mesma decisão que a migration 050 já tomou para
`purchase_intents`, pelos mesmos motivos, e ela se provou correta ao longo de três fases.

**Garantias de não-vazamento público (§4), por construção:** não aparece em `/comprar`,
`/carros-em/*`, home, buscas, facetas, perfil de loja, sitemap ou JSON-LD porque
**nenhuma dessas superfícies consulta a tabela**. Não gera `/veiculo/[slug]` porque não
há coluna `slug`. É um invariante estrutural, não uma checagem que alguém precisa lembrar
de manter.

---

## 5. Privacidade do proprietário

A fronteira é a mesma da Fase 2/3, e o mecanismo que a sustenta já existe: **duas
allowlists de colunas separadas no repositório** (`BUYER_COLUMNS` / `DEALER_COLUMNS`,
`purchase-intents.repository.js:22-64`), com serializers montados campo a campo, **nunca
`...row`** — porque um spread devolveria de graça qualquer coluna nova adicionada depois.

**Antes da escolha da loja, o lojista NÃO recebe:** nome, CPF, telefone, WhatsApp,
e-mail, endereço, localização residencial, `owner_user_id`.

**Recebe:** cidade, dados do veículo, fotos, quilometragem, condição declarada, problemas
declarados, referência FIPE.

**Como garantir:** `OWNER_COLUMNS` e `DEALER_COLUMNS` como constantes separadas no
`sale-requests.repository.js`; `owner_user_id` **não sai do banco** na consulta do
lojista. A única query que o devolve é o `SELECT ... FOR UPDATE` da escrita, para
endereçar a notificação — exatamente o padrão documentado em
`purchase-intent-offers.repository.js:118-124`.

### Achado não previsto na especificação — **as fotos são o vazamento**

A especificação protege a placa (§8) e o contato (§6), mas as **fotos do veículo mostram
a placa**, e frequentemente a fachada da casa do proprietário.

Agravante: o bucket R2 é servido publicamente. `buildR2PublicUrl`
(`r2.service.js:343-350`) monta URL direta para `R2_PUBLIC_BASE_URL`, sem autenticação —
qualquer pessoa com a URL vê a imagem, para sempre, mesmo depois de a solicitação ser
cancelada. Não existe hoje nenhum caminho de imagem privada no projeto.

**Recomendação:** (a) orientar no formulário de 4.1 — "evite fotos que mostrem a placa e
a fachada da sua casa"; (b) registrar como limitação conhecida; (c) **não** tentar
resolver com URL assinada no MVP: seria inventar um segundo pipeline de imagem, e a
recomendação do §9 é justamente reusar o existente. Blur automático de placa fica fora do
escopo. Ver risco R-1.

---

## 6. Dados do veículo — campo a campo

Classificação exigida pelo §7:

| Campo | Veredicto | Justificativa |
|---|---|---|
| `brand` + `brand_slug` | **necessário agora** | `canonicalBrandLabel/Slug` já resolvem o prefixo FIPE ("VW - VolksWagen" → "Volkswagen") |
| `model` + `model_slug` (comercial) | **necessário agora** | `deriveCommercialModel`; é como as duas partes chamam o carro |
| `fipe_model_description` | **necessário agora** | **ver nota abaixo** |
| `year` | **necessário agora** | Determinante de valor |
| `model_year` | **útil depois** | `ads` não tem a coluna; criar aqui gera divergência com a tabela de comparação |
| `mileage` | **necessário agora** | Segundo maior determinante de valor |
| `fuel_type` | **necessário agora** | Flex × diesel muda a faixa de preço materialmente |
| `transmission` | **necessário agora** | Vocabulário canônico já compartilhado |
| `body_type` | **útil depois** | Derivável de marca+modelo; não acrescenta à avaliação |
| `color` | **útil depois** | Visível nas fotos; efeito marginal no valor |
| `plate` | **não coletar** | **ver §7** |
| `fipe_code` | **necessário agora** | Âncora de mercado; `resolveFipeReference` já existe |
| `fipe_price` | **necessário agora**, como snapshot | **ver nota abaixo** |
| `observations` | **não necessário** | Redundante com `known_issues` |
| `declared_condition` | **necessário agora** | Vocabulário fechado |
| `known_issues` | **necessário agora** | É o que diferencia oferta preliminar honesta de ajuste na avaliação |
| `city_id` | **necessário agora** | Todo o produto é "mesma cidade" |

**Nota sobre `fipe_model_description`.** Aqui o Produto 2 **diverge deliberadamente** do
Produto 1. `purchase_intents` guarda só o modelo comercial ("T-Cross") porque agrupar por
descrição FIPE fragmentaria um Onix em quatro modelos. Mas o Produto 2 descreve **um
carro específico**, e a versão é o que separa R$ 15 mil entre um EX e um LX. `ads` guarda
a descrição FIPE completa em `ads.model`. Recomendação: guardar **os dois** — a descrição
FIPE (o que a pessoa escolheu) e o par comercial derivado (para exibir e agrupar).

**Nota sobre `fipe_price` como snapshot.** A migration 051 argumenta contra copiar preço,
e o argumento é correto **quando existe fonte de verdade viva** (o anúncio). Aqui não
existe: a tabela FIPE muda mensalmente, e re-resolver na leitura faria a âncora mudar
debaixo do lojista entre a oferta e a avaliação. É um snapshot legítimo, e deve vir
acompanhado de `fipe_reference_at` para que a data seja explícita.

---

## 7. Placa — recomendação: **não coletar no MVP**

Auditoria do uso atual: `plate` aparece em **um único lugar** do backend —
`STRUCTURAL_FIELDS` em `ads.panel.service.js:19-29`, uma lista de nomes de campo cuja
**edição é bloqueada**. Nenhuma migration cria `ads.plate`. Ou seja: **a placa não é
coletada em lugar nenhum do sistema hoje.**

| Pergunta | Resposta |
|---|---|
| Precisa ser coletada? | **Não** no MVP |
| Precisa ser completa? | N/A |
| Lojista precisa vê-la? | **Não** antes da seleção; depois, a conversa é fora do portal |
| Pode ser usada para deduplicação? | Poderia — mas o limite de solicitações ativas (§9) resolve o mesmo problema sem coletar nada |
| Armazenar criptografada? | Se um dia for coletada: HMAC-SHA256 com pepper server-side, guardando **só o digest** |
| Mascarada? | Não se aplica se não for coletada |

Coletar a placa criaria a primeira PII dessa classe no sistema, sem nenhuma
infraestrutura de mascaramento ou criptografia existente para sustentá-la. O princípio do
§49 — coletar o mínimo necessário — decide sozinho.

---

## 8. Imagens e R2

### Arquitetura atual — três caminhos, um deles fantasma

**1. Pipeline de upload do backend** (`r2.service.js:375-440`) — `uploadVehicleImage`
valida MIME, normaliza para WebP via sharp (EXIF auto-rotate, ≤2048px, metadata
strip, q85) e faz `PutObject`. A chave é
`vehicles/{vehicleId}/{variant}/{yyyy}/{mm}/{uuid}-{stem}.webp`.

> **Achado decisivo:** `vehicleId` é apenas um **segmento de path sanitizado**
> (`normalizeVehicleId`, linha 178). Não é FK, não é validado contra `ads`, não é sequer
> numérico. **O pipeline já é agnóstico de entidade.**

**2. Pipeline direto do BFF** (`upload-draft-photos-direct-r2.ts:151-206`) — o wizard
sobe fotos **antes de o anúncio existir**, usando um `draftId` sintético
`publish-{userId}-{uuid}` como `vehicleId`. As URLs voltam e são gravadas em
`ads.images` (JSONB). Confirma que "mídia antes da entidade" já é um problema resolvido
no projeto. **Este caminho não normaliza** (sem sharp) e aceita só JPEG/PNG/WebP.

**3. `vehicle_images`** — **nenhuma migration do repositório cria esta tabela.**
`ads.public-images.js:215-270` consulta `information_schema` em runtime para descobrir se
ela existe e quais colunas tem, e devolve `Map` vazio quando não existe.

### Avaliação das opções do §9

- **A — generalizar `vehicle_images`:** **rejeitada.** Não se generaliza uma tabela que
  nenhuma migration cria e cuja existência o próprio código trata como incerta. Seria
  construir sobre areia.
- **C — abstração genérica de media assets:** rejeitada agora. Mesmo argumento da Opção C
  do §4 — refatoração cara para um produto sem usuários.
- **B — `sale_request_images`:** **RECOMENDADA.**

### Por que tabela própria e não JSONB como `ads.images`

O precedente do JSONB **gerou três scripts de reparo** que existem no repositório hoje:
`sanitize-ad-images.mjs`, `migrate-legacy-ad-images-to-r2.mjs` e `migrate-image-host.mjs`.
A causa raiz é sempre a mesma: `ads.images` guarda **URL absoluta**, então trocar de host
ou de endpoint exige reescrever o acervo linha a linha.

O próprio `ads.public-images.js:4-12` declara o modelo canônico e coloca `storage_key` em
**primeiro lugar**, com a URL pública como derivada. **`sale_request_images` pode nascer
já no formato correto**, guardando `storage_key` e derivando a URL na leitura via
`buildCanonicalImageUrlFromStorageKey`. Trocar de host passa a ser mudar uma env.

Ganho adicional: `storage_key` é o que permite **apagar do R2** quando a solicitação é
removida (`removeVehicleImages`). Com URL absoluta em JSONB isso é parsing frágil.

**Preferência do §9 atendida: reusar o pipeline, não a tabela.**

### Namespace e ciclo de vida (§10)

```
sale-requests/{ownerUserId}/{uploadSessionUuid}/{yyyy}/{mm}/{uuid}-{stem}.webp
```

O `ownerUserId` **no prefixo** é o que torna a guarda anti-IDOR trivial: no POST de
criação, o servidor exige que **toda** `storage_key` recebida comece com
`sale-requests/{req.user.id}/`. Uma chave apontando para a pasta de outra pessoa é
recusada sem consultar o banco. Isso **melhora** o wizard de anúncio atual, que embute o
`userId` no `draftId` mas não valida nada na adoção.

| Evento | Comportamento |
|---|---|
| Upload órfão | Objeto sem linha em `sale_request_images`. Sweep por script, como o acervo de anúncio já tem |
| Remoção da solicitação | `ON DELETE CASCADE` apaga as linhas; script lê `storage_key` e chama `removeVehicleImages` |
| Reorder | `UPDATE sort_order` — nunca mexe no R2 |
| Capa | `sort_order = 0`. **Sem coluna `is_cover`** — dois campos para um fato divergem (`vehicle_images` tem os dois) |
| Retry | Chave contém UUID; retry gera chave nova, o `UNIQUE (sale_request_id, storage_key)` protege a linha |
| Cleanup | Script dedicado, fora do request |

---

## 9. Localização, elegibilidade, múltiplos advertisers

**§11 — Localização.** `city_id BIGINT NOT NULL REFERENCES cities(id)`, escolhido
explicitamente pela PF. Sem fallback nenhum: nem Atibaia, nem SP, nem primeira cidade,
nem advertiser, nem `users.city`, nem cookie, nem geolocalização. `parseCityId` valida
formato sem I/O e `resolveCityForIntent` prova a existência no catálogo — fail closed,
400 com motivo no log.

**Componente reutilizável:** `frontend/components/account/PurchaseIntentCityField.tsx`,
consumindo `/api/painel/cidades/search` (a busca **pública** é filtrada — usar a do
painel).

**§12 — Escopo dos lojistas.** MVP: `sale_request.city_id = dealer.city_id`, sem raio,
sem `region_memberships`. A arquitetura permite expansão (basta trocar o predicado de
cidade por um `IN`), mas **não implementar raio agora**.

**§13 — Dealer eligibility.** Reusar sem modificar: `requireDealerAccount()` (guarda de
conta), `resolveDealerCityId()` (guarda de território), `advertiserIsOperational()`
(guarda de moderação).

| Cenário | Comportamento herdado |
|---|---|
| 1 user / 1 advertiser | cidade resolvida ✅ |
| 1 user / N advertisers, mesma cidade | resolvida (conjunto distinto = 1) ✅ |
| advertisers em cidades diferentes | **`null`** — fail closed, lista vazia / 404 |
| advertiser `blocked` | filtrado no SQL; não gera conflito nem entra no conjunto |
| advertiser `suspended` | idem |
| advertiser legado sem status | `NULL`/`''` contam como **ACTIVE** (backfill da 012) |

> **Refactor obrigatório antes de 4.2.** `resolveDealerCityId` e
> `listActiveAdvertisersByUserId` vivem hoje **dentro do módulo do Produto 1**
> (`purchase-intents.service.js:442`, `purchase-intents.repository.js:315`). O Produto 2
> importar de lá cria dependência entre domínios — exatamente o que o §17 proíbe.
> **Promover para módulo compartilhado** (ex.: `src/shared/dealer/dealer-city.service.js`),
> num commit isolado, sem mudança de comportamento, com a suíte do Produto 1 verde. É
> mexer em domínio protegido: fazer primeiro, sozinho, e verificar por conteúdo.

**§14 — Múltiplos advertisers: `dealer_user_id` é a autoridade.**

`advertisers.user_id` **não tem UNIQUE** (migration 003 cria apenas índices não-únicos;
confirmado em produção na Fase 0.1). A migration 051 já enfrentou e resolveu esta
pergunta: gravar `advertiser_id` faria o limite ser contado por *linha de loja* em vez de
por *lojista*.

Para o Produto 2 a consequência é mais séria: a disputa é entre **lojistas**. Com
`advertiser_id` como chave, um lojista com duas linhas na mesma cidade apareceria como
dois competidores, e `my_bid` / `is_leading` se fragmentariam entre as duas.

**Recomendação — os dois, com papéis distintos:**

- `dealer_user_id` — **identidade e autoridade**. Toda unicidade, contagem, liderança e
  autorização usam esta coluna, e só ela.
- `advertiser_id` — **snapshot de exibição**, resolvido no servidor no instante do lance,
  para que a PF veja o nome da loja. `ON DELETE SET NULL`; nunca participa de regra.

---

## 10. Dashboards

**§15 — PF.** Rotas recomendadas, coerentes com `minhas-procuras`:

```
/dashboard/vender-para-lojas
/dashboard/vender-para-lojas/nova
/dashboard/vender-para-lojas/[id]
```

`nova` (estático) convive com `[id]` (dinâmico) — o App Router resolve o literal
primeiro, precedente documentado em `minhas-procuras/nova/page.tsx:14-17`. **Não criar
outro dashboard.**

> **Atrito real:** a nav PF tem 5 itens (`AccountPanelShell.tsx:147-156`) e o tipo
> `NavItem.icon` é uma **union fechada** de 8 literais (linha 19). Adicionar "Vender para
> lojas" exige estender a union **e** o renderizador de ícone. Pequeno, mas é edição em
> componente compartilhado pelas duas variantes — merece o seu próprio teste em
> `AccountPanelShell.nav.test.tsx`.

**§16 — PJ.** Rotas recomendadas:

```
/dashboard-loja/oportunidades/veiculos
/dashboard-loja/oportunidades/veiculos/[id]
```

**Compatibilidade com o shell: total, zero mudança de navegação.** O item de menu é o
guarda-chuva `/oportunidades` (linha 162), e `isActive` usa
`pathname.startsWith(href + "/")` (linha 219) — a sub-rota nova já acende o item
correto. O hub (`oportunidades/page.tsx:36`) é um `grid sm:grid-cols-2` **com um card
só**, e o comentário no arquivo declara que foi criado exatamente para receber "Veículos
para comprar". Basta acrescentar o segundo `<article>`.

---

## 11. Notificações

`user_notifications` (migration 049) atende sem alteração de schema:

- `event_type` é **TEXT livre, sem ENUM**, precisamente para que eventos novos não exijam
  migration (linha 60-63);
- idempotência é `UNIQUE (recipient_user_id, idempotency_key)` — a mesma chave lógica
  gera N notificações para N destinatários, e reprocessar não duplica nenhuma;
- `NOTIFICATION_ALLOWED_ACTION_PREFIXES` já contém `/dashboard` e `/dashboard-loja` —
  **as duas árvores de rota do Produto 2 já estão autorizadas**.

**Três dos cinco eventos já estão no vocabulário** (`notifications.constants.js:61-63`):
`sale_request.bid_received`, `sale_request.outbid`, `sale_request.bid_selected`.

| Evento | Destinatário | Idempotency key | `action_path` | PII |
|---|---|---|---|---|
| `sale_request.created` **(criar)** | lojistas elegíveis da cidade, **dedup por `dealer_user_id`** | `sale_request:{id}:created` | `/dashboard-loja/oportunidades/veiculos/{id}` | veículo + cidade, nunca o dono |
| `sale_request.bid_received` ✅ | `owner_user_id` | `sale_request:{id}:bid:{bidId}:received` | `/dashboard/vender-para-lojas/{id}` | valor + nome da loja |
| `sale_request.outbid` ✅ | lojista que **era** líder | `sale_request:{id}:outbid:{bidId}` | `/dashboard-loja/oportunidades/veiculos/{id}` | **nunca** identidade do rival |
| `sale_request.bid_selected` ✅ | lojista vencedor | `sale_request:{id}:bid:{bidId}:selected` | idem | sem contato da PF no corpo |
| `sale_request.final_offer_created` **(criar)** | `owner_user_id` | `sale_request:{id}:final_offer:{foId}` | `/dashboard/vender-para-lojas/{id}` | valor + motivo |

**§45 — Dedup por `dealer_user_id`: já resolvido.**
`listDealerRecipientsByCity` (`purchase-intents.repository.js:354-368`) faz
`SELECT DISTINCT adv.user_id`, filtra `document_type = 'cnpj'` (minúsculo no banco, note
a normalização) e aplica o mesmo predicado de moderação. **Reutilizável como está** —
move-se para o módulo compartilhado junto com `resolveDealerCityId`.

**§46/§47 — Anti-spam de lance.** Como todo lance aceito é obrigatoriamente o novo mais
alto (regra ascendente), "notificar em toda alta" e "notificar em todo lance" são a mesma
política. O volume é **limitado pelo próprio domínio**: com incremento mínimo de R$ 500,
o número de lances é `(valor_final − valor_inicial) / 500`. Recomendação: notificar em
todo lance aceito no MVP, e reavaliar com dado real. O `outbid` cita o **valor** (que já
é público a todos os participantes pelo DTO) e **nunca** a identidade.

---

## 12. Schema proposto

### `sale_requests`

| Coluna | Tipo | Regra | Motivo |
|---|---|---|---|
| `id` | `BIGSERIAL` | PK | |
| `owner_user_id` | `BIGINT` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Sem dono a solicitação não descreve nada (igual 050) |
| `city_id` | `BIGINT` | `NOT NULL REFERENCES cities(id)` | **Sem `ON DELETE`**: `NO ACTION` faz o banco recusar apagar cidade em uso — efeito desejado |
| `brand` / `brand_slug` | `TEXT` | `NOT NULL` | Marca canônica |
| `model` / `model_slug` | `TEXT` | `NOT NULL` | Modelo **comercial** derivado |
| `fipe_model_description` | `TEXT` | `NOT NULL` | A versão — determinante de valor (§6) |
| `fipe_code` | `TEXT` | nullable | Nem todo veículo resolve |
| `fipe_reference_value` | `NUMERIC(14,2)` | nullable | Snapshot; convenção monetária do projeto |
| `fipe_reference_at` | `TIMESTAMPTZ` | nullable | Torna a data do snapshot explícita |
| `year` | `INTEGER` | `NOT NULL` | |
| `mileage` | `INTEGER` | `NOT NULL` | |
| `transmission` | `TEXT` | `NOT NULL` | Slug canônico, **sem acento** |
| `fuel_type` | `TEXT` | `NOT NULL` | Muda a faixa de preço |
| `declared_condition` | `TEXT` | `NOT NULL` | Vocabulário fechado |
| `known_issues` | `TEXT` | nullable, cap 1000 | Honestidade preliminar |
| `status` | `TEXT` | `NOT NULL DEFAULT 'receiving_offers'` | |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | |

**CHECKs:** `status IN ('receiving_offers','selected','completed','cancelled')`;
`declared_condition IN ('excelente','bom','regular','precisa_reparos')`;
`year BETWEEN 1950 AND 2100`; `mileage >= 0`;
`fipe_reference_value IS NULL OR fipe_reference_value > 0`.

**Sem CHECK em `transmission`/`fuel_type`** — pelo mesmo motivo da 050: `ads` não tem, e
criar aqui regra mais dura que a da tabela de comparação gera divergência.

**Índices:**
```sql
(owner_user_id, created_at DESC, id DESC)                              -- lista da PF
(city_id, created_at DESC, id DESC) WHERE status = 'receiving_offers'  -- lista do lojista (parcial)
```

**Sem `expires_at`** (§34) e **sem `current_highest_bid`** (§25 — ver abaixo).

### `sale_request_images`

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `BIGSERIAL` | PK |
| `sale_request_id` | `BIGINT` | `NOT NULL REFERENCES sale_requests(id) ON DELETE CASCADE` |
| `storage_key` | `TEXT` | `NOT NULL` — **fonte de verdade**; URL é derivada |
| `sort_order` | `INTEGER` | `NOT NULL DEFAULT 0` — capa é `0` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` |

`UNIQUE (sale_request_id, storage_key)` · índice `(sale_request_id, sort_order, id)`.
**Sem `is_cover`** e **sem `image_url`** — um fato, uma coluna.

### `sale_request_bids`

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `BIGSERIAL` | PK |
| `sale_request_id` | `BIGINT` | `NOT NULL REFERENCES sale_requests(id) ON DELETE CASCADE` |
| `dealer_user_id` | `BIGINT` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` — **autoridade** |
| `advertiser_id` | `BIGINT` | `REFERENCES advertisers(id) ON DELETE SET NULL` — **só exibição** |
| `amount` | `NUMERIC(14,2)` | `NOT NULL CHECK (amount > 0)` |
| `selected_at` | `TIMESTAMPTZ` | nullable |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` |

```sql
UNIQUE (sale_request_id, dealer_user_id, amount)                      -- idempotência (§32)
CREATE UNIQUE INDEX ... ON sale_request_bids (sale_request_id)
  WHERE selected_at IS NOT NULL;                                       -- um só vencedor (§33)
(sale_request_id, amount DESC, id DESC)                                -- maior oferta (§25)
(sale_request_id, dealer_user_id, created_at DESC, id DESC)            -- "meus lances"
```

**Append-only: `amount` nunca sofre `UPDATE`.** Aumentar é inserir linha nova (§23
opção A). Isso entrega o histórico do §24 de graça, e o custo é desprezível — o número de
linhas é limitado pelo incremento mínimo.

**§25 — maior oferta: `MAX(amount)` calculado, não armazenado.** O índice
`(sale_request_id, amount DESC)` torna a leitura O(log n), e o `FOR UPDATE` na
`sale_requests` já serializa a escrita — não há lost update a evitar. Uma coluna
`current_highest_bid` seria estado duplicado precisando de quem a escrevesse, exatamente
o que a migration 051 argumenta contra.

**§33 — um só vencedor: garantido pelo BANCO.** O índice único parcial em
`(sale_request_id) WHERE selected_at IS NOT NULL` faz duas seleções simultâneas
resultarem em uma vitória e uma violação de constraint — sem depender de `if` no service.
Também dispensa a coluna `selected_bid_id` em `sale_requests` (estado duplicado).

### `sale_request_final_offers` — **justificada, criar**

O §37 pede para não criar tabela automaticamente. Ela se justifica por **§38 (reabertura)**:
se a PF rejeita o valor final e reabre, haverá uma **segunda** seleção e uma segunda
decisão. Com colunas na `sale_requests`, a segunda sobrescreveria a primeira — perdendo
justamente o par `online_bid_amount` / `final_offer_amount` que o §36 exige preservar.

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `BIGSERIAL` | PK |
| `sale_request_id` | `BIGINT` | `NOT NULL REFERENCES sale_requests(id) ON DELETE CASCADE` |
| `sale_request_bid_id` | `BIGINT` | `NOT NULL REFERENCES sale_request_bids(id) ON DELETE CASCADE`, **`UNIQUE`** |
| `dealer_user_id` | `BIGINT` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` |
| `decision` | `TEXT` | `NOT NULL CHECK (decision IN ('confirmed','adjusted','rejected'))` |
| `amount` | `NUMERIC(14,2)` | `NULL` apenas quando `rejected` |
| `adjustment_reason` | `TEXT` | obrigatório quando `adjusted` |
| `owner_response` | `TEXT` | `CHECK (owner_response IN ('accepted','rejected'))`, nullable |
| `responded_at` | `TIMESTAMPTZ` | nullable |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` |

**`online_bid_amount` NÃO é copiado** — é obtido por JOIN em `sale_request_bid_id`. O §36
exige preservar os dois valores, não duplicá-los.

**CHECK de forma** (mesmo espírito de `purchase_intents_shape_check`):
```sql
(decision = 'rejected'  AND amount IS NULL AND adjustment_reason IS NULL) OR
(decision = 'confirmed' AND amount IS NOT NULL AND adjustment_reason IS NULL) OR
(decision = 'adjusted'  AND amount IS NOT NULL AND adjustment_reason IS NOT NULL)
```

---

## 13. Lifecycle (§20)

```
                    ┌──────────────────┐
   PF publica  ───► │ receiving_offers │ ◄─── lances entram
                    └────────┬─────────┘
                    PF escolhe │              PF cancela
                              ▼                    ▼
                       ┌──────────┐          ┌───────────┐
                       │ selected │          │ cancelled │
                       └────┬─────┘          └───────────┘
                            │ final offer + resposta da PF
                ┌───────────┴────────────┐
                ▼                        ▼
         ┌───────────┐        ┌──────────────────┐
         │ completed │        │ receiving_offers │ (reabertura EXPLÍCITA)
         └───────────┘        └──────────────────┘
```

**Quatro estados.** Descartados com motivo:

- **`evaluation`** — a avaliação presencial é um evento do mundo real, não um estado do
  sistema. Nenhum código escreveria a transição. A existência da linha em
  `sale_request_final_offers` já encoda "a avaliação aconteceu";
- **`paused`** — deixar para depois. Não tem comportamento distinto de `cancelled` no
  MVP, e status inventado cedo vira migration depois (argumento textual da 050);
- **`expired` / `auction_closed` / `timer_finished`** — não há cronômetro (§34).

**§38 — Reabertura é ação EXPLÍCITA da PF.** Nunca automática, e **nunca reativa os
lances antigos**: voltar para `receiving_offers` mantém as linhas antigas no histórico
(auditoria), mas o `MAX(amount)` volta a valer para novos lances. Decisão de produto a
confirmar em 4.5: se os lances antigos continuam elegíveis para nova seleção ou se apenas
compõem o piso. **Recomendação:** continuam visíveis à PF como histórico, mas só lances
posteriores à reabertura são selecionáveis — caso contrário uma loja que já recusou
poderia ser "selecionada" de novo sem ter reafirmado interesse.

---

## 14. Concorrência (§30/§31) — P0

**Ponto de serialização: `SELECT ... FROM sale_requests WHERE id = $1 AND status = 'receiving_offers' FOR UPDATE`**,
dentro de `withTransaction`.

**Confirmado como a estratégia certa** — e pelo mesmo argumento textual que
`purchase-intent-offers.repository.js:130-133` já registra: travar `sale_request_bids` não
funcionaria, porque `SELECT ... FOR UPDATE` sobre zero linhas **não bloqueia ninguém**, e
o primeiro lance de uma solicitação encontra a tabela vazia. Trava-se a entidade cujo
invariante global ("qual é o maior lance / ainda está aberta?") está sendo modificado.

| Cenário | Sequência | Estado final |
|---|---|---|
| **1** — A e B leem 70.000, ambos enviam 70.500 | Lock serializa. A: `MAX`=70.000, mínimo=70.500 → **aceita**. B: `MAX`=70.500, mínimo=71.000 → **409 `BID_TOO_LOW`** com o novo mínimo no corpo | Um lance de 70.500. Sem empate |
| **2** — A envia 70.500, B envia 71.000 simultâneos | Ordem definida pela aquisição do lock. Se A primeiro: ambos aceitos (70.500 → 71.000). Se B primeiro: B aceito, A rejeitado (70.500 < 71.500) | `MAX` = 71.000 nos dois caminhos |
| **3** — PF seleciona enquanto lance chega | Seleção pega **o mesmo lock**. Lance primeiro → insere, seleção enxerga o conjunto atualizado. Seleção primeiro → `status='selected'`, o `WHERE status='receiving_offers'` do lance não casa → **409** | Nunca ambos |
| **4** — PF cancela enquanto lance chega | Mecanismo idêntico ao 3 | Nunca ambos |

**Resposta de domínio** (`AppError` com `code` estável, padrão de `ad-ownership.js`):
`SALE_REQUEST_BID_TOO_LOW` (409, carrega `next_minimum_bid`),
`SALE_REQUEST_NOT_RECEIVING_OFFERS` (409), `SALE_REQUEST_NOT_FOUND` (404),
`SALE_REQUEST_BID_NOT_FOUND` (404).

**§32 — Idempotência.**

| Ação | Estratégia |
|---|---|
| Criar solicitação | Sem chave. É criação deliberada; duplo clique é mitigado por `disabled` no submit + limite de ativas (§9) |
| Criar / aumentar lance | **`UNIQUE (sale_request_id, dealer_user_id, amount)` + `ON CONFLICT DO NOTHING`** → o segundo request devolve o lance existente, 200, sem novo efeito econômico. Elegante porque re-ofertar o mesmo valor é economicamente um no-op de qualquer forma (a regra ascendente já o rejeitaria) |
| Selecionar lance | **Índice único parcial** — a segunda tentativa perde no banco; o service traduz em "já selecionado", 200 |
| Confirmar avaliação | `UNIQUE (sale_request_bid_id)` em `sale_request_final_offers` |
| Aceitar oferta final | `UPDATE ... WHERE owner_response IS NULL` — `rowCount = 0` significa "já respondido"; devolve o estado atual, não erro |

Padrão em todos: **a corrida é arbitrada pelo banco, e a perda vira resposta idempotente,
nunca 500.**

**§33 — Ordem da seleção:** (1) trava `sale_requests` com `FOR UPDATE`; (2) confirma
`owner_user_id`; (3) confirma `status = 'receiving_offers'`; (4) confirma que o lance
pertence àquela solicitação; (5) grava `selected_at`; (6) muda status para `selected` —
o que congela novos lances pelo próprio `WHERE`; (7) histórico preservado (append-only).

---

## 15. DTOs

**§28 — Lojista** (exatamente quatro campos):

```json
{ "highest_bid": 72500, "my_bid": 71000, "is_leading": false, "next_minimum_bid": 73000 }
```

**§27 — o lojista NÃO recebe:** `dealer_user_id` rival, `advertiser_id` rival, nome, CNPJ,
telefone, cidade do rival — **nem o `id` ou o `created_at` do lance rival**. IDs indiretos
contam: um `bid.id` global é `BIGSERIAL` e vaza volume da plataforma; o `created_at` do
lance líder permite correlação temporal com a atividade conhecida de um concorrente.

**§29 — PF:**

```json
{
  "bid_id": 88, "amount": 72500, "created_at": "...", "is_highest": true,
  "dealer": { "name": "Auto Center Atibaia" }
}
```

Resolvido do `advertiser_id` (snapshot). **Não devolve:** `dealer_user_id`,
`advertiser_id`, CNPJ, telefone, e-mail. A PF precisa escolher conscientemente **com
quem** negociar — nome público basta; o contato vem depois da seleção (§39).

---

## 16. Contato (§39) e relação com outros domínios

**Antes da seleção: contato zero entre PF e PJ.** Depois: PF inicia o WhatsApp da loja,
reusando o padrão exato de 3.1 (`resolveOfferWhatsapp`,
`purchase-intent-offers.service.js:683-765`) — assinatura **sem `body`** (nada do
navegador pode influenciar o destino, forma mais forte de fechar open redirect que uma
allowlist), estado reconferido no instante, número por
`COALESCE(adv.whatsapp, adv.mobile_phone, adv.phone)`, resposta mínima `{ url }`.

**§40 — `leads`: NÃO reutilizar.** Comprovado pelo código, não por expectativa.
`043_leads.sql:16-24` define `(ad_id, seller_id, city_id, buyer_name, buyer_phone)`, e
`leads.service.js:30-76` enfileira WhatsApp **para o vendedor do anúncio**. Três
incompatibilidades: (a) exige `ad_id` — não há anúncio; (b) direção invertida (lead =
comprador procurando; `sale_request` = aquisição de estoque); (c) grava nome e telefone
do contato — exatamente a PII que o §6 proíbe expor. Agravante: a 043 envolve o DDL em
`EXCEPTION WHEN OTHERS THEN RAISE NOTICE`, então nem a existência da tabela é garantida
pela migration.

**§41 — `purchase_intents`: NÃO generalizar.** Produto 1 = pessoa quer **comprar**;
Produto 2 = pessoa quer **vender**. Lifecycles diferentes (2 status × 4), modelos de
competição diferentes (P1 não tem disputa; P2 é ascendente), privacidade em direções
opostas. **Compartilhar infraestrutura, nunca a tabela.**

**§17 — Conclusão:** *infraestrutura transversal compartilhada ≠ domínio compartilhado.*
Compartilhado: `authMiddleware`, `requireDealerAccount`, elegibilidade/cidade do lojista,
`user_notifications`, cursor de paginação, shell do dashboard, padrões de privacidade,
padrão de repositório (allowlist + autorização no `WHERE`), `AppError` com `code`,
pipeline R2, normalizadores de taxonomia. **Não compartilhado:** tabelas, status,
serializers, rotas, regras.

---

## 17. Moderação, duplicidade, paginação, ordenação, filtros

**§21 — Publicação direta, sem `pending_review`.** Proporcional ao MVP: produção tem
**1 cidade, 1 lojista, 27 anúncios**. Uma fila de moderação sem moderador é uma fila que
nunca drena, e o custo do falso negativo aqui é baixo (o lojista simplesmente não oferta).
Mitigações estruturais em vez de fila: limite de solicitações ativas, validação dura de
formato de imagem no pipeline, e capacidade do admin de cancelar. Reavaliar quando houver
volume real.

**§22 — Duplicidade: limite de solicitações ATIVAS por usuário.** Recomendação: **3**.
Resolve spam e carro repetido sem coletar placa, sem fingerprint e sem moderação — e é
executável com a mesma técnica já provada: `FOR UPDATE` + `COUNT` dentro da transação.
Placa e hash de placa ficam descartados pelo §7/§49.

**§42 — Paginação: cursor**, reusando o formato existente
(`"<createdAtISO>|<id>"` em base64url, `decodeCursor`/`encodeCursor`,
`purchase-intents.validation.js:241-265`) com `limit + 1` e comparação de **tupla**
(`(created_at, id) < ($1, $2)`) — `created_at <` puro perderia linhas com timestamp
idêntico e `<=` as repetiria. Cursor opaco e tolerante a lixo. `DEFAULT_LIMIT 20`,
`MAX_LIMIT 50`.

**§43 — Ordenação PJ: `ORDER BY created_at DESC, id DESC`.** Determinística, casa
exatamente com o índice parcial e com o cursor. **Sem ranking de "maior oportunidade"** —
seria pontuação sem dado para calibrar.

**§44 — Filtros PJ: nenhum em 4.2.** Com uma cidade e um lojista, a lista terá um dígito.
Filtro sem volume é custo sem benefício, e o repositório já registra o preço de adicionar
filtro sem varrer consumidores (`hasFilters`, `countQuery`, cache key, chips, facets).
Quando o volume justificar, o primeiro é `brand`.

---

## 18. Segurança (§48) — threat model

### Proprietário (PF)

| Ameaça | Mitigação |
|---|---|
| Ler solicitação alheia | `owner_user_id` no `WHERE`; **404**, nunca 403 |
| Editar solicitação alheia | Idem, dentro do próprio `UPDATE` (sem SELECT-checa-UPDATE) |
| Selecionar lance de outra solicitação | `WHERE bid.sale_request_id = $x AND sr.owner_user_id = $y` — a combinação torta não casa |
| Alterar valor pelo frontend | A PF **não envia valor**. Ela envia `bid_id`; o valor é lido do banco |
| Expor PII | `OWNER_COLUMNS` / `DEALER_COLUMNS` separadas; serializer campo a campo, sem `...row` |

### Lojista (PJ)

| Ameaça | Mitigação |
|---|---|
| Acessar solicitação de outra cidade | `city_id` vem de `resolveDealerCityId` (advertiser do usuário autenticado), **nunca do navegador**; 404 sem distinguir motivo |
| Lojista bloqueado ofertando | `advertiserIsOperational()` no SQL, em **toda** consulta e na escrita |
| PF tentando ofertar | `requireDealerAccount()` no router, antes de qualquer consulta |
| Forjar `dealer_user_id` no corpo | O corpo **não tem** esse campo. Sai de `req.user.id` |
| Modificar lance de concorrente | Não existe verbo de edição. Tabela append-only |
| Descobrir identidade rival | DTO de 4 campos; sem id, sem timestamp do lance rival |
| Race condition | `FOR UPDATE` + constraints; ver §14 |

### Mídia

| Ameaça | Mitigação |
|---|---|
| Upload para solicitação alheia | Prefixo `sale-requests/{ownerUserId}/` **validado no servidor** contra `req.user.id` |
| Delete de foto alheia | `DELETE ... WHERE sale_request_id IN (SELECT id FROM sale_requests WHERE owner_user_id = $1)` |
| Storage path manipulation | `validateStorageKey` (`vehicle-images.controller.js:36-49`) já recusa `..`, `\`, `://`, `data:`, `//` — **reusar, não reescrever** |

---

## 19. LGPD (§49)

| Classe | Dados |
|---|---|
| **Público** (dentro do produto) | marca, modelo, versão, ano, km, câmbio, combustível, condição, problemas declarados, cidade, referência FIPE |
| **Interno** | `owner_user_id`, `dealer_user_id`, `advertiser_id`, `storage_key`, ids técnicos |
| **PII** | nome, e-mail, telefone/WhatsApp, endereço — **nenhum deles em `sale_requests`** |
| **Potencialmente sensível** | **as fotos** (placa, fachada de residência) — ver §5 e risco R-1 |

**Não coletados por decisão:** CPF (já em `users`, sem necessidade aqui), placa (§7),
endereço, geolocalização.

**Logs:** seguir o padrão em vigor — `buildDomainFields` com ids e `reason`, **nunca**
texto de notificação, telefone (mesmo inválido) ou dado do proprietário. Precedente
explícito em `purchase-intent-offers.service.js:722-736`.

---

## 20. Faseamento (§52)

| Fase | Entrega | Migrations | GO gate |
|---|---|---|---|
| **4.1** | PF publica: schema principal, formulário, fotos, cidade, "Minhas solicitações" (lista + detalhe), limite de 3 ativas | `052_sale_requests`, `053_sale_request_images` | Unit + service + rota + **PG integration de schema** + frontend |
| **4.2** | PJ recebe: "Veículos para comprar", same-city, privacidade, notificação `sale_request.created`, detalhe. **Precedido do refactor de `resolveDealerCityId` para módulo compartilhado, em commit isolado** | nenhuma | Suíte do Produto 1 **verde** após o refactor + testes de isolamento de cidade |
| **4.3** | Lances: bid, maior oferta, meu lance, próximo mínimo, `outbid` | `054_sale_request_bids` | **PG integration obrigatório**, incluindo concorrência real (4 lances simultâneos) |
| **4.4** | Seleção: PF escolhe, lock, congelamento de lances, contato WhatsApp | nenhuma | **PG integration**: duas seleções simultâneas → uma vence |
| **4.5** | Avaliação presencial: confirmar/ajustar/recusar, oferta final, aceite/recusa, reabertura | `055_sale_request_final_offers` | **PG integration** + matriz de CHECK de forma |

**Sobre botão morto (§52):** em 4.2 o lojista vê a oportunidade **sem** poder ofertar. A
preferência declarada é não criar botão morto. **Recomendação:** em 4.2, o detalhe mostra
os dados e o texto "As ofertas abrem em breve", **sem botão**. Um botão desabilitado que
promete uma ação inexistente é pior que a ausência dele. Alternativa, se o intervalo entre
4.2 e 4.3 for curto: fundir 4.2+4.3. **A decisão é de produto** — tecnicamente as duas
funcionam.

---

## 21. Estratégia de testes (§53)

| Camada | Cobertura | Obrigatório em |
|---|---|---|
| **Unit** | validação de campo, cálculo de próximo mínimo, derivação de modelo comercial, prefixo de `storage_key` | 4.1+ |
| **Service** | ordem das guardas, códigos de erro, respostas idempotentes, privacidade dos DTOs | 4.1+ |
| **Repository** | allowlists de coluna, autorização dentro do `WHERE` | 4.1+ |
| **PostgreSQL integration** | schema (CHECKs, UNIQUEs, índices parciais, CASCADE) | **4.1, 4.3, 4.4, 4.5** |
| **Concorrência (PG real)** | 4 lances simultâneos; 2 seleções simultâneas; lance × cancelamento | **4.3, 4.4** |
| **Frontend** | formulário, listas, paginação, estados vazios | todas |
| **E2E** | publicar → lojista vê → ofertar → selecionar | 4.3+ |
| **Mobile** | medir **navegando de verdade**, em build de produção (StrictMode dobra) | todas |

**Fases com lance/seleção não recebem GO sem PostgreSQL real.** O motivo está escrito no
cabeçalho do teste de concorrência existente
(`purchase-intent-offers-concurrency.integration.test.js:14-40`): o fake em memória tem
uma "conexão" só, então quatro escritas simultâneas **nunca disputam nada** — um service
sem transação nenhuma passaria em todos os testes unitários. O teste deve importar **o
service de verdade** (não reescrever o `BEGIN/SELECT/INSERT` à mão), senão continuaria
passando no dia em que alguém removesse a transação. **O arquivo existente é o template
exato**, incluindo a ordem crítica: apontar `DATABASE_URL` para o banco temporário
**antes** do primeiro import de `db.js`, com imports dinâmicos.

---

## 22. Domínios protegidos (§54)

Não tocar sem necessidade comprovada: `/comprar`, `/carros-em/*`, sitemap, robots,
canonical, SEO, `payments`, `plans`, `subscriptions`, Mercado Pago, **Produto 1**,
WhatsApp do Produto 1, `ads` públicos, internals de auth, workers.

**Três exceções necessárias, todas isoladas e declaradas:**

1. **`resolveDealerCityId` + `listActiveAdvertisersByUserId` → módulo compartilhado**
   (mexe no Produto 1). Commit isolado, sem mudança de comportamento, suíte verde.
2. **`NOTIFICATION_EVENT_TYPE`** — acrescentar `SALE_REQUEST_CREATED` e
   `SALE_REQUEST_FINAL_OFFER_CREATED`. Aditivo puro; o campo é TEXT livre no banco.
3. **`AccountPanelShell`** — novo item de nav PF e extensão da union de ícone.

---

## 23. Riscos

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| **R-1** | **Fotos em bucket R2 público contêm placa e endereço; URL vale para sempre, mesmo após cancelamento** | **Alta** | Orientação no formulário; registrar limitação; não inventar pipeline privado no MVP |
| **R-2** | Refactor de `resolveDealerCityId` quebra o Produto 1 silenciosamente | **Alta** | Commit isolado, sem mudança de comportamento, suíte do Produto 1 verde antes de qualquer código novo |
| **R-3** | Sem `expires_at` (§34), solicitações abandonadas acumulam e poluem a lista do lojista para sempre | Média | Aceito no MVP por requisito. Monitorar; se doer, `expires_at` lazy (padrão da 050) resolve sem cron |
| **R-4** | Sem moderação, uma foto inadequada fica pública via URL R2 | Média | Publicação direta é decisão consciente; admin precisa poder cancelar desde 4.1 |
| **R-5** | Divergência `users.id integer` (produção) × `BIGSERIAL` (migrations) | Baixa | Já contornada há três fases: usar `BIGINT` nas FKs, precedente provado |
| **R-6** | Notificação por lance pode virar spam se o incremento mínimo for baixo | Baixa | Incremento de R$ 500 limita o volume por construção; medir com dado real |
| **R-7** | Upload direto pelo BFF **não normaliza** (sem sharp) — HEIC/AVIF quebrariam | Baixa | Reusar `ALLOWED_MIME` restrito de `upload-draft-photos-direct-r2.ts:26-30`. **Atenção:** existe cópia órfã em `frontend/infrastructure/storage/r2.service.js` que **não é importada por nada** — conferir quem importa antes de editar |

---

## 24. Pendências (decisões de produto, não técnicas)

1. **Incremento mínimo do lance** — sugestão de produto: R$ 500. Deve viver em
   `sale-request-bids.constants.js`, **nunca hardcoded espalhado**.
2. **Limite de solicitações ativas por PF** — sugestão: 3.
3. **4.2 com ou sem botão de lance** — recomendação: sem botão; ou fundir 4.2+4.3.
4. **Reabertura (§38)** — lances anteriores voltam a ser selecionáveis? Recomendação:
   não, apenas histórico.
5. **`sale_request.bid_selected` para os perdedores?** Recomendação: só o vencedor no MVP.
6. **Condição declarada** — validar o vocabulário de 4 valores com o produto.

---

## 25. Entregável final

```
FASE 4.0 — AUDITORIA PRODUTO 2

STATUS
  AUDITORIA CONCLUÍDA

REPOSITÓRIO
  branch: main
  HEAD:   086a1e4d9693a54aab8bf2eb3e4aec844c1b2804
  working tree: clean

BENCHMARK
  adotadas:   C2B, oportunidade por cidade, ofertas preliminares competindo,
              escolha pela PF, avaliação presencial, confirmar/ajustar/recusar
  descartadas: cronômetro, prazo, Auto Bid, Compre Já, chat, escrow, pagamento,
              comissão, documentação, WhatsApp API, inspeção, alcance nacional

CONTA PF
  publica CPF e pending; CNPJ recebe 403. Autoridade = req.user.account_type,
  derivado de users.document_type pelo authMiddleware. Ownership no WHERE, 404 nunca 403.

ADS VS SALE_REQUEST
  A (ads):        REJEITADA — RLS exige advertiser (PF não tem); CHECK de status
                  auditado em 6 valores; price/title/slug NOT NULL sem significado;
                  isolamento seria convenção, não garantia
  B (própria):    RECOMENDADA — isolamento estrutural, risco zero sobre domínio
                  protegido, mídia nasce em storage_key
  C (abstração):  REJEITADA AGORA — custo de refatorar `ads` sem usuários; reavaliar após 4.5
  → RECOMENDAÇÃO: B

VEÍCULO
  mínimos: brand(+slug), model(+slug) comercial, fipe_model_description, year,
           mileage, transmission, fuel_type, declared_condition, known_issues,
           city_id, fipe_code/reference_value/reference_at
  evitados: plate (não coletar), model_year, body_type, color, observations

PLACA
  NÃO COLETAR. Hoje não é coletada em lugar nenhum (única ocorrência é uma lista
  de campos com edição BLOQUEADA). Se um dia for: HMAC com pepper, só o digest.

IMAGENS / R2
  atual: pipeline R2 já agnóstico de entidade (vehicleId é só path sanitizado);
         BFF sobe foto antes de a entidade existir; `vehicle_images` NÃO é criada
         por nenhuma migration (probe em information_schema)
  recomendação: sale_request_images com storage_key como fonte de verdade
         (URL derivada), reusando o PIPELINE e não a tabela.
         Namespace: sale-requests/{ownerUserId}/{uploadSessionUuid}/...
         com prefixo validado no servidor contra req.user.id

LOCALIZAÇÃO
  city_id NOT NULL, escolhido pela PF, sem nenhum fallback. Componente
  PurchaseIntentCityField reutilizável; usar /api/painel/cidades/search.

DEALER ELIGIBILITY
  requireDealerAccount + resolveDealerCityId + advertiserIsOperational, sem
  modificar. PROMOVER para módulo compartilhado antes de 4.2 (commit isolado).
  Multi-cidade → null → fail closed. NULL/'' = ACTIVE (legado).

DASHBOARD PF
  /dashboard/vender-para-lojas{,/nova,/[id]} — exige novo item de nav e extensão
  da union de ícone em AccountPanelShell.

DASHBOARD PJ
  /dashboard-loja/oportunidades/veiculos{,/[id]} — ZERO mudança de navegação;
  o hub já é grid de 2 colunas com 1 card, criado para isto.

NOTIFICAÇÕES
  user_notifications atende sem migration (event_type é TEXT livre).
  3 dos 5 eventos JÁ estão no vocabulário. Criar: sale_request.created e
  sale_request.final_offer_created. Dedup por dealer_user_id já resolvida por
  listDealerRecipientsByCity (SELECT DISTINCT). Prefixos de action_path já autorizados.

SCHEMA PROPOSTO
  sale_requests            — §12; 4 status; sem expires_at; sem highest_bid
  sale_request_images      — storage_key fonte de verdade; capa = sort_order 0
  sale_request_bids        — append-only; UNIQUE(sr,dealer,amount);
                             índice único parcial WHERE selected_at IS NOT NULL
  sale_request_final_offers— justificada por §38; UNIQUE(bid_id); CHECK de forma

LIFECYCLE
  receiving_offers → selected → completed | (reabertura explícita)
  receiving_offers → cancelled
  Descartados: evaluation, paused, expired, auction_closed

PRIVACIDADE
  Duas allowlists de coluna; serializer campo a campo, nunca ...row.
  owner_user_id não sai do banco na consulta do lojista.
  ACHADO: as FOTOS são o vazamento real (placa + fachada) e o R2 é público.

CONCORRÊNCIA
  SELECT sale_requests ... FOR UPDATE como ponto único de serialização —
  confirmado (travar bids não funciona: FOR UPDATE sobre zero linhas não bloqueia).
  4 cenários resolvidos deterministicamente; ver §14.

IDEMPOTÊNCIA
  Lance: UNIQUE(sr, dealer, amount) + ON CONFLICT DO NOTHING
  Seleção: índice único parcial
  Oferta final: UNIQUE(bid_id)
  Aceite: UPDATE ... WHERE owner_response IS NULL
  Em todos: banco arbitra, perda vira resposta idempotente, nunca 500.

DTO PF
  bid_id, amount, created_at, is_highest, dealer.name — e nada além.

DTO PJ
  highest_bid, my_bid, is_leading, next_minimum_bid — e nada além.
  Nem id, nem created_at do lance rival.

CONTATO
  Zero antes da seleção. Depois: PF inicia WhatsApp, reusando o padrão 3.1
  (sem body, estado reconferido, resposta { url }).

SEGURANÇA / LGPD
  Threat model em §18 (PF, PJ, mídia). Classificação em §19.
  Nenhuma PII em sale_requests. Fotos = classe sensível (R-1).

PAGINAÇÃO
  Cursor "<createdAtISO>|<id>" base64url, limit+1, comparação de TUPLA.
  Default 20, máx 50. Ordenação determinística created_at DESC, id DESC.

TEST STRATEGY
  §21. PostgreSQL real obrigatório em 4.1, 4.3, 4.4, 4.5.
  Concorrência real obrigatória em 4.3 e 4.4, importando o SERVICE de verdade.

PROTECTED DOMAINS
  §22. Três exceções declaradas: módulo compartilhado de dealer, vocabulário de
  notificação (aditivo), nav do AccountPanelShell.

FASEAMENTO
  4.1: PF publica (schema, form, fotos, cidade, minhas solicitações)
  4.2: PJ recebe (refactor compartilhado primeiro; same-city; privacidade; notificação)
  4.3: Lances (bid, highest, my_bid, next_minimum, concorrência, outbid)
  4.4: Seleção (lock, congelamento, contato)
  4.5: Avaliação presencial (confirm/adjust/reject, oferta final, aceite, reabertura)

RISCOS
  R-1 fotos públicas com placa/endereço (ALTA)
  R-2 refactor do dealer quebrar Produto 1 (ALTA)
  R-3 sem expiração, acúmulo de solicitações abandonadas (MÉDIA)
  R-4 sem moderação, foto inadequada pública (MÉDIA)
  R-5 divergência de tipo users.id (BAIXA, contornada)
  R-6 spam de notificação de lance (BAIXA)
  R-7 upload BFF não normaliza + cópia órfã de r2.service (BAIXA)

PENDÊNCIAS
  §24 — 6 decisões de produto, nenhuma bloqueante para 4.1

RECOMENDAÇÃO FINAL
  GO para a Fase 4.1.
```

### Justificativa do GO

As sete perguntas que o §57 exige responder antes de começar estão respondidas com
evidência do código, não por dedução:

| Pergunta | Resposta |
|---|---|
| Qual entidade representa o carro | `sale_requests`, independente (§4) |
| Como as fotos serão armazenadas | `sale_request_images.storage_key`, pipeline R2 reusado, namespace com `ownerUserId` validado (§8) |
| Quem pode publicar | CPF e `pending`; CNPJ 403 (§3) |
| Quem pode visualizar | Dono, sempre; lojista CNPJ operacional da mesma cidade, com DTO reduzido (§5) |
| Como os dealers são elegíveis | `requireDealerAccount` + `resolveDealerCityId`, promovidos a módulo compartilhado (§9) |
| Como funcionará a disputa | Lances ascendentes append-only, incremento configurável, `MAX(amount)` calculado (§12) |
| Como evitar corrida de bids | `FOR UPDATE` na `sale_requests` + constraints do banco (§14) |
| Como preservar privacidade | Duas allowlists, serializer campo a campo, DTO de 4 campos (§15) |
| Como selecionar uma oferta | `selected_at` + índice único parcial — o banco garante um vencedor (§12, §14) |
| Como separar bid preliminar de valor final | `sale_request_final_offers` referenciando o bid, sem copiar valor (§12) |

**A Fase 4.1 não depende de nenhuma pendência aberta.** As decisões de produto do §24
afetam 4.2 em diante. O único trabalho que precisa acontecer **antes** de 4.2 — e não de
4.1 — é o refactor do módulo compartilhado de lojista (R-2).

**Nenhum arquivo de produto foi alterado nesta fase.** Único arquivo criado: este relatório.
