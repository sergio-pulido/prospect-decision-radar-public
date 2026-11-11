// Reads an NDJSON response body and hands each parsed event to `onEvent`.
import type { PipelineEvent } from "../../core/types";

export async function readNdjson(res: Response, onEvent: (e: PipelineEvent) => void): Promise<void> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as PipelineEvent);
      nl = buf.indexOf("\n");
    }
    if (done) break;
  }
  if (buf.trim()) onEvent(JSON.parse(buf) as PipelineEvent);
}
