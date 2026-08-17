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

> **Fora do escopo daquela correção:** o campo "Problemas conhecidos" exibia a mesma classe
> de texto. Tratado em seguida — ver §14.2 (**P-7 resolvido**).

### 14.2 — Correção de copy/UX no campo "Problemas conhecidos" (P-7)

**Natureza: correção de apresentação/copy. NÃO é mudança funcional do produto.**

O helper do campo exibia:

> ❌ "Informe problemas conhecidos do veículo, se houver. Não inclua telefone, endereço,
> placa ou dados pessoais."

Substituído por:

> ✅ "Descreva o estado do veículo e eventuais avarias, se houver."

**Motivo.** A intenção do texto antigo era protetiva, mas o efeito era o oposto: listar
telefone, endereço, placa e dados pessoais **dentro de um campo de texto livre** ensina a
pessoa a pensar nesses dados justamente onde ela vai escrever. Quem não tinha cogitado
passar o telefone acabava de ser lembrado de que existe um telefone a passar. É o mesmo
raciocínio do §14.1, aplicado ao segundo — e último — ponto da tela onde isso ocorria.

O objetivo do campo é exclusivamente descrever estado, defeitos, avarias e problemas
conhecidos **do veículo**.

**Tratamento visual:** já era hint neutro (`text-xs`, cinza `#64748b`), o mesmo padrão
adotado no bloco de fotos. Nenhuma caixa de alerta, âmbar, ícone de atenção ou linguagem
jurídica foi introduzida.

**O que NÃO mudou** (verificado):

| Item | Estado |
|---|---|
| `known_issues` opcional | inalterado (teste dedicado prova que o gate de submissão não depende dele) |
| Limite de 1000 caracteres | inalterado (`maxLength` + validação de backend) |
| Payload enviado | inalterado |
| Schema, migrations 052/053 | inalterados |
| DTO, service, repository, routes, persistência | inalterados |
| Autorização e ownership | inalterados |
| Bloco de fotos (§14.1) | intacto |

**Nenhum bloqueio criado.** Não há filtro de telefone, endereço, placa, CPF ou e-mail;
nenhum regex de PII, nenhuma IA de classificação, nenhuma moderação automática, nenhuma
sanitização semântica e nenhum bloqueio de submit. Se a pessoa digitar espontaneamente um
desses dados, o envio **continua permitido** — a plataforma apenas deixa de incentivar e de
destacar.

**Arquivos alterados (somente frontend):**

- `frontend/lib/sale-requests/api.ts` — `ISSUES_PRIVACY_NOTICE` → `ISSUES_GUIDANCE_NOTICE`,
  com a nova copy.
- `frontend/components/account/SaleRequestForm.tsx` — import, uso e dois `data-testid`
  (`sale-request-issues-field`, `sale-request-issues-guidance`) para permitir teste
  **escopado** ao bloco.
- `frontend/components/account/SaleRequestForm.test.tsx` — teste de copy atualizado, mais
  dois novos: a varredura de termos proibidos no bloco e a guarda de que `known_issues`
  segue opcional.

**Backend: nada alterado.** Os constants mortos `SALE_REQUEST_PHOTO_PRIVACY_NOTICE` e
`SALE_REQUEST_ISSUES_PRIVACY_NOTICE` já haviam sido removidos em `631c3667` (§14.1);
busca confirmou que não restou nenhum literal da mensagem antiga no backend.

**Escopo do teste de regressão.** A varredura é feita no elemento do campo
(`sale-request-issues-field`), **não** no app inteiro: termos como "documento" e "dados
pessoais" são legítimos em `/ajuda` e na política de privacidade, e uma varredura global
daria falso positivo neles. O `placeholder` é conferido à parte, porque não entra em
`textContent` — sem isso, a copy proibida poderia voltar por ali sem ninguém notar.

**Detector validado por mutação:** restaurando o texto antigo na constante, os dois testes
novos falham (o de presença e o de ausência). Com a copy correta, passam.

