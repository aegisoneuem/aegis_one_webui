import { randomUUID } from 'node:crypto';
import { REFRESH_TTL_SECONDS, hashToken, newOpaqueToken } from './tokens';

/**
 * Refresh-session store.
 *
 * Only the SHA-256 of each refresh token is kept, so reading the store does
 * not yield a usable session. Refresh rotates the token and the old one is
 * invalidated immediately; if a rotated token is presented again that means it
 * was captured, so the whole session family is revoked rather than just the
 * one token.
 */

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  /** Set when a stolen-token replay has been detected. */
  revokedAt?: number;
  userAgent?: string;
  ip?: string;
}

export class SessionStore {
  private readonly byId = new Map<string, Session>();
  private readonly byHash = new Map<string, string>();

  create(userId: string, meta: { userAgent?: string; ip?: string } = {}): { session: Session; token: string } {
    const token = newOpaqueToken();
    const session: Session = {
      id: randomUUID(),
      userId,
      tokenHash: hashToken(token),
      createdAt: Date.now(),
      expiresAt: Date.now() + REFRESH_TTL_SECONDS * 1000,
      ...(meta.userAgent ? { userAgent: meta.userAgent } : {}),
      ...(meta.ip ? { ip: meta.ip } : {}),
    };
    this.byId.set(session.id, session);
    this.byHash.set(session.tokenHash, session.id);
    return { session, token };
  }

  /**
   * Exchanges a refresh token for a new one.
   *
   * Returns null for anything that is not a live token. A token that is known
   * but already rotated means a replay, so its session is revoked outright.
   */
  rotate(token: string): { session: Session; token: string } | null {
    const hash = hashToken(token);
    const sessionId = this.byHash.get(hash);
    if (!sessionId) return null;

    const session = this.byId.get(sessionId);
    if (!session) return null;

    if (session.revokedAt || Date.now() > session.expiresAt) return null;

    if (session.tokenHash !== hash) {
      // A superseded token from a live session: treat it as theft.
      this.revoke(session.id);
      return null;
    }

    this.byHash.delete(hash);
    const next = newOpaqueToken();
    session.tokenHash = hashToken(next);
    this.byHash.set(session.tokenHash, session.id);
    return { session, token: next };
  }

  get(sessionId: string): Session | undefined {
    const session = this.byId.get(sessionId);
    if (!session || session.revokedAt || Date.now() > session.expiresAt) return undefined;
    return session;
  }

  revoke(sessionId: string): void {
    const session = this.byId.get(sessionId);
    if (!session) return;
    session.revokedAt = Date.now();
    this.byHash.delete(session.tokenHash);
  }

  revokeAllFor(userId: string): void {
    for (const session of this.byId.values()) if (session.userId === userId) this.revoke(session.id);
  }

  sweep(): void {
    const now = Date.now();
    for (const [id, session] of this.byId) {
      if (now > session.expiresAt) {
        this.byHash.delete(session.tokenHash);
        this.byId.delete(id);
      }
    }
  }
}
