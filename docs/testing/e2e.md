# E2E (Playwright) — portal Carros na Cidade

Testes em `frontend/e2e/`. Validam o fluxo **como usuário real** (browser + API).

## Stack controlada (recomendado para PF verde)

Um único comando prepara **Postgres (Docker)**, **migrations** e o **seed E2E** (utilizador `cpf@carrosnacidade.com` / `123456`, cidade **Atibaia** na base, anunciante associado):

```bash
cd /caminho/carros-na-cidade-core
npm run e2e:prepare
```

Use o **mesmo** `DATABASE_URL` no backend que o seed usou (por defeito `postgresql://postgres:postgres@127.0.0.1:5433/carros_na_cidade_test`, ou o seu `TEST_DATABASE_URL` / `.env`).

Depois:

```bash
# Terminal 1 — API Express (porta 4000)
# DATABASE_URL=… ; JWT_SECRET e JWT_REFRESH_SECRET definidos (ver .env.example na raiz)
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

| Variável                                 | Função                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `PLAYWRIGHT_BASE_URL`                    | URL do Next (padrão `http://127.0.0.1:3000`)                                             |
| `E2E_BACKEND_API_URL`                    | API Express + BFF (`NEXT_PUBLIC_API_URL` no `webServer`; padrão `http://127.0.0.1:4000`) |
| `E2E_DATABASE_URL` / `TEST_DATABASE_URL` | Assert SQL em `assertLatestAdPersistedForEmail` (opcional)                               |
| `E2E_EMAIL` / `E2E_PASSWORD`             | Login em `10-login-ad-publish.spec.ts` (padrão cpf@… / 123456)                           |
| `E2E_PJ_EMAIL` / `E2E_PJ_PASSWORD`       | Futuro fluxo PJ em `critical-pj-flow.spec.ts`                                            |
| `SKIP_E2E_MAIN`                          | `1` pula o spec principal `main-flow.spec.ts`                                            |
| `PW_START_SERVER=1`                      | Playwright sobe o Next via `webServer` (ver `frontend/playwright.config.ts`)             |

## Specs

| Ficheiro                       | Conteúdo                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `main-flow.spec.ts`            | **PF**: cadastro → painel → wizard → busca API → painel → `/anuncios` → **`/veiculo/[slug]`** |
| `10-login-ad-publish.spec.ts`  | Login fixo → wizard → publicar                                                                |
| `register-minimal-to-publish.spec.ts` | **Cadastro mínimo** (e-mail+senha) → gate CPF → wizard → publicar (`npm run test:e2e:register-publish`) |
| `user-isolation-api.spec.ts` | Dois cadastros → `GET /api/dashboard/me` com `user.id` distinto por cookie (`npm run test:e2e:isolation`) |
| `20-login-ad-checkout.spec.ts` | Login → wizard → planos/checkout                                                              |
| `anunciar-redirect.spec.ts`    | Redirect legado `/painel/anuncios/novo`                                                       |
| `critical-pj-flow.spec.ts`     | PJ opcional (skipped sem credenciais)                                                         |

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

Para E2E na pipeline: serviço Postgres, job que inicia API + Next (ou `PW_START_SERVER=1` com `E2E_BACKEND_API_URL` para API remota), artefactos Playwright (`report`, `trace`).
