#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [ "$#" -lt 7 ] || [ "$#" -gt 8 ]; then
  echo "usage: $0 <app> <secret-id> <eip> <artifact-bucket> <artifact-key> <release-id> <aws-region> [centrex-bridge-secret-ids-csv]" >&2
  exit 64
fi

APP="$1"
SECRET_ID="$2"
ELASTIC_IP="$3"
ARTIFACT_BUCKET="$4"
ARTIFACT_KEY="$5"
RELEASE_ID="$6"
AWS_REGION="$7"
CENTREX_BRIDGE_SECRET_IDS="${8:-}"
IMMUTABLE_IMAGE_REF="${LAWAND_IMMUTABLE_IMAGE_REF:-}"

case "$APP" in
  homepage)
    APP_PORT=3020
    HEALTH_PATH=/bank
    ;;
  erp)
    APP_PORT=3021
    HEALTH_PATH=/login
    ;;
  gateway)
    APP_PORT=3022
    HEALTH_PATH=/health
    ;;
  *)
    echo "지원하지 않는 앱입니다: $APP" >&2
    exit 64
    ;;
esac

RELEASE_DIR="/opt/lawand/releases/${RELEASE_ID}"
ARCHIVE_PATH="/opt/lawand/${RELEASE_ID}.tar.gz"
IMAGE_NAME="${IMMUTABLE_IMAGE_REF:-lawand-${APP}:${RELEASE_ID}}"
ENV_PATH="/etc/lawand/${APP}.env"
TEMPORARY_HOST="${ELASTIC_IP//./-}.sslip.io"
HOMEPAGE_PUBLIC_HOST='lawandfirm.com'
HOMEPAGE_LEGACY_ORIGIN='222.239.248.41'
ERP_PUBLIC_HOST='erp.lawandfirm.com'
GATEWAY_PUBLIC_HOST='api.lawandfirm.com'

mkdir -p /etc/lawand /var/lib/lawand-caddy/data /var/lib/lawand-caddy/config /var/log/lawand
chmod 700 /etc/lawand

PREVIOUS_IMAGE_ID="$(docker inspect --format '{{.Image}}' "lawand-${APP}" 2>/dev/null || true)"

if [ -n "$IMMUTABLE_IMAGE_REF" ]; then
  if ! [[ "$IMMUTABLE_IMAGE_REF" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/lawand-prod/${APP}@sha256:[0-9a-f]{64}$ ]]; then
    echo "앱과 일치하는 immutable ECR digest 참조가 필요합니다." >&2
    exit 64
  fi
  docker pull "$IMAGE_NAME"
else
  mkdir -p "$RELEASE_DIR"
  aws s3 cp "s3://${ARTIFACT_BUCKET}/${ARTIFACT_KEY}" "$ARCHIVE_PATH" --region "$AWS_REGION" --only-show-errors
  tar -xzf "$ARCHIVE_PATH" -C "$RELEASE_DIR"
fi

SECRET_JSON="$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" \
  --region "$AWS_REGION" \
  --query SecretString \
  --output text)"

umask 077
printf '%s' "$SECRET_JSON" | jq -r 'to_entries[] | "\(.key)=\(.value | tostring)"' > "$ENV_PATH"
unset SECRET_JSON

