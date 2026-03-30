# Auditoria do projeto (`project-audit.mjs`)

## Execução

Na raiz do monorepo:

```bash
npm run audit:project
```

- **Erros** (ex.: asset em falta, links aninhados reais) fazem o processo sair com código 1.
- **Avisos** (ex.: chaves `process.env` não listadas, rotas opcionais) não falham por defeito; use `--strict` para falhar com qualquer aviso.

## Saída JSON (priorização / backlog)

```bash
npm run audit:project:json > audit-report.json
```

Classifique por `severity`: `error` primeiro, depois `warn`.

## CI

O workflow executa `npm run audit:project` no job **Frontend** após os testes Vitest. Falha apenas se existirem **erros** (não avisos).

## Variáveis de ambiente

Chaves referenciadas no código devem aparecer em `.env.example` (raiz). Foi acrescentado um bloco gerado a partir de `scripts/list-env-keys.mjs`. Ficheiros `*.test.*`, `e2e/` e `tests/` estão excluídos da verificação de `process.env` para reduzir ruído.

## Links aninhados

A deteção de `<Link>` dentro de `<Link>` usa análise por profundidade (não apenas “dois `Link` no mesmo ficheiro”).
