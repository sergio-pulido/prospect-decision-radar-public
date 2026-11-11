// Mapbox Geocoding v6 forward, server-side, with the public pk token. Observed shape: docs/provider-shapes.md.
// Used only for company office addresses from enrichment. Returns a point only for a confident street address
// close to the target city; anything vaguer returns null (the map keeps the approximate city-level pin).
import { HTTP_TIMEOUT_MS } from "../../core/timeout";
import { spendCall } from "../budget";

const ENDPOINT = "https://api.mapbox.com/search/geocode/v6/forward";
const MAX_KM_FROM_CITY = 40;

interface GeocodeFeature {
  properties?: {
    feature_type?: string;
    coordinates?: { longitude?: number; latitude?: number };
    match_code?: { confidence?: string };
  };
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export async function geocodeAddress(query: string, near: { lat: number; lng: number }): Promise<{ lat: number; lng: number } | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  if (!token.startsWith("pk.")) return null;
  spendCall("geocode");
  const url = `${ENDPOINT}?q=${encodeURIComponent(query)}&limit=1&proximity=${near.lng},${near.lat}&access_token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS.geocode) });
  if (!res.ok) throw new Error(`Mapbox geocoding HTTP ${res.status}`);
  const f = ((await res.json()) as { features?: GeocodeFeature[] }).features?.[0]?.properties;
  const lng = f?.coordinates?.longitude;
  const lat = f?.coordinates?.latitude;
  const confident = f?.match_code?.confidence === "exact" || f?.match_code?.confidence === "high";
  if (f?.feature_type !== "address" || !confident || typeof lat !== "number" || typeof lng !== "number") return null;
  return km(near, { lat, lng }) <= MAX_KM_FROM_CITY ? { lat, lng } : null;
}
