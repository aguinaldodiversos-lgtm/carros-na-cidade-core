# Fase 4.1 — PF publica "Venda seu carro para lojas"

**Produto 2 — primeira fatia funcional**
**Data de execução:** 2026-08-16

---

## 1. Repositório

```
branch:        codex/sale-requests-phase-4-1
HEAD inicial:  282035bbd9754b1e4f6280eb9b4f03312896b27c  (Merge Admin U1 users management)
HEAD final:    68b96f6dbb (test(sale-requests): verify postgres invariants)
working tree:  limpo, exceto o relatório da Fase 4.0 (não rastreado, preservado)
```

A auditoria da Fase 4.0 foi feita sobre `086a1e4d`. A `main` avançou 5 commits com a
Admin U1; **esta fase partiu da main atual**, não do HEAD antigo.

### Commits

```
5deebd4e feat(sale-requests): add owner sale request domain
1b453a84 feat(sale-requests): add vehicle photo persistence
5232308c feat(dashboard): add sell-to-dealers owner flow
68b96f6d test(sale-requests): verify postgres invariants
```

### Achado do preflight que mudou uma conclusão da 4.0

A Admin U1 trouxe `src/shared/account/account-type.js`, que documenta a regra REAL de
derivação de `account_type` — e ela diverge do que a auditoria da Fase 4.0 registrou
(baseada em `auth.middleware.js`):

> `document_type` que não seja exatamente `'cpf'`/`'cnpj'` (ex.: `'rg'`) vira
> **`pending`**, não `CPF`. O comentário de `dealer.middleware.js` diz o contrário do que
> o código faz.

Isso **não** afeta a Fase 4.1: a regra implementada é por exclusão (só `CNPJ` é recusado),
então CPF e `pending` publicam de qualquer forma. Registrado porque a Fase 4.3 vai
precisar da regra correta ao decidir quem oferta.

---

## 2. Baseline (antes de qualquer alteração)

| Verificação | Resultado | Observação |
|---|---|---|
| Backend `npm test` | ✅ 199 arquivos, 2978 passa, 1 pulado | — |
| Backend `npm run lint` | ⚠️ **233 problemas (11 erros, 222 avisos)** | **PREEXISTENTE**; os 11 erros estão todos em `scripts/`, nenhum em `src/` |
| Frontend `npm test` | ⚠️ **2 arquivos / 5 testes falhando** | **PREEXISTENTE** |
| Frontend `typecheck` | ✅ | — |
| Frontend `lint` | ✅ | — |
| Frontend `build` | ✅ | — |

**Falhas preexistentes, não corrigidas (§4 — dívida não relacionada):**

- `app/carros-usados/regiao/[slug]/page.config.test.ts` — 3 testes (flags
  `REGIONAL_PAGE_INDEXABLE` / `CANONICAL_SELF`). Domínio SEO, **protegido**.
- `app/seguranca/page.copy.test.ts` — 2 testes.
- 11 erros de lint em `scripts/audit/*`, `scripts/blog/*`, `scripts/smoke*` etc.
  (`no-unused-vars`, `no-empty`, `no-useless-escape`).

> Erro de método no preflight, registrado por honestidade: o `Set-Location` do PowerShell
> persiste entre comandos, e uma execução paralela de `cd frontend` fez dois `npm run lint`
> seguintes rodarem o lint do FRONTEND achando que era o do backend. O sintoma era
> contraditório ("233 problemas" e depois "No ESLint warnings"). Todas as medições
> posteriores usam caminho absoluto explícito.

---

## 3. Migrations

Exatamente **duas**, como o §40 exige. Nenhum `ALTER TABLE` em `ads`, `users` ou
`advertisers`.

### `052_sale_requests.sql`

Colunas: `id`, `owner_user_id`, `city_id`, `brand`, `brand_slug`, `model`, `model_slug`,
`fipe_model_description`, `fipe_code`, `fipe_reference_value`, `fipe_reference_at`,
`year`, `mileage`, `transmission`, `fuel_type`, `declared_condition`, `known_issues`,
`status`, `created_at`, `updated_at`.

**CHECKs:**
```sql
status IN ('receiving_offers', 'cancelled')
declared_condition IN ('excelente','bom','regular','precisa_reparos')
year BETWEEN 1950 AND 2100
mileage >= 0
fipe_reference_value IS NULL OR fipe_reference_value > 0
```

`selected` e `completed` **não entram** (§7): nenhum endpoint desta fase os escreve. É
exatamente o erro que a migration 030 documenta em `ads.status`, onde `draft`/`sold`/
`expired` viraram lista morta sem caminho de escrita.

