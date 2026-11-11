import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Profile } from "../../core/types";
import { approxPosition, haversineKm } from "./geo";

const profile = JSON.parse(readFileSync("src/core/testdata/legacy-explicit-profile.json", "utf8")) as Profile;
const NAMES = ["Biorce", "Kabilio", "Abzu", "Manychat", "Frente", "Barte", "BHub", "Kamino", "Swap", "Laqus", "Lumora Analytics (fixture)", "ÀÉÎ Ñ Ltda", ""];

test("every company of a city lands within 5 km of that city's cityCoordinates", () => {
  for (const city of profile.cities) {
    const c = profile.cityCoordinates?.[city];
    assert.ok(c, `missing cityCoordinates for ${city}`);
    for (const name of NAMES) {
      const [lng, lat] = approxPosition(name, c);
      const km = haversineKm(c, { lat, lng });
      assert.ok(km <= 5, `${name} in ${city} is ${km.toFixed(2)} km away`);
    }
  }
});

test("position is [lng, lat] and deterministic", () => {
  const bcn = profile.cityCoordinates!["Barcelona"]!;
  const a = approxPosition("Biorce", bcn);
  assert.deepEqual(a, approxPosition("Biorce", bcn));
  assert.ok(Math.abs(a[0] - bcn.lng) < 0.1 && Math.abs(a[1] - bcn.lat) < 0.1, "lng first, lat second");
});

test("layoutAroundCity: no two pins closer than 24px at zoom 11, all near the city", async () => {
  const { layoutAroundCity, mercatorPx, LAYOUT_ZOOM } = await import("./geo");
  const names = Array.from({ length: 14 }, (_, i) => `Company ${String.fromCharCode(65 + i)}`);
  for (const city of profile.cities) {
    const c = profile.cityCoordinates![city]!;
    const laid = [...layoutAroundCity(names, c).values()];
    assert.equal(laid.length, names.length);
    for (let i = 0; i < laid.length; i++) {
      const a = mercatorPx(laid[i]!.pos[0], laid[i]!.pos[1], LAYOUT_ZOOM);
      assert.ok(haversineKm(c, { lng: laid[i]!.pos[0], lat: laid[i]!.pos[1] }) <= 10, "within 10 km");
      for (let j = i + 1; j < laid.length; j++) {
        const b = mercatorPx(laid[j]!.pos[0], laid[j]!.pos[1], LAYOUT_ZOOM);
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 24, `${i}-${j} overlap in ${city}`);
      }
    }
  }
});

test("layoutAroundCity is deterministic and order-independent", async () => {
  const { layoutAroundCity } = await import("./geo");
  const c = profile.cityCoordinates!["Barcelona"]!;
  assert.deepEqual([...layoutAroundCity(["B", "A", "C"], c)].sort(), [...layoutAroundCity(["C", "A", "B"], c)].sort());
});
