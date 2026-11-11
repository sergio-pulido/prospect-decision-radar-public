// Plain-language mapping for non-expert views. Pure TypeScript, no framework: ports as-is.
import { growthPct, latestFunding } from "./enrichment";
import { DEFAULT_ACTION_LABELS } from "./profile";
import { isRecent, signalById } from "./signals";
import type { Answer, CompanyResult, DecisionQuestion, Enrichment, Evidence, Profile } from "./types";

export type Bucket = "call" | "email" | "check" | "later";

export const BUCKETS: ReadonlyArray<{ id: Bucket; title: string; hint: string }> = [
  { id: "call", title: "Call this week", hint: "Strong, recent signs" },
  { id: "email", title: "Send an email", hint: "Clear signs, not urgent" },
  { id: "check", title: "Check yourself", hint: "The AI was not sure enough" },
  { id: "later", title: "Not now", hint: "Nothing happening yet" },
];

/** Default action -> bucket table. Unknown labels go to "later". */
export const ACTION_BUCKET: Readonly<Record<string, Bucket>> = {
  call_now: "call",
  send_email: "email",
  linkedin_touch: "email",
  nurture: "later",
  discard: "later",
};

/** Short display name per action label (Simple never shows raw labels). A profile's actionLabels win. */
export const ACTION_NAME: Readonly<Record<string, string>> = DEFAULT_ACTION_LABELS;

export function actionName(label: string, labels?: Record<string, string>): string {
  return labels?.[label] ?? ACTION_NAME[label] ?? label.replace(/_/g, " ");
}

/** Plain text for question ids of older explicit profiles, so saved runs still read well. */
const LEGACY_PLAIN: Readonly<Record<string, Record<string, string>>> = {
  hiring_target_city: { yes: "Hiring in {city}", no: "Not hiring in {city}", unknown: "Hiring in {city} unknown" },
  expansion_target_city: { yes: "Expanding in {city}", no: "No new office in {city}", unknown: "Expansion unknown" },
  work_policy: { hybrid: "Works hybrid", fully_remote: "Fully remote", office_first: "Office-first", unknown: "Work policy unknown" },
  office_situation: { flexible_or_coworking: "Already uses flexible space", own_office: "Has its own office", no_local_office: "No local office yet", unknown: "Office situation unknown" },
  growing: { yes: "Growing", no: "Not growing", unknown: "Growth unknown" },
  headcount_in_range: { yes: "Right team size", no: "Team size outside your range", unknown: "Team size unknown" },
};

/** Bucket from the routing outcome: below the threshold always means "check yourself". */
export function bucketOf(action: Answer | undefined, threshold: number): Bucket {
  if (!action || action.probability < threshold) return "check";
  return ACTION_BUCKET[action.choice] ?? "later";
}

export interface Confidence {
  word: "Very sure" | "Fairly sure" | "Not sure: please check";
  pct: number;
}

export function confidenceOf(p: number): Confidence {
  const pct = Math.round(p * 100);
  if (pct >= 80) return { word: "Very sure", pct };
  if (pct >= 55) return { word: "Fairly sure", pct };
  return { word: "Not sure: please check", pct };
}

export interface Tick {
  /** "fact": true but not a buying signal (e.g. an older funding round). */
  kind: "yes" | "no" | "unknown" | "fact";
  text: string;
  source?: string;
  /** The source's icon, as the provider returned it. */
  favicon?: string;
  /** Where a fact came from when it is not a web source (e.g. "Apollo"). */
  via?: string;
  questionId?: string;
}

const MD_LINK = /\]\((https?:\/\/[^)\s]+)\)/;
const BARE_URL = /(https?:\/\/[^\s)\]]+)/;

const hostOf = (url: string): string => url.replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0]?.toLowerCase() ?? "";

/** The stored favicon of a source on the same host as `url`, if any. */
export function faviconFor(url: string, sources: ReadonlyArray<{ url: string; favicon?: string }>): string | undefined {
  const h = hostOf(url);
  return sources.find((s) => s.url === url && s.favicon)?.favicon ?? sources.find((s) => s.favicon && hostOf(s.url) === h)?.favicon;
}

/** A company's own icon: the favicon of a stored source on the company's website domain. */
export function companyFavicon(website: string | undefined, sources: ReadonlyArray<{ url: string; favicon?: string }>): string | undefined {
  const h = website ? hostOf(website.includes("://") ? website : `https://${website}`) : "";
  return h ? sources.find((s) => s.favicon && hostOf(s.url) === h)?.favicon : undefined;
}

/** First source URL cited inside an evidence sentence, if any. */
export function firstUrl(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  return text.match(MD_LINK)?.[1] ?? text.match(BARE_URL)?.[1];
}

function plainOf(q: DecisionQuestion | undefined, a: Answer, city: string): string {
  const sig = signalById(a.questionId)?.tick as Record<string, string> | undefined;
  const t = q?.plain?.[a.choice] ?? sig?.[a.choice] ?? LEGACY_PLAIN[a.questionId]?.[a.choice];
  return (t ?? `${a.questionId.replace(/_/g, " ")}: ${a.choice.replace(/_/g, " ")}`).replaceAll("{city}", city);
}

