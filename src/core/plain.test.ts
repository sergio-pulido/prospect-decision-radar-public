import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { reviewVerdict, sizeNote } from "./plain";
import { bucketOf, cardState, cardTicks, companyDataTicks, confidenceOf, evidenceTicks, firstUrl, progressOf, reviewReason } from "./plain";
import type { Answer, Profile } from "./types";

const profile = JSON.parse(readFileSync("src/core/testdata/legacy-explicit-profile.json", "utf8")) as Profile;
const ans = (questionId: string, choice: string, probability: number, probabilities: Record<string, number> = { [choice]: probability }): Answer => ({
  questionId, question: questionId, choice, probability, probabilities,
});

test("bucketOf: thresholds route to check, labels to plain buckets", () => {
  assert.equal(bucketOf(ans("next_action", "call_now", 0.9), 0.55), "call");
  assert.equal(bucketOf(ans("next_action", "send_email", 0.7), 0.55), "email");
  assert.equal(bucketOf(ans("next_action", "linkedin_touch", 0.7), 0.55), "email");
  assert.equal(bucketOf(ans("next_action", "nurture", 0.9), 0.55), "later");
  assert.equal(bucketOf(ans("next_action", "discard", 0.9), 0.55), "later");
  assert.equal(bucketOf(ans("next_action", "call_now", 0.4), 0.55), "check");
  assert.equal(bucketOf(undefined, 0.55), "check");
  assert.equal(bucketOf(ans("next_action", "something_new", 0.9), 0.55), "later");
});

test("confidenceOf: 80 / 55 boundaries", () => {
  assert.deepEqual(confidenceOf(0.8), { word: "Very sure", pct: 80 });
  assert.deepEqual(confidenceOf(0.79), { word: "Fairly sure", pct: 79 });
  assert.deepEqual(confidenceOf(0.55), { word: "Fairly sure", pct: 55 });
  assert.deepEqual(confidenceOf(0.54), { word: "Not sure: please check", pct: 54 });
});

test("evidenceTicks: positives first with source, then unknowns; plain words; max 3", () => {
  const answers = [
    ans("funding_recent", "yes", 0.95),
    ans("hiring_target_city", "yes", 0.9),
    ans("office_situation", "unknown", 0.8),
    ans("work_policy", "fully_remote", 0.7),
    ans("growing", "yes", 0.3),
  ];
  const ev = { mode: "live" as const, sources: [], fields: { funding_last_12_months: "Raised €10M. Sources: [TechCrunch](https://tc.example/a)", hiring_in_target_cities: "12 roles open" } };
  const t = evidenceTicks(profile, answers, ev, "Barcelona");
  assert.equal(t.length, 3);
  assert.deepEqual(t[0], { kind: "yes", text: "Raised funding recently", questionId: "funding_recent", source: "https://tc.example/a" });
  assert.deepEqual(t[1], { kind: "yes", text: "Hiring in Barcelona", questionId: "hiring_target_city" });
  assert.deepEqual(t[2], { kind: "unknown", text: "Office situation unknown", questionId: "office_situation" });
});

test("firstUrl: markdown link, bare url, none", () => {
  assert.equal(firstUrl("x [a](https://a.example/1) y"), "https://a.example/1");
  assert.equal(firstUrl("see https://b.example/2."), "https://b.example/2.");
  assert.equal(firstUrl(null), undefined);
});

test("reviewReason: plain sentence from stored answers", () => {
  const r = {
    action: ans("next_action", "linkedin_touch", 0.4, { linkedin_touch: 0.4, send_email: 0.35, nurture: 0.25 }),
    gate2: [ans("funding_recent", "unknown", 0.8), ans("growing", "yes", 0.9)],
  };
  assert.equal(reviewReason(r, 0.55), "Light touch was only 40% sure (your bar is 55%), and 1 of 2 facts could not be confirmed. Next best: Send an email.");
});

