import { createHmac } from 'node:crypto';
import {
  AuditOutcome,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { DomainError } from '@/lib/domain/errors';
import { isRetryableTransactionError } from '@/lib/domain/concurrency';

if (typeof window !== 'undefined') {
  throw new Error('The audit service is server-only.');
}

export const AUDIT_ACTIONS = [
  'auth.cleanup',
  'auth.login',
  'auth.login.rate_limited',
  'auth.logout',
  'auth.password_reset',
  'bom.activated',
  'bom.created',
  'bom.deactivated',
  'bom.updated',
  'bom_revision.activated',
  'bom_revision.components_replaced',
  'bom_revision.created',
  'bom_revision.retired',
  'inventory.production_posted',
  'inventory.safety_quantity_updated',
  'inventory.transaction_posted',
  'inventory.transaction_reversed',
  'item.activated',
  'item.created',
  'item.deactivated',
  'item.updated',
  'item_category.activated',
  'item_category.created',
  'item_category.deactivated',
  'item_category.updated',
  'navigation.activated',
  'navigation.created',
  'navigation.deactivated',
  'navigation.reparented',
  'navigation.updated',
  'warehouse.activated',
  'warehouse.created',
  'warehouse.deactivated',
  'warehouse.updated',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type TrustedAuditContext = Readonly<{
  companyId: string;
  actorUserId: string | null;
}>;

export type TrustedMutationActor = Readonly<{
  companyId: string;
  actorUserId: string;
}>;

export type AuditWriteHooks = {
  /** Test-only failure injection, never populated from a request. */
  beforeInsert?: () => Promise<void>;
};

type AuditDatabaseClient = PrismaClient | Prisma.TransactionClient;

type AuditMetadata = Record<string, unknown>;

export type AuditEventInput = {
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  outcome?: AuditOutcome;
  correlationMaterial?: string | null;
  idempotencyMaterial?: string | null;
  subjectMaterial?: string | null;
  metadata?: AuditMetadata;
};

const ACTION_SET = new Set<string>(AUDIT_ACTIONS);
const MAX_METADATA_BYTES = 2_048;
const MAX_METADATA_DEPTH = 3;
const MAX_METADATA_KEYS = 16;
const MAX_METADATA_ARRAY_LENGTH = 20;
const MAX_METADATA_STRING_LENGTH = 80;
const MAX_HASH_MATERIAL_BYTES = 512;
const SAFE_METADATA_STRING = /^[A-Za-z0-9_.:-]+$/;
const RESOURCE_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PII_LIKE_KEY =
  /(email|mail|company|tenant|user|actor|identifier|name|password|passwd|secret|token|cookie|body|birth|phone|mobile|contact|customer|address|memo|note|description|reason|reference|stack|exception)/i;

const ALLOWED_METADATA_KEYS_BY_ACTION: Partial<
  Record<AuditAction, ReadonlySet<string>>
> = {
  'auth.cleanup': new Set([
    'deletedLoginRateLimitBucketCount',
    'deletedSessionCount',
  ]),
  'auth.password_reset': new Set(['revokedSessionCount']),
  'inventory.production_posted': new Set(['entryCount']),
  'inventory.transaction_posted': new Set(['entryCount']),
  'inventory.transaction_reversed': new Set(['entryCount']),
};

export class AuditValidationError extends DomainError {
  constructor() {
    super('Audit event validation failed', 'AUDIT_VALIDATION_FAILED', 500);
  }
}

export class AuditWriteError extends DomainError {
  constructor() {
    super('Audit event persistence failed', 'AUDIT_WRITE_FAILED', 503);
  }
}

function auditHmacSecret(environment: NodeJS.ProcessEnv = process.env) {
  const configuredSecret = environment.UNIPLAN_AUDIT_HMAC_SECRET?.trim();
  if (configuredSecret && Buffer.byteLength(configuredSecret, 'utf8') >= 32) {
    return configuredSecret;
  }
  if (environment.NODE_ENV === 'production') {
    throw new AuditWriteError();
  }
  return 'uniplan-local-audit-hmac-secret-not-for-production';
}

export function hashAuditMaterial(
  bucket: 'correlation' | 'idempotency' | 'subject',
  material: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const materialBytes = Buffer.byteLength(material, 'utf8');
  if (materialBytes === 0 || materialBytes > MAX_HASH_MATERIAL_BYTES) {
    throw new AuditValidationError();
  }
  return createHmac('sha256', auditHmacSecret(environment))
    .update(`uniplan-audit:v1:${bucket}\0${material}`, 'utf8')
    .digest('hex');
}

function inspectMetadataValue(
  value: unknown,
  depth: number,
  keyCounter: { value: number },
) {
  if (depth > MAX_METADATA_DEPTH) throw new AuditValidationError();
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new AuditValidationError();
    return;
  }
  if (typeof value === 'string') {
    if (
      value.length > MAX_METADATA_STRING_LENGTH ||
      !SAFE_METADATA_STRING.test(value) ||
      value.includes('@')
    ) {
      throw new AuditValidationError();
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_METADATA_ARRAY_LENGTH)
      throw new AuditValidationError();
    for (const entry of value) inspectMetadataValue(entry, depth + 1, keyCounter);
    return;
  }
  if (!value || typeof value !== 'object') throw new AuditValidationError();
  for (const [key, nestedValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    keyCounter.value += 1;
    if (
      keyCounter.value > MAX_METADATA_KEYS ||
      key.length > 64 ||
      PII_LIKE_KEY.test(key)
    ) {
      throw new AuditValidationError();
    }
    inspectMetadataValue(nestedValue, depth + 1, keyCounter);
  }
}

export function validateAuditMetadata(
  action: AuditAction,
  metadata: AuditMetadata = {},
) {
  inspectMetadataValue(metadata, 1, { value: 0 });
  const allowedKeys = ALLOWED_METADATA_KEYS_BY_ACTION[action] ?? new Set();
  if (Object.keys(metadata).some((key) => !allowedKeys.has(key))) {
    throw new AuditValidationError();
  }
  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > MAX_METADATA_BYTES) {
    throw new AuditValidationError();
  }
  return metadata;
}

function validateAuditEvent(input: AuditEventInput) {
  if (!ACTION_SET.has(input.action)) throw new AuditValidationError();
  if (!RESOURCE_TYPE_PATTERN.test(input.resourceType))
    throw new AuditValidationError();
  if (input.resourceId != null && !RESOURCE_ID_PATTERN.test(input.resourceId)) {
    throw new AuditValidationError();
  }
  const outcome = input.outcome ?? AuditOutcome.SUCCEEDED;
  if (!Object.values(AuditOutcome).includes(outcome))
    throw new AuditValidationError();
  return {
    outcome,
    metadata: validateAuditMetadata(input.action, input.metadata),
  };
}

export async function recordAuditEvent(
  databaseClient: AuditDatabaseClient,
  context: TrustedAuditContext,
  input: AuditEventInput,
  hooks: AuditWriteHooks = {},
) {
  // Resolve configuration even for events without buckets so production cannot
  // accidentally run a partially configured audit subsystem.
  auditHmacSecret();
  if (!context.companyId || (context.actorUserId !== null && !context.actorUserId)) {
    throw new AuditValidationError();
  }
  const validated = validateAuditEvent(input);
  try {
    await hooks.beforeInsert?.();
    return await databaseClient.auditEvent.create({
      data: {
        companyId: context.companyId,
        actorUserId: context.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        outcome: validated.outcome,
        correlationHash: input.correlationMaterial
          ? hashAuditMaterial('correlation', input.correlationMaterial)
          : null,
        idempotencyKeyHash: input.idempotencyMaterial
          ? hashAuditMaterial('idempotency', input.idempotencyMaterial)
          : null,
        subjectHash: input.subjectMaterial
          ? hashAuditMaterial('subject', input.subjectMaterial)
          : null,
        metadata: validated.metadata as Prisma.InputJsonValue,
      },
    });
  } catch (auditError) {
    if (isRetryableTransactionError(auditError)) throw auditError;
    if (auditError instanceof DomainError) throw auditError;
    throw new AuditWriteError();
  }
}

export async function recordStandaloneAuditEvent(
  context: TrustedAuditContext,
  input: AuditEventInput,
  databaseClient: PrismaClient = prisma,
  hooks: AuditWriteHooks = {},
) {
  return databaseClient.$transaction((transaction) =>
    recordAuditEvent(transaction, context, input, hooks),
  );
}

export async function recordMutationAuditEvent(
  databaseClient: AuditDatabaseClient,
  companyId: string,
  actor: TrustedMutationActor,
  input: AuditEventInput,
  hooks: AuditWriteHooks = {},
) {
  if (actor.companyId !== companyId) throw new AuditValidationError();
  return recordAuditEvent(databaseClient, actor, input, hooks);
}

export function auditContextFromSession(session: {
  companyId: string;
  userId: string;
}): TrustedMutationActor {
  return Object.freeze({
    companyId: session.companyId,
    actorUserId: session.userId,
  });
}

export function systemAuditContext(companyId: string): TrustedAuditContext {
  return Object.freeze({ companyId, actorUserId: null });
}

export function loginSubjectMaterial(companyCode: string, email: string) {
  return `${companyCode.normalize('NFKC').trim().toLowerCase()}\0${email
    .normalize('NFKC')
    .trim()
    .toLowerCase()}`;
}
