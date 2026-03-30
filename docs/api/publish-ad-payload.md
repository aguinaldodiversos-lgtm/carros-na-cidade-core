# Contrato oficial — criar anúncio (`POST /api/ads`)

Fonte de verdade no backend: `src/modules/ads/ads.validators.js` (`CreateAdSchema` / `validateCreateAdPayload`).

## Autenticação

- Header: `Authorization: Bearer <access_token>`
- O backend resolve **anunciante** (`advertiser_id`) pela sessão — **não** envie `advertiser_id` no corpo.

## Corpo JSON (snake_case)

| Campo          | Tipo           | Obrigatório | Notas                                                              |
| -------------- | -------------- | ----------- | ------------------------------------------------------------------ |
| `title`        | string         | sim         | mín. 3 caracteres                                                  |
| `description`  | string \| null | não         |                                                                    |
| `price`        | number         | sim         | > 0                                                                |
| `city_id`      | number         | sim         | inteiro positivo; deve existir em `cities`                         |
| `city`         | string         | sim         | mín. 2 caracteres (nome do município)                              |
| `state`        | string         | sim         | UF, 2 caracteres                                                   |
| `brand`        | string         | sim         |                                                                    |
| `model`        | string         | sim         |                                                                    |
| `year`         | number         | sim         | 1900–2100                                                          |
| `mileage`      | number         | sim         | ≥ 0 (default 0 no schema)                                          |
| `category`     | string \| null | não         | livre; BFF do painel envia `particular` / `lojista` conforme conta |
| `body_type`    | string \| null | não         | Pré-processamento + enum canônico (`ads.vehicle-fields.zod.js`)    |
| `fuel_type`    | string \| null | não         | idem                                                               |
| `transmission` | string \| null | não         | idem                                                               |
| `below_fipe`   | boolean        | não         | default `false`                                                    |

Valores de veículo aceitam **rótulos** no JSON; o backend normaliza com `ads.storage-normalize.js` e valida contra `ads.canonical.constants.js`.

## BFF Next.js

- Rota: `frontend/app/api/painel/anuncios/route.ts` (FormData → JSON acima).
- Montagem do JSON: `frontend/lib/painel/create-ad-backend.ts` (`buildBackendCreateAdPayload`).
- Cidade: `city_id` e `city`/`state` são confirmados via `GET /api/public/cities/by-id/:id` antes do `POST` (não confiar só no texto do formulário).

## Referências

- Enums / sinônimos: `src/modules/ads/ads.canonical.constants.js`
- CHECKs no Postgres: `npm run db:check-ads`, `docs/database/ads-schema-contract.sql`
