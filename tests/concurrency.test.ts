import { describe, expect, it } from 'vitest';
import {
  isRetryableTransactionError,
  withBoundedTransactionRetry,
} from '@/lib/domain/concurrency';

describe('bounded transaction retries', () => {
  it.each([{ code: 'P2034' }, { code: '40001' }, { meta: { code: '40P01' } }])(
    'recognizes retryable Prisma/PostgreSQL errors',
    (error) => {
      expect(isRetryableTransactionError(error)).toBe(true);
    },
  );

  it('retries transient errors and returns a successful result', async () => {
    let attempts = 0;
    await expect(
      withBoundedTransactionRetry(async () => {
        attempts += 1;
        if (attempts < 3) throw { meta: { code: '40001' } };
        return 'ok';
      }, 4),
    ).resolves.toBe('ok');
    expect(attempts).toBe(3);
  });

  it('bounds retries and maps exhaustion to a stable domain conflict', async () => {
    let attempts = 0;
    await expect(
      withBoundedTransactionRetry(async () => {
        attempts += 1;
        throw { code: 'P2034' };
      }, 2),
    ).rejects.toMatchObject({
      code: 'CONCURRENT_MUTATION_CONFLICT',
      status: 409,
    });
    expect(attempts).toBe(2);
  });
});
