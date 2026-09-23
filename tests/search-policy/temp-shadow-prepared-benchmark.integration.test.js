import { describe, it } from "vitest";
import { withF2Fixture } from "./helpers/f2-fixture.js";
import {
  buildSearchContext,
  buildShadowComparisonQuery,
} from "../../src/modules/ads/search-policy/engine.js";
import { resolveScope } from "../../src/modules/ads/search-policy/scope-resolver.js";
import { SEARCH_POLICY_DEFAULT } from "../../src/modules/ads/search-policy/policy-config.js";

const runs = 12;

function stats(values) {
  const sorted = [...values].sort((a,b)=>a-b);
  const mean = values.reduce((a,b)=>a+b,0)/values.length;
  const p50 = sorted[Math.floor((sorted.length-1)*0.50)];
  const p95 = sorted[Math.floor((sorted.length-1)*0.95)];
  return { mean, p50, p95, min: sorted[0], max: sorted.at(-1) };
}

describe.sequential("TEMP benchmark — shadow prepared statement", () => {
  it("compara client.query(text, values) vs named prepared statement", async () => {
    await withF2Fixture("prepared_probe", async ({ db }) => {
      const client = await db.connect();
      try {
        const rawQuery = {
          city_slug: "braganca-paulista-sp",
          q: "onix",
          sort: "relevance",
          page: "1",
          limit: "50",
        };
        const ctx = await buildSearchContext(rawQuery, {
          db: client,
          policy: SEARCH_POLICY_DEFAULT,
        });
        const scope = await resolveScope(ctx, ctx.policy, {
          db: client,
          cache: false,
          includeDetails: false,
        });
        const comparison = buildShadowComparisonQuery(
          { ...ctx, page: 1, limit: 1 },
          scope
        );

        const unnamed = [];
        for (let i = 0; i < runs; i++) {
          const started = process.hrtime.bigint();
          await client.query(comparison.query, comparison.params);
          unnamed.push(Number(process.hrtime.bigint() - started) / 1e6);
        }

        const name = "shadow_cmp_braganca_onix_relevance";
        const named = [];
        for (let i = 0; i < runs; i++) {
          const started = process.hrtime.bigint();
          await client.query({
            name,
            text: comparison.query,
            values: comparison.params,
          });
          named.push(Number(process.hrtime.bigint() - started) / 1e6);
        }

        const prepared = await client.query(
          `SELECT name, generic_plans, custom_plans, from_sql
             FROM pg_prepared_statements
            WHERE name = $1`,
          [name]
        );

        console.info("[prepared-benchmark]", JSON.stringify({
          unnamed,
          named,
          unnamed_stats: stats(unnamed),
          named_stats: stats(named),
          prepared: prepared.rows,
        }));

        if (prepared.rows.length !== 1) {
          throw new Error("prepared statement não apareceu em pg_prepared_statements");
        }
      } finally {
        client.release();
      }
    });
  }, 300000);
});
