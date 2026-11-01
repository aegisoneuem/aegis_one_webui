import type { KpiTone, StatusTone } from '@aegis/ui';

/**
 * Formatting shared by every page.
 *
 * The estate is Indian, so numbers group the Indian way — 48,210 but
 * 12,48,210 — which `en-IN` does and `en-US` does not.
 */

const NUMBER = new Intl.NumberFormat('en-IN');
const DATE = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const num = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : NUMBER.format(value);

export const pct = (value: number | null | undefined, digits = 1): string =>
  value === null || value === undefined ? '—' : `${value.toFixed(digits).replace(/\.0$/, '')}%`;

export const date = (iso: string | null | undefined): string =>
  iso ? DATE.format(new Date(iso)) : '—';

export const dateTime = (iso: string | null | undefined): string =>
  iso ? DATE_TIME.format(new Date(iso)) : '—';

/** "4 minutes ago". Falls back to an absolute date past a week. */
export function relative(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);

  if (seconds < 0) return dateTime(iso);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} hr ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)} d ago`;
  return date(iso);
}

export function bytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size < 10 && unit > 0 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

export const duration = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
};

/**
 * Tone for a status value. One table rather than a conditional in each page,
 * so "failed" is never red in one list and grey in another.
 */
const TONES: Record<string, StatusTone> = {
  // Device and service
  online: 'good',
  healthy: 'good',
  connected: 'good',
  active: 'good',
  offline: 'neutral',
  disconnected: 'bad',
  unknown: 'neutral',
  'pending-restart': 'warn',
  degraded: 'warn',
  disabled: 'neutral',

  // Jobs and deployments
  completed: 'good',
  succeeded: 'good',
  installed: 'good',
  running: 'info',
  queued: 'info',
  scheduled: 'info',
  pending: 'warn',
  waiting: 'warn',
  'completed-with-errors': 'warn',
  failed: 'bad',
  'timed-out': 'bad',
  unreachable: 'bad',
  cancelled: 'neutral',
  skipped: 'neutral',
  'not-applicable': 'neutral',
  uploaded: 'good',

  // Findings and checks
  open: 'bad',
  remediated: 'good',
  'accepted-risk': 'warn',
  pass: 'good',
  fail: 'bad',

  // Severity
  critical: 'bad',
  high: 'bad',
  important: 'warn',
  medium: 'warn',
  moderate: 'warn',
  low: 'neutral',
  suspended: 'neutral',
  draft: 'neutral',
};

export const toneFor = (status: string | null | undefined): StatusTone =>
  (status ? TONES[status.toLowerCase()] : undefined) ?? 'neutral';

/** "pending-restart" -> "Pending restart". */
export const humanise = (value: string | null | undefined): string => {
  if (!value) return '—';
  const spaced = value.replace(/[-_]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** Colours a percentage the way the console reads it: high is good. */
export function complianceTone(value: number): KpiTone {
  if (value >= 95) return 'good';
  if (value >= 85) return 'warn';
  return 'bad';
}
