# Legado isolado (`src/legacy`)

Arquivos aqui **não fazem parte da API HTTP oficial** montada em `src/app.js` e **não devem receber novas features**.

- **Anúncios (canônico):** `src/modules/ads/README.md` — resumo operacional e mapa de arquivos.
- São mantidos apenas como referência histórica ou até remoção planejada.
- Inventário HTTP: `docs/api-routes-inventory.md`.

## Conteúdo

| Pasta           | Descrição                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services-ads/` | CommonJS antigo (`create`, limites, IA de texto). Sem imports ativos; substituído por `modules/ads`. **Não executável** no estado atual (ver `README.md` lá). |
