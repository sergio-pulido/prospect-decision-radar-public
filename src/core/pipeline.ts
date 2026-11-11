// The pipeline: discover -> gate 1 -> research -> gate 2 -> action -> draft.
// One company per decision call. Providers are injected.
import { buildDraft } from "./draft";
import { enrichmentEvidence, knownHeadcount } from "./enrichment";
import { actionState, gate1State, gate2State, signalStrength } from "./state";
import { DEFAULT_TIMEOUTS, withTimeout, type StepTimeouts } from "./timeout";
import type {
  Answer,
  Company,
  CompanyResult,
  DecisionProvider,
  DecisionStep,
  DecisionTrace,
  DiscoveryProvider,
  DiscoveryReport,
  EnrichmentProvider,
  Evidence,
  PipelineEvent,
  Profile,
  ResearchProvider,
  RunInput,
  RunRecord,
  StageCounts,
  TimedEvent,
} from "./types";

export interface PipelineDeps {
  decision: DecisionProvider;
  research: ResearchProvider;
  /** Optional company-level enrichment (org data only), run after gate 1 and before research. */
  enrichment?: EnrichmentProvider;
  discovery: Record<"fixture" | "cala" | "linkup", DiscoveryProvider>;
  concurrency?: number;
  onProgress?: (r: CompanyResult) => void;
  /** Live event stream. Called synchronously, in order. Must not throw. */
  onEvent?: (e: PipelineEvent) => void;
  /** Per-step time limits (ms). A call that exceeds its limit fails for that company or source only. */
  timeouts?: Partial<StepTimeouts>;
  /** Saves the finished run; its result (a file path) goes into run_finished. A failure becomes an error event. */
  persist?: (run: RunRecord) => Promise<string>;
}

const limits = (d: PipelineDeps): StepTimeouts => ({ ...DEFAULT_TIMEOUTS, ...d.timeouts });

/** A decision call with the step's time limit. */
function decideIn(deps: PipelineDeps, ...args: Parameters<DecisionProvider["decide"]>): ReturnType<DecisionProvider["decide"]> {
  return withTimeout(deps.decision.decide(...args), limits(deps).decision, "The decision (Jev)");
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, idx: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!, idx);
    }
  });
  await Promise.all(workers);
  return out;
}

export const normName = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\b(s\.?l\.?u?|s\.?a\.?|ltda|inc|ltd|llc|gmbh)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Dedupe by normalized name. A company found by several sources keeps all of them in `foundBy`. */
export function dedupe(cs: Company[]): Company[] {
  const byKey = new Map<string, Company>();
  for (const c of cs) {
    const k = normName(c.name);
    if (!k) continue;
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, { ...c, foundBy: [...(c.foundBy ?? [c.discoveredBy])] });
      continue;
    }
    const foundBy = [...new Set([...(prev.foundBy ?? [prev.discoveredBy]), ...(c.foundBy ?? [c.discoveredBy])])];
    const sources = [...(prev.sources ?? []), ...(c.sources ?? [])].filter((s, i, a) => a.findIndex((x) => x.url === s.url) === i);
    byKey.set(k, {
      ...c,
      ...Object.fromEntries(Object.entries(prev).filter(([, v]) => v !== undefined)),
      foundBy,
      sources,
    } as Company);
  }
  return [...byKey.values()];
}

