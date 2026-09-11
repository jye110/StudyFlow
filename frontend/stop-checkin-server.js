import { writeFile } from "node:fs/promises";

export default async function stopCheckinServer() {
  await writeFile(new URL("../tmp/checkin-server.stop", import.meta.url), "stop\n");
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch("http://127.0.0.1:5001/api/health", { signal: AbortSignal.timeout(500) });
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The isolated check-in test server did not shut down.");
}