test("cardState and progressOf", () => {
  assert.equal(cardState({ stage: "discovered" }, false), "checking");
  assert.equal(cardState({ stage: "passed_gate1", gate1: ans("profile_fit", "fit", 1) }, false), "reading");
  assert.equal(cardState({ stage: "researched", gate1: ans("profile_fit", "fit", 1), evidence: { mode: "live", fields: {}, sources: [] } }, false), "deciding");
  assert.equal(cardState({ stage: "review" }, false), "decided");
  assert.equal(cardState({ stage: "dropped_gate1" }, false), "no_fit");
  assert.equal(cardState({ stage: "passed_gate1", error: "cap" }, true), "failed");
  assert.deepEqual(progressOf([{ stage: "actioned", gate1: ans("p", "fit", 1) }, { stage: "dropped_gate1", gate1: ans("p", "no_fit", 1) }, { stage: "discovered" }]), { found: 3, checked: 2, decided: 2 });
});

test("company-data ticks come first and replace the same topic from answers", () => {
  const e = { source: "apollo" as const, mode: "live" as const, domain: "x.com", matched: true, fetchedAt: "", fields: { organization_headcount_twelve_month_growth: 0.25, latest_funding_stage: "Series A", latest_funding_round_date: "2026-03-10T00:00:00.000+00:00" } };
  assert.deepEqual(companyDataTicks(e).map((t) => t.text), ["Team grew 25% in a year", "Raised Series A, Mar 2026"]);
  const t = cardTicks(profile, { gate2: [ans("funding_recent", "yes", 0.9), ans("hiring_target_city", "yes", 0.9)], evidence: undefined, enrichment: e }, "Barcelona");
  assert.deepEqual(t.map((x) => x.text), ["Team grew 25% in a year", "Raised Series A, Mar 2026", "Hiring in Barcelona"]);
  assert.deepEqual(companyDataTicks({ ...e, matched: false }), []);
});

test("an answer about missing company data is not shown as a tick", () => {
  const t = evidenceTicks(profile, [ans("headcount_growing_12m", "yes", 0.9), ans("hiring_target_city", "yes", 0.9)], { mode: "live", sources: [], fields: {} }, "Barcelona");
  assert.deepEqual(t.map((x) => x.text), ["Hiring in Barcelona"]);
});

test("reviewVerdict explains the doubt, not the leaning action", () => {
  assert.equal(reviewVerdict(ans("next_action", "nurture", 0.47)), "The AI leans towards keep warm but is only 47% sure.");
  assert.equal(reviewVerdict(ans("next_action", "linkedin_touch", 0.35)), "The AI leans towards light touch but is only 35% sure.");
  assert.equal(reviewVerdict(undefined), "The AI could not reach a decision for this company.");
});

test("sizeNote flags a headcount outside the range, with its source", () => {
  const range = { min: 10, max: 200 };
  assert.equal(sizeNote(520, range, "Apollo"), "Bigger than your range (520 people · Apollo)");
  assert.equal(sizeNote(5, range), "Smaller than your range (5 people)");
  assert.equal(sizeNote(120, range, "Apollo"), undefined);
  assert.equal(sizeNote(0, range, "Apollo"), undefined);
});

test("action state says when Apollo headcount is outside the range", async () => {
  const { actionState } = await import("./state");
  const c = { name: "Manychat", employees: 520, employeesSource: "apollo" as const, discoveredBy: "linkup" as const };
  const st = actionState(c, profile, { mode: "live", fields: {}, sources: [] }, []);
  assert.match(st, /size_check: OUTSIDE the target size range: bigger \(520 employees, Apollo; target 10-200\)/);
  assert.match(st, /Employees: 520 \(company data: Apollo\)/);
});

test("runBuckets counts decided companies per Simple column", async () => {
  const { runBuckets } = await import("./io");
  const mk = (stage: string, choice: string, p: number) => ({ company: { name: choice, discoveredBy: "linkup" as const }, stage, gate2: [], action: ans("next_action", choice, p) });
  const b = runBuckets({ profile: { id: "x", name: "x", reviewThreshold: 0.55 }, results: [mk("actioned", "call_now", 0.9), mk("actioned", "linkedin_touch", 0.7), mk("review", "send_email", 0.4), mk("actioned", "nurture", 0.8), mk("dropped_gate1", "discard", 1)] as never });
  assert.deepEqual(b, { call: 1, email: 1, check: 1, later: 1 });
});

