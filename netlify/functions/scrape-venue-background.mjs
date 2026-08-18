import { connectLambda, getStore } from '@netlify/blobs';
import { runScrapeVenue, VENUE_SCRAPE_STORE } from './_venueScrape.mjs';

// Background function (the "-background" suffix gives it a 15-minute budget).
// Netlify returns 202 to the caller immediately; this function's return value
// is ignored, so all outcomes are reported through the job blob.
export async function handler(event) {
  connectLambda(event);

  const store = getStore(VENUE_SCRAPE_STORE);
  let jobId;

  try {
    const body = JSON.parse(event.body || '{}');
    jobId = typeof body.jobId === 'string' && body.jobId.trim() ? body.jobId.trim() : undefined;

    if (!jobId) {
      console.error('scrape-venue-background invoked without jobId');
      return { statusCode: 202, body: '' };
    }

    const job = await store.get(jobId, { type: 'json' });
    if (!job || job.status !== 'pending') {
      console.error('scrape-venue-background received unknown or non-pending job', { jobId, status: job?.status });
      return { statusCode: 202, body: '' };
    }

    await store.setJSON(jobId, { ...job, status: 'processing' });

    const data = await runScrapeVenue(job.input);

    await store.setJSON(jobId, {
      ...job,
      status: 'complete',
      data,
      completedAt: new Date().toISOString(),
    });

    console.info('Completed ImmersiveKit venue scrape', { jobId, url: job.input?.url });
  } catch (error) {
    console.error('Background venue scrape failed:', { jobId, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });

    if (jobId) {
      const message = error instanceof Error && error.message ? error.message : 'Scan failed. Please try again.';
      const existing = await store.get(jobId, { type: 'json' }).catch(() => null);
      if (existing) {
        await store.setJSON(jobId, { ...existing, status: 'failed', error: message }).catch((writeErr) => {
          console.error('Failed to record job failure', { jobId, writeErr });
        });
      }
    }
  }

  return { statusCode: 202, body: '' };
}
