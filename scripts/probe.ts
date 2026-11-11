// Probe: exactly one real call per provider. Writes the response SHAPE (keys, types,
// values truncated to 80 chars) to docs/provider-shapes.md. Never prints keys.
try {
  process.loadEnvFile(".env.local");
} catch {}

import { readFile, writeFile } from "node:fs/promises";
import { loadProfile } from "../src/core/io";
import { recordCost, spendCall } from "../src/providers/budget";
import { resolveJevConfig } from "../src/providers/jev";
import { APOLLO_FUNDING_EVENT_ALLOWLIST, APOLLO_ORG_ALLOWLIST } from "../src/providers/apollo/allowlist";

type Shape = string | Shape[] | { [k: string]: Shape };

function shapeOf(v: unknown, depth = 0): Shape {
  if (v === null) return "null";
  if (Array.isArray(v)) {
    if (!v.length) return "array (empty)";
    return [`array (${v.length} items), first item:`, shapeOf(v[0], depth + 1)];
  }
  if (typeof v === "object") {
    if (depth > 5) return "object (deeper levels omitted)";
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shapeOf(x, depth + 1)]));
  }
  const s = String(v);
  return `${typeof v}: ${JSON.stringify(s.length > 80 ? `${s.slice(0, 80)}…` : s)}`;
}

interface ProbeResult {
  provider: string;
  request: string;
  status: number;
  ms: number;
  shape: Shape;
}

async function call(provider: "jev" | "linkup" | "cala", url: string, headers: Record<string, string>, body: object): Promise<ProbeResult> {
  spendCall(provider);
  const t = Date.now();
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  let parsed: unknown = text.slice(0, 200);
  try {
    parsed = JSON.parse(text);
  } catch {}
  const cost = (parsed as { usage?: { cost?: number } })?.usage?.cost;
  if (typeof cost === "number") recordCost(provider, cost);
  return { provider, request: `POST ${url}\n${JSON.stringify(body, null, 2)}`, status: res.status, ms: Date.now() - t, shape: shapeOf(parsed) };
}

const profile = await loadProfile("workspace");
// --only jev|linkup|cala: probe one provider and replace only its section of the doc.
const oi = process.argv.indexOf("--only");
const only = oi >= 0 ? process.argv[oi + 1] : undefined;
const want = (p: string) => !only || only === p;
const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const results: ProbeResult[] = [];

const jev = resolveJevConfig();
if (jev && want("jev")) {
  results.push(
    await call("jev", jev.baseUrl, { Authorization: `Bearer ${jev.apiKey}` }, {
      model: jev.model,
      state: "Company: Example Robotics SL. City: Barcelona. Employees: 45. Raised a 6M EUR Series A in March. Hiring 12 engineers in Barcelona.",
      questions: {
        next_step: {
          type: "choice",
          instructions: "What is the best next commercial step for a flexible-workspace provider?",
          criteria: {
            call_now: "Strong, recent signals of office need in the target city.",
            send_email: "Some signals; a short email is appropriate.",
            nurture: "No clear signal yet.",
          },
        },
      },
    }),
  );
}

const linkupKey = process.env.LINKUP_API_KEY;
if (linkupKey && want("linkup")) {
  results.push(
    await call("linkup", "https://api.linkup.so/v1/search", { Authorization: `Bearer ${linkupKey}` }, {
      q: "Research the company Factorial (factorialhr.com). Company-level facts only: funding in the last 12 months and offices in Barcelona.",
      depth: "standard",
      outputType: "structured",
      structuredOutputSchema: JSON.stringify({
        type: "object",
        properties: {
          funding_last_12_months: { type: "string" },
          office_in_barcelona: { type: "string" },
        },
        required: ["funding_last_12_months", "office_in_barcelona"],
      }),
      includeSources: true,
    }),
  );
}

const calaKey = process.env.CALA_API_KEY;
if (calaKey && want("cala")) {
  const input = profile.discovery.calaQuery
    .replaceAll("{city}", "Barcelona")
    .replaceAll("{sectors}", profile.sectors.join(", "))
    .replaceAll("{min}", String(profile.sizeRange.min))
    .replaceAll("{max}", String(profile.sizeRange.max));
  results.push(await call("cala", "https://api.cala.ai/v1/knowledge/query", { "X-API-KEY": calaKey }, { input, return_entities: true }));
}

