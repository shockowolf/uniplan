import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, authenticatedJsonResponse } from '@/lib/api/responses';
import { createSessionCookie } from '@/lib/auth/cookie';
import {
  MAX_LOGIN_BODY_BYTES,
  readBoundedLoginJson,
} from '@/lib/auth/login-body';
import { expectedRequestOrigin } from '@/lib/auth/origin';
import {
  MAX_SESSION_TTL_SECONDS,
  getSessionTtlSeconds,
} from '@/lib/auth/session';

describe('authentication configuration helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

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

  it('fails production origin configuration closed and accepts one HTTPS origin', () => {
    const request = new Request('https://internal.example/api/auth/login');

    expect(
      expectedRequestOrigin(request, { NODE_ENV: 'production' }),
    ).toBeNull();
    expect(
      expectedRequestOrigin(request, {
        NODE_ENV: 'production',
        UNIPLAN_APP_ORIGIN: 'not-an-origin',
      }),
    ).toBeNull();
    expect(
      expectedRequestOrigin(request, {
        NODE_ENV: 'production',
        UNIPLAN_APP_ORIGIN: 'http://app.example',
      }),
    ).toBeNull();
    expect(
      expectedRequestOrigin(request, {
        NODE_ENV: 'production',
        UNIPLAN_APP_ORIGIN: 'https://app.example',
      }),
    ).toBe('https://app.example');
  });

  it('bounds streamed login JSON at the exact byte limit', async () => {
    const exactBody = JSON.stringify('x'.repeat(MAX_LOGIN_BODY_BYTES - 2));
    const oversizedBody = JSON.stringify('x'.repeat(MAX_LOGIN_BODY_BYTES - 1));

    await expect(
      readBoundedLoginJson(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          body: exactBody,
        }),
      ),
    ).resolves.toMatchObject({ status: 'ok' });
    await expect(
      readBoundedLoginJson(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          body: oversizedBody,
        }),
      ),
    ).resolves.toEqual({ status: 'too_large' });
  });

  it('centralizes private cache headers for authenticated success and errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const responses = [
      authenticatedJsonResponse({ ok: true }),
      apiError(new Error('synthetic failure')),
    ];
    for (const response of responses) {
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('vary')).toBe('Cookie');
    }
  });
});
