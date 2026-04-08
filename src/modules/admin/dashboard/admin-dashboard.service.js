import * as repo from "./admin-dashboard.repository.js";

export async function getOverview() {
  return repo.getOverview();
}

export async function getKpis(options) {
  return repo.getKpis(options);
}
