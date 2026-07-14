BEGIN;

CREATE TYPE "audit_outcome" AS ENUM ('succeeded', 'denied', 'failed');

CREATE TABLE "audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" VARCHAR(80) NOT NULL,
  "resourceType" VARCHAR(64) NOT NULL,
  "resourceId" VARCHAR(128),
  "outcome" "audit_outcome" NOT NULL,
  "correlationHash" CHAR(64),
  "idempotencyKeyHash" CHAR(64),
  "subjectHash" CHAR(64),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_events_action_format_check"
    CHECK ("action" ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'),
  CONSTRAINT "audit_events_resource_type_format_check"
    CHECK ("resourceType" ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT "audit_events_metadata_object_check"
    CHECK (jsonb_typeof("metadata") = 'object'),
  CONSTRAINT "audit_events_metadata_size_check"
    CHECK (pg_column_size("metadata") <= 4096),
  CONSTRAINT "audit_events_correlation_hash_check"
    CHECK ("correlationHash" IS NULL OR "correlationHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "audit_events_idempotency_hash_check"
    CHECK ("idempotencyKeyHash" IS NULL OR "idempotencyKeyHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "audit_events_subject_hash_check"
    CHECK ("subjectHash" IS NULL OR "subjectHash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "audit_events_companyId_action_idempotencyKeyHash_key"
  ON "audit_events"("companyId", "action", "idempotencyKeyHash");
CREATE INDEX "audit_events_companyId_createdAt_id_idx"
  ON "audit_events"("companyId", "createdAt", "id");
CREATE INDEX "audit_events_companyId_action_createdAt_idx"
  ON "audit_events"("companyId", "action", "createdAt");
CREATE INDEX "audit_events_companyId_resourceType_resourceId_createdAt_idx"
  ON "audit_events"("companyId", "resourceType", "resourceId", "createdAt");
CREATE INDEX "audit_events_companyId_outcome_createdAt_idx"
  ON "audit_events"("companyId", "outcome", "createdAt");

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_companyId_actorUserId_fkey"
  FOREIGN KEY ("companyId", "actorUserId") REFERENCES "users"("companyId", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE FUNCTION reject_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only; % is not allowed', TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "audit_events_reject_update"
BEFORE UPDATE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();

CREATE TRIGGER "audit_events_reject_delete"
BEFORE DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();

COMMIT;
