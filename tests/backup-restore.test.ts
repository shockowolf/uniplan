import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupManifest, MANIFEST_SCHEMA } from '../lib/backup/common';
import { applyPairAwareRetention } from '../lib/backup/retention';

const roots: string[] = [];
const repositoryRoot = resolve('.');
const backupCommand = join(repositoryRoot, 'scripts', 'backup-postgres.ts');
const restoreCommand = join(repositoryRoot, 'scripts', 'restore-verify-postgres.ts');
const publicRecipient = `age1${'q'.repeat(58)}`;
const secretPassword = 'never-log-this-password';
const privateMaterial = ['AGE', 'SECRET', 'KEY', '1PRIVATE-MATERIAL'].join('-');
const rowContent = 'PRIVATE-CUSTOMER-ROW-CONTENT';

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), 'uniplan-backup-test-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function executable(path: string, body: string) {
  writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`, { mode: 0o700 });
  chmodSync(path, 0o700);
}

function fakeTools(root: string) {
  const bin = join(root, 'bin');
  mkdirSync(bin, { mode: 0o700 });
  executable(
    join(bin, 'pg_dump'),
    `if [[ "\${1:-}" == "--version" ]]; then echo 'pg_dump (PostgreSQL) 16.9'; exit 0; fi
if [[ "\${FAKE_FAIL_PG_DUMP:-}" == "true" ]]; then echo "\${DATABASE_URL:-} ${secretPassword} ${rowContent}" >&2; exit 9; fi
output=''
while (($#)); do if [[ "$1" == "--file" ]]; then output="$2"; shift 2; else shift; fi; done
printf 'PGDMP\\n${rowContent}\\n' > "$output"`,
  );
  executable(
    join(bin, 'psql'),
    `joined="$*"
if [[ "$joined" == *"json_build_object"* ]]; then
  if [[ "$joined" == *"requiredTableCount"* ]]; then echo '{"tableCount":28,"requiredTableCount":8}'
  elif [[ "$joined" == *"'companies'"* ]]; then echo '{"companies":1,"users":1,"items":1,"warehouses":1,"inventoryBalances":1,"salesOrders":1,"invoices":1}'
  elif [[ "$joined" == *"'violations'"* ]]; then echo '{"violations":0}'
  elif [[ "$joined" == *"TRANSACTION READ ONLY"* ]]; then echo '{"count":1}'
  else echo '{"appliedCount":5,"latest":"20260714030000_u10_audit_log"}'
  fi
else echo '5|20260714030000_u10_audit_log'
fi`,
  );
  executable(
    join(bin, 'age'),
    `if [[ "\${1:-}" == "--version" ]]; then echo 'v1.2.1'; exit 0; fi
if [[ "\${FAKE_FAIL_AGE:-}" == "true" ]]; then echo '${privateMaterial} ${secretPassword} ${rowContent}' >&2; exit 8; fi
output=''; decrypt=false
while (($#)); do
  case "$1" in --output) output="$2"; shift 2;; --decrypt) decrypt=true; shift;; *) shift;; esac
done
if [[ "\${FAKE_ASSERT_UNPUBLISHED:-}" == "true" ]] && find "\${UNIPLAN_BACKUP_DIRECTORY}" -maxdepth 1 -name '*.manifest.json' | grep -q .; then exit 7; fi
if $decrypt; then printf 'PGDMP\\nrestored\\n' > "$output"; else printf 'age-encryption.org/v1\\nFAKE-CIPHERTEXT\\n' > "$output"; fi`,
  );
  executable(
    join(bin, 'rclone'),
    `if [[ "\${1:-}" == "--version" ]]; then echo 'rclone v1.70.0'; exit 0; fi
command="$1"; shift
normalize() { local value="$1"; printf '%s' "$value" | cut -c 13-; }
if [[ "\${FAKE_FAIL_RCLONE:-}" == "true" && "$command" == "copyto" ]]; then echo '${secretPassword} ${rowContent}' >&2; exit 6; fi
case "$command" in
  copyto) target=$(normalize "$2"); mkdir -p "$(dirname "$target")"; cp "$1" "$target";;
  size) path=$(normalize "$2"); bytes=$(stat -c %s "$path"); printf '{"count":1,"bytes":%s}\\n' "$bytes";;
  hashsum) path=$(normalize "$2"); if [[ "\${FAKE_BAD_REMOTE_CHECKSUM:-}" == "true" ]]; then printf '%064d  %s\\n' 0 "$path"; else /usr/bin/sha256sum "$path"; fi;;
  deletefile) path=$(normalize "$1"); rm -f "$path";;
  *) exit 5;;
