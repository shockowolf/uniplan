-- U8 adds an opaque, database-backed login limiter without changing existing rows.
CREATE TABLE "login_rate_limit_buckets" (
    "bucketKey" CHAR(64) NOT NULL,
    "attemptCount" INTEGER NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "windowExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_rate_limit_buckets_pkey" PRIMARY KEY ("bucketKey")
);

CREATE INDEX "login_rate_limit_buckets_windowExpiresAt_idx"
ON "login_rate_limit_buckets"("windowExpiresAt");