**Sem CHECK em `transmission`/`fuel_type`** — `ads` não tem, e criar aqui regra mais dura
que a da tabela de comparação geraria divergência nas fases seguintes.

**Índices:**
```sql
(owner_user_id, created_at DESC, id DESC)
(city_id, created_at DESC, id DESC) WHERE status = 'receiving_offers'   -- parcial
```

**Ausentes de propósito:** `plate`, `plate_hash`, `expires_at`, `current_highest_bid`,
`selected_bid_id` — todos provados ausentes por teste de integração.

### `053_sale_request_images.sql`

`id`, `sale_request_id` (FK CASCADE), `storage_key`, `sort_order`, `created_at`.

- **`storage_key` é `UNIQUE` GLOBAL**, não `(sale_request_id, storage_key)`. Um objeto do
  R2 pertence a **exatamente uma** solicitação. Com a chave composta, o mesmo objeto
  poderia ser reivindicado por duas solicitações — inclusive de donos diferentes. A
  validação de prefixo já barra isso na aplicação; esta constraint é do **banco**, e vale
  para qualquer caminho de escrita futuro.
- **Sem `image_url`** — derivada de `storage_key` na leitura.
- **Sem `is_cover`** — a capa é `sort_order = 0`. `vehicle_images` tem as duas colunas em
  paralelo, o que permite o estado impossível "duas capas".
- Índice `(sale_request_id, sort_order, id)`.

---

## 4. Schema real (verificado no PostgreSQL, não deduzido)

Provado por `tests/integration/sale-requests-schema.integration.test.js` (18 casos):
todas as colunas previstas presentes, as proibidas ausentes, `status` nascendo
`receiving_offers` por DEFAULT, cada CHECK recusando o valor errado, FK de dono com
CASCADE, FK de cidade **recusando** a remoção do catálogo, `UNIQUE` global exercitado com
duas solicitações distintas, CASCADE da galeria e o índice parcial com o predicado certo.

---

## 5. Rotas

| Método | Rota | Guarda |
|---|---|---|
| `GET` | `/api/account/sale-requests` | `authMiddleware` |
| `POST` | `/api/account/sale-requests` | `authMiddleware` + rate limit + CNPJ recusado no service |
| `POST` | `/api/account/sale-requests/photos` | `authMiddleware` + rate limit + multer (12 arquivos) |
| `GET` | `/api/account/sale-requests/:id` | `authMiddleware` + posse no `WHERE` |
| `POST` | `/api/account/sale-requests/:id/cancel` | `authMiddleware` + posse no `WHERE` |

Montado em `src/app.js` **antes** de `/api/account`, pelo mesmo motivo das procuras: o
ramo mais específico primeiro.

`/photos` é declarado **antes** de `/:id`. Sem isso o Express casaria `/photos` como
`/:id` e `parseSaleRequestId("photos")` devolveria 404 — um upload legítimo falhando com
"solicitação não encontrada", silencioso e difícil de ler no log. Coberto por teste.

**Não existe:** `PATCH`, `PUT`, `DELETE`, nem qualquer rota de lojista. Provado por teste
de rota (todos devolvem 404).

---

## 6. Autorização, posse e privacidade

**Quem publica:** CPF ✅, `pending` ✅, CNPJ ❌ (403, `SALE_REQUEST_OWNER_ONLY`).
Autoridade única: `req.user.account_type`, derivado pelo `authMiddleware` do banco. Nunca
cookie, corpo, query ou header.

A regra vive no **service**, não num middleware de área — mesma decisão documentada em
`purchase-intents.routes.js`: é regra de produto, e a mensagem precisa dizer ao lojista
para onde ir.

**Posse dentro do SQL**, nunca `SELECT` → `if` → `UPDATE`:
```sql
WHERE id = $1 AND owner_user_id = $2
```
Solicitação alheia → **404**, nunca 403. Provado em teste unitário, de rota e de
integração.

**DTO do dono** — montado campo a campo, nunca `...row`. `OWNER_COLUMNS` é allowlist e
**não contém `owner_user_id`**; nenhuma query toca `users`, então e-mail, telefone,
documento e nome não têm por onde vazar. Um teste afirma o conjunto EXATO de 20 chaves do
DTO e outro varre o JSON serializado por 9 termos proibidos.

### Defeito real encontrado pelos próprios testes

