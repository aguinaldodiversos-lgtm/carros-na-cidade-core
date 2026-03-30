/**
 * Compat: módulo legado — toda a lógica vive em `src/brain/`.
 */
import { logger } from "../../shared/logger.js";
import {
  getBrainAiStack,
  getSharedAiOrchestrator,
} from "../../../brain/orchestrator/brain-stack.js";

export function getAiOrchestrator() {
  return getSharedAiOrchestrator(logger);
}

export function getAiQueue() {
  return null;
}

export { getBrainAiStack, getSharedAiOrchestrator };
