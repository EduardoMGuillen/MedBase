FROM node:24-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3001 \
    DB_PATH=/app/data/clinara.db
VOLUME ["/app/data"]
EXPOSE 3001

CMD ["npm", "start"]
