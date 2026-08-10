#!/usr/bin/env bash
set -euo pipefail

case "${LAWAND_APP:-}" in
  homepage)
    cd /workspace/apps/homepage
    exec node node_modules/next/dist/bin/next start \
      --hostname "${HOST:-0.0.0.0}" \
      --port "${PORT:-3020}"
    ;;
  erp)
    cd /workspace/apps/erp
    exec node node_modules/next/dist/bin/next start \
      --hostname "${HOST:-0.0.0.0}" \
      --port "${PORT:-3021}"
    ;;
  gateway)
    cd /workspace/apps/gateway
    exec node dist/server.js
    ;;
  *)
    echo "지원하지 않는 LAWAND_APP 값입니다: ${LAWAND_APP:-<empty>}" >&2
    exit 64
    ;;
esac