---

## 14.3 — Bug do smoke: erro de STORAGE classificado como foto inválida

**Natureza: correção de contrato HTTP. Nenhum schema, migration, transação,
ownership ou fluxo de upload foi alterado.**

### Reprodução original

No smoke manual, o backend recebeu uma **JPEG válida** e o R2 respondeu:

```
The specified bucket does not exist
```

A API respondeu ao usuário:

```
HTTP 400 · SALE_REQUEST_INVALID_PHOTO
"Não foi possível enviar uma das fotos. Use JPG, PNG ou WebP de até 10 MB."
```

### Causa raiz

`sale-requests.photos.service.js` envolvia a chamada inteira de
`uploadSaleRequestImage()` num único `catch (error)` e convertia **qualquer**
exceção em erro de foto. Um `catch` genérico não tem como distinguir "o arquivo
está ruim" de "o storage está fora" — então a única classe de erro que ele sabia
produzir era a errada para metade dos casos.

O efeito prático é pior que um erro genérico: a pessoa foi instruída a converter,
redimensionar e reenviar um arquivo que **nunca teve defeito**, e nenhuma dessas
tentativas poderia funcionar.

### Solução

Classificação **estrutural**, por etapa — não por texto da mensagem do SDK.

Novo módulo `src/infrastructure/storage/storage-errors.js`, genérico e sem
nenhuma dependência de `sale_requests` (infraestrutura não importa constante de
domínio):

- `ImageInputError` — o ARQUIVO é o problema. Propaga o sinalizador `expose`, que
  o projeto já usa para mensagens escritas ao usuário final.
- `ObjectStorageError` — o STORAGE é o problema. Carrega `stage`
  (`config` | `put`) e a causa original. A `message` é **interna**.
- `describeStorageFailure()` — extrai `name`/`message`/`httpStatus` do erro de
  origem para o LOG, nunca o objeto inteiro (o erro do SDK da AWS carrega
  `$metadata` e configuração resolvida de credenciais).

`uploadSaleRequestImage()` foi reestruturada em **três fases explícitas**:

| Fase | O que roda | Erro produzido |
|---|---|---|
| 1 | `validateVehicleImageFile` + `normalizeVehicleImage` | `ImageInputError` |
| 2 | `getR2Client` + `getR2Config` | `ObjectStorageError` (`stage: config`) |
| 3 | `PutObjectCommand` | `ObjectStorageError` (`stage: put`) |

A ordem mudou: **input vem antes** de tocar em configuração de storage. Um
arquivo recusado nunca chega a exigir credencial válida, e quando as duas coisas
estão erradas o usuário recebe o erro que ele consegue resolver.

`uploadVehicleImage` (anúncios) e `uploadSiteImage` (institucional) ficaram
**intactas** — mudá-las para corrigir um bug do Produto 2 arrastaria risco para
fora do escopo.

### Contrato final

| Situação | HTTP | `code` | Mensagem pública |
|---|---|---|---|
| MIME recusado, vazio, >10 MB, corrompido | **400** | `SALE_REQUEST_INVALID_PHOTO` | "…Use JPG, PNG ou WebP de até 10 MB." (ou a mensagem `expose`, quando houver — ex.: a de HEIC) |
| Quantidade inválida | **400** | `SALE_REQUEST_PHOTO_COUNT` | limite aplicável |
| Config ausente, bucket inexistente, AccessDenied, SignatureDoesNotMatch, ECONNREFUSED, timeout, falha de PutObject | **503** | `SALE_REQUEST_PHOTO_STORAGE_UNAVAILABLE` | "Não foi possível enviar a foto agora. Tente novamente em instantes." |
| Não classificado | **500** | — | genérica do `errorHandler`, **nunca** culpando a foto |

A resposta de storage **não contém** bucket, endpoint, account id, nome de
variável de ambiente, credencial ou texto do SDK — verificado por teste que varre
o corpo serializado.

