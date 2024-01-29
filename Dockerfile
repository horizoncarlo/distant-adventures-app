FROM oven/bun

WORKDIR /usr/src/app

COPY package.json .
COPY server.js .
COPY main.html .
RUN bun build server.js --outdir .

ENV isProduction true

CMD [ "bun", "start" ]
