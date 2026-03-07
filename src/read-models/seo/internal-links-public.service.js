import * as internalLinksRepository from "./internal-links-public.repository.js";

export async function getInternalLinksByPath(path, limit = 200) {
  return internalLinksRepository.listInternalLinksByPath(path, limit);
}
