# `src/middlewares` — REMOVIDO

> **STATUS: Todo o código CommonJS legado foi removido em abril 2026 (Sprint 2).**

Os arquivos `apiTokenAuth.js`, `metrics.js`, e `auth.js` foram deletados
após auditoria confirmar zero imports ativos no projeto.

O middleware ativo está em **`src/shared/middlewares/`** (ESM).

| Arquivo removido     | Substituto oficial                                        |
| -------------------- | --------------------------------------------------------- |
| `auth.js`            | `src/shared/middlewares/auth.middleware.js`                |
| `apiTokenAuth.js`    | Sem substituto (funcionalidade não utilizada)              |
| `metrics.js`         | `src/shared/observability/request.metrics.middleware.js`   |

**Este diretório existe apenas para documentar a remoção.**
