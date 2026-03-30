# `services-ads` (legado CommonJS)

**Status:** isolado em `src/legacy/services-ads` — **não importar em código novo.**

| Arquivo             | Substituto / caminho oficial                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `create.service.js` | `src/modules/ads/ads.create.pipeline.service.js` → `createAdNormalized` + `ads.repository.createAd`      |
| `limit.service.js`  | `src/modules/ads/ads.plan-limit.service.js` → `checkAdLimit`                                             |
| `adAI.service.js`   | Não há equivalente montado na API; se reativar IA de anúncio, criar serviço em `src/modules/ads/` (ESM). |

**Execução:** estes arquivos **não** são carregados pelo app e **não** rodam como estão: `require` para `config/db` resolve para módulos ESM e o ecossistema raiz é `"type": "module"`. Mantidos só como **referência de lógica**; não usar em runtime sem reescrever para ESM ou isolar dependências.
