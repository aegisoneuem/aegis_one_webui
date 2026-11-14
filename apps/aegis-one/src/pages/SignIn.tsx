import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorState } from '@aegis/ui';
import { useAuth } from '../app/auth';
// The reference build's own asset, extracted byte-for-byte. The SVG that was
// here was a potrace trace — a redraw, not the approved mark.
import mark from '../assets/brand/aegis-mark.png';
import styles from './SignIn.module.css';

/**
 * Sign-in screen.
 *
 * There is no password field here, and there never will be: the console does
 * not handle credentials. The button hands off to the organisation's identity
 * provider, which collects the password and the second factor and sends back
 * an authorization code.
 */
const AUTH_METHODS = [
  { id: 'oidc', label: 'OIDC', hint: 'OpenID Connect' },
  { id: 'saml', label: 'SAML', hint: 'SAML 2.0' },
  { id: 'ldap', label: 'LDAP', hint: 'Directory sign-in' },
] as const;

export default function SignIn() {
  const { signIn, status } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reason = params.get('reason');

  useEffect(() => {
    if (status === 'signed-in') void navigate('/', { replace: true });
  }, [status, navigate]);

  return (
    <div className={styles.screen}>
      <main className={styles.panel}>
        <div className={styles.brand}>
          <img className={styles.mark} src={mark} alt="" />
          <span className={styles.wordmark}>AEGIS ONE</span>
        </div>

        <h1 className={styles.title}>Sign in to your endpoint management console.</h1>

        <div className={styles.actions}>
          {reason === 'expired' ? (
            <p className={styles.error} role="alert">
              Your session expired. Sign in again to continue.
            </p>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={signIn}
            disabled={status === 'checking'}
          >
            {status === 'checking' ? 'Checking your session…' : 'Continue with SSO'}
          </Button>

          <p className={styles.methodsLabel}>Or sign in with</p>

          {/*
           * All four routes end at the same identity provider; which protocol
           * it speaks is the organisation's configuration, not the user's
           * choice. They are listed because the approved screen lists them —
           * an operator who was told "use SAML" needs to see the word.
           */}
          <div className={styles.methods}>
            {AUTH_METHODS.map((method) => (
              <Button
                key={method.id}
                fullWidth
                onClick={signIn}
                disabled={status === 'checking'}
                title={method.hint}
              >
                {method.label}
              </Button>
            ))}
          </div>
        </div>

        <p className={styles.note}>
          You will be taken to your organisation&rsquo;s identity provider to enter your password
          and your second factor. This console never sees either.
        </p>
      </main>

      <aside className={styles.aside}>
        <p className={styles.asideTitle}>Estate at a glance</p>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>50,000</span>
            <span className={styles.statLabel}>Managed endpoints under licence</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>9</span>
            <span className={styles.statLabel}>Aegis Zones across India</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>200</span>
            <span className={styles.statLabel}>Configuration checks per endpoint</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>24&times;7</span>
            <span className={styles.statLabel}>Premium support on your core licence</span>
          </div>
        </div>
        <p className={styles.statusLine}>
          Figures are licence entitlements, not live counts. Sign in for current numbers.
        </p>
      </aside>
    </div>
  );
}

/** Lands here from the identity provider with `?code=&state=`. */
export function AuthCallback() {
  const { completeSignIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const code = params.get('code');
  const state = params.get('state');
  const incomplete = !code || !state;

  /**
   * The exchange must happen exactly once, and its result must be applied even
   * if the effect that started it has already been cleaned up.
   *
   * The PKCE verifier is single-use and is cleared the moment it is read.
   * StrictMode runs an effect, cleans it up, and runs it again: a second run
   * would find the verifier spent and report a good sign-in as expired, and a
   * per-run `cancelled` flag would discard the result of the run that actually
   * worked. A ref outlives both runs, so it is the only thing that can guard
   * this correctly.
   */
  const started = useRef(false);

  useEffect(() => {
    if (!code || !state || started.current) return;
    started.current = true;

    void (async () => {
      try {
        await completeSignIn(code, state);
        // replace: true so Back does not re-run a spent authorization code.
        await navigate('/', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in could not be completed.');
      }
    })();
  }, [code, state, completeSignIn, navigate]);

  const message = incomplete
    ? 'That sign-in link is incomplete. Start again from the sign-in page.'
    : error;

  if (message) {
    return (
      <main className={styles.callback}>
        <ErrorState
          title="Could not complete sign-in"
          description={message}
          retryLabel="Back to sign-in"
          onRetry={() => void navigate('/sign-in', { replace: true })}
        />
      </main>
    );
  }

  return (
    <main className={styles.callback} role="status">
      Completing sign-in…
    </main>
  );
}
