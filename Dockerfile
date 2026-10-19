FROM node:24-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3001 \
    PGLITE_DIR=/app/data/pglite
VOLUME ["/app/data"]
EXPOSE 3001

CMD ["npm", "start"]
