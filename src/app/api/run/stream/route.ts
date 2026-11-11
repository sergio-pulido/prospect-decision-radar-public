// NDJSON stream of pipeline events: one JSON object per line, flushed as it happens.
import { saveRun } from "../../../../core/io";
import { runPipeline } from "../../../../core/pipeline";
import type { PipelineEvent, RunRecord } from "../../../../core/types";
import { prepareRun } from "../../../../server/run-request";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const HEARTBEAT_MS = 5_000;

export async function POST(req: Request) {
  const enc = new TextEncoder();
  const lateNotes: string[] = [];
  let push: (e: PipelineEvent) => void = () => {};
  let prepared: Awaited<ReturnType<typeof prepareRun>>;
  try {
    prepared = await prepareRun(await req.json(), (message) => {
      lateNotes.push(message);
      push({ type: "note", message });
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
  const { input, profile, deps, providers, notes } = prepared;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: PipelineEvent) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false; // client went away; the run still finishes and is saved
        }
      };
      push = send;
      // A provider can be silent for tens of seconds (one research call took 44 s): a heartbeat keeps the
      // connection from being dropped as idle while the run is still working.
      const beat = setInterval(() => send({ type: "heartbeat" }), HEARTBEAT_MS);
      try {
        // The pipeline itself emits run_finished (from a finally block), after saving the run.
        const persist = (run: RunRecord) => saveRun({ ...run, notes: [...new Set([...run.notes, ...lateNotes])] });
        await runPipeline(input, profile, { ...deps, onEvent: send, persist }, providers, notes);
      } catch {
        // Already reported to the client as an error event, followed by run_finished.
      } finally {
        clearInterval(beat);
        if (open) controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
