import assert from "node:assert/strict";
import { test } from "node:test";
import { maxPerCityFor, perCityFor } from "./discovery";

const prof = (maxPerCity: unknown) => ({ cities: ["A", "B"], discovery: { linkupQuery: "", calaQuery: "", maxPerCity } }) as never;

test("maxPerCity: single number applies to every provider", () => {
  assert.equal(maxPerCityFor(prof(6), "cala"), 6);
  assert.equal(maxPerCityFor(prof(6), "linkup"), 6);
});

test("maxPerCity: per-provider object, missing provider falls back to default", () => {
  assert.equal(maxPerCityFor(prof({ cala: 4, linkup: 2 }), "cala"), 4);
  assert.equal(maxPerCityFor(prof({ cala: 4, linkup: 2 }), "linkup"), 2);
  assert.equal(maxPerCityFor(prof({ cala: 4 }), "linkup"), 4);
});

test("perCityFor never asks for more than the run needs", () => {
  assert.equal(perCityFor(prof({ cala: 4, linkup: 2 }), "cala", 8), 4);
  assert.equal(perCityFor(prof({ cala: 4, linkup: 2 }), "linkup", 8), 2);
  assert.equal(perCityFor(prof({ cala: 4, linkup: 2 }), "cala", 2), 1);
});
