# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Brazilian automotive marketplace portal (backend Express API + frontend Next.js 14). See `README.md` for the full stack table and architecture.

### Required services

| Service | Port | How to start |
|---|---|---|
| PostgreSQL 15 | 5433 | `sudo docker compose -f docker-compose.test.yml up -d` |
| Backend API (Express) | 4000 | `RUN_MIGRATIONS=false PG_SSL_ENABLED=false npm run dev` (from repo root) |
| Frontend (Next.js) | 3000 | `npm run dev` (from `frontend/`) |

### Key gotchas

- **Node.js 20 required.** The `engines` field enforces `>=20 <21`. Use `nvm use 20`.
- **Docker required for PostgreSQL.** The test DB runs via `docker-compose.test.yml` on port **5433** (not 5432).
- **Migration 005 has a SQL syntax bug** (`src/database/migrations/005_baseline_dealer_acquisition.sql` line 92 has a stray `FROM dealer_leads`). On a fresh database, apply migrations manually with `sed '92d'` on that file piped to `psql`, or run all other migrations directly via `psql`. Then mark them all as applied in `schema_migrations` and start the backend with `RUN_MIGRATIONS=false`.
- **PG_SSL_ENABLED must be false locally.** The committed `.env` has `PG_SSL_ENABLED=true` which doesn't work with the local Docker Postgres. Override it: `PG_SSL_ENABLED=false npm run dev`.
- **DISABLE_REDIS=true** is set in `.env`; Redis is optional and the app degrades gracefully without it.
- **Frontend needs `.env.local`** with `NEXT_PUBLIC_API_URL=http://127.0.0.1:4000` and `BACKEND_API_URL=http://127.0.0.1:4000` to point to the local backend.

### Lint & test commands

| Scope | Command | Notes |
|---|---|---|
| Backend lint | `npm run lint` (root) | Pre-existing: 4 errors + 210 warnings |
| Frontend lint | `npm run lint` (`frontend/`) | Clean pass |
| Backend unit tests | `npm test` (root) | Runs vitest excluding integration tests; 43 files, 416+ tests |
| Frontend unit tests | `npm test` (`frontend/`) | 24/26 files pass; 2 files have pre-existing failures |
| Integration tests | `npm run test:integration:ads:full` (root) | Needs Docker Postgres running |
