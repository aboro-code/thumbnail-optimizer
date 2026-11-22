# package.json requires Node >= 20.19
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

# Uploaded thumbnails live here; mounted as a volume in docker-compose.yml
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node

EXPOSE 5000
CMD ["node", "src/server.js"]
