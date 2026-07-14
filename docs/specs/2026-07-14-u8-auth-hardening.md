# U8 — Production authentication hardening

## Goal

Close the production authentication blockers found in review of `b760f20` without weakening the U7 real-session/tenant authorization boundary.

## Scope

1. Add a database-backed login rate limiter that runs before password verification.
2. Bound login request bodies before JSON parsing.
3. Add private/no-store caching policy to every authenticated API success and error response.
4. Make production origin configuration fail closed.
5. Clear the browser session cookie even when server-side logout revocation fails.
6. Clear invalid session cookies from the session endpoint.
7. Add expired/revoked session retention cleanup and a bounded active-session policy if it can be done additively in the same migration.

## Login limiter requirements

- Must be safe across multiple app processes; no process-local Map.
- Store only SHA-256/HMAC-derived opaque bucket keys. Never store raw IP, email, or company code in limiter rows.
- Apply both:
  - a normalized `(companyCode,email)` bucket;
  - a global abuse bucket.
- If proxy-derived IP limiting is added, trust proxy headers only when an explicit server-only production setting enables it; otherwise omit IP rather than trusting public headers.
- Use a database atomic upsert/update so parallel requests cannot all pass a stale count check.
- Use bounded windows and return `429` with `Retry-After`.
- Keep login failure responses generic.
- Successful login clears or relaxes the identity bucket in a documented transaction-safe way.
- Add a scheduled cleanup function/script for expired buckets; do not create a cron job in this task.
- Add true parallel PostgreSQL tests proving the limit is enforced.

## Request body limit

- Reject oversized login JSON before materializing an unbounded body.
- Return the existing safe API error shape.
- Add boundary tests.

## Cache policy

- Centralize `Cache-Control: private, no-store` and `Vary: Cookie` in authenticated response helpers.
- Ensure 2xx, 4xx, and 5xx responses for authenticated business APIs cannot be shared-cached.
- Public/static endpoints may retain their current behavior.

## Origin policy

- In production, `UNIPLAN_APP_ORIGIN` is required and must be one valid HTTPS origin.
- Do not derive production trust from `request.url` or forwarded host.
- Local/test development may keep an explicit localhost fallback.
- Add configuration tests for missing, invalid, HTTP production, and valid HTTPS origins.

## Logout/session lifecycle

- Logout must always return a cookie-clearing header even if DB revocation fails.
- Do not falsely claim server-side revocation succeeded; use a safe error status and log without token material.
- `/api/auth/session` must clear a stale/invalid cookie on 401.
- Never log session tokens or hashes.

## Non-goals

- Do not implement page middleware, OAuth, password reset emails, audit log system, DB tenant composite FKs, inventory/BOM concurrency fixes, backup, deployment, or UI redesign.
- Do not restore demo identity in business APIs.

## Verification

- Migration deploy against current PostgreSQL preserving existing company/user counts.
- Focused auth/rate-limit tests including true parallel requests.
- Full tests, typecheck, production build, diff-check.
- Search confirms zero `authorizeDemoRequest` in `app/api`.
- No secrets or raw login identifiers in limiter storage.
- Do not commit, push, merge, or deploy.