test("briefing leads with the most urgent column", async () => {
  const { briefing } = await import("./plain");
  assert.deepEqual(briefing({ call: 3, email: 2, check: 1, later: 4 }), { headline: "Call 3 companies this week.", rest: "Then 2 to email, 1 to check yourself, 4 for later." });
  assert.deepEqual(briefing({ call: 0, email: 0, check: 1, later: 6 }), { headline: "Check 1 company yourself.", rest: "Then 6 for later." });
  assert.deepEqual(briefing({ call: 0, email: 0, check: 0, later: 5 }), { headline: "Nothing urgent this week.", rest: "5 for later." });
  assert.deepEqual(briefing({ call: 0, email: 0, check: 0, later: 0 }), { headline: "Nothing decided yet.", rest: "" });
});

test("an old funding round is a fact, not a positive signal", () => {
  const base = { source: "apollo" as const, mode: "live" as const, domain: "x.com", matched: true, fetchedAt: "2026-11-10T00:00:00.000Z" };
  const old = companyDataTicks({ ...base, fields: { latest_funding_stage: "Seed", latest_funding_round_date: "2021-04-01T00:00:00.000+00:00" } });
  assert.deepEqual(old.map((t) => [t.kind, t.text]), [["fact", "Raised Seed, Apr 2021"]]);
  const recent = companyDataTicks({ ...base, fields: { latest_funding_stage: "Series A", latest_funding_round_date: "2026-03-01T00:00:00.000+00:00" } });
  assert.equal(recent[0]?.kind, "yes");
});

test("briefing names the email action when nobody is to call", async () => {
  const { briefing } = await import("./plain");
  assert.equal(briefing({ call: 0, email: 1, check: 2, later: 0 }).headline, "Email 1 company.");
});

test("listOrder: in progress first, then call, email, check, not now, by confidence", async () => {
  const { listOrder } = await import("./plain");
  const rows = [
    { index: 0, bucket: "later" as const, p: 0.9 },
    { index: 1, bucket: "call" as const, p: 0.7 },
    { index: 2 },
    { index: 3, bucket: "call" as const, p: 0.95 },
    { index: 4, bucket: "check" as const, p: 0.4 },
    { index: 5, bucket: "email" as const, p: 0.6 },
  ];
  assert.deepEqual(listOrder(rows).map((r) => r.index), [2, 3, 1, 5, 4, 0]);
});

test("favicons: a source's own icon, and a company's icon from its own domain", async () => {
  const { faviconFor, companyFavicon } = await import("./plain");
  const src = [{ url: "https://news.example/a", favicon: "https://icons.example/news" }, { url: "https://www.acme.io/about", favicon: "https://icons.example/acme" }];
  assert.equal(faviconFor("https://news.example/b", src), "https://icons.example/news");
  assert.equal(faviconFor("https://other.example/x", src), undefined);
  assert.equal(companyFavicon("acme.io", src), "https://icons.example/acme");
  assert.equal(companyFavicon(undefined, src), undefined);
});

test("Simple never shows raw provider errors: notes become plain sentences", async () => {
  const { plainNote } = await import("./plain");
  assert.equal(plainNote('Linkup discovery stopped: Linkup HTTP 400: {"error":{"code":"SEARCH_QUERY_NO_RESULT"}}'), "Web search did not answer, so fewer companies were found.");
  assert.equal(plainNote("Cala discovery stopped: no API key configured. Tick \"Fixtures only\" to use sample companies"), "Company data search is not set up, so it was skipped.");
  assert.equal(plainNote("Company data (Apollo) skipped: Apollo HTTP 500"), "Company data was not available for some companies.");
  assert.doesNotMatch(plainNote("Some HTTP 502 <html>"), /HTTP|html/);
});

test("an interrupted run ends: unfinished companies read as not checked", async () => {
  const { cardState, interruptedNote } = await import("./plain");
  assert.equal(cardState({ stage: "researched", gate1: ans("p", "fit", 1), evidence: { mode: "live", fields: {}, sources: [] } }, true), "failed");
  assert.equal(cardState({ stage: "researched", gate1: ans("p", "fit", 1), evidence: { mode: "live", fields: {}, sources: [] } }, false), "deciding");
  assert.equal(interruptedNote("finished", 4, 6), undefined);
  assert.equal(interruptedNote("interrupted", 4, 6), 'The search stopped before it finished. 4 of 6 companies were decided; the others are marked "Couldn\'t check this one".');
});
