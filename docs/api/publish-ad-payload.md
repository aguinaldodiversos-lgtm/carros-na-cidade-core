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
| `images`       | string[]       | não         | até 24 URLs; strings persistidas em `ads.images` (JSONB)           |

Valores de veículo aceitam **rótulos** no JSON; o backend normaliza com `ads.storage-normalize.js` e valida contra `ads.canonical.constants.js`.

Cada string em `images` deve ser uma URL utilizável no browser: URL pública do R2 (`R2_PUBLIC_BASE_URL`) ou caminho relativo do portal, ex.: `/api/vehicle-images?key=...` (bucket privado).

## Upload de fotos antes do `POST /api/ads`

1. **`POST /api/ads/upload-images`** (mesmo host da API, `Authorization: Bearer`, corpo `multipart/form-data`, campo **`photos`** repetido).
2. Resposta: `{ success: true, data: { urls: string[], keys: string[] } }`.
3. Usar `data.urls` no array `images` do `POST /api/ads`.

Implementação: `uploadVehicleImages` em `src/infrastructure/storage/r2.service.js` (sem segundo pipeline paralelo).

## BFF Next.js

- Rota: `frontend/app/api/painel/anuncios/route.ts` (FormData → upload R2 → JSON acima).
- Upload: `frontend/lib/painel/upload-ad-images-backend.ts` → `POST /api/ads/upload-images`.
- Em **`NODE_ENV=production`**, falha de upload **não** usa disco local; em desenvolvimento há fallback para `public/uploads/ads`.
- Montagem do JSON: `frontend/lib/painel/create-ad-backend.ts` (`buildBackendCreateAdPayload`).
- Cidade: `city_id` e `city`/`state` são confirmados via `GET /api/public/cities/by-id/:id` antes do `POST` (não confiar só no texto do formulário).

## Referências

- Enums / sinônimos: `src/modules/ads/ads.canonical.constants.js`
- CHECKs no Postgres: `npm run db:check-ads`, `docs/database/ads-schema-contract.sql`
