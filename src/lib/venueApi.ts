import type { ScrapeVenueResponse, VenueIntelligence } from './types';

// Calls the /scrape-venue Netlify function. In `netlify dev` and in production
// the function is served at /.netlify/functions/scrape-venue.
const SCRAPE_ENDPOINT = '/.netlify/functions/scrape-venue';
const SCRAPE_STATUS_ENDPOINT = '/.netlify/functions/scrape-venue-status';

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 6 * 60 * 1000;

async function pollForScrape(jobId: string): Promise<VenueIntelligence> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    let res: Response;
    try {
      res = await fetch(`${SCRAPE_STATUS_ENDPOINT}?jobId=${encodeURIComponent(jobId)}`);
    } catch {
      continue; // transient network failure; keep waiting until the deadline
    }

    if (res.status === 404) {
      throw new Error('Scan job was not found. Please try again.');
    }

    if (!res.ok) continue;

    let body: ScrapeVenueResponse & { status?: string };
    try {
      body = (await res.json()) as ScrapeVenueResponse & { status?: string };
    } catch {
      continue;
    }

    if (body.status === 'complete' && body.data) {
      return body.data;
    }

    if (body.status === 'failed') {
      throw new Error(body.error || 'Scan failed. Please try again.');
    }
  }

  throw new Error('Scan is taking longer than expected. Please try again.');
}

export async function scrapeVenue(url: string, roomsUrl?: string): Promise<VenueIntelligence> {
  let res: Response;
  try {
    res = await fetch(SCRAPE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, roomsUrl: roomsUrl?.trim() || undefined }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach the scan service. Run \`netlify dev\` locally, or check the deploy. (${
        err instanceof Error ? err.message : 'network error'
      })`
    );
  }

  let body: ScrapeVenueResponse & { jobId?: string };
  try {
    body = (await res.json()) as ScrapeVenueResponse & { jobId?: string };
  } catch {
    throw new Error(`Scan service returned an unexpected response (HTTP ${res.status}).`);
  }

  if (!res.ok || !body.ok) {
    throw new Error(body.error || `Scan failed (HTTP ${res.status}).`);
  }

  if (!body.jobId) {
    throw new Error('Scan failed to start.');
  }

  return pollForScrape(body.jobId);
}
