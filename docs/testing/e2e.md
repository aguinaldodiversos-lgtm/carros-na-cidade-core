# E2E (Playwright) — portal Carros na Cidade

Testes em `frontend/e2e/`. Validam o fluxo **como usuário real** (browser + API).

## Stack controlada (recomendado para PF verde)

Um único comando prepara **Postgres (Docker)**, **MinIO (object storage de teste)**, **migrations**, **bucket** e o **seed E2E** (utilizador `cpf@carrosnacidade.com` / `123456`, cidade **Atibaia** na base, anunciante associado):

```bash
cd /caminho/carros-na-cidade-core
npm run e2e:prepare
```

Use o **mesmo** `DATABASE_URL` no backend que o seed usou (por defeito `postgresql://postgres:postgres@127.0.0.1:5433/carros_na_cidade_test`, ou o seu `TEST_DATABASE_URL` / `.env`).

Depois:

```bash
# Terminal 1 — API Express (porta 4000)
# DATABASE_URL=… ; JWT_SECRET e JWT_REFRESH_SECRET definidos (ver .env.example na raiz)
# E as variáveis R2_* do storage de teste — 'npm run storage:env' imprime o bloco:
eval "$(npm run --silent storage:env)"
npm run dev

# Terminal 2 — Next (porta 3000), ou deixe o Playwright subir com PW_START_SERVER=1
cd frontend
# Defina NEXT_PUBLIC_API_URL=http://127.0.0.1:4000 (ex.: em .env.local)
npm run dev

# Terminal 3 — E2E (com Next já a correr, ou PW_START_SERVER=1 para o Playwright subir o dev)
cd frontend
set E2E_BACKEND_API_URL=http://127.0.0.1:4000
set TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/carros_na_cidade_test
set E2E_DATABASE_URL=%TEST_DATABASE_URL%
npx playwright test --reporter=list
```

Com **um** terminal só (Playwright sobe o Next):

```bash
cd frontend
set PW_START_SERVER=1
set E2E_BACKEND_API_URL=http://127.0.0.1:4000
npm run test:e2e
```

(`playwright.config.ts` injeta `NEXT_PUBLIC_API_URL` a partir de `E2E_BACKEND_API_URL`; o valor por defeito é **`http://127.0.0.1:4000`**.)

No Linux/macOS use `export` em vez de `set`.

Na **raiz** do monorepo também existe:

```bash
npm run e2e
```

(executa `npm run test:e2e` no `frontend`).

### Smoke (`@smoke`)

Testes marcados com `{ tag: "@smoke" }` cobrem regressões frequentes (redirect legado do painel, fluxo PF principal) sem correr a suíte inteira:

```bash
cd frontend
npm run test:e2e:smoke
```

Na raiz: `npm run e2e:smoke`. Ver também [coverage-and-integration.md](./coverage-and-integration.md).

## Variáveis úteis

| Variável                                 | Função                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `PLAYWRIGHT_BASE_URL`                    | URL do Next (padrão `http://127.0.0.1:3000`)                                               |
| `E2E_BACKEND_API_URL`                    | API Express + BFF (`NEXT_PUBLIC_API_URL` no `webServer`; padrão `http://127.0.0.1:4000`)   |
| `E2E_DATABASE_URL` / `TEST_DATABASE_URL` | Assert SQL em `assertLatestAdPersistedForEmail` (opcional)                                 |
| `E2E_EMAIL` / `E2E_PASSWORD`             | Login em `10-login-ad-publish.spec.ts` (padrão cpf@… / 123456)                             |
| `E2E_PJ_EMAIL` / `E2E_PJ_PASSWORD`       | Futuro fluxo PJ em `critical-pj-flow.spec.ts`                                              |
| `SKIP_E2E_MAIN`                          | `1` pula o spec principal `main-flow.spec.ts`                                              |
| `PW_START_SERVER=1`                      | Playwright sobe o Next via `webServer` (ver `frontend/playwright.config.ts`)               |
| `E2E_SEEDED=1`                           | Declara o ambiente como **preparado**: conta obrigatória que não loga vira FALHA, não skip |
| `ALLOW_PRODUCTION=true`                  | Válvula de escape do guard de alvo (**não use**; ver abaixo)                               |

> **`AUTH_SESSION_SECRET` não deve ser definido localmente.** Vários specs
> (`active-buyers-card-grid`, `dealer-*`, `admin-ad-moderation`) forjam o cookie
> de sessão assinando com a constante de desenvolvimento `"cnc-dev-session-secret"`
> (`services/sessionService.ts`). Com outro segredo, o HMAC não fecha e **todos**
> falham com 401 — sem relação nenhuma com o produto.

## Guard: a suíte recusa rodar contra produção

`frontend/playwright.config.ts` chama `assertSafeE2eTargetForDir` antes de carregar
qualquer spec. Ele resolve `process.env` **mais** os arquivos `.env*` do frontend
(a mesma ordem que o `next dev` usa) e aborta se `NEXT_PUBLIC_API_URL`,
`E2E_BACKEND_API_URL`, `BACKEND_API_URL`, `AUTH_API_BASE_URL`, `API_URL`,
`PLAYWRIGHT_BASE_URL`, `BASE_URL` ou `NEXT_PUBLIC_SITE_URL` apontarem para
produção — ou para um host que ele não reconhece.

