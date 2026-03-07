import * as moneyPagesRepository from "./money-pages.repository.js";

export async function getTopMoneyPageCandidates(limit = 200) {
  return moneyPagesRepository.listTopMoneyPageCandidates(limit);
}

export async function getMoneyPage(path) {
  return moneyPagesRepository.getMoneyPageByPath(path);
}
