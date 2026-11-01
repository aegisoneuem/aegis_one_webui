import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorState } from '@aegis/ui';
import { useAuth } from '../app/auth';
import mark from '../assets/brand/aegis-mark.svg';
import styles from './SignIn.module.css';

/**
 * Sign-in screen.
 *
 * There is no password field here, and there never will be: the console does
 * not handle credentials. The button hands off to the organisation's identity
 * provider, which collects the password and the second factor and sends back
 * an authorization code.
 */
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
      <div className={styles.panel}>
        <div className={styles.brand}>
          <img className={styles.mark} src={mark} alt="" />
          <span className={styles.wordmark}>AEGIS ONE</span>
        </div>

        <h1 className={styles.title}>Sign in to the console</h1>
        <p className={styles.lede}>
          Endpoint management for your estate — inventory, patching, software, vulnerabilities and
          configuration across every Aegis Zone.
        </p>

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
            {status === 'checking' ? 'Checking your session…' : 'Continue with single sign-on'}
          </Button>
        </div>

        <p className={styles.note}>
          You will be taken to your organisation&rsquo;s identity provider to enter your password
          and your second factor. This console never sees either.
        </p>
      </div>

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

  useEffect(() => {
    if (!code || !state) return;

    let cancelled = false;
    void (async () => {
      try {
        await completeSignIn(code, state);
        // replace: true so Back does not re-run a spent authorization code.
        if (!cancelled) await navigate('/', { replace: true });
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Sign-in could not be completed.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, state, completeSignIn, navigate]);

  const message = incomplete
    ? 'That sign-in link is incomplete. Start again from the sign-in page.'
    : error;

  if (message) {
    return (
      <div className={styles.callback}>
        <ErrorState
          title="Could not complete sign-in"
          description={message}
          retryLabel="Back to sign-in"
          onRetry={() => void navigate('/sign-in', { replace: true })}
        />
      </div>
    );
  }

  return (
    <div className={styles.callback} role="status">
      Completing sign-in…
    </div>
  );
}
