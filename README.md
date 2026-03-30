# Carros na Cidade Core

Portal de anúncios automotivos com simulador de financiamento, tabela FIPE e catálogo por cidade.

## Stack

| Camada     | Tecnologia                                     |
| ---------- | ---------------------------------------------- |
| Backend    | Node.js 20, Express, PostgreSQL, Redis, BullMQ |
| Frontend   | Next.js 14, React 18, Tailwind CSS             |
| Auth       | JWT, jwks-rsa                                  |
| Pagamentos | Mercado Pago                                   |
| Deploy     | Render (frontend)                              |

## Pré-requisitos

- Node.js >=20 <21
- PostgreSQL
- Redis (opcional, para filas/cache)

## Setup

### 1. Clone e instale dependências

```bash
git clone https://github.com/aguinaldodiversos-lgtm/carros-na-cidade-core.git
cd carros-na-cidade-core
npm install
cd frontend && npm install && cd ..
```

### 2. Variáveis de ambiente

Copie o exemplo e ajuste:

```bash
cp .env.example .env
```

Variáveis obrigatórias para o backend:

- `DATABASE_URL` – conexão PostgreSQL
- `JWT_SECRET` / `JWT_REFRESH_SECRET` – autenticação

### 3. Migrações e execução

```bash
# Backend (API + workers opcional)
RUN_MIGRATIONS=true RUN_WORKERS=false npm run dev

# Frontend (em outro terminal)
cd frontend && npm run dev
```

## Scripts

| Comando                             | Descrição                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`                       | Inicia o backend                                                               |
| `npm run workers`                   | Inicia workers (BullMQ)                                                        |
| `npm run lint`                      | ESLint no backend                                                              |
| `npm test`                          | Testes (Vitest; sem `tests/integration`)                                       |
| `npm run test:integration:ads:full` | Postgres (Docker) + migrations + suíte de integração de anúncios               |
| `npm run test:pg-contract`          | Opcional: CHECKs reais em `public.ads` (fuel/transmission), com Postgres no ar |
| `npm run e2e`                       | Playwright no `frontend` (Next + API + DB — ver `docs/testing/e2e.md`)         |
| `npm run smoke`                     | Smoke tests contra a API                                                       |
| `cd frontend && npm run build`      | Build do Next.js                                                               |

## Arquitetura

```
├── src/                    # Backend Express
│   ├── config/             # Configuração centralizada (env)
│   ├── infrastructure/     # DB, Redis, filas
│   ├── modules/            # Domínios (auth, ads, leads, etc.)
│   ├── workers/            # Jobs assíncronos
│   └── index.js
├── frontend/               # Next.js App Router
│   ├── app/
│   ├── components/
│   └── lib/
└── scripts/                # Smoke tests
```

## Escalabilidade

- **Pool PostgreSQL**: configurável via `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`
- **SSL**: em produção, `PG_SSL_REJECT_UNAUTHORIZED=true` (padrão). Use `false` apenas para DBs com certificado auto-assinado.
- **Stateless**: API e workers não mantêm estado em memória; Redis para sessões/filas
- **Health check**: `GET /health` retorna status de DB e Redis

## CI/CD

- **GitHub Actions**: lint e testes em push/PR para `main` e `dev`
- **Render**: deploy automático do frontend a partir de `main`

## Licença

Proprietário – Carros na Cidade
