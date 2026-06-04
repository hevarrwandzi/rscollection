FROM node:20-slim

ENV NODE_ENV=production

USER node

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY --chown=node:node . .

EXPOSE 3000

CMD [ "node", "index.js" ]