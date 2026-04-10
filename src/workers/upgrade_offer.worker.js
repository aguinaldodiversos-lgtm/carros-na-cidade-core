/**
 * FEATURE FLAG: Upgrade offers worker — NOT IMPLEMENTED.
 *
 * This is a deliberate no-op stub. The upgrade offers logic exists in:
 *   - src/modules/growth/growth-brain-pipeline.js (inline)
 *   - src/brain/engines/growth-brain.engine.js (inline)
 *
 * When called from growth_dominance.worker.js, this stub safely does nothing.
 * To activate: implement the queue logic or delegate to the inline implementations above.
 *
 * @see growth_dominance.worker.js (consumer)
 */
export async function enqueueUpgradeOffers() {
  // No-op: upgrade offer queueing not yet wired to dedicated worker.
}
