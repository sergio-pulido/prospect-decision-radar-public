// The ONLY organization fields kept from Apollo. Everything else in the response is dropped before
// anything is stored, logged or shown, so no personal data can reach a run file.
export const APOLLO_ORG_ALLOWLIST = [
  "name",
  "primary_domain",
  "estimated_num_employees",
  "industry",
  "city",
  "street_address",
  "postal_code",
  "country",
  "raw_address",
  "total_funding_printed",
  "latest_funding_round_date",
  "latest_funding_stage",
  "funding_events",
  // Headcount growth: exact names confirmed by the probe (docs/provider-shapes.md).
  "organization_headcount_six_month_growth",
  "organization_headcount_twelve_month_growth",
  "organization_headcount_twenty_four_month_growth",
] as const;

/** Fields kept inside each funding event (company-level round data only). */
export const APOLLO_FUNDING_EVENT_ALLOWLIST = ["date", "type", "amount", "currency"] as const;

export function pickAllowed(org: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of APOLLO_ORG_ALLOWLIST) {
    if (!(k in org)) continue;
    if (k === "funding_events" && Array.isArray(org[k])) {
      out[k] = (org[k] as Array<Record<string, unknown>>).map((e) =>
        Object.fromEntries(APOLLO_FUNDING_EVENT_ALLOWLIST.filter((f) => f in e).map((f) => [f, e[f]])),
      );
    } else {
      out[k] = org[k];
    }
  }
  return out;
}
