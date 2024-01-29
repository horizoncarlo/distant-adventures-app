FROM oven/bun

WORKDIR /usr/src/app

COPY package*.json ./
RUN bun run build

ENV NODE_ENV production

CMD [ "bun", "start" ]
