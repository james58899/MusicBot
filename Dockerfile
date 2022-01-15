FROM node:lts-alpine
WORKDIR /app

RUN apk add --no-cache python3 libtool autoconf automake build-base

ADD . .
RUN yarn remove @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe && yarn build || true && rm -rf node_modules && yarn --production

FROM node:lts-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache ffmpeg

COPY --from=0 /app/dist /app/config.json.example /app/
COPY --from=0 /app/node_modules /app/node_modules

VOLUME [ "/app/Data" ]

ENTRYPOINT [ "node", "." ]
