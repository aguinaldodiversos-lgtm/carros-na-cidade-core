# Ferramentas e higiene contínua (itens 23–25)

Referência rápida para alinhar editores, formatação, dependências e CI.

## 23 — Editor e finais de linha

| Ficheiro                                 | Função                                                 |
| ---------------------------------------- | ------------------------------------------------------ |
| [`.editorconfig`](../../.editorconfig)   | Indentação (2 espaços), UTF-8, LF, newline final.      |
| [`.gitattributes`](../../.gitattributes) | `text=auto eol=lf`; `.bat`/`.cmd` com CRLF no Windows. |

Recomenda-se extensão **EditorConfig** no VS Code / Cursor.

## 24 — Prettier (formatação)

| Comando                | Uso                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `npm run format`       | Aplica Prettier em todo o repositório (respeita [`.prettierignore`](../../.prettierignore)). |
| `npm run format:check` | Verifica sem alterar ficheiros (usado na CI).                                                |

Configuração: [`prettier.config.mjs`](../../prettier.config.mjs).

Antes de um PR, execute `npm run format` na raiz (inclui `frontend/`). O ESLint continua responsável por regras de código; Prettier cuida da formatação mecânica.

## 25 — Dependências e auditoria

| Mecanismo                                                | Função                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`.github/dependabot.yml`](../../.github/dependabot.yml) | PRs semanais de atualização npm na **raiz** e em **`frontend/`**.                     |
| `npm run audit:deps`                                     | `npm audit --audit-level=high` na raiz (executar localmente ou em pipeline opcional). |

Revisar PRs do Dependabot com a suíte habitual (`npm test`, `npm run lint`, `npm run format:check`, build do frontend).

## CI

O workflow `.github/workflows/ci.yml` inclui **`npm run format:check`** no job do backend (valida o monorepo inteiro, incluindo `frontend/`).
