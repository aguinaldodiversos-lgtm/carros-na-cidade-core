/**
 * Stub do pacote `server-only` para vitest.
 *
 * O pacote real (`node_modules/server-only`) é provido pelo Next em runtime
 * de produção e faz import abortar no client bundle. Em vitest, o pacote
 * pode não estar instalado (worktrees parciais) ou Vite tenta resolvê-lo
 * antes de qualquer `vi.mock` ter chance de rodar — ambos os caminhos
 * causam falha de transform.
 *
 * Configurado via alias em `vitest.config.ts`:
 *   resolve.alias: { "server-only": "./test/stubs/server-only.ts" }
 *
 * Como módulo vazio, `import "server-only"` (side-effect-only) vira no-op
 * — exatamente o comportamento desejado em testes Node.
 */
export {};
