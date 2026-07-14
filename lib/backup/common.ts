import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';

export const MANIFEST_SCHEMA = 'uniplan.postgresql-backup/v1' as const;
export const MAX_TOOL_OUTPUT_BYTES = 64 * 1024;

export class SafeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SafeError';
  }
}

export type DatabaseIdentity = {
  host: string;
  port: number;
  database: string;
  schema: string;
};

export type DatabaseConnection = DatabaseIdentity & {
  user: string;
  password: string;
  sslMode?: string;
};

export type BackupManifest = {
  schema: typeof MANIFEST_SCHEMA;
  createdAt: string;
  artifact: {
    filename: string;
    sizeBytes: number;
    sha256: string;
  };
  database: DatabaseIdentity;
  migrations: {
    appliedCount: number;
    latest: string | null;
  };
  tools: {
    pgDump: string;
    age: string;
  };
  dump: {
    format: 'custom';
    noOwner: true;
    noAcl: true;
  };
  offsite: {
    required: boolean;
    verified: boolean;
  };
};

const topLevelManifestKeys = [
  'schema',
  'createdAt',
  'artifact',
  'database',
  'migrations',
  'tools',
  'dump',
  'offsite',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isSafeToken(value: unknown, maxLength = 255): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isOwnedByCurrentUser(uid: number): boolean {
  return typeof process.geteuid !== 'function' || uid === process.geteuid();
}

export function parseManifest(value: unknown): BackupManifest {
  if (!isPlainObject(value) || !hasExactlyKeys(value, topLevelManifestKeys)) {
    throw new SafeError('MANIFEST_INVALID', 'Manifest does not match the allow-listed schema.');
  }
  const { artifact, database, migrations, tools, dump, offsite } = value;
  if (
    value.schema !== MANIFEST_SCHEMA ||
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !isPlainObject(artifact) ||
    !hasExactlyKeys(artifact, ['filename', 'sizeBytes', 'sha256']) ||
    !isSafeToken(artifact.filename) ||
    basename(artifact.filename) !== artifact.filename ||
    !artifact.filename.endsWith('.dump.age') ||
    !Number.isSafeInteger(artifact.sizeBytes) ||
    (artifact.sizeBytes as number) <= 0 ||
    typeof artifact.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
    !isPlainObject(database) ||
    !hasExactlyKeys(database, ['host', 'port', 'database', 'schema']) ||
    !isSafeToken(database.host) ||
    !Number.isInteger(database.port) ||
    (database.port as number) < 1 ||
    (database.port as number) > 65535 ||
    !isSafeToken(database.database) ||
    !isSafeToken(database.schema) ||
    !isPlainObject(migrations) ||
    !hasExactlyKeys(migrations, ['appliedCount', 'latest']) ||
    !Number.isSafeInteger(migrations.appliedCount) ||
    (migrations.appliedCount as number) < 0 ||
    !(migrations.latest === null || isSafeToken(migrations.latest)) ||
    !isPlainObject(tools) ||
    !hasExactlyKeys(tools, ['pgDump', 'age']) ||
    !isSafeToken(tools.pgDump) ||
    !isSafeToken(tools.age) ||
    !isPlainObject(dump) ||
    !hasExactlyKeys(dump, ['format', 'noOwner', 'noAcl']) ||
    dump.format !== 'custom' ||
    dump.noOwner !== true ||
    dump.noAcl !== true ||
    !isPlainObject(offsite) ||
    !hasExactlyKeys(offsite, ['required', 'verified']) ||
    typeof offsite.required !== 'boolean' ||
    typeof offsite.verified !== 'boolean'
  ) {
    throw new SafeError('MANIFEST_INVALID', 'Manifest does not match the allow-listed schema.');
  }
  return value as BackupManifest;
}

export function readManifest(path: string): BackupManifest {
  const file = lstatSync(path);
  if (!file.isFile() || file.isSymbolicLink() || !isOwnedByCurrentUser(file.uid) || (file.mode & 0o077) !== 0) {
    throw new SafeError('MANIFEST_INVALID', 'Manifest must be a regular file.');
  }
  if (file.size > 64 * 1024) {
    throw new SafeError('MANIFEST_INVALID', 'Manifest exceeds the size limit.');
  }
  try {
    return parseManifest(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    if (error instanceof SafeError) throw error;
    throw new SafeError('MANIFEST_INVALID', 'Manifest is not valid JSON.');
  }
}

export function parseDatabaseUrl(raw: string | undefined, variableName: string): DatabaseConnection {
  if (!raw) throw new SafeError('CONFIG_MISSING', `${variableName} is required.`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeError('DATABASE_URL_INVALID', `${variableName} must be a valid PostgreSQL URL.`);
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new SafeError('DATABASE_URL_INVALID', `${variableName} must use PostgreSQL.`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database || database.includes('/')) {
    throw new SafeError('DATABASE_URL_INVALID', `${variableName} must name one database.`);
  }
  const port = url.port ? Number(url.port) : 5432;
  if (!url.hostname || !Number.isInteger(port) || port < 1 || port > 65535 || !url.username) {
    throw new SafeError('DATABASE_URL_INVALID', `${variableName} is incomplete.`);
  }
  const schema = url.searchParams.get('schema') ?? 'public';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new SafeError('DATABASE_URL_INVALID', `${variableName} has an unsafe schema name.`);
  }
  return {
    host: url.hostname,
    port,
    database,
    schema,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    sslMode: url.searchParams.get('sslmode') ?? undefined,
  };
}

export function publicIdentity(connection: DatabaseConnection): DatabaseIdentity {
  return {
    host: connection.host,
    port: connection.port,
    database: connection.database,
    schema: connection.schema,
  };
}

export function postgresEnvironment(
  connection: DatabaseConnection,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment = { ...base };
  delete environment.DATABASE_URL;
  delete environment.UNIPLAN_RESTORE_VERIFY_DATABASE_URL;
  environment.PGHOST = connection.host;
  environment.PGPORT = String(connection.port);
  environment.PGDATABASE = connection.database;
  environment.PGUSER = connection.user;
  environment.PGPASSWORD = connection.password;
  if (connection.sslMode) environment.PGSSLMODE = connection.sslMode;
  return environment;
}

export function withoutDatabaseSecrets(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment = { ...base };
  for (const name of Object.keys(environment)) {
    if (
      name === 'DATABASE_URL' ||
      name === 'UNIPLAN_RESTORE_VERIFY_DATABASE_URL' ||
      name === 'PGPASSWORD' ||
      name === 'PGPASSFILE' ||
      name === 'PGSERVICE' ||
      name === 'PGSERVICEFILE'
    ) {
      delete environment[name];
    }
  }
  return environment;
}

export function runTool(
  label: string,
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string; input?: string } = {},
): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    input: options.input,
    encoding: 'utf8',
    maxBuffer: MAX_TOOL_OUTPUT_BYTES,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    throw new SafeError('TOOL_FAILED', `${label} failed.`);
  }
  return (result.stdout ?? '').trim();
}

