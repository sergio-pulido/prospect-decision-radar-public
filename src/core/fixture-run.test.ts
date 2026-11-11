import assert from "node:assert/strict";
import { test } from "node:test";
import { toFixtureRun } from "./fixture-run";
import type { RunRecord } from "./types";

const enrichment = {
  source: "apollo" as const, mode: "live" as const, domain: "acme.io", matched: true, fetchedAt: "2026-11-10T00:00:00Z",
  fields: { name: "Acme", street_address: "Street 1", raw_address: "Street 1, City", funding_events: [{ type: "Seed" }], estimated_num_employees: 40, organization_headcount_twelve_month_growth: 0.2, latest_funding_stage: "Seed", latest_funding_round_date: "2026-01-01" },
  location: { lat: 1, lng: 2, precision: "address" as const, query: "Street 1, City" },
};
const evidence = {
  mode: "live" as const,
  fields: { funding_last_12_months: "Raised 5M. Sources: [A](https://a.example/1), [P](https://www.linkedin.com/in/someone)", apollo_employees: "About 40 employees (Apollo estimate).", headcount: null },
  sources: [{ name: "A", url: "https://a.example/1", favicon: "https://icons.example/a" }, { name: "P", url: "https://www.linkedin.com/in/someone" }, ...Array.from({ length: 30 }, (_, i) => ({ name: `x${i}`, url: `https://x.example/${i}` }))],
};
const trace = { mode: "live" as const, engine: "jev" as const, state: "secret prompt", questions: {}, answers: { raw: true }, ms: 1, at: "" };
const result = { company: { name: "Acme", website: "acme.io", discoveredBy: "linkup" as const }, stage: "actioned" as const, gate2: [], evidence, enrichment, traces: { gate2: trace }, timings: { research: 6500 } };
const run: RunRecord = {
  id: "r", startedAt: "", finishedAt: "", input: { profileId: "workspace", discovery: "both" }, profile: { id: "workspace", name: "W", reviewThreshold: 0.55 },
  providers: { jev: "live", linkup: "live", cala: "live" }, counts: { discovered: 1, passedGate1: 1, researched: 1, actioned: 1, review: 0, dropped: 0, errors: 0 },
  results: [result], notes: [],
  events: [
    { type: "gate2", index: 0, answers: [], trace, t: 1 },
    { type: "enrichment_done", index: 0, enrichment, ms: 1, t: 2 },
    { type: "research_done", index: 0, evidence, ms: 1, t: 3 },
    { type: "company_done", index: 0, result, t: 4 },
  ],
};

test("a fixture run keeps derived fields only", () => {
  const f = toFixtureRun(run, "example-workspace");
  const json = JSON.stringify(f);
  assert.equal(f.id, "example-workspace");
  for (const banned of ["secret prompt", "\"raw\"", "Street 1", "apollo_employees", "x.example", "linkedin.com/in"]) assert.ok(!json.includes(banned), banned);
  const r = f.results[0]!;
  assert.deepEqual(r.traces?.gate2, { mode: "live", engine: "jev", ms: 1, at: "", state: "", questions: {}, answers: null, omitted: true });
  assert.deepEqual(r.enrichment?.fields, { name: "Acme", estimated_num_employees: 40, latest_funding_round_date: "2026-01-01", latest_funding_stage: "Seed", organization_headcount_twelve_month_growth: 0.2, funding_events: [{ type: "Seed" }] });
  assert.deepEqual(r.evidence?.sources, [{ name: "A", url: "https://a.example/1", favicon: "https://icons.example/a" }], "cited only, never a personal profile");
  assert.equal(r.evidence?.consulted, 32, "the consulted total survives");
  assert.equal(r.enrichment?.location?.query, "");
  assert.equal(f.events?.length, 4, "replayable");
  assert.deepEqual(r.timings, { research: 6500 });
});
