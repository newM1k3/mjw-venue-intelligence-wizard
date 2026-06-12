import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { STEPS, type StepId } from '../App';
import type { AuthUser } from '../hooks/useAuth';

interface Props {
  step: StepId;
  user: AuthUser | null;
  isMockUser?: boolean;
  children: ReactNode;
}

export default function WizardShell({ step, user, isMockUser, children }: Props) {
  const activeIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-5 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
              <Sparkles size={18} />
            </span>
            <div>
              <h1 className="text-sm font-semibold leading-tight">Venue Intelligence Wizard</h1>
              <p className="text-xs text-slate-500">ImmersiveKit onboarding</p>
            </div>
          </div>
          {user && (
            <div className="text-right text-xs text-slate-400">
              {user.name || user.email}
              {isMockUser && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-400">demo</span>}
            </div>
          )}
        </header>

        {/* Stepper */}
        <ol className="mb-8 flex items-center gap-2">
          {STEPS.map((s, i) => {
            const done = i < activeIndex;
            const current = i === activeIndex;
            return (
              <li key={s.id} className="flex flex-1 items-center gap-2">
                <span
                  className={[
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    current
                      ? 'bg-cyan-500 text-slate-950'
                      : done
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'bg-slate-800 text-slate-500',
                  ].join(' ')}
                >
                  {i + 1}
                </span>
                <span className={current ? 'text-sm text-white' : 'text-sm text-slate-500'}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="h-px flex-1 bg-slate-800" />}
              </li>
            );
          })}
        </ol>

        <main className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 sm:p-8">
          {children}
        </main>

        <footer className="mt-6 text-center text-xs text-slate-600">
          Seeds organizations, memberships &amp; experiences in PocketBase.
        </footer>
      </div>
    </div>
  );
}
