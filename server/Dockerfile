FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci
COPY server server
RUN npm run build -w server && npm prune --omit=dev
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
USER node
WORKDIR /app/server
EXPOSE 4300
CMD ["node", "dist/index.js"]
