# Contexte de build : la racine du depot (docker build -f api/Dockerfile .)
FROM node:20-alpine
WORKDIR /app/api
COPY api/package*.json ./
RUN npm ci --omit=dev
COPY api/src ./src
COPY web /app/web
ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
