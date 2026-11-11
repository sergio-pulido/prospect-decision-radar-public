import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureAnswer, isRecent, questionOf, researchFieldOf, signalById, SIGNALS, SIGNAL_IDS } from "./signals";

test("the library has the eight signals, each complete", () => {
  assert.deepEqual([...SIGNAL_IDS], [
    "funding_recent", "hiring_in_target_cities", "expansion_or_new_office", "new_product_or_market",
    "headcount_growing_12m", "work_policy_hybrid", "leadership_change", "regulatory_or_compliance_trigger",
  ]);
  for (const s of SIGNALS) {
    assert.ok(s.label && s.question && s.yes && s.no, s.id);
    assert.ok(s.tick.yes && s.tick.no && s.tick.unknown, s.id);
    assert.doesNotThrow(() => new RegExp(s.fixtureMatch.yes, "i"), s.id);
    assert.doesNotThrow(() => new RegExp(s.fixtureMatch.no, "i"), s.id);
  }
  assert.equal(signalById("funding_recent")?.recencyMonths, 12);
  assert.equal(signalById("headcount_growing_12m")?.companyData, true);
  assert.equal(signalById("nope"), undefined);
});

test("research field fills {cities}", () => {
  const f = researchFieldOf(signalById("hiring_in_target_cities")!, ["Barcelona", "Madrid"]);
  assert.deepEqual(f, { id: "hiring_in_target_cities", description: "Open roles or hiring activity in Barcelona and Madrid." });
});

test("question: yes / no / unknown, yes positive, plain ticks", () => {
  const q = questionOf(signalById("leadership_change")!);
  assert.equal(q.id, "leadership_change");
  assert.equal(q.evidenceField, "leadership_change");
  assert.deepEqual(Object.keys(q.options), ["yes", "no", "unknown"]);
  assert.deepEqual(q.positive, ["yes"]);
  assert.equal(q.plain?.yes, "New leadership this year");
});

test("leadership change never asks for names", () => {
  assert.match(signalById("leadership_change")!.field.description, /never the person's name/);
});

test("recency: funding counts only within 12 months", () => {
  const ref = "2026-11-10T00:00:00Z";
  assert.equal(isRecent("2026-03-01", ref), true);
  assert.equal(isRecent("2025-11-20", ref), true);
  assert.equal(isRecent("2025-10-01", ref), false);
  assert.equal(isRecent("2021-04-01", ref), false);
  assert.equal(isRecent("2027-01-01", ref), true, "announced future date counts");
  assert.equal(isRecent(null, ref), false);
  assert.equal(isRecent("garbage", ref), false);
});

test("fixture answers follow the patterns", () => {
  const funding = signalById("funding_recent")!;
  assert.equal(fixtureAnswer(funding, "Raised a 6M Series A in March."), "yes");
  assert.equal(fixtureAnswer(funding, "No recent funding; bootstrapped."), "no");
  assert.equal(fixtureAnswer(funding, "Profitable."), "unknown");
  assert.equal(fixtureAnswer(funding, null), "unknown");
  assert.equal(fixtureAnswer(signalById("work_policy_hybrid")!, "Fully remote company."), "no");
  assert.equal(fixtureAnswer(signalById("work_policy_hybrid")!, "Hybrid, three days in the office."), "yes");
});
