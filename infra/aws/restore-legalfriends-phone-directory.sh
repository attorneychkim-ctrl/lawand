#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 10 ]; then
  echo "usage: $0 <artifact-bucket> <artifact-key> <sha256> <aws-region> <db-endpoint> <db-name> <database-secret-id> <expected-members> <expected-cases> <expected-clients>" >&2
  exit 64
fi

ARTIFACT_BUCKET="$1"
ARTIFACT_KEY="$2"
EXPECTED_SHA256="$3"
AWS_REGION="$4"
DB_ENDPOINT="$5"
DB_NAME="$6"
DATABASE_SECRET_ID="$7"
EXPECTED_MEMBERS="$8"
EXPECTED_CASES="$9"
EXPECTED_CLIENTS="${10}"

if ! [[ "$EXPECTED_SHA256" =~ ^[a-f0-9]{64}$ ]]; then
  echo "SHA-256 형식이 올바르지 않습니다." >&2
  exit 65
fi
for count in "$EXPECTED_MEMBERS" "$EXPECTED_CASES" "$EXPECTED_CLIENTS"; do
  if ! [[ "$count" =~ ^[0-9]+$ ]]; then
    echo "예상 행 수 형식이 올바르지 않습니다." >&2
    exit 65
  fi
done

WORK_DIR="$(mktemp -d /opt/lawand/phone-directory-restore.XXXXXX)"
trap 'rm -rf -- "$WORK_DIR"' EXIT
chmod 700 "$WORK_DIR"

DUMP_PATH="$WORK_DIR/phone-directory.dump"
RDS_CA_PATH="$WORK_DIR/aws-rds-global-bundle.pem"
MIGRATOR_ENV_PATH="$WORK_DIR/migrator.env"

aws s3 cp \
  "s3://${ARTIFACT_BUCKET}/${ARTIFACT_KEY}" \
  "$DUMP_PATH" \
  --region "$AWS_REGION" \
  --only-show-errors
chmod 600 "$DUMP_PATH"

ACTUAL_SHA256="$(sha256sum "$DUMP_PATH" | awk '{print $1}')"
if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
  echo "운영 이관 아티팩트 SHA-256이 일치하지 않습니다." >&2
  exit 66
fi

curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
  --output "$RDS_CA_PATH"
test -s "$RDS_CA_PATH"
chmod 644 "$RDS_CA_PATH"

DATABASE_SECRET_JSON="$(aws secretsmanager get-secret-value \
  --secret-id "$DATABASE_SECRET_ID" \
  --region "$AWS_REGION" \
  --query SecretString \
  --output text)"
MIGRATOR_USER="$(printf '%s' "$DATABASE_SECRET_JSON" | jq -r .migratorUsername)"
MIGRATOR_PASSWORD="$(printf '%s' "$DATABASE_SECRET_JSON" | jq -r .migratorPassword)"
unset DATABASE_SECRET_JSON