/**
 * Up to `max` evidence ticks: positives first (with their source), then unknowns.
 * Positive = the profile marks the label positive and the model is at least 50% on it.
 */
export function evidenceTicks(p: Pick<Profile, "gate2">, answers: Answer[], ev: Evidence | undefined, city: string, max = 3): Tick[] {
  // An answer about a specific evidence field is shown only when that field exists for this company.
  const supported = answers.filter((a) => {
    const f = p.gate2.find((x) => x.id === a.questionId)?.evidenceField;
    return !f || f in (ev?.fields ?? {}) || !f.startsWith("apollo_");
  });
  const ticks = supported.map((a): Tick => {
    const q = p.gate2.find((x) => x.id === a.questionId);
    const kind: Tick["kind"] = a.choice === "unknown" ? "unknown" : q?.positive?.includes(a.choice) && a.probability >= 0.5 ? "yes" : "no";
    const source = kind === "yes" && q?.evidenceField ? firstUrl(ev?.fields[q.evidenceField]) : undefined;
    const favicon = source ? faviconFor(source, ev?.sources ?? []) : undefined;
    return { kind, text: plainOf(q, a, city), questionId: a.questionId, ...(source ? { source } : {}), ...(favicon ? { favicon } : {}) };
  });
  const order: Record<Tick["kind"], number> = { yes: 0, unknown: 1, fact: 2, no: 3 };
  return [...ticks].sort((a, b) => order[a.kind] - order[b.kind]).slice(0, max);
}

/** One-line plain reason for a "check yourself" card, from the stored answers only. */
export function reviewReason(r: Pick<CompanyResult, "action" | "gate2">, threshold: number, labels?: Record<string, string>): string {
  if (!r.action) return "The AI could not reach a decision for this company.";
  const unknown = r.gate2.filter((a) => a.choice === "unknown").length;
  const ranked = Object.entries(r.action.probabilities).sort((a, b) => b[1] - a[1]);
  const runnerUp = ranked[1]?.[0];
  const top = `${actionName(r.action.choice, labels)} was only ${Math.round(r.action.probability * 100)}% sure (your bar is ${Math.round(threshold * 100)}%)`;
  const facts = unknown ? `, and ${unknown} of ${r.gate2.length} facts could not be confirmed` : "";
  const alt = runnerUp ? `. Next best: ${actionName(runnerUp, labels)}` : "";
  return `${top}${facts}${alt}.`;
}

export type CardState = "checking" | "reading" | "deciding" | "decided" | "no_fit" | "failed";

export const CARD_STATE_TEXT: Readonly<Record<CardState, string>> = {
  checking: "Checking fit…",
  reading: "Reading the news…",
  deciding: "Deciding…",
  decided: "",
  no_fit: "Doesn't fit your profile",
  failed: "Couldn't check this one",
};

/** Human state of a company from its result so far. */
export function cardState(r: Pick<CompanyResult, "stage" | "gate1" | "evidence" | "action" | "error">, done: boolean): CardState {
  if (r.stage === "dropped_gate1") return "no_fit";
  if (r.stage === "actioned" || r.stage === "review") return "decided";
  // The run has ended (finished or interrupted) and this company never got a decision.
  if (done) return "failed";
  if (r.stage === "error") return "failed";
  if (r.evidence) return "deciding";
  if (r.gate1) return "reading";
  return "checking";
}

export interface Progress {
  found: number;
  checked: number;
  decided: number;
}

export function progressOf(results: Array<Pick<CompanyResult, "stage" | "gate1">>): Progress {
  return {
    found: results.length,
    checked: results.filter((r) => r.gate1).length,
    decided: results.filter((r) => r.stage === "actioned" || r.stage === "review" || r.stage === "dropped_gate1").length,
  };
}

/** Plain facts straight from company data: "Team grew 25% in a year", "Raised Series A, Mar 2026". */
export function companyDataTicks(e: Enrichment | undefined): Tick[] {
  if (!e?.matched) return [];
  const out: Tick[] = [];
  const g = growthPct(e.fields.organization_headcount_twelve_month_growth);
  if (g !== undefined && g !== 0) out.push({ kind: g > 0 ? "yes" : "no", text: g > 0 ? `Team grew ${g}% in a year` : `Team shrank ${-g}% in a year`, via: "Apollo" });
  const f = latestFunding(e);
  if (f) {
    // A round counts as a signal only within the funding signal's recency window (12 months) of when the data
    // was fetched; older rounds are just facts.
    const ref = Number.isFinite(Date.parse(e.fetchedAt)) ? e.fetchedAt : new Date().toISOString();
    const recent = isRecent(e.fields.latest_funding_round_date, ref, signalById("funding_recent")?.recencyMonths);
    out.push({ kind: recent ? "yes" : "fact", text: `Raised ${f.stage}${f.when ? `, ${f.when}` : ""}`, via: "Apollo" });
  }
  return out;
}