O 404 de solicitação alheia saía com `Cache-Control: public, max-age=60`. Causa: o
`errorHandler` global marca todo 404 operacional assim (otimização legítima, escrita para
404 de bot em rota **pública**), e o `applyPrivateHeaders` do controller só roda no
caminho de **sucesso**. Numa rota autenticada, `public` autoriza explicitamente um cache
compartilhado a guardar a resposta de uma request com `Authorization`.

Fechado com um error handler no router do módulo, que reafirma `private, no-store` e
responde ao 404 com o mesmo corpo enxuto. **Não corrigido globalmente**: `errorHandler` é
compartilhado por todas as rotas públicas do portal, e mudar a política de cache de 404 do
projeto inteiro não é escopo desta fase.

> **O mesmo padrão existe hoje nas rotas do Produto 1** (`purchase-intents`), que está na
> lista de domínios protegidos. Não foi tocado. Registrado como pendência P-1.

---

## 7. FIPE

O cliente envia **códigos** (`fipe_brand_code`, `fipe_model_code`, `fipe_year_code`); o
servidor cota via `resolveFipeReference` e grava o snapshot.

- Só `ok === true && confidence === "high"` vira valor. O caminho de "client hint" do
  service de FIPE é **ignorado por construção**: `client_hint_value` nunca é passado.
  Teste assere que a chamada não contém essa chave.
- Falha, baixa confiança ou exceção do provedor → `fipe_code`, `fipe_reference_value` e
  `fipe_reference_at` ficam **NULL**. Valor nunca é inventado.
- **A publicação nunca falha por causa da FIPE.** Provedor fora do ar derruba um provedor
  externo, não o produto.
- A resolução acontece **FORA da transação**: dentro dela, a latência de terceiros viraria
  tempo de lock na linha do usuário. Coberto por teste que verifica que nenhum `FOR UPDATE`
  foi emitido no instante da chamada.

`brand_slug`, `model_slug` e o modelo comercial são derivados no **servidor**, pelos mesmos
helpers canônicos dos anúncios (`canonicalBrandLabel/Slug`, `deriveCommercialModel`).

`fipe_model_description` guarda a descrição FIPE **inteira** (que carrega a versão) —
divergência deliberada de `purchase_intents`, que guarda só o modelo comercial. Lá o objeto
é uma procura (agrupar ajuda); aqui é um carro específico sendo avaliado, e a versão separa
R$ 15 mil entre um EX e um LX.

---

## 8. Cidade

`city_id` `NOT NULL` com FK real, **escolhido explicitamente pela PF**. Sem nenhum
fallback: nem `users.city`, nem cookie, nem geolocalização, nem primeira cidade, nem
Atibaia, nem advertiser. Cidade inexistente → **400**, com log do motivo e **nada
persistido** (provado no banco real).

Componente reutilizado: `PurchaseIntentCityField`, que consome `/api/painel/cidades/search`
(a busca pública é filtrada por estoque e esconderia a cidade de quem mais precisa dela).

A reutilização foi feita com **um único prop opcional** (`helpText`) cujo default preserva
exatamente o texto do Produto 1 — nenhuma chamada existente muda de comportamento.

---

## 9. R2 / fotos

**Namespace:** `sale-requests/{ownerUserId}/{uploadSessionUuid}/{yyyy}/{mm}/{uuid}-{stem}.webp`

O `ownerUserId` no **prefixo** é o que torna a guarda anti-IDOR trivial: na criação, o
servidor exige que toda chave comece com `sale-requests/{req.user.id}/`. Chave da pasta de
outra pessoa é recusada **sem consultar o banco**.

Isso **melhora** o wizard de anúncio atual, que embute o `userId` num `draftId`
(`publish-{userId}-{uuid}`) mas não valida nada quando as URLs são adotadas.

**Pipeline reusado, tabela não.** `uploadSaleRequestImage` nasce ao lado de
`uploadSiteImage`, no mesmo arquivo e com a mesma forma. Herda de graça: whitelist de MIME
por conteúdo, EXIF auto-rotate, downscale ≤2048px, **strip de metadata** e conversão para
WebP.

> O strip de metadata importa especialmente aqui: a foto de um carro tirada na garagem de
> casa carrega a coordenada da casa no EXIF.

`validateStorageKey` (do proxy de imagens) é **reusado**, não reescrito — já recusa `..`,
`\`, `://`, `data:`/`javascript:`/`file:`/`blob:` e `//` inicial.

**Multer próprio** com teto de 12. Reusar o do anúncio (24) faria uma requisição de 240 MB
ser inteiramente bufferizada na memória do processo **antes** de o service dizer "no
máximo 12".