esac`,
  );
  executable(
    join(bin, 'createdb'),
    `name="\${!#}"; mkdir -p "\${FAKE_DB_STATE}"; if [[ -e "\${FAKE_DB_STATE}/$name" ]]; then exit 1; fi; : > "\${FAKE_DB_STATE}/$name"`,
  );
  executable(
    join(bin, 'dropdb'),
    `name="\${!#}"; rm -f "\${FAKE_DB_STATE}/$name"`,
  );
  executable(
    join(bin, 'pg_restore'),
    `if [[ "\${FAKE_FAIL_PG_RESTORE:-}" == "true" ]]; then echo "${secretPassword} ${rowContent}" >&2; exit 4; fi`,
  );
  return bin;
}

function baseEnvironment(root: string): NodeJS.ProcessEnv {
  const backupDirectory = join(root, 'backups');
  const lockDirectory = join(root, 'locks');
  const dbState = join(root, 'db-state');
  mkdirSync(backupDirectory, { mode: 0o700 });
  mkdirSync(lockDirectory, { mode: 0o700 });
  mkdirSync(dbState, { mode: 0o700 });
  const bin = fakeTools(root);
  return {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: root,
    NODE_ENV: 'development',
    DATABASE_URL: `postgresql://backup_user:${secretPassword}@127.0.0.1:5433/uniplan_dev?schema=public`,
    UNIPLAN_BACKUP_DIRECTORY: backupDirectory,
    UNIPLAN_BACKUP_LOCK_FILE: join(lockDirectory, 'backup.lock'),
    UNIPLAN_BACKUP_AGE_RECIPIENT: publicRecipient,
    UNIPLAN_BACKUP_REQUIRE_OFFSITE: 'false',
    UNIPLAN_BACKUP_RETENTION_COUNT: '7',
    FAKE_DB_STATE: dbState,
  };
}

function run(command: string, args: string[], environment: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ['--import', 'tsx', command, ...args], {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
  });
}

function backupFiles(environment: NodeJS.ProcessEnv) {
  return readdirSync(environment.UNIPLAN_BACKUP_DIRECTORY!).filter((name) => !name.startsWith('.'));
}

