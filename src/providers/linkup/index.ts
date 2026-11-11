// Linkup. Docs: https://docs.linkup.so/pages/documentation/endpoints/search/overview.md
// POST https://api.linkup.so/v1/search, Authorization: Bearer <key>
// outputType "structured" + structuredOutputSchema (JSON schema as a string, root object)
// includeSources: true -> response { data, sources: [{ name, url, ... }] }
import { HTTP_TIMEOUT_MS } from "../../core/timeout";
import { spendCall } from "../budget";
import { perCityFor } from "../../core/discovery";
import { readFixture } from "../../core/io";
import type { Company, DiscoveryProvider, DiscoveryReport, Evidence, Profile, ResearchProvider, Source } from "../../core/types";

const ENDPOINT = "https://api.linkup.so/v1/search";

async function linkupStructured<T>(
  apiKey: string,
  q: string,
  schema: object,
  depth: string,
): Promise<{ data: T; sources: Array<Source & { content?: string }> }> {
  const httpsOnly = (u: string | undefined) => (u && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : undefined);
  spendCall("linkup");
  const res = await fetch(ENDPOINT, {
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS.linkup),
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      q,
      depth,
      outputType: "structured",
      structuredOutputSchema: JSON.stringify(schema),
      includeSources: true,
    }),
  });
  if (!res.ok) throw new Error(`Linkup HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: T; sources?: Array<{ name?: string; url?: string; type?: string; content?: string; favicon?: string }> };
  const sources = (json.sources ?? [])
    .filter((s) => s.url && s.type !== "image")
    .map((s) => {
      const favicon = httpsOnly(s.favicon);
      return { name: s.name ?? s.url!, url: s.url!, content: s.content, ...(favicon ? { favicon } : {}) };
    });
  return { data: (json.data ?? (json as unknown as T)), sources };
}

const fill = (tpl: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), tpl);

export class LinkupResearchProvider implements ResearchProvider {
  readonly mode = "live" as const;
  constructor(private readonly apiKey: string, private readonly depth = "standard") {}

  async research(c: Company, p: Profile): Promise<Evidence> {
    const schema = {
      type: "object",
      properties: Object.fromEntries(
        p.research.fields.map((f) => [f.id, { type: "string", description: `${f.description} Write "not stated" if not found.` }]),
      ),
      required: p.research.fields.map((f) => f.id),
    };
    const q = fill(p.research.queryTemplate, {
      company: c.name,
      website: c.website ?? "unknown website",
      cities: p.cities.join(" and "),
    });
    const { data, sources } = await linkupStructured<Record<string, unknown>>(this.apiKey, q, schema, this.depth);
    const fields: Record<string, string | null> = {};
    for (const f of p.research.fields) {
      const v = data?.[f.id];
      fields[f.id] = typeof v === "string" && v.trim() && !/^not stated\.?$/i.test(v.trim()) ? v.trim() : null;
    }
    return { mode: "live", fields, sources: sources.map(({ content: _c, ...src }) => src) };
  }
}

export class LinkupFixtureResearch implements ResearchProvider {
  readonly mode = "fixture" as const;
  async research(c: Company, p: Profile): Promise<Evidence> {
    const all = await readFixture<Record<string, { fields: Record<string, string | null>; sources: Source[] }>>("research.json");
    const hit = all[c.name];
    const fields: Record<string, string | null> = {};
    for (const f of p.research.fields) fields[f.id] = hit?.fields[f.id] ?? null;
    return { mode: "fixture", fields, sources: hit?.sources ?? [] };
  }
}

/** Sources from a discovery answer that mention this company (by name or domain), max 3. */
function sourcesFor(name: string, website: string | undefined, sources: Array<Source & { content?: string }>): Source[] {
  const n = name.trim().toLowerCase();
  const domain = website?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]?.toLowerCase();
  if (!n) return [];
  return sources
    .filter(
      (s) =>
        s.name.toLowerCase().includes(n) ||
        (s.content ?? "").toLowerCase().includes(n) ||
        (domain ? s.url.toLowerCase().includes(domain) : false),
    )
    .slice(0, 3)
    .map(({ content: _c, ...src }) => src);
}

export class LinkupDiscoveryProvider implements DiscoveryProvider {
  readonly mode = "live" as const;
  readonly name = "linkup" as const;
  constructor(private readonly apiKey: string, private readonly depth = "standard") {}

  async discover(p: Profile, limit: number, report?: (r: DiscoveryReport) => void): Promise<Company[]> {
    const schema = {
      type: "object",
      properties: {
        companies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              website: { type: "string", description: "Official company website domain, e.g. example.com" },
              city: { type: "string" },
              country: { type: "string" },
              employees: { type: "number", description: "Approximate headcount" },
              sector: { type: "string" },
              description: { type: "string", description: "One sentence, company-level only" },
            },
            // The website is required: company enrichment (Apollo) is only ever called with a domain.
            required: ["name", "website"],
          },
        },
      },
      required: ["companies"],
    };
    const perCity = perCityFor(p, "linkup", limit);
    const batches = await Promise.all(
      p.cities.map(async (city) => {
        const q = fill(p.discovery.linkupQuery, {
          city,
          sectors: p.sectors.join(", "),
          min: String(p.sizeRange.min),
          max: String(p.sizeRange.max),
          n: String(perCity),
        });
        const t0 = Date.now();
        report?.({ status: "sent", provider: "linkup", mode: "live", query: q, city, count: 0, ms: 0 });
        let data: { companies?: Array<Partial<Company>> };
        let sources: Array<Source & { content?: string }>;
        try {
          ({ data, sources } = await linkupStructured<{ companies?: Array<Partial<Company>> }>(this.apiKey, q, schema, this.depth));
        } catch (e) {
          report?.({ status: "done", provider: "linkup", mode: "live", query: q, city, count: 0, ms: Date.now() - t0, error: (e as Error).message });
          throw e;
        }
        const found = (data.companies ?? []).slice(0, perCity).map((x) => ({
          name: String(x.name ?? "").trim(),
          website: x.website || undefined,
          city: x.city || city,
          country: x.country || undefined,
          employees: typeof x.employees === "number" ? x.employees : undefined,
          sector: x.sector || undefined,
          description: x.description || undefined,
          discoveredBy: "linkup" as const,
          sources: sourcesFor(String(x.name ?? ""), x.website, sources),
        })).filter((c) => c.name);
        report?.({ status: "done", provider: "linkup", mode: "live", query: q, city, count: found.length, ms: Date.now() - t0 });
        return found;
      }),
    );
    return batches.flat().filter((c) => c.name);
  }
}
