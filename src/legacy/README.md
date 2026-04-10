# Legado isolado (`src/legacy`) — NÃO USAR

> **STATUS: CÓDIGO MORTO — zero imports ativos no projeto.**
> Última auditoria: abril 2026.

Arquivos aqui **não fazem parte da API HTTP oficial** montada em `src/app.js`,
**não são importados por nenhum módulo ativo**, e **não devem receber novas features**.

- **Anúncios (canônico):** `src/modules/ads/README.md` — resumo operacional e mapa de arquivos.
- São mantidos apenas como referência histórica ou até remoção planejada.
- Inventário HTTP: `docs/api-routes-inventory.md`.

## Conteúdo

| Pasta           | Descrição                                                                                                                                                     | Substituto                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `services-ads/` | CommonJS antigo (`create`, limites, IA de texto). Sem imports ativos; substituído por `modules/ads`. **Não executável** no estado atual (ver `README.md` lá). | `src/modules/ads/` (ESM, montado)      |

## Quando remover

Pode ser removido com segurança a qualquer momento — nenhum runtime ou teste depende deste diretório.
Mantido apenas como referência para quem precisar entender decisões históricas de negócio.
