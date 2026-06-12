// ─────────────────────────────────────────────────────────────────────────────
// scrape-venue  —  Netlify serverless function
//
// POST { url: string }
//   1. Fetch the venue's homepage HTML.
//   2. Discover likely sub-pages (rooms / experiences / games) from its links and
//      fetch a few of them too — most venues list rooms on a separate page.
//   3. Reduce every page to readable text and combine it (labelled per page).
//   4. Ask Claude Sonnet to extract a structured venue + rooms object.
//   5. Return { ok, data } or { ok:false, error }.
//
// Env vars (set in Netlify > Site settings > Environment variables):
//   ANTHROPIC_API_KEY   (required)  — your Anthropic API key
//   CLAUDE_MODEL        (optional)  — defaults to "claude-sonnet-4-6"
//
// Uses native fetch (Node 18+ on Netlify) so there are no extra dependencies.
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

const MAX_SUBPAGES = 4; // extra pages fetched beyond the homepage
const PER_PAGE_CHARS = 20_000; // cap on each page's text
const MAX_COMBINED_CHARS = 90_000; // overall cap on text sent to Claude
const PAGE_TIMEOUT_MS = 6_000; // per-fetch timeout so one slow page can't hang us

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

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

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

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, { ok: false, error: 'Server is missing ANTHROPIC_API_KEY.' });
  }

  let url;
  try {
    ({ url } = JSON.parse(event.body || '{}'));
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body.' });
  }

  if (!url || typeof url !== 'string') {
    return json(400, { ok: false, error: 'Missing "url" in request body.' });
  }

  // Normalise + validate the URL.
  let target;
  try {
    target = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (!/^https?:$/.test(target.protocol)) throw new Error('bad protocol');
  } catch {
    return json(400, { ok: false, error: `"${url}" is not a valid URL.` });
  }

  // 1. Fetch the homepage (this one's failure is fatal — it's all we have).
  let homeHtml;
  try {
    const res = await fetch(target.toString(), {
      headers: { 'User-Agent': 'ImmersiveKit-VenueWizard/1.0 (+https://immersivekit.ca)' },
      redirect: 'follow',
    });
    if (!res.ok) {
      return json(502, { ok: false, error: `Site returned HTTP ${res.status} while fetching.` });
    }
    homeHtml = await res.text();
  } catch (err) {
    return json(502, { ok: false, error: `Could not reach the site: ${err.message}` });
  }

  // 2. Discover + fetch likely sub-pages (best-effort; failures are skipped).
  const subUrls = discoverSubpages(homeHtml, target);
  const subHtmls = await Promise.all(subUrls.map((u) => fetchText(u)));

  // 3. Build the combined, per-page-labelled text.
  const pages = [{ url: target.toString(), text: htmlToText(homeHtml) }];
  subUrls.forEach((u, i) => {
    const raw = subHtmls[i];
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
    return json(422, { ok: false, error: 'The site had almost no readable text to analyze.' });
  }

  const scannedPages = pages.map((p) => p.url);

  // 4. Ask Claude to extract structured data.
  let claudeRes;
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
    });
  } catch (err) {
    return json(502, { ok: false, error: `Claude request failed: ${err.message}` });
  }

  if (!claudeRes.ok) {
    const detail = await claudeRes.text().catch(() => '');
    return json(502, { ok: false, error: `Claude API error ${claudeRes.status}: ${detail.slice(0, 300)}` });
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
    return json(502, { ok: false, error: 'Claude did not return parseable JSON.' });
  }

  let data;
  try {
    data = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1));
  } catch {
    return json(502, { ok: false, error: 'Failed to parse the extracted venue JSON.' });
  }

  // 5. Normalise the shape so the client can trust it.
  const venue = data.venue || {};
  const normalized = {
    venue: {
      name: String(venue.name || '').trim(),
      slug: slugify(venue.slug || venue.name || ''),
      website: target.toString(),
      description: String(venue.description || '').trim(),
    },
    rooms: Array.isArray(data.rooms)
      ? data.rooms.map((r) => ({
          title: String(r.title || '').trim(),
          premise: String(r.premise || '').trim(),
          durationMinutes: Number(r.durationMinutes) || 0,
          capacityMin: Number(r.capacityMin) || 0,
          capacityMax: Number(r.capacityMax) || 0,
        }))
      : [],
    notes: String(data.notes || '').trim(),
  };

  return json(200, { ok: true, data: normalized });
}
