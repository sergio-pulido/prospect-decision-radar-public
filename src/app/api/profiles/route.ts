import { listProfiles } from "../../../core/io";
import { providerStatus } from "../../../providers";

export const dynamic = "force-dynamic";

export async function GET() {
  const profiles = await listProfiles();
  return Response.json({
    // Full profiles: the UI needs questions, options and evidence fields to explain decisions. No secrets in them.
    profiles,
    providers: providerStatus(),
  });
}
