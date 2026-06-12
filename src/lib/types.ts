// ─────────────────────────────────────────────────────────────────────────────
// Shared types for the Venue Intelligence Wizard.
//
// The wizard's job: take a website URL, let Claude extract a venue + its rooms,
// let the operator confirm/edit, then seed PocketBase (organizations +
// memberships + experiences).
// ─────────────────────────────────────────────────────────────────────────────

/** A single escape room extracted from (or entered for) the venue. */
export interface VenueRoom {
  /** Display title, e.g. "The Heist". */
  title: string;
  /** One-paragraph story/premise hook. */
  premise: string;
  /** Stated run time in minutes (0 if unknown). */
  durationMinutes: number;
  /** Min players (0 if unknown). */
  capacityMin: number;
  /** Max players (0 if unknown). */
  capacityMax: number;
}

/** The venue/organization details extracted from (or entered for) the site. */
export interface VenueDetails {
  /** Business name. */
  name: string;
  /** URL-safe slug derived from the name. */
  slug: string;
  /** Public website URL the operator entered. */
  website: string;
  /** Short description / tagline of the venue. */
  description: string;
}

/** Full payload the wizard works with through steps 2–4. */
export interface VenueIntelligence {
  venue: VenueDetails;
  rooms: VenueRoom[];
  /** Free-form notes Claude couldn't confidently slot into a field. */
  notes?: string;
}

/** Shape returned by the /scrape-venue Netlify function. */
export interface ScrapeVenueResponse {
  ok: boolean;
  data?: VenueIntelligence;
  error?: string;
}

/** Result of seeding PocketBase. */
export interface SeedResult {
  organizationId: string;
  membershipId: string;
  projectId: string;
  experienceIds: string[];
}
