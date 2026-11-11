import { listRuns } from "../../../core/io";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ runs: await listRuns() });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
