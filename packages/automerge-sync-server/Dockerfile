FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS dependencies
ARG TARGETPLATFORM
RUN test "$TARGETPLATFORM" = "linux/amd64"
WORKDIR /srv/orbit
ENV NODE_ENV=production
COPY package.json bun.lockb ./
COPY packages/anki-import/package.json packages/anki-import/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/app/package.json packages/app/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/docs/package.json packages/docs/package.json
COPY packages/embedded-support/package.json packages/embedded-support/package.json
COPY packages/ingester/package.json packages/ingester/package.json
COPY packages/interpreter/package.json packages/interpreter/package.json
COPY packages/sample-data/package.json packages/sample-data/package.json
COPY packages/store-automerge/package.json packages/store-automerge/package.json
COPY packages/store-fs/package.json packages/store-fs/package.json
COPY packages/store-shared/package.json packages/store-shared/package.json
COPY packages/store-web/package.json packages/store-web/package.json
COPY packages/sync/package.json packages/sync/package.json
COPY packages/web-component/package.json packages/web-component/package.json
COPY packages/automerge-sync-server/package.json packages/automerge-sync-server/package.json
RUN npm install -g bun@1.3.14 && bun install --frozen-lockfile --production --filter=@withorbit/automerge-sync-server

FROM dependencies AS build
ENV NODE_ENV=development
RUN bun install --frozen-lockfile
COPY packages/tsconfig.base.json packages/tsconfig.base.json
COPY packages/api/tsconfig.json packages/api/tsconfig.json
COPY packages/api/src packages/api/src
COPY packages/core/tsconfig.json packages/core/tsconfig.json
COPY packages/core/src packages/core/src
COPY packages/sample-data/tsconfig.json packages/sample-data/tsconfig.json
COPY packages/sample-data/src packages/sample-data/src
COPY packages/store-automerge/tsconfig.json packages/store-automerge/tsconfig.json
COPY packages/store-automerge/src packages/store-automerge/src
COPY packages/store-shared/tsconfig.json packages/store-shared/tsconfig.json
COPY packages/store-shared/src packages/store-shared/src
COPY packages/automerge-sync-server/tsconfig.json packages/automerge-sync-server/tsconfig.json
COPY packages/automerge-sync-server/src packages/automerge-sync-server/src
RUN node node_modules/@typescript/native/bin/tsc -b packages/sample-data/tsconfig.json
RUN node node_modules/@typescript/native/bin/tsc -b packages/automerge-sync-server/tsconfig.json

FROM gcr.io/distroless/nodejs22-debian13:nonroot@sha256:7b0a2b9262b3d1d57e139e08fe11bccb0a7d426ca515eab0cd6abcaf2016ae5c
WORKDIR /srv/orbit
ENV NODE_ENV=production
COPY --from=dependencies /srv/orbit/node_modules node_modules
COPY package.json ./
COPY --from=build /srv/orbit/packages/api/dist packages/api/dist
COPY packages/api/package.json packages/api/package.json
COPY --from=build /srv/orbit/packages/core/dist packages/core/dist
COPY packages/core/package.json packages/core/package.json
COPY --from=build /srv/orbit/packages/store-automerge/dist packages/store-automerge/dist
COPY packages/store-automerge/package.json packages/store-automerge/package.json
COPY --from=build /srv/orbit/packages/store-shared/dist packages/store-shared/dist
COPY packages/store-shared/package.json packages/store-shared/package.json
COPY --from=build /srv/orbit/packages/automerge-sync-server/dist packages/automerge-sync-server/dist
COPY packages/automerge-sync-server/package.json packages/automerge-sync-server/package.json
USER nonroot
CMD ["packages/automerge-sync-server/dist/index.js"]
