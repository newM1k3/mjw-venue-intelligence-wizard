export const VENUE_SCRAPE_STORE = 'venue-scrape-jobs';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

const MAX_SUBPAGES = 4; // extra pages fetched beyond the homepage
const PER_PAGE_CHARS = 20_000; // cap on each page's text
const MAX_COMBINED_CHARS = 90_000; // overall cap on text sent to Claude
const PAGE_TIMEOUT_MS = 6_000; // per-fetch timeout so one slow page can't hang us
const HOME_TIMEOUT_MS = 8_000; // homepage fetch timeout (fatal if it hangs)
const CLAUDE_TIMEOUT_MS = 18_000; // Claude API timeout

// Link-relevance keywords (matched against pathname + anchor text). Higher = more
// likely to be a rooms/experiences page.
const KEYWORDS = [
  ['escape-room', 5],
  ['escape room', 5],
  ['escaperoom', 5],
  ['rooms', 4],
  ['experiences', 4],
  ['experience', 3],
  ['escape', 3],
  ['room', 3],
  ['adventure', 2],
  ['attraction', 2],
  ['mission', 2],
  ['quest', 2],
  ['game', 2],
  ['book', 1],
];

// Known booking platforms — matched (as substrings) against the raw site markup
// (iframe/script/link/anchor URLs). Rooms frequently live inside these widgets,
// which a plain fetch can't read, so we at least detect and report them.
const BOOKING_PROVIDERS = [
  { key: 'offthecouch', name: 'Off The Couch', signatures: ['offthecouch.io', 'offthecouch'] },
  { key: 'bookeo', name: 'Bookeo', signatures: ['bookeo.com'] },
  { key: 'resova', name: 'Resova', signatures: ['resova.com', 'resova.us', 'resova.io'] },
  { key: 'fareharbor', name: 'FareHarbor', signatures: ['fareharbor.com'] },
  { key: 'xola', name: 'Xola', signatures: ['xola.com'] },
  { key: 'checkfront', name: 'Checkfront', signatures: ['checkfront.com'] },
  { key: 'bookwhen', name: 'Bookwhen', signatures: ['bookwhen.com'] },
  { key: 'peek', name: 'Peek', signatures: ['peek.com', 'book.peek'] },
  { key: 'acuity', name: 'Acuity Scheduling', signatures: ['acuityscheduling.com', 'squarespace-scheduling'] },
];

export const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export function namedError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

/** Detect the first known booking platform referenced in the raw markup. */
function detectBooking(rawMarkup) {
  const hay = rawMarkup.toLowerCase();
  for (const p of BOOKING_PROVIDERS) {
    if (p.signatures.some((sig) => hay.includes(sig))) {
      return { detected: true, key: p.key, name: p.name };
    }
  }
  return { detected: false, key: null, name: null };
}

/** Very small HTML -> text reducer: drop scripts/styles and tags, collapse space. */
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Normalise a pathname for comparison/dedupe (no trailing slash, lowercased). */
function pathKey(pathname) {
  return (pathname.replace(/\/+$/, '') || '/').toLowerCase();
}

/** Find same-origin sub-page URLs that look like rooms/experiences pages. */
function discoverSubpages(html, base) {
  const homeKey = pathKey(base.pathname);
  const seen = new Set([homeKey]);
  const scored = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue;

    let u;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (u.origin !== base.origin) continue; // same site only
    if (/\.(jpe?g|png|gif|svg|webp|pdf|zip|mp4|mov|css|js|ico|woff2?|xml)$/i.test(u.pathname)) {
      continue;
    }

    const key = pathKey(u.pathname);
    if (seen.has(key)) continue;

    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const hay = `${key} ${text}`;
    let score = 0;
    for (const [kw, weight] of KEYWORDS) if (hay.includes(kw)) score += weight;
    if (score <= 0) continue;

    seen.add(key);
    u.hash = '';
    scored.push({ url: u.toString(), score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_SUBPAGES).map((s) => s.url);
}

/** Fetch a URL as text with a timeout; returns null on any failure/non-HTML. */
async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ImmersiveKit-VenueWizard/1.0 (+https://immersivekit.ca)' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (ct && !ct.includes('html') && !ct.includes('text')) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const SYSTEM_PROMPT = `You are a data-extraction assistant for ImmersiveKit, a platform for escape-room operators.
You will receive readable text from one or more pages of an escape-room business's website
(the homepage plus any rooms/experiences pages we could find). Each page is delimited by a
"--- Page: <url> ---" header.
Extract the venue and ALL of its rooms into STRICT JSON. Use every page provided. Do not invent
details that aren't supported by the text.
Return ONLY a JSON object (no markdown, no commentary) with this exact shape:
{
  "venue": {
    "name": string,
    "slug": string,            // url-safe, lowercase, hyphenated
    "website": string,         // the homepage URL you were told about
    "description": string      // 1-2 sentences; "" if unknown
  },
  "rooms": [
    {
      "title": string,
      "premise": string,       // 1-2 sentences; "" if unknown
      "durationMinutes": number, // 0 if not stated
      "capacityMin": number,     // 0 if not stated
      "capacityMax": number      // 0 if not stated
    }
  ],
  "notes": string              // anything notable you couldn't slot into a field; "" if none
}
If you cannot find any rooms, return an empty "rooms" array. Never include fields not listed above.`;

export function validateScrapeInput(body) {
  const url = body?.url;
  if (!url || typeof url !== 'string') {
    throw namedError('BadRequestError', 'Missing "url" in request body.');
  }

  let roomsTarget = null;
  if (body?.roomsUrl && typeof body.roomsUrl === 'string' && body.roomsUrl.trim()) {
    try {
      roomsTarget = new URL(body.roomsUrl.startsWith('http') ? body.roomsUrl : `https://${body.roomsUrl}`);
      if (!/^https?:$/.test(roomsTarget.protocol)) throw new Error('bad protocol');
    } catch {
      throw namedError('BadRequestError', `"${body.roomsUrl}" is not a valid rooms URL.`);
    }
  }

  let target;
  try {
    target = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (!/^https?:$/.test(target.protocol)) throw new Error('bad protocol');
  } catch {
    throw namedError('BadRequestError', `"${url}" is not a valid URL.`);
  }

  return { url: target.toString(), roomsUrl: roomsTarget ? roomsTarget.toString() : null };
}

