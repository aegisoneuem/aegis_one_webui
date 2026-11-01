import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setAccessToken, setSessionLostHandler } from '../api/client';

/**
 * Who is signed in, and what they are allowed to do.
 *
 * Permissions here drive what the UI shows. They are not the control — the
 * server checks every request independently, and hiding a button the server
 * would refuse anyway is a courtesy, not security.
 */

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  /** Empty means every zone. */
  zoneIds: string[];
}

interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  csrfToken: string;
  user: CurrentUser;
}

export type AuthStatus = 'checking' | 'signed-in' | 'signed-out';

interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  /** Sends the browser to the identity provider. */
  signIn: () => void;
  /** Completes the authorization-code exchange after the IdP redirects back. */
  completeSignIn: (code: string, state: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ISSUER = import.meta.env['VITE_OIDC_ISSUER'] ?? 'http://localhost:8080';
const CLIENT_ID = import.meta.env['VITE_OIDC_CLIENT_ID'] ?? 'aegis-one-console';
const REDIRECT_URI = `${window.location.origin}/auth/callback`;

/** PKCE verifier and the CSRF `state`, kept only for the round trip. */
const PKCE_KEY = 'aegis.pkce.v1';

function randomString(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function s256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<CurrentUser | null>(null);

  const apply = useCallback((data: TokenResponse) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus('signed-in');
  }, []);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('signed-out');
  }, []);

  // A reload loses the in-memory access token but not the refresh cookie, so
  // the session survives without ever putting a token in web storage.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.post<TokenResponse>('/auth/refresh');
        if (!cancelled) apply(data);
      } catch {
        if (!cancelled) clear();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply, clear]);

  useEffect(() => setSessionLostHandler(clear), [clear]);

  const signIn = useCallback(() => {
    void (async () => {
      const verifier = randomString();
      const state = randomString(16);
      // sessionStorage, not localStorage: this is scoped to the one tab doing
      // the sign-in and is cleared the moment the exchange completes.
      sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));

      const url = new URL(`${ISSUER}/oidc/authorize`);
      url.searchParams.set('client_id', CLIENT_ID);
      url.searchParams.set('redirect_uri', REDIRECT_URI);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', await s256(verifier));
      url.searchParams.set('code_challenge_method', 'S256');
      window.location.assign(url.toString());
    })();
  }, []);

  const completeSignIn = useCallback(
    async (code: string, returnedState: string) => {
      const raw = sessionStorage.getItem(PKCE_KEY);
      sessionStorage.removeItem(PKCE_KEY);
      if (!raw) throw new Error('That sign-in link has expired. Start again.');

      const { verifier, state } = JSON.parse(raw) as { verifier: string; state: string };
      // Without this check a crafted callback URL could complete a sign-in the
      // user never started.
      if (state !== returnedState) throw new Error('Sign-in could not be verified. Start again.');

      const data = await api.post<TokenResponse>('/auth/token', {
        code,
        codeVerifier: verifier,
        redirectUri: REDIRECT_URI,
      });
      apply(data);
    },
    [apply],
  );

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clear();
    }
  }, [clear]);

  const can = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      if (user.permissions.includes('*')) return true;
      if (user.permissions.includes(permission)) return true;
      const area = permission.split(':', 1)[0];
      return area ? user.permissions.includes(`${area}:*`) : false;
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signIn, completeSignIn, signOut, can }),
    [status, user, signIn, completeSignIn, signOut, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** Convenience for the common case of gating a single control. */
export function useCan(permission: string): boolean {
  return useAuth().can(permission);
}
