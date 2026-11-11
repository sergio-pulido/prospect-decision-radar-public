import assert from "node:assert/strict";
import { test } from "node:test";
import { exampleFor, exampleLabel, isExample } from "./examples";

const run = (id: string, profileId: string) => ({ id, profileId, replayable: true, buckets: { call: 2, email: 3, check: 1, later: 2 } });

test("the saved example for a preset wins, else any example, else none", () => {
  const runs = [run("2026-x_workspace", "workspace"), run("example-workspace", "workspace"), run("demo-live", "workspace")];
  assert.equal(exampleFor(runs, "workspace"), "example-workspace");
  assert.equal(exampleFor(runs, "b2b-software-smb"), "example-workspace");
  assert.equal(exampleFor([run("2026-x", "workspace")], "workspace"), undefined);
  assert.equal(isExample("demo-live"), true);
});

test("picker label shows preset and column counts", () => {
  assert.equal(exampleLabel(run("example-workspace", "workspace")), "★ workspace · call 2 · email 3 · check 1 · not now 2");
});
