// Client-side run state built from pipeline events. Pure and immutable: same events, same state.
import { knownHeadcount } from "../../core/enrichment";
import type {
  CompanyResult,
  DecisionStep,
  DiscoveryReport,
  PipelineEvent,
  RunInput,
  RunRecord,
  StageCounts,
} from "../../core/types";

/** What a row is doing right now (finer than CompanyResult.stage, for the live view). */
export type Activity = "queued" | "gate1" | "researching" | "deciding" | "done";

export interface Row {
  index: number;
  result: CompanyResult;
  activity: Activity;
  /** ms since run start when the row last changed (for the flash animation). */
  changedAt: number;
  /** Decision call in flight right now (from decision_started until its answer arrives). */
  inFlight?: { step: DecisionStep; questions: string[]; engine: "jev" | "fixture-heuristic" };
}

/** One line of the event log: wall-clock time plus the raw event. */
export interface LogLine {
  at: number;
  e: PipelineEvent;
}

export const LOG_MAX = 400;

export interface DiscoveryLine extends Omit<DiscoveryReport, "status"> {
  pending: boolean;
}

export interface RunView {
  /** "interrupted": the stream ended without run_finished (connection lost). */
  status: "idle" | "running" | "finished" | "failed" | "interrupted";
  profile?: RunRecord["profile"];
  providers?: RunRecord["providers"];
  input?: RunInput;
  discovery: DiscoveryLine[];
  rows: Row[];
  errors: string[];
  notes: string[];
  runId?: string;
  file?: string;
  log: LogLine[];
}

export const emptyView: RunView = { status: "idle", discovery: [], rows: [], errors: [], notes: [], log: [] };

function updateRow(v: RunView, index: number, now: number, f: (r: Row) => Partial<Row>): RunView {
  return { ...v, rows: v.rows.map((r) => (r.index === index ? { ...r, ...f(r), changedAt: now } : r)) };
}

/** The header badge follows what actually decided (from traces), not what was configured. */
function withDecider(v: RunView, e: PipelineEvent): RunView {
  const trace = "trace" in e ? e.trace : undefined;
  if (!trace || !v.providers) return v;
  const jev = trace.engine === "jev" ? "live" : "fixture";
  return v.providers.jev === jev ? v : { ...v, providers: { ...v.providers, jev } };
}

export function applyEvent(v: RunView, e: PipelineEvent, now = 0, at = Date.now()): RunView {
  if (e.type === "heartbeat") return v;
  const next = withDecider(applyEventRaw(v, e, now), e);
  return { ...next, log: [...next.log, { at, e }].slice(-LOG_MAX) };
}

function applyEventRaw(v: RunView, e: PipelineEvent, now: number): RunView {
  switch (e.type) {
    case "run_started":
      return { ...emptyView, status: "running", profile: e.profile, providers: e.providers, input: e.input };
    case "decision_started":
      return updateRow(v, e.index, now, () => ({ inFlight: { step: e.step, questions: e.questions, engine: e.engine } }));
    case "discovery_query":
      return { ...v, discovery: [...v.discovery, { provider: e.provider, mode: e.mode, query: e.query, city: e.city, count: 0, ms: 0, pending: true }] };
    case "discovery_done": {
      const { type: _t, ...rep } = e;
      const i = v.discovery.findIndex((d) => d.pending && d.provider === e.provider && d.query === e.query);
      const line: DiscoveryLine = { ...rep, pending: false };
      return { ...v, discovery: i >= 0 ? v.discovery.map((d, j) => (j === i ? line : d)) : [...v.discovery, line] };
    }
    case "company_discovered":
      return {
        ...v,
        rows: [...v.rows, { index: e.index, result: { company: e.company, stage: "discovered", gate2: [] }, activity: "queued", changedAt: now }],
      };
    case "gate1":
      return updateRow(v, e.index, now, (r) => ({
        result: { ...r.result, gate1: e.answer, stage: e.dropped ? "dropped_gate1" : "passed_gate1", traces: { ...r.result.traces, gate1: e.trace } },
        activity: e.dropped ? "done" : "gate1",
        inFlight: undefined,
      }));
    case "enrichment_done":
      return e.enrichment
        ? updateRow(v, e.index, now, (r) => {
            const n = knownHeadcount(e.enrichment!);
            const company = n !== undefined ? { ...r.result.company, employees: n, employeesSource: "apollo" as const } : r.result.company;
            return { result: { ...r.result, company, enrichment: e.enrichment! } };
          })
        : v;
    case "research_started":
      return updateRow(v, e.index, now, () => ({ activity: "researching" }));
    case "research_done":
      return updateRow(v, e.index, now, (r) => ({ result: { ...r.result, evidence: e.evidence, stage: "researched", timings: { ...r.result.timings, research: e.ms } }, activity: "deciding" }));
    case "gate2":
      return updateRow(v, e.index, now, (r) => ({ result: { ...r.result, gate2: e.answers, signalStrength: e.signalStrength, traces: { ...r.result.traces, gate2: e.trace } }, inFlight: undefined }));
    case "action":
      return updateRow(v, e.index, now, (r) => ({ result: { ...r.result, action: e.answer, traces: { ...r.result.traces, action: e.trace } }, inFlight: undefined }));
    case "routed":
      return updateRow(v, e.index, now, (r) => ({ result: { ...r.result, stage: e.routed, finalAction: e.finalAction } }));
    case "company_done":
      // Older runs carry no timings in the result: keep the ones measured from the events.
      return updateRow(v, e.index, now, (r) => ({ result: { ...e.result, timings: { ...r.result.timings, ...e.result.timings } }, activity: "done", inFlight: undefined }));
    case "run_finished":
      return { ...v, status: "finished", runId: e.runId, file: e.file, notes: [...new Set([...v.notes, ...e.notes])], providers: e.providers ?? v.providers };
    case "note":
      return { ...v, notes: [...new Set([...v.notes, e.message])] };
    case "heartbeat":
      return v;
    case "error":
      return e.index === undefined
        ? { ...v, errors: [...v.errors, e.message] }
        : updateRow(v, e.index, now, (r) => ({ result: { ...r.result, error: e.message }, inFlight: undefined }));
  }
}

/**
 * Routing under a given threshold, from stored probabilities only (no new calls).
 * Mirrors core: below the threshold the action goes to human review.
 */
export function routeAt(r: CompanyResult, threshold: number): "actioned" | "review" | undefined {
  if (r.stage !== "actioned" && r.stage !== "review") return undefined;
  if (!r.action) return "review";
  return r.action.probability < threshold ? "review" : "actioned";
}

export interface Funnel extends StageCounts {
  gate2: number;
}

export function funnel(rows: Row[], threshold: number): Funnel {
  const c: Funnel = { discovered: rows.length, passedGate1: 0, researched: 0, gate2: 0, actioned: 0, review: 0, dropped: 0, errors: 0 };
  for (const { result: r } of rows) {
    if (r.stage === "dropped_gate1") c.dropped++;
    if (r.stage === "error" || r.error) c.errors++;
    if (r.gate1 && r.stage !== "dropped_gate1" && r.stage !== "error") c.passedGate1++;
    if (r.evidence) c.researched++;
    if (r.gate2.length) c.gate2++;
    const route = routeAt(r, threshold);
    if (route === "actioned") c.actioned++;
    if (route === "review") c.review++;
  }
  return c;
}

/** The stream ended without run_finished: keep what arrived, end the run, mark unfinished rows. */
export function interrupt(v: RunView): RunView {
  if (v.status !== "running") return v;
  return { ...v, status: "interrupted" };
}
