import { useEffect, useState } from 'react';
import type { RecordModel } from 'pocketbase';
import pb from '../lib/pocketbase';

// ─────────────────────────────────────────────────────────────────────────────
// SSO token-handoff hook.
//
// Mirrors the reference implementation in mjw-agency-router/src/hooks/useAuth.ts:
//   1. Read ?token from the URL (passed by the dashboard on launch).
//   2. pb.authStore.save(token) -> authRefresh() to validate + hydrate the user.
//   3. Strip ?token from the URL so it isn't left in history / shareable links.
//   4. Fall back to an existing valid pb.authStore session.
//   5. Fall back to a mock/demo user if PocketBase is unreachable (local dev).
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  isMockUser: boolean;
}

const MOCK_USER: AuthUser = {
  id: 'mock_user',
  email: 'demo@immersivekit.ca',
  name: 'Demo Operator',
};

function toAuthUser(record: RecordModel): AuthUser {
  const r = record as Record<string, unknown>;
  return {
    id: typeof r['id'] === 'string' ? r['id'] : '',
    email: typeof r['email'] === 'string' ? r['email'] : '',
    name: typeof r['name'] === 'string' ? r['name'] : undefined,
  };
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isMockUser: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    async function initAuth() {
      // 1 + 2 + 3: token handoff from the dashboard.
      if (token) {
        try {
          pb.authStore.save(token, null);
          const authData = await pb.collection('users').authRefresh();
          setState({ user: toAuthUser(authData.record), loading: false, isMockUser: false });

          const url = new URL(window.location.href);
          url.searchParams.delete('token');
          window.history.replaceState({}, '', url.toString());
          return;
        } catch {
          pb.authStore.clear();
        }
      }

      // 4: existing session.
      if (pb.authStore.isValid && pb.authStore.model) {
        try {
          const authData = await pb.collection('users').authRefresh();
          setState({ user: toAuthUser(authData.record), loading: false, isMockUser: false });
          return;
        } catch {
          pb.authStore.clear();
        }
      }

      // 5: no usable session — mock user if the backend is unreachable,
      // otherwise leave user null so the UI can prompt to launch from the dashboard.
      try {
        await pb.health.check();
        setState({ user: null, loading: false, isMockUser: false });
      } catch {
        console.warn('[Auth] PocketBase unreachable, using mock user.');
        setState({ user: MOCK_USER, loading: false, isMockUser: true });
      }
    }

    initAuth();
  }, []);

  return state;
}
