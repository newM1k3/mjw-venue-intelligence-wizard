import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import type { VenueRoom } from '../../lib/types';
import { Button, Field, TextArea, TextInput } from '../ui';

interface Props {
  rooms: VenueRoom[];
  onChange: (rooms: VenueRoom[]) => void;
  onBack: () => void;
  onNext: () => void;
}

const blankRoom: VenueRoom = {
  title: '',
  premise: '',
  durationMinutes: 60,
  capacityMin: 2,
  capacityMax: 6,
};

export default function RoomsStep({ rooms, onChange, onBack, onNext }: Props) {
  const setRoom = (i: number, patch: Partial<VenueRoom>) =>
    onChange(rooms.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRoom = (i: number) => onChange(rooms.filter((_, idx) => idx !== i));
  const addRoom = () => onChange([...rooms, { ...blankRoom }]);

  const num = (v: string) => (v === '' ? 0 : Math.max(0, Number(v) || 0));
  const canNext = rooms.length > 0 && rooms.every((r) => r.title.trim().length > 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Confirm your rooms</h2>
        <p className="mt-1 text-sm text-slate-400">
          {rooms.length} room{rooms.length === 1 ? '' : 's'} detected. Add, edit, or remove as needed.
        </p>
      </div>

      <div className="space-y-4">
        {rooms.map((room, i) => (
          <div key={i} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Room {i + 1}
              </span>
              {rooms.length > 1 && (
                <button
                  onClick={() => removeRoom(i)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400"
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>

            <div className="space-y-3">
              <Field label="Title">
                <TextInput value={room.title} onChange={(e) => setRoom(i, { title: e.target.value })} />
              </Field>
              <Field label="Premise">
                <TextArea
                  rows={2}
                  value={room.premise}
                  onChange={(e) => setRoom(i, { premise: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Minutes">
                  <TextInput
                    type="number"
                    min={0}
                    value={room.durationMinutes || ''}
                    onChange={(e) => setRoom(i, { durationMinutes: num(e.target.value) })}
                  />
                </Field>
                <Field label="Min players">
                  <TextInput
                    type="number"
                    min={0}
                    value={room.capacityMin || ''}
                    onChange={(e) => setRoom(i, { capacityMin: num(e.target.value) })}
                  />
                </Field>
                <Field label="Max players">
                  <TextInput
                    type="number"
                    min={0}
                    value={room.capacityMax || ''}
                    onChange={(e) => setRoom(i, { capacityMax: num(e.target.value) })}
                  />
                </Field>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button variant="ghost" onClick={addRoom} className="w-full">
        <Plus size={16} /> Add a room
      </Button>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </Button>
        <Button onClick={onNext} disabled={!canNext}>
          Next: Review <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  );
}
