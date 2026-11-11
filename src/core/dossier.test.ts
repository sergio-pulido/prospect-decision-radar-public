import assert from "node:assert/strict";
import { test } from "node:test";
import { couldNotFind, decisionPath, fieldText, firstSentence, groupSources, isPersonalProfile, latestDate, parseCitations, recencyOf, slugOf, whatPushed, whySentence, wouldChange } from "./dossier";
import { expandSpec } from "./profile";
import type { Answer, CompanyResult } from "./types";

const ans = (questionId: string, choice: string, probability: number): Answer => ({ questionId, question: questionId, choice, probability, probabilities: { [choice]: probability } });
const profile = expandSpec({
  id: "w", name: "W", description: "", offer: "space", buyer: "teams", cities: ["Barcelona"], sizeRange: { min: 10, max: 200 }, sectors: [],
  signals: ["funding_recent", "hiring_in_target_cities", "expansion_or_new_office", "leadership_change"],
});

test("citations: markdown links and bare URLs become numbered chips; one number per URL", () => {
  const p = parseCitations("Raised €10M in Nov 2026. Sources: [EU-Startups](https://www.eu-startups.com/a), [Tech.eu](https://tech.eu/b), [EU-Startups](https://www.eu-startups.com/a). See https://news.example/c.", [
    { name: "x", url: "https://tech.eu/b", favicon: "https://icons.example/t" },
  ]);
  assert.deepEqual(p.citations.map((c) => [c.n, c.domain]), [[1, "eu-startups.com"], [2, "tech.eu"], [3, "news.example"]]);
  assert.equal(p.citations[1]!.favicon, "https://icons.example/t");
  assert.deepEqual(p.segments.filter((s) => "cite" in s).map((s) => ("cite" in s ? s.cite : 0)), [1, 2, 1, 3]);
  assert.ok(!p.segments.some((s) => "text" in s && /Sources:/.test(s.text)), "the Sources: label is dropped");
});

test("personal profiles are hidden everywhere", () => {
  for (const u of ["https://profiles.crustdata.com/person/x", "https://profiles.example.com/jane-doe", "https://www.linkedin.com/in/someone", "https://x.com/people/jane", "https://site.io/person/1", "https://a.io/profile/9", "https://rocketreach.co/acme", "https://www.zoominfo.com/p/x/1"]) assert.ok(isPersonalProfile(u), u);
  for (const u of ["https://profiles.crustdata.com/company/acme", "https://www.linkedin.com/company/acme", "https://tech.eu/2026/acme", "https://acme.io/careers"]) assert.ok(!isPersonalProfile(u), u);
  const p = parseCitations("New CEO. Sources: [LinkedIn](https://www.linkedin.com/in/someone), [Tech.eu](https://tech.eu/b)");
  assert.equal(p.hidden, 1);
  assert.deepEqual(p.citations.map((c) => c.domain), ["tech.eu"]);
});

test("sources: grouped by domain, cited marked, counts, personal ones hidden and counted", () => {
  const s = groupSources(
    [
      { name: "a1", url: "https://a.example/1" }, { name: "a2", url: "https://a.example/2" }, { name: "b", url: "https://b.example/1" },
      { name: "p", url: "https://www.linkedin.com/in/x" },
    ],
    { f: "Text [A](https://a.example/2) and https://c.example/9" },
  );
  assert.deepEqual([s.consulted, s.cited, s.domains, s.hiddenPersonal], [5, 2, 3, 1]);
  assert.equal(s.groups[0]!.domain, "a.example");
  assert.deepEqual(s.groups[0]!.items.map((i) => [i.url, i.cited]), [["https://a.example/2", true], ["https://a.example/1", false]]);
  assert.equal(groupSources([], {}, 89).consulted, 89, "a saved example keeps the consulted total");
});

test("the leadership field never shows a name", () => {
  const t = fieldText("leadership_change", "Jane Doe was appointed CEO in May 2026. Sources: [Tech.eu](https://tech.eu/b)")!;
  assert.doesNotMatch(t, /Jane|Doe/);
  assert.match(t, /^Leadership change reported\. Sources: \[Tech\.eu\]\(https:\/\/tech\.eu\/b\)$/);
  assert.equal(fieldText("hiring_in_target_cities", "Hiring 8."), "Hiring 8.");
  assert.equal(fieldText("leadership_change", "Jane Doe stays CEO.", "no"), "No leadership change reported.");
});

test("dates and recency", () => {
  assert.equal(latestDate("Seed on June 19, 2023; Series A in March 2026 (2025-11-01)."), "2026-03-01");
  assert.equal(latestDate("Announced 5 Nov 2026."), "2026-11-05");
  assert.equal(latestDate("no date"), undefined);
  assert.deepEqual(recencyOf("funding_recent", "Raised in Jun 2026.", "2026-11-10"), { label: "Jun 2026", within: true, months: 12 });
  assert.equal(recencyOf("funding_recent", "Raised in Jun 2023.", "2026-11-10")?.within, false);
  assert.equal(recencyOf("hiring_in_target_cities", "Jun 2026", "2026-11-10"), undefined, "no recency rule");
});

test("first sentence without links", () => {
  assert.equal(firstSentence("Hybrid in Barcelona; three days. Sources: [A](https://a.example)."), "Hybrid in Barcelona; three days.");
});

