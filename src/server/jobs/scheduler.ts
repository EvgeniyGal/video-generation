import cron from "node-cron";
import { pollHeyGenJobs } from "./poll-heygen";
import { syncBufferMetrics } from "./sync-buffer-metrics";

let started = false;

export function startBackgroundJobs() {
  if (started) return;
  started = true;

  // Poll HeyGen every 60 seconds
  cron.schedule("*/1 * * * *", async () => {
    try {
      const result = await pollHeyGenJobs();
      if (result.processed > 0) {
        console.log(`[jobs] heygen poll processed=${result.processed}`);
      }
    } catch (err) {
      console.error("[jobs] heygen poll error", err);
    }
  });

  // Daily Buffer metrics at 06:00 UTC
  cron.schedule("0 6 * * *", async () => {
    try {
      const result = await syncBufferMetrics();
      console.log(
        `[jobs] buffer metrics synced=${result.synced} errors=${result.errors} total=${result.total}`,
      );
    } catch (err) {
      console.error("[jobs] buffer metrics error", err);
    }
  });

  console.log("[jobs] background schedulers started");
}
