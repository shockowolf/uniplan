# UNIPLAN PostgreSQL backup and restore-verification runbook

## Safety boundary

These commands back up PostgreSQL and verify restores in a newly created disposable database. They do not reset, migrate, clean, restore, or drop the application database. Restore verification requires both `UNIPLAN_RESTORE_VERIFY_GUARD=enabled` and a distinct database name ending `_restore_verify`; the command creates that database only if it does not already exist and drops it on every completion path.

Backups never fall back to plaintext or password encryption. Plaintext exists only in a mode-0700 same-filesystem staging directory while `pg_dump` is being encrypted. Cleanup overwrites the temporary file on a best-effort basis, fsyncs it, unlinks it, and removes staging. Filesystem snapshots, copy-on-write behavior, and SSD remapping can defeat overwrite guarantees, so the backup filesystem should itself be encrypted.

Required tools are `pg_dump`, `pg_restore`, `psql`, `createdb`, `dropdb`, `age`, Node.js, npm dependencies, and Prisma CLI. Offsite operation additionally requires `rclone` and configured backend credentials. Tool failures produce bounded JSON errors and never relay tool stderr.

## Age key creation and storage

Create the identity on a secured operator host, not in the repository or backup directory:

```bash
umask 077
age-keygen -o /secure/offline/uniplan-backup.agekey
age-keygen -y /secure/offline/uniplan-backup.agekey
```

The second command prints the public `age1...` recipient. Put only that recipient in `/etc/uniplan/backup.env`. Keep the identity offline or in the restore operator's secret store with mode 0600. Never put `AGE-SECRET-KEY-...` in a manifest, command line, ticket, log, repository, or backup host environment.

For rotation, generate a new identity, change the configured public recipient, and run/verify a new backup before retiring the old recipient. Retain the old identity until every backup encrypted to it has expired under retention and offsite lifecycle policies. The command intentionally accepts one recipient so the encryption boundary is unambiguous.

## Production configuration

Copy `ops/systemd/backup.env.example` to `/etc/uniplan/backup.env`, populate it locally, and set:

```bash
chown root:root /etc/uniplan/backup.env
chmod 0600 /etc/uniplan/backup.env
install -d -o root -g root -m 0700 /var/lib/uniplan-backups
```

`DATABASE_URL` must be a PostgreSQL URL for the source database. It is passed to PostgreSQL tools as `PG*` environment variables, not command arguments. `UNIPLAN_BACKUP_AGE_RECIPIENT` must be one public native age recipient. Production mode forces `UNIPLAN_BACKUP_REQUIRE_OFFSITE=true` even if an operator attempts to opt out.

Configure rclone credentials outside the repository, normally `/etc/uniplan/rclone.conf` mode 0600. `UNIPLAN_BACKUP_RCLONE_DESTINATION` is a directory-like `remote:path`. Each artifact and manifest is copied with `rclone copyto`, then independently verified with remote byte size and `rclone hashsum SHA-256`. A backend that cannot provide the required checksum fails closed. No production offsite success exists until real credentials and the real backend complete those checks.

Install the example units, adjusting `/opt/uniplan` and binary paths for the deployment:

```bash
install -o root -g root -m 0644 ops/systemd/uniplan-backup.service /etc/systemd/system/
install -o root -g root -m 0644 ops/systemd/uniplan-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now uniplan-backup.timer
systemctl list-timers uniplan-backup.timer
```

The timer uses a randomized delay. The oneshot service exits nonzero on every failed required step, so existing systemd monitoring should alert on `uniplan-backup.service` failure. Inspect only bounded application output:

```bash
systemctl status uniplan-backup.service
journalctl -u uniplan-backup.service --since today
```

## Manual encrypted backup

For development, offsite may be omitted but age encryption remains mandatory:

```bash
umask 077
export DATABASE_URL='postgresql://...'
export UNIPLAN_BACKUP_DIRECTORY=/secure/non-repo/uniplan-backups
export UNIPLAN_BACKUP_LOCK_FILE=/run/user/$(id -u)/uniplan-backup.lock
export UNIPLAN_BACKUP_AGE_RECIPIENT='age1...'
export UNIPLAN_BACKUP_REQUIRE_OFFSITE=false
npm run backup:postgres
```

Successful output is one JSON object containing artifact/manifest paths, SHA-256, size, permissions, offsite verification state, and retention count. Confirm the directory is mode 0700 and files are mode 0600. A stale lock is never guessed away: first prove no backup process is running and investigate the previous failure, then remove the configured lock file manually.

## Restore drill

Select an encrypted artifact and its matching manifest. Supply the application URL only as a rejection boundary. Use a separate URL whose database does not exist and whose name ends `_restore_verify`; the account needs permission to create/drop that database on the target PostgreSQL host.

```bash
umask 077
export DATABASE_URL='postgresql://.../uniplan_app?schema=public'
export UNIPLAN_RESTORE_VERIFY_DATABASE_URL='postgresql://.../uniplan_20260714_restore_verify?schema=public'
export UNIPLAN_RESTORE_VERIFY_GUARD=enabled
export UNIPLAN_BACKUP_AGE_IDENTITY_FILE=/secure/offline/uniplan-backup.agekey
export UNIPLAN_RESTORE_VERIFY_TEMP_DIRECTORY=/secure/non-repo/restore-temp
npm run restore:verify -- --artifact /secure/non-repo/uniplan-backups/example.dump.age --manifest /secure/non-repo/uniplan-backups/example.manifest.json
```

The command verifies manifest shape, artifact filename, size, SHA-256, age header, and an exact match between manifest migration count/latest version and the checked-out repository release before decryption. Use the release that produced the backup; an older or newer migration checkout fails closed. It then creates the disposable database, runs `pg_restore --clean --if-exists --no-owner --no-acl`, Prisma validate/migration status, restored migration comparison, required schema/table counts, tenant integrity checks, and a read-only invoice smoke count. Output contains counts only, never rows. The disposable database is force-dropped and plaintext staging removed before success is reported.

After a drill, independently confirm the target is absent from `pg_database`, the temp directory contains no staging entries, and the source application remains reachable/read-only. A `RESTORE_CLEANUP_FAILED` response is an incident: isolate the disposable target and drop only the exact guarded `_restore_verify` database after reviewing active sessions. Never redirect the command to the application database.

## Retention and incident recovery

`UNIPLAN_BACKUP_RETENTION_COUNT` defaults to 7 and has a minimum of 1. Retention considers only strict manifests whose matching artifact size and SHA-256 validate. It removes the old manifest commit marker before its artifact, ignores orphans/malformed files, and never deletes the newest known-good pair. Configure offsite lifecycle rules to preserve at least the same recovery window and avoid deleting the only recoverable key generation.

For backup failures, preserve logs and inspect the safe error code: lock, missing configuration/tool, dump, encryption, publication, offsite copy/verification, or retention. Do not publish staging files manually. Resolve the dependency and rerun. For suspected key exposure, rotate the recipient, produce and restore-verify a new backup, revoke remote access, and retain affected identities only in incident-controlled storage until old artifacts are deliberately expired.

For disaster recovery, first copy the chosen encrypted artifact and manifest into an isolated recovery environment, verify checksum/size, perform this disposable drill, record the bounded result, then follow a separately approved production recovery change plan. This runbook does not authorize a production restore.
