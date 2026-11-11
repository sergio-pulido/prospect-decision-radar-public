// Apollo organization enrichment. ONLY GET /api/v1/organizations/enrich (docs.apollo.io/reference/organization-enrichment).
// Never a people or contact endpoint. Responses pass through an allowlist before anything is stored.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { knownHeadcount } from "../../core/enrichment";
import { normName } from "../../core/pipeline";
import type { Company, Enrichment, EnrichmentProvider, Profile } from "../../core/types";
import { HTTP_TIMEOUT_MS } from "../../core/timeout";
import { spendCall } from "../budget";
import { geocodeAddress } from "../geocode/mapbox";
import { pickAllowed } from "./allowlist";

const ENDPOINT = "https://api.apollo.io/api/v1/organizations/enrich";
const cacheFile = () => path.join(process.env.RADAR_ROOT ?? process.cwd(), "runs", "apollo-cache.json");

/** Bare domain from a website: no scheme, no www, no path. Undefined when unusable. */
export function domainOf(website: string | undefined): string | undefined {
  if (!website) return undefined;
  const host = website.trim().replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "").split(/[/?#@]/)[0]?.toLowerCase();
  return host && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : undefined;
}

/** The organization Apollo returned must be the company we asked about (a directory site would not match). */
export function namesMatch(company: string, org: string | undefined): boolean {
  const a = normName(company);
  const b = normName(org ?? "");
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a) || a.split(" ")[0] === b.split(" ")[0];
}

type Cache = Record<string, Enrichment>;
function readCache(): Cache {
  try {
    return JSON.parse(readFileSync(cacheFile(), "utf8")) as Cache;
  } catch {
    return {};
  }
}
function writeCache(c: Cache): void {
  mkdirSync(path.dirname(cacheFile()), { recursive: true });
  writeFileSync(cacheFile(), JSON.stringify(c, null, 2));
}

// Set when Apollo answers 401/403: the provider is off for this process.
let blocked = "";
export const apolloBlocked = (): string => blocked;

export class ApolloEnrichmentProvider implements EnrichmentProvider {
  readonly mode = "live" as const;
  constructor(private readonly apiKey: string) {}

  knownEmployees(company: Company): number | undefined {
    const d = domainOf(company.website);
    const hit = d ? readCache()[d] : undefined;
    return knownHeadcount(hit);
  }

  async enrich(company: Company, profile: Profile): Promise<Enrichment | null> {
    const domain = domainOf(company.website);
    if (!domain) return null;
    const cache = readCache();
    if (cache[domain]) return { ...cache[domain]!, cached: true };
    if (blocked) throw new Error(blocked);
    spendCall("apollo");
    const res = await fetch(`${ENDPOINT}?domain=${encodeURIComponent(domain)}`, { headers: { "x-api-key": this.apiKey, accept: "application/json" }, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS.apollo) });
    if (res.status === 401 || res.status === 403) {
      blocked = "Apollo key not allowed for this endpoint";
      throw new Error(blocked);
    }
    if (!res.ok) throw new Error(`Apollo HTTP ${res.status}`);
    const org = ((await res.json()) as { organization?: Record<string, unknown> | null }).organization;
    const fetchedAt = new Date().toISOString();
    if (!org) return { source: "apollo", mode: "live", domain, matched: false, fields: {}, fetchedAt };
    const kept = pickAllowed(org) as Enrichment["fields"];
    const matched = namesMatch(company.name, kept.name);
    // A non-matching organization is someone else's data: keep nothing but the fact that it did not match.
    const e: Enrichment = { source: "apollo", mode: "live", domain, matched, fields: matched ? kept : {}, fetchedAt };
    if (matched && kept.street_address) {
      const city = profile.cities.find((c) => (kept.city ?? company.city ?? "").toLowerCase().includes(c.toLowerCase()));
      const near = city ? profile.cityCoordinates?.[city] : undefined;
      if (near) {
        const query = [kept.street_address, kept.postal_code, kept.city, kept.country].filter(Boolean).join(", ");
        const pt = await geocodeAddress(query, near).catch(() => null);
        if (pt) e.location = { ...pt, precision: "address", query };
      }
    }
    writeCache({ ...readCache(), [domain]: e });
    return e;
  }
}

/** Fixture enrichment: NOT Apollo. Only for the fictional sample companies, labelled fixture. */
export class FixtureEnrichment implements EnrichmentProvider {
  readonly mode = "fixture" as const;
  async enrich(company: Company): Promise<Enrichment | null> {
    const domain = domainOf(company.website);
    if (!domain || company.discoveredBy !== "fixture") return null;
    return {
      source: "apollo",
      mode: "fixture",
      domain,
      matched: true,
      fields: { name: company.name, estimated_num_employees: company.employees, organization_headcount_twelve_month_growth: 0.2 },
      fetchedAt: new Date().toISOString(),
    };
  }
}
