# `src/controllers` — REMOVIDO

> **STATUS: Todo o código CommonJS legado foi removido em abril 2026 (Sprint 2).**

Os 13 controller files (auth, analytics, alerts, integrations) foram deletados
após auditoria confirmar zero imports ativos no projeto.

A API oficial usa handlers em **`src/modules/*`** (ESM), montados em `src/app.js`.

**Este diretório existe apenas para documentar a remoção.**
Ver `docs/api-routes-inventory.md` para inventário atual.
