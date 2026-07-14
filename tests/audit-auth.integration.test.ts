import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as loginRequest } from '@/app/api/auth/login/route';
import { POST as logoutRequest } from '@/app/api/auth/logout/route';
import { cleanupAuthenticationState } from '@/lib/auth/cleanup';
import { setInvitedUserPassword } from '@/lib/auth/login';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';
import {
  createTestCompany,
  resetTestDatabase,
  testDatabaseClient,
} from './helpers/database';

function authRequest(
  path: string,
  options: { body?: Record<string, unknown>; token?: string } = {},
) {
  const headers = new Headers({ Origin: 'http://localhost' });
  if (options.body) headers.set('Content-Type', 'application/json');
  if (options.token) {
    headers.set('Cookie', `${SESSION_COOKIE_NAME}=${options.token}`);
  }
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

describe('authentication system audit events', () => {
  beforeEach(resetTestDatabase);
  afterAll(() => testDatabaseClient.$disconnect());

  it('records success, denied, rate-limited, logout, reset, and cleanup without raw credentials', async () => {
    const company = await createTestCompany('AUDIT-AUTH');
    const email = 'invited-user@example.test';
    const password = 'Correct Horse Battery Staple! 42';
    const user = await testDatabaseClient.user.create({
      data: {
        companyId: company.id,
        email,
        passwordHash: await hashPassword(password),
        name: 'Invited User',
      },
    });
    const credentials = {
      companyCode: company.code,
      email,
      password: 'Wrong Password! 42',
    };

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await loginRequest(
        authRequest('/api/auth/login', { body: credentials }),
      );
      expect(response.status).toBe(attempt < 5 ? 401 : 429);
    }
    const deniedEvents = await testDatabaseClient.auditEvent.findMany({
      where: {
        companyId: company.id,
        action: { in: ['auth.login', 'auth.login.rate_limited'] },
        outcome: 'DENIED',
      },
    });
    expect(deniedEvents).toHaveLength(6);
    expect(
      deniedEvents.filter((event) => event.action === 'auth.login.rate_limited'),
    ).toHaveLength(1);
    expect(deniedEvents.every((event) => event.actorUserId === null)).toBe(true);
    expect(deniedEvents.every((event) => event.subjectHash?.length === 64)).toBe(
      true,
    );

    await testDatabaseClient.loginRateLimitBucket.deleteMany();
    const successfulLogin = await loginRequest(
      authRequest('/api/auth/login', {
        body: { ...credentials, password },
      }),
    );
    expect(successfulLogin.status).toBe(200);
    const setCookie = successfulLogin.headers.get('set-cookie') ?? '';
    const sessionToken = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(
      setCookie,
    )?.[1];
    expect(sessionToken).toBeTruthy();
    await expect(
      testDatabaseClient.auditEvent.count({
        where: {
          companyId: company.id,
          actorUserId: user.id,
          action: 'auth.login',
          outcome: 'SUCCEEDED',
        },
      }),
    ).resolves.toBe(1);

    const logout = await logoutRequest(
      authRequest('/api/auth/logout', { token: sessionToken }),
    );
    expect(logout.status).toBe(204);
    await expect(
      testDatabaseClient.auditEvent.count({
        where: {
          companyId: company.id,
          actorUserId: user.id,
          action: 'auth.logout',
          outcome: 'SUCCEEDED',
        },
      }),
    ).resolves.toBe(1);

    await setInvitedUserPassword(
      { companyCode: company.code, email, password: `${password} reset` },
      testDatabaseClient,
    );
    await cleanupAuthenticationState(testDatabaseClient, {
      now: new Date(Date.now() + 10 * 24 * 60 * 60 * 1_000),
      retentionDays: 1,
    });
    await expect(
      testDatabaseClient.auditEvent.count({
        where: {
          companyId: company.id,
          actorUserId: null,
          action: { in: ['auth.password_reset', 'auth.cleanup'] },
          outcome: 'SUCCEEDED',
        },
      }),
    ).resolves.toBe(2);

    const persistedAuditJson = JSON.stringify(
      await testDatabaseClient.auditEvent.findMany({
        where: { companyId: company.id },
      }),
    );
    for (const forbiddenRawValue of [
      company.code,
      email,
      password,
      credentials.password,
      sessionToken!,
    ]) {
      expect(persistedAuditJson).not.toContain(forbiddenRawValue);
    }
    const metadataJson = JSON.stringify(
      (
        await testDatabaseClient.auditEvent.findMany({
          where: { companyId: company.id },
          select: { metadata: true },
        })
      ).map((event) => event.metadata),
    );
    expect(metadataJson).not.toMatch(
      /email|company|name|password|cookie|token|body|stack/i,
    );
  });
});
