# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Brazilian automotive marketplace portal (backend Express API + frontend Next.js 14). See `README.md` for the full stack table and architecture.

### Required services

| Service | Port | How to start |
|---|---|---|
| PostgreSQL 15 | 5433 | `sudo docker compose -f docker-compose.test.yml up -d` |
| Backend API (Express) | 4000 | `npm run dev` (from repo root; applies migrations on boot) |
| Frontend (Next.js) | 3000 | `npm run dev` (from `frontend/`) |

### Key gotchas

- **Node.js 20 required.** The `engines` field enforces `>=20 <21`. Use `nvm use 20`.
- **Docker required for PostgreSQL.** The test DB runs via `docker-compose.test.yml` on port **5433** (not 5432).
- **PG_SSL_ENABLED=false** for local dev. The `.env` already has this set correctly.
- **DISABLE_REDIS=true** is set in `.env`; Redis is optional and the app degrades gracefully without it.
- **Frontend needs `.env.local`** with `NEXT_PUBLIC_API_URL=http://127.0.0.1:4000` and `BACKEND_API_URL=http://127.0.0.1:4000` to point to the local backend.
- **Database schema** is consolidated in a single file `src/database/migrations/001_baseline.sql`. New changes go in `002_*.sql`, `003_*.sql`, etc.

### Lint & test commands

| Scope | Command | Notes |
|---|---|---|
| Backend lint | `npm run lint` (root) | |
| Frontend lint | `npm run lint` (`frontend/`) | |
| Backend unit tests | `npm test` (root) | Runs vitest excluding integration tests |
| Frontend unit tests | `npm test` (`frontend/`) | |
| Integration tests | `npm run test:integration:ads:full` (root) | Needs Docker Postgres running |
