FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production

COPY lib/ ./lib/

ENV PORT=8080
EXPOSE 8080

CMD ["node", "lib/index.js"]
