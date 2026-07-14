import { describe, expect, it } from 'vitest';
import {
  AuditWriteError,
  hashAuditMaterial,
  validateAuditMetadata,
} from '@/lib/audit/service.server';

describe('strict audit validation', () => {
  it('rejects PII-like keys and unsafe personal/free-text strings', () => {
    expect(() =>
      validateAuditMetadata('auth.cleanup', {
        email: 'person@example.test',
      }),
    ).toThrow();
    expect(() =>
      validateAuditMetadata('auth.cleanup', {
        deletedSessionCount: 'person@example.test',
      }),
    ).toThrow();
    expect(() =>
      validateAuditMetadata('auth.cleanup', {
        customerNote: 'anything',
      }),
    ).toThrow();
  });

  it('rejects deep, oversized, non-allow-listed, and non-integer metadata', () => {
    expect(() =>
      validateAuditMetadata('auth.cleanup', {
        deletedSessionCount: { a: { b: { c: 1 } } },
      }),
    ).toThrow();
    expect(() =>
      validateAuditMetadata('auth.cleanup', {
        deletedSessionCount: Array.from({ length: 21 }, (_, index) => index),
      }),
    ).toThrow();
    expect(() =>
      validateAuditMetadata('item.created', { arbitrary: 1 }),
    ).toThrow();
    expect(() =>
      validateAuditMetadata('auth.cleanup', {
        deletedSessionCount: 1.5,
      }),
    ).toThrow();
  });

  it('accepts only the bounded action-specific metadata shape', () => {
    expect(
      validateAuditMetadata('auth.cleanup', {
        deletedLoginRateLimitBucketCount: 2,
        deletedSessionCount: 3,
      }),
    ).toEqual({
      deletedLoginRateLimitBucketCount: 2,
      deletedSessionCount: 3,
    });
  });

  it('requires a private HMAC secret in production', () => {
    expect(() =>
      hashAuditMaterial('subject', 'opaque-input', {
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toThrow(AuditWriteError);
    expect(
      hashAuditMaterial('subject', 'opaque-input', {
        NODE_ENV: 'production',
        UNIPLAN_AUDIT_HMAC_SECRET: 'a'.repeat(32),
      } as NodeJS.ProcessEnv),
    ).toMatch(/^[0-9a-f]{64}$/);
  });
});
