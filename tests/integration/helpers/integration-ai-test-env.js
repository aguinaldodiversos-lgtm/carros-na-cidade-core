/**
 * Integração e custo zero na API paga: força gateway local quando `AI_MODE` não foi definido
 * e reinicia o singleton do orquestrador para não herdar estado de outros testes.
 */
import { resetBrainAiStackForTests } from "../../../src/brain/orchestrator/brain-stack.js";

export function applyIntegrationAiLocalDefaults() {
  if (!String(process.env.AI_MODE || "").trim()) {
    process.env.AI_MODE = "local";
  }
  resetBrainAiStackForTests();
}

export { resetBrainAiStackForTests };
