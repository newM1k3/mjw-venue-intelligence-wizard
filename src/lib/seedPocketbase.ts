import pb from './pocketbase';
import type { AuthUser } from '../hooks/useAuth';
import type { SeedResult, VenueIntelligence } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// PocketBase seed/write layer.
//
// Confirmed against the live schema (immersive-kit.pockethost.io):
//   experiences link UPWARD via a `project` relation — there is no `organization`
//   field on experiences. So the venue's rooms must hang off a project, and the
//   project hangs off the organization. Write order:
//
//   organizations  →  memberships  →  projects  →  experiences
//
//   organizations  (the venue; created_by = current user)
//   memberships    (current user as owner of the org)
//   projects       (one "venue" project that owns the rooms; links to the org)
//   experiences    (one record per room; links to the project)
//
// ⚠ SELECT-FIELD VALUES — the string constants below must match the options
//   defined on each `select` field. Any field whose constant is an empty string
//   is OMITTED from the create (PocketBase applies its own default), so a wrong
//   guess never hard-blocks onboarding. PocketBase validation errors are
//   surfaced verbatim on the Review step, so a mismatch tells you the exact field.
// ─────────────────────────────────────────────────────────────────────────────

// How an experience points back to its project (confirmed: 'project').
const EXPERIENCE_LINK_FIELD = 'project';

// Select-field values. '' = omit the field and let PocketBase default it.
const ORG_STATUS = 'active';
const MEMBERSHIP_ROLE = 'owner';
const MEMBERSHIP_STATUS = 'active';
// projects.type — REQUIRED select. Options: escape_room | immersive_theater |
// haunt | museum_experience | brand_activation | training_simulation | other.
const PROJECT_TYPE = 'escape_room';
// projects.status — REQUIRED select. Options: concept | design | production |
// testing | live | paused | archived. Onboarding from a live website = 'live'.
const PROJECT_STATUS = 'live';
// experiences.status — REQUIRED select. Options: draft | review | approved |
// live | retired. Onboarding real operating rooms = 'live'.
const EXPERIENCE_STATUS = 'live';

/** Add only the entries whose value is truthy (skips '' selects). */
function withOptional(
  base: Record<string, unknown>,
  optional: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(optional)) {
    if (v !== '' && v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

function describeError(err: unknown): string {
  // PocketBase ClientResponseError carries field-level detail in .response.data
  const anyErr = err as { response?: { data?: Record<string, { message?: string }> }; message?: string };
  const fieldErrors = anyErr?.response?.data;
  if (fieldErrors && Object.keys(fieldErrors).length) {
    const parts = Object.entries(fieldErrors).map(
      ([field, detail]) => `${field}: ${detail?.message ?? 'invalid'}`
    );
    return parts.join('; ');
  }
  return anyErr?.message || 'Unknown PocketBase error';
}

export async function seedVenue(
  intel: VenueIntelligence,
  user: AuthUser
): Promise<SeedResult> {
  // 1. Organization (the venue).
  let organizationId: string;
  try {
    const org = await pb.collection('organizations').create(
      withOptional(
        {
          name: intel.venue.name,
          slug: intel.venue.slug,
          website: intel.venue.website,
          description: intel.venue.description,
          created_by: user.id,
          settings: {
            onboardedVia: 'venue-intelligence-wizard',
            sourceUrl: intel.venue.website,
            onboardedAt: new Date().toISOString(),
            notes: intel.notes ?? '',
          },
        },
        { status: ORG_STATUS }
      )
    );
    organizationId = org.id;
  } catch (err) {
    throw new Error(`Failed to create organization — ${describeError(err)}`);
  }

  // 2. Membership (current user owns the org).
  let membershipId: string;
  try {
    const membership = await pb.collection('memberships').create(
      withOptional(
        { user: user.id, organization: organizationId },
        { role: MEMBERSHIP_ROLE, status: MEMBERSHIP_STATUS }
      )
    );
    membershipId = membership.id;
  } catch (err) {
    throw new Error(`Failed to create membership — ${describeError(err)}`);
  }

  // 3. Project (owns the rooms; links to the org).
  let projectId: string;
  try {
    const project = await pb.collection('projects').create(
      withOptional(
        {
          organization: organizationId,
          name: intel.venue.name,
          slug: intel.venue.slug,
          summary: intel.venue.description,
          owner: user.id,
          metadata: { onboardedVia: 'venue-intelligence-wizard' },
        },
        { type: PROJECT_TYPE, status: PROJECT_STATUS }
      )
    );
    projectId = project.id;
  } catch (err) {
    throw new Error(`Created the venue, but failed to create its project — ${describeError(err)}`);
  }

  // 4. Experiences (one per room; link to the project).
  const experienceIds: string[] = [];
  for (const room of intel.rooms) {
    try {
      const exp = await pb.collection('experiences').create(
        withOptional(
          {
            [EXPERIENCE_LINK_FIELD]: projectId,
            title: room.title,
            premise: room.premise,
            guest_journey: '',
            duration_minutes: room.durationMinutes || null,
            capacity_min: room.capacityMin || null,
            capacity_max: room.capacityMax || null,
            design_parameters: { onboardedVia: 'venue-intelligence-wizard' },
          },
          { status: EXPERIENCE_STATUS }
        )
      );
      experienceIds.push(exp.id);
    } catch (err) {
      throw new Error(
        `Created the venue and project, but failed on room "${room.title}" — ${describeError(err)}`
      );
    }
  }

  return { organizationId, membershipId, projectId, experienceIds };
}
