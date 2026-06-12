// ─────────────────────────────────────────────────────────────────────────────
// scrape-venue  —  Netlify serverless function
//
// POST { url: string }
//   1. Fetch the venue's website HTML.
//   2. Strip it down to readable text (cheap, no DOM library).
//   3. Ask Claude Sonnet to extract a structured venue + rooms object.
//   4. Return { ok, data } or { ok:false, error }.
//
// Env vars (set in Netlify > Site settings > Environment variables):
//   ANTHROPIC_API_KEY   (required)  — your Anthropic API key
//   CLAUDE_MODEL        (optional)  — defaults to "claude-sonnet-4-6"
//
// Uses native fetch (Node 18+ on Netlify) so there are no extra dependencies.
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_HTML_CHARS = 60_000; // keep the prompt well within token limits

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

const SYSTEM_PROMPT = `You are a data-extraction assistant for ImmersiveKit, a platform for escape-room operators.
You will receive the readable text of an escape-room business's website.
Extract the venue and its rooms into STRICT JSON. Do not invent details that aren't supported by the text.
Return ONLY a JSON object (no markdown, no commentary) with this exact shape:
{
  "venue": {
    "name": string,
    "slug": string,            // url-safe, lowercase, hyphenated
    "website": string,         // the URL you were told about
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

  // 1. Fetch the site.
  let html;
  try {
    const res = await fetch(target.toString(), {
      headers: { 'User-Agent': 'ImmersiveKit-VenueWizard/1.0 (+https://immersivekit.ca)' },
      redirect: 'follow',
    });
    if (!res.ok) {
      return json(502, { ok: false, error: `Site returned HTTP ${res.status} while fetching.` });
    }
    html = await res.text();
  } catch (err) {
    return json(502, { ok: false, error: `Could not reach the site: ${err.message}` });
  }

  const text = htmlToText(html).slice(0, MAX_HTML_CHARS);
  if (text.length < 40) {
    return json(422, { ok: false, error: 'The page had almost no readable text to analyze.' });
  }

  // 2 + 3. Ask Claude to extract structured data.
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
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Venue URL: ${target.toString()}\n\nWebsite text:\n"""\n${text}\n"""`,
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

  // 4. Normalise the shape so the client can trust it.
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
