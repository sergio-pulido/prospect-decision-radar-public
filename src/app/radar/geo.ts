// City-level positions: a city's coordinates plus a small deterministic offset seeded by the company name.
// Never an address. Pure, framework-free.

export interface LatLng {
  lat: number;
  lng: number;
}

/** Max offset per axis, in degrees (~2.8 km of latitude). */
export const MAX_OFFSET_DEG = 0.025;

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Returns [lng, lat], the order Mapbox expects. */
export function approxPosition(name: string, city: LatLng): [number, number] {
  const dLat = (hash01(`${name}#lat`) * 2 - 1) * MAX_OFFSET_DEG;
  const dLng = (hash01(`${name}#lng`) * 2 - 1) * MAX_OFFSET_DEG;
  return [city.lng + dLng, city.lat + dLat];
}

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Pixel position in Web Mercator at a zoom level (256px tiles). */
export function mercatorPx(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
}

export interface LaidOut {
  pos: [number, number];
  /** Which side the label goes, so labels point outwards and never cross the other column. */
  side: "left" | "right";
}

export const LAYOUT_ZOOM = 11;
const ROW_PX = 30;
const COL_PX = 16;

/**
 * Deterministic spread of a city's companies around the city point: two columns (sorted by name),
 * rows ROW_PX apart at LAYOUT_ZOOM, labels pointing outwards. City level only, never an address.
 */
export function layoutAroundCity(names: string[], city: LatLng): Map<string, LaidOut> {
  const sorted = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  const degPerPx = 360 / (256 * 2 ** LAYOUT_ZOOM);
  const latPerPx = degPerPx * Math.cos((city.lat * Math.PI) / 180);
  const rows = Math.ceil(sorted.length / 2);
  const out = new Map<string, LaidOut>();
  sorted.forEach((name, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const dy = (row - (rows - 1) / 2) * ROW_PX;
    const dx = (col === 0 ? -1 : 1) * COL_PX;
    out.set(name, { pos: [city.lng + dx * degPerPx, city.lat - dy * latPerPx], side: col === 0 ? "left" : "right" });
  });
  return out;
}
