import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as loginRequest } from '@/app/api/auth/login/route';
import { POST as logoutRequest } from '@/app/api/auth/logout/route';
import { GET as sessionRequest } from '@/app/api/auth/session/route';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { loginWithPassword, setInvitedUserPassword } from '@/lib/auth/login';
import {
  hashSessionToken,
  resolveSessionToken,
} from '@/lib/auth/session';
import { isDemoAuthenticationEnabled } from '@/lib/auth/permissions';
import {
  createTestCompany,
  resetTestDatabase,
  testDatabaseClient,
} from './helpers/database';

const companyCode = 'INVITED-CO';
const invitedEmail = 'owner@invited.test';
const validPassword = 'invited pilot password';

async function createInvitedUser() {
  const company = await createTestCompany(companyCode);
  const user = await testDatabaseClient.user.create({
    data: {
      companyId: company.id,
      email: invitedEmail,
      passwordHash: await hashPassword(validPassword),
      name: 'Invited Owner',
    },
  });
  return { company, user };
}

function authRequest(
  path: string,
  options: {
    origin?: string;
    body?: Record<string, unknown>;
    token?: string;
  } = {},
) {
  const headers = new Headers();
  if (options.origin) headers.set('Origin', options.origin);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (options.token) {
    headers.set('Cookie', `${SESSION_COOKIE_NAME}=${options.token}`);
  }
  return new Request(`http://localhost${path}`, {
    method: path.endsWith('/session') ? 'GET' : 'POST',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

function validCredentials(password = validPassword) {
  return { companyCode, email: invitedEmail, password };
}

describe('invite-only database session authentication', () => {
  beforeEach(resetTestDatabase);
  afterAll(() => testDatabaseClient.$disconnect());

  it('logs in an active invited user using company-scoped email', async () => {
    const { company, user } = await createInvitedUser();
    const loginResult = await loginWithPassword(
      {
        companyCode,
        email: invitedEmail.toUpperCase(),
        password: validPassword,
      },
      testDatabaseClient,
    );

    expect(loginResult).not.toBeNull();
    expect(loginResult?.user).toMatchObject({
      id: user.id,
      companyId: company.id,
      companyCode,
      email: invitedEmail,
    });
    expect(loginResult?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('returns the same failed result for wrong company, email, or password', async () => {
    await createInvitedUser();
    const failedCredentials = [
      { companyCode: 'OTHER', email: invitedEmail, password: validPassword },
      { companyCode, email: 'missing@invited.test', password: validPassword },
      validCredentials('not the invited password'),
    ];

    for (const credentials of failedCredentials) {
      await expect(
        loginWithPassword(credentials, testDatabaseClient),
      ).resolves.toBeNull();
    }
  });

  it('never stores the raw 256-bit token in the database', async () => {
    await createInvitedUser();
    const loginResult = await loginWithPassword(
      validCredentials(),
      testDatabaseClient,
    );
    const storedSession = await testDatabaseClient.authSession.findUniqueOrThrow({
      where: { id: loginResult?.sessionId },
    });

    expect(storedSession.tokenHash).toBe(hashSessionToken(loginResult!.token));
    expect(storedSession.tokenHash).not.toBe(loginResult?.token);
    expect(JSON.stringify(storedSession)).not.toContain(loginResult!.token);
  });

  it('rejects expired, revoked, inactive-user, and inactive-company sessions', async () => {
    const { company, user } = await createInvitedUser();
    const loginResult = await loginWithPassword(
      validCredentials(),
      testDatabaseClient,
    );
    const token = loginResult!.token;
    const sessionId = loginResult!.sessionId;

    await expect(
      resolveSessionToken(token, testDatabaseClient),
    ).resolves.toMatchObject({ userId: user.id, companyId: company.id });

    await testDatabaseClient.authSession.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(resolveSessionToken(token, testDatabaseClient)).resolves.toBeNull();

    await testDatabaseClient.authSession.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() },
    });
    await expect(resolveSessionToken(token, testDatabaseClient)).resolves.toBeNull();

    await testDatabaseClient.authSession.update({
      where: { id: sessionId },
      data: { revokedAt: null },
    });
    await testDatabaseClient.user.update({
      where: { id: user.id },
      data: { status: 'inactive' },
    });
    await expect(resolveSessionToken(token, testDatabaseClient)).resolves.toBeNull();

    await testDatabaseClient.user.update({
      where: { id: user.id },
      data: { status: 'active' },
    });
    await testDatabaseClient.company.update({
      where: { id: company.id },
      data: { active: false },
    });
    await expect(resolveSessionToken(token, testDatabaseClient)).resolves.toBeNull();
  });

  it('rejects login when the user or company is inactive', async () => {
    const { company, user } = await createInvitedUser();
    await testDatabaseClient.user.update({
      where: { id: user.id },
      data: { status: 'inactive' },
    });
    await expect(
      loginWithPassword(validCredentials(), testDatabaseClient),
    ).resolves.toBeNull();

    await testDatabaseClient.user.update({
      where: { id: user.id },
      data: { status: 'active' },
    });
    await testDatabaseClient.company.update({
      where: { id: company.id },
      data: { active: false },
    });
    await expect(
      loginWithPassword(validCredentials(), testDatabaseClient),
    ).resolves.toBeNull();
  });

  it('rejects cross-origin and origin-less state-changing auth requests', async () => {
    await createInvitedUser();
    const crossOriginResponse = await loginRequest(
      authRequest('/api/auth/login', {
        origin: 'https://attacker.example',
        body: validCredentials(),
      }),
    );
    const missingOriginResponse = await loginRequest(
      authRequest('/api/auth/login', { body: validCredentials() }),
    );
    const crossOriginLogoutResponse = await logoutRequest(
      authRequest('/api/auth/logout', {
        origin: 'https://attacker.example',
        token: 'A'.repeat(43),
      }),
    );

    expect(crossOriginResponse.status).toBe(403);
    expect(missingOriginResponse.status).toBe(403);
    expect(crossOriginLogoutResponse.status).toBe(403);
    await expect(testDatabaseClient.authSession.count()).resolves.toBe(0);
  });

  it('resets an invited password and revokes that user\'s existing sessions', async () => {
    const { user } = await createInvitedUser();
    const originalLogin = await loginWithPassword(
      validCredentials(),
      testDatabaseClient,
    );
    const replacementPassword = 'replacement invited password';

    await setInvitedUserPassword(
      { companyCode, email: invitedEmail, password: replacementPassword },
      testDatabaseClient,
    );

    const updatedUser = await testDatabaseClient.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    await expect(
      verifyPassword(replacementPassword, updatedUser.passwordHash),
    ).resolves.toBe(true);
    await expect(
      resolveSessionToken(originalLogin!.token, testDatabaseClient),
    ).resolves.toBeNull();
    await expect(
      loginWithPassword(validCredentials(), testDatabaseClient),
    ).resolves.toBeNull();
    await expect(
      loginWithPassword(
        validCredentials(replacementPassword),
        testDatabaseClient,
      ),
    ).resolves.not.toBeNull();
  });

  it('uses generic API errors and sets a bounded hardened cookie on success', async () => {
    await createInvitedUser();
    const unknownUserResponse = await loginRequest(
      authRequest('/api/auth/login', {
        origin: 'http://localhost',
        body: { ...validCredentials(), email: 'unknown@invited.test' },
      }),
    );
    const wrongPasswordResponse = await loginRequest(
      authRequest('/api/auth/login', {
        origin: 'http://localhost',
        body: validCredentials('wrong password'),
      }),
    );

    expect(unknownUserResponse.status).toBe(401);
    expect(wrongPasswordResponse.status).toBe(401);
    expect(await unknownUserResponse.json()).toEqual(
      await wrongPasswordResponse.json(),
    );

    const successResponse = await loginRequest(
      authRequest('/api/auth/login', {
        origin: 'http://localhost',
        body: validCredentials(),
      }),
    );
    const setCookie = successResponse.headers.get('set-cookie');
    expect(successResponse.status).toBe(200);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toMatch(/Max-Age=\d+/);
  });

  it('resolves the session API and makes duplicate concurrent logout safe', async () => {
    await createInvitedUser();
    const loginResult = await loginWithPassword(
      validCredentials(),
      testDatabaseClient,
    );
    const token = loginResult!.token;

    const activeSessionResponse = await sessionRequest(
      authRequest('/api/auth/session', { token }),
    );
    expect(activeSessionResponse.status).toBe(200);
    await expect(activeSessionResponse.json()).resolves.toMatchObject({
      authenticated: true,
      user: { email: invitedEmail, companyCode },
    });

    const [firstLogout, duplicateLogout] = await Promise.all([
      logoutRequest(
        authRequest('/api/auth/logout', {
          origin: 'http://localhost',
          token,
        }),
      ),
      logoutRequest(
        authRequest('/api/auth/logout', {
          origin: 'http://localhost',
          token,
        }),
      ),
    ]);
    expect(firstLogout.status).toBe(204);
    expect(duplicateLogout.status).toBe(204);
    await expect(
      resolveSessionToken(token, testDatabaseClient),
    ).resolves.toBeNull();

    const thirdLogout = await logoutRequest(
      authRequest('/api/auth/logout', {
        origin: 'http://localhost',
        token,
      }),
    );
    expect(thirdLogout.status).toBe(204);
  });

  it('never enables the demo identity fallback in production', () => {
    expect(
      isDemoAuthenticationEnabled({
        NODE_ENV: 'production',
        UNIPLAN_DEMO_AUTH_ENABLED: 'true',
      }),
    ).toBe(false);
    expect(
      isDemoAuthenticationEnabled({
        NODE_ENV: 'development',
        UNIPLAN_DEMO_AUTH_ENABLED: 'true',
      }),
    ).toBe(true);
  });
});
