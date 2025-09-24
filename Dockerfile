# syntax=docker/dockerfile:1
FROM node:lts-alpine
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

RUN --mount=type=cache,id=alpine,target=/etc/apk/cache apk -U add python3 libtool autoconf automake build-base

ADD . .
RUN corepack enable
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm remove @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe && pnpm build || true && rm -rf node_modules && pnpm i -P
RUN du -hd 1 node_modules

FROM node:lts-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN --mount=type=cache,id=alpine,target=/etc/apk/cache apk -U add ffmpeg

COPY --from=0 /app/dist /app/config.json.example /app/
COPY --from=0 /app/node_modules /app/node_modules

VOLUME [ "/app/Data" ]

ENTRYPOINT [ "node", "." ]
