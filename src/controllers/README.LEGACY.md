# `src/controllers` — legado (CommonJS)

A API oficial usa handlers em **`src/modules/*`** (ESM).

**Removido (não montados):** `controllers/ads/*` — duplicava o contrato de `modules/ads`; o código ativo é só o modular.

Arquivos restantes nesta pasta são carregados apenas por roteadores legado em `src/routes/*` **não montados** em `app.js` (`auth`, `analytics`, `alerts`, `integrations`, …). `integrations/createAdFromApi.controller.js` só delega a `createAdNormalized` — não duplicar regra de anúncio aqui.

CommonJS antigo de ads foi isolado em `src/legacy/services-ads/`.

**Não usar** em novas features. Ver `docs/api-routes-inventory.md`.