export async function runScrapeVenue({ url, roomsUrl }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw namedError('MissingEnvironmentVariableError', 'Server is missing ANTHROPIC_API_KEY.');
  }

  const target = new URL(url);
  const roomsTarget = roomsUrl ? new URL(roomsUrl) : null;

  // 1. Fetch the homepage (this one's failure is fatal — it's all we have).
  let homeHtml;
  {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HOME_TIMEOUT_MS);
    try {
      const res = await fetch(target.toString(), {
        headers: { 'User-Agent': 'ImmersiveKit-VenueWizard/1.0 (+https://immersivekit.ca)' },
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!res.ok) {
        throw namedError('ProviderRequestError', `Site returned HTTP ${res.status} while fetching.`);
      }
      homeHtml = await res.text();
    } catch (err) {
      if (err?.name === 'BadRequestError' || err?.name === 'ProviderRequestError') throw err;
      const msg = err?.name === 'AbortError' ? 'Site took too long to respond (timeout).' : err.message;
      throw namedError('ProviderRequestError', `Could not reach the site: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // 2. Discover + fetch likely sub-pages (best-effort; failures are skipped).
  //    If the operator gave an explicit rooms/booking URL, fetch that first.
  const subUrls = discoverSubpages(homeHtml, target);
  const fetchUrls = roomsTarget ? [roomsTarget.toString(), ...subUrls] : subUrls;
  const fetchedHtmls = await Promise.all(fetchUrls.map((u) => fetchText(u)));

  // Keep the raw markup of every page so we can sniff for booking widgets.
  const rawMarkup = [homeHtml, ...fetchedHtmls.filter(Boolean)].join('\n');
  const booking = detectBooking(rawMarkup);

  // 3. Build the combined, per-page-labelled text.
  const pages = [{ url: target.toString(), text: htmlToText(homeHtml) }];
  fetchUrls.forEach((u, i) => {
    const raw = fetchedHtmls[i];
    if (raw) {
      const text = htmlToText(raw);
      if (text.length > 40) pages.push({ url: u, text });
    }
  });

  const combined = pages
    .map((p) => `--- Page: ${p.url} ---\n${p.text.slice(0, PER_PAGE_CHARS)}`)
    .join('\n\n')
    .slice(0, MAX_COMBINED_CHARS);

  if (combined.length < 60) {
    throw namedError('InsufficientContentError', 'The site had almost no readable text to analyze.');
  }

  const scannedPages = pages.map((p) => p.url);

  // 4. Ask Claude to extract structured data.
  let claudeRes;
  {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
    try {
      claudeRes = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
          max_tokens: 3072,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Homepage URL: ${target.toString()}\nPages scanned: ${scannedPages.length}\n\n${combined}`,
            },
          ],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      const msg = err?.name === 'AbortError' ? 'Claude took too long to respond (timeout).' : err.message;
      throw namedError('ProviderRequestError', `Claude request failed: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }

  if (!claudeRes.ok) {
    const detail = await claudeRes.text().catch(() => '');
    throw namedError('ProviderRequestError', `Claude API error ${claudeRes.status}: ${detail.slice(0, 300)}`);
  }

  const payload = await claudeRes.json();
  const rawText = (payload.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  // Claude is instructed to return pure JSON, but be defensive about stray fences.
  const jsonStart = rawText.indexOf('{');
  const jsonEnd = rawText.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw namedError('ProviderResponseError', 'Claude did not return parseable JSON.');
  }

  let data;
  try {
    data = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1));
  } catch {
    throw namedError('ProviderResponseError', 'Failed to parse the extracted venue JSON.');
  }

  // 5. Normalise the shape so the client can trust it.
  const venue = data.venue || {};
  const rooms = Array.isArray(data.rooms)
    ? data.rooms
        .map((r) => ({
          title: String(r.title || '').trim(),
          premise: String(r.premise || '').trim(),
          durationMinutes: Number(r.durationMinutes) || 0,
          capacityMin: Number(r.capacityMin) || 0,
          capacityMax: Number(r.capacityMax) || 0,
        }))
        .filter((r) => r.title.length > 0)
    : [];

  return {
    venue: {
      name: String(venue.name || '').trim(),
      slug: slugify(venue.slug || venue.name || ''),
      website: target.toString(),
      description: String(venue.description || '').trim(),
    },
    rooms,
    notes: String(data.notes || '').trim(),
    booking,
    roomsAutoDetected: rooms.length > 0,
  };
}
