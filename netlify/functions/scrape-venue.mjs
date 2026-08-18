import { randomUUID } from 'node:crypto';
import { connectLambda, getStore } from '@netlify/blobs';
import { json, validateScrapeInput, VENUE_SCRAPE_STORE } from './_venueScrape.mjs';

// Queues a venue-scrape job and returns 202 + jobId immediately. The actual
// page-fetching + Claude extraction runs in scrape-venue-background
// (15-minute budget) because this pipeline was already running against
// Netlify's synchronous ceiling (timeout=26).
export async function handler(event) {
  // Classic (Lambda-compatibility) functions don't get Netlify Blobs'
  // environment auto-configured — connectLambda() wires it up from the event.
  connectLambda(event);

  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, { ok: false, error: 'Server is missing ANTHROPIC_API_KEY.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body.' });
  }

  let input;
  try {
    input = validateScrapeInput(body);
  } catch (err) {
    return json(400, { ok: false, error: err.message });
  }

  try {
    const jobId = randomUUID();
    const store = getStore(VENUE_SCRAPE_STORE);
    const job = {
      status: 'pending',
      createdAt: new Date().toISOString(),
      input,
    };
    await store.setJSON(jobId, job);

    // Prefer the live request origin: env.URL is baked at deploy time and goes
    // stale when the site's domain changes.
    const origin = new URL(event.rawUrl).origin || process.env.URL;
    const invokeResponse = await fetch(new URL('/.netlify/functions/scrape-venue-background', origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });

    if (invokeResponse.status !== 202) {
      await store.setJSON(jobId, { ...job, status: 'failed', error: 'Background scan could not be started. Please try again.' });
      return json(502, { ok: false, error: `Background scan could not be started (HTTP ${invokeResponse.status}).` });
    }

    console.info('Queued ImmersiveKit venue scrape', { jobId, url: input.url });
    return json(202, { ok: true, jobId, status: 'pending' });
  } catch (error) {
    console.error('scrape-venue queueing failed:', error);
    return json(502, { ok: false, error: error instanceof Error ? error.message : 'Scan failed to start.' });
  }
}
