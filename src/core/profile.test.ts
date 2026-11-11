import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { buildDraft } from "./draft";
import { listProfiles } from "./io";
import { applyOverride, parseOverride } from "./override";
import { expandProfile, expandSpec, type ProfileSpec } from "./profile";
import { gate2State } from "./state";
import type { Profile } from "./types";

const spec: ProfileSpec = {
  id: "t", name: "Test", description: "d", offer: "test widgets", buyer: "companies that need widgets",
  cities: ["Barcelona"], sizeRange: { min: 20, max: 300 }, sectors: ["software"],
  signals: ["funding_recent", "hiring_in_target_cities", "headcount_growing_12m"],
};

test("research fields, gate-2 questions and action derive from the signals", () => {
  const p = expandSpec(spec);
  assert.deepEqual(p.research.fields.map((f) => f.id), ["funding_last_12_months", "hiring_in_target_cities", "headcount"], "company-data signals need no research field");
  assert.deepEqual(p.gate2.map((q) => q.id), ["funding_recent", "hiring_in_target_cities", "headcount_growing_12m", "headcount_in_range"]);
  assert.match(p.gate2.at(-1)!.instructions, /between 20 and 300 employees/);
  assert.match(p.research.queryTemplate, /Open roles or hiring activity in Barcelona/);
  assert.match(p.action.instructions, /The seller offers test widgets/);
  assert.equal(p.reviewThreshold, 0.55);
  assert.equal(p.actionLabels?.call_now, "Call this week");
  assert.ok(p.draftTemplates.send_email?.includes("{offer}"));
});

test("unknown signal ids are dropped", () => {
  const p = expandSpec({ ...spec, signals: ["funding_recent", "made_up" as never] });
  assert.deepEqual(p.signals, ["funding_recent"]);
});

test("the Jev state names the offer, buyer, signals and the reference date", () => {
  const p = expandSpec(spec);
  const st = gate2State({ name: "X", discoveredBy: "manual" }, p, { mode: "live", fields: {}, sources: [] });
  assert.match(st, /Seller offer: test widgets/);
  assert.match(st, /Typical buyer: companies that need widgets/);
  assert.match(st, /Buying signals the seller looks for: Raised funding recently; Hiring in your cities; Team grew this year/);
  assert.match(st, /Reference date: \d{4}-\d{2}-\d{2}/);
});

test("drafts fill {offer} {company} {city} {signals}", () => {
  const p = expandSpec(spec);
  const d = buildDraft(p, "send_email", { name: "Acme", city: "Barcelona", discoveredBy: "manual" }, { mode: "live", sources: [], fields: { funding_last_12_months: "Raised 5M in May." } }, [
    { questionId: "funding_recent", question: "", choice: "yes", probability: 0.9, probabilities: {} },
  ])!;
  assert.match(d, /Subject: Acme in Barcelona/);
  assert.match(d, /- Raised 5M in May\./);
  assert.match(d, /We offer test widgets\./);
  assert.doesNotMatch(d, /\{/);
});

test("an old explicit profile still loads unchanged", () => {
  const legacy = JSON.parse(readFileSync("src/core/testdata/legacy-explicit-profile.json", "utf8")) as Profile;
  const p = expandProfile(legacy);
  assert.equal(p, legacy, "passes through as-is");
  assert.equal(p.gate2.length, 8);
  // And the same rules as before apply to it: run-only edits change cities, size and sectors only.
  const o = applyOverride(p, { cities: ["Barcelona"], offer: "ignored" });
  assert.equal(o.offer, legacy.offer);
  assert.deepEqual(o.cities, ["Barcelona"]);
});

test("run-only edits re-derive a signal profile and add known city coordinates", () => {
  const p = expandSpec(spec);
  const o = parseOverride({ offer: "  better widgets ", signals: ["leadership_change", "bogus"], cities: ["Madrid"], sizeRange: { min: 50, max: 80 } })!;
  assert.deepEqual(o.signals, ["leadership_change"]);
  const q = applyOverride(p, o);
  assert.deepEqual(q.gate2.map((x) => x.id), ["leadership_change", "headcount_in_range"]);
  assert.match(q.gate2[1]!.instructions, /between 50 and 80/);
  assert.match(q.action.instructions, /better widgets/);
  assert.deepEqual(q.cityCoordinates, { Madrid: { lat: 40.4168, lng: -3.7038 } });
  assert.equal(p.offer, "test widgets", "original untouched");
});

test("every preset file loads, in picker order, with neutral action labels", async () => {
  const files = readdirSync("profiles").filter((f) => f.endsWith(".json"));
  assert.deepEqual(files.sort(), ["b2b-software-smb.json", "custom.json", "outdoor-advertising-media.json", "recruiting-services.json", "workspace.json"]);
  const all = await listProfiles();
  assert.deepEqual(all.slice(0, 5).map((p) => p.id), ["workspace", "b2b-software-smb", "recruiting-services", "outdoor-advertising-media", "custom"]);
  for (const p of all.slice(0, 5)) {
    assert.ok(p.signals?.length, p.id);
    assert.deepEqual(Object.keys(p.actionLabels ?? {}), ["call_now", "send_email", "linkedin_touch", "nurture", "discard"]);
    for (const c of p.cities) assert.ok(p.cityCoordinates?.[c], `${p.id}: ${c} has coordinates`);
  }
});
