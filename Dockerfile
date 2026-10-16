FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=build --chown=node:node /app/apps/api ./apps/api
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/config ./config
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 3001
CMD ["npm","start"]
