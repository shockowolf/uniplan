import { chmodSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BackupManifest,
  MANIFEST_SCHEMA,
  SafeError,
  acquireHostLock,
  assertPublicAgeRecipient,
  atomicPublishPair,
  booleanEnvironment,
  cleanupStaging,
  createPrivateStagingDirectory,
  ensurePrivateDirectory,
  fsyncFile,
  loadSecureEnvironmentFile,
  parseDatabaseUrl,
  positiveIntegerEnvironment,
  postgresEnvironment,
  publicIdentity,
  runTool,
  sha256File,
  toolVersion,
  withoutDatabaseSecrets,
  writePrivateFile,
} from '../lib/backup/common';
import {
  assertNamedRcloneRemote,
  uploadAndVerifyPair,
} from '../lib/backup/offsite';
import { applyPairAwareRetention } from '../lib/backup/retention';

type BackupSummary = {
  ok: true;
  artifactPath: string;
  manifestPath: string;
  sha256: string;
  sizeBytes: number;
  mode: string;
  offsiteVerified: boolean;
  retentionRemovedPairs: number;
};

function migrationMetadata(environment: NodeJS.ProcessEnv): BackupManifest['migrations'] {
  const output = runTool(
    'PostgreSQL migration metadata query',
    'psql',
    [
      '-AtX',
      '--set',
      'ON_ERROR_STOP=1',
      '-c',
      `SELECT count(*)::text || '|' || coalesce(max(migration_name), '')
       FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;`,
    ],
    { env: environment },
  );
  const match = /^(\d+)\|([^\r\n]*)$/.exec(output);
  if (!match) throw new SafeError('METADATA_FAILED', 'Migration metadata was not in the expected form.');
  return { appliedCount: Number(match[1]), latest: match[2] || null };
}

function isoFilenameTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function installTerminationCleanup(cleanup: () => void) {
  const handlers = new Map<NodeJS.Signals, () => void>();
  for (const [signal, exitCode] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ] as const) {
    const handler = () => {
      cleanup();
      process.exit(exitCode);
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }
  return () => {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  };
}

