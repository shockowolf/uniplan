import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const schemaPath = join(root, 'prisma', 'schema.prisma');
const sqliteSchemaPath = join(root, 'prisma', 'schema.sqlite.prisma');
const prismaBin = join(root, 'node_modules', '.bin', 'prisma');
const seedPath = join(root, 'prisma', 'seed.ts');

if (process.env.SKIP_UNIPLAN_DEMO_SETUP === '1') {
  console.log('Skipping UniPlan demo DB setup because SKIP_UNIPLAN_DEMO_SETUP=1.');
  process.exit(0);
}

function readEnvDatabaseUrl() {
  if (!existsSync(envPath)) return null;
  const envText = readFileSync(envPath, 'utf8');
  const match = envText.match(/^DATABASE_URL=(?:"([^"]+)"|'([^']+)'|([^\r\n#]+))/m);
  return match?.[1] ?? match?.[2] ?? match?.[3]?.trim() ?? null;
}

const databaseUrl = process.env.DATABASE_URL ?? readEnvDatabaseUrl();

if (databaseUrl && !databaseUrl.startsWith('file:')) {
  console.log('Skipping UniPlan demo DB setup because DATABASE_URL is not SQLite.');
  process.exit(0);
}

if (!databaseUrl) {
  writeFileSync(envPath, 'DATABASE_URL="file:./dev.db"\n');
}

copyFileSync(sqliteSchemaPath, schemaPath);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(prismaBin, ['db', 'push']);
run(process.execPath, ['--import', 'tsx', seedPath]);
