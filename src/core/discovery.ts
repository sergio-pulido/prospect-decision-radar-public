// Discovery sizing helpers. Pure.
import type { Profile } from "./types";

const DEFAULT_PER_CITY = 4;

/** Per-city cap for one provider. Accepts a single number or a per-provider object. */
export function maxPerCityFor(p: Pick<Profile, "discovery">, provider: "cala" | "linkup"): number {
  const m = p.discovery.maxPerCity;
  const v = typeof m === "number" ? m : m?.[provider];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_PER_CITY;
}

/** Companies to ask for per city: the provider cap, but never more than the run needs. */
export function perCityFor(p: Pick<Profile, "discovery" | "cities">, provider: "cala" | "linkup", limit: number): number {
  return Math.max(1, Math.min(maxPerCityFor(p, provider), Math.ceil(limit / Math.max(1, p.cities.length))));
}
