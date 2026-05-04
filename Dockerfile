FROM node:20-alpine

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev

WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend
COPY database ./database

WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "server.js"]
