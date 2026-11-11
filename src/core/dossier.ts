// Company dossier: everything a run holds about one company, in plain words. Pure TypeScript, no framework.
// Company-level only: personal-profile sources are hidden and the leadership signal never shows a name.
import { actionName, bucketOf, companyDataTicks, sizeNote } from "./plain";
import { isRecent, signalById } from "./signals";
import type { Answer, CompanyResult, DecisionQuestion, Evidence, Profile, Source } from "./types";

// ---------- sources ----------

export const hostOf = (url: string): string =>
  url.replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0]?.toLowerCase() ?? "";

/** Hosts whose pages are profiles of people, whatever the path. */
const PERSON_HOSTS = ["rocketreach.co", "contactout.com", "signalhire.com", "lusha.com", "peoplefinders.com", "spokeo.com", "about.me"];
/** Paths that are a person's profile on otherwise company-level sites. */
const PERSON_PATHS = [/linkedin\.com\/in\//i, /\/people\//i, /\/person\//i, /\/profile\//i, /\/profiles\//i, /zoominfo\.com\/p\//i, /theorg\.com\/org\/[^/]+\/org-chart\//i];

/** True for a URL that is a person's profile (company-level data only, so these are never shown). */
export function isPersonalProfile(url: string): boolean {
  const host = hostOf(url);
  // Profile subdomains (profiles.<data-vendor>, people.<site>) are hidden unless the page is about a company.
  const companyPage = /\/(company|companies|organi[sz]ations?|org)\//i.test(url);
  return (/^(profiles?|people)\./.test(host) && !companyPage) || PERSON_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) || PERSON_PATHS.some((re) => re.test(url));
}

export interface Citation {
  n: number;
  name: string;
  url: string;
  domain: string;
  favicon?: string;
}

export type Segment = { text: string } | { cite: number };

export interface ParsedText {
  segments: Segment[];
  citations: Citation[];
  /** Personal-profile links removed from this text. */
  hidden: number;
}

const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)\]]+[^\s)\].,;:])/g;

/**
 * Splits research text into plain segments and numbered citations ([1] eu-startups.com). Markdown links and bare
 * URLs both count; the same URL keeps one number. A trailing "Sources:" label is dropped (the chips replace it).
 */
