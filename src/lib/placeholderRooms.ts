import type { VenueRoom } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Placeholder-rooms detection.
//
// When a venue's rooms live inside a booking widget (Off The Couch, Bookeo,
// etc.) the scraper can't see into the iframe, so Claude often returns 1–2
// generic-titled rooms ("Escape Rooms (general)") plus scan notes admitting
// more rooms exist. Without this guard the wizard treats those as real
// detected rooms, hides the "your rooms are in a widget" banner, and the
// operator ships generic experiences. This module flags that case so the
// caller can reset to a blank slot and surface the banner instead.
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER_TITLE_RE = /^(?:escape\s*rooms?|our\s*rooms?|the\s*rooms?|rooms?)(?:\s*\(.*\))?$/i;

/** True if any room title looks like a generic placeholder rather than a real room. */
function hasGenericTitle(rooms: VenueRoom[]): boolean {
  return rooms.some((r) => PLACEHOLDER_TITLE_RE.test(r.title.trim()));
}

/** True if scan notes assert the venue has more rooms than we extracted. */
function notesClaimMoreRooms(rooms: VenueRoom[], notes?: string): boolean {
  if (!notes) return false;
  const m = notes.match(/\b(\d+)\s+(?:escape\s+)?rooms?\b/i);
  if (!m) return false;
  const claimed = parseInt(m[1], 10);
  return Number.isFinite(claimed) && claimed > rooms.length;
}

/**
 * Did the scrape return generic placeholders rather than real rooms? Triggers
 * the operator-fill workflow on the Rooms step.
 */
export function isPlaceholderScan(rooms: VenueRoom[], notes?: string): boolean {
  if (rooms.length === 0) return false; // a different (already-handled) case
  if (rooms.length > 3) return false; // 4+ real-looking rooms = trust it
  return hasGenericTitle(rooms) || notesClaimMoreRooms(rooms, notes);
}
