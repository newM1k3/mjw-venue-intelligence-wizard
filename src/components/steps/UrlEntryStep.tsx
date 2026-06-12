import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button, ErrorBanner, Field, TextInput } from '../ui';

interface Props {
  scanning: boolean;
  error: string | null;
  onScan: (url: string) => void;
}

export default function UrlEntryStep({ scanning, error, onScan }: Props) {
  const [url, setUrl] = useState('');
  const canSubmit = url.trim().length > 3 && !scanning;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onScan(url.trim());
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