const call: CompanyResult = {
  company: { name: "Acme", city: "Barcelona", employees: 80, discoveredBy: "linkup", foundBy: ["linkup", "cala"] },
  stage: "actioned",
  gate1: ans("profile_fit", "fit", 0.93),
  evidence: { mode: "live", sources: [{ name: "a", url: "https://a.example" }], consulted: 40, fields: { funding_last_12_months: "Raised a Series A in Jun 2026. Sources: [A](https://a.example)", hiring_in_target_cities: "12 roles open in Barcelona." } },
  gate2: [ans("funding_recent", "yes", 0.97), ans("hiring_in_target_cities", "yes", 0.9), ans("expansion_or_new_office", "unknown", 0.8), ans("leadership_change", "no", 0.7), ans("headcount_in_range", "yes", 1)],
  action: ans("next_action", "call_now", 0.92),
  traces: { gate1: { mode: "live", engine: "jev", state: "", questions: {}, answers: null, ms: 200, at: "" }, gate2: { mode: "live", engine: "jev", state: "", questions: {}, answers: null, ms: 210, at: "" }, action: { mode: "live", engine: "jev", state: "", questions: {}, answers: null, ms: 190, at: "" } },
  timings: { research: 6500 },
};

test("what pushed it: positives first for a call, with evidence sentences", () => {
  const d = whatPushed(profile, call, 0.55, "Barcelona");
  assert.deepEqual(d.map((x) => [x.kind, x.text]), [["for", "Raised funding recently"], ["for", "Hiring in Barcelona"], ["against", "No leadership change"]]);
  assert.equal(d[0]!.evidence, "Raised a Series A in Jun 2026.");
});

test("what pushed it: a size blocker leads for a Not now company", () => {
  const big = { ...call, company: { ...call.company, employees: 760, employeesSource: "apollo" as const }, action: ans("next_action", "discard", 0.82) };
  const d = whatPushed(profile, big, 0.55, "Barcelona");
  assert.deepEqual(d[0], { kind: "against", text: "Bigger than your range", evidence: "760 people · Apollo", via: "Apollo" });
  assert.equal(whySentence(profile, big, 0.55, "Barcelona"), "Skip: is bigger than your range (760 people) and no leadership change.");
});

test("couldn't find, and what would change it (unknown buying signals, in profile order)", () => {
  assert.deepEqual(couldNotFind(profile, call, "Barcelona"), ["Expansion unknown"]);
  assert.deepEqual(wouldChange(profile, call), ["Expanding or opening an office"]);
});

test("one sentence why", () => {
  assert.equal(whySentence(profile, call, 0.55, "Barcelona"), "Call this week: raised funding recently and is hiring in Barcelona.");
  assert.equal(whySentence(profile, { ...call, action: ans("next_action", "nurture", 0.4) }, 0.55, "Barcelona"), "Check yourself: the AI leans to keep warm but is only 40% sure.");
  assert.equal(whySentence(profile, { ...call, stage: "dropped_gate1" }, 0.55, "Barcelona"), "Not checked further: it does not fit your profile.");
});

test("decision path with real durations and where it stopped", () => {
  const p = decisionPath(call, 0.55);
  assert.deepEqual(p.map((s) => [s.title, s.detail, s.ms, s.state]), [
    ["Found", "Linkup + Cala", undefined, "done"],
    ["Fits your profile", "93%", 200, "done"],
    ["Researched", "40 sources", 6500, "done"],
    ["Call this week", "92%", 400, "done"],
  ]);
  const review = decisionPath({ ...call, stage: "review", action: ans("next_action", "send_email", 0.42) }, 0.55);
  assert.deepEqual([review[3]!.title, review[3]!.state, review[3]!.why], ["Check yourself", "review", "42% is below your 55% bar"]);
  const failed = decisionPath({ ...call, stage: "passed_gate1", evidence: undefined, action: undefined, error: "timeout" }, 0.55);
  assert.deepEqual([failed[2]!.state, failed[2]!.why], ["stopped", "The research did not come back"]);
});

test("slugs for deep links", () => {
  assert.equal(slugOf("Compra Rápida"), "compra-rapida");
  assert.equal(slugOf("V360"), "v360");
});

test("personal-profile links are stripped from research text", async () => {
  const { stripPersonalLinks } = await import("./dossier");
  assert.equal(stripPersonalLinks("New CEO. Sources: [A](https://tech.eu/a), [P](https://www.linkedin.com/in/x)."), "New CEO. Sources: [A](https://tech.eu/a).");
  assert.equal(stripPersonalLinks("See https://www.linkedin.com/in/x and [B](https://b.example)."), "See and [B](https://b.example).");
});

test("escaped source titles are decoded", async () => {
  const { decodeEntities } = await import("./dossier");
  assert.equal(decodeEntities("Revenue &amp; Financial Statements &quot;2026&quot;"), 'Revenue & Financial Statements "2026"');
});

test("an unclear fit is labelled as such", () => {
  const p = decisionPath({ ...call, gate1: ans("profile_fit", "unknown", 0.39) }, 0.55);
  assert.equal(p[1]!.title, "Fit unclear, checked anyway");
});

test("drafts carry sentences, never markdown links", async () => {
  const { cleanDraft } = await import("./dossier");
  assert.equal(cleanDraft("Why now:\n- Raised 5M. Sources: [A](https://a.example/1), [B](https://b.example).\nOpening line"), "Why now:\n- Raised 5M.\nOpening line");
});
