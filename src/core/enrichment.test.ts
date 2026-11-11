import assert from "node:assert/strict";
import { test } from "node:test";
import { enrichmentEvidence, growthPct, knownHeadcount, latestFunding } from "./enrichment";
import type { Enrichment } from "./types";

const base: Enrichment = { source: "apollo", mode: "live", domain: "x.com", matched: true, fetchedAt: "", fields: {} };

test("growthPct reads the observed fraction", () => {
  assert.equal(growthPct(9.333), 933);
  assert.equal(growthPct(0.25), 25);
  assert.equal(growthPct(null), undefined);
});

test("enrichmentEvidence: only for matched organizations", () => {
  assert.deepEqual(enrichmentEvidence({ ...base, matched: false, fields: { estimated_num_employees: 10 } }), {});
  const ev = enrichmentEvidence({ ...base, fields: { estimated_num_employees: 180, organization_headcount_twelve_month_growth: 0.25, latest_funding_stage: "Series A", latest_funding_round_date: "2026-03-01T00:00:00.000+00:00", total_funding_printed: "61.4M" } });
  assert.equal(ev.apollo_employees, "About 180 employees (Apollo estimate).");
  assert.equal(ev.apollo_headcount_growth_12m, "Headcount grew 25% in the last 12 months (Apollo).");
  assert.equal(ev.apollo_latest_funding, "Latest round: Series A, Mar 2026; total raised 61.4M (Apollo).");
  assert.deepEqual(latestFunding({ ...base, fields: {} }), undefined);
});

test("an estimate of 0 employees is unknown, not zero", () => {
  assert.equal(knownHeadcount({ ...base, fields: { estimated_num_employees: 0 } }), undefined);
  assert.equal(enrichmentEvidence({ ...base, fields: { estimated_num_employees: 0 } }).apollo_employees, undefined);
  assert.equal(knownHeadcount({ ...base, fields: { estimated_num_employees: 520 } }), 520);
});