export function runBackup(inputEnvironment: NodeJS.ProcessEnv = process.env): BackupSummary {
  const previousUmask = process.umask(0o077);
  let stagingDirectory: string | undefined;
  let plaintextPath: string | undefined;
  let releaseLock: (() => void) | undefined;
  let stagedArtifact: string | undefined;
  let stagedManifest: string | undefined;
  let publishedArtifact: string | undefined;
  let publishedManifest: string | undefined;
  let complete = false;
  const cleanup = () => {
    cleanupStaging(stagingDirectory, plaintextPath);
    if (!complete) {
      if (publishedManifest && existsSync(publishedManifest)) rmSync(publishedManifest, { force: true });
      if (publishedArtifact && existsSync(publishedArtifact)) rmSync(publishedArtifact, { force: true });
    }
    releaseLock?.();
  };
  const removeTerminationHandlers = installTerminationCleanup(cleanup);

  try {
    const environment = loadSecureEnvironmentFile(inputEnvironment);
    const backupDirectoryValue = environment.UNIPLAN_BACKUP_DIRECTORY;
    if (!backupDirectoryValue) throw new SafeError('CONFIG_MISSING', 'UNIPLAN_BACKUP_DIRECTORY is required.');
    const backupDirectory = resolve(backupDirectoryValue);
    ensurePrivateDirectory(backupDirectory);

    const lockPath = resolve(environment.UNIPLAN_BACKUP_LOCK_FILE ?? '/run/lock/uniplan-backup.lock');
    releaseLock = acquireHostLock(lockPath);

    const production = environment.NODE_ENV === 'production' || environment.UNIPLAN_BACKUP_MODE === 'production';
    const requireOffsite = booleanEnvironment(environment, 'UNIPLAN_BACKUP_REQUIRE_OFFSITE', production);
    if (production && !requireOffsite) {
      throw new SafeError('OFFSITE_REQUIRED', 'Production backup requires verified offsite copy.');
    }
    const offsiteDestination = environment.UNIPLAN_BACKUP_RCLONE_DESTINATION;
    if (requireOffsite && !offsiteDestination) {
      throw new SafeError('OFFSITE_CONFIG_MISSING', 'Required offsite destination is missing.');
    }
    if (requireOffsite) assertNamedRcloneRemote(offsiteDestination);
    const recipient = assertPublicAgeRecipient(environment.UNIPLAN_BACKUP_AGE_RECIPIENT);
    const connection = parseDatabaseUrl(environment.DATABASE_URL, 'DATABASE_URL');
    const pgEnvironment = postgresEnvironment(connection, environment);
    const secretFreeToolEnvironment = withoutDatabaseSecrets(environment);

    const pgDumpVersion = toolVersion('pg_dump version check', 'pg_dump');
    const ageVersion = toolVersion('age version check', 'age');
    if (offsiteDestination) toolVersion('rclone version check', 'rclone');

    const migrations = migrationMetadata(pgEnvironment);
    const createdAt = new Date();
    const stem = `uniplan-${isoFilenameTimestamp(createdAt)}-${process.pid}`;
    const artifactFilename = `${stem}.dump.age`;
    const manifestFilename = `${stem}.manifest.json`;

    stagingDirectory = createPrivateStagingDirectory(backupDirectory, 'staging');
    plaintextPath = join(stagingDirectory, `${stem}.dump`);
    stagedArtifact = join(stagingDirectory, artifactFilename);
    stagedManifest = join(stagingDirectory, manifestFilename);

    runTool(
      'pg_dump',
      'pg_dump',
      ['--format=custom', '--no-owner', '--no-acl', '--file', plaintextPath],
      { env: pgEnvironment },
    );
    chmodSync(plaintextPath, 0o600);
    if (statSync(plaintextPath).size <= 0) throw new SafeError('DUMP_FAILED', 'pg_dump produced no data.');
    fsyncFile(plaintextPath);

    runTool(
      'age encryption',
      'age',
      ['--encrypt', '--recipient', recipient, '--output', stagedArtifact, plaintextPath],
      { env: secretFreeToolEnvironment },
    );
    chmodSync(stagedArtifact, 0o600);
    fsyncFile(stagedArtifact);
    const artifactSize = statSync(stagedArtifact).size;
    if (artifactSize <= 0) throw new SafeError('ENCRYPTION_FAILED', 'age produced no encrypted artifact.');
    const artifactSha256 = sha256File(stagedArtifact);

    const manifest: BackupManifest = {
      schema: MANIFEST_SCHEMA,
      createdAt: createdAt.toISOString(),
      artifact: { filename: artifactFilename, sizeBytes: artifactSize, sha256: artifactSha256 },
      database: publicIdentity(connection),
      migrations,
      tools: { pgDump: pgDumpVersion, age: ageVersion },
      dump: { format: 'custom', noOwner: true, noAcl: true },
      offsite: { required: requireOffsite, verified: Boolean(offsiteDestination) },
    };
    writePrivateFile(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);

    if (offsiteDestination) {
      uploadAndVerifyPair(
        'rclone',
        offsiteDestination,
        stagedArtifact,
        stagedManifest,
        secretFreeToolEnvironment,
      );
    }

    const published = atomicPublishPair(
      stagedArtifact,
      stagedManifest,
      backupDirectory,
      artifactFilename,
      manifestFilename,
    );
    publishedArtifact = published.artifactPath;
    publishedManifest = published.manifestPath;

    const retentionKeep = positiveIntegerEnvironment(environment, 'UNIPLAN_BACKUP_RETENTION_COUNT', 7, 10_000);
    const retentionRemovedPairs = applyPairAwareRetention(backupDirectory, retentionKeep);
    complete = true;
    return {
      ok: true,
      artifactPath: publishedArtifact,
      manifestPath: publishedManifest,
      sha256: artifactSha256,
      sizeBytes: artifactSize,
      mode: (statSync(publishedArtifact).mode & 0o777).toString(8).padStart(4, '0'),
      offsiteVerified: Boolean(offsiteDestination),
      retentionRemovedPairs,
    };
  } finally {
    removeTerminationHandlers();
    cleanup();
    process.umask(previousUmask);
  }
}

function main() {
  try {
    process.stdout.write(`${JSON.stringify(runBackup())}\n`);
  } catch (error) {
    const safe = error instanceof SafeError ? error : new SafeError('BACKUP_FAILED', 'Backup failed safely.');
    process.stderr.write(`${JSON.stringify({ ok: false, code: safe.code, message: safe.message })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