// Apollo: GET organizations/enrich only. Values are shown ONLY for allowlisted fields; every other
// key is recorded as key + type, so no personal data reaches the doc.
const apolloKey = process.env.APOLLO_API_KEY;
if (apolloKey && want("apollo")) {
  const domain = arg("domain") ?? "biorce.com";
  const url = `https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`;
  spendCall("apollo");
  const t = Date.now();
  const res = await fetch(url, { headers: { "x-api-key": apolloKey, accept: "application/json" } });
  const text = await res.text();
  let parsed: unknown = text.slice(0, 120);
  try {
    parsed = JSON.parse(text);
  } catch {}
  const typeOnly = (v: unknown): Shape => (v === null ? "null" : Array.isArray(v) ? `array (${v.length})` : typeof v);
  const org = (parsed as { organization?: Record<string, unknown> })?.organization;
  const shape: Shape = org
    ? {
        organization: Object.fromEntries(
          Object.entries(org).map(([k, v]) => {
            if (!(APOLLO_ORG_ALLOWLIST as readonly string[]).includes(k)) return [k, `${typeOnly(v)} (not kept)`];
            if (k === "funding_events" && Array.isArray(v) && v[0] && typeof v[0] === "object") {
              // Event fields go through their own allowlist: e.g. `investors` can name individual people.
              const first = Object.fromEntries(Object.entries(v[0] as Record<string, unknown>).map(([f, x]) =>
                [f, (APOLLO_FUNDING_EVENT_ALLOWLIST as readonly string[]).includes(f) ? shapeOf(x, 2) : `${typeOnly(x)} (not kept)`]));
              return [k, [`array (${v.length} items), first item:`, first]];
            }
            return [k, shapeOf(v, 1)];
          }),
        ),
        ...Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([k]) => k !== "organization").map(([k, v]) => [k, `${typeOnly(v)} (not kept)`])),
      }
    : shapeOf(parsed);
  results.push({ provider: "apollo", request: `GET ${url.replace(/domain=[^&]+/, `domain=${domain}`)}\n(header x-api-key)`, status: res.status, ms: Date.now() - t, shape });
}

// Mapbox geocoding v6 (forward), public token. A company-level office address, never a person's.
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
if (mapboxToken?.startsWith("pk.") && want("geocode")) {
  const q = arg("q") ?? "Avinguda Diagonal 615, 08028 Barcelona, Spain";
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&limit=1&access_token=${mapboxToken}`;
  spendCall("geocode");
  const t = Date.now();
  const res = await fetch(url);
  const parsed = (await res.json().catch(() => null)) as unknown;
  results.push({ provider: "geocode", request: `GET https://api.mapbox.com/search/geocode/v6/forward?q=${q}&limit=1&access_token=<public pk token>`, status: res.status, ms: Date.now() - t, shape: shapeOf(parsed) });
}

const sectionFor = (r: ProbeResult) =>
  [
    `## ${r.provider}`,
    "",
    `HTTP ${r.status}, ${r.ms} ms.`,
    "",
    "Request body:",
    "",
    "```json",
    r.request,
    "```",
    "",
    "Response shape:",
    "",
    "```json",
    JSON.stringify(r.shape, null, 2),
    "```",
    "",
  ].join("\n");

if (only) {
  // Replace just this provider's section, keep the rest of the doc as it was.
  const doc = await readFile("docs/provider-shapes.md", "utf8");
  const start = doc.indexOf(`## ${only}\n`);
  const next = doc.indexOf("\n## ", start + 1);
  const fresh = results.map(sectionFor).join("\n").replace(`## ${only}\n`, `## ${only}\n\nRe-probed ${new Date().toISOString()} with \`pnpm probe -- --only ${only}\`.\n`);
  await writeFile("docs/provider-shapes.md", start < 0 ? `${doc}\n${fresh}` : `${doc.slice(0, start)}${fresh}${next < 0 ? "" : doc.slice(next + 1)}`);
} else {
  const md = [
    "# Provider response shapes (observed)",
    "",
    `Probed ${new Date().toISOString()} with \`pnpm probe\`: one real call per provider. Values truncated to 80 chars. No keys.`,
    "",
    ...results.map(sectionFor),
  ].join("\n");
  await writeFile("docs/provider-shapes.md", md);
}
for (const r of results) console.log(`${r.provider}: HTTP ${r.status} in ${r.ms} ms`);
