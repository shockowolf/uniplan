import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionCookie } from '@/lib/auth/cookie';
import {
  MAX_SESSION_TTL_SECONDS,
  getSessionTtlSeconds,
} from '@/lib/auth/session';

describe('authentication configuration helpers', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses Secure and a bounded Max-Age for production cookies', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const now = new Date('2026-07-14T00:00:00.000Z');
    const cookie = createSessionCookie(
      'A'.repeat(43),
      new Date(now.getTime() + (MAX_SESSION_TTL_SECONDS + 600) * 1_000),
      now,
    );

    expect(cookie).toContain(`Max-Age=${MAX_SESSION_TTL_SECONDS}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Secure');
  });

  it('accepts only bounded integer session durations', () => {
    expect(getSessionTtlSeconds('28800')).toBe(28_800);
    expect(() => getSessionTtlSeconds('60')).toThrow(/between/);
    expect(() => getSessionTtlSeconds('not-a-number')).toThrow(/integer/);
  });
});
