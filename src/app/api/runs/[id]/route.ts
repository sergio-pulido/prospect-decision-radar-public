import { loadRun } from "../../../../core/io";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return Response.json({ run: await loadRun(id) });
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg.includes("ENOENT") ? "Run not found" : msg }, { status: msg === "Invalid run id" ? 400 : 404 });
  }
}
