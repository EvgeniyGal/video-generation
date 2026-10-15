import cron from "node-cron";
import { processPendingCarouselJobs } from "./run-carousel";
import { processPendingStockCarouselJobs } from "./run-stock-carousel";
import { pollHeyGenJobs } from "./poll-heygen";
import { processPendingSlideshowJobs } from "./run-slideshow";
import { processPendingStockSlideshowJobs } from "./run-stock-slideshow";
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

  // Pick up pending slideshow jobs (also kicked immediately on enqueue)
  cron.schedule("*/1 * * * *", async () => {
    try {
      const result = await processPendingSlideshowJobs();
      if (result.processed > 0) {
        console.log(`[jobs] slideshow processed=${result.processed}`);
      }
    } catch (err) {
      console.error("[jobs] slideshow poll error", err);
    }
  });

  // Pick up pending carousel jobs
  cron.schedule("*/1 * * * *", async () => {
    try {
      const result = await processPendingCarouselJobs();
      if (result.processed > 0) {
        console.log(`[jobs] carousel processed=${result.processed}`);
      }
    } catch (err) {
      console.error("[jobs] carousel poll error", err);
    }
  });

  // Pick up pending stock carousel jobs
  cron.schedule("*/1 * * * *", async () => {
    try {
      const result = await processPendingStockCarouselJobs();
      if (result.processed > 0) {
        console.log(`[jobs] stock-carousel processed=${result.processed}`);
      }
    } catch (err) {
      console.error("[jobs] stock-carousel poll error", err);
    }
  });

  // Pick up pending stock slideshow jobs
  cron.schedule("*/1 * * * *", async () => {
    try {
      const result = await processPendingStockSlideshowJobs();
      if (result.processed > 0) {
        console.log(`[jobs] stock-slideshow processed=${result.processed}`);
      }
    } catch (err) {
      console.error("[jobs] stock-slideshow poll error", err);
    }
  });

  // Buffer post status + metrics every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
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
