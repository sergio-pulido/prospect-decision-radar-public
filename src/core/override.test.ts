import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyOverride, parseOverride } from "./override";
import type { Profile } from "./types";

const profile = JSON.parse(readFileSync("src/core/testdata/legacy-explicit-profile.json", "utf8")) as Profile;

test("parseOverride rejects junk and keeps clean values", () => {
  assert.equal(parseOverride(null), undefined);
  assert.equal(parseOverride({ cities: [1, ""] }), undefined);
  assert.deepEqual(parseOverride({ cities: [" Barcelona ", "Barcelona"], sizeRange: { min: "20", max: 5 } }), {
    cities: ["Barcelona"],
    sizeRange: { min: 20, max: 20 },
  });
});

test("applyOverride changes a copy only and keeps coordinates of kept cities", () => {
  const p2 = applyOverride(profile, { cities: ["Barcelona"], sectors: ["fintech"] });
  assert.deepEqual(p2.cities, ["Barcelona"]);
  assert.deepEqual(Object.keys(p2.cityCoordinates ?? {}), ["Barcelona"]);
  assert.deepEqual(p2.sectors, ["fintech"]);
  assert.notEqual(profile.cities.length, 1, "original untouched");
});
