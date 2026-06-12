import { CheckCircle2 } from 'lucide-react';
import type { SeedResult, VenueIntelligence } from '../../lib/types';
import { Button } from '../ui';

interface Props {
  result: SeedResult;
  intel: VenueIntelligence | null;
}

// Dashboard URL — override at build time with VITE_DASHBOARD_URL.
const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL || 'https://immersivekit.ca/dashboard';

export default function DoneStep({ result, intel }: Props) {
  return (
    <div className="space-y-5 text-center">
      <div className="flex flex-col items-center">
        <CheckCircle2 size={48} className="text-emerald-400" />
        <h2 className="mt-3 text-lg font-semibold">{intel?.venue.name || 'Your venue'} is set up</h2>
        <p className="mt-1 text-sm text-slate-400">
          Created 1 organization, your owner membership, 1 project, and {result.experienceIds.length} experience
          {result.experienceIds.length === 1 ? '' : 's'}. Every ImmersiveKit tool can now read this venue.
        </p>
      </div>

      <div className="mx-auto max-w-sm space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-left text-xs text-slate-500">
        <div>
          <span className="text-slate-400">Organization ID:</span> {result.organizationId}
        </div>
        <div>
          <span className="text-slate-400">Membership ID:</span> {result.membershipId}
        </div>
        <div>
          <span className="text-slate-400">Project ID:</span> {result.projectId}
        </div>
        <div>
          <span className="text-slate-400">Experience IDs:</span> {result.experienceIds.join(', ') || '—'}
        </div>
      </div>

      <div className="flex justify-center">
        <Button onClick={() => (window.location.href = DASHBOARD_URL)}>Go to dashboard</Button>
      </div>
    </div>
  );
}
