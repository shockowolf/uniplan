import { Prisma, type PrismaClient } from '@prisma/client';
import { ConflictError } from '@/lib/domain/errors';

const DEFAULT_MAX_ATTEMPTS = 4;
const MAX_MAX_ATTEMPTS = 6;

export type CompanyMutationHooks = {
  /** Test-only barrier hook. It runs after the transaction owns the company lock. */
  afterLock?: (databaseTransaction: Prisma.TransactionClient) => Promise<void>;
};

export type CompanyMutationOptions = {
  maxAttempts?: number;
  hooks?: CompanyMutationHooks;
};

export class ConcurrentMutationError extends ConflictError {
  constructor() {
    super(
      'The operation conflicted with another company mutation; retry the request',
      'CONCURRENT_MUTATION_CONFLICT',
    );
  }
}

function errorCodeCandidates(error: unknown): string[] {
  if (!error || typeof error !== 'object') return [];
  const record = error as Record<string, unknown>;
  const directCandidates = [record.code, record.sqlState].filter(
    (candidate): candidate is string => typeof candidate === 'string',
  );
  return [
    ...directCandidates,
    ...errorCodeCandidates(record.meta),
    ...errorCodeCandidates(record.cause),
    ...errorCodeCandidates(record.driverAdapterError),
  ];
}

export function isRetryableTransactionError(error: unknown) {
  return errorCodeCandidates(error).some((errorCode) =>
    ['P2034', '40001', '40P01'].includes(errorCode),
  );
}

export async function withBoundedTransactionRetry<T>(
  operation: (attemptNumber: number) => Promise<T>,
  maxAttemptsValue = DEFAULT_MAX_ATTEMPTS,
): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(maxAttemptsValue, MAX_MAX_ATTEMPTS));
  for (
    let attemptNumber = 1;
    attemptNumber <= maxAttempts;
    attemptNumber += 1
  ) {
    try {
      return await operation(attemptNumber);
    } catch (operationError) {
      if (!isRetryableTransactionError(operationError)) throw operationError;
      if (attemptNumber === maxAttempts) throw new ConcurrentMutationError();
      await new Promise((resolveRetryDelay) =>
        setTimeout(resolveRetryDelay, attemptNumber * 10),
      );
    }
  }
  throw new ConcurrentMutationError();
}

/**
 * U9 lock protocol: every item, warehouse, inventory, BOM, category, and
 * navigation mutation takes this one company-scoped advisory xact lock before
 * reading mutable domain state. A single key gives every caller the same lock
 * order and prevents hierarchy/BOM discovery from acquiring partial lock sets.
 */
export async function withCompanyMutationTransaction<T>(
  companyId: string,
  databaseClient: PrismaClient,
  operation: (databaseTransaction: Prisma.TransactionClient) => Promise<T>,
  options: CompanyMutationOptions = {},
) {
  return withBoundedTransactionRetry(
    () =>
      databaseClient.$transaction(
        async (databaseTransaction) => {
          const lockKey = `uniplan:u9:company-mutation:${companyId}`;
          await databaseTransaction.$executeRaw`
            SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
          `;
          await options.hooks?.afterLock?.(databaseTransaction);
          return operation(databaseTransaction);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 20_000,
        },
      ),
    options.maxAttempts,
  );
}
