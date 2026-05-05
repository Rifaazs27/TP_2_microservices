# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app
# On ne récupère que les node_modules et le code source
COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 3002
CMD ["node", "index.js"]