### Teste por mutação (obrigatório — §14)

Restaurando temporariamente o comportamento antigo (catch genérico → 400
`INVALID_PHOTO`):

```
14 testes FALHAM
  · 6 de storage (config, bucket, credencial, assinatura, conexão, timeout)
  · 1 de mensagem pública segura
  · 1 de storage no meio do lote
  · 1 de erro não classificado
  · 1 de mensagem `expose`
  · 4 de rota (503, config, cache, não classificado)
```

Com a implementação correta: **todos verdes**. A mutação **não foi commitada**.

### Smoke com storage REAL (sem mock)

Executado contra o pipeline de produção inteiro — `sharp` de verdade, cliente
S3 de verdade, `PutObjectCommand` de verdade:

| Cenário | Resultado |
|---|---|
| JPEG válida (gerada por sharp) + storage inalcançável (`ECONNREFUSED` real) | ✅ **503**, mensagem segura, sem texto de formato |
| Arquivo corrompido (MIME certo, conteúdo lixo) | ✅ **400** `INVALID_PHOTO` |
| Arquivo de 11 MB | ✅ **400** `INVALID_PHOTO` |
| Config R2 ausente (processo limpo) | ✅ **503**, sem vazar `R2_BUCKET_NAME` |

O cenário 1 é a reprodução do bug: **antes** devolvia 400 culpando a foto.

### Arquivos alterados

- `src/infrastructure/storage/storage-errors.js` — **novo**.
- `src/infrastructure/storage/r2.service.js` — só `uploadSaleRequestImage`,
  reestruturada em fases.
- `src/modules/sale-requests/sale-requests.constants.js` — código
  `PHOTO_STORAGE_UNAVAILABLE` + as duas mensagens públicas.
- `src/modules/sale-requests/sale-requests.photos.service.js` —
  `translateUploadFailure()`.
- `tests/sale-requests/sale-requests-photos.test.js` — matriz input × storage ×
  não classificado.
- `tests/sale-requests/sale-requests-routes.test.js` — contrato 400 × 503 pelo
  caminho HTTP real, incluindo `Cache-Control: private, no-store` no 503.
- `frontend/app/api/account/sale-requests/photos/route.test.ts` — **novo**: o BFF
  preserva 503 e não achata em 400/500.
- `frontend/components/account/SaleRequestForm.test.tsx` — a UI mostra a mensagem
  de storage e **não** a de formato.

### Bug secundário encontrado e corrigido no caminho

O novo teste de BFF usava `vi.stubGlobal("fetch", …)` sem
`vi.unstubAllGlobals()`. `restoreAllMocks` não desfaz `stubGlobal`, então o stub
sobrevivia ao arquivo e vazava para o próximo teste da mesma worker — derrubando
`lib/painel/upload-draft-photos-direct-r2.test.ts` (que usa o `S3Client` de
verdade) **só na suíte completa**, enquanto passava isolado. Corrigido no
`afterEach`.

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
| Backend `npm test` | 199 arq. / 2978 | ✅ **203 arq. / 3110**, 1 pulado | +4 arq., +132 testes, **0 falhas** |
| Backend `lint` | 233 (11 erros) | ⚠️ **233 (11 erros)** | **idêntico**; zero ocorrências nos arquivos novos |
| Frontend `npm test` | 201 arq. / 5 falhas | ⚠️ **202 arq. / 5 falhas** (`--maxWorkers=2`) | +45 testes, **mesmas 2 falhas preexistentes** |
| Frontend `typecheck` | ✅ | ✅ | — |
| Frontend `lint` | ✅ | ✅ | — |
| Frontend `build` | ✅ | ✅ | 7 rotas novas registradas |
| Integração PG | — | ✅ **30 passa** | novo |

**Nenhuma regressão nova.** As 5 falhas de frontend são exatamente as mesmas duas suítes do
baseline (`carros-usados/regiao/[slug]`, `seguranca`).

