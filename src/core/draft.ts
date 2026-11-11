// Template-based outreach draft. No generative model. Nothing is ever sent.
import { plainText } from "./dossier";
import type { Answer, Company, Evidence, Profile } from "./types";

export function buildDraft(
  p: Profile,
  action: string,
  c: Company,
  e: Evidence | undefined,
  answers: Answer[],
): string | undefined {
  const tpl = p.draftTemplates[action];
  if (!tpl) return undefined;
  const lines: string[] = [];
  for (const a of answers) {
    const q = p.gate2.find((x) => x.id === a.questionId);
    if (!q?.positive?.includes(a.choice) || a.probability < 0.5) continue;
    const text = q.evidenceField ? e?.fields[q.evidenceField] : undefined;
    // The evidence sentence only: links and "Sources:" stay in the dossier, not in a message to the prospect.
    if (text) lines.push(`- ${plainText(text)}`);
  }
  const city =
    p.cities.find((x) => c.city?.toLowerCase().includes(x.toLowerCase())) ?? c.city ?? p.cities[0] ?? "";
  return tpl
    .replaceAll("{company}", c.name)
    .replaceAll("{city}", city)
    .replaceAll("{offer_name}", p.name)
    .replaceAll("{offer}", p.offer.replace(/\.$/, ""))
    .replaceAll("{signals}", lines.length ? lines.join("\n") : "- (no specific signal found)");
}
