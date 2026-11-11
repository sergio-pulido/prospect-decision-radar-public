import assert from "node:assert/strict";
import { test } from "node:test";
import { runPipeline, type PipelineDeps } from "./pipeline";
import { expandSpec } from "./profile";
import type { Answer, DecisionProvider, DecisionQuestion, DiscoveryProvider, Evidence, PipelineEvent, ResearchProvider } from "./types";

const profile = expandSpec({
  id: "t", name: "T", description: "", offer: "widgets", buyer: "companies", cities: ["Barcelona"],
  sizeRange: { min: 1, max: 1000 }, sectors: [], signals: ["funding_recent"],
});

/** Answers the first option of every question with p = 0.9 (fit, yes, discard ...). */
const decider: DecisionProvider = {
  mode: "fixture",
  async decide(_state: string, qs: DecisionQuestion[]) {
    return Object.fromEntries(qs.map((q) => {
      const choice = Object.keys(q.options)[0]!;
      return [q.id, { questionId: q.id, question: q.instructions, choice, probability: 0.9, probabilities: { [choice]: 0.9 } } satisfies Answer];
    }));
  },
};
const never = <T,>() => new Promise<T>(() => {});
const research = (hangOn: string): ResearchProvider => ({
  mode: "fixture",
  research: async (c) => (c.name === hangOn ? never<Evidence>() : { mode: "fixture", fields: { funding_last_12_months: "Raised a seed round." }, sources: [] }),
});
const discovery = (hang = false): DiscoveryProvider => ({ mode: "live", name: "linkup", discover: () => (hang ? never() : Promise.resolve([])) });

function deps(over: Partial<PipelineDeps>, events: PipelineEvent[]): PipelineDeps {
  return {
    decision: decider,
    research: research("nobody"),
    discovery: { fixture: discovery(), cala: discovery(), linkup: discovery() },
    timeouts: { research: 50, discovery: 50, decision: 50, enrichment: 50 },
    onEvent: (e) => events.push(e),
    ...over,
  };
}
const providers = { jev: "fixture", linkup: "fixture", cala: "fixture" } as const;

test("a hanging research call fails that company only, and run_finished still arrives last", async () => {
  const events: PipelineEvent[] = [];
  const run = await runPipeline({ profileId: "t", discovery: "manual", companyNames: ["Alpha", "Hangs", "Gamma"] }, profile, deps({ research: research("Hangs") }, events), providers);
  const err = events.find((e) => e.type === "error");
  assert.ok(err && err.type === "error" && err.index === 1 && /did not answer within/.test(err.message), "an error event for that company");
  assert.equal(events.filter((e) => e.type === "research_started").length, 3);
  assert.equal(events.filter((e) => e.type === "research_done").length, 2);
  assert.equal(events.at(-1)?.type, "run_finished");
  assert.deepEqual(run.results.map((r) => r.stage), ["actioned", "passed_gate1", "actioned"]);
  assert.match(run.results[1]!.error ?? "", /Research \(Linkup\) did not answer within/);
});

test("a hanging discovery source stops with a note; the run still ends", async () => {
  const events: PipelineEvent[] = [];
  const d = deps({ discovery: { fixture: discovery(), cala: discovery(true), linkup: discovery() } }, events);
  await runPipeline({ profileId: "t", discovery: "both", companyNames: ["Alpha"] }, profile, d, providers);
  assert.ok(events.some((e) => e.type === "note" && /Cala discovery stopped: Cala did not answer/.test(e.message)));
  assert.equal(events.at(-1)?.type, "run_finished");
});

test("a failing save is reported, and run_finished still arrives", async () => {
  const events: PipelineEvent[] = [];
  const d = deps({ persist: () => Promise.reject(new Error("disk full")) }, events);
  await assert.rejects(runPipeline({ profileId: "t", discovery: "manual", companyNames: ["Alpha"] }, profile, d, providers), /disk full/);
  assert.equal(events.at(-2)?.type, "error");
  assert.equal(events.at(-1)?.type, "run_finished");
});

test("run_finished carries the saved file", async () => {
  const events: PipelineEvent[] = [];
  await runPipeline({ profileId: "t", discovery: "manual", companyNames: ["Alpha"] }, profile, deps({ persist: async () => "runs/x.json" }, events), providers);
  const last = events.at(-1);
  assert.ok(last?.type === "run_finished" && last.file === "runs/x.json");
});
