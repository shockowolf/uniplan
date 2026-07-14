import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

type TableFingerprint = {
  columns: string[];
  count: number;
  fingerprint: string;
};

type FingerprintSnapshot = {
  schema: string;
  capturedAt: string;
  tables: Record<string, TableFingerprint>;
};

function databaseUrlFromEnvironment() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const line = readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .find((candidate) => /^\s*DATABASE_URL\s*=/.test(candidate));
  if (!line) throw new Error('DATABASE_URL is required.');
  const value = line.slice(line.indexOf('=') + 1).trim();
  if (value.startsWith('"') && value.endsWith('"'))
    return JSON.parse(value) as string;
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function tableFingerprint(
  databaseClient: PrismaClient,
  schema: string,
  table: string,
  columns: string[],
) {
  const jsonArguments = columns
    .flatMap((column) => [quoteLiteral(column), `t.${quoteIdentifier(column)}`])
    .join(', ');
  const [result] = await databaseClient.$queryRawUnsafe<
    { count: bigint; fingerprint: string }[]
  >(`
    SELECT COUNT(*)::bigint AS count,
      md5(COALESCE(string_agg(row_hash, '' ORDER BY row_hash), '')) AS fingerprint
    FROM (
      SELECT md5(jsonb_build_object(${jsonArguments})::text) AS row_hash
      FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)} t
    ) fingerprint_rows
  `);
  return {
    columns,
    count: Number(result.count),
    fingerprint: result.fingerprint,
  };
}

async function capture(
  databaseClient: PrismaClient,
  baseline?: FingerprintSnapshot,
) {
  const [context] = await databaseClient.$queryRaw<
    { schema: string }[]
  >`SELECT current_schema() AS schema`;
  if (!context?.schema) throw new Error('Unable to resolve current schema.');
  if (baseline && baseline.schema !== context.schema) {
    throw new Error(
      `Fingerprint schema mismatch: expected ${baseline.schema}, received ${context.schema}.`,
    );
  }
  const tableRows = await databaseClient.$queryRaw<{ tableName: string }[]>`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
    ORDER BY table_name
  `;
  const tableNames = baseline
    ? Object.keys(baseline.tables).sort()
    : tableRows.map((row) => row.tableName);
  const tables: Record<string, TableFingerprint> = {};
  for (const tableName of tableNames) {
    const columns = baseline
      ? baseline.tables[tableName].columns
      : (
          await databaseClient.$queryRawUnsafe<{ columnName: string }[]>(`
            SELECT column_name AS "columnName"
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = ${quoteLiteral(tableName)}
            ORDER BY ordinal_position
          `)
        ).map((row) => row.columnName);
    tables[tableName] = await tableFingerprint(
      databaseClient,
      context.schema,
      tableName,
      columns,
    );
  }
  return {
    schema: context.schema,
    capturedAt: new Date().toISOString(),
    tables,
  } satisfies FingerprintSnapshot;
}

async function main() {
  const [command, snapshotPath] = process.argv.slice(2);
  if (!['capture', 'compare'].includes(command) || !snapshotPath) {
    throw new Error(
      'Usage: database-fingerprint.ts <capture|compare> <snapshot-path>',
    );
  }
  const databaseClient = new PrismaClient({
    datasourceUrl: databaseUrlFromEnvironment(),
  });
  try {
    if (command === 'capture') {
      const snapshot = await capture(databaseClient);
      writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
        mode: 0o600,
      });
      console.log(
        JSON.stringify({
          status: 'captured',
          schema: snapshot.schema,
          tableCount: Object.keys(snapshot.tables).length,
          rowCount: Object.values(snapshot.tables).reduce(
            (sum, table) => sum + table.count,
            0,
          ),
          snapshotPath,
        }),
      );
      return;
    }
    const baseline = JSON.parse(
      readFileSync(snapshotPath, 'utf8'),
    ) as FingerprintSnapshot;
    const current = await capture(databaseClient, baseline);
    const mismatches = Object.keys(baseline.tables).filter((tableName) => {
      const before = baseline.tables[tableName];
      const after = current.tables[tableName];
      return (
        !after ||
        before.count !== after.count ||
        before.fingerprint !== after.fingerprint
      );
    });
    if (mismatches.length > 0) {
      throw new Error(
        `Application data fingerprint mismatch: ${mismatches.join(', ')}`,
      );
    }
    console.log(
      JSON.stringify({
        status: 'identical',
        schema: current.schema,
        tableCount: Object.keys(current.tables).length,
        rowCount: Object.values(current.tables).reduce(
          (sum, table) => sum + table.count,
          0,
        ),
      }),
    );
  } finally {
    await databaseClient.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