---

## 16.1 — Verificações que NÃO puderam ser executadas neste ambiente

Três itens exigidos pelo fechamento da fase **não foram executados**, por
limitação de ambiente e não por decisão de escopo. Estão listados aqui em vez de
marcados como feitos.

| Item | Bloqueio |
|---|---|
| **Smoke positivo com MinIO** (§20: upload conclui, contador 0/12 → 1/12, preview, 4 fotos, criar, detalhe, cancelar) | O daemon do Docker ficou indisponível. Estava no ar no início da sessão (a bateria PostgreSQL de 30 testes rodou nele) e caiu depois; a tentativa de reiniciar o Docker Desktop não completou em ~10 min. Sem daemon não há MinIO nem bucket `carros-local`. |
| **Smoke negativo pela UI** (§21) | Mesma dependência do backend + MinIO. **A regra foi provada por outro caminho** — ver o smoke com storage real em §14.3, que usa o SDK de verdade contra endpoint inalcançável. |
| **Smoke mobile nas 5 larguras** (§22) | A navegação do navegador está bloqueada neste ambiente (`navigation ... was denied or failed` em `localhost` e em `127.0.0.1`). Sem navegador não há como medir `scrollWidth` × `clientWidth`. |

**Consequência direta: P-2 permanece ABERTA.** Ela só pode ser marcada como
resolvida depois de as cinco larguras serem realmente medidas — e afirmar o
contrário com base em inspeção de CSS seria registrar como verificado algo que
não foi.

**O que existe hoje no lugar:** o build de produção passa com as três páginas, o
dev server respondeu `GET /dashboard/vender-para-lojas 200` (sem crash de SSR), e
a auditoria estática mostra que todo `min-w-[...]` dos componentes é
`sm:`-prefixado — abaixo de 640 px os CTAs são `w-full`, sem largura fixa,
`whitespace-nowrap` ou `overflow-x`. Isso reduz o risco; não o elimina.

**Caminho para fechar** (fora deste ambiente): subir Docker, `npm run
integration:db:up`, subir MinIO com o bucket `carros-local`, apontar o backend
para os dois e rodar o fluxo via Playwright — que está instalado no repositório
com Chromium disponível e é o caminho natural para medir overflow por script.

### Diagnóstico exato do bloqueio (rodada de release gate, 2026-08-17)

Uma segunda tentativa de fechar P-2 e P-9 isolou a causa do Docker indisponível:

```
Docker Desktop (processos de usuário)  → RODANDO
com.docker.service (serviço Windows)   → STOPPED
Start-Service com.docker.service       → acesso negado (exige elevação)
```

Sem esse serviço o named pipe `dockerDesktopLinuxEngine` não é criado, e nenhum
comando `docker` funciona — daí não haver Postgres em 5433 nem MinIO.

**Unblock:** iniciar o Docker Desktop (ou o serviço) com privilégio de
administrador. Depois disso, o restante do ambiente já está no lugar:

| Recurso | Estado |
|---|---|
| Playwright + Chromium | ✅ instalados no repositório |
| PostgreSQL nativo 16 | ✅ rodando em `127.0.0.1:5432` (o gate pede o container em **5433**) |
| Porta 5433 (Postgres de teste) | ❌ nada escutando |
| Porta 9000 (MinIO) | ❌ nada escutando |

