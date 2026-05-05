# Étape 1 : Build 
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Étape 2 : Runtime
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/index.js ./
RUN npm install --production
EXPOSE 3002 
CMD ["node", "index.js"]