export function parseCitations(text: string, sources: ReadonlyArray<Source> = []): ParsedText {
  const citations: Citation[] = [];
  const segments: Segment[] = [];
  let hidden = 0;
  let last = 0;
  const push = (t: string) => {
    if (t) segments.push({ text: t });
  };
  for (const m of text.matchAll(LINK)) {
    push(text.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    const url = m[2] ?? m[3]!;
    if (isPersonalProfile(url)) {
      hidden++;
      continue;
    }
    let c = citations.find((x) => x.url === url);
    if (!c) {
      const fav = sources.find((s) => s.url === url)?.favicon ?? sources.find((s) => s.favicon && hostOf(s.url) === hostOf(url))?.favicon;
      c = { n: citations.length + 1, name: m[1] ?? hostOf(url), url, domain: hostOf(url), ...(fav ? { favicon: fav } : {}) };
      citations.push(c);
    }
    segments.push({ cite: c.n });
  }
  push(text.slice(last));
  // Tidy: drop a dangling "Sources:" label and the separators left between chips.
  const tidy = segments.map((s) => ("text" in s ? { text: s.text.replace(/\s*\(?\s*Sources?:\s*$/i, " ").replace(/^[\s,;()]+$/, " ") } : s));
  return { segments: tidy, citations, hidden };
}

/** The same text with every link to a person's profile removed (markdown links and bare URLs). */
export function stripPersonalLinks(text: string): string {
  return text
    .replace(LINK, (m, _n, mdUrl, bare) => (isPersonalProfile(mdUrl ?? bare) ? "" : m))
    .replace(/,\s*(?=[,.)]|$)/g, "")
    .replace(/\(\s*,\s*/g, "(")
    .replace(/\s{2,}/g, " ");
}

/** Plain text without links (for one-line evidence sentences). */
export function plainText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s*Sources?:\s*[,.;\s]*$/i, "")
    .replace(/\(\s*[,;]?\s*\)/g, "")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** A draft without markdown links or "Sources:" tails, line by line (line breaks kept), ready to paste. */
export function cleanDraft(draft: string): string {
  return draft.split("\n").map((l) => (/\]\(https?:|https?:\/\//.test(l) ? plainText(l) : l)).join("\n");
}

/** The first sentence of a research text, without links. */
export function firstSentence(text: string): string {
  const t = plainText(text);
  const m = t.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : t).trim();
}

export interface SourceItem extends Source {
  cited: boolean;
}

export interface SourceGroup {
  domain: string;
  favicon?: string;
  items: SourceItem[];
}

export interface SourceSummary {
  groups: SourceGroup[];
  consulted: number;
  cited: number;
  domains: number;
  hiddenPersonal: number;
}

/** Every source consulted, grouped by domain (cited first, then by size); personal profiles hidden and counted. */
export function groupSources(sources: ReadonlyArray<Source>, fields: Evidence["fields"], consultedTotal?: number): SourceSummary {
  const texts = Object.values(fields).filter((v): v is string => !!v).join("\n");
  const citedUrls = new Set([...texts.matchAll(LINK)].map((m) => m[2] ?? m[3]!));
  const unique = sources.filter((s, i, a) => a.findIndex((x) => x.url === s.url) === i);
  const hiddenPersonal = unique.filter((s) => isPersonalProfile(s.url)).length;
  const shown = unique.filter((s) => !isPersonalProfile(s.url)).map((s) => ({ ...s, cited: citedUrls.has(s.url) }));
  // A cited URL that is not in the source list (e.g. a link inside the text) still counts and is shown.
  const extra = [...citedUrls].filter((u) => !isPersonalProfile(u) && !shown.some((s) => s.url === u)).map((u) => ({ name: hostOf(u), url: u, cited: true }));
  const all = [...shown, ...extra];
  const byDomain = new Map<string, SourceItem[]>();
  for (const s of all) byDomain.set(hostOf(s.url), [...(byDomain.get(hostOf(s.url)) ?? []), s]);
  const groups = [...byDomain.entries()]
    .map(([domain, items]) => ({ domain, favicon: items.find((i) => i.favicon)?.favicon, items: [...items].sort((a, b) => Number(b.cited) - Number(a.cited)) }))
    .sort((a, b) => Number(b.items.some((i) => i.cited)) - Number(a.items.some((i) => i.cited)) || b.items.length - a.items.length || a.domain.localeCompare(b.domain));
  return {
    groups,
    consulted: Math.max(consultedTotal ?? 0, all.length + hiddenPersonal),
    cited: all.filter((s) => s.cited).length,
    domains: groups.length,
    hiddenPersonal,
  };
}

/** Source titles sometimes arrive HTML-escaped ("Revenue &amp; Financials"). */
export function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" })[e] ?? _);
}

// ---------- evidence per field ----------

/**
 * Research text for a field, ready to show. The leadership field never shows names: only what the decider concluded
 * from it ("Leadership change reported" / "No leadership change reported"), with its source links.
 */
export function fieldText(fieldId: string, text: string | null | undefined, choice = "yes"): string | null {
  if (!text) return null;
  if (fieldId === signalById("leadership_change")?.field.id) {
    const links = [...text.matchAll(LINK)].map((m) => m[0]).filter((l) => !isPersonalProfile(l.match(/https?:\/\/[^)\s]+/)?.[0] ?? "")).join(", ");
    const said = choice === "yes" ? "Leadership change reported." : choice === "no" ? "No leadership change reported." : "Leadership changes: not clear from the sources.";
    return `${said}${links ? ` Sources: ${links}` : ""}`;
  }
  return text;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The most recent date mentioned in a text (month precision), as an ISO date. */
export function latestDate(text: string): string | undefined {
  const t = plainText(text);
  const found: number[] = [];
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})(?:-(\d{2}))?\b/g)) found.push(Date.UTC(+m[1]!, +m[2]! - 1, +(m[3] ?? 1)));
  for (const m of t.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:(\d{1,2}),?\s+)?(\d{4})\b/gi)) found.push(Date.UTC(+m[3]!, MONTHS.indexOf(m[1]!.toLowerCase().slice(0, 3)), +(m[2] ?? 1)));
  for (const m of t.matchAll(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/gi)) found.push(Date.UTC(+m[3]!, MONTHS.indexOf(m[2]!.toLowerCase().slice(0, 3)), +m[1]!));
  const ok = found.filter((n) => Number.isFinite(n));
  return ok.length ? new Date(Math.max(...ok)).toISOString().slice(0, 10) : undefined;
}

export interface Recency {
  label: string;
  within: boolean;
  months: number;
}

/** "Jun 2026 · within 12 months" for signals with a recency rule. Undefined when no date is found or no rule. */
export function recencyOf(questionId: string, text: string | null | undefined, refIso: string): Recency | undefined {
  const months = signalById(questionId)?.recencyMonths;
  const date = months && text ? latestDate(text) : undefined;
  if (!months || !date) return undefined;
  const label = new Date(date).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  return { label, within: isRecent(date, refIso, months), months };
}

