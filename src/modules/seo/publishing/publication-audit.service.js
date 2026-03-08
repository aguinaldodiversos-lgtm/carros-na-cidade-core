import * as auditRepository from "./publication-audit.repository.js";
import { validatePublicationPayload } from "./publication-validator.service.js";

export async function auditSinglePublication(publication) {
  const result = validatePublicationPayload(publication);

  await auditRepository.createPublicationAudit({
    publicationId: publication.id,
    clusterPlanId: publication.cluster_plan_id,
    path: publication.path,
    auditStatus: result.ok ? "approved" : "rejected",
    issues: result.issues,
    warnings: result.warnings,
    score: result.score,
  });

  await auditRepository.updatePublicationHealth({
    publicationId: publication.id,
    isIndexable: result.normalized.is_indexable,
    healthStatus: result.normalized.health_status,
  });

  return result;
}

export async function auditPendingPublications(limit = 100) {
  const rows = await auditRepository.listPublicationsNeedingAudit(limit);
  const results = [];

  for (const row of rows) {
    results.push(await auditSinglePublication(row));
  }

  return results;
}