**Órfãos:** fotos enviadas e nunca submetidas viram objeto órfão no R2. É o mesmo custo que
o acervo de anúncios já paga; a alternativa (linha no banco antes do submit) criaria
solicitação-fantasma. Limpeza é trabalho de script — **pendência P-3**.

**Formatos:** apenas os que o pipeline suporta de forma confiável. HEIC/AVIF **não** foram
adicionados.

---

## 10. Limite de solicitações ativas (P0)

Teto de **3** com `status = 'receiving_offers'`. Cancelada **não** conta.

```
BEGIN
  SELECT id FROM users WHERE id = $1 FOR UPDATE     -- ponto de serialização
  SELECT COUNT(*) ... WHERE owner_user_id AND status = 'receiving_offers'
  se >= 3 → 409 SALE_REQUEST_ACTIVE_LIMIT_REACHED
  INSERT sale_request
  INSERT sale_request_images (uma query, via UNNEST)
COMMIT
```

**Por que o lock é na linha do USUÁRIO** (comentado no código, conforme §19): o invariante
é "quantas abertas esta conta tem". No instante da criação ainda não existe a linha nova
que serviria de mutex, e travar as existentes **não cobriria o dono com zero
solicitações** — não há o que travar, e dois requests passariam os dois. A conta é a
entidade que sempre existe.

Usuário inexistente no banco → **401** (a sessão é o problema, não um recurso).

### Validação do próprio detector — o passo que quase foi pulado

Um teste de concorrência que passa **com e sem** a correção não prova nada. Com o
`FOR UPDATE` **removido** do repositório:

| Cenário | Sem o lock |
|---|---|
| 2 chamadas simultâneas, 1 rodada (como o §37 descreve) | ⚠️ **PASSOU** — não detectou o bug |
| 4 chamadas simultâneas a partir de zero | ❌ falhou na hora (4 onde o teto é 3) |

Com apenas duas transações é comum a primeira commitar antes de a segunda contar, e não há
corrida para observar. O cenário de duas chamadas foi reescrito para rodar **12 rodadas**,
com asserção **por rodada** — e passou a falhar na **rodada 1** sem o lock.

Com o lock restaurado, **os dois passam**. Só depois disso o P0 foi considerado coberto.

---

## 11. Atomicidade

`sale_request` + galeria numa única transação. `INSERT` das imagens **sem `ON CONFLICT`**:
a colisão do `UNIQUE` global deve derrubar a transação, porque engoli-la criaria uma
solicitação com menos fotos do que a pessoa enviou — sem erro.

Provado no banco real: chave já usada derruba a solicitação inteira, e a consulta
`sale_requests LEFT JOIN sale_request_images WHERE i.id IS NULL` devolve **zero linhas** —
nenhuma solicitação sem galeria sobrevive. Cidade inválida também não deixa resíduo.

**Nada do R2 é apagado dentro da transação de banco** (§20): objeto órfão no storage nunca
é razão para comprometer a atomicidade do PostgreSQL.

---

## 12. Cancelamento

`POST /api/account/sale-requests/:id/cancel`. **Soft**, nunca `DELETE`:

```sql
UPDATE sale_requests SET status='cancelled', updated_at=NOW()
WHERE id=$1 AND owner_user_id=$2 AND status='receiving_offers'
```

A posse **é** o `WHERE`. O `AND status = 'receiving_offers'` é o que torna o retry seguro:
o segundo clique não casa nenhuma linha e **nem reescreve `updated_at`** — verificado no
banco real comparando o timestamp antes e depois.

Idempotente: 200 com o mesmo estado e `changed: false`. Nunca 500, nunca 409.

A solicitação cancelada **permanece no histórico** e continua aparecendo na lista do dono.

---

## 13. Sem edição

Não existe `PATCH` nem `PUT` (§24). Publicou, não edita campo economicamente relevante:
quando os lances existirem (4.3), mudar a quilometragem debaixo de uma oferta já feita
seria alterar o objeto do negócio depois da proposta. Coberto por teste de rota.

---

## 14. Frontend

**Rotas:** `/dashboard/vender-para-lojas`, `/nova`, `/[id]`.
`nova` (estático) convive com `[id]` (dinâmico) — o App Router resolve o literal primeiro.

**BFF:** rotas **explícitas**, não catch-all. `createBackendProxy` lê o corpo com
`request.text()`, o que corromperia o multipart das fotos; por isso `/photos` tem handler
próprio que remonta o `FormData` e **omite** o `Content-Type` para o `fetch` gerar o
boundary do corpo novo. As três rotas JSON reusam o proxy.

