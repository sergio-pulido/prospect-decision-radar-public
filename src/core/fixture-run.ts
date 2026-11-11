// Turns a saved run into a keyless, shareable fixture: derived fields only. Pure.
// Kept for the company dossier: every research sentence with its citations, every cited source (with its favicon),
// the consulted total, answers with all probabilities, durations, and engine/model/latency/cost per decision.
// Dropped: decision prompts and raw Jev answers, the raw Apollo payload, apollo_* evidence keys,
// geocoding queries (street addresses) and sources that no evidence sentence cites.
import { isPersonalProfile, stripPersonalLinks } from "./dossier";
import type { Company, CompanyResult, DecisionTrace, Enrichment, Evidence, RunRecord, Source, TimedEvent } from "./types";


const company = (c: Company): Company => ({
  name: c.name,
  ...(c.website ? { website: c.website } : {}),
  ...(c.city ? { city: c.city } : {}),
  ...(c.country ? { country: c.country } : {}),
  ...(typeof c.employees === "number" ? { employees: c.employees } : {}),
  ...(c.sector ? { sector: c.sector } : {}),
  ...(c.description ? { description: c.description } : {}),
  discoveredBy: c.discoveredBy,
  ...(c.foundBy ? { foundBy: c.foundBy } : {}),
  ...(c.employeesSource ? { employeesSource: c.employeesSource } : {}),
  ...(c.sources?.length ? { sources: c.sources.filter((s) => !isPersonalProfile(s.url)).slice(0, 3).map(source) } : {}),
});

const source = (s: Source): Source => ({ name: s.name, url: s.url, ...(s.favicon ? { favicon: s.favicon } : {}) });

/** Evidence sentences without apollo_* keys; every cited source (personal profiles never), plus the consulted total. */
function evidence(e: Evidence): Evidence {
  const fields = Object.fromEntries(Object.entries(e.fields).filter(([k]) => !k.startsWith("apollo_")).map(([k, v]) => [k, v ? stripPersonalLinks(v) : v]));
  const cited = new Set(Object.values(fields).flatMap((v) => (v ? [...v.matchAll(/https?:\/\/[^\s)\]]+/g)].map((m) => m[0]) : [])));
  const keep = e.sources.filter((s, i, a) => cited.has(s.url) && !isPersonalProfile(s.url) && a.findIndex((x) => x.url === s.url) === i);
  const consulted = Math.max(e.consulted ?? 0, new Set(e.sources.map((s) => s.url)).size);
  return { mode: e.mode, fields, sources: keep.map(source), consulted, ...(e.error ? { error: e.error } : {}) };
}

/** Company facts the views show (headcount, growth, industry, HQ city, rounds) and the office point. Never the address. */
function enrichment(e: Enrichment): Enrichment {
  const f = e.fields;
  const keys = [
    "name", "estimated_num_employees", "industry", "city", "country", "total_funding_printed", "latest_funding_round_date", "latest_funding_stage",
    "organization_headcount_six_month_growth", "organization_headcount_twelve_month_growth", "organization_headcount_twenty_four_month_growth",
  ] as const;
  const kept = Object.fromEntries(keys.filter((k) => f[k] !== undefined && f[k] !== null).map((k) => [k, f[k]]));
  const events = f.funding_events?.map((x) => ({ ...(x.date ? { date: x.date } : {}), ...(x.type ? { type: x.type } : {}), ...(x.amount ? { amount: x.amount } : {}), ...(x.currency ? { currency: x.currency } : {}) }));
  return {
    source: e.source,
    mode: e.mode,
    domain: e.domain,
    matched: e.matched,
    fetchedAt: e.fetchedAt,
    fields: e.matched ? { ...kept, ...(events?.length ? { funding_events: events } : {}) } : {},
    ...(e.location ? { location: { lat: e.location.lat, lng: e.location.lng, precision: e.location.precision, query: "" } } : {}),
  };
}

/** Who decided, with what model, how fast and at what cost: kept. The prompt and raw answers: left out. */
function stub(t: DecisionTrace): DecisionTrace {
  return {
    mode: t.mode, engine: t.engine, ...(t.model ? { model: t.model } : {}), ...(t.route ? { route: t.route } : {}),
    ...(t.usage ? { usage: t.usage } : {}), ms: t.ms, at: t.at, state: "", questions: {}, answers: null, omitted: true,
  };
}

function result(r: CompanyResult): CompanyResult {
  const { traces, enrichment: en, evidence: ev, company: c, ...rest } = r;
  const kept = traces ? Object.fromEntries(Object.entries(traces).map(([k, t]) => [k, stub(t)])) : undefined;
  return {
    ...rest,
    company: company(c),
    ...(ev ? { evidence: evidence(ev) } : {}),
    ...(en ? { enrichment: enrichment(en) } : {}),
    ...(kept ? { traces: kept } : {}),
  };
}

function event(e: TimedEvent): TimedEvent {
  switch (e.type) {
    case "company_discovered":
      return { ...e, company: company(e.company) };
    case "gate1":
    case "gate2":
    case "action":
      return (e.trace ? { ...e, trace: stub(e.trace) } : e) as TimedEvent;
    case "enrichment_done":
      return { ...e, enrichment: e.enrichment ? enrichment(e.enrichment) : null };
    case "research_done":
      return { ...e, evidence: evidence(e.evidence) };
    case "company_done":
      return { ...e, result: result(e.result) };
    case "run_started":
      return { ...e, input: { ...e.input, seed: undefined } };
    default:
      return e;
  }
}

export function toFixtureRun(run: RunRecord, id: string): RunRecord {
  return {
    ...run,
    id,
    input: { ...run.input, seed: undefined },
    results: run.results.map(result),
    notes: [...run.notes, "Saved example: derived fields only (no decision traces, no raw company-data payload)."],
    ...(run.events ? { events: run.events.map(event) } : {}),
  };
}