/** Interleave lists so a limit keeps companies from every source and city. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) for (const l of lists) if (i < l.length) out.push(l[i]!);
  return out;
}

type AutoSource = "fixture" | "cala" | "linkup";

export async function discover(input: RunInput, profile: Profile, deps: PipelineDeps, notes: string[]): Promise<Company[]> {
  const emit = deps.onEvent ?? (() => {});
  const limit = input.limit ?? 12;
  const manual: Company[] = [
    ...(input.companyNames ?? []).map((name) => ({ name: name.trim(), discoveredBy: "manual" as const })),
    ...(input.seed ?? []).map((c) => ({ ...c, discoveredBy: "seed" as const })),
  ].filter((c) => c.name);
  if (manual.length) {
    const query = `Pasted list: ${manual.map((c) => c.name).join(", ")}`;
    emit({ type: "discovery_query", provider: "manual", mode: "live", query });
    emit({ type: "discovery_done", provider: "manual", mode: "live", query, count: manual.length, ms: 0 });
  }
  if (input.discovery === "manual") return dedupe(manual).slice(0, limit);

  const wanted: AutoSource[] = input.discovery === "both" ? ["linkup", "cala"] : [input.discovery];
  // Each source asks for up to its own per-city cap (profile discovery.maxPerCity); the run limit trims
  // the interleaved result, so both sources stay visible.
  const perSource = limit;
  const report = ({ status, ...r }: DiscoveryReport) =>
    status === "sent"
      ? emit({ type: "discovery_query", provider: r.provider, mode: r.mode, query: r.query, city: r.city })
      : emit({ type: "discovery_done", ...r });

  const sourceLabel = (n: AutoSource) => (n === "linkup" ? "Linkup" : n === "cala" ? "Cala" : "Sample companies");
  // One message per failed source, as a note (shown once). Live runs never fall back to sample companies.
  const stopSource = (n: AutoSource, why: string): Company[] => {
    const msg = `${sourceLabel(n)} discovery stopped: ${why}`;
    notes.push(msg);
    emit({ type: "note", message: msg });
    return [];
  };
  const fixturesAllowed = input.fixturesOnly === true || input.discovery === "fixture";

  const lists = await Promise.all(
    wanted.map(async (name) => {
      const provider = deps.discovery[name];
      if (provider.mode === "fixture" && name !== "fixture" && !fixturesAllowed) {
        return stopSource(name, "no API key configured. Tick \"Fixtures only\" to use sample companies");
      }
      try {
        return await withTimeout(provider.discover(profile, perSource, report), limits(deps).discovery, sourceLabel(name));
      } catch (err) {
        return stopSource(name, (err as Error).message);
      }
    }),
  );
  return dedupe([...manual, ...interleave(lists)]).slice(0, limit);
}

async function processCompany(company: Company, p: Profile, deps: PipelineDeps, index: number): Promise<CompanyResult> {
  const emit = deps.onEvent ?? (() => {});
  const r: CompanyResult = { company, stage: "discovered", gate2: [], traces: {} };
  const traces: NonNullable<CompanyResult["traces"]> = {};
  const keep = (step: DecisionStep) => (t: DecisionTrace) => {
    traces[step] = t;
    r.traces = { ...traces };
  };
  // Emitted right before each decision call, so the UI can show what is in flight.
  const asking = (step: DecisionStep, qs: Profile["gate2"]) =>
    emit({
      type: "decision_started",
      index,
      step,
      questions: qs.map((q) => q.id),
      engine: deps.decision.mode === "live" ? "jev" : "fixture-heuristic",
    });
  try {
    // Gate 1: cheap fit check.
    asking("gate1", [p.gate1]);
    const g1 = await decideIn(deps, gate1State(company, p), [p.gate1], keep("gate1"));
    r.gate1 = g1[p.gate1.id];
    if (!r.gate1) throw new Error("Gate 1 returned no answer");
    const dropped = p.gate1Drop.includes(r.gate1.choice);
    emit({ type: "gate1", index, answer: r.gate1, dropped, trace: traces.gate1 });
    if (dropped) {
      r.stage = "dropped_gate1";
      return r;
    }
    r.stage = "passed_gate1";

    // Enrichment (org data only): survivors with a website, before research.
    if (deps.enrichment && company.website) {
      const te = Date.now();
      try {
        const e = await withTimeout(deps.enrichment.enrich(r.company, p), limits(deps).enrichment, "Company data (Apollo)");
        if (e) {
          r.enrichment = e;
          const n = knownHeadcount(e);
          if (n !== undefined) r.company = { ...r.company, employees: n, employeesSource: "apollo" };
        }
        r.timings = { ...r.timings, enrichment: Date.now() - te };
        emit({ type: "enrichment_done", index, enrichment: e, ms: Date.now() - te });
      } catch (err) {
        // Enrichment is optional: the company continues without it. One note per distinct reason (deduped by views).
        emit({ type: "enrichment_done", index, enrichment: null, ms: Date.now() - te, error: (err as Error).message });
        emit({ type: "note", message: `Company data (Apollo) skipped: ${(err as Error).message}` });
      }
    }

    // Research: survivors only.
    emit({ type: "research_started", index });
    const t0 = Date.now();
    const researched = await withTimeout(deps.research.research(r.company, p), limits(deps).research, "Research (Linkup)");
    // Company data from enrichment joins the evidence, so questions, views and what-if treat it like research.
    r.evidence = { ...researched, fields: { ...researched.fields, ...enrichmentEvidence(r.enrichment) } };
    r.stage = "researched";
    r.timings = { ...r.timings, research: Date.now() - t0 };
    emit({ type: "research_done", index, evidence: r.evidence, ms: Date.now() - t0 });

    // Gate 2: narrow factual questions over the evidence, one call for this company.
    asking("gate2", p.gate2);
    const g2 = await decideIn(deps, gate2State(r.company, p, r.evidence), p.gate2, keep("gate2"));
    r.gate2 = p.gate2.map((q) => g2[q.id]).filter((a): a is NonNullable<typeof a> => !!a);
    r.signalStrength = signalStrength(p, r.gate2).strength;
    emit({ type: "gate2", index, answers: r.gate2, signalStrength: r.signalStrength, trace: traces.gate2 });

    // Action.
    asking("action", [p.action]);
    const act = await decideIn(deps, actionState(r.company, p, r.evidence, r.gate2), [p.action], keep("action"));
    r.action = act[p.action.id];
    if (r.action) emit({ type: "action", index, answer: r.action, trace: traces.action });
    if (!r.action || r.action.probability < p.reviewThreshold) {
      r.stage = "review";
      r.finalAction = "needs_human_review";
    } else {
      r.stage = "actioned";
      r.finalAction = r.action.choice;
    }
    emit({ type: "routed", index, routed: r.stage, finalAction: r.finalAction, reason: routeReason(r, p) });
    // Draft for the model's top choice, also when routed to review, so the human has a starting point.
    if (r.action) r.draft = buildDraft(p, r.action.choice, r.company, r.evidence, r.gate2);
  } catch (err) {
    r.error = (err as Error).message;
    r.stage = r.stage === "discovered" ? "error" : r.stage;
    if (r.stage !== "error") r.finalAction = "needs_human_review";
    emit({ type: "error", index, message: r.error });
  }
  return r;
}

export interface Redecision {
  gate2: Answer[];
  signalStrength: string;
  action?: Answer;
  finalAction: string;
  routed: "actioned" | "review";
  traces: NonNullable<CompanyResult["traces"]>;
}

/**
 * Counterfactual: same company, evidence with some fields REMOVED (set to null), re-asked through
 * gate 2 and the action (2 decision calls). Only removal is possible: no field can be edited or added.
 */