function sha256(value: Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function restoreFixture(root: string, environment: NodeJS.ProcessEnv) {
  const directory = environment.UNIPLAN_BACKUP_DIRECTORY!;
  const artifactFilename = 'fixture.dump.age';
  const artifactPath = join(directory, artifactFilename);
  const contents = Buffer.from('age-encryption.org/v1\nFIXTURE\n');
  writeFileSync(artifactPath, contents, { mode: 0o600 });
  const manifest: BackupManifest = {
    schema: MANIFEST_SCHEMA,
    createdAt: '2026-07-14T00:00:00.000Z',
    artifact: { filename: artifactFilename, sizeBytes: contents.length, sha256: sha256(contents) },
    database: { host: '127.0.0.1', port: 5433, database: 'uniplan_dev', schema: 'public' },
    migrations: { appliedCount: 5, latest: '20260714030000_u10_audit_log' },
    tools: { pgDump: 'pg_dump (PostgreSQL) 16.9', age: 'v1.2.1' },
    dump: { format: 'custom', noOwner: true, noAcl: true },
    offsite: { required: false, verified: false },
  };
  const manifestPath = join(directory, 'fixture.manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
  const identityPath = join(root, 'identity.txt');
  writeFileSync(identityPath, `${privateMaterial}\n`, { mode: 0o600 });
  return { artifactPath, manifestPath, identityPath, manifest };
}

describe('PostgreSQL encrypted backup', () => {
  it('publishes only an encrypted, private artifact and allow-listed secret-free manifest', () => {
    const root = temporaryRoot();
    const environment: NodeJS.ProcessEnv = { ...baseEnvironment(root), FAKE_ASSERT_UNPUBLISHED: 'true' };
    const result = run(backupCommand, [], environment);
    expect(result.status, result.stderr).toBe(0);
    const summary = JSON.parse(result.stdout) as { artifactPath: string; manifestPath: string };
    expect(backupFiles(environment)).toHaveLength(2);
    expect(readFileSync(summary.artifactPath, 'utf8')).toMatch(/^age-encryption\.org\/v1/);
    expect(statSync(summary.artifactPath).mode & 0o777).toBe(0o600);
    expect(statSync(summary.manifestPath).mode & 0o777).toBe(0o600);
    const manifestText = readFileSync(summary.manifestPath, 'utf8');
    expect(manifestText).not.toContain(secretPassword);
    expect(manifestText).not.toContain('backup_user');
    expect(manifestText).not.toContain(publicRecipient);
    expect(manifestText).not.toContain(privateMaterial);
    expect(manifestText).not.toContain(rowContent);
    expect(readdirSync(environment.UNIPLAN_BACKUP_DIRECTORY!).some((name) => name.includes('staging'))).toBe(false);
  });

  it('rejects overlap before running tools', () => {
    const root = temporaryRoot();
    const environment = baseEnvironment(root);
    writeFileSync(environment.UNIPLAN_BACKUP_LOCK_FILE!, 'existing\n', { mode: 0o600 });
    const result = run(backupCommand, [], environment);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"code":"LOCKED"');
    expect(backupFiles(environment)).toEqual([]);
  });

  it.each([
    ['pg_dump', { FAKE_FAIL_PG_DUMP: 'true' }],
    ['age', { FAKE_FAIL_AGE: 'true' }],
    ['upload', { UNIPLAN_BACKUP_REQUIRE_OFFSITE: 'true', FAKE_FAIL_RCLONE: 'true' }],
    ['remote checksum', { UNIPLAN_BACKUP_REQUIRE_OFFSITE: 'true', FAKE_BAD_REMOTE_CHECKSUM: 'true' }],
  ])('leaves no pair or plaintext after %s failure', (_label, overrides) => {
    const root = temporaryRoot();
    const remote = join(root, 'remote');
    mkdirSync(remote, { mode: 0o700 });
    const environment: NodeJS.ProcessEnv = {
      ...baseEnvironment(root),
      UNIPLAN_BACKUP_RCLONE_DESTINATION: `fake-remote:${remote}`,
      ...overrides,
    };
    const result = run(backupCommand, [], environment);
    expect(result.status).toBe(1);
    expect(backupFiles(environment)).toEqual([]);
    expect(readdirSync(environment.UNIPLAN_BACKUP_DIRECTORY!).some((name) => name.endsWith('.dump'))).toBe(false);
    expect(result.stdout).not.toContain(rowContent);
    expect(result.stderr).not.toContain(rowContent);
    expect(result.stderr).not.toContain(secretPassword);
    expect(result.stderr).not.toContain(privateMaterial);
  });

  it('fails closed for missing recipient and production offsite opt-out', () => {
    const root = temporaryRoot();
    const missingRecipient = baseEnvironment(root);
    delete missingRecipient.UNIPLAN_BACKUP_AGE_RECIPIENT;
    expect(run(backupCommand, [], missingRecipient).stderr).toContain('ENCRYPTION_REQUIRED');

    const privateRecipientRoot = temporaryRoot();
    const privateRecipient = {
      ...baseEnvironment(privateRecipientRoot),
      UNIPLAN_BACKUP_AGE_RECIPIENT: privateMaterial,
    };
    expect(run(backupCommand, [], privateRecipient).stderr).toContain('ENCRYPTION_REQUIRED');

    const productionRoot = temporaryRoot();
    const production: NodeJS.ProcessEnv = {
      ...baseEnvironment(productionRoot),
      NODE_ENV: 'production',
      UNIPLAN_BACKUP_REQUIRE_OFFSITE: 'false',
    };
    expect(run(backupCommand, [], production).stderr).toContain('OFFSITE_REQUIRED');

    const localOffsiteRoot = temporaryRoot();
    const localOffsite = {
      ...baseEnvironment(localOffsiteRoot),
      UNIPLAN_BACKUP_REQUIRE_OFFSITE: 'true',
      UNIPLAN_BACKUP_RCLONE_DESTINATION: join(localOffsiteRoot, 'not-offsite'),
    };
    expect(run(backupCommand, [], localOffsite).stderr).toContain(
      'OFFSITE_REMOTE_REQUIRED',
    );
  });

  it('keeps the newest known-good pair and ignores malformed/incomplete files', () => {
    const root = temporaryRoot();
    const directory = join(root, 'retention');
    mkdirSync(directory, { mode: 0o700 });
    for (let index = 0; index < 3; index += 1) {
      const artifactFilename = `pair-${index}.dump.age`;
      const artifact = Buffer.from(`age-encryption.org/v1\n${index}\n`);
      writeFileSync(join(directory, artifactFilename), artifact, { mode: 0o600 });
      const manifest: BackupManifest = {
        schema: MANIFEST_SCHEMA,
        createdAt: `2026-07-14T00:00:0${index}.000Z`,
        artifact: { filename: artifactFilename, sizeBytes: artifact.length, sha256: sha256(artifact) },
        database: { host: 'localhost', port: 5432, database: 'dev', schema: 'public' },
        migrations: { appliedCount: 4, latest: 'u9' },
        tools: { pgDump: '16', age: '1' },
        dump: { format: 'custom', noOwner: true, noAcl: true },
        offsite: { required: false, verified: false },
      };
      writeFileSync(join(directory, `pair-${index}.manifest.json`), JSON.stringify(manifest), { mode: 0o600 });
    }
    writeFileSync(join(directory, 'unknown.manifest.json'), '{}', { mode: 0o600 });
    expect(applyPairAwareRetention(directory, 1)).toBe(2);
    expect(existsSync(join(directory, 'pair-2.dump.age'))).toBe(true);
    expect(existsSync(join(directory, 'pair-2.manifest.json'))).toBe(true);
    expect(existsSync(join(directory, 'unknown.manifest.json'))).toBe(true);
  });
});

describe('guarded restore verification', () => {
  function restoreEnvironment(root: string) {
    const environment = baseEnvironment(root);
    const fixture = restoreFixture(root, environment);
    const restoreProcessEnvironment: NodeJS.ProcessEnv = {
        ...environment,
        UNIPLAN_RESTORE_VERIFY_GUARD: 'enabled',
        UNIPLAN_RESTORE_VERIFY_DATABASE_URL: `postgresql://restore_user:${secretPassword}@127.0.0.1:5433/u11_test_restore_verify?schema=public`,
        UNIPLAN_BACKUP_AGE_IDENTITY_FILE: fixture.identityPath,
        UNIPLAN_RESTORE_VERIFY_TEMP_DIRECTORY: join(root, 'restore-temp'),
      };
    return { environment: restoreProcessEnvironment, fixture };
  }

  it('rejects missing guard, unsafe names, and the application database', () => {
    const root = temporaryRoot();
    const { environment, fixture } = restoreEnvironment(root);
    const args = ['--artifact', fixture.artifactPath, '--manifest', fixture.manifestPath];
    const noGuard = { ...environment };
    delete noGuard.UNIPLAN_RESTORE_VERIFY_GUARD;
    expect(run(restoreCommand, args, noGuard).stderr).toContain('RESTORE_GUARD_MISSING');

    expect(
      run(restoreCommand, args, {
        ...environment,
        UNIPLAN_RESTORE_VERIFY_DATABASE_URL: `postgresql://restore_user:${secretPassword}@127.0.0.1:5433/unsafe?schema=public`,
      }).stderr,
    ).toContain('RESTORE_TARGET_UNSAFE');

    expect(
      run(restoreCommand, args, {
        ...environment,
        DATABASE_URL: `postgresql://app:${secretPassword}@127.0.0.1:5433/u11_test_restore_verify?schema=public`,
      }).stderr,
    ).toContain('RESTORE_TARGET_UNSAFE');
  });

  it('rejects wrong checksum, release mismatch, and plaintext input before decryption', () => {
    const root = temporaryRoot();
    const { environment, fixture } = restoreEnvironment(root);
    const badManifest = { ...fixture.manifest, artifact: { ...fixture.manifest.artifact, sha256: '0'.repeat(64) } };
    writeFileSync(fixture.manifestPath, JSON.stringify(badManifest), { mode: 0o600 });
    expect(
      run(restoreCommand, ['--artifact', fixture.artifactPath, '--manifest', fixture.manifestPath], environment).stderr,
    ).toContain('CHECKSUM_MISMATCH');

    const wrongRelease = {
      ...fixture.manifest,
      migrations: { appliedCount: 4, latest: '20260714020000_u9_tenant_concurrency' },
    };
    writeFileSync(fixture.manifestPath, JSON.stringify(wrongRelease), { mode: 0o600 });
    expect(
      run(restoreCommand, ['--artifact', fixture.artifactPath, '--manifest', fixture.manifestPath], environment).stderr,
    ).toContain('MIGRATION_MISMATCH');

    const plaintext = join(root, 'plaintext.dump');
    writeFileSync(plaintext, 'PGDMP plaintext', { mode: 0o600 });
    expect(
      run(restoreCommand, ['--artifact', plaintext, '--manifest', fixture.manifestPath], environment).stderr,
    ).toContain('PLAINTEXT_REJECTED');
  });

  it('removes decrypted data and destroys the disposable target after restore failure', () => {
    const root = temporaryRoot();
    const { environment, fixture } = restoreEnvironment(root);
    const result = run(
      restoreCommand,
      ['--artifact', fixture.artifactPath, '--manifest', fixture.manifestPath],
      { ...environment, FAKE_FAIL_PG_RESTORE: 'true' },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('TOOL_FAILED');
    const temp = environment.UNIPLAN_RESTORE_VERIFY_TEMP_DIRECTORY!;
    expect(existsSync(temp)).toBe(true);
    expect(readdirSync(temp)).toEqual([]);
    expect(readdirSync(environment.FAKE_DB_STATE!)).toEqual([]);
    expect(`${result.stdout}${result.stderr}`).not.toContain(secretPassword);
    expect(`${result.stdout}${result.stderr}`).not.toContain(rowContent);
    expect(`${result.stdout}${result.stderr}`).not.toContain(privateMaterial);
  });
});
