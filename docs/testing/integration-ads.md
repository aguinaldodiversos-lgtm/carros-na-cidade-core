# Testes de integração — pipeline de anúncios (Postgres real)

A suíte `tests/integration/ads-pipeline.integration.test.js` valida auth (login, refresh, logout), `ensureAdvertiser`, criação de anúncio, leitura pública e isolamento entre contas.

## O que você precisa

- Docker (ou Postgres acessível com a mesma URL)
- Node 20

## O que a suíte valida (regressão)

| Área | O que é exercitado |
|------|---------------------|
| Auth | Login, refresh, logout invalida refresh |
| Advertiser | Linha em `advertisers` após elegibilidade; `ensureAdvertiserForUser` para outro usuário |
| Pipeline | `createAdNormalized` + linha em `ads` (title, brand, model, year, `city_id`, `advertiser_id`, status, slug) |
| Público | `ads.service.show(slug)` alinha com o banco |
| Painel | `listOwnedAds` / `getOwnedAd` — dono vê; outro usuário não vê |
| `city_id` | Segundo anúncio com outra cidade (seed ou INSERT no `beforeAll`) |
| Schema opc. | INSERT com `fuel_type` inválido → `23514` se existir CHECK |

`RUN_INTEGRATION_ADS_TESTS=1` é definido por `npm run test:integration:ads` e **força** a suíte mesmo com `SKIP_INTEGRATION_ADS=1` no `.env`.

## Variáveis (padrão, sem adivinhar)

| Variável | Padrão usado pelos scripts |
|----------|----------------------------|
| `TEST_DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5433/carros_na_cidade_test` |
| `DATABASE_URL` | Igual a `TEST_DATABASE_URL` quando os scripts rodam a suíte |

A porta **5433** no host evita conflito com um Postgres de desenvolvimento na **5432**.

`SKIP_INTEGRATION_ADS=1` no `.env` **não desliga** mais o comando dedicado `npm run test:integration:ads` (o script força `SKIP_INTEGRATION_ADS=0` e o teste usa `dotenv` com `override: false`).

## Fluxo recomendado (uma linha)

```bash
npm run test:integration:ads:full
```

Isso executa, em sequência:

1. `integration:db:up` — sobe o container (`docker-compose.test.yml`)
2. `integration:db:wait` — espera o Postgres aceitar conexões
3. `integration:db:prepare` — migrations + cidade mínima se `cities` estiver vazio
4. `test:integration:ads` — Vitest só neste arquivo, com URL e JWT de teste definidos

## Passo a passo (manual)

```bash
npm run integration:db:up
npm run integration:db:wait
npm run integration:db:prepare
npm run test:integration:ads
```

Encerrar o container:

```bash
npm run integration:db:down
```

## CI (GitHub Actions)

No workflow `.github/workflows/ci.yml`, o job **`Integration (ads + Postgres)`** sobe **Postgres 15** como [service container](https://docs.github.com/en/actions/use-containerized-services/creating-postgresql-service-containers) na porta **5432** e define:

- `TEST_DATABASE_URL` / `DATABASE_URL` → `postgresql://postgres:postgres@127.0.0.1:5432/carros_na_cidade_test`

Em seguida: `npm run ci:integration-ads` (equivalente a `integration:db:wait` → `integration:db:prepare` → `test:integration:ads`).

Localmente com Docker na **5433**, continue usando `npm run test:integration:ads:full` ou defina `TEST_DATABASE_URL` explicitamente.

Para espelhar os passos da CI (Postgres já acessível na URL corrente):

```bash
npm run ci:integration-ads
```

## `npm test` vs integração

- `npm test` — usa `vitest run --exclude tests/integration/**` (CI e desenvolvimento sem Docker continuam simples).
- `npm run test:integration:ads` — roda **apenas** a suíte de integração de ads, com Postgres real.

## Falhas comuns

- **`Postgres inacessível` / `ECONNRESET`**: suba o banco (`npm run integration:db:up`), espere (`integration:db:wait`) e rode `integration:db:prepare`.
- **Porta errada**: confira se nada mais usa a **5433** no host ou defina `TEST_DATABASE_URL` explicitamente.

## E2E (Playwright)

Fluxo de browser documentado em **`docs/testing/e2e.md`** (`npm run e2e` na raiz).

## CHECK em `public.ads` (fuel / transmission)

O arquivo `tests/ads/fuel-transmission-contract.test.js` inclui um bloco opcional que consulta CHECKs reais no Postgres. **Não** roda no `npm test` padrão.

- Rodar com banco no ar: `npm run test:pg-contract`
- Variável: `RUN_PG_ADS_CHECK_TESTS=1` (o script acima define isso)
- Desligar mesmo com flag: `SKIP_PG_INTEGRATION_TESTS=1`

## Cidades

`integration:db:prepare` insere uma cidade mínima (`test-city-sp-integration`) se a tabela `cities` estiver vazia. Para dados completos (IBGE), use `npm run seed:cities` com `DATABASE_URL`/`TEST_DATABASE_URL` apontando para o banco de teste.

## Outro host ou porta

Defina antes dos comandos:

```bash
set TEST_DATABASE_URL=postgresql://user:pass@host:5432/meubanco
npm run integration:db:prepare
npm run test:integration:ads
```

(No Linux/macOS use `export` em vez de `set`.)