/** Ticks for a decided card: company-data facts first, then the decider's answers, without repeating a topic. */
export function cardTicks(p: Pick<Profile, "gate2">, r: Pick<CompanyResult, "gate2" | "evidence" | "enrichment">, city: string, max = 3): Tick[] {
  const data = companyDataTicks(r.enrichment);
  const covered = new Set<string>();
  if (data.some((t) => t.text.startsWith("Team"))) ["headcount_growing_12m", "growing"].forEach((q) => covered.add(q));
  if (data.some((t) => t.text.startsWith("Raised"))) covered.add("funding_recent");
  const answers = evidenceTicks(p, r.gate2, r.evidence, city, r.gate2.length).filter((t) => !covered.has(t.questionId ?? ""));
  return [...data, ...answers].slice(0, max);
}

/** Verdict sentence for a "check yourself" card: it explains the doubt, not the leaning action. */
export function reviewVerdict(action: Answer | undefined, labels?: Record<string, string>): string {
  if (!action) return "The AI could not reach a decision for this company.";
  const label = actionName(action.choice, labels);
  return `The AI leans towards ${label.charAt(0).toLowerCase()}${label.slice(1)} but is only ${Math.round(action.probability * 100)}% sure.`;
}

/** Plain note when a known headcount falls outside the profile's size range. Undefined when inside or unknown. */
export function sizeNote(employees: number | undefined, range: { min: number; max: number }, source?: string): string | undefined {
  if (typeof employees !== "number" || employees <= 0) return undefined;
  const tail = `(${employees} people${source ? ` · ${source}` : ""})`;
  if (employees > range.max) return `Bigger than your range ${tail}`;
  if (employees < range.min) return `Smaller than your range ${tail}`;
  return undefined;
}

/** The step-3 headline names the first action that has companies; the rest follows in plain words. */
export function briefing(c: Record<Bucket, number>): { headline: string; rest: string } {
  const co = (n: number) => `${n} ${n === 1 ? "company" : "companies"}`;
  const lead: Record<Bucket, (n: number) => string> = {
    call: (n) => `Call ${co(n)} this week.`,
    email: (n) => `Email ${co(n)}.`,
    check: (n) => `Check ${co(n)} yourself.`,
    later: () => "Nothing urgent this week.",
  };
  const parts: Array<[Bucket, string]> = [["call", "to call this week"], ["email", "to email"], ["check", "to check yourself"], ["later", "for later"]];
  const first = parts.find(([b]) => c[b] > 0);
  if (!first) return { headline: "Nothing decided yet.", rest: "" };
  const headline = lead[first[0]](c[first[0]]);
  const rest = parts
    .filter(([b]) => b !== first[0] || first[0] === "later")
    .filter(([b]) => c[b] > 0)
    .map(([b, t]) => `${c[b]} ${t}`)
    .join(", ");
  return { headline, rest: rest ? `${first[0] === "later" ? "" : "Then "}${rest}.` : "" };
}

export const BUCKET_RANK: Readonly<Record<Bucket, number>> = { call: 0, email: 1, check: 2, later: 3 };

/**
 * Step-2 list order: companies still being checked first (in the order found), then decided ones by column
 * (call, email, check, not now) and by confidence, highest first.
 */
export function listOrder<T extends { index: number; bucket?: Bucket; p?: number }>(rows: ReadonlyArray<T>): T[] {
  return [...rows].sort((a, b) => {
    if (!a.bucket || !b.bucket) return a.bucket ? 1 : b.bucket ? -1 : a.index - b.index;
    return BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket] || (b.p ?? 0) - (a.p ?? 0) || a.index - b.index;
  });
}

/**
 * A run note in plain words for non-expert views. Raw provider messages (HTTP codes, bodies) never reach Simple;
 * Pro keeps the originals in its event log.
 */
export function plainNote(note: string): string {
  const source = note.match(/^(Linkup|Cala|Sample companies) discovery stopped/)?.[1];
  if (source) return /no API key/i.test(note) ? `${source === "Linkup" ? "Web search" : "Company data search"} is not set up, so it was skipped.` : `${source === "Linkup" ? "Web search" : "Company data search"} did not answer, so fewer companies were found.`;
  if (/^Company data \(Apollo\) skipped/.test(note)) return "Company data was not available for some companies.";
  if (/Jev rejected the API key/.test(note)) return "The AI decider was not available: decisions below come from a simple keyword rule, not the AI.";
  if (/budget reached/i.test(note)) return "This session's search budget is used up: use a saved example.";
  return "Something did not work as expected for part of this search.";
}

/** The end state of a run that stopped early, in plain words. Undefined when the run finished normally. */
export function interruptedNote(status: string, decided: number, total: number): string | undefined {
  if (status !== "interrupted") return undefined;
  return `The search stopped before it finished. ${decided} of ${total} companies were decided; the others are marked "Couldn't check this one".`;
}
