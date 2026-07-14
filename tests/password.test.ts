import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from '@/lib/auth/password';

const validPassword = 'correct horse battery staple';

describe('scrypt password hashing', () => {
  it('creates a versioned encoded hash with a random salt', async () => {
    const firstHash = await hashPassword(validPassword);
    const secondHash = await hashPassword(validPassword);

    expect(firstHash).toMatch(
      /^scrypt\$v=1\$N=32768,r=8,p=1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/,
    );
    expect(secondHash).not.toBe(firstHash);
    expect(firstHash).not.toContain(validPassword);
  });

  it('verifies only the correct password and rejects malformed formats', async () => {
    const passwordHash = await hashPassword(validPassword);

    await expect(verifyPassword(validPassword, passwordHash)).resolves.toBe(true);
    await expect(verifyPassword('incorrect password', passwordHash)).resolves.toBe(
      false,
    );
    await expect(verifyPassword(validPassword, 'plaintext')).resolves.toBe(false);
    await expect(
      verifyPassword(
        validPassword,
        passwordHash.replace('N=32768', 'N=999999999'),
      ),
    ).resolves.toBe(false);
  });

  it('enforces password length bounds before hashing', () => {
    expect(() => validateNewPassword('too-short')).toThrow(/at least 12/);
    expect(() => validateNewPassword('가'.repeat(400))).toThrow(/1024 bytes/);
  });
});
