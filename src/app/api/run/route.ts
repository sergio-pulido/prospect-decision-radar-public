import { saveRun } from "../../../core/io";
import { runPipeline } from "../../../core/pipeline";
import { prepareRun } from "../../../server/run-request";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const lateNotes: string[] = [];
    const { input, profile, deps, providers, notes } = await prepareRun(await req.json(), (m) => lateNotes.push(m));
    const done = await runPipeline(input, profile, deps, providers, notes);
    const run = { ...done, notes: [...new Set([...done.notes, ...lateNotes])] };
    const file = await saveRun(run);
    return Response.json({ run, file });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
