import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { VenueDetails } from '../../lib/types';
import { Button, Field, TextArea, TextInput } from '../ui';

interface Props {
  venue: VenueDetails;
  notes?: string;
  onChange: (venue: VenueDetails) => void;
  onBack: () => void;
  onNext: () => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function VenueStep({ venue, notes, onChange, onBack, onNext }: Props) {
  // Track whether the user has manually edited the slug so we don't clobber
  // their edit if they subsequently change the venue name.
  const [slugTouched, setSlugTouched] = useState(false);

  const set = (patch: Partial<VenueDetails>) => onChange({ ...venue, ...patch });

  const handleNameChange = (name: string) => {
    if (slugTouched) {
      set({ name });
    } else {
      set({ name, slug: slugify(name) });
    }
  };

  const handleSlugChange = (slug: string) => {
    setSlugTouched(true);
    set({ slug });
  };

  const canNext = venue.name.trim().length > 0 && venue.slug.trim().length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Confirm your venue</h2>
        <p className="mt-1 text-sm text-slate-400">
          Here's what we pulled from your site. Edit anything that's off.
        </p>
      </div>

      <Field label="Venue name">
        <TextInput
          value={venue.name}
          onChange={(e) => handleNameChange(e.target.value)}
        />
      </Field>

      <Field label="Slug" hint="Lowercase, hyphenated. Used in URLs.">
        <TextInput
          value={venue.slug}
          onChange={(e) => handleSlugChange(e.target.value)}
        />
      </Field>

      <Field label="Website">
        <TextInput value={venue.website} onChange={(e) => set({ website: e.target.value })} />
      </Field>

      <Field label="Description">
        <TextArea rows={3} value={venue.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>

      {notes && (
        <p className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-500">
          <span className="font-medium text-slate-400">Scan notes:</span> {notes}
        </p>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </Button>
        <Button onClick={onNext} disabled={!canNext}>
          Next: Rooms <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  );
}