if [ "$APP" = "gateway" ] && [ -n "$CENTREX_BRIDGE_SECRET_IDS" ]; then
  BRIDGE_KEYS_JSON='{}'
  IFS=',' read -r -a BRIDGE_SECRET_ID_LIST <<< "$CENTREX_BRIDGE_SECRET_IDS"
  for CENTREX_BRIDGE_SECRET_ID in "${BRIDGE_SECRET_ID_LIST[@]}"; do
    if [[ ! "$CENTREX_BRIDGE_SECRET_ID" =~ ^lawand/[A-Za-z0-9/_-]{3,180}$ ]]; then
      echo "invalid Centrex bridge secret ID" >&2
      exit 64
    fi
    BRIDGE_SECRET_JSON="$(aws secretsmanager get-secret-value \
      --secret-id "$CENTREX_BRIDGE_SECRET_ID" \
      --region "$AWS_REGION" \
      --query SecretString \
      --output text)"
    NORMALIZED_BRIDGE_KEYS="$(printf '%s' "$BRIDGE_SECRET_JSON" | jq -ce '
      def single:
        {(.bridgeId): (
          {endpointId: .endpointId, secret: .secret} +
          (if .staffUserId then {staffUserId: .staffUserId} else {} end)
        )};
      def valid_entry:
        (.key | test("^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$")) and
        (.value | type == "object") and
        (.value.endpointId | type == "string" and
          test("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")) and
        (.value.secret | type == "string" and test("^[A-Za-z0-9+/_-]{43}=?$")) and
        ((.value | has("staffUserId") | not) or
          (.value.staffUserId | type == "string" and
            test("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")));
      (if has("bridgeId") then single
       elif has("bridges") then .bridges
       else . end) as $keys |
      if ($keys | type) != "object" or ($keys | length) == 0 or
        ([$keys | to_entries[] | valid_entry] | all) != true
      then error("invalid Centrex bridge registry")
      else $keys end
    ')"
    DUPLICATE_BRIDGE_COUNT="$(jq -nr \
      --argjson current "$BRIDGE_KEYS_JSON" \
      --argjson next "$NORMALIZED_BRIDGE_KEYS" \
      '[(($current | keys) - (($current | keys) - ($next | keys)))[]] | length')"
    if [ "$DUPLICATE_BRIDGE_COUNT" -ne 0 ]; then
      echo "duplicate Centrex bridge ID across secrets" >&2
      exit 65
    fi
    BRIDGE_KEYS_JSON="$(jq -cn \
      --argjson current "$BRIDGE_KEYS_JSON" \
      --argjson next "$NORMALIZED_BRIDGE_KEYS" \
      '$current + $next')"
    unset BRIDGE_SECRET_JSON NORMALIZED_BRIDGE_KEYS DUPLICATE_BRIDGE_COUNT
  done
  printf 'LAWAND_CENTREX_BRIDGE_KEYS_JSON=%s\n' "$BRIDGE_KEYS_JSON" >> "$ENV_PATH"
  unset BRIDGE_KEYS_JSON CENTREX_BRIDGE_SECRET_ID_LIST CENTREX_BRIDGE_SECRET_ID
fi

printf 'NODE_ENV=production\nPORT=%s\nHOST=0.0.0.0\n' "$APP_PORT" >> "$ENV_PATH"
chmod 600 "$ENV_PATH"

if [ -z "$IMMUTABLE_IMAGE_REF" ]; then
  docker build \
    --build-arg "LAWAND_APP=${APP}" \
    --build-arg "LAWAND_REVISION=${RELEASE_ID}" \
    --file "$RELEASE_DIR/infra/docker/Dockerfile" \
    --tag "$IMAGE_NAME" \
    "$RELEASE_DIR"
fi

IMAGE_ARCHITECTURE="$(docker image inspect --format '{{.Architecture}}' "$IMAGE_NAME")"
if [ "$IMAGE_ARCHITECTURE" != "arm64" ]; then
  echo "운영 이미지는 arm64여야 합니다: ${IMAGE_ARCHITECTURE}" >&2
  exit 65
fi

install -d -m 0755 /etc/lawand/caddy
if [ "$APP" = "gateway" ]; then
  printf ':80 {\n  @centrex_ring path /v1/centrex-ring/*.html\n  handle @centrex_ring {\n    reverse_proxy 127.0.0.1:%s\n  }\n  handle {\n    redir https://%s{uri} permanent\n  }\n}\n\n%s {\n  encode zstd gzip\n  reverse_proxy 127.0.0.1:%s\n}\n\n%s {\n  encode zstd gzip\n  reverse_proxy 127.0.0.1:%s\n}\n' \
    "$APP_PORT" "$GATEWAY_PUBLIC_HOST" "$TEMPORARY_HOST" "$APP_PORT" \
    "$GATEWAY_PUBLIC_HOST" "$APP_PORT" > /etc/lawand/caddy/Caddyfile
