import { connectLambda, getStore } from '@netlify/blobs';
import { json, VENUE_SCRAPE_STORE } from './_venueScrape.mjs';

// Polled by the app UI while scrape-venue-background works. The jobId is an
// unguessable UUID handed only to the client that queued the job, so it acts
// as the access capability.
export async function handler(event) {
  connectLambda(event);

  if (event.httpMethod !== 'GET') {
    return json(405, { ok: false, error: 'Method not allowed. Use GET.' });
  }

  const jobId = (event.queryStringParameters?.jobId || '').trim();
  if (!jobId) {
    return json(400, { ok: false, error: 'jobId query parameter is required.' });
  }

  const store = getStore(VENUE_SCRAPE_STORE);
  const job = await store.get(jobId, { type: 'json' });
  if (!job) {
    return json(404, { ok: false, error: 'Unknown scan job.' });
  }

  if (job.status === 'complete') {
    return json(200, { status: job.status, ok: true, data: job.data });
  }
  if (job.status === 'failed') {
    return json(200, { status: job.status, ok: false, error: job.error || 'Scan failed. Please try again.' });
  }
  return json(200, { status: job.status });
}
