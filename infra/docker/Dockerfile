FROM node:22-bookworm-slim AS builder

ARG LAWAND_APP

ENV CI=true \
    NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile
RUN if [ "$LAWAND_APP" = "gateway" ]; then \
      pnpm --filter @lawand/core build && \
      pnpm --filter @lawand/db build && \
      pnpm --filter @lawand/gateway build; \
    elif [ "$LAWAND_APP" = "homepage" ]; then \
      pnpm --filter @lawand/core build && \
      pnpm --filter @lawand/homepage build; \
    elif [ "$LAWAND_APP" = "erp" ]; then \
      pnpm --filter @lawand/core build && \
      pnpm --filter @lawand/erp build; \
    else \
      echo "지원하지 않는 LAWAND_APP 값입니다: $LAWAND_APP" >&2; \
      exit 64; \
    fi

FROM node:22-bookworm-slim AS runtime

ARG LAWAND_APP
ARG LAWAND_REVISION=unknown

LABEL com.lawand.app="${LAWAND_APP}" \
      org.opencontainers.image.revision="${LAWAND_REVISION}" \
      org.opencontainers.image.source="https://github.com/attorneychkim-ctrl/lawand"

ENV LAWAND_APP=${LAWAND_APP} \
    NODE_ENV=production \
    NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/aws-rds-global-bundle.pem \
    NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

WORKDIR /workspace

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl \
    && curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
      https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
      --output /usr/local/share/ca-certificates/aws-rds-global-bundle.pem \
    && test -s /usr/local/share/ca-certificates/aws-rds-global-bundle.pem \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@11.17.0 --activate

COPY --from=builder /workspace /workspace

ENTRYPOINT ["/workspace/infra/docker/start-app.sh"]
