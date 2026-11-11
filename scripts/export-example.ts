// Writes a keyless saved example to fixtures/ (derived fields only), so "Use a saved example" works on a fresh
// clone with no keys. Usage: pnpm tsx scripts/export-example.ts <run-id> <fixture-name>   (e.g. example-workspace demo-run)
import { readFileSync, writeFileSync } from "node:fs";
import { toFixtureRun } from "../src/core/fixture-run";
import type { RunRecord } from "../src/core/types";

const [id, name] = process.argv.slice(2);
if (!id || !name || !/^[a-z0-9-]+$/.test(name)) throw new Error("usage: export-example <run-id> <fixture-name>");
const run = JSON.parse(readFileSync(`runs/${id}.json`, "utf8")) as RunRecord;
const out = `fixtures/${name}.json`;
writeFileSync(out, JSON.stringify(toFixtureRun(run, id), null, 1) + "\n");
console.log(`wrote ${out} (${Math.round(readFileSync(out).length / 1024)} KB)`);
