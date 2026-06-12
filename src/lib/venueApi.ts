import type { ScrapeVenueResponse, VenueIntelligence } from './types';

// Calls the /scrape-venue Netlify function. In `netlify dev` and in production
// the function is served at /.netlify/functions/scrape-venue.
const SCRAPE_ENDPOINT = '/.netlify/functions/scrape-venue';

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

  let body: ScrapeVenueResponse;
  try {
    body = (await res.json()) as ScrapeVenueResponse;
  } catch {
    throw new Error(`Scan service returned an unexpected response (HTTP ${res.status}).`);
  }

  if (!res.ok || !body.ok || !body.data) {
    throw new Error(body.error || `Scan failed (HTTP ${res.status}).`);
  }

  return body.data;
}