if ! [[ "$MIGRATOR_USER" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "운영 DB migration 역할 형식이 올바르지 않습니다." >&2
  exit 65
fi
printf 'PGPASSWORD=%s\n' "$MIGRATOR_PASSWORD" > "$MIGRATOR_ENV_PATH"
chmod 600 "$MIGRATOR_ENV_PATH"
unset MIGRATOR_PASSWORD

if ! docker image inspect postgres:16-alpine >/dev/null 2>&1; then
  docker pull postgres:16-alpine >/dev/null
fi

DB_CONNECTION="host=${DB_ENDPOINT} port=5432 dbname=${DB_NAME} user=${MIGRATOR_USER} sslmode=verify-full sslrootcert=/work/aws-rds-global-bundle.pem"

EXISTING_TABLES="$(docker run --rm \
  --env-file "$MIGRATOR_ENV_PATH" \
  --volume "$RDS_CA_PATH:/work/aws-rds-global-bundle.pem:ro" \
  postgres:16-alpine \
  psql "$DB_CONNECTION" \
  --set=ON_ERROR_STOP=1 \
  --tuples-only \
  --no-align \
  --command="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='CB' AND table_name IN ('TblMember','TblCase','TblCSClient');")"

if [ "$EXISTING_TABLES" -ne 0 ]; then
  echo "운영 전화 디렉터리 대상 테이블이 이미 있어 복원을 중단합니다." >&2
  exit 67
fi

docker run --rm \
  --env-file "$MIGRATOR_ENV_PATH" \
  --volume "$RDS_CA_PATH:/work/aws-rds-global-bundle.pem:ro" \
  --volume "$DUMP_PATH:/work/phone-directory.dump:ro" \
  postgres:16-alpine \
  pg_restore \
  --dbname="$DB_CONNECTION" \
  --single-transaction \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  /work/phone-directory.dump >/dev/null

VERIFY_JSON="$(docker run --rm \
  --env-file "$MIGRATOR_ENV_PATH" \
  --volume "$RDS_CA_PATH:/work/aws-rds-global-bundle.pem:ro" \
  postgres:16-alpine \
  psql "$DB_CONNECTION" \
  --set=ON_ERROR_STOP=1 \
  --tuples-only \
  --no-align \
  --command="WITH member_refs AS (
    SELECT \"Member_idx\" AS member_idx FROM \"CB\".\"TblCase\"
    UNION SELECT \"sub_member_idx\" FROM \"CB\".\"TblCase\" WHERE \"sub_member_idx\" IS NOT NULL
    UNION SELECT \"sub_member2_idx\" FROM \"CB\".\"TblCase\" WHERE \"sub_member2_idx\" IS NOT NULL
  ) SELECT json_build_object(
    'members', (SELECT COUNT(*) FROM \"CB\".\"TblMember\"),
    'cases', (SELECT COUNT(*) FROM \"CB\".\"TblCase\"),
    'clients', (SELECT COUNT(*) FROM \"CB\".\"TblCSClient\"),
    'casesWithoutClient', (SELECT COUNT(*) FROM \"CB\".\"TblCase\" c LEFT JOIN \"CB\".\"TblCSClient\" s ON s.\"Case_idx\"=c.idx WHERE s.idx IS NULL),
    'clientsWithoutCase', (SELECT COUNT(*) FROM \"CB\".\"TblCSClient\" s LEFT JOIN \"CB\".\"TblCase\" c ON c.idx=s.\"Case_idx\" WHERE c.idx IS NULL),
    'unresolvedMemberRefs', (SELECT COUNT(*) FROM member_refs r LEFT JOIN \"CB\".\"TblMember\" m ON m.idx=r.member_idx WHERE m.idx IS NULL),
    'invalidPhoneSearch', (SELECT COUNT(*) FROM \"CB\".\"TblCSClient\" WHERE phone_search IS DISTINCT FROM CASE WHEN phone IS NULL THEN NULL ELSE regexp_replace(phone, '[^0-9]', '', 'g') END),
    'foreignOfficeCases', (SELECT COUNT(*) FROM \"CB\".\"TblCase\" WHERE \"Office_idx\"<>56),
    'foreignOfficeMembers', (SELECT COUNT(*) FROM \"CB\".\"TblMember\" WHERE \"Office_idx\"<>56)
  );")"

printf '%s' "$VERIFY_JSON" | jq -e \
  --argjson members "$EXPECTED_MEMBERS" \
  --argjson cases "$EXPECTED_CASES" \
  --argjson clients "$EXPECTED_CLIENTS" \
  '.members == $members and
   .cases == $cases and
   .clients == $clients and
   .casesWithoutClient == 0 and
   .clientsWithoutCase == 0 and
   .invalidPhoneSearch == 0 and
   .foreignOfficeCases == 0 and
   .foreignOfficeMembers == 0' >/dev/null

docker run --rm \
  --env-file "$MIGRATOR_ENV_PATH" \
  --volume "$RDS_CA_PATH:/work/aws-rds-global-bundle.pem:ro" \
  postgres:16-alpine \
  psql "$DB_CONNECTION" \
  --set=ON_ERROR_STOP=1 \
  --command='REVOKE ALL ON SCHEMA "CB" FROM PUBLIC, lawand_app;
    GRANT USAGE ON SCHEMA "CB" TO lawand_viewer;
    REVOKE ALL ON TABLE "CB"."TblMember", "CB"."TblCase", "CB"."TblCSClient" FROM PUBLIC, lawand_app;
    GRANT SELECT ON TABLE "CB"."TblMember", "CB"."TblCase", "CB"."TblCSClient" TO lawand_viewer;' >/dev/null

PERMISSION_JSON="$(docker run --rm \
  --env-file "$MIGRATOR_ENV_PATH" \
  --volume "$RDS_CA_PATH:/work/aws-rds-global-bundle.pem:ro" \
  postgres:16-alpine \
  psql "$DB_CONNECTION" \
  --set=ON_ERROR_STOP=1 \
  --tuples-only \
  --no-align \
  --command="SELECT json_build_object(
    'allOwnedByMigrator', (SELECT bool_and(pg_get_userbyid(c.relowner)='lawand_migrator') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='CB' AND c.relname IN ('TblMember','TblCase','TblCSClient') AND c.relkind='r'),
    'appSchemaUsage', has_schema_privilege('lawand_app','CB','USAGE'),
    'appClientSelect', has_table_privilege('lawand_app','\"CB\".\"TblCSClient\"','SELECT'),
    'viewerClientSelect', has_table_privilege('lawand_viewer','\"CB\".\"TblCSClient\"','SELECT'),
    'viewerClientWrite', has_table_privilege('lawand_viewer','\"CB\".\"TblCSClient\"','INSERT,UPDATE,DELETE')
  );")"

printf '%s' "$PERMISSION_JSON" | jq -e '
  .allOwnedByMigrator == true and
  .appSchemaUsage == false and
  .appClientSelect == false and
  .viewerClientSelect == true and
  .viewerClientWrite == false' >/dev/null

printf '%s\n' "$(jq -cn \
  --arg sha256 "$ACTUAL_SHA256" \
  --argjson verification "$VERIFY_JSON" \
  --argjson permissions "$PERMISSION_JSON" \
  '{sha256:$sha256, verification:$verification, permissions:$permissions}')"
