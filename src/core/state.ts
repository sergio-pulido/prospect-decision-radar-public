// Builds the plain-text "state" Jev evaluates. Company-level data only.
import { signalById } from "./signals";
import type { Answer, Company, Evidence, Profile } from "./types";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Deterministic pre-check over cheap data. Feeds gate 1 as a hint, never decides alone. */
export function ruleCheck(c: Company, p: Profile): "fit" | "no_fit" | "unknown" {
  const checks: Array<boolean | null> = [];
  checks.push(c.city ? p.cities.some((city) => norm(c.city!).includes(norm(city))) : null);
  checks.push(
    typeof c.employees === "number"
      ? c.employees >= p.sizeRange.min && c.employees <= p.sizeRange.max
      : null,
  );
  // An empty sector list means "any sector".
  checks.push(
    !p.sectors.length ? true : c.sector ? p.sectors.some((s) => norm(c.sector!).includes(norm(s)) || norm(s).includes(norm(c.sector!))) : null,
  );
  if (checks.some((x) => x === false)) return "no_fit";
  if (checks.some((x) => x === null)) return "unknown";
  return "fit";
}

/** Reference date for recency rules ("in the last 12 months"). Overridable for tests. */
let referenceDate = (): string => new Date().toISOString().slice(0, 10);
export function setReferenceDate(fn: () => string): void {
  referenceDate = fn;
}

function profileBlock(p: Profile): string {
  const signals = (p.signals ?? []).map((id) => signalById(id)?.label).filter(Boolean);
  return [
    `Seller offer: ${p.offer}`,
    ...(p.buyer ? [`Typical buyer: ${p.buyer}`] : []),
    `Target cities: ${p.cities.join(", ")}`,
    `Target company size: ${p.sizeRange.min}-${p.sizeRange.max} employees`,
    `Target sectors: ${p.sectors.length ? p.sectors.join(", ") : "any"}`,
    ...(signals.length ? [`Buying signals the seller looks for: ${signals.join("; ")}`] : []),
    `Reference date: ${referenceDate()} (recency rules count back from this date)`,
  ].join("\n");
}

function companyBlock(c: Company): string {
  return [
    `Company: ${c.name}`,
    `Website: ${c.website ?? "not stated"}`,
    `City: ${c.city ?? "not stated"}`,
    `Country: ${c.country ?? "not stated"}`,
    `Employees: ${c.employees ?? "not stated"}${c.employeesSource === "apollo" ? " (company data: Apollo)" : ""}`,
    `Sector: ${c.sector ?? "not stated"}`,
    `Description: ${c.description ?? "not stated"}`,
  ].join("\n");
}

export function gate1State(c: Company, p: Profile): string {
  return [
    "# Prospect profile",
    profileBlock(p),
    "",
    "# Company (cheap discovery data)",
    companyBlock(c),
    "",
    `rule_check: ${ruleCheck(c, p)}`,
  ].join("\n");
}

function domainOf(url: string): string {
  const m = url.match(/^[a-z]+:\/\/([^/?#]+)/i);
  return (m?.[1] ?? "").replace(/^www\./, "").toLowerCase();
}

export function gate2State(c: Company, p: Profile, e: Evidence): string {
  const fields = p.research.fields
    .map((f) => `${f.id}: ${e.fields[f.id] ?? "not stated"}`)
    .join("\n");
  // Company data from enrichment (fields named apollo_*), shown as its own block.
  const companyData = Object.entries(e.fields)
    .filter(([k, v]) => k.startsWith("apollo_") && v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  // Sources by domain only. Titles and URL paths restate facts ("X raises $50M"), which would let the
  // decision see evidence that is not in the fields above and make removing a field meaningless.
  const domains = [...new Set(e.sources.map((s) => domainOf(s.url)).filter(Boolean))];
  const sources = domains.length
    ? `${e.sources.length} sources from ${domains.length} domains: ${domains.slice(0, 15).join(", ")}${domains.length > 15 ? ", …" : ""}`
    : "none";
  return [
    "# Prospect profile",
    profileBlock(p),
    "",
    "# Company",
    companyBlock(c),
    "",
    "# Research evidence (answer only from this; if it is not stated, choose unknown)",
    fields,
    ...(companyData ? ["", "# Company data (Apollo)", companyData] : []),
    "",
    "# Sources (domains only; the facts are in the evidence fields above)",
    sources,
  ].join("\n");
}

/** Positive answers count only when the model is reasonably sure. */
export function signalStrength(p: Profile, answers: Answer[]): { strength: string; positives: number; unknowns: number } {
  let positives = 0;
  let unknowns = 0;
  for (const a of answers) {
    const q = p.gate2.find((x) => x.id === a.questionId);
    if (!q) continue;
    if (a.choice === "unknown") unknowns++;
    if (q.positive?.includes(a.choice) && a.probability >= 0.5) positives++;
  }
  const strength = positives >= 4 ? "strong" : positives === 3 ? "medium" : positives >= 1 ? "weak" : "none";
  return { strength, positives, unknowns };
}

/** Headcount vs the profile's size range, from the company's current headcount (Apollo when enriched). */
export function sizeCheck(c: Company, p: Profile): string {
  if (typeof c.employees !== "number" || c.employees <= 0) return "unknown (no headcount)";
  const src = c.employeesSource === "apollo" ? ", Apollo" : "";
  const target = `target ${p.sizeRange.min}-${p.sizeRange.max}`;
  if (c.employees > p.sizeRange.max) return `OUTSIDE the target size range: bigger (${c.employees} employees${src}; ${target})`;
  if (c.employees < p.sizeRange.min) return `OUTSIDE the target size range: smaller (${c.employees} employees${src}; ${target})`;
  return `within the target size range (${c.employees} employees${src}; ${target})`;
}

export function actionState(c: Company, p: Profile, e: Evidence, answers: Answer[]): string {
  const { strength, positives, unknowns } = signalStrength(p, answers);
  const coverage = unknowns >= 4 ? "low" : unknowns >= 2 ? "medium" : "high";
  const qa = answers
    .map((a) => `- ${a.question} => ${a.choice} (p=${a.probability.toFixed(2)})`)
    .join("\n");
  return [
    gate2State(c, p, e),
    "",
    "# Factual answers already established",
    qa,
    "",
    `signal_strength: ${strength} (${positives} of ${answers.length} positive)`,
    `evidence_coverage: ${coverage} (${unknowns} unknown)`,
    `size_check: ${sizeCheck(c, p)}`,
  ].join("\n");
}
