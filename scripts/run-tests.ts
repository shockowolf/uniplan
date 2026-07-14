import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const DEFAULT_DATABASE_URL =
  'postgresql://uniplan:uniplan_password@127.0.0.1:5433/uniplan_dev?schema=public';
const TEST_SCHEMA = 'uniplan_test';

function databaseUrlFromDotEnv() {
  try {
    const dotEnv = readFileSync('.env', 'utf8');
    const databaseUrlLine = dotEnv
      .split(/\r?\n/)
      .find((line) => /^\s*DATABASE_URL\s*=/.test(line));
    if (!databaseUrlLine) return undefined;
    const configuredValue = databaseUrlLine.slice(
      databaseUrlLine.indexOf('=') + 1,
    ).trim();
    if (configuredValue.startsWith('"') && configuredValue.endsWith('"')) {
      return JSON.parse(configuredValue) as string;
    }
    if (configuredValue.startsWith("'") && configuredValue.endsWith("'")) {
      return configuredValue.slice(1, -1);
    }
    return configuredValue;
  } catch {
    return undefined;
  }
}

function resolveTestDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const baseUrl =
    process.env.DATABASE_URL ?? databaseUrlFromDotEnv() ?? DEFAULT_DATABASE_URL;
  const testUrl = new URL(baseUrl);
  testUrl.searchParams.set('schema', TEST_SCHEMA);
  return testUrl.toString();
}

function run(command: string, args: string[], environment: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const environment = {
  ...process.env,
  DATABASE_URL: resolveTestDatabaseUrl(),
  UNIPLAN_TEST_DATABASE_GUARD: 'enabled',
};

run('npx', ['prisma', 'migrate', 'deploy'], environment);
run('npx', ['vitest', 'run', ...process.argv.slice(2)], environment);
