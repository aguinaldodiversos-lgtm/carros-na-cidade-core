# `src/controllers` — CÓDIGO MORTO (CommonJS legado)

> **STATUS: CÓDIGO MORTO — zero imports ativos no projeto.**
> Última auditoria: abril 2026.

A API oficial usa handlers em **`src/modules/*`** (ESM), montados em `src/app.js`.

**Nenhum arquivo nesta pasta é importado por código ativo.** Os roteadores CommonJS em `src/routes/*`
que usavam estes controllers foram removidos (exceto `health.js` e `metrics.js`, que são independentes).

## Conteúdo residual

| Subpasta         | Descrição                                         | Substituto oficial                  |
| ---------------- | ------------------------------------------------- | ----------------------------------- |
| `auth/`          | Login, register, forgot/reset password, document  | `src/modules/auth/`                 |
| `analytics/`     | CityRadar, opportunities, alerts                  | `src/modules/public/` (parcial)     |
| `alerts/`        | Create, list, delete alerts                       | Sem substituto ativo (funcionalidade removida) |
| `integrations/`  | `createAdFromApi` (delega a `createAdNormalized`) | `src/modules/ads/` (API direta)     |

## Quando remover

Pode ser removido com segurança — nenhum runtime, teste, ou CI depende deste diretório.
**Não usar em novas features.** Ver `docs/api-routes-inventory.md`.
