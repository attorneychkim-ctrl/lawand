#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "usage: $0 <app> <release-id> <current-image-ref> <previous-image-id>" >&2
  exit 64
fi

APP="$1"
RELEASE_ID="$2"
CURRENT_IMAGE_REF="$3"
PREVIOUS_IMAGE_ID="$4"
LOG_PATH="/var/log/lawand/deployments.log"
RELEASE_ROOT="/opt/lawand/releases"
ROLLBACK_LIMIT=2

case "$APP" in
  homepage|erp|gateway) ;;
  *)
    echo "지원하지 않는 앱입니다: $APP" >&2
    exit 64
    ;;
esac

mkdir -p "$(dirname -- "$LOG_PATH")" "$RELEASE_ROOT"
AVAILABLE_BEFORE_BYTES="$(df --output=avail -B1 / | tail -n 1 | tr -d ' ')"
CURRENT_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$CURRENT_IMAGE_REF")"

declare -a CANDIDATE_IDS=()
declare -a PRESERVED_IDS=("$CURRENT_IMAGE_ID")

while IFS= read -r image_id; do
  [ -n "$image_id" ] || continue
  if [[ ! " ${CANDIDATE_IDS[*]} " =~ " ${image_id} " ]]; then
    CANDIDATE_IDS+=("$image_id")
  fi
done < <(
  {
    docker image ls --no-trunc --filter "label=com.lawand.app=${APP}" --format '{{.ID}}'
    docker image ls --no-trunc "lawand-${APP}" --format '{{.ID}}'
    docker image ls --no-trunc "lawand-${APP}-rollback" --format '{{.ID}}'
  } 2>/dev/null
)

if [ -n "$PREVIOUS_IMAGE_ID" ] && [ "$PREVIOUS_IMAGE_ID" != "$CURRENT_IMAGE_ID" ]; then
  PRESERVED_IDS+=("$PREVIOUS_IMAGE_ID")
fi

for image_id in "${CANDIDATE_IDS[@]}"; do
  [ "${#PRESERVED_IDS[@]}" -lt "$((ROLLBACK_LIMIT + 1))" ] || break
  if [[ ! " ${PRESERVED_IDS[*]} " =~ " ${image_id} " ]]; then
    PRESERVED_IDS+=("$image_id")
  fi
done

for image_id in "${PRESERVED_IDS[@]:1}"; do
  short_id="${image_id#sha256:}"
  docker image tag "$image_id" "lawand-${APP}-rollback:${short_id:0:12}" >/dev/null
done

for image_id in "${CANDIDATE_IDS[@]}"; do
  if [[ ! " ${PRESERVED_IDS[*]} " =~ " ${image_id} " ]]; then
    docker image rm --force "$image_id" >/dev/null 2>&1 || true
  fi
done

docker builder prune --force --keep-storage 4GB >/dev/null
docker image prune --force >/dev/null

mapfile -t RELEASE_DIRS < <(
  find "$RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d \
    -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-
)
if [ "${#RELEASE_DIRS[@]}" -gt 2 ]; then
  for release_dir in "${RELEASE_DIRS[@]:2}"; do
    case "$release_dir" in
      "$RELEASE_ROOT"/*) rm -rf -- "$release_dir" ;;
      *)
        echo "안전하지 않은 release 정리 경로입니다: $release_dir" >&2
        exit 65
        ;;
    esac
  done
fi

AVAILABLE_AFTER_BYTES="$(df --output=avail -B1 / | tail -n 1 | tr -d ' ')"
RECLAIMED_BYTES="$((AVAILABLE_AFTER_BYTES - AVAILABLE_BEFORE_BYTES))"
ROLLBACK_IMAGE_IDS="$(IFS=,; printf '%s' "${PRESERVED_IDS[*]:1}")"
RECORDED_AT="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"

printf '%s app=%s release=%s current_image_id=%s rollback_image_ids=%s available_before_bytes=%s available_after_bytes=%s reclaimed_bytes=%s\n' \
  "$RECORDED_AT" \
  "$APP" \
  "$RELEASE_ID" \
  "$CURRENT_IMAGE_ID" \
  "${ROLLBACK_IMAGE_IDS:-none}" \
  "$AVAILABLE_BEFORE_BYTES" \
  "$AVAILABLE_AFTER_BYTES" \
  "$RECLAIMED_BYTES" | tee -a "$LOG_PATH"
