// Turns company-level enrichment into evidence lines the decider and the UI can use. Pure.
import type { Enrichment } from "./types";

/** Evidence field ids added from enrichment. All start with "apollo_" so views can group them. */
export const APOLLO_FIELDS = {
  employees: "apollo_employees",
  growth12m: "apollo_headcount_growth_12m",
  growth6m: "apollo_headcount_growth_6m",
  funding: "apollo_latest_funding",
} as const;

/** Observed as a fraction (9.33 = +933%); see docs/provider-shapes.md. */
export function growthPct(v: number | null | undefined): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : undefined;
}

const monthYear = (iso: string | null | undefined): string | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
};

export function latestFunding(e: Enrichment): { stage: string; when?: string; total?: string } | undefined {
  const f = e.fields;
  if (!f.latest_funding_stage) return undefined;
  return { stage: f.latest_funding_stage, when: monthYear(f.latest_funding_round_date), total: f.total_funding_printed ?? undefined };
}

/** Apollo's employee estimate, only when positive (0 means "not known", not "no employees"). */
export function knownHeadcount(e: Enrichment | undefined): number | undefined {
  const n = e?.matched ? e.fields.estimated_num_employees : undefined;
  return typeof n === "number" && n > 0 ? n : undefined;
}

/** Evidence lines (field id -> sentence) from a matched enrichment. Empty when nothing usable. */
export function enrichmentEvidence(e: Enrichment | undefined): Record<string, string> {
  if (!e?.matched) return {};
  const f = e.fields;
  const out: Record<string, string> = {};
  const n = knownHeadcount(e);
  if (n !== undefined) out[APOLLO_FIELDS.employees] = `About ${n} employees (Apollo estimate).`;
  const g12 = growthPct(f.organization_headcount_twelve_month_growth);
  if (g12 !== undefined) out[APOLLO_FIELDS.growth12m] = `Headcount ${g12 >= 0 ? "grew" : "shrank"} ${Math.abs(g12)}% in the last 12 months (Apollo).`;
  const g6 = growthPct(f.organization_headcount_six_month_growth);
  if (g6 !== undefined) out[APOLLO_FIELDS.growth6m] = `Headcount ${g6 >= 0 ? "grew" : "shrank"} ${Math.abs(g6)}% in the last 6 months (Apollo).`;
  const lf = latestFunding(e);
  if (lf) out[APOLLO_FIELDS.funding] = `Latest round: ${lf.stage}${lf.when ? `, ${lf.when}` : ""}${lf.total ? `; total raised ${lf.total}` : ""} (Apollo).`;
  return out;
}
