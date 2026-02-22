// src/modules/ai/learning.service.js

import { pool } from "../../infrastructure/database/db.js";

export async function recordOutcome(cityId, actionType, expected, actual) {
  const performanceScore = calculatePerformance(expected, actual);

  await pool.query(
    `
    INSERT INTO growth_learning_log
    (city_id, action_type, expected_outcome, actual_outcome, performance_score)
    VALUES ($1,$2,$3,$4,$5)
    `,
    [cityId, actionType, expected, actual, performanceScore]
  );
}

function calculatePerformance(expected, actual) {
  if (!expected || !actual) return 0;

  const expectedValue = expected.metric || 1;
  const actualValue = actual.metric || 0;

  return actualValue / expectedValue;
}
