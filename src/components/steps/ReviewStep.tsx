import type { ReactNode } from 'react';
import { ArrowLeft, Loader2, Database } from 'lucide-react';
import type { VenueIntelligence } from '../../lib/types';
import type { AuthUser } from '../../hooks/useAuth';
import { Button, ErrorBanner } from '../ui';

interface Props {
  intel: VenueIntelligence;
  user: AuthUser | null;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}

export default function ReviewStep({ intel, user, saving, error, onBack, onConfirm }: Props) {
  const noUser = !user;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Review &amp; create</h2>
        <p className="mt-1 text-sm text-slate-400">
          We'll create the records below in PocketBase. Nothing has been saved yet.
        </p>
      </div>

      <div className="space-y-3 text-sm">
        <Row label="Organization">{intel.venue.name || '—'} <span className="text-slate-600">({intel.venue.slug})</span></Row>
        <Row label="Membership">{user?.email || 'unknown user'} — owner</Row>
        <Row label="Project">{intel.venue.name || '—'} <span className="text-slate-600">(owns the rooms)</span></Row>
        <Row label="Experiences">
          <ul className="mt-1 space-y-1">
            {intel.rooms.map((r, i) => (
              <li key={i} className="text-slate-300">
                • {r.title || `Room ${i + 1}`}
                <span className="text-slate-600">
                  {r.durationMinutes ? ` · ${r.durationMinutes} min` : ''}
                  {r.capacityMax ? ` · ${r.capacityMin || 1}–${r.capacityMax} players` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Row>
      </div>

      {noUser && (
        <ErrorBanner message="No signed-in user. Launch this wizard from the ImmersiveKit dashboard so it can attach the venue to your account." />
      )}
      {error && <ErrorBanner message={error} />}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} disabled={saving}>
          <ArrowLeft size={16} /> Back
        </Button>
        <Button onClick={onConfirm} disabled={saving || noUser}>
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Creating…
            </>
          ) : (
            <>
              <Database size={16} /> Create venue
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-slate-200">{children}</div>
    </div>
  );
}
