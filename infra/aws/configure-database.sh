#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 8 ]; then
  echo "usage: $0 <db-endpoint> <master-secret-arn> <database-secret-id> <artifact-bucket> <seed-key> <gateway-image> <aws-region> <database-name>" >&2
  exit 64
fi

DB_ENDPOINT="$1"
MASTER_SECRET_ARN="$2"
DATABASE_SECRET_ID="$3"
ARTIFACT_BUCKET="$4"
SEED_KEY="$5"
GATEWAY_IMAGE="$6"
AWS_REGION="$7"
DATABASE_NAME="$8"

WORK_DIR="$(mktemp -d /opt/lawand/database-setup.XXXXXX)"
trap 'rm -rf -- "$WORK_DIR"' EXIT
chmod 700 "$WORK_DIR"

RDS_CA_PATH="$WORK_DIR/aws-rds-global-bundle.pem"
curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
  --output "$RDS_CA_PATH"
test -s "$RDS_CA_PATH"
chmod 644 "$RDS_CA_PATH"

MASTER_SECRET_JSON="$(aws secretsmanager get-secret-value \
  --secret-id "$MASTER_SECRET_ARN" \
  --region "$AWS_REGION" \
  --query SecretString \
  --output text)"
DATABASE_SECRET_JSON="$(aws secretsmanager get-secret-value \
  --secret-id "$DATABASE_SECRET_ID" \
  --region "$AWS_REGION" \
  --query SecretString \
  --output text)"

MASTER_USER="$(printf '%s' "$MASTER_SECRET_JSON" | jq -r .username)"
MASTER_PASSWORD="$(printf '%s' "$MASTER_SECRET_JSON" | jq -r .password)"
MIGRATOR_USER="$(printf '%s' "$DATABASE_SECRET_JSON" | jq -r .migratorUsername)"
MIGRATOR_PASSWORD="$(printf '%s' "$DATABASE_SECRET_JSON" | jq -r .migratorPassword)"
APP_USER="$(printf '%s' "$DATABASE_SECRET_JSON" | jq -r .appUsername)"
APP_PASSWORD="$(printf '%s' "$DATABASE_SECRET_JSON" | jq -r .appPassword)"
VIEWER_USER="$(printf '%s' "$DATABASE_SECRET_JSON" | jq -r .viewerUsername)"
VIEWER_PASSWORD="$(printf '%s' "$DATABASE_SECRET_JSON" | jq -r .viewerPassword)"
MIGRATION_DATABASE_URL="$(printf '%s' "$DATABASE_SECRET_JSON" | jq -r .migrationDatabaseUrl)"

unset MASTER_SECRET_JSON DATABASE_SECRET_JSON