O build confirma as 7 rotas registradas, com `/api/account/sale-requests/photos` resolvido
como rota própria (não capturada por `[id]`).

**Nav:** "Vender para lojas" logo depois de "Minhas procuras" — as duas são o par simétrico
do Motor de Oportunidades. O comentário do próprio shell já previa este item com a condição
"só aparece quando o produto existir"; a condição foi cumprida, então a guarda de
**ausência** no teste virou guarda de **presença e rota**, em vez de ser apagada.
"Veículos para comprar" continua como guarda de ausência (é a 4.2).

**Sem placeholder de futuro:** nada de "0 ofertas", "maior lance", "aguardando avaliação",
loja ou WhatsApp. Dois testes varrem o texto renderizado para garantir.

**Sem placa:** nenhum campo, nenhum estado, nenhum envio. Testes na tela e no payload.

**Orientação do bloco de fotos:** comercial, centrada no veículo. Ver §14.1.

### 14.1 — Correção de privacidade e UX no bloco de fotos (pós-implementação)

**Natureza: correção de apresentação/copy. NÃO é mudança funcional do produto.**

O bloco de fotos exibia:

> ❌ "Evite fotos que mostrem a placa do veículo, documentos, pessoas ou a fachada da sua
> residência."

Substituído por:

> ✅ "Adicione fotos claras do veículo para ajudar os lojistas na avaliação inicial."

**Motivo.** O problema não era o conteúdo em si, mas o fato de a interface trazer dados
sensíveis para o **centro da experiência**. Enumerar placa, documentos, pessoas e fachada —
ainda que para desaconselhá-los — sugere que a plataforma espera esse tipo de material. A
proposta correta do produto é não incentivar essa exposição: o objetivo das fotos é mostrar
**somente o veículo**.

**Também alterado o tratamento visual.** O texto vivia numa caixa âmbar de alerta — o mesmo
destaque de um erro. Orientação comercial não é advertência, e destacá-la em amarelo fazia
a pessoa procurar um problema onde não há. Passou a hint neutro, igual às demais ajudas do
formulário.

**O que NÃO mudou** (verificado):

| Item | Estado |
|---|---|
| Schema, migrations | inalterados |
| Validação de fotos (mín. 4, máx. 12) | inalterada |
| Validação de prefixo/posse da `storage_key` | inalterada |
| Pipeline de upload e namespace R2 | inalterados |
| Regras de backend, rotas, DTOs | inalterados |
| Fluxo funcional da Fase 4.1 | inalterado |

**Sem validação bloqueante nova.** Se o usuário postar uma foto em que a placa apareça,
isso **não é bloqueado** — não era antes e não é agora. Nenhuma moderação automática foi
criada.

**Arquivos alterados:**

- `frontend/lib/sale-requests/api.ts` — `PHOTO_PRIVACY_NOTICE` → `PHOTO_GUIDANCE_NOTICE`.
- `frontend/components/account/SaleRequestPhotos.tsx` — texto, estilo neutro e `data-testid`
  (`sale-request-photo-privacy` → `sale-request-photo-guidance`).
- `src/modules/sale-requests/sale-requests.constants.js` — removidos
  `SALE_REQUEST_PHOTO_PRIVACY_NOTICE` e `SALE_REQUEST_ISSUES_PRIVACY_NOTICE`, que eram
  **exports mortos** (definidos e nunca importados por caminho nenhum do backend). Nenhuma
  regra foi tocada; a tela sempre consumiu os literais espelhados no frontend.
- `frontend/components/account/SaleRequestForm.test.tsx` — teste de copy atualizado, mais um
  **novo teste de regressão** que varre o bloco de fotos por `placa`, `documento`,
  `fachada`, `residência`, `dados pessoais` e `dados sensíveis`.

**A limitação técnica que motivou o aviso original não desapareceu:** o bucket R2 é servido
publicamente, então a URL de uma foto vale para sempre. Isso continua registrado como risco
**R-1** no relatório da Fase 4.0 — documentação técnica é o lugar dela, não o formulário.

> **Fora do escopo desta correção, registrado:** o campo "Problemas conhecidos" ainda exibe
> "Não inclua telefone, endereço, placa ou dados pessoais." É a **mesma classe** de texto
> que acabou de ser removida do bloco de fotos. O escopo pedido foi explicitamente "a área
> de upload de fotos", então o campo não foi alterado. Recomenda-se aplicar o mesmo
> tratamento — ver pendência **P-7**.

---

## 15. Testes

### Unitários — 112 novos

