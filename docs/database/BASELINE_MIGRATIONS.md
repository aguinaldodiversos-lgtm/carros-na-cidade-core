# Baseline de schema (migrations versionadas)

## Onde ficam

- **Runner:** `src/database/migrate.js` (chamado no boot por `src/index.js`).
- **Arquivos:** `src/database/migrations/*.sql` (ordem lexicográfica: `001_…` … `008_…` e seguintes).
- **Registro:** tabela `schema_migrations` (`id` = nome do arquivo sem `.sql`).

> Existe também `src/infrastructure/database/migrate.js` com convenção diferente; o processo **principal** da API usa **`src/database/migrate.js`**.

## Objetivo desta baseline

Fornecer uma **fonte versionada mínima** das tabelas **cities**, **users**, **advertisers**, **ads** para:

- novos ambientes (CI, dev local, staging vazio);
- documentar o contrato esperado pelo código em `src/modules/ads`, `auth`, `advertisers`, `cities`.

Não substitui inspeção do banco real em produção (`npm run db:check-ads` para CHECKs em `ads`).

## Princípios (não destrutivo)

- `CREATE TABLE IF NOT EXISTS` — bancos que já têm a tabela **não** são recriados.
- `ALTER TABLE … ADD COLUMN IF NOT EXISTS` — só **acrescenta** colunas ausentes.
- `CREATE INDEX IF NOT EXISTS` — índices auxiliares; **sem** `DROP`, **sem** truncates.
- **Sem FKs** entre `users` / `cities` / `advertisers` / `ads` nesta baseline: em deploys antigos o tipo de `users.id` pode ser **UUID** enquanto o app novo assume **BIGINT** em inserts dinâmicos; FK falharia. A integridade continua sendo responsabilidade do aplicativo até alinhar tipos.

## O que veio do código (fonte de verdade parcial)

| Tabela        | Origem principal no repo                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `ads`         | `src/modules/ads/ads.repository.js` (INSERT/UPDATE), `ads.storage-normalize.js`                 |
| `users`       | `src/modules/auth/auth.service.js` (insert dinâmico + `password_hash` ou `password`)            |
| `cities`      | `src/modules/cities/ibge-municipios.service.js` (`INSERT INTO cities (name, state, slug)`)      |
| `advertisers` | `src/modules/advertisers/advertiser.ensure.service.js` (insert dinâmico por colunas existentes) |

## O que foi assumido na baseline

- **Tipos de chave:** `BIGSERIAL` em tabelas novas para `id` — comum em instalações novas; **produção pode usar UUID** ou outros tipos; nesse caso o `CREATE TABLE IF NOT EXISTS` é ignorado e apenas os `ADD COLUMN IF NOT EXISTS` podem aplicar.
- **`users.password_hash`:** preferido pelo auth; coluna `password` incluída como compatibilidade com legado.
- **`ads.slug`:** índice **não único** na baseline para evitar falha da migration se existirem slugs duplicados em dados legados; unicidade pode ser regra de negócio + rotas, não constraint forçada aqui.
- **Colunas opcionais em `ads`:** `latitude`, `longitude`, `search_vector`, `priority`, `gearbox`, `cambio` — referenciadas em filtros ou legado; adicionadas com `IF NOT EXISTS`.
- **CHECKs de enums** (`body_type`, `fuel_type`, `transmission`): documentados em `docs/database/ads-schema-contract.sql` e constantes canônicas; **não** são recriados nesta baseline para não conflitar com CHECKs já existentes no banco.

## Auditoria de CHECKs vs código

- `npm run db:check-ads` — lista CHECKs reais e compara slugs com `ads.canonical.constants.js`.
- Modo estrito (CI): `CHECK_ADS_STRICT=1 npm run db:check-ads` ou `node scripts/print-ads-constraints.js --strict` (exit code 1 se houver divergência ou coluna sem CHECK correspondente).

## Migration 008 — FK `advertisers` → `users` (opcional)

Arquivo: `008_advertisers_user_fk.sql`.

- Declara `advertisers_user_id_fkey` (`user_id` → `users.id`, `ON DELETE RESTRICT`) quando os tipos são compatíveis e não há dados órfãos.
- Se o `ALTER` falhar (tipos legados divergentes, linhas órfãs, etc.), a migration **não aborta**: registra `NOTICE` no log do Postgres e segue.
- Antes de exigir a FK em produção: `node scripts/report-advertiser-integrity.mjs` e corrigir anunciantes sem usuário.

## Próximos passos sugeridos (fora do escopo mínimo)

- Migration dedicada só a CHECKs alinhados a `ads.canonical.constants.js`, após comparar com `db:check-ads`.
- Declarar FKs adicionais (`ads` → `advertisers`, etc.) quando alinhados em todos os ambientes.
