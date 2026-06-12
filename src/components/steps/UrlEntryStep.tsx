import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react';
import { Button, ErrorBanner, Field, TextInput } from '../ui';

interface Props {
  scanning: boolean;
  error: string | null;
  onScan: (url: string, roomsUrl?: string) => void;
}

export default function UrlEntryStep({ scanning, error, onScan }: Props) {
  const [url, setUrl] = useState('');
  const [roomsUrl, setRoomsUrl] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const canSubmit = url.trim().length > 3 && !scanning;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onScan(url.trim(), roomsUrl.trim() || undefined);
      }}
      className="space-y-5"
    >
      <div>
        <h2 className="text-lg font-semibold">Let's set up your venue</h2>
        <p className="mt-1 text-sm text-slate-400">
          Paste your website and we'll scan it to pre-fill your venue and rooms. You'll confirm
          everything before anything is saved.
        </p>
      </div>

      <Field label="Venue website" hint="e.g. www.yourescaperoom.com">
        <TextInput
          type="text"
          inputMode="url"
          autoFocus
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={scanning}
        />
      </Field>

      {/* Advanced: rooms/booking page override */}
      <div className="rounded-lg border border-slate-800 bg-slate-950/40">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-slate-400 hover:text-slate-200"
        >
          {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          My rooms are on a separate booking page
        </button>
        {advancedOpen && (
          <div className="border-t border-slate-800 px-3 py-3">
            <Field
              label="Rooms / booking page URL (optional)"
              hint="If your rooms live in a booking widget (Off The Couch, Bookeo, etc.), paste the page that lists them. We'll scan it too."
            >
              <TextInput
                type="text"
                inputMode="url"
                placeholder="https://yourvenue.offthecouch.io/..."
                value={roomsUrl}
                onChange={(e) => setRoomsUrl(e.target.value)}
                disabled={scanning}
              />
            </Field>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="flex justify-end">
        <Button type="submit" disabled={!canSubmit}>
          {scanning ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Scanning your site…
            </>
          ) : (
            <>
              <Search size={16} /> Scan website
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
