// Applies run-only edits to a profile, in memory. The profile JSON is never written.
import { cityCoordinates } from "./cities";
import { expandSpec } from "./profile";
import { isSignalId } from "./signals";
import type { Profile, ProfileOverride } from "./types";

const MAX_ITEMS = 12;
const MAX_LEN = 60;
const MAX_TEXT = 300;

const cleanList = (xs: unknown): string[] | undefined => {
  if (!Array.isArray(xs)) return undefined;
  const out = [...new Set(xs.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter((x) => x && x.length <= MAX_LEN))];
  return out.length ? out.slice(0, MAX_ITEMS) : undefined;
};

const cleanText = (x: unknown): string | undefined => {
  if (typeof x !== "string") return undefined;
  const t = x.replace(/\s+/g, " ").trim();
  return t && t.length <= MAX_TEXT ? t : undefined;
};

/** Validates untrusted input. Returns undefined when nothing usable is present. */
export function parseOverride(raw: unknown): ProfileOverride | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const cities = cleanList(o.cities);
  const sectors = cleanList(o.sectors);
  const offer = cleanText(o.offer);
  const buyer = cleanText(o.buyer);
  const signals = Array.isArray(o.signals) ? [...new Set(o.signals.filter(isSignalId))] : undefined;
  let sizeRange: ProfileOverride["sizeRange"];
  const sr = o.sizeRange as { min?: unknown; max?: unknown } | undefined;
  if (sr && Number.isFinite(Number(sr.min)) && Number.isFinite(Number(sr.max))) {
    const min = Math.max(1, Math.round(Number(sr.min)));
    const max = Math.max(min, Math.round(Number(sr.max)));
    sizeRange = { min, max: Math.min(max, 1_000_000) };
  }
  const out: ProfileOverride = {
    ...(offer ? { offer } : {}),
    ...(buyer ? { buyer } : {}),
    ...(signals?.length ? { signals } : {}),
    ...(cities ? { cities } : {}),
    ...(sectors ? { sectors } : {}),
    ...(sizeRange ? { sizeRange } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

/** Coordinates for the kept cities: the profile's own first, then the known-city table. */
function coordsFor(cities: string[], own: Profile["cityCoordinates"]): Profile["cityCoordinates"] | undefined {
  const entries = cities.map((c) => [c, own?.[c] ?? cityCoordinates(c)] as const).filter((e): e is readonly [string, { lat: number; lng: number }] => !!e[1]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function applyOverride(p: Profile, o: ProfileOverride | undefined): Profile {
  if (!o) return p;
  const cities = o.cities ?? p.cities;
  const coords = coordsFor(cities, p.cityCoordinates);
  if (p.spec) {
    // Signal-based profile: re-derive questions, fields and drafts from the edited spec.
    return expandSpec({
      ...p.spec,
      cities,
      sectors: o.sectors ?? p.spec.sectors,
      sizeRange: o.sizeRange ?? p.spec.sizeRange,
      offer: o.offer ?? p.spec.offer,
      buyer: o.buyer ?? p.spec.buyer,
      signals: o.signals ?? p.spec.signals,
      cityCoordinates: coords,
    });
  }
  // Explicit (older) profile: only cities, sectors and size can change.
  const { cityCoordinates: _drop, ...rest } = p;
  void _drop;
  return { ...rest, cities, sectors: o.sectors ?? p.sectors, sizeRange: o.sizeRange ?? p.sizeRange, ...(coords ? { cityCoordinates: coords } : {}) };
}
