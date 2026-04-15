# Database Schema — Carros na Cidade

## Arquivo único de migração

O schema completo do banco está consolidado em um único arquivo:

```
src/database/migrations/001_baseline.sql
```

Este arquivo é **idempotente** — usa `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` e blocos `DO $$ ... $$` condicionais para FKs. Pode ser executado em banco novo ou existente sem efeitos colaterais.

## Motor de migração

O runner em `src/database/migrate.js`:

1. Adquire advisory lock (`pg_advisory_lock`)
2. Cria `schema_migrations` se não existir (colunas: `id`, `filename`, `checksum`, `executed_at`)
3. Lê arquivos `.sql` de `src/database/migrations/` em ordem lexicográfica
4. Para cada arquivo não aplicado: `BEGIN` → executa SQL → insere registro → `COMMIT`
5. Valida checksum SHA-256 para impedir alteração de migrações já aplicadas
6. Libera advisory lock

## Como rodar

```bash
# No boot (padrão — RUN_MIGRATIONS=true no .env)
npm run dev

# Manualmente
npm run db:migrate
```

## Tabelas

| Tabela | Propósito |
|---|---|
| `cities` | Municípios com slug para rotas territoriais |
| `users` | Contas de usuário (auth, perfil) |
| `advertisers` | Anunciantes vinculados a usuários |
| `ads` | Anúncios de veículos (RLS habilitado) |
| `ad_metrics` | Métricas por anúncio |
| `city_metrics` | Métricas agregadas por cidade |
| `seo_city_metrics` | Métricas SEO por cidade/data |
| `refresh_tokens` | Tokens de refresh JWT |
| `dealer_leads` | Leads de aquisição de lojistas |
| `dealer_lead_interactions` | Interações com dealer leads |
| `dealer_followups` | Follow-ups programados |
| `admin_actions` | Log de ações administrativas |

## Views

| View | Propósito |
|---|---|
| `city_seo_metrics` | Último registro SEO por cidade |

## Novas migrações

Para alterações no schema, crie um novo arquivo em `src/database/migrations/` com numeração sequencial:

```
002_descricao_da_alteracao.sql
```

O runner aplicará automaticamente no próximo boot ou `npm run db:migrate`.
