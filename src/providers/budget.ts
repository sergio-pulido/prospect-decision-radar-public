// Session spend guard: counts real provider calls and refuses calls above the cap.
// Persisted to runs/call-ledger.json (gitignored; RADAR_LEDGER overrides the path) so the CLI,
// probe and dev server share one budget.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export type BudgetedProvider = "jev" | "linkup" | "cala" | "apollo" | "geocode";

const capFromEnv = (name: string, fallback: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** Session caps. Override with CAP_JEV, CAP_LINKUP, CAP_CALA. */
export const callCaps = (): Record<BudgetedProvider, number> => ({
  jev: capFromEnv("CAP_JEV", 400),
  linkup: capFromEnv("CAP_LINKUP", 200),
  cala: capFromEnv("CAP_CALA", 60),
  apollo: capFromEnv("CAP_APOLLO", 40),
  geocode: capFromEnv("CAP_GEOCODE", 100),
});

const LABEL: Record<BudgetedProvider, string> = { jev: "Jev", linkup: "Linkup", cala: "Cala", apollo: "Apollo", geocode: "Mapbox geocoding" };

const ledgerFile = () =>
  process.env.RADAR_LEDGER ?? path.join(process.env.RADAR_ROOT ?? process.cwd(), "runs", "call-ledger.json");

export interface Ledger extends Record<BudgetedProvider, number> {
  /** Sum of provider-reported usage.cost per provider (OpenRouter docs: USD / credits). */
  cost: Partial<Record<BudgetedProvider, number>>;
}

export function readLedger(): Ledger {
  try {
    const parsed = JSON.parse(readFileSync(ledgerFile(), "utf8")) as Partial<Ledger>;
    return { jev: parsed.jev ?? 0, linkup: parsed.linkup ?? 0, cala: parsed.cala ?? 0, apollo: parsed.apollo ?? 0, geocode: parsed.geocode ?? 0, cost: parsed.cost ?? {} };
  } catch {
    return { jev: 0, linkup: 0, cala: 0, apollo: 0, geocode: 0, cost: {} };
  }
}

function writeLedger(next: Ledger): void {
  mkdirSync(path.dirname(ledgerFile()), { recursive: true });
  writeFileSync(ledgerFile(), JSON.stringify(next, null, 2));
}

/** Adds a provider-reported cost (e.g. OpenRouter usage.cost) to the session ledger. */
export function recordCost(provider: BudgetedProvider, cost: number): void {
  if (!Number.isFinite(cost) || cost < 0) return;
  const ledger = readLedger();
  writeLedger({ ...ledger, cost: { ...ledger.cost, [provider]: +((ledger.cost[provider] ?? 0) + cost).toFixed(9) } });
}

/** Call right before a real HTTP call. Throws when the session cap would be exceeded. */
export function spendCall(provider: BudgetedProvider): void {
  const ledger = readLedger();
  const cap = callCaps()[provider];
  if (ledger[provider] + 1 > cap) {
    throw new Error(`${LABEL[provider]} budget reached (${cap} calls this session): use Replay`);
  }
  writeLedger({ ...ledger, [provider]: ledger[provider] + 1 });
}
