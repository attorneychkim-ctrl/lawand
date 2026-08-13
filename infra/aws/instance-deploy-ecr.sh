#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 6 ] || [ "$#" -gt 7 ]; then
  echo "usage: $0 <app> <secret-id> <eip> <immutable-image-ref> <release-id> <aws-region> [centrex-bridge-secret-ids-csv]" >&2
  exit 64
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP="$1"
SECRET_ID="$2"
ELASTIC_IP="$3"
IMAGE_REF="$4"
RELEASE_ID="$5"
AWS_REGION="$6"
CENTREX_BRIDGE_SECRET_IDS="${7:-}"

case "$APP" in
  homepage|erp|gateway) ;;
  *)
    echo "지원하지 않는 앱입니다: $APP" >&2
    exit 64
    ;;
esac

if ! [[ "$IMAGE_REF" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/lawand-prod/${APP}@sha256:[0-9a-f]{64}$ ]]; then
  echo "태그가 아닌 앱별 ECR digest 참조가 필요합니다." >&2
  exit 64
fi

REGISTRY="${IMAGE_REF%%/*}"
DOCKER_CONFIG_DIR="$(mktemp -d /run/lawand-ecr-login.XXXXXX)"
trap 'rm -rf -- "$DOCKER_CONFIG_DIR"' EXIT
export DOCKER_CONFIG="$DOCKER_CONFIG_DIR"
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "$REGISTRY" >/dev/null

LAWAND_IMMUTABLE_IMAGE_REF="$IMAGE_REF" \
  "${SCRIPT_DIR}/instance-deploy.sh" \
  "$APP" \
  "$SECRET_ID" \
  "$ELASTIC_IP" \
  immutable-ecr \
  immutable-ecr \
  "$RELEASE_ID" \
  "$AWS_REGION" \
  "$CENTREX_BRIDGE_SECRET_IDS"
