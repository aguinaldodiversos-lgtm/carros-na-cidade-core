# Mock Backend para E2E

Servidor HTTP leve que simula as respostas do backend Express para testes E2E,
eliminando a dependência de Postgres, Redis e FIPE API externa.

## Uso

### Iniciar o mock backend (terminal separado)

```bash
cd frontend
npm run e2e:mock-backend
```

### Rodar E2E com mock

```bash
cd frontend
npm run test:e2e:mock
```

### Configuração manual

```bash
# Terminal 1: mock backend na porta 4000
MOCK_BACKEND_PORT=4000 npx tsx e2e/mock-backend/server.ts

# Terminal 2: Next.js apontando para o mock
BACKEND_API_URL=http://127.0.0.1:4000 npm run dev

# Terminal 3: Playwright
E2E_BACKEND_API_URL=http://127.0.0.1:4000 npx playwright test
```

## Endpoints mock

| Método | Rota                              | Descrição                      |
| ------ | --------------------------------- | ------------------------------ |
| GET    | `/health`                         | Health check (sempre healthy)  |
| POST   | `/api/auth/login`                 | Login com fixtures             |
| POST   | `/api/auth/register`              | Registro (sempre sucesso)      |
| POST   | `/api/auth/refresh`               | Refresh token                  |
| POST   | `/api/auth/verify-document`       | Verificação CPF (sempre ok)    |
| GET    | `/api/dashboard/me`               | Dashboard fixtures             |
| GET    | `/api/ads/search`                 | Busca com filtro de marca      |
| GET    | `/api/ads/facets`                 | Facets fixtures                |
| POST   | `/api/ads`                        | Publicação (sempre sucesso)    |
| GET    | `/api/plans`                      | Planos fixtures                |
| GET    | `/api/cities/search`              | Busca cidades por nome         |
| GET    | `/api/v1/carros/marcas/...`       | FIPE mock                      |

## Fixtures

Edite `fixtures.ts` para adicionar ou modificar dados de teste.

## Usuários de teste

| Email                      | Senha  | Tipo |
| -------------------------- | ------ | ---- |
| cpf@carrosnacidade.com     | 123456 | PF   |
| cnpj@carrosnacidade.com    | 123456 | PJ   |