// ---------- what pushed it, what we couldn't find, what would change it ----------

export interface Driver {
  kind: "for" | "against";
  text: string;
  questionId?: string;
  evidence?: string;
  field?: string;
  via?: string;
}

const tickFor = (q: DecisionQuestion | undefined, a: Answer, city: string): string =>
  (q?.plain?.[a.choice] ?? signalById(a.questionId)?.tick[a.choice as "yes"] ?? `${a.questionId.replace(/_/g, " ")}: ${a.choice}`).replaceAll("{city}", city);

/**
 * The 2-4 facts that drove the action: positive signals and blockers (a size outside the range, negative answers),
 * ordered so the side that matches the outcome comes first.
 */
export function whatPushed(p: Pick<Profile, "gate2" | "sizeRange">, r: Pick<CompanyResult, "gate2" | "evidence" | "enrichment" | "company" | "action">, threshold: number, city: string): Driver[] {
  const fields = r.evidence?.fields ?? {};
  const out: Driver[] = [];
  const size = sizeNote(r.company.employees, p.sizeRange, r.company.employeesSource === "apollo" ? "Apollo" : undefined);
  if (size) out.push({ kind: "against", text: size.replace(/\s*\(.*$/, ""), evidence: size.match(/\((.*)\)/)?.[1], via: r.company.employeesSource === "apollo" ? "Apollo" : undefined });
  for (const t of companyDataTicks(r.enrichment)) if (t.kind === "yes") out.push({ kind: "for", text: t.text, via: t.via });
  const covered = new Set<string>(out.filter((d) => d.via === "Apollo").map((d) => (d.text.startsWith("Team") ? "headcount_growing_12m" : d.text.startsWith("Raised") ? "funding_recent" : "")));
  const answered = r.gate2.filter((a) => a.choice !== "unknown" && a.probability >= 0.5 && !covered.has(a.questionId) && a.questionId !== "headcount_in_range");
  for (const a of [...answered].sort((x, y) => y.probability - x.probability)) {
    const q = p.gate2.find((x) => x.id === a.questionId);
    if (!q?.positive) continue;
    const field = q.evidenceField;
    const text = field ? fields[field] : undefined;
    out.push({ kind: q.positive.includes(a.choice) ? "for" : "against", text: tickFor(q, a, city), questionId: a.questionId, ...(field ? { field } : {}), ...(text ? { evidence: firstSentence(fieldText(field!, text, a.choice)!) } : {}) });
  }
  const positiveOutcome = ["call", "email"].includes(bucketOf(r.action, threshold));
  const lead = positiveOutcome ? "for" : "against";
  return [...out.filter((d) => d.kind === lead), ...out.filter((d) => d.kind !== lead)].slice(0, 4);
}

/** Answers the decider could not confirm, in plain words. */
export function couldNotFind(p: Pick<Profile, "gate2">, r: Pick<CompanyResult, "gate2">, city: string): string[] {
  return r.gate2.filter((a) => a.choice === "unknown").map((a) => tickFor(p.gate2.find((q) => q.id === a.questionId), a, city));
}

/**
 * Deterministic "what would change it": the profile's buying signals that came back unknown, in the profile's order.
 * Finding any of them would add a positive signal.
 */
export function wouldChange(p: Pick<Profile, "gate2" | "signals">, r: Pick<CompanyResult, "gate2">): string[] {
  const unknown = new Set(r.gate2.filter((a) => a.choice === "unknown").map((a) => a.questionId));
  const ids = p.signals?.length ? p.signals : p.gate2.filter((q) => q.positive?.length).map((q) => q.id);
  return ids.filter((id) => unknown.has(id)).map((id) => signalById(id)?.label ?? id.replace(/_/g, " "));
}

// ---------- the one sentence ----------

const PHRASE: Readonly<Record<string, string>> = {
  funding_recent: "raised funding recently",
  hiring_in_target_cities: "is hiring in {city}",
  expansion_or_new_office: "is expanding in {city}",
  new_product_or_market: "launched something new",
  headcount_growing_12m: "its team grew in the last year",
  work_policy_hybrid: "works hybrid",
  leadership_change: "has new leadership",
  regulatory_or_compliance_trigger: "faces a regulation or deadline",
};

function phraseOf(d: Driver, city: string): string {
  if (d.questionId && d.kind === "for" && PHRASE[d.questionId]) return PHRASE[d.questionId]!.replaceAll("{city}", city);
  if (d.via === "Apollo" && d.text.startsWith("Raised ")) return `raised ${d.text.slice(7).replace(/, (\w+ \d{4})$/, " in $1")}`;
  if (d.via === "Apollo" && d.text.startsWith("Team ")) return `its team ${d.text.slice(5)}`;
  if (/than your range/.test(d.text)) return `is ${d.text.charAt(0).toLowerCase()}${d.text.slice(1)}${d.evidence ? ` (${d.evidence.replace(/ · .*$/, "")})` : ""}`;
  return d.text.charAt(0).toLowerCase() + d.text.slice(1);
}

const joinAnd = (xs: string[]): string => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** "Call this week: raised Series A in Jun 2026 and is hiring in Barcelona." */
export function whySentence(p: Pick<Profile, "gate2" | "sizeRange" | "actionLabels">, r: Pick<CompanyResult, "gate2" | "evidence" | "enrichment" | "company" | "action" | "stage" | "gate1">, threshold: number, city: string): string {
  if (r.stage === "dropped_gate1") return "Not checked further: it does not fit your profile.";
  if (!r.action) return "No decision: the company could not be checked.";
  const bucket = bucketOf(r.action, threshold);
  if (bucket === "check") return `Check yourself: the AI leans to ${actionName(r.action.choice, p.actionLabels).toLowerCase()} but is only ${Math.round(r.action.probability * 100)}% sure.`;
  const drivers = whatPushed(p, r, threshold, city);
  const lead = drivers.filter((d) => d.kind === drivers[0]?.kind).slice(0, 2);
  const label = actionName(r.action.choice, p.actionLabels);
  return lead.length ? `${label}: ${joinAnd(lead.map((d) => phraseOf(d, city)))}.` : `${label}: no clear signal either way.`;
}

// ---------- the decision path ----------

export interface PathStep {
  id: "found" | "fit" | "researched" | "decided";
  title: string;
  detail: string;
  ms?: number;
  state: "done" | "stopped" | "review" | "skipped";
  why?: string;
}

const SOURCE_NAME: Readonly<Record<string, string>> = { linkup: "Linkup", cala: "Cala", manual: "your list", seed: "your list", fixture: "sample data" };

/** Found → Fits your profile → Researched → Decided, with real durations and where it stopped. */
export function decisionPath(r: CompanyResult, threshold: number, labels?: Record<string, string>): PathStep[] {
  const by = (r.company.foundBy ?? [r.company.discoveredBy]).map((s) => SOURCE_NAME[s] ?? s).join(" + ");
  const found: PathStep = { id: "found", title: "Found", detail: by, state: "done" };
  const g1 = r.gate1;
  const dropped = r.stage === "dropped_gate1";
  const fit: PathStep = g1
    ? { id: "fit", title: dropped ? "Outside your profile" : g1.choice === "unknown" ? "Fit unclear, checked anyway" : "Fits your profile", detail: `${Math.round(g1.probability * 100)}%`, ms: r.traces?.gate1?.ms, state: dropped ? "stopped" : "done", ...(dropped ? { why: "Outside your cities, team size or sectors" } : {}) }
    : { id: "fit", title: "Fits your profile", detail: "not checked", state: r.error ? "stopped" : "skipped", ...(r.error ? { why: "Couldn't check this one" } : {}) };
  const n = r.evidence?.sources.length ?? 0;
  const researched: PathStep = r.evidence
    ? { id: "researched", title: "Researched", detail: `${Math.max(n, r.evidence.consulted ?? 0)} sources`, ms: r.timings?.research, state: "done" }
    : { id: "researched", title: "Researched", detail: dropped ? "skipped" : "not finished", state: dropped || !g1 ? "skipped" : "stopped", ...(!dropped && g1 ? { why: "The research did not come back" } : {}) };
  const decideMs = (r.traces?.gate2?.ms ?? 0) + (r.traces?.action?.ms ?? 0);
  const review = r.stage === "review" || (r.action && r.action.probability < threshold);
  const decided: PathStep = r.action
    ? {
        id: "decided",
        title: review ? "Check yourself" : actionName(r.action.choice, labels),
        detail: `${Math.round(r.action.probability * 100)}%`,
        ...(decideMs ? { ms: decideMs } : {}),
        state: review ? "review" : "done",
        ...(review ? { why: `${Math.round(r.action.probability * 100)}% is below your ${Math.round(threshold * 100)}% bar` } : {}),
      }
    : { id: "decided", title: "Decided", detail: "no decision", state: r.evidence ? "stopped" : "skipped" };
  return [found, fit, researched, decided];
}

/** URL-safe id for a company (deep links: ?company=<slug>). */
export function slugOf(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
}
