import { collectSearchConsoleData } from "./search-console.collector.js";
import { collectGA4Data } from "./ga4.collector.js";

export async function collectSeoMetricsForToday() {
  const today = new Date().toISOString().split("T")[0];

  await collectSearchConsoleData(today, today);
  await collectGA4Data(today, today);

  return { date: today };
}
