import * as clusterExecutorRepository from "./cluster-executor.repository.js";
import * as contentPublisherService from "./content-publisher.service.js";

export async function executeTopPendingClusters(limit = 100) {
  const clusters = await clusterExecutorRepository.listPendingClusterExecutions(limit);
  const results = [];

  for (const cluster of clusters) {
    await clusterExecutorRepository.markClusterExecutionInProgress(cluster.id);
    const publication = await contentPublisherService.publishClusterContent(cluster);
    results.push(publication);
  }

  return results;
}
