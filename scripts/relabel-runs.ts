// One-off, local: re-labels saved runs that name a real customer to their generic preset.
// Usage: pnpm tsx scripts/relabel-runs.ts <runs-dir> <from-profile-id> <to-profile-id> <to-name> <json-of-[from,to]-string-pairs>
// Prints file names only. Never prints run contents.
import { readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const [dir, fromId, toId, toName, pairsJson] = process.argv.slice(2);
if (!dir || !fromId || !toId || !toName || !pairsJson) throw new Error("usage: relabel-runs <dir> <fromId> <toId> <toName> <pairs>");
const pairs = JSON.parse(pairsJson) as Array<[string, string]>;
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const file = path.join(dir, f);
  const before = readFileSync(file, "utf8");
  let s = before;
  for (const [a, b] of pairs) s = s.split(a).join(b);
  if (s.includes(fromId)) s = s.split(fromId).join(toId);
  if (s !== before) {
    const run = JSON.parse(s) as { profile?: { name?: string } };
    if (run.profile) run.profile.name = toName;
    writeFileSync(file, JSON.stringify(run, null, 2));
  }
  const renamed = f.replace(fromId, toId);
  if (renamed !== f) renameSync(file, path.join(dir, renamed));
  if (s !== before || renamed !== f) console.log(`relabelled ${renamed}`);
}