export async function redecide(
  company: Company,
  p: Profile,
  evidence: Evidence,
  removed: string[],
  decision: DecisionProvider,
): Promise<{ evidence: Evidence; result: Redecision }> {
  const allowed = new Set([...p.research.fields.map((f) => f.id), ...Object.keys(evidence.fields)]);
  const bad = removed.filter((f) => !allowed.has(f));
  if (bad.length) throw new Error(`Unknown evidence fields: ${bad.join(", ")}`);
  const fields = Object.fromEntries(Object.entries(evidence.fields).map(([k, v]) => [k, removed.includes(k) ? null : v]));
  const ev: Evidence = { ...evidence, fields };
  const traces: NonNullable<CompanyResult["traces"]> = {};
  const g2 = await decision.decide(gate2State(company, p, ev), p.gate2, (t) => (traces.gate2 = t));
  const gate2 = p.gate2.map((q) => g2[q.id]).filter((a): a is Answer => !!a);
  const act = await decision.decide(actionState(company, p, ev, gate2), [p.action], (t) => (traces.action = t));
  const action = act[p.action.id];
  const routed = !action || action.probability < p.reviewThreshold ? "review" : "actioned";
  return {
    evidence: ev,
    result: {
      gate2,
      signalStrength: signalStrength(p, gate2).strength,
      action,
      finalAction: routed === "review" ? "needs_human_review" : action!.choice,
      routed,
      traces,
    },
  };
}