| Arquivo | Casos |
|---|---|
| `tests/sale-requests/sale-requests-validation.test.js` | 45 |
| `tests/sale-requests/sale-requests-service.test.js` | 33 |
| `tests/sale-requests/sale-requests-routes.test.js` | 18 |
| `tests/sale-requests/sale-requests-photos.test.js` | 16 |

Cobrem todos os itens do §36, incluindo: prefixo que apenas **começa** com o id do dono
(`sale-requests/77/` não passa para o usuário 7), traversal dentro da própria pasta,
esquemas perigosos, fotos repetidas, barra inicial normalizada, e a ausência de `plate` /
valor FIPE / `status` / `owner_user_id` no resultado da validação.

O `fake-db` **re-implementa** a autorização em vez de devolver linha pronta: apagar o
`AND owner_user_id = $2` do repositório faz o teste de IDOR falhar.

### PostgreSQL real — 30 casos

| Arquivo | Casos |
|---|---|
| `tests/integration/sale-requests-schema.integration.test.js` | 18 |
| `tests/integration/sale-requests-concurrency.integration.test.js` | 12 |

Todos os 13 pontos do §37 cobertos, mais: contas diferentes não se bloqueiam (o lock não é
grosso demais), rajada de 4 a partir de zero, atomicidade com rollback verificado, e posse
contra o banco real.

### Frontend — 35 novos

| Arquivo | Casos |
|---|---|
| `frontend/components/account/SaleRequestForm.test.tsx` | 17 |
| `frontend/components/account/SaleRequests.test.tsx` | 17 |
| `AccountPanelShell.nav.test.tsx` | +1 (e 1 invertido) |

---

## 16. Resultado das suítes (depois)

| Verificação | Baseline | Depois | Delta |
|---|---|---|---|
| Backend `npm test` | 199 arq. / 2978 | ✅ **203 arq. / 3090**, 1 pulado | +4 arq., +112 testes, **0 falhas** |
| Backend `lint` | 233 (11 erros) | ⚠️ **233 (11 erros)** | **idêntico**; zero ocorrências nos arquivos novos |
| Frontend `npm test` | 201 arq. / 5 falhas | ⚠️ **201 arq. / 5 falhas** (`--maxWorkers=2`) | +34 testes, **mesmas 2 falhas preexistentes** |
| Frontend `typecheck` | ✅ | ✅ | — |
| Frontend `lint` | ✅ | ✅ | — |
| Frontend `build` | ✅ | ✅ | 7 rotas novas registradas |
| Integração PG | — | ✅ **30 passa** | novo |

**Nenhuma regressão nova.** As 5 falhas de frontend são exatamente as mesmas duas suítes do
baseline (`carros-usados/regiao/[slug]`, `seguranca`).

---

## 17. Mobile — verificação parcial, declarada

**Não foi possível validar visualmente nos cinco larguras** (360/390/412/768/1440): a
navegação do navegador está bloqueada neste ambiente, e as três rotas exigem sessão PF
autenticada contra um backend em execução.

**O que FOI verificado:**

- O dev server compilou e respondeu **`GET /dashboard/vender-para-lojas 200`** (sem crash
  de SSR) — confirmado no log do servidor.
- O build de produção passou com as três páginas.
- Auditoria estática de overflow: **todo** `min-w-[...]` dos componentes novos é
  `sm:`-prefixado (≥640px), então abaixo disso os CTAs são `w-full`. Não há largura fixa
  sem breakpoint, `whitespace-nowrap` nem `overflow-x`. Os grids são
  `1 → sm:2 → md:4` (fotos: `grid-cols-2` já no mobile), e os blocos de detalhe são
  `flex-col sm:flex-row`.

Isso reduz o risco de overflow horizontal, mas **não substitui** a medição no navegador.
Registrado como **pendência P-2**.

---

## 18. Domínios protegidos

**Não tocados:** `/comprar`, `/carros-em/*`, `/carros-usados/*`, SEO, robots, canonical,
sitemap, ads públicos, migrations de ads, RLS de ads, payments, Mercado Pago, plans,
subscriptions, regras do Produto 1, `purchase_intents`, `purchase_intent_offers`, WhatsApp
do Produto 1, workers, leads.

Provado por teste de integração: nenhuma coluna nova em `ads`/`users`/`advertisers`, o
`ads_status_check` intacto com os 6 valores canônicos, e apenas duas tabelas `sale_request*`
existindo.

**Arquivos compartilhados alterados — todos aditivos:**