Isso importa porque **`frontend/.env.local` aponta para a API de produção**, e a
suíte E2E cadastra usuários e publica anúncios. Sem o guard, um `npm run dev`
seguido de `npx playwright test` escreve em produção.

Permitidos: `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, redes privadas,
`*.local` e qualquer host contendo `staging` — o mesmo contrato de
`scripts/staging-antifraud-smoke.mjs`. A válvula `ALLOW_PRODUCTION=true` existe
para emergências e está documentada só para que ninguém a invente diferente.

## Skip não é mais aceito no caminho crítico

`npm run e2e:prepare` escreve `frontend/e2e/.seed-state.json` com o banco que
semeou. O `playwright.config.ts` lê esse marcador e liga `E2E_SEEDED=1` quando o
banco confere; o CI define a variável diretamente.

Com o ambiente declarado como preparado, `requireSeededLogin` /
`requireSeededApi` (`frontend/e2e/helpers.ts`) **lançam** em vez de pular. Sem a
declaração, o skip continua valendo — com instrução no lugar do enigma.

Antes disso, `full-flow.spec.ts` (o único spec que o CI executa) pulava 6 dos
seus 9 testes porque `testa@`/`testb@` não existiam, e o job publicava
"E2E full-flow passed" sem ter exercitado cadastro, wizard, publicação nem
persistência.

## O que `npm run e2e:prepare` cria

Todos os dados são **sintéticos**. O seed é idempotente: reexecutar devolve o
banco ao mesmo estado, sem acumular duplicatas.

| Recurso                                        | Detalhe                                                        | Usado por                                |
| ---------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| `cpf@carrosnacidade.com` / `123456`            | PF verificado, com advertiser                                  | `loginAsLocalUser`, specs de publicação  |
| `testa@carrosnacidade.com` / `SenhaTesteA123!` | PF verificado, com advertiser                                  | `USERS.A` — `full-flow.spec.ts`          |
| `testb@carrosnacidade.com` / `SenhaTesteB123!` | PF verificado, com advertiser                                  | `USERS.B` — isolamento                   |
| `admin.mod@example.com` / `Admin@12345`        | `role = 'admin'`                                               | `admin-ad-moderation.spec.ts`            |
| `cnpj@…` … `cnpj5@…` / `Admin@12345`           | Lojistas CNPJ (Atibaia ×2, Bragança)                           | Motor de Oportunidades, moderação        |
| 11 anúncios ativos em Atibaia                  | 4 de estoque + 5 de vitrine + 3 de detalhe (1 em Bragança)     | grid desktop, catálogo, paginação        |
| Fotos em `/images/*.png`                       | 3 por anúncio; 5 / 1 / 0 nos slugs de `vehicle-detail-premium` | galeria, lightbox, fallback sem foto     |
| Solicitação de venda #1 + rodada 1 + 4 fotos   | Fase 4.3                                                       | fluxo de venda para lojas                |
| Bucket `carros-e2e-test` no MinIO              | criado com política de leitura anônima (espelha o CDN)         | upload do wizard, foto na página pública |

Se Atibaia ficar com menos de 6 anúncios ativos, o seed **falha** em vez de
seguir: a suíte de grid exige mais de 4 cards e um seed magro produzia 11
vermelhos que não falavam sobre o grid.

## Object storage: o E2E precisa de storage real (BUG-ENV-01)

O caminho crítico **não completa sem storage**, e isso não é rigidez do teste —
é o produto funcionando:

1. `POST /api/ads/upload-images` responde **500** sem `R2_ACCOUNT_ID`;
2. o BFF cai no fallback de disco e devolve **URL relativa**;
3. `POST /api/painel/anuncios` responde **400**, porque só aceita referência
   absoluta ou o proxy `/api/vehicle-images?key=…`.

O backend recusa publicar anúncio cujas fotos ele não consegue confirmar. Um
E2E que contornasse isso (mock de upload, fallback permissivo, publicação sem
foto) deixaria de testar justamente a regra que protege o anúncio publicado.

### Por que MinIO serve sem tocar no produto

| Ponto do adapter | Produção (R2)               | Teste (MinIO)           |
| ---------------- | --------------------------- | ----------------------- |
| SDK              | `@aws-sdk/client-s3`        | o mesmo                 |
| `R2_ENDPOINT`    | `…r2.cloudflarestorage.com` | `http://127.0.0.1:9000` |
| `forcePathStyle` | `true` (R2 exige)           | `true` (MinIO exige)    |
| Assinatura       | SigV4                       | SigV4                   |

A diferença é **100% de variável de ambiente**. Nenhum arquivo de `src/` muda —
`src/infrastructure/storage/r2.service.js` já lê `R2_ENDPOINT` e já fixa
`forcePathStyle`.

### Variáveis (sintéticas, versionadas de propósito)

`npm run storage:env` imprime o bloco pronto:

```bash
export R2_ENDPOINT=http://127.0.0.1:9000
export R2_ACCOUNT_ID=carros-e2e
export R2_ACCESS_KEY_ID=carros-e2e-access-key
export R2_SECRET_ACCESS_KEY=carros-e2e-secret-key
export R2_BUCKET_NAME=carros-e2e-test
export AWS_REGION=us-east-1
export R2_PUBLIC_BASE_URL=http://127.0.0.1:9000/carros-e2e-test
export NEXT_PUBLIC_R2_PUBLIC_BASE_URL=http://127.0.0.1:9000/carros-e2e-test
```

`R2_PUBLIC_BASE_URL` não é opcional aqui. Sem ela,
`/api/vehicle-images?key=…` responde **302 para
`/images/vehicle-placeholder.svg`** — a rota foi desenhada para redirecionar ao
CDN e, sem base pública, não tem destino. O anúncio publica, o E2E fica verde e
a foto não chega ao visitante.

`scripts/e2e-storage-prepare.mjs` **recusa** endpoint que não seja local: ele
cria bucket e política, e apontar para Cloudflare por engano não pode depender
de atenção humana. Nunca use credencial, bucket ou endpoint reais aqui.

### Contrato coberto por teste

`tests/integration/vehicle-image-storage.integration.test.js` exercita o
**adapter de produção** (sem mock) contra o MinIO e prova a cadeia inteira:
upload → objeto existe (`HeadObject` por um cliente independente) → backend lê
os mesmos bytes → referência aceita pela publicação → chave inexistente
continua recusada. "Respondeu 200" não é prova: um storage que aceita bytes e
os descarta passaria num teste de status.

## Specs

| Ficheiro                              | Conteúdo                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `main-flow.spec.ts`                   | **PF**: cadastro → painel → wizard → busca API → painel → `/anuncios` → **`/veiculo/[slug]`**             |
| `10-login-ad-publish.spec.ts`         | Login fixo → wizard → publicar                                                                            |
| `register-minimal-to-publish.spec.ts` | **Cadastro mínimo** (e-mail+senha) → gate CPF → wizard → publicar (`npm run test:e2e:register-publish`)   |
| `user-isolation-api.spec.ts`          | Dois cadastros → `GET /api/dashboard/me` com `user.id` distinto por cookie (`npm run test:e2e:isolation`) |
| `20-login-ad-checkout.spec.ts`        | Login → wizard → planos/checkout                                                                          |
| `anunciar-redirect.spec.ts`           | Redirect legado `/painel/anuncios/novo`                                                                   |
| `critical-pj-flow.spec.ts`            | PJ opcional (skipped sem credenciais)                                                                     |

## Relatório da última execução automatizada

Sem `npm run dev` no frontend, **todos os testes falham** em `ensureDevServerUp` (Next inacessível na porta 3000). Isso é **esperado** em CI sem subir o servidor; localmente suba os três serviços antes de `npx playwright test`.

## Lacunas conhecidas

- **PJ**: fluxo lojista não cobre publicação completa até haver credenciais `E2E_PJ_*` e cenário CNPJ verificado.
- **Mercado Pago / planos**: `20-login-ad-checkout` depende de rotas de pagamento configuradas.
- **Credenciais locais**: com `npm run e2e:prepare`, o utilizador fixo `cpf@carrosnacidade.com` / `123456` existe na base; override com `E2E_EMAIL` / `E2E_PASSWORD` se necessário.
- **FIPE**: wizard depende de API FIPE (via Next); falhas de rede externa quebram o passo de marcas/modelos.

## Edge cases e backlog de QA

Lista detalhada de cenários de borda, lacunas de cobertura e tickets sugeridos (**QA-101…**): [qa-edge-cases.md](./qa-edge-cases.md).

## Integração com CI

O job `e2e` de `.github/workflows/ci.yml` monta o ambiente completo:

| Passo                               | Falha derruba o job porque…             |
| ----------------------------------- | --------------------------------------- |
| serviço `postgres`                  | sem banco não há seed nem persistência  |
| `docker compose … up -d minio_test` | sem storage o upload não existe         |
| `npm run storage:prepare`           | bucket ausente = publicação em 400      |
| `node src/index.js` (porta 4000)    | sem API o BFF não autentica nem publica |
| `npm run test:e2e:full-flow`        | é o gate do caminho crítico             |

Nenhum desses passos usa `continue-on-error`: **indisponibilidade de storage
não vira skip**. Foi assim que o BUG-ENV-01 passou batido — o job publicava
"E2E full-flow passed" sem ter exercitado publicação nenhuma.

O Next sobe pelo próprio Playwright (`PW_START_SERVER=1`). O MinIO reaproveita
a definição de `docker-compose.test.yml`, para que CI e máquina local não
divirjam em imagem, credencial ou região. Artefactos: relatório Playwright
sempre, log da API em caso de falha.
