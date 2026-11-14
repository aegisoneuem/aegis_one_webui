import { forbidden } from '../errors';
import type { AccessClaims } from './tokens';

/**
 * Permission checks.
 *
 * The UI hides what a user cannot do, but hiding a button is a courtesy, not a
 * control: every route is checked here as well. The required permission comes
 * from the contract's `x-required-permission`, so the server and the spec
 * cannot drift apart.
 */

export interface RoleDefinition {
  id: string;
  name: string;
  /** `['*']` for a role that may do everything. */
  permissions: readonly string[];
  system?: boolean;
}

export function hasPermission(
  claims: Pick<AccessClaims, 'permissions'>,
  required: string,
): boolean {
  if (claims.permissions.includes('*')) return true;
  if (claims.permissions.includes(required)) return true;

  // `devices:*` grants `devices:read`, but never anything outside `devices:`.
  const [area] = required.split(':', 1);
  return area ? claims.permissions.includes(`${area}:*`) : false;
}

export function assertPermission(
  claims: Pick<AccessClaims, 'permissions'>,
  required: string,
): void {
  if (!hasPermission(claims, required)) throw forbidden();
}

/**
 * Zone restriction for a scoped role, as a SQL fragment.
 *
 * An empty `zoneIds` means every zone. A scoped role gets an IN list, so a
 * device outside the user's zones is invisible rather than 403 — which is what
 * stops an id from one zone being probed from another.
 */
export function zoneScope(
  claims: Pick<AccessClaims, 'zoneIds'>,
  column = 'zone_id',
): { sql: string; params: unknown[] } | undefined {
  if (!claims.zoneIds.length) return undefined;
  return {
    sql: `"${column}" IN (${claims.zoneIds.map(() => '?').join(',')})`,
    params: [...claims.zoneIds],
  };
}