| Arquivo | Mudança | Risco |
|---|---|---|
| `src/app.js` | 1 import + 1 `app.use` + 1 linha de comentário | nulo |
| `src/infrastructure/storage/r2.service.js` | 3 exports novos, nenhum existente alterado | nulo |
| `AccountPanelShell.tsx` | 1 valor na union de ícone, 1 `case`, 1 item de nav | baixo, com teste |
| `PurchaseIntentCityField.tsx` | 1 prop opcional com default idêntico ao texto atual | baixo, suíte do Produto 1 verde |
| `AccountPanelShell.nav.test.tsx` | guarda de ausência → guarda de presença | intencional |

`resolveDealerCityId` **não** foi promovido a módulo compartilhado — não é necessário nesta
fase (não há superfície de lojista) e mexer no Produto 1 sem necessidade seria risco sem
contrapartida. Continua sendo pré-requisito da 4.2.

---

## 19. Admin

**Nada foi alterado em `/admin/usuarios` nem em nenhum módulo administrativo**, conforme
§31. A Admin U1 acabou de ser estabilizada.

> **Moderação administrativa de `sale_requests` precisa existir ANTES da distribuição PJ
> da Fase 4.2.** Hoje a publicação é direta e não há nenhuma forma de um administrador
> remover uma solicitação abusiva — e a partir do momento em que lojistas passarem a
> receber essas solicitações, a ausência dessa capacidade deixa de ser aceitável. É
> **bloqueador da 4.2**, não desta fase.

---

## 20. Notificações

**Nenhuma notificação é emitida.** `sale_request.created` **não** é disparada (§32): não
existe feed PJ, e notificar um lojista sobre uma tela que ele não pode abrir seria pior que
não notificar. Nenhum evento de lance.

O vocabulário em `notifications.constants.js` **não foi alterado** — os três literais
`sale_request.*` que já existiam continuam sem emissor.

---

## 21. Bloqueadores futuros registrados (não implementados)

### §34 — Reabertura vs. seleção única: as três propriedades não coexistem

A auditoria da Fase 4.0 propôs simultaneamente:

1. índice único parcial garantindo **um** `selected_at` por `sale_request`;
2. histórico imutável de lances;
3. possibilidade de **reabrir** e selecionar outra loja.

**As três não coexistem no schema proposto.** Com o índice único parcial em
`(sale_request_id) WHERE selected_at IS NOT NULL`, uma segunda seleção após reabertura
exigiria apagar ou sobrescrever o `selected_at` da primeira — destruindo (2) para permitir
(3), ou violando (1).

**Nada foi criado para isso nesta fase.** Antes da Fase 4.4 é obrigatório decidir
explicitamente entre:

- `sale_request_selections` (uma linha por rodada de seleção, com o índice único escopado à
  rodada em vez da solicitação); ou
- coluna `selection_round` participando do índice único parcial; ou
- abandonar a reabertura como recurso de produto.

### §35 — Multi-advertiser: qual loja representa o lance

`advertisers.user_id` **não tem UNIQUE**. Um `dealer_user_id` pode ter N advertisers
operacionais **na mesma cidade**.

Antes da Fase 4.3 é obrigatório decidir qual loja é exibida à PF. **Não** escolher
silenciosamente "o primeiro", "o menor id" ou "o último": a loja mostrada precisa ser
explícita e determinística, porque é com ela que a pessoa acha que está negociando.

Nada foi implementado. A recomendação da 4.0 permanece: `dealer_user_id` como identidade e
autoridade (unicidade, contagem, liderança), `advertiser_id` como snapshot de exibição
resolvido no servidor no instante do lance — mas **a regra de desempate ainda não existe**.

---

## 22. Pendências desta fase

| # | Pendência | Severidade |
|---|---|---|
| **P-1** | O `errorHandler` global marca 404 operacional como `public, max-age=60`; rotas autenticadas do **Produto 1** ainda têm esse comportamento. Corrigido só no router do Produto 2. | Média |
| **P-2** | Validação visual mobile nas 5 larguras não executada (navegador bloqueado + necessidade de sessão autenticada). Verificação estática feita. | Média |
| **P-3** | Script de limpeza de fotos órfãs no R2 (enviadas e nunca submetidas) não existe. | Baixa |
| **P-4** | `sale_requests` não tem `expires_at` (§34 — sem cronômetro). Solicitações abandonadas ficam abertas para sempre e vão poluir a lista do lojista na 4.2. | Média (vira alta na 4.2) |
| **P-5** | A divergência de `deriveAccountType` (valor desconhecido → `pending`, não `CPF`) está documentada em dois lugares que discordam entre si. Não afeta a 4.1. | Baixa |
| **P-6** | `src/shared/pagination/cursor.js` nasceu como codec canônico, mas `purchase-intents` e `notifications` mantêm as próprias cópias (domínios protegidos). | Baixa |
| **P-7** | O hint de "Problemas conhecidos" ainda enumera dados sensíveis ("Não inclua telefone, endereço, placa ou dados pessoais") — mesma classe de texto removida do bloco de fotos em §14.1. Fora do escopo daquela correção. | Baixa |
| **P-8** | A suíte de frontend tem fragilidade de TEMPO pré-existente nos testes de formulário em jsdom: sob contenção de CPU, `PurchaseIntentForm.test.tsx` (Produto 1, não tocado) e o novo `SaleRequestForm.test.tsx` estouram o `testTimeout` de forma intermitente. Com `--maxWorkers=2` a suíte fica verde exceto pelas 5 falhas pré-existentes. Mitigado no arquivo novo (`delay: null` e ciclos redundantes fundidos), não resolvido na configuração da suíte. | Média |

