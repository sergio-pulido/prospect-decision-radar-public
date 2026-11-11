// Radar geometry: deterministic positions from real stage data. Pure functions.
import type { Row } from "./reducer";
import { routeAt } from "./reducer";

export const SIZE = 400;
export const C = SIZE / 2;
export const RINGS = [55, 100, 145, 185] as const;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Index of the sector (profile city) a company belongs to; cities.length = "Other". */
export function sectorOf(city: string | undefined, cities: string[]): number {
  if (!city) return cities.length;
  const i = cities.findIndex((c) => norm(city).includes(norm(c)));
  return i < 0 ? cities.length : i;
}

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export type BlipTone = "queued" | "progress" | "deciding" | "actioned" | "review" | "dropped" | "error";

/** Closer to the centre = closer to a decision. */
export function blipState(row: Row, threshold: number): { radius: number; tone: BlipTone } {
  const r = row.result;
  if (r.stage === "error" || (r.error && row.activity === "done" && !routeAt(r, threshold))) return { radius: RINGS[3], tone: "error" };
  if (r.stage === "dropped_gate1") return { radius: RINGS[3] + 8, tone: "dropped" };
  const route = routeAt(r, threshold);
  // Decided: inner disc, spread by name so blips do not stack on one point.
  if (route) return { radius: 22 + 30 * hash01(`${r.company.name}#r`), tone: route === "review" ? "review" : "actioned" };
  if (row.inFlight) return { radius: r.evidence ? RINGS[0] + 10 : RINGS[2], tone: "deciding" };
  if (r.evidence) return { radius: RINGS[1] - 10, tone: "progress" };
  if (r.gate1) return { radius: RINGS[2] - 10, tone: "progress" };
  return { radius: RINGS[3] - 12, tone: "queued" };
}

export function sectorAngles(i: number, n: number): [number, number] {
  const span = (Math.PI * 2) / n;
  return [-Math.PI / 2 + i * span, -Math.PI / 2 + (i + 1) * span];
}

export function blipXY(name: string, sector: number, sectors: number, radius: number): { x: number; y: number } {
  const [a0, a1] = sectorAngles(sector, sectors);
  const a = a0 + (a1 - a0) * (0.15 + 0.7 * hash01(name));
  return { x: C + radius * Math.cos(a), y: C + radius * Math.sin(a) };
}

export function polar(r: number, a: number): { x: number; y: number } {
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}
