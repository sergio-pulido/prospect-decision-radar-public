// City-level coordinates for common target cities, so a city added in step 1 can still be mapped.
// City centres only (public, approximate). Never an address.
export const KNOWN_CITIES: Readonly<Record<string, { lat: number; lng: number }>> = {
  "Barcelona": { lat: 41.3874, lng: 2.1686 },
  "Madrid": { lat: 40.4168, lng: -3.7038 },
  "Valencia": { lat: 39.4699, lng: -0.3763 },
  "Lisbon": { lat: 38.7223, lng: -9.1393 },
  "Porto": { lat: 41.1579, lng: -8.6291 },
  "Paris": { lat: 48.8566, lng: 2.3522 },
  "London": { lat: 51.5072, lng: -0.1276 },
  "Berlin": { lat: 52.52, lng: 13.405 },
  "Amsterdam": { lat: 52.3676, lng: 4.9041 },
  "Milan": { lat: 45.4642, lng: 9.19 },
  "São Paulo": { lat: -23.5505, lng: -46.6333 },
  "Rio de Janeiro": { lat: -22.9068, lng: -43.1729 },
  "Mexico City": { lat: 19.4326, lng: -99.1332 },
  "Buenos Aires": { lat: -34.6037, lng: -58.3816 },
  "Bogotá": { lat: 4.711, lng: -74.0721 },
  "New York": { lat: 40.7128, lng: -74.006 },
};

const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Coordinates for a city name (accent and case insensitive), when known. */
export function cityCoordinates(city: string): { lat: number; lng: number } | undefined {
  const k = key(city);
  const hit = Object.keys(KNOWN_CITIES).find((c) => key(c) === k);
  return hit ? KNOWN_CITIES[hit] : undefined;
}