export function toolVersion(label: string, command: string, args = ['--version']): string {
  const output = runTool(label, command, args).split(/\r?\n/, 1)[0]?.trim();
  if (!output) throw new SafeError('TOOL_FAILED', `${label} did not report a version.`);
  return output.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200);
}

export function sha256File(path: string): string {
  const hash = createHash('sha256');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

export function fsyncFile(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function fsyncDirectory(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function writePrivateFile(path: string, contents: string | Buffer) {
  const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    writeFileSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function ensurePrivateDirectory(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || !isOwnedByCurrentUser(info.uid)) {
    throw new SafeError('DIRECTORY_UNSAFE', 'Backup directory must be a real directory.');
  }
  chmodSync(path, 0o700);
  if ((statSync(path).mode & 0o077) !== 0) {
    throw new SafeError('DIRECTORY_UNSAFE', 'Backup directory must not be group/world accessible.');
  }
}

export function createPrivateStagingDirectory(parent: string, prefix: string): string {
  const path = join(parent, `.${prefix}-${process.pid}-${randomBytes(8).toString('hex')}`);
  mkdirSync(path, { mode: 0o700 });
  return path;
}

export function acquireHostLock(path: string): () => void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  let fd: number;
  try {
    fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  } catch {
    throw new SafeError('LOCKED', 'Another backup run holds the host lock.');
  }
  try {
    writeSync(fd, `${process.pid}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  fsyncDirectory(dirname(path));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      unlinkSync(path);
      fsyncDirectory(dirname(path));
    } catch {
      // Cleanup remains best-effort during process termination.
    }
  };
}

export function removePlaintextFile(path: string) {
  if (!existsSync(path)) return;
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    rmSync(path, { force: true, recursive: true });
    return;
  }
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_NOFOLLOW);
    const zeroes = Buffer.alloc(Math.min(1024 * 1024, Math.max(1, info.size)));
    let remaining = info.size;
    let position = 0;
    while (remaining > 0) {
      const length = Math.min(zeroes.length, remaining);
      writeSync(fd, zeroes, 0, length, position);
      position += length;
      remaining -= length;
    }
    fsyncSync(fd);
  } catch {
    // Unlink below is still mandatory; overwriting is best-effort on modern filesystems.
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(path, { force: true });
  }
}

export function cleanupStaging(path: string | undefined, plaintextPath?: string) {
  if (!path) return;
  if (plaintextPath) removePlaintextFile(plaintextPath);
  rmSync(path, { recursive: true, force: true });
}

export function loadSecureEnvironmentFile(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const path = environment.UNIPLAN_BACKUP_ENV_FILE;
  if (!path) return { ...environment };
  const info = lstatSync(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    !isOwnedByCurrentUser(info.uid) ||
    (info.mode & 0o077) !== 0
  ) {
    throw new SafeError('ENV_FILE_UNSAFE', 'Secure environment file must be a private regular file.');
  }
  const loaded = { ...environment };
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) throw new SafeError('ENV_FILE_INVALID', 'Secure environment file has invalid syntax.');
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value) as string;
      } catch {
        throw new SafeError('ENV_FILE_INVALID', 'Secure environment file has invalid quoting.');
      }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (loaded[match[1]] === undefined) loaded[match[1]] = value;
  }
  return loaded;
}

export function booleanEnvironment(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: boolean,
): boolean {
  const value = environment[name];
  if (value === undefined || value === '') return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new SafeError('CONFIG_INVALID', `${name} must be true or false.`);
}

export function positiveIntegerEnvironment(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
  maximum: number,
): number {
  const value = environment[name];
  if (value === undefined || value === '') return defaultValue;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new SafeError('CONFIG_INVALID', `${name} must be between 1 and ${maximum}.`);
  }
  return parsed;
}

export function assertPublicAgeRecipient(recipient: string | undefined): string {
  if (!recipient) throw new SafeError('ENCRYPTION_REQUIRED', 'An age recipient is required.');
  const value = recipient.trim();
  if (
    value !== recipient ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.includes('AGE-SECRET-KEY-') ||
    !/^age1[0-9a-z]{20,}$/.test(value)
  ) {
    throw new SafeError('ENCRYPTION_REQUIRED', 'The age recipient must be one public age recipient.');
  }
  return value;
}

export function assertPrivateIdentityFile(path: string | undefined): string {
  if (!path) throw new SafeError('IDENTITY_REQUIRED', 'An age identity file is required.');
  const absolute = resolve(path);
  const info = lstatSync(absolute);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    !isOwnedByCurrentUser(info.uid) ||
    (info.mode & 0o077) !== 0
  ) {
    throw new SafeError('IDENTITY_UNSAFE', 'Age identity must be a private regular file.');
  }
  return absolute;
}

export function atomicPublishPair(
  stagedArtifact: string,
  stagedManifest: string,
  finalDirectory: string,
  artifactFilename: string,
  manifestFilename: string,
) {
  const artifactPath = join(finalDirectory, artifactFilename);
  const manifestPath = join(finalDirectory, manifestFilename);
  if (existsSync(artifactPath) || existsSync(manifestPath)) {
    throw new SafeError('PUBLICATION_CONFLICT', 'Backup artifact name already exists.');
  }
  let artifactPublished = false;
  try {
    renameSync(stagedArtifact, artifactPath);
    artifactPublished = true;
    fsyncDirectory(finalDirectory);
    renameSync(stagedManifest, manifestPath);
    fsyncDirectory(finalDirectory);
  } catch {
    if (existsSync(manifestPath)) rmSync(manifestPath, { force: true });
    if (artifactPublished && existsSync(artifactPath)) rmSync(artifactPath, { force: true });
    fsyncDirectory(finalDirectory);
    throw new SafeError('PUBLICATION_FAILED', 'Atomic backup publication failed.');
  }
  return { artifactPath, manifestPath };
}

export function verifyLocalArtifact(path: string, expectedSize: number, expectedSha256: string) {
  const info = lstatSync(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    !isOwnedByCurrentUser(info.uid) ||
    (info.mode & 0o077) !== 0
  ) {
    throw new SafeError('ARTIFACT_INVALID', 'Encrypted artifact must be a regular file.');
  }
  if (info.size !== expectedSize || sha256File(path) !== expectedSha256) {
    throw new SafeError('CHECKSUM_MISMATCH', 'Encrypted artifact integrity verification failed.');
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const header = Buffer.alloc(22);
  let count = 0;
  try {
    count = readSync(fd, header, 0, header.length, 0);
  } finally {
    closeSync(fd);
  }
  if (count < 21 || !header.subarray(0, count).toString('utf8').startsWith('age-encryption.org/v1')) {
    throw new SafeError('PLAINTEXT_REJECTED', 'Artifact is not an age-encrypted file.');
  }
}