---

## 23. Critérios de GO (§42)

| Critério | Status | Evidência |
|---|---|---|
| `sale_requests` independente de `ads` | ✅ | Migration 052 + teste de isolamento |
| `sale_request_images` usa `storage_key` | ✅ | Migration 053 + teste de colunas |
| `storage_key` não pertence a duas solicitações | ✅ | `UNIQUE` global provado com 2 solicitações |
| Zero placa | ✅ | Schema, validação, DTO, form e tela |
| Zero PII do dono no DTO | ✅ | Allowlist + 2 testes |
| CNPJ não publica | ✅ | 403 em service e rota |
| CPF publica | ✅ | Service + rota |
| `pending` publica | ✅ | Service + rota |
| Cidade explícita, sem fallback | ✅ | 400 sem resíduo, no banco real |
| Limite de 3 server-side | ✅ | Transação + teste |
| Limite resiste concorrência real | ✅ | **12 rodadas + rajada de 4; detector validado por mutação** |
| Criação request+images atômica | ✅ | Rollback verificado no PG |
| Dono não lê request alheio | ✅ | 404 em 3 camadas |
| Dono não cancela request alheio | ✅ | 404 + status inalterado no banco |
| Cancelamento é soft | ✅ | `UPDATE`, nunca `DELETE` |
| Request cancelado fica no histórico | ✅ | Listagem inclui canceladas |
| Não existe endpoint PJ | ✅ | Teste de rota |
| Não existe bid | ✅ | Só 2 tabelas `sale_request*` |
| Sem placeholder falso de oferta | ✅ | 2 testes de varredura de texto |
| Nenhuma notificação PJ prematura | ✅ | Nenhum emissor |
| `/comprar` intacto | ✅ | Não tocado |
| SEO intacto | ✅ | Não tocado |
| Produto 1 intacto | ✅ | Suíte verde; só 1 prop opcional aditivo |
| Pagamentos intactos | ✅ | Não tocados |
| PG integration verde | ✅ | 30/30 |
| Concorrência do limite verde | ✅ | 12/12 |
| Frontend typecheck verde | ✅ | exit 0 |
| Lint verde | ✅ | idêntico ao baseline |
| Build verde | ✅ | exit 0 |
| Testes novos verdes | ✅ | 147 novos |
| Nenhuma regressão nova | ✅ | mesmas 5 falhas preexistentes |

---

## 24. Recomendação final

```
FASE 4.1 — PF PUBLICA VENDA PARA LOJAS

STATUS: GO

Todos os 31 critérios do §42 atendidos. O P0 (teto de 3 sob concorrência
real) está coberto por um detector cuja capacidade de detecção foi ELA
PRÓPRIA validada por mutação — sem o FOR UPDATE, os dois testes de corrida
falham; com ele, passam.

Ressalva declarada, não bloqueante: a validação visual mobile nas cinco
larguras não pôde ser executada neste ambiente (P-2). A verificação
estática de overflow foi feita e o build passa, mas isso não substitui a
medição no navegador — recomenda-se fazê-la antes do merge.

BLOQUEADORES DE FASES FUTURAS (registrados, não implementados):
  - 4.2 exige moderação administrativa de sale_requests ANTES da
    distribuição para lojistas.
  - 4.2 exige promover resolveDealerCityId a módulo compartilhado.
  - 4.3 exige decidir qual advertiser representa o lance (§35).
  - 4.4 exige resolver a incompatibilidade entre seleção única, histórico
    imutável e reabertura (§34).

A branch NÃO foi mergeada e NÃO foi deployada, conforme §43.
```
