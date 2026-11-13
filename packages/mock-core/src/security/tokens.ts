import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { unauthorized } from '../errors';

/**
 * Access and refresh tokens.
 *
 * The access token is a 15-minute JWT the client holds in memory and sends as
 * a bearer header. The refresh token never reaches JavaScript: it is an opaque
 * random string in an httpOnly, Secure, SameSite=Strict cookie, and only its
 * SHA-256 lives in the store, so a copy of the session table is not a set of
 * usable sessions.
 */

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 12 * 60 * 60;

export interface AccessClaims extends JWTPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  /** Zones the user may see; empty means all. */
  zoneIds: string[];
  /** Session this token belongs to, so revoking a session kills its tokens. */
  sid: string;
}

export interface TokenConfig {
  secret: string;
  issuer: string;
  audience: string;
  /**
   * Access-token lifetime, defaulting to the 15 minutes above.
   *
   * Configurable for one reason: an authenticated active scan outlives a
   * 15-minute token, and ZAP injects a single static bearer. When the token
   * expired mid-scan, 46% of the run came back 401 and the scan still reported
   * success — it had simply stopped testing anything. Raising this for a scan
   * is a deliberate, local choice; the default is unchanged.
   */
  accessTtlSeconds?: number;
}

function keyOf(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  claims: Omit<AccessClaims, 'iat' | 'exp' | 'iss' | 'aud'>,
  config: TokenConfig,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime(`${config.accessTtlSeconds ?? ACCESS_TTL_SECONDS}s`)
    .sign(keyOf(config.secret));
}

export async function verifyAccessToken(token: string, config: TokenConfig): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, keyOf(config.secret), {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['HS256'],
    });
    return payload as AccessClaims;
  } catch {
    // Expired, wrong signature and malformed are one answer to the caller.
    throw unauthorized('Your session has expired. Sign in again.');
  }
}

/** 256 bits from the CSPRNG. Never a uuid, a counter or anything guessable. */
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time compare, so a wrong token cannot be found a byte at a time. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
