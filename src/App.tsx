import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { scrapeVenue } from './lib/venueApi';
import { seedVenue } from './lib/seedPocketbase';
import type { SeedResult, VenueIntelligence, VenueRoom } from './lib/types';
import WizardShell from './components/WizardShell';
import UrlEntryStep from './components/steps/UrlEntryStep';
import VenueStep from './components/steps/VenueStep';
import RoomsStep from './components/steps/RoomsStep';
import ReviewStep from './components/steps/ReviewStep';
import DoneStep from './components/steps/DoneStep';

export type StepId = 'url' | 'venue' | 'rooms' | 'review' | 'done';

export const STEPS: { id: StepId; label: string }[] = [
  { id: 'url', label: 'Website' },
  { id: 'venue', label: 'Venue' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
];

const emptyRoom: VenueRoom = {
  title: '',
  premise: '',
  durationMinutes: 60,
  capacityMin: 2,
  capacityMax: 6,
};

export default function App() {
  const { user, loading, isMockUser } = useAuth();

  const [step, setStep] = useState<StepId>('url');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [intel, setIntel] = useState<VenueIntelligence | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<SeedResult | null>(null);

  async function handleScan(url: string, roomsUrl?: string) {
    setScanning(true);
    setScanError(null);
    try {
      const data = await scrapeVenue(url, roomsUrl);
      // roomsAutoDetected reflects whether the scan actually found rooms; preserve
      // it before we add an empty placeholder so the operator is never stuck.
      data.roomsAutoDetected = data.rooms.length > 0;
      if (data.rooms.length === 0) data.rooms = [{ ...emptyRoom }];
      setIntel(data);
      setStep('venue');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed.');
    } finally {
      setScanning(false);
    }
  }

  async function handleSeed() {
    if (!intel || !user) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await seedVenue(intel, user);
      setResult(res);
      setStep('done');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not write to PocketBase.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <WizardShell step="url" user={null}>
        <p className="text-slate-400">Checking your session…</p>
      </WizardShell>
    );
  }

  return (
    <WizardShell step={step} user={user} isMockUser={isMockUser}>
      {step === 'url' && (
        <UrlEntryStep scanning={scanning} error={scanError} onScan={handleScan} />
      )}

      {step === 'venue' && intel && (
        <VenueStep
          venue={intel.venue}
          notes={intel.notes}
          onChange={(venue) => setIntel({ ...intel, venue })}
          onBack={() => setStep('url')}
          onNext={() => setStep('rooms')}
        />
      )}

      {step === 'rooms' && intel && (
        <RoomsStep
          rooms={intel.rooms}
          booking={intel.booking}
          autoDetected={intel.roomsAutoDetected ?? false}
          onChange={(rooms) => setIntel({ ...intel, rooms })}
          onBack={() => setStep('venue')}
          onNext={() => setStep('review')}
        />
      )}

      {step === 'review' && intel && (
        <ReviewStep
          intel={intel}
          user={user}
          saving={saving}
          error={saveError}
          onBack={() => setStep('rooms')}
          onConfirm={handleSeed}
        />
      )}

      {step === 'done' && result && (
        <DoneStep result={result} intel={intel} />
      )}
    </WizardShell>
  );
}
