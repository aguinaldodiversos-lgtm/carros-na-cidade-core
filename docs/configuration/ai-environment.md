# Variáveis de ambiente — IA (orquestrador `src/brain`)

Referência única para o **gateway local** (Ollama/serviço próprio via `AI_LOCAL_URL`) e a **API paga** (OpenAI via `OPENAI_API_KEY`). O orquestrador escolhe a ordem com base em `AI_MODE`, política por estágio e orçamento.

## Modelo mental

| Caminho                        | Uso típico                                                                     | Custo         |
| ------------------------------ | ------------------------------------------------------------------------------ | ------------- |
| **Local** (`AI_LOCAL_URL`)     | Escala, descrições, tarefas rápidas, **testes e integração**                   | Infra própria |
| **Premium** (`OPENAI_API_KEY`) | Tarefas que pedem mais “inteligência” quando a política e o orçamento permitem | Por token     |

## Variáveis principais (`AI_*`)

| Variável                       | Efeito                                                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_ENABLED`                   | `true`/`false` — desliga geração e usa templates (`AI_DISABLED`). Default: `true`.                                                                                                      |
| `AI_MODE`                      | `local` — só gateway local. `premium` — só API paga. `hybrid` — política + orçamento decidem. **Em testes de integração recomenda-se `local`** para não consumir quota nem gerar custo. |
| `AI_LOCAL_URL`                 | URL do gateway local (JSON `{ task, prompt, context }` → resposta). Obrigatório para modo local quando há chamadas reais à IA.                                                          |
| `AI_LOCAL_API_KEY`             | Header opcional `x-ai-key` para o gateway local.                                                                                                                                        |
| `AI_LOCAL_TIMEOUT_MS`          | Timeout HTTP do gateway local (ms). Default: `20000`.                                                                                                                                   |
| `AI_BUDGET_DAILY_USD`          | Em modo `hybrid`, limite best-effort de “gasto” diário (Redis `ai:spend:YYYY-MM-DD`). `0` ou vazio = sem teto explícito na checagem.                                                    |
| `AI_REQUIRE_PREMIUM_FOR`       | Lista CSV de `task` que **sempre** tentam premium quando configurado (ex.: `seo_money_page`).                                                                                           |
| `AI_PROVIDER_ATTEMPTS`         | Tentativas por provedor (`retry.js`).                                                                                                                                                   |
| `AI_PROVIDER_RETRY_DELAY_MS`   | Atraso base entre tentativas.                                                                                                                                                           |
| `AI_CIRCUIT_FAILURE_THRESHOLD` | Falhas antes de abrir circuito por provedor.                                                                                                                                            |
| `AI_CIRCUIT_WINDOW_MS`         | Janela de contagem de falhas.                                                                                                                                                           |
| `AI_CIRCUIT_OPEN_MS`           | Quanto tempo o circuito fica aberto.                                                                                                                                                    |
| `AI_WORKER_CONCURRENCY`        | Concorrência do worker BullMQ `ai-jobs` (`src/workers/ai.worker.js`).                                                                                                                   |

## OpenAI (premium)

| Variável            | Efeito                                            |
| ------------------- | ------------------------------------------------- |
| `OPENAI_API_KEY`    | Chave da API; sem ela o modo premium não executa. |
| `OPENAI_MODEL_TEXT` | Modelo texto (ex.: `gpt-4o-mini`).                |
| `OPENAI_TIMEOUT_MS` | Timeout das chamadas premium.                     |

## Legado / outras flags

| Variável                                          | Onde                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `LOCAL_AI_ENABLED`                                | `src/shared/config/features.js` — feature flag genérica.                    |
| `PREMIUM_AI_ENABLED`                              | Idem.                                                                       |
| `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS` | `src/modules/ai/ai.service.js` (Ollama direto, fora do orquestrador brain). |
| `NEXT_PUBLIC_AI_API_URL`                          | Frontend, se existir integração exposta ao browser.                         |

## Testes e integração (sem custo na API paga)

1. **`AI_MODE=local`** — a política **não** usa orçamento OpenAI; não há chamadas premium enquanto o modo for estritamente `local`.
2. **`npm run test:integration:ads`** — o runner pode definir `AI_MODE=local` se a variável estiver vazia; a suíte chama `resetBrainAiStackForTests()` e `applyIntegrationAiLocalDefaults()` no `beforeAll` (ver `tests/integration/helpers/integration-ai-test-env.js`).
3. **`resetBrainAiStackForTests()`** — liberta o singleton `getBrainAiStack` entre testes para não misturar cache/estado.

Para **ligar** temporariamente a API paga numa integração, defina explicitamente `AI_MODE=hybrid` ou `premium` e `OPENAI_API_KEY` — não é o default.

## Ver também

- Política por estágio: `src/brain/policies/ai-stage.policy.js`
- Orquestrador: `src/brain/orchestrator/ai.orchestrator.js`
- `docs/testing/integration-ads.md` — Postgres + auth na suíte de anúncios

As chaves também aparecem listadas em `.env.example` (auditoria de projeto); a **semântica** está consolidada neste ficheiro.
