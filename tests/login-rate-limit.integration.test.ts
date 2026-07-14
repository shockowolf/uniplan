import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOGIN_GLOBAL_ATTEMPT_LIMIT,
  LOGIN_IDENTITY_ATTEMPT_LIMIT,
  consumeLoginAttempt,
  getLoginIdentityBucketKey,
} from '@/lib/auth/rate-limit';
import {
  resetTestDatabase,
  testDatabaseClient,
} from './helpers/database';

describe('database-backed login rate limiting', () => {
  beforeEach(resetTestDatabase);
  afterEach(() => vi.unstubAllEnvs());
  afterAll(() => testDatabaseClient.$disconnect());

  it('fails closed without a strong HMAC secret in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UNIPLAN_AUTH_RATE_LIMIT_SECRET', 'too-short');
    expect(() =>
      getLoginIdentityBucketKey('acme-co', 'owner@example.test'),
    ).toThrow('UNIPLAN_AUTH_RATE_LIMIT_SECRET is required in production.');

    vi.stubEnv('UNIPLAN_AUTH_RATE_LIMIT_SECRET', 'x'.repeat(32));
    expect(getLoginIdentityBucketKey('acme-co', 'owner@example.test')).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it('atomically enforces the identity limit under true parallel PostgreSQL calls', async () => {
    const results = await Promise.all(
      Array.from({ length: LOGIN_IDENTITY_ATTEMPT_LIMIT + 7 }, () =>
        consumeLoginAttempt(
          { companyCode: ' Parallel-Co ', email: 'Owner@Example.Test' },
          testDatabaseClient,
        ),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(
      LOGIN_IDENTITY_ATTEMPT_LIMIT,
    );
    expect(results.filter((result) => !result.allowed)).toHaveLength(7);
    expect(
      results.filter((result) => !result.allowed).every(
        (result) => result.retryAfterSeconds > 0,
      ),
    ).toBe(true);
  });

  it('atomically enforces the global abuse limit across parallel identities', async () => {
    const results = await Promise.all(
      Array.from({ length: LOGIN_GLOBAL_ATTEMPT_LIMIT + 5 }, (_, index) =>
        consumeLoginAttempt(
          {
            companyCode: `company-${index}`,
            email: `user-${index}@example.test`,
          },
          testDatabaseClient,
        ),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(
      LOGIN_GLOBAL_ATTEMPT_LIMIT,
    );
    expect(results.filter((result) => !result.allowed)).toHaveLength(5);
  });

  it('normalizes identities and stores only fixed-size opaque bucket keys', async () => {
    const identity = { companyCode: ' Acme-Co ', email: 'Owner@Example.Test ' };
    const normalizedKey = getLoginIdentityBucketKey(
      'acme-co',
      'owner@example.test',
    );
    expect(getLoginIdentityBucketKey(identity.companyCode, identity.email)).toBe(
      normalizedKey,
    );

    await consumeLoginAttempt(identity, testDatabaseClient);
    const storedBuckets = await testDatabaseClient.loginRateLimitBucket.findMany();
    expect(storedBuckets).toHaveLength(2);
    for (const bucket of storedBuckets) {
      expect(bucket.bucketKey).toMatch(/^[a-f0-9]{64}$/);
    }
    const serializedRows = JSON.stringify(storedBuckets).toLowerCase();
    expect(serializedRows).not.toContain('acme-co');
    expect(serializedRows).not.toContain('owner@example.test');
  });
});
