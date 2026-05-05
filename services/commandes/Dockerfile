# TODO ETUDIANT : transformer en multi-stage build
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3003
CMD ["node", "index.js"]