for value in "$MIGRATOR_USER" "$MIGRATOR_PASSWORD" "$APP_USER" "$APP_PASSWORD" "$VIEWER_USER" "$VIEWER_PASSWORD"; do
  if ! [[ "$value" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "운영 DB 역할 또는 비밀번호 형식이 안전 기준과 맞지 않습니다." >&2
    exit 65
  fi
done

printf 'PGPASSWORD=%s\n' "$MASTER_PASSWORD" > "$WORK_DIR/master.env"
chmod 600 "$WORK_DIR/master.env"

printf '%s\n' \
  "DO \$roles\$" \
  'BEGIN' \
  "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${MIGRATOR_USER}') THEN" \
  "    CREATE ROLE ${MIGRATOR_USER} LOGIN PASSWORD '${MIGRATOR_PASSWORD}';" \
  '  ELSE' \
  "    ALTER ROLE ${MIGRATOR_USER} PASSWORD '${MIGRATOR_PASSWORD}';" \
  '  END IF;' \
  "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_USER}') THEN" \
  "    CREATE ROLE ${APP_USER} LOGIN PASSWORD '${APP_PASSWORD}';" \
  '  ELSE' \
  "    ALTER ROLE ${APP_USER} PASSWORD '${APP_PASSWORD}';" \
  '  END IF;' \
  "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${VIEWER_USER}') THEN" \
  "    CREATE ROLE ${VIEWER_USER} LOGIN PASSWORD '${VIEWER_PASSWORD}';" \
  '  ELSE' \
  "    ALTER ROLE ${VIEWER_USER} PASSWORD '${VIEWER_PASSWORD}';" \
  '  END IF;' \
  'END' \
  '$roles$;' \
  "REVOKE CREATE ON SCHEMA public FROM PUBLIC;" \
  "GRANT USAGE, CREATE ON SCHEMA public TO ${MIGRATOR_USER};" \
  "GRANT USAGE ON SCHEMA public TO ${APP_USER}, ${VIEWER_USER};" \
  "CREATE SCHEMA IF NOT EXISTS \"CB\" AUTHORIZATION ${MIGRATOR_USER};" \
  'REVOKE ALL ON SCHEMA "CB" FROM PUBLIC;' \
  "GRANT USAGE, CREATE ON SCHEMA \"CB\" TO ${MIGRATOR_USER};" \
  "GRANT USAGE ON SCHEMA \"CB\" TO ${VIEWER_USER};" \
  "GRANT CONNECT ON DATABASE ${DATABASE_NAME} TO ${MIGRATOR_USER}, ${APP_USER}, ${VIEWER_USER};" \
  "GRANT CREATE ON DATABASE ${DATABASE_NAME} TO ${MIGRATOR_USER};" \
  "ALTER DATABASE ${DATABASE_NAME} SET timezone TO 'Asia/Seoul';" > "$WORK_DIR/roles.sql"
chmod 600 "$WORK_DIR/roles.sql"

docker pull postgres:16-alpine >/dev/null
docker run --rm \
  --env-file "$WORK_DIR/master.env" \
  --volume "$RDS_CA_PATH:/work/aws-rds-global-bundle.pem:ro" \
  --volume "$WORK_DIR/roles.sql:/work/roles.sql:ro" \
  postgres:16-alpine \
  psql "host=${DB_ENDPOINT} port=5432 dbname=${DATABASE_NAME} user=${MASTER_USER} sslmode=verify-full sslrootcert=/work/aws-rds-global-bundle.pem" \
  --set=ON_ERROR_STOP=1 \
  --file=/work/roles.sql >/dev/null

docker run --rm \
  --env "DATABASE_URL=${MIGRATION_DATABASE_URL}" \
  --entrypoint /bin/bash \
  "$GATEWAY_IMAGE" \
  -lc 'pnpm --filter @lawand/db migrate'

printf '%s\n' \
  'REVOKE ALL ON SCHEMA public FROM PUBLIC;' \
  "GRANT USAGE ON SCHEMA public TO ${APP_USER}, ${VIEWER_USER};" \
  "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_USER};" \
  "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_USER};" \
  "GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${VIEWER_USER};" \
  "REVOKE ALL ON TABLE telephony_endpoint_credentials FROM PUBLIC, ${VIEWER_USER};" \
  "REVOKE ALL ON SCHEMA \"CB\" FROM PUBLIC, ${APP_USER};" \
  "REVOKE ALL ON ALL TABLES IN SCHEMA \"CB\" FROM PUBLIC, ${APP_USER};" \
  "GRANT USAGE ON SCHEMA \"CB\" TO ${VIEWER_USER};" \
  "GRANT SELECT ON ALL TABLES IN SCHEMA \"CB\" TO ${VIEWER_USER};" \
  "REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public_case_studies FROM ${APP_USER};" \
  "GRANT SELECT ON TABLE public_case_studies TO ${APP_USER};" \
  "ALTER ROLE ${VIEWER_USER} IN DATABASE ${DATABASE_NAME} SET default_transaction_read_only TO on;" > "$WORK_DIR/permissions.sql"
chmod 600 "$WORK_DIR/permissions.sql"

docker run --rm \
  --env-file "$WORK_DIR/master.env" \
  --volume "$RDS_CA_PATH:/work/aws-rds-global-bundle.pem:ro" \
  --volume "$WORK_DIR/permissions.sql:/work/permissions.sql:ro" \
  postgres:16-alpine \
  psql "host=${DB_ENDPOINT} port=5432 dbname=${DATABASE_NAME} user=${MASTER_USER} sslmode=verify-full sslrootcert=/work/aws-rds-global-bundle.pem" \
  --set=ON_ERROR_STOP=1 \
  --file=/work/permissions.sql >/dev/null

printf 'PGPASSWORD=%s\n' "$MIGRATOR_PASSWORD" > "$WORK_DIR/migrator.env"
chmod 600 "$WORK_DIR/migrator.env"

printf '%s\n' \
  "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_USER};" \
  "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP_USER};" \
  "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${VIEWER_USER};" \
  "ALTER DEFAULT PRIVILEGES IN SCHEMA \"CB\" GRANT SELECT ON TABLES TO ${VIEWER_USER};" > "$WORK_DIR/default-privileges.sql"
chmod 600 "$WORK_DIR/default-privileges.sql"

docker run --rm \
  --env-file "$WORK_DIR/migrator.env" \
  --volume "$RDS_CA_PATH:/work/aws-rds-global-bundle.pem:ro" \
  --volume "$WORK_DIR/default-privileges.sql:/work/default-privileges.sql:ro" \
  postgres:16-alpine \
  psql "host=${DB_ENDPOINT} port=5432 dbname=${DATABASE_NAME} user=${MIGRATOR_USER} sslmode=verify-full sslrootcert=/work/aws-rds-global-bundle.pem" \
  --set=ON_ERROR_STOP=1 \
  --file=/work/default-privileges.sql >/dev/null

EXISTING_SEED_ROWS="$(docker run --rm \
  --env-file "$WORK_DIR/master.env" \
  --volume "$RDS_CA_PATH:/work/aws-rds-global-bundle.pem:ro" \
  postgres:16-alpine \
  psql "host=${DB_ENDPOINT} port=5432 dbname=${DATABASE_NAME} user=${MASTER_USER} sslmode=verify-full sslrootcert=/work/aws-rds-global-bundle.pem" \
  --set=ON_ERROR_STOP=1 \
  --tuples-only \
  --no-align \
  --command="SELECT
    (SELECT count(*) FROM staff_users)
    + (SELECT count(*) FROM customer_reviews)
    + (SELECT count(*) FROM self_diagnosis_case_profiles)
    + (SELECT count(*) FROM public_case_studies);")"

if [ "$EXISTING_SEED_ROWS" -ne 0 ]; then
  echo "운영 DB 선별 데이터가 이미 존재해 초기 seed 복원을 중단합니다." >&2
  exit 67
fi

aws s3 cp "s3://${ARTIFACT_BUCKET}/${SEED_KEY}" "$WORK_DIR/seed.dump" --region "$AWS_REGION" --only-show-errors

RESTORE_TABLES=(
  staff_users
  staff_profiles
  staff_memberships
  staff_external_accounts
  review_import_batches
  customer_reviews
  self_diagnosis_case_profiles
  public_case_studies
  naver_booking_mailbox_checkpoints
)

for table in "${RESTORE_TABLES[@]}"; do
  docker run --rm \
    --env-file "$WORK_DIR/migrator.env" \
    --volume "$RDS_CA_PATH:/work/aws-rds-global-bundle.pem:ro" \
    --volume "$WORK_DIR/seed.dump:/work/seed.dump:ro" \
    postgres:16-alpine \
    pg_restore \
    --dbname="host=${DB_ENDPOINT} port=5432 dbname=${DATABASE_NAME} user=${MIGRATOR_USER} sslmode=verify-full sslrootcert=/work/aws-rds-global-bundle.pem" \
    --data-only \
    --no-owner \
    --no-privileges \
    --exit-on-error \
    --table="${table}" \
    /work/seed.dump
done

VERIFY_OUTPUT="$(docker run --rm \
  --env-file "$WORK_DIR/master.env" \
  --volume "$RDS_CA_PATH:/work/aws-rds-global-bundle.pem:ro" \
  postgres:16-alpine \
  psql "host=${DB_ENDPOINT} port=5432 dbname=${DATABASE_NAME} user=${MASTER_USER} sslmode=verify-full sslrootcert=/work/aws-rds-global-bundle.pem" \
  --set=ON_ERROR_STOP=1 \
  --tuples-only \
  --no-align \
  --command="SELECT 'staff_users=' || count(*) FROM staff_users
             UNION ALL SELECT 'customer_reviews=' || count(*) FROM customer_reviews
             UNION ALL SELECT 'self_diagnosis_case_profiles=' || count(*) FROM self_diagnosis_case_profiles
             UNION ALL SELECT 'public_case_studies=' || count(*) FROM public_case_studies
             UNION ALL SELECT 'consultations=' || count(*) FROM consultations
             ORDER BY 1;")"

printf '%s\n' "$VERIFY_OUTPUT"

EXPECTED_COUNTS=(
  consultations=0
  customer_reviews=3403
  public_case_studies=3
  self_diagnosis_case_profiles=1759
  staff_users=1
)

for expected in "${EXPECTED_COUNTS[@]}"; do
  if ! grep -Fqx -- "$expected" <<< "$VERIFY_OUTPUT"; then
    echo "운영 DB 선별 데이터 검증 실패: expected ${expected}" >&2
    exit 66
  fi
done

unset MASTER_PASSWORD MIGRATOR_PASSWORD APP_PASSWORD VIEWER_PASSWORD MIGRATION_DATABASE_URL VERIFY_OUTPUT EXISTING_SEED_ROWS
echo "production database configured"
