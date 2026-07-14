# U11 — Encrypted backup, offsite adapter, and restore drill

## Goal

Provide production-safe, atomic PostgreSQL backup and restore-verification tooling for UNIPLAN. Produce encrypted artifacts with integrity manifests, optional fail-closed offsite upload, retention, mutual exclusion, and a destructive-restore guard that can never target the application database/schema.

## Backup contract

Implement a non-interactive command that:

1. acquires a host lock so runs cannot overlap;
2. reads `DATABASE_URL` from environment/secure env file without printing it;
3. verifies the target is PostgreSQL and captures database/schema/migration metadata without credentials;
4. writes `pg_dump --format=custom --no-owner --no-acl` to a mode-0700 staging directory on the same filesystem;
5. encrypts with `age` using `UNIPLAN_BACKUP_AGE_RECIPIENT`; no password-mode or plaintext fallback;
6. writes an allow-list JSON manifest containing encrypted artifact filename, size, SHA-256, created timestamp, sanitized database identity, migration count/version and tool versions, but no URL/user/password/row content;
7. fsyncs file and directory and atomically renames encrypted artifact and manifest into the final directory;
8. securely removes plaintext staging files on success or failure;
9. uploads encrypted artifact and manifest through an explicit adapter, preferably `rclone copyto`, only when remote configuration is present;
10. verifies remote size/checksum where the backend supports it;
11. marks a backup successful only after required local/offsite steps pass;
12. applies retention only to complete artifact+manifest pairs and never deletes the last known-good backup.

Production mode must fail closed when encryption recipient, offsite destination, tools, or lock cannot be established. Development may run with `UNIPLAN_BACKUP_REQUIRE_OFFSITE=false`, but must still encrypt.

## Restore verification contract

Implement a separate command that:

- accepts only an encrypted artifact + manifest;
- verifies SHA-256/size before decrypting;
- requires a distinct disposable PostgreSQL database whose name ends `_restore_verify` and explicit guard `UNIPLAN_RESTORE_VERIFY_GUARD=enabled`;
- rejects the application DB name, `public` application target, matching host/database URL, or missing guard;
- creates/uses only the disposable target;
- decrypts to a mode-0700 temporary directory;
- runs `pg_restore --clean --if-exists --no-owner --no-acl` only on the guarded target;
- runs Prisma migration status/schema checks, table/count/integrity checks and a read-only application smoke query;
- outputs a bounded JSON verification summary without row contents/credentials;
- drops/cleans the disposable database or schema on completion;
- removes decrypted plaintext on every exit path.

## Scheduling and operations

- Add example systemd service/timer or cron wrapper using a root-readable env file, `UMask=0077`, randomized delay and failure exit status.
- Add runbook for key generation/storage/rotation, offsite configuration, manual backup, restore drill, failure alerts, retention and incident recovery.
- Never commit a private age identity, recipient tied to a secret file, DB URL, rclone config, backup artifact, dump or manifest with real infrastructure identifiers.
- Add `.gitignore` coverage for local backup artifacts/staging.

## Tests

Use temporary directories and fake executables where appropriate to prove:

- overlapping run rejection;
- missing/weak configuration fail-closed;
- pg_dump/encryption/upload/checksum failures leave no complete artifact and no plaintext;
- atomic publication only after encryption;
- manifest contains no credentials;
- retention keeps last known-good pair;
- restore rejects same DB, unsafe DB name, wrong checksum, missing guard and plaintext input;
- failed restore removes decrypted files;
- offsite-required mode fails if upload/verification fails;
- command output/logs contain no DATABASE_URL, password, recipient private material or row content.

## Real verification

On this host, if `pg_dump`, `pg_restore`, PostgreSQL and `age` are available, perform one real encrypted backup of the current local development DB and a restore drill into a newly created `_restore_verify` database, then destroy the disposable target and retain only the encrypted local test artifact under a non-repository 0700 directory. If `age` is unavailable, install/use it through an approved package path if possible; otherwise report the exact blocker and do not substitute plaintext or weak encryption.

Offsite upload cannot be claimed without real configured credentials. Verify the adapter with a fake/local remote and report production offsite as blocked until credentials are supplied.

## Non-goals

- No production deploy, live DB restore, schema changes, application feature changes, audit log, external alert vendor, credential generation, or invented offsite success.

## Verification

- focused tooling tests;
- shell/TypeScript checks, full app tests/typecheck/build regression;
- actual encrypted local backup + disposable restore drill where prerequisites allow;
- artifact permissions, plaintext absence, checksum and DB cleanup checks;
- git diff/secret/artifact scan;
- no commit/push/deploy by implementation agent.
