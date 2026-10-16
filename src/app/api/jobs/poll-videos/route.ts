import { requireSession } from "@/server/auth/session";
import { pollHeyGenJobs } from "@/server/jobs/poll-heygen";
import { processPendingSlideshowJobs } from "@/server/jobs/run-slideshow";
import { processPendingStockSlideshowJobs } from "@/server/jobs/run-stock-slideshow";
import { apiHandler, jsonOk } from "@/lib/api";

/** Kick pending video jobs and return how many were processed. */
export async function POST() {
  return apiHandler(async () => {
    await requireSession();

    const heygen = await pollHeyGenJobs();
    const slideshow = await processPendingSlideshowJobs();
    const stockSlideshow = await processPendingStockSlideshowJobs();

    const processed =
      (heygen.processed ?? 0) +
      (slideshow.processed ?? 0) +
      (stockSlideshow.processed ?? 0);

    return jsonOk({
      processed,
      heygen: heygen.processed ?? 0,
      slideshow: slideshow.processed ?? 0,
      stockSlideshow: stockSlideshow.processed ?? 0,
    });
  });
}
