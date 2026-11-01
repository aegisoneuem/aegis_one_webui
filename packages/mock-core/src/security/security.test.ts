import { describe, expect, it } from 'vitest';
import { SessionStore } from './sessions';
import { hasPermission, zoneScope } from './rbac';
import { hashToken, newOpaqueToken, safeEqual, signAccessToken, verifyAccessToken } from './tokens';
import { ApiError } from '../errors';

const config = { secret: 'test-secret-at-least-32-characters-long!', issuer: 'test', audience: 'test-aud' };

describe('SessionStore', () => {
  it('stores only the hash of a refresh token', () => {
    const store = new SessionStore();
    const { session, token } = store.create('usr-1');
    expect(session.tokenHash).toBe(hashToken(token));
    expect(session.tokenHash).not.toBe(token);
    expect(JSON.stringify(session)).not.toContain(token);
  });

  it('rotates the token on every use', () => {
    const store = new SessionStore();
    const { token } = store.create('usr-1');
    const rotated = store.rotate(token);
    expect(rotated?.token).toBeTypeOf('string');
    expect(rotated?.token).not.toBe(token);
  });

  it('revokes the session family when a spent token is replayed', () => {
    const store = new SessionStore();
    const { session, token } = store.create('usr-1');

    const first = store.rotate(token);
    expect(first).not.toBeNull();

    // Presenting the superseded token means someone else has a copy.
    expect(store.rotate(token)).toBeNull();
    expect(store.get(session.id)).toBeUndefined();

    // The legitimate holder's newest token is dead too, which is the point.
    expect(store.rotate(first?.token ?? '')).toBeNull();
  });

  it('refuses an unknown token', () => {
    const store = new SessionStore();
    expect(store.rotate(newOpaqueToken())).toBeNull();
  });

  it('refuses a revoked session', () => {
    const store = new SessionStore();
    const { session, token } = store.create('usr-1');
    store.revoke(session.id);
    expect(store.rotate(token)).toBeNull();
    expect(store.get(session.id)).toBeUndefined();
  });

  it('revokes every session a user holds', () => {
    const store = new SessionStore();
    const a = store.create('usr-1');
    const b = store.create('usr-1');
    const other = store.create('usr-2');

    store.revokeAllFor('usr-1');
    expect(store.get(a.session.id)).toBeUndefined();
    expect(store.get(b.session.id)).toBeUndefined();
    expect(store.get(other.session.id)).toBeDefined();
  });
});

describe('access tokens', () => {
  const claims = {
    sub: 'usr-1',
    email: 'a@example.co.in',
    name: 'A',
    role: 'Operator',
    permissions: ['devices:read'],
    zoneIds: [],
    sid: 'sid-1',
  };

  it('round-trips its claims', async () => {
    const token = await signAccessToken(claims, config);
    const verified = await verifyAccessToken(token, config);
    expect(verified.sub).toBe('usr-1');
    expect(verified.permissions).toEqual(['devices:read']);
  });

  it('refuses a token signed with another secret', async () => {
    const token = await signAccessToken(claims, { ...config, secret: 'a-completely-different-secret-value!!' });
    await expect(verifyAccessToken(token, config)).rejects.toThrow(ApiError);
  });

  it('refuses a token minted for another audience', async () => {
    const token = await signAccessToken(claims, { ...config, audience: 'someone-else' });
    await expect(verifyAccessToken(token, config)).rejects.toThrow(ApiError);
  });

  it('refuses a tampered token', async () => {
    const token = await signAccessToken(claims, config);
    // The payload is replaced, so only the header and signature are reused.
    const [header, , signature] = token.split('.');
    const forged = `${header}.${Buffer.from(
      JSON.stringify({ ...claims, permissions: ['*'] }),
      'utf8',
    ).toString('base64url')}.${signature}`;
    await expect(verifyAccessToken(forged, config)).rejects.toThrow(ApiError);
  });
});

describe('safeEqual', () => {
  it('matches identical strings', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
  });

  it('rejects different strings and different lengths', () => {
    expect(safeEqual('abc123', 'abc124')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('hasPermission', () => {
  it('grants everything to a wildcard', () => {
    expect(hasPermission({ permissions: ['*'] }, 'admin:tokens')).toBe(true);
  });

  it('grants an exact match', () => {
    expect(hasPermission({ permissions: ['devices:read'] }, 'devices:read')).toBe(true);
  });

  it('grants within an area wildcard but never outside it', () => {
    expect(hasPermission({ permissions: ['devices:*'] }, 'devices:action')).toBe(true);
    expect(hasPermission({ permissions: ['devices:*'] }, 'admin:tokens')).toBe(false);
  });

  it('refuses a permission the role does not hold', () => {
    expect(hasPermission({ permissions: ['devices:read'] }, 'devices:action')).toBe(false);
    expect(hasPermission({ permissions: [] }, 'devices:read')).toBe(false);
  });

  it('does not treat a prefix as a grant', () => {
    expect(hasPermission({ permissions: ['admin:users'] }, 'admin:users:delete')).toBe(false);
  });
});

describe('zoneScope', () => {
  it('returns nothing for an unscoped role, meaning every zone', () => {
    expect(zoneScope({ zoneIds: [] })).toBeUndefined();
  });

  it('parameterises the zone list rather than interpolating it', () => {
    const scope = zoneScope({ zoneIds: ['zn-a', 'zn-b'] });
    expect(scope?.sql).toBe('"zone_id" IN (?,?)');
    expect(scope?.params).toEqual(['zn-a', 'zn-b']);
  });
});
