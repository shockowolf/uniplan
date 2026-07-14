import { createHmac } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';

export const LOGIN_IDENTITY_ATTEMPT_LIMIT = 5;
export const LOGIN_IDENTITY_WINDOW_SECONDS = 15 * 60;
export const LOGIN_GLOBAL_ATTEMPT_LIMIT = 120;
export const LOGIN_GLOBAL_WINDOW_SECONDS = 60;

type LoginLimiterDatabaseClient = PrismaClient | Prisma.TransactionClient;

type LoginBucketPolicy = {
  bucketKey: string;
  maxAttempts: number;
  windowSeconds: number;
};

type ConsumedBucketRow = {
  bucketKey: string;
  attemptCount: number;
  windowExpiresAt: Date;
  maxAttempts: number;
  checkedAt: Date;
};

function normalizeIdentityPart(value: string) {
  return value.normalize('NFKC').trim().toLowerCase();
}

function rateLimitSecret(environment: NodeJS.ProcessEnv = process.env) {
  const configuredSecret = environment.UNIPLAN_AUTH_RATE_LIMIT_SECRET?.trim();
  if (configuredSecret && Buffer.byteLength(configuredSecret, 'utf8') >= 32) {
    return configuredSecret;
  }
  if (environment.NODE_ENV === 'production') {
    throw new Error('UNIPLAN_AUTH_RATE_LIMIT_SECRET is required in production.');
  }
  return 'uniplan-local-rate-limit-secret-not-for-production';
}

function opaqueBucketKey(value: string) {
  return createHmac('sha256', rateLimitSecret())
    .update(value, 'utf8')
    .digest('hex');
}

export function getLoginIdentityBucketKey(companyCode: string, email: string) {
  const normalizedCompanyCode = normalizeIdentityPart(companyCode);
  const normalizedEmail = normalizeIdentityPart(email);
  return opaqueBucketKey(
    `uniplan-login-limiter:v1:identity\0${normalizedCompanyCode}\0${normalizedEmail}`,
  );
}

function getGlobalLoginBucketKey() {
  return opaqueBucketKey('uniplan-login-limiter:v1:global');
}

function loginBucketPolicies(companyCode: string, email: string) {
  return [
    {
      bucketKey: getGlobalLoginBucketKey(),
      maxAttempts: LOGIN_GLOBAL_ATTEMPT_LIMIT,
      windowSeconds: LOGIN_GLOBAL_WINDOW_SECONDS,
    },
    {
      bucketKey: getLoginIdentityBucketKey(companyCode, email),
      maxAttempts: LOGIN_IDENTITY_ATTEMPT_LIMIT,
      windowSeconds: LOGIN_IDENTITY_WINDOW_SECONDS,
    },
  ];
}

async function atomicallyConsumeBuckets(
  policies: LoginBucketPolicy[],
  databaseClient: LoginLimiterDatabaseClient,
) {
  const inputRows = Prisma.join(
    policies.map(
      (policy) => Prisma.sql`(
        ${policy.bucketKey}::char(64),
        ${policy.windowSeconds}::integer,
        ${policy.maxAttempts}::integer
      )`,
    ),
  );

  return databaseClient.$queryRaw<ConsumedBucketRow[]>(Prisma.sql`
    WITH input("bucketKey", "windowSeconds", "maxAttempts") AS (
      VALUES ${inputRows}
    ), consumed AS (
      INSERT INTO "login_rate_limit_buckets" (
        "bucketKey",
        "attemptCount",
        "windowStartedAt",
        "windowExpiresAt",
        "createdAt",
        "updatedAt"
      )
      SELECT
        input."bucketKey",
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP + make_interval(secs => input."windowSeconds"),
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM input
      ON CONFLICT ("bucketKey") DO UPDATE SET
        "attemptCount" = CASE
          WHEN "login_rate_limit_buckets"."windowExpiresAt" <= CURRENT_TIMESTAMP
            THEN 1
          ELSE "login_rate_limit_buckets"."attemptCount" + 1
        END,
        "windowStartedAt" = CASE
          WHEN "login_rate_limit_buckets"."windowExpiresAt" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP
          ELSE "login_rate_limit_buckets"."windowStartedAt"
        END,
        "windowExpiresAt" = CASE
          WHEN "login_rate_limit_buckets"."windowExpiresAt" <= CURRENT_TIMESTAMP
            THEN EXCLUDED."windowExpiresAt"
          ELSE "login_rate_limit_buckets"."windowExpiresAt"
        END,
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "bucketKey", "attemptCount", "windowExpiresAt"
    )
    SELECT
      consumed."bucketKey",
      consumed."attemptCount",
      consumed."windowExpiresAt",
      input."maxAttempts",
      CURRENT_TIMESTAMP AS "checkedAt"
    FROM consumed
    JOIN input USING ("bucketKey")
  `);
}

export async function consumeLoginAttempt(
  identity: { companyCode: string; email: string },
  databaseClient: LoginLimiterDatabaseClient = prisma,
) {
  const identityBucketKey = getLoginIdentityBucketKey(
    identity.companyCode,
    identity.email,
  );
  const consumedBuckets = await atomicallyConsumeBuckets(
    loginBucketPolicies(identity.companyCode, identity.email),
    databaseClient,
  );
  const exceededBuckets = consumedBuckets.filter(
    (bucket) => bucket.attemptCount > bucket.maxAttempts,
  );
  const retryAfterSeconds = exceededBuckets.length
    ? Math.max(
        1,
        ...exceededBuckets.map((bucket) =>
          Math.ceil(
            (bucket.windowExpiresAt.getTime() - bucket.checkedAt.getTime()) /
              1_000,
          ),
        ),
      )
    : 0;

  return {
    allowed: exceededBuckets.length === 0,
    identityBucketKey,
    retryAfterSeconds,
  };
}

export async function clearLoginIdentityBucket(
  identityBucketKey: string,
  databaseClient: LoginLimiterDatabaseClient = prisma,
) {
  await databaseClient.loginRateLimitBucket.deleteMany({
    where: { bucketKey: identityBucketKey },
  });
}
