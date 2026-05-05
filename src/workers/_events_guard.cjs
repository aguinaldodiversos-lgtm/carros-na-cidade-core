/**
 * Guard compartilhado pelos workers do produto Eventos.
 *
 * Por que existe?
 * Os workers `event_*` e `banner_*` são código órfão hoje (nenhum
 * entry-point os importa em produção). Este helper é defesa em
 * profundidade: se alguém ligar um worker manualmente (`node
 * src/workers/event_scheduler.worker.js`) ou se um deploy futuro
 * reintroduzir o orquestrador, a flag `EVENTS_WORKER_ENABLED` (combinada
 * com o master `EVENTS_ENABLED`) impede execução.
 *
 * Comportamento:
 *   - Default off: ausência das flags = no-op + log INFO (não ERROR — o
 *     worker pode estar sendo "iniciado" por engano sem impacto).
 *   - Apenas EVENTS_ENABLED=true E EVENTS_WORKER_ENABLED=true em valor
 *     literal "true" liberam.
 *   - Não chama o pool, não chama OpenAI, não chama banco.
 *
 * Uso (CommonJS, igual aos workers):
 *
 *   const { refuseIfEventsWorkerDisabled } = require("./_events_guard.cjs");
 *   if (refuseIfEventsWorkerDisabled("event_scheduler")) return;
 *   // ...resto do worker...
 *
 * Documentação: docs/runbooks/events-feature-shutdown.md
 */

function isEnabled(key) {
  return process.env[key] === "true"; // strict: só "true" lowercase exato
}

function refuseIfEventsWorkerDisabled(workerName) {
  const master = isEnabled("EVENTS_ENABLED");
  const worker = isEnabled("EVENTS_WORKER_ENABLED");
  if (!master || !worker) {
    // eslint-disable-next-line no-console
    console.log(
      `[events-guard] worker '${workerName}' DESLIGADO (EVENTS_ENABLED=${process.env.EVENTS_ENABLED ?? "<unset>"}, EVENTS_WORKER_ENABLED=${process.env.EVENTS_WORKER_ENABLED ?? "<unset>"}). Produto Evento dormente.`
    );
    return true;
  }
  return false;
}

function refuseIfAiBannerDisabled(workerName) {
  const master = isEnabled("EVENTS_ENABLED");
  const ai = isEnabled("EVENTS_AI_BANNER_ENABLED");
  if (!master || !ai) {
    // eslint-disable-next-line no-console
    console.log(
      `[events-guard] AI banner em '${workerName}' DESLIGADO (EVENTS_AI_BANNER_ENABLED=${process.env.EVENTS_AI_BANNER_ENABLED ?? "<unset>"}). DALL-E NÃO chamada.`
    );
    return true;
  }
  return false;
}

module.exports = {
  refuseIfEventsWorkerDisabled,
  refuseIfAiBannerDisabled,
};
