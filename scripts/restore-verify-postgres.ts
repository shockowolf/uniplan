import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  SafeError,
  assertPrivateIdentityFile,
  cleanupStaging,
  createPrivateStagingDirectory,
  ensurePrivateDirectory,
  loadSecureEnvironmentFile,
  parseDatabaseUrl,
  postgresEnvironment,
  readManifest,
  runTool,
  verifyLocalArtifact,
  withoutDatabaseSecrets,
} from '../lib/backup/common';

type RestoreArguments = { artifactPath: string; manifestPath: string };

type RestoreSummary = {
  ok: true;
  artifactFilename: string;
  artifactSha256: string;
  targetDatabase: string;
  migrations: { appliedCount: number; latest: string | null };
  schema: { tableCount: number; requiredTableCount: number };
  counts: Record<string, number>;
  integrityViolations: number;
  readOnlySmokeCount: number;
  targetDestroyed: true;
  plaintextRemoved: true;
};

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function parseArguments(args: string[]): RestoreArguments {
  let artifactPath: string | undefined;
  let manifestPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--artifact' && args[index + 1]) artifactPath = args[++index];
    else if (args[index] === '--manifest' && args[index + 1]) manifestPath = args[++index];
    else throw new SafeError('ARGUMENT_INVALID', 'Use --artifact and --manifest only.');
  }
  if (!artifactPath || !manifestPath) {
    throw new SafeError('ARGUMENT_INVALID', 'Both --artifact and --manifest are required.');
  }
  return { artifactPath: resolve(artifactPath), manifestPath: resolve(manifestPath) };
}

function assertSafeTarget(
  application: ReturnType<typeof parseDatabaseUrl>,
  target: ReturnType<typeof parseDatabaseUrl>,
) {
  if (target.schema !== 'public') {
    throw new SafeError('RESTORE_TARGET_UNSAFE', 'Restore verification target must use public in a disposable database.');
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}_restore_verify$/.test(target.database)) {
    throw new SafeError('RESTORE_TARGET_UNSAFE', 'Disposable database name must end in _restore_verify.');
  }
  if (target.database.length > 63) {
    throw new SafeError('RESTORE_TARGET_UNSAFE', 'Disposable database name exceeds PostgreSQL limits.');
  }
  if (target.database === application.database) {
    throw new SafeError('RESTORE_TARGET_UNSAFE', 'Restore target must not use the application database name.');
  }
  if (
    target.host === application.host &&
    target.port === application.port &&
    target.database === application.database
  ) {
    throw new SafeError('RESTORE_TARGET_UNSAFE', 'Restore target matches the application database.');
  }
}

function parseJsonObject(output: string, code: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new SafeError(code, 'Verification query returned an invalid summary.');
  }
}

function numericRecord(value: Record<string, unknown>, code: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    const number = typeof entry === 'number' ? entry : Number(entry);
    if (!Number.isSafeInteger(number) || number < 0) {
      throw new SafeError(code, 'Verification query returned an invalid count.');
    }
    result[key] = number;
  }
  return result;
}

function queryJson(environment: NodeJS.ProcessEnv, label: string, sql: string): Record<string, unknown> {
  const output = runTool(
    label,
    'psql',
    ['-qAtX', '--set', 'ON_ERROR_STOP=1', '-c', sql],
    { env: environment },
  );
  return parseJsonObject(output, 'RESTORE_CHECK_FAILED');
}

function migrationMetadata(environment: NodeJS.ProcessEnv) {
  const value = queryJson(
    environment,
    'restored migration metadata query',
    `SELECT json_build_object(
      'appliedCount', count(*),
      'latest', max(migration_name)
    )
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;`,
  );
  const appliedCount = Number(value.appliedCount);
  const latest = value.latest === null ? null : String(value.latest);
  if (!Number.isSafeInteger(appliedCount) || appliedCount < 0 || (latest !== null && latest.length > 255)) {
    throw new SafeError('RESTORE_CHECK_FAILED', 'Restored migration metadata is invalid.');
  }
  return { appliedCount, latest };
}

function repositoryMigrationMetadata() {
  const migrationsDirectory = join(repositoryRoot, 'prisma', 'migrations');
  const migrations = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{14}_[A-Za-z0-9_]+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (migrations.length === 0) {
    throw new SafeError('MIGRATION_MISMATCH', 'Repository migration history is unavailable.');
  }
  return { appliedCount: migrations.length, latest: migrations.at(-1)! };
}

function maintenanceEnvironment(
  target: ReturnType<typeof parseDatabaseUrl>,
  environment: NodeJS.ProcessEnv,
) {
  return postgresEnvironment({ ...target, database: 'postgres', schema: 'public' }, environment);
}

