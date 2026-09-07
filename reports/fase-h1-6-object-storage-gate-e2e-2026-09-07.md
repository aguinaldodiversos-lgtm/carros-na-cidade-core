# Fase H1.6 — Object Storage e Gate E2E Ponta a Ponta

**Data:** 2026-09-07
**Escopo:** resolver **exclusivamente** o BUG-ENV-01 (ausência de object storage no
ambiente de teste), de modo que o fluxo crítico — login → wizard → upload real →
publicação → persistência → painel → veículo público — complete de ponta a ponta.
**Node:** v20.20.2 (portátil, `engines: >=20 <21`)
**Produto:** nenhum arquivo de `src/`, `frontend/app/`, `frontend/components/` ou
`frontend/lib/` foi alterado. Ver item 13.

**Classificação final: GO COM PENDÊNCIAS.**
O BUG-ENV-01 está **encerrado** e o gate do caminho crítico está verde e
bloqueante. As pendências são achados **pré-existentes** que a suíte agora
enxerga, mais o rate limit (Cenário B), todos registrados sem correção.

---

## 1. Auditoria do adapter S3/R2 atual

`src/infrastructure/storage/r2.service.js` é o **único** adapter de storage do
backend. Pontos que decidiram a compatibilidade:

| Trecho                                                                                      | O que significa                                                        |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `import { S3Client, … } from "@aws-sdk/client-s3"`                                          | SDK S3 genérico — **não** há SDK proprietário da Cloudflare no caminho |
| `endpoint = normalizeHttpUrl(process.env.R2_ENDPOINT) \|\| buildDefaultEndpoint(accountId)` | o endpoint **já** é sobrescrevível por env                             |
| `forcePathStyle: true` (incondicional, com comentário próprio)                              | R2 exige; MinIO exige. Nenhum condicional novo é necessário            |
| `getR2Config()` exige `R2_ACCOUNT_ID` / `ACCESS_KEY_ID` / `SECRET` / `BUCKET_NAME`          | a falha do BUG-ENV-01 era exatamente esta validação disparando         |

O BFF tem seu próprio cliente para o upload direto
(`frontend/lib/painel/upload-draft-photos-direct-r2.ts`) — mesmos nomes de env,
mesmo `forcePathStyle: true`, mesmo SDK. Os dois lados foram cobertos pela mesma
configuração de env; nenhum precisou de código novo.

**Cadeia exata do defeito, confirmada antes de qualquer mudança:**

1. `POST /api/ads/upload-images` → **500** (`[r2] Variável obrigatória ausente: R2_ACCOUNT_ID`);
2. o BFF cai no fallback de disco e devolve **URL relativa** (`/uploads/ads/…`);
3. `POST /api/painel/anuncios` → **400**, porque `isLikelyHttpUrl`
   (`frontend/app/api/painel/anuncios/route.ts:114`) só aceita URL absoluta ou o
   proxy `/api/vehicle-images?key=…`.

**O produto estava correto nos três passos.** Faltava a dependência no ambiente.

## 2. Compatibilidade com MinIO

**Compatível, sem nenhuma alteração funcional.** A diferença entre produção e
teste é **100% de variável de ambiente**:

| Ponto do adapter | Produção (R2)               | Teste (MinIO)           |
| ---------------- | --------------------------- | ----------------------- |
| SDK              | `@aws-sdk/client-s3`        | o mesmo                 |
| `R2_ENDPOINT`    | `…r2.cloudflarestorage.com` | `http://127.0.0.1:9000` |
| `forcePathStyle` | `true`                      | `true`                  |
| Assinatura       | SigV4                       | SigV4                   |
| Região           | `AWS_REGION` (default auto) | `us-east-1` nos 2 lados |

