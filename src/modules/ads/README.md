# Módulo `ads` — caminho oficial (API HTTP)

**Todas as alterações de listagem, criação, edição, eventos e cache de anúncios** devem partir deste diretório (`src/modules/ads/`), montado em `src/app.js` sob `/api/ads` e rotas de evento associadas.

## Resumo operacional (fonte única para o time)

1. **Anúncios em produção** passam só por **`src/modules/ads/`** e pela montagem em **`src/app.js`** (`/api/ads`, eventos em `ads.events.routes.js` / `events.routes.js`).
2. **Integrações HTTP** para criar anúncio via parceiro: **nenhuma rota está montada** hoje. Existem dois desenhos candidatos documentados em **`src/modules/integrations/README.md`** — não adicionar um terceiro caminho sem fechar esse desenho e atualizar este doc + `docs/api-routes-inventory.md`.

## Mapa rápido

| Responsabilidade                                         | Arquivo(s)                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Rotas HTTP (`GET/POST/PUT/DELETE`)                       | `ads.routes.js` → `ads.controller.js`                                                                                     |
| Fachada de serviço (`create`, `list`, …)                 | `ads.service.js`                                                                                                          |
| Pipeline de criação (validação → elegibilidade → INSERT) | `ads.create.pipeline.service.js`, `ads.publish.eligibility.service.js`, `ads.persistence.service.js`, `ads.repository.js` |
| Edição / remoção (painel)                                | `ads.panel.service.js`                                                                                                    |
| Busca pública / detalhe                                  | `ads.public.service.js`                                                                                                   |
| Eventos (`ad_events`) — **única implementação**          | `ad-events.ingest.js`                                                                                                     |
| Dois URLs, **mesmo handler**                             | `ads.events.routes.js` (`POST /api/ads/event`) e `events.routes.js` (`POST /api/events`) — não duplicar lógica            |
| Logs de falha de publicação                              | `ads.publish-flow.log.js`                                                                                                 |
| Autocomplete                                             | `autocomplete/*`                                                                                                          |
| Filtros / facets                                         | `filters/*`, `facets.service.js`                                                                                          |

## Não fazer

- Não recriar contratos em `src/controllers/ads` (removido) nem em `src/services/ads` (legado isolado — `src/services/ads/README.LEGACY.md`).
- Não estender `src/routes/integrations` para anúncios sem alinhar com `docs/api-routes-inventory.md`.

Inventário completo: `docs/api-routes-inventory.md`.
