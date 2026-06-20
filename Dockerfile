FROM node:20-alpine
WORKDIR /app

# Instalar dependencias do backend
COPY package*.json ./
RUN npm install --production

# Copiar todo o codigo (precisa vir antes do build do frontend,
# pois o Vite precisa do index.html e do codigo-fonte, nao so do package.json)
COPY . .

# Build do frontend React (Rebeca Soft)
RUN cd frontend && npm install && npm run build

EXPOSE 10000
CMD ["node", "src/index.js"]
