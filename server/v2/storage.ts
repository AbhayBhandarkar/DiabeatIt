import type { Database } from '../db';
import { entityKinds, allScopes, type Entity, type Space, type User, type SnapshotResponse, type Grant, type Invitation, type AuditRecord, type Scope, type EntityKind } from '../../shared/v2';
import { ApiError } from './validation';

/** Separate relational namespace: no reads from or writes to the legacy demo tables. */
export async function initializeV2(db: Database): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS v2_accounts (
      id UUID PRIMARY KEY, email TEXT NOT NULL UNIQUE CHECK(email=lower(email)), name TEXT NOT NULL,
      password_hash TEXT NOT NULL, auth_version INTEGER NOT NULL DEFAULT 1,
      consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS v2_sessions (
      token_hash TEXT PRIMARY KEY, account_id UUID NOT NULL REFERENCES v2_accounts(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL, auth_version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      id UUID, device TEXT NOT NULL DEFAULT 'Earlier sign-in')`,
    `ALTER TABLE v2_sessions ADD COLUMN IF NOT EXISTS id UUID`,
    `ALTER TABLE v2_sessions ADD COLUMN IF NOT EXISTS device TEXT NOT NULL DEFAULT 'Earlier sign-in'`,
    `ALTER TABLE v2_sessions ALTER COLUMN device SET DEFAULT 'Earlier sign-in'`,
    `UPDATE v2_sessions SET device='Earlier sign-in' WHERE device='This browser'`,
    `UPDATE v2_sessions SET id=gen_random_uuid() WHERE id IS NULL`,
    `ALTER TABLE v2_sessions ALTER COLUMN id SET NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS v2_sessions_public_id ON v2_sessions(id)`,
    `CREATE INDEX IF NOT EXISTS v2_sessions_account ON v2_sessions(account_id)`,
    `CREATE INDEX IF NOT EXISTS v2_sessions_expiry ON v2_sessions(expires_at)`,
    `CREATE TABLE IF NOT EXISTS v2_recovery_codes (
      token_hash TEXT PRIMARY KEY, account_id UUID NOT NULL REFERENCES v2_accounts(id) ON DELETE CASCADE,
      used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE INDEX IF NOT EXISTS v2_recovery_account ON v2_recovery_codes(account_id)`,
    `CREATE TABLE IF NOT EXISTS v2_spaces (
      id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES v2_accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE INDEX IF NOT EXISTS v2_spaces_owner ON v2_spaces(owner_id)`,
    `CREATE TABLE IF NOT EXISTS v2_grants (
      id UUID PRIMARY KEY, space_id UUID NOT NULL REFERENCES v2_spaces(id) ON DELETE CASCADE,
      account_id UUID NOT NULL REFERENCES v2_accounts(id) ON DELETE CASCADE, label TEXT NOT NULL,
      scopes TEXT[] NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(space_id,account_id))`,
    `CREATE INDEX IF NOT EXISTS v2_grants_account ON v2_grants(account_id,space_id)`,
    `CREATE TABLE IF NOT EXISTS v2_invitations (
      id UUID PRIMARY KEY, space_id UUID NOT NULL REFERENCES v2_spaces(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL, scopes TEXT[] NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE INDEX IF NOT EXISTS v2_invitations_space ON v2_invitations(space_id,expires_at) WHERE consumed_at IS NULL`,
    `CREATE TABLE IF NOT EXISTS v2_entities (
      id UUID PRIMARY KEY, space_id UUID NOT NULL REFERENCES v2_spaces(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN (${entityKinds.map(k => `'${k}'`).join(',')})),
      version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),
      author JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      medicine_id UUID GENERATED ALWAYS AS (CASE WHEN kind='intakes' THEN (data->>'medicineId')::uuid END) STORED,
      UNIQUE(space_id,id), FOREIGN KEY(space_id,medicine_id) REFERENCES v2_entities(space_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
      CHECK(kind<>'documents' OR NOT(data ? 'base64')),
      CHECK(kind<>'intakes' OR (medicine_id IS NOT NULL AND data ? 'date' AND data ? 'scheduledTime')),
      CHECK(octet_length(data::text)<=65536))`,
    // Logical patient/kind partitions, stable retrieval order and atomic occurrence uniqueness.
    `CREATE INDEX IF NOT EXISTS v2_entities_partition ON v2_entities(space_id,kind,created_at,id)`,
    `CREATE INDEX IF NOT EXISTS v2_entities_medicine_reference ON v2_entities(space_id,medicine_id) WHERE medicine_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS v2_intake_occurrence ON v2_entities(space_id,medicine_id,(data->>'date'),(data->>'scheduledTime')) WHERE kind='intakes'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS v2_lesson_identity ON v2_entities(space_id,(data->>'lessonId')) WHERE kind='lessons'`,
    `CREATE TABLE IF NOT EXISTS v2_documents (
      entity_id UUID PRIMARY KEY REFERENCES v2_entities(id) ON DELETE CASCADE,
      base64 TEXT NOT NULL CHECK(length(base64)<=2796204))`,
    `CREATE TABLE IF NOT EXISTS v2_audit (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      space_id UUID NOT NULL REFERENCES v2_spaces(id) ON DELETE CASCADE,
      actor_id UUID NOT NULL, action TEXT NOT NULL, entity_id UUID, version INTEGER,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE INDEX IF NOT EXISTS v2_audit_space ON v2_audit(space_id,id DESC)`,
    `CREATE OR REPLACE FUNCTION v2_guard_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP='DELETE' AND pg_trigger_depth()>1 THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'Audit records are immutable' USING ERRCODE='23514';
      END $$`,
    `CREATE OR REPLACE TRIGGER v2_audit_immutable BEFORE UPDATE OR DELETE ON v2_audit FOR EACH ROW EXECUTE FUNCTION v2_guard_audit()`,
    `CREATE OR REPLACE FUNCTION v2_guard_entity() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE medicine JSONB; same_occurrence BOOLEAN := FALSE;
      BEGIN
        IF TG_OP='UPDATE' AND (NEW.kind<>OLD.kind OR NEW.space_id<>OLD.space_id OR NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1) THEN
          RAISE EXCEPTION 'Invalid entity revision' USING ERRCODE='23514';
        END IF;
        IF NEW.kind='intakes' THEN
          -- Lock the referenced schedule against concurrent edits until this write commits.
          SELECT data INTO medicine FROM v2_entities
            WHERE id=(NEW.data->>'medicineId')::uuid AND space_id=NEW.space_id AND kind='medicines' FOR SHARE;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Medicine reference is not in this space' USING ERRCODE='23503';
          END IF;
          IF TG_OP='UPDATE' THEN
            same_occurrence := NEW.data->>'medicineId'=OLD.data->>'medicineId'
              AND NEW.data->>'date'=OLD.data->>'date'
              AND NEW.data->>'scheduledTime'=OLD.data->>'scheduledTime';
          END IF;
          -- Existing history can be corrected after archival or schedule changes. Moving it
          -- to another slot is a new occurrence and must satisfy the current schedule.
          IF NOT same_occurrence AND (
            medicine->>'status' IS DISTINCT FROM 'active'
            OR NOT (medicine->'times' @> jsonb_build_array(NEW.data->>'scheduledTime'))
            OR NOT (medicine->'days' @> jsonb_build_array(EXTRACT(DOW FROM (NEW.data->>'date')::date)::int))
            OR NEW.data->>'date' < medicine->>'startDate'
            OR (medicine ? 'endDate' AND NEW.data->>'date' > medicine->>'endDate')
          ) THEN
            RAISE EXCEPTION 'Intake must match an active reported schedule' USING ERRCODE='23514';
          END IF;
        END IF;
        RETURN NEW;
      END $$`,
    `CREATE OR REPLACE TRIGGER v2_entity_guard BEFORE INSERT OR UPDATE ON v2_entities FOR EACH ROW EXECUTE FUNCTION v2_guard_entity()`,
    // Schema 2: databases created before appointments/labs existed get the widened kind list.
    `ALTER TABLE v2_entities DROP CONSTRAINT IF EXISTS v2_entities_kind_check`,
    `ALTER TABLE v2_entities ADD CONSTRAINT v2_entities_kind_check CHECK(kind IN (${entityKinds.map(k => `'${k}'`).join(',')}))`,
    `CREATE TABLE IF NOT EXISTS v2_qr_logins (
      id UUID PRIMARY KEY, secret_hash TEXT NOT NULL, match TEXT NOT NULL, device TEXT NOT NULL,
      approved_by UUID REFERENCES v2_accounts(id) ON DELETE CASCADE, denied BOOLEAN NOT NULL DEFAULT FALSE,
      consumed_at TIMESTAMPTZ, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE INDEX IF NOT EXISTS v2_qr_logins_expiry ON v2_qr_logins(expires_at)`,
    `CREATE TABLE IF NOT EXISTS v2_clinician_links (
      id UUID PRIMARY KEY, space_id UUID NOT NULL REFERENCES v2_spaces(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL, from_date DATE NOT NULL,
      created_by UUID NOT NULL REFERENCES v2_accounts(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL, last_viewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE INDEX IF NOT EXISTS v2_clinician_links_space ON v2_clinician_links(space_id,expires_at)`,
  ];
  for (const sql of statements) await db.query(sql);
}

export const entityColumns = `id, kind, version, created_at AS "createdAt", updated_at AS "updatedAt", author, data`;
export const iso = (value: string | Date) => new Date(value).toISOString();
export function entityOut(row: Entity): Entity { return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) }; }

export async function spacesFor(db: Database, accountId: string): Promise<Space[]> {
  const { rows } = await db.query<Space>(`SELECT s.id,s.name,CASE WHEN s.owner_id=$1 THEN 'owner' ELSE 'companion' END AS role,
    CASE WHEN s.owner_id=$1 THEN $2::text[] ELSE g.scopes END AS scopes
    FROM v2_spaces s LEFT JOIN v2_grants g ON g.space_id=s.id AND g.account_id=$1
    WHERE s.owner_id=$1 OR g.id IS NOT NULL ORDER BY (s.owner_id=$1) DESC,s.created_at,s.id`, [accountId, allScopes]);
  return rows;
}
export async function accessSpace(db: Database, accountId: string, spaceId: string, scope?: Scope | 'owner'): Promise<Space> {
  const { rows } = await db.query<Space>(`SELECT s.id,s.name,CASE WHEN s.owner_id=$1 THEN 'owner' ELSE 'companion' END AS role,
    CASE WHEN s.owner_id=$1 THEN $3::text[] ELSE g.scopes END AS scopes
    FROM v2_spaces s LEFT JOIN v2_grants g ON g.space_id=s.id AND g.account_id=$1
    WHERE s.id=$2 AND (s.owner_id=$1 OR g.id IS NOT NULL)`, [accountId, spaceId, allScopes]);
  const space = rows[0];
  if (!space) throw new ApiError(404, 'NOT_FOUND', 'Space not found.');
  if (scope && (scope === 'owner' ? space.role !== 'owner' : !space.scopes.includes(scope))) throw new ApiError(403, 'FORBIDDEN', 'This account does not have the required permission.');
  return space;
}
export async function snapshot(db: Database, user: User, spaceId: string): Promise<SnapshotResponse> {
  const space = await accessSpace(db, user.id, spaceId);
  const kinds = entityKinds.filter(k => space.scopes.includes(`${k}:read`));
  // Documents are physically separate, so even export never accidentally serializes blobs.
  const { rows } = await db.query<Entity>(`SELECT ${entityColumns} FROM v2_entities WHERE space_id=$1 AND kind=ANY($2::text[]) ORDER BY created_at,id`, [spaceId, kinds]);
  const entities = Object.fromEntries(entityKinds.map(k => [k, rows.filter(r => r.kind === k).map(entityOut)])) as SnapshotResponse['entities'];
  let grants: Grant[] = [], invitations: Invitation[] = [], audit: AuditRecord[] = [];
  if (space.role === 'owner') {
    grants = (await db.query<Grant>(`SELECT g.id,g.account_id AS "accountId",a.name,g.label,g.scopes,g.created_at AS "createdAt" FROM v2_grants g JOIN v2_accounts a ON a.id=g.account_id WHERE g.space_id=$1 ORDER BY g.created_at,g.id`, [spaceId])).rows.map(r => ({ ...r, createdAt: iso(r.createdAt) }));
    invitations = (await db.query<Invitation>(`SELECT id,label,scopes,expires_at AS "expiresAt",created_at AS "createdAt" FROM v2_invitations WHERE space_id=$1 AND consumed_at IS NULL AND expires_at>NOW() ORDER BY created_at,id`, [spaceId])).rows.map(r => ({ ...r, expiresAt: iso(r.expiresAt), createdAt: iso(r.createdAt) }));
    audit = await auditFor(db, spaceId);
  }
  return { space, entities, grants, invitations, audit };
}
export async function auditFor(db: Database, spaceId: string, before?: string): Promise<AuditRecord[]> {
  // Qualify the numeric column: unqualified ORDER BY id resolves to the text output alias.
  const { rows } = await db.query<AuditRecord>(`SELECT a.id::text,a.actor_id AS "actorId",a.action,a.entity_id AS "entityId",a.version,a.at FROM v2_audit a WHERE a.space_id=$1 AND ($2::bigint IS NULL OR a.id<$2::bigint) ORDER BY a.id DESC LIMIT 500`, [spaceId, before ?? null]);
  return rows.map(r => ({ ...r, at: iso(r.at) }));
}

/** Rechecked inside each write, not solely in a preflight JS authorization decision. */
export const writePermission = `(EXISTS(SELECT 1 FROM v2_spaces s WHERE s.id=$2 AND (s.owner_id=$3 OR EXISTS(SELECT 1 FROM v2_grants g WHERE g.space_id=s.id AND g.account_id=$3 AND $4=ANY(g.scopes) FOR SHARE))))`;
export async function writeEntity(db: Database, user: User, space: Space, kind: EntityKind, id: string, data: Record<string, unknown>, blob: string | null, version?: number): Promise<Entity> {
  const params: unknown[] = [id, space.id, user.id, `${kind}:write`, JSON.stringify(data), JSON.stringify({ id: user.id, name: user.name, role: space.role }), blob];
  let change: string;
  if (version === undefined) {
    params.push(kind);
    change = `INSERT INTO v2_entities(id,space_id,kind,data,author) SELECT $1,$2,$8,$5::jsonb,$6::jsonb WHERE ${writePermission} RETURNING *`;
  } else {
    params.push(version);
    change = `UPDATE v2_entities SET data=$5::jsonb,author=$6::jsonb,version=version+1,updated_at=NOW() WHERE id=$1 AND space_id=$2 AND version=$8 AND ${writePermission} RETURNING *`;
  }
  const { rows } = await db.query<Entity>(`WITH changed AS (${change}),
    blob AS (INSERT INTO v2_documents(entity_id,base64) SELECT id,$7::text FROM changed WHERE kind='documents' AND $7::text IS NOT NULL ON CONFLICT(entity_id) DO UPDATE SET base64=EXCLUDED.base64),
    audit AS (INSERT INTO v2_audit(space_id,actor_id,action,entity_id,version) SELECT space_id,$3,'entity.${version === undefined ? 'created' : 'updated'}',id,version FROM changed)
    SELECT ${entityColumns} FROM changed`, params);
  if (!rows[0]) throw new ApiError(409, 'CONFLICT', 'The record or permission changed. Refresh before trying again.');
  return entityOut(rows[0]);
}