Nenhuma verificação foi executada nesta rodada e **nenhum arquivo de produção
foi tocado** — o working tree terminou idêntico ao preflight.

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
| **P-2** | **ABERTA.** Validação visual mobile nas 5 larguras não executada — navegador bloqueado no ambiente e dependência de backend + storage no ar. Verificação estática feita; não substitui a medição. Ver §16.1. | Média |
| **P-9** | Smoke positivo com MinIO (§20) não executado: daemon do Docker indisponível. O caminho de storage foi provado por smoke com SDK real (§14.3), mas o fluxo completo de UI — preview, 4 fotos, criação, detalhe, cancelamento — segue sem execução end-to-end. | Média |
| **P-3** | Script de limpeza de fotos órfãs no R2 (enviadas e nunca submetidas) não existe. | Baixa |
| **P-4** | `sale_requests` não tem `expires_at` (§34 — sem cronômetro). Solicitações abandonadas ficam abertas para sempre e vão poluir a lista do lojista na 4.2. | Média (vira alta na 4.2) |
| **P-5** | A divergência de `deriveAccountType` (valor desconhecido → `pending`, não `CPF`) está documentada em dois lugares que discordam entre si. Não afeta a 4.1. | Baixa |
| **P-6** | `src/shared/pagination/cursor.js` nasceu como codec canônico, mas `purchase-intents` e `notifications` mantêm as próprias cópias (domínios protegidos). | Baixa |
| ~~**P-7**~~ | ~~O hint de "Problemas conhecidos" ainda enumera dados sensíveis.~~ **RESOLVIDO** em §14.2: copy trocada por "Descreva o estado do veículo e eventuais avarias, se houver.", com teste de regressão escopado ao bloco. Zero mudança funcional. | — |
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

## 23.1 — Checklist de GO definitivo (§28 do pedido de correção)

| Critério | Status |
|---|---|
| arquivo inválido / grande / corrompido → 400 | ✅ unit + rota + smoke real |
| storage sem config → 503 | ✅ unit + rota + smoke real |
| bucket inexistente → 503 | ✅ unit + rota |
| falha de PutObject → 503 | ✅ unit + rota + smoke real (ECONNREFUSED) |
| mensagem pública de storage é segura | ✅ varredura de vazamento |
| nenhuma credencial na resposta | ✅ |
| backend não culpa a foto por erro de storage | ✅ |
| BFF preserva 503 | ✅ teste de rota do BFF |
| frontend mostra mensagem correta | ✅ teste de componente |
| teste de regressão falha com o comportamento antigo | ✅ **14 testes caem na mutação** |
| smoke storage real (negativo) | ✅ |
| **smoke MinIO positivo** | ❌ **não executado** — Docker indisponível (P-9) |
| **1 foto → preview; 4 fotos → criação; detalhe; cancelamento (UI)** | ❌ **não executado** — mesma dependência (P-9) |
| **mobile 360/390/412/768/1440 + overflow=false** | ❌ **não executado** — navegador bloqueado (P-2) |
| migrations 052/053 intactas · zero migration nova | ✅ |
| schema, concurrency, lock, ownership intactos | ✅ não tocados |
| Produto 1, SEO, payments, ads intactos | ✅ suítes verdes |
| backend tests verdes | ✅ 203 arq. / 3110 |
| frontend relevante verde | ✅ |
| typecheck · lint · build verdes | ✅ |
| nenhuma regressão nova | ✅ |
| branch pushada · sem merge · sem deploy | ✅ |

**Três critérios não puderam ser verificados neste ambiente.** Nenhum deles
indica defeito conhecido — são verificações que exigem Docker e navegador.

---

## 24. Recomendação final

> **Atualização após o smoke de upload (§14.3):** a recomendação abaixo foi
> escrita antes do bug de classificação de erro de storage. O bug está corrigido
> e coberto, mas o **fechamento definitivo** da fase depende de três verificações
> que este ambiente não permitiu executar (§16.1 e §23.1): smoke positivo com
> MinIO, fluxo de UI ponta a ponta e mobile nas cinco larguras.
>
> **Status definitivo: NO-GO até que P-2 e P-9 sejam fechadas.** Não há defeito
> conhecido em aberto — o que falta é verificação, não conserto.

```
FASE 4.1 — PF PUBLICA VENDA PARA LOJAS

STATUS: GO (código) / NO-GO (fechamento — ver §16.1, §23.1)

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