elif [ "$APP" = "homepage" ]; then
  printf 'http://%s {\n  redir https://%s{uri} permanent\n}\n\n%s {\n  encode zstd gzip\n  reverse_proxy 127.0.0.1:%s\n}\n\n%s {\n  encode zstd gzip\n\n  @lawand_new path / /bank* /about* /people* /privacy* /terms* /api* /_next* /images* /icon.svg /robots.txt /sitemap.xml\n  handle @lawand_new {\n    reverse_proxy 127.0.0.1:%s\n  }\n\n  handle {\n    reverse_proxy https://%s {\n      header_up Host %s\n      transport http {\n        tls_server_name %s\n      }\n    }\n  }\n}\n\nwww.%s {\n  redir https://%s{uri} permanent\n}\n' \
    "$ELASTIC_IP" "$TEMPORARY_HOST" "$TEMPORARY_HOST" "$APP_PORT" \
    "$HOMEPAGE_PUBLIC_HOST" "$APP_PORT" "$HOMEPAGE_LEGACY_ORIGIN" \
    "$HOMEPAGE_PUBLIC_HOST" "$HOMEPAGE_PUBLIC_HOST" \
    "$HOMEPAGE_PUBLIC_HOST" "$HOMEPAGE_PUBLIC_HOST" > /etc/lawand/caddy/Caddyfile
else
  printf 'http://%s {\n  redir https://%s{uri} permanent\n}\n\n%s {\n  encode zstd gzip\n  reverse_proxy 127.0.0.1:%s\n}\n\n%s {\n  encode zstd gzip\n  reverse_proxy 127.0.0.1:%s\n}\n' \
    "$ELASTIC_IP" "$TEMPORARY_HOST" "$TEMPORARY_HOST" "$APP_PORT" \
    "$ERP_PUBLIC_HOST" "$APP_PORT" > /etc/lawand/caddy/Caddyfile
fi

printf '%s\n' \
  '[Unit]' \
  "Description=Lawand ${APP} application container" \
  'After=docker.service network-online.target' \
  'Wants=network-online.target' \
  'Requires=docker.service' \
  '' \
  '[Service]' \
  'Type=simple' \
  "ExecStartPre=-/usr/bin/docker rm -f lawand-${APP}" \
  "ExecStart=/usr/bin/docker run --name lawand-${APP} --network host --env-file ${ENV_PATH} ${IMAGE_NAME}" \
  "ExecStop=/usr/bin/docker stop -t 30 lawand-${APP}" \
  'Restart=always' \
  'RestartSec=5' \
  'SuccessExitStatus=143' \
  'TimeoutStartSec=0' \
  'TimeoutStopSec=45' \
  '' \
  '[Install]' \
  'WantedBy=multi-user.target' > "/etc/systemd/system/lawand-${APP}.service"

printf '%s\n' \
  '[Unit]' \
  'Description=Lawand Caddy HTTPS edge' \
  'After=docker.service network-online.target' \
  'Wants=network-online.target' \
  'Requires=docker.service' \
  '' \
  '[Service]' \
  'Type=simple' \
  'ExecStartPre=-/usr/bin/docker rm -f lawand-caddy' \
  'ExecStartPre=/usr/bin/docker pull caddy:2-alpine' \
  'ExecStart=/usr/bin/docker run --name lawand-caddy --network host -v /etc/lawand/caddy/Caddyfile:/etc/caddy/Caddyfile:ro -v /var/lib/lawand-caddy/data:/data -v /var/lib/lawand-caddy/config:/config caddy:2-alpine' \
  'ExecStop=/usr/bin/docker stop -t 30 lawand-caddy' \
  'Restart=always' \
  'RestartSec=5' \
  'TimeoutStartSec=0' \
  'TimeoutStopSec=45' \
  '' \
  '[Install]' \
  'WantedBy=multi-user.target' > /etc/systemd/system/lawand-caddy.service

systemctl daemon-reload
systemctl enable "lawand-${APP}.service" lawand-caddy.service
systemctl restart "lawand-${APP}.service"

for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}${HEALTH_PATH}" >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    journalctl -u "lawand-${APP}.service" --no-pager -n 100
    exit 1
  fi
  sleep 2
done

systemctl restart lawand-caddy.service

for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error "http://${ELASTIC_IP}${HEALTH_PATH}" >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    journalctl -u lawand-caddy.service --no-pager -n 100
    exit 1
  fi
  sleep 2
done

if [ -z "$IMMUTABLE_IMAGE_REF" ]; then
  rm -f -- "$ARCHIVE_PATH"
fi

"${SCRIPT_DIR}/post-deploy-cleanup.sh" \
  "$APP" \
  "$RELEASE_ID" \
  "$IMAGE_NAME" \
  "$PREVIOUS_IMAGE_ID"

echo "deployed app=${APP} release=${RELEASE_ID} image=${IMAGE_NAME} https_host=${TEMPORARY_HOST}"