export function routeReason(r: Pick<CompanyResult, "action">, p: Pick<Profile, "reviewThreshold">): string {
  if (!r.action) return "No action answer: routed to human review";
  const pctTop = Math.round(r.action.probability * 100);
  const pctT = Math.round(p.reviewThreshold * 100);
  return r.action.probability < p.reviewThreshold
    ? `Top choice ${r.action.choice} at ${pctTop}% < threshold ${pctT}%`
    : `Top choice ${r.action.choice} at ${pctTop}% >= threshold ${pctT}%`;
}

export function countStages(results: CompanyResult[]): StageCounts {
  const c: StageCounts = { discovered: results.length, passedGate1: 0, researched: 0, actioned: 0, review: 0, dropped: 0, errors: 0 };
  for (const r of results) {
    if (r.stage === "dropped_gate1") c.dropped++;
    if (r.stage === "error" || r.error) c.errors++;
    if (r.gate1 && r.stage !== "dropped_gate1" && r.stage !== "error") c.passedGate1++;
    if (r.evidence) c.researched++;
    if (r.stage === "actioned") c.actioned++;
    if (r.stage === "review") c.review++;
  }
  return c;
}

export async function runPipeline(
  input: RunInput,
  profile: Profile,
  deps: PipelineDeps,
  providers: RunRecord["providers"],
  initialNotes: string[] = [],
): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const notes: string[] = [...initialNotes];
  const events: TimedEvent[] = [];
  const outer = deps.onEvent;
  const emit = (e: PipelineEvent) => {
    events.push({ ...e, t: Date.now() - t0 });
    try {
      outer?.(e);
    } catch {
      // A broken listener (e.g. a closed stream) must never stop the run.
    }
  };
  const d: PipelineDeps = { ...deps, onEvent: emit };
  const profileRef = { id: profile.id, name: profile.name, reviewThreshold: profile.reviewThreshold };
  emit({ type: "run_started", profile: profileRef, providers, input });
  const decisionModeAtStart = deps.decision.mode;
  const results: CompanyResult[] = [];
  let run: RunRecord | undefined;
  let file: string | undefined;
  const record = (): RunRecord => ({
    id: `${startedAt.replace(/[:.]/g, "-")}_${profile.id}`,
    startedAt,
    finishedAt: new Date().toISOString(),
    input,
    profile: profileRef,
    // The decider can degrade mid-run (e.g. a rejected key): record what actually decided.
    providers: { ...providers, jev: deps.decision.mode === decisionModeAtStart ? providers.jev : deps.decision.mode },
    counts: countStages(results.filter(Boolean)),
    results: results.filter(Boolean),
    notes: [...notes],
    // A snapshot: run_finished (emitted after this record is built) is never part of a saved run.
    events: [...events],
  });
  try {
    const found = await discover(input, profile, d, notes);
    // Headcount known from an earlier enrichment (local cache, no call) replaces a discovery estimate.
    const companies = found.map((c) => {
      const n = deps.enrichment?.knownEmployees?.(c);
      return typeof n === "number" ? { ...c, employees: n, employeesSource: "apollo" as const } : c;
    });
    companies.forEach((company, index) => emit({ type: "company_discovered", index, company }));
    await mapLimit(companies, deps.concurrency ?? 3, async (c, index) => {
      const r = await processCompany(c, profile, d, index);
      results[index] = r;
      emit({ type: "company_done", index, result: r });
      deps.onProgress?.(r);
      return r;
    });
    run = record();
    if (deps.persist) file = await deps.persist(run);
    return run;
  } catch (err) {
    emit({ type: "error", message: (err as Error).message });
    throw err;
  } finally {
    // Always the last event, whatever happened above: a client can always tell the run has ended.
    const r = run ?? record();
    emit({ type: "run_finished", runId: r.id, counts: r.counts, ...(file ? { file } : {}), notes: r.notes, providers: r.providers });
  }
}