Como o Passo 0 era um gate ("se MinIO não for compatível sem alteração funcional
relevante, PARE"), o resultado autorizou seguir: **zero linhas de produto**.

## 3. Arquivos alterados

**Desta fase (H1.6):**

| Arquivo                                                       | Δ          | Papel                                                           |
| ------------------------------------------------------------- | ---------- | --------------------------------------------------------------- |
| `docker-compose.test.yml`                                     | +47        | serviço `minio_test` (9000/9001, healthcheck, volume)           |
| `scripts/e2e-storage-prepare.mjs`                             | novo, 202  | envs canônicas, guard de host, espera, bucket, política         |
| `tests/integration/vehicle-image-storage.integration.test.js` | novo, 302  | contrato de storage contra o adapter real                       |
| `.github/workflows/ci.yml`                                    | +84        | MinIO + bucket + API Express nos jobs `e2e` e `integration-ads` |
| `package.json`                                                | +3 scripts | `storage:prepare`, `storage:env`, `e2e:prepare` estendido       |
| `docs/testing/e2e.md`                                         | +~90       | seção de object storage e tabela do gate de CI                  |
| `.env.example`                                                | +23        | bloco comentado do storage local de teste                       |

**Nenhum arquivo de produto.** O `git diff --stat` completo (item 13) carrega
também o trabalho ainda não commitado da Fase H1.5.

## 4. Serviços adicionados ao `docker-compose.test.yml`

```yaml
minio_test:
  image: minio/minio:latest
  container_name: carros-minio-test
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: carros-e2e-access-key
    MINIO_ROOT_PASSWORD: carros-e2e-secret-key
    MINIO_REGION: us-east-1 # SigV4 assina a região; fixar evita SignatureDoesNotMatch
  ports: ["9000:9000", "9001:9001"]
  healthcheck: ["CMD", "mc", "ready", "local"] # sem isso, `up -d` volta antes de atender
  volumes: [minio_test_data:/data]
```

`postgres_test` seguiu intocado. O compose é a **única** definição do MinIO — o
CI sobe o mesmo serviço com
`docker compose -f docker-compose.test.yml up -d minio_test`, para que CI e
máquina local não divirjam em imagem, credencial ou região.

## 5. Envs de teste utilizadas — sem segredos reais

```
R2_ENDPOINT=http://127.0.0.1:9000
R2_ACCOUNT_ID=carros-e2e
R2_ACCESS_KEY_ID=carros-e2e-access-key
R2_SECRET_ACCESS_KEY=carros-e2e-secret-key
R2_BUCKET_NAME=carros-e2e-test
AWS_REGION=us-east-1
R2_PUBLIC_BASE_URL=http://127.0.0.1:9000/carros-e2e-test
NEXT_PUBLIC_R2_PUBLIC_BASE_URL=http://127.0.0.1:9000/carros-e2e-test
```

Valores **sintéticos e versionados de propósito** — são contrato entre compose,
backend local, Playwright e CI; não há segredo neles e não pode haver. O nome do
bucket declara que é teste. `npm run storage:env` imprime o bloco pronto.

Três proteções contra apontar para o storage real:

- `assertLocalStorageEndpoint` recusa qualquer host fora de
  `{127.0.0.1, localhost, 0.0.0.0, ::1, minio_test, minio}` — o script **cria e
  apaga** objetos, e esse tipo de engano não pode depender de atenção humana;
- os valores locais nunca substituem env já definida (`applyStorageEnv` só
  preenche o que está vazio);
- o guard de alvo da Fase H1.5 continua abortando a suíte se a API apontar para
  produção — **verificado nesta fase**: uma execução sem as envs locais foi
  barrada no load do `playwright.config.ts`, com os quatro alvos
  (`NEXT_PUBLIC_API_URL`, `BACKEND_API_URL`, `AUTH_API_BASE_URL`, `API_URL`)
  resolvidos para `carros-na-cidade-core.onrender.com` e veredito `producao`.

**`R2_PUBLIC_BASE_URL` não é opcional aqui.** Sem ela,
`/api/vehicle-images?key=…` responde **302 para
`/images/vehicle-placeholder.svg`**: a rota foi desenhada para redirecionar ao
CDN e, sem base pública, não tem destino. O anúncio publicava, o E2E ficava
verde e a foto não chegava ao visitante — o tipo de verde que não vale nada. Foi
encontrado e corrigido na configuração durante esta fase.

## 6. Prova de criação do bucket

`npm run storage:prepare` **não** se contenta com "a porta abriu":

1. espera o MinIO responder a uma chamada **assinada** (`HeadBucket`); 404 /
   `NoSuchBucket` já conta como "servidor respondeu";
2. `CreateBucket`;
3. `PutBucketPolicy` com `s3:GetObject` anônimo — é o que o CDN de produção
   oferece; sem isso o `<img>` receberia 403 e a página pública mostraria imagem
   quebrada;
4. `ListObjectsV2` — **uma leitura assinada de volta**. "CreateBucket devolveu
   200" não prova que o bucket é utilizável.

Saída de uma preparação a partir de volume zerado (`docker compose down -v`):

```
[e2e-storage] bucket criado: carros-e2e-test
[e2e-storage] OK — endpoint=http://127.0.0.1:9000 (host 127.0.0.1) bucket=carros-e2e-test region=us-east-1 objetos=0
[e2e-seed] OK
```

O script usa o **mesmo SDK e as mesmas variáveis** do adapter do produto: se ele
cria o bucket, o adapter fala com o storage. Criar com `mc` provaria apenas que
o `mc` funciona.

## 7. Prova de upload

`tests/integration/vehicle-image-storage.integration.test.js` — **13 testes,
todos verdes em Node 20** — importa o adapter de produção
(`src/infrastructure/storage/r2.service.js`) **sem mock**. Exercita validação de
MIME, normalização, geração de chave, `PutObject` assinado, metadados e leitura.

```
 Test Files  1 passed (1)
      Tests  13 passed (13)
```

O arquivo foi desenhado para não virar decorativo:

- o objeto é confirmado por um **cliente S3 independente** (`HeadObject`), não
  pelo próprio adapter — evita prova por autoconsistência;
- os bytes lidos de volta são comparados byte a byte (assinatura RIFF/WEBP);
- **objeto inexistente continua sendo recusado** e objeto removido deixa de ser
  confirmável — sem isso, um storage que aceita bytes e os descarta passaria;
- MIME inválido é recusado **sem escrever**;
- URL relativa é rejeitada por um espelho local de `isLikelyHttpUrl`, e a
  referência real é aceita — o elo que faltava no BUG-ENV-01.

## 8. Prova de confirmação do objeto

Fora do teste, na execução real do full-flow (Node 20, ambiente limpo):

```
objetos no bucket: 4
  - vehicles/publish-7-503ca269-…/original/2026/09/405c7ab6-…-e2e.png      70B
  - vehicles/publish-7-5f35b165-…/original/2026/09/c3b340fa-…-carro.jpg   203B
  - vehicles/publish-7-60633d65-…/original/2026/09/980d66f3-…-e2e.png      70B
  - vehicles/publish-7-79d8d34c-…/original/2026/09/c5845d7c-…-carro.jpg   203B
```

Leitura **anônima** da foto publicada, sem credencial, como faria o visitante:

```
status=200 type=image/png bytes=70
```

O caminho de upload usado pelo wizard foi `strategiesAttempted: ['direct-r2']` —
**sem** cair no fallback de disco. Confirmado também pelo negativo:
`git status frontend/public/uploads/` ficou vazio ao fim de todas as execuções,
isto é, nenhum arquivo novo foi gravado em disco pelo fallback.

## 9. Full-flow antes/depois

| Execução                            |  PASS |  FAIL |  SKIP | Exit  |
| ----------------------------------- | ----: | ----: | ----: | ----- |
| **Antes** (H1.5, sem storage)       |     8 |     1 |     0 | 1     |
| **Depois** (H1.6, Node 20, isolado) | **9** | **0** | **0** | **0** |

```
ok 8 [chromium] › full-flow.spec.ts:425:3 › 4 — Fluxo completo: login → wizard →
     publicação → painel [P1-P2] › login → wizard (7 steps) → publicar →
     painel lista o anúncio publicado @smoke (11.7s)
  9 passed (32.8s)
```

**Evidência do anúncio publicado nessa execução:**

| Item                  | Valor                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                    | 14                                                                                                                                                    |
| slug                  | `acura-integra-gs-1-8-1992-1788749332555`                                                                                                             |
| status persistido     | `active`                                                                                                                                              |
| quantidade de imagens | 1                                                                                                                                                     |
| URL da imagem         | `http://127.0.0.1:9000/carros-e2e-test/vehicles/publish-7-503ca269-…/original/2026/09/405c7ab6-…-e2e.png` (absoluta, servida pelo storage)            |
| dono                  | `testa@carrosnacidade.com`                                                                                                                            |
| presença no painel    | `GET /dashboard/meus-anuncios` → **200**, com o título, o rótulo **Ativo** e a **foto real** referenciada; **0** ocorrências de `vehicle-placeholder` |
| acesso público final  | `GET /veiculo/<slug>` → **200**, com a foto real no HTML; **0** ocorrências de `vehicle-placeholder`; leitura anônima da imagem → **200 image/png**   |

**Reprodutibilidade do zero verificada:**
`docker compose -f docker-compose.test.yml down -v` → `npm run e2e:prepare`
recria volumes, migrations, bucket e seed, e o full-flow repete 9/0/0.

## 10. HTTP 429 numa execução E2E limpa — **Cenário B**

Protocolo exigido: API reiniciada (o limiter é em memória), suíte completa
executada **uma única vez**, sem smoke nem full-flow antes.

**Total de 429 observados: 23 no par BFF↔API do caminho autenticado, mais ~76
em chamadas SSR de páginas públicas.**

| Rota                                | 429 | Limiter provável               |
| ----------------------------------- | --: | ------------------------------ |
| `POST /api/auth/login`              |  15 | `loginRateLimit` (10 / 15 min) |
| `GET /api/dashboard/me`             |   7 | limite global (1000 / 15 min)  |
| `POST /api/auth/register`           |   1 | global                         |
| `GET /api/painel/cidades/search`    |   1 | `autocompleteRateLimit`        |
| SSR de sitemap / territorial / blog | ~76 | global                         |

**Onde o rate limiting começa, com precisão:** a suíte fez **25** tentativas de
login. As **10 primeiras** chegaram ao handler (9× `200`, 1× `401`) e as **15
seguintes** receberam `429`. Isso casa exatamente com `max: 10, windowMs: 15min`
de `loginRateLimit` — o corte não é ruído, é o orçamento se esgotando.

**Specs que consomem o orçamento de login** (ordem de execução):
`10-login-ad-publish`, `20-login-ad-checkout`, `dashboard-login-pf-pj`,
`dealer-sale-offers`, `full-flow` (3 logins), `ops-viewport-overflow`,
`publish-full-surface`, `register-minimal-to-publish`,
`session-persistence-gates` (4 logins), `user-isolation-api`. A suíte precisa de
~25 logins; o orçamento é 10.

**Causa raiz identificada — e ela não é o `loginRateLimit`:**
`skipIfAuthenticatedInternal` isenta do rate limit toda chamada que traga UA
`cnc-internal/1.0` + `X-Internal-Token` válido. O BFF **já** envia esse par
(`buildBffBackendForwardHeaders` → `buildInternalBackendHeaders`, usado inclusive
em `app/api/auth/login/route.ts`). Em produção `INTERNAL_API_TOKEN` está
definido, então o tráfego SSR/BFF é isento. **No ambiente de teste a variável não
existe**, o skip não ocorre, e todo o tráfego do portal — logins, SSR de sitemap,
páginas territoriais — passa a competir pelo orçamento de um único IP
(`127.0.0.1`).

Ou seja: o 429 medido é **artefato do ambiente de teste**, não o comportamento
que o visitante enfrenta em produção.

**Nada foi alterado.** `loginRateLimit` está intacto e nenhum bypass por env foi
adicionado. A correção que recomendo — e que **depende da sua aprovação** — é
definir `INTERNAL_API_TOKEN` com o mesmo valor sintético na API e no BFF do
ambiente de teste, reproduzindo a configuração de produção em vez de inventar uma
exceção para teste. Alternativa, se preferir não tocar em env: reaproveitar um
`BrowserContext` por conta, reduzindo logins reais.

**Observação de produto para registro (não corrigida, não é desta fase):** como o
BFF é isento, o `loginRateLimit` de produção **não** protege o login feito pelo
portal — apenas chamadas diretas à API. O risco está documentado no próprio
middleware ("se INTERNAL_API_TOKEN vazar, o atacante bypassa o rate limit"), mas
a leitura de que o portal esteja limitado a 10 tentativas é falsa.

## 11. E2E completo antes/depois

| Execução                                   |    PASS |   FAIL |            SKIP | Não executados |
| ------------------------------------------ | ------: | -----: | --------------: | -------------: |
| **Antes** (H1.5 — caminho crítico pulava)  |       — |      — | 10 no full-flow |              — |
| **Depois** (H1.6, Node 20, execução única) | **230** | **34** |               7 |              7 |

Duração: 16,0 min. As 34 falhas foram **classificadas por reexecução isolada com
a API reiniciada** (orçamento de rate limit limpo — `429` contados = 0 em todos
os grupos), para separar colateral de defeito.

### 11.1 Colateral de rate limit — some com orçamento limpo (13)

`full-flow` (3, verdes isoladas), `ops-viewport-overflow` (1),
`session-persistence-gates` (4), `user-isolation-api` (1),
`register-minimal-to-publish` (1, `cidades/search` 429) e 3 do encadeamento de
sessão perdida. Nenhuma indica defeito de produto.

### 11.2 Achados **pré-existentes**, reproduzidos com zero 429 (20) — registrados, não corrigidos

| Achado                                                                                                                                                                                                                                                                                                                                                                                   | Specs | Evidência                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------- |
| **BUG-E2E-04** — `data-testid="vehicle-gallery"` está **duplicado**: `components/vehicle/VehicleGallery.tsx` (tem `data-ready`) e `components/vehicle/detail/VehicleGalleryCarousel.tsx` (**não** tem). A página monta o **carrossel**; `VehicleGallery` não é importado em lugar nenhum (**código morto**). O helper `waitForVehicleGalleryReady` espera um atributo que nunca aparece. |     6 | `unexpected value "null"` em `<section aria-label="Fotos do veículo" data-testid="vehicle-gallery">` |
| **BUG-SEED-02** — `cnpj@carrosnacidade.com` está declarado com **duas senhas diferentes** nos specs: `Admin@12345` (`admin-ad-moderation`) e `123456` (`dealer-sale-offers`, `purchase-intents`, `purchase-intent-offers`). O seed usa `Admin@12345`.                                                                                                                                    |     4 | confirmado direto na API: `Admin@12345` → **200**, `123456` → **401**                                |
| **BUG-SEO-01** (já conhecido) — `/cidade/atibaia-sp` e `/cidade/atibaia-sp/abaixo-da-fipe` emitem `CollectionPage` mas **não** `BreadcrumbList`; `/cidade/atibaia-sp/oportunidades` não emite JSON-LD nenhum                                                                                                                                                                             |     3 | —                                                                                                    |
| **Sitemap kill switch** (já conhecido) — `/sitemaps/{cities,brands,models,content,below-fipe}.xml` e `/sitemaps/regiao/sp.xml` → **503** (`SITEMAP_PUBLIC_ENABLED` desligada por padrão); os specs exigem 200                                                                                                                                                                            |     7 | 503 confirmado por `curl`                                                                            |
| **BUG-E2E-05** — `/planos` não expõe o heading `Planos para particulares` esperado pelo checkout                                                                                                                                                                                                                                                                                         |     1 | `element(s) not found`                                                                               |
| **Invalidação de cache no bloqueio** (já conhecido) — "anúncio bloqueado ainda no catálogo na primeira leitura"                                                                                                                                                                                                                                                                          |     1 | —                                                                                                    |
| **Dealer feed / purchase intents** — redirect para `/login?next=/dashboard-loja`; texto de distância FIPE divergente; `active-buyer-card` ausente (encadeados ao BUG-SEED-02)                                                                                                                                                                                                            |     4 | —                                                                                                    |

Todos estão na sua lista de "não mexer" (carrossel, dealer feeds, purchase
intents, sitemap kill switch, BUG-SEO-01) ou são de infraestrutura de teste.
**Nenhum foi alterado.**

### 11.3 Colateral **desta** correção (1) — decisão sua

`10-login-ad-publish.spec.ts:86` afirma
`img[src*="uploads/ads"], img[src*="%2Fuploads%2Fads%2F"]` — ou seja, o spec
**codificou o fallback de disco**, que era o sintoma do BUG-ENV-01. Com storage
real, a foto publicada tem URL do bucket e o locator não casa mais.

Não toquei nele: o locator ficou obsoleto _porque o defeito foi resolvido_, e a
correção correta (afirmar a URL real do storage, não a do fallback) é um
endurecimento de asserção que prefiro submeter à sua revisão junto do restante.

## 12. Comportamento do CI

`.github/workflows/ci.yml`, jobs `e2e` e `integration-ads`:

| Passo                                                   | Falha derruba o job porque…                   |
| ------------------------------------------------------- | --------------------------------------------- |
| serviço `postgres`                                      | sem banco não há seed nem persistência        |
| `docker compose … up -d minio_test`                     | **MinIO não subiu**                           |
| `npm run storage:prepare`                               | **bucket não existe** / storage não responde  |
| suíte de integração (inclui os 13 de storage)           | **upload não funciona**                       |
| `node src/index.js` na porta 4000 + espera em `/health` | sem API o BFF não autentica nem publica       |
| `npm run test:e2e:full-flow`                            | **full-flow não completou** — gate bloqueante |

**Nenhum desses passos usa `continue-on-error`** — verificado programaticamente:
no job `e2e` a lista de passos não-bloqueantes é vazia; em `integration-ads` o
único não-bloqueante é a quarentena visível de BUG-REG-01/BUG-MIG-01, herdada da
H1.5. **Indisponibilidade de storage não vira skip.**

**Achado do Passo 7 — BUG-CI-02 (corrigido aqui; é infraestrutura de CI):** o job
`e2e` **nunca** subiu a API Express. Enquanto o login sem backend apenas _pulava_
os testes (BUG-CI-01), a ausência não aparecia — o job publicava "E2E full-flow
passed" sem ter exercitado publicação nenhuma. Com `E2E_SEEDED=1` convertendo
skip em falha, o job ficaria vermelho pelo motivo errado. O passo
`Start Express API (porta 4000)` fecha isso, com `nohup`, espera ativa em
`/health`, `::error::` explícito e upload do log da API como artefato em caso de
falha.

O YAML foi validado por parser (`js-yaml`): 4 jobs, sem erro de sintaxe.

## 13. `git diff --stat`

```
 .env.example                                          |  23 ++
 .github/workflows/ci.yml                              | 131 +++++++-
 docker-compose.test.yml                               |  47 +++
 docs/testing/e2e.md                                   | 164 ++++++++-
 frontend/e2e/full-flow.spec.ts                        |  68 ++--
 frontend/e2e/helpers.ts                               | 129 ++++++-
 frontend/e2e/main-flow.spec.ts                        |   6 +-
 frontend/e2e/publish-wizard.ts                        | 178 ++++++++--
 frontend/playwright.config.ts                         |  29 ++
 package.json                                          |   9 +-
 scripts/e2e-seed.mjs                                  | 373 ++++++++++++++++++++-
 tests/integration/ads-opportunity…                    |   8 +-
 tests/integration/ads-ranking-base-city-boost…        |  28 +-
 tests/integration/purchase-intent-offers-concurrency… |  88 ++---
 tests/integration/sale-request-offers-concurrency…    |  53 ++-
 15 files changed, 1153 insertions(+), 181 deletions(-)
```

Inclui o trabalho ainda não commitado da Fase H1.5. **Da H1.6** são apenas
`.env.example`, `.github/workflows/ci.yml` (84 das 131 linhas),
`docker-compose.test.yml`, `docs/testing/e2e.md`, `package.json` (3 scripts) e os
dois arquivos novos.

**Zero alteração em UI, SEO, regras territoriais, pagamentos ou qualquer regra de
negócio.** Nenhum arquivo de `src/`, `frontend/app/`, `frontend/components/` ou
`frontend/lib/` aparece no diff.

## 14. `git status --short`

```
 M .env.example
 M .github/workflows/ci.yml
 M docker-compose.test.yml
 M docs/testing/e2e.md
 M frontend/e2e/full-flow.spec.ts
 M frontend/e2e/helpers.ts
 M frontend/e2e/main-flow.spec.ts
 M frontend/e2e/publish-wizard.ts
 M frontend/playwright.config.ts
 M package.json
 M scripts/e2e-seed.mjs
 M tests/integration/ads-opportunity.integration.test.js
 M tests/integration/ads-ranking-base-city-boost.integration.test.js
 M tests/integration/purchase-intent-offers-concurrency.integration.test.js
 M tests/integration/sale-request-offers-concurrency.integration.test.js
?? frontend/app/simulador-financiamento/route.test.ts
?? frontend/app/tabela-fipe/route.test.ts
?? frontend/components/financing/FinancingSimulator.test.tsx
?? frontend/e2e/.gitignore
?? frontend/e2e/ops-viewport-overflow.spec.ts
?? frontend/e2e/seo-sitemap-urls.spec.ts
?? frontend/e2e/session-persistence-gates.spec.ts
?? frontend/lib/admin/server-admin-session.test.ts
?? frontend/lib/favorites/local-favorites.test.ts
?? frontend/public/images/lojista-detalhe-veiculo-referencia.png
?? frontend/public/images/lojista-oportunidades-veiculos-referencia.png
?? frontend/public/images/vender-para-loja.png
?? frontend/test/guards/
?? reports/fase-4-0-auditoria-venda-para-lojas-2026-08-15.md
?? reports/fase-h1-5-saneamento-infraestrutura-testes-2026-09-07.md
?? reports/homologacao-automatizada-pre-lancamento-2026-09-06.md
?? scripts/e2e-storage-prepare.mjs
?? scripts/run-integration-tests.mjs
?? tests/auth/
?? tests/integration/payments-boost-webhook-idempotency.integration.test.js
?? tests/integration/vehicle-image-storage.integration.test.js
```

Os três `.png` de `frontend/public/images/` e o relatório da Fase 4.0 são
anteriores a esta sessão. **Árvore limpa quanto a artefato de teste:** os 25
screenshots versionados em `reports/screenshots/` que a suíte sobrescreve foram
restaurados (`git checkout --`), `frontend/test-results/` foi removido e
`frontend/public/uploads/ads/` não recebeu nenhum arquivo novo.

---

## Bateria final em Node 20 (v20.20.2)

| #   | Suíte                                    | Resultado                                   |
| --- | ---------------------------------------- | ------------------------------------------- |
| 1   | Storage / adapter (MinIO real, sem mock) | **13/13** ✅                                |
| 2   | Integração: upload + confirmação         | incluída acima ✅                           |
| 3   | Full-flow isolado                        | **9 PASS / 0 FAIL / 0 SKIP**, exit 0 ✅     |
| 4   | E2E completo isolado                     | 230 PASS / 34 FAIL / 7 SKIP ⚠️ (item 11)    |
| 5   | Integração completa (exceto quarentena)  | **21 arquivos / 352 testes** ✅             |
| 6   | Unitários backend                        | **225 arquivos / 3.680 testes** (1 skip) ✅ |
| 7   | Unitários frontend                       | **236 arquivos / 3.687 testes** ✅          |

Quarentena visível e inalterada: BUG-REG-01 (`seed-cities-geo`) e BUG-MIG-01
(`migrations-compat`).

## Veredito

**GO COM PENDÊNCIAS.**

**BUG-ENV-01: ENCERRADO.** O critério que você definiu foi atingido — full-flow
com 9 PASS, 0 FAIL, 0 SKIP e exit 0, com upload real, objeto confirmado no
storage por cliente independente, anúncio persistido `active` com 1 imagem,
presença no painel e foto servida ao visitante anônimo. Sem mock de upload, sem
fallback artificial, sem publicação sem foto, sem tocar em regra de publicação
nem em rate limit.

**Pendências que dependem de decisão sua:**

1. **Rate limit (Cenário B).** Aprovar `INTERNAL_API_TOKEN` sintético no ambiente
   de teste (reproduz produção) ou optar por reduzir logins reais nos specs. Sem
   isso, a suíte completa continua com ~13 falhas colaterais.
2. **BUG-E2E-04** (`vehicle-gallery` duplicado + `VehicleGallery.tsx` morto) — 6
   specs bloqueadas; toca o carrossel, que está na sua lista de não mexer.
3. **BUG-SEED-02** (senha divergente de `cnpj@`) — 4 specs; correção trivial no
   spec, mas encosta em purchase intents.
4. **Colateral desta fase**: `10-login-ad-publish.spec.ts:86` ainda afirma o
   fallback de disco.
5. Achados de SEO e sitemap seguem intocados, como pedido.

Nenhum commit ou push foi feito.
