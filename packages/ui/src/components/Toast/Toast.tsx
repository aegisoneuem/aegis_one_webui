import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../cx';
import styles from './Toast.module.css';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title: string;
  message?: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. Errors stay until dismissed by default. */
  durationMs?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastRecord extends ToastOptions {
  id: number;
}

export interface ToastApi {
  show: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Throws outside a ToastProvider, rather than silently dropping messages. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

export interface ToastProviderProps {
  children: ReactNode;
  /** Cap on simultaneous toasts; the oldest is dropped past this. */
  max?: number;
}

export function ToastProvider({ children, max = 4 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (options: ToastOptions): number => {
      const id = nextId.current++;
      setToasts((list) => [...list, { ...options, id }].slice(-max));
      const tone = options.tone ?? 'info';
      const duration = options.durationMs ?? (tone === 'error' ? 0 : 5000);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss, max],
  );

  // Clear any pending auto-dismiss timers when the provider unmounts.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className={styles.region} role="region" aria-label="Notifications">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cx(styles.toast, styles[t.tone ?? 'info'])}
              // Errors interrupt; everything else waits for a pause in speech.
              role={t.tone === 'error' ? 'alert' : 'status'}
            >
              <div className={styles.body}>
                <span className={styles.title}>{t.title}</span>
                {t.message ? <span className={styles.message}>{t.message}</span> : null}
                {t.action ? (
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => {
                      dismiss(t.id);
                      t.action?.onClick();
                    }}
                  >
                    {t.action.label}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className={styles.dismiss}
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
              >
                &#10005;
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
