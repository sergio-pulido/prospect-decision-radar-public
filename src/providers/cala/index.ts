// Cala. Docs: https://docs.cala.ai/quickstart.md and https://docs.cala.ai/api-reference/query.md
// POST https://api.cala.ai/v1/knowledge/query, header X-API-KEY
// body { input: string (natural language or dot notation), return_entities?: boolean }
// Observed 2026-11-10 (docs/provider-shapes.md): results [{ name, website, city, employees: "~150–200", sector }],
// entities [{ id, name, entity_type: "Organization", mentions }]. One call took ~50 s.
import { HTTP_TIMEOUT_MS } from "../../core/timeout";
import { spendCall } from "../budget";
import { perCityFor } from "../../core/discovery";
import { readFixture } from "../../core/io";
import type { Company, DiscoveryProvider, DiscoveryReport, Profile } from "../../core/types";

const ENDPOINT = "https://api.cala.ai/v1/knowledge/query";

const fill = (tpl: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), tpl);

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of Object.keys(o)) if (keys.includes(k.toLowerCase())) return o[k];
  return undefined;
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = v.replace(/,/g, "").match(/\d+/);
    return m ? Number(m[0]) : undefined;
  }
  return undefined;
}

export class CalaDiscoveryProvider implements DiscoveryProvider {
  readonly mode = "live" as const;
  readonly name = "cala" as const;
  constructor(private readonly apiKey: string) {}

  async discover(p: Profile, limit: number, report?: (r: DiscoveryReport) => void): Promise<Company[]> {
    const perCity = perCityFor(p, "cala", limit);
    const batches = await Promise.all(
      p.cities.map(async (city) => {
        const input = fill(p.discovery.calaQuery, {
          city,
          sectors: p.sectors.join(", "),
          min: String(p.sizeRange.min),
          max: String(p.sizeRange.max),
          n: String(perCity),
        });
        const t0 = Date.now();
        const fail = (error: string): never => {
          report?.({ status: "done", provider: "cala", mode: "live", query: input, city, count: 0, ms: Date.now() - t0, error });
          throw new Error(error);
        };
        report?.({ status: "sent", provider: "cala", mode: "live", query: input, city, count: 0, ms: 0 });
        spendCall("cala");
        const res = await fetch(ENDPOINT, {
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS.cala),
          method: "POST",
          headers: { "X-API-KEY": this.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ input, return_entities: true }),
        }).catch((e: Error) => fail(`Cala network error: ${e.message}`));
        if (!res.ok) fail(`Cala HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const json = (await res.json()) as {
          results?: Array<Record<string, unknown>>;
          entities?: Array<{ id?: string; name?: string; entity_type?: string }> | null;
        };
        const rows = (json.results ?? []).map((r) => ({
          name: String(pick(r, ["name", "company", "company_name"]) ?? "").trim(),
          website: (pick(r, ["website", "url", "domain"]) as string | undefined) || undefined,
          city: (pick(r, ["city", "location", "headquarters", "hq"]) as string | undefined) || city,
          // Observed: employees is a string range like "~150–200"; toNumber keeps the lower bound.
          employees: toNumber(pick(r, ["employees", "employee_count", "headcount", "size"])),
          sector: (pick(r, ["sector", "industry"]) as string | undefined) || undefined,
          description: (pick(r, ["description", "summary"]) as string | undefined) || undefined,
          discoveredBy: "cala" as const,
        }));
        // If results carry no names, fall back to Company entities Cala identified.
        const fromEntities = rows.some((r) => r.name)
          ? []
          : (json.entities ?? [])
              .filter((e) => e.entity_type === "Organization" && e.name)
              .map((e) => ({ name: e.name!, city, discoveredBy: "cala" as const }));
        const found = [...rows.filter((r) => r.name), ...fromEntities].slice(0, perCity);
        report?.({ status: "done", provider: "cala", mode: "live", query: input, city, count: found.length, ms: Date.now() - t0 });
        return found;
      }),
    );
    return batches.flat();
  }
}

export class FixtureDiscoveryProvider implements DiscoveryProvider {
  readonly mode = "fixture" as const;
  readonly name = "fixture" as const;
  async discover(_p: Profile, limit: number, report?: (r: DiscoveryReport) => void): Promise<Company[]> {
    const t0 = Date.now();
    const all = await readFixture<Company[]>("companies.json");
    const out = all.slice(0, limit).map((c) => ({ ...c, discoveredBy: "fixture" as const }));
    const query = "Built-in fictional sample companies (fixtures/companies.json)";
    report?.({ status: "sent", provider: "fixture", mode: "fixture", query, count: 0, ms: 0 });
    report?.({ status: "done", provider: "fixture", mode: "fixture", query, count: out.length, ms: Date.now() - t0 });
    return out;
  }
}
