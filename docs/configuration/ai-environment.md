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

## Sugestão de descrição do anúncio (Fase 4.5)

Task `ad_description_suggestion` — botão "Gerar sugestão" no passo de Revisão do wizard.

| Variável                                        | Efeito                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_AD_DESCRIPTION_SUGGESTION_ENABLED` | Exibe o botão no wizard. **Default `false`.** Entra no _build_ do frontend.        |
| `AD_DESCRIPTION_SUGGESTION_TIMEOUT_MS`          | Deadline do endpoint (default `15000`). Ver nota abaixo.                          |
| `RATE_LIMIT_AD_DESCRIPTION_USER_MAX`            | Gerações por hora **por usuário** (default `10`). É o limite que vale.            |
| `RATE_LIMIT_AD_DESCRIPTION_DRAFT_MAX`           | Gerações por hora **por rascunho** (default `3`). Trava de uso normal.            |

**Para ligar em produção, na ordem:** (1) configurar `AI_LOCAL_URL` ou `OPENAI_API_KEY` + `AI_ENABLED=true` + `AI_MODE` ≠ `disabled` no backend; (2) validar chamando `POST /api/ads/description-suggestion` autenticado; (3) só então setar `NEXT_PUBLIC_AD_DESCRIPTION_SUGGESTION_ENABLED=true` e **rebuildar o frontend**. Invertida, a ordem expõe um botão que falha em todo clique.

**Pré-requisito.** Como qualquer task do orquestrador, precisa de `AI_ENABLED=true`, `AI_MODE` diferente de `disabled` e **um provedor configurado** (`AI_LOCAL_URL` ou `OPENAI_API_KEY`). Sem provedor, o endpoint responde 503 com mensagem genérica e o anunciante escreve a descrição à mão — a publicação nunca é bloqueada por isso.

**Por que o deadline é menor que o do provedor.** `AI_LOCAL_TIMEOUT_MS` (20s) e `OPENAI_TIMEOUT_MS` (25s) são timeouts **por tentativa**, multiplicados por `AI_PROVIDER_ATTEMPTS` e pela cadeia local→premium. O pior caso passa de um minuto, que é inaceitável para um botão. O deadline de 15s limita a espera do cliente; a chamada em voo morre sozinha no timeout do provedor.

**Esta task não vai a cache** (`AiPolicy.shouldCache`). A chave de cache é o hash da ficha do veículo, então dois anúncios iguais receberiam texto idêntico — conteúdo duplicado no próprio domínio, o oposto do objetivo. O custo é contido pelo rate limit.

**O fallback de template é recusado.** `buildFallback("ad_description_suggestion")` devolve `null` de propósito, e o service trata `provider: "template"` como falha. Ver o comentário em `src/modules/ads/description-suggestion/ad-description.service.js`.

**A trava está na geração, não na revisão.** `ad-description.facts.js` só deixa passar o que o anunciante preencheu (allowlist do catálogo de opcionais; preço e cidade nem entram) e `ad-description.guard.js` derruba, frase a frase, qualquer saída que cite item não marcado, preço, FIPE, CTA, urgência ou elogio vazio.

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
