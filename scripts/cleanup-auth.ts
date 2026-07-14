import { cleanupAuthenticationState } from '../lib/auth/cleanup';
import { prisma } from '../lib/db';

async function main() {
  const result = await cleanupAuthenticationState(prisma);
  console.log(
    `Authentication cleanup complete: ${result.deletedLoginRateLimitBuckets} limiter buckets and ${result.deletedAuthSessions} sessions removed.`,
  );
}

main()
  .catch((requestError: unknown) => {
    const errorType =
      requestError instanceof Error ? requestError.name : 'UnknownError';
    console.error(`Authentication cleanup failed (${errorType}).`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