export function runRestoreVerification(
  args: RestoreArguments,
  inputEnvironment: NodeJS.ProcessEnv = process.env,
): RestoreSummary {
  const previousUmask = process.umask(0o077);
  let stagingDirectory: string | undefined;
  let plaintextPath: string | undefined;
  let targetCreated = false;
  let targetDestroyed = false;
  let operationError: unknown;
  let result: Omit<RestoreSummary, 'targetDestroyed' | 'plaintextRemoved'> | undefined;
  let target: ReturnType<typeof parseDatabaseUrl> | undefined;
  let adminEnvironment: NodeJS.ProcessEnv | undefined;

  try {
    const environment = loadSecureEnvironmentFile(inputEnvironment);
    if (environment.UNIPLAN_RESTORE_VERIFY_GUARD !== 'enabled') {
      throw new SafeError('RESTORE_GUARD_MISSING', 'Explicit restore verification guard is required.');
    }
    const application = parseDatabaseUrl(environment.DATABASE_URL, 'DATABASE_URL');
    target = parseDatabaseUrl(
      environment.UNIPLAN_RESTORE_VERIFY_DATABASE_URL,
      'UNIPLAN_RESTORE_VERIFY_DATABASE_URL',
    );
    assertSafeTarget(application, target);

    const artifactPath = resolve(args.artifactPath);
    const manifestPath = resolve(args.manifestPath);
    if (artifactPath === manifestPath || !artifactPath.endsWith('.dump.age')) {
      throw new SafeError('PLAINTEXT_REJECTED', 'Restore accepts only an encrypted .dump.age artifact.');
    }
    const manifest = readManifest(manifestPath);
    if (basename(artifactPath) !== manifest.artifact.filename) {
      throw new SafeError('MANIFEST_MISMATCH', 'Manifest does not name the supplied artifact.');
    }
    verifyLocalArtifact(artifactPath, manifest.artifact.sizeBytes, manifest.artifact.sha256);
    const expectedMigrations = repositoryMigrationMetadata();
    if (
      manifest.migrations.appliedCount !== expectedMigrations.appliedCount ||
      manifest.migrations.latest !== expectedMigrations.latest
    ) {
      throw new SafeError(
        'MIGRATION_MISMATCH',
        'Backup migration metadata does not match this repository release.',
      );
    }
    const identityPath = assertPrivateIdentityFile(environment.UNIPLAN_BACKUP_AGE_IDENTITY_FILE);

    const tempParent = resolve(environment.UNIPLAN_RESTORE_VERIFY_TEMP_DIRECTORY ?? dirname(artifactPath));
    ensurePrivateDirectory(tempParent);
    stagingDirectory = createPrivateStagingDirectory(tempParent, 'restore-staging');
    plaintextPath = join(stagingDirectory, 'restore.dump');
    runTool(
      'age decryption',
      'age',
      ['--decrypt', '--identity', identityPath, '--output', plaintextPath, artifactPath],
      { env: withoutDatabaseSecrets(environment) },
    );
    chmodSync(plaintextPath, 0o600);
    if (!existsSync(plaintextPath) || statSync(plaintextPath).size <= 0) {
      throw new SafeError('DECRYPTION_FAILED', 'age produced no restore dump.');
    }

    adminEnvironment = maintenanceEnvironment(target, environment);
    runTool(
      'disposable database creation',
      'createdb',
      ['--no-password', '--encoding=UTF8', '--template=template0', target.database],
      { env: adminEnvironment },
    );
    targetCreated = true;

    const targetEnvironment = postgresEnvironment(target, environment);
    runTool(
      'pg_restore',
      'pg_restore',
      ['--clean', '--if-exists', '--no-owner', '--no-acl', '--exit-on-error', '--dbname', target.database, plaintextPath],
      { env: targetEnvironment },
    );

    const readOnlyEnvironment = {
      ...targetEnvironment,
      PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=30000',
      DATABASE_URL: environment.UNIPLAN_RESTORE_VERIFY_DATABASE_URL,
    };
    const prisma = join(repositoryRoot, 'node_modules', '.bin', 'prisma');
    if (!existsSync(prisma)) throw new SafeError('TOOL_FAILED', 'Prisma CLI is unavailable.');
    runTool('Prisma schema validation', prisma, ['validate', '--schema', 'prisma/schema.prisma'], {
      cwd: repositoryRoot,
      env: readOnlyEnvironment,
    });
    runTool('Prisma migration status', prisma, ['migrate', 'status', '--schema', 'prisma/schema.prisma'], {
      cwd: repositoryRoot,
      env: readOnlyEnvironment,
    });

    const migrations = migrationMetadata(readOnlyEnvironment);
    if (
      migrations.appliedCount !== manifest.migrations.appliedCount ||
      migrations.latest !== manifest.migrations.latest
    ) {
      throw new SafeError('MIGRATION_MISMATCH', 'Restored migration metadata does not match the manifest.');
    }

    const schemaValue = numericRecord(
      queryJson(
        readOnlyEnvironment,
        'restored schema check',
        `SELECT json_build_object(
          'tableCount', (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'),
          'requiredTableCount', (SELECT count(*) FROM unnest(ARRAY[
            'companies','users','items','warehouses','inventory_balances','sales_orders','invoices','_prisma_migrations'
          ]) AS required(name) WHERE to_regclass('public.' || quote_ident(required.name)) IS NOT NULL)
        );`,
      ),
      'RESTORE_CHECK_FAILED',
    );
    if ((schemaValue.requiredTableCount ?? 0) !== 8 || (schemaValue.tableCount ?? 0) < 8) {
      throw new SafeError('SCHEMA_MISMATCH', 'Required application tables are missing from the restore.');
    }

    const counts = numericRecord(
      queryJson(
        readOnlyEnvironment,
        'restored bounded count check',
        `SELECT json_build_object(
          'companies', (SELECT count(*) FROM "companies"),
          'users', (SELECT count(*) FROM "users"),
          'items', (SELECT count(*) FROM "items"),
          'warehouses', (SELECT count(*) FROM "warehouses"),
          'inventoryBalances', (SELECT count(*) FROM "inventory_balances"),
          'salesOrders', (SELECT count(*) FROM "sales_orders"),
          'invoices', (SELECT count(*) FROM "invoices")
        );`,
      ),
      'RESTORE_CHECK_FAILED',
    );

    const integrityValue = numericRecord(
      queryJson(
        readOnlyEnvironment,
        'restored integrity check',
        `SELECT json_build_object('violations',
          (SELECT count(*) FROM "users" child LEFT JOIN "companies" parent ON parent.id = child."companyId" WHERE parent.id IS NULL) +
          (SELECT count(*) FROM "items" child LEFT JOIN "companies" parent ON parent.id = child."companyId" WHERE parent.id IS NULL) +
          (SELECT count(*) FROM "inventory_balances" balance
            LEFT JOIN "items" item ON item.id = balance."itemId" AND item."companyId" = balance."companyId"
            LEFT JOIN "warehouses" warehouse ON warehouse.id = balance."warehouseId" AND warehouse."companyId" = balance."companyId"
            WHERE item.id IS NULL OR warehouse.id IS NULL)
        );`,
      ),
      'RESTORE_CHECK_FAILED',
    );
    const integrityViolations = integrityValue.violations ?? -1;
    if (integrityViolations !== 0) {
      throw new SafeError('INTEGRITY_FAILED', 'Restored tenant integrity checks failed.');
    }

    const smokeValue = numericRecord(
      queryJson(
        readOnlyEnvironment,
        'read-only application smoke query',
        `BEGIN TRANSACTION READ ONLY;
         SELECT json_build_object('count', count(*))
         FROM "invoices"
         WHERE "issueDate" >= date_trunc('month', CURRENT_DATE);
         ROLLBACK;`,
      ),
      'RESTORE_CHECK_FAILED',
    );

    result = {
      ok: true,
      artifactFilename: manifest.artifact.filename,
      artifactSha256: manifest.artifact.sha256,
      targetDatabase: target.database,
      migrations,
      schema: {
        tableCount: schemaValue.tableCount,
        requiredTableCount: schemaValue.requiredTableCount,
      },
      counts,
      integrityViolations,
      readOnlySmokeCount: smokeValue.count ?? 0,
    };
  } catch (error) {
    operationError = error;
  } finally {
    cleanupStaging(stagingDirectory, plaintextPath);
    if (targetCreated && target && adminEnvironment) {
      try {
        runTool(
          'disposable database destruction',
          'dropdb',
          ['--no-password', '--if-exists', '--force', target.database],
          { env: adminEnvironment },
        );
        targetDestroyed = true;
      } catch {
        operationError = new SafeError(
          'RESTORE_CLEANUP_FAILED',
          'Disposable restore database could not be destroyed.',
        );
      }
    }
    process.umask(previousUmask);
  }

  if (operationError) throw operationError;
  if (!result || !targetDestroyed) {
    throw new SafeError('RESTORE_FAILED', 'Restore verification did not complete safely.');
  }
  return { ...result, targetDestroyed: true, plaintextRemoved: true };
}

function main() {
  try {
    const args = parseArguments(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(runRestoreVerification(args))}\n`);
  } catch (error) {
    const safe = error instanceof SafeError ? error : new SafeError('RESTORE_FAILED', 'Restore verification failed safely.');
    process.stderr.write(`${JSON.stringify({ ok: false, code: safe.code, message: safe.message })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